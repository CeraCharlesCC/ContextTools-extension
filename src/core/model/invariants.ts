import type {
  ActionsRunExportOptions,
  ActionsRunProfile,
  PullExportOptions,
  PullProfile,
} from './profile';

export function enforcePullInvariants(options: PullExportOptions): PullExportOptions {
  const normalized: PullExportOptions = {
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

  if (!normalized.includeCommits) {
    normalized.includeCommitDiffs = false;
  }

  if (!normalized.includeCommitDiffs) {
    normalized.smartDiffMode = false;
  }

  if (!normalized.includeReviewComments) {
    normalized.ignoreResolvedComments = false;
  }

  return normalized;
}

export function enforceActionsRunInvariants(
  options: ActionsRunExportOptions,
): ActionsRunExportOptions {
  const normalized: ActionsRunExportOptions = {
    includeSummary: options.includeSummary,
    includeJobs: options.includeJobs,
    includeSteps: options.includeSteps,
    onlyFailureJobs: options.onlyFailureJobs,
    onlyFailureSteps: options.onlyFailureSteps,
  };

  if (!normalized.includeJobs) {
    normalized.includeSteps = false;
    normalized.onlyFailureJobs = false;
    normalized.onlyFailureSteps = false;
    return normalized;
  }

  if (!normalized.includeSteps) {
    normalized.onlyFailureSteps = false;
  }

  if (!normalized.onlyFailureJobs) {
    normalized.onlyFailureSteps = false;
  }

  return normalized;
}

export function normalizePullProfile(profile: PullProfile): PullProfile {
  return {
    kind: 'pull',
    preset: profile.preset,
    options: enforcePullInvariants(profile.options),
  };
}

export function normalizeActionsRunProfile(profile: ActionsRunProfile): ActionsRunProfile {
  return {
    kind: 'actionsRun',
    preset: profile.preset,
    options: enforceActionsRunInvariants(profile.options),
  };
}
