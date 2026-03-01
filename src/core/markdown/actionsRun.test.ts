import { describe, expect, it } from 'vitest';
import type { GitHubActionsJob, GitHubActionsRun } from '@core/github/types';
import { actionsRunToMarkdown } from './actionsRun';
import { resolveActionsRunExportOptions } from './actionsRunExport';

const baseRun: GitHubActionsRun = {
  id: 100,
  name: 'CI Pipeline',
  html_url: 'https://github.com/octocat/hello-world/actions/runs/100',
  status: 'completed',
  conclusion: 'success',
  event: 'pull_request',
  head_branch: 'feature/actions',
  head_sha: 'abcdef1234567890',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:05:00Z',
  actor: { login: 'octocat' },
  run_number: 42,
  run_attempt: 1,
};

describe('actionsRunToMarkdown', () => {
  it('renders run summary metadata', () => {
    const markdown = actionsRunToMarkdown({ run: baseRun, jobs: [] });

    expect(markdown).toContain('# Actions Run: CI Pipeline');
    expect(markdown).toContain('- Status: completed/success');
  });

  it('renders jobs and steps', () => {
    const jobs: GitHubActionsJob[] = [
      {
        id: 1,
        name: 'build',
        status: 'completed',
        conclusion: 'success',
        steps: [
          { number: 1, name: 'Checkout', status: 'completed', conclusion: 'success' },
          { number: 2, name: 'Install', status: 'completed', conclusion: 'success' },
        ],
      },
    ];

    const markdown = actionsRunToMarkdown({ run: baseRun, jobs });
    expect(markdown).toContain('## Jobs (1)');
    expect(markdown).toContain('#### Steps (2)');
  });

  it('applies failure-step preset filtering', () => {
    const options = resolveActionsRunExportOptions({ preset: 'failure-step' }).options;
    const markdown = actionsRunToMarkdown({
      run: baseRun,
      jobs: [
        {
          id: 1,
          name: 'test',
          status: 'completed',
          conclusion: 'failure',
          steps: [
            { number: 1, name: 'Setup', status: 'completed', conclusion: 'success' },
            { number: 2, name: 'Run tests', status: 'completed', conclusion: 'failure' },
          ],
        },
      ],
      options,
    });

    expect(markdown).toContain('#### Steps (1)');
    expect(markdown).toContain('Run tests');
    expect(markdown).not.toContain('Setup');
  });
});
