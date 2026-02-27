import { describe, expect, it } from 'vitest';
import { parsePageRef } from './parse';

describe('parsePageRef actions-run', () => {
  it('parses actions run URL', () => {
    expect(parsePageRef('/octocat/hello-world/actions/runs/123')).toEqual({
      owner: 'octocat',
      repo: 'hello-world',
      runId: 123,
      kind: 'actions-run',
    });
  });

  it('parses actions run URL with trailing segments', () => {
    expect(parsePageRef('/octocat/hello-world/actions/runs/123/attempts/2')).toEqual({
      owner: 'octocat',
      repo: 'hello-world',
      runId: 123,
      kind: 'actions-run',
    });
  });

  it('does not parse non-run actions URLs', () => {
    expect(parsePageRef('/octocat/hello-world/actions')).toBeNull();
    expect(parsePageRef('/octocat/hello-world/actions/workflows/ci.yml')).toBeNull();
  });
});
