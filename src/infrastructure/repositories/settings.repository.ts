import type { Settings } from '@domain/entities';
import { createDefaultSettings, validateSettings } from '@domain/entities';
import type { StoragePort, SettingsRepositoryPort } from '@application/ports';

const SETTINGS_KEY = 'extension_settings';

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
 * Settings Repository Implementation
 * Implements SettingsRepositoryPort using a StoragePort
 */
export class SettingsRepository implements SettingsRepositoryPort {
  constructor(private readonly storage: StoragePort) {}

  async getSettings(): Promise<Settings> {
    const stored = await this.storage.get<Record<string, unknown>>(SETTINGS_KEY);
    const defaults = createDefaultSettings();

    if (isRecord(stored)) {
      const storedPr = isRecord(stored.pr) ? stored.pr : {};
      const storedIssue = isRecord(stored.issue) ? stored.issue : {};
      const storedCommon = isRecord(stored.commonSettings) ? stored.commonSettings : {};

      const merged: Settings = {
        commonSettings: {
          notifications: readBoolean(
            storedCommon.notifications,
            readBoolean(storedPr.notifications, readBoolean(storedIssue.notifications, defaults.commonSettings.notifications))
          ),
          theme: readTheme(storedCommon.theme, readTheme(storedPr.theme, readTheme(storedIssue.theme, defaults.commonSettings.theme))),
        },
        pr: {
          enabled: readBoolean(storedPr.enabled, defaults.pr.enabled),
          historicalMode: readBoolean(storedPr.historicalMode, defaults.pr.historicalMode),
          includeFileDiff: readBoolean(storedPr.includeFileDiff, defaults.pr.includeFileDiff),
          includeCommit: readBoolean(storedPr.includeCommit, defaults.pr.includeCommit),
          smartDiffMode: readBoolean(storedPr.smartDiffMode, defaults.pr.smartDiffMode),
          onlyReviewComments: readBoolean(storedPr.onlyReviewComments, defaults.pr.onlyReviewComments),
          ignoreResolvedComments: readBoolean(storedPr.ignoreResolvedComments, defaults.pr.ignoreResolvedComments),
        },
        issue: {
          enabled: readBoolean(storedIssue.enabled, defaults.issue.enabled),
          historicalMode: readBoolean(storedIssue.historicalMode, defaults.issue.historicalMode),
        },
      };

      if (!validateSettings(stored as Partial<Settings>)) {
        await this.saveSettings(merged);
      }
      return merged;
    }

    await this.saveSettings(defaults);
    return defaults;
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.storage.set(SETTINGS_KEY, settings);
  }
}
