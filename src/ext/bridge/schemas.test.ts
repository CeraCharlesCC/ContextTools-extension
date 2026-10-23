import { describe, expect, it } from 'vitest';
import { createDefaultSettingsV1 } from '@core/model';
import { validateRequestEnvelope, validateResponseEnvelope } from './validate';

describe('bridge schema validation', () => {
  it('rejects invalid request payloads', () => {
    expect(() =>
      validateRequestEnvelope({
        kind: 'ctx.bridge.request',
        id: 'req-1',
        method: 'export.cancel',
        payload: {},
      }),
    ).toThrow();
  });

  it('accepts valid request and response envelopes', () => {
    const request = validateRequestEnvelope({
      kind: 'ctx.bridge.request',
      id: 'req-2',
      method: 'settings.get',
      payload: null,
    });

    expect(request.method).toBe('settings.get');

    const response = validateResponseEnvelope(
      {
        kind: 'ctx.bridge.response',
        id: 'req-2',
        method: 'settings.get',
        ok: true,
        payload: createDefaultSettingsV1(),
      },
      {
        id: 'req-2',
        method: 'settings.get',
      },
    );

    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error('Expected success response.');
    }

    expect(response.payload.version).toBe(1);
  });

  it('rejects invalid success payloads in responses', () => {
    expect(() =>
      validateResponseEnvelope(
        {
          kind: 'ctx.bridge.response',
          id: 'req-3',
          method: 'auth.getToken',
          ok: true,
          payload: { token: 123 },
        },
        {
          id: 'req-3',
          method: 'auth.getToken',
        },
      ),
    ).toThrow();
  });
});

describe('bridge repository targets', () => {
  const envelope = (target: unknown) => ({
    kind: 'ctx.bridge.request',
    id: 'target-validation',
    method: 'profile.getEffective',
    payload: { target },
  });

  it.each(['.', '..', 'org/repo', 'repo?path=x', 'repo#fragment', '%2e%2e', 'repo\\path', ''])('rejects route-changing path segment %j', (segment) => {
    const target = { kind: 'pull', owner: 'octocat', repo: 'hello-world', number: 1 };
    expect(() => validateRequestEnvelope(envelope({ ...target, owner: segment }))).toThrow();
    expect(() => validateRequestEnvelope(envelope({ ...target, repo: segment }))).toThrow();
  });

  it('accepts repository names with dots, underscores, and hyphens', () => {
    expect(() => validateRequestEnvelope(envelope({
      kind: 'issue', owner: 'my-org', repo: '.github_test-repo', number: 1,
    }))).not.toThrow();
  });

  it.each([
    { kind: 'issue', number: Number.MAX_SAFE_INTEGER + 1 },
    { kind: 'pull', number: Number.MAX_SAFE_INTEGER + 1 },
    { kind: 'actionsRun', runId: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects imprecise numeric target identifiers: %j', (target) => {
    expect(() => validateRequestEnvelope(envelope({ ...target, owner: 'octocat', repo: 'repo' }))).toThrow();
  });
});
