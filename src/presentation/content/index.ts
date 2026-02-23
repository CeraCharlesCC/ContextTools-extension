/**
 * Content Script
 * Runs in the context of web pages
 */
import { getBrowserAdapters } from '@infrastructure/adapters';
import { copyToClipboard, findMarkerInElement, parsePageRef } from '@shared/github';
import type {
  GenerateMarkdownPayload,
  GenerateMarkdownResult,
  Marker,
  MarkerRange,
  PageRef,
} from '@shared/github';
import {
  createDefaultCustomOptions,
  type ExportOptions,
  type ExportPreset,
  type Settings,
} from '@domain/entities';
import {
  ensureStyles,
  showToast,
  updateMarkerHighlights,
  updateCopyButtonLabel,
  createCopyButtonGroup,
  findIssueAnchorButton,
  findPrAnchorButton,
  closeMenu,
  createMenuItem,
  isCommentMenu,
  findMenuItemTemplate,
} from './dom';
import type { DropdownOptions } from './dom';
import {
  applyAdvancedToggle,
  applyPresetSelection,
  createPullExportState,
  type PullExportState,
} from './export-state';

const adapters = getBrowserAdapters();

const IS_GITHUB = window.location.hostname === 'github.com';
const COPY_BUTTON_SELECTOR = '[data-context-tools="copy-button"]';
const MENU_SELECTOR = 'ul[role="menu"], details-menu[role="menu"]';
const MENU_ITEM_SELECTOR = '[data-context-tools="menu-item"]';

let currentPage: PageRef | null = null;
let currentPath = window.location.pathname;
let markerRange: MarkerRange = {};
let copyButton: HTMLButtonElement | null = null;
let resetMarkersButton: HTMLButtonElement | null = null;
let lastMarkerCandidate: Marker | null = null;
let isEnabled = true;
let isCopying = false;
let prEnabled = true;
let issueEnabled = true;

let tempPullState: PullExportState | null = null;
let tempIssueTimelineMode: boolean | null = null;
let lastPullState: PullExportState | null = null;
let lastIssueTimelineMode: boolean | null = null;

type PrExportDefaults = {
  defaultPreset: ExportPreset;
  customOptions: ExportOptions;
};

type IssueExportDefaults = {
  timelineMode: boolean;
};

let defaultPrSettings: PrExportDefaults = {
  defaultPreset: 'full-conversation',
  customOptions: createDefaultCustomOptions(),
};

let defaultIssueSettings: IssueExportDefaults = {
  timelineMode: true,
};

type LastExportStateKind = 'pull' | 'issue';

interface PullLastExportStatePayload {
  preset: ExportPreset;
  customOptions: Partial<ExportOptions>;
}

interface IssueLastExportStatePayload {
  timelineMode: boolean;
}

const customOptionKeys: ReadonlyArray<keyof ExportOptions> = [
  'includeIssueComments',
  'includeReviewComments',
  'includeReviews',
  'includeCommits',
  'includeFileDiffs',
  'includeCommitDiffs',
  'smartDiffMode',
  'timelineMode',
  'ignoreResolvedComments',
];

type MutableExportOptions = {
  -readonly [K in keyof ExportOptions]: ExportOptions[K];
};

// Observer state for throttling and cleanup
let pageObserver: MutationObserver | null = null;
let menuObserver: MutationObserver | null = null;
let pendingInjectFrame: number | null = null;
let copyButtonInjected = false;

// Message handler for content script
adapters.messaging.addListener(async (message: { type: string; payload?: unknown }) => {
  switch (message.type) {
    case 'PING':
      return { type: 'PONG', timestamp: Date.now() };

    case 'GET_PAGE_INFO':
      return {
        title: document.title,
        url: window.location.href,
        hostname: window.location.hostname,
      };

    default:
      return null;
  }
});

function updateCopyButtonState(): void {
  updateMarkerHighlights(markerRange);
  updateCopyButtonLabel(copyButton, resetMarkersButton, markerRange);
}

