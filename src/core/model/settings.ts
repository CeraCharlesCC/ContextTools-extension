import {
  cloneActionsRunOptions,
  cloneExportProfile,
  clonePullOptions,
  createDefaultProfiles,
  isActionsRunPreset,
  isPullPreset,
  resolveActionsRunPreset,
  resolvePullPreset,
  type ActionsRunProfile,
  type ExportProfile,
  type IssueProfile,
  type ProfileByKind,
  type PullProfile,
} from './profile';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readRememberScope(value: unknown, fallback: RememberScope): RememberScope {
  return value === 'global' || value === 'repo' ? value : fallback;
}

export type RememberScope = 'global' | 'repo';

export interface SettingsBehaviorV1 {
  rememberLastUsed: boolean;
  rememberScope: RememberScope;
}

export interface SettingsEnabledV1 {
  pull: boolean;
  issue: boolean;
  actionsRun: boolean;
}

export type SettingsDefaultsV1 = ProfileByKind;

export interface SettingsV1 {
  version: 1;
  behavior: SettingsBehaviorV1;
  enabled: SettingsEnabledV1;
  defaults: SettingsDefaultsV1;
}

function coercePullProfile(value: unknown, fallback: PullProfile): PullProfile {
  if (!isRecord(value)) {
    return {
      kind: 'pull',
      preset: fallback.preset,
      options: clonePullOptions(fallback.options),
    };
  }

  const preset = isPullPreset(value.preset) ? value.preset : fallback.preset;
  const optionsSource = isRecord(value.options) ? (value.options as Partial<PullProfile['options']>) : fallback.options;

  return {
    kind: 'pull',
    preset,
    options: resolvePullPreset(preset, optionsSource),
  };
}

function coerceIssueProfile(value: unknown, fallback: IssueProfile): IssueProfile {
  if (!isRecord(value)) {
    return {
      kind: 'issue',
      timelineMode: fallback.timelineMode,
    };
  }

  return {
    kind: 'issue',
    timelineMode: readBoolean(value.timelineMode, fallback.timelineMode),
  };
}

function coerceActionsRunProfile(value: unknown, fallback: ActionsRunProfile): ActionsRunProfile {
  if (!isRecord(value)) {
    return {
      kind: 'actionsRun',
      preset: fallback.preset,
      options: cloneActionsRunOptions(fallback.options),
    };
  }

  const preset = isActionsRunPreset(value.preset) ? value.preset : fallback.preset;
  const optionsSource = isRecord(value.options)
    ? (value.options as Partial<ActionsRunProfile['options']>)
    : fallback.options;

  return {
    kind: 'actionsRun',
    preset,
    options: resolveActionsRunPreset(preset, optionsSource),
  };
}

export function createDefaultSettingsV1(): SettingsV1 {
  return {
    version: 1,
    behavior: {
      rememberLastUsed: true,
      rememberScope: 'global',
    },
    enabled: {
      pull: true,
      issue: true,
      actionsRun: true,
    },
    defaults: createDefaultProfiles(),
  };
}

export function cloneSettingsV1(settings: SettingsV1): SettingsV1 {
  return {
    version: 1,
    behavior: {
      rememberLastUsed: settings.behavior.rememberLastUsed,
      rememberScope: settings.behavior.rememberScope,
    },
    enabled: {
      pull: settings.enabled.pull,
      issue: settings.enabled.issue,
      actionsRun: settings.enabled.actionsRun,
    },
    defaults: {
      pull: cloneExportProfile(settings.defaults.pull) as PullProfile,
      issue: cloneExportProfile(settings.defaults.issue) as IssueProfile,
      actionsRun: cloneExportProfile(settings.defaults.actionsRun) as ActionsRunProfile,
    },
  };
}

export function coerceSettingsV1(value: unknown): SettingsV1 {
  const defaults = createDefaultSettingsV1();
  if (!isRecord(value)) {
    return defaults;
  }

  const behavior = isRecord(value.behavior) ? value.behavior : {};
  const enabled = isRecord(value.enabled) ? value.enabled : {};
  const profileDefaults = isRecord(value.defaults) ? value.defaults : {};

  return {
    version: 1,
    behavior: {
      rememberLastUsed: readBoolean(behavior.rememberLastUsed, defaults.behavior.rememberLastUsed),
      rememberScope: readRememberScope(behavior.rememberScope, defaults.behavior.rememberScope),
    },
    enabled: {
      pull: readBoolean(enabled.pull, defaults.enabled.pull),
      issue: readBoolean(enabled.issue, defaults.enabled.issue),
      actionsRun: readBoolean(enabled.actionsRun, defaults.enabled.actionsRun),
    },
    defaults: {
      pull: coercePullProfile(profileDefaults.pull, defaults.defaults.pull),
      issue: coerceIssueProfile(profileDefaults.issue, defaults.defaults.issue),
      actionsRun: coerceActionsRunProfile(profileDefaults.actionsRun, defaults.defaults.actionsRun),
    },
  };
}

export function isSettingsV1(value: unknown): value is SettingsV1 {
  if (!isRecord(value)) {
    return false;
  }

  if (value.version !== 1) {
    return false;
  }

  const behavior = value.behavior;
  const enabled = value.enabled;
  const defaults = value.defaults;

  if (!isRecord(behavior) || !isRecord(enabled) || !isRecord(defaults)) {
    return false;
  }

  if (typeof behavior.rememberLastUsed !== 'boolean') {
    return false;
  }

  if (behavior.rememberScope !== 'global' && behavior.rememberScope !== 'repo') {
    return false;
  }

  if (typeof enabled.pull !== 'boolean' || typeof enabled.issue !== 'boolean' || typeof enabled.actionsRun !== 'boolean') {
    return false;
  }

  const pullProfile = defaults.pull;
  const issueProfile = defaults.issue;
  const actionsProfile = defaults.actionsRun;

  if (!isRecord(pullProfile) || !isRecord(issueProfile) || !isRecord(actionsProfile)) {
    return false;
  }

  if (pullProfile.kind !== 'pull' || !isPullPreset(pullProfile.preset) || !isRecord(pullProfile.options)) {
    return false;
  }

  if (issueProfile.kind !== 'issue' || typeof issueProfile.timelineMode !== 'boolean') {
    return false;
  }

  if (actionsProfile.kind !== 'actionsRun' || !isActionsRunPreset(actionsProfile.preset) || !isRecord(actionsProfile.options)) {
    return false;
  }

  return true;
}

export function profileForTarget(defaults: SettingsDefaultsV1, targetKind: ExportProfile['kind']): ExportProfile {
  if (targetKind === 'pull') {
    return cloneExportProfile(defaults.pull);
  }
  if (targetKind === 'issue') {
    return cloneExportProfile(defaults.issue);
  }
  return cloneExportProfile(defaults.actionsRun);
}
