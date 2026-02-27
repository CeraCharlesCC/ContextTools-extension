import { afterEach, describe, expect, it, vi } from 'vitest';
import { getActionsRunJobs, getIssueComments } from './api';

describe('GitHub API pagination safety', () => {
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
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    await expect(
      getIssueComments({
        owner: 'octocat',
        repo: 'hello-world',
        number: 1,
        token: 'secret-token',
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
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const jobs = await getActionsRunJobs({
      owner: 'octocat',
      repo: 'hello-world',
      runId: 1,
      token: 'secret-token',
    });

    expect(jobs.map((job) => job.id)).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
