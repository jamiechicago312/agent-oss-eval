# AGENTS.md — oss-eval

## Project mission

`oss-eval` is an agent-first, headless tool that evaluates whether a GitHub
repository is a good fit for a contributor or coding agent. It produces
deterministic, inspectable JSON first; human terminal output, the TypeScript
API, and the local MCP server are adapters over the same core report model.

The canonical npm package and CLI are `oss-eval`. `agent-oss-eval` is reserved
for a documented compatibility alias after the primary package has a useful
release.

## Source of truth and scope

`PLAN.md` describes the product contract, metric definitions, phases, risks,
and v1 definition of done. GitHub issues are the executable backlog derived
from that plan. Keep implementation issues self-contained and preserve the
plan's explicit definitions unless a deliberate, versioned decision changes
them.

The delivery order is:

1. Contract and package foundation.
2. One-shot repository analysis.
3. Local historical snapshots and resumability.
4. CLI/library/MCP agent integrations.
5. Hardening and release.
6. Optional hosted mode only after demand is demonstrated.

Do not build a dashboard, central credential proxy, global ranking system,
LLM measurement pipeline, or exact write-permission predictor as part of v1.

## Architecture rules

- Keep `src/core` free of CLI, SQLite, GitHub transport, and MCP concerns.
- The analyzer depends on typed interfaces for GitHub data and snapshot
  storage; it must be testable with fixtures and fake providers.
- SQLite is the default local durable store. JSON is the canonical result,
  export/import, MCP, and fixture format—not the primary database.
- Use a migration-based SQLite schema and a storage interface so a future
  Postgres adapter can be added without changing analysis or report contracts.
- Never store GitHub tokens in SQLite, reports, logs, fixtures, or errors.
- Report observed maintainer signals as “observed”; do not claim exact write
  access unless permission data was directly verified and sourced.
- Every important metric needs a definition, window, sample size, provenance,
  and confidence (`measured`, `inferred`, or `unavailable`) where applicable.
- Incomplete data, permission gaps, rate limits, retries, and partial work must
  be explicit in `limitations`; never silently turn a failed request into an
  empty dataset.

## Runtime and defaults

- Target Node 22 LTS or newer unless a later issue deliberately changes this.
- Prefer `auto` windows: fit 90 days when the budget allows, then 30 days,
  then the largest resumable partial plan.
- Explicit `90d` must not silently downgrade; return a partial report or a
  clear budget/timeout result.
- Default SQLite path is `$XDG_DATA_HOME/oss-eval/oss-eval.db`, falling back
  to `~/.local/share/oss-eval/oss-eval.db`; support `--db`, `OSS_EVAL_DB`, and
  a programmatic override.
- Raw GitHub payloads are opt-in; normalized observations are the default.
- The measurement pipeline has no LLM dependency. Any future narrative is a
  post-processing layer over deterministic evidence.

## Security and privacy

- Credential precedence: explicit option, `GITHUB_TOKEN`, `GH_TOKEN`, then
  GitHub CLI authentication when available.
- Use the minimum documented token scope and make public-repository analysis
  work with suitable read access.
- Do not send user tokens anywhere except GitHub. Do not print or persist them.
- Validate repository input and avoid collecting unrelated repositories.
- Document local storage, export, import, deletion, and retention/prune
  behavior. Public metadata may include usernames, PR titles, and timestamps.
- Treat user-provided repository names, file paths, and API content as data;
  avoid shell injection and unsafe path handling.

## GitHub API behavior

- Centralize REST/GraphQL access behind a typed client.
- Paginate every collection endpoint and respect `Link` headers and limits.
- Use bounded concurrency, capped retries, conditional requests where useful,
  and adaptive throttling after secondary-rate-limit responses.
- Distinguish authentication, permission, not-found, secondary-rate-limit,
  and server errors.
- Cache immutable or slowly changing metadata, and label reused observations
  as cached in provenance.
- Expensive work must checkpoint when SQLite is enabled and be resumable.
- Long work must expose phase, progress, request/rate-limit state, selected
  window, and resumability through human/JSONL/programmatic/MCP channels.

## Report and metric rules

Use the versioned report schema in `PLAN.md`. The top-level report includes
schema/tool version, target, generated time, selected window, repository data,
metrics, signals, comparison, provenance, limitations, and completeness.

Use the plan's exact cohort definitions. In particular:

- rolling activity excludes bots unless a metric says otherwise;
- contributor experience uses a creation cohort;
- open PRs are separate and not treated as zero-time merges;
- time-to-first-review is the first non-bot submitted review;
- report median, p75, and sample size where samples exist;
- vanity values such as stars and forks are context, not health scores.

## Required commands and quality gates

The repository must keep these checks working:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Tests must be deterministic and network-independent by default. Use recorded
fixtures or a dedicated test repository for integration coverage; never make
CI depend on a developer's token or live GitHub behavior.

Before declaring an issue complete:

1. Read the issue acceptance criteria and preserve existing user changes.
2. Add or update focused tests and documentation for behavior changes.
3. Run the relevant checks, then the full quality gates when practical.
4. Report limitations, migrations, schema changes, and follow-up work.
5. Keep commits focused and avoid unrelated refactors.

## v1 definition of done

`npx oss-eval analyze owner/repo --format json` works with a user token;
SQLite snapshots, job checkpoints, comparison, and JSON export/import work;
30-day, 90-day, and auto windows are distinguishable; large analyses expose
progress, throttling, budget use, and resumability; the report schema is
validated and published; metrics include definitions and sample sizes;
permissions and rate limits become limitations; CLI JSON, the programmatic
API, and local stdio MCP share one report model; fixture-backed CI passes
without network access; persistence and privacy are documented; and both npm
names have an intentional package strategy.

Hosted mode is not part of v1. If implemented later, it must use Postgres or
another server SQL database—not a shared SQLite file—and must define consent,
ingestion, deduplication, authentication, rate limits, moderation/correction,
retention, and deletion before launch.
