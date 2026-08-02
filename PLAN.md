# OSS Eval — Product and Engineering Plan

## 1. Summary

`oss-eval` is a headless, agent-first tool that evaluates whether an open source project is a good fit for a contributor or an AI agent to invest in.

It will analyze a GitHub repository using the user's own GitHub token, produce deterministic structured JSON, and optionally maintain local historical snapshots in SQLite. A human-readable terminal report and an MCP server are secondary interfaces over the same analysis engine.

The primary npm package and CLI name is `oss-eval`. `agent-oss-eval` is reserved as a compatibility/alias package.

The project is inspired by [`jamiechicago312/oss-dashboard`](https://github.com/jamiechicago312/oss-dashboard), especially its repository-level GitHub analysis and incremental snapshot ideas. It is a new project with a different center of gravity: the stable machine-readable contract comes first; there is no required web UI.

## 2. Product thesis

Repository popularity is not contributor experience.

An agent needs evidence about whether a project is active, approachable, reviewable, and likely to reward contribution effort. The useful answer is not “this project has 8,000 stars”; it is closer to:

> “During the last 90 days, 61 external contributors opened pull requests, 18 returned with a second PR, the median time to first human review was 29 hours, and 74% of PRs received review. Activity is healthy, but review work is concentrated among two observed maintainers.”

The tool must make that conclusion inspectable. Every important metric needs a definition, time window, sample size, provenance, and limitations.

## 3. Goals

### Primary goals

1. Evaluate one GitHub repository at a time for contributor fit.
2. Make JSON the canonical output for AI agents.
3. Use the user's own GitHub credentials; do not require a central credential proxy.
4. Support a rolling 90-day analysis window by default.
5. Provide useful historical comparison without requiring a hosted database.
6. Handle incomplete GitHub data and rate limits explicitly instead of silently inventing precision.
7. Package the same core for a CLI, npm library, and MCP server.

### Secondary goals

1. Provide a concise terminal report for humans.
2. Support incremental refreshes to reduce GitHub API usage.
3. Make future hosted/team storage possible behind a storage interface.
4. Support optional natural-language interpretation after deterministic analysis is complete.

## 4. Non-goals for v1

- A dashboard or required browser UI.
- Organization-wide portfolio analysis.
- Ranking or scoring every open source project on the internet.
- Claiming exact current repository write permissions when GitHub does not expose them to the token.
- Predicting whether a particular pull request will be accepted.
- Storing user GitHub tokens on a central service.
- Embedding an LLM in the measurement pipeline.
- A public global database of repository history.
- Evaluating code quality, security, or legal license compatibility in depth.

## 5. Target users and workflows

### Contributor or maintainer

```bash
oss-eval analyze rust-lang/rust
```

They receive a readable summary with an optional JSON artifact and can compare it with a prior local snapshot.

### AI coding agent

```bash
oss-eval analyze rust-lang/rust --format json --quiet
```

The agent consumes stable JSON, including evidence and caveats, and decides whether to recommend the project.

### MCP client

The agent calls an MCP tool such as `evaluate_repository` and receives the same canonical report without scraping terminal text.

### Scheduled local monitoring

```bash
oss-eval analyze owner/repo --save --format json
oss-eval compare owner/repo --format json
```

The local SQLite store supplies prior snapshots. The database belongs to the user and is never required for a one-shot analysis.

## 6. Proposed command surface

The exact flags can change during implementation, but the conceptual contract should remain stable.

```text
oss-eval analyze <owner/repo>
  --window 90d
  --since <ISO-8601 timestamp>
  --format human|json|jsonl
  --db <path>
  --no-cache
  --save / --no-save
  --include-raw
  --strict
  --quiet

oss-eval compare <owner/repo>
  --against previous|<snapshot-id>|<timestamp>
  --format human|json

oss-eval snapshots list <owner/repo>
oss-eval snapshots show <snapshot-id>
oss-eval snapshots export <owner/repo> --output <file>
oss-eval snapshots import <file>

oss-eval auth status
oss-eval doctor
oss-eval version
```

Exit codes must be documented and stable:

- `0`: complete analysis succeeded.
- `1`: analysis failed.
- `2`: invalid input or configuration.
- `3`: analysis completed with material limitations under `--strict`.

## 7. Authentication and privacy

### Token sources

Support, in priority order:

1. Explicit CLI option or programmatic option.
2. `GITHUB_TOKEN`.
3. `GH_TOKEN`.
4. GitHub CLI authentication where available.

Never print token values, include them in errors, or persist them in SQLite.

### Credential policy

- The default mode makes requests directly from the user's environment to GitHub.
- No hosted API is required for the core product.
- Token scopes should be minimized and documented.
- Public repository analysis should work with a classic/public read token or suitable fine-grained read access.
- The report must state when a metric requires permissions the current token does not have.

### Data policy

The local database may contain public GitHub metadata, usernames, PR titles, review events, and timestamps. The tool must:

- document the storage location;
- provide export and deletion commands;
- provide a retention/prune command before v1 is complete;
- avoid storing response headers containing authorization details;
- avoid collecting data unrelated to the requested repository;
- make raw storage opt-in if raw payloads contain more detail than the report needs.

## 8. Storage model

### Default

Use SQLite stored locally at:

```text
$XDG_DATA_HOME/oss-eval/oss-eval.db
```

Fallback:

```text
~/.local/share/oss-eval/oss-eval.db
```

Allow `--db`, `OSS_EVAL_DB`, and a programmatic path override.

SQLite persists for local users, persistent coding workspaces, and mounted containers. It does not persist automatically in ephemeral CI or sandbox runs; those users can export snapshots as JSON.

### Initial schema

The schema should be migration-based, not created ad hoc inside analysis code.

```sql
repositories (
  id INTEGER PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL UNIQUE,
  github_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)

snapshots (
  id INTEGER PRIMARY KEY,
  repository_id INTEGER NOT NULL,
  generated_at TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  tool_version TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  completeness TEXT NOT NULL,
  report_json TEXT NOT NULL,
  raw_json TEXT,
  FOREIGN KEY (repository_id) REFERENCES repositories(id)
)

observations (
  id INTEGER PRIMARY KEY,
  snapshot_id INTEGER NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  UNIQUE (snapshot_id, source, source_id),
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(id)
)
```

The first implementation may keep normalized observations inside snapshot JSON for speed, but the storage interface must not expose SQLite details to the analyzer.

### Storage interface

The analyzer should depend on operations like:

```ts
interface SnapshotStore {
  getLatest(repository: RepositoryRef): Promise<Snapshot | null>;
  save(snapshot: Snapshot): Promise<void>;
  list(repository: RepositoryRef): Promise<SnapshotSummary[]>;
  get(id: string): Promise<Snapshot | null>;
  export(repository: RepositoryRef): Promise<PortableSnapshot[] | null>;
  import(snapshots: PortableSnapshot[]): Promise<void>;
  prune(policy: RetentionPolicy): Promise<number>;
}
```

This leaves room for a future Postgres adapter without making hosted infrastructure part of v1.

## 9. Canonical report contract

The JSON schema is the product. It must be versioned and tested with fixtures.

Top-level shape:

```json
{
  "schema_version": 1,
  "tool": { "name": "oss-eval", "version": "0.1.0" },
  "target": {
    "owner": "owner",
    "name": "repo",
    "full_name": "owner/repo",
    "url": "https://github.com/owner/repo"
  },
  "generated_at": "2026-08-02T00:00:00Z",
  "window": {
    "start": "2026-05-04T00:00:00Z",
    "end": "2026-08-02T00:00:00Z",
    "days": 90
  },
  "repository": {},
  "metrics": {},
  "signals": [],
  "comparison": null,
  "provenance": {},
  "limitations": [],
  "completeness": "complete|partial|failed"
}
```

Every metric should use a common shape where practical:

```json
{
  "value": 31,
  "unit": "hours",
  "definition": "PR opened to first non-bot submitted review",
  "sample_size": 42,
  "source": "github.pull_request_reviews",
  "window": "90d",
  "confidence": "measured|inferred|unavailable"
}
```

## 10. Metric definitions

Definitions must be implemented exactly as written or changed deliberately with a schema/version note.

### Repository context

- `stars`: GitHub stargazer count at snapshot time.
- `forks`: GitHub fork count at snapshot time.
- `open_issues`: GitHub open issue count, explicitly including/excluding PRs as documented.
- `archived`: repository archived flag.
- `license`: detected GitHub license identifier, if available.
- `default_branch`: default branch name.
- `repository_age_days`: snapshot time minus repository creation time.

Stars and forks are context/vanity metrics, not health scores.

### Activity

All rolling-window activity excludes bots unless a metric explicitly says otherwise.

- `prs_opened`: PRs created within the window.
- `prs_merged`: PRs merged within the window.
- `prs_closed_unmerged`: PRs closed without merge within the window.
- `prs_open_at_end`: PRs open at the end of the window.
- `active_pr_authors`: unique human PR authors with a PR created in the window.
- `repeat_contributors`: active contributors who created at least two PRs in the window.
- `external_contributors`: active PR authors without maintainer-associated evidence in the window.
- `bot_pr_share`: bot-authored PRs divided by all PRs in the window.

### Maintainer signals

GitHub may not provide complete current permission data. Therefore the default report must say “observed” rather than “has write access.”

- `observed_reviewers`: unique human users who submitted a review in the window.
- `observed_mergers`: unique human users attributable to merges in the window, where available.
- `observed_maintainer_authors`: PR authors with `OWNER`, `MEMBER`, or `COLLABORATOR` association, where available.
- `active_observed_maintainers`: union of the above observed maintainer signals.
- `maintainer_concentration`: share of reviewed PRs handled by the top one and top three observed reviewers.
- `public_org_members`: public organization members only; never present this as total organization membership.

If direct collaborator/permission data is available to the user's token, report it separately as `verified_permission_data` with its permission source and timestamp.

### Contributor experience

For PRs created in the window:

- `time_to_first_human_review`: PR creation to the first non-bot submitted review.
- `time_to_merge`: PR creation to merge, for PRs merged during the window or whose creation falls in the defined cohort.
- `review_coverage`: percentage of eligible PRs receiving at least one human submitted review.
- `merge_rate`: merged PRs divided by closed PRs, with open PRs reported separately.
- `open_pr_share`: PRs still open at snapshot time divided by PRs in the cohort.

Report median, p75, and sample size. Averages may be included only as secondary values.

The report must specify whether time-to-merge uses:

1. a creation cohort: PRs created during the window; or
2. an event cohort: PRs merged during the window.

Use the creation cohort for contributor experience so the window has a stable denominator. Mark not-yet-merged PRs as right-censored and do not treat them as zeroes.

### On-ramp signals

- contributing guide exists and path;
- code of conduct exists and path;
- issue templates exist;
- pull request template exists;
- recognized good-first-issue label exists;
- open good-first-issue count;
- good-first-issue closure activity in the window, if sample size permits.

These are signals, not a claim that the project is welcoming.

### Quality and confidence

Every report includes:

- fetched sources;
- cached sources reused;
- source timestamps where available;
- failed or skipped stages;
- rate-limit state;
- permission-related omissions;
- bot-filtering decisions;
- sample sizes;
- whether values are measured, inferred, cached, or unavailable.

## 11. GitHub data acquisition

Use GitHub REST and GraphQL only where they materially reduce requests or provide data unavailable through REST. Centralize API access behind a typed client.

Required behavior:

- paginate every collection endpoint;
- respect `Link` headers and API limits;
- use bounded concurrency;
- retry transient failures with capped backoff;
- stop retrying when the rate-limit reset is too far away;
- distinguish authentication, permission, not-found, secondary-rate-limit, and server errors;
- cache immutable or slowly changing repository metadata;
- use conditional requests where practical;
- never silently substitute an empty result for a failed request.

The analyzer should fetch only the data needed for the selected report and window. Incremental refreshes may reuse prior PR/review observations, but reused data must be labeled as cached.

## 12. Architecture

```text
                    +----------------+
                    | CLI             |
                    +--------+-------+
                             |
                    +--------v-------+
                    | Core analyzer  |
                    | definitions    |
                    | normalization  |
                    +---+--------+---+
                        |        |
               +--------v--+ +---v---------+
               | GitHub    | | Snapshot    |
               | client    | | store       |
               +-----------+ +-------------+
                        |        |
                    +---v--------v---+
                    | Canonical JSON |
                    +---+--------+---+
                        |        |
                 +------v--+ +---v------+
                 | Human   | | MCP      |
                 | output  | | server   |
                 +---------+ +----------+
```

Suggested package layout:

```text
src/
  cli/
  core/
    analyze.ts
    metrics/
    report-schema.ts
    types.ts
  github/
    client.ts
    pagination.ts
    queries/
  storage/
    snapshot-store.ts
    sqlite-store.ts
    migrations/
  output/
    json.ts
    human.ts
    jsonl.ts
  mcp/
  auth/
  errors.ts
tests/
  fixtures/
  unit/
  integration/
  contract/
```

Keep `core` free of CLI, SQLite, and MCP concerns.

## 13. MCP server

The MCP server is an adapter, not a second implementation.

Initial tool:

```text
evaluate_repository
  repository: string
  window_days?: number
  include_comparison?: boolean
  include_raw?: boolean
```

Return the canonical JSON report as structured content. MCP errors should preserve the same categories and limitations as the CLI.

The server should support stdio first because it is straightforward for local AI agents and keeps tokens local. An HTTP transport is deferred until a concrete deployment need exists.

## 14. npm package strategy

### `oss-eval`

The primary public package. It should expose:

- the `oss-eval` executable;
- a supported programmatic API for Node consumers;
- the MCP server entry point;
- TypeScript declarations;
- JSON schema for reports.

### `agent-oss-eval`

Publish as a compatibility alias after the primary package has a real initial release. It should either:

- depend on and forward to `oss-eval`; or
- be deprecated with a clear message directing users to `oss-eval`.

Do not publish an empty throwaway package. The initial publication should be a useful, documented v0 release.

## 15. Testing and validation

### Unit tests

- repository input parsing;
- time-window boundaries;
- bot detection;
- contributor/repeat-contributor grouping;
- maintainer association classification;
- percentile and median calculations;
- right-censored merge handling;
- metric comparison and percentage changes;
- incomplete-data and error classification;
- SQLite migrations and retention.

### Contract tests

- validate reports against the published JSON Schema;
- ensure stable field names and nullability;
- verify human and JSON output represent the same values;
- verify MCP output matches CLI JSON output.

### Integration tests

Use recorded GitHub fixtures or a dedicated test repository. Avoid making the test suite dependent on live GitHub behavior or a developer's personal token.

Test at least:

- public repository;
- repository with no PR activity;
- repository with bot-heavy activity;
- repository with no reviews;
- incomplete permission access;
- rate-limit response;
- pagination over multiple pages;
- archived repository;
- malformed repository input;
- ephemeral/no-database mode.

### Quality gates

Before release:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The repository should include CI for these checks and a smoke test that runs the CLI with a fixture provider rather than a live token.

## 16. Delivery phases

### Phase 0 — Contract and package foundation

- establish TypeScript/Node package structure;
- choose runtime and SQLite driver;
- publish JSON Schema draft/version;
- implement repository parsing, config, errors, and exit codes;
- add fixture-based test harness;
- decide Node version support;
- reserve/publish package names only with a useful initial package.

**Exit criterion:** a fixture-backed CLI emits a versioned empty/partial report with no GitHub calls.

### Phase 1 — One-shot repository analysis

- implement authenticated GitHub client;
- fetch repository metadata;
- fetch PRs and reviews for a 90-day creation cohort;
- implement activity, contributor, review, merge, and on-ramp metrics;
- emit canonical JSON and human output;
- surface limitations and sample sizes.

**Exit criterion:** analysis of a real public repository produces a report whose metrics can be manually reconciled against GitHub API fixtures.

### Phase 2 — Local historical snapshots

- implement SQLite migrations;
- save/load snapshots;
- implement incremental refresh;
- implement compare, list, export, import, and prune;
- document persistence behavior in local, Docker, and ephemeral environments.

**Exit criterion:** two analyses produce a meaningful comparison without requiring a hosted database.

### Phase 3 — Agent integrations

- add JSONL if useful for batch agents;
- implement stdio MCP server;
- publish TypeScript API and report schema;
- add examples for Codex, Claude-style MCP clients, and shell agents without coupling to one vendor.

**Exit criterion:** an agent can invoke the tool and make a decision using structured output without parsing prose.

### Phase 4 — Hardening and release

- improve rate-limit handling;
- add caching/conditional requests;
- audit token and raw-data handling;
- add release automation;
- publish `oss-eval`;
- publish the alias package;
- create a changelog and migration policy.

**Exit criterion:** v0.1 is installable, documented, repeatable, and safe to run against arbitrary public repositories.

### Deferred Phase 5 — Optional hosted mode

Only pursue this after usage demonstrates demand for:

- shared team histories;
- public benchmark datasets;
- scheduled repository monitoring;
- cross-repository comparisons.

Hosted mode must be opt-in, separately documented, and must not make local mode less private or less capable.

## 17. Risks and mitigations

### GitHub API limits

Mitigation: bounded concurrency, pagination discipline, incremental refresh, conditional requests, clear partial reports, and user-owned tokens.

### Misleading maintainer counts

Mitigation: use “observed maintainers” unless direct permission data is verified; show the source and timestamp.

### Small samples

Mitigation: include sample sizes and suppress strong conclusions below configurable thresholds.

### Long-lived PR bias

Mitigation: report open PRs separately and use right-censoring language for time-to-merge.

### Local database loss

Mitigation: export/import commands, documented path, optional project-local database, and no assumption that ephemeral environments retain state.

### Schema churn

Mitigation: version the JSON contract, maintain fixtures, publish migration notes, and keep additive changes backward-compatible where possible.

### Package-name confusion

Mitigation: make `oss-eval` canonical; make `agent-oss-eval` a documented alias rather than two independently evolving products.

## 18. Decisions to confirm before implementation

These are the few choices that materially affect the first implementation:

1. Supported Node versions and minimum npm version.
2. SQLite driver: native Node SQLite, `better-sqlite3`, or a portable WASM/serverless option.
3. Whether raw GitHub payload storage is opt-in or enabled by default.
4. Whether the default database is global user data or project-local when run inside a repository.
5. Whether the default output includes a recommendation narrative or only evidence and signals.
6. Whether `--strict` should return exit code 3 for any missing metric or only material missing data.
7. Whether the first release includes MCP or follows CLI/package stabilization.

Recommended defaults:

- Node 22 LTS or newer;
- global user SQLite database by default;
- raw payloads off by default, normalized observations on;
- evidence-first output with no LLM dependency;
- stdio MCP included after the core JSON contract is stable;
- 90 days as the default, configurable window supported from the beginning.

## 19. Definition of done for v1

The v1 release is complete when:

- `npx oss-eval analyze owner/repo --format json` works with a user token;
- no token is stored or sent anywhere except GitHub;
- SQLite snapshots and JSON export/import work;
- the report schema is published and validated;
- metrics have explicit definitions and sample sizes;
- incomplete permissions and rate limits appear in `limitations`;
- median/p75 review and merge timing is reported where samples exist;
- “observed maintainers” is not misrepresented as exact write access;
- CLI JSON, programmatic API, and MCP return the same report model;
- fixture-backed CI passes without network access;
- documentation explains persistence and privacy clearly;
- both npm names have an intentional package strategy rather than placeholder content.

