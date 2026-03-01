import { markerFromAnchor, parseTarget } from '@core/github';
import {
  clonePullOptions,
  resolveActionsRunPreset,
  type ActionsRunExportOptions,
  type ActionsRunPreset,
  type ExportRequest,
  type MarkerId,
  type MarkerRange,
  type Target,
} from '@core/model';
import { bridgeClient } from '@ext/bridge';
import { copyToClipboard } from '../clipboard';
import {
  applyAdvancedToggle,
  applyPresetSelection,
  createPullExportState,
  type PullExportState,
} from '../exportState';
import {
  closeMenu,
  createCopyButtonGroup,
  createMenuItem,
  ensureStyles,
  findActionsRunAnchorContainer,
  findIssueAnchorButton,
  findMenuItemTemplate,
  findPrAnchorButton,
  isCommentMenu,
  showToast,
  updateCopyButtonLabel,
  updateMarkerHighlights,
  type DropdownOptions,
} from '../dom';

const COPY_BUTTON_SELECTOR = '[data-context-tools="copy-button"]';
const MENU_SELECTOR = 'ul[role="menu"], details-menu[role="menu"]';
const MENU_ITEM_SELECTOR = '[data-context-tools="menu-item"]';

interface ActionsRunExportState {
  preset: ActionsRunPreset;
  options: ActionsRunExportOptions;
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `ctx-export-${Date.now()}`;
}

function isMarkerPage(target: Target | null): target is Extract<Target, { kind: 'pull' | 'issue' }> {
  return target?.kind === 'pull' || target?.kind === 'issue';
}

function findMarkerInElement(element: Element | null): MarkerId | null {
  if (!element) {
    return null;
  }

  const id = element.getAttribute('id');
  if (id) {
    const marker = markerFromAnchor(id);
    if (marker) {
      return marker;
    }
  }

  const href = element.getAttribute('href');
  if (href) {
    const marker = markerFromAnchor(href);
    if (marker) {
      return marker;
    }
  }

  const idHost = element.closest('[id^="issuecomment-"], [id^="discussion_r"], [id^="pullrequestreview-"]');
  if (idHost) {
    const hostId = idHost.getAttribute('id');
    if (hostId) {
      const marker = markerFromAnchor(hostId);
      if (marker) {
        return marker;
      }
    }
  }

  const anchorEl = element.querySelector('a[href*="issuecomment-"], a[href*="discussion_r"], a[href*="pullrequestreview-"]');
  if (anchorEl) {
    const anchorHref = anchorEl.getAttribute('href');
    if (anchorHref) {
      const marker = markerFromAnchor(anchorHref);
      if (marker) {
        return marker;
      }
    }
  }

  return null;
}

export class GitHubPageController {
  private currentTarget: Target | null = null;
  private markerRange: MarkerRange = {};
  private copyButton: HTMLButtonElement | null = null;
  private resetMarkersButton: HTMLButtonElement | null = null;
  private lastMarkerCandidate: MarkerId | null = null;

  private isEnabled = true;
  private isCopying = false;
  private activeRequestId: string | null = null;

  private pullEnabled = true;
  private issueEnabled = true;
  private actionsRunEnabled = true;

  private tempPullState: PullExportState | null = null;
  private tempIssueTimelineMode: boolean | null = null;
  private tempActionsRunState: ActionsRunExportState | null = null;

  private defaultPullState: PullExportState = createPullExportState('full-conversation', {});
  private defaultIssueTimelineMode = true;
  private defaultActionsRunState: ActionsRunExportState = {
    preset: 'export-all',
    options: resolveActionsRunPreset('export-all'),
  };

  private pageObserver: MutationObserver | null = null;
  private menuObserver: MutationObserver | null = null;
  private pendingInjectFrame: number | null = null;
  private copyButtonInjected = false;

  async init(): Promise<void> {
    if (window.location.hostname !== 'github.com') {
      return;
    }

    await this.loadSettings();
    if (!this.isEnabled) {
      return;
    }

    ensureStyles();
    await this.handlePageChange();
    this.observeMenus();
    this.trackMenuClicks();
  }

  dispose(): void {
    this.disconnectPageObserver();
    if (this.menuObserver) {
      this.menuObserver.disconnect();
      this.menuObserver = null;
    }
  }

  onNavigation(): void {
    void this.handlePageChange();
  }

