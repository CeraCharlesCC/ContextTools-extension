import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bridgeClient } from '@ext/bridge';
import { createDefaultPullProfile, createDefaultSettingsV1, type ExportResult } from '@core/model';
import { SETTINGS_STORAGE_KEY } from '@ext/bridge/keys';
import { copyToClipboard } from '../clipboard';
import {
  createCopyButtonGroup,
  findActionsRunAnchorContainer,
  findIssueAnchorButton,
  findPrAnchorButton,
  showToast,
  updateCopyButtonLabel,
  type CopyButtonGroupResult,
  type DropdownOptions,
} from '../dom';
import { GitHubPageController } from './GitHubPageController';

vi.mock('@ext/bridge', () => ({ bridgeClient: { call: vi.fn() } }));
vi.mock('../dom', () => ({
  closeMenu: vi.fn(),
  createCopyButtonGroup: vi.fn(),
  createMenuItem: vi.fn(),
  ensureStyles: vi.fn(),
  findActionsRunAnchorContainer: vi.fn(),
  findIssueAnchorButton: vi.fn(),
  findMenuItemTemplate: vi.fn(),
  findPrAnchorButton: vi.fn(),
  isCommentMenu: vi.fn(),
  showToast: vi.fn(),
  updateCopyButtonLabel: vi.fn(),
  updateMarkerHighlights: vi.fn(),
}));
vi.mock('../clipboard', () => ({ copyToClipboard: vi.fn() }));

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = [];

  active = false;

  constructor(private readonly callback: MutationCallback) {
    FakeMutationObserver.instances.push(this);
  }

  observe(): void {
    this.active = true;
  }

  disconnect(): void {
    this.active = false;
  }

  trigger(): void {
    if (this.active) {
      this.callback([], this as unknown as MutationObserver);
    }
  }
}

interface TestButton {
  isConnected: boolean;
  label: { textContent: string };
  querySelector: (selector: string) => { textContent?: string; hidden?: boolean } | null;
  setAttribute: ReturnType<typeof vi.fn>;
  closest: () => { remove: () => void };
}

