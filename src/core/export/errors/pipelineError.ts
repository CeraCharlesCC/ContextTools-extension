import type { ExportErrorCode } from '@core/model';

export class ExportPipelineError extends Error {
  readonly code: ExportErrorCode;

  constructor(code: ExportErrorCode, message: string) {
    super(message);
    this.name = 'ExportPipelineError';
    this.code = code;
  }
}
