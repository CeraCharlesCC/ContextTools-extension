import { describe, expect, it } from 'vitest';
import { executeTasks } from './executor';

describe('executeTasks', () => {
  it('respects concurrency limits while preserving result order', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const tasks = Array.from({ length: 6 }, (_, index) => async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 10);
      });
      inFlight -= 1;
      return index;
    });

    const result = await executeTasks(tasks, { concurrency: 2 });

    expect(result).toEqual([0, 1, 2, 3, 4, 5]);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it('aborts before running tasks when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      executeTasks([async () => 1], {
        signal: controller.signal,
      }),
    ).rejects.toThrow('aborted');
  });

  it('rejects cancellation while the final task is in flight', async () => {
    const controller = new AbortController();
    await expect(executeTasks([async () => {
      controller.abort();
      return 1;
    }], { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('stops dispatching queued work after a worker fails', async () => {
    let finishRunningTask!: () => void;
    let queuedTaskRan = false;
    const error = new Error('rate limited');
    const result = executeTasks([
      async () => { throw error; },
      () => new Promise<number>((resolve) => { finishRunningTask = () => resolve(1); }),
      async () => { queuedTaskRan = true; return 2; },
    ], { concurrency: 2 });

    await expect(result).rejects.toBe(error);
    finishRunningTask();
    await Promise.resolve();
    await Promise.resolve();
    expect(queuedTaskRan).toBe(false);
  });
});
