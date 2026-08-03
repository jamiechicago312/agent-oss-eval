import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reportFromFixture } from "../../src/core/fixture-report.js";
import { parseRepository } from "../../src/core/config.js";
import { smallRepositoryFixture } from "../../src/github/fixtures.js";
import { resolveDatabasePath } from "../../src/storage/path.js";
import { SqliteSnapshotStore } from "../../src/storage/sqlite.js";

function report(at = "2026-08-02T00:00:00Z") {
  return { ...reportFromFixture(parseRepository("fixture-owner/fixture-repo"), smallRepositoryFixture), generated_at: at };
}

describe("SQLite snapshot storage", () => {
  it("migrates, saves exact reports, and keeps observations idempotent", () => {
    const store = new SqliteSnapshotStore(":memory:");
    const value = report();
    const observation = { source: "github.pull_requests", sourceId: "1", observedAt: value.generated_at, payload: { state: "open" } };
    const saved = store.save({ report: value, observations: [observation, observation], raw: { private: false } });
    expect(saved.report).toEqual(value);
    expect(saved.raw).toEqual({ private: false });
    expect(store.list(value.target.full_name)).toHaveLength(1);
    expect(store.export(value.target.full_name).snapshots[0]!.observations).toEqual([observation]);
    store.close();
  });

  it("supports deterministic forward reopen, foreign keys, latest, import, and prune", () => {
    const directory = mkdtempSync(join(tmpdir(), "oss-eval-storage-"));
    const path = join(directory, "nested", "history.sqlite3");
    const first = new SqliteSnapshotStore(path);
    first.save({ report: report("2026-07-01T00:00:00Z") });
    first.save({ report: report("2026-08-01T00:00:00Z") });
    const exported = first.export("fixture-owner/fixture-repo");
    first.close();
    const reopened = new SqliteSnapshotStore(path);
    expect(reopened.getLatest("fixture-owner/fixture-repo")!.report.generated_at).toBe("2026-08-01T00:00:00Z");
    expect(reopened.prune({ repository: "fixture-owner/fixture-repo", before: "2026-07-02T00:00:00Z" })).toEqual({ removed: 1 });
    const fresh = new SqliteSnapshotStore(":memory:");
    expect(fresh.import(exported)).toEqual({ imported: 2, skipped: 0 });
    expect(fresh.import(exported)).toEqual({ imported: 0, skipped: 2 });
    reopened.close(); fresh.close();
    expect(readFileSync(path).subarray(0, 6).toString()).toBe("SQLite");
  });

  it("resolves explicit, environment, XDG, and fallback database paths", () => {
    expect(resolveDatabasePath("/explicit/db", { OSS_EVAL_DB: "/env/db" })).toBe("/explicit/db");
    expect(resolveDatabasePath(undefined, { OSS_EVAL_DB: "/env/db" })).toBe("/env/db");
    expect(resolveDatabasePath(undefined, { XDG_DATA_HOME: "/data" })).toBe("/data/oss-eval/history.sqlite3");
  });
});
