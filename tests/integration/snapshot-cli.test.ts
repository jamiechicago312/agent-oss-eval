import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/commands.js";
import { reportFromFixture } from "../../src/core/fixture-report.js";
import { parseRepository } from "../../src/core/config.js";
import { smallRepositoryFixture } from "../../src/github/fixtures.js";
import { SqliteSnapshotStore } from "../../src/storage/sqlite.js";

describe("snapshot CLI", () => {
  it("lists, shows, compares, exports, imports, and prunes", () => {
    const directory = mkdtempSync(join(tmpdir(), "oss-eval-cli-")); const db = join(directory, "db.sqlite");
    const store = new SqliteSnapshotStore(db);
    const first = reportFromFixture(parseRepository("o/r"), smallRepositoryFixture);
    first.metrics.prs_opened = { value: 2, unit: "pull_requests", definition: "Opened", sample_size: 2, source: "fixture", window: "90d", confidence: "measured" };
    first.generated_at = "2026-07-01T00:00:00Z";
    const second = structuredClone(first); second.generated_at = "2026-08-01T00:00:00Z"; second.metrics.prs_opened!.value = 4;
    store.save({ report: first }); store.save({ report: second }); store.close();
    const run = (args: string[]) => { const out: string[] = []; const err: string[] = [];
      const code = runCli([...args, "--db", db], { stdout: (v) => out.push(v), stderr: (v) => err.push(v) }); return { code, out, err }; };
    expect(run(["snapshots", "list", "o/r"]).out).toHaveLength(2);
    expect(JSON.parse(run(["compare", "o/r", "--against", "previous", "--format", "json"]).out[0]!).changes).toHaveLength(1);
    expect(run(["snapshots", "show", `${second.target.full_name}:${second.generated_at}:90d`]).code).toBe(0);
    const output = join(directory, "export.json"); expect(run(["snapshots", "export", "o/r", "--output", output]).code).toBe(0);
    expect(JSON.parse(readFileSync(output, "utf8")).snapshots).toHaveLength(2);
    const freshDb = join(directory, "fresh.sqlite");
    const imported: string[] = []; expect(runCli(["snapshots", "import", output, "--db", freshDb], { stdout: (v) => imported.push(v) })).toBe(0);
    expect(imported[0]).toContain("Imported 2");
    expect(run(["snapshots", "prune", "o/r", "--before", "2026-07-02T00:00:00Z"]).out[0]).toContain("Removed 1");
  });
});
