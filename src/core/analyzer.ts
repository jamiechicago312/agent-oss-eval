import { createConfig, type AnalysisConfig } from "./config.js";
import { acquireRepositoryData, type AcquisitionResult } from "./acquisition.js";
import { calculateActivityMetrics } from "./metrics/activity.js";
import { calculateExperienceMetrics } from "./metrics/experience.js";
import { planAnalysis, type ExecutionBudget, type ProgressListener, type WorkloadEstimate } from "./planning.js";
import type { Metric, Report, JsonObject, JsonValue } from "./types.js";
import { GitHubClient } from "../github/client.js";
import type { GitHubProvider } from "../github/types.js";

export interface AnalyzeOptions {
  config: AnalysisConfig;
  provider?: GitHubProvider;
  generatedAt?: string;
  progress?: ProgressListener;
}

const DEFAULT_ESTIMATE: WorkloadEstimate = {
  byWindow: {
    "30d": { requests: 30, durationMs: 20_000, pages: 20 },
    "90d": { requests: 90, durationMs: 60_000, pages: 60 }
  }
};

function isoDaysBefore(value: string, days: number): string {
  return new Date(Date.parse(value) - days * 86_400_000).toISOString();
}

function windowDays(selected: "30d" | "90d" | { days: number }): number {
  return typeof selected === "string" ? Number(selected.slice(0, -1)) : selected.days;
}

function asJson(value: unknown): JsonValue {
  return value as JsonValue;
}

function repositoryContext(result: AcquisitionResult): JsonObject {
  if (result.repository === null) return {};
  return {
    id: result.repository.id,
    description: result.repository.description,
    stars: result.repository.stars,
    forks: result.repository.forks,
    open_issues: result.repository.openIssues,
    archived: result.repository.archived,
    license: result.repository.license,
    default_branch: result.repository.defaultBranch,
    created_at: result.repository.createdAt
  };
}

function onboardingSignals(result: AcquisitionResult): JsonValue[] {
  if (result.onboarding === null) return [];
  return [
    { type: "contributing_guide", path: result.onboarding.contributingGuidePath },
    { type: "code_of_conduct", path: result.onboarding.codeOfConductPath },
    { type: "issue_templates", paths: result.onboarding.issueTemplatePaths },
    { type: "pull_request_template", path: result.onboarding.pullRequestTemplatePath },
    { type: "good_first_issue", label: result.onboarding.goodFirstIssueLabel }
  ];
}

function markPartiallyCollectedMetrics(
  metrics: Record<string, Metric>,
  failedStages: string[]
): Record<string, Metric> {
  const reviewDataIncomplete = failedStages.some((stage) => stage.startsWith("reviews:"));
  const pullRequestDataIncomplete = failedStages.includes("pullRequests");
  return Object.fromEntries(Object.entries(metrics).map(([name, metric]) => {
    const reviewMetric = metric.source === "github.pull_request_reviews";
    const pullRequestMetric = metric.source === "github.pull_requests";
    const incomplete = (reviewDataIncomplete && reviewMetric) || (pullRequestDataIncomplete && pullRequestMetric);
    return [name, incomplete && metric.confidence !== "cached" ? { ...metric, confidence: "partial" } : metric];
  }));
}

export async function analyzeRepository(options: AnalyzeOptions): Promise<Report> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const executionBudget: Partial<ExecutionBudget> = {
    ...(options.config.budgetMs === undefined ? {} : { maxDurationMs: options.config.budgetMs }),
    ...(options.config.maxApiRequests === undefined ? {} : { maxApiRequests: options.config.maxApiRequests }),
    ...(options.config.maxConcurrency === undefined ? {} : { maxConcurrency: options.config.maxConcurrency }),
    ...(options.config.maxPages === undefined ? {} : { maxPages: options.config.maxPages }),
    resumablePersistence: false
  };
  const plan = planAnalysis(options.config.window, executionBudget, DEFAULT_ESTIMATE, { dryRun: options.config.dryRun });
  const days = windowDays(plan.selectedWindow);
  const windowEnd = generatedAt;
  const windowStart = options.config.since ?? isoDaysBefore(windowEnd, days);
  const provider = options.provider ?? new GitHubClient({});
  options.progress?.({
    type: "progress",
    phase: "planning",
    message: plan.reason,
    completed: 0,
    estimatedTotal: plan.estimate.pages,
    requestsUsed: 0,
    rateLimitRemaining: null,
    window: typeof plan.selectedWindow === "string" ? plan.selectedWindow : `${plan.selectedWindow.days}d`,
    resumable: plan.resumable
  });

  const acquisition = await acquireRepositoryData({
    provider,
    repository: options.config.repository,
    windowStart,
    windowEnd,
    maxPages: plan.budget.maxPages
  });
  const activity = calculateActivityMetrics({
    pullRequests: acquisition.pullRequests,
    reviews: acquisition.reviews,
    window: `${days}d`
  });
  const experience = calculateExperienceMetrics({
    pullRequests: acquisition.pullRequests,
    reviews: acquisition.reviews,
    onboarding: acquisition.onboarding,
    window: `${days}d`
  });
  const metrics = markPartiallyCollectedMetrics(
    { ...activity.metrics, ...experience.metrics },
    acquisition.failedStages
  );
  const limitations = [
    ...acquisition.limitations,
    ...activity.limitations,
    ...experience.limitations,
    ...(plan.mode === "partial" ? [plan.reason] : []),
    ...(options.config.save ? ["Snapshot persistence is not implemented yet; use --no-save until issue #11."] : []),
    ...(options.config.includeRaw ? ["Raw payload storage is not implemented yet."] : [])
  ];
  const completeness = acquisition.completeness === "failed"
    ? "failed"
    : limitations.length > 0 || plan.mode === "partial" ? "partial" : "complete";

  return {
    schema_version: 1,
    tool: { name: "oss-eval", version: "0.1.0" },
    target: {
      owner: options.config.repository.owner,
      name: options.config.repository.name,
      full_name: options.config.repository.fullName,
      url: options.config.repository.url
    },
    generated_at: generatedAt,
    window: { start: windowStart, end: windowEnd, days },
    repository: repositoryContext(acquisition),
    metrics,
    signals: onboardingSignals(acquisition),
    comparison: null,
    provenance: {
      acquisition: asJson(acquisition.provenance),
      plan: asJson(plan),
      requested_window: options.config.window,
      cache_reused: false
    },
    limitations,
    completeness
  };
}

export { createConfig };
