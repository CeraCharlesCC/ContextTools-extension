import type { IssueProfile } from '@core/model';
import type { IssueFetchPlan } from './types';

export function buildIssueFetchPlan(profile: IssueProfile): IssueFetchPlan {
  return {
    kind: 'issue',
    profile,
    shouldFetchComments: true,
    historicalMode: profile.timelineMode,
  };
}
