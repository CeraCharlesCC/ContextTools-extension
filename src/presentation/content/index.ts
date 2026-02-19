/**
 * Content Script
 * Runs in the context of web pages
 */
import { getBrowserAdapters } from '@infrastructure/adapters';
import { copyToClipboard, findMarkerInElement, parsePageRef } from '@shared/github';
import type { GenerateMarkdownResult, Marker, MarkerRange, PageRef } from '@shared/github';
import type { Settings } from '@domain/entities';
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

// Temporary export settings (overrides for current copy operation)
let tempHistoricalMode: boolean | null = null;
let tempIncludeFileDiff: boolean | null = null;
let tempIncludeCommit: boolean | null = null;
let tempSmartDiffMode: boolean | null = null;
let tempOnlyReviewComments: boolean | null = null;
let tempIgnoreResolvedComments: boolean | null = null;

type PrExportDefaults = {
  historicalMode: boolean;
  includeFileDiff: boolean;
  includeCommit: boolean;
  smartDiffMode: boolean;
  onlyReviewComments: boolean;
  ignoreResolvedComments: boolean;
};

type IssueExportDefaults = {
  historicalMode: boolean;
};

let defaultPrSettings: PrExportDefaults = {
  historicalMode: true,
  includeFileDiff: false,
  includeCommit: false,
  smartDiffMode: false,
  onlyReviewComments: false,
  ignoreResolvedComments: false,
};

let defaultIssueSettings: IssueExportDefaults = {
  historicalMode: true,
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

function resolveDefaultExportOptions() {
  if (currentPage?.kind === 'pull') {
    return { ...defaultPrSettings };
  }

  return {
    historicalMode: defaultIssueSettings.historicalMode,
    includeFileDiff: false,
    includeCommit: false,
    smartDiffMode: false,
    onlyReviewComments: false,
    ignoreResolvedComments: false,
  };
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

  // Use temporary overrides if set, otherwise use defaults
  const defaults = resolveDefaultExportOptions();
  const historicalMode = tempHistoricalMode ?? defaults.historicalMode;
  const smartDiffMode = tempSmartDiffMode ?? defaults.smartDiffMode;

  const payload: {
    page: PageRef;
    range?: MarkerRange;
    historicalMode?: boolean;
    includeFiles?: boolean;
    includeCommit?: boolean;
    smartDiffMode?: boolean;
    onlyReviewComments?: boolean;
    ignoreResolvedComments?: boolean;
  } = {
    page: currentPage,
    range: markerRange,
    historicalMode,
  };

  if (currentPage.kind === 'pull') {
    payload.includeFiles = tempIncludeFileDiff ?? defaults.includeFileDiff;
    payload.includeCommit = tempIncludeCommit ?? defaults.includeCommit;
    payload.smartDiffMode = smartDiffMode;
    payload.onlyReviewComments = tempOnlyReviewComments ?? defaults.onlyReviewComments;
    payload.ignoreResolvedComments = tempIgnoreResolvedComments ?? defaults.ignoreResolvedComments;
  }

  try {
    const result = await adapters.messaging.sendMessage<{
      type: string;
      payload: {
        page: PageRef;
        range?: MarkerRange;
        historicalMode?: boolean;
        includeFiles?: boolean;
        includeCommit?: boolean;
        smartDiffMode?: boolean;
        onlyReviewComments?: boolean;
        ignoreResolvedComments?: boolean;
      };
    }, GenerateMarkdownResult>({
      type: 'GENERATE_MARKDOWN',
      payload,
    });

    if (!result?.ok) {
      showToast(result?.error ?? 'Failed to generate markdown.', 'error');
      return;
    }

    await copyToClipboard(result.markdown);
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
  const isPull = currentPage?.kind === 'pull';
  const defaults = resolveDefaultExportOptions();

  return {
    isPull,
    historicalMode: tempHistoricalMode ?? defaults.historicalMode,
    includeFileDiff: isPull ? tempIncludeFileDiff ?? defaults.includeFileDiff : false,
    includeCommit: isPull ? tempIncludeCommit ?? defaults.includeCommit : false,
    smartDiffMode: tempSmartDiffMode ?? defaults.smartDiffMode,
    onlyReviewComments: isPull ? tempOnlyReviewComments ?? defaults.onlyReviewComments : false,
    ignoreResolvedComments: isPull ? tempIgnoreResolvedComments ?? defaults.ignoreResolvedComments : false,
    onHistoricalModeChange: (checked) => { tempHistoricalMode = checked; },
    onIncludeFileDiffChange: (checked) => { tempIncludeFileDiff = checked; },
    onIncludeCommitChange: (checked) => { tempIncludeCommit = checked; },
    onSmartDiffModeChange: (checked) => { tempSmartDiffMode = checked; },
    onOnlyReviewCommentsChange: (checked) => { tempOnlyReviewComments = checked; },
    onIgnoreResolvedCommentsChange: (checked) => { tempIgnoreResolvedComments = checked; },
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
      existing.remove();
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
    // Load markdown export defaults from settings
    defaultPrSettings = {
      historicalMode: settings?.pr.historicalMode ?? true,
      includeFileDiff: settings?.pr.includeFileDiff ?? false,
      includeCommit: settings?.pr.includeCommit ?? false,
      smartDiffMode: settings?.pr.smartDiffMode ?? false,
      onlyReviewComments: settings?.pr.onlyReviewComments ?? false,
      ignoreResolvedComments: settings?.pr.ignoreResolvedComments ?? false,
    };
    defaultIssueSettings = {
      historicalMode: settings?.issue.historicalMode ?? true,
    };
  } catch {
    // Default to enabled if settings are unavailable.
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
