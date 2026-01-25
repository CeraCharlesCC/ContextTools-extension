import { formatDate, formatUser } from '../format';

export type TimelineEvent =
  | { type: 'commit'; date?: string; commit: any }
  | { type: 'issue-comment'; date: string; comment: any; id: number }
  | { type: 'review-comment'; date: string; comment: any; id: number }
  | { type: 'review'; date?: string; review: any; id: number };

function renderLabels(labels: Array<{ name?: string }> | null | undefined): string {
  if (!labels || !labels.length) return 'None';
  return labels.map((label) => `\`${label.name ?? ''}\``).join(', ');
}

function renderBody(lines: string[], body: string | null | undefined, fallback: string): void {
  lines.push(body?.trim() ? body.trim() : fallback);
}

function renderFileDiff(lines: string[], file: any, heading: string): void {
  const additions = typeof file.additions === 'number' ? file.additions : 0;
  const deletions = typeof file.deletions === 'number' ? file.deletions : 0;
  const status = file.status || 'modified';
  lines.push(`${heading} ${file.filename} (${status}, +${additions} -${deletions})`);
  if (file.patch) {
    lines.push('```diff');
    lines.push(file.patch);
    lines.push('```');
  } else {
    lines.push('_Binary file or no patch available._');
  }
}

function formatCommitAuthor(commit: any): string {
  if (commit?.author?.login) {
    return formatUser(commit.author);
  }
  const name = commit?.commit?.author?.name || commit?.commit?.committer?.name;
  return name || 'Unknown';
}

function commitSubject(message: string): string {
  if (!message) return 'No commit message';
  return message.split('\n')[0].trim() || 'No commit message';
}

function commitBody(message: string): string {
  if (!message) return '';
  const body = message.split('\n').slice(1).join('\n').trim();
  return body;
}

function renderCommitEntry(lines: string[], commit: any, index: number, date: string | undefined, options: { heading: string; diffHeading: string; includeFiles?: boolean }): void {
  const sha = commit?.sha ? commit.sha.slice(0, 7) : 'unknown';
  const message = commit?.commit?.message || '';
  const subject = commitSubject(message);
  const body = commitBody(message);
  lines.push('');
  lines.push(`${options.heading} ${index + 1}. Commit ${sha} - ${subject}`);
  lines.push(`Author: ${formatCommitAuthor(commit)} on ${formatDate(date)}`);
  if (body) {
    lines.push(body);
  }
  if (options.includeFiles && commit?.files?.length) {
    commit.files.forEach((file: any) => {
      lines.push('');
      renderFileDiff(lines, file, options.diffHeading);
    });
  }
}

function normalizeEvents(events: TimelineEvent[]): Array<TimelineEvent & { index: number }> {
  const indexedEvents = events.map((event, index) => ({ ...event, index }));
  indexedEvents.sort((a, b) => {
    const aTime = a.date ? new Date(a.date).getTime() : 0;
    const bTime = b.date ? new Date(b.date).getTime() : 0;
    if (aTime === bTime) return a.index - b.index;
    return aTime - bTime;
  });
  return indexedEvents;
}

export function buildTimelineEvents(input: {
  commits?: any[];
  issueComments?: any[];
  reviewComments?: any[];
  reviews?: any[];
}): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  if (input.commits?.length) {
    input.commits.forEach((commit) => {
      const date = commit?.commit?.author?.date || commit?.commit?.committer?.date;
      events.push({ type: 'commit', date, commit });
    });
  }

  if (input.issueComments?.length) {
    input.issueComments.forEach((comment) => {
      events.push({ type: 'issue-comment', date: comment.created_at, comment, id: comment.id });
    });
  }

  if (input.reviewComments?.length) {
    input.reviewComments.forEach((comment) => {
      events.push({ type: 'review-comment', date: comment.created_at, comment, id: comment.id });
    });
  }

  if (input.reviews?.length) {
    input.reviews.forEach((review) => {
      const date = review.submitted_at || review.created_at;
      events.push({ type: 'review', date, review, id: review.id });
    });
  }

  return normalizeEvents(events);
}

export function renderTimelineSection(
  lines: string[],
  events: TimelineEvent[],
  options?: { includeCommitFiles?: boolean; heading?: string }
): void {
  const normalized = normalizeEvents(events);
  if (!normalized.length) return;

  const heading = options?.heading ?? `Timeline (${normalized.length})`;
  lines.push('');
  lines.push(`## ${heading}`);

  normalized.forEach((event, index) => {
    if (event.type === 'commit') {
      renderCommitEntry(lines, event.commit, index, event.date, {
        heading: '###',
        diffHeading: '####',
        includeFiles: options?.includeCommitFiles,
      });
      return;
    }

    if (event.type === 'issue-comment') {
      const comment = event.comment;
      lines.push('');
      lines.push(`### ${index + 1}. Issue Comment - ${formatUser(comment.user)} on ${formatDate(comment.created_at)}`);
      renderBody(lines, comment.body, '_No comment body._');
      return;
    }

    if (event.type === 'review-comment') {
      const comment = event.comment;
      const location = comment.path ? ` - ${comment.path}${comment.line ? `:${comment.line}` : ''}` : '';
      lines.push('');
      lines.push(
        `### ${index + 1}. Review Comment - ${formatUser(comment.user)} on ${formatDate(comment.created_at)}${location}`
      );
      renderBody(lines, comment.body, '_No comment body._');
      if (comment.diff_hunk) {
        lines.push('```diff');
        lines.push(comment.diff_hunk);
        lines.push('```');
      }
      return;
    }

    if (event.type === 'review') {
      const review = event.review;
      const stateLabel = review.state?.toLowerCase() || 'commented';
      lines.push('');
      lines.push(
        `### ${index + 1}. Review - ${formatUser(review.user)} (${stateLabel}) on ${formatDate(
          review.submitted_at || review.created_at
        )}`
      );
      renderBody(lines, review.body, '_No review body._');
    }
  });
}

