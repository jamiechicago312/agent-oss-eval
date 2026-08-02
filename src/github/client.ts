import { resolveCredentials, type CredentialOptions } from "../auth/credentials.js";
import { AuthenticationError, MalformedResponseError, NotFoundError, PermissionError, RateLimitError, ServerError } from "../core/errors.js";
import type { RepositoryRef } from "../core/config.js";
import type {
  CommentFixture,
  EventFixture,
  GitHubProvider,
  OnboardingFixture,
  Page,
  PermissionFixture,
  PullRequestFixture,
  RateLimitFixture,
  RepositoryFixture,
  ReviewFixture
} from "./types.js";

const API_VERSION = "2022-11-28";
const DEFAULT_BASE_URL = "https://api.github.com";
const DEFAULT_MAX_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 30_000;

export interface GitHubClientOptions extends CredentialOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  maxRetries?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  signal?: AbortSignal;
}

export interface GitHubResponse<T> {
  data: T;
  headers: Headers;
}

interface RawRepository {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  archived: boolean;
  license: { spdx_id: string | null } | null;
  default_branch: string;
  created_at: string;
}

interface RawPullRequest {
  id: number;
  number: number;
  title: string;
  user: { login: string; type?: string } | null;
  author_association: PullRequestFixture["association"];
  created_at: string;
  updated_at: string;
  state: PullRequestFixture["state"];
  merged_at?: string | null;
  merged_by?: { login: string } | null;
}

interface RawReview {
  id: number;
  user: { login: string; type?: string } | null;
  state: ReviewFixture["state"];
  submitted_at: string | null;
  author_association: ReviewFixture["association"];
}

interface RawComment {
  id: number;
  user: { login: string; type?: string } | null;
  created_at: string;
  body: string;
}

interface RawEvent {
  id: string;
  actor: { login: string } | null;
  event: string;
  created_at: string;
}

interface RawCollaborator {
  login: string;
  permissions?: { admin?: boolean; maintain?: boolean; push?: boolean; triage?: boolean; pull?: boolean };
}

interface RawRateLimit {
  rate: { remaining: number; limit: number; reset: number };
}

interface RawContent {
  type: string;
  path: string;
}

interface RawLabel {
  name: string;
}

interface RawIssue {
  pull_request?: unknown;
}

function isBot(user: { login?: string; type?: string } | null): boolean {
  return user?.type === "Bot" || user?.login?.endsWith("[bot]") === true;
}

function pageFromHeaders<T>(items: T[], page: number, headers: Headers): Page<T> {
  const link = headers.get("link") ?? "";
  return { items, page, hasNext: /rel="next"/.test(link) };
}

function unixSecondsToIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

export class GitHubClient implements GitHubProvider {
  private readonly baseUrl: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly maxRetries: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly token: string | null;
  private readonly signal: AbortSignal | undefined;

  constructor(options: GitHubClientOptions = {}) {
    const auth = resolveCredentials(options);
    this.token = auth.token;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.signal = options.signal;
  }

  hasCredentials(): boolean {
    return this.token !== null;
  }

  async getRepository(ref: RepositoryRef): Promise<RepositoryFixture> {
    const response = await this.request<RawRepository>(`/repos/${ref.fullName}`);
    return {
      id: response.data.id,
      ref,
      description: response.data.description,
      stars: response.data.stargazers_count,
      forks: response.data.forks_count,
      openIssues: response.data.open_issues_count,
      archived: response.data.archived,
      license: response.data.license?.spdx_id ?? null,
      defaultBranch: response.data.default_branch,
      createdAt: response.data.created_at
    };
  }

  async listPullRequests(ref: RepositoryRef, page: number): Promise<Page<PullRequestFixture>> {
    const response = await this.request<RawPullRequest[]>(`/repos/${ref.fullName}/pulls?state=all&sort=created&direction=desc&page=${page}&per_page=100`);
    return pageFromHeaders(response.data.map((pullRequest) => this.mapPullRequest(pullRequest)), page, response.headers);
  }

  async listReviews(ref: RepositoryRef, page: number, pullRequestNumber?: number): Promise<Page<ReviewFixture>> {
    if (pullRequestNumber === undefined) throw new Error("A pull request number is required to list reviews");
    const response = await this.request<RawReview[]>(`/repos/${ref.fullName}/pulls/${pullRequestNumber}/reviews?page=${page}&per_page=100`);
    const items = response.data
      .filter((review) => review.submitted_at !== null)
      .map((review) => ({
        id: review.id,
        pullRequestNumber,
        reviewer: review.user?.login ?? "unknown",
        reviewerIsBot: isBot(review.user),
        state: review.state,
        submittedAt: review.submitted_at ?? "",
        association: review.author_association
      }));
    return pageFromHeaders(items, page, response.headers);
  }

