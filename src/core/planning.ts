import type { WindowSpec } from "./config.js";
import { BudgetError, CancellationError } from "./errors.js";

export interface ExecutionBudget {
  maxDurationMs: number;
  maxApiRequests: number;
  maxConcurrency: number;
  maxPages: number;
  rateLimitResetAt?: string;
  resumablePersistence: boolean;
}

export interface ExecutionBudgetInput {
  maxDurationMs?: number;
  maxApiRequests?: number;
  maxConcurrency?: number;
  maxPages?: number;
  rateLimitResetAt?: string;
  resumablePersistence?: boolean;
}

export const DEFAULT_EXECUTION_BUDGET: ExecutionBudget = {
  maxDurationMs: 120_000,
  maxApiRequests: 500,
  maxConcurrency: 4,
  maxPages: 100,
  resumablePersistence: false
};

export interface WorkEstimate {
  requests: number;
  durationMs: number;
  pages: number;
}

export interface WorkloadEstimate {
  byWindow: {
    "30d": WorkEstimate;
    "90d": WorkEstimate;
  };
}

export type SelectedWindow = "30d" | "90d" | { days: number };

export interface AnalysisPlan {
  planVersion: 1;
  requestedWindow: WindowSpec;
  selectedWindow: SelectedWindow;
  mode: "full" | "partial";
  reason: string;
  estimate: WorkEstimate;
  budget: ExecutionBudget;
  resumable: boolean;
  dryRun: boolean;
}

export interface PlannerOptions {
  now?: () => number;
  dryRun?: boolean;
}

export interface ProgressEvent {
  type: "progress";
  phase: string;
  message: string;
  completed: number;
  estimatedTotal: number;
  requestsUsed: number;
  rateLimitRemaining: number | null;
  window: string;
  resumable: boolean;
}

export type ProgressListener = (event: ProgressEvent) => void;

export interface BudgetSnapshot {
  elapsedMs: number;
  requestsUsed: number;
  pagesUsed: number;
  remainingMs: number;
  remainingRequests: number;
  remainingPages: number;
}

export function createExecutionBudget(input: ExecutionBudgetInput = {}): ExecutionBudget {
  const budget = { ...DEFAULT_EXECUTION_BUDGET, ...input };
  for (const [name, value] of Object.entries(budget)) {
    if (["maxDurationMs", "maxApiRequests", "maxConcurrency", "maxPages"].includes(name) && (typeof value !== "number" || !Number.isInteger(value) || value <= 0)) {
      throw new BudgetError(`${name} must be a positive integer`);
    }
  }
  if (budget.rateLimitResetAt !== undefined && Number.isNaN(Date.parse(budget.rateLimitResetAt))) {
    throw new BudgetError("rateLimitResetAt must be an ISO timestamp");
  }
  return budget;
}

function daysForWindow(window: WindowSpec): number {
  if (window === "auto") return 90;
  if (window === "30d") return 30;
  if (window === "90d") return 90;
  return window.days;
}

function labelForWindow(window: SelectedWindow): string {
  return typeof window === "string" ? window : `${window.days}d`;
}

function estimateForDays(estimate: WorkloadEstimate, days: number): WorkEstimate {
  const base = estimate.byWindow[days <= 30 ? "30d" : "90d"];
  const scale = days <= 30 ? days / 30 : days / 90;
  return {
    requests: Math.max(1, Math.ceil(base.requests * scale)),
    durationMs: Math.max(1, Math.ceil(base.durationMs * scale)),
    pages: Math.max(1, Math.ceil(base.pages * scale))
  };
}

function fits(work: WorkEstimate, budget: ExecutionBudget, now: number): boolean {
  if (work.requests > budget.maxApiRequests || work.durationMs > budget.maxDurationMs || work.pages > budget.maxPages) return false;
  return budget.rateLimitResetAt === undefined || Date.parse(budget.rateLimitResetAt) <= now + budget.maxDurationMs;
}

function partialWindow(days: number, work: WorkEstimate, budget: ExecutionBudget): { window: { days: number }; estimate: WorkEstimate } {
  const ratio = Math.min(
    budget.maxApiRequests / work.requests,
    budget.maxDurationMs / work.durationMs,
    budget.maxPages / work.pages
  );
  if (ratio <= 0) throw new BudgetError("The budget cannot perform any analysis work");
  const partialDays = Math.max(1, Math.min(days - 1, Math.floor(days * ratio)));
  return { window: { days: partialDays }, estimate: estimateForDays({ byWindow: { "30d": work, "90d": work } }, partialDays) };
}

