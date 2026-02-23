import {
  createDefaultCustomOptions,
  resolvePreset,
  type ExportOptions,
  type ExportPreset,
} from '@domain/entities';

export interface PullExportState {
  preset: ExportPreset;
  customOptions: ExportOptions;
}

function cloneOptions(options: ExportOptions): ExportOptions {
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
  preset: ExportPreset,
  customOptions: Partial<ExportOptions>
): PullExportState {
  return {
    preset,
    customOptions: resolvePreset(preset, customOptions),
  };
}

export function applyPresetSelection(state: PullExportState, preset: ExportPreset): PullExportState {
  if (preset === 'custom') {
    return {
      preset,
      customOptions: cloneOptions(state.customOptions),
    };
  }

  return {
    preset,
    customOptions: resolvePreset(preset, state.customOptions),
  };
}

export function applyAdvancedToggle(
  state: PullExportState,
  option: keyof ExportOptions,
  checked: boolean
): PullExportState {
  const requestedOptions = {
    ...state.customOptions,
    [option]: checked,
  } as ExportOptions;

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
  currentOptions: Partial<ExportOptions> | undefined,
  timelineModeFallback: boolean
): ExportOptions {
  const defaults = createDefaultCustomOptions();
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

export function isSmartDiffEnabled(options: ExportOptions): boolean {
  return options.includeCommitDiffs;
}
