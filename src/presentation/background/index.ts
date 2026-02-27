/**
 * Background Service Worker
 * Entry point for the extension's background process
 */
import { getBrowserAdapters } from '@infrastructure/adapters';
import { SettingsRepository } from '@infrastructure/repositories';
import { GetSettingsUseCase, UpdateSettingsUseCase } from '@application/usecases';
import type { SettingsUpdate } from '@domain/entities';
import {
  actionsRunToMarkdown,
  buildTimelineEvents,
  readActionsRunPreset,
  resolveActionsRunExportOptions,
  getActionsRun,
  getActionsRunJobs,
  getIssue,
  getIssueComments,
  getCommit,
  getPullCommits,
  getPullFiles,
  getPullRequest,
  getPullReviewComments,
  getPullReviewThreadResolution,
  getPullReviews,
  issueToMarkdown,
  prToMarkdown,
} from '@shared/github';
import type {
  GenerateMarkdownPayload,
  GenerateMarkdownResult,
  GitHubCommit,
  GitHubIssueComment,
  GitHubPullFile,
  GitHubPullReviewComment,
  Marker,
  MarkerRange,
  PageKind,
  TimelineEvent,
} from '@shared/github';
import {
  buildPullFetchPlan,
  resolveIssueTimelineMode,
  resolvePullExportState,
  sanitizeIssueLastExportState,
  sanitizePullLastExportState,
} from './export-resolution';
import type { IssueLastExportState, LastExportState, PullLastExportState } from './export-resolution';

// Initialize adapters
const adapters = getBrowserAdapters();

// Initialize repositories
const settingsRepository = new SettingsRepository(adapters.storage);

// Initialize use cases
const getSettingsUseCase = new GetSettingsUseCase(settingsRepository);
const updateSettingsUseCase = new UpdateSettingsUseCase(settingsRepository);

const GITHUB_TOKEN_KEY = 'github_token';
const LAST_EXPORT_STATE_KEY = 'last_export_state_v1';

async function getGitHubToken(): Promise<string> {
  const token = await adapters.storage.get<string>(GITHUB_TOKEN_KEY);
  return token ?? '';
}

async function setGitHubToken(token: string): Promise<void> {
  await adapters.storage.set(GITHUB_TOKEN_KEY, token);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  return value as Record<string, unknown>;
}

async function readLastExportState(): Promise<LastExportState> {
  const stored = await adapters.storage.get<unknown>(LAST_EXPORT_STATE_KEY);
  const record = asRecord(stored);
  if (!record) {
    return {};
  }

  return {
    pull: sanitizePullLastExportState(record.pull) ?? undefined,
    issue: sanitizeIssueLastExportState(record.issue) ?? undefined,
  };
}

async function writeLastExportState(state: LastExportState): Promise<void> {
  await adapters.storage.set(LAST_EXPORT_STATE_KEY, state);
}

async function getLastExportState(kind: PageKind): Promise<PullLastExportState | IssueLastExportState | null> {
  const current = await readLastExportState();
  if (kind === 'pull') {
    return current.pull ?? null;
  }
  if (kind === 'issue') {
    return current.issue ?? null;
  }
  return null;
}

async function setLastExportState(kind: PageKind, state: unknown): Promise<void> {
  if (kind === 'actions-run') {
    return;
  }

  const current = await readLastExportState();

  if (kind === 'pull') {
    const sanitized = sanitizePullLastExportState(state);
    if (!sanitized) {
      return;
    }
    current.pull = sanitized;
  } else {
    const sanitized = sanitizeIssueLastExportState(state);
    if (!sanitized) {
      return;
    }
    current.issue = sanitized;
  }

  await writeLastExportState(current);
}

function findEventIndex(events: TimelineEvent[], marker: Marker): number {
  return events.findIndex((event) => {
    if (!('id' in event)) return false;
    return event.type === marker.type && event.id === marker.id;
  });
}

