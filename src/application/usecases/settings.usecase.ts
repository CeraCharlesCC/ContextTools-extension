import type { Settings, SettingsUpdate } from '@domain/entities';
import type { SettingsRepositoryPort } from '@application/ports';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readTheme(
  value: unknown,
  fallback: Settings['commonSettings']['theme']
): Settings['commonSettings']['theme'] {
  return value === 'light' || value === 'dark' || value === 'system' ? value : fallback;
}

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
    const common = isRecord(settings.commonSettings) ? settings.commonSettings : {};
    const pr = isRecord(settings.pr) ? settings.pr : {};
    const issue = isRecord(settings.issue) ? settings.issue : {};

    const updated: Settings = {
      commonSettings: {
        theme: readTheme(common.theme, current.commonSettings.theme),
        notifications: readBoolean(common.notifications, current.commonSettings.notifications),
      },
      pr: {
        enabled: readBoolean(pr.enabled, current.pr.enabled),
        historicalMode: readBoolean(pr.historicalMode, current.pr.historicalMode),
        includeFileDiff: readBoolean(pr.includeFileDiff, current.pr.includeFileDiff),
        includeCommit: readBoolean(pr.includeCommit, current.pr.includeCommit),
        smartDiffMode: readBoolean(pr.smartDiffMode, current.pr.smartDiffMode),
        onlyReviewComments: readBoolean(pr.onlyReviewComments, current.pr.onlyReviewComments),
        ignoreResolvedComments: readBoolean(pr.ignoreResolvedComments, current.pr.ignoreResolvedComments),
      },
      issue: {
        enabled: readBoolean(issue.enabled, current.issue.enabled),
        historicalMode: readBoolean(issue.historicalMode, current.issue.historicalMode),
      },
    };
    await this.settingsRepository.saveSettings(updated);
    return updated;
  }
}
