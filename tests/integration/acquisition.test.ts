import { describe, expect, it } from "vitest";
import { acquireRepositoryData } from "../../src/core/acquisition.js";
import { PermissionError } from "../../src/core/errors.js";
import { FixtureProvider } from "../../src/github/fixture-provider.js";
import { emptyRepositoryFixture, smallRepositoryFixture } from "../../src/github/fixtures.js";
import type { FixtureScenario } from "../../src/github/types.js";

const window = {
  windowStart: "2026-06-01T00:00:00Z",
  windowEnd: "2026-08-01T00:00:00Z"
};

describe("repository acquisition", () => {
  it("collects metadata, filtered PRs, reviews, onboarding, and provenance", async () => {
    const provider = new FixtureProvider(smallRepositoryFixture, { pageSize: 1 });
    const result = await acquireRepositoryData({
      provider,
      repository: smallRepositoryFixture.repository.ref,
      ...window
    });

    expect(result.completeness).toBe("complete");
    expect(result.repository?.ref.fullName).toBe("fixture-owner/fixture-repo");
    expect(result.pullRequests).toHaveLength(2);
    expect(result.reviews).toHaveLength(1);
    expect(result.onboarding?.contributingGuidePath).toBe("CONTRIBUTING.md");
    expect(result.provenance.cached).toBe(false);
    expect(result.provenance.stages.pullRequests).toMatchObject({ status: "fetched", pages: 2, items: 2 });
    expect(result.failedStages).toEqual([]);
  });

  it("handles empty repositories without inventing activity", async () => {
    const result = await acquireRepositoryData({
      provider: new FixtureProvider(emptyRepositoryFixture),
      repository: emptyRepositoryFixture.repository.ref,
      ...window
    });

    expect(result.completeness).toBe("complete");
    expect(result.pullRequests).toEqual([]);
    expect(result.reviews).toEqual([]);
    expect(result.provenance.stages.pullRequests).toMatchObject({ status: "fetched", items: 0 });
  });

  it("records failed stages and returns a partial result", async () => {
    const result = await acquireRepositoryData({
      provider: new FixtureProvider(smallRepositoryFixture, {
        failures: [{ operation: "listReviews", error: new PermissionError() }]
      }),
      repository: smallRepositoryFixture.repository.ref,
      ...window
    });

    expect(result.completeness).toBe("partial");
    expect(result.failedStages).toContain("reviews:1");
    expect(result.provenance.stages["reviews:1"]).toMatchObject({ status: "failed" });
    expect(result.limitations[0]).toContain("permission");
  });

  it("fails clearly when repository metadata cannot be acquired", async () => {
    const result = await acquireRepositoryData({
      provider: new FixtureProvider(smallRepositoryFixture, {
        failures: [{ operation: "getRepository", error: new Error("fixture unavailable") }]
      }),
      repository: smallRepositoryFixture.repository.ref,
      ...window
    });

    expect(result.completeness).toBe("failed");
    expect(result.repository).toBeNull();
    expect(result.failedStages).toEqual(["repository"]);
    expect(result.pullRequests).toEqual([]);
  });

  it("stops at one shared budget and consolidates skipped enrichment", async () => {
    const provider = new FixtureProvider(smallRepositoryFixture, { pageSize: 1 });
    const result = await acquireRepositoryData({ provider, repository: smallRepositoryFixture.repository.ref,
      ...window, maxPages: 5 });
    expect(result.provenance.networkRequests).toBe(5);
    expect(Object.values(result.provenance.stages).some((stage) => stage.status === "skipped_budget")).toBe(true);
    expect(result.limitations.filter((limitation) => limitation.includes("configured 5-request limit"))).toHaveLength(1);
    expect(result.limitations.some((limitation) => limitation.includes("reviews:2 failed"))).toBe(false);
  });

  it("stops descending PR pagination at the requested window boundary", async () => {
    const oldPullRequest = { ...smallRepositoryFixture.pullRequests[0]!, id: 9999, number: 99,
      createdAt: "2026-05-31T23:59:59Z", updatedAt: "2026-05-31T23:59:59Z" };
    const scenario: FixtureScenario = { ...smallRepositoryFixture,
      pullRequests: [smallRepositoryFixture.pullRequests[1]!, smallRepositoryFixture.pullRequests[0]!, oldPullRequest,
        { ...oldPullRequest, id: 9998, number: 98, createdAt: "2025-01-01T00:00:00Z" }] };
    const provider = new FixtureProvider(scenario, { pageSize: 2, pullRequestOrder: "created_desc" });
    const result = await acquireRepositoryData({ provider, repository: scenario.repository.ref, ...window });
    expect(result.pullRequests.map((pullRequest) => pullRequest.number)).toEqual([2, 1]);
    expect(provider.requests.filter((request) => request === "listPullRequests")).toHaveLength(2);
    expect(result.provenance.stages.pullRequests).toMatchObject({ pages: 2, stoppedAtWindowBoundary: true });
  });

  it("does not assume cutoff ordering for providers without that contract", async () => {
    const oldPullRequest = { ...smallRepositoryFixture.pullRequests[0]!, id: 9999, number: 99,
      createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" };
    const scenario: FixtureScenario = { ...smallRepositoryFixture,
      pullRequests: [oldPullRequest, smallRepositoryFixture.pullRequests[1]!] };
    const provider = new FixtureProvider(scenario, { pageSize: 1 });
    const result = await acquireRepositoryData({ provider, repository: scenario.repository.ref, ...window });
    expect(result.pullRequests.map((pullRequest) => pullRequest.number)).toEqual([2]);
    expect(provider.requests.filter((request) => request === "listPullRequests")).toHaveLength(2);
  });
});
