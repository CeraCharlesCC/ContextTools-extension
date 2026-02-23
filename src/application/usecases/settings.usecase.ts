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
        defaultPreset: readPreset(pr.defaultPreset, current.pr.defaultPreset),
        customOptions: {
          includeIssueComments: readBoolean(
            isRecord(pr.customOptions) ? pr.customOptions.includeIssueComments : undefined,
            current.pr.customOptions.includeIssueComments
          ),
          includeReviewComments: readBoolean(
            isRecord(pr.customOptions) ? pr.customOptions.includeReviewComments : undefined,
            current.pr.customOptions.includeReviewComments
          ),
          includeReviews: readBoolean(
            isRecord(pr.customOptions) ? pr.customOptions.includeReviews : undefined,
            current.pr.customOptions.includeReviews
          ),
          includeCommits: readBoolean(
            isRecord(pr.customOptions) ? pr.customOptions.includeCommits : undefined,
            current.pr.customOptions.includeCommits
          ),
          includeFileDiffs: readBoolean(
            isRecord(pr.customOptions) ? pr.customOptions.includeFileDiffs : undefined,
            current.pr.customOptions.includeFileDiffs
          ),
          includeCommitDiffs: readBoolean(
            isRecord(pr.customOptions) ? pr.customOptions.includeCommitDiffs : undefined,
            current.pr.customOptions.includeCommitDiffs
          ),
          smartDiffMode: readBoolean(
            isRecord(pr.customOptions) ? pr.customOptions.smartDiffMode : undefined,
            current.pr.customOptions.smartDiffMode
          ),
          timelineMode: readBoolean(
            isRecord(pr.customOptions) ? pr.customOptions.timelineMode : undefined,
            current.pr.customOptions.timelineMode
          ),
          ignoreResolvedComments: readBoolean(
            isRecord(pr.customOptions) ? pr.customOptions.ignoreResolvedComments : undefined,
            current.pr.customOptions.ignoreResolvedComments
          ),
        },
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
