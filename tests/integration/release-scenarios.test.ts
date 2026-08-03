import { describe, expect, it } from "vitest";
import { analyzeRepository } from "../../src/core/analyzer.js";
import { createConfig } from "../../src/core/config.js";
import { PermissionError, RateLimitError } from "../../src/core/errors.js";
import { FixtureProvider } from "../../src/github/fixture-provider.js";
import { botHeavyRepositoryFixture, emptyRepositoryFixture, smallRepositoryFixture } from "../../src/github/fixtures.js";

describe("network-independent release scenarios", () => {
  it("handles archived, empty, and bot-heavy repositories", async () => {
    const archived = { ...smallRepositoryFixture, repository: { ...smallRepositoryFixture.repository, archived: true } };
    const reports = await Promise.all([archived, emptyRepositoryFixture, botHeavyRepositoryFixture].map((fixture) =>
      analyzeRepository({ config: createConfig(fixture.repository.ref.fullName, { save: false }),
        provider: new FixtureProvider(fixture), generatedAt: "2026-08-02T00:00:00Z" })));
    expect(reports[0]?.repository.archived).toBe(true);
    expect(reports[1]?.metrics.prs_opened?.value).toBe(0);
    expect(reports[2]?.metrics.bot_pr_share?.value).toBe(1);
  });

  it.each([[new PermissionError(), "permission"], [new RateLimitError(), "rate limit"]] as const)(
    "turns %s into an explicit partial limitation", async (error, phrase) => {
      const report = await analyzeRepository({ config: createConfig("fixture-owner/fixture-repo", { save: false }),
        provider: new FixtureProvider(smallRepositoryFixture, { failures: [{ operation: "listReviews", error }] }),
        generatedAt: "2026-08-02T00:00:00Z" });
      expect(report.completeness).toBe("partial");
      expect(report.limitations.join(" ").toLowerCase()).toContain(phrase);
    });
});
