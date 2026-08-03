import { describe, expect, it } from "vitest";
import { evaluateRepository } from "../../src/programmatic.js";
import { FixtureProvider } from "../../src/github/fixture-provider.js";
import { smallRepositoryFixture } from "../../src/github/fixtures.js";
import { validateReport } from "../contract/schema-validator.js";

describe("supported programmatic API", () => {
  it("returns the canonical report model with progress and storage disabled", async () => {
    const phases: string[] = [];
    const report = await evaluateRepository("fixture-owner/fixture-repo", {
      window: "30d", save: false, provider: new FixtureProvider(smallRepositoryFixture),
      generatedAt: "2026-08-02T00:00:00Z", progress: (event) => phases.push(event.phase)
    });
    expect(validateReport(report)).toBe(true);
    expect(phases).toEqual(["planning", "acquisition", "metrics", "complete"]);
  });
});
