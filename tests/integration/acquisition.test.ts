import { describe, expect, it } from "vitest";
import { acquireRepositoryData } from "../../src/core/acquisition.js";
import { PermissionError } from "../../src/core/errors.js";
import { FixtureProvider } from "../../src/github/fixture-provider.js";
import { emptyRepositoryFixture, smallRepositoryFixture } from "../../src/github/fixtures.js";

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
});
