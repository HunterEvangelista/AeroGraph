import {
  type CreateTermInput,
  type CreateTermNameInput,
  normalizeTermName,
  RepositoryError,
  type ResolvedTermName,
  type Term,
  type TermId,
  type TermKind,
  type TermName,
  TermNotFoundError,
  type TermRepository,
  TermRepositoryTag,
  type UpdateTermInput,
  ValidationError,
} from "@kioku/core";
import { and, eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { DatabaseClientTag } from "./client.js";
import { termNames, terms } from "./schema.js";
import { withSqliteWriteRetry } from "./sqlite-retry.js";

const now = (): string => new Date().toISOString();

type TermRow = typeof terms.$inferSelect;
type TermNameRow = typeof termNames.$inferSelect;

const termNameKindOrder = { canonical: 0, alias: 1, deprecated: 2 } as const;

const rowToTerm = (row: TermRow): Term => ({
  id: row.id as TermId,
  canonicalName: row.canonicalName,
  kind: row.kind,
  description: row.description ?? undefined,
  status: row.status,
  mergedIntoId: (row.mergedIntoId ?? undefined) as TermId | undefined,
  createdAt: new Date(row.createdAt),
  updatedAt: new Date(row.updatedAt),
});

const rowToTermName = (row: TermNameRow): TermName => ({
  termId: row.termId as TermId,
  kind: row.kind,
  name: row.name,
  displayName: row.displayName,
  nameKind: row.nameKind,
  createdAt: new Date(row.createdAt),
});

const toUniqueNames = (canonicalName: string, aliases: ReadonlyArray<string> | undefined) => {
  const seen = new Set<string>();
  const names: ReadonlyArray<{
    displayName: string;
    name: string;
    nameKind: "canonical" | "alias";
  }> = [
    {
      displayName: canonicalName,
      name: normalizeTermName(canonicalName),
      nameKind: "canonical" as const,
    },
    ...(aliases ?? []).map((alias) => ({
      displayName: alias,
      name: normalizeTermName(alias),
      nameKind: "alias" as const,
    })),
  ].filter(({ name }) => {
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });

  return names;
};

export const SqliteTermRepositoryLive = Layer.effect(
  TermRepositoryTag,
  Effect.gen(function* () {
    const { drizzle } = yield* DatabaseClientTag;

    const getById = (id: TermId) =>
      Effect.gen(function* () {
        const row = yield* Effect.try({
          try: () => drizzle.select().from(terms).where(eq(terms.id, id)).get(),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to get term: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        if (!row) {
          return yield* new TermNotFoundError({ name: id });
        }

        return rowToTerm(row);
      });

    const create = (input: CreateTermInput) =>
      Effect.try({
        try: () => {
          const timestamp = now();
          withSqliteWriteRetry(() =>
            drizzle.transaction((tx) => {
              tx.insert(terms)
                .values({
                  id: input.id,
                  canonicalName: input.canonicalName,
                  kind: input.kind,
                  description: input.description ?? null,
                  status: "active",
                  mergedIntoId: null,
                  createdAt: timestamp,
                  updatedAt: timestamp,
                })
                .run();

              const names = toUniqueNames(input.canonicalName, input.aliases);
              if (names.length > 0) {
                tx.insert(termNames)
                  .values(
                    names.map((name) => ({
                      termId: input.id,
                      kind: input.kind,
                      name: name.name,
                      displayName: name.displayName,
                      nameKind: name.nameKind,
                      createdAt: timestamp,
                    }))
                  )
                  .run();
              }
            })
          );

          const row = drizzle.select().from(terms).where(eq(terms.id, input.id)).get();
          if (!row) throw new Error(`Inserted term not found: ${input.id}`);
          return rowToTerm(row);
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to create term: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const getByCanonicalName = (kind: TermKind, canonicalName: string) =>
      Effect.gen(function* () {
        const row = yield* Effect.try({
          try: () =>
            drizzle
              .select()
              .from(terms)
              .where(and(eq(terms.kind, kind), eq(terms.canonicalName, canonicalName)))
              .get(),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to get term by canonical name: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        if (!row) {
          return yield* new TermNotFoundError({ name: canonicalName });
        }

        return rowToTerm(row);
      });

    const findByName = (name: string, kind?: TermKind) =>
      Effect.try({
        try: () => {
          const normalizedName = normalizeTermName(name);
          const where = kind
            ? and(eq(termNames.name, normalizedName), eq(termNames.kind, kind))
            : eq(termNames.name, normalizedName);

          const rows = drizzle
            .select({
              termId: terms.id,
              canonicalName: terms.canonicalName,
              termKind: terms.kind,
              description: terms.description,
              status: terms.status,
              mergedIntoId: terms.mergedIntoId,
              termCreatedAt: terms.createdAt,
              updatedAt: terms.updatedAt,
              nameTermId: termNames.termId,
              nameKindScope: termNames.kind,
              lookupName: termNames.name,
              displayName: termNames.displayName,
              nameKind: termNames.nameKind,
              nameCreatedAt: termNames.createdAt,
            })
            .from(termNames)
            .innerJoin(terms, eq(termNames.termId, terms.id))
            .where(where)
            .orderBy(termNames.kind, terms.canonicalName)
            .all();

          return rows.map(
            (row): ResolvedTermName => ({
              term: rowToTerm({
                id: row.termId,
                canonicalName: row.canonicalName,
                kind: row.termKind,
                description: row.description,
                status: row.status,
                mergedIntoId: row.mergedIntoId,
                createdAt: row.termCreatedAt,
                updatedAt: row.updatedAt,
              }),
              termName: rowToTermName({
                termId: row.nameTermId,
                kind: row.nameKindScope,
                name: row.lookupName,
                displayName: row.displayName,
                nameKind: row.nameKind,
                createdAt: row.nameCreatedAt,
              }),
            })
          );
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to find term by name: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const list = (kind?: TermKind) =>
      Effect.try({
        try: () => {
          const query = drizzle.select().from(terms).orderBy(terms.kind, terms.canonicalName);
          const rows = kind ? query.where(eq(terms.kind, kind)).all() : query.all();
          return rows.map(rowToTerm);
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to list terms: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const addName = (input: CreateTermNameInput) =>
      Effect.gen(function* () {
        const term = yield* getById(input.termId);
        if (term.kind !== input.kind) {
          return yield* new ValidationError({
            field: "kind",
            message: `Term name kind '${input.kind}' does not match term kind '${term.kind}'`,
          });
        }

        return yield* Effect.try({
          try: () => {
            const timestamp = now();
            const normalizedName = normalizeTermName(input.name);
            withSqliteWriteRetry(() =>
              drizzle
                .insert(termNames)
                .values({
                  termId: input.termId,
                  kind: input.kind,
                  name: normalizedName,
                  displayName: input.displayName,
                  nameKind: input.nameKind,
                  createdAt: timestamp,
                })
                .run()
            );

            const row = drizzle
              .select()
              .from(termNames)
              .where(and(eq(termNames.termId, input.termId), eq(termNames.name, normalizedName)))
              .get();
            if (!row) throw new Error(`Inserted term name not found: ${normalizedName}`);
            return rowToTermName(row);
          },
          catch: (error) =>
            new RepositoryError({
              message: `Failed to add term name: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });
      });

    const listNames = (termId: TermId) =>
      Effect.gen(function* () {
        yield* getById(termId);
        return yield* Effect.try({
          try: () => {
            const rows = drizzle
              .select()
              .from(termNames)
              .where(eq(termNames.termId, termId))
              .orderBy(termNames.name)
              .all();
            return rows
              .map(rowToTermName)
              .sort(
                (a, b) =>
                  termNameKindOrder[a.nameKind] - termNameKindOrder[b.nameKind] ||
                  a.name.localeCompare(b.name)
              );
          },
          catch: (error) =>
            new RepositoryError({
              message: `Failed to list term names: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });
      });

    const update = (id: TermId, updates: UpdateTermInput) =>
      Effect.gen(function* () {
        const existing = yield* getById(id);

        yield* Effect.try({
          try: () =>
            withSqliteWriteRetry(() =>
              drizzle
                .update(terms)
                .set({
                  canonicalName: updates.canonicalName ?? existing.canonicalName,
                  description: updates.description ?? existing.description ?? null,
                  status: updates.status ?? existing.status,
                  mergedIntoId: updates.mergedIntoId ?? existing.mergedIntoId ?? null,
                  updatedAt: now(),
                })
                .where(eq(terms.id, id))
                .run()
            ),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to update term: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        return yield* getById(id);
      });

    return {
      create,
      getById,
      getByCanonicalName,
      findByName,
      list,
      addName,
      listNames,
      update,
    } satisfies TermRepository;
  })
);
