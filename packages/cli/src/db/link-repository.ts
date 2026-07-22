import {
  type CreateLinkInput,
  EntityNotFoundError,
  getInverseLinkType,
  type Link,
  type LinkId,
  LinkNotFoundError,
  type LinkRepository,
  LinkRepositoryTag,
  type LinkType,
  RepositoryError,
} from "@kioku/core";
import { and, desc, count as drizzleCount, eq, or } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { entities, links } from "./schema";
import { DatabaseSessionTag, RootDatabaseSessionLive } from "./session";

// ============================================================================
// Helper Functions
// ============================================================================

const generateId = (): string => crypto.randomUUID();

const now = (): string => new Date().toISOString();

interface LinkRow {
  id: string;
  sourceId: string;
  targetId: string;
  type: LinkType;
  createdAt: string;
}

const rowToLink = (row: LinkRow): Link => ({
  id: row.id as LinkId,
  sourceId: row.sourceId,
  targetId: row.targetId,
  type: row.type,
  createdAt: new Date(row.createdAt),
});

// ============================================================================
// Repository Implementation
// ============================================================================

export const SqliteLinkRepositorySessionLive = Layer.effect(
  LinkRepositoryTag,
  Effect.gen(function* () {
    const { drizzle, transaction, write } = yield* DatabaseSessionTag;

    const verifyEntityExists = (entityId: string) =>
      Effect.gen(function* () {
        const exists = yield* Effect.try({
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

        if (!exists) {
          return yield* new EntityNotFoundError({ entityId });
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
            write(() =>
              drizzle
                .insert(links)
                .values({
                  id,
                  sourceId: input.sourceId,
                  targetId: input.targetId,
                  type: input.type,
                  createdAt: timestamp,
                })
                .run()
            );
            const row = drizzle.select().from(links).where(eq(links.id, id)).get();
            if (!row) throw new Error(`Inserted link not found: ${id}`);
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
            const createPair = transaction((tx) => {
              const timestamp = now();

              const forwardId = generateId();
              const inverseId = generateId();
              const inverseType = getInverseLinkType(input.type);

              tx.insert(links)
                .values([
                  {
                    id: forwardId,
                    sourceId: input.sourceId,
                    targetId: input.targetId,
                    type: input.type,
                    createdAt: timestamp,
                  },
                  {
                    id: inverseId,
                    sourceId: input.targetId,
                    targetId: input.sourceId,
                    type: inverseType,
                    createdAt: timestamp,
                  },
                ])
                .run();

              const forwardRow = tx.select().from(links).where(eq(links.id, forwardId)).get();
              const inverseRow = tx.select().from(links).where(eq(links.id, inverseId)).get();
              if (!forwardRow || !inverseRow) throw new Error("Inserted link pair not found");

              return [forwardRow, inverseRow] as const;
            });

            const [forwardRow, inverseRow] = createPair;
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
          try: () => drizzle.select().from(links).where(eq(links.id, id)).get(),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to get link: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        if (!row) {
          return yield* new LinkNotFoundError({ linkId: id });
        }

        return rowToLink(row);
      });

    const getFromSource = (sourceId: string) =>
      Effect.try({
        try: () => {
          const rows = drizzle
            .select()
            .from(links)
            .where(eq(links.sourceId, sourceId))
            .orderBy(desc(links.createdAt))
            .all();
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
          const rows = drizzle
            .select()
            .from(links)
            .where(eq(links.targetId, targetId))
            .orderBy(desc(links.createdAt))
            .all();
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
          const rows = drizzle
            .select()
            .from(links)
            .where(or(eq(links.sourceId, entityId), eq(links.targetId, entityId)))
            .orderBy(desc(links.createdAt))
            .all();
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
          const rows = drizzle
            .select()
            .from(links)
            .where(eq(links.type, type))
            .orderBy(desc(links.createdAt))
            .all();
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
          const row = drizzle
            .select()
            .from(links)
            .where(and(eq(links.sourceId, sourceId), eq(links.targetId, targetId)))
            .get();
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
          try: () => write(() => drizzle.delete(links).where(eq(links.id, id)).run()),
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
          const existing = drizzle
            .select({ id: links.id })
            .from(links)
            .where(or(eq(links.sourceId, entityId), eq(links.targetId, entityId)))
            .all();

          write(() =>
            drizzle
              .delete(links)
              .where(or(eq(links.sourceId, entityId), eq(links.targetId, entityId)))
              .run()
          );
          return existing.length;
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
              return drizzle
                .select()
                .from(links)
                .where(
                  and(
                    eq(links.sourceId, sourceId),
                    eq(links.targetId, targetId),
                    eq(links.type, type)
                  )
                )
                .get();
            }

            return drizzle
              .select()
              .from(links)
              .where(and(eq(links.sourceId, sourceId), eq(links.targetId, targetId)))
              .get();
          },
          catch: (error) =>
            new RepositoryError({
              message: `Failed to get link between entities: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        if (!link) {
          return yield* new LinkNotFoundError({ linkId: `${sourceId}->${targetId}` });
        }

        yield* Effect.try({
          try: () => {
            if (type) {
              write(() =>
                drizzle
                  .delete(links)
                  .where(
                    and(
                      eq(links.sourceId, sourceId),
                      eq(links.targetId, targetId),
                      eq(links.type, type)
                    )
                  )
                  .run()
              );
              return;
            }

            write(() =>
              drizzle
                .delete(links)
                .where(and(eq(links.sourceId, sourceId), eq(links.targetId, targetId)))
                .run()
            );
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
          const result = drizzle.select({ count: drizzleCount() }).from(links).get();
          return result?.count ?? 0;
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

export const SqliteLinkRepositoryLive = SqliteLinkRepositorySessionLive.pipe(
  Layer.provide(RootDatabaseSessionLive)
);