export function prToMarkdown(input: {
  pr: any;
  files?: any[];
  issueComments?: any[];
  reviewComments?: any[];
  reviews?: any[];
  commits?: any[];
  historicalMode?: boolean;
  includeFiles?: boolean;
  includeCommit?: boolean;
}): string {
  const lines: string[] = [];
  const state = input.pr.merged ? 'merged' : input.pr.state;

  lines.push(`# PR: ${input.pr.title}`);
  lines.push('');
  lines.push(`- URL: ${input.pr.html_url}`);
  lines.push(`- State: ${state}`);
  lines.push(`- Author: ${formatUser(input.pr.user)}`);
  lines.push(`- Created: ${formatDate(input.pr.created_at)}`);
  lines.push(`- Updated: ${formatDate(input.pr.updated_at)}`);
  if (input.pr.closed_at) {
    lines.push(`- Closed: ${formatDate(input.pr.closed_at)}`);
  }
  if (input.pr.merged_at) {
    lines.push(`- Merged: ${formatDate(input.pr.merged_at)}`);
  }
  const baseRef =
    input.pr.base?.repo?.full_name && input.pr.base?.ref ? `${input.pr.base.repo.full_name}:${input.pr.base.ref}` : input.pr.base?.ref;
  const headRef =
    input.pr.head?.repo?.full_name && input.pr.head?.ref ? `${input.pr.head.repo.full_name}:${input.pr.head.ref}` : input.pr.head?.ref;
  lines.push(`- Base: ${baseRef || 'Unknown'}`);
  lines.push(`- Head: ${headRef || 'Unknown'}`);
  lines.push(`- Commits: ${input.pr.commits}`);
  lines.push(`- Changed files: ${input.pr.changed_files}`);
  lines.push(`- Additions: ${input.pr.additions}`);
  lines.push(`- Deletions: ${input.pr.deletions}`);
  if (input.pr.labels?.length) {
    lines.push(`- Labels: ${renderLabels(input.pr.labels)}`);
  }
  lines.push('');
  lines.push('## Description');
  renderBody(lines, input.pr.body, '_No description provided._');

  if (input.historicalMode) {
    const events = buildTimelineEvents({
      commits: input.includeCommit ? input.commits : undefined,
      issueComments: input.issueComments,
      reviewComments: input.reviewComments,
      reviews: input.reviews,
    });
    renderTimelineSection(lines, events, { includeCommitFiles: input.includeCommit });
  } else {
    if (input.files?.length) {
      lines.push('');
      lines.push(`## Files (${input.files.length})`);
      input.files.forEach((file) => {
        lines.push('');
        renderFileDiff(lines, file, '###');
      });
    }

    if (input.includeCommit && input.commits?.length) {
      lines.push('');
      lines.push(`## Commits (${input.commits.length})`);
      input.commits.forEach((commit, index) => {
        const date = commit?.commit?.author?.date || commit?.commit?.committer?.date;
        renderCommitEntry(lines, commit, index, date, {
          heading: '###',
          diffHeading: '####',
          includeFiles: true,
        });
      });
    }

    if (input.issueComments?.length) {
      lines.push('');
      lines.push(`## Issue Comments (${input.issueComments.length})`);
      input.issueComments.forEach((comment, index) => {
        lines.push('');
        lines.push(`### ${index + 1}. ${formatUser(comment.user)} on ${formatDate(comment.created_at)}`);
        renderBody(lines, comment.body, '_No comment body._');
      });
    }

    if (input.reviewComments?.length) {
      lines.push('');
      lines.push(`## Review Comments (${input.reviewComments.length})`);
      input.reviewComments.forEach((comment, index) => {
        const location = comment.path ? ` - ${comment.path}${comment.line ? `:${comment.line}` : ''}` : '';
        lines.push('');
        lines.push(`### ${index + 1}. ${formatUser(comment.user)} on ${formatDate(comment.created_at)}${location}`);
        renderBody(lines, comment.body, '_No comment body._');
        if (comment.diff_hunk) {
          lines.push('```diff');
          lines.push(comment.diff_hunk);
          lines.push('```');
        }
      });
    }

    if (input.reviews?.length) {
      lines.push('');
      lines.push(`## Reviews (${input.reviews.length})`);
      input.reviews.forEach((review, index) => {
        const stateLabel = review.state?.toLowerCase() || 'commented';
        const summary = `${index + 1}. ${formatUser(review.user)} - ${stateLabel}`;
        lines.push('');
        lines.push(`### ${summary}`);
        if (review.submitted_at) {
          lines.push(`Submitted: ${formatDate(review.submitted_at)}`);
        }
        renderBody(lines, review.body, '_No review body._');
      });
    }
  }

  return lines.join('\n');
}
