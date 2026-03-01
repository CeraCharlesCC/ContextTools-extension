export interface GitHubUser {
  login?: string;
}

export interface GitHubLabel {
  name?: string;
}

export interface GitHubIssue {
  id: number;
  title: string;
  html_url: string;
  state: string;
  user?: GitHubUser | null;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  labels?: GitHubLabel[] | null;
  assignees?: GitHubUser[] | null;
  milestone?: { title?: string } | null;
  body?: string | null;
}

export interface GitHubIssueComment {
  id: number;
  user?: GitHubUser | null;
  created_at: string;
  body?: string | null;
}

export interface GitHubPullReviewComment {
  id: number;
  user?: GitHubUser | null;
  created_at: string;
  body?: string | null;
  path?: string | null;
  line?: number | null;
  diff_hunk?: string | null;
}

export interface GitHubPullReview {
  id: number;
  user?: GitHubUser | null;
  state?: string | null;
  created_at?: string;
  submitted_at?: string | null;
  body?: string | null;
}

export interface GitHubPullFile {
  filename?: string;
  status?: string;
  additions?: number;
  deletions?: number;
  patch?: string | null;
}

export interface GitHubCommit {
  sha: string;
  author?: GitHubUser | null;
  commit?: {
    message?: string;
    author?: { name?: string; date?: string } | null;
    committer?: { name?: string; date?: string } | null;
  } | null;
  files?: GitHubPullFile[] | null;
}

export interface GitHubPullRequestRef {
  ref?: string;
  repo?: { full_name?: string } | null;
}

export interface GitHubPullRequest {
  id: number;
  title: string;
  html_url: string;
  state: string;
  merged?: boolean;
  user?: GitHubUser | null;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  merged_at?: string | null;
  base?: GitHubPullRequestRef | null;
  head?: GitHubPullRequestRef | null;
  commits?: number;
  changed_files?: number;
  additions?: number;
  deletions?: number;
  labels?: GitHubLabel[] | null;
  body?: string | null;
}

export interface GitHubActionsRun {
  id: number;
  name?: string | null;
  html_url?: string;
  status?: string;
  conclusion?: string | null;
  event?: string;
  head_branch?: string | null;
  head_sha?: string | null;
  run_number?: number;
  run_attempt?: number;
  created_at?: string;
  updated_at?: string;
  actor?: GitHubUser | null;
}

export interface GitHubActionsJobStep {
  number?: number;
  name?: string;
  status?: string;
  conclusion?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  log?: string | null;
}

export interface GitHubActionsJob {
  id: number;
  name?: string;
  html_url?: string;
  status?: string;
  conclusion?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  runner_name?: string | null;
  runner_group_name?: string | null;
  labels?: string[];
  steps?: GitHubActionsJobStep[];
}

export interface PullReviewThreadResolution {
  commentResolution: Map<number, boolean>;
  incomplete: boolean;
}
