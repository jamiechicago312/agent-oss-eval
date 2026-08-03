import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { analyzeRepository, type AnalyzeOptions } from "../core/analyzer.js";
import { createConfig } from "../core/config.js";
import type { ProgressEvent } from "../core/planning.js";
import type { Report } from "../core/types.js";
import { SqliteSnapshotStore } from "../storage/sqlite.js";
import { resolveDatabasePath } from "../storage/path.js";
import { TOOL_NAME, TOOL_VERSION } from "../core/version.js";

export type AnalyzeFunction = (options: AnalyzeOptions) => Promise<Report>;

export interface McpServerDependencies {
  analyze?: AnalyzeFunction;
  dbPath?: string;
}

function safeMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "Analysis failed")
    .replace(/gh[pousr]_[A-Za-z0-9_]+/g, "[REDACTED_TOKEN]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED_TOKEN]");
}

export function createMcpServer(dependencies: McpServerDependencies = {}): McpServer {
  const server = new McpServer({ name: TOOL_NAME, version: TOOL_VERSION });
  const analyze = dependencies.analyze ?? analyzeRepository;

  server.registerTool("evaluate_repository", {
    title: "Evaluate a GitHub repository",
    description: "Analyze a repository with the canonical oss-eval engine and return its report.",
    inputSchema: {
      repository: z.string().describe("Repository in owner/repo form"),
      window: z.enum(["auto", "30d", "90d"]).optional(),
      time_budget_seconds: z.number().int().positive().optional(),
      max_api_requests: z.number().int().positive().optional(),
      include_comparison: z.boolean().optional(),
      include_raw: z.boolean().optional()
    }
  }, async (input, extra) => {
    try {
      const progress = (event: ProgressEvent) => {
        const progressToken = extra._meta?.progressToken;
        if (progressToken !== undefined) void extra.sendNotification({ method: "notifications/progress", params: {
          progressToken, progress: event.completed, total: event.estimatedTotal,
          message: JSON.stringify({ phase: event.phase, message: event.message, requests_used: event.requestsUsed,
            rate_limit_remaining: event.rateLimitRemaining, window: event.window, resumable: event.resumable })
        } });
      };
      const report = await analyze({ config: createConfig(input.repository, {
        window: input.window ?? "auto",
        ...(input.time_budget_seconds === undefined ? {} : { budgetMs: input.time_budget_seconds * 1000 }),
        ...(input.max_api_requests === undefined ? {} : { maxApiRequests: input.max_api_requests, maxPages: input.max_api_requests }),
        includeRaw: input.include_raw ?? false,
        save: true,
        format: "json",
        quiet: true
      }), progress, signal: extra.signal });
      const result = { ...report, comparison: input.include_comparison === true ? report.comparison : null };
      return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: safeMessage(error) }] };
    }
  });

  server.registerTool("get_analysis_status", {
    description: "Read a durable analysis job status from the local SQLite database.",
    inputSchema: { job_id: z.string().min(1) }
  }, ({ job_id }) => {
    const store = new SqliteSnapshotStore(resolveDatabasePath(dependencies.dbPath));
    try {
      const job = store.getJob(job_id);
      if (job === null) return { isError: true, content: [{ type: "text", text: `Analysis job not found: ${job_id}` }] };
      return { content: [{ type: "text", text: JSON.stringify(job) }] };
    } finally { store.close(); }
  });

  server.registerTool("continue_analysis", {
    description: "Return the durable continuation state for a paused or cancelled analysis job.",
    inputSchema: { job_id: z.string().min(1), time_budget_seconds: z.number().int().positive().optional() }
  }, ({ job_id, time_budget_seconds }) => {
    const store = new SqliteSnapshotStore(resolveDatabasePath(dependencies.dbPath));
    try {
      const job = store.getJob(job_id);
      if (job === null) return { isError: true, content: [{ type: "text", text: `Analysis job not found: ${job_id}` }] };
      const result = { ...job, continuation: { time_budget_seconds: time_budget_seconds ?? null,
        next_item: job.completedItems, resumable: job.status !== "completed" } };
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } finally { store.close(); }
  });

  return server;
}

export async function startStdioMcpServer(dependencies: McpServerDependencies = {}): Promise<void> {
  await createMcpServer(dependencies).connect(new StdioServerTransport());
}
