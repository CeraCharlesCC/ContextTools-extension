import type {
  ExportProfile,
  ExportRequest,
  ExportResult,
  SettingsPatchV1,
  SettingsV1,
  Target,
} from '@core/model';

export interface BridgeMethodMap {
  'export.run': {
    request: ExportRequest;
    response: ExportResult;
  };
  'export.cancel': {
    request: { requestId: string };
    response: { ok: true };
  };
  'settings.get': {
    request: null;
    response: SettingsV1;
  };
  'settings.patch': {
    request: SettingsPatchV1;
    response: SettingsV1;
  };
  'auth.getToken': {
    request: null;
    response: { token: string };
  };
  'auth.setToken': {
    request: { token: string };
    response: { ok: true };
  };
  'profile.getEffective': {
    request: {
      target: Target;
      profile?: ExportProfile | null;
    };
    response: {
      profile: ExportProfile;
      source: 'request' | 'last' | 'default';
    };
  };
  'options.open': {
    request: null;
    response: { ok: true };
  };
}

export type BridgeMethodName = keyof BridgeMethodMap;

export type BridgeRequestPayload<M extends BridgeMethodName> = BridgeMethodMap[M]['request'];
export type BridgeResponsePayload<M extends BridgeMethodName> = BridgeMethodMap[M]['response'];

export interface BridgeRequestEnvelope<M extends BridgeMethodName = BridgeMethodName> {
  kind: 'ctx.bridge.request';
  id: string;
  method: M;
  payload: BridgeRequestPayload<M>;
}

export interface BridgeSuccessEnvelope<M extends BridgeMethodName = BridgeMethodName> {
  kind: 'ctx.bridge.response';
  id: string;
  method: M;
  ok: true;
  payload: BridgeResponsePayload<M>;
}

export interface BridgeErrorEnvelope<M extends BridgeMethodName = BridgeMethodName> {
  kind: 'ctx.bridge.response';
  id: string;
  method: M;
  ok: false;
  error: {
    message: string;
    code?: string;
  };
}

export type BridgeResponseEnvelope<M extends BridgeMethodName = BridgeMethodName> =
  | BridgeSuccessEnvelope<M>
  | BridgeErrorEnvelope<M>;

export interface BridgeSender {
  tabId?: number;
  frameId?: number;
  url?: string;
}

export type BridgeHandler<M extends BridgeMethodName> = (
  payload: BridgeRequestPayload<M>,
  sender: BridgeSender,
) => Promise<BridgeResponsePayload<M>> | BridgeResponsePayload<M>;

export type BridgeHandlerMap = {
  [M in BridgeMethodName]: BridgeHandler<M>;
};
