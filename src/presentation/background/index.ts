/**
 * Background Service Worker
 * Entry point for the extension's background process
 */
import { getBrowserAdapters } from '@infrastructure/adapters';
import { SettingsRepository } from '@infrastructure/repositories';
import { GetSettingsUseCase, UpdateSettingsUseCase } from '@application/usecases';
import type { SettingsUpdate } from '@domain/entities';
import {
  buildTimelineEvents,
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
  Marker,
  MarkerRange,
  TimelineEvent,
} from '@shared/github';

// Initialize adapters
const adapters = getBrowserAdapters();

// Initialize repositories
const settingsRepository = new SettingsRepository(adapters.storage);

// Initialize use cases
const getSettingsUseCase = new GetSettingsUseCase(settingsRepository);
const updateSettingsUseCase = new UpdateSettingsUseCase(settingsRepository);

const GITHUB_TOKEN_KEY = 'github_token';

async function getGitHubToken(): Promise<string> {
  const token = await adapters.storage.get<string>(GITHUB_TOKEN_KEY);
  return token ?? '';
}

async function setGitHubToken(token: string): Promise<void> {
  await adapters.storage.set(GITHUB_TOKEN_KEY, token);
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
  comments: any[],
  range?: MarkerRange
): { comments: any[]; warning?: string } | { error: string } {
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
  commits: any[];
}): Promise<any[]> {
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

function applySmartDiffMode(commits: any[], files: any[]): any[] {
  if (!commits?.length) return commits;
  const fileSet = new Set((files ?? []).map((file) => file?.filename).filter(Boolean));
  return commits.map((commit) => {
    if (!commit?.files?.length) return commit;
    const filteredFiles = commit.files.filter((file: any) => fileSet.has(file?.filename));
    if (filteredFiles.length === commit.files.length) return commit;
    return { ...commit, files: filteredFiles };
  });
}

function combineWarnings(...warnings: Array<string | undefined>): string | undefined {
  const filtered = warnings.map((warning) => warning?.trim()).filter((warning): warning is string => Boolean(warning));
  if (!filtered.length) return undefined;
  return filtered.join(' ');
}

function filterResolvedReviewComments(reviewComments: any[], commentResolution: Map<number, boolean> | null): {
  reviewComments: any[];
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
  const { owner, repo, number } = payload.page;

  // Get settings defaults if options not explicitly provided
  const settings = await getSettingsUseCase.execute();
  const historicalMode = payload.page.kind === 'pull'
    ? payload.historicalMode ?? settings.pr.historicalMode
    : payload.historicalMode ?? settings.issue.historicalMode;
  const smartDiffMode = payload.page.kind === 'pull'
    ? payload.smartDiffMode ?? settings.pr.smartDiffMode
    : false;
  const includeFiles = payload.page.kind === 'pull'
    ? payload.includeFiles ?? settings.pr.includeFileDiff
    : false;
  const includeCommit = payload.page.kind === 'pull'
    ? payload.includeCommit ?? settings.pr.includeCommit
    : false;
  const onlyReviewComments = payload.page.kind === 'pull'
    ? payload.onlyReviewComments ?? settings.pr.onlyReviewComments
    : false;
  const ignoreResolvedComments = payload.page.kind === 'pull'
    ? payload.ignoreResolvedComments ?? settings.pr.ignoreResolvedComments
    : false;

  const effectiveIncludeFiles = onlyReviewComments ? false : includeFiles;
  const effectiveIncludeCommit = onlyReviewComments ? false : includeCommit;

  if (payload.page.kind === 'issue') {
    const issue = await getIssue({ owner, repo, number, token });
    const comments = await getIssueComments({ owner, repo, number, token });
    const sliceResult = sliceIssueComments(comments, payload.range);
    if ('error' in sliceResult) {
      return { ok: false, error: sliceResult.error };
    }
    return {
      ok: true,
      markdown: issueToMarkdown(issue, sliceResult.comments, { historicalMode }),
      warning: sliceResult.warning,
    };
  }

  const pr = await getPullRequest({ owner, repo, number, token });
  const [issueComments, reviewComments, reviews] = await Promise.all([
    getIssueComments({ owner, repo, number, token }),
    getPullReviewComments({ owner, repo, number, token }),
    getPullReviews({ owner, repo, number, token }),
  ]);

  const shouldFetchFiles = effectiveIncludeFiles || (effectiveIncludeCommit && smartDiffMode);
  const shouldFetchCommits = effectiveIncludeCommit;

  const [files, commits] = await Promise.all([
    shouldFetchFiles ? getPullFiles({ owner, repo, number, token }) : Promise.resolve([]),
    shouldFetchCommits ? getPullCommits({ owner, repo, number, token }) : Promise.resolve([]),
  ]);

  const detailedCommits = shouldFetchCommits
    ? await getCommitDetailsList({ owner, repo, token, commits })
    : [];

  const finalCommits = effectiveIncludeCommit && smartDiffMode ? applySmartDiffMode(detailedCommits, files) : detailedCommits;

  let resolvedFilterWarning: string | undefined;
  let reviewCommentResolution: Map<number, boolean> | null = null;
  if (ignoreResolvedComments) {
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
      commits: effectiveIncludeCommit ? finalCommits : undefined,
      issueComments,
      reviewComments,
      reviews,
    });
    const sliceResult = sliceEventsByRange(events, payload.range);
    if ('error' in sliceResult) {
      return { ok: false, error: sliceResult.error };
    }

    const selectedIssueComments = sliceResult.events
      .filter((event) => event.type === 'issue-comment')
      .map((event) => (event as Extract<TimelineEvent, { type: 'issue-comment' }>).comment);
    const selectedReviewComments = sliceResult.events
      .filter((event) => event.type === 'review-comment')
      .map((event) => (event as Extract<TimelineEvent, { type: 'review-comment' }>).comment);
    const selectedReviews = sliceResult.events
      .filter((event) => event.type === 'review')
      .map((event) => (event as Extract<TimelineEvent, { type: 'review' }>).review);
    const resolvedFilterResult = filterResolvedReviewComments(selectedReviewComments, reviewCommentResolution);

    return {
      ok: true,
      markdown: prToMarkdown({
        pr,
        commits: effectiveIncludeCommit ? finalCommits : undefined,
        files: effectiveIncludeFiles ? files : undefined,
        issueComments: onlyReviewComments ? [] : selectedIssueComments,
        reviewComments: resolvedFilterResult.reviewComments,
        reviews: onlyReviewComments ? [] : selectedReviews,
        historicalMode: onlyReviewComments ? false : true,
        includeFiles: effectiveIncludeFiles,
        includeCommit: effectiveIncludeCommit,
        onlyReviewComments,
      }),
      warning: combineWarnings(sliceResult.warning, resolvedFilterWarning, resolvedFilterResult.warning),
    };
  }

  const resolvedFilterResult = filterResolvedReviewComments(reviewComments, reviewCommentResolution);

  return {
    ok: true,
    markdown: prToMarkdown({
      pr,
      commits: effectiveIncludeCommit ? finalCommits : undefined,
      files: effectiveIncludeFiles ? files : undefined,
      issueComments: onlyReviewComments ? [] : issueComments,
      reviewComments: resolvedFilterResult.reviewComments,
      reviews: onlyReviewComments ? [] : reviews,
      historicalMode,
      includeFiles: effectiveIncludeFiles,
      includeCommit: effectiveIncludeCommit,
      onlyReviewComments,
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

type Message =
  | GetSettingsMessage
  | UpdateSettingsMessage
  | GetGitHubTokenMessage
  | SetGitHubTokenMessage
  | GenerateMarkdownMessage;

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

    default:
      console.warn('Unknown message type:', message);
      return null;
  }
});

// Log initialization
console.log('Context Tools Extension: Background service initialized');
