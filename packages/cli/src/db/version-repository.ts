import {
  type ChangeType,
  type Entity,
  EntityNotFoundError,
  EntitySchema,
  type EntityVersion,
  EntityVersion as EntityVersionSchema,
  RepositoryError,
  type TypedEntityVersion,
  VersionNotFoundError,
  type VersionRepository,
  VersionRepositoryTag,
} from "@aerograph/core";
import { and, desc, count as drizzleCount, eq, gte, lte } from "drizzle-orm";
/**
 * SQLite Version Repository Implementation
 */
import { Effect, Layer, Schema } from "effect";
import { entities, entityVersions } from "./schema";
import { DatabaseSessionTag, RootDatabaseSessionLive } from "./session";

// ============================================================================
// Helper Functions
// ============================================================================

const generateId = (): string => crypto.randomUUID();

const now = (): string => new Date().toISOString();

const rowToVersion = (row: typeof entityVersions.$inferSelect): EntityVersion => {
  const decoded = {
    id: row.id,
    entityId: row.entityId,
    version: row.version,
    data: JSON.parse(row.data),
    changeType: row.changeType,
    createdAt: row.createdAt,
  };
  if (row.changedFields !== null) {
    Object.assign(decoded, { changedFields: JSON.parse(row.changedFields) });
  }
  return Schema.decodeUnknownSync(EntityVersionSchema)(decoded);
};

const entitySnapshot = (version: EntityVersion): TypedEntityVersion => {
  const snapshot: TypedEntityVersion = {
    id: version.id,
    entityId: version.entityId,
    version: version.version,
    data: Schema.decodeUnknownSync(EntitySchema)(version.data),
    changeType: version.changeType,
    createdAt: version.createdAt,
  };
  if (version.changedFields !== undefined) {
    Object.assign(snapshot, { changedFields: version.changedFields });
  }
  if (version.authorId !== undefined) {
    Object.assign(snapshot, { authorId: version.authorId });
  }
  return snapshot;
};

// ============================================================================
// Repository Implementation
// ============================================================================

export const SqliteVersionRepositorySessionLive = Layer.effect(
  VersionRepositoryTag,
  Effect.gen(function* () {
    const { drizzle, write } = yield* DatabaseSessionTag;

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
          write(() =>
            drizzle
              .insert(entityVersions)
              .values({
                id,
                entityId,
                version,
                data: JSON.stringify(data),
                changeType,
                changedFields: changedFields ? JSON.stringify(changedFields) : null,
                createdAt: timestamp,
              })
              .run()
          );

          const row = drizzle
            .select()
            .from(entityVersions)
            .where(and(eq(entityVersions.entityId, entityId), eq(entityVersions.version, version)))
            .get();
          if (!row) throw new Error(`Inserted version not found: ${entityId}@${version}`);
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
          try: () =>
            drizzle
              .select()
              .from(entityVersions)
              .where(
                and(eq(entityVersions.entityId, entityId), eq(entityVersions.version, version))
              )
              .get(),
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
          try: () =>
            drizzle
              .select({ id: entities.id })
              .from(entities)
              .where(eq(entities.id, entityId))
              .get(),
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
            const rows = drizzle
              .select()
              .from(entityVersions)
              .where(eq(entityVersions.entityId, entityId))
              .orderBy(desc(entityVersions.version))
              .all();
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
          try: () =>
            drizzle
              .select()
              .from(entityVersions)
              .where(eq(entityVersions.entityId, entityId))
              .orderBy(desc(entityVersions.version))
              .limit(1)
              .get(),
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

    const getEntityAtVersion = (entityId: string, version: number) =>
      Effect.map(getVersion(entityId, version), entitySnapshot);

    const countVersionsForEntity = (entityId: string) =>
      Effect.gen(function* () {
        const entityExists = yield* Effect.try({
          try: () =>
            drizzle
              .select({ id: entities.id })
              .from(entities)
              .where(eq(entities.id, entityId))
              .get(),
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
            const result = drizzle
              .select({ count: drizzleCount() })
              .from(entityVersions)
              .where(eq(entityVersions.entityId, entityId))
              .get();
            return result?.count ?? 0;
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
          const rows = drizzle
            .select()
            .from(entityVersions)
            .where(
              and(
                gte(entityVersions.createdAt, start.toISOString()),
                lte(entityVersions.createdAt, end.toISOString())
              )
            )
            .orderBy(desc(entityVersions.createdAt))
            .all();
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
          const existing = drizzle
            .select({ id: entityVersions.id })
            .from(entityVersions)
            .where(eq(entityVersions.entityId, entityId))
            .all();

          write(() =>
            drizzle.delete(entityVersions).where(eq(entityVersions.entityId, entityId)).run()
          );
          return existing.length;
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

export const SqliteVersionRepositoryLive = SqliteVersionRepositorySessionLive.pipe(
  Layer.provide(RootDatabaseSessionLive)
);
