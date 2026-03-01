import { describe, expect, it, vi } from 'vitest';
import type { GitHubClient } from '@core/github/client';
import { resolveActionsRunPreset, resolvePullPreset, type ExportRequest } from '@core/model';
import { runExport } from './runExport';

function createUnusedMethod(name: string) {
  return async () => {
    throw new Error(`Unexpected GitHub client call: ${name}`);
  };
}

function createAbortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function createBaseClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    getIssue: createUnusedMethod('getIssue'),
    getIssueComments: createUnusedMethod('getIssueComments'),
    getPullRequest: createUnusedMethod('getPullRequest'),
    getPullFiles: createUnusedMethod('getPullFiles'),
    getPullCommits: createUnusedMethod('getPullCommits'),
    getCommit: createUnusedMethod('getCommit'),
    getPullReviews: createUnusedMethod('getPullReviews'),
    getPullReviewComments: createUnusedMethod('getPullReviewComments'),
    getPullReviewThreadResolution: createUnusedMethod('getPullReviewThreadResolution'),
    getActionsRun: createUnusedMethod('getActionsRun'),
    getActionsRunJobs: createUnusedMethod('getActionsRunJobs'),
    getActionsJobLogs: createUnusedMethod('getActionsJobLogs'),
    ...overrides,
  };
}

function createPullRequest(): ExportRequest {
  return {
    requestId: 'pull-request-abort-test',
    target: {
      kind: 'pull',
      owner: 'octocat',
      repo: 'hello-world',
      number: 1,
    },
  };
}

describe('runExport abort propagation regressions', () => {
  it('returns aborted when actions job log fetch is canceled', async () => {
    const getActionsJobLogs = vi.fn(async () => {
      throw createAbortError();
    });

    const client = createBaseClient({
      getActionsRun: async () => ({
        id: 123,
        name: 'CI',
        html_url: 'https://github.com/octocat/hello-world/actions/runs/123',
        status: 'completed',
        conclusion: 'success',
      }),
      getActionsRunJobs: async () => [
        {
          id: 10,
          name: 'build',
          status: 'completed',
          conclusion: 'success',
          steps: [
            {
              number: 1,
              name: 'step',
              status: 'completed',
              conclusion: 'success',
            },
          ],
        },
      ],
      getActionsJobLogs,
    });

    const request: ExportRequest = {
      requestId: 'actions-job-log-abort',
      target: {
        kind: 'actionsRun',
        owner: 'octocat',
        repo: 'hello-world',
        runId: 123,
      },
      profile: {
        kind: 'actionsRun',
        preset: 'export-all',
        options: resolveActionsRunPreset('export-all'),
      },
    };

    const result = await runExport(request, { client });

    expect(getActionsJobLogs).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: false,
      code: 'aborted',
      message: 'Export was canceled.',
    });
  });

  it('returns aborted when commit detail fallback fetch is canceled', async () => {
    const getCommit = vi.fn(async () => {
      throw createAbortError();
    });

    const client = createBaseClient({
      getPullRequest: async () => ({
        id: 1,
        title: 'Test pull request',
        html_url: 'https://github.com/octocat/hello-world/pull/1',
        state: 'open',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }),
      getPullCommits: async () => [
        {
          sha: 'abcdef1234567890',
          commit: {
            message: 'feat: add regression coverage',
            author: {
              date: '2026-01-01T00:00:00Z',
            },
          },
        },
      ],
      getCommit,
    });

    const request = createPullRequest();
    request.profile = {
      kind: 'pull',
      preset: 'custom',
      options: resolvePullPreset('custom', {
        includeIssueComments: false,
        includeReviewComments: false,
        includeReviews: false,
        includeCommits: true,
        includeFileDiffs: false,
        includeCommitDiffs: true,
        smartDiffMode: false,
        timelineMode: false,
        ignoreResolvedComments: false,
      }),
    };

    const result = await runExport(request, { client });

    expect(getCommit).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: false,
      code: 'aborted',
      message: 'Export was canceled.',
    });
  });

  it('returns aborted when review-thread resolution fallback path is canceled', async () => {
    const getPullReviewThreadResolution = vi.fn(async () => {
      throw createAbortError();
    });

    const client = createBaseClient({
      getPullRequest: async () => ({
        id: 1,
        title: 'Test pull request',
        html_url: 'https://github.com/octocat/hello-world/pull/1',
        state: 'open',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }),
      getPullReviewComments: async () => [
        {
          id: 99,
          created_at: '2026-01-01T00:00:00Z',
          body: 'Looks good',
        },
      ],
      getPullReviewThreadResolution,
    });

    const request = createPullRequest();
    request.profile = {
      kind: 'pull',
      preset: 'custom',
      options: resolvePullPreset('custom', {
        includeIssueComments: false,
        includeReviewComments: true,
        includeReviews: false,
        includeCommits: false,
        includeFileDiffs: false,
        includeCommitDiffs: false,
        smartDiffMode: false,
        timelineMode: false,
        ignoreResolvedComments: true,
      }),
    };

    const result = await runExport(request, { client });

    expect(getPullReviewThreadResolution).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: false,
      code: 'aborted',
      message: 'Export was canceled.',
    });
  });
});
