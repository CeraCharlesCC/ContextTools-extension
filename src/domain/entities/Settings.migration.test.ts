import { describe, expect, it } from 'vitest';
import { migrateLegacyPRToPresetSettings, migrateStoredSettings, type ExportOptions } from './Settings';

describe('Settings migration', () => {
  it('migrates legacy boolean PR settings without losing common/issue state', () => {
    const stored = {
      commonSettings: {
        theme: 'dark',
        notifications: false,
      },
      pr: {
        enabled: false,
        historicalMode: true,
        includeFileDiff: true,
        includeCommit: true,
        smartDiffMode: true,
        onlyReviewComments: false,
        ignoreResolvedComments: true,
      },
      issue: {
        enabled: false,
        historicalMode: false,
      },
    };

    const migrated = migrateStoredSettings(stored);
    if (!migrated) {
      throw new Error('Expected settings to be migrated.');
    }

    const expectedOptions: ExportOptions = {
      includeIssueComments: true,
      includeReviewComments: true,
      includeReviews: true,
      includeCommits: true,
      includeFileDiffs: true,
      includeCommitDiffs: true,
      smartDiffMode: true,
      timelineMode: true,
      ignoreResolvedComments: true,
    };

    expect(migrated.commonSettings).toEqual({
      theme: 'dark',
      notifications: false,
    });
    expect(migrated.issue).toEqual({
      enabled: false,
      historicalMode: false,
    });
    expect(migrated.pr.enabled).toBe(false);
    expect(migrated.pr.customOptions).toEqual(expectedOptions);
    expect(migrated.pr.defaultPreset).toBe('custom');
  });

  it('infers exact built-in preset when migrated options match preset map', () => {
    const migrated = migrateLegacyPRToPresetSettings({
      enabled: true,
      onlyReviewComments: true,
      includeCommit: true,
      includeFileDiff: true,
      smartDiffMode: true,
      historicalMode: true,
      ignoreResolvedComments: false,
    });

    expect(migrated.defaultPreset).toBe('review-comments-only');
    expect(migrated.customOptions).toEqual({
      includeIssueComments: false,
      includeReviewComments: true,
      includeReviews: false,
      includeCommits: false,
      includeFileDiffs: false,
      includeCommitDiffs: false,
      smartDiffMode: false,
      timelineMode: false,
      ignoreResolvedComments: false,
    });
  });

  it('falls back to custom preset when migrated options partially mismatch a built-in', () => {
    const migrated = migrateLegacyPRToPresetSettings({
      enabled: true,
      onlyReviewComments: false,
      includeCommit: false,
      includeFileDiff: false,
      smartDiffMode: false,
      historicalMode: true,
      ignoreResolvedComments: true,
    });

    expect(migrated.defaultPreset).toBe('custom');
    expect(migrated.customOptions.ignoreResolvedComments).toBe(true);
  });
});
