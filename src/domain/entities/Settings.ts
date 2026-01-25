/**
 * Domain Entity: Settings
 * Pure business object - no browser dependencies
 */
export interface Settings {
  readonly enabled: boolean;
  readonly theme: 'light' | 'dark' | 'system';
  readonly notifications: boolean;
  readonly historicalMode: boolean;
  readonly includeFileDiff: boolean;
  readonly includeCommit: boolean;
  readonly smartDiffMode: boolean;
}

export function createDefaultSettings(): Settings {
  return {
    enabled: true,
    theme: 'system',
    notifications: true,
    historicalMode: true,
    includeFileDiff: false,
    includeCommit: false,
    smartDiffMode: false,
  };
}

export function validateSettings(settings: Partial<Settings>): settings is Settings {
  return (
    typeof settings.enabled === 'boolean' &&
    ['light', 'dark', 'system'].includes(settings.theme ?? '') &&
    typeof settings.notifications === 'boolean' &&
    typeof settings.historicalMode === 'boolean' &&
    typeof settings.includeFileDiff === 'boolean' &&
    typeof settings.includeCommit === 'boolean' &&
    typeof settings.smartDiffMode === 'boolean'
  );
}
