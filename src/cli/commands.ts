import { reportFromFixture } from "../core/fixture-report.js";
import { InvalidInputError } from "../core/errors.js";
import { getFixture } from "../github/fixtures.js";
import { FixtureProvider } from "../github/fixture-provider.js";
import { authStatus } from "../auth/credentials.js";
import { analyzeRepository } from "../core/analyzer.js";
import { createConfig, parseOutputFormat, parseRepository } from "../core/config.js";
import { formatHumanReport } from "../output/human.js";
import { TOOL_NAME, TOOL_VERSION } from "../core/version.js";
import { readFileSync, writeFileSync } from "node:fs";
import { compareReports } from "../core/comparison.js";
import { SqliteSnapshotStore } from "../storage/sqlite.js";
import { resolveDatabasePath } from "../storage/path.js";
import type { SnapshotExport, SnapshotSummary } from "../storage/types.js";
import type { ProgressEvent } from "../core/planning.js";

export type CliWriter = (message: string) => void;

export interface CliOptions {
  stdout?: CliWriter;
  stderr?: CliWriter;
}

export async function runCliAsync(argv: readonly string[], options: CliOptions = {}): Promise<number> {
  if (argv[0] === "analyze") {
    return runLiveAnalysis(argv.slice(1), options.stdout ?? console.log, options.stderr ?? console.error);
  }
  if (argv[0] === "compare" || argv[0] === "snapshots") return runHistoryCommand(argv, options);
  return runCli(argv, options);
}

export function runCli(argv: readonly string[], options: CliOptions = {}): number {
  const stdout = options.stdout ?? console.log;
  const stderr = options.stderr ?? console.error;
  const [command] = argv;

  if (command === "version" || command === "--version" || command === "-v") {
    stdout(`${TOOL_NAME} ${TOOL_VERSION}`);
    return 0;
  }

  if (command === "analyze") {
    return runFixtureAnalysis(argv.slice(1), stdout, stderr);
  }

  if (command === "auth" && argv[1] === "status") {
    const status = authStatus();
    stdout(`GitHub authentication: ${status.authenticated ? "available" : "not configured"} (${status.source})`);
    return 0;
  }

  if (command === "doctor") {
    stdout(`Node.js: ${process.versions.node}`);
    const status = authStatus();
    stdout(`GitHub authentication: ${status.authenticated ? "available" : "not configured"} (${status.source})`);
    stdout("SQLite: configured for local persistence in a later phase");
    return 0;
  }

  if (command === "compare" || command === "snapshots") return runHistoryCommand(argv, options);

  if (command === "help" || command === "--help" || command === "-h" || command === undefined) {
    stdout(`Usage: ${TOOL_NAME} <command>`);
    stdout("\nCommands:\n  version  Print the tool version");
    return 0;
  }

  stderr(`Unknown command: ${command}`);
  stderr(`Run '${TOOL_NAME} help' for usage.`);
  return 2;
}

function flagValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
}

function requireValue(value: string | undefined, message: string): string {
  if (value === undefined) throw new InvalidInputError(message);
  return value;
}

function findAgainst(summaries: SnapshotSummary[], selector: string): SnapshotSummary | undefined {
  if (selector === "previous") return summaries[1];
  const exact = summaries.find((summary) => summary.id === selector);
  if (exact !== undefined) return exact;
  const timestamp = Date.parse(selector);
  return Number.isNaN(timestamp) ? undefined : summaries.find((summary) => Date.parse(summary.generatedAt) <= timestamp);
}

