import { describe, expect, it } from 'vitest';
import type { TimelineEvent } from '@core/markdown/pull';
import { slicePullTimeline } from './slicePullTimeline';

const events: TimelineEvent[] = [
  {
    type: 'issue-comment',
    id: 11,
    date: '2026-01-01T00:00:00Z',
    comment: {
      id: 11,
      created_at: '2026-01-01T00:00:00Z',
      body: 'first',
      user: { login: 'alice' },
    },
  },
  {
    type: 'review-comment',
    id: 22,
    date: '2026-01-02T00:00:00Z',
    comment: {
      id: 22,
      created_at: '2026-01-02T00:00:00Z',
      body: 'second',
      user: { login: 'bob' },
    },
  },
  {
    type: 'review',
    id: 33,
    date: '2026-01-03T00:00:00Z',
    review: {
      id: 33,
      state: 'COMMENTED',
      created_at: '2026-01-03T00:00:00Z',
      user: { login: 'carol' },
    },
  },
];

describe('slicePullTimeline', () => {
  it('returns all events when no range is provided', () => {
    expect(slicePullTimeline(events)).toEqual({ events });
  });

  it('swaps reversed markers and returns warning', () => {
    const result = slicePullTimeline(events, {
      start: { type: 'review', id: 33 },
      end: { type: 'issue-comment', id: 11 },
    });

    if ('error' in result) {
      throw new Error(result.error);
    }

    expect(result.events).toHaveLength(3);
    expect(result.warning).toContain('swapped');
  });

  it('returns error when marker is missing', () => {
    const result = slicePullTimeline(events, {
      start: { type: 'review', id: 999 },
    });

    expect(result).toEqual({
      error: 'Selected marker could not be found in the PR timeline.',
    });
  });
});
