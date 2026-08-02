import { describe, expect, it } from "vitest";
import { calculateActivityMetrics } from "../../src/core/metrics/activity.js";
import { botHeavyRepositoryFixture, emptyRepositoryFixture, smallRepositoryFixture } from "../../src/github/fixtures.js";

const window = "90d";

describe("activity and observed-maintainer metrics", () => {
  it("reconciles the small fixture definitions", () => {
    const result = calculateActivityMetrics({
      pullRequests: smallRepositoryFixture.pullRequests,
      reviews: smallRepositoryFixture.reviews,
      window
    });

    expect(result.metrics.prs_opened!.value).toBe(2);
    expect(result.metrics.prs_merged!.value).toBe(1);
    expect(result.metrics.prs_closed_unmerged!.value).toBe(0);
    expect(result.metrics.prs_open_at_end!.value).toBe(1);
    expect(result.metrics.active_pr_authors!.value).toBe(2);
    expect(result.metrics.repeat_contributors!.value).toBe(0);
    expect(result.metrics.external_contributors!.value).toBe(1);
    expect(result.metrics.bot_pr_share!.value).toBe(0);
    expect(result.metrics.observed_reviewers!.value).toBe(1);
    expect(result.metrics.observed_mergers!.value).toBe(1);
    expect(result.metrics.observed_maintainer_authors!.value).toBe(1);
    expect(result.metrics.maintainer_concentration!.value).toEqual({ top_one: 1, top_three: 1 });
    expect(result.metrics.public_org_members!.confidence).toBe("unavailable");
    expect(result.limitations).toContain("Small activity sample: 2 pull requests in 90d.");
  });

  it("filters bots from human contributor and maintainer signals", () => {
    const result = calculateActivityMetrics({
      pullRequests: botHeavyRepositoryFixture.pullRequests,
      reviews: [],
      window
    });

    expect(result.metrics.prs_opened!.value).toBe(2);
    expect(result.metrics.active_pr_authors!.value).toBe(0);
    expect(result.metrics.external_contributors!.value).toBe(0);
    expect(result.metrics.bot_pr_share!.value).toBe(1);
    expect(result.metrics.observed_reviewers!.value).toBe(0);
    expect(result.metrics.maintainer_concentration!.value).toEqual({ top_one: null, top_three: null });
  });

  it("handles repeat identity and association changes independent of input order", () => {
    const first = smallRepositoryFixture.pullRequests[0]!;
    const second = smallRepositoryFixture.pullRequests[1]!;
    const changed = [
      { ...first, author: "contributor", association: "NONE" as const, mergedAt: null, state: "closed" as const },
      { ...second, author: "contributor", association: "MEMBER" as const }
    ];
    const forward = calculateActivityMetrics({ pullRequests: changed, reviews: [], window });
    const reverse = calculateActivityMetrics({ pullRequests: [...changed].reverse(), reviews: [], window });

    expect(forward.metrics.repeat_contributors!.value).toBe(1);
    expect(forward.metrics.external_contributors!.value).toBe(0);
    expect(forward.metrics).toEqual(reverse.metrics);
  });

  it("reports unavailable review-derived values for empty activity", () => {
    const result = calculateActivityMetrics({
      pullRequests: emptyRepositoryFixture.pullRequests,
      reviews: emptyRepositoryFixture.reviews,
      window,
      publicOrgMembers: []
    });

    expect(result.metrics.bot_pr_share!.value).toBeNull();
    expect(result.metrics.bot_pr_share!.confidence).toBe("unavailable");
    expect(result.metrics.public_org_members!.value).toBe(0);
    expect(result.metrics.maintainer_concentration!.value).toEqual({ top_one: null, top_three: null });
    expect(result.limitations).toContain("No submitted reviews were available; review-derived maintainer signals are unavailable.");
  });
});
