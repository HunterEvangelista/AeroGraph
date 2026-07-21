import {
  type CreateTagInput,
  EntityNotFoundError,
  RepositoryError,
  type Tag,
  type TagId,
  TagNotFoundError,
  type TagRepository,
  TagRepositoryTag,
  type TermId,
  type UpdateTagInput,
} from "@kioku/core";
import { and, count as drizzleCount, eq, like, or } from "drizzle-orm";
/**
 * SQLite Tag Repository Implementation
 */
import { Effect, Layer } from "effect";
import { entities, entityTags, tags } from "./schema.js";
import { DatabaseSessionTag } from "./session.js";

// ============================================================================
// Helper Functions
// ============================================================================

const now = (): string => new Date().toISOString();

interface TagRow {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  aliases: string | null;
  termId: string | null;
  createdAt: string;
}

const rowToTag = (row: TagRow): Tag => ({
  id: row.id as TagId,
  name: row.name,
  description: row.description ?? undefined,
  parentId: row.parentId ?? undefined,
  aliases: row.aliases ? JSON.parse(row.aliases) : undefined,
  termId: (row.termId ?? undefined) as TermId | undefined,
  createdAt: new Date(row.createdAt),
});

// ============================================================================
// Repository Implementation
// ============================================================================

export const SqliteTagRepositoryLive = Layer.effect(
  TagRepositoryTag,
  Effect.gen(function* () {
    const { drizzle, write } = yield* DatabaseSessionTag;

    const create = (input: CreateTagInput) =>
      Effect.try({
        try: () => {
          const timestamp = now();
          const aliases = input.aliases ? JSON.stringify(input.aliases) : null;
          write(() =>
            drizzle
              .insert(tags)
              .values({
                id: input.id,
                name: input.name,
                description: input.description ?? null,
                parentId: input.parentId ?? null,
                aliases,
                termId: input.termId ?? null,
                createdAt: timestamp,
              })
              .run()
          );
          const row = drizzle.select().from(tags).where(eq(tags.id, input.id)).get();
          if (!row) throw new Error(`Inserted tag not found: ${input.id}`);
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
          try: () => drizzle.select().from(tags).where(eq(tags.id, id)).get(),
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
          const rows = drizzle.select().from(tags).orderBy(tags.id).all();
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
            const rows = drizzle
              .select()
              .from(tags)
              .where(eq(tags.parentId, parentId))
              .orderBy(tags.name)
              .all();
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

            write(() =>
              drizzle
                .update(tags)
                .set({
                  name: updates.name ?? existing.name,
                  description: updates.description ?? existing.description ?? null,
                  parentId: updates.parentId ?? existing.parentId ?? null,
                  aliases: newAliases,
                  termId:
                    updates.termId !== undefined
                      ? (updates.termId ?? null)
                      : (existing.termId ?? null),
                })
                .where(eq(tags.id, id))
                .run()
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
          try: () => write(() => drizzle.delete(tags).where(eq(tags.id, id)).run()),
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
          return yield* Effect.fail(new EntityNotFoundError({ entityId }));
        }

        yield* Effect.try({
          try: () =>
            write(() =>
              drizzle.insert(entityTags).values({ entityId, tagId }).onConflictDoNothing().run()
            ),
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
          return yield* Effect.fail(new EntityNotFoundError({ entityId }));
        }

        yield* Effect.try({
          try: () =>
            write(() =>
              drizzle
                .delete(entityTags)
                .where(and(eq(entityTags.entityId, entityId), eq(entityTags.tagId, tagId)))
                .run()
            ),
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
          return yield* Effect.fail(new EntityNotFoundError({ entityId }));
        }

        return yield* Effect.try({
          try: () => {
            const rows = drizzle
              .select({
                id: tags.id,
                name: tags.name,
                description: tags.description,
                parentId: tags.parentId,
                aliases: tags.aliases,
                termId: tags.termId,
                createdAt: tags.createdAt,
              })
              .from(tags)
              .innerJoin(entityTags, eq(tags.id, entityTags.tagId))
              .where(eq(entityTags.entityId, entityId))
              .orderBy(tags.id)
              .all();
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
          const rows = drizzle
            .select()
            .from(tags)
            .where(
              or(like(tags.name, pattern), like(tags.id, pattern), like(tags.aliases, pattern))
            )
            .orderBy(tags.id)
            .limit(50)
            .all();
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
          const result = drizzle.select({ count: drizzleCount() }).from(tags).get();
          return result?.count ?? 0;
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