function sliceEventsByRange(
  events: TimelineEvent[],
  range?: MarkerRange
): { events: TimelineEvent[]; warning?: string } | { error: string } {
  if (!range?.start && !range?.end) {
    return { events };
  }

  if (!events.length) {
    return { error: 'No timeline events were found for this PR.' };
  }

  const startIndex = range?.start ? findEventIndex(events, range.start) : 0;
  const endIndex = range?.end ? findEventIndex(events, range.end) : events.length - 1;

  if (startIndex === -1 || endIndex === -1) {
    return { error: 'Selected marker could not be found in the PR timeline.' };
  }

  let start = startIndex;
  let end = endIndex;
  let warning: string | undefined;
  if (start > end) {
    [start, end] = [end, start];
    warning = 'Markers were reversed, so the export range was swapped.';
  }

  return { events: events.slice(start, end + 1), warning };
}

function sliceIssueComments(
  comments: GitHubIssueComment[],
  range?: MarkerRange
): { comments: GitHubIssueComment[]; warning?: string } | { error: string } {
  if (!range?.start && !range?.end) {
    return { comments };
  }

  if (!comments.length) {
    return { error: 'No issue comments were found for this issue.' };
  }

  if (range.start && range.start.type !== 'issue-comment') {
    return { error: 'Start marker must be an issue comment.' };
  }
  if (range.end && range.end.type !== 'issue-comment') {
    return { error: 'End marker must be an issue comment.' };
  }

  const startIndex = range.start ? comments.findIndex((comment) => comment.id === range.start?.id) : 0;
  const endIndex = range.end ? comments.findIndex((comment) => comment.id === range.end?.id) : comments.length - 1;

  if (startIndex === -1 || endIndex === -1) {
    return { error: 'Selected marker could not be found in the issue comments.' };
  }

  let start = startIndex;
  let end = endIndex;
  let warning: string | undefined;
  if (start > end) {
    [start, end] = [end, start];
    warning = 'Markers were reversed, so the export range was swapped.';
  }

  return { comments: comments.slice(start, end + 1), warning };
}

async function getCommitDetailsList(params: {
  owner: string;
  repo: string;
  token: string;
  commits: GitHubCommit[];
}): Promise<GitHubCommit[]> {
  const { owner, repo, token, commits } = params;
  if (!commits?.length) return [];

  return Promise.all(
    commits.map(async (commit) => {
      if (!commit?.sha) return commit;
      try {
        return await getCommit({ owner, repo, sha: commit.sha, token });
      } catch (error) {
        console.warn('Failed to load commit details:', commit.sha, error);
        return commit;
      }
    })
  );
}

function applySmartDiffMode(commits: GitHubCommit[], files: GitHubPullFile[]): GitHubCommit[] {
  if (!commits?.length) return commits;
  const fileSet = new Set(
    (files ?? [])
      .map((file) => file?.filename)
      .filter((filename): filename is string => Boolean(filename))
  );
  return commits.map((commit) => {
    if (!commit?.files?.length) return commit;
    const filteredFiles = commit.files.filter((file) => {
      const filename = file?.filename;
      if (!filename) return false;
      return fileSet.has(filename);
    });
    if (filteredFiles.length === commit.files.length) return commit;
    return { ...commit, files: filteredFiles };
  });
}

function combineWarnings(...warnings: Array<string | undefined>): string | undefined {
  const filtered = warnings.map((warning) => warning?.trim()).filter((warning): warning is string => Boolean(warning));
  if (!filtered.length) return undefined;
  return filtered.join(' ');
}

function filterResolvedReviewComments(reviewComments: GitHubPullReviewComment[], commentResolution: Map<number, boolean> | null): {
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
    return { reviewComments: filteredReviewComments };
  }

  return {
    reviewComments: filteredReviewComments,
    warning: `${unknownResolutionCount} review comment(s) were kept because thread resolution state was unavailable.`,
  };
}