function resetMarkerRange(): void {
  markerRange = {};
  updateCopyButtonState();
  showToast('Markers cleared.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function readPreset(value: unknown): ExportPreset | null {
  return value === 'full-conversation' ||
    value === 'with-diffs' ||
    value === 'review-comments-only' ||
    value === 'commit-log' ||
    value === 'custom'
    ? value
    : null;
}

function cloneOptions(options: ExportOptions): ExportOptions {
  return {
    includeIssueComments: options.includeIssueComments,
    includeReviewComments: options.includeReviewComments,
    includeReviews: options.includeReviews,
    includeCommits: options.includeCommits,
    includeFileDiffs: options.includeFileDiffs,
    includeCommitDiffs: options.includeCommitDiffs,
    smartDiffMode: options.smartDiffMode,
    timelineMode: options.timelineMode,
    ignoreResolvedComments: options.ignoreResolvedComments,
  };
}

function sanitizeCustomOptions(value: unknown): Partial<ExportOptions> {
  if (!isRecord(value)) {
    return {};
  }

  const sanitized: Partial<MutableExportOptions> = {};
  customOptionKeys.forEach((key) => {
    const parsed = readBoolean(value[key]);
    if (typeof parsed === 'boolean') {
      sanitized[key] = parsed;
    }
  });

  return sanitized as Partial<ExportOptions>;
}

function parsePullLastExportState(value: unknown): PullExportState | null {
  if (!isRecord(value)) {
    return null;
  }

  const preset = readPreset(value.preset);
  if (!preset) {
    return null;
  }

  return createPullExportState(preset, sanitizeCustomOptions(value.customOptions));
}

function parseIssueLastExportState(value: unknown): IssueLastExportStatePayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const timelineMode = readBoolean(value.timelineMode);
  if (typeof timelineMode !== 'boolean') {
    return null;
  }

  return { timelineMode };
}

function resolveDefaultPullState(): PullExportState {
  return createPullExportState(defaultPrSettings.defaultPreset, defaultPrSettings.customOptions);
}

function resolveCurrentPullState(): PullExportState {
  if (tempPullState) {
    return tempPullState;
  }
  if (lastPullState) {
    return lastPullState;
  }
  return resolveDefaultPullState();
}

function resolveCurrentIssueTimelineMode(): boolean {
  if (typeof tempIssueTimelineMode === 'boolean') {
    return tempIssueTimelineMode;
  }
  if (typeof lastIssueTimelineMode === 'boolean') {
    return lastIssueTimelineMode;
  }
  return defaultIssueSettings.timelineMode;
}

async function getLastExportState(kind: LastExportStateKind): Promise<unknown> {
  return adapters.messaging.sendMessage<
    {
      type: 'GET_LAST_EXPORT_STATE';
      payload: {
        kind: LastExportStateKind;
      };
    },
    unknown
  >({
    type: 'GET_LAST_EXPORT_STATE',
    payload: { kind },
  });
}

async function setLastExportState(kind: LastExportStateKind, state: unknown): Promise<void> {
  await adapters.messaging.sendMessage<
    {
      type: 'SET_LAST_EXPORT_STATE';
      payload: {
        kind: LastExportStateKind;
        state: unknown;
      };
    },
    { ok: boolean }
  >({
    type: 'SET_LAST_EXPORT_STATE',
    payload: {
      kind,
      state,
    },
  });
}

async function loadLastExportStates(): Promise<void> {
  const [pullState, issueState] = await Promise.all([
    getLastExportState('pull'),
    getLastExportState('issue'),
  ]);

  const parsedPullState = parsePullLastExportState(pullState);
  if (parsedPullState) {
    lastPullState = parsedPullState;
  }

  const parsedIssueState = parseIssueLastExportState(issueState);
  if (parsedIssueState) {
    lastIssueTimelineMode = parsedIssueState.timelineMode;
  }
}

async function persistPullLastExportState(state: PullExportState): Promise<void> {
  const payload: PullLastExportStatePayload = {
    preset: state.preset,
    customOptions: cloneOptions(state.customOptions),
  };
  await setLastExportState('pull', payload);
}

async function persistIssueLastExportState(timelineMode: boolean): Promise<void> {
  const payload: IssueLastExportStatePayload = {
    timelineMode,
  };
  await setLastExportState('issue', payload);
}

function resolveCurrentPageEnabled(): boolean {
  if (!currentPage) return false;
  return currentPage.kind === 'pull' ? prEnabled : issueEnabled;
}

