import { describe, expect, it } from 'vitest';
import { resolveActionsRunExportOptions } from './actionsRunExport';

describe('resolveActionsRunExportOptions', () => {
  it('returns expected options for actions run presets', () => {
    expect(resolveActionsRunExportOptions({ preset: 'only-summary' }).options).toEqual({
      includeSummary: true,
      includeJobs: false,
      includeSteps: false,
      onlyFailureJobs: false,
      onlyFailureSteps: false,
    });

    expect(resolveActionsRunExportOptions({ preset: 'export-all' }).options).toEqual({
      includeSummary: true,
      includeJobs: true,
      includeSteps: true,
      onlyFailureJobs: false,
      onlyFailureSteps: false,
    });

    expect(resolveActionsRunExportOptions({ preset: 'failure-job' }).options).toEqual({
      includeSummary: true,
      includeJobs: true,
      includeSteps: true,
      onlyFailureJobs: true,
      onlyFailureSteps: false,
    });

    expect(resolveActionsRunExportOptions({ preset: 'failure-step' }).options).toEqual({
      includeSummary: true,
      includeJobs: true,
      includeSteps: true,
      onlyFailureJobs: true,
      onlyFailureSteps: true,
    });
  });
});
