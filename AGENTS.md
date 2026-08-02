# AGENTS.md — oss-eval

## Mission

Build `oss-eval`: a headless, agent-first GitHub repository evaluator.
Deterministic JSON is the contract. CLI, TypeScript API, and MCP are adapters.
`agent-oss-eval` is only a future compatibility alias.

Issues #2–#20 are the ordered backlog. Each issue is self-contained; execute
one issue at a time and preserve its acceptance criteria.

## Architecture

- Keep `src/core` independent of CLI, SQLite, GitHub transport, and MCP.
- Use typed interfaces for GitHub access and storage; test core with fakes.
- SQLite is local durable state. JSON is result/export/MCP/fixture format.
- Use migrations and a storage interface so Postgres can be added later.
- No dashboard, central token proxy, global ranking, or LLM measurement in v1.

## Non-negotiable behavior

- Never print, persist, or transmit GitHub tokens anywhere except GitHub.
- Auth order: explicit option, `GITHUB_TOKEN`, `GH_TOKEN`, GitHub CLI auth.
- Paginate, bound concurrency, retry transient failures, and classify errors.
- Never turn failed requests into empty data; report failures in `limitations`.
- Label cached, partial, inferred, unavailable, and permission-limited data.
- Say “observed maintainer”; claim write access only with verified permission data.
- Every metric includes definition, window, sample size, source, and confidence.
- Activity excludes bots unless the metric explicitly includes them.
- Contributor experience uses a PR creation cohort; open PRs are right-censored.
- Report median, p75, and sample size where applicable.
- `auto` prefers 90d, then 30d, then a resumable partial plan.
- Explicit 90d never silently downgrades.
- Expensive SQLite-backed work checkpoints and resumes.

## Defaults

- Node 22 LTS+.
- DB: `$XDG_DATA_HOME/oss-eval/oss-eval.db`, fallback
  `~/.local/share/oss-eval/oss-eval.db`; support `--db` and `OSS_EVAL_DB`.
- Raw GitHub payloads off by default.
- No network or personal token required by CI tests.

## Tests

Required scripts:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Use fixtures/fakes by default. Add or update focused tests for every behavior
change. Keep output and error handling deterministic.

## PR rules

PRs must be concise and easy to review. Use this body:

```text
Summary
- 1–3 bullets describing the change

Tests
- exact commands run and result

Human check
- 1–3 manual checks, or “Not applicable — covered by tests”
```

Do not paste the plan, write an essay, include unrelated refactors, or claim
tests were run when they were not.

## Human PR verification

For each PR:

1. Read the linked issue and confirm every acceptance criterion is addressed.
2. Inspect the diff:

   ```bash
   gh pr checkout <number>
   git diff origin/main...HEAD
   ```

3. Install and run the full gates:

   ```bash
   npm ci
   npm run lint
   npm run typecheck
   npm test
   npm run build
   ```

4. Run the issue’s stated smoke/manual command. Check the output, exit code,
   error/limitation text, and that no token or unrelated data appears.
5. Confirm GitHub CI is green, then merge only if the diff and behavior match
   the issue. If a gate fails, request a fix rather than approving the PR.

## v1 finish line

The CLI analyzes a repository with a user token; JSON/schema, SQLite snapshots,
jobs/resume, compare/export/import/prune, auto/30d/90d windows, progress,
programmatic API, local stdio MCP, privacy docs, and fixture-backed CI work.
Hosted mode is deferred and must use Postgres, never shared SQLite.