  private async loadSettings(): Promise<void> {
    try {
      const settings = await bridgeClient.call('settings.get', null);
      this.pullEnabled = settings.enabled.pull;
      this.issueEnabled = settings.enabled.issue;
      this.actionsRunEnabled = settings.enabled.actionsRun;
      this.isEnabled = this.pullEnabled || this.issueEnabled || this.actionsRunEnabled;

      this.defaultPullState = createPullExportState(
        settings.defaults.pull.preset,
        settings.defaults.pull.options,
      );
      this.defaultIssueTimelineMode = settings.defaults.issue.timelineMode;
      this.defaultActionsRunState = {
        preset: settings.defaults.actionsRun.preset,
        options: resolveActionsRunPreset(
          settings.defaults.actionsRun.preset,
          settings.defaults.actionsRun.options,
        ),
      };
    } catch {
      // Keep local defaults when settings are unavailable.
    }
  }

  private async loadEffectiveProfile(): Promise<void> {
    if (!this.currentTarget) {
      return;
    }

    try {
      const response = await bridgeClient.call('profile.getEffective', {
        target: this.currentTarget,
      });
      const { profile } = response;

      if (profile.kind === 'pull') {
        this.tempPullState = createPullExportState(profile.preset, profile.options);
        return;
      }

      if (profile.kind === 'issue') {
        this.tempIssueTimelineMode = profile.timelineMode;
        return;
      }

      this.tempActionsRunState = {
        preset: profile.preset,
        options: resolveActionsRunPreset(profile.preset, profile.options),
      };
    } catch {
      // Keep defaults if effective profile cannot be loaded.
    }
  }

  private resolveCurrentPageEnabled(): boolean {
    if (!this.currentTarget) {
      return false;
    }

    if (this.currentTarget.kind === 'pull') {
      return this.pullEnabled;
    }

    if (this.currentTarget.kind === 'issue') {
      return this.issueEnabled;
    }

    return this.actionsRunEnabled;
  }

  private resolveCurrentPullState(): PullExportState {
    return this.tempPullState ?? this.defaultPullState;
  }

  private resolveCurrentIssueTimelineMode(): boolean {
    return typeof this.tempIssueTimelineMode === 'boolean'
      ? this.tempIssueTimelineMode
      : this.defaultIssueTimelineMode;
  }

  private resolveCurrentActionsRunState(): ActionsRunExportState {
    return this.tempActionsRunState ?? this.defaultActionsRunState;
  }

  private updateCopyButtonState(): void {
    updateMarkerHighlights(this.markerRange);
    if (this.isCopying) {
      return;
    }
    updateCopyButtonLabel(this.copyButton, this.resetMarkersButton, this.markerRange);
  }

  private setCopyButtonInFlightState(inFlight: boolean): void {
    if (!this.copyButton) {
      return;
    }

    const label = this.copyButton.querySelector('.context-tools-label') as HTMLElement | null;
    const indicator = this.copyButton.querySelector('.context-tools-range-indicator') as HTMLElement | null;

    if (inFlight) {
      if (label) {
        label.textContent = 'Exporting... Click again to cancel';
      }
      if (indicator) {
        indicator.hidden = true;
      }
      this.copyButton.setAttribute('aria-label', 'Cancel export');
      return;
    }

    this.updateCopyButtonState();
  }

  private resetMarkerRange(): void {
    this.markerRange = {};
    this.updateCopyButtonState();
    showToast('Markers cleared.');
  }

  private buildDropdownOptions(): DropdownOptions {
    if (this.currentTarget?.kind === 'pull') {
      return {
        kind: 'pull',
        pullState: this.resolveCurrentPullState(),
        onPullPresetChange: (preset) => {
          const nextState = applyPresetSelection(this.resolveCurrentPullState(), preset);
          this.tempPullState = nextState;
          return nextState;
        },
        onPullAdvancedToggle: (option, checked) => {
          const nextState = applyAdvancedToggle(this.resolveCurrentPullState(), option, checked);
          this.tempPullState = nextState;
          return nextState;
        },
        onResetMarkers: () => this.resetMarkerRange(),
      };
    }

    if (this.currentTarget?.kind === 'actionsRun') {
      const currentState = this.resolveCurrentActionsRunState();
      return {
        kind: 'actions-run',
        actionsRunPreset: currentState.preset,
        onActionsRunPresetChange: (preset) => {
          const nextState = {
            preset,
            options: resolveActionsRunPreset(preset),
          };
          this.tempActionsRunState = nextState;
          return nextState.preset;
        },
      };
    }

    return {
      kind: 'issue',
      timelineMode: this.resolveCurrentIssueTimelineMode(),
      onIssueTimelineModeChange: (checked) => {
        this.tempIssueTimelineMode = checked;
      },
      onResetMarkers: () => this.resetMarkerRange(),
    };
  }

  private resolveMarkerForMenu(menu: Element): MarkerId | null {
    const marker = findMarkerInElement(menu);
    return marker ?? this.lastMarkerCandidate;
  }

