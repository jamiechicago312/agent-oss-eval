import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli/commands.js";

function captureCli(argv: readonly string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = runCli(argv, {
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message)
  });

  return { exitCode, stdout, stderr };
}

describe("oss-eval CLI foundation", () => {
  it("prints the version", () => {
    const result = captureCli(["version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toEqual(["oss-eval 0.1.0"]);
    expect(result.stderr).toEqual([]);
  });

  it("prints help without a command", () => {
    const result = captureCli([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain("Usage: oss-eval <command>");
  });

  it("rejects unknown commands", () => {
    const result = captureCli(["unknown"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toEqual([
      "Unknown command: unknown",
      "Run 'oss-eval help' for usage."
    ]);
  });
});
