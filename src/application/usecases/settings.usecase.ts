import type { Settings } from '@domain/entities';
import type { SettingsRepositoryPort } from '@application/ports';

/**
 * Use Case: Get Settings
 */
export class GetSettingsUseCase {
  constructor(private readonly settingsRepository: SettingsRepositoryPort) {}

  async execute(): Promise<Settings> {
    return this.settingsRepository.getSettings();
  }
}

/**
 * Use Case: Update Settings
 */
export class UpdateSettingsUseCase {
  constructor(private readonly settingsRepository: SettingsRepositoryPort) {}

  async execute(settings: Partial<Settings>): Promise<Settings> {
    const current = await this.settingsRepository.getSettings();
    const updated: Settings = { ...current, ...settings };
    await this.settingsRepository.saveSettings(updated);
    return updated;
  }
}
