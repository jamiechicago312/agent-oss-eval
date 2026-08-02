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

  if (command === "help" || command === "--help" || command === "-h" || command === undefined) {
    stdout(`Usage: ${TOOL_NAME} <command>`);
    stdout("\nCommands:\n  version  Print the tool version");
    return 0;
  }

  stderr(`Unknown command: ${command}`);
  stderr(`Run '${TOOL_NAME} help' for usage.`);
  return 2;
}
