import { describe, expect, it } from "vitest";
import { PermissionError, RateLimitError } from "../../src/index.js";
import { FixtureProvider, collectPages } from "../../src/github/fixture-provider.js";
import { botHeavyRepositoryFixture, emptyRepositoryFixture, smallRepositoryFixture } from "../../src/github/fixtures.js";

describe("fixture provider", () => {
  it("replays a small repository with deterministic pagination", async () => {
    const provider = new FixtureProvider(smallRepositoryFixture, { pageSize: 1 });
    const pullRequests = await collectPages((page) =>
      provider.listPullRequests(smallRepositoryFixture.repository.ref, page)
    );

    expect(pullRequests).toHaveLength(2);
    expect(provider.requests).toEqual(["listPullRequests", "listPullRequests"]);
  });

  it("represents empty and bot-heavy repositories without network access", async () => {
    const empty = new FixtureProvider(emptyRepositoryFixture);
    const bots = new FixtureProvider(botHeavyRepositoryFixture);

    expect((await empty.listPullRequests(emptyRepositoryFixture.repository.ref, 1)).items).toEqual([]);
    expect((await bots.listPullRequests(botHeavyRepositoryFixture.repository.ref, 1)).items.every((pr) => pr.authorIsBot)).toBe(true);
  });

  it("injects retryable and permission failures deterministically", async () => {
    const provider = new FixtureProvider(smallRepositoryFixture, {
      failures: [
        { operation: "getRateLimit", error: new RateLimitError(), attempts: 1 },
        { operation: "getPermissions", error: new PermissionError() }
      ]
    });

    await expect(provider.getRateLimit()).rejects.toBeInstanceOf(RateLimitError);
    await expect(provider.getPermissions(smallRepositoryFixture.repository.ref)).rejects.toBeInstanceOf(PermissionError);
    await expect(provider.getRateLimit()).resolves.toEqual(smallRepositoryFixture.rateLimit);
  });
});
