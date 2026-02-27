import { formatDate, formatUser } from '../format';
import type { ActionsRunExportOptions, GitHubActionsJob, GitHubActionsRun } from '../types';
import { createDefaultActionsRunExportOptions } from './actions-run-export';

function renderRunStatus(run: GitHubActionsRun): string {
  const status = run.status ?? 'Unknown';
  const conclusion = run.conclusion ?? 'none';
  return `${status}/${conclusion}`;
}

function renderJobStatus(job: GitHubActionsJob): string {
  const status = job.status ?? 'Unknown';
  const conclusion = job.conclusion ?? 'none';
  return `${status}/${conclusion}`;
}

function renderRunner(job: GitHubActionsJob): string {
  const labels = Array.isArray(job.labels) && job.labels.length ? ` (${job.labels.join(', ')})` : '';

  if (job.runner_group_name && job.runner_name) {
    return `${job.runner_group_name}/${job.runner_name}${labels}`;
  }

  if (job.runner_name) {
    return `${job.runner_name}${labels}`;
  }

  if (job.runner_group_name) {
    return `${job.runner_group_name}${labels}`;
  }

  if (labels) {
    return labels.slice(2, -1);
  }

  return 'Unknown';
}

function isFailureConclusion(conclusion: string | null | undefined): boolean {
  return (conclusion ?? '').toLowerCase() === 'failure';
}

function filterJobs(jobs: GitHubActionsJob[], options: ActionsRunExportOptions): GitHubActionsJob[] {
  const filteredJobs = options.onlyFailureJobs
    ? jobs.filter((job) => isFailureConclusion(job.conclusion))
    : jobs;

  if (!options.includeSteps || !options.onlyFailureSteps) {
    return filteredJobs;
  }

  return filteredJobs
    .map((job) => {
      const steps = Array.isArray(job.steps) ? job.steps : [];
      const failureSteps = steps.filter((step) => isFailureConclusion(step.conclusion));
      return {
        ...job,
        steps: failureSteps,
      };
    })
    .filter((job) => Array.isArray(job.steps) && job.steps.length > 0);
}

export function actionsRunToMarkdown(input: {
  run: GitHubActionsRun;
  jobs: GitHubActionsJob[];
  options?: ActionsRunExportOptions;
}): string {
  const { run } = input;
  const options = input.options ?? createDefaultActionsRunExportOptions();
  const jobs = filterJobs(input.jobs, options);
  const lines: string[] = [];

  if (options.includeSummary) {
    lines.push(`# Actions Run: ${run.name?.trim() || 'Workflow run'}`);
    lines.push('');
    lines.push(`- URL: ${run.html_url || 'Unknown'}`);
    lines.push(`- Status: ${renderRunStatus(run)}`);
    lines.push(`- Event: ${run.event || 'Unknown'}`);
    lines.push(`- Branch: ${run.head_branch || 'Unknown'}`);
    lines.push(`- SHA: ${run.head_sha || 'Unknown'}`);
    lines.push(`- Actor: ${formatUser(run.actor)}`);
    lines.push(`- Created: ${formatDate(run.created_at)}`);
    lines.push(`- Updated: ${formatDate(run.updated_at)}`);
    if (typeof run.run_number === 'number') {
      lines.push(`- Run number: ${run.run_number}`);
    }
    if (typeof run.run_attempt === 'number') {
      lines.push(`- Attempt: ${run.run_attempt}`);
    }
  }

  if (!options.includeJobs) {
    return lines.join('\n');
  }

  lines.push('');
  lines.push(`## Jobs (${jobs.length})`);

  if (!jobs.length) {
    lines.push('_No jobs matched current export filters._');
    return lines.join('\n');
  }

  jobs.forEach((job, index) => {
    lines.push('');
    lines.push(`### ${index + 1}. ${job.name || 'Job'}`);
    if (job.html_url) {
      lines.push(`- URL: ${job.html_url}`);
    }
    lines.push(`- Status: ${renderJobStatus(job)}`);
    lines.push(`- Started: ${formatDate(job.started_at)}`);
    lines.push(`- Completed: ${formatDate(job.completed_at)}`);
    lines.push(`- Runner: ${renderRunner(job)}`);

    if (options.includeSteps) {
      const steps = Array.isArray(job.steps) ? job.steps : [];
      lines.push(`#### Steps (${steps.length})`);
      if (!steps.length) {
        lines.push(options.onlyFailureSteps ? '_No steps matched current export filters._' : '_No steps provided._');
        return;
      }

      steps.forEach((step, stepIndex) => {
        const stepNumber = typeof step.number === 'number' ? step.number : stepIndex + 1;
        const stepName = step.name || 'Step';
        const status = step.status ?? 'Unknown';
        const conclusion = step.conclusion ?? 'none';
        lines.push(`- ${stepNumber}. ${stepName} - ${status}/${conclusion}`);
        if (step.log?.trim()) {
          lines.push('```text');
          lines.push(step.log);
          lines.push('```');
        } else {
          lines.push('_No step log available._');
        }
      });
    }
  });

  return lines.join('\n');
}