  private injectMenuItems(menu: Element): void {
    if (!isMarkerPage(this.currentTarget)) {
      return;
    }

    if (menu.querySelector(MENU_ITEM_SELECTOR)) {
      return;
    }

    if (!isCommentMenu(menu)) {
      return;
    }

    const template = findMenuItemTemplate(menu);
    if (!template) {
      return;
    }

    const startItem = createMenuItem(template, 'Set start marker', () => {
      const marker = this.resolveMarkerForMenu(menu);
      if (!marker) {
        showToast('Unable to locate marker for this item.', 'error');
        closeMenu(menu);
        return;
      }

      this.markerRange = {
        ...this.markerRange,
        start: marker,
      };
      this.updateCopyButtonState();
      showToast('Start marker set.');
      closeMenu(menu);
    });

    const endItem = createMenuItem(template, 'Set end marker', () => {
      const marker = this.resolveMarkerForMenu(menu);
      if (!marker) {
        showToast('Unable to locate marker for this item.', 'error');
        closeMenu(menu);
        return;
      }

      this.markerRange = {
        ...this.markerRange,
        end: marker,
      };
      this.updateCopyButtonState();
      showToast('End marker set.');
      closeMenu(menu);
    });

    menu.appendChild(startItem);
    menu.appendChild(endItem);
  }

  private handleMenuMutation(mutation: MutationRecord): void {
    if (mutation.target instanceof Element && mutation.target.matches(MENU_SELECTOR)) {
      this.injectMenuItems(mutation.target);
    }

    mutation.addedNodes.forEach((node) => {
      if (!(node instanceof Element)) {
        return;
      }

      if (node.matches(MENU_SELECTOR)) {
        this.injectMenuItems(node);
      }

      const menus = node.querySelectorAll(MENU_SELECTOR);
      menus.forEach((menu) => this.injectMenuItems(menu));

      const closestMenu = node.closest(MENU_SELECTOR);
      if (closestMenu) {
        this.injectMenuItems(closestMenu);
      }
    });
  }

