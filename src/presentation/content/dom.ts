/**
 * Content Script – DOM helpers
 * Pure DOM creation / query functions, no application state.
 */
import type { Marker, MarkerRange } from '@shared/github';
import type { ExportOptions, ExportPreset } from '@domain/entities';
import type { PullExportState } from './export-state';
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

interface DropdownBaseOptions {
    onResetMarkers: () => void;
}

export interface PullDropdownOptions extends DropdownBaseOptions {
    kind: 'pull';
    pullState: PullExportState;
    onPullPresetChange: (preset: ExportPreset) => PullExportState;
    onPullAdvancedToggle: (option: keyof ExportOptions, checked: boolean) => PullExportState;
}

export interface IssueDropdownOptions extends DropdownBaseOptions {
    kind: 'issue';
    timelineMode: boolean;
    onIssueTimelineModeChange: (checked: boolean) => void;
}

export type DropdownOptions = PullDropdownOptions | IssueDropdownOptions;

export interface DropdownResult {
    dropdown: HTMLDivElement;
    resetMarkersButton: HTMLButtonElement;
}

interface DropdownToggleControl {
    row: HTMLLabelElement;
    input: HTMLInputElement;
}

const pullPresetLabels: Array<{ value: ExportPreset; label: string }> = [
    { value: 'full-conversation', label: 'Full conversation' },
    { value: 'with-diffs', label: 'With diffs' },
    { value: 'review-comments-only', label: 'Review comments only' },
    { value: 'commit-log', label: 'Commit log' },
    { value: 'custom', label: 'Custom' },
];

const pullOptionGroups: Array<{
    title: string;
    options: Array<{ key: keyof ExportOptions; label: string }>;
}> = [
    {
        title: 'Content',
        options: [
            { key: 'includeIssueComments', label: 'Include issue comments' },
            { key: 'includeReviewComments', label: 'Include review comments' },
            { key: 'includeReviews', label: 'Include reviews' },
            { key: 'includeCommits', label: 'Include commits' },
        ],
    },
    {
        title: 'Diffs',
        options: [
            { key: 'includeFileDiffs', label: 'Include file diffs' },
            { key: 'includeCommitDiffs', label: 'Include commit diffs' },
            { key: 'smartDiffMode', label: 'Smart diff mode' },
        ],
    },
    {
        title: 'Ordering',
        options: [{ key: 'timelineMode', label: 'Timeline mode' }],
    },
    {
        title: 'Filters',
        options: [{ key: 'ignoreResolvedComments', label: 'Ignore resolved comments' }],
    },
];

function createToggleControl(params: {
    label: string;
    checked: boolean;
    id: string;
}): DropdownToggleControl {
    const row = document.createElement('label');
    row.className = 'context-tools-dropdown-item context-tools-dropdown-item-toggle';

    const text = document.createElement('span');
    text.textContent = params.label;

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = params.id;
    input.checked = params.checked;

    row.append(text, input);
    return { row, input };
}

function createAdvancedContainer(title = 'Advanced'): {
    details: HTMLDetailsElement;
    content: HTMLDivElement;
} {
    const details = document.createElement('details');
    details.className = 'context-tools-dropdown-advanced';

    const summary = document.createElement('summary');
    summary.className = 'context-tools-dropdown-advanced-summary';
    summary.textContent = title;

    const content = document.createElement('div');
    content.className = 'context-tools-dropdown-advanced-content';

    details.append(summary, content);
    return { details, content };
}

