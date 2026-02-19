export type PageKind = 'issue' | 'pull';

export type MarkerType = 'issue-comment' | 'review-comment' | 'review';

export interface Marker {
  type: MarkerType;
  id: number;
}

export interface PageRef {
  owner: string;
  repo: string;
  number: number;
  kind: PageKind;
}

export interface MarkerRange {
  start?: Marker | null;
  end?: Marker | null;
}

export interface GenerateMarkdownPayload {
  page: PageRef;
  range?: MarkerRange;
  historicalMode?: boolean;
  includeFiles?: boolean;
  includeCommit?: boolean;
  smartDiffMode?: boolean;
  onlyReviewComments?: boolean;
  ignoreResolvedComments?: boolean;
}

export interface GenerateMarkdownResponse {
  ok: true;
  markdown: string;
  warning?: string;
}

export interface GenerateMarkdownError {
  ok: false;
  error: string;
  code?: string;
}

export type GenerateMarkdownResult = GenerateMarkdownResponse | GenerateMarkdownError;

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
