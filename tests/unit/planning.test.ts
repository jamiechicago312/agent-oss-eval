import { describe, expect, it } from "vitest";
import { BudgetError, CancellationError } from "../../src/core/errors.js";
import {
  BudgetTracker,
  createExecutionBudget,
  emitProgress,
  planAnalysis,
  type WorkloadEstimate
} from "../../src/core/planning.js";

const estimate: WorkloadEstimate = {
  byWindow: {
    "30d": { requests: 20, durationMs: 20_000, pages: 10 },
    "90d": { requests: 60, durationMs: 60_000, pages: 30 }
  }
};

describe("adaptive analysis planning", () => {
  it("selects 90d for auto when the budget fits", () => {
    const plan = planAnalysis("auto", { maxApiRequests: 100, maxDurationMs: 100_000, maxPages: 50 }, estimate);

    expect(plan.selectedWindow).toBe("90d");
    expect(plan.mode).toBe("full");
  });

  it("falls back to 30d for auto when 90d does not fit", () => {
    const plan = planAnalysis("auto", { maxApiRequests: 25, maxDurationMs: 30_000, maxPages: 15 }, estimate);

    expect(plan.selectedWindow).toBe("30d");
    expect(plan.mode).toBe("full");
  });

  it("returns a partial plan when neither auto window fits", () => {
    const plan = planAnalysis("auto", { maxApiRequests: 5, maxDurationMs: 5_000, maxPages: 3 }, estimate);

    expect(plan.mode).toBe("partial");
    expect(plan.selectedWindow).toEqual({ days: 7 });
    expect(plan.reason).toContain("largest partial window");
  });

  it("does not silently downgrade an explicit 90d request", () => {
    const plan = planAnalysis("90d", { maxApiRequests: 25, maxDurationMs: 30_000, maxPages: 15 }, estimate);

    expect(plan.mode).toBe("partial");
    expect(plan.requestedWindow).toBe("90d");
    expect(plan.selectedWindow).toEqual({ days: 37 });
    expect(plan.reason).toContain("instead of silently changing");
  });

  it("marks dry plans and resets beyond the budget as partial", () => {
    const plan = planAnalysis("30d", {
      maxApiRequests: 30,
      maxDurationMs: 30_000,
      maxPages: 20,
      rateLimitResetAt: "2030-01-01T00:00:00Z"
    }, estimate, { now: () => Date.parse("2026-08-02T00:00:00Z"), dryRun: true });

    expect(plan.mode).toBe("partial");
    expect(plan.dryRun).toBe(true);
  });

  it("validates budgets and exposes structured progress", () => {
    expect(() => createExecutionBudget({ maxPages: 0 })).toThrow(BudgetError);
    const events: string[] = [];
    emitProgress((event) => events.push(`${event.phase}:${event.completed}/${event.estimatedTotal}`), {
      type: "progress",
      phase: "metadata",
      message: "Fetching metadata",
      completed: 1,
      estimatedTotal: 2,
      requestsUsed: 1,
      rateLimitRemaining: 4999,
      window: "90d",
      resumable: false
    });
    expect(events).toEqual(["metadata:1/2"]);
  });
});

describe("analysis budget tracking", () => {
  it("tracks requests/pages and reports remaining budget", () => {
    let now = 1_000;
    const tracker = new BudgetTracker(createExecutionBudget({ maxDurationMs: 1_000, maxApiRequests: 3, maxPages: 2 }), () => now);
    tracker.recordRequest(2);
    tracker.recordPage();
    now += 100;

    expect(tracker.snapshot()).toMatchObject({
      elapsedMs: 100,
      requestsUsed: 2,
      pagesUsed: 1,
      remainingMs: 900,
      remainingRequests: 1,
      remainingPages: 1
    });
  });

  it("reports whether a rate-limit wait fits the remaining budget", () => {
    const tracker = new BudgetTracker(createExecutionBudget({ maxDurationMs: 1_000 }), () => 1_000);

    expect(tracker.waitForRateLimit(new Date(1_500).toISOString()).waitMs).toBe(500);
    expect(tracker.waitForRateLimit(new Date(3_000).toISOString()).waitMs).toBeNull();
  });

  it("throws on cancellation and exhausted request budgets", () => {
    const tracker = new BudgetTracker(createExecutionBudget({ maxApiRequests: 1 }));
    const controller = new AbortController();
    controller.abort();
    expect(() => tracker.assertCanContinue(controller.signal)).toThrow(CancellationError);
    tracker.recordRequest();
    expect(() => tracker.recordRequest()).toThrow(BudgetError);
  });
});
