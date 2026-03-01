import { describe, expect, it } from 'vitest';
import type { GitHubClient } from '@core/github/client';
import type { ExportRequest } from '@core/model';
import { runExport } from '@core/export';
import fixture from './issue/issue.fixture.json';

function createUnusedMethod(name: string) {
  return async () => {
    throw new Error(`Unexpected GitHub client call: ${name}`);
  };
}

describe('issue export fixture integration', () => {
  it('renders expected markdown output from fixture responses', async () => {
    const client: GitHubClient = {
      getIssue: async () => fixture.responses.issue,
      getIssueComments: async () => fixture.responses.comments,
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
