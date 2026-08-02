import type { OnboardingFixture, PullRequestFixture, ReviewFixture } from "../../github/types.js";
import type { Metric } from "../types.js";

export interface ExperienceMetricInput {
  pullRequests: PullRequestFixture[];
  reviews: ReviewFixture[];
  onboarding: OnboardingFixture | null;
  window: string;
  source?: string;
}

export interface ExperienceMetricResult {
  metrics: Record<string, Metric>;
  limitations: string[];
}

interface Percentiles {
  median: number | null;
  p75: number | null;
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
  return { value, unit, definition, sample_size: sampleSize, source, window, confidence };
}

function percentiles(values: number[]): Percentiles {
  if (values.length === 0) return { median: null, p75: null };
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (fraction: number): number => {
    const index = (sorted.length - 1) * fraction;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const lowerValue = sorted[lower] ?? 0;
    const upperValue = sorted[upper] ?? lowerValue;
    return lowerValue + (upperValue - lowerValue) * (index - lower);
  };
  return { median: percentile(0.5), p75: percentile(0.75) };
}

function durationHours(start: string, end: string): number | null {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return null;
  return (endMs - startMs) / 3_600_000;
}

function timingMetric(
  values: number[],
  definition: string,
  window: string,
  source: string
): Metric {
  const value = percentiles(values);
  return metric(
    { median: value.median, p75: value.p75 },
    "hours",
    definition,
    values.length,
    window,
    source,
    values.length === 0 ? "unavailable" : "measured"
  );
}

