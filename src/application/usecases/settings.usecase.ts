import type { Settings, SettingsUpdate } from '@domain/entities';
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

  async execute(settings: SettingsUpdate): Promise<Settings> {
    const current = await this.settingsRepository.getSettings();
    const updated: Settings = {
      commonSettings: {
        ...current.commonSettings,
        ...(settings.commonSettings ?? {}),
      },
      pr: {
        ...current.pr,
        ...(settings.pr ?? {}),
      },
      issue: {
        ...current.issue,
        ...(settings.issue ?? {}),
      },
    };
    await this.settingsRepository.saveSettings(updated);
    return updated;
  }
}
