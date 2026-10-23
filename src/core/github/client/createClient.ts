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
import { GitHubApiError, throwIfAborted, type RateLimitMetadata } from './errors';
import type {
  GitHubClient,
  GitHubClientOptions,
  OwnerRepo,
} from './types';

const DEFAULT_API_ROOT = 'https://api.github.com';

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

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

function parseRateLimit(response: Response): RateLimitMetadata {
  const remaining = Number.parseInt(response.headers.get('x-ratelimit-remaining') ?? '', 10);
  const reset = Number.parseInt(response.headers.get('x-ratelimit-reset') ?? '', 10);
  const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);

  return {
    remaining: Number.isFinite(remaining) ? remaining : null,
    reset: Number.isFinite(reset) ? reset : null,
    retryAfter: Number.isFinite(retryAfter) ? retryAfter : null,
  };
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.clone().json()) as { message?: string };
    if (data?.message?.trim()) {
      return data.message;
    }
  } catch {
    // Fall through to text parser.
  }

  try {
    const text = (await response.clone().text()).trim();
    return text;
  } catch {
    return '';
  }
}

async function createApiError(response: Response): Promise<GitHubApiError> {
  const message = await extractErrorMessage(response);

  return new GitHubApiError({
    status: response.status,
    statusText: response.statusText,
    message,
    rateLimit: parseRateLimit(response),
  });
}

function nextLink(linkHeader: string | null, trustedOrigin: string, apiRoot: string): string | null {
  if (!linkHeader) {
    return null;
  }

  const parts = linkHeader.split(',');
  for (const part of parts) {
    const [urlPart, relPart] = part.split(';').map((segment) => segment.trim());
    if (relPart !== 'rel="next"') {
      continue;
    }

    const candidateUrl =
      urlPart.startsWith('<') && urlPart.endsWith('>')
        ? urlPart.slice(1, -1)
        : urlPart;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(candidateUrl, apiRoot);
    } catch {
      throw new Error('GitHub API error: Invalid pagination URL in Link header.');
    }

    if (parsedUrl.origin !== trustedOrigin || parsedUrl.username || parsedUrl.password) {
      throw new Error(`GitHub API error: Refusing pagination URL outside trusted origin (${trustedOrigin}).`);
    }

    return parsedUrl.toString();
  }

  return null;
}

async function fetchJson<T>(params: {
  fetchFn: typeof fetch;
  url: string;
  token?: string;
  signal?: AbortSignal;
}): Promise<T> {
  const response = await params.fetchFn(params.url, {
    headers: buildHeaders(params.token),
    signal: params.signal,
  });

  if (!response.ok) {
    throw await createApiError(response);
  }

  return (await response.json()) as T;
}

async function fetchText(params: {
  fetchFn: typeof fetch;
  url: string;
  token?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const response = await params.fetchFn(params.url, {
    headers: buildHeaders(params.token),
    redirect: 'follow',
    signal: params.signal,
  });

  if (!response.ok) {
    throw await createApiError(response);
  }

  return response.text();
}

async function fetchAllPages<T>(params: {
  fetchFn: typeof fetch;
  url: string;
  token?: string;
  signal?: AbortSignal;
  trustedOrigin: string;
  apiRoot: string;
}): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = params.url;
  const visitedUrls = new Set<string>();

  while (nextUrl) {
    throwIfAborted(params.signal);
    if (visitedUrls.has(nextUrl)) {
      throw new Error('GitHub API error: Repeated pagination URL in Link header.');
    }
    visitedUrls.add(nextUrl);
    const response = await params.fetchFn(nextUrl, {
      headers: buildHeaders(params.token),
      signal: params.signal,
    });

    if (!response.ok) {
      throw await createApiError(response);
    }

    const data = (await response.json()) as T[];
    if (Array.isArray(data)) {
      results.push(...data);
    }

    nextUrl = nextLink(response.headers.get('link'), params.trustedOrigin, params.apiRoot);
  }

  return results;
}

async function fetchAllPagesExtract<T>(params: {
  fetchFn: typeof fetch;
  url: string;
  token?: string;
  signal?: AbortSignal;
  trustedOrigin: string;
  apiRoot: string;
  extract: (json: unknown) => T[];
}): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = params.url;
  const visitedUrls = new Set<string>();

  while (nextUrl) {
    throwIfAborted(params.signal);
    if (visitedUrls.has(nextUrl)) {
      throw new Error('GitHub API error: Repeated pagination URL in Link header.');
    }
    visitedUrls.add(nextUrl);
    const response = await params.fetchFn(nextUrl, {
      headers: buildHeaders(params.token),
      signal: params.signal,
    });

    if (!response.ok) {
      throw await createApiError(response);
    }

    const json = (await response.json()) as unknown;
    const extracted = params.extract(json);
    if (Array.isArray(extracted)) {
      results.push(...extracted);
    }

    nextUrl = nextLink(response.headers.get('link'), params.trustedOrigin, params.apiRoot);
  }

  return results;
}

