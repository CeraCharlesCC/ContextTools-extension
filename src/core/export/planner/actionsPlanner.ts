import { enforceActionsRunInvariants } from '@core/model';
import type { ActionsRunProfile } from '@core/model';
import type { ActionsFetchPlan } from './types';

export function buildActionsFetchPlan(profile: ActionsRunProfile): ActionsFetchPlan {
  const options = enforceActionsRunInvariants(profile.options);

  return {
    kind: 'actionsRun',
    profile,
    options,
    shouldFetchJobs: options.includeJobs,
    shouldFetchLogs: options.includeJobs && options.includeSteps,
    onlyFailureJobs: options.onlyFailureJobs,
  };
}
