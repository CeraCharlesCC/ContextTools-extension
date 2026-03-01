import type {
  GitHubActionsJob,
  GitHubActionsRun,
  GitHubCommit,
  GitHubIssue,
  GitHubIssueComment,
  GitHubPullFile,
  GitHubPullRequest,
  GitHubPullReview,
  GitHubPullReviewComment,
  PullReviewThreadResolution,
} from '@core/github/types';

export interface OwnerRepo {
  owner: string;
  repo: string;
}

export interface NumberedTarget extends OwnerRepo {
  number: number;
  signal?: AbortSignal;
}

export interface RunTarget extends OwnerRepo {
  runId: number;
  signal?: AbortSignal;
}

export interface JobTarget extends OwnerRepo {
  jobId: number;
  signal?: AbortSignal;
}

export interface CommitTarget extends OwnerRepo {
  sha: string;
  signal?: AbortSignal;
}

export interface GitHubClient {
  getIssue(params: NumberedTarget): Promise<GitHubIssue>;
  getIssueComments(params: NumberedTarget): Promise<GitHubIssueComment[]>;
  getPullRequest(params: NumberedTarget): Promise<GitHubPullRequest>;
  getPullFiles(params: NumberedTarget): Promise<GitHubPullFile[]>;
  getPullCommits(params: NumberedTarget): Promise<GitHubCommit[]>;
  getCommit(params: CommitTarget): Promise<GitHubCommit>;
  getPullReviews(params: NumberedTarget): Promise<GitHubPullReview[]>;
  getPullReviewComments(params: NumberedTarget): Promise<GitHubPullReviewComment[]>;
  getPullReviewThreadResolution(params: NumberedTarget): Promise<PullReviewThreadResolution>;
  getActionsRun(params: RunTarget): Promise<GitHubActionsRun>;
  getActionsRunJobs(params: RunTarget): Promise<GitHubActionsJob[]>;
  getActionsJobLogs(params: JobTarget): Promise<string>;
}

export interface GitHubClientOptions {
  token?: string;
  fetchFn?: typeof fetch;
  apiRoot?: string;
}
