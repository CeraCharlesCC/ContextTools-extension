import { throwIfAborted } from '@core/github/client/errors';

export interface ExecuteTasksOptions {
  concurrency?: number;
  signal?: AbortSignal;
}

function normalizeConcurrency(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return 1;
  }
  return Math.floor(value);
}

export async function executeTasks<T>(
  tasks: Array<() => Promise<T>>,
  options: ExecuteTasksOptions = {},
): Promise<T[]> {
  throwIfAborted(options.signal);
  if (!tasks.length) {
    return [];
  }

  const signal = options.signal;
  const concurrency = normalizeConcurrency(options.concurrency ?? 4);
  const results = new Array<T>(tasks.length);
  let nextTaskIndex = 0;
  let failed = false;

  async function worker(): Promise<void> {
    while (!failed && nextTaskIndex < tasks.length) {
      throwIfAborted(signal);

      const taskIndex = nextTaskIndex;
      nextTaskIndex += 1;
      try {
        results[taskIndex] = await tasks[taskIndex]();
        throwIfAborted(signal);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
