import { describe, expect, it } from 'vitest';
import { GitHubApiError } from '@core/github/client';
import { mapGitHubError } from './mapGitHubError';

describe('mapGitHubError', () => {
  it('maps rate limit errors to rateLimited', () => {
    const mapped = mapGitHubError(
      new GitHubApiError({
        status: 429,
        statusText: 'Too Many Requests',
        message: 'rate limited',
        rateLimit: {
          remaining: 0,
          reset: null,
          retryAfter: 60,
        },
      }),
    );

    expect(mapped.code).toBe('rateLimited');
    expect(mapped.message).toContain('Retry after 60 second(s).');
  });

  it('maps unauthorized errors to unauthorized', () => {
    const mapped = mapGitHubError(
      new GitHubApiError({
        status: 401,
        statusText: 'Unauthorized',
        message: 'bad credentials',
        rateLimit: {
          remaining: null,
          reset: null,
          retryAfter: null,
        },
      }),
    );

    expect(mapped).toEqual({
      code: 'unauthorized',
      message: 'GitHub token is invalid or missing required permissions.',
    });
  });

  it('maps not found errors to notFound', () => {
    const mapped = mapGitHubError(
      new GitHubApiError({
        status: 404,
        statusText: 'Not Found',
        message: 'missing',
        rateLimit: {
          remaining: null,
          reset: null,
          retryAfter: null,
        },
      }),
    );

    expect(mapped).toEqual({
      code: 'notFound',
      message: 'Requested GitHub resource was not found.',
    });
  });

  it('maps abort errors to aborted', () => {
    const mapped = mapGitHubError(new DOMException('The operation was aborted.', 'AbortError'));

    expect(mapped).toEqual({
      code: 'aborted',
      message: 'Export was canceled.',
    });
  });

  it('maps network type errors to network', () => {
    const mapped = mapGitHubError(new TypeError('fetch failed'));

    expect(mapped).toEqual({
      code: 'network',
      message: 'Network error while contacting GitHub API.',
    });
  });

  it('does not map non-network type errors to network', () => {
    const mapped = mapGitHubError(new TypeError("Cannot read properties of undefined (reading 'foo')"));

    expect(mapped).toEqual({
      code: 'unknown',
      message: "Cannot read properties of undefined (reading 'foo')",
    });
  });
});
