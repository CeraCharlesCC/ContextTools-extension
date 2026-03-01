import { describe, expect, it } from 'vitest';
import { resolvePullPreset } from '@core/model';
import type {
  GitHubCommit,
  GitHubIssueComment,
  GitHubPullFile,
  GitHubPullRequest,
  GitHubPullReview,
  GitHubPullReviewComment,
} from '@core/github/types';
import { prToMarkdown } from './pull';

const basePr: GitHubPullRequest = {
  id: 1,
  title: 'Add preset-based export',
  html_url: 'https://github.com/octocat/hello-world/pull/1',
  state: 'open',
  user: { login: 'alice' },
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-02T00:00:00Z',
  base: { ref: 'main', repo: { full_name: 'octocat/hello-world' } },
  head: { ref: 'feature/presets', repo: { full_name: 'octocat/hello-world' } },
  commits: 1,
  changed_files: 1,
  additions: 10,
  deletions: 2,
  labels: [{ name: 'enhancement' }],
  body: 'Implements preset-driven export behavior.',
};

const commits: GitHubCommit[] = [
  {
    sha: 'abcdef1234567890',
    author: { login: 'alice' },
    commit: {
      message: 'feat: add presets\n\nImplements export presets.',
      author: {
        name: 'Alice',
        date: '2025-01-03T00:00:00Z',
      },
    },
    files: [
      {
        filename: 'src/export.ts',
        status: 'modified',
        additions: 1,
        deletions: 0,
        patch: '+const preset = true;',
      },
    ],
  },
];

const issueComments: GitHubIssueComment[] = [
  {
    id: 101,
    user: { login: 'maintainer' },
    created_at: '2025-01-04T00:00:00Z',
    body: 'Issue discussion body',
  },
];

const reviewComments: GitHubPullReviewComment[] = [
  {
    id: 201,
    user: { login: 'reviewer' },
    created_at: '2025-01-05T00:00:00Z',
    body: 'Review comment body',
    path: 'src/export.ts',
    line: 12,
  },
];

const reviews: GitHubPullReview[] = [
  {
    id: 301,
    user: { login: 'reviewer' },
    state: 'APPROVED',
    created_at: '2025-01-05T00:00:00Z',
    submitted_at: '2025-01-05T00:05:00Z',
    body: 'Looks good',
  },
];

const files: GitHubPullFile[] = [
  {
    filename: 'src/export.ts',
    status: 'modified',
    additions: 10,
    deletions: 2,
    patch: '@@ -1,0 +1,1 @@\n+const preset = true;',
  },
];

describe('prToMarkdown', () => {
  it('renders commit-log preset with commit sections only', () => {
    const markdown = prToMarkdown({
      pr: basePr,
      commits,
      issueComments,
      reviewComments,
      reviews,
      options: resolvePullPreset('commit-log'),
    });

    expect(markdown).toContain('## Commits (1)');
    expect(markdown).toContain('#### src/export.ts');
    expect(markdown).not.toContain('## Issue Comments');
    expect(markdown).not.toContain('## Review Comments');
    expect(markdown).not.toContain('## Reviews');
  });

  it('renders review-comments-only preset with review comments only', () => {
    const markdown = prToMarkdown({
      pr: basePr,
      commits,
      issueComments,
      reviewComments,
      reviews,
      options: resolvePullPreset('review-comments-only'),
    });

    expect(markdown).toContain('## Review Comments (1)');
    expect(markdown).not.toContain('## Issue Comments');
    expect(markdown).not.toContain('## Commits');
    expect(markdown).not.toContain('## Reviews');
  });

  it('honors timeline ordering when timeline mode is enabled', () => {
    const markdown = prToMarkdown({
      pr: basePr,
      issueComments: [
        {
          id: 1001,
          user: { login: 'late-user' },
          created_at: '2025-02-02T00:00:00Z',
          body: 'late comment body',
        },
        {
          id: 1002,
          user: { login: 'early-user' },
          created_at: '2025-02-01T00:00:00Z',
          body: 'early comment body',
        },
      ],
      options: resolvePullPreset('full-conversation'),
    });

    const earlyIndex = markdown.indexOf('early comment body');
    const lateIndex = markdown.indexOf('late comment body');

    expect(markdown).toContain('## Timeline (2)');
    expect(earlyIndex).toBeGreaterThan(-1);
    expect(lateIndex).toBeGreaterThan(-1);
    expect(earlyIndex).toBeLessThan(lateIndex);
  });

  it('renders files section after timeline in with-diffs preset', () => {
    const markdown = prToMarkdown({
      pr: basePr,
      files,
      issueComments,
      reviewComments,
      reviews,
      commits,
      options: resolvePullPreset('with-diffs'),
    });

    const timelineIndex = markdown.indexOf('## Timeline (');
    const filesIndex = markdown.indexOf('## Files (1)');

    expect(timelineIndex).toBeGreaterThan(-1);
    expect(filesIndex).toBeGreaterThan(-1);
    expect(timelineIndex).toBeLessThan(filesIndex);
  });
});
