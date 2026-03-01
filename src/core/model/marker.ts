export type MarkerType = 'issue-comment' | 'review-comment' | 'review';

export interface MarkerId {
  type: MarkerType;
  id: number;
}

export interface MarkerRange {
  start?: MarkerId | null;
  end?: MarkerId | null;
}

export function markerKey(marker: MarkerId): string {
  return `${marker.type}:${marker.id}`;
}

export function isIssueCommentMarker(marker: MarkerId): boolean {
  return marker.type === 'issue-comment';
}
