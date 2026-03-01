import type {
  ActionsRunExportOptions,
  ActionsRunProfile,
  IssueProfile,
  PullExportOptions,
  PullProfile,
} from '@core/model';

export interface PullFetchPlan {
  kind: 'pull';
  profile: PullProfile;
  options: PullExportOptions;
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

export interface IssueFetchPlan {
  kind: 'issue';
  profile: IssueProfile;
  shouldFetchComments: boolean;
  historicalMode: boolean;
}

export interface ActionsFetchPlan {
  kind: 'actionsRun';
  profile: ActionsRunProfile;
  options: ActionsRunExportOptions;
  shouldFetchJobs: boolean;
  shouldFetchLogs: boolean;
  onlyFailureJobs: boolean;
}

export type FetchPlan = PullFetchPlan | IssueFetchPlan | ActionsFetchPlan;
