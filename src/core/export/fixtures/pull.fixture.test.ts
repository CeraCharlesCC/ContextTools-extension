import { describe, expect, it } from 'vitest';
import type { GitHubClient } from '@core/github/client';
import type { ExportRequest } from '@core/model';
import { runExport } from '@core/export';
import fixture from './pull/pull.fixture.json';

function createUnusedMethod(name: string) {
  return async () => {
    throw new Error(`Unexpected GitHub client call: ${name}`);
  };
}

describe('pull export fixture integration', () => {
  it('renders expected markdown output from fixture responses', async () => {
    const client: GitHubClient = {
      getPullRequest: async () => fixture.responses.pr,
      getIssueComments: async () => fixture.responses.issueComments,
      getPullReviewComments: async () => [],
      getPullReviews: async () => [],
      getPullFiles: async () => [],
      getPullCommits: async () => [],
      getPullReviewThreadResolution: async () => ({
        commentResolution: new Map<number, boolean>(),
        incomplete: false,
      }),
      getIssue: createUnusedMethod('getIssue'),
      getCommit: createUnusedMethod('getCommit'),
      getActionsRun: createUnusedMethod('getActionsRun'),
      getActionsRunJobs: createUnusedMethod('getActionsRunJobs'),
      getActionsJobLogs: createUnusedMethod('getActionsJobLogs'),
    };

    const result = await runExport(fixture.request as ExportRequest, { client });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    fixture.expectedContains.forEach((line) => {
      expect(result.markdown).toContain(line);
    });
  });
});
