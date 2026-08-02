import { describe, expect, it } from "vitest";
import { runCliAsync } from "../../src/cli/commands.js";
import { validateReport } from "../contract/schema-validator.js";

describe("fixture CLI smoke test", () => {
  it("emits a valid JSON report without network access", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runCliAsync(["analyze", "fixture-owner/fixture-repo", "--fixture", "small", "--format", "json", "--no-save"], {
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message)
    });

    const report = JSON.parse(stdout[0] ?? "{}");
    expect(exitCode).toBe(0);
    expect(validateReport(report)).toBe(true);
    expect(report.completeness).toBe("partial");
    expect(report.provenance.acquisition.networkRequests).toBeGreaterThan(0);
    expect(stderr).toEqual([]);
  });

  it("returns material-limitations code for a partial fixture", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runCliAsync(["analyze", "fixture-owner/fixture-repo", "--fixture", "partial", "--format", "json", "--no-save", "--strict"], {
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message)
    });

    expect(exitCode).toBe(3);
    expect(JSON.parse(stdout[0] ?? "{}").limitations).toContain("No submitted reviews were available; review-derived maintainer signals are unavailable.");
    expect(stderr).toEqual([]);
  });

  it("accepts an explicit page budget override", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runCliAsync([
      "analyze",
      "fixture-owner/fixture-repo",
      "--fixture",
      "small",
      "--window",
      "90d",
      "--max-pages",
      "1",
      "--format",
      "json",
      "--no-save"
    ], {
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message)
    });

    const report = JSON.parse(stdout[0] ?? "{}");
    expect(exitCode).toBe(0);
    expect(report.provenance.plan.budget.maxPages).toBe(1);
    expect(stderr).toEqual([]);
  });

  it("returns invalid-input code for malformed repository input", async () => {
    const stderr: string[] = [];
    const exitCode = await runCliAsync(["analyze", "not-a-repository", "--fixture", "small", "--format", "json", "--no-save"], {
      stdout: () => undefined,
      stderr: (message) => stderr.push(message)
    });

    expect(exitCode).toBe(2);
    expect(stderr[0]).toContain("owner/repo");
  });

  it("returns analysis-failure code for failed acquisition", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runCliAsync(["analyze", "fixture-owner/fixture-repo", "--fixture", "failed", "--format", "json", "--no-save"], {
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message)
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout[0] ?? "{}").completeness).toBe("failed");
    expect(stderr).toEqual([]);
  });
});
