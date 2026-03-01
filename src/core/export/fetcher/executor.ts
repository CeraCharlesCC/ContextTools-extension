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
  if (!tasks.length) {
    return [];
  }

  const signal = options.signal;
  const concurrency = normalizeConcurrency(options.concurrency ?? 4);
  const results = new Array<T>(tasks.length);
  let nextTaskIndex = 0;

  async function worker(): Promise<void> {
    while (nextTaskIndex < tasks.length) {
      if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }

      const taskIndex = nextTaskIndex;
      nextTaskIndex += 1;
      results[taskIndex] = await tasks[taskIndex]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
