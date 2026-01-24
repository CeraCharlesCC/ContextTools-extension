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
