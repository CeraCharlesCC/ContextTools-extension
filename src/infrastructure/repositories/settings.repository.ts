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
    const stored = await this.storage.get<Settings>(SETTINGS_KEY);

    if (stored && validateSettings(stored)) {
      return stored;
    }

    const defaults = createDefaultSettings();
    await this.saveSettings(defaults);
    return defaults;
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.storage.set(SETTINGS_KEY, settings);
  }
}
