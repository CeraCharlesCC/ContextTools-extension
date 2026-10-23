import {
  applySettingsPatchV1,
  coerceSettingsV1,
  isSettingsV1,
  type SettingsPatchV1,
  type SettingsV1,
} from '@core/model';
import { SETTINGS_STORAGE_KEY } from '@ext/bridge/keys';
import { storageGet, storageSet } from '@ext/bridge/storage';

export class SettingsService {
  private pending: Promise<unknown> = Promise.resolve();

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined);
    return result;
  }

  getSettings(): Promise<SettingsV1> {
    return this.enqueue(() => this.readSettings());
  }

  private async readSettings(): Promise<SettingsV1> {
    const stored = await storageGet<unknown>(SETTINGS_STORAGE_KEY);
    if (stored && isSettingsV1(stored)) {
      return stored;
    }

    const next = coerceSettingsV1(stored);
    await storageSet(SETTINGS_STORAGE_KEY, next);
    return next;
  }

  patchSettings(patch: SettingsPatchV1): Promise<SettingsV1> {
    return this.enqueue(async () => {
      const current = await this.readSettings();
      const next = applySettingsPatchV1(current, patch);
      await storageSet(SETTINGS_STORAGE_KEY, next);
      return next;
    });
  }
}
