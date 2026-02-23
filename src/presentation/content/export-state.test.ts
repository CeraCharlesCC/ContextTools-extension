import { describe, expect, it } from 'vitest';
import { resolvePreset } from '@domain/entities';
import {
  applyAdvancedToggle,
  applyPresetSelection,
  coerceIssueOptions,
  createPullExportState,
  isSmartDiffEnabled,
} from './export-state';

describe('content export state transitions', () => {
  it('applies built-in preset and resets advanced options to preset defaults', () => {
    const state = createPullExportState('custom', {
      includeIssueComments: false,
      includeReviewComments: true,
      includeReviews: false,
      includeCommits: true,
      includeFileDiffs: true,
      includeCommitDiffs: true,
      smartDiffMode: true,
      timelineMode: false,
      ignoreResolvedComments: true,
    });

    const nextState = applyPresetSelection(state, 'with-diffs');

    expect(nextState.preset).toBe('with-diffs');
    expect(nextState.customOptions).toEqual(resolvePreset('with-diffs'));
  });

  it('switches preset to custom when advanced toggle is changed', () => {
    const state = createPullExportState('full-conversation', {});

    const nextState = applyAdvancedToggle(state, 'includeCommits', true);

    expect(nextState.preset).toBe('custom');
    expect(nextState.customOptions.includeCommits).toBe(true);
  });

  it('disables smart diff when include commit diffs is turned off', () => {
    const state = createPullExportState('custom', {
      includeCommitDiffs: true,
      smartDiffMode: true,
    });

    const nextState = applyAdvancedToggle(state, 'includeCommitDiffs', false);

    expect(nextState.customOptions.includeCommitDiffs).toBe(false);
    expect(nextState.customOptions.smartDiffMode).toBe(false);
    expect(isSmartDiffEnabled(nextState.customOptions)).toBe(false);
  });

  it('coerces issue export options to issue-supported controls only', () => {
    const coerced = coerceIssueOptions(
      {
        includeIssueComments: false,
        includeReviewComments: false,
        includeReviews: false,
        includeCommits: true,
        includeFileDiffs: true,
        includeCommitDiffs: true,
        smartDiffMode: true,
        timelineMode: false,
        ignoreResolvedComments: true,
      },
      true
    );

    expect(coerced).toMatchObject({
      includeIssueComments: true,
      includeReviewComments: true,
      includeReviews: true,
      includeCommits: false,
      includeFileDiffs: false,
      includeCommitDiffs: false,
      smartDiffMode: false,
      ignoreResolvedComments: false,
      timelineMode: false,
    });
  });
});
