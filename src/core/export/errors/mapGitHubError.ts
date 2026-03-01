import type { ExportErrorCode } from '@core/model';
import { GitHubApiError, isAbortError } from '@core/github/client';
import { ExportPipelineError } from './pipelineError';

export interface MappedExportError {
  code: ExportErrorCode;
  message: string;
}

function rateLimitMessage(error: GitHubApiError): string {
  if (typeof error.rateLimit.retryAfter === 'number' && error.rateLimit.retryAfter > 0) {
    return `GitHub rate limit reached. Retry after ${error.rateLimit.retryAfter} second(s).`;
  }

  if (typeof error.rateLimit.reset === 'number' && error.rateLimit.reset > 0) {
    const resetAt = new Date(error.rateLimit.reset * 1000).toISOString();
    return `GitHub rate limit reached. Reset at ${resetAt}.`;
  }

  return 'GitHub rate limit reached. Add a token in Options to increase rate limits.';
}

export function mapGitHubError(error: unknown): MappedExportError {
  if (error instanceof ExportPipelineError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  if (isAbortError(error)) {
    return {
      code: 'aborted',
      message: 'Export was canceled.',
    };
  }

  if (error instanceof GitHubApiError) {
    if (error.status === 401) {
      return {
        code: 'unauthorized',
        message: 'GitHub token is invalid or missing required permissions.',
      };
    }

    if (error.status === 404) {
      return {
        code: 'notFound',
        message: 'Requested GitHub resource was not found.',
      };
    }

    const exhausted = error.rateLimit.remaining === 0 || (error.rateLimit.retryAfter ?? 0) > 0;
    if (error.status === 429 || (error.status === 403 && exhausted)) {
      return {
        code: 'rateLimited',
        message: rateLimitMessage(error),
      };
    }

    return {
      code: 'unknown',
      message: error.message,
    };
  }

  if (error instanceof TypeError) {
    return {
      code: 'network',
      message: 'Network error while contacting GitHub API.',
    };
  }

  if (error instanceof Error) {
    return {
      code: 'unknown',
      message: error.message,
    };
  }

  return {
    code: 'unknown',
    message: 'Unexpected export error.',
  };
}
