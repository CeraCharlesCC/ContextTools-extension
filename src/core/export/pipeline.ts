import { isFailureConclusion } from '@core/actions';
import { isAbortError, type GitHubClient } from '@core/github/client';
import type {
  GitHubCommit,
  GitHubIssueComment,
  GitHubPullFile,
  GitHubPullReviewComment,
} from '@core/github/types';
import {
  createDefaultSettingsV1,
  normalizeSelection,
  resolveEffectiveProfile,
  type ExportRequest,
} from '@core/model';
import { attachActionsJobStepLogs } from '@core/github/actionsJobLog';
import { actionsRunToMarkdown } from '@core/markdown/actionsRun';
import { issueToMarkdown } from '@core/markdown/issue';
import { buildTimelineEvents, prToMarkdown, type TimelineEvent } from '@core/markdown/pull';
import { ExportPipelineError } from './errors/pipelineError';
import { TtlCache, createCacheKey } from './fetcher/cache';
import { executeTasks } from './fetcher/executor';
import { buildActionsFetchPlan } from './planner/actionsPlanner';
import { buildIssueFetchPlan } from './planner/issuePlanner';
import { buildPullFetchPlan } from './planner/pullPlanner';
import { sliceIssueComments } from './selection/sliceIssueComments';
import { slicePullTimeline } from './selection/slicePullTimeline';

export interface ExportPipelineDeps {
  client: GitHubClient;
  signal?: AbortSignal;
  concurrency?: number;
  cache?: TtlCache<unknown>;
  cacheTtlMs?: number;
  authScopeKey?: string;
  now?: () => number;
}

export interface ExportPipelineOutput {
  markdown: string;
  warning?: string;
}

function combineWarnings(...warnings: Array<string | undefined>): string | undefined {
  const nonEmpty = warnings
    .map((warning) => warning?.trim())
    .filter((warning): warning is string => Boolean(warning));

  if (!nonEmpty.length) {
    return undefined;
  }

  return nonEmpty.join(' ');
}

function readSelectionRange(request: ExportRequest) {
  const selection = normalizeSelection(request.selection);
  return selection.mode === 'range' ? selection.range : undefined;
}

function applySmartDiffMode(commits: GitHubCommit[], files: GitHubPullFile[]): GitHubCommit[] {
  if (!commits.length) {
    return commits;
  }

  const fileSet = new Set(
    files
      .map((file) => file.filename)
      .filter((filename): filename is string => Boolean(filename)),
  );

  return commits.map((commit) => {
    if (!commit.files?.length) {
      return commit;
    }

    const filteredFiles = commit.files.filter((file) => {
      const filename = file?.filename;
      return Boolean(filename && fileSet.has(filename));
    });

    if (filteredFiles.length === commit.files.length) {
      return commit;
    }

    return {
      ...commit,
      files: filteredFiles,
    };
  });
}

function filterResolvedReviewComments(
  reviewComments: GitHubPullReviewComment[],
  commentResolution: Map<number, boolean> | null,
): {
  reviewComments: GitHubPullReviewComment[];
  warning?: string;
} {
  if (!commentResolution) {
    return { reviewComments };
  }

  let unknownResolutionCount = 0;
  const filteredReviewComments = reviewComments.filter((comment) => {
    const isResolved = commentResolution.get(comment.id);
    if (isResolved === true) {
      return false;
    }
    if (isResolved === undefined) {
      unknownResolutionCount += 1;
    }
    return true;
  });

  if (!unknownResolutionCount) {
    return {
      reviewComments: filteredReviewComments,
    };
  }

  return {
    reviewComments: filteredReviewComments,
    warning: `${unknownResolutionCount} review comment(s) were kept because thread resolution state was unavailable.`,
  };
}

async function readThroughCache<T>(
  cache: TtlCache<unknown>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached as T;
  }

  const value = await load();
  cache.set(key, value as unknown);
  return value;
}

function isCommitEvent(event: TimelineEvent): event is Extract<TimelineEvent, { type: 'commit' }> {
  return event.type === 'commit';
}

function isIssueCommentEvent(event: TimelineEvent): event is Extract<TimelineEvent, { type: 'issue-comment' }> {
  return event.type === 'issue-comment';
}

function isReviewCommentEvent(event: TimelineEvent): event is Extract<TimelineEvent, { type: 'review-comment' }> {
  return event.type === 'review-comment';
}

function isReviewEvent(event: TimelineEvent): event is Extract<TimelineEvent, { type: 'review' }> {
  return event.type === 'review';
}

