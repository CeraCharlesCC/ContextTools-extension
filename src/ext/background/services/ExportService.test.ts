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