function runHistoryCommand(argv: readonly string[], options: CliOptions): number {
  const stdout = options.stdout ?? console.log;
  const stderr = options.stderr ?? console.error;
  const dbPath = resolveDatabasePath(flagValue(argv, "--db"));
  let store: SqliteSnapshotStore | undefined;
  try {
    store = new SqliteSnapshotStore(dbPath);
    if (argv[0] === "compare") {
      const repository = requireValue(argv[1], "Compare requires a repository in owner/repo format");
      parseRepository(repository);
      const selector = flagValue(argv, "--against") ?? "previous";
      const summaries = store.list(repository);
      const current = summaries[0];
      const against = findAgainst(summaries, selector);
      if (current === undefined || against === undefined || current.id === against.id) throw new InvalidInputError(`No comparison snapshot found for ${selector}`);
      const comparison = compareReports(store.get(against.id)!.report, store.get(current.id)!.report);
      if ((flagValue(argv, "--format") ?? "human") === "json") stdout(JSON.stringify(comparison));
      else if (!comparison.compatible) stdout(`${repository}: incomparable — ${comparison.reason}`);
      else {
        stdout(`${repository}: ${comparison.changes.length} metric change(s)`);
        for (const change of comparison.changes) stdout(`${change.metric}: ${JSON.stringify(change.before)} -> ${JSON.stringify(change.after)}${change.percentageChange === null ? "" : ` (${change.percentageChange}%)`}`);
      }
      return comparison.compatible ? 0 : 3;
    }
    const action = argv[1];
    if (action === "list") {
      const repository = requireValue(argv[2], "Snapshots list requires a repository");
      for (const summary of store.list(repository)) stdout(`${summary.id}\t${summary.generatedAt}\t${summary.completeness}`);
    } else if (action === "show") {
      const id = requireValue(argv[2], "Snapshots show requires a snapshot ID");
      const snapshot = store.get(id);
      if (snapshot === null) throw new InvalidInputError(`Snapshot not found: ${id}`);
      stdout(JSON.stringify(snapshot.report));
    } else if (action === "export") {
      const repository = requireValue(argv[2], "Snapshots export requires a repository");
      const output = requireValue(flagValue(argv, "--output"), "Snapshots export requires --output <file>");
      writeFileSync(output, `${JSON.stringify(store.export(repository), null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      stdout(`Exported snapshots for ${repository} to ${output}`);
    } else if (action === "import") {
      const input = requireValue(argv[2], "Snapshots import requires a file");
      const result = store.import(JSON.parse(readFileSync(input, "utf8")) as SnapshotExport);
      stdout(`Imported ${result.imported}; skipped ${result.skipped}`);
    } else if (action === "prune") {
      const repository = requireValue(argv[2], "Snapshots prune requires a repository");
      const before = requireValue(flagValue(argv, "--before"), "Snapshots prune requires --before <timestamp>");
      const result = store.prune({ repository, before });
      stdout(`Removed ${result.removed} snapshot(s)`);
    } else throw new InvalidInputError("Snapshots command must be list, show, export, import, or prune");
    return 0;
  } catch (error) {
    stderr(error instanceof Error ? error.message : "Snapshot operation failed");
    return error instanceof InvalidInputError ? 2 : 1;
  } finally { store?.close(); }
}

async function runLiveAnalysis(args: readonly string[], stdout: CliWriter, stderr: CliWriter): Promise<number> {
  try {
    const parsed = parseAnalyzeArgs(args);
    const fixture = parsed.fixture === undefined ? undefined : getFixture(parsed.fixture);
    if (parsed.fixture !== undefined && fixture === undefined) throw new InvalidInputError(`Unknown fixture: ${parsed.fixture}`);
    const progress = (event: ProgressEvent) => {
      if (parsed.format === "jsonl") stdout(JSON.stringify(event));
      else if (parsed.format === "human" && parsed.input?.quiet !== true) stderr(`[${event.phase}] ${event.message} (${event.completed}/${event.estimatedTotal})`);
    };
    const report = await analyzeRepository({
      config: createConfig(parsed.repository, parsed.input),
      progress,
      ...(fixture === undefined ? {} : {
        provider: new FixtureProvider(fixture, parsed.fixture === "failed"
          ? { failures: [{ operation: "getRepository", error: new Error("fixture repository unavailable") }] }
          : {})
      }),
      ...(fixture === undefined ? {} : { generatedAt: "2026-08-02T00:00:00Z" })
    });
    if (parsed.format === "human") stdout(formatHumanReport(report));
    else if (parsed.format === "jsonl") stdout(JSON.stringify({ type: "report", report }));
    else stdout(JSON.stringify(report));
    return parsed.input?.strict === true && report.completeness !== "complete" ? 3 : report.completeness === "failed" ? 1 : 0;
  } catch (error) {
    stderr(error instanceof Error ? error.message : "Analysis failed");
    return error instanceof InvalidInputError ? 2 : 1;
  }
}

function parseDuration(value: string): number {
  const match = /^(\d+)(ms|s|m)?$/.exec(value);
  if (match === null) throw new InvalidInputError("Budget must be a positive duration such as 30s or 2m");
  const amount = Number(match[1]);
  const unit = match[2] ?? "ms";
  return amount * (unit === "m" ? 60_000 : unit === "s" ? 1_000 : 1);
}

function parseAnalyzeArgs(args: readonly string[]): { repository: string; format: "human" | "json" | "jsonl"; input: Parameters<typeof createConfig>[1]; fixture?: string } {
  const repository = args[0];
  if (repository === undefined) throw new InvalidInputError("Analyze requires a repository in owner/repo format");
  const input: Parameters<typeof createConfig>[1] = {};
  let format: "human" | "json" | "jsonl" = "human";
  let fixture: string | undefined;
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === "--window" && value !== undefined) input.window = value;
    else if (flag === "--since" && value !== undefined) input.since = value;
    else if (flag === "--budget" && value !== undefined) input.budgetMs = parseDuration(value);
    else if (flag === "--max-api-requests" && value !== undefined) input.maxApiRequests = Number(value);
    else if (flag === "--max-pages" && value !== undefined) input.maxPages = Number(value);
    else if (flag === "--format" && value !== undefined) format = parseOutputFormat(value);
    else if (flag === "--db" && value !== undefined) input.dbPath = value;
    else if (flag === "--no-cache") input.noCache = true;
    else if (flag === "--include-raw") input.includeRaw = true;
    else if (flag === "--strict") input.strict = true;
    else if (flag === "--quiet") input.quiet = true;
    else if (flag === "--save") input.save = true;
    else if (flag === "--no-save") input.save = false;
    else if (flag === "--dry-run") input.dryRun = true;
    else if (flag === "--fixture" && value !== undefined) fixture = value;
    else if (flag?.startsWith("--")) throw new InvalidInputError(`Unknown analyze option: ${flag}`);
    else continue;
    if (flag !== "--no-cache" && flag !== "--include-raw" && flag !== "--strict" && flag !== "--quiet" && flag !== "--save" && flag !== "--no-save" && flag !== "--dry-run") index += 1;
  }
  return { repository, format, input, ...(fixture === undefined ? {} : { fixture }) };
}

function runFixtureAnalysis(args: readonly string[], stdout: CliWriter, stderr: CliWriter): number {
  const repositoryInput = args[0];
  const fixtureFlag = args.indexOf("--fixture");
  const formatFlag = args.indexOf("--format");
  const fixtureName = fixtureFlag >= 0 ? args[fixtureFlag + 1] : undefined;
  const format = formatFlag >= 0 ? args[formatFlag + 1] : "human";

  try {
    if (repositoryInput === undefined || fixtureName === undefined) {
      throw new InvalidInputError("Fixture analysis requires: analyze owner/repo --fixture <name>");
    }
    const fixture = getFixture(fixtureName);
    if (fixture === undefined) throw new InvalidInputError(`Unknown fixture: ${fixtureName}`);
    const report = reportFromFixture(parseRepository(repositoryInput), fixture);
    const outputFormat = parseOutputFormat(format ?? "human");
    if (outputFormat === "json" || outputFormat === "jsonl") {
      stdout(JSON.stringify(report));
    } else {
      stdout(`${report.target.full_name}: ${report.completeness} fixture report`);
    }
    return report.completeness === "partial" ? 3 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fixture analysis failed";
    stderr(message);
    return error instanceof InvalidInputError ? 2 : 1;
  }
}
