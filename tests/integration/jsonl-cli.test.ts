import { describe, expect, it } from "vitest";
import { runCliAsync } from "../../src/cli/commands.js";

async function capture(args: string[]) {
  const stdout: string[] = []; const stderr: string[] = [];
  const code = await runCliAsync(args, { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) });
  return { code, stdout, stderr };
}

describe("structured progress CLI", () => {
  it("emits ordered JSONL progress and a final report event", async () => {
    const result = await capture(["analyze", "fixture-owner/fixture-repo", "--fixture", "small", "--window", "90d", "--format", "jsonl", "--no-save"]);
    const events = result.stdout.map((line) => JSON.parse(line));
    expect(events.map((event) => event.type)).toEqual(["progress", "progress", "progress", "progress", "report"]);
    expect(events.slice(0, -1).map((event) => event.phase)).toEqual(["planning", "acquisition", "metrics", "complete"]);
    expect(events.at(-1).report.schema_version).toBe(1);
    for (const event of events.filter((value) => value.type === "progress")) {
      expect(event.completed).toBeLessThanOrEqual(event.estimatedTotal);
    }
    expect(result.stderr).toEqual([]);
  });

  it("keeps quiet JSON stdout limited to the final report", async () => {
    const result = await capture(["analyze", "fixture-owner/fixture-repo", "--fixture", "small", "--format", "json", "--quiet", "--no-save"]);
    expect(result.stdout).toHaveLength(1);
    expect(JSON.parse(result.stdout[0]!).schema_version).toBe(1);
    expect(result.stderr).toEqual([]);
  });

  it("renders human progress on stderr without corrupting stdout", async () => {
    const result = await capture(["analyze", "fixture-owner/fixture-repo", "--fixture", "small", "--format", "human", "--no-save"]);
    expect(result.stdout).toHaveLength(1);
    expect(result.stderr[0]).toContain("[planning]");
    expect(result.stderr.at(-1)).toContain("[complete]");
  });
});