  private observeMenus(): void {
    this.menuObserver = new MutationObserver((mutations) => {
      if (!isMarkerPage(this.currentTarget)) {
        return;
      }

      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          this.handleMenuMutation(mutation);
        }
      });
    });

    this.menuObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private observePageUpdates(): void {
    this.pageObserver = new MutationObserver(() => {
      if (!this.currentTarget) {
        return;
      }

      if (this.currentTarget.kind === 'actionsRun') {
        const existing = document.querySelector(COPY_BUTTON_SELECTOR);
        if (existing) {
          this.copyButtonInjected = true;
          this.copyButton = existing as HTMLButtonElement;
          return;
        }

        this.copyButtonInjected = false;
        this.copyButton = null;
      } else if (this.copyButtonInjected) {
        return;
      }

      if (this.pendingInjectFrame !== null) {
        return;
      }

      this.pendingInjectFrame = requestAnimationFrame(() => {
        this.pendingInjectFrame = null;
        this.tryInjectCopyButton();
      });
    });

    this.pageObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private disconnectPageObserver(): void {
    if (this.pageObserver) {
      this.pageObserver.disconnect();
      this.pageObserver = null;
    }

    if (this.pendingInjectFrame !== null) {
      cancelAnimationFrame(this.pendingInjectFrame);
      this.pendingInjectFrame = null;
    }
  }

  private tryInjectMarkerPageCopyGroup(): void {
    if (!isMarkerPage(this.currentTarget) || this.copyButtonInjected) {
      return;
    }

    const anchor = this.currentTarget.kind === 'pull' ? findPrAnchorButton() : findIssueAnchorButton();
    if (!anchor?.parentElement) {
      return;
    }

    const result = createCopyButtonGroup(this.buildDropdownOptions(), () => {
      void this.handleCopyClick();
    });

    this.copyButton = result.copyButton;
    this.resetMarkersButton = result.resetMarkersButton;
    anchor.parentElement.insertBefore(result.group, anchor);
    this.copyButtonInjected = true;
    this.updateCopyButtonState();
    this.disconnectPageObserver();
  }

  private tryInjectActionsRunCopyButton(): void {
    if (this.currentTarget?.kind !== 'actionsRun') {
      return;
    }

    const anchorContainer = findActionsRunAnchorContainer();
    if (!anchorContainer?.parentElement) {
      return;
    }

    const result = createCopyButtonGroup(this.buildDropdownOptions(), () => {
      void this.handleCopyClick();
    });

    this.copyButton = result.copyButton;
    this.resetMarkersButton = result.resetMarkersButton;
    anchorContainer.parentElement.insertBefore(result.group, anchorContainer);
    this.copyButtonInjected = true;
    this.updateCopyButtonState();
  }

  private tryInjectCopyButton(): void {
    if (!this.currentTarget || (this.copyButtonInjected && this.currentTarget.kind !== 'actionsRun')) {
      return;
    }

    const existing = document.querySelector(COPY_BUTTON_SELECTOR);
    if (existing) {
      this.copyButton = existing as HTMLButtonElement;
      this.copyButtonInjected = true;
      this.updateCopyButtonState();
      if (this.currentTarget.kind !== 'actionsRun') {
        this.disconnectPageObserver();
      }
      return;
    }

    if (this.currentTarget.kind === 'actionsRun') {
      this.tryInjectActionsRunCopyButton();
      return;
    }

    this.tryInjectMarkerPageCopyGroup();
  }

  private removeExistingCopyButton(): void {
    const existing = document.querySelector(COPY_BUTTON_SELECTOR);
    if (!existing) {
      return;
    }

    const existingGroup = existing.closest('[data-context-tools="button-group"]');
    if (existingGroup) {
      existingGroup.remove();
      return;
    }

    existing.remove();
  }

  private trackMenuClicks(): void {
    const updateCandidate = (event: Event): void => {
      if (!isMarkerPage(this.currentTarget)) {
        return;
      }

      const target = event.target as Element | null;
      if (!target) {
        return;
      }

      const trigger = target.closest('button, summary');
      if (!trigger || trigger.closest(MENU_SELECTOR)) {
        return;
      }

      const marker = findMarkerInElement(trigger);
      if (marker) {
        this.lastMarkerCandidate = marker;
      }
    };

    document.addEventListener('pointerdown', updateCandidate, true);
    document.addEventListener('click', updateCandidate);
  }

  private async handlePageChange(): Promise<void> {
    this.disconnectPageObserver();

    this.currentTarget = parseTarget(window.location.pathname);
    this.markerRange = {};
    this.lastMarkerCandidate = null;
    this.copyButtonInjected = false;
    this.copyButton = null;
    this.resetMarkersButton = null;
    this.updateCopyButtonState();

    if (!this.currentTarget || !this.resolveCurrentPageEnabled()) {
      this.removeExistingCopyButton();
      return;
    }

    await this.loadEffectiveProfile();
    this.tryInjectCopyButton();

    if (this.currentTarget.kind === 'actionsRun' || !this.copyButtonInjected) {
      this.observePageUpdates();
    }
  }

  private async handleCopyClick(): Promise<void> {
    if (!this.currentTarget) {
      return;
    }

    if (this.isCopying && this.activeRequestId) {
      try {
        await bridgeClient.call('export.cancel', {
          requestId: this.activeRequestId,
        });
        showToast('Canceling export...', 'warning');
      } catch {
        showToast('Failed to cancel export.', 'error');
      }
      return;
    }

    this.isCopying = true;
    this.activeRequestId = createRequestId();
    this.setCopyButtonInFlightState(true);

    const request: ExportRequest = {
      requestId: this.activeRequestId,
      target: this.currentTarget,
    };

    if (isMarkerPage(this.currentTarget) && (this.markerRange.start || this.markerRange.end)) {
      request.selection = {
        mode: 'range',
        range: this.markerRange,
      };
    }

    if (this.currentTarget.kind === 'pull') {
      const pullState = this.resolveCurrentPullState();
      request.profile = {
        kind: 'pull',
        preset: pullState.preset,
        options: clonePullOptions(pullState.customOptions),
      };
    } else if (this.currentTarget.kind === 'issue') {
      request.profile = {
        kind: 'issue',
        timelineMode: this.resolveCurrentIssueTimelineMode(),
      };
    } else {
      const actionsState = this.resolveCurrentActionsRunState();
      request.profile = {
        kind: 'actionsRun',
        preset: actionsState.preset,
        options: {
          ...actionsState.options,
        },
      };
    }

    try {
      const result = await bridgeClient.call('export.run', request);
      if (!result.ok) {
        if (result.code === 'aborted') {
          showToast('Export canceled.', 'warning');
          return;
        }

        if (result.code === 'rateLimited' || result.code === 'unauthorized') {
          const guidance = `${result.message} Open Options to set/update a token.`;
          showToast(guidance, 'warning');
          try {
            await bridgeClient.call('options.open', null);
          } catch {
            // Ignore options open failures in content script.
          }
          return;
        }

        showToast(result.message, 'error');
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
      this.isCopying = false;
      this.activeRequestId = null;
      this.setCopyButtonInFlightState(false);
    }
  }
}
