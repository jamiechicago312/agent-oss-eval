# Versioning and migrations

## Package versions

`oss-eval` uses Semantic Versioning. Patch releases preserve supported behavior,
minor releases add backward-compatible capabilities, and major releases may
change supported API or CLI contracts. The `agent-oss-eval` alias is not part of
v0.1 and must follow the compatibility policy before publication.

## Report schema

`schema_version` is independent of the npm version. Additive optional fields may
ship within schema version 1. Removing, renaming, changing meanings, or changing
required field types requires a new integer schema version. Readers must reject
unknown incompatible versions rather than silently reinterpret them.

## SQLite migrations

SQLite migrations are append-only, integer-versioned, and applied transactionally
in order. Released migration SQL is immutable. New releases may add migrations but
must preserve reports, raw opt-in data, observations, and jobs. Downgrades are not
automatic; export snapshots before installing an older release. A failed migration
rolls back and leaves the prior version intact.

## Upgrade procedure

1. Export important snapshots or back up the SQLite file.
2. Install the new package version.
3. Run `oss-eval doctor`.
4. Run `oss-eval snapshots list owner/repo` and a fixture analysis.
5. Review the changelog for schema or behavior changes.
