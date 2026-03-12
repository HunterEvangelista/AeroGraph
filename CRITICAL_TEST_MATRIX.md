# Critical Test Matrix

## Purpose

Establish deterministic, high-signal tests for the core graph platform before Phase 3 AI onboarding work.

## Step 1 - Test Foundation (Current)

| Area | Deliverable | Status |
|---|---|---|
| Test plan | Root matrix document with scope and sequencing | Done |
| Core helpers | `packages/core/src/__tests__/helpers/` for deterministic fixtures + Effect runners | In progress |
| CLI DB helpers | `packages/cli/src/db/__tests__/helpers/` for isolated in-memory SQLite setup | In progress |
| Helper smoke tests | Minimal tests proving helper determinism and DB isolation | In progress |

## Step 2 - Domain Schema Unit Tests (KIOKU-16)

| Module | Primary assertions |
|---|---|
| `entity.ts` | Valid + invalid decode paths for doc/code_ref/story/diagram |
| `tag.ts` | Optional field handling and invalid inputs |
| `link.ts` | All `LinkType` values + inverse mapping correctness |
| `version.ts` | Version/change type validation and edge constraints |
| `errors.ts` | Tagged error construction and shape consistency |

## Step 3 - Service Layer Unit Tests (KIOKU-17)

| Service | Primary assertions |
|---|---|
| `TagService.ensureHierarchy()` | Nested creation, partial existing chains, idempotency, invalid path |
| `GraphService.getEntityWithLinks()` | Incoming/outgoing split, missing entity handling |
| `GraphService.getRelatedEntities()` | Optional link type filter + de-dup behavior |
| `GraphService.traverse()` | BFS depth limit + cycle safety |
| `GraphService.findByTagPath()` | Single + multi-tag intersection wiring |
| `GraphService.findPath()` | Direct path, multi-hop shortest path, no-path case |
| `GraphService.getStats()` | Totals + entity-type counts |

## Step 4 - SQLite Repository Integration Tests (KIOKU-18)

| Repository | Primary assertions |
|---|---|
| `SqliteEntityRepository` | CRUD + FTS + tag intersection queries |
| `SqliteTagRepository` | Hierarchy reads + apply/remove entity tags |
| `SqliteLinkRepository` | Bidirectional creation + directional queries + deletes |
| `SqliteVersionRepository` | Version retrieval/count/range behavior |
| Cross-table behavior | Cascades and integrity assumptions verified explicitly |

## Gate to Start Phase 3

- `bun run test` passes in `packages/core` and `packages/cli`
- Step 2/3/4 suites use shared Step 1 helpers
- Tests are deterministic and isolated (no shared DB state)
