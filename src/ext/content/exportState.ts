import {
  createDefaultPullOptions,
  resolvePullPreset,
  type PullExportOptions,
  type PullPreset,
} from '@core/model';

export interface PullExportState {
  preset: PullPreset;
  customOptions: PullExportOptions;
}

function cloneOptions(options: PullExportOptions): PullExportOptions {
  return {
    includeIssueComments: options.includeIssueComments,
    includeReviewComments: options.includeReviewComments,
    includeReviews: options.includeReviews,
    includeCommits: options.includeCommits,
    includeFileDiffs: options.includeFileDiffs,
    includeCommitDiffs: options.includeCommitDiffs,
    smartDiffMode: options.smartDiffMode,
    timelineMode: options.timelineMode,
    ignoreResolvedComments: options.ignoreResolvedComments,
  };
}

export function createPullExportState(
  preset: PullPreset,
  customOptions: Partial<PullExportOptions>
): PullExportState {
  return {
    preset,
    customOptions: resolvePullPreset(preset, customOptions),
  };
}

export function applyPresetSelection(state: PullExportState, preset: PullPreset): PullExportState {
  if (preset === 'custom') {
    return {
      preset,
      customOptions: cloneOptions(state.customOptions),
    };
  }

  return {
    preset,
    customOptions: resolvePullPreset(preset, state.customOptions),
  };
}

export function applyAdvancedToggle(
  state: PullExportState,
  option: keyof PullExportOptions,
  checked: boolean
): PullExportState {
  const requestedOptions = {
    ...state.customOptions,
    [option]: checked,
  } as PullExportOptions;

  const customOptions = requestedOptions.includeCommitDiffs
    ? requestedOptions
    : {
        ...requestedOptions,
        smartDiffMode: false,
      };

  return {
    preset: 'custom',
    customOptions,
  };
}

export function coerceIssueOptions(
  currentOptions: Partial<PullExportOptions> | undefined,
  timelineModeFallback: boolean
): PullExportOptions {
  const defaults = createDefaultPullOptions();
  const timelineMode =
    typeof currentOptions?.timelineMode === 'boolean'
      ? currentOptions.timelineMode
      : timelineModeFallback;

  return {
    ...defaults,
    includeIssueComments: true,
    includeReviewComments: true,
    includeReviews: true,
    includeCommits: false,
    includeFileDiffs: false,
    includeCommitDiffs: false,
    smartDiffMode: false,
    ignoreResolvedComments: false,
    timelineMode,
  };
}

export function isSmartDiffEnabled(options: PullExportOptions): boolean {
  return options.includeCommitDiffs;
}