async function generateMarkdown(payload: GenerateMarkdownPayload): Promise<GenerateMarkdownResult> {
  const token = await getGitHubToken();
  const { owner, repo } = payload.page;

  if (payload.page.kind === 'actions-run') {
    const runId = payload.page.runId;
    const actionsRunExportState = resolveActionsRunExportOptions({
      preset: readActionsRunPreset(payload.actionsPreset),
      options: payload.actionsOptions,
    });
    const [run, jobs] = await Promise.all([
      getActionsRun({ owner, repo, runId, token }),
      getActionsRunJobs({ owner, repo, runId, token }),
    ]);

    return {
      ok: true,
      markdown: actionsRunToMarkdown({
        run,
        jobs,
        options: actionsRunExportState.options,
      }),
    };
  }

  const number = payload.page.number;

  const settings = await getSettingsUseCase.execute();
  const runtimeState = await readLastExportState();

  if (payload.page.kind === 'issue') {
    const timelineMode = resolveIssueTimelineMode({
      payload,
      issueDefaultTimelineMode: settings.issue.historicalMode,
      lastState: runtimeState.issue,
    });

    const issue = await getIssue({ owner, repo, number, token });
    const comments = await getIssueComments({ owner, repo, number, token });
    const sliceResult = sliceIssueComments(comments, payload.range);
    if ('error' in sliceResult) {
      return { ok: false, error: sliceResult.error };
    }

    return {
      ok: true,
      markdown: issueToMarkdown(issue, sliceResult.comments, { historicalMode: timelineMode }),
      warning: sliceResult.warning,
    };
  }

  const pullState = resolvePullExportState({
    payload,
    defaults: settings.pr,
    lastState: runtimeState.pull,
  });
  const fetchPlan = buildPullFetchPlan(pullState.options);

  const pr = await getPullRequest({ owner, repo, number, token });
  const [issueComments, reviewComments, reviews] = await Promise.all([
    fetchPlan.shouldFetchIssueComments
      ? getIssueComments({ owner, repo, number, token })
      : Promise.resolve([]),
    fetchPlan.shouldFetchReviewComments
      ? getPullReviewComments({ owner, repo, number, token })
      : Promise.resolve([]),
    fetchPlan.shouldFetchReviews
      ? getPullReviews({ owner, repo, number, token })
      : Promise.resolve([]),
  ]);

  const [files, commits] = await Promise.all([
    fetchPlan.shouldFetchFiles
      ? getPullFiles({ owner, repo, number, token })
      : Promise.resolve([]),
    fetchPlan.shouldFetchCommits
      ? getPullCommits({ owner, repo, number, token })
      : Promise.resolve([]),
  ]);

  const detailedCommits = fetchPlan.shouldFetchCommits && fetchPlan.includeCommitDiffs
    ? await getCommitDetailsList({ owner, repo, token, commits })
    : commits;

  const finalCommits = fetchPlan.includeCommitDiffs && fetchPlan.smartDiffMode
    ? applySmartDiffMode(detailedCommits, files)
    : detailedCommits;

  let resolvedFilterWarning: string | undefined;
  let reviewCommentResolution: Map<number, boolean> | null = null;
  if (fetchPlan.shouldFetchReviewThreadResolution) {
    try {
      const resolution = await getPullReviewThreadResolution({ owner, repo, number, token });
      reviewCommentResolution = resolution.commentResolution;
      if (resolution.incomplete) {
        resolvedFilterWarning =
          'Resolved-thread filtering may be incomplete because some review threads exceeded comment pagination limits.';
      }
    } catch (error) {
      console.warn('Failed to resolve review thread states:', error);
      resolvedFilterWarning =
        'Unable to determine resolved review threads; exported review comments without resolved filtering.';
    }
  }

  if (payload.range?.start || payload.range?.end) {
    const events = buildTimelineEvents({
      commits: fetchPlan.includeCommits ? finalCommits : undefined,
      issueComments: fetchPlan.includeIssueComments ? issueComments : undefined,
      reviewComments: fetchPlan.includeReviewComments ? reviewComments : undefined,
      reviews: fetchPlan.includeReviews ? reviews : undefined,
    });

    const sliceResult = sliceEventsByRange(events, payload.range);
    if ('error' in sliceResult) {
      return { ok: false, error: sliceResult.error };
    }

    const selectedCommits = sliceResult.events
      .filter((event) => event.type === 'commit')
      .map((event) => (event as Extract<TimelineEvent, { type: 'commit' }>).commit);
    const selectedIssueComments = sliceResult.events
      .filter((event) => event.type === 'issue-comment')
      .map((event) => (event as Extract<TimelineEvent, { type: 'issue-comment' }>).comment);
    const selectedReviewComments = sliceResult.events
      .filter((event) => event.type === 'review-comment')
      .map((event) => (event as Extract<TimelineEvent, { type: 'review-comment' }>).comment);
    const selectedReviews = sliceResult.events
      .filter((event) => event.type === 'review')
      .map((event) => (event as Extract<TimelineEvent, { type: 'review' }>).review);
    const resolvedFilterResult = fetchPlan.includeReviewComments
      ? filterResolvedReviewComments(selectedReviewComments, reviewCommentResolution)
      : { reviewComments: selectedReviewComments };

    return {
      ok: true,
      markdown: prToMarkdown({
        pr,
        commits: fetchPlan.includeCommits ? selectedCommits : undefined,
        files: fetchPlan.includeFileDiffs ? files : undefined,
        issueComments: fetchPlan.includeIssueComments ? selectedIssueComments : undefined,
        reviewComments: fetchPlan.includeReviewComments ? resolvedFilterResult.reviewComments : undefined,
        reviews: fetchPlan.includeReviews ? selectedReviews : undefined,
        options: pullState.options,
      }),
      warning: combineWarnings(sliceResult.warning, resolvedFilterWarning, resolvedFilterResult.warning),
    };
  }

  const resolvedFilterResult = fetchPlan.includeReviewComments
    ? filterResolvedReviewComments(reviewComments, reviewCommentResolution)
    : { reviewComments };

  return {
    ok: true,
    markdown: prToMarkdown({
      pr,
      commits: fetchPlan.includeCommits ? finalCommits : undefined,
      files: fetchPlan.includeFileDiffs ? files : undefined,
      issueComments: fetchPlan.includeIssueComments ? issueComments : undefined,
      reviewComments: fetchPlan.includeReviewComments ? resolvedFilterResult.reviewComments : undefined,
      reviews: fetchPlan.includeReviews ? reviews : undefined,
      options: pullState.options,
    }),
    warning: combineWarnings(resolvedFilterWarning, resolvedFilterResult.warning),
  };
}

