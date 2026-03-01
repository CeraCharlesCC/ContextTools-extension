import { describe, expect, it } from 'vitest';
import type { GitHubIssueComment } from '@core/github/types';
import { sliceIssueComments } from './sliceIssueComments';

const comments: GitHubIssueComment[] = [
  {
    id: 1,
    created_at: '2026-01-01T00:00:00Z',
    body: 'alpha',
    user: { login: 'alice' },
  },
  {
    id: 2,
    created_at: '2026-01-02T00:00:00Z',
    body: 'beta',
    user: { login: 'bob' },
  },
];

describe('sliceIssueComments', () => {
  it('returns all comments when no range is provided', () => {
    expect(sliceIssueComments(comments)).toEqual({ comments });
  });

  it('rejects non-issue markers', () => {
    const result = sliceIssueComments(comments, {
      start: { type: 'review-comment', id: 1 },
    });

    expect(result).toEqual({
      error: 'Start marker must be an issue comment.',
    });
  });

  it('swaps reversed ranges and includes warning', () => {
    const result = sliceIssueComments(comments, {
      start: { type: 'issue-comment', id: 2 },
      end: { type: 'issue-comment', id: 1 },
    });

    if ('error' in result) {
      throw new Error(result.error);
    }

    expect(result.comments).toHaveLength(2);
    expect(result.warning).toContain('swapped');
  });
});