async function fetchGraphQL<T>(params: {
  fetchFn: typeof fetch;
  apiRoot: string;
  token?: string;
  signal?: AbortSignal;
  query: string;
  variables: Record<string, unknown>;
}): Promise<T> {
  throwIfAborted(params.signal);
  const graphqlRoot = params.apiRoot.replace(/\/api\/v3$/, '/api');
  const response = await params.fetchFn(`${graphqlRoot}/graphql`, {
    method: 'POST',
    headers: {
      ...buildHeaders(params.token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: params.query,
      variables: params.variables,
    }),
    signal: params.signal,
  });

  let body: GraphQLResponse<T> | undefined;
  try {
    body = (await response.clone().json()) as GraphQLResponse<T>;
  } catch {
    // Surface fallback HTTP error below.
  }
  throwIfAborted(params.signal);

  if (!response.ok) {
    const messages = body?.errors?.map((error) => error.message).filter(Boolean);
    const message = messages?.length ? messages.join('; ') : '';
    throw new GitHubApiError({
      status: response.status,
      statusText: response.statusText,
      message,
      rateLimit: parseRateLimit(response),
    });
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

async function getPullReviewThreadResolutionFromGraphQL(params: {
  fetchFn: typeof fetch;
  apiRoot: string;
  owner: string;
  repo: string;
  number: number;
  token?: string;
  signal?: AbortSignal;
}): Promise<PullReviewThreadResolution> {
  const commentResolution = new Map<number, boolean>();
  let incomplete = false;
  let after: string | null = null;
  const visitedCursors = new Set<string>();

  for (;;) {
    const data: PullReviewThreadResolutionQueryData = await fetchGraphQL<PullReviewThreadResolutionQueryData>({
      fetchFn: params.fetchFn,
      apiRoot: params.apiRoot,
      token: params.token,
      signal: params.signal,
      query: REVIEW_THREAD_RESOLUTION_QUERY,
      variables: {
        owner: params.owner,
        repo: params.repo,
        number: params.number,
        after,
      },
    });

    const reviewThreads: PullReviewThreadGraphQLConnection | null | undefined =
      data.repository?.pullRequest?.reviewThreads;
    if (!reviewThreads) {
      break;
    }

    reviewThreads.nodes?.forEach((thread: PullReviewThreadGraphQLThreadNode | null) => {
      if (!thread?.comments) {
        return;
      }

      if (thread.comments.pageInfo?.hasNextPage) {
        incomplete = true;
      }

      thread.comments.nodes?.forEach((node: PullReviewThreadGraphQLCommentNode | null) => {
        const commentId = node?.databaseId;
        if (typeof commentId === 'number') {
          commentResolution.set(commentId, thread.isResolved === true);
        }
      });
    });

    if (!reviewThreads.pageInfo?.hasNextPage) {
      break;
    }

    const nextCursor = reviewThreads.pageInfo.endCursor;
    if (!nextCursor || visitedCursors.has(nextCursor)) {
      throw new Error('GitHub API error: Missing or repeated review thread pagination cursor.');
    }
    visitedCursors.add(nextCursor);
    after = nextCursor;
  }

  return {
    commentResolution,
    incomplete,
  };
}

function validateTarget<T extends OwnerRepo>(params: T): T {
  if (!/^[a-z\d-]+$/i.test(params.owner)
    || !/^[a-z\d_.-]+$/i.test(params.repo)
    || params.repo === '.' || params.repo === '..') {
    throw new Error('Invalid GitHub repository owner or name.');
  }
  return params;
}

export function createGitHubClient(options: GitHubClientOptions = {}): GitHubClient {
  const fetchImpl = options.fetchFn ?? globalThis.fetch;
  const fetchFn = ((...args: Parameters<typeof fetch>) => fetchImpl.call(globalThis, ...args)) as typeof fetch;
  const token = options.token;
  const apiRoot = (options.apiRoot ?? DEFAULT_API_ROOT).replace(/\/+$/, '');
  const trustedOrigin = new URL(apiRoot).origin;

  return {
    async getIssue(rawParams) {
      const params = validateTarget(rawParams);
      return fetchJson<GitHubIssue>({
        fetchFn,
        url: `${apiRoot}/repos/${params.owner}/${params.repo}/issues/${params.number}`,
        token,
        signal: params.signal,
      });
    },

    async getIssueComments(rawParams) {
      const params = validateTarget(rawParams);
      return fetchAllPages<GitHubIssueComment>({
        fetchFn,
        url: `${apiRoot}/repos/${params.owner}/${params.repo}/issues/${params.number}/comments?per_page=100`,
        token,
        signal: params.signal,
        trustedOrigin,
        apiRoot,
      });
    },

    async getPullRequest(rawParams) {
      const params = validateTarget(rawParams);
      return fetchJson<GitHubPullRequest>({
        fetchFn,
        url: `${apiRoot}/repos/${params.owner}/${params.repo}/pulls/${params.number}`,
        token,
        signal: params.signal,
      });
    },

    async getPullFiles(rawParams) {
      const params = validateTarget(rawParams);
      return fetchAllPages<GitHubPullFile>({
        fetchFn,
        url: `${apiRoot}/repos/${params.owner}/${params.repo}/pulls/${params.number}/files?per_page=100`,
        token,
        signal: params.signal,
        trustedOrigin,
        apiRoot,
      });
    },

    async getPullCommits(rawParams) {
      const params = validateTarget(rawParams);
      return fetchAllPages<GitHubCommit>({
        fetchFn,
        url: `${apiRoot}/repos/${params.owner}/${params.repo}/pulls/${params.number}/commits?per_page=100`,
        token,
        signal: params.signal,
        trustedOrigin,
        apiRoot,
      });
    },

    async getCommit(rawParams) {
      const params = validateTarget(rawParams);
      if (!params.sha || params.sha === '.' || params.sha === '..') {
        throw new Error('Invalid GitHub commit reference.');
      }
      const pages = await fetchAllPagesExtract<GitHubCommit>({
        fetchFn,
        url: `${apiRoot}/repos/${params.owner}/${params.repo}/commits/${encodeURIComponent(params.sha)}?per_page=100`,
        token,
        signal: params.signal,
        trustedOrigin,
        apiRoot,
        extract: (json) => [json as GitHubCommit],
      });
      return {
        ...pages[0],
        files: pages.flatMap((page) => page.files ?? []),
      };
    },

    async getPullReviews(rawParams) {
      const params = validateTarget(rawParams);
      return fetchAllPages<GitHubPullReview>({
        fetchFn,
        url: `${apiRoot}/repos/${params.owner}/${params.repo}/pulls/${params.number}/reviews?per_page=100`,
        token,
        signal: params.signal,
        trustedOrigin,
        apiRoot,
      });
    },

    async getPullReviewComments(rawParams) {
      const params = validateTarget(rawParams);
      return fetchAllPages<GitHubPullReviewComment>({
        fetchFn,
        url: `${apiRoot}/repos/${params.owner}/${params.repo}/pulls/${params.number}/comments?per_page=100`,
        token,
        signal: params.signal,
        trustedOrigin,
        apiRoot,
      });
    },

    async getPullReviewThreadResolution(rawParams) {
      const params = validateTarget(rawParams);

      return getPullReviewThreadResolutionFromGraphQL({
        fetchFn,
        apiRoot,
        owner: params.owner,
        repo: params.repo,
        number: params.number,
        token,
        signal: params.signal,
      });
    },

    async getActionsRun(rawParams) {
      const params = validateTarget(rawParams);
      return fetchJson<GitHubActionsRun>({
        fetchFn,
        url: `${apiRoot}/repos/${params.owner}/${params.repo}/actions/runs/${params.runId}`,
        token,
        signal: params.signal,
      });
    },

    async getActionsRunJobs(rawParams) {
      const params = validateTarget(rawParams);
      return fetchAllPagesExtract<GitHubActionsJob>({
        fetchFn,
        url: `${apiRoot}/repos/${params.owner}/${params.repo}/actions/runs/${params.runId}/jobs?per_page=100`,
        token,
        signal: params.signal,
        trustedOrigin,
        apiRoot,
        extract: (json) => {
          const record = json as { jobs?: GitHubActionsJob[] } | null;
          return Array.isArray(record?.jobs) ? record.jobs : [];
        },
      });
    },

    async getActionsJobLogs(rawParams) {
      const params = validateTarget(rawParams);
      return fetchText({
        fetchFn,
        url: `${apiRoot}/repos/${params.owner}/${params.repo}/actions/jobs/${params.jobId}/logs`,
        token,
        signal: params.signal,
      });
    },
  };
}
