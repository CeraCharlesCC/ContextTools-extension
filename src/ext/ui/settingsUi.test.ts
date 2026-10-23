import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultSettingsV1 } from '@core/model';
import { bridgeClient } from '@ext/bridge';

vi.mock('@ext/bridge', () => ({ bridgeClient: { call: vi.fn() } }));

class Control {
  checked = false;
  disabled = false;
  value = '';
  textContent = '';
  className = '';
  classList = { remove: vi.fn(), toggle: vi.fn() };
  listeners = new Map<string, () => void>();
  addEventListener(event: string, listener: () => void) { this.listeners.set(event, listener); }
  removeAttribute = vi.fn();
  append = vi.fn();
  emit(event: string) { this.listeners.get(event)?.(); }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('settings UI requests', () => {
  let controls: Map<string, Control>;
  const control = (id: string): Control => controls.get(id)!;

  beforeEach(() => {
    vi.resetAllMocks();
    controls = new Map();
    vi.stubGlobal('document', {
      getElementById: (id: string) => {
        if (!controls.has(id)) controls.set(id, new Control());
        return controls.get(id);
      },
      createElement: () => new Control(),
    });
    vi.stubGlobal('window', { setTimeout: vi.fn() });
    vi.stubGlobal('navigator', { userAgent: 'Firefox' });
    vi.stubGlobal('chrome', {
      runtime: { getManifest: () => ({ version: '1.0.0' }) },
      tabs: { query: (_query: unknown, callback: (tabs: unknown[]) => void) => callback([]) },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('locks popup toggles until settings arrive and restores the captured value after a failed save', async () => {
    const settings = deferred<ReturnType<typeof createDefaultSettingsV1>>();
    const save = deferred<ReturnType<typeof createDefaultSettingsV1>>();
    vi.mocked(bridgeClient.call).mockReturnValueOnce(settings.promise).mockReturnValueOnce(save.promise);
    await import('./popup/main');
    const toggle = control('pull-enabled-toggle');
    expect(toggle.disabled).toBe(true);
    settings.resolve(createDefaultSettingsV1());
    await vi.waitFor(() => expect(toggle.disabled).toBe(false));
    expect(toggle.checked).toBe(true);

    toggle.checked = false;
    toggle.emit('change');
    expect(toggle.disabled).toBe(true);
    expect(bridgeClient.call).toHaveBeenCalledWith('settings.patch', { enabled: { pull: false } });
    // A late failure must use the saved value, even if another update changed the UI.
    toggle.checked = true;
    save.reject(new Error('Save failed'));
    await vi.waitFor(() => expect(toggle.disabled).toBe(false));
    expect(toggle.checked).toBe(true);
  });

  it('keeps popup controls disabled when the initial read fails', async () => {
    vi.mocked(bridgeClient.call).mockRejectedValue(new Error('Unavailable'));
    await import('./popup/main');
    await Promise.resolve();
    expect(control('pull-enabled-toggle').disabled).toBe(true);
    expect(control('issue-enabled-toggle').disabled).toBe(true);
    expect(control('actions-enabled-toggle').disabled).toBe(true);
  });

  it('loads settings and token independently before allowing options edits', async () => {
    const settings = deferred<ReturnType<typeof createDefaultSettingsV1>>();
    const token = deferred<{ token: string }>();
    vi.mocked(bridgeClient.call).mockImplementation((method) => {
      if (method === 'settings.get') return settings.promise as never;
      if (method === 'auth.getToken') return token.promise as never;
      return Promise.reject(new Error('Unexpected method'));
    });
    await import('./options/main');
    expect(control('github-token').disabled).toBe(true);
    expect(control('pull-enabled-toggle').disabled).toBe(true);
    expect(control('remember-scope-select').disabled).toBe(true);
    expect(control('pull-custom-include-commits-toggle').disabled).toBe(true);

    token.resolve({ token: 'stored token' });
    await vi.waitFor(() => expect(control('github-token').disabled).toBe(false));
    expect(control('github-token').value).toBe('stored token');
    expect(control('pull-enabled-toggle').disabled).toBe(true);

    const stored = createDefaultSettingsV1();
    stored.behavior.rememberLastUsed = false;
    stored.defaults.pull.options.includeCommitDiffs = false;
    settings.resolve(stored);
    await vi.waitFor(() => expect(control('pull-enabled-toggle').disabled).toBe(false));
    expect(control('pull-custom-include-commits-toggle').disabled).toBe(false);
    expect(control('remember-scope-select').disabled).toBe(true);
    expect(control('pull-custom-smart-diff-mode-toggle').disabled).toBe(true);
  });
});
