import { reportFromFixture } from "../core/fixture-report.js";
import { InvalidInputError } from "../core/errors.js";
import { getFixture } from "../github/fixtures.js";
import { parseOutputFormat, parseRepository } from "../core/config.js";
import { TOOL_NAME, TOOL_VERSION } from "../core/version.js";

export type CliWriter = (message: string) => void;

export interface CliOptions {
  stdout?: CliWriter;
  stderr?: CliWriter;
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

  if (command === "help" || command === "--help" || command === "-h" || command === undefined) {
    stdout(`Usage: ${TOOL_NAME} <command>`);
    stdout("\nCommands:\n  version  Print the tool version");
    return 0;
  }

  stderr(`Unknown command: ${command}`);
  stderr(`Run '${TOOL_NAME} help' for usage.`);
  return 2;
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
