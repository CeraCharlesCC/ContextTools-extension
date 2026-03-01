import { enforcePullInvariants } from '@core/model';
import type { PullProfile } from '@core/model';
import type { PullFetchPlan } from './types';

export function buildPullFetchPlan(profile: PullProfile): PullFetchPlan {
  const options = enforcePullInvariants(profile.options);
  const includeCommits = options.includeCommits;
  const includeCommitDiffs = includeCommits && options.includeCommitDiffs;
  const smartDiffMode = includeCommitDiffs && options.smartDiffMode;
  const ignoreResolvedComments = options.includeReviewComments && options.ignoreResolvedComments;

  return {
    kind: 'pull',
    profile,
    options,
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
