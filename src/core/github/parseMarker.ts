import type { MarkerId } from '@core/model';

const ISSUE_ANCHOR = /issuecomment-(\d+)/i;
const REVIEW_COMMENT_ANCHOR = /discussion_r(\d+)/i;
const REVIEW_ANCHOR = /pullrequestreview-(\d+)/i;

export function markerFromAnchor(anchor: string): MarkerId | null {
  const issueMatch = anchor.match(ISSUE_ANCHOR);
  if (issueMatch) {
    return {
      type: 'issue-comment',
      id: Number(issueMatch[1]),
    };
  }

  const reviewCommentMatch = anchor.match(REVIEW_COMMENT_ANCHOR);
  if (reviewCommentMatch) {
    return {
      type: 'review-comment',
      id: Number(reviewCommentMatch[1]),
    };
  }

  const reviewMatch = anchor.match(REVIEW_ANCHOR);
  if (reviewMatch) {
    return {
      type: 'review',
      id: Number(reviewMatch[1]),
    };
  }

  return null;
}
