import type { MarkerRange } from '@core/model';
import type { GitHubIssueComment } from '@core/github/types';
import type { SliceIssueCommentsResult } from './types';

export function sliceIssueComments(
  comments: GitHubIssueComment[],
  range?: MarkerRange,
): SliceIssueCommentsResult {
  if (!range?.start && !range?.end) {
    return { comments };
  }

  if (!comments.length) {
    return { error: 'No issue comments were found for this issue.' };
  }

  if (range.start && range.start.type !== 'issue-comment') {
    return { error: 'Start marker must be an issue comment.' };
  }

  if (range.end && range.end.type !== 'issue-comment') {
    return { error: 'End marker must be an issue comment.' };
  }

  const startIndex = range.start
    ? comments.findIndex((comment) => comment.id === range.start?.id)
    : 0;
  const endIndex = range.end
    ? comments.findIndex((comment) => comment.id === range.end?.id)
    : comments.length - 1;

  if (startIndex === -1 || endIndex === -1) {
    return { error: 'Selected marker could not be found in the issue comments.' };
  }

  let start = startIndex;
  let end = endIndex;
  let warning: string | undefined;

  if (start > end) {
    [start, end] = [end, start];
    warning = 'Markers were reversed, so the export range was swapped.';
  }

  return {
    comments: comments.slice(start, end + 1),
    warning,
  };
}
