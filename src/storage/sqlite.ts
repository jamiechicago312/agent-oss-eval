import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { JsonValue, Report } from "../core/types.js";
import { InvalidInputError } from "../core/errors.js";
import type {
  PruneOptions,
  SaveSnapshotInput,
  SnapshotExport,
  SnapshotStore,
  SnapshotSummary,
  StoredSnapshot
} from "./types.js";

const MIGRATIONS = [{
  version: 1,
  sql: `
    CREATE TABLE repositories (
      id INTEGER PRIMARY KEY,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      full_name TEXT NOT NULL UNIQUE,
      github_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE snapshots (
      id TEXT PRIMARY KEY,
      repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      generated_at TEXT NOT NULL,
      window_start TEXT NOT NULL,
      window_end TEXT NOT NULL,
      tool_version TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      completeness TEXT NOT NULL,
      report_json TEXT NOT NULL,
      raw_json TEXT,
      UNIQUE(repository_id, generated_at, window_start, window_end, schema_version)
    );
    CREATE TABLE observations (
      id INTEGER PRIMARY KEY,
      snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      UNIQUE(snapshot_id, source, source_id)
    );
    CREATE INDEX snapshots_repository_generated_idx ON snapshots(repository_id, generated_at DESC);
    CREATE INDEX observations_snapshot_idx ON observations(snapshot_id);
  `
}];

interface SnapshotRow {
  id: string;
  report_json: string;
  raw_json: string | null;
}

interface SummaryRow {
  id: string;
  full_name: string;
  generated_at: string;
  window_start: string;
  window_end: string;
  schema_version: number;
  completeness: Report["completeness"];
}

