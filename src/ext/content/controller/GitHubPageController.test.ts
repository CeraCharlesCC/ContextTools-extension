import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bridgeClient } from '@ext/bridge';
import {
  createCopyButtonGroup,
  findActionsRunAnchorContainer,
  findIssueAnchorButton,
  findPrAnchorButton,
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

describe('GitHubPageController button recovery', () => {
  let mountedButton: TestButton | null;
  let groups: TestGroup[];
  let frames: Map<number, FrameRequestCallback>;
  let frameId: number;

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
    });
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
});
