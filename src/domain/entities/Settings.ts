/**
 * Domain Entity: Settings
 * Pure business object - no browser dependencies
 */
export interface CommonSettings {
  readonly theme: 'light' | 'dark' | 'system';
  readonly notifications: boolean;
}

export interface PRSettings {
  readonly enabled: boolean;
  readonly historicalMode: boolean;
  readonly includeFileDiff: boolean;
  readonly includeCommit: boolean;
  readonly smartDiffMode: boolean;
  readonly onlyReviewComments: boolean;
  readonly ignoreResolvedComments: boolean;
}

export interface IssueSettings {
  readonly enabled: boolean;
  readonly historicalMode: boolean;
}

export interface Settings {
  readonly commonSettings: CommonSettings;
  readonly pr: PRSettings;
  readonly issue: IssueSettings;
}

export interface SettingsUpdate {
  readonly commonSettings?: Partial<CommonSettings>;
  readonly pr?: Partial<PRSettings>;
  readonly issue?: Partial<IssueSettings>;
}

const defaultCommonSettings: CommonSettings = {
  theme: 'system',
  notifications: true,
};

export function createDefaultSettings(): Settings {
  return {
    commonSettings: { ...defaultCommonSettings },
    pr: {
      enabled: true,
      historicalMode: true,
      includeFileDiff: false,
      includeCommit: false,
      smartDiffMode: false,
      onlyReviewComments: false,
      ignoreResolvedComments: false,
    },
    issue: {
      enabled: true,
      historicalMode: true,
    },
  };
}

function validateCommonSettings(settings: Partial<CommonSettings>): settings is CommonSettings {
  return (
    typeof settings.theme === 'string' &&
    ['light', 'dark', 'system'].includes(settings.theme) &&
    typeof settings.notifications === 'boolean'
  );
}

function validatePRSettings(settings: Partial<PRSettings>): settings is PRSettings {
  return (
    typeof settings.enabled === 'boolean' &&
    typeof settings.historicalMode === 'boolean' &&
    typeof settings.includeFileDiff === 'boolean' &&
    typeof settings.includeCommit === 'boolean' &&
    typeof settings.smartDiffMode === 'boolean' &&
    typeof settings.onlyReviewComments === 'boolean' &&
    typeof settings.ignoreResolvedComments === 'boolean'
  );
}

function validateIssueSettings(settings: Partial<IssueSettings>): settings is IssueSettings {
  return typeof settings.enabled === 'boolean' && typeof settings.historicalMode === 'boolean';
}

export function validateSettings(settings: Partial<Settings>): settings is Settings {
  if (!settings.commonSettings || typeof settings.commonSettings !== 'object') {
    return false;
  }

  if (!settings.pr || typeof settings.pr !== 'object') {
    return false;
  }

  if (!settings.issue || typeof settings.issue !== 'object') {
    return false;
  }

  return (
    validateCommonSettings(settings.commonSettings) &&
    validatePRSettings(settings.pr) &&
    validateIssueSettings(settings.issue)
  );
}