// Message types
interface GetSettingsMessage {
  type: 'GET_SETTINGS';
}

interface UpdateSettingsMessage {
  type: 'UPDATE_SETTINGS';
  payload: SettingsUpdate;
}

interface GetGitHubTokenMessage {
  type: 'GET_GITHUB_TOKEN';
}

interface SetGitHubTokenMessage {
  type: 'SET_GITHUB_TOKEN';
  payload: {
    token: string;
  };
}

interface GenerateMarkdownMessage {
  type: 'GENERATE_MARKDOWN';
  payload: GenerateMarkdownPayload;
}

interface GetLastExportStateMessage {
  type: 'GET_LAST_EXPORT_STATE';
  payload: {
    kind: PageKind;
  };
}

interface SetLastExportStateMessage {
  type: 'SET_LAST_EXPORT_STATE';
  payload: {
    kind: PageKind;
    state: unknown;
  };
}

type Message =
  | GetSettingsMessage
  | UpdateSettingsMessage
  | GetGitHubTokenMessage
  | SetGitHubTokenMessage
  | GenerateMarkdownMessage
  | GetLastExportStateMessage
  | SetLastExportStateMessage;

// Message handler
adapters.messaging.addListener(async (message: Message) => {
  switch (message.type) {
    case 'GET_SETTINGS':
      return getSettingsUseCase.execute();

    case 'UPDATE_SETTINGS':
      return updateSettingsUseCase.execute(message.payload);

    case 'GET_GITHUB_TOKEN':
      return getGitHubToken();

    case 'SET_GITHUB_TOKEN':
      await setGitHubToken(message.payload.token);
      return { ok: true };

    case 'GENERATE_MARKDOWN':
      try {
        return await generateMarkdown(message.payload);
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Failed to generate markdown.',
        };
      }

    case 'GET_LAST_EXPORT_STATE':
      return getLastExportState(message.payload.kind);

    case 'SET_LAST_EXPORT_STATE':
      await setLastExportState(message.payload.kind, message.payload.state);
      return { ok: true };

    default:
      console.warn('Unknown message type:', message);
      return null;
  }
});

// Log initialization
console.log('Context Tools Extension: Background service initialized');
