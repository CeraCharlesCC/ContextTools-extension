import { describe, expect, it, vi } from 'vitest';
import type { GitHubClient } from '@core/github/client';
import type { GitHubCommit } from '@core/github/types';
import { resolvePullPreset, type ExportRequest } from '@core/model';
import { runExport } from './runExport';
import fixture from './fixtures/pull/pull.fixture.json';

function createClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  const unused = async (): Promise<never> => { throw new Error('Unexpected client call'); };
  return {
    getIssue: unused,
    getIssueComments: async () => [],
    getPullRequest: async () => fixture.responses.pr,
    getPullFiles: unused,
    getPullCommits: async () => [],
    getCommit: unused,
    getPullReviews: unused,
    getPullReviewComments: unused,
    getPullReviewThreadResolution: unused,
    getActionsRun: unused,
    getActionsRunJobs: unused,
    getActionsJobLogs: unused,
    ...overrides,
  };
}

function createRequest(): ExportRequest {
  return {
    requestId: 'pipeline-regression',
    target: { kind: 'pull', owner: 'octocat', repo: 'hello-world', number: 1 },
    profile: {
      kind: 'pull', preset: 'custom', options: resolvePullPreset('custom', {
        includeIssueComments: true,
        includeReviewComments: false,
        includeReviews: false,
        includeCommits: true,
        includeFileDiffs: false,
        includeCommitDiffs: true,
        smartDiffMode: false,
        timelineMode: true,
        ignoreResolvedComments: false,
      }),
    },
  };
}

const commits: GitHubCommit[] = [
  { sha: 'before', commit: { message: 'before selection', author: { date: '2026-01-01T00:00:00Z' } } },
  { sha: 'selected', commit: { message: 'selected commit', author: { date: '2026-01-03T00:00:00Z' } } },
];

describe('export pipeline regressions', () => {
  it('does not call the client for an already canceled request', async () => {
    const controller = new AbortController();
    controller.abort('custom cancellation reason');
    const getPullRequest = vi.fn(async () => fixture.responses.pr);
    const result = await runExport(createRequest(), {
      client: createClient({ getPullRequest }), signal: controller.signal,
    });
    expect(result).toMatchObject({ ok: false, code: 'aborted' });
    expect(getPullRequest).not.toHaveBeenCalled();
  });

  it('does not continue after cancellation during initial fetches', async () => {
    const controller = new AbortController();
    const getCommit = vi.fn();
    const client = createClient({
      getPullRequest: async () => { controller.abort(); return fixture.responses.pr; },
      getPullCommits: async () => commits,
      getCommit,
    });
    const result = await runExport(createRequest(), { client, signal: controller.signal });
    expect(result).toMatchObject({ ok: false, code: 'aborted' });
    expect(getCommit).not.toHaveBeenCalled();
  });

  it('downloads commit diffs only for the selected range and renders the details', async () => {
    const request = createRequest();
    request.selection = { mode: 'range', range: { start: { type: 'issue-comment', id: 10 } } };
    const getCommit = vi.fn(async ({ sha }: { sha: string }) => ({
      ...commits.find((commit) => commit.sha === sha)!,
      files: [{ filename: 'selected.ts', patch: '+selected patch' }],
    }));
    const client = createClient({
      getPullCommits: async () => commits,
      getIssueComments: async () => [{ id: 10, body: 'start here', created_at: '2026-01-02T00:00:00Z' }],
      getCommit,
    });
    const result = await runExport(request, { client });
    expect(getCommit).toHaveBeenCalledTimes(1);
    expect(getCommit).toHaveBeenCalledWith(expect.objectContaining({ sha: 'selected' }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.markdown).toContain('+selected patch');
      expect(result.markdown).not.toContain('before selection');
    }
  });

  it('rejects missing range markers before downloading commit diffs', async () => {
    const request = createRequest();
    request.selection = { mode: 'range', range: { start: { type: 'issue-comment', id: 999 } } };
    const getCommit = vi.fn();
    const result = await runExport(request, { client: createClient({ getPullCommits: async () => commits, getCommit }) });
    expect(result).toMatchObject({ ok: false, code: 'invalidSelection' });
    expect(getCommit).not.toHaveBeenCalled();
  });

  it('warns when requested commit diffs could not be downloaded', async () => {
    const result = await runExport(createRequest(), { client: createClient({
      getPullCommits: async () => commits,
      getCommit: async () => { throw new Error('temporarily unavailable'); },
    }) });
    expect(result).toMatchObject({ ok: true, warning: expect.stringContaining('2 commit diff(s) could not be downloaded') });
  });

  it('keeps review comments and warns when thread resolution is unavailable', async () => {
    const request = createRequest();
    if (request.profile?.kind !== 'pull') throw new Error('Expected pull profile');
    request.profile.options.includeReviewComments = true;
    request.profile.options.ignoreResolvedComments = true;
    const result = await runExport(request, { client: createClient({
      getPullReviewComments: async () => [{ id: 10, created_at: '2026-01-01T00:00:00Z', body: 'Keep this comment' }],
      getPullReviewThreadResolution: async () => { throw new Error('Requires authentication'); },
    }) });
    expect(result).toMatchObject({ ok: true, warning: expect.stringContaining('Unable to determine resolved review threads') });
    if (result.ok) expect(result.markdown).toContain('Keep this comment');
  });
});