interface TestGroup {
  button: TestButton;
  dispose: ReturnType<typeof vi.fn>;
  options: DropdownOptions;
  onCopyClick: () => void;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('GitHubPageController button recovery', () => {
  let mountedButton: TestButton | null;
  let groups: TestGroup[];
  let frames: Map<number, FrameRequestCallback>;
  let frameId: number;
  let onSettingsChanged: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void;

  const flushFrames = (): void => {
    const scheduled = [...frames.values()];
    frames.clear();
    scheduled.forEach((callback) => callback(0));
  };

  const replaceGitHubHeader = (): void => {
    if (mountedButton) {
      mountedButton.isConnected = false;
    }
    mountedButton = null;
    FakeMutationObserver.instances[0].trigger();
  };

  beforeEach(() => {
    vi.resetAllMocks();
    FakeMutationObserver.instances = [];
    mountedButton = null;
    groups = [];
    frames = new Map();
    frameId = 0;

    vi.stubGlobal('MutationObserver', FakeMutationObserver);
    vi.stubGlobal('window', {
      location: { hostname: 'github.com', pathname: '/owner/repo/pull/1' },
    });
    vi.stubGlobal('document', {
      body: {},
      querySelector: vi.fn((selector: string) =>
        selector === '[data-context-tools="copy-button"]' ? mountedButton : null,
      ),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      querySelectorAll: vi.fn(() => []),
    });
    vi.stubGlobal('chrome', { storage: { onChanged: {
      addListener: vi.fn((listener) => { onSettingsChanged = listener; }),
      removeListener: vi.fn(),
    } } });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = ++frameId;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));

    const anchorParent = {
      insertBefore: (group: { button: TestButton }) => {
        mountedButton = group.button;
        group.button.isConnected = true;
      },
    };
    const anchor = { parentElement: anchorParent } as unknown as HTMLElement;
    vi.mocked(findPrAnchorButton).mockReturnValue(anchor);
    vi.mocked(findIssueAnchorButton).mockReturnValue(anchor);
    vi.mocked(findActionsRunAnchorContainer).mockReturnValue(anchor);

    vi.mocked(createCopyButtonGroup).mockImplementation((options, onCopyClick) => {
      const button: TestButton = {
        isConnected: false,
        label: { textContent: 'Copy as Markdown' },
        querySelector(selector) {
          if (selector === '.context-tools-label') return this.label;
          if (selector === '.context-tools-range-indicator') return { hidden: true };
          return null;
        },
        setAttribute: vi.fn(),
        closest: () => group,
      };
      const group = {
        button,
        remove: () => {
          button.isConnected = false;
          if (mountedButton === button) mountedButton = null;
        },
      };
      const dispose = vi.fn();
      groups.push({ button, dispose, options, onCopyClick });
      return {
        group,
        copyButton: button,
        settingsDropdown: {},
        resetMarkersButton: null,
        dispose,
      } as unknown as CopyButtonGroupResult;
    });

    vi.mocked(updateCopyButtonLabel).mockImplementation((button) => {
      const label = button?.querySelector('.context-tools-label');
      if (label) label.textContent = 'Copy as Markdown';
    });
    // Both settings and profile lookups fall back to their local defaults.
    vi.mocked(bridgeClient.call).mockRejectedValue(new Error('unavailable in test'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['PR', '/owner/repo/pull/1'],
    ['Issue', '/owner/repo/issues/2'],
    ['Actions Run', '/owner/repo/actions/runs/3'],
  ])('reinjects only once after GitHub replaces the %s header', async (_name, pathname) => {
    window.location.pathname = pathname;
    const controller = new GitHubPageController();
    await controller.init();

    expect(groups).toHaveLength(1);
    expect(FakeMutationObserver.instances[0].active).toBe(true);
    const originalGroup = groups[0];

    replaceGitHubHeader();
    FakeMutationObserver.instances[0].trigger();
    expect(frames.size).toBe(1);
    flushFrames();

    expect(groups).toHaveLength(2);
    expect(groups[1].button.isConnected).toBe(true);
    expect(originalGroup.dispose).toHaveBeenCalledTimes(1);

    // Ordinary GitHub DOM updates must not duplicate an already mounted button.
    FakeMutationObserver.instances[0].trigger();
    flushFrames();
    expect(groups).toHaveLength(2);

    controller.dispose();
    expect(groups[1].dispose).toHaveBeenCalledTimes(1);
    expect(FakeMutationObserver.instances[0].active).toBe(false);
  });

  it('keeps the selected PR preset and exporting state when the button is replaced', async () => {
    const controller = new GitHubPageController();
    await controller.init();

    const firstGroup = groups[0];
    if (firstGroup.options.kind !== 'pull') throw new Error('Expected a PR dropdown');
    firstGroup.options.onPullPresetChange('with-diffs');

    let resolveExport!: (result: { ok: false; code: 'aborted'; message: string }) => void;
    const exportResult = new Promise<{ ok: false; code: 'aborted'; message: string }>((resolve) => {
      resolveExport = resolve;
    });
    vi.mocked(bridgeClient.call).mockImplementation(() => exportResult as never);

    firstGroup.onCopyClick();
    expect(firstGroup.button.label.textContent).toContain('Exporting...');

    replaceGitHubHeader();
    flushFrames();

    const restoredGroup = groups[1];
    expect(restoredGroup.button.label.textContent).toContain('Exporting...');
    expect(restoredGroup.options.kind).toBe('pull');
    if (restoredGroup.options.kind === 'pull') {
      expect(restoredGroup.options.pullState.preset).toBe('with-diffs');
    }

    resolveExport({ ok: false, code: 'aborted', message: 'Canceled' });
    await vi.waitFor(() => {
      expect(restoredGroup.button.label.textContent).toBe('Copy as Markdown');
    });
    controller.dispose();
  });

  it('injects when the PR header appears after the content script starts', async () => {
    vi.mocked(findPrAnchorButton).mockReturnValueOnce(null);
    const controller = new GitHubPageController();
    await controller.init();

    expect(groups).toHaveLength(0);
    expect(FakeMutationObserver.instances[0].active).toBe(true);
    FakeMutationObserver.instances[0].trigger();
    flushFrames();
    expect(groups).toHaveLength(1);
    controller.dispose();
  });

  it('removes the previous group and listener on navigation', async () => {
    const controller = new GitHubPageController();
    await controller.init();
    const firstGroup = groups[0];

    window.location.pathname = '/owner/repo/issues/2';
    controller.onNavigation();
    await vi.waitFor(() => expect(groups).toHaveLength(2));

    expect(firstGroup.button.isConnected).toBe(false);
    expect(firstGroup.dispose).toHaveBeenCalledTimes(1);
    expect(groups[1].options.kind).toBe('issue');
    expect(FakeMutationObserver.instances[0].active).toBe(false);
    controller.dispose();
  });

  it('ignores an older profile response after navigation without replacing the new observer', async () => {
    const firstProfile = deferred<{ profile: ReturnType<typeof createDefaultPullProfile> }>();
    vi.mocked(bridgeClient.call).mockImplementation((method) => {
      if (method === 'profile.getEffective') return firstProfile.promise as never;
      return Promise.reject(new Error('Unavailable'));
    });
    const controller = new GitHubPageController();
    const initialization = controller.init();
    await vi.waitFor(() => expect(bridgeClient.call).toHaveBeenCalledWith('profile.getEffective', {
      target: expect.objectContaining({ kind: 'pull' }),
    }));

    vi.mocked(bridgeClient.call).mockRejectedValue(new Error('Unavailable'));
    window.location.pathname = '/owner/other/pull/2';
    controller.onNavigation();
    await vi.waitFor(() => expect(groups).toHaveLength(1));
    const currentGroup = groups[0];
    if (currentGroup.options.kind !== 'pull') throw new Error('Expected PR');
    currentGroup.options.onPullPresetChange('with-diffs');

    firstProfile.resolve({ profile: createDefaultPullProfile() });
    await initialization;
    expect(FakeMutationObserver.instances).toHaveLength(2); // One page observer and one menu observer.
    replaceGitHubHeader();
    flushFrames();
    const options = groups[1].options;
    expect(options.kind === 'pull' && options.pullState.preset).toBe('with-diffs');
    controller.dispose();
  });

  it('falls back to defaults on the next page instead of carrying over temporary options', async () => {
    const controller = new GitHubPageController();
    await controller.init();
    const options = groups[0].options;
    if (options.kind !== 'pull') throw new Error('Expected PR');
    options.onPullPresetChange('with-diffs');

    window.location.pathname = '/owner/other/pull/2';
    controller.onNavigation();
    await vi.waitFor(() => expect(groups).toHaveLength(2));
    const nextOptions = groups[1].options;
    expect(nextOptions.kind === 'pull' && nextOptions.pullState.preset).toBe('full-conversation');
    controller.dispose();
  });

  it.each(['navigation', 'disposal'] as const)('cancels exports on %s and ignores late results', async (action) => {
    const controller = new GitHubPageController();
    await controller.init();
    const oldExport = deferred<ExportResult>();
    const newExport = deferred<ExportResult>();
    vi.mocked(bridgeClient.call).mockImplementation((method) => {
      if (method === 'export.run') return oldExport.promise as never;
      return Promise.reject(new Error('Unavailable'));
    });
    groups[0].onCopyClick();
    const oldRequest = vi.mocked(bridgeClient.call).mock.calls.find(([method]) => method === 'export.run')?.[1];

    if (action === 'navigation') {
      window.location.pathname = '/owner/repo/issues/2';
      controller.onNavigation();
      await vi.waitFor(() => expect(groups).toHaveLength(2));
      vi.mocked(bridgeClient.call).mockImplementation((method) => {
        if (method === 'export.run') return newExport.promise as never;
        return Promise.reject(new Error('Unavailable'));
      });
      groups[1].onCopyClick();
    } else {
      controller.dispose();
    }
    expect(bridgeClient.call).toHaveBeenCalledWith('export.cancel', {
      requestId: (oldRequest as { requestId: string }).requestId,
    });
    oldExport.resolve({ ok: true, markdown: 'stale export' });
    await oldExport.promise;
    await Promise.resolve();
    expect(copyToClipboard).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    if (action === 'navigation') {
      expect(groups[1].button.label.textContent).toContain('Exporting...');
      newExport.resolve({ ok: true, markdown: 'current export' });
      await vi.waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith('current export'));
      controller.dispose();
    }
  });

  it('does not mount UI or observers when disposed during initialization', async () => {
    const profile = deferred<{ profile: ReturnType<typeof createDefaultPullProfile> }>();
    vi.mocked(bridgeClient.call).mockImplementation((method) => {
      if (method === 'profile.getEffective') return profile.promise as never;
      return Promise.reject(new Error('Unavailable'));
    });
    const controller = new GitHubPageController();
    const initialization = controller.init();
    await vi.waitFor(() => expect(bridgeClient.call).toHaveBeenCalledWith('profile.getEffective', expect.anything()));
    controller.dispose();
    profile.resolve({ profile: createDefaultPullProfile() });
    await initialization;
    expect(groups).toHaveLength(0);
    expect(FakeMutationObserver.instances).toHaveLength(0);
  });

  it('removes document menu listeners when disposed', async () => {
    const controller = new GitHubPageController();
    await controller.init();
    controller.dispose();
    expect(document.removeEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
    expect(document.removeEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    expect(mountedButton).toBeNull();
    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(onSettingsChanged);
  });

  it('applies enable changes on the current page without a reload', async () => {
    const controller = new GitHubPageController();
    await controller.init();
    const settings = createDefaultSettingsV1();
    settings.enabled.pull = false;
    onSettingsChanged({ [SETTINGS_STORAGE_KEY]: { newValue: settings } }, 'local');
    expect(mountedButton).toBeNull();
    expect(FakeMutationObserver.instances[0].active).toBe(false);
    settings.enabled.pull = true;
    onSettingsChanged({ [SETTINGS_STORAGE_KEY]: { newValue: settings } }, 'local');
    await vi.waitFor(() => expect(groups).toHaveLength(2));
    expect(mountedButton?.isConnected).toBe(true);
    controller.dispose();
  });

  it('can enable a page after starting with every page type disabled', async () => {
    const settings = createDefaultSettingsV1();
    settings.enabled = { pull: false, issue: false, actionsRun: false };
    vi.mocked(bridgeClient.call).mockResolvedValueOnce(settings);
    const controller = new GitHubPageController();
    await controller.init();
    expect(groups).toHaveLength(0);
    settings.enabled.pull = true;
    onSettingsChanged({ [SETTINGS_STORAGE_KEY]: { newValue: settings } }, 'local');
    await vi.waitFor(() => expect(groups).toHaveLength(1));
    controller.dispose();
  });

  it('keeps a newer storage update when the initial settings request returns late', async () => {
    const settingsResult = deferred<ReturnType<typeof createDefaultSettingsV1>>();
    vi.mocked(bridgeClient.call).mockReturnValueOnce(settingsResult.promise);
    const controller = new GitHubPageController();
    const initialization = controller.init();
    const settings = createDefaultSettingsV1();
    settings.enabled.pull = false;
    onSettingsChanged({ [SETTINGS_STORAGE_KEY]: { newValue: settings } }, 'local');
    settingsResult.resolve(createDefaultSettingsV1());
    await initialization;
    expect(groups).toHaveLength(0);
    controller.dispose();
  });
});
