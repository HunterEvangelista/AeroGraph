import {
  type CreateLinkInput,
  EntityNotFoundError,
  type Link,
  type LinkId,
  LinkNotFoundError,
  type LinkRepository,
  LinkRepositoryTag,
  type LinkType,
  RepositoryError,
  getInverseLinkType,
} from "@kioku/core";
/**
 * SQLite Link Repository Implementation
 */
import { Effect, Layer } from "effect";
import { DatabaseClientTag } from "./client.js";

// ============================================================================
// Helper Functions
// ============================================================================

const generateId = (): string => crypto.randomUUID();

const now = (): string => new Date().toISOString();

interface LinkRow {
  id: string;
  source_id: string;
  target_id: string;
  type: string;
  created_at: string;
}

const rowToLink = (row: LinkRow): Link => ({
  id: row.id as LinkId,
  sourceId: row.source_id,
  targetId: row.target_id,
  type: row.type as LinkType,
  createdAt: new Date(row.created_at),
});

// ============================================================================
// Repository Implementation
// ============================================================================

export const SqliteLinkRepositoryLive = Layer.effect(
  LinkRepositoryTag,
  Effect.gen(function* () {
    const { db } = yield* DatabaseClientTag;

    const insertLink = db.prepare(`
      INSERT INTO links (id, source_id, target_id, type, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const selectById = db.prepare("SELECT * FROM links WHERE id = ?");

    const selectFromSource = db.prepare(`
      SELECT * FROM links WHERE source_id = ? ORDER BY created_at DESC
    `);

    const selectToTarget = db.prepare(`
      SELECT * FROM links WHERE target_id = ? ORDER BY created_at DESC
    `);

    const selectForEntity = db.prepare(`
      SELECT * FROM links WHERE source_id = ? OR target_id = ? ORDER BY created_at DESC
    `);

    const selectByType = db.prepare("SELECT * FROM links WHERE type = ? ORDER BY created_at DESC");

    const selectBetween = db.prepare(`
      SELECT * FROM links WHERE source_id = ? AND target_id = ?
    `);

    const selectBetweenByType = db.prepare(`
      SELECT * FROM links WHERE source_id = ? AND target_id = ? AND type = ?
    `);

    const deleteLink = db.prepare("DELETE FROM links WHERE id = ?");

    const deleteForEntity = db.prepare(`
      DELETE FROM links WHERE source_id = ? OR target_id = ?
    `);

    const deleteBetweenEntities = db.prepare(`
      DELETE FROM links WHERE source_id = ? AND target_id = ?
    `);

    const deleteBetweenEntitiesByType = db.prepare(`
      DELETE FROM links WHERE source_id = ? AND target_id = ? AND type = ?
    `);

    const countLinks = db.prepare("SELECT COUNT(*) as count FROM links");

    const checkEntityExists = db.prepare("SELECT 1 FROM entities WHERE id = ?");

    const verifyEntityExists = (entityId: string) =>
      Effect.gen(function* () {
        const exists = yield* Effect.try({
          try: () => checkEntityExists.get(entityId),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to check entity: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        if (!exists) {
          return yield* Effect.fail(new EntityNotFoundError({ entityId }));
        }
      });

    const create = (input: CreateLinkInput) =>
      Effect.gen(function* () {
        yield* verifyEntityExists(input.sourceId);
        yield* verifyEntityExists(input.targetId);

        return yield* Effect.try({
          try: () => {
            const id = generateId();
            const timestamp = now();
            insertLink.run(id, input.sourceId, input.targetId, input.type, timestamp);
            const row = selectById.get(id) as LinkRow;
            return rowToLink(row);
          },
          catch: (error) =>
            new RepositoryError({
              message: `Failed to create link: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });
      });

    const createBidirectional = (input: CreateLinkInput) =>
      Effect.gen(function* () {
        yield* verifyEntityExists(input.sourceId);
        yield* verifyEntityExists(input.targetId);

        return yield* Effect.try({
          try: () => {
            const timestamp = now();

            // Create forward link
            const forwardId = generateId();
            insertLink.run(forwardId, input.sourceId, input.targetId, input.type, timestamp);

            // Create inverse link
            const inverseId = generateId();
            const inverseType = getInverseLinkType(input.type);
            insertLink.run(inverseId, input.targetId, input.sourceId, inverseType, timestamp);

            const forwardRow = selectById.get(forwardId) as LinkRow;
            const inverseRow = selectById.get(inverseId) as LinkRow;

            return [rowToLink(forwardRow), rowToLink(inverseRow)] as const;
          },
          catch: (error) =>
            new RepositoryError({
              message: `Failed to create bidirectional link: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });
      });

    const getById = (id: LinkId) =>
      Effect.gen(function* () {
        const row = yield* Effect.try({
          try: () => selectById.get(id) as LinkRow | undefined,
          catch: (error) =>
            new RepositoryError({
              message: `Failed to get link: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        if (!row) {
          return yield* Effect.fail(new LinkNotFoundError({ linkId: id }));
        }

        return rowToLink(row);
      });

    const getFromSource = (sourceId: string) =>
      Effect.try({
        try: () => {
          const rows = selectFromSource.all(sourceId) as LinkRow[];
          return rows.map(rowToLink);
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to get links from source: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const getToTarget = (targetId: string) =>
      Effect.try({
        try: () => {
          const rows = selectToTarget.all(targetId) as LinkRow[];
          return rows.map(rowToLink);
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to get links to target: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const getAllForEntity = (entityId: string) =>
      Effect.try({
        try: () => {
          const rows = selectForEntity.all(entityId, entityId) as LinkRow[];
          return rows.map(rowToLink);
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to get links for entity: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const getByType = (type: LinkType) =>
      Effect.try({
        try: () => {
          const rows = selectByType.all(type) as LinkRow[];
          return rows.map(rowToLink);
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to get links by type: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const getLinkBetween = (sourceId: string, targetId: string) =>
      Effect.try({
        try: () => {
          const row = selectBetween.get(sourceId, targetId) as LinkRow | undefined;
          return row ? rowToLink(row) : null;
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to get link between entities: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const deleteById = (id: LinkId) =>
      Effect.gen(function* () {
        yield* getById(id);

        yield* Effect.try({
          try: () => deleteLink.run(id),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to delete link: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });
      });

    const deleteAllForEntity = (entityId: string) =>
      Effect.try({
        try: () => {
          const result = deleteForEntity.run(entityId, entityId);
          return result.changes;
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to delete links for entity: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const deleteBetween = (sourceId: string, targetId: string, type?: LinkType) =>
      Effect.gen(function* () {
        const link = yield* Effect.try({
          try: () => {
            if (type) {
              return selectBetweenByType.get(sourceId, targetId, type) as LinkRow | undefined;
            }

            return selectBetween.get(sourceId, targetId) as LinkRow | undefined;
          },
          catch: (error) =>
            new RepositoryError({
              message: `Failed to get link between entities: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        if (!link) {
          return yield* Effect.fail(new LinkNotFoundError({ linkId: `${sourceId}->${targetId}` }));
        }

        yield* Effect.try({
          try: () => {
            if (type) {
              deleteBetweenEntitiesByType.run(sourceId, targetId, type);
              return;
            }

            deleteBetweenEntities.run(sourceId, targetId);
          },
          catch: (error) =>
            new RepositoryError({
              message: `Failed to delete link between entities: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });
      });

    const count = () =>
      Effect.try({
        try: () => {
          const result = countLinks.get() as { count: number };
          return result.count;
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to count links: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    return {
      create,
      createBidirectional,
      getById,
      getFromSource,
      getToTarget,
      getAllForEntity,
      getByType,
      getLinkBetween,
      delete: deleteById,
      deleteAllForEntity,
      deleteBetween,
      count,
    } satisfies LinkRepository;
  })
);
