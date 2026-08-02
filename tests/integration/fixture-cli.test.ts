import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/commands.js";
import { validateReport } from "../contract/schema-validator.js";

describe("fixture CLI smoke test", () => {
  it("emits a valid JSON report without network access", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = runCli(["analyze", "fixture-owner/fixture-repo", "--fixture", "small", "--format", "json"], {
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message)
    });

    const report = JSON.parse(stdout[0] ?? "{}");
    expect(exitCode).toBe(0);
    expect(validateReport(report)).toBe(true);
    expect(report.completeness).toBe("complete");
    expect(report.provenance.network_requests).toBe(0);
    expect(stderr).toEqual([]);
  });

  it("returns material-limitations code for a partial fixture", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = runCli(["analyze", "fixture-owner/fixture-repo", "--fixture", "partial", "--format", "json"], {
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message)
    });

    expect(exitCode).toBe(3);
    expect(JSON.parse(stdout[0] ?? "{}").limitations).toHaveLength(1);
    expect(stderr).toEqual([]);
  });
});
