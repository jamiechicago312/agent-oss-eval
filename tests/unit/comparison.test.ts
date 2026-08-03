import { describe, expect, it } from "vitest";
import { compareReports } from "../../src/core/comparison.js";
import { reportFromFixture } from "../../src/core/fixture-report.js";
import { parseRepository } from "../../src/core/config.js";
import { smallRepositoryFixture } from "../../src/github/fixtures.js";

function base() { return reportFromFixture(parseRepository("o/r"), smallRepositoryFixture); }

describe("snapshot comparison", () => {
  it("reports deterministic metric changes and percentages", () => {
    const before = base();
    before.metrics.prs_opened = { value: 2, unit: "pull_requests", definition: "Opened", sample_size: 2, source: "fixture", window: "90d", confidence: "measured" };
    const after = structuredClone(before);
    after.generated_at = "2026-09-01T00:00:00Z";
    after.metrics.prs_opened!.value = 4;
    const result = compareReports(before, after);
    expect(result.compatible).toBe(true);
    expect(result.changes.find((change) => change.metric === "prs_opened")?.percentageChange).toBe(100);
  });

  it("does not equate incompatible windows", () => {
    const before = base(); const after = structuredClone(before); after.window.days = 30;
    expect(compareReports(before, after)).toMatchObject({ compatible: false, reason: "Analysis windows differ (90d vs 30d)" });
  });
});
