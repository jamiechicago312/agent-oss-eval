import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { Report } from "../../src/core/types.js";

interface AjvInstance {
  compile(schema: unknown): (data: unknown) => boolean;
}

type AjvConstructor = new (options?: { strict?: boolean }) => AjvInstance;

const require = createRequire(import.meta.url);
function resolveAjv(module: unknown): AjvConstructor {
  if (typeof module === "function") return module as AjvConstructor;
  if (typeof module === "object" && module !== null) {
    const exports = module as Record<string, unknown>;
    for (const candidate of [exports.default, exports.Ajv]) {
      if (typeof candidate === "function") return candidate as AjvConstructor;
    }
  }
  throw new Error("Unable to load the Ajv constructor");
}

const Ajv = resolveAjv(require("ajv"));

const schema = JSON.parse(
  readFileSync(new URL("../../schema/report.schema.json", import.meta.url), "utf8")
);
const validate = new Ajv({ strict: false }).compile(schema);

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
    expect(validate(report)).toBe(true);
  });

  it("rejects a report with a missing required field", () => {
    const invalid = { ...report, completeness: undefined };

    expect(validate(invalid)).toBe(false);
  });

  it("rejects an unknown completeness value", () => {
    const invalid = { ...report, completeness: "unknown" };

    expect(validate(invalid)).toBe(false);
  });
});
