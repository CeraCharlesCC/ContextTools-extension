import { describe, expect, it } from 'vitest';
import { BUILTIN_EXPORT_PRESETS, resolvePreset, type ExportOptions } from './Settings';

describe('Settings preset resolver', () => {
  it('returns expected export options for all built-in presets', () => {
    const expectedByPreset: Record<(typeof BUILTIN_EXPORT_PRESETS)[number], ExportOptions> = {
      'full-conversation': {
        includeIssueComments: true,
        includeReviewComments: true,
        includeReviews: true,
        includeCommits: false,
        includeFileDiffs: false,
        includeCommitDiffs: false,
        smartDiffMode: false,
        timelineMode: true,
        ignoreResolvedComments: false,
      },
      'with-diffs': {
        includeIssueComments: true,
        includeReviewComments: true,
        includeReviews: true,
        includeCommits: true,
        includeFileDiffs: true,
        includeCommitDiffs: true,
        smartDiffMode: true,
        timelineMode: true,
        ignoreResolvedComments: false,
      },
      'review-comments-only': {
        includeIssueComments: false,
        includeReviewComments: true,
        includeReviews: false,
        includeCommits: false,
        includeFileDiffs: false,
        includeCommitDiffs: false,
        smartDiffMode: false,
        timelineMode: false,
        ignoreResolvedComments: false,
      },
      'commit-log': {
        includeIssueComments: false,
        includeReviewComments: false,
        includeReviews: false,
        includeCommits: true,
        includeFileDiffs: false,
        includeCommitDiffs: true,
        smartDiffMode: false,
        timelineMode: false,
        ignoreResolvedComments: false,
      },
    };

    BUILTIN_EXPORT_PRESETS.forEach((preset) => {
      expect(resolvePreset(preset)).toEqual(expectedByPreset[preset]);
    });
  });

  it('returns custom options unchanged when preset is custom', () => {
    const customOptions: ExportOptions = {
      includeIssueComments: false,
      includeReviewComments: true,
      includeReviews: false,
      includeCommits: true,
      includeFileDiffs: false,
      includeCommitDiffs: true,
      smartDiffMode: true,
      timelineMode: false,
      ignoreResolvedComments: true,
    };

    expect(resolvePreset('custom', customOptions)).toEqual(customOptions);
  });
});
