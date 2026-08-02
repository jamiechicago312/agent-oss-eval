import type { Metric } from "../types.js";
import type { PullRequestFixture, ReviewFixture } from "../../github/types.js";

const MAINTAINER_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

export interface ActivityMetricInput {
  pullRequests: PullRequestFixture[];
  reviews: ReviewFixture[];
  window: string;
  source?: string;
  publicOrgMembers?: string[];
}

export interface ActivityMetricResult {
  metrics: Record<string, Metric>;
  limitations: string[];
}

function metric(
  value: Metric["value"],
  unit: string,
  definition: string,
  sampleSize: number,
  window: string,
  source: string,
  confidence: Metric["confidence"] = "measured"
): Metric {
  return {
    value,
    unit,
    definition,
    sample_size: sampleSize,
    source,
    window,
    confidence
  };
}

function humanPullRequests(pullRequests: PullRequestFixture[]): PullRequestFixture[] {
  return pullRequests.filter((pullRequest) => !pullRequest.authorIsBot);
}

function unique(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

function concentration(reviews: ReviewFixture[]): { top_one: number | null; top_three: number | null } {
  const humanReviews = reviews.filter((review) => !review.reviewerIsBot);
  const reviewedPullRequests = new Set(humanReviews.map((review) => review.pullRequestNumber));
  if (reviewedPullRequests.size === 0) return { top_one: null, top_three: null };
  const counts = new Map<string, Set<number>>();
  for (const review of humanReviews) {
    const pullRequests = counts.get(review.reviewer) ?? new Set<number>();
    pullRequests.add(review.pullRequestNumber);
    counts.set(review.reviewer, pullRequests);
  }
  const ranked = [...counts.values()].map((pullRequestNumbers) => pullRequestNumbers.size).sort((a, b) => b - a);
  const total = reviewedPullRequests.size;
  return {
    top_one: Math.min(1, (ranked[0] ?? 0) / total),
    top_three: Math.min(1, ranked.slice(0, 3).reduce((sum, count) => sum + count, 0) / total)
  };
}

export function calculateActivityMetrics(input: ActivityMetricInput): ActivityMetricResult {
  const source = input.source ?? "github.pull_requests";
  const { pullRequests, reviews, window } = input;
  const human = humanPullRequests(pullRequests);
  const limitations: string[] = [];
  if (pullRequests.length > 0 && pullRequests.length < 5) {
    limitations.push(`Small activity sample: ${pullRequests.length} pull requests in ${window}.`);
  }

  const authorCounts = new Map<string, number>();
  const authorAssociations = new Map<string, Set<string>>();
  for (const pullRequest of human) {
    authorCounts.set(pullRequest.author, (authorCounts.get(pullRequest.author) ?? 0) + 1);
    const associations = authorAssociations.get(pullRequest.author) ?? new Set<string>();
    associations.add(pullRequest.association);
    authorAssociations.set(pullRequest.author, associations);
  }
  const activeAuthors = [...authorCounts.keys()];
  const externalAuthors = activeAuthors.filter((author) => {
    const associations = authorAssociations.get(author) ?? new Set<string>();
    return ![...associations].some((association) => MAINTAINER_ASSOCIATIONS.has(association));
  });
  const humanReviews = reviews.filter((review) => !review.reviewerIsBot);
  const observedReviewers = unique(humanReviews.map((review) => review.reviewer));
  const observedMergers = unique(
    human.filter((pullRequest) => pullRequest.mergedBy !== null).map((pullRequest) => pullRequest.mergedBy as string)
  );
  const observedMaintainerAuthors = unique(
    human
      .filter((pullRequest) => MAINTAINER_ASSOCIATIONS.has(pullRequest.association))
      .map((pullRequest) => pullRequest.author)
  );
  const activeObservedMaintainers = unique([
    ...observedReviewers,
    ...observedMergers,
    ...observedMaintainerAuthors
  ]);
  const concentrationValue = concentration(reviews);
  const reviewedSample = new Set(humanReviews.map((review) => review.pullRequestNumber)).size;
  const common = { window, source };

  const metrics: Record<string, Metric> = {
    prs_opened: metric(pullRequests.length, "count", "PRs created within the selected window", pullRequests.length, common.window, common.source),
    prs_merged: metric(pullRequests.filter((pullRequest) => pullRequest.mergedAt !== null).length, "count", "PRs from the creation cohort that were merged", pullRequests.length, common.window, common.source),
    prs_closed_unmerged: metric(pullRequests.filter((pullRequest) => pullRequest.state === "closed" && pullRequest.mergedAt === null).length, "count", "PRs closed without a merge within the creation cohort", pullRequests.length, common.window, common.source),
    prs_open_at_end: metric(pullRequests.filter((pullRequest) => pullRequest.state === "open").length, "count", "PRs open at the snapshot end", pullRequests.length, common.window, common.source),
    active_pr_authors: metric(activeAuthors.length, "contributors", "Unique human PR authors with a PR created in the window", human.length, common.window, common.source),
    repeat_contributors: metric([...authorCounts.values()].filter((count) => count >= 2).length, "contributors", "Active human contributors who created at least two PRs in the window", human.length, common.window, common.source),
    external_contributors: metric(externalAuthors.length, "contributors", "Active human PR authors without maintainer-associated evidence in the window", human.length, common.window, common.source),
    bot_pr_share: pullRequests.length === 0
      ? metric(null, "share", "Bot-authored PRs divided by all PRs in the window", 0, common.window, common.source, "unavailable")
      : metric(pullRequests.filter((pullRequest) => pullRequest.authorIsBot).length / pullRequests.length, "share", "Bot-authored PRs divided by all PRs in the window", pullRequests.length, common.window, common.source),
    observed_reviewers: metric(observedReviewers.length, "users", "Unique human users who submitted a review in the window", humanReviews.length, common.window, "github.pull_request_reviews"),
    observed_mergers: metric(observedMergers.length, "users", "Unique human users attributable to merges in the window where available", human.length, common.window, common.source),
    observed_maintainer_authors: metric(observedMaintainerAuthors.length, "users", "PR authors with OWNER, MEMBER, or COLLABORATOR association", human.length, common.window, common.source),
    active_observed_maintainers: metric(activeObservedMaintainers.length, "users", "Union of observed reviewers, mergers, and maintainer-associated authors", humanReviews.length + human.length, common.window, common.source),
    maintainer_concentration: metric(concentrationValue, "share", "Share of reviewed PRs handled by the top one and top three observed reviewers", reviewedSample, common.window, "github.pull_request_reviews")
  };

  if (input.publicOrgMembers === undefined) {
    metrics.public_org_members = metric(null, "users", "Public organization members only; never total organization membership", 0, common.window, "github.organization_members", "unavailable");
    limitations.push("Public organization membership was not available from the acquisition result.");
  } else {
    metrics.public_org_members = metric(input.publicOrgMembers.length, "users", "Public organization members only; never total organization membership", input.publicOrgMembers.length, common.window, "github.organization_members");
  }

  if (reviews.length === 0) limitations.push("No submitted reviews were available; review-derived maintainer signals are unavailable.");
  return { metrics, limitations };
}
