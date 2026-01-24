/**
 * Domain Entity: Settings
 * Pure business object - no browser dependencies
 */
export interface Settings {
  readonly enabled: boolean;
  readonly theme: 'light' | 'dark' | 'system';
  readonly notifications: boolean;
}

export function createDefaultSettings(): Settings {
  return {
    enabled: true,
    theme: 'system',
    notifications: true,
  };
}

export function validateSettings(settings: Partial<Settings>): settings is Settings {
  return (
    typeof settings.enabled === 'boolean' &&
    ['light', 'dark', 'system'].includes(settings.theme ?? '') &&
    typeof settings.notifications === 'boolean'
  );
}
