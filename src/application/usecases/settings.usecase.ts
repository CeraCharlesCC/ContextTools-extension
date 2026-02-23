import type { Settings, SettingsUpdate } from '@domain/entities';
import type { SettingsRepositoryPort } from '@application/ports';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readPreset(
  value: unknown,
  fallback: Settings['pr']['defaultPreset']
): Settings['pr']['defaultPreset'] {
  return value === 'full-conversation' ||
    value === 'with-diffs' ||
    value === 'review-comments-only' ||
    value === 'commit-log' ||
    value === 'custom'
    ? value
    : fallback;
}

function readTheme(
  value: unknown,
  fallback: Settings['commonSettings']['theme']
): Settings['commonSettings']['theme'] {
  return value === 'light' || value === 'dark' || value === 'system' ? value : fallback;
}

type MutableCustomOptions = {
  -readonly [K in keyof Settings['pr']['customOptions']]: Settings['pr']['customOptions'][K];
};

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
    const prCustomOptions = isRecord(pr.customOptions) ? pr.customOptions : undefined;
    const customOptions = (
      Object.keys(current.pr.customOptions) as Array<keyof Settings['pr']['customOptions']>
    ).reduce((acc, key) => {
      acc[key] = readBoolean(prCustomOptions?.[key], current.pr.customOptions[key]);
      return acc;
    }, {} as MutableCustomOptions);

    const updated: Settings = {
      commonSettings: {
        theme: readTheme(common.theme, current.commonSettings.theme),
        notifications: readBoolean(common.notifications, current.commonSettings.notifications),
      },
      pr: {
        enabled: readBoolean(pr.enabled, current.pr.enabled),
        defaultPreset: readPreset(pr.defaultPreset, current.pr.defaultPreset),
        customOptions,
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
