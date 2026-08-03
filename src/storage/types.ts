import type { JsonValue, Report } from "../core/types.js";

export interface ObservationInput {
  source: string;
  sourceId: string;
  observedAt: string;
  payload: JsonValue;
}

export interface SaveSnapshotInput {
  report: Report;
  observations?: readonly ObservationInput[];
  raw?: JsonValue;
}

export interface StoredSnapshot {
  id: string;
  report: Report;
  raw: JsonValue | null;
}

export interface SnapshotSummary {
  id: string;
  repository: string;
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  schemaVersion: number;
  completeness: Report["completeness"];
}

export interface SnapshotExport {
  formatVersion: 1;
  repository: string;
  snapshots: Array<StoredSnapshot & { observations: ObservationInput[] }>;
}

export interface PruneOptions {
  repository?: string;
  before: string;
}

export interface SnapshotStore {
  getLatest(repository: string): StoredSnapshot | null;
  save(input: SaveSnapshotInput): StoredSnapshot;
  list(repository?: string): SnapshotSummary[];
  get(id: string): StoredSnapshot | null;
  export(repository: string): SnapshotExport;
  import(data: SnapshotExport): { imported: number; skipped: number };
  prune(options: PruneOptions): { removed: number };
  close(): void;
}
