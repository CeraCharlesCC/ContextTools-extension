/**
 * Content Script
 * Runs in the context of web pages
 */
import { getBrowserAdapters } from '@infrastructure/adapters';
import { copyToClipboard, findMarkerInElement, parsePageRef } from '@shared/github';
import type { GenerateMarkdownResult, Marker, MarkerRange, PageRef } from '@shared/github';
import type { Settings } from '@domain/entities';

const adapters = getBrowserAdapters();

const IS_GITHUB = window.location.hostname === 'github.com';
const COPY_BUTTON_SELECTOR = '[data-context-tools="copy-button"]';
const MENU_SELECTOR = 'ul[role="menu"], details-menu[role="menu"]';
const MENU_ITEM_SELECTOR = '[data-context-tools="menu-item"]';

let currentPage: PageRef | null = null;
let currentPath = window.location.pathname;
let markerRange: MarkerRange = {};
let copyButton: HTMLButtonElement | null = null;
let settingsDropdown: HTMLDivElement | null = null;
let lastMarkerCandidate: Marker | null = null;
let isEnabled = true;
let isCopying = false;

// Temporary export settings (overrides for current copy operation)
let tempHistoricalMode: boolean | null = null;
let tempIncludeFileDiff: boolean | null = null;
let defaultHistoricalMode = true;
let defaultIncludeFileDiff = false;

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

function ensureStyles(): void {
  if (document.getElementById('context-tools-style')) return;
  const style = document.createElement('style');
  style.id = 'context-tools-style';
  style.textContent = `
    .context-tools-copy-button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      margin-right: 6px;
      border: 1px solid var(--color-btn-border, rgba(27, 31, 36, 0.15));
      border-radius: 6px;
      background: var(--color-btn-bg, #f6f8fa);
      color: var(--color-fg-default, #1f2328);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    }

    .context-tools-copy-button:hover {
      background: var(--color-btn-hover-bg, #f3f4f6);
    }

    .context-tools-copy-button:disabled {
      opacity: 0.6;
      cursor: default;
    }

    .context-tools-range-indicator {
      font-size: 11px;
      color: var(--color-fg-muted, #57606a);
    }

    .context-tools-toast {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 2147483647;
      padding: 10px 14px;
      border-radius: 8px;
      background: rgba(17, 24, 39, 0.9);
      color: #fff;
      font-size: 12px;
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      pointer-events: none;
    }

    .context-tools-toast.is-visible {
      opacity: 1;
      transform: translateY(0);
    }

    .context-tools-toast.is-error {
      background: rgba(185, 28, 28, 0.92);
    }

    .context-tools-toast.is-warning {
      background: rgba(161, 98, 7, 0.92);
    }

    .context-tools-button-group {
      display: inline-flex;
      align-items: stretch;
      margin-right: 6px;
      border-radius: 6px;
      overflow: visible;
    }

    .context-tools-button-group .context-tools-copy-button {
      margin-right: 0;
      border-radius: 6px 0 0 6px;
      border-right: none;
    }

    .context-tools-dropdown-trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 3px 6px;
      border: 1px solid var(--color-btn-border, rgba(27, 31, 36, 0.15));
      border-radius: 0 6px 6px 0;
      background: var(--color-btn-bg, #f6f8fa);
      color: var(--color-fg-default, #1f2328);
      cursor: pointer;
    }

    .context-tools-dropdown-trigger:hover {
      background: var(--color-btn-hover-bg, #f3f4f6);
    }

    .context-tools-dropdown-trigger svg {
      width: 12px;
      height: 12px;
    }

    .context-tools-dropdown {
      position: absolute;
      top: 100%;
      right: 0;
      z-index: 100;
      min-width: 200px;
      margin-top: 4px;
      padding: 8px 0;
      border: 1px solid var(--color-border-default, rgba(27, 31, 36, 0.15));
      border-radius: 6px;
      background: var(--color-canvas-overlay, #fff);
      box-shadow: 0 8px 24px rgba(140, 149, 159, 0.2);
    }

    .context-tools-dropdown[hidden] {
      display: none;
    }

    .context-tools-dropdown-header {
      padding: 4px 12px 8px;
      font-size: 11px;
      font-weight: 600;
      color: var(--color-fg-muted, #57606a);
      text-transform: uppercase;
    }

    .context-tools-dropdown-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      font-size: 12px;
      color: var(--color-fg-default, #1f2328);
      cursor: pointer;
    }

    .context-tools-dropdown-item:hover {
      background: var(--color-action-list-item-default-hover-bg, rgba(208, 215, 222, 0.32));
    }

    .context-tools-dropdown-item input[type="checkbox"] {
      margin-left: 8px;
    }
  `;
  document.head.appendChild(style);
}

function showToast(message: string, tone: 'info' | 'error' | 'warning' = 'info'): void {
  let toast = document.querySelector('.context-tools-toast') as HTMLDivElement | null;
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'context-tools-toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.remove('is-error', 'is-warning');
  if (tone === 'error') toast.classList.add('is-error');
  if (tone === 'warning') toast.classList.add('is-warning');
  toast.classList.add('is-visible');

  window.setTimeout(() => {
    toast?.classList.remove('is-visible');
  }, 2200);
}