export function planAnalysis(
  requestedWindow: WindowSpec,
  budgetInput: ExecutionBudgetInput,
  estimate: WorkloadEstimate,
  options: PlannerOptions = {}
): AnalysisPlan {
  const budget = createExecutionBudget(budgetInput);
  const now = options.now?.() ?? Date.now();
  const requestedDays = daysForWindow(requestedWindow);
  const candidates: SelectedWindow[] = requestedWindow === "auto" ? ["90d", "30d"] : [requestedWindow === "30d" ? "30d" : requestedWindow === "90d" ? "90d" : { days: requestedDays }];

  for (const candidate of candidates) {
    const candidateEstimate = estimateForDays(estimate, daysForWindow(candidate));
    if (fits(candidateEstimate, budget, now)) {
      return {
        planVersion: 1,
        requestedWindow,
        selectedWindow: candidate,
        mode: "full",
        reason: requestedWindow === "auto" ? `Selected ${labelForWindow(candidate)} because it fits the execution budget` : "Requested window fits the execution budget",
        estimate: candidateEstimate,
        budget,
        resumable: budget.resumablePersistence,
        dryRun: options.dryRun ?? false
      };
    }
  }

  const partial = partialWindow(requestedDays, estimateForDays(estimate, requestedDays), budget);
  return {
    planVersion: 1,
    requestedWindow,
    selectedWindow: partial.window,
    mode: "partial",
    reason: requestedWindow === "auto"
      ? "Neither 90d nor 30d fits the execution budget; selected the largest partial window"
      : `Requested ${requestedDays}d does not fit; returning a partial report instead of silently changing the request`,
    estimate: partial.estimate,
    budget,
    resumable: budget.resumablePersistence,
    dryRun: options.dryRun ?? false
  };
}

export class BudgetTracker {
  private readonly startedAt: number;
  private requestsUsed = 0;
  private pagesUsed = 0;

  constructor(private readonly budget: ExecutionBudget, clock: () => number = Date.now) {
    this.startedAt = clock();
    this.clock = clock;
  }

  private readonly clock: () => number;

  recordRequest(count = 1): void {
    this.requestsUsed += count;
    this.assertWithinBudget();
  }

  recordPage(count = 1): void {
    this.pagesUsed += count;
    this.assertWithinBudget();
  }

  assertCanContinue(signal?: AbortSignal): void {
    if (signal?.aborted) throw new CancellationError();
    this.assertWithinBudget();
  }

  snapshot(): BudgetSnapshot {
    const elapsedMs = this.clock() - this.startedAt;
    return {
      elapsedMs,
      requestsUsed: this.requestsUsed,
      pagesUsed: this.pagesUsed,
      remainingMs: Math.max(0, this.budget.maxDurationMs - elapsedMs),
      remainingRequests: Math.max(0, this.budget.maxApiRequests - this.requestsUsed),
      remainingPages: Math.max(0, this.budget.maxPages - this.pagesUsed)
    };
  }

  waitForRateLimit(resetAt: string): { waitMs: number | null; reason: string } {
    const resetMs = Date.parse(resetAt);
    const remainingMs = this.snapshot().remainingMs;
    const waitMs = resetMs - this.clock();
    if (waitMs <= 0) return { waitMs: 0, reason: "GitHub rate limit has reset" };
    if (waitMs > remainingMs) return { waitMs: null, reason: "Rate-limit reset exceeds the remaining execution budget" };
    return { waitMs, reason: `GitHub rate limit reset is expected in ${waitMs}ms` };
  }

  private assertWithinBudget(): void {
    const snapshot = this.snapshot();
    if (snapshot.requestsUsed > this.budget.maxApiRequests) throw new BudgetError("Maximum API request budget exceeded");
    if (snapshot.pagesUsed > this.budget.maxPages) throw new BudgetError("Maximum page budget exceeded");
    if (snapshot.elapsedMs > this.budget.maxDurationMs) throw new BudgetError("Maximum analysis duration exceeded");
  }
}

export function emitProgress(listener: ProgressListener | undefined, event: ProgressEvent): void {
  listener?.(event);
}
