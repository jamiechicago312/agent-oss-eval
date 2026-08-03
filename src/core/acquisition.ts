import type { RepositoryRef } from "./config.js";
import type {
  CommentFixture,
  EventFixture,
  GitHubProvider,
  OnboardingFixture,
  PermissionFixture,
  PullRequestFixture,
  RateLimitFixture,
  RepositoryFixture,
  ReviewFixture
} from "../github/types.js";

export interface AcquisitionOptions {
  provider: GitHubProvider;
  repository: RepositoryRef;
  windowStart: string;
  windowEnd: string;
  maxPages?: number;
  signal?: AbortSignal;
}

export interface AcquisitionStage {
  status: "fetched" | "failed" | "skipped_budget";
  pages: number;
  items: number;
  error?: string;
}

class AcquisitionBudgetExceeded extends Error {
  constructor() { super("Acquisition page budget exceeded"); }
}

export interface AcquisitionProvenance {
  fetchedAt: string;
  cached: false;
  networkRequests: number;
  stages: Record<string, AcquisitionStage>;
  rateLimit: RateLimitFixture | null;
}

export interface AcquisitionResult {
  repository: RepositoryFixture | null;
  pullRequests: PullRequestFixture[];
  reviews: ReviewFixture[];
  comments: CommentFixture[];
  events: EventFixture[];
  permissions: PermissionFixture[];
  onboarding: OnboardingFixture | null;
  provenance: AcquisitionProvenance;
  limitations: string[];
  failedStages: string[];
  completeness: "complete" | "partial" | "failed";
}

function isWithinWindow(value: string, start: number, end: number): boolean {
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && timestamp >= start && timestamp <= end;
}

