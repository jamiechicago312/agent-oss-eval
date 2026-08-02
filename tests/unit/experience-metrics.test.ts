import { describe, expect, it } from "vitest";
import { calculateExperienceMetrics } from "../../src/core/metrics/experience.js";
import { botHeavyRepositoryFixture, emptyRepositoryFixture, smallRepositoryFixture } from "../../src/github/fixtures.js";
import type { ReviewFixture } from "../../src/github/types.js";

const window = "90d";

describe("contributor experience and onboarding metrics", () => {
  it("calculates creation-cohort timing, coverage, censoring, and onboarding signals", () => {
    const result = calculateExperienceMetrics({
      pullRequests: smallRepositoryFixture.pullRequests,
      reviews: smallRepositoryFixture.reviews,
      onboarding: smallRepositoryFixture.onboarding,
      window
    });

    expect(result.metrics.time_to_first_human_review!.value).toEqual({ median: 24, p75: 24 });
    expect(result.metrics.time_to_merge!.value).toEqual({ median: 48, p75: 48 });
    expect(result.metrics.review_coverage!.value).toBe(0.5);
    expect(result.metrics.merge_rate!.value).toBe(1);
    expect(result.metrics.open_pr_share!.value).toBe(0.5);
    expect(result.metrics.contributing_guide_exists!.value).toBe(true);
    expect(result.metrics.issue_templates_count!.value).toBe(1);
    expect(result.metrics.open_good_first_issues!.value).toBe(1);
    expect(result.metrics.good_first_issue_closure_activity!.value).toBe(2);
    expect(result.metrics.time_to_merge!.definition).toContain("creation cohort");
    expect(result.limitations).toContain("1 open PR(s) are right-censored and excluded from time-to-merge samples.");
  });

  it("ignores bot-only reviews and never treats open PRs as zero-time merges", () => {
    const botReview: ReviewFixture = {
      id: 999,
      pullRequestNumber: 1,
      reviewer: "bot[bot]",
      reviewerIsBot: true,
      state: "approved",
      submittedAt: "2026-07-01T01:00:00Z",
      association: "NONE"
    };
    const result = calculateExperienceMetrics({
      pullRequests: smallRepositoryFixture.pullRequests,
      reviews: [botReview],
      onboarding: smallRepositoryFixture.onboarding,
      window
    });

    expect(result.metrics.time_to_first_human_review!.value).toEqual({ median: null, p75: null });
    expect(result.metrics.review_coverage!.value).toBe(0);
    expect(result.metrics.time_to_merge!.sample_size).toBe(1);
    expect(result.metrics.time_to_merge!.value).not.toEqual({ median: 0, p75: 0 });
  });

  it("handles empty cohorts and unavailable onboarding explicitly", () => {
    const result = calculateExperienceMetrics({
      pullRequests: emptyRepositoryFixture.pullRequests,
      reviews: emptyRepositoryFixture.reviews,
      onboarding: null,
      window
    });

    expect(result.metrics.review_coverage!.value).toBeNull();
    expect(result.metrics.review_coverage!.confidence).toBe("unavailable");
    expect(result.metrics.merge_rate!.value).toBeNull();
    expect(result.metrics.contributing_guide_exists!.value).toBeNull();
    expect(result.metrics.good_first_issue_closure_activity!.confidence).toBe("unavailable");
    expect(result.limitations).toContain("Onboarding signals were unavailable.");
  });

  it("reports percentile values and low-sample limitations", () => {
    const reviews = [
      ...smallRepositoryFixture.reviews,
      {
        ...smallRepositoryFixture.reviews[0]!,
        id: 3002,
        pullRequestNumber: 2,
        reviewer: "second-reviewer",
        submittedAt: "2026-07-12T00:00:00Z"
      }
    ];
    const result = calculateExperienceMetrics({
      pullRequests: smallRepositoryFixture.pullRequests,
      reviews,
      onboarding: smallRepositoryFixture.onboarding,
      window
    });

    expect(result.metrics.time_to_first_human_review!.value).toEqual({ median: 36, p75: 42 });
    expect(result.metrics.time_to_first_human_review!.sample_size).toBe(2);
    expect(result.limitations[0]).toContain("Small contributor-experience sample");
  });

  it("does not count bot PRs in contributor experience denominators", () => {
    const result = calculateExperienceMetrics({
      pullRequests: botHeavyRepositoryFixture.pullRequests,
      reviews: [],
      onboarding: botHeavyRepositoryFixture.onboarding,
      window
    });

    expect(result.metrics.review_coverage!.value).toBeNull();
    expect(result.metrics.open_pr_share!.value).toBeNull();
  });
});
