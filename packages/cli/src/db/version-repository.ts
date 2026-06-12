import {
  type ChangeType,
  type Entity,
  EntityNotFoundError,
  type EntityVersion,
  RepositoryError,
  type TypedEntityVersion,
  VersionNotFoundError,
  type VersionRepository,
  VersionRepositoryTag,
} from "@kioku/core";
/**
 * SQLite Version Repository Implementation
 */
import { Effect, Layer } from "effect";
import { DatabaseClientTag } from "./client.js";

// ============================================================================
// Helper Functions
// ============================================================================

const generateId = (): string => crypto.randomUUID();

const now = (): string => new Date().toISOString();

interface VersionRow {
  id: string;
  entity_id: string;
  version: number;
  data: string;
  change_type: string;
  changed_fields: string | null;
  created_at: string;
}

const rowToVersion = (row: VersionRow): EntityVersion => ({
  id: row.id as EntityVersion["id"],
  entityId: row.entity_id,
  version: row.version,
  data: JSON.parse(row.data),
  changeType: row.change_type as ChangeType,
  changedFields: row.changed_fields ? JSON.parse(row.changed_fields) : undefined,
  createdAt: new Date(row.created_at),
});

// ============================================================================
// Repository Implementation
// ============================================================================

export const SqliteVersionRepositoryLive = Layer.effect(
  VersionRepositoryTag,
  Effect.gen(function* () {
    const { db } = yield* DatabaseClientTag;

    const insertVersion = db.prepare(`
      INSERT INTO entity_versions (id, entity_id, version, data, change_type, changed_fields, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const selectVersion = db.prepare(`
      SELECT * FROM entity_versions WHERE entity_id = ? AND version = ?
    `);

    const selectAllForEntity = db.prepare(`
      SELECT * FROM entity_versions WHERE entity_id = ? ORDER BY version DESC
    `);

    const selectLatest = db.prepare(`
      SELECT * FROM entity_versions WHERE entity_id = ? ORDER BY version DESC LIMIT 1
    `);

    const selectInTimeRange = db.prepare(`
      SELECT * FROM entity_versions
      WHERE created_at >= ? AND created_at <= ?
      ORDER BY created_at DESC
    `);

    const countForEntity = db.prepare(`
      SELECT COUNT(*) as count FROM entity_versions WHERE entity_id = ?
    `);

    const deleteForEntity = db.prepare(`
      DELETE FROM entity_versions WHERE entity_id = ?
    `);

    const checkEntityExists = db.prepare("SELECT 1 FROM entities WHERE id = ?");

    const create = (
      entityId: string,
      version: number,
      data: Entity,
      changeType: ChangeType,
      changedFields?: ReadonlyArray<string>
    ) =>
      Effect.try({
        try: () => {
          const id = generateId();
          const timestamp = now();
          insertVersion.run(
            id,
            entityId,
            version,
            JSON.stringify(data),
            changeType,
            changedFields ? JSON.stringify(changedFields) : null,
            timestamp
          );

          const row = selectVersion.get(entityId, version) as VersionRow;
          return rowToVersion(row);
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to create version: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const getVersion = (entityId: string, version: number) =>
      Effect.gen(function* () {
        const row = yield* Effect.try({
          try: () => selectVersion.get(entityId, version) as VersionRow | undefined,
          catch: (error) =>
            new RepositoryError({
              message: `Failed to get version: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        if (!row) {
          return yield* new VersionNotFoundError({ entityId, version });
        }

        return rowToVersion(row);
      });

    const getAllForEntity = (entityId: string) =>
      Effect.gen(function* () {
        const entityExists = yield* Effect.try({
          try: () => checkEntityExists.get(entityId),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to check entity: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        if (!entityExists) {
          return yield* new EntityNotFoundError({ entityId });
        }

        return yield* Effect.try({
          try: () => {
            const rows = selectAllForEntity.all(entityId) as VersionRow[];
            return rows.map(rowToVersion);
          },
          catch: (error) =>
            new RepositoryError({
              message: `Failed to get versions: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });
      });

    const getLatest = (entityId: string) =>
      Effect.gen(function* () {
        const row = yield* Effect.try({
          try: () => selectLatest.get(entityId) as VersionRow | undefined,
          catch: (error) =>
            new RepositoryError({
              message: `Failed to get latest version: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        if (!row) {
          return yield* new EntityNotFoundError({ entityId });
        }

        return rowToVersion(row);
      });

    const getEntityAtVersion = <E extends Entity>(entityId: string, version: number) =>
      Effect.gen(function* () {
        const versionRecord = yield* getVersion(entityId, version);

        return {
          ...versionRecord,
          data: versionRecord.data as E,
        } as TypedEntityVersion<E>;
      });

    const countVersionsForEntity = (entityId: string) =>
      Effect.gen(function* () {
        const entityExists = yield* Effect.try({
          try: () => checkEntityExists.get(entityId),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to check entity: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        if (!entityExists) {
          return yield* new EntityNotFoundError({ entityId });
        }

        return yield* Effect.try({
          try: () => {
            const result = countForEntity.get(entityId) as { count: number };
            return result.count;
          },
          catch: (error) =>
            new RepositoryError({
              message: `Failed to count versions: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });
      });

    const getInTimeRange = (start: Date, end: Date) =>
      Effect.try({
        try: () => {
          const rows = selectInTimeRange.all(
            start.toISOString(),
            end.toISOString()
          ) as VersionRow[];
          return rows.map(rowToVersion);
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to get versions in time range: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const deleteAllForEntity = (entityId: string) =>
      Effect.try({
        try: () => {
          const result = deleteForEntity.run(entityId);
          return result.changes;
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to delete versions: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    return {
      create,
      getVersion,
      getAllForEntity,
      getLatest,
      getEntityAtVersion,
      countForEntity: countVersionsForEntity,
      getInTimeRange,
      deleteAllForEntity,
    } satisfies VersionRepository;
  })
);
