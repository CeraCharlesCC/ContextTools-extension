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

  it.each(['../other', '..', '.', 'repo?per_page=1', 'repo#fragment', 'repo\\other'])(
    'rejects unsafe repository path segments: %s', async (repo) => {
      const fetchMock = vi.fn();
      const client = createGitHubClient({ fetchFn: fetchMock as typeof fetch });
      await expect(client.getIssue({ owner: 'octocat', repo, number: 1 }))
        .rejects.toThrow('Invalid GitHub repository');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('encodes commit references as one path segment', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ sha: 'abc', files: [] })));
    const client = createGitHubClient({ fetchFn: fetchMock as typeof fetch });
    await client.getCommit({ owner: 'octocat', repo: 'hello-world', sha: 'feature/name?query' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/octocat/hello-world/commits/feature%2Fname%3Fquery?per_page=100',
      expect.anything(),
    );
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

  it('merges all commit file pages while retaining the first page metadata', async () => {
    const firstFile = { filename: 'first.ts', patch: '+first' };
    const secondFile = { filename: 'second.ts', patch: '+second' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        sha: 'abc', commit: { message: 'full message' }, files: [firstFile],
      }), { headers: { link: '<https://api.github.com/repos/o/r/commits/abc?per_page=100&page=2>; rel="next"' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: 'abc', files: [secondFile] })));
    const client = createGitHubClient({ fetchFn: fetchMock as typeof fetch });

    await expect(client.getCommit({ owner: 'o', repo: 'r', sha: 'abc' })).resolves.toEqual({
      sha: 'abc', commit: { message: 'full message' }, files: [firstFile, secondFile],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(['comments', 'jobs'] as const)('rejects repeated next links for %s', async (kind) => {
    const path = kind === 'comments' ? 'issues/1/comments' : 'actions/runs/1/jobs';
    const url = `https://api.github.com/repos/o/r/${path}?per_page=100`;
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(
      kind === 'comments' ? [] : { jobs: [] },
    ), { headers: { link: `<${url}>; rel="next"` } }));
    const client = createGitHubClient({ fetchFn: fetchMock as typeof fetch });
    const result = kind === 'comments'
      ? client.getIssueComments({ owner: 'o', repo: 'r', number: 1 })
      : client.getActionsRunJobs({ owner: 'o', repo: 'r', runId: 1 });

    await expect(result).rejects.toThrow('Repeated pagination URL');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a GraphQL continuation without a usable cursor', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { repository: { pullRequest: {
        reviewThreads: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } },
      } } } })));
    const client = createGitHubClient({ fetchFn: fetchMock as typeof fetch });

    await expect(client.getPullReviewThreadResolution({ owner: 'o', repo: 'r', number: 1 }))
      .rejects.toThrow('Missing or repeated review thread pagination cursor');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects GraphQL pagination cycles spanning multiple cursors', async () => {
    const page = (endCursor: string) => new Response(JSON.stringify({ data: { repository: { pullRequest: {
      reviewThreads: { nodes: [], pageInfo: { hasNextPage: true, endCursor } },
    } } } }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(page('A'))
      .mockResolvedValueOnce(page('B'))
      .mockResolvedValueOnce(page('A'));
    const client = createGitHubClient({ fetchFn: fetchMock as typeof fetch });

    await expect(client.getPullReviewThreadResolution({ owner: 'o', repo: 'r', number: 1 }))
      .rejects.toThrow('Missing or repeated review thread pagination cursor');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['https://api.github.com', 'https://api.github.com/graphql'],
    ['https://github.example.com/api/v3/', 'https://github.example.com/api/graphql'],
  ])('loads thread resolution directly through GraphQL for %s', async (apiRoot, graphqlUrl) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: { repository: { pullRequest: {
      reviewThreads: {
        nodes: [{ isResolved: true, comments: { nodes: [{ databaseId: 10 }], pageInfo: { hasNextPage: false } } }],
        pageInfo: { hasNextPage: false },
      },
    } } } })));
    const client = createGitHubClient({ apiRoot, token: 'test-token', fetchFn: fetchMock as typeof fetch });

    await expect(client.getPullReviewThreadResolution({ owner: 'o', repo: 'r', number: 1 })).resolves.toEqual({
      commentResolution: new Map([[10, true]]), incomplete: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(graphqlUrl, expect.objectContaining({ method: 'POST' }));
  });

  it('preserves authentication errors from GraphQL without probing another endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Requires authentication' }), {
      status: 401, statusText: 'Unauthorized',
    }));
    const client = createGitHubClient({ fetchFn: fetchMock as typeof fetch });

    await expect(client.getPullReviewThreadResolution({ owner: 'o', repo: 'r', number: 1 }))
      .rejects.toMatchObject({ name: 'GitHubApiError', status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rethrows GraphQL abort errors without another request', async () => {
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
