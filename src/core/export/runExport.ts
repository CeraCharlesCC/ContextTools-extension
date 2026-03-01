import type { ExportRequest, ExportResult } from '@core/model';
import { mapGitHubError } from './errors/mapGitHubError';
import { runExportPipeline, type ExportPipelineDeps } from './pipeline';

export async function runExport(
  request: ExportRequest,
  deps: ExportPipelineDeps,
): Promise<ExportResult> {
  try {
    const output = await runExportPipeline(request, deps);
    return {
      ok: true,
      markdown: output.markdown,
      warning: output.warning,
    };
  } catch (error) {
    const mapped = mapGitHubError(error);
    return {
      ok: false,
      code: mapped.code,
      message: mapped.message,
    };
  }
}
