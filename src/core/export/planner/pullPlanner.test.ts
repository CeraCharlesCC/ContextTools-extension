import { describe, expect, it } from 'vitest';
import { resolvePullPreset, type PullProfile } from '@core/model';
import { buildPullFetchPlan } from './pullPlanner';

describe('buildPullFetchPlan', () => {
  it('skips unnecessary endpoints for review-comments-only preset', () => {
    const profile: PullProfile = {
      kind: 'pull',
      preset: 'review-comments-only',
      options: resolvePullPreset('review-comments-only'),
    };

    const plan = buildPullFetchPlan(profile);

    expect(plan.shouldFetchIssueComments).toBe(false);
    expect(plan.shouldFetchReviewComments).toBe(true);
    expect(plan.shouldFetchReviews).toBe(false);
    expect(plan.shouldFetchCommits).toBe(false);
    expect(plan.shouldFetchFiles).toBe(false);
    expect(plan.shouldFetchReviewThreadResolution).toBe(false);
  });

  it('fetches files for with-diffs preset', () => {
    const profile: PullProfile = {
      kind: 'pull',
      preset: 'with-diffs',
      options: resolvePullPreset('with-diffs'),
    };

    const plan = buildPullFetchPlan(profile);

    expect(plan.shouldFetchFiles).toBe(true);
    expect(plan.includeCommitDiffs).toBe(true);
    expect(plan.smartDiffMode).toBe(true);
  });
});
