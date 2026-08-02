import { parseRepository } from "../core/config.js";
import type { FixtureScenario } from "./types.js";

const repository = parseRepository("fixture-owner/fixture-repo");
const baseRepository = {
  id: 1001,
  ref: repository,
  description: "Sanitized deterministic repository fixture",
  stars: 42,
  forks: 7,
  openIssues: 3,
  archived: false,
  license: "MIT",
  defaultBranch: "main",
  createdAt: "2025-01-01T00:00:00Z"
};

const pullRequests = [
  {
    id: 2001,
    number: 1,
    title: "Add fixture support",
    author: "contributor",
    authorIsBot: false,
    association: "CONTRIBUTOR" as const,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-02T00:00:00Z",
    state: "closed" as const,
    mergedAt: "2026-07-03T00:00:00Z",
    mergedBy: "maintainer"
  },
  {
    id: 2002,
    number: 2,
    title: "Improve documentation",
    author: "maintainer",
    authorIsBot: false,
    association: "MEMBER" as const,
    createdAt: "2026-07-10T00:00:00Z",
    updatedAt: "2026-07-11T00:00:00Z",
    state: "open" as const,
    mergedAt: null,
    mergedBy: null
  }
];

const reviews = [
  {
    id: 3001,
    pullRequestNumber: 1,
    reviewer: "maintainer",
    reviewerIsBot: false,
    state: "approved" as const,
    submittedAt: "2026-07-02T00:00:00Z",
    association: "MEMBER" as const
  }
];

const emptyArrays = {
  comments: [],
  events: [],
  permissions: []
};

export const smallRepositoryFixture: FixtureScenario = {
  name: "small",
  repository: baseRepository,
  pullRequests,
  reviews,
  ...emptyArrays,
  rateLimit: { remaining: 4999, limit: 5000, resetAt: "2026-08-02T01:00:00Z" },
  completeness: "complete",
  limitations: []
};

export const emptyRepositoryFixture: FixtureScenario = {
  ...smallRepositoryFixture,
  name: "empty",
  repository: { ...baseRepository, id: 1002, ref: parseRepository("empty-owner/empty-repo") },
  pullRequests: [],
  reviews: []
};

export const botHeavyRepositoryFixture: FixtureScenario = {
  ...smallRepositoryFixture,
  name: "bot-heavy",
  repository: { ...baseRepository, id: 1003, ref: parseRepository("bot-owner/bot-repo") },
  pullRequests: pullRequests.map((pullRequest, index) => ({
    ...pullRequest,
    id: 2100 + index,
    author: "dependabot[bot]",
    authorIsBot: true
  })),
  reviews: []
};

export const partialRepositoryFixture: FixtureScenario = {
  ...smallRepositoryFixture,
  name: "partial",
  completeness: "partial",
  limitations: ["Review history is unavailable in this fixture."]
};

export const fixtureScenarios: Record<string, FixtureScenario> = {
  small: smallRepositoryFixture,
  empty: emptyRepositoryFixture,
  "bot-heavy": botHeavyRepositoryFixture,
  partial: partialRepositoryFixture
};

export function getFixture(name: string): FixtureScenario | undefined {
  return fixtureScenarios[name];
}
