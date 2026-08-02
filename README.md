# oss-eval

Headless, agent-first CLI and npm package for evaluating GitHub projects for
contributor fit. The stable output will be deterministic JSON; MCP and human
output will use the same core engine.

## Status

Foundation only. The current release provides `oss-eval version`; GitHub
analysis, metrics, storage, and MCP are implemented in later issues.

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
does not open a database or contact GitHub.
