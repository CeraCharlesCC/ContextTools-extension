/**
 * Domain Entity: Settings
 * Pure business object - no browser dependencies
 */
export interface CommonSettings {
  readonly theme: 'light' | 'dark' | 'system';
  readonly notifications: boolean;
}

export type ExportPreset =
  | 'full-conversation'
  | 'with-diffs'
  | 'review-comments-only'
  | 'commit-log'
  | 'custom';

export interface ExportOptions {
  readonly includeIssueComments: boolean;
  readonly includeReviewComments: boolean;
  readonly includeReviews: boolean;
  readonly includeCommits: boolean;
  readonly includeFileDiffs: boolean;
  readonly includeCommitDiffs: boolean;
  readonly smartDiffMode: boolean;
  readonly timelineMode: boolean;
  readonly ignoreResolvedComments: boolean;
}

export interface PRSettings {
  readonly enabled: boolean;
  readonly defaultPreset: ExportPreset;
  readonly customOptions: ExportOptions;
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

export type PRSettingsUpdate =
  Partial<Omit<PRSettings, 'customOptions'>> & {
    readonly customOptions?: Partial<ExportOptions>;
  };

export interface SettingsUpdate {
  readonly commonSettings?: Partial<CommonSettings>;
  readonly pr?: PRSettingsUpdate;
  readonly issue?: Partial<IssueSettings>;
}

export interface LegacyPRSettings {
  readonly enabled?: boolean;
  readonly historicalMode?: boolean;
  readonly includeFileDiff?: boolean;
  readonly includeCommit?: boolean;
  readonly smartDiffMode?: boolean;
  readonly onlyReviewComments?: boolean;
  readonly ignoreResolvedComments?: boolean;
}

type MutableExportOptions = {
  -readonly [K in keyof ExportOptions]: ExportOptions[K];
};

const exportOptionKeys: ReadonlyArray<keyof ExportOptions> = [
  'includeIssueComments',
  'includeReviewComments',
  'includeReviews',
  'includeCommits',
  'includeFileDiffs',
  'includeCommitDiffs',
  'smartDiffMode',
  'timelineMode',
  'ignoreResolvedComments',
];

export const BUILTIN_EXPORT_PRESETS: ReadonlyArray<Exclude<ExportPreset, 'custom'>> = [
  'full-conversation',
  'with-diffs',
  'review-comments-only',
  'commit-log',
];

const presetOptions: Readonly<Record<Exclude<ExportPreset, 'custom'>, ExportOptions>> = {
  'full-conversation': {
    includeIssueComments: true,
    includeReviewComments: true,
    includeReviews: true,
    includeCommits: false,
    includeFileDiffs: false,
    includeCommitDiffs: false,
    smartDiffMode: false,
    timelineMode: true,
    ignoreResolvedComments: false,
  },
  'with-diffs': {
    includeIssueComments: true,
    includeReviewComments: true,
    includeReviews: true,
    includeCommits: true,
    includeFileDiffs: true,
    includeCommitDiffs: true,
    smartDiffMode: true,
    timelineMode: true,
    ignoreResolvedComments: false,
  },
  'review-comments-only': {
    includeIssueComments: false,
    includeReviewComments: true,
    includeReviews: false,
    includeCommits: false,
    includeFileDiffs: false,
    includeCommitDiffs: false,
    smartDiffMode: false,
    timelineMode: false,
    ignoreResolvedComments: false,
  },
  'commit-log': {
    includeIssueComments: false,
    includeReviewComments: false,
    includeReviews: false,
    includeCommits: true,
    includeFileDiffs: false,
    includeCommitDiffs: true,
    smartDiffMode: false,
    timelineMode: false,
    ignoreResolvedComments: false,
  },
};

const defaultCommonSettings: CommonSettings = {
  theme: 'system',
  notifications: true,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readTheme(value: unknown, fallback: CommonSettings['theme']): CommonSettings['theme'] {
  return value === 'light' || value === 'dark' || value === 'system' ? value : fallback;
}

function cloneExportOptions(options: ExportOptions): ExportOptions {
  return { ...options };
}

function isExportPreset(value: unknown): value is ExportPreset {
  return (
    value === 'full-conversation' ||
    value === 'with-diffs' ||
    value === 'review-comments-only' ||
    value === 'commit-log' ||
    value === 'custom'
  );
}

function validateExportOptions(settings: Partial<ExportOptions>): settings is ExportOptions {
  return exportOptionKeys.every((key) => typeof settings[key] === 'boolean');
}

function toPartialExportOptions(value: unknown): Partial<ExportOptions> {
  const record = asRecord(value);
  if (!record) {
    return {};
  }

  const partial: Partial<MutableExportOptions> = {};
  exportOptionKeys.forEach((key) => {
    if (typeof record[key] === 'boolean') {
      partial[key] = record[key] as boolean;
    }
  });

  return partial as Partial<ExportOptions>;
}

function optionsEqual(left: ExportOptions, right: ExportOptions): boolean {
  return exportOptionKeys.every((key) => left[key] === right[key]);
}

export function createDefaultCustomOptions(): ExportOptions {
  return cloneExportOptions(presetOptions['full-conversation']);
}

export function inferPresetFromOptions(options: ExportOptions): ExportPreset {
  for (const preset of BUILTIN_EXPORT_PRESETS) {
    if (optionsEqual(options, presetOptions[preset])) {
      return preset;
    }
  }
  return 'custom';
}

export function resolvePreset(preset: ExportPreset, customOptions?: Partial<ExportOptions>): ExportOptions {
  if (preset !== 'custom') {
    return cloneExportOptions(presetOptions[preset]);
  }

  return {
    ...createDefaultCustomOptions(),
    ...toPartialExportOptions(customOptions),
  };
}

function hasLegacyPRShape(value: Record<string, unknown>): boolean {
  return (
    'historicalMode' in value ||
    'includeFileDiff' in value ||
    'includeCommit' in value ||
    'smartDiffMode' in value ||
    'onlyReviewComments' in value ||
    'ignoreResolvedComments' in value
  );
}

export function migrateLegacyPRToPresetSettings(legacyPr: LegacyPRSettings, fallback?: PRSettings): PRSettings {
  const defaultSettings = fallback ?? {
    enabled: true,
    defaultPreset: 'full-conversation',
    customOptions: createDefaultCustomOptions(),
  };

  const onlyReviewComments = readBoolean(legacyPr.onlyReviewComments, false);
  const includeCommit = readBoolean(legacyPr.includeCommit, false);
  const includeFileDiff = readBoolean(legacyPr.includeFileDiff, false);
  const historicalMode = readBoolean(legacyPr.historicalMode, true);

  const mappedOptions: ExportOptions = {
    includeIssueComments: !onlyReviewComments,
    includeReviewComments: true,
    includeReviews: !onlyReviewComments,
    includeCommits: includeCommit && !onlyReviewComments,
    includeFileDiffs: includeFileDiff && !onlyReviewComments,
    includeCommitDiffs: includeCommit && !onlyReviewComments,
    smartDiffMode: readBoolean(legacyPr.smartDiffMode, false) && includeCommit && !onlyReviewComments,
    timelineMode: onlyReviewComments ? false : historicalMode,
    ignoreResolvedComments: readBoolean(legacyPr.ignoreResolvedComments, false),
  };

  return {
    enabled: readBoolean(legacyPr.enabled, defaultSettings.enabled),
    defaultPreset: inferPresetFromOptions(mappedOptions),
    customOptions: mappedOptions,
  };
}

export function migrateStoredSettings(stored: unknown): Settings | null {
  const storedRecord = asRecord(stored);
  if (!storedRecord) {
    return null;
  }

  const defaults = createDefaultSettings();
  const storedCommon = asRecord(storedRecord.commonSettings);
  const storedIssue = asRecord(storedRecord.issue);
  const storedPr = asRecord(storedRecord.pr);

  const commonSettings: CommonSettings = {
    theme: readTheme(storedCommon?.theme, defaults.commonSettings.theme),
    notifications: readBoolean(storedCommon?.notifications, defaults.commonSettings.notifications),
  };

  const issue: IssueSettings = {
    enabled: readBoolean(storedIssue?.enabled, defaults.issue.enabled),
    historicalMode: readBoolean(storedIssue?.historicalMode, defaults.issue.historicalMode),
  };

  if (!storedPr) {
    return {
      commonSettings,
      issue,
      pr: defaults.pr,
    };
  }

  if (hasLegacyPRShape(storedPr)) {
    return {
      commonSettings,
      issue,
      pr: migrateLegacyPRToPresetSettings(storedPr as LegacyPRSettings, defaults.pr),
    };
  }

  const partialCustomOptions = toPartialExportOptions(storedPr.customOptions);
  const customOptions = {
    ...createDefaultCustomOptions(),
    ...partialCustomOptions,
  };

  const defaultPreset = isExportPreset(storedPr.defaultPreset)
    ? storedPr.defaultPreset
    : inferPresetFromOptions(customOptions);

  return {
    commonSettings,
    issue,
    pr: {
      enabled: readBoolean(storedPr.enabled, defaults.pr.enabled),
      defaultPreset,
      customOptions,
    },
  };
}

export function createDefaultSettings(): Settings {
  return {
    commonSettings: { ...defaultCommonSettings },
    pr: {
      enabled: true,
      defaultPreset: 'full-conversation',
      customOptions: createDefaultCustomOptions(),
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
    isExportPreset(settings.defaultPreset) &&
    validateExportOptions(settings.customOptions ?? {})
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