export async function acquireRepositoryData(options: AcquisitionOptions): Promise<AcquisitionResult> {
  const start = Date.parse(options.windowStart);
  const end = Date.parse(options.windowEnd);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) {
    throw new Error("Acquisition window must contain valid ordered ISO timestamps");
  }
  const maxPages = options.maxPages ?? 100;
  const limitations: string[] = [];
  const failedStages: string[] = [];
  const stages: Record<string, AcquisitionStage> = {};
  let networkRequests = 0;
  let budgetExhausted = false;
  let repository: RepositoryFixture | null = null;
  let rateLimit: RateLimitFixture | null = null;
  const pullRequests: PullRequestFixture[] = [];
  const reviews: ReviewFixture[] = [];
  const comments: CommentFixture[] = [];
  const events: EventFixture[] = [];
  let permissions: PermissionFixture[] = [];
  let onboarding: OnboardingFixture | null = null;

  const request = async <T>(action: () => Promise<T>): Promise<T> => {
    if (networkRequests >= maxPages) { budgetExhausted = true; throw new AcquisitionBudgetExceeded(); }
    networkRequests += 1;
    return action();
  };

  const stage = async <T>(name: string, action: () => Promise<{ pages: number; items: T[] }>): Promise<T[]> => {
    if (budgetExhausted) {
      stages[name] = { status: "skipped_budget", pages: 0, items: 0 };
      failedStages.push(name);
      return [];
    }
    try {
      const result = await action();
      stages[name] = { status: "fetched", pages: result.pages, items: result.items.length };
      return result.items;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown acquisition failure";
      const exhausted = error instanceof AcquisitionBudgetExceeded;
      if (exhausted) budgetExhausted = true;
      stages[name] = { status: exhausted ? "skipped_budget" : "failed", pages: 0, items: 0, ...(exhausted ? {} : { error: message }) };
      failedStages.push(name);
      if (!exhausted) limitations.push(`${name} failed: ${message}`);
      return [];
    }
  };

  try {
    repository = await request(() => options.provider.getRepository(options.repository));
    stages.repository = { status: "fetched", pages: 1, items: 1 };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown repository acquisition failure";
    stages.repository = { status: "failed", pages: 0, items: 0, error: message };
    failedStages.push("repository");
    limitations.push(`repository failed: ${message}`);
    return finish(null, [], [], [], [], [], null, rateLimit, networkRequests, stages, limitations, failedStages);
  }

  try {
    rateLimit = await request(() => options.provider.getRateLimit());
    stages.rateLimit = { status: "fetched", pages: 1, items: 1 };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown rate-limit acquisition failure";
    stages.rateLimit = { status: "failed", pages: 0, items: 0, error: message };
    failedStages.push("rateLimit");
    limitations.push(`rateLimit failed: ${message}`);
  }

  const collectedPullRequests = await stage("pullRequests", async () => {
    const items: PullRequestFixture[] = [];
    let page = 1;
    while (true) {
      assertNotCancelled(options.signal);
      const response = await request(() => options.provider.listPullRequests(options.repository, page));
      items.push(...response.items.filter((pullRequest) => isWithinWindow(pullRequest.createdAt, start, end)));
      if (!response.hasNext) return { pages: page, items };
      page += 1;
    }
  });
  pullRequests.push(...collectedPullRequests);

  for (const pullRequest of pullRequests) {
    const reviewItems = await stage(`reviews:${pullRequest.number}`, async () => collectPullRequestPages(
      (page) => options.provider.listReviews(options.repository, page, pullRequest.number),
      request,
      options.signal
    ));
    reviews.push(...reviewItems);

    const commentItems = await stage(`comments:${pullRequest.number}`, async () => collectPullRequestPages(
      (page) => options.provider.listComments(options.repository, page, pullRequest.number),
      request,
      options.signal
    ));
    comments.push(...commentItems);

    const eventItems = await stage(`events:${pullRequest.number}`, async () => collectPullRequestPages(
      (page) => options.provider.listEvents(options.repository, page, pullRequest.number),
      request,
      options.signal
    ));
    events.push(...eventItems);
  }

  const permissionItems = await stage("permissions", async () => ({
    pages: 1,
    items: await request(() => options.provider.getPermissions(options.repository))
  }));
  permissions = permissionItems;

  const onboardingItems = await stage("onboarding", async () => ({
    pages: 1,
    items: [await request(() => options.provider.getOnboarding(options.repository))]
  }));
  onboarding = onboardingItems[0] ?? null;

  const budgetSkipped = Object.entries(stages).filter(([, value]) => value.status === "skipped_budget");
  if (budgetSkipped.length > 0) {
    const affectedPullRequests = new Set(budgetSkipped.flatMap(([name]) => {
      const match = /^(?:reviews|comments|events):(\d+)$/.exec(name);
      return match?.[1] === undefined ? [] : [match[1]];
    }));
    limitations.push(`Enrichment stopped after ${networkRequests} requests at the configured ${maxPages}-request limit; ` +
      `review/comment/event data is partial for ${affectedPullRequests.size} of ${pullRequests.length} PRs. ` +
      "Increase --max-pages or continue the saved job.");
  }
  const detailFailures = failedStages.filter((name) => /^(reviews|comments|events):/.test(name) && stages[name]?.status === "failed");
  if (detailFailures.length > 0 && stages.pullRequests?.status === "fetched") {
    const days = Math.round((end - start) / 86_400_000);
    const enrichmentStatus = "did not complete";
    limitations.push(
      `${days}d pull-request window fully collected (${pullRequests.length} PRs); review/comment/event enrichment is partial because it ${enrichmentStatus}.`
    );
  }
  return finish(repository, pullRequests, reviews, comments, events, permissions, onboarding, rateLimit, networkRequests, stages, limitations, failedStages);
}

interface PageCollection<T> {
  items: T[];
  pages: number;
}

async function collectPullRequestPages<T>(
  fetchPage: (page: number) => Promise<{ items: T[]; hasNext: boolean }>,
  request: <R>(action: () => Promise<R>) => Promise<R>,
  signal?: AbortSignal
): Promise<PageCollection<T>> {
  const items: T[] = [];
  let page = 1;
  while (true) {
    assertNotCancelled(signal);
    const response = await request(() => fetchPage(page));
    items.push(...response.items);
    if (!response.hasNext) return { items, pages: page };
    page += 1;
  }
}

function assertNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("Acquisition cancelled");
}

function finish(
  repository: RepositoryFixture | null,
  pullRequests: PullRequestFixture[],
  reviews: ReviewFixture[],
  comments: CommentFixture[],
  events: EventFixture[],
  permissions: PermissionFixture[],
  onboarding: OnboardingFixture | null,
  rateLimit: RateLimitFixture | null,
  networkRequests: number,
  stages: Record<string, AcquisitionStage>,
  limitations: string[],
  failedStages: string[]
): AcquisitionResult {
  return {
    repository,
    pullRequests,
    reviews,
    comments,
    events,
    permissions,
    onboarding,
    provenance: {
      fetchedAt: "2026-08-02T00:00:00Z",
      cached: false,
      networkRequests,
      stages,
      rateLimit
    },
    limitations,
    failedStages,
    completeness: repository === null ? "failed" : failedStages.length > 0 ? "partial" : "complete"
  };
}
