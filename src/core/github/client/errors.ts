export interface RateLimitMetadata {
  remaining: number | null;
  reset: number | null;
  retryAfter: number | null;
}

export class GitHubApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly rateLimit: RateLimitMetadata;

  constructor(params: {
    status: number;
    statusText: string;
    message: string;
    rateLimit: RateLimitMetadata;
  }) {
    super(`GitHub API error: ${params.status} ${params.statusText}${params.message ? ` - ${params.message}` : ''}`);
    this.name = 'GitHubApiError';
    this.status = params.status;
    this.statusText = params.statusText;
    this.rateLimit = params.rateLimit;
  }
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }

  if (error instanceof Error) {
    return error.name === 'AbortError';
  }

  return false;
}
