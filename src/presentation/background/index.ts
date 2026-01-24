/**
 * Background Service Worker
 * Entry point for the extension's background process
 */
import { getBrowserAdapters } from '@infrastructure/adapters';
import { SettingsRepository } from '@infrastructure/repositories';
import { GetSettingsUseCase, UpdateSettingsUseCase } from '@application/usecases';
import {
  buildTimelineEvents,
  getIssue,
  getIssueComments,
  getPullRequest,
  getPullReviewComments,
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

async function generateMarkdown(payload: GenerateMarkdownPayload): Promise<GenerateMarkdownResult> {
  const token = await getGitHubToken();
  const { owner, repo, number } = payload.page;

  if (payload.page.kind === 'issue') {
    const issue = await getIssue({ owner, repo, number, token });
    const comments = await getIssueComments({ owner, repo, number, token });
    const sliceResult = sliceIssueComments(comments, payload.range);
    if ('error' in sliceResult) {
      return { ok: false, error: sliceResult.error };
    }
    return {
      ok: true,
      markdown: issueToMarkdown(issue, sliceResult.comments),
      warning: sliceResult.warning,
    };
  }

  const pr = await getPullRequest({ owner, repo, number, token });
  const [issueComments, reviewComments, reviews] = await Promise.all([
    getIssueComments({ owner, repo, number, token }),
    getPullReviewComments({ owner, repo, number, token }),
    getPullReviews({ owner, repo, number, token }),
  ]);

  if (payload.range?.start || payload.range?.end) {
    const events = buildTimelineEvents({
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

    return {
      ok: true,
      markdown: prToMarkdown({
        pr,
        issueComments: selectedIssueComments,
        reviewComments: selectedReviewComments,
        reviews: selectedReviews,
        historicalMode: true,
        includeFiles: false,
      }),
      warning: sliceResult.warning,
    };
  }

  return {
    ok: true,
    markdown: prToMarkdown({
      pr,
      issueComments,
      reviewComments,
      reviews,
      historicalMode: false,
      includeFiles: false,
    }),
  };
}

// Message types
interface GetSettingsMessage {
  type: 'GET_SETTINGS';
}

interface UpdateSettingsMessage {
  type: 'UPDATE_SETTINGS';
  payload: {
    enabled?: boolean;
    theme?: 'light' | 'dark' | 'system';
    notifications?: boolean;
  };
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
