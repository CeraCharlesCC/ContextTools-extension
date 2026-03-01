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
