import {
  enforceActionsRunInvariants,
  enforcePullInvariants,
  isActionsRunPreset,
  isPullPreset,
  resolveActionsRunPreset,
  resolvePullPreset,
  targetRepoKey,
  type ExportProfile,
  type RememberScope,
  type Target,
} from '@core/model';
import { LAST_PROFILE_STORAGE_KEY } from '@ext/bridge/keys';
import { storageGet, storageSet } from '@ext/bridge/storage';

interface LastProfileEntry {
  pull?: ExportProfile;
  issue?: ExportProfile;
  actionsRun?: ExportProfile;
}

interface LastProfileStateV1 {
  global: LastProfileEntry;
  repo: Record<string, LastProfileEntry>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parsePullProfile(value: unknown): ExportProfile | null {
  if (!isRecord(value) || value.kind !== 'pull') {
    return null;
  }

  const preset = isPullPreset(value.preset) ? value.preset : null;
  if (!preset) {
    return null;
  }

  const options = isRecord(value.options) ? value.options : undefined;
  return {
    kind: 'pull',
    preset,
    options: enforcePullInvariants(resolvePullPreset(preset, options)),
  };
}

function parseIssueProfile(value: unknown): ExportProfile | null {
  if (!isRecord(value) || value.kind !== 'issue') {
    return null;
  }

  if (typeof value.timelineMode !== 'boolean') {
    return null;
  }

  return {
    kind: 'issue',
    timelineMode: value.timelineMode,
  };
}

function parseActionsRunProfile(value: unknown): ExportProfile | null {
  if (!isRecord(value) || value.kind !== 'actionsRun') {
    return null;
  }

  const preset = isActionsRunPreset(value.preset) ? value.preset : null;
  if (!preset) {
    return null;
  }

  const options = isRecord(value.options) ? value.options : undefined;
  return {
    kind: 'actionsRun',
    preset,
    options: enforceActionsRunInvariants(resolveActionsRunPreset(preset, options)),
  };
}

function parseProfile(value: unknown): ExportProfile | null {
  const pull = parsePullProfile(value);
  if (pull) {
    return pull;
  }

  const issue = parseIssueProfile(value);
  if (issue) {
    return issue;
  }

  const actions = parseActionsRunProfile(value);
  if (actions) {
    return actions;
  }

  return null;
}

function parseEntry(value: unknown): LastProfileEntry {
  if (!isRecord(value)) {
    return {};
  }

  return {
    pull: parseProfile(value.pull) ?? undefined,
    issue: parseProfile(value.issue) ?? undefined,
    actionsRun: parseProfile(value.actionsRun) ?? undefined,
  };
}

function normalizeState(value: unknown): LastProfileStateV1 {
  if (!isRecord(value)) {
    return {
      global: {},
      repo: {},
    };
  }

  const repoRaw = isRecord(value.repo) ? value.repo : {};
  const repo: Record<string, LastProfileEntry> = {};

  Object.entries(repoRaw).forEach(([repoKey, entry]) => {
    repo[repoKey] = parseEntry(entry);
  });

  return {
    global: parseEntry(value.global),
    repo,
  };
}

function profileFromEntry(entry: LastProfileEntry, target: Target): ExportProfile | null {
  if (target.kind === 'pull' && entry.pull?.kind === 'pull') {
    return entry.pull;
  }

  if (target.kind === 'issue' && entry.issue?.kind === 'issue') {
    return entry.issue;
  }

  if (target.kind === 'actionsRun' && entry.actionsRun?.kind === 'actionsRun') {
    return entry.actionsRun;
  }

  return null;
}

function setEntryProfile(entry: LastProfileEntry, profile: ExportProfile): LastProfileEntry {
  if (profile.kind === 'pull') {
    return {
      ...entry,
      pull: profile,
    };
  }

  if (profile.kind === 'issue') {
    return {
      ...entry,
      issue: profile,
    };
  }

  return {
    ...entry,
    actionsRun: profile,
  };
}

export class LastProfileStore {
  private async readState(): Promise<LastProfileStateV1> {
    const stored = await storageGet<unknown>(LAST_PROFILE_STORAGE_KEY);
    return normalizeState(stored);
  }

  private async writeState(state: LastProfileStateV1): Promise<void> {
    await storageSet(LAST_PROFILE_STORAGE_KEY, state);
  }

  async get(scope: RememberScope, target: Target): Promise<ExportProfile | null> {
    const state = await this.readState();

    if (scope === 'global') {
      return profileFromEntry(state.global, target);
    }

    const repoEntry = state.repo[targetRepoKey(target)] ?? {};
    return profileFromEntry(repoEntry, target);
  }

  async set(scope: RememberScope, target: Target, profile: ExportProfile): Promise<void> {
    const state = await this.readState();

    if (scope === 'global') {
      state.global = setEntryProfile(state.global, profile);
      await this.writeState(state);
      return;
    }

    const repoKey = targetRepoKey(target);
    const existing = state.repo[repoKey] ?? {};
    state.repo[repoKey] = setEntryProfile(existing, profile);
    await this.writeState(state);
  }
}
