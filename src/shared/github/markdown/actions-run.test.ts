import { describe, expect, it } from 'vitest';
import type { GitHubActionsJob, GitHubActionsRun } from '../types';
import { actionsRunToMarkdown } from './actions-run';

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
  it('renders run header, URL, and status metadata', () => {
    const markdown = actionsRunToMarkdown({ run: baseRun, jobs: [] });

    expect(markdown).toContain('# Actions Run: CI Pipeline');
    expect(markdown).toContain('- URL: https://github.com/octocat/hello-world/actions/runs/100');
    expect(markdown).toContain('- Status: completed/success');
  });

  it('renders jobs section, job headings, and steps list', () => {
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
      {
        id: 2,
        name: 'test',
        status: 'completed',
        conclusion: 'success',
        steps: [{ number: 1, name: 'Run tests', status: 'completed', conclusion: 'success' }],
      },
    ];

    const markdown = actionsRunToMarkdown({ run: baseRun, jobs });

    expect(markdown).toContain('## Jobs (2)');
    expect(markdown).toContain('### 1. build');
    expect(markdown).toContain('### 2. test');
    expect(markdown).toContain('#### Steps (2)');
    expect(markdown).toContain('- 1. Checkout - completed/success');
  });

  it('handles missing or empty steps with fallback text', () => {
    const jobs: GitHubActionsJob[] = [
      {
        id: 1,
        name: 'no-steps-provided',
        status: 'in_progress',
        conclusion: null,
      },
      {
        id: 2,
        name: 'empty-steps-array',
        status: 'queued',
        conclusion: null,
        steps: [],
      },
    ];

    expect(() => actionsRunToMarkdown({ run: baseRun, jobs })).not.toThrow();

    const markdown = actionsRunToMarkdown({ run: baseRun, jobs });
    expect(markdown).toContain('### 1. no-steps-provided');
    expect(markdown).toContain('### 2. empty-steps-array');
    expect(markdown).toContain('_No steps provided._');
  });
});
