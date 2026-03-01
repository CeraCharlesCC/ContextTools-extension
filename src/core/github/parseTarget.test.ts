import { describe, expect, it } from 'vitest';
import { parseTarget } from './parseTarget';

describe('parseTarget', () => {
  it('parses pull request paths', () => {
    expect(parseTarget('/octocat/hello-world/pull/123')).toEqual({
      kind: 'pull',
      owner: 'octocat',
      repo: 'hello-world',
      number: 123,
    });
  });

  it('parses issue paths', () => {
    expect(parseTarget('/octocat/hello-world/issues/77')).toEqual({
      kind: 'issue',
      owner: 'octocat',
      repo: 'hello-world',
      number: 77,
    });
  });

  it('parses actions run paths and trailing segments', () => {
    expect(parseTarget('/octocat/hello-world/actions/runs/999')).toEqual({
      kind: 'actionsRun',
      owner: 'octocat',
      repo: 'hello-world',
      runId: 999,
    });

    expect(parseTarget('/octocat/hello-world/actions/runs/999/attempts/3')).toEqual({
      kind: 'actionsRun',
      owner: 'octocat',
      repo: 'hello-world',
      runId: 999,
    });
  });

  it('returns null for unrelated paths', () => {
    expect(parseTarget('/octocat/hello-world/actions')).toBeNull();
    expect(parseTarget('/')).toBeNull();
  });
});
