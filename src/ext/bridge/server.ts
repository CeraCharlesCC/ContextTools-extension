import type {
  BridgeHandler,
  BridgeHandlerMap,
  BridgeMethodName,
  BridgeRequestEnvelope,
  BridgeRequestPayload,
  BridgeResponseEnvelope,
  BridgeResponsePayload,
} from './protocol';
import { addRuntimeMessageListener } from './transport';
import {
  isBridgeRequestEnvelope,
  toBridgeValidationError,
  validateRequestEnvelope,
  validateResponsePayload,
} from './validate';

function toBridgeError(error: unknown): { message: string; code?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      code: error.name,
    };
  }

  return {
    message: 'Unknown bridge handler error.',
  };
}

function errorEnvelope<M extends BridgeMethodName>(
  request: Pick<BridgeRequestEnvelope<M>, 'id' | 'method'>,
  error: unknown,
): BridgeResponseEnvelope<M> {
  return {
    kind: 'ctx.bridge.response',
    id: request.id,
    method: request.method,
    ok: false,
    error: toBridgeError(error),
  };
}

async function invokeHandler<M extends BridgeMethodName>(
  handlers: BridgeHandlerMap,
  request: BridgeRequestEnvelope<M>,
  sender: { tabId?: number; frameId?: number; url?: string },
): Promise<BridgeResponseEnvelope<M>> {
  const handler = handlers[request.method] as BridgeHandler<M>;
  const result = await handler(request.payload as BridgeRequestPayload<M>, sender);
  const validatedPayload = validateResponsePayload(request.method, result) as BridgeResponsePayload<M>;

  return {
    kind: 'ctx.bridge.response',
    id: request.id,
    method: request.method,
    ok: true,
    payload: validatedPayload,
  };
}

export function registerBridgeHandlers(handlers: BridgeHandlerMap): void {
  addRuntimeMessageListener<unknown, unknown>(async (rawMessage, sender) => {
    if (!isBridgeRequestEnvelope(rawMessage)) {
      return null;
    }

    let request: BridgeRequestEnvelope;
    try {
      request = validateRequestEnvelope(rawMessage);
    } catch (error) {
      const base = rawMessage as { id?: string; method?: BridgeMethodName };
      const fallback = {
        id: typeof base.id === 'string' ? base.id : 'unknown',
        method: (base.method ?? 'settings.get') as BridgeMethodName,
      };
      return errorEnvelope(fallback, toBridgeValidationError(error));
    }

    try {
      return await invokeHandler(handlers, request, sender);
    } catch (error) {
      return errorEnvelope(request, error);
    }
  });
}
