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
} from './types';

const API_ROOT = 'https://api.github.com';

function buildHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function fetchJson<T>(url: string, token?: string): Promise<T> {
  const response = await fetch(url, { headers: buildHeaders(token) });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const errorData = (await response.json()) as { message?: string };
      if (errorData?.message) {
        message = `${message} - ${errorData.message}`;
      }
    } catch {
      // ignore JSON parsing errors
    }
    throw new Error(`GitHub API error: ${message}`);
  }
  return (await response.json()) as T;
}

function nextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const parts = linkHeader.split(',');
  for (const part of parts) {
    const [urlPart, relPart] = part.split(';').map((section) => section.trim());
    if (relPart === 'rel="next"') {
      return urlPart.slice(1, -1);
    }
  }
  return null;
}

async function fetchAllPages<T>(url: string, token?: string): Promise<T[]> {
  let results: T[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const response = await fetch(nextUrl, { headers: buildHeaders(token) });
    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      try {
        const errorData = (await response.json()) as { message?: string };
        if (errorData?.message) {
          message = `${message} - ${errorData.message}`;
        }
      } catch {
        // ignore JSON parsing errors
      }
      throw new Error(`GitHub API error: ${message}`);
    }

    const data = (await response.json()) as T[];
    if (Array.isArray(data)) {
      results = results.concat(data);
    }

    const linkHeader = response.headers.get('link');
    nextUrl = nextLink(linkHeader);
  }

  return results;
}

async function fetchAllPagesExtract<T>(params: {
  url: string;
  token?: string;
  extract: (json: unknown) => T[];
}): Promise<T[]> {
  const { url, token, extract } = params;
  let results: T[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const response = await fetch(nextUrl, { headers: buildHeaders(token) });
    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      try {
        const errorData = (await response.json()) as { message?: string };
        if (errorData?.message) {
          message = `${message} - ${errorData.message}`;
        }
      } catch {
        // ignore JSON parsing errors
      }
      throw new Error(`GitHub API error: ${message}`);
    }

    const json = (await response.json()) as unknown;
    const extracted = extract(json);
    if (Array.isArray(extracted)) {
      results = results.concat(extracted);
    }

    const linkHeader = response.headers.get('link');
    nextUrl = nextLink(linkHeader);
  }

  return results;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

async function fetchGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const response = await fetch(`${API_ROOT}/graphql`, {
    method: 'POST',
    headers: {
      ...buildHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  let body: GraphQLResponse<T> | undefined;
  try {
    body = (await response.json()) as GraphQLResponse<T>;
  } catch {
    // ignore JSON parsing errors and surface HTTP status below
  }

  if (!response.ok) {
    const messages = body?.errors?.map((error) => error.message).filter(Boolean);
    const suffix = messages?.length ? ` - ${messages.join('; ')}` : '';
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}${suffix}`);
  }

  if (body?.errors?.length) {
    const message = body.errors.map((error) => error.message).filter(Boolean).join('; ');
    throw new Error(`GitHub API error: ${message || 'GraphQL query failed.'}`);
  }

  if (!body?.data) {
    throw new Error('GitHub API error: Missing GraphQL response data.');
  }

  return body.data;
}

const REVIEW_THREAD_RESOLUTION_QUERY = `
  query PullReviewThreadResolution($owner: String!, $repo: String!, $number: Int!, $after: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 100, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            isResolved
            comments(first: 100) {
              pageInfo {
                hasNextPage
              }
              nodes {
                databaseId
              }
            }
          }
        }
      }
    }
  }
