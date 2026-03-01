import type {
  BridgeMethodName,
  BridgeRequestEnvelope,
  BridgeResponseEnvelope,
  BridgeResponsePayload,
} from './protocol';
import {
  bridgeMethodSchemas,
  bridgeRequestEnvelopeBaseSchema,
  bridgeResponseEnvelopeBaseSchema,
} from './schemas';

function formatValidationError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Invalid bridge message payload.';
}

export function isBridgeRequestEnvelope(raw: unknown): boolean {
  return bridgeRequestEnvelopeBaseSchema.safeParse(raw).success;
}

export function validateRequestEnvelope(raw: unknown): BridgeRequestEnvelope {
  const base = bridgeRequestEnvelopeBaseSchema.parse(raw);
  const payloadSchema = bridgeMethodSchemas[base.method].request;
  const payload = payloadSchema.parse(base.payload);

  return {
    kind: 'ctx.bridge.request',
    id: base.id,
    method: base.method,
    payload,
  } as BridgeRequestEnvelope;
}

export function validateResponsePayload<M extends BridgeMethodName>(
  method: M,
  payload: unknown,
): BridgeResponsePayload<M> {
  const payloadSchema = bridgeMethodSchemas[method].response;
  return payloadSchema.parse(payload) as BridgeResponsePayload<M>;
}

export function validateResponseEnvelope<M extends BridgeMethodName>(
  raw: unknown,
  expected: {
    id: string;
    method: M;
  },
): BridgeResponseEnvelope<M> {
  const base = bridgeResponseEnvelopeBaseSchema.parse(raw);

  if (base.id !== expected.id) {
    throw new Error(`Mismatched bridge response id. Expected ${expected.id}, got ${base.id}.`);
  }

  if (base.method !== expected.method) {
    throw new Error(`Mismatched bridge response method. Expected ${expected.method}, got ${base.method}.`);
  }

  if (!base.ok) {
    return {
      kind: 'ctx.bridge.response',
      id: base.id,
      method: expected.method,
      ok: false,
      error: {
        message: base.error?.message ?? 'Bridge call failed.',
        code: base.error?.code,
      },
    };
  }

  const payload = validateResponsePayload(expected.method, base.payload);
  return {
    kind: 'ctx.bridge.response',
    id: base.id,
    method: expected.method,
    ok: true,
    payload,
  };
}

export function toBridgeValidationError(error: unknown): Error {
  return new Error(formatValidationError(error));
}
