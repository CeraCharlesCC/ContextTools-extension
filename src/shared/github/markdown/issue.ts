import { formatDate, formatUser } from '../format';

function renderLabels(labels: Array<{ name?: string }> | null | undefined): string {
  if (!labels || !labels.length) return 'None';
  return labels.map((label) => `\`${label.name ?? ''}\``).join(', ');
}

function renderAssignees(assignees: Array<{ login?: string }> | null | undefined): string {
  if (!assignees || !assignees.length) return 'None';
  return assignees.map(formatUser).join(', ');
}

export function issueToMarkdown(
  issue: any,
  comments: any[],
  options?: { historicalMode?: boolean }
): string {
  const lines: string[] = [];
  const orderedComments =
    options?.historicalMode === false ? [...(comments ?? [])].reverse() : (comments ?? []);

  lines.push(`# Issue: ${issue.title}`);
  lines.push('');
  lines.push(`- URL: ${issue.html_url}`);
  lines.push(`- State: ${issue.state}`);
  lines.push(`- Author: ${formatUser(issue.user)}`);
  lines.push(`- Created: ${formatDate(issue.created_at)}`);
  lines.push(`- Updated: ${formatDate(issue.updated_at)}`);
  if (issue.closed_at) {
    lines.push(`- Closed: ${formatDate(issue.closed_at)}`);
  }
  lines.push(`- Labels: ${renderLabels(issue.labels)}`);
  lines.push(`- Assignees: ${renderAssignees(issue.assignees)}`);
  if (issue.milestone?.title) {
    lines.push(`- Milestone: ${issue.milestone.title}`);
  }
  lines.push('');
  lines.push('## Description');
  lines.push(issue.body?.trim() ? issue.body.trim() : '_No description provided._');

  if (orderedComments.length) {
    lines.push('');
    lines.push(`## Comments (${orderedComments.length})`);
    orderedComments.forEach((comment, index) => {
      lines.push('');
      lines.push(`### ${index + 1}. ${formatUser(comment.user)} on ${formatDate(comment.created_at)}`);
      lines.push(comment.body?.trim() ? comment.body.trim() : '_No comment body._');
    });
  }

  return lines.join('\n');
}
