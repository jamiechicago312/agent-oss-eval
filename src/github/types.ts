import type { RepositoryRef } from "../core/config.js";

export interface RepositoryFixture {
  id: number;
  ref: RepositoryRef;
  description: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  archived: boolean;
  license: string | null;
  defaultBranch: string;
  createdAt: string;
}

export interface PullRequestFixture {
  id: number;
  number: number;
  title: string;
  author: string;
  authorIsBot: boolean;
  association: "OWNER" | "MEMBER" | "COLLABORATOR" | "CONTRIBUTOR" | "NONE";
  createdAt: string;
  updatedAt: string;
  state: "open" | "closed";
  mergedAt: string | null;
  mergedBy: string | null;
}

export interface ReviewFixture {
  id: number;
  pullRequestNumber: number;
  reviewer: string;
  reviewerIsBot: boolean;
  state: "approved" | "changes_requested" | "commented" | "dismissed";
  submittedAt: string;
  association: "OWNER" | "MEMBER" | "COLLABORATOR" | "CONTRIBUTOR" | "NONE";
}

export interface CommentFixture {
  id: number;
  pullRequestNumber: number;
  author: string;
  authorIsBot: boolean;
  createdAt: string;
  body: string;
}

export interface EventFixture {
  id: string;
  pullRequestNumber: number;
  actor: string;
  type: "opened" | "closed" | "merged" | "reviewed" | "commented";
  occurredAt: string;
}

export interface PermissionFixture {
  login: string;
  permission: "admin" | "maintain" | "push" | "triage" | "pull";
  verified: boolean;
}

export interface RateLimitFixture {
  remaining: number;
  limit: number;
  resetAt: string;
}

export interface OnboardingFixture {
  contributingGuidePath: string | null;
  codeOfConductPath: string | null;
  issueTemplatePaths: string[];
  pullRequestTemplatePath: string | null;
  goodFirstIssueLabel: string | null;
  goodFirstIssuesOpen: number;
  goodFirstIssuesClosed: number;
}

export interface FixtureScenario {
  name: string;
  repository: RepositoryFixture;
  pullRequests: PullRequestFixture[];
  reviews: ReviewFixture[];
  comments: CommentFixture[];
  events: EventFixture[];
  permissions: PermissionFixture[];
  rateLimit: RateLimitFixture;
  onboarding: OnboardingFixture;
  completeness: "complete" | "partial" | "failed";
  limitations: string[];
}

export interface Page<T> {
  items: T[];
  page: number;
  hasNext: boolean;
}

export type FixtureOperation =
  | "getRepository"
  | "listPullRequests"
  | "listReviews"
  | "listComments"
  | "listEvents"
  | "getPermissions"
  | "getRateLimit"
  | "getOnboarding";


export interface FixtureFailure {
  operation: FixtureOperation;
  error: Error;
  attempts?: number;
}

export interface GitHubProvider {
  /** Declares the pagination ordering contract used for safe window cutoffs. */
  readonly pullRequestOrder?: "created_desc" | "unspecified";
  getRepository(ref: RepositoryRef): Promise<RepositoryFixture>;
  listPullRequests(ref: RepositoryRef, page: number): Promise<Page<PullRequestFixture>>;
  listReviews(ref: RepositoryRef, page: number, pullRequestNumber?: number): Promise<Page<ReviewFixture>>;
  listComments(ref: RepositoryRef, page: number, pullRequestNumber?: number): Promise<Page<CommentFixture>>;
  listEvents(ref: RepositoryRef, page: number, pullRequestNumber?: number): Promise<Page<EventFixture>>;
  getPermissions(ref: RepositoryRef): Promise<PermissionFixture[]>;
  getRateLimit(): Promise<RateLimitFixture>;
  getOnboarding(ref: RepositoryRef): Promise<OnboardingFixture>;
}
