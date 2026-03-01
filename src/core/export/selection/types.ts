import type { MarkerRange } from '@core/model';
import type { GitHubIssueComment } from '@core/github/types';
import type { TimelineEvent } from '@core/markdown/pull';

export type SlicePullTimelineResult =
  | {
      events: TimelineEvent[];
      warning?: string;
    }
  | {
      error: string;
    };

export type SliceIssueCommentsResult =
  | {
      comments: GitHubIssueComment[];
      warning?: string;
    }
  | {
      error: string;
    };

export interface SelectionInput {
  range?: MarkerRange;
}
