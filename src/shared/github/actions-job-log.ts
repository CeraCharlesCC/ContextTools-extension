import type { GitHubActionsJob, GitHubActionsJobStep } from './types';

interface ParsedLine {
  timestampMs: number | null;
  text: string;
}

interface StepWindow {
  step: GitHubActionsJobStep;
  startMs: number | null;
  endMs: number | null;
  nextStartMs: number | null;
}

const TIMESTAMP_PREFIX = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s?(.*)$/;
const GROUP_PREFIX = '##[group]';
const END_GROUP = '##[endgroup]';

function parseDateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function normalizeStepName(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseLogLine(rawLine: string): ParsedLine {
  const match = rawLine.match(TIMESTAMP_PREFIX);
  if (!match) {
    return {
      timestampMs: null,
      text: rawLine.replace(/\r$/, ''),
    };
  }

  const [, timestamp, text] = match;
  const timestampMs = Date.parse(timestamp);
  return {
    timestampMs: Number.isFinite(timestampMs) ? timestampMs : null,
    text: text.replace(/\r$/, ''),
  };
}

function sanitizeStepLogLine(line: string): string | null {
  if (line.startsWith(END_GROUP)) {
    return null;
  }
  if (line.startsWith(GROUP_PREFIX)) {
    return line.slice(GROUP_PREFIX.length).trimStart();
  }
  if (line.startsWith('##[command]')) {
    return line.slice('##[command]'.length).trimStart();
  }
  if (line.startsWith('##[error]')) {
    return `ERROR: ${line.slice('##[error]'.length).trimStart()}`;
  }
  if (line.startsWith('##[warning]')) {
    return `WARNING: ${line.slice('##[warning]'.length).trimStart()}`;
  }
  if (line.startsWith('##[notice]')) {
    return `NOTICE: ${line.slice('##[notice]'.length).trimStart()}`;
  }
  return line;
}

function buildStepWindows(steps: GitHubActionsJobStep[]): StepWindow[] {
  return steps.map((step, index) => {
    const nextStartMs = index < steps.length - 1 ? parseDateMs(steps[index + 1].started_at) : null;
    return {
      step,
      startMs: parseDateMs(step.started_at),
      endMs: parseDateMs(step.completed_at),
      nextStartMs,
    };
  });
}

function findStepByTimestamp(windows: StepWindow[], timestampMs: number): number {
  const toleranceMs = 1000;
  for (let index = 0; index < windows.length; index += 1) {
    const window = windows[index];
    if (window.startMs === null) continue;

    const effectiveEnd = window.endMs ?? window.nextStartMs ?? Number.POSITIVE_INFINITY;
    if (timestampMs + toleranceMs < window.startMs) continue;
    if (timestampMs <= effectiveEnd + toleranceMs) {
      return index;
    }
  }

  let latestIndex = -1;
  let latestStart = Number.NEGATIVE_INFINITY;
  windows.forEach((window, index) => {
    if (window.startMs === null) return;
    if (window.startMs <= timestampMs && window.startMs > latestStart) {
      latestStart = window.startMs;
      latestIndex = index;
    }
  });
  return latestIndex;
}

function findStepByGroupName(windows: StepWindow[], groupName: string): number {
  const normalizedGroup = normalizeStepName(groupName);
  if (!normalizedGroup) return -1;

  const exactMatches = windows
    .map((window, index) => (normalizeStepName(window.step.name) === normalizedGroup ? index : -1))
    .filter((index) => index !== -1);
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) return -1;

  const fuzzyMatches = windows
    .map((window, index) => {
      const stepName = normalizeStepName(window.step.name);
      if (!stepName) return -1;
      return normalizedGroup.includes(stepName) || stepName.includes(normalizedGroup) ? index : -1;
    })
    .filter((index) => index !== -1);
  return fuzzyMatches.length === 1 ? fuzzyMatches[0] : -1;
}

function trimLog(value: string): string | null {
  const trimmed = value.replace(/^\s+|\s+$/g, '');
  return trimmed ? trimmed : null;
}

export function attachActionsJobStepLogs(job: GitHubActionsJob, rawLog: string): GitHubActionsJob {
  const steps = Array.isArray(job.steps) ? job.steps : [];
  if (!steps.length || !rawLog.trim()) {
    return job;
  }

  const windows = buildStepWindows(steps);
  const byStepIndex: string[][] = steps.map(() => []);
  let groupedStepIndex: number | null = null;

  rawLog.split(/\r?\n/).forEach((rawLine) => {
    const parsed = parseLogLine(rawLine);
    let stepIndex = -1;

    if (parsed.timestampMs !== null) {
      stepIndex = findStepByTimestamp(windows, parsed.timestampMs);
    }

    if (parsed.text.startsWith(GROUP_PREFIX)) {
      const groupName = parsed.text.slice(GROUP_PREFIX.length).trimStart();
      const groupStepIndex = findStepByGroupName(windows, groupName);
      if (groupStepIndex !== -1) {
        groupedStepIndex = groupStepIndex;
        stepIndex = groupStepIndex;
      }
    } else if (parsed.text.startsWith(END_GROUP)) {
      if (groupedStepIndex !== null) {
        stepIndex = groupedStepIndex;
        groupedStepIndex = null;
      }
    } else if (stepIndex === -1 && groupedStepIndex !== null) {
      stepIndex = groupedStepIndex;
    }

    if (stepIndex === -1) {
      return;
    }

    const line = sanitizeStepLogLine(parsed.text);
    if (line === null) {
      return;
    }
    byStepIndex[stepIndex].push(line);
  });

  return {
    ...job,
    steps: steps.map((step, index) => {
      const merged = byStepIndex[index].join('\n');
      return {
        ...step,
        log: trimLog(merged),
      };
    }),
  };
}
