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
const MENU_SELECTOR = 'ul[role="menu"]';
const MENU_ITEM_SELECTOR = '[data-context-tools="menu-item"]';

let currentPage: PageRef | null = null;
let currentPath = window.location.pathname;
let markerRange: MarkerRange = {};
let copyButton: HTMLButtonElement | null = null;
let lastMarkerCandidate: Marker | null = null;
let isEnabled = true;
let isCopying = false;

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

  try {
    const result = await adapters.messaging.sendMessage<{ type: string; payload: { page: PageRef; range?: MarkerRange } }, GenerateMarkdownResult>({
      type: 'GENERATE_MARKDOWN',
      payload: {
        page: currentPage,
        range: markerRange,
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

function createCopyButton(): HTMLButtonElement {
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
  return button;
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
  return (
    document.querySelector('button[aria-label="Edit Pull Request title"]') ??
    document.querySelector('button.js-title-edit-button')
  );
}

function injectCopyButton(): void {
  if (!currentPage) return;
  if (document.querySelector(COPY_BUTTON_SELECTOR)) {
    copyButton = document.querySelector(COPY_BUTTON_SELECTOR) as HTMLButtonElement;
    updateCopyButtonState();
    return;
  }

  const anchor = currentPage.kind === 'pull' ? findPrAnchorButton() : findIssueAnchorButton();
  if (!anchor || !anchor.parentElement) return;

  copyButton = createCopyButton();
  anchor.parentElement.insertBefore(copyButton, anchor);
  updateCopyButtonState();
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
  const text = menu.textContent?.toLowerCase() ?? '';
  if (text.includes('quote reply') || text.includes('copy link')) return true;
  return false;
}

function injectMenuItems(menu: HTMLUListElement): void {
  if (!currentPage) return;
  if (menu.querySelector(MENU_ITEM_SELECTOR)) return;
  if (!isCommentMenu(menu)) return;

  const marker = resolveMarkerForMenu(menu);
  if (!marker) return;

  const template = menu.querySelector('li[role="menuitem"]') as HTMLElement | null;
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

function handleMenuMutation(nodes: NodeList): void {
  nodes.forEach((node) => {
    if (!(node instanceof Element)) return;
    if (node.matches(MENU_SELECTOR)) {
      injectMenuItems(node as HTMLUListElement);
    }
    const menus = node.querySelectorAll(MENU_SELECTOR);
    menus.forEach((menu) => injectMenuItems(menu as HTMLUListElement));
  });
}

function observeMenus(): void {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length) {
        handleMenuMutation(mutation.addedNodes);
      }
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function observePageUpdates(): void {
  const observer = new MutationObserver(() => {
    injectCopyButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });
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
  currentPage = parsePageRef(window.location.pathname);
  markerRange = {};
  lastMarkerCandidate = null;
  if (!currentPage) {
    const existing = document.querySelector(COPY_BUTTON_SELECTOR);
    if (existing) {
      existing.remove();
    }
    copyButton = null;
    return;
  }
  injectCopyButton();
}

async function init(): Promise<void> {
  if (!IS_GITHUB) return;
  try {
    const settings = await adapters.messaging.sendMessage<{ type: string }, Settings>({
      type: 'GET_SETTINGS',
    });
    isEnabled = settings?.enabled ?? true;
    if (!isEnabled) return;
  } catch {
    // Default to enabled if settings are unavailable.
  }

  ensureStyles();
  handlePageChange();
  observePageUpdates();
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
