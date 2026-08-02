import { InvalidInputError } from "./errors.js";

export interface RepositoryRef {
  owner: string;
  name: string;
  fullName: string;
  url: string;
}

export type WindowSpec = "auto" | "30d" | "90d" | { days: number };
export type OutputFormat = "human" | "json" | "jsonl";

export interface AnalysisConfig {
  repository: RepositoryRef;
  window: WindowSpec;
  since?: string;
  budgetMs?: number;
  maxApiRequests?: number;
  maxConcurrency?: number;
  maxPages?: number;
  format: OutputFormat;
  dbPath?: string;
  noCache: boolean;
  includeRaw: boolean;
  strict: boolean;
  quiet: boolean;
  save: boolean;
  dryRun: boolean;
}

export interface ConfigInput {
  window?: string | number;
  since?: string;
  budgetMs?: number;
  maxApiRequests?: number;
  maxConcurrency?: number;
  maxPages?: number;
  format?: string;
  dbPath?: string;
  noCache?: boolean;
  includeRaw?: boolean;
  strict?: boolean;
  quiet?: boolean;
  save?: boolean;
  dryRun?: boolean;
}

const REPOSITORY_PART = /^[A-Za-z0-9_.-]+$/;

export function parseRepository(input: string): RepositoryRef {
  const parts = input.split("/");
  if (parts.length !== 2 || parts.some((part) => !REPOSITORY_PART.test(part))) {
    throw new InvalidInputError("Repository must use the owner/repo format");
  }

  const [owner, name] = parts as [string, string];
  return {
    owner,
    name,
    fullName: `${owner}/${name}`,
    url: `https://github.com/${owner}/${name}`
  };
}

export function parseIsoTimestamp(value: string): string {
  if (Number.isNaN(Date.parse(value)) || !value.includes("T")) {
    throw new InvalidInputError(`Invalid ISO-8601 timestamp: ${value}`);
  }
  return value;
}

export function parseWindow(value: string | number): WindowSpec {
  if (value === "auto" || value === "30d" || value === "90d") {
    return value;
  }

  const days = typeof value === "number" ? value : Number(value.endsWith("d") ? value.slice(0, -1) : value);
  if (!Number.isInteger(days) || days <= 0 || days > 3650) {
    throw new InvalidInputError("Window must be auto, 30d, 90d, or a positive integer number of days");
  }
  return { days };
}

export function parseOutputFormat(value: string): OutputFormat {
  if (value === "human" || value === "json" || value === "jsonl") {
    return value;
  }
  throw new InvalidInputError("Format must be human, json, or jsonl");
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new InvalidInputError(`${label} must be a positive integer`);
  }
  return value;
}

export function createConfig(repository: string, input: ConfigInput = {}): AnalysisConfig {
  const config: AnalysisConfig = {
    repository: parseRepository(repository),
    window: parseWindow(input.window ?? "auto"),
    format: parseOutputFormat(input.format ?? "human"),
    noCache: input.noCache ?? false,
    includeRaw: input.includeRaw ?? false,
    strict: input.strict ?? false,
    quiet: input.quiet ?? false,
    save: input.save ?? true,
    dryRun: input.dryRun ?? false
  };

  if (input.since !== undefined) config.since = parseIsoTimestamp(input.since);
  if (input.budgetMs !== undefined) config.budgetMs = positiveInteger(input.budgetMs, "Budget");
  if (input.maxApiRequests !== undefined) {
    config.maxApiRequests = positiveInteger(input.maxApiRequests, "Maximum API requests");
  }
  if (input.maxConcurrency !== undefined) config.maxConcurrency = positiveInteger(input.maxConcurrency, "Maximum concurrency");
  if (input.maxPages !== undefined) config.maxPages = positiveInteger(input.maxPages, "Maximum pages");
  if (input.dbPath !== undefined) {
    if (input.dbPath.trim() === "") throw new InvalidInputError("Database path cannot be empty");
    config.dbPath = input.dbPath;
  }
  return config;
}
