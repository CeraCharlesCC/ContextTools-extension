import type { Marker, PageRef } from './types';

const OWNER_REPO = '([A-Za-z0-9_.-]+)\\/([A-Za-z0-9_.-]+)';
const ISSUE_PATH = new RegExp(`^\\/${OWNER_REPO}\\/issues\\/(\\d+)`, 'i');
const PR_PATH = new RegExp(`^\\/${OWNER_REPO}\\/pull\\/(\\d+)`, 'i');
const ACTIONS_RUN_PATH = new RegExp(`^\\/${OWNER_REPO}\\/actions\\/runs\\/(\\d+)`, 'i');

const ISSUE_ANCHOR = /issuecomment-(\d+)/i;
const REVIEW_COMMENT_ANCHOR = /discussion_r(\d+)/i;
const REVIEW_ANCHOR = /pullrequestreview-(\d+)/i;

export function parsePageRef(pathname: string): PageRef | null {
  const issueMatch = pathname.match(ISSUE_PATH);
  if (issueMatch) {
    const [, owner, repo, number] = issueMatch;
    return { owner, repo, number: Number(number), kind: 'issue' };
  }

  const prMatch = pathname.match(PR_PATH);
  if (prMatch) {
    const [, owner, repo, number] = prMatch;
    return { owner, repo, number: Number(number), kind: 'pull' };
  }

  const actionsRunMatch = pathname.match(ACTIONS_RUN_PATH);
  if (actionsRunMatch) {
    const [, owner, repo, runId] = actionsRunMatch;
    return { owner, repo, runId: Number(runId), kind: 'actions-run' };
  }

  return null;
}

export function markerFromAnchor(anchor: string): Marker | null {
  const issueMatch = anchor.match(ISSUE_ANCHOR);
  if (issueMatch) {
    return { type: 'issue-comment', id: Number(issueMatch[1]) };
  }

  const reviewCommentMatch = anchor.match(REVIEW_COMMENT_ANCHOR);
  if (reviewCommentMatch) {
    return { type: 'review-comment', id: Number(reviewCommentMatch[1]) };
  }

  const reviewMatch = anchor.match(REVIEW_ANCHOR);
  if (reviewMatch) {
    return { type: 'review', id: Number(reviewMatch[1]) };
  }

  return null;
}

export function findMarkerInElement(element: Element | null): Marker | null {
  if (!element) return null;

  const id = element.getAttribute('id');
  if (id) {
    const marker = markerFromAnchor(id);
    if (marker) return marker;
  }

  const anchor = element.getAttribute('href');
  if (anchor) {
    const marker = markerFromAnchor(anchor);
    if (marker) return marker;
  }

  const idHost = element.closest('[id^="issuecomment-"], [id^="discussion_r"], [id^="pullrequestreview-"]');
  if (idHost) {
    const hostId = idHost.getAttribute('id');
    if (hostId) {
      const marker = markerFromAnchor(hostId);
      if (marker) return marker;
    }
  }

  const anchorEl = element.querySelector('a[href*="issuecomment-"], a[href*="discussion_r"], a[href*="pullrequestreview-"]');
  if (anchorEl) {
    const href = anchorEl.getAttribute('href');
    if (href) {
      const marker = markerFromAnchor(href);
      if (marker) return marker;
    }
  }

  return null;
}