  async listComments(ref: RepositoryRef, page: number, pullRequestNumber?: number): Promise<Page<CommentFixture>> {
    if (pullRequestNumber === undefined) throw new Error("A pull request number is required to list comments");
    const response = await this.request<RawComment[]>(`/repos/${ref.fullName}/issues/${pullRequestNumber}/comments?page=${page}&per_page=100`);
    const items = response.data.map((comment) => ({
      id: comment.id,
      pullRequestNumber,
      author: comment.user?.login ?? "unknown",
      authorIsBot: isBot(comment.user),
      createdAt: comment.created_at,
      body: comment.body
    }));
    return pageFromHeaders(items, page, response.headers);
  }

  async listEvents(ref: RepositoryRef, page: number, pullRequestNumber?: number): Promise<Page<EventFixture>> {
    if (pullRequestNumber === undefined) throw new Error("A pull request number is required to list events");
    const response = await this.request<RawEvent[]>(`/repos/${ref.fullName}/issues/${pullRequestNumber}/events?page=${page}&per_page=100`);
    const items = response.data.map((event) => ({
      id: event.id,
      pullRequestNumber,
      actor: event.actor?.login ?? "unknown",
      type: this.mapEventType(event.event),
      occurredAt: event.created_at
    }));
    return pageFromHeaders(items, page, response.headers);
  }

  async getPermissions(ref: RepositoryRef): Promise<PermissionFixture[]> {
    const response = await this.request<RawCollaborator[]>(`/repos/${ref.fullName}/collaborators?per_page=100`);
    return response.data.map((collaborator) => ({
      login: collaborator.login,
      permission: this.mapPermission(collaborator.permissions),
      verified: true
    }));
  }

  async getRateLimit(): Promise<RateLimitFixture> {
    const response = await this.request<RawRateLimit>("/rate_limit");
    return {
      remaining: response.data.rate.remaining,
      limit: response.data.rate.limit,
      resetAt: unixSecondsToIso(response.data.rate.reset)
    };
  }

  async getOnboarding(ref: RepositoryRef): Promise<OnboardingFixture> {
    const contributingGuidePath = await this.firstExistingContent(ref, ["CONTRIBUTING.md", ".github/CONTRIBUTING.md"]);
    const codeOfConductPath = await this.firstExistingContent(ref, ["CODE_OF_CONDUCT.md", ".github/CODE_OF_CONDUCT.md"]);
    const pullRequestTemplatePath = await this.firstExistingContent(ref, [".github/pull_request_template.md", "PULL_REQUEST_TEMPLATE.md"]);
    const issueTemplatePaths = await this.listExistingContent(ref, [
      ".github/ISSUE_TEMPLATE/bug.yml",
      ".github/ISSUE_TEMPLATE/bug_report.md",
      ".github/ISSUE_TEMPLATE/feature_request.md"
    ]);
    const labels = await this.request<RawLabel[]>(`/repos/${ref.fullName}/labels?per_page=100`);
    const goodFirstIssueLabel = labels.data.find((label) => /good[- ]first[- ]issue/i.test(label.name))?.name ?? null;
    if (goodFirstIssueLabel === null) {
      return {
        contributingGuidePath,
        codeOfConductPath,
        issueTemplatePaths,
        pullRequestTemplatePath,
        goodFirstIssueLabel: null,
        goodFirstIssuesOpen: 0,
        goodFirstIssuesClosed: 0
      };
    }
    const labelQuery = encodeURIComponent(goodFirstIssueLabel);
    const [open, closed] = await Promise.all([
      this.request<RawIssue[]>(`/repos/${ref.fullName}/issues?state=open&labels=${labelQuery}&per_page=100`),
      this.request<RawIssue[]>(`/repos/${ref.fullName}/issues?state=closed&labels=${labelQuery}&per_page=100`)
    ]);
    return {
      contributingGuidePath,
      codeOfConductPath,
      issueTemplatePaths,
      pullRequestTemplatePath,
      goodFirstIssueLabel,
      goodFirstIssuesOpen: open.data.filter((issue) => issue.pull_request === undefined).length,
      goodFirstIssuesClosed: closed.data.filter((issue) => issue.pull_request === undefined).length
    };
  }

