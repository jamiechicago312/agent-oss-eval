import type { RepositoryRef } from "../core/config.js";
import type {
  CommentFixture,
  EventFixture,
  FixtureFailure,
  FixtureOperation,
  FixtureScenario,
  GitHubProvider,
  Page,
  PermissionFixture,
  PullRequestFixture,
  RateLimitFixture,
  RepositoryFixture,
  ReviewFixture
} from "./types.js";

export interface FixtureProviderOptions {
  pageSize?: number;
  failures?: FixtureFailure[];
}

export class FixtureProvider implements GitHubProvider {
  readonly requests: FixtureOperation[] = [];
  private readonly pageSize: number;
  private readonly remainingFailures: Array<FixtureFailure & { remaining: number }>;

  constructor(private readonly scenario: FixtureScenario, options: FixtureProviderOptions = {}) {
    this.pageSize = options.pageSize ?? 2;
    if (!Number.isInteger(this.pageSize) || this.pageSize < 1) {
      throw new Error("Fixture page size must be a positive integer");
    }
    this.remainingFailures = (options.failures ?? []).map((failure) => ({
      ...failure,
      remaining: failure.attempts ?? 1
    }));
  }

  async getRepository(ref: RepositoryRef): Promise<RepositoryFixture> {
    this.before("getRepository", ref);
    return this.scenario.repository;
  }

  async listPullRequests(ref: RepositoryRef, page: number): Promise<Page<PullRequestFixture>> {
    return this.page("listPullRequests", ref, page, this.scenario.pullRequests);
  }

  async listReviews(ref: RepositoryRef, page: number): Promise<Page<ReviewFixture>> {
    return this.page("listReviews", ref, page, this.scenario.reviews);
  }

  async listComments(ref: RepositoryRef, page: number): Promise<Page<CommentFixture>> {
    return this.page("listComments", ref, page, this.scenario.comments);
  }

  async listEvents(ref: RepositoryRef, page: number): Promise<Page<EventFixture>> {
    return this.page("listEvents", ref, page, this.scenario.events);
  }

  async getPermissions(ref: RepositoryRef): Promise<PermissionFixture[]> {
    this.before("getPermissions", ref);
    return this.scenario.permissions;
  }

  async getRateLimit(): Promise<RateLimitFixture> {
    this.requests.push("getRateLimit");
    this.failIfConfigured("getRateLimit");
    return this.scenario.rateLimit;
  }

  private async page<T>(operation: FixtureOperation, ref: RepositoryRef, page: number, values: T[]): Promise<Page<T>> {
    this.before(operation, ref);
    if (!Number.isInteger(page) || page < 1) throw new Error("Fixture page must be a positive integer");
    const start = (page - 1) * this.pageSize;
    const items = values.slice(start, start + this.pageSize);
    return { items, page, hasNext: start + this.pageSize < values.length };
  }

  private before(operation: FixtureOperation, ref: RepositoryRef): void {
    if (ref.fullName !== this.scenario.repository.ref.fullName) {
      throw new Error(`Fixture does not contain ${ref.fullName}`);
    }
    this.requests.push(operation);
    this.failIfConfigured(operation);
  }

  private failIfConfigured(operation: FixtureOperation): void {
    const failure = this.remainingFailures.find(
      (candidate) => candidate.operation === operation && candidate.remaining > 0
    );
    if (failure === undefined) return;
    failure.remaining -= 1;
    throw failure.error;
  }
}

export async function collectPages<T>(fetchPage: (page: number) => Promise<Page<T>>): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  while (true) {
    const response = await fetchPage(page);
    results.push(...response.items);
    if (!response.hasNext) return results;
    page += 1;
  }
}
