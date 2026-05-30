import {
  type CreateTagInput,
  EntityNotFoundError,
  RepositoryError,
  type Tag,
  type TagId,
  TagNotFoundError,
  type TagRepository,
  TagRepositoryTag,
  type UpdateTagInput,
} from "@kioku/core";
/**
 * SQLite Tag Repository Implementation
 */
import { Effect, Layer } from "effect";
import { DatabaseClientTag } from "./client.js";

// ============================================================================
// Helper Functions
// ============================================================================

const now = (): string => new Date().toISOString();

interface TagRow {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  aliases: string | null;
  created_at: string;
}

const rowToTag = (row: TagRow): Tag => ({
  id: row.id as TagId,
  name: row.name,
  description: row.description ?? undefined,
  parentId: row.parent_id ?? undefined,
  aliases: row.aliases ? JSON.parse(row.aliases) : undefined,
  createdAt: new Date(row.created_at),
});

// ============================================================================
// Repository Implementation
// ============================================================================

export const SqliteTagRepositoryLive = Layer.effect(
  TagRepositoryTag,
  Effect.gen(function* () {
    const { db } = yield* DatabaseClientTag;

    const insertTag = db.prepare(`
      INSERT INTO tags (id, name, description, parent_id, aliases, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const selectById = db.prepare("SELECT * FROM tags WHERE id = ?");

    const selectAll = db.prepare("SELECT * FROM tags ORDER BY id");

    const selectChildren = db.prepare("SELECT * FROM tags WHERE parent_id = ? ORDER BY name");

    const updateTag = db.prepare(`
      UPDATE tags SET name = ?, description = ?, parent_id = ?, aliases = ?
      WHERE id = ?
    `);

    const deleteTag = db.prepare("DELETE FROM tags WHERE id = ?");

    const insertEntityTag = db.prepare(`
      INSERT OR IGNORE INTO entity_tags (entity_id, tag_id) VALUES (?, ?)
    `);

    const deleteEntityTag = db.prepare(`
      DELETE FROM entity_tags WHERE entity_id = ? AND tag_id = ?
    `);

    const selectTagsForEntity = db.prepare(`
      SELECT t.* FROM tags t
      JOIN entity_tags et ON t.id = et.tag_id
      WHERE et.entity_id = ?
      ORDER BY t.id
    `);

    const searchTags = db.prepare(`
      SELECT * FROM tags 
      WHERE name LIKE ? OR id LIKE ? OR aliases LIKE ?
      ORDER BY id
      LIMIT 50
    `);

    const countTags = db.prepare("SELECT COUNT(*) as count FROM tags");

    const checkEntityExists = db.prepare("SELECT 1 FROM entities WHERE id = ?");

    const create = (input: CreateTagInput) =>
      Effect.try({
        try: () => {
          const timestamp = now();
          const aliases = input.aliases ? JSON.stringify(input.aliases) : null;
          insertTag.run(
            input.id,
            input.name,
            input.description ?? null,
            input.parentId ?? null,
            aliases,
            timestamp
          );
          const row = selectById.get(input.id) as TagRow;
          return rowToTag(row);
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to create tag: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const getById = (id: TagId) =>
      Effect.gen(function* () {
        const row = yield* Effect.try({
          try: () => selectById.get(id) as TagRow | undefined,
          catch: (error) =>
            new RepositoryError({
              message: `Failed to get tag: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        if (!row) {
          return yield* Effect.fail(new TagNotFoundError({ tagId: id }));
        }

        return rowToTag(row);
      });

    const getAll = () =>
      Effect.try({
        try: () => {
          const rows = selectAll.all() as TagRow[];
          return rows.map(rowToTag);
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to get tags: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const getChildren = (parentId: TagId) =>
      Effect.gen(function* () {
        // Verify parent exists
        yield* getById(parentId);

        return yield* Effect.try({
          try: () => {
            const rows = selectChildren.all(parentId) as TagRow[];
            return rows.map(rowToTag);
          },
          catch: (error) =>
            new RepositoryError({
              message: `Failed to get child tags: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });
      });

    const getAncestors = (id: TagId) =>
      Effect.gen(function* () {
        const ancestors: Tag[] = [];
        let current = yield* getById(id);

        while (current.parentId) {
          const parent = yield* getById(current.parentId as TagId);
          ancestors.push(parent);
          current = parent;
        }

        return ancestors;
      });

    const update = (id: TagId, updates: UpdateTagInput) =>
      Effect.gen(function* () {
        const existing = yield* getById(id);

        yield* Effect.try({
          try: () => {
            const newAliases =
              updates.aliases !== undefined
                ? JSON.stringify(updates.aliases)
                : existing.aliases
                  ? JSON.stringify(existing.aliases)
                  : null;

            updateTag.run(
              updates.name ?? existing.name,
              updates.description ?? existing.description ?? null,
              updates.parentId ?? existing.parentId ?? null,
              newAliases,
              id
            );
          },
          catch: (error) =>
            new RepositoryError({
              message: `Failed to update tag: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        return yield* getById(id);
      });

    const deleteById = (id: TagId) =>
      Effect.gen(function* () {
        yield* getById(id);

        yield* Effect.try({
          try: () => deleteTag.run(id),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to delete tag: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });
      });

    const applyToEntity = (tagId: TagId, entityId: string) =>
      Effect.gen(function* () {
        // Verify both exist
        yield* getById(tagId);

        const entityExists = yield* Effect.try({
          try: () => checkEntityExists.get(entityId),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to check entity: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        if (!entityExists) {
          return yield* Effect.fail(new EntityNotFoundError({ entityId }));
        }

        yield* Effect.try({
          try: () => insertEntityTag.run(entityId, tagId),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to apply tag: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });
      });

    const removeFromEntity = (tagId: TagId, entityId: string) =>
      Effect.gen(function* () {
        yield* getById(tagId);

        const entityExists = yield* Effect.try({
          try: () => checkEntityExists.get(entityId),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to check entity: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        if (!entityExists) {
          return yield* Effect.fail(new EntityNotFoundError({ entityId }));
        }

        yield* Effect.try({
          try: () => deleteEntityTag.run(entityId, tagId),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to remove tag: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });
      });

    const getTagsForEntity = (entityId: string) =>
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
          return yield* Effect.fail(new EntityNotFoundError({ entityId }));
        }

        return yield* Effect.try({
          try: () => {
            const rows = selectTagsForEntity.all(entityId) as TagRow[];
            return rows.map(rowToTag);
          },
          catch: (error) =>
            new RepositoryError({
              message: `Failed to get tags for entity: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });
      });

    const search = (query: string) =>
      Effect.try({
        try: () => {
          const pattern = `%${query}%`;
          const rows = searchTags.all(pattern, pattern, pattern) as TagRow[];
          return rows.map(rowToTag);
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to search tags: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const count = () =>
      Effect.try({
        try: () => {
          const result = countTags.get() as { count: number };
          return result.count;
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to count tags: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    return {
      create,
      getById,
      getAll,
      getChildren,
      getAncestors,
      update,
      delete: deleteById,
      applyToEntity,
      removeFromEntity,
      getTagsForEntity,
      search,
      count,
    } satisfies TagRepository;
  })
);
