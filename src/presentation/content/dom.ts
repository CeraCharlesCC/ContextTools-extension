/**
 * Content Script – DOM helpers
 * Pure DOM creation / query functions, no application state.
 */
import type { Marker, MarkerRange } from '@shared/github';
import contentStyles from './styles.css?raw';

// ---------------------------------------------------------------------------
// Style injection
// ---------------------------------------------------------------------------

export function ensureStyles(): void {
    if (document.getElementById('context-tools-style')) return;
    const style = document.createElement('style');
    style.id = 'context-tools-style';
    style.textContent = contentStyles;
    document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

export function showToast(message: string, tone: 'info' | 'error' | 'warning' = 'info'): void {
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

// ---------------------------------------------------------------------------
// Marker ↔ DOM mapping
// ---------------------------------------------------------------------------

export function markerToDomId(marker: Marker): string | null {
    switch (marker.type) {
        case 'issue-comment':
            return `issuecomment-${marker.id}`;
        case 'review-comment':
            return `discussion_r${marker.id}`;
        case 'review':
            return `pullrequestreview-${marker.id}`;
        default:
            return null;
    }
}

export function resolveMarkerElement(marker: Marker): HTMLElement | null {
    const domId = markerToDomId(marker);
    if (!domId) return null;
    const element = document.getElementById(domId);
    if (!element) return null;
    return (
        element.closest<HTMLElement>(
            '.timeline-comment, .timeline-comment-group, .js-comment-container, .js-comment, .review-comment, .js-resolvable-thread, .js-review-comment',
        ) ?? (element as HTMLElement)
    );
}

export function updateMarkerHighlights(markerRange: MarkerRange): void {
    document.querySelectorAll('.context-tools-marker-start, .context-tools-marker-end').forEach((el) => {
        el.classList.remove('context-tools-marker-start', 'context-tools-marker-end');
    });

    if (markerRange.start) {
        const target = resolveMarkerElement(markerRange.start);
        target?.classList.add('context-tools-marker-start');
    }
    if (markerRange.end) {
        const target = resolveMarkerElement(markerRange.end);
        target?.classList.add('context-tools-marker-end');
    }
}

// ---------------------------------------------------------------------------
// Copy-button state
// ---------------------------------------------------------------------------

export function updateCopyButtonLabel(
    copyButton: HTMLButtonElement | null,
    resetMarkersButton: HTMLButtonElement | null,
    markerRange: MarkerRange,
): void {
    const hasStart = Boolean(markerRange.start);
    const hasEnd = Boolean(markerRange.end);
    const hasRange = hasStart || hasEnd;

    if (resetMarkersButton) {
        resetMarkersButton.disabled = !hasRange;
    }
    if (!copyButton) return;

    const label = copyButton.querySelector('.context-tools-label') as HTMLElement | null;
    const indicator = copyButton.querySelector('.context-tools-range-indicator') as HTMLElement | null;

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

// ---------------------------------------------------------------------------
// Settings dropdown
// ---------------------------------------------------------------------------

export interface DropdownOptions {
    isPull: boolean;
    historicalMode: boolean;
    includeFileDiff: boolean;
    includeCommit: boolean;
    smartDiffMode: boolean;
    onlyReviewComments: boolean;
    ignoreResolvedComments: boolean;
    onHistoricalModeChange: (checked: boolean) => void;
    onIncludeFileDiffChange: (checked: boolean) => void;
    onIncludeCommitChange: (checked: boolean) => void;
    onSmartDiffModeChange: (checked: boolean) => void;
    onOnlyReviewCommentsChange: (checked: boolean) => void;
    onIgnoreResolvedCommentsChange: (checked: boolean) => void;
    onResetMarkers: () => void;
}

export interface DropdownResult {
    dropdown: HTMLDivElement;
    resetMarkersButton: HTMLButtonElement;
}

export function createSettingsDropdown(opts: DropdownOptions): DropdownResult {
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
    <input type="checkbox" id="context-tools-historical" ${opts.historicalMode ? 'checked' : ''}>
  `;
    const historicalCheckbox = historicalItem.querySelector('input') as HTMLInputElement;
    historicalCheckbox.addEventListener('change', () => {
        opts.onHistoricalModeChange(historicalCheckbox.checked);
    });
    dropdown.appendChild(historicalItem);

    if (opts.isPull) {
        // Include file diff toggle
        const fileDiffItem = document.createElement('label');
        fileDiffItem.className = 'context-tools-dropdown-item';
        fileDiffItem.innerHTML = `
    <span>Include file diffs</span>
    <input type="checkbox" id="context-tools-file-diff" ${opts.includeFileDiff ? 'checked' : ''}>
  `;
        const fileDiffCheckbox = fileDiffItem.querySelector('input') as HTMLInputElement;
        fileDiffCheckbox.addEventListener('change', () => {
            opts.onIncludeFileDiffChange(fileDiffCheckbox.checked);
        });
        dropdown.appendChild(fileDiffItem);

        // Include commit diff toggle
        const commitDiffItem = document.createElement('label');
        commitDiffItem.className = 'context-tools-dropdown-item';
        commitDiffItem.innerHTML = `
    <span>Include commit diffs</span>
    <input type="checkbox" id="context-tools-commit-diff" ${opts.includeCommit ? 'checked' : ''}>
  `;
        const commitDiffCheckbox = commitDiffItem.querySelector('input') as HTMLInputElement;
        commitDiffCheckbox.addEventListener('change', () => {
            opts.onIncludeCommitChange(commitDiffCheckbox.checked);
        });
        dropdown.appendChild(commitDiffItem);
    }

    // Smart diff mode toggle
    const smartDiffItem = document.createElement('label');
    smartDiffItem.className = 'context-tools-dropdown-item';
    smartDiffItem.innerHTML = `
    <span>Smart diff mode</span>
    <input type="checkbox" id="context-tools-smart-diff" ${opts.smartDiffMode ? 'checked' : ''}>
  `;
    const smartDiffCheckbox = smartDiffItem.querySelector('input') as HTMLInputElement;
    smartDiffCheckbox.addEventListener('change', () => {
        opts.onSmartDiffModeChange(smartDiffCheckbox.checked);
    });
    dropdown.appendChild(smartDiffItem);

    if (opts.isPull) {
        // Only review comments mode toggle
        const onlyReviewCommentsItem = document.createElement('label');
        onlyReviewCommentsItem.className = 'context-tools-dropdown-item';
        const onlyReviewCommentsSpan = document.createElement('span');
        onlyReviewCommentsSpan.textContent = 'Only review comments (PR only)';
        const onlyReviewCommentsCheckbox = document.createElement('input');
        onlyReviewCommentsCheckbox.type = 'checkbox';
        onlyReviewCommentsCheckbox.id = 'context-tools-only-review-comments';
        onlyReviewCommentsCheckbox.checked = opts.onlyReviewComments;
        onlyReviewCommentsCheckbox.addEventListener('change', () => {
            opts.onOnlyReviewCommentsChange(onlyReviewCommentsCheckbox.checked);
        });
        onlyReviewCommentsItem.append(onlyReviewCommentsSpan, onlyReviewCommentsCheckbox);
        dropdown.appendChild(onlyReviewCommentsItem);

        // Ignore resolved comments mode toggle
        const ignoreResolvedCommentsItem = document.createElement('label');
        ignoreResolvedCommentsItem.className = 'context-tools-dropdown-item';
        const ignoreResolvedCommentsSpan = document.createElement('span');
        ignoreResolvedCommentsSpan.textContent = 'Ignore resolved comments (PR only)';
        const ignoreResolvedCommentsCheckbox = document.createElement('input');
        ignoreResolvedCommentsCheckbox.type = 'checkbox';
        ignoreResolvedCommentsCheckbox.id = 'context-tools-ignore-resolved-comments';
        ignoreResolvedCommentsCheckbox.checked = opts.ignoreResolvedComments;
        ignoreResolvedCommentsCheckbox.addEventListener('change', () => {
            opts.onIgnoreResolvedCommentsChange(ignoreResolvedCommentsCheckbox.checked);
        });
        ignoreResolvedCommentsItem.append(ignoreResolvedCommentsSpan, ignoreResolvedCommentsCheckbox);
        dropdown.appendChild(ignoreResolvedCommentsItem);
    }

    const divider = document.createElement('div');
    divider.className = 'context-tools-dropdown-divider';
    dropdown.appendChild(divider);

    const resetItem = document.createElement('button');
    resetItem.type = 'button';
    resetItem.className = 'context-tools-dropdown-item context-tools-dropdown-action';
    resetItem.textContent = 'Reset markers';
    resetItem.addEventListener('click', () => {
        opts.onResetMarkers();
        dropdown.hidden = true;
    });
    dropdown.appendChild(resetItem);

    return { dropdown, resetMarkersButton: resetItem };
}

// ---------------------------------------------------------------------------
// Copy-button group
// ---------------------------------------------------------------------------

export interface CopyButtonGroupResult {
    group: HTMLDivElement;
    copyButton: HTMLButtonElement;
    settingsDropdown: HTMLDivElement;
    resetMarkersButton: HTMLButtonElement;
}

export function createCopyButtonGroup(
    dropdownOpts: DropdownOptions,
    onCopyClick: () => void,
): CopyButtonGroupResult {
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
    button.addEventListener('click', onCopyClick);
    group.appendChild(button);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'context-tools-dropdown-trigger';
    trigger.setAttribute('aria-label', 'Export options');
    trigger.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z"/></svg>`;

    const { dropdown, resetMarkersButton } = createSettingsDropdown(dropdownOpts);
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

    return { group, copyButton: button, settingsDropdown: dropdown, resetMarkersButton };
}

// ---------------------------------------------------------------------------
// Anchor-button finders (where to insert the copy-button group)
// ---------------------------------------------------------------------------

export function findIssueAnchorButton(): HTMLElement | null {
    const actionsContainer = document.querySelector(
        '[data-component="PH_Actions"] [class*="HeaderMenu-module__menuActionsContainer"]',
    );
    if (actionsContainer?.firstElementChild) {
        return actionsContainer.firstElementChild as HTMLElement;
    }

    const header =
        document.querySelector('#partial-discussion-header') ??
        document.querySelector('.gh-header');
    const copyIcon =
        header?.querySelector('button svg.octicon-copy') ??
        document.querySelector('button svg.octicon-copy');
    if (copyIcon) return copyIcon.closest('button');

    const newIssueButton = findNewIssueButton();
    if (newIssueButton) return newIssueButton;

    return null;
}

function findNewIssueButton(): HTMLElement | null {
    const headerButton =
        document.querySelector<HTMLElement>(
            '[class*="HeaderMenu-module__buttonContainer"] a[href*="/issues/new"]',
        ) ??
        document.querySelector<HTMLElement>(
            '#partial-discussion-header a[href*="/issues/new"], .gh-header a[href*="/issues/new"]',
        );
    if (headerButton) {
        return (
            headerButton.closest<HTMLElement>('[class*="HeaderMenu-module__buttonContainer"]') ??
            headerButton
        );
    }

    const candidates = Array.from(
        document.querySelectorAll<HTMLElement>('a[href*="/issues/new"], button'),
    );
    const candidate = candidates.find((item) => {
        const text = item.textContent?.trim().toLowerCase();
        return text === 'new issue';
    });
    if (!candidate) return null;
    return (
        candidate.closest<HTMLElement>('[class*="HeaderMenu-module__buttonContainer"]') ?? candidate
    );
}

export function findPrAnchorButton(): HTMLElement | null {
  // --- New GitHub PR header (PageHeader) ---
  const phActions = document.querySelector<HTMLElement>('[data-component="PH_Actions"]');
  if (phActions) {
    const copyBtn =
      phActions.querySelector('button svg.octicon-copy')?.closest('button') ??
      phActions.querySelector<HTMLElement>('button[aria-label*="Copy"]') ??
      phActions.querySelector<HTMLElement>('button[aria-label*="copy"]');
    if (copyBtn) return copyBtn as HTMLElement;

    const actionRow =
      phActions.querySelector<HTMLElement>('div.d-flex.gap-2') ??
      phActions.querySelector<HTMLElement>('[class*="menuActionsContainer"]');
    const firstAction = actionRow?.querySelector<HTMLElement>('button, a, summary');
    if (firstAction) return firstAction;
  }

  // --- Old layout fallbacks ---
  const editButton =
    document.querySelector<HTMLElement>('button[aria-label="Edit Pull Request title"]') ??
    document.querySelector<HTMLElement>('button.js-title-edit-button');
  if (editButton) return editButton;

  const header =
    document.querySelector('#partial-discussion-header') ??
    document.querySelector('.gh-header');
  if (header) {
    const copyIcon = header.querySelector('button svg.octicon-copy');
    if (copyIcon) return copyIcon.closest('button') as HTMLElement;

    const actionsContainer = header.querySelector('.gh-header-actions');
    if (actionsContainer?.firstElementChild) {
      return actionsContainer.firstElementChild as HTMLElement;
    }
  }

  const globalCopy = document.querySelector('button svg.octicon-copy');
  if (globalCopy) return globalCopy.closest('button') as HTMLElement;

  return null;
}

// ---------------------------------------------------------------------------
// Context-menu injection helpers
// ---------------------------------------------------------------------------

export function closeMenu(menu: Element): void {
    const details = menu.closest('details');
    if (details) {
        details.removeAttribute('open');
    }
}

export function createMenuItem(template: HTMLElement, label: string, onClick: () => void): HTMLElement {
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

export function isCommentMenu(menu: Element): boolean {
    if (menu.querySelector('li[aria-keyshortcuts="q"]')) return true;
    if (menu.querySelector('li[aria-keyshortcuts="c"]')) return true;
    if (menu.querySelector('button[data-hotkey="r"]')) return true;
    if (menu.querySelector('.js-comment-quote-reply')) return true;
    if (menu.querySelector('.js-comment-edit-button')) return true;
    const text = menu.textContent?.toLowerCase() ?? '';
    if (text.includes('quote reply') || text.includes('copy link')) return true;
    return false;
}

export function findMenuItemTemplate(menu: Element): HTMLElement | null {
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
