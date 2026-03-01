import type { TargetKind } from './target';

export type PullPreset =
  | 'full-conversation'
  | 'with-diffs'
  | 'review-comments-only'
  | 'commit-log'
  | 'custom';

export interface PullExportOptions {
  includeIssueComments: boolean;
  includeReviewComments: boolean;
  includeReviews: boolean;
  includeCommits: boolean;
  includeFileDiffs: boolean;
  includeCommitDiffs: boolean;
  smartDiffMode: boolean;
  timelineMode: boolean;
  ignoreResolvedComments: boolean;
}

const pullOptionKeys: ReadonlyArray<keyof PullExportOptions> = [
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

const pullPresetOptions: Readonly<Record<Exclude<PullPreset, 'custom'>, PullExportOptions>> = {
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

export const BUILTIN_PULL_PRESETS: ReadonlyArray<Exclude<PullPreset, 'custom'>> = [
  'full-conversation',
  'with-diffs',
  'review-comments-only',
  'commit-log',
];

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function isPullPreset(value: unknown): value is PullPreset {
  return (
    value === 'full-conversation' ||
    value === 'with-diffs' ||
    value === 'review-comments-only' ||
    value === 'commit-log' ||
    value === 'custom'
  );
}

function sanitizePullOptionOverrides(value: Partial<PullExportOptions> | undefined): Partial<PullExportOptions> {
  const sanitized: Partial<PullExportOptions> = {};
  if (!value) {
    return sanitized;
  }

  pullOptionKeys.forEach((key) => {
    const parsed = readBoolean(value[key]);
    if (typeof parsed === 'boolean') {
      sanitized[key] = parsed;
    }
  });

  return sanitized;
}

export function clonePullOptions(options: PullExportOptions): PullExportOptions {
  return {
    includeIssueComments: options.includeIssueComments,
    includeReviewComments: options.includeReviewComments,
    includeReviews: options.includeReviews,
    includeCommits: options.includeCommits,
    includeFileDiffs: options.includeFileDiffs,
    includeCommitDiffs: options.includeCommitDiffs,
    smartDiffMode: options.smartDiffMode,
    timelineMode: options.timelineMode,
    ignoreResolvedComments: options.ignoreResolvedComments,
  };
}

export function createDefaultPullOptions(): PullExportOptions {
  return clonePullOptions(pullPresetOptions['full-conversation']);
}

export function resolvePullPreset(
  preset: PullPreset,
  optionsOverride?: Partial<PullExportOptions>,
): PullExportOptions {
  if (preset !== 'custom') {
    return clonePullOptions(pullPresetOptions[preset]);
  }

  return {
    ...createDefaultPullOptions(),
    ...sanitizePullOptionOverrides(optionsOverride),
  };
}

function pullOptionsEqual(left: PullExportOptions, right: PullExportOptions): boolean {
  return pullOptionKeys.every((key) => left[key] === right[key]);
}

export function inferPullPreset(options: PullExportOptions): PullPreset {
  for (const preset of BUILTIN_PULL_PRESETS) {
    if (pullOptionsEqual(options, pullPresetOptions[preset])) {
      return preset;
    }
  }
  return 'custom';
}

export type ActionsRunPreset =
  | 'only-summary'
  | 'export-all'
  | 'failure-job'
  | 'failure-step';

export interface ActionsRunExportOptions {
  includeSummary: boolean;
  includeJobs: boolean;
  includeSteps: boolean;
  onlyFailureJobs: boolean;
  onlyFailureSteps: boolean;
}

const actionsRunOptionKeys: ReadonlyArray<keyof ActionsRunExportOptions> = [
  'includeSummary',
  'includeJobs',
  'includeSteps',
  'onlyFailureJobs',
  'onlyFailureSteps',
];

const actionsRunPresetOptions: Readonly<Record<ActionsRunPreset, ActionsRunExportOptions>> = {
  'only-summary': {
    includeSummary: true,
    includeJobs: false,
    includeSteps: false,
    onlyFailureJobs: false,
    onlyFailureSteps: false,
  },
  'export-all': {
    includeSummary: true,
    includeJobs: true,
    includeSteps: true,
    onlyFailureJobs: false,
    onlyFailureSteps: false,
  },
  'failure-job': {
    includeSummary: true,
    includeJobs: true,
    includeSteps: true,
    onlyFailureJobs: true,
    onlyFailureSteps: false,
  },
  'failure-step': {
    includeSummary: true,
    includeJobs: true,
    includeSteps: true,
    onlyFailureJobs: true,
    onlyFailureSteps: true,
  },
};

export function isActionsRunPreset(value: unknown): value is ActionsRunPreset {
  return value === 'only-summary' || value === 'export-all' || value === 'failure-job' || value === 'failure-step';
}

function sanitizeActionsRunOptionOverrides(
  value: Partial<ActionsRunExportOptions> | undefined,
): Partial<ActionsRunExportOptions> {
  const sanitized: Partial<ActionsRunExportOptions> = {};
  if (!value) {
    return sanitized;
  }

  actionsRunOptionKeys.forEach((key) => {
    const parsed = readBoolean(value[key]);
    if (typeof parsed === 'boolean') {
      sanitized[key] = parsed;
    }
  });

  return sanitized;
}

export function cloneActionsRunOptions(options: ActionsRunExportOptions): ActionsRunExportOptions {
  return {
    includeSummary: options.includeSummary,
    includeJobs: options.includeJobs,
    includeSteps: options.includeSteps,
    onlyFailureJobs: options.onlyFailureJobs,
    onlyFailureSteps: options.onlyFailureSteps,
  };
}

export function createDefaultActionsRunOptions(): ActionsRunExportOptions {
  return cloneActionsRunOptions(actionsRunPresetOptions['export-all']);
}

export function resolveActionsRunPreset(
  preset: ActionsRunPreset,
  optionsOverride?: Partial<ActionsRunExportOptions>,
): ActionsRunExportOptions {
  return {
    ...cloneActionsRunOptions(actionsRunPresetOptions[preset]),
    ...sanitizeActionsRunOptionOverrides(optionsOverride),
  };
}

export interface PullProfile {
  kind: 'pull';
  preset: PullPreset;
  options: PullExportOptions;
}

export interface IssueProfile {
  kind: 'issue';
  timelineMode: boolean;
}

export interface ActionsRunProfile {
  kind: 'actionsRun';
  preset: ActionsRunPreset;
  options: ActionsRunExportOptions;
}

export type ExportProfile = PullProfile | IssueProfile | ActionsRunProfile;

export interface ProfileByKind {
  pull: PullProfile;
  issue: IssueProfile;
  actionsRun: ActionsRunProfile;
}

export function createDefaultPullProfile(): PullProfile {
  const preset: PullPreset = 'full-conversation';
  return {
    kind: 'pull',
    preset,
    options: resolvePullPreset(preset),
  };
}

export function createDefaultIssueProfile(): IssueProfile {
  return {
    kind: 'issue',
    timelineMode: true,
  };
}

export function createDefaultActionsRunProfile(): ActionsRunProfile {
  const preset: ActionsRunPreset = 'export-all';
  return {
    kind: 'actionsRun',
    preset,
    options: resolveActionsRunPreset(preset),
  };
}

export function createDefaultProfiles(): ProfileByKind {
  return {
    pull: createDefaultPullProfile(),
    issue: createDefaultIssueProfile(),
    actionsRun: createDefaultActionsRunProfile(),
  };
}

export function cloneExportProfile(profile: ExportProfile): ExportProfile {
  if (profile.kind === 'pull') {
    return {
      kind: 'pull',
      preset: profile.preset,
      options: clonePullOptions(profile.options),
    };
  }

  if (profile.kind === 'issue') {
    return {
      kind: 'issue',
      timelineMode: profile.timelineMode,
    };
  }

  return {
    kind: 'actionsRun',
    preset: profile.preset,
    options: cloneActionsRunOptions(profile.options),
  };
}

export function isExportProfileForKind(
  profile: ExportProfile | null | undefined,
  kind: TargetKind,
): profile is ExportProfile {
  return Boolean(profile && profile.kind === kind);
}
