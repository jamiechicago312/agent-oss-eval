import { describe, expect, it } from "vitest";
import { formatHumanReport } from "../../src/output/human.js";
import type { Report } from "../../src/core/types.js";

const report: Report = {
  schema_version: 1,
  tool: { name: "oss-eval", version: "0.1.0" },
  target: { owner: "owner", name: "repo", full_name: "owner/repo", url: "https://github.com/owner/repo" },
  generated_at: "2026-08-02T00:00:00Z",
  window: { start: "2026-05-04T00:00:00Z", end: "2026-08-02T00:00:00Z", days: 90 },
  repository: {},
  metrics: {
    complete_metric: {
      value: 1,
      unit: "count",
      definition: "Complete metric",
      sample_size: 1,
      source: "test",
      window: "90d",
      confidence: "measured"
    },
    partial_metric: {
      value: 0.5,
      unit: "share",
      definition: "Partial metric",
      sample_size: 1,
      source: "test",
      window: "90d",
      confidence: "partial"
    },
    unavailable_metric: {
      value: null,
      unit: "count",
      definition: "Unavailable metric",
      sample_size: 0,
      source: "test",
      window: "90d",
      confidence: "unavailable"
    }
  },
  signals: [],
  comparison: null,
  provenance: {},
  limitations: ["Detail collection was incomplete."],
  completeness: "partial"
};

describe("human report output", () => {
  it("marks partial and unavailable metrics with an asterisk", () => {
    const output = formatHumanReport(report);

    expect(output).toContain("- complete_metric:");
    expect(output).toContain("- partial_metric*:");
    expect(output).toContain("- unavailable_metric*:");
    expect(output).toContain("- * metric is partial or unavailable.");
  });
});