function updateCopyButtonState(): void {
  if (!copyButton) return;
  const label = copyButton.querySelector('.context-tools-label') as HTMLElement | null;
  const indicator = copyButton.querySelector('.context-tools-range-indicator') as HTMLElement | null;
  const hasStart = Boolean(markerRange.start);
  const hasEnd = Boolean(markerRange.end);
  const hasRange = hasStart || hasEnd;

  if (label) {
    label.textContent = hasRange ? 'Copy Range as Markdown' : 'Copy as Markdown';
  }
  copyButton.setAttribute('aria-label', hasRange ? 'Copy Range as Markdown' : 'Copy as Markdown');

  if (indicator) {
    if (hasRange) {
      const rangeLabel = hasStart && hasEnd ? 'Range set' : hasStart ? 'Start set' : 'End set';
      indicator.textContent = rangeLabel;
      indicator.hidden = false;
    } else {
      indicator.hidden = true;
    }
  }
}

async function handleCopyClick(): Promise<void> {
  if (isCopying || !currentPage) return;

  isCopying = true;
  if (copyButton) {
    copyButton.disabled = true;
  }

  // Use temporary overrides if set, otherwise use defaults
  const historicalMode = tempHistoricalMode ?? defaultHistoricalMode;
  const includeFiles = tempIncludeFileDiff ?? defaultIncludeFileDiff;

  try {
    const result = await adapters.messaging.sendMessage<{ type: string; payload: { page: PageRef; range?: MarkerRange; historicalMode?: boolean; includeFiles?: boolean } }, GenerateMarkdownResult>({
      type: 'GENERATE_MARKDOWN',
      payload: {
        page: currentPage,
        range: markerRange,
        historicalMode,
        includeFiles,
      },
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

function createSettingsDropdown(): HTMLDivElement {
  const dropdown = document.createElement('div');
  dropdown.className = 'context-tools-dropdown';
  dropdown.hidden = true;

  const header = document.createElement('div');
  header.className = 'context-tools-dropdown-header';
  header.textContent = 'Export Options';
  dropdown.appendChild(header);

  // Historical mode toggle
  const historicalItem = document.createElement('label');
  historicalItem.className = 'context-tools-dropdown-item';
  historicalItem.innerHTML = `
    <span>Timeline mode</span>
    <input type="checkbox" id="context-tools-historical" ${(tempHistoricalMode ?? defaultHistoricalMode) ? 'checked' : ''}>
  `;
  const historicalCheckbox = historicalItem.querySelector('input') as HTMLInputElement;
  historicalCheckbox.addEventListener('change', () => {
    tempHistoricalMode = historicalCheckbox.checked;
  });
  dropdown.appendChild(historicalItem);

  // Include file diff toggle
  const fileDiffItem = document.createElement('label');
  fileDiffItem.className = 'context-tools-dropdown-item';
  fileDiffItem.innerHTML = `
    <span>Include file diffs</span>
    <input type="checkbox" id="context-tools-file-diff" ${(tempIncludeFileDiff ?? defaultIncludeFileDiff) ? 'checked' : ''}>
  `;
  const fileDiffCheckbox = fileDiffItem.querySelector('input') as HTMLInputElement;
  fileDiffCheckbox.addEventListener('change', () => {
    tempIncludeFileDiff = fileDiffCheckbox.checked;
  });
  dropdown.appendChild(fileDiffItem);

  return dropdown;
}

function createCopyButtonGroup(): HTMLDivElement {
  const group = document.createElement('div');
  group.className = 'context-tools-button-group';
  group.style.position = 'relative';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'context-tools-copy-button';
  button.dataset.contextTools = 'copy-button';
  button.setAttribute('aria-label', 'Copy as Markdown');
  button.innerHTML = `
    <span class="context-tools-label">Copy as Markdown</span>
    <span class="context-tools-range-indicator" hidden></span>
  `;
  button.addEventListener('click', () => {
    void handleCopyClick();
  });
  copyButton = button;
  group.appendChild(button);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'context-tools-dropdown-trigger';
  trigger.setAttribute('aria-label', 'Export options');
  trigger.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z"/></svg>`;

  const dropdown = createSettingsDropdown();
  settingsDropdown = dropdown;
  group.appendChild(dropdown);

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.hidden = !dropdown.hidden;
  });
  group.appendChild(trigger);

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!group.contains(e.target as Node)) {
      dropdown.hidden = true;
    }
  });

  return group;
}

function findIssueAnchorButton(): HTMLElement | null {
  const header =
    document.querySelector('#partial-discussion-header') ??
    document.querySelector('.gh-header');
  const copyIcon =
    header?.querySelector('button svg.octicon-copy') ??
    document.querySelector('button svg.octicon-copy');
  return copyIcon?.closest('button') ?? null;
}

