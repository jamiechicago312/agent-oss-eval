import type { JsonValue, Metric, Report } from "./types.js";

export interface MetricChange {
  metric: string;
  kind: "added" | "removed" | "changed";
  before: JsonValue | null;
  after: JsonValue | null;
  percentageChange: number | null;
}

export interface ReportComparison {
  compatible: boolean;
  reason: string | null;
  repository: string;
  before: string;
  after: string;
  changes: MetricChange[];
}

function percentage(before: Metric | undefined, after: Metric | undefined): number | null {
  if (typeof before?.value !== "number" || typeof after?.value !== "number" || before.value === 0 || before.unit !== after.unit) return null;
  return Math.round(((after.value - before.value) / Math.abs(before.value)) * 10_000) / 100;
}

export function compareReports(before: Report, after: Report): ReportComparison {
  const base = { repository: after.target.full_name, before: before.generated_at, after: after.generated_at };
  if (before.target.full_name !== after.target.full_name) return { ...base, compatible: false, reason: "Repository targets differ", changes: [] };
  if (before.schema_version !== after.schema_version) return { ...base, compatible: false, reason: "Report schema versions differ", changes: [] };
  if (before.window.days !== after.window.days) return { ...base, compatible: false, reason: `Analysis windows differ (${before.window.days}d vs ${after.window.days}d)`, changes: [] };
  const names = [...new Set([...Object.keys(before.metrics), ...Object.keys(after.metrics)])].sort();
  const changes = names.flatMap((metric): MetricChange[] => {
    const previous = before.metrics[metric];
    const current = after.metrics[metric];
    if (JSON.stringify(previous) === JSON.stringify(current)) return [];
    return [{ metric, kind: previous === undefined ? "added" : current === undefined ? "removed" : "changed",
      before: previous?.value ?? null, after: current?.value ?? null, percentageChange: percentage(previous, current) }];
  });
  return { ...base, compatible: true, reason: null, changes };
}