export function calculateExperienceMetrics(input: ExperienceMetricInput): ExperienceMetricResult {
  const source = input.source ?? "github.pull_requests";
  const humanPullRequests = input.pullRequests.filter((pullRequest) => !pullRequest.authorIsBot);
  const humanReviews = input.reviews.filter((review) => !review.reviewerIsBot && review.submittedAt !== "");
  const reviewsByPullRequest = new Map<number, ReviewFixture[]>();
  for (const review of humanReviews) {
    const reviews = reviewsByPullRequest.get(review.pullRequestNumber) ?? [];
    reviews.push(review);
    reviewsByPullRequest.set(review.pullRequestNumber, reviews);
  }
  const limitations: string[] = [];
  if (input.pullRequests.length > 0 && input.pullRequests.length < 5) {
    limitations.push(`Small contributor-experience sample: ${input.pullRequests.length} pull requests in ${input.window}.`);
  }

  const firstReviewHours: number[] = [];
  for (const pullRequest of humanPullRequests) {
    const reviews = [...(reviewsByPullRequest.get(pullRequest.number) ?? [])].sort(
      (a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt)
    );
    const first = reviews[0];
    if (first !== undefined) {
      const duration = durationHours(pullRequest.createdAt, first.submittedAt);
      if (duration === null) limitations.push(`Invalid review timestamp for PR #${pullRequest.number}.`);
      else firstReviewHours.push(duration);
    }
  }

  const mergeHours: number[] = [];
  for (const pullRequest of humanPullRequests) {
    if (pullRequest.mergedAt === null) continue;
    const duration = durationHours(pullRequest.createdAt, pullRequest.mergedAt);
    if (duration === null) limitations.push(`Invalid merge timestamp for PR #${pullRequest.number}.`);
    else mergeHours.push(duration);
  }

  const reviewedPrCount = new Set(humanReviews.map((review) => review.pullRequestNumber)).size;
  const closedPrs = humanPullRequests.filter((pullRequest) => pullRequest.state === "closed");
  const mergedPrs = humanPullRequests.filter((pullRequest) => pullRequest.mergedAt !== null);
  const openPrs = humanPullRequests.filter((pullRequest) => pullRequest.state === "open");
  if (openPrs.length > 0) {
    limitations.push(`${openPrs.length} open PR(s) are right-censored and excluded from time-to-merge samples.`);
  }
  const reviewCoverage = humanPullRequests.length === 0 ? null : reviewedPrCount / humanPullRequests.length;
  const mergeRate = closedPrs.length === 0 ? null : mergedPrs.length / closedPrs.length;
  const openShare = humanPullRequests.length === 0 ? null : openPrs.length / humanPullRequests.length;

  const metrics: Record<string, Metric> = {
    time_to_first_human_review: timingMetric(
      firstReviewHours,
      "PR creation to first non-bot submitted review; creation cohort",
      input.window,
      "github.pull_request_reviews"
    ),
    time_to_merge: timingMetric(
      mergeHours,
      "PR creation to merge for merged PRs in the creation cohort; open PRs are right-censored",
      input.window,
      source
    ),
    review_coverage: metric(
      reviewCoverage,
      "share",
      "Eligible human PRs receiving at least one non-bot submitted review; creation cohort",
      humanPullRequests.length,
      input.window,
      "github.pull_request_reviews",
      reviewCoverage === null ? "unavailable" : "measured"
    ),
    merge_rate: metric(
      mergeRate,
      "share",
      "Merged PRs divided by closed PRs in the creation cohort; open PRs reported separately",
      closedPrs.length,
      input.window,
      source,
      mergeRate === null ? "unavailable" : "measured"
    ),
    open_pr_share: metric(
      openShare,
      "share",
      "Open human PRs at snapshot end divided by the creation cohort",
      humanPullRequests.length,
      input.window,
      source,
      openShare === null ? "unavailable" : "measured"
    )
  };

  if (input.onboarding === null) {
    limitations.push("Onboarding signals were unavailable.");
    metrics.contributing_guide_exists = metric(null, "boolean", "Whether a contributing guide exists", 0, input.window, "github.contents", "unavailable");
    metrics.code_of_conduct_exists = metric(null, "boolean", "Whether a code of conduct exists", 0, input.window, "github.contents", "unavailable");
    metrics.issue_templates_count = metric(null, "count", "Number of detected issue templates", 0, input.window, "github.contents", "unavailable");
    metrics.pull_request_template_exists = metric(null, "boolean", "Whether a pull request template exists", 0, input.window, "github.contents", "unavailable");
    metrics.good_first_issue_label_exists = metric(null, "boolean", "Whether a recognized good-first-issue label exists", 0, input.window, "github.labels", "unavailable");
    metrics.open_good_first_issues = metric(null, "count", "Open issues with a recognized good-first-issue label", 0, input.window, "github.issues", "unavailable");
    metrics.good_first_issue_closure_activity = metric(null, "count", "Good-first-issue closure activity in the selected window", 0, input.window, "github.issues", "unavailable");
  } else {
    const onboarding = input.onboarding;
    metrics.contributing_guide_exists = metric(onboarding.contributingGuidePath !== null, "boolean", "Whether a contributing guide exists", 1, input.window, "github.contents");
    metrics.code_of_conduct_exists = metric(onboarding.codeOfConductPath !== null, "boolean", "Whether a code of conduct exists", 1, input.window, "github.contents");
    metrics.issue_templates_count = metric(onboarding.issueTemplatePaths.length, "count", "Number of detected issue templates", onboarding.issueTemplatePaths.length, input.window, "github.contents");
    metrics.pull_request_template_exists = metric(onboarding.pullRequestTemplatePath !== null, "boolean", "Whether a pull request template exists", 1, input.window, "github.contents");
    metrics.good_first_issue_label_exists = metric(onboarding.goodFirstIssueLabel !== null, "boolean", "Whether a recognized good-first-issue label exists", 1, input.window, "github.labels");
    metrics.open_good_first_issues = metric(onboarding.goodFirstIssuesOpen, "count", "Open issues with a recognized good-first-issue label", onboarding.goodFirstIssuesOpen, input.window, "github.issues");
    metrics.good_first_issue_closure_activity = metric(onboarding.goodFirstIssuesClosed, "count", "Good-first-issue closure activity in the selected window", onboarding.goodFirstIssuesClosed, input.window, "github.issues");
  }

  if (firstReviewHours.length === 0) limitations.push("No human submitted reviews were available for time-to-first-review.");
  if (mergeHours.length === 0) limitations.push("No merged human PRs were available for time-to-merge.");
  return { metrics, limitations };
}