async function handleCopyClick(): Promise<void> {
  if (isCopying || !currentPage) return;

  isCopying = true;
  if (copyButton) {
    copyButton.disabled = true;
  }

  const payload: GenerateMarkdownPayload = {
    page: currentPage,
    range: markerRange,
  };

  let copiedPullState: PullExportState | null = null;
  let copiedIssueTimelineMode: boolean | null = null;

  if (currentPage.kind === 'pull') {
    copiedPullState = resolveCurrentPullState();
    payload.preset = copiedPullState.preset;
    payload.customOptions = cloneOptions(copiedPullState.customOptions);
  } else {
    copiedIssueTimelineMode = resolveCurrentIssueTimelineMode();
    payload.customOptions = {
      timelineMode: copiedIssueTimelineMode,
    };
  }

  try {
    const result = await adapters.messaging.sendMessage<{
      type: 'GENERATE_MARKDOWN';
      payload: GenerateMarkdownPayload;
    }, GenerateMarkdownResult>({
      type: 'GENERATE_MARKDOWN',
      payload,
    });

    if (!result?.ok) {
      showToast(result?.error ?? 'Failed to generate markdown.', 'error');
      return;
    }

    await copyToClipboard(result.markdown);

    if (currentPage.kind === 'pull' && copiedPullState) {
      tempPullState = copiedPullState;
      lastPullState = copiedPullState;
      try {
        await persistPullLastExportState(copiedPullState);
      } catch (error) {
        console.warn('Failed to persist pull export state:', error);
      }
    }

    if (currentPage.kind === 'issue' && typeof copiedIssueTimelineMode === 'boolean') {
      tempIssueTimelineMode = copiedIssueTimelineMode;
      lastIssueTimelineMode = copiedIssueTimelineMode;
      try {
        await persistIssueLastExportState(copiedIssueTimelineMode);
      } catch (error) {
        console.warn('Failed to persist issue export state:', error);
      }
    }

    showToast('Copied Markdown to clipboard.');
    if (result.warning) {
      showToast(result.warning, 'warning');
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Copy failed.', 'error');
  } finally {
    if (copyButton) {
      copyButton.disabled = false;
    }
    isCopying = false;
  }
}

function buildDropdownOptions(): DropdownOptions {
  if (currentPage?.kind === 'pull') {
    return {
      kind: 'pull',
      pullState: resolveCurrentPullState(),
      onPullPresetChange: (preset) => {
        const nextState = applyPresetSelection(resolveCurrentPullState(), preset);
        tempPullState = nextState;
        return nextState;
      },
      onPullAdvancedToggle: (option, checked) => {
        const nextState = applyAdvancedToggle(resolveCurrentPullState(), option, checked);
        tempPullState = nextState;
        return nextState;
      },
      onResetMarkers: resetMarkerRange,
    };
  }

  return {
    kind: 'issue',
    timelineMode: resolveCurrentIssueTimelineMode(),
    onIssueTimelineModeChange: (checked) => {
      tempIssueTimelineMode = checked;
    },
    onResetMarkers: resetMarkerRange,
  };
}

function resolveMarkerForMenu(menu: Element): Marker | null {
  const marker = findMarkerInElement(menu);
  return marker ?? lastMarkerCandidate;
}

function injectMenuItems(menu: Element): void {
  if (!currentPage) return;
  if (menu.querySelector(MENU_ITEM_SELECTOR)) return;
  if (!isCommentMenu(menu)) return;

  const template = findMenuItemTemplate(menu);
  if (!template) return;

  const startItem = createMenuItem(template, 'Set start marker', () => {
    const marker = resolveMarkerForMenu(menu);
    if (!marker) {
      showToast('Unable to locate marker for this item.', 'error');
      closeMenu(menu);
      return;
    }
    markerRange = { ...markerRange, start: marker };
    updateCopyButtonState();
    showToast('Start marker set.');
    closeMenu(menu);
  });

  const endItem = createMenuItem(template, 'Set end marker', () => {
    const marker = resolveMarkerForMenu(menu);
    if (!marker) {
      showToast('Unable to locate marker for this item.', 'error');
      closeMenu(menu);
      return;
    }
    markerRange = { ...markerRange, end: marker };
    updateCopyButtonState();
    showToast('End marker set.');
    closeMenu(menu);
  });

  menu.appendChild(startItem);
  menu.appendChild(endItem);
}

function handleMenuMutation(mutation: MutationRecord): void {
  // Check if the mutation target is a menu container (async population case)
  if (mutation.target instanceof Element && mutation.target.matches(MENU_SELECTOR)) {
    injectMenuItems(mutation.target);
  }

  // Handle newly added nodes
  mutation.addedNodes.forEach((node) => {
    if (!(node instanceof Element)) return;

    // Check if the added node is a menu
    if (node.matches(MENU_SELECTOR)) {
      injectMenuItems(node);
    }

    // Check descendants for menus
    const menus = node.querySelectorAll(MENU_SELECTOR);
    menus.forEach((menu) => injectMenuItems(menu));

    // Check if added node is inside an existing menu (async content population)
    const closestMenu = node.closest(MENU_SELECTOR);
    if (closestMenu) {
      injectMenuItems(closestMenu);
    }
  });
}

function observeMenus(): void {
  menuObserver = new MutationObserver((mutations) => {
    // Gate early: skip all work when not on an issue/PR page
    if (!currentPage) return;

    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        handleMenuMutation(mutation);
      }
    });
  });
  menuObserver.observe(document.body, { childList: true, subtree: true });
}

