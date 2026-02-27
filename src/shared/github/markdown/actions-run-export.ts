import type { ActionsRunExportOptions, ActionsRunExportPreset } from '../types';

const actionsRunOptionKeys: ReadonlyArray<keyof ActionsRunExportOptions> = [
  'includeSummary',
  'includeJobs',
  'includeSteps',
  'onlyFailureJobs',
  'onlyFailureSteps',
];

const presetOptions: Readonly<Record<ActionsRunExportPreset, ActionsRunExportOptions>> = {
  'only-summary': {
    includeSummary: true,
    includeJobs: false,
    includeSteps: false,
    onlyFailureJobs: false,
    onlyFailureSteps: false,
  },
  'export-all': {
    includeSummary: true,
    includeJobs: true,
    includeSteps: true,
    onlyFailureJobs: false,
    onlyFailureSteps: false,
  },
  'failure-job': {
    includeSummary: true,
    includeJobs: true,
    includeSteps: true,
    onlyFailureJobs: true,
    onlyFailureSteps: false,
  },
  'failure-step': {
    includeSummary: true,
    includeJobs: true,
    includeSteps: true,
    onlyFailureJobs: true,
    onlyFailureSteps: true,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function readActionsRunPreset(value: unknown): ActionsRunExportPreset | undefined {
  return value === 'only-summary' ||
    value === 'export-all' ||
    value === 'failure-job' ||
    value === 'failure-step'
    ? value
    : undefined;
}

export function createDefaultActionsRunExportOptions(): ActionsRunExportOptions {
  return { ...presetOptions['export-all'] };
}

export function sanitizeActionsRunExportOptions(value: unknown): Partial<ActionsRunExportOptions> {
  if (!isRecord(value)) {
    return {};
  }

  const result: Partial<ActionsRunExportOptions> = {};
  actionsRunOptionKeys.forEach((key) => {
    const parsed = readBoolean(value[key]);
    if (typeof parsed === 'boolean') {
      result[key] = parsed;
    }
  });
  return result;
}

function normalizeOptions(options: ActionsRunExportOptions): ActionsRunExportOptions {
  const next = { ...options };

  if (!next.includeJobs) {
    next.includeSteps = false;
    next.onlyFailureJobs = false;
    next.onlyFailureSteps = false;
    return next;
  }

  if (!next.includeSteps) {
    next.onlyFailureSteps = false;
  }

  if (!next.onlyFailureJobs) {
    next.onlyFailureSteps = false;
  }

  return next;
}

export function resolveActionsRunExportOptions(params: {
  preset?: ActionsRunExportPreset;
  options?: Partial<ActionsRunExportOptions>;
}): {
  preset: ActionsRunExportPreset;
  options: ActionsRunExportOptions;
} {
  const preset = params.preset ?? 'export-all';
  const merged = {
    ...presetOptions[preset],
    ...sanitizeActionsRunExportOptions(params.options),
  };

  return {
    preset,
    options: normalizeOptions(merged),
  };
}
