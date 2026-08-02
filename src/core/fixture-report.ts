import type { RepositoryRef } from "./config.js";
import type { Report } from "./types.js";
import type { FixtureScenario } from "../github/types.js";

export function reportFromFixture(target: RepositoryRef, fixture: FixtureScenario): Report {
  return {
    schema_version: 1,
    tool: { name: "oss-eval", version: "0.1.0" },
    target: {
      owner: target.owner,
      name: target.name,
      full_name: target.fullName,
      url: target.url
    },
    generated_at: "2026-08-02T00:00:00Z",
    window: {
      start: "2026-05-04T00:00:00Z",
      end: "2026-08-02T00:00:00Z",
      days: 90
    },
    repository: {
      id: fixture.repository.id,
      description: fixture.repository.description,
      stars: fixture.repository.stars,
      forks: fixture.repository.forks,
      open_issues: fixture.repository.openIssues,
      archived: fixture.repository.archived,
      license: fixture.repository.license,
      default_branch: fixture.repository.defaultBranch
    },
    metrics: {},
    signals: [],
    comparison: null,
    provenance: { fixture: fixture.name, network_requests: 0 },
    limitations: fixture.limitations,
    completeness: fixture.completeness
  };
}
