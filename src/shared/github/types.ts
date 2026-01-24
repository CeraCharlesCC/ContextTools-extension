export type PageKind = 'issue' | 'pull';

export type MarkerType = 'issue-comment' | 'review-comment' | 'review';

export interface Marker {
  type: MarkerType;
  id: number;
}

export interface PageRef {
  owner: string;
  repo: string;
  number: number;
  kind: PageKind;
}

export interface MarkerRange {
  start?: Marker | null;
  end?: Marker | null;
}

export interface GenerateMarkdownPayload {
  page: PageRef;
  range?: MarkerRange;
}

export interface GenerateMarkdownResponse {
  ok: true;
  markdown: string;
  warning?: string;
}

export interface GenerateMarkdownError {
  ok: false;
  error: string;
  code?: string;
}

export type GenerateMarkdownResult = GenerateMarkdownResponse | GenerateMarkdownError;
