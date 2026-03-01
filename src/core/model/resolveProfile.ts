import { enforceActionsRunInvariants, enforcePullInvariants } from './invariants';
import {
  cloneExportProfile,
  isExportProfileForKind,
  resolveActionsRunPreset,
  resolvePullPreset,
  type ActionsRunProfile,
  type ExportProfile,
  type IssueProfile,
  type PullProfile,
} from './profile';
import { type SettingsDefaultsV1 } from './settings';
import type { TargetKind } from './target';

export type ProfileResolutionSource = 'request' | 'last' | 'default';

export interface ResolveEffectiveProfileInput {
  targetKind: TargetKind;
  defaults: SettingsDefaultsV1;
  requestProfile?: ExportProfile | null;
  rememberedProfile?: ExportProfile | null;
}

export interface ResolveEffectiveProfileResult {
  profile: ExportProfile;
  source: ProfileResolutionSource;
}

function normalizePullProfile(profile: PullProfile): PullProfile {
  return {
    kind: 'pull',
    preset: profile.preset,
    options: enforcePullInvariants(resolvePullPreset(profile.preset, profile.options)),
  };
}

function normalizeIssueProfile(profile: IssueProfile): IssueProfile {
  return {
    kind: 'issue',
    timelineMode: profile.timelineMode,
  };
}

function normalizeActionsProfile(profile: ActionsRunProfile): ActionsRunProfile {
  return {
    kind: 'actionsRun',
    preset: profile.preset,
    options: enforceActionsRunInvariants(resolveActionsRunPreset(profile.preset, profile.options)),
  };
}

function normalizeProfile(profile: ExportProfile): ExportProfile {
  if (profile.kind === 'pull') {
    return normalizePullProfile(profile);
  }

  if (profile.kind === 'issue') {
    return normalizeIssueProfile(profile);
  }

  return normalizeActionsProfile(profile);
}

function defaultProfileForKind(defaults: SettingsDefaultsV1, targetKind: TargetKind): ExportProfile {
  if (targetKind === 'pull') {
    return cloneExportProfile(defaults.pull);
  }

  if (targetKind === 'issue') {
    return cloneExportProfile(defaults.issue);
  }

  return cloneExportProfile(defaults.actionsRun);
}

export function resolveEffectiveProfile(
  input: ResolveEffectiveProfileInput,
): ResolveEffectiveProfileResult {
  const { targetKind, defaults, requestProfile, rememberedProfile } = input;

  if (isExportProfileForKind(requestProfile, targetKind)) {
    return {
      profile: normalizeProfile(requestProfile),
      source: 'request',
    };
  }

  if (isExportProfileForKind(rememberedProfile, targetKind)) {
    return {
      profile: normalizeProfile(rememberedProfile),
      source: 'last',
    };
  }

  return {
    profile: normalizeProfile(defaultProfileForKind(defaults, targetKind)),
    source: 'default',
  };
}
