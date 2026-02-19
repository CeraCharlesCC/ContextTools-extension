import type { Settings } from '@domain/entities';
import { createDefaultSettings, validateSettings } from '@domain/entities';
import type { StoragePort, SettingsRepositoryPort } from '@application/ports';

const SETTINGS_KEY = 'extension_settings';

/**
 * Settings Repository Implementation
 * Implements SettingsRepositoryPort using a StoragePort
 */
export class SettingsRepository implements SettingsRepositoryPort {
  constructor(private readonly storage: StoragePort) {}

  async getSettings(): Promise<Settings> {
    const stored = await this.storage.get<Partial<Settings>>(SETTINGS_KEY);
    const defaults = createDefaultSettings();

    if (stored && typeof stored === 'object') {
      const merged: Settings = {
        pr: {
          ...defaults.pr,
          ...(stored.pr && typeof stored.pr === 'object' ? stored.pr : {}),
        },
        issue: {
          ...defaults.issue,
          ...(stored.issue && typeof stored.issue === 'object' ? stored.issue : {}),
        },
      };

      if (validateSettings(merged)) {
        if (!validateSettings(stored)) {
          await this.saveSettings(merged);
        }
        return merged;
      }
    }

    await this.saveSettings(defaults);
    return defaults;
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.storage.set(SETTINGS_KEY, settings);
  }
}
