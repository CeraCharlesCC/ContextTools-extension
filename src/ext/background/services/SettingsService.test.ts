import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultSettingsV1 } from '@core/model';
import { SettingsService } from './SettingsService';

const storage = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('@ext/bridge/storage', () => ({ storageGet: storage.get, storageSet: storage.set }));

describe('SettingsService persistence', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    let state = createDefaultSettingsV1();
    storage.get.mockImplementation(async () => structuredClone(state));
    storage.set.mockImplementation(async (_key, next) => { state = structuredClone(next); });
  });

  it('preserves concurrent patches to different fields', async () => {
    const service = new SettingsService();
    await Promise.all([
      service.patchSettings({ enabled: { pull: false } }),
      service.patchSettings({ enabled: { issue: false } }),
      service.patchSettings({ behavior: { rememberLastUsed: false } }),
    ]);

    const result = await service.getSettings();
    expect(result.enabled.pull).toBe(false);
    expect(result.enabled.issue).toBe(false);
    expect(result.behavior.rememberLastUsed).toBe(false);
  });

  it('continues processing changes after a storage failure', async () => {
    const service = new SettingsService();
    storage.set.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(service.patchSettings({ enabled: { pull: false } })).rejects.toThrow('Storage unavailable');
    await service.patchSettings({ enabled: { issue: false } });

    expect((await service.getSettings()).enabled.issue).toBe(false);
  });
});
