# SQLite Concurrent Writes

## Context

KIOKU-29 tracks failures where parallel CLI write commands can hit SQLite `database is locked` errors. This is most visible when multiple `doc create` commands run at the same time, especially with tags.

AeroGraph v1 is local-first and CLI-first. Parallel writes can still come from separate CLI processes, agent workflows, and future editor or indexer processes sharing the same workspace database.

## Selected Approach

Handle normal local contention at the SQLite connection and repository-write layers:

- Configure each SQLite connection with lock-friendly pragmas on open.
- Use WAL for file-backed databases so readers and writers interfere less.
- Set a per-connection busy timeout so SQLite can wait briefly for active writers.
- Add bounded retries for SQLite busy/locked write failures.
- Keep clear repository errors if contention remains after retries.

This should be implemented before considering heavier options such as a workspace daemon or cross-process write queue.

## Drizzle Migration Boundary

This work is separate from the current migration tech debt.

Drizzle migrations should own schema changes: tables, columns, indexes, triggers, and schema metadata. Concurrent-write safety primarily depends on runtime connection configuration and retry behavior:

- `PRAGMA busy_timeout` is per connection and must run on every open.
- `PRAGMA foreign_keys` is per connection and must run on every open.
- `PRAGMA journal_mode = WAL` is persisted for file-backed databases, but should still be applied defensively on open.
- `PRAGMA synchronous = NORMAL` is connection/database runtime configuration, not a schema migration.

Migrating manual `CREATE_TABLES_SQL` bootstrapping to Drizzle remains useful, but it does not by itself fix `database is locked` failures.

## Implementation Notes

- Add database connection configuration in `packages/cli/src/db/client.ts`.
- Keep the configuration helper close to the database client unless reuse emerges.
- Apply write retries in the SQLite repository layer, not the core domain layer.
- Retry only SQLite busy/locked errors, with bounded backoff and jitter.
- Include prefix index rebuilds in the write-safety path because they delete and reinsert prefix rows.
- Add a CLI regression test that spawns multiple `doc create --tags ...` commands against one workspace and asserts they all succeed.

## Non-Goals

- Do not introduce a daemon for this issue.
- Do not serialize writes only in-process; parallel CLI commands run in separate processes.
- Do not block this fix on the Drizzle migration cleanup.
