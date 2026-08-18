import { RepositoryError } from "@kioku/core";
import { and, eq, inArray, like } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { Context, Effect, Layer } from "effect";
import { DatabaseClientTag } from "./client";

export {
  calculateEntityIdPrefixes,
  DEFAULT_ENTITY_ID_PREFIX_SCOPE,
  formatEntityIdWithBoldPrefix,
} from "./entity-prefix-format";

import { calculateEntityIdPrefixes, DEFAULT_ENTITY_ID_PREFIX_SCOPE } from "./entity-prefix-format";
import type * as schema from "./schema";
import { entities, entityIdPrefixes } from "./schema";
import type { DatabaseSession } from "./session";
import { withSqliteWriteRetry } from "./sqlite-retry";

export interface EntityPrefixMatch {
  readonly id: string;
  readonly title: string;
  readonly type: "doc" | "code_ref" | "story" | "diagram";
}

export interface EntityPrefixIndex {
  readonly rebuild: (scope?: string) => Effect.Effect<void, RepositoryError>;
  readonly resolvePrefix: (
    prefix: string,
    scope?: string
  ) => Effect.Effect<string | null, RepositoryError>;
  readonly findMatchesByPrefix: (
    prefix: string
  ) => Effect.Effect<ReadonlyArray<EntityPrefixMatch>, RepositoryError>;
  readonly getDisplayPrefix: (
    entityId: string,
    scope?: string
  ) => Effect.Effect<string | null, RepositoryError>;
  readonly getDisplayPrefixes: (
    entityIds: ReadonlyArray<string>,
    scope?: string
  ) => Effect.Effect<ReadonlyMap<string, string>, RepositoryError>;
}

export class EntityPrefixIndexTag extends Context.Service<
  EntityPrefixIndexTag,
  EntityPrefixIndex
>()("EntityPrefixIndex") {}

export const rebuildEntityIdPrefixes = (
  db: BunSQLiteDatabase<typeof schema>,
  scope = DEFAULT_ENTITY_ID_PREFIX_SCOPE,
  runTransaction?: DatabaseSession["transaction"]
): void => {
  const rows = db.select({ id: entities.id }).from(entities).orderBy(entities.id).all();
  const prefixRows = calculateEntityIdPrefixes(
    rows.map((row) => row.id),
    scope
  );

  const transaction =
    runTransaction ?? ((operation) => withSqliteWriteRetry(() => db.transaction(operation)));

  transaction((tx) => {
    tx.delete(entityIdPrefixes).where(eq(entityIdPrefixes.scope, scope)).run();
    if (prefixRows.length > 0) {
      tx.insert(entityIdPrefixes)
        .values([...prefixRows])
        .run();
    }
  });
};

export const EntityPrefixIndexLive = Layer.effect(
  EntityPrefixIndexTag,
  Effect.gen(function* () {
    const { drizzle } = yield* DatabaseClientTag;

    const rebuild = (scope = DEFAULT_ENTITY_ID_PREFIX_SCOPE) =>
      Effect.try({
        try: () => rebuildEntityIdPrefixes(drizzle, scope),
        catch: (error) =>
          new RepositoryError({
            message: `Failed to rebuild entity id prefixes: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const resolvePrefix = (prefix: string, scope = DEFAULT_ENTITY_ID_PREFIX_SCOPE) =>
      Effect.try({
        try: () => {
          const row = drizzle
            .select({ entityId: entityIdPrefixes.entityId })
            .from(entityIdPrefixes)
            .where(and(eq(entityIdPrefixes.scope, scope), eq(entityIdPrefixes.prefix, prefix)))
            .get();
          return row?.entityId ?? null;
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to resolve entity id prefix: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const findMatchesByPrefix = (prefix: string) =>
      Effect.try({
        try: () =>
          drizzle
            .select({ id: entities.id, title: entities.title, type: entities.type })
            .from(entities)
            .where(like(entities.id, `${prefix}%`))
            .orderBy(entities.id)
            .all() satisfies EntityPrefixMatch[],
        catch: (error) =>
          new RepositoryError({
            message: `Failed to find entity id prefix matches: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const getDisplayPrefix = (entityId: string, scope = DEFAULT_ENTITY_ID_PREFIX_SCOPE) =>
      Effect.try({
        try: () => {
          const row = drizzle
            .select({ prefix: entityIdPrefixes.prefix })
            .from(entityIdPrefixes)
            .where(and(eq(entityIdPrefixes.scope, scope), eq(entityIdPrefixes.entityId, entityId)))
            .get();
          return row?.prefix ?? null;
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to load entity id display prefix: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const getDisplayPrefixes = (
      entityIds: ReadonlyArray<string>,
      scope = DEFAULT_ENTITY_ID_PREFIX_SCOPE
    ) =>
      Effect.try({
        try: () => {
          if (entityIds.length === 0) return new Map<string, string>();
          const rows = drizzle
            .select({ entityId: entityIdPrefixes.entityId, prefix: entityIdPrefixes.prefix })
            .from(entityIdPrefixes)
            .where(
              and(
                eq(entityIdPrefixes.scope, scope),
                inArray(entityIdPrefixes.entityId, [...entityIds])
              )
            )
            .all();
          return new Map(rows.map((row) => [row.entityId, row.prefix]));
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to load entity id display prefixes: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    return {
      rebuild,
      resolvePrefix,
      findMatchesByPrefix,
      getDisplayPrefix,
      getDisplayPrefixes,
    } satisfies EntityPrefixIndex;
  })
);
