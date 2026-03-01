import { describe, expect, it } from 'vitest';
import type { GitHubIssue, GitHubIssueComment } from '@core/github/types';
import { issueToMarkdown } from './issue';

const issue: GitHubIssue = {
  id: 1,
  title: 'Bug report',
  html_url: 'https://github.com/octocat/hello-world/issues/1',
  state: 'open',
  user: { login: 'octocat' },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  body: 'Issue body',
};

const comments: GitHubIssueComment[] = [
  {
    id: 10,
    user: { login: 'second' },
    created_at: '2026-01-02T00:00:00Z',
    body: 'second comment',
  },
  {
    id: 20,
    user: { login: 'first' },
    created_at: '2026-01-01T00:00:00Z',
    body: 'first comment',
  },
];

describe('issueToMarkdown', () => {
  it('renders issue summary and comments', () => {
    const markdown = issueToMarkdown(issue, comments, { historicalMode: true });

    expect(markdown).toContain('# Issue: Bug report');
    expect(markdown).toContain('## Comments (2)');
    expect(markdown).toContain('second comment');
  });

  it('reverses comments when historical mode is disabled', () => {
    const markdown = issueToMarkdown(issue, comments, { historicalMode: false });

    const firstIndex = markdown.indexOf('first comment');
    const secondIndex = markdown.indexOf('second comment');

    expect(firstIndex).toBeGreaterThan(-1);
    expect(secondIndex).toBeGreaterThan(-1);
    expect(firstIndex).toBeLessThan(secondIndex);
  });
});
