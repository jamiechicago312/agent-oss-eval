import { describe, expect, it } from "vitest";
import { AuthenticationError, MalformedResponseError, NotFoundError, PermissionError, RateLimitError, ServerError } from "../../src/core/errors.js";
import { GitHubClient } from "../../src/github/client.js";
import { parseRepository } from "../../src/core/config.js";

const repository = parseRepository("octo/repo");

function response(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
}

function client(fetch: typeof globalThis.fetch, options: { maxRetries?: number; sleep?: (ms: number) => Promise<void> } = {}) {
  return new GitHubClient({
    token: "test-token",
    fetch,
    env: {},
    githubCliToken: () => null,
    ...options
  });
}

describe("GitHub client", () => {
  it("maps repository metadata and sends auth safely", async () => {
    let authorization = "";
    const github = client(async (_input, init) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return response({
        id: 1,
        full_name: "octo/repo",
        html_url: "https://github.com/octo/repo",
        description: "repo",
        stargazers_count: 4,
        forks_count: 2,
        open_issues_count: 1,
        archived: false,
        license: { spdx_id: "MIT" },
        default_branch: "main",
        created_at: "2026-01-01T00:00:00Z"
      });
    });

    await expect(github.getRepository(repository)).resolves.toMatchObject({ stars: 4, license: "MIT" });
    expect(authorization).toBe("Bearer test-token");
  });

  it("maps pull requests and pagination links", async () => {
    const github = client(async () => response([
      {
        id: 2,
        number: 3,
        title: "PR",
        user: { login: "dependabot[bot]", type: "Bot" },
        author_association: "CONTRIBUTOR",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
        state: "open",
        merged_at: null,
        merged_by: null
      }
    ], 200, { link: '<https://api.github.com/next>; rel="next"' }));

    await expect(github.listPullRequests(repository, 1)).resolves.toMatchObject({
      page: 1,
      hasNext: true,
      items: [{ authorIsBot: true, number: 3 }]
    });
  });

  it("retries transient failures with capped backoff", async () => {
    let calls = 0;
    const github = client(async () => {
      calls += 1;
      return calls === 1 ? response({ error: "temporary" }, 503) : response({ rate: { remaining: 2, limit: 5, reset: 1_800_000_000 } });
    }, { sleep: async () => undefined });

    await expect(github.getRateLimit()).resolves.toMatchObject({ remaining: 2, limit: 5 });
    expect(calls).toBe(2);
  });

  it.each([
    [401, AuthenticationError],
    [403, PermissionError],
    [404, NotFoundError],
    [429, RateLimitError]
  ] as const)("classifies HTTP status %s", async (status, ErrorClass) => {
    const github = client(async () => response({ error: "failure" }, status), { maxRetries: 0 });

    await expect(github.getRateLimit()).rejects.toBeInstanceOf(ErrorClass);
  });

  it("classifies malformed success responses and exhausted server retries", async () => {
    const malformed = client(async () => response("not-json"));
    await expect(malformed.getRateLimit()).rejects.toBeInstanceOf(MalformedResponseError);

    const server = client(async () => response({}, 500), { maxRetries: 0 });
    await expect(server.getRateLimit()).rejects.toBeInstanceOf(ServerError);
  });

  it("propagates cancellation instead of retrying it", async () => {
    const controller = new AbortController();
    const github = client(async () => {
      throw new DOMException("Aborted", "AbortError");
    }, { maxRetries: 2 });

    controller.abort();
    await expect(github.getRateLimit()).rejects.toMatchObject({ name: "AbortError" });
  });

  it("revalidates cached responses with ETags without exposing credentials", async () => {
    const cache = new Map(); let calls = 0; let conditional = "";
    const github = new GitHubClient({ token: "ghp_private", env: {}, githubCliToken: () => null, cache,
      fetch: async (_input, init) => {
        calls += 1; conditional = new Headers(init?.headers).get("if-none-match") ?? "";
        if (calls === 2) return new Response(null, { status: 304, headers: { etag: "v1" } });
        return response({ rate: { remaining: 10, limit: 20, reset: 1_800_000_000 } }, 200, { etag: "v1" });
      } });
    await expect(github.getRateLimit()).resolves.toMatchObject({ remaining: 10 });
    await expect(github.getRateLimit()).resolves.toMatchObject({ remaining: 10 });
    expect(conditional).toBe("v1");
    expect(JSON.stringify([...cache.values()])).not.toContain("ghp_private");
  });

  it("bounds a request with an explicit timeout", async () => {
    const github = new GitHubClient({ token: "test", env: {}, githubCliToken: () => null, timeoutMs: 1,
      fetch: async (_input, init) => new Promise((_resolve, reject) => {
        if (init?.signal?.aborted) { reject(init.signal.reason); return; }
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      }) });
    await expect(github.getRateLimit()).rejects.toMatchObject({ name: "TimeoutError" });
  });
});
