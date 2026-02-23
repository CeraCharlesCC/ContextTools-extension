import type { Settings } from '@domain/entities';
import { createDefaultSettings, migrateStoredSettings, validateSettings } from '@domain/entities';
import type { StoragePort, SettingsRepositoryPort } from '@application/ports';

const SETTINGS_KEY = 'extension_settings';

/**
 * Settings Repository Implementation
 * Implements SettingsRepositoryPort using a StoragePort
 */
export class SettingsRepository implements SettingsRepositoryPort {
  constructor(private readonly storage: StoragePort) {}

  async getSettings(): Promise<Settings> {
    const stored = await this.storage.get<unknown>(SETTINGS_KEY);
    const defaults = createDefaultSettings();

    if (stored && validateSettings(stored as Partial<Settings>)) {
      return stored as Settings;
    }

    const migrated = migrateStoredSettings(stored);
    if (migrated && validateSettings(migrated)) {
      await this.saveSettings(migrated);
      return migrated;
    }

    await this.saveSettings(defaults);
    return defaults;
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.storage.set(SETTINGS_KEY, settings);
  }
}
