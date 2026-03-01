export type ExportErrorCode =
  | 'aborted'
  | 'rateLimited'
  | 'unauthorized'
  | 'notFound'
  | 'network'
  | 'invalidSelection'
  | 'invalidRequest'
  | 'unknown';

export interface ExportSuccessResult {
  ok: true;
  markdown: string;
  warning?: string;
}

export interface ExportFailureResult {
  ok: false;
  code: ExportErrorCode;
  message: string;
  warning?: string;
}

export type ExportResult = ExportSuccessResult | ExportFailureResult;
