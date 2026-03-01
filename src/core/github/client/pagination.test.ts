import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGitHubClient } from './createClient';

describe('GitHub client pagination safety', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects untrusted next-page URLs from Link headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: 1, created_at: '2026-01-01T00:00:00Z' }]), {
        status: 200,
        headers: {
          link: '<https://evil.example.com/steal>; rel="next"',
        },
      }),
    );

    const client = createGitHubClient({
      token: 'secret-token',
      fetchFn: fetchMock as typeof fetch,
    });

    await expect(
      client.getIssueComments({
        owner: 'octocat',
        repo: 'hello-world',
        number: 1,
      }),
    ).rejects.toThrow('Refusing pagination URL outside trusted origin');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('continues pagination for trusted api.github.com next links', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jobs: [{ id: 1, name: 'build' }],
          }),
          {
            status: 200,
            headers: {
              link: '<https://api.github.com/repos/octocat/hello-world/actions/runs/1/jobs?per_page=100&page=2>; rel="next"',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jobs: [{ id: 2, name: 'test' }],
          }),
          {
            status: 200,
          },
        ),
      );

    const client = createGitHubClient({
      token: 'secret-token',
      fetchFn: fetchMock as typeof fetch,
    });

    const jobs = await client.getActionsRunJobs({
      owner: 'octocat',
      repo: 'hello-world',
      runId: 1,
    });

    expect(jobs.map((job) => job.id)).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rethrows REST abort errors without attempting GraphQL fallback', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'));

    const client = createGitHubClient({
      token: 'secret-token',
      fetchFn: fetchMock as typeof fetch,
    });

    await expect(
      client.getPullReviewThreadResolution({
        owner: 'octocat',
        repo: 'hello-world',
        number: 1,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rethrows GraphQL abort errors when fallback request is canceled', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'threads unavailable' }), {
          status: 500,
          statusText: 'Internal Server Error',
        }),
      )
      .mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'));

    const client = createGitHubClient({
      token: 'secret-token',
      fetchFn: fetchMock as typeof fetch,
    });

    await expect(
      client.getPullReviewThreadResolution({
        owner: 'octocat',
        repo: 'hello-world',
        number: 1,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('invokes default fetch with global scope binding', async () => {
    const fetchMock = vi.fn(function (this: unknown) {
      if (this !== globalThis) {
        throw new TypeError("Failed to execute 'fetch' on 'WorkerGlobalScope': Illegal invocation");
      }

      return Promise.resolve(
        new Response(JSON.stringify({ number: 1 }), {
          status: 200,
        }),
      );
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const client = createGitHubClient({
      token: 'secret-token',
    });

    const issue = await client.getIssue({
      owner: 'octocat',
      repo: 'hello-world',
      number: 1,
    });

    expect(issue).toEqual({ number: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