function findPrAnchorButton(): HTMLElement | null {
  // Try permission-dependent edit button first
  const editButton =
    document.querySelector<HTMLElement>('button[aria-label="Edit Pull Request title"]') ??
    document.querySelector<HTMLElement>('button.js-title-edit-button');
  if (editButton) return editButton;

  // Fallback: find the header actions area (always present)
  const header =
    document.querySelector('#partial-discussion-header') ??
    document.querySelector('.gh-header');
  if (!header) return null;

  // Look for copy link button or any action button in header
  const copyIcon = header.querySelector('button svg.octicon-copy');
  if (copyIcon) return copyIcon.closest('button');

  // Fallback to header actions container
  const actionsContainer = header.querySelector('.gh-header-actions');
  if (actionsContainer?.firstElementChild) {
    return actionsContainer.firstElementChild as HTMLElement;
  }

  return null;
}

function resolveMarkerForMenu(menu: Element): Marker | null {
  const marker = findMarkerInElement(menu);
  return marker ?? lastMarkerCandidate;
}

function closeMenu(menu: Element): void {
  const details = menu.closest('details');
  if (details) {
    details.removeAttribute('open');
  }
}

function createMenuItem(template: HTMLElement, label: string, onClick: () => void): HTMLElement {
  const item = template.cloneNode(true) as HTMLElement;
  item.dataset.contextTools = 'menu-item';
  item.removeAttribute('id');
  item.removeAttribute('aria-keyshortcuts');
  item.removeAttribute('data-hotkey');
  item.tabIndex = -1;

  const labelEl =
    item.querySelector('[id$="--label"]') ??
    item.querySelector('span[class*="ItemLabel"]') ??
    item.querySelector('span');

  if (labelEl) {
    labelEl.textContent = label;
    const uniqueSuffix = Math.random().toString(36).slice(2, 8);
    const newId = `context-tools-${label.replace(/\s+/g, '-').toLowerCase()}-${uniqueSuffix}`;
    labelEl.id = newId;
    item.setAttribute('aria-labelledby', newId);
  } else {
    // Fallback for templates without span labels (e.g., button.dropdown-item)
    item.textContent = label;
    item.setAttribute('aria-label', label);
  }

  item.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });

  return item;
}

function isCommentMenu(menu: Element): boolean {
  if (menu.querySelector('li[aria-keyshortcuts="q"]')) return true;
  if (menu.querySelector('li[aria-keyshortcuts="c"]')) return true;
  if (menu.querySelector('button[data-hotkey="r"]')) return true;
  if (menu.querySelector('.js-comment-quote-reply')) return true;
  if (menu.querySelector('.js-comment-edit-button')) return true;
  const text = menu.textContent?.toLowerCase() ?? '';
  if (text.includes('quote reply') || text.includes('copy link')) return true;
  return false;
}

function findMenuItemTemplate(menu: Element): HTMLElement | null {
  // For ul-based menus, use li[role="menuitem"]
  if (menu.tagName === 'UL') {
    return menu.querySelector('li[role="menuitem"]');
  }
  // For details-menu, prefer button, then anchor
  return (
    menu.querySelector('button[role="menuitem"]') ??
    menu.querySelector('a[role="menuitem"]')
  );
}

function injectMenuItems(menu: Element): void {
  if (!currentPage) return;
  if (menu.querySelector(MENU_ITEM_SELECTOR)) return;
  if (!isCommentMenu(menu)) return;

  const marker = resolveMarkerForMenu(menu);
  if (!marker) return;

  const template = findMenuItemTemplate(menu);
  if (!template) return;

  const startItem = createMenuItem(template, 'Set start marker', () => {
    markerRange = { ...markerRange, start: marker };
    updateCopyButtonState();
    showToast('Start marker set.');
    closeMenu(menu);
  });

  const endItem = createMenuItem(template, 'Set end marker', () => {
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

  const buttonGroup = createCopyButtonGroup();
  anchor.parentElement.insertBefore(buttonGroup, anchor);
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
  document.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (!target) return;
    const trigger = target.closest('button, summary');
    if (!trigger) return;
    const label = (trigger.getAttribute('aria-label') || '').toLowerCase();
    if (!label.includes('comment') && !label.includes('options') && !label.includes('more')) return;
    const marker = findMarkerInElement(trigger);
    if (marker) {
      lastMarkerCandidate = marker;
    }
  });
}

function handlePageChange(): void {
  // Disconnect previous observer before resetting state
  disconnectPageObserver();

  currentPage = parsePageRef(window.location.pathname);
  markerRange = {};
  lastMarkerCandidate = null;
  copyButtonInjected = false;

  if (!currentPage) {
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
    isEnabled = settings?.enabled ?? true;
    if (!isEnabled) return;
    // Load markdown export defaults from settings
    defaultHistoricalMode = settings?.historicalMode ?? true;
    defaultIncludeFileDiff = settings?.includeFileDiff ?? false;
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
