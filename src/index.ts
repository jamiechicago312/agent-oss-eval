export { runCli } from "./cli/commands.js";
export type { CliOptions, CliWriter } from "./cli/commands.js";
export { TOOL_NAME, TOOL_VERSION } from "./core/version.js";
export {
  createConfig,
  parseIsoTimestamp,
  parseOutputFormat,
  parseRepository,
  parseWindow
} from "./core/config.js";
export type {
  AnalysisConfig,
  OutputFormat,
  RepositoryRef,
  WindowSpec
} from "./core/config.js";
export {
  AnalysisError,
  AuthenticationError,
  BudgetError,
  IncompleteDataError,
  InvalidInputError,
  NotFoundError,
  OssEvalError,
  PermissionError,
  RateLimitError,
  ServerError,
  exitCodeForError
} from "./core/errors.js";
export type { ErrorCode } from "./core/errors.js";
export type {
  Confidence,
  Metric,
  Report,
  ReportCompleteness,
  ReportWindow
} from "./core/types.js";
