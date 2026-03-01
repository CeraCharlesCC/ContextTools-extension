import {
  enforceActionsRunInvariants,
  isActionsRunPreset,
  resolveActionsRunPreset,
  type ActionsRunExportOptions,
  type ActionsRunPreset,
} from '@core/model';

const actionsRunOptionKeys: ReadonlyArray<keyof ActionsRunExportOptions> = [
  'includeSummary',
  'includeJobs',
  'includeSteps',
  'onlyFailureJobs',
  'onlyFailureSteps',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function readActionsRunPreset(value: unknown): ActionsRunPreset | undefined {
  return isActionsRunPreset(value) ? value : undefined;
}

export function createDefaultActionsRunExportOptions(): ActionsRunExportOptions {
  return resolveActionsRunPreset('export-all');
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

export function resolveActionsRunExportOptions(params: {
  preset?: ActionsRunPreset;
  options?: Partial<ActionsRunExportOptions>;
}): {
  preset: ActionsRunPreset;
  options: ActionsRunExportOptions;
} {
  const preset = params.preset ?? 'export-all';

  return {
    preset,
    options: enforceActionsRunInvariants(
      resolveActionsRunPreset(preset, sanitizeActionsRunExportOptions(params.options)),
    ),
  };
}