function observePageUpdates(): void {
  pageObserver = new MutationObserver(() => {
    // Skip if not on an issue/PR page or already injected
    if (!currentPage || copyButtonInjected) return;

    // Debounce: coalesce rapid mutations into one frame
    if (pendingInjectFrame !== null) return;
    pendingInjectFrame = requestAnimationFrame(() => {
      pendingInjectFrame = null;
      tryInjectCopyButton();
    });
  });
  pageObserver.observe(document.body, { childList: true, subtree: true });
}

function tryInjectCopyButton(): void {
  if (!currentPage || copyButtonInjected) return;

  // Check if already present
  const existing = document.querySelector(COPY_BUTTON_SELECTOR);
  if (existing) {
    copyButton = existing as HTMLButtonElement;
    copyButtonInjected = true;
    updateCopyButtonState();
    disconnectPageObserver();
    return;
  }

  const anchor = currentPage.kind === 'pull' ? findPrAnchorButton() : findIssueAnchorButton();
  if (!anchor || !anchor.parentElement) return;

  const result = createCopyButtonGroup(buildDropdownOptions(), () => {
    void handleCopyClick();
  });
  copyButton = result.copyButton;
  resetMarkersButton = result.resetMarkersButton;

  anchor.parentElement.insertBefore(result.group, anchor);
  copyButtonInjected = true;
  updateCopyButtonState();
  disconnectPageObserver();
}

function disconnectPageObserver(): void {
  if (pageObserver) {
    pageObserver.disconnect();
    pageObserver = null;
  }
  if (pendingInjectFrame !== null) {
    cancelAnimationFrame(pendingInjectFrame);
    pendingInjectFrame = null;
  }
}

function trackMenuClicks(): void {
  const updateCandidate = (event: Event): void => {
    const target = event.target as Element | null;
    if (!target) return;
    const trigger = target.closest('button, summary');
    if (!trigger) return;
    if (trigger.closest(MENU_SELECTOR)) return;
    const marker = findMarkerInElement(trigger);
    if (marker) {
      lastMarkerCandidate = marker;
    }
  };

  // Capture early to avoid stale markers when menus populate asynchronously.
  document.addEventListener('pointerdown', updateCandidate, true);
  document.addEventListener('click', updateCandidate);
}

function handlePageChange(): void {
  // Disconnect previous observer before resetting state
  disconnectPageObserver();

  currentPage = parsePageRef(window.location.pathname);
  markerRange = {};
  updateMarkerHighlights(markerRange);
  lastMarkerCandidate = null;
  copyButtonInjected = false;
  resetMarkersButton = null;

  if (!currentPage || !resolveCurrentPageEnabled()) {
    const existing = document.querySelector(COPY_BUTTON_SELECTOR);
    if (existing) {
      const existingGroup = existing.closest('[data-context-tools="button-group"]');
      if (existingGroup) {
        existingGroup.remove();
      } else {
        existing.remove();
      }
    }
    copyButton = null;
    return;
  }

  // Try immediate injection, then observe if not yet present
  tryInjectCopyButton();
  if (!copyButtonInjected) {
    observePageUpdates();
  }
}

async function init(): Promise<void> {
  if (!IS_GITHUB) return;
  try {
    const settings = await adapters.messaging.sendMessage<{ type: string }, Settings>({
      type: 'GET_SETTINGS',
    });
    prEnabled = settings?.pr.enabled ?? true;
    issueEnabled = settings?.issue.enabled ?? true;
    isEnabled = prEnabled || issueEnabled;
    if (!isEnabled) return;

    defaultPrSettings = {
      defaultPreset: settings?.pr.defaultPreset ?? 'full-conversation',
      customOptions: {
        ...(settings?.pr.customOptions ?? createDefaultCustomOptions()),
      },
    };
    defaultIssueSettings = {
      timelineMode: settings?.issue.historicalMode ?? true,
    };
  } catch {
    // Default to enabled if settings are unavailable.
  }

  try {
    await loadLastExportStates();
  } catch {
    // Continue with default settings when runtime state is unavailable.
  }

  ensureStyles();
  handlePageChange();
  observeMenus();
  trackMenuClicks();

  window.setInterval(() => {
    if (window.location.pathname !== currentPath) {
      currentPath = window.location.pathname;
      handlePageChange();
    }
  }, 600);
}

// Initialize content script
console.log('Context Tools Extension: Content script loaded');
void init();
