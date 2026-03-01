export type TargetKind = 'pull' | 'issue' | 'actionsRun';

interface BaseTarget {
  owner: string;
  repo: string;
}

export interface PullTarget extends BaseTarget {
  kind: 'pull';
  number: number;
}

export interface IssueTarget extends BaseTarget {
  kind: 'issue';
  number: number;
}

export interface ActionsRunTarget extends BaseTarget {
  kind: 'actionsRun';
  runId: number;
}

export type Target = PullTarget | IssueTarget | ActionsRunTarget;

export function isTargetKind(value: string): value is TargetKind {
  return value === 'pull' || value === 'issue' || value === 'actionsRun';
}

export function targetRepoKey(target: Target): string {
  return `${target.owner}/${target.repo}`;
}
