import type {
  BridgeMethodName,
  BridgeRequestEnvelope,
  BridgeRequestPayload,
  BridgeResponsePayload,
} from './protocol';
import { runtimeSendMessage } from './transport';
import { toBridgeValidationError, validateResponseEnvelope } from './validate';

let requestCounter = 0;

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  requestCounter += 1;
  return `ctx-${Date.now()}-${requestCounter}`;
}

export class BridgeClient {
  async call<M extends BridgeMethodName>(
    method: M,
    payload: BridgeRequestPayload<M>,
  ): Promise<BridgeResponsePayload<M>> {
    const request: BridgeRequestEnvelope<M> = {
      kind: 'ctx.bridge.request',
      id: createRequestId(),
      method,
      payload,
    };

    const rawResponse = await runtimeSendMessage<BridgeRequestEnvelope<M>, unknown>(request);

    let response;
    try {
      response = validateResponseEnvelope(rawResponse, {
        id: request.id,
        method,
      });
    } catch (error) {
      throw toBridgeValidationError(error);
    }

    if (!response.ok) {
      const bridgeError = new Error(response.error.message);
      bridgeError.name = response.error.code ?? 'BridgeCallError';
      throw bridgeError;
    }

    return response.payload;
  }
}

export const bridgeClient = new BridgeClient();
