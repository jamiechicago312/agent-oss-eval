import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { runCliAsync } from "../../src/cli/commands.js";
import { evaluateRepository } from "../../src/programmatic.js";
import { FixtureProvider } from "../../src/github/fixture-provider.js";
import { smallRepositoryFixture } from "../../src/github/fixtures.js";
import { formatHumanReport } from "../../src/output/human.js";
import { SqliteSnapshotStore } from "../../src/storage/sqlite.js";
import { createMcpServer } from "../../src/mcp/server.js";

function capture(args: string[]) {
  const stdout: string[] = []; const stderr: string[] = [];
  return runCliAsync(args, { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) })
    .then((code) => ({ code, stdout, stderr }));
}

describe("canonical output parity", () => {
  it("keeps report values equal across every supported adapter", async () => {
    const options = { window: "30d" as const, save: false, provider: new FixtureProvider(smallRepositoryFixture),
      generatedAt: "2026-08-02T00:00:00Z" };
    const report = await evaluateRepository("fixture-owner/fixture-repo", options);
    const json = await capture(["analyze", "fixture-owner/fixture-repo", "--fixture", "small", "--window", "30d", "--format", "json", "--no-save"]);
    const jsonl = await capture(["analyze", "fixture-owner/fixture-repo", "--fixture", "small", "--window", "30d", "--format", "jsonl", "--no-save"]);
    const human = await capture(["analyze", "fixture-owner/fixture-repo", "--fixture", "small", "--window", "30d", "--format", "human", "--no-save"]);
    expect(JSON.parse(json.stdout[0]!)).toEqual(report);
    expect(JSON.parse(jsonl.stdout.at(-1)!).report).toEqual(report);
    expect(human.stdout).toEqual([formatHumanReport(report)]);

    const store = new SqliteSnapshotStore(":memory:"); store.save({ report });
    expect(store.getLatest(report.target.full_name)?.report).toEqual(report); store.close();

    const server = createMcpServer({ analyze: async () => report });
    const client = new Client({ name: "contract-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const result = await client.callTool({ name: "evaluate_repository", arguments: { repository: report.target.full_name, window: "30d" } });
    expect(JSON.parse(((result as { content: Array<{ text: string }> }).content[0]!).text)).toEqual(report);
    await client.close(); await server.close();
  });
});
