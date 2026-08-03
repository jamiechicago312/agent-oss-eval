# oss-eval

Headless, agent-first CLI and npm package for evaluating GitHub projects for
contributor fit. The stable output will be deterministic JSON; MCP and human
output will use the same core engine.

## Status

The current release can analyze public GitHub repositories, emit human, JSON,
or JSONL reports, and retain private local history in SQLite. MCP is implemented
in a later phase.

## Requirements

- Node.js 22 LTS or newer
- npm

## Development

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
node dist/cli/index.js version
```

SQLite uses Node.js 22's built-in driver behind a storage interface. The default
database is `$XDG_DATA_HOME/oss-eval/history.sqlite3` (or
`~/.local/share/oss-eval/history.sqlite3`). Override it with `--db`,
`OSS_EVAL_DB`, or the programmatic storage interface. Raw acquisition payloads
are stored only with `--include-raw`. GitHub analysis uses the authenticated
GitHub CLI credential when available.

## Analysis

```bash
node dist/cli/index.js analyze owner/repo --window 30d --format human --no-save
```

The default acquisition cap is 100 pages. For repositories with many PRs,
raise it explicitly along with the request and runtime budgets:

```bash
node dist/cli/index.js analyze owner/repo \
  --window 30d \
  --max-pages 300 \
  --max-api-requests 300 \
  --budget 5m \
  --format human \
  --no-save
```

If the cap is reached, the report identifies the affected metrics and tells
you which limit to raise.

Use `--format jsonl` for one structured progress event per line followed by a
final `report` event. Human progress is written to stderr; `--quiet --format
json` writes only the final report to stdout.

## Local history

Analysis saves snapshots by default. Use `--no-save` for an ephemeral run.

```bash
oss-eval snapshots list owner/repo
oss-eval snapshots show <snapshot-id>
oss-eval compare owner/repo --against previous --format human
oss-eval compare owner/repo --against <snapshot-id-or-timestamp> --format json
oss-eval snapshots export owner/repo --output snapshots.json
oss-eval snapshots import snapshots.json
oss-eval snapshots prune owner/repo --before 2026-01-01T00:00:00Z
```

Export/import preserves reports, provenance, limitations, optional raw data,
and observations. Import is idempotent. Export refuses to overwrite an existing
file, and prune removes only snapshots strictly older than the supplied boundary.
Comparisons reject mismatched repositories, windows, or schema versions instead
of presenting them as equivalent.
