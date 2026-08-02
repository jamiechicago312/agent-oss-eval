import { describe, expect, it } from "vitest";
import type { Report } from "../../src/core/types.js";
import { validateReport } from "./schema-validator.js";

const report: Report = {
  schema_version: 1,
  tool: { name: "oss-eval", version: "0.1.0" },
  target: {
    owner: "owner",
    name: "repo",
    full_name: "owner/repo",
    url: "https://github.com/owner/repo"
  },
  generated_at: "2026-08-02T00:00:00Z",
  window: { start: "2026-05-04T00:00:00Z", end: "2026-08-02T00:00:00Z", days: 90 },
  repository: {},
  metrics: {
    prs_opened: {
      value: 3,
      unit: "count",
      definition: "PRs created within the selected window",
      sample_size: 3,
      source: "fixture",
      window: "90d",
      confidence: "measured"
    }
  },
  signals: [],
  comparison: null,
  provenance: {},
  limitations: [],
  completeness: "complete"
};

describe("report schema", () => {
  it("accepts a complete evidence report", () => {
    expect(validateReport(report)).toBe(true);
  });

  it("rejects a report with a missing required field", () => {
    const invalid = { ...report, completeness: undefined };

    expect(validateReport(invalid)).toBe(false);
  });

  it("rejects an unknown completeness value", () => {
    const invalid = { ...report, completeness: "unknown" };

    expect(validateReport(invalid)).toBe(false);
  });
});
