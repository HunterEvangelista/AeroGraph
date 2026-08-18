import {
  type JournalEntryId,
  type MigrationJournalEntry,
  MigrationJournalEntryNotFoundError,
  type MigrationJournalRepository,
  MigrationJournalRepositoryTag,
  type RecordJournalEntryInput,
  RepositoryError,
  type TermId,
} from "@kioku/core";
import { desc, eq, or } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { migrationJournal } from "./schema.js";
import { DatabaseSessionTag, RootDatabaseSessionLive } from "./session.js";

const now = (): string => new Date().toISOString();

type MigrationJournalRow = typeof migrationJournal.$inferSelect;

const rowToJournalEntry = (row: MigrationJournalRow, context: string): MigrationJournalEntry => {
  let decoded: unknown;
  try {
    decoded = JSON.parse(row.affectedEntityIds) as unknown;
  } catch (error) {
    throw new Error(
      `Journal '${row.id}' ${context} has malformed affected_entity_ids JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!Array.isArray(decoded) || decoded.some((value) => typeof value !== "string")) {
    throw new Error(
      `Journal '${row.id}' ${context} has invalid affected_entity_ids; expected string[].`
    );
  }
  if (!Number.isInteger(row.affectedCount) || row.affectedCount < 0) {
    throw new Error(`Journal '${row.id}' ${context} has an invalid affected_count.`);
  }
  if (row.affectedCount !== decoded.length) {
    throw new Error(
      `Journal '${row.id}' ${context} has affected_count ${row.affectedCount}, expected ${decoded.length}.`
    );
  }
  const appliedAt = new Date(row.appliedAt);
  if (Number.isNaN(appliedAt.getTime())) {
    throw new Error(`Journal '${row.id}' ${context} has an invalid applied_at date.`);
  }

  return {
    id: row.id as JournalEntryId,
    operation: row.operation,
    kind: row.kind ?? undefined,
    fromName: row.fromName,
    ...(row.toName === null ? {} : { toName: row.toName }),
    termId: row.termId as TermId,
    ...(row.relatedTermId === null ? {} : { relatedTermId: row.relatedTermId as TermId }),
    affectedEntityIds: decoded,
    affectedCount: row.affectedCount,
    reason: row.reason ?? undefined,
    appliedAt,
    appliedBy: row.appliedBy ?? undefined,
    dryRun: row.dryRun,
  };
};

export const SqliteMigrationJournalRepositorySessionLive = Layer.effect(
  MigrationJournalRepositoryTag,
  Effect.gen(function* () {
    const { drizzle, write } = yield* DatabaseSessionTag;

    const record = (input: RecordJournalEntryInput) =>
      Effect.try({
        try: () => {
          const timestamp = now();
          write(() =>
            drizzle
              .insert(migrationJournal)
              .values({
                id: input.id,
                operation: input.operation,
                kind: input.kind ?? null,
                fromName: input.fromName,
                toName: input.toName ?? null,
                termId: input.termId,
                relatedTermId: input.relatedTermId ?? null,
                affectedEntityIds: JSON.stringify(input.affectedEntityIds),
                affectedCount: input.affectedEntityIds.length,
                reason: input.reason ?? null,
                appliedAt: timestamp,
                appliedBy: input.appliedBy ?? null,
                dryRun: input.dryRun,
              })
              .run()
          );

          const row = drizzle
            .select()
            .from(migrationJournal)
            .where(eq(migrationJournal.id, input.id))
            .get();
          if (!row) throw new Error(`Inserted migration journal entry not found: ${input.id}`);
          return rowToJournalEntry(row, `record(${input.id})`);
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to record migration journal entry: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const getById = (id: JournalEntryId) =>
      Effect.gen(function* () {
        const row = yield* Effect.try({
          try: () =>
            drizzle.select().from(migrationJournal).where(eq(migrationJournal.id, id)).get(),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to get migration journal entry: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        if (!row) {
          return yield* new MigrationJournalEntryNotFoundError({ id });
        }

        return yield* Effect.try({
          try: () => rowToJournalEntry(row, `getById(${id})`),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to decode migration journal entry '${id}': ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });
      });

    const listByTerm = (termId: TermId) =>
      Effect.try({
        try: () => {
          const rows = drizzle
            .select()
            .from(migrationJournal)
            .where(
              or(eq(migrationJournal.termId, termId), eq(migrationJournal.relatedTermId, termId))
            )
            .orderBy(desc(migrationJournal.appliedAt), desc(migrationJournal.id))
            .all();
          return rows.map((row) => rowToJournalEntry(row, `listByTerm(${termId})`));
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to list migration journal entries by term: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const listRecent = (limit = 50) =>
      Effect.try({
        try: () => {
          const rows = drizzle
            .select()
            .from(migrationJournal)
            .orderBy(desc(migrationJournal.appliedAt), desc(migrationJournal.id))
            .limit(Math.max(1, limit))
            .all();
          return rows.map((row) => rowToJournalEntry(row, "listRecent"));
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to list recent migration journal entries: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    return {
      record,
      getById,
      listByTerm,
      listRecent,
    } satisfies MigrationJournalRepository;
  })
);

export const SqliteMigrationJournalRepositoryLive =
  SqliteMigrationJournalRepositorySessionLive.pipe(Layer.provide(RootDatabaseSessionLive));
