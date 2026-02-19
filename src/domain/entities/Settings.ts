/**
 * Domain Entity: Settings
 * Pure business object - no browser dependencies
 */
export interface BaseSettings {
  readonly enabled: boolean;
  readonly theme: 'light' | 'dark' | 'system';
  readonly notifications: boolean;
}

export interface PRSettings extends BaseSettings {
  readonly historicalMode: boolean;
  readonly includeFileDiff: boolean;
  readonly includeCommit: boolean;
  readonly smartDiffMode: boolean;
  readonly onlyReviewComments: boolean;
  readonly ignoreResolvedComments: boolean;
}

export interface IssueSettings extends BaseSettings {
  readonly historicalMode: boolean;
  readonly smartDiffMode: boolean;
}

export interface Settings {
  readonly pr: PRSettings;
  readonly issue: IssueSettings;
}

export interface SettingsUpdate {
  readonly pr?: Partial<PRSettings>;
  readonly issue?: Partial<IssueSettings>;
}

const defaultBaseSettings: BaseSettings = {
  enabled: true,
  theme: 'system',
  notifications: true,
};

export function createDefaultSettings(): Settings {
  return {
    pr: {
      ...defaultBaseSettings,
      historicalMode: true,
      includeFileDiff: false,
      includeCommit: false,
      smartDiffMode: false,
      onlyReviewComments: false,
      ignoreResolvedComments: false,
    },
    issue: {
      ...defaultBaseSettings,
      historicalMode: true,
      smartDiffMode: false,
    },
  };
}

function validateBaseSettings(settings: Partial<BaseSettings>): boolean {
  return (
    typeof settings.enabled === 'boolean' &&
    ['light', 'dark', 'system'].includes(settings.theme ?? '') &&
    typeof settings.notifications === 'boolean'
  );
}

function validatePRSettings(settings: Partial<PRSettings>): settings is PRSettings {
  return (
    validateBaseSettings(settings) &&
    typeof settings.historicalMode === 'boolean' &&
    typeof settings.includeFileDiff === 'boolean' &&
    typeof settings.includeCommit === 'boolean' &&
    typeof settings.smartDiffMode === 'boolean' &&
    typeof settings.onlyReviewComments === 'boolean' &&
    typeof settings.ignoreResolvedComments === 'boolean'
  );
}

function validateIssueSettings(settings: Partial<IssueSettings>): settings is IssueSettings {
  return (
    validateBaseSettings(settings) &&
    typeof settings.historicalMode === 'boolean' &&
    typeof settings.smartDiffMode === 'boolean'
  );
}

export function validateSettings(settings: Partial<Settings>): settings is Settings {
  if (!settings.pr || typeof settings.pr !== 'object') {
    return false;
  }

  if (!settings.issue || typeof settings.issue !== 'object') {
    return false;
  }

  return (
    validatePRSettings(settings.pr as Partial<PRSettings>) &&
    validateIssueSettings(settings.issue as Partial<IssueSettings>)
  );
}
