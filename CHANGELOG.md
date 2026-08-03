# Changelog

This project follows [Semantic Versioning](https://semver.org/). Changes that
alter the report contract, supported API, CLI behavior, storage schema, or MCP
tools are recorded here.

## 0.1.0 - Unreleased

### Added

- Canonical repository analysis with human, JSON, and JSONL output.
- Private local SQLite snapshots, import/export/prune, comparison, and durable jobs.
- Local stdio MCP server and supported TypeScript API.
- Bounded acquisition, partial-data disclosure, ETag revalidation, and dry planning.

### Known limitations

- GitHub does not expose exact effective write access for every contributor; roles
  and maintainer activity are observed signals, not authorization guarantees.
- Review enrichment can be partial on high-volume repositories when execution
  budgets are reached.
- Public activity cannot predict whether a future pull request will be accepted.
- Hosted/shared history is intentionally not part of v0.1.
