import type { Target } from '@core/model';

const OWNER_REPO = '([A-Za-z0-9_.-]+)\\/([A-Za-z0-9_.-]+)';
const ISSUE_PATH = new RegExp(`^\\/${OWNER_REPO}\\/issues\\/(\\d+)`, 'i');
const PULL_PATH = new RegExp(`^\\/${OWNER_REPO}\\/pull\\/(\\d+)`, 'i');
const ACTIONS_RUN_PATH = new RegExp(`^\\/${OWNER_REPO}\\/actions\\/runs\\/(\\d+)`, 'i');

export function parseTarget(pathname: string): Target | null {
  const issueMatch = pathname.match(ISSUE_PATH);
  if (issueMatch) {
    const [, owner, repo, number] = issueMatch;
    return {
      kind: 'issue',
      owner,
      repo,
      number: Number(number),
    };
  }

  const pullMatch = pathname.match(PULL_PATH);
  if (pullMatch) {
    const [, owner, repo, number] = pullMatch;
    return {
      kind: 'pull',
      owner,
      repo,
      number: Number(number),
    };
  }

  const actionsRunMatch = pathname.match(ACTIONS_RUN_PATH);
  if (actionsRunMatch) {
    const [, owner, repo, runId] = actionsRunMatch;
    return {
      kind: 'actionsRun',
      owner,
      repo,
      runId: Number(runId),
    };
  }

  return null;
}
