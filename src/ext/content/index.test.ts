import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  init: vi.fn().mockResolvedValue(undefined),
  dispose: vi.fn(),
  onNavigation: vi.fn(),
  disposeNavigation: vi.fn(),
}));

vi.mock('./controller/GitHubPageController', () => ({
  GitHubPageController: class {
    init = mocks.init;
    dispose = mocks.dispose;
    onNavigation = mocks.onNavigation;
  },
}));
vi.mock('./navigation', () => ({
  createNavigationWatcher: () => ({ dispose: mocks.disposeNavigation }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.resetModules();
});

describe('content script page lifecycle', () => {
  it('disposes only after the page actually leaves without entering the back/forward cache', async () => {
    const listeners = new Map<string, (event: { persisted: boolean }) => void>();
    vi.stubGlobal('window', {
      addEventListener: (event: string, listener: (event: { persisted: boolean }) => void) => {
        listeners.set(event, listener);
      },
    });
    await import('./index');
    expect(listeners.has('beforeunload')).toBe(false);
    listeners.get('pagehide')?.({ persisted: true });
    expect(mocks.dispose).not.toHaveBeenCalled();
    expect(mocks.disposeNavigation).not.toHaveBeenCalled();
    listeners.get('pagehide')?.({ persisted: false });
    expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(mocks.disposeNavigation).toHaveBeenCalledOnce();
  });
});
