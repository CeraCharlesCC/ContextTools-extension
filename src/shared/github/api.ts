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

interface PullReviewThreadResolutionQueryData {
  repository?: {
    pullRequest?: {
      reviewThreads?: {
        pageInfo?: {
          hasNextPage?: boolean;
          endCursor?: string | null;
        };
        nodes?: Array<{
          isResolved?: boolean;
          comments?: {
            pageInfo?: {
              hasNextPage?: boolean;
            };
            nodes?: Array<{
              databaseId?: number | null;
            } | null>;
          } | null;
        } | null>;
      } | null;
    } | null;
  } | null;
}

export interface PullReviewThreadResolution {
  commentResolution: Map<number, boolean>;
  incomplete: boolean;
}

export async function getIssue(params: { owner: string; repo: string; number: number; token?: string }) {
  const { owner, repo, number, token } = params;
  return fetchJson(`${API_ROOT}/repos/${owner}/${repo}/issues/${number}`, token);
}

export async function getIssueComments(params: { owner: string; repo: string; number: number; token?: string }) {
  const { owner, repo, number, token } = params;
  const url = `${API_ROOT}/repos/${owner}/${repo}/issues/${number}/comments?per_page=100`;
  return fetchAllPages(url, token);
}

export async function getPullRequest(params: { owner: string; repo: string; number: number; token?: string }) {
  const { owner, repo, number, token } = params;
  return fetchJson(`${API_ROOT}/repos/${owner}/${repo}/pulls/${number}`, token);
}

export async function getPullFiles(params: { owner: string; repo: string; number: number; token?: string }) {
  const { owner, repo, number, token } = params;
  const url = `${API_ROOT}/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`;
  return fetchAllPages(url, token);
}

export async function getPullCommits(params: { owner: string; repo: string; number: number; token?: string }) {
  const { owner, repo, number, token } = params;
  const url = `${API_ROOT}/repos/${owner}/${repo}/pulls/${number}/commits?per_page=100`;
  return fetchAllPages(url, token);
}

export async function getCommit(params: { owner: string; repo: string; sha: string; token?: string }) {
  const { owner, repo, sha, token } = params;
  return fetchJson(`${API_ROOT}/repos/${owner}/${repo}/commits/${sha}`, token);
}

export async function getPullReviews(params: { owner: string; repo: string; number: number; token?: string }) {
  const { owner, repo, number, token } = params;
  const url = `${API_ROOT}/repos/${owner}/${repo}/pulls/${number}/reviews?per_page=100`;
  return fetchAllPages(url, token);
}

export async function getPullReviewComments(params: { owner: string; repo: string; number: number; token?: string }) {
  const { owner, repo, number, token } = params;
  const url = `${API_ROOT}/repos/${owner}/${repo}/pulls/${number}/comments?per_page=100`;
  return fetchAllPages(url, token);
}

export async function getPullReviewThreadResolution(params: {
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
    const data = await fetchGraphQL<PullReviewThreadResolutionQueryData>(
      REVIEW_THREAD_RESOLUTION_QUERY,
      { owner, repo, number, after },
      token,
    );

    const reviewThreads = data.repository?.pullRequest?.reviewThreads;
    if (!reviewThreads) {
      break;
    }

    reviewThreads.nodes?.forEach((thread) => {
      if (!thread?.comments) return;
      if (thread.comments.pageInfo?.hasNextPage) {
        incomplete = true;
      }

      thread.comments.nodes?.forEach((commentNode) => {
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
