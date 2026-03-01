import { ALL_SELECTION, type Selection } from './selection';
import type { ExportProfile } from './profile';
import type { Target } from './target';

export interface ExportRequest {
  requestId: string;
  target: Target;
  selection?: Selection;
  profile?: ExportProfile;
}

export function normalizeSelection(selection?: Selection): Selection {
  return selection ?? ALL_SELECTION;
}