`;

interface PullReviewThreadGraphQLCommentNode {
  databaseId?: number | null;
}

interface PullReviewThreadGraphQLThreadNode {
  isResolved?: boolean;
  comments?: {
    pageInfo?: {
      hasNextPage?: boolean;
    };
    nodes?: Array<PullReviewThreadGraphQLCommentNode | null>;
  } | null;
}

interface PullReviewThreadGraphQLConnection {
  pageInfo?: {
    hasNextPage?: boolean;
    endCursor?: string | null;
  };
  nodes?: Array<PullReviewThreadGraphQLThreadNode | null>;
}

interface PullReviewThreadResolutionQueryData {
  repository?: {
    pullRequest?: {
      reviewThreads?: PullReviewThreadGraphQLConnection | null;
    } | null;
  } | null;
}

interface PullReviewThreadRESTComment {
  id?: number | null;
  databaseId?: number | null;
  database_id?: number | null;
}

interface PullReviewThreadREST {
  resolved?: boolean | null;
  isResolved?: boolean | null;
  comments?: PullReviewThreadRESTComment[] | null;
}

export interface PullReviewThreadResolution {
  commentResolution: Map<number, boolean>;
  incomplete: boolean;
}

function resolveCommentId(comment: PullReviewThreadRESTComment): number | null {
  if (typeof comment.id === 'number') return comment.id;
  if (typeof comment.databaseId === 'number') return comment.databaseId;
  if (typeof comment.database_id === 'number') return comment.database_id;
  return null;
}

function resolveThreadState(thread: PullReviewThreadREST): boolean | null {
  if (typeof thread.resolved === 'boolean') return thread.resolved;
  if (typeof thread.isResolved === 'boolean') return thread.isResolved;
  return null;
}

async function getPullReviewThreadResolutionFromRest(params: {
  owner: string;
  repo: string;
  number: number;
  token?: string;
}): Promise<PullReviewThreadResolution> {
  const { owner, repo, number, token } = params;
  const url = `${API_ROOT}/repos/${owner}/${repo}/pulls/${number}/threads?per_page=100`;
  const threads = await fetchAllPages<PullReviewThreadREST>(url, token);

  const commentResolution = new Map<number, boolean>();
  let incomplete = false;

  threads.forEach((thread) => {
    const isResolved = resolveThreadState(thread);
    if (isResolved === null) {
      incomplete = true;
      return;
    }

    if (!Array.isArray(thread.comments)) {
      incomplete = true;
      return;
    }

    thread.comments.forEach((comment) => {
      const commentId = resolveCommentId(comment);
      if (commentId === null) {
        incomplete = true;
        return;
      }
      commentResolution.set(commentId, isResolved);
    });
  });

  return { commentResolution, incomplete };
}

async function getPullReviewThreadResolutionFromGraphQL(params: {
  owner: string;
  repo: string;
  number: number;
  token?: string;
}): Promise<PullReviewThreadResolution> {
  const { owner, repo, number, token } = params;
  const commentResolution = new Map<number, boolean>();
  let incomplete = false;
  let after: string | null = null;

  for (;;) {
    const data: PullReviewThreadResolutionQueryData = await fetchGraphQL<PullReviewThreadResolutionQueryData>(
      REVIEW_THREAD_RESOLUTION_QUERY,
      { owner, repo, number, after },
      token,
    );

    const reviewThreads: PullReviewThreadGraphQLConnection | null | undefined =
      data.repository?.pullRequest?.reviewThreads;
    if (!reviewThreads) {
      break;
    }

    reviewThreads.nodes?.forEach((thread: PullReviewThreadGraphQLThreadNode | null) => {
      if (!thread?.comments) return;
      if (thread.comments.pageInfo?.hasNextPage) {
        incomplete = true;
      }

      thread.comments.nodes?.forEach((commentNode: PullReviewThreadGraphQLCommentNode | null) => {
        const commentId = commentNode?.databaseId;
        if (typeof commentId === 'number') {
          commentResolution.set(commentId, thread.isResolved === true);
        }
      });
    });

    if (!reviewThreads.pageInfo?.hasNextPage) {
      break;
    }
    after = reviewThreads.pageInfo.endCursor ?? null;
  }

  return { commentResolution, incomplete };
}

export async function getIssue(params: {
  owner: string;
  repo: string;
  number: number;
  token?: string;
}): Promise<GitHubIssue> {
  const { owner, repo, number, token } = params;
  return fetchJson<GitHubIssue>(`${API_ROOT}/repos/${owner}/${repo}/issues/${number}`, token);
}

export async function getIssueComments(params: {
  owner: string;
  repo: string;
  number: number;
  token?: string;
}): Promise<GitHubIssueComment[]> {
  const { owner, repo, number, token } = params;
  const url = `${API_ROOT}/repos/${owner}/${repo}/issues/${number}/comments?per_page=100`;
  return fetchAllPages<GitHubIssueComment>(url, token);
}

export async function getPullRequest(params: {
  owner: string;
  repo: string;
  number: number;
  token?: string;
}): Promise<GitHubPullRequest> {
  const { owner, repo, number, token } = params;
  return fetchJson<GitHubPullRequest>(`${API_ROOT}/repos/${owner}/${repo}/pulls/${number}`, token);
}

export async function getPullFiles(params: {
  owner: string;
  repo: string;
  number: number;
  token?: string;
}): Promise<GitHubPullFile[]> {
  const { owner, repo, number, token } = params;
  const url = `${API_ROOT}/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`;
  return fetchAllPages<GitHubPullFile>(url, token);
}

export async function getPullCommits(params: {
  owner: string;
  repo: string;
  number: number;
  token?: string;
}): Promise<GitHubCommit[]> {
  const { owner, repo, number, token } = params;
  const url = `${API_ROOT}/repos/${owner}/${repo}/pulls/${number}/commits?per_page=100`;
  return fetchAllPages<GitHubCommit>(url, token);
}

export async function getCommit(params: {
  owner: string;
  repo: string;
  sha: string;
  token?: string;
}): Promise<GitHubCommit> {
  const { owner, repo, sha, token } = params;
  return fetchJson<GitHubCommit>(`${API_ROOT}/repos/${owner}/${repo}/commits/${sha}`, token);
}

export async function getPullReviews(params: {
  owner: string;
  repo: string;
  number: number;
  token?: string;
}): Promise<GitHubPullReview[]> {
  const { owner, repo, number, token } = params;
  const url = `${API_ROOT}/repos/${owner}/${repo}/pulls/${number}/reviews?per_page=100`;
  return fetchAllPages<GitHubPullReview>(url, token);
}

export async function getPullReviewComments(params: {
  owner: string;
  repo: string;
  number: number;
  token?: string;
}): Promise<GitHubPullReviewComment[]> {
  const { owner, repo, number, token } = params;
  const url = `${API_ROOT}/repos/${owner}/${repo}/pulls/${number}/comments?per_page=100`;
  return fetchAllPages<GitHubPullReviewComment>(url, token);
}

export async function getActionsRun(params: {
  owner: string;
  repo: string;
  runId: number;
  token?: string;
}): Promise<GitHubActionsRun> {
  const { owner, repo, runId, token } = params;
  const url = `${API_ROOT}/repos/${owner}/${repo}/actions/runs/${runId}`;
  return fetchJson<GitHubActionsRun>(url, token);
}

export async function getActionsRunJobs(params: {
  owner: string;
  repo: string;
  runId: number;
  token?: string;
}): Promise<GitHubActionsJob[]> {
  const { owner, repo, runId, token } = params;
  const url = `${API_ROOT}/repos/${owner}/${repo}/actions/runs/${runId}/jobs?per_page=100`;

  return fetchAllPagesExtract<GitHubActionsJob>({
    url,
    token,
    extract: (json) => {
      const record = json as { jobs?: GitHubActionsJob[] } | null;
      return Array.isArray(record?.jobs) ? record.jobs : [];
    },
  });
}

export async function getPullReviewThreadResolution(params: {
  owner: string;
  repo: string;
  number: number;
  token?: string;
}): Promise<PullReviewThreadResolution> {
  try {
    return await getPullReviewThreadResolutionFromRest(params);
  } catch (restError) {
    try {
      return await getPullReviewThreadResolutionFromGraphQL(params);
    } catch (graphqlError) {
      const restMessage = restError instanceof Error ? restError.message : String(restError);
      const graphqlMessage = graphqlError instanceof Error ? graphqlError.message : String(graphqlError);
      throw new Error(
        `Failed to load review thread resolution via REST and GraphQL. REST: ${restMessage}. GraphQL: ${graphqlMessage}`,
      );
    }
  }
}
