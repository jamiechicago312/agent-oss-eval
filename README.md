# oss-eval

Headless, agent-first CLI and npm package for evaluating GitHub projects for
contributor fit. The stable output will be deterministic JSON; MCP and human
output will use the same core engine.

## Status

The current release can analyze public GitHub repositories and emit human or
JSON reports. Storage and MCP are implemented in later issues.

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

SQLite will use `better-sqlite3` behind a storage interface. This foundation
does not open a database yet. GitHub analysis uses the authenticated GitHub CLI
credential when available.

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