export function createSettingsDropdown(opts: DropdownOptions): DropdownResult {
    const dropdown = document.createElement('div');
    dropdown.className = 'context-tools-dropdown';
    dropdown.hidden = true;

    const header = document.createElement('div');
    header.className = 'context-tools-dropdown-header';
    header.textContent = 'Export Options';
    dropdown.appendChild(header);

    if (opts.kind === 'pull') {
        const presetRow = document.createElement('label');
        presetRow.className = 'context-tools-dropdown-item context-tools-dropdown-select-row';

        const presetLabel = document.createElement('span');
        presetLabel.textContent = 'Preset';

        const presetSelect = document.createElement('select');
        presetSelect.className = 'context-tools-dropdown-select';

        pullPresetLabels.forEach((preset) => {
            const option = document.createElement('option');
            option.value = preset.value;
            option.textContent = preset.label;
            presetSelect.appendChild(option);
        });

        presetRow.append(presetLabel, presetSelect);
        dropdown.appendChild(presetRow);

        const optionInputs: Partial<Record<keyof ExportOptions, HTMLInputElement>> = {};
        const optionRows: Partial<Record<keyof ExportOptions, HTMLLabelElement>> = {};

        const { details: advancedDetails, content: advancedContent } = createAdvancedContainer();

        const syncPullControls = (state: PullExportState): void => {
            presetSelect.value = state.preset;

            Object.keys(optionInputs).forEach((key) => {
                const optionKey = key as keyof ExportOptions;
                const input = optionInputs[optionKey];
                if (!input) return;
                input.checked = state.customOptions[optionKey];
            });

            const smartDiffInput = optionInputs.smartDiffMode;
            const smartDiffRow = optionRows.smartDiffMode;
            if (smartDiffInput && smartDiffRow) {
                const enabled = state.customOptions.includeCommitDiffs;
                const tooltip = 'Enable “Include commit diffs” to use Smart diff mode.';

                smartDiffInput.disabled = !enabled;
                if (!enabled) {
                    smartDiffInput.checked = false;
                    smartDiffInput.title = tooltip;
                    smartDiffRow.title = tooltip;
                } else {
                    smartDiffInput.removeAttribute('title');
                    smartDiffRow.removeAttribute('title');
                }
                smartDiffRow.classList.toggle('context-tools-dropdown-item-disabled', !enabled);
            }
        };

        pullOptionGroups.forEach((group) => {
            const groupEl = document.createElement('div');
            groupEl.className = 'context-tools-dropdown-group';

            const groupTitle = document.createElement('div');
            groupTitle.className = 'context-tools-dropdown-group-title';
            groupTitle.textContent = group.title;

            groupEl.appendChild(groupTitle);

            group.options.forEach((option) => {
                const control = createToggleControl({
                    label: option.label,
                    checked: opts.pullState.customOptions[option.key],
                    id: `context-tools-${option.key}`,
                });

                control.input.addEventListener('change', () => {
                    const nextState = opts.onPullAdvancedToggle(option.key, control.input.checked);
                    syncPullControls(nextState);
                });

                optionInputs[option.key] = control.input;
                optionRows[option.key] = control.row;
                groupEl.appendChild(control.row);
            });

            advancedContent.appendChild(groupEl);
        });

        presetSelect.addEventListener('change', () => {
            const nextState = opts.onPullPresetChange(presetSelect.value as ExportPreset);
            syncPullControls(nextState);
            advancedDetails.open = false;
        });

        syncPullControls(opts.pullState);
        dropdown.appendChild(advancedDetails);
    } else {
        const presetRow = document.createElement('div');
        presetRow.className = 'context-tools-dropdown-item context-tools-dropdown-static-row';

        const presetLabel = document.createElement('span');
        presetLabel.textContent = 'Preset';

        const presetValue = document.createElement('span');
        presetValue.className = 'context-tools-dropdown-static-value';
        presetValue.textContent = 'Full conversation';

        presetRow.append(presetLabel, presetValue);
        dropdown.appendChild(presetRow);

        const { details: advancedDetails, content: advancedContent } = createAdvancedContainer();
        const timelineControl = createToggleControl({
            label: 'Timeline mode',
            checked: opts.timelineMode,
            id: 'context-tools-issue-timeline-mode',
        });

        timelineControl.input.addEventListener('change', () => {
            opts.onIssueTimelineModeChange(timelineControl.input.checked);
        });

        const groupEl = document.createElement('div');
        groupEl.className = 'context-tools-dropdown-group';

        const groupTitle = document.createElement('div');
        groupTitle.className = 'context-tools-dropdown-group-title';
        groupTitle.textContent = 'Ordering';

        groupEl.append(groupTitle, timelineControl.row);
        advancedContent.appendChild(groupEl);
        dropdown.appendChild(advancedDetails);
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
    group.dataset.contextTools = 'button-group';
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

const ACTION_CONTROL_SELECTOR = 'button, summary, [role="button"], a[href]';

function normalizeLabel(text: string | null | undefined): string {
    return (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function getControlLabel(control: HTMLElement): string {
    const ariaLabel = normalizeLabel(control.getAttribute('aria-label'));
    if (ariaLabel) return ariaLabel;

    const labelledBy = control.getAttribute('aria-labelledby');
    if (labelledBy) {
        const labelledText = labelledBy
            .split(/\s+/)
            .map((id) => control.ownerDocument.getElementById(id)?.textContent ?? '')
            .join(' ');
        const normalized = normalizeLabel(labelledText);
        if (normalized) return normalized;
    }

    return normalizeLabel(control.textContent);
}

function isActionControl(control: HTMLElement): boolean {
    if (control.dataset.contextTools) return false;
    if (control.closest('[data-context-tools="button-group"]')) return false;
    if (control.closest('[role="menu"], details-menu[role="menu"]')) return false;
    if (control.hidden) return false;
    if (control.closest('[hidden], [aria-hidden="true"]')) return false;
    if (control.getClientRects().length === 0) return false;
    return true;
}

function findControlByLabel(scope: ParentNode, pattern: RegExp): HTMLElement | null {
    const controls = Array.from(scope.querySelectorAll<HTMLElement>(ACTION_CONTROL_SELECTOR));
    return controls.find((control) => isActionControl(control) && pattern.test(getControlLabel(control))) ?? null;
}

function findFirstActionControl(scope: ParentNode): HTMLElement | null {
    const controls = Array.from(scope.querySelectorAll<HTMLElement>(ACTION_CONTROL_SELECTOR));
    return controls.find((control) => isActionControl(control)) ?? null;
}

function findDiscussionHeader(): HTMLElement | null {
    return (
        document.querySelector<HTMLElement>('#partial-discussion-header') ??
        document.querySelector<HTMLElement>('[data-component="PH_Title"]')?.closest<HTMLElement>('header') ??
        document.querySelector<HTMLElement>('main header')
    );
}

function findPageHeaderActionAnchor(): HTMLElement | null {
    const actionRegions = Array.from(
        document.querySelectorAll<HTMLElement>('[data-component="PH_Actions"]'),
    );
    for (const region of actionRegions) {
        const anchor = findFirstActionControl(region);
        if (anchor) {
            return anchor;
        }
    }
    return null;
}

function findNewIssueButton(scope: ParentNode = document): HTMLElement | null {
    const byLabel =
        findControlByLabel(scope, /^new issue$/i) ?? findControlByLabel(scope, /\bnew issue\b/i);
    if (byLabel) return byLabel;

    const links = Array.from(scope.querySelectorAll<HTMLElement>('a[href*="/issues/new"]'));
    return links.find((link) => isActionControl(link)) ?? null;
}

export function findIssueAnchorButton(): HTMLElement | null {
    const pageHeaderAnchor = findPageHeaderActionAnchor();
    if (pageHeaderAnchor) return pageHeaderAnchor;

    const discussionHeader = findDiscussionHeader();
    if (discussionHeader) {
        const headerAnchor =
            findControlByLabel(discussionHeader, /\bcopy\b/i) ??
            findControlByLabel(discussionHeader, /\bedit issue title\b/i) ??
            findNewIssueButton(discussionHeader) ??
            findFirstActionControl(discussionHeader);
        if (headerAnchor) return headerAnchor;
    }

    return findNewIssueButton();
}

export function findPrAnchorButton(): HTMLElement | null {
    const pageHeaderAnchor = findPageHeaderActionAnchor();
    if (pageHeaderAnchor) return pageHeaderAnchor;

    const discussionHeader = findDiscussionHeader();
    if (discussionHeader) {
        const headerAnchor =
            findControlByLabel(discussionHeader, /\bedit pull request title\b/i) ??
            findControlByLabel(discussionHeader, /^edit$/i) ??
            findControlByLabel(discussionHeader, /\bcopy\b/i) ??
            findFirstActionControl(discussionHeader);
        if (headerAnchor) return headerAnchor;
    }

    return findControlByLabel(document, /\bedit pull request title\b/i);
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
