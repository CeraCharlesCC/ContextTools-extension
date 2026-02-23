import { resolvePreset } from '@domain/entities';
import type { ExportOptions, ExportPreset, PRSettings } from '@domain/entities';
import type { GenerateMarkdownPayload } from '@shared/github';

type MutableExportOptions = {
  -readonly [K in keyof ExportOptions]: ExportOptions[K];
};

export interface PullLastExportState {
  preset: ExportPreset;
  customOptions: Partial<ExportOptions>;
}

export interface IssueLastExportState {
  timelineMode: boolean;
}

export interface LastExportState {
  pull?: PullLastExportState;
  issue?: IssueLastExportState;
}

export interface ResolvedPullExportState {
  preset: ExportPreset;
  options: ExportOptions;
}

export interface PullFetchPlan {
  includeIssueComments: boolean;
  includeReviewComments: boolean;
  includeReviews: boolean;
  includeCommits: boolean;
  includeFileDiffs: boolean;
  includeCommitDiffs: boolean;
  smartDiffMode: boolean;
  timelineMode: boolean;
  ignoreResolvedComments: boolean;
  shouldFetchIssueComments: boolean;
  shouldFetchReviewComments: boolean;
  shouldFetchReviews: boolean;
  shouldFetchCommits: boolean;
  shouldFetchFiles: boolean;
  shouldFetchReviewThreadResolution: boolean;
}

const customOptionKeys: ReadonlyArray<keyof ExportOptions> = [
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readPreset(value: unknown): ExportPreset | undefined {
  return value === 'full-conversation' ||
    value === 'with-diffs' ||
    value === 'review-comments-only' ||
    value === 'commit-log' ||
    value === 'custom'
    ? value
    : undefined;
}

export function sanitizeCustomOptions(value: unknown): Partial<ExportOptions> {
  if (!isRecord(value)) {
    return {};
  }

  const result: Partial<MutableExportOptions> = {};
  customOptionKeys.forEach((key) => {
    const parsed = readBoolean(value[key]);
    if (typeof parsed === 'boolean') {
      result[key] = parsed;
    }
  });

  return result as Partial<ExportOptions>;
}

export function sanitizePullLastExportState(value: unknown): PullLastExportState | null {
  if (!isRecord(value)) {
    return null;
  }

  const preset = readPreset(value.preset);
  if (!preset) {
    return null;
  }

  return {
    preset,
    customOptions: sanitizeCustomOptions(value.customOptions),
  };
}

export function sanitizeIssueLastExportState(value: unknown): IssueLastExportState | null {
  if (!isRecord(value)) {
    return null;
  }

  const timelineMode = readBoolean(value.timelineMode);
  if (typeof timelineMode !== 'boolean') {
    return null;
  }

  return { timelineMode };
}

export function resolvePullExportState(params: {
  payload: GenerateMarkdownPayload;
  defaults: PRSettings;
  lastState?: PullLastExportState;
}): ResolvedPullExportState {
  const { payload, defaults, lastState } = params;

  const preset = payload.preset ?? lastState?.preset ?? defaults.defaultPreset;
  const mergedCustomOptions: Partial<ExportOptions> = {
    ...defaults.customOptions,
    ...(lastState?.customOptions ?? {}),
    ...sanitizeCustomOptions(payload.customOptions),
  };

  return {
    preset,
    options: resolvePreset(preset, mergedCustomOptions),
  };
}

export function resolveIssueTimelineMode(params: {
  payload: GenerateMarkdownPayload;
  issueDefaultTimelineMode: boolean;
  lastState?: IssueLastExportState;
}): boolean {
  const payloadTimelineMode = readBoolean(params.payload.customOptions?.timelineMode);
  if (typeof payloadTimelineMode === 'boolean') {
    return payloadTimelineMode;
  }

  if (typeof params.lastState?.timelineMode === 'boolean') {
    return params.lastState.timelineMode;
  }

  return params.issueDefaultTimelineMode;
}

export function buildPullFetchPlan(options: ExportOptions): PullFetchPlan {
  const includeCommits = options.includeCommits;
  const includeCommitDiffs = includeCommits && options.includeCommitDiffs;
  const smartDiffMode = includeCommitDiffs && options.smartDiffMode;
  const ignoreResolvedComments = options.includeReviewComments && options.ignoreResolvedComments;

  return {
    includeIssueComments: options.includeIssueComments,
    includeReviewComments: options.includeReviewComments,
    includeReviews: options.includeReviews,
    includeCommits,
    includeFileDiffs: options.includeFileDiffs,
    includeCommitDiffs,
    smartDiffMode,
    timelineMode: options.timelineMode,
    ignoreResolvedComments,
    shouldFetchIssueComments: options.includeIssueComments,
    shouldFetchReviewComments: options.includeReviewComments,
    shouldFetchReviews: options.includeReviews,
    shouldFetchCommits: includeCommits,
    shouldFetchFiles: options.includeFileDiffs || (includeCommitDiffs && smartDiffMode),
    shouldFetchReviewThreadResolution: ignoreResolvedComments,
  };
}