  private async request<T>(path: string): Promise<GitHubResponse<T>> {
    let attempt = 0;
    while (true) {
      const headers = new Headers({
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION
      });
      if (this.token !== null) headers.set("Authorization", `Bearer ${this.token}`);
      let response: Response;
      try {
        response = await this.fetcher(`${this.baseUrl}${path}`, {
          headers,
          ...(this.signal === undefined ? {} : { signal: this.signal })
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;
        if (attempt < this.maxRetries) {
          await this.sleep(this.retryDelay(attempt));
          attempt += 1;
          continue;
        }
        throw new ServerError("GitHub request failed after retries");
      }

      if (response.ok) {
        try {
          return { data: (await response.json()) as T, headers: response.headers };
        } catch {
          throw new MalformedResponseError();
        }
      }

      if (response.status === 401) throw new AuthenticationError("GitHub rejected the supplied credentials");
      if (response.status === 404) throw new NotFoundError("GitHub resource was not found");
      if (response.status === 403 && !this.isRateLimited(response)) throw new PermissionError();
      if (response.status === 403 || response.status === 429) {
        if (attempt < this.maxRetries) {
          const delay = this.rateLimitDelay(response.headers);
          if (delay !== null) {
            await this.sleep(delay);
            attempt += 1;
            continue;
          }
        }
        throw new RateLimitError();
      }
      if (response.status >= 500 || response.status === 408) {
        if (attempt < this.maxRetries) {
          await this.sleep(this.retryDelay(attempt));
          attempt += 1;
          continue;
        }
        throw new ServerError("GitHub server request failed after retries");
      }
      throw new ServerError(`GitHub request failed with status ${response.status}`);
    }
  }

  private isRateLimited(response: Response): boolean {
    return response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after");
  }

  private rateLimitDelay(headers: Headers): number | null {
    const retryAfter = Number(headers.get("retry-after"));
    if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1000, MAX_RETRY_DELAY_MS);
    const reset = Number(headers.get("x-ratelimit-reset"));
    if (Number.isFinite(reset)) {
      const delay = reset * 1000 - Date.now();
      if (delay > MAX_RETRY_DELAY_MS) return null;
      return Math.max(0, delay);
    }
    return 0;
  }

  private retryDelay(attempt: number): number {
    return Math.min(250 * 2 ** attempt, MAX_RETRY_DELAY_MS);
  }

  private mapPullRequest(pullRequest: RawPullRequest): PullRequestFixture {
    return {
      id: pullRequest.id,
      number: pullRequest.number,
      title: pullRequest.title,
      author: pullRequest.user?.login ?? "unknown",
      authorIsBot: isBot(pullRequest.user),
      association: pullRequest.author_association,
      createdAt: pullRequest.created_at,
      updatedAt: pullRequest.updated_at,
      state: pullRequest.state,
      mergedAt: pullRequest.merged_at ?? null,
      mergedBy: pullRequest.merged_by?.login ?? null
    };
  }

  private mapEventType(event: string): EventFixture["type"] {
    if (event === "merged") return "merged";
    if (event === "closed") return "closed";
    if (event === "reviewed") return "reviewed";
    if (event === "commented") return "commented";
    return "opened";
  }

  private mapPermission(permissions: RawCollaborator["permissions"]): PermissionFixture["permission"] {
    if (permissions?.admin) return "admin";
    if (permissions?.maintain) return "maintain";
    if (permissions?.push) return "push";
    if (permissions?.triage) return "triage";
    return "pull";
  }

  private async firstExistingContent(ref: RepositoryRef, paths: string[]): Promise<string | null> {
    for (const path of paths) {
      if (await this.contentExists(ref, path)) return path;
    }
    return null;
  }

  private async listExistingContent(ref: RepositoryRef, paths: string[]): Promise<string[]> {
    const existing: string[] = [];
    for (const path of paths) {
      if (await this.contentExists(ref, path)) existing.push(path);
    }
    return existing;
  }

  private async contentExists(ref: RepositoryRef, path: string): Promise<boolean> {
    try {
      const response = await this.request<RawContent>(`/repos/${ref.fullName}/contents/${path}`);
      return response.data.type === "file";
    } catch (error) {
      if (error instanceof NotFoundError) return false;
      throw error;
    }
  }
}
