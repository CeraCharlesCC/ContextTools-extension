import { describe, expect, it } from 'vitest';
import { createDefaultCustomOptions, resolvePreset, type PRSettings } from '@domain/entities';
import type { GenerateMarkdownPayload } from '@shared/github';
import { buildPullFetchPlan, resolveIssueTimelineMode, resolvePullExportState } from './export-resolution';

const pullPage: GenerateMarkdownPayload['page'] = {
  owner: 'octocat',
  repo: 'hello-world',
  number: 42,
  kind: 'pull',
};

const issuePage: GenerateMarkdownPayload['page'] = {
  owner: 'octocat',
  repo: 'hello-world',
  number: 24,
  kind: 'issue',
};

describe('background export resolution', () => {
  it('applies precedence payload > last-used > defaults for pull export state', () => {
    const defaults: PRSettings = {
      enabled: true,
      defaultPreset: 'full-conversation',
      customOptions: createDefaultCustomOptions(),
    };

    const resolved = resolvePullExportState({
      payload: {
        page: pullPage,
        preset: 'custom',
        customOptions: {
          includeCommits: false,
        },
      },
      defaults,
      lastState: {
        preset: 'custom',
        customOptions: {
          includeCommits: true,
          timelineMode: false,
        },
      },
    });

    expect(resolved.preset).toBe('custom');
    expect(resolved.options.includeCommits).toBe(false);
    expect(resolved.options.timelineMode).toBe(false);
    expect(resolved.options.includeIssueComments).toBe(true);
  });

  it('builds PR fetch plan that skips unnecessary endpoints', () => {
    const options = resolvePreset('review-comments-only');
    const plan = buildPullFetchPlan(options);

    expect(plan.shouldFetchIssueComments).toBe(false);
    expect(plan.shouldFetchReviewComments).toBe(true);
    expect(plan.shouldFetchReviews).toBe(false);
    expect(plan.shouldFetchCommits).toBe(false);
    expect(plan.shouldFetchFiles).toBe(false);
    expect(plan.shouldFetchReviewThreadResolution).toBe(false);
  });

  it('builds PR fetch plan that fetches files for with-diffs preset', () => {
    const options = resolvePreset('with-diffs');

    expect(options.includeFileDiffs).toBe(true);

    const plan = buildPullFetchPlan(options);

    expect(plan.shouldFetchFiles).toBe(true);
  });

  it('ignores PR-only fields for issue timeline resolution', () => {
    const timelineModeFromLastState = resolveIssueTimelineMode({
      payload: {
        page: issuePage,
        customOptions: {
          includeCommits: true,
          includeCommitDiffs: true,
          smartDiffMode: true,
        },
      },
      issueDefaultTimelineMode: true,
      lastState: { timelineMode: false },
    });

    const timelineModeFromDefault = resolveIssueTimelineMode({
      payload: {
        page: issuePage,
        customOptions: {
          includeCommits: true,
          includeCommitDiffs: true,
        },
      },
      issueDefaultTimelineMode: true,
    });

    expect(timelineModeFromLastState).toBe(false);
    expect(timelineModeFromDefault).toBe(true);
  });
});
