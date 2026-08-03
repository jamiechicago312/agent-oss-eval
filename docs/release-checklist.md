# v0.1 release checklist

## Contract and privacy

- [x] Canonical report validates against the packaged schema.
- [x] CLI JSON, JSONL, human, API, MCP, export, and import use one report model.
- [x] Token and Authorization-header redaction tests pass.
- [x] Raw payload retention is opt-in and documented.
- [x] Default database location, Docker persistence, export, prune, and deletion are documented.

## Analysis behavior

- [x] `auto`, `30d`, `90d`, and custom windows are explicit.
- [x] Progress, request limits, partial results, cancellation, and dry plans are tested.
- [x] Known limitations avoid exact-write-access and guaranteed-acceptance claims.
- [x] CI is deterministic and network-independent.

## Package and release

- [x] Packed artifact contains CLI, API, MCP, declarations, schema, README, and license.
- [x] Clean-consumer smoke tests pass without source-tree imports.
- [x] Version tag must match `package.json`.
- [x] npm publication requires the protected `npm` environment and provenance.
- [ ] Maintainer confirms npm ownership and configures `NPM_TOKEN`.
- [ ] Maintainer changes `0.1.0 - Unreleased` to the release date.
- [ ] Maintainer creates and pushes `v0.1.0` after the release commit is merged.

Publication is intentionally blocked until the three maintainer-controlled items
are complete.
