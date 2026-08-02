import { describe, expect, it } from "vitest";
import { analyzeRepository } from "../../src/core/analyzer.js";
import { createConfig } from "../../src/core/config.js";
import { FixtureProvider } from "../../src/github/fixture-provider.js";
import { smallRepositoryFixture } from "../../src/github/fixtures.js";
import { validateReport } from "../contract/schema-validator.js";

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
});
