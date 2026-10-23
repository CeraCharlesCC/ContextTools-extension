import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultSettingsV1,
  resolvePullPreset,
  type ExportRequest,
  type ExportResult,
} from '@core/model';
import { ExportService } from './ExportService';

describe('ExportService cancellation', () => {
  it('aborts in-flight export requests and returns aborted result', async () => {
    const settingsService = {
      getSettings: vi.fn().mockResolvedValue(createDefaultSettingsV1()),
      patchSettings: vi.fn(),
    };

    const authService = {
      getToken: vi.fn().mockResolvedValue(''),
      setToken: vi.fn(),
    };

    const lastProfileStore = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };

    const runExportFn = vi.fn(
      async (_request: ExportRequest, deps: { signal?: AbortSignal }): Promise<ExportResult> => {
        return new Promise<ExportResult>((resolve) => {
          deps.signal?.addEventListener(
            'abort',
            () => {
              resolve({
                ok: false,
                code: 'aborted',
                message: 'Export was canceled.',
              });
            },
            { once: true },
          );

          setTimeout(() => {
            resolve({
              ok: true,
              markdown: 'unexpected-success',
            });
          }, 150);
        });
      },
    );

    const exportService = new ExportService(
      settingsService as never,
      authService as never,
      lastProfileStore as never,
      {
        createGitHubClientFn: vi.fn(() => ({}) as never),
        runExportFn,
      },
    );

    const request: ExportRequest = {
      requestId: 'req-1',
      target: {
        kind: 'pull',
        owner: 'octocat',
        repo: 'hello-world',
        number: 1,
      },
      profile: {
        kind: 'pull',
        preset: 'custom',
        options: resolvePullPreset('custom', {
          includeCommits: true,
        }),
      },
    };

    const runPromise = exportService.run(request);
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), 0);
    });
    const cancelResult = exportService.cancel('req-1');
    const runResult = await runPromise;

    expect(cancelResult).toEqual({ ok: true });
    expect(runResult).toEqual({
      ok: false,
      code: 'aborted',
      message: 'Export was canceled.',
    });
    expect(lastProfileStore.set).not.toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function createHarness() {
  const settings = createDefaultSettingsV1();
  const settingsService = { getSettings: vi.fn(async () => settings) };
  const authService = { getToken: vi.fn(async () => '') };
  const lastProfileStore = { get: vi.fn(async () => null), set: vi.fn(async () => undefined) };
  const createGitHubClientFn = vi.fn(() => ({}) as never);
  const runExportFn = vi.fn(async (_request: ExportRequest, _deps: { signal?: AbortSignal }): Promise<ExportResult> => ({
    ok: true, markdown: 'exported markdown',
  }));
  const service = new ExportService(settingsService as never, authService as never, lastProfileStore as never, {
    createGitHubClientFn, runExportFn,
  });
  const request: ExportRequest = {
    requestId: 'race-test',
    target: { kind: 'issue', owner: 'octocat', repo: 'hello-world', number: 1 },
    profile: { kind: 'issue', timelineMode: true },
  };
  return { settings, settingsService, authService, lastProfileStore, createGitHubClientFn, runExportFn, service, request };
}

describe('ExportService lifecycle', () => {
  it('honors cancellation while initial settings are still loading', async () => {
    const harness = createHarness();
    const loading = deferred<ReturnType<typeof createDefaultSettingsV1>>();
    harness.settingsService.getSettings.mockReturnValueOnce(loading.promise);
    const result = harness.service.run(harness.request);
    harness.service.cancel(harness.request.requestId);
    loading.resolve(harness.settings);

    await expect(result).resolves.toMatchObject({ ok: false, code: 'aborted' });
    expect(harness.createGitHubClientFn).not.toHaveBeenCalled();
    expect(harness.runExportFn).not.toHaveBeenCalled();
    expect(harness.lastProfileStore.set).not.toHaveBeenCalled();
  });

  it('rejects duplicate active IDs and reserves canceled IDs until the original work settles', async () => {
    const harness = createHarness();
    const pending = deferred<ExportResult>();
    harness.runExportFn.mockReturnValueOnce(pending.promise);
    const first = harness.service.run(harness.request);
    await vi.waitFor(() => expect(harness.runExportFn).toHaveBeenCalledTimes(1));

    await expect(harness.service.run(harness.request)).resolves.toMatchObject({ ok: false, code: 'invalidRequest' });
    const signal = harness.runExportFn.mock.calls[0][1].signal;
    harness.service.cancel(harness.request.requestId);
    expect(signal?.aborted).toBe(true);
    await expect(harness.service.run(harness.request)).resolves.toMatchObject({ ok: false, code: 'invalidRequest' });

    pending.resolve({ ok: true, markdown: 'late response' });
    await expect(first).resolves.toMatchObject({ ok: false, code: 'aborted' });
    expect(harness.lastProfileStore.set).not.toHaveBeenCalled();
    await expect(harness.service.run(harness.request)).resolves.toMatchObject({ ok: true, markdown: 'exported markdown' });
  });

  it('releases the request ID when initialization fails', async () => {
    const harness = createHarness();
    harness.settingsService.getSettings.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(harness.service.run(harness.request)).rejects.toThrow('Storage unavailable');
    await expect(harness.service.run(harness.request)).resolves.toMatchObject({ ok: true });
  });

  it.each([false, true])('honors cancellation while remembering the profile (save fails: %s)', async (fail) => {
    const harness = createHarness();
    harness.settings.behavior.rememberLastUsed = true;
    const saving = deferred<undefined>();
    harness.lastProfileStore.set.mockImplementationOnce(async () => {
      await saving.promise;
      if (fail) {
        throw new Error('Storage unavailable');
      }
    });
    const result = harness.service.run(harness.request);
    await vi.waitFor(() => expect(harness.lastProfileStore.set).toHaveBeenCalledTimes(1));
    harness.service.cancel(harness.request.requestId);
    saving.resolve(undefined);

    await expect(result).resolves.toMatchObject({ ok: false, code: 'aborted' });
  });

  it('uses a single settings snapshot per export', async () => {
    const harness = createHarness();
    await harness.service.run(harness.request);
    expect(harness.settingsService.getSettings).toHaveBeenCalledTimes(1);
  });

  it('keeps successful markdown and existing warnings when remembering the profile fails', async () => {
    const harness = createHarness();
    harness.settings.behavior.rememberLastUsed = true;
    harness.lastProfileStore.set.mockRejectedValueOnce(new Error('Storage quota exceeded'));
    harness.runExportFn.mockResolvedValueOnce({ ok: true, markdown: 'completed', warning: 'Some content was omitted.' });
    const result = await harness.service.run(harness.request);
    expect(result).toMatchObject({ ok: true, markdown: 'completed' });
    expect(result.warning).toContain('Some content was omitted.');
    expect(result.warning).toContain('last-used profile could not be saved');
  });
});
