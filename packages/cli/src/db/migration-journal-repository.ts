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
import { desc, eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { migrationJournal } from "./schema.js";
import { DatabaseSessionTag, RootDatabaseSessionLive } from "./session.js";

const now = (): string => new Date().toISOString();

type MigrationJournalRow = typeof migrationJournal.$inferSelect;

const rowToJournalEntry = (row: MigrationJournalRow): MigrationJournalEntry => ({
  id: row.id as JournalEntryId,
  operation: row.operation,
  kind: row.kind ?? undefined,
  fromName: row.fromName,
  toName: row.toName,
  termId: row.termId as TermId,
  affectedEntityIds: JSON.parse(row.affectedEntityIds),
  affectedCount: row.affectedCount,
  reason: row.reason ?? undefined,
  appliedAt: new Date(row.appliedAt),
  appliedBy: row.appliedBy ?? undefined,
  dryRun: row.dryRun,
});

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
                toName: input.toName,
                termId: input.termId,
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
          return rowToJournalEntry(row);
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

        return rowToJournalEntry(row);
      });

    const listByTerm = (termId: TermId) =>
      Effect.try({
        try: () => {
          const rows = drizzle
            .select()
            .from(migrationJournal)
            .where(eq(migrationJournal.termId, termId))
            .orderBy(desc(migrationJournal.appliedAt))
            .all();
          return rows.map(rowToJournalEntry);
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
            .orderBy(desc(migrationJournal.appliedAt))
            .limit(Math.max(1, limit))
            .all();
          return rows.map(rowToJournalEntry);
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
