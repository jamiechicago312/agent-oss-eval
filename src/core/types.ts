export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type Confidence = "measured" | "inferred" | "cached" | "partial" | "unavailable";
export type ReportCompleteness = "complete" | "partial" | "failed";

export interface ReportWindow {
  start: string;
  end: string;
  days: number;
}

export interface Metric {
  value: JsonValue;
  unit: string;
  definition: string;
  sample_size: number;
  source: string;
  window: string;
  confidence: Confidence;
}

export interface ReportTarget {
  owner: string;
  name: string;
  full_name: string;
  url: string;
}

export interface Report {
  schema_version: 1;
  tool: {
    name: string;
    version: string;
  };
  target: ReportTarget;
  generated_at: string;
  window: ReportWindow;
  repository: JsonObject;
  metrics: Record<string, Metric>;
  signals: JsonValue[];
  comparison: JsonValue | null;
  provenance: JsonObject;
  limitations: string[];
  completeness: ReportCompleteness;
}