export async function runExportPipeline(
  request: ExportRequest,
  deps: ExportPipelineDeps,
): Promise<ExportPipelineOutput> {
  const cache = deps.cache ?? new TtlCache<unknown>(deps.cacheTtlMs ?? 30_000, deps.now ?? (() => Date.now()));
  const authScopeKey = deps.authScopeKey ?? 'anon';
  const concurrency = deps.concurrency ?? 4;
  const defaults = createDefaultSettingsV1().defaults;

  const { profile } = resolveEffectiveProfile({
    targetKind: request.target.kind,
    defaults,
    requestProfile: request.profile,
  });

  if (request.target.kind === 'actionsRun') {
    if (profile.kind !== 'actionsRun') {
      throw new ExportPipelineError('invalidRequest', 'Actions exports require an actions profile.');
    }

    const plan = buildActionsFetchPlan(profile);

    const [run, jobs] = await Promise.all([
      deps.client.getActionsRun({
        owner: request.target.owner,
        repo: request.target.repo,
        runId: request.target.runId,
        signal: deps.signal,
      }),
      plan.shouldFetchJobs
        ? deps.client.getActionsRunJobs({
            owner: request.target.owner,
            repo: request.target.repo,
            runId: request.target.runId,
            signal: deps.signal,
          })
        : Promise.resolve([]),
    ]);

    let warning: string | undefined;
    let jobsWithLogs = jobs;

    if (plan.shouldFetchLogs && jobs.length) {
      const jobsTarget = plan.onlyFailureJobs
        ? jobs.filter((job) => isFailureConclusion(job.conclusion))
        : jobs;

      const tasks = jobsTarget.map((job) => async () => {
        try {
          const rawLog = await readThroughCache(
            cache,
            createCacheKey(['actionsJobLog', authScopeKey, request.target.owner, request.target.repo, job.id]),
            () =>
              deps.client.getActionsJobLogs({
                owner: request.target.owner,
                repo: request.target.repo,
                jobId: job.id,
                signal: deps.signal,
              }),
          );

          return {
            jobId: job.id,
            rawLog,
          };
        } catch (error) {
          if (isAbortError(error)) {
            throw error;
          }
          return null;
        }
      });

      const logResults = await executeTasks(tasks, {
        concurrency,
        signal: deps.signal,
      });

      const logByJobId = new Map<number, string>();
      let failedFetchCount = 0;
      logResults.forEach((result) => {
        if (!result) {
          failedFetchCount += 1;
          return;
        }
        logByJobId.set(result.jobId, result.rawLog);
      });

      jobsWithLogs = jobs.map((job) => {
        const rawLog = logByJobId.get(job.id);
        if (!rawLog) {
          return job;
        }
        return attachActionsJobStepLogs(job, rawLog);
      });

      if (failedFetchCount > 0) {
        warning = `${failedFetchCount} job log(s) could not be downloaded, so some step logs may be missing.`;
      }
    }

    return {
      markdown: actionsRunToMarkdown({
        run,
        jobs: jobsWithLogs,
        options: plan.options,
      }),
      warning,
    };
  }

  if (request.target.kind === 'issue') {
    if (profile.kind !== 'issue') {
      throw new ExportPipelineError('invalidRequest', 'Issue exports require an issue profile.');
    }

    const plan = buildIssueFetchPlan(profile);
    const [issue, comments] = await Promise.all([
      deps.client.getIssue({
        owner: request.target.owner,
        repo: request.target.repo,
        number: request.target.number,
        signal: deps.signal,
      }),
      plan.shouldFetchComments
        ? deps.client.getIssueComments({
            owner: request.target.owner,
            repo: request.target.repo,
            number: request.target.number,
            signal: deps.signal,
          })
        : Promise.resolve([]),
    ]);

    const range = readSelectionRange(request);
    const selectionResult = sliceIssueComments(comments, range);
    if ('error' in selectionResult) {
      throw new ExportPipelineError('invalidSelection', selectionResult.error);
    }

    return {
      markdown: issueToMarkdown(issue, selectionResult.comments, {
        historicalMode: plan.historicalMode,
      }),
      warning: selectionResult.warning,
    };
  }

  if (profile.kind !== 'pull') {
    throw new ExportPipelineError('invalidRequest', 'Pull request exports require a pull profile.');
  }

  const plan = buildPullFetchPlan(profile);

  const prPromise = deps.client.getPullRequest({
    owner: request.target.owner,
    repo: request.target.repo,
    number: request.target.number,
    signal: deps.signal,
  });

  const issueCommentsPromise = plan.shouldFetchIssueComments
    ? deps.client.getIssueComments({
        owner: request.target.owner,
        repo: request.target.repo,
        number: request.target.number,
        signal: deps.signal,
      })
    : Promise.resolve<GitHubIssueComment[]>([]);

  const reviewCommentsPromise = plan.shouldFetchReviewComments
    ? deps.client.getPullReviewComments({
        owner: request.target.owner,
        repo: request.target.repo,
        number: request.target.number,
        signal: deps.signal,
      })
    : Promise.resolve<GitHubPullReviewComment[]>([]);

  const reviewsPromise = plan.shouldFetchReviews
    ? deps.client.getPullReviews({
        owner: request.target.owner,
        repo: request.target.repo,
        number: request.target.number,
        signal: deps.signal,
      })
    : Promise.resolve([]);

  const filesPromise = plan.shouldFetchFiles
    ? deps.client.getPullFiles({
        owner: request.target.owner,
        repo: request.target.repo,
        number: request.target.number,
        signal: deps.signal,
      })
    : Promise.resolve<GitHubPullFile[]>([]);

  const commitsPromise = plan.shouldFetchCommits
    ? deps.client.getPullCommits({
        owner: request.target.owner,
        repo: request.target.repo,
        number: request.target.number,
        signal: deps.signal,
      })
    : Promise.resolve<GitHubCommit[]>([]);

  const [pr, issueComments, reviewComments, reviews, files, commits] = await Promise.all([
    prPromise,
    issueCommentsPromise,
    reviewCommentsPromise,
    reviewsPromise,
    filesPromise,
    commitsPromise,
  ]);

  let detailedCommits = commits;
  if (plan.shouldFetchCommits && plan.includeCommitDiffs && commits.length) {
    const tasks = commits.map((commit) => async () => {
      if (!commit.sha) {
        return commit;
      }

      try {
        return await readThroughCache(
          cache,
          createCacheKey(['commit', authScopeKey, request.target.owner, request.target.repo, commit.sha]),
          () =>
            deps.client.getCommit({
              owner: request.target.owner,
              repo: request.target.repo,
              sha: commit.sha,
              signal: deps.signal,
            }),
        );
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        return commit;
      }
    });

    detailedCommits = await executeTasks(tasks, {
      concurrency,
      signal: deps.signal,
    });
  }

  const finalCommits = plan.includeCommitDiffs && plan.smartDiffMode
    ? applySmartDiffMode(detailedCommits, files)
    : detailedCommits;

  let resolvedFilterWarning: string | undefined;
  let reviewCommentResolution: Map<number, boolean> | null = null;

  if (plan.shouldFetchReviewThreadResolution) {
    try {
      const resolution = await deps.client.getPullReviewThreadResolution({
        owner: request.target.owner,
        repo: request.target.repo,
        number: request.target.number,
        signal: deps.signal,
      });
      reviewCommentResolution = resolution.commentResolution;
      if (resolution.incomplete) {
        resolvedFilterWarning =
          'Resolved-thread filtering may be incomplete because some review threads exceeded comment pagination limits.';
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      resolvedFilterWarning =
        'Unable to determine resolved review threads; exported review comments without resolved filtering.';
    }
  }

  const range = readSelectionRange(request);
  if (range?.start || range?.end) {
    const timelineEvents = buildTimelineEvents({
      commits: plan.includeCommits ? finalCommits : undefined,
      issueComments: plan.includeIssueComments ? issueComments : undefined,
      reviewComments: plan.includeReviewComments ? reviewComments : undefined,
      reviews: plan.includeReviews ? reviews : undefined,
    });

    const sliceResult = slicePullTimeline(timelineEvents, range);
    if ('error' in sliceResult) {
      throw new ExportPipelineError('invalidSelection', sliceResult.error);
    }

    const selectedCommits = sliceResult.events
      .filter(isCommitEvent)
      .map((event) => event.commit);
    const selectedIssueComments = sliceResult.events
      .filter(isIssueCommentEvent)
      .map((event) => event.comment);
    const selectedReviewComments = sliceResult.events
      .filter(isReviewCommentEvent)
      .map((event) => event.comment);
    const selectedReviews = sliceResult.events
      .filter(isReviewEvent)
      .map((event) => event.review);

    const resolvedFilterResult = plan.includeReviewComments
      ? filterResolvedReviewComments(selectedReviewComments, reviewCommentResolution)
      : { reviewComments: selectedReviewComments };

    return {
      markdown: prToMarkdown({
        pr,
        commits: plan.includeCommits ? selectedCommits : undefined,
        files: plan.includeFileDiffs ? files : undefined,
        issueComments: plan.includeIssueComments ? selectedIssueComments : undefined,
        reviewComments: plan.includeReviewComments ? resolvedFilterResult.reviewComments : undefined,
        reviews: plan.includeReviews ? selectedReviews : undefined,
        options: plan.options,
      }),
      warning: combineWarnings(sliceResult.warning, resolvedFilterWarning, resolvedFilterResult.warning),
    };
  }

  const resolvedFilterResult = plan.includeReviewComments
    ? filterResolvedReviewComments(reviewComments, reviewCommentResolution)
    : { reviewComments };

  return {
    markdown: prToMarkdown({
      pr,
      commits: plan.includeCommits ? finalCommits : undefined,
      files: plan.includeFileDiffs ? files : undefined,
      issueComments: plan.includeIssueComments ? issueComments : undefined,
      reviewComments: plan.includeReviewComments ? resolvedFilterResult.reviewComments : undefined,
      reviews: plan.includeReviews ? reviews : undefined,
      options: plan.options,
    }),
    warning: combineWarnings(resolvedFilterWarning, resolvedFilterResult.warning),
  };
}
