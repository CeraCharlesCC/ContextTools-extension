import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultProfiles, type Target } from '@core/model';
import { LastProfileStore } from './LastProfileStore';

const storage = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('@ext/bridge/storage', () => ({ storageGet: storage.get, storageSet: storage.set }));

const pull: Target = { kind: 'pull', owner: 'octocat', repo: 'hello-world', number: 1 };
const issue: Target = { kind: 'issue', owner: 'octocat', repo: 'hello-world', number: 2 };

describe('LastProfileStore persistence', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    let state: unknown = null;
    storage.get.mockImplementation(async () => structuredClone(state));
    storage.set.mockImplementation(async (_key, next) => { state = structuredClone(next); });
  });

  it.each(['global', 'repo'] as const)('preserves concurrent %s profiles for different target kinds', async (scope) => {
    const store = new LastProfileStore();
    const profiles = createDefaultProfiles();
    await Promise.all([
      store.set(scope, pull, profiles.pull),
      store.set(scope, issue, profiles.issue),
    ]);

    expect(await store.get(scope, pull)).toEqual(profiles.pull);
    expect(await store.get(scope, issue)).toEqual(profiles.issue);
  });

  it('preserves concurrent profiles for different repositories', async () => {
    const store = new LastProfileStore();
    const profile = createDefaultProfiles().pull;
    const other = { ...pull, repo: 'other' };
    await Promise.all([store.set('repo', pull, profile), store.set('repo', other, profile)]);

    expect(await store.get('repo', pull)).toEqual(profile);
    expect(await store.get('repo', other)).toEqual(profile);
  });

  it('recovers after a failed write', async () => {
    const store = new LastProfileStore();
    const profile = createDefaultProfiles().pull;
    storage.set.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(store.set('global', pull, profile)).rejects.toThrow('Storage unavailable');
    await store.set('global', pull, profile);
    expect(await store.get('global', pull)).toEqual(profile);
  });
});
