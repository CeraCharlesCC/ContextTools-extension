import { describe, expect, it } from 'vitest';
import { TtlCache, createCacheKey } from './cache';

describe('TtlCache', () => {
  it('returns cached values before expiry and evicts expired entries', () => {
    let now = 1_000;
    const cache = new TtlCache<number>(100, () => now);

    cache.set('a', 42);
    expect(cache.get('a')).toBe(42);

    now = 1_050;
    expect(cache.get('a')).toBe(42);

    now = 1_101;
    expect(cache.get('a')).toBeUndefined();
  });

  it('builds stable cache keys', () => {
    const key = createCacheKey(['commit', 'token', 'octocat', 'hello-world', 123]);
    expect(key).toBe('commit|token|octocat|hello-world|123');
  });
});
