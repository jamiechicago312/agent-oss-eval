import { describe, expect, it } from "vitest";
import { analyzeRepository } from "../../src/core/analyzer.js";
import { createConfig } from "../../src/core/config.js";
import { FixtureProvider } from "../../src/github/fixture-provider.js";
import { smallRepositoryFixture } from "../../src/github/fixtures.js";
import { validateReport } from "../contract/schema-validator.js";
import { SqliteSnapshotStore } from "../../src/storage/sqlite.js";

describe("canonical analyzer", () => {
  it("connects planning, acquisition, and metrics into a schema-valid report", async () => {
    const report = await analyzeRepository({
      config: createConfig("fixture-owner/fixture-repo", { window: "90d", save: false }),
      provider: new FixtureProvider(smallRepositoryFixture),
      generatedAt: "2026-08-02T00:00:00Z"
    });

    expect(validateReport(report)).toBe(true);
    expect(report.target.full_name).toBe("fixture-owner/fixture-repo");
    expect(report.window.days).toBe(90);
    expect(report.metrics.prs_opened!.value).toBe(2);
    expect(report.metrics.time_to_merge!.value).toEqual({ median: 48, p75: 48 });
    expect(report.provenance.cache_reused).toBe(false);
    expect(report.comparison).toBeNull();
    expect(report.completeness).toBe("partial");
  });

  it("marks review metrics partial when review enrichment fails", async () => {
    const report = await analyzeRepository({
      config: createConfig("fixture-owner/fixture-repo", { window: "90d", save: false }),
      provider: new FixtureProvider(smallRepositoryFixture, {
        failures: [{ operation: "listReviews", error: new Error("acquisition page budget exceeded") }]
      }),
      generatedAt: "2026-08-02T00:00:00Z"
    });

    expect(report.metrics.review_coverage!.confidence).toBe("partial");
    expect(report.metrics.time_to_first_human_review!.confidence).toBe("partial");
    expect(report.metrics.merge_rate!.confidence).toBe("measured");
    expect(report.limitations).toContain(
      "90d pull-request window fully collected (2 PRs); review/comment/event enrichment is partial because it stopped at the 100-page acquisition limit; increase --max-pages to continue."
    );
  });

  it("persists through the storage interface while core tests can use an in-memory store", async () => {
    const store = new SqliteSnapshotStore(":memory:");
    const report = await analyzeRepository({
      config: createConfig("fixture-owner/fixture-repo", { window: "30d", save: true }),
      provider: new FixtureProvider(smallRepositoryFixture),
      generatedAt: "2026-08-02T00:00:00Z",
      store
    });
    expect(store.getLatest(report.target.full_name)?.report).toEqual(report);
    store.close();
  });
});
