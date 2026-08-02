export { runCli } from "./cli/commands.js";
export { runCliAsync } from "./cli/commands.js";
export type { CliOptions, CliWriter } from "./cli/commands.js";
export { analyzeRepository } from "./core/analyzer.js";
export type { AnalyzeOptions } from "./core/analyzer.js";
export { TOOL_NAME, TOOL_VERSION } from "./core/version.js";
export { FixtureProvider, collectPages } from "./github/fixture-provider.js";
export { GitHubClient } from "./github/client.js";
export { authStatus, resolveCredentials } from "./auth/credentials.js";
export type { AuthResolution, CredentialOptions, CredentialSource } from "./auth/credentials.js";
export type { GitHubClientOptions } from "./github/client.js";
export { getFixture, fixtureScenarios } from "./github/fixtures.js";
export { acquireRepositoryData } from "./core/acquisition.js";
export type { AcquisitionOptions, AcquisitionProvenance, AcquisitionResult, AcquisitionStage } from "./core/acquisition.js";
export type {
  FixtureScenario,
  GitHubProvider,
  OnboardingFixture,
  Page,
  PullRequestFixture,
  RepositoryFixture,
  ReviewFixture
} from "./github/types.js";
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
  CancellationError,
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
export {
  BudgetTracker,
  createExecutionBudget,
  emitProgress,
  planAnalysis,
  DEFAULT_EXECUTION_BUDGET
} from "./core/planning.js";
export { calculateActivityMetrics } from "./core/metrics/index.js";
export type { ActivityMetricInput, ActivityMetricResult } from "./core/metrics/index.js";
export { calculateExperienceMetrics } from "./core/metrics/index.js";
export type { ExperienceMetricInput, ExperienceMetricResult } from "./core/metrics/index.js";
export type {
  AnalysisPlan,
  BudgetSnapshot,
  ExecutionBudget,
  ExecutionBudgetInput,
  ProgressEvent,
  SelectedWindow,
  WorkEstimate,
  WorkloadEstimate
} from "./core/planning.js";
export type {
  Confidence,
  Metric,
  Report,
  ReportCompleteness,
  ReportWindow
} from "./core/types.js";