function snapshotId(report: Report): string {
  return `${report.target.full_name}:${report.generated_at}:${report.window.days}d`;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

export class SqliteSnapshotStore implements SnapshotStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path.trim() === "") throw new InvalidInputError("Database path cannot be empty");
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    try {
      this.db = new DatabaseSync(path);
      this.db.exec("PRAGMA foreign_keys = ON");
      this.db.exec("PRAGMA journal_mode = WAL");
      this.migrate();
    } catch (error) {
      throw new InvalidInputError(`Unable to open SQLite database at ${path}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  private migrate(): void {
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
    const applied = new Set(this.db.prepare("SELECT version FROM schema_migrations").all().map((row) => (row as { version: number }).version));
    for (const migration of MIGRATIONS) if (!applied.has(migration.version)) {
      this.transaction(() => {
        this.db.exec(migration.sql);
        this.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(migration.version, new Date().toISOString());
      });
    }
  }

  save(input: SaveSnapshotInput): StoredSnapshot {
    const { report } = input;
    const id = snapshotId(report);
    this.transaction(() => {
      this.db.prepare(`
        INSERT INTO repositories(owner, name, full_name, github_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(full_name) DO UPDATE SET owner=excluded.owner, name=excluded.name,
          github_id=COALESCE(excluded.github_id, repositories.github_id), updated_at=excluded.updated_at
      `).run(report.target.owner, report.target.name, report.target.full_name,
        typeof report.repository.id === "number" ? report.repository.id : null, report.generated_at, report.generated_at);
      const repository = this.db.prepare("SELECT id FROM repositories WHERE full_name = ?").get(report.target.full_name) as { id: number };
      this.db.prepare(`
        INSERT INTO snapshots(id, repository_id, generated_at, window_start, window_end, tool_version, schema_version, completeness, report_json, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET completeness=excluded.completeness, report_json=excluded.report_json,
          raw_json=COALESCE(excluded.raw_json, snapshots.raw_json)
      `).run(id, repository.id, report.generated_at, report.window.start, report.window.end,
        report.tool.version, report.schema_version, report.completeness, JSON.stringify(report),
        input.raw === undefined ? null : JSON.stringify(input.raw));
      const insertObservation = this.db.prepare(`
        INSERT INTO observations(snapshot_id, source, source_id, observed_at, payload_json)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(snapshot_id, source, source_id) DO UPDATE SET observed_at=excluded.observed_at, payload_json=excluded.payload_json
      `);
      for (const observation of input.observations ?? []) {
        insertObservation.run(id, observation.source, observation.sourceId, observation.observedAt, JSON.stringify(observation.payload));
      }
    });
    return this.get(id)!;
  }

  getLatest(repository: string): StoredSnapshot | null {
    const row = this.db.prepare(`
      SELECT s.id, s.report_json, s.raw_json FROM snapshots s
      JOIN repositories r ON r.id = s.repository_id WHERE r.full_name = ?
      ORDER BY s.generated_at DESC, s.id DESC LIMIT 1
    `).get(repository) as SnapshotRow | undefined;
    return row === undefined ? null : this.rowToSnapshot(row);
  }

  get(id: string): StoredSnapshot | null {
    const row = this.db.prepare("SELECT id, report_json, raw_json FROM snapshots WHERE id = ?").get(id) as SnapshotRow | undefined;
    return row === undefined ? null : this.rowToSnapshot(row);
  }

  list(repository?: string): SnapshotSummary[] {
    const rows = this.db.prepare(`
      SELECT s.id, r.full_name, s.generated_at, s.window_start, s.window_end, s.schema_version, s.completeness
      FROM snapshots s JOIN repositories r ON r.id = s.repository_id
      ${repository === undefined ? "" : "WHERE r.full_name = ?"}
      ORDER BY s.generated_at DESC, s.id DESC
    `).all(...(repository === undefined ? [] : [repository])) as unknown as SummaryRow[];
    return rows.map((row) => ({ id: row.id, repository: row.full_name, generatedAt: row.generated_at,
      windowStart: row.window_start, windowEnd: row.window_end, schemaVersion: row.schema_version, completeness: row.completeness }));
  }

  export(repository: string): SnapshotExport {
    const snapshots = this.list(repository).map((summary) => {
      const snapshot = this.get(summary.id)!;
      const observations = this.db.prepare(`
        SELECT source, source_id, observed_at, payload_json FROM observations WHERE snapshot_id = ? ORDER BY id
      `).all(summary.id) as Array<{ source: string; source_id: string; observed_at: string; payload_json: string }>;
      return { ...snapshot, observations: observations.map((row) => ({ source: row.source, sourceId: row.source_id,
        observedAt: row.observed_at, payload: parseJson<JsonValue>(row.payload_json) })) };
    });
    return { formatVersion: 1, repository, snapshots };
  }

  import(data: SnapshotExport): { imported: number; skipped: number } {
    if (data.formatVersion !== 1 || !Array.isArray(data.snapshots)) throw new InvalidInputError("Unsupported snapshot export format");
    let imported = 0;
    let skipped = 0;
    for (const snapshot of data.snapshots) {
      if (this.get(snapshot.id) !== null) { skipped += 1; continue; }
      this.save({ report: snapshot.report, observations: snapshot.observations,
        ...(snapshot.raw === null ? {} : { raw: snapshot.raw }) });
      imported += 1;
    }
    return { imported, skipped };
  }

  prune(options: PruneOptions): { removed: number } {
    if (Number.isNaN(Date.parse(options.before))) throw new InvalidInputError("Prune boundary must be an ISO-8601 timestamp");
    const statement = this.db.prepare(`DELETE FROM snapshots WHERE generated_at < ? ${options.repository === undefined
      ? "" : "AND repository_id = (SELECT id FROM repositories WHERE full_name = ?)"}`);
    const result = statement.run(options.before, ...(options.repository === undefined ? [] : [options.repository]));
    return { removed: Number(result.changes) };
  }

  close(): void { this.db.close(); }

  private transaction(operation: () => void): void {
    this.db.exec("BEGIN IMMEDIATE");
    try { operation(); this.db.exec("COMMIT"); }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  private rowToSnapshot(row: SnapshotRow): StoredSnapshot {
    return { id: row.id, report: parseJson<Report>(row.report_json),
      raw: row.raw_json === null ? null : parseJson<JsonValue>(row.raw_json) };
  }
}
