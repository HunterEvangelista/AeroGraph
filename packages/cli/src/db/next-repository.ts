import {
  type CreateNextCommandInput,
  EntityNotFoundError,
  type NextCommand,
  NextCommandSchema,
  type NextRepository,
  NextRepositoryTag,
  RepositoryError,
} from "@kioku/core";
import { asc, eq } from "drizzle-orm";
import { Effect, Layer, Schema } from "effect";
import { entities, nextCommands } from "./schema";
import { DatabaseSessionTag, RootDatabaseSessionLive } from "./session";

// ============================================================================
// Helpers
// ============================================================================

type NextCommandRow = typeof nextCommands.$inferSelect;

const now = (): string => new Date().toISOString();

const decodeRow = (row: NextCommandRow): Effect.Effect<NextCommand, RepositoryError> =>
  Schema.decodeUnknownEffect(NextCommandSchema)(row).pipe(
    Effect.mapError(
      (error) =>
        new RepositoryError({
          message: `Failed to decode next command row: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        })
    )
  );

// ============================================================================
// Repository Implementation
// ============================================================================

export const SqliteNextRepositorySessionLive = Layer.effect(
  NextRepositoryTag,
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

    const create = (input: CreateNextCommandInput) =>
      Effect.gen(function* () {
        yield* verifyEntityExists(input.entityId);

        const row = yield* Effect.try({
          try: () =>
            write(() =>
              drizzle
                .insert(nextCommands)
                .values({
                  entityId: input.entityId,
                  prefix: input.prefix,
                  commandType: input.commandType,
                  createdAt: now(),
                })
                .returning()
                .get()
            ),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to create next command: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        if (!row) {
          return yield* new RepositoryError({ message: "Inserted next command not found" });
        }

        return yield* decodeRow(row);
      });

    const list = (entityId?: string) =>
      Effect.gen(function* () {
        const rows = yield* Effect.try({
          try: () =>
            entityId
              ? drizzle
                  .select()
                  .from(nextCommands)
                  .where(eq(nextCommands.entityId, entityId))
                  .orderBy(asc(nextCommands.id))
                  .all()
              : drizzle.select().from(nextCommands).orderBy(asc(nextCommands.id)).all(),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to list next commands: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        return yield* Effect.forEach(rows, decodeRow);
      });

    const clear = (entityId?: string) =>
      Effect.try({
        try: () =>
          write(() => {
            const existing = entityId
              ? drizzle
                  .select({ id: nextCommands.id })
                  .from(nextCommands)
                  .where(eq(nextCommands.entityId, entityId))
                  .all()
              : drizzle.select({ id: nextCommands.id }).from(nextCommands).all();

            if (entityId) {
              drizzle.delete(nextCommands).where(eq(nextCommands.entityId, entityId)).run();
            } else {
              drizzle.delete(nextCommands).run();
            }

            return existing.length;
          }),
        catch: (error) =>
          new RepositoryError({
            message: `Failed to clear next commands: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const replaceAll = (commands: ReadonlyArray<CreateNextCommandInput>) =>
      Effect.gen(function* () {
        for (const cmd of commands) {
          yield* verifyEntityExists(cmd.entityId);
        }

        if (commands.length === 0) {
          yield* clear();
          return [];
        }

        const rows = yield* Effect.try({
          try: () =>
            transaction((tx) => {
              tx.delete(nextCommands).run();
              const timestamp = now();
              return tx
                .insert(nextCommands)
                .values(
                  commands.map((cmd) => ({
                    entityId: cmd.entityId,
                    prefix: cmd.prefix,
                    commandType: cmd.commandType,
                    createdAt: timestamp,
                  }))
                )
                .returning()
                .all();
            }),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to replace next commands: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        return yield* Effect.forEach(rows, decodeRow);
      });

    return {
      create,
      list,
      clear,
      replaceAll,
    } satisfies NextRepository;
  })
);

export const SqliteNextRepositoryLive = SqliteNextRepositorySessionLive.pipe(
  Layer.provide(RootDatabaseSessionLive)
);
