import { enforceActionsRunInvariants, enforcePullInvariants } from './invariants';
import {
  isActionsRunPreset,
  isPullPreset,
  resolveActionsRunPreset,
  resolvePullPreset,
  type ActionsRunExportOptions,
  type ActionsRunPreset,
  type PullExportOptions,
  type PullPreset,
} from './profile';
import { cloneSettingsV1, type SettingsV1 } from './settings';

export interface PullDefaultsPatchV1 {
  preset?: PullPreset;
  options?: Partial<PullExportOptions>;
}

export interface IssueDefaultsPatchV1 {
  timelineMode?: boolean;
}

export interface ActionsRunDefaultsPatchV1 {
  preset?: ActionsRunPreset;
  options?: Partial<ActionsRunExportOptions>;
}

export interface SettingsPatchV1 {
  behavior?: {
    rememberLastUsed?: boolean;
    rememberScope?: 'global' | 'repo';
  };
  enabled?: {
    pull?: boolean;
    issue?: boolean;
    actionsRun?: boolean;
  };
  defaults?: {
    pull?: PullDefaultsPatchV1;
    issue?: IssueDefaultsPatchV1;
    actionsRun?: ActionsRunDefaultsPatchV1;
  };
}

export function applySettingsPatchV1(current: SettingsV1, patch: SettingsPatchV1): SettingsV1 {
  const next = cloneSettingsV1(current);

  if (patch.behavior) {
    if (typeof patch.behavior.rememberLastUsed === 'boolean') {
      next.behavior.rememberLastUsed = patch.behavior.rememberLastUsed;
    }
    if (patch.behavior.rememberScope === 'global' || patch.behavior.rememberScope === 'repo') {
      next.behavior.rememberScope = patch.behavior.rememberScope;
    }
  }

  if (patch.enabled) {
    if (typeof patch.enabled.pull === 'boolean') {
      next.enabled.pull = patch.enabled.pull;
    }
    if (typeof patch.enabled.issue === 'boolean') {
      next.enabled.issue = patch.enabled.issue;
    }
    if (typeof patch.enabled.actionsRun === 'boolean') {
      next.enabled.actionsRun = patch.enabled.actionsRun;
    }
  }

  if (patch.defaults?.pull) {
    const pullPatch = patch.defaults.pull;
    const preset = isPullPreset(pullPatch.preset) ? pullPatch.preset : next.defaults.pull.preset;
    const optionsSeed = preset === 'custom'
      ? { ...next.defaults.pull.options, ...(pullPatch.options ?? {}) }
      : pullPatch.options;

    next.defaults.pull = {
      kind: 'pull',
      preset,
      options: enforcePullInvariants(resolvePullPreset(preset, optionsSeed)),
    };
  }

  if (patch.defaults?.issue) {
    const issuePatch = patch.defaults.issue;
    if (typeof issuePatch.timelineMode === 'boolean') {
      next.defaults.issue = {
        kind: 'issue',
        timelineMode: issuePatch.timelineMode,
      };
    }
  }

  if (patch.defaults?.actionsRun) {
    const actionsPatch = patch.defaults.actionsRun;
    const preset = isActionsRunPreset(actionsPatch.preset)
      ? actionsPatch.preset
      : next.defaults.actionsRun.preset;

    const optionsSeed = {
      ...next.defaults.actionsRun.options,
      ...(actionsPatch.options ?? {}),
    };

    next.defaults.actionsRun = {
      kind: 'actionsRun',
      preset,
      options: enforceActionsRunInvariants(resolveActionsRunPreset(preset, optionsSeed)),
    };
  }

  return next;
}
