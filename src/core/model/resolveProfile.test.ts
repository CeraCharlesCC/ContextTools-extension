import { describe, expect, it } from 'vitest';
import {
  createDefaultSettingsV1,
  resolveEffectiveProfile,
  resolvePullPreset,
  type ExportProfile,
} from '@core/model';

describe('resolveEffectiveProfile', () => {
  it('prefers request profile over remembered and defaults', () => {
    const defaults = createDefaultSettingsV1().defaults;

    const requestProfile: ExportProfile = {
      kind: 'pull',
      preset: 'custom',
      options: resolvePullPreset('custom', {
        includeCommits: false,
        includeCommitDiffs: true,
        smartDiffMode: true,
      }),
    };

    const rememberedProfile: ExportProfile = {
      kind: 'pull',
      preset: 'with-diffs',
      options: resolvePullPreset('with-diffs'),
    };

    const result = resolveEffectiveProfile({
      targetKind: 'pull',
      defaults,
      requestProfile,
      rememberedProfile,
    });

    expect(result.source).toBe('request');
    expect(result.profile.kind).toBe('pull');
    if (result.profile.kind !== 'pull') {
      throw new Error('Expected pull profile');
    }
    expect(result.profile.options.includeCommitDiffs).toBe(false);
    expect(result.profile.options.smartDiffMode).toBe(false);
  });

  it('uses remembered profile when request profile is missing', () => {
    const defaults = createDefaultSettingsV1().defaults;
    const rememberedProfile: ExportProfile = {
      kind: 'issue',
      timelineMode: false,
    };

    const result = resolveEffectiveProfile({
      targetKind: 'issue',
      defaults,
      rememberedProfile,
    });

    expect(result.source).toBe('last');
    expect(result.profile).toEqual({
      kind: 'issue',
      timelineMode: false,
    });
  });

  it('falls back to defaults when no request or remembered profile exists', () => {
    const defaults = createDefaultSettingsV1().defaults;

    const result = resolveEffectiveProfile({
      targetKind: 'actionsRun',
      defaults,
    });

    expect(result.source).toBe('default');
    expect(result.profile.kind).toBe('actionsRun');
  });
});
