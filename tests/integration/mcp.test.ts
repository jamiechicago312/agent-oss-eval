import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../src/mcp/server.js";
import { reportFromFixture } from "../../src/core/fixture-report.js";
import { smallRepositoryFixture } from "../../src/github/fixtures.js";
import { validateReport } from "../contract/schema-validator.js";

describe("local MCP server", () => {
  it("invokes the canonical report model without network access and streams progress", async () => {
    const progress: unknown[] = [];
    const server = createMcpServer({ analyze: async (options) => {
      options.progress?.({ type: "progress", phase: "fixture", message: "Fixture loaded", completed: 1,
        estimatedTotal: 1, requestsUsed: 0, rateLimitRemaining: null, window: "30d", resumable: true });
      return reportFromFixture(options.config.repository, smallRepositoryFixture);
    } });
    const client = new Client({ name: "fixture-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(["evaluate_repository", "get_analysis_status", "continue_analysis"]);
    const result = await client.callTool({ name: "evaluate_repository", arguments: { repository: "fixture-owner/fixture-repo", window: "30d" } }, undefined,
      { onprogress: (event) => progress.push(event), resetTimeoutOnProgress: true });
    const report = JSON.parse(((result as { content: Array<{ text: string }> }).content[0]!).text);
    expect(validateReport(report)).toBe(true);
    expect(progress).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(/ghp_|Bearer /);
    await client.close(); await server.close();
  });

  it("redacts tokens from typed tool errors", async () => {
    const server = createMcpServer({ analyze: async () => { throw new Error("Bearer ghp_secretvalue"); } });
    const client = new Client({ name: "fixture-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const result = await client.callTool({ name: "evaluate_repository", arguments: { repository: "o/r" } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("REDACTED_TOKEN");
    expect(JSON.stringify(result)).not.toContain("secretvalue");
    await client.close(); await server.close();
  });
});
