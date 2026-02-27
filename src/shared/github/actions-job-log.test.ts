import { describe, expect, it } from 'vitest';
import { attachActionsJobStepLogs } from './actions-job-log';
import type { GitHubActionsJob } from './types';

describe('attachActionsJobStepLogs', () => {
  it('maps raw job logs to step logs and strips timestamp prefixes', () => {
    const job: GitHubActionsJob = {
      id: 42,
      name: 'test',
      steps: [
        {
          number: 1,
          name: 'Checkout',
          started_at: '2026-02-27T01:00:00Z',
          completed_at: '2026-02-27T01:00:10Z',
        },
        {
          number: 2,
          name: 'Test Module',
          started_at: '2026-02-27T01:00:11Z',
          completed_at: '2026-02-27T01:00:50Z',
        },
      ],
    };

    const rawLog = [
      '2026-02-27T01:00:02.000Z ##[group]Checkout',
      '2026-02-27T01:00:03.000Z cloning repo...',
      '2026-02-27T01:00:10.000Z ##[endgroup]',
      '2026-02-27T01:00:12.000Z ##[group]Run go test ./...',
      '2026-02-27T01:00:13.000Z go: downloading modernc.org/sqlite v1.46.1',
      '2026-02-27T01:00:40.000Z --- FAIL: TestResolveStateDir_DefaultMatchesPlatformParityLayout (0.00s)',
      '2026-02-27T01:00:41.000Z FAIL',
      '2026-02-27T01:00:50.000Z ##[endgroup]',
    ].join('\n');

    const result = attachActionsJobStepLogs(job, rawLog);
    const steps = result.steps ?? [];

    expect(steps[0].log).toContain('Checkout');
    expect(steps[0].log).toContain('cloning repo...');
    expect(steps[1].log).toContain('Run go test ./...');
    expect(steps[1].log).toContain('go: downloading modernc.org/sqlite v1.46.1');
    expect(steps[1].log).toContain('--- FAIL: TestResolveStateDir_DefaultMatchesPlatformParityLayout (0.00s)');
  });
});
