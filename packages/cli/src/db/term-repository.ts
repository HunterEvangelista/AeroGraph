import {
  type CreateTermInput,
  type CreateTermNameInput,
  normalizeTermName,
  RepositoryError,
  type ResolvedTermName,
  type Term,
  TermAlreadyExistsError,
  type TermId,
  type TermKind,
  type TermName,
  TermNotFoundError,
  type TermRepository,
  TermRepositoryTag,
  type UpdateTermInput,
  type UpdateTermNameInput,
  ValidationError,
} from "@kioku/core";
import { and, eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { termNames, terms } from "./schema";
import { type DatabaseExecutor, DatabaseSessionTag, RootDatabaseSessionLive } from "./session";

const now = (): string => new Date().toISOString();

type TermRow = typeof terms.$inferSelect;
type TermNameRow = typeof termNames.$inferSelect;

const termNameKindOrder = { canonical: 0, alias: 1, deprecated: 2 } as const;

const validateTermName = (value: string, field: string) => {
  const normalized = normalizeTermName(value);
  if (!normalized) {
    return Effect.fail(new ValidationError({ field, message: "Term names must not be empty." }));
  }
  if (value.includes(",")) {
    return Effect.fail(
      new ValidationError({
        field,
        message: "Term names cannot contain commas because commas separate CLI selectors.",
      })
    );
  }
  return Effect.succeed(normalized);
};

const isUniqueConstraintError = (error: unknown): boolean => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { readonly code?: unknown }).code)
      : "";
  const message = error instanceof Error ? error.message : String(error);
  return `${code} ${message}`.toLowerCase().includes("unique constraint");
};

const writeError = (action: string, name: string, error: unknown) =>
  isUniqueConstraintError(error)
    ? new TermAlreadyExistsError({
        name,
        message: `Term name '${name}' already exists within this term kind.`,
      })
    : new RepositoryError({
        message: `Failed to ${action}: ${error instanceof Error ? error.message : String(error)}`,
        cause: error,
      });

const validateNameUpdate = (existing: TermNameRow, updates: UpdateTermNameInput) => {
  const requestedNameKind = updates.nameKind as string | undefined;
  const changesCanonicalState =
    (existing.nameKind === "canonical" &&
      (updates.displayName !== undefined || updates.nameKind !== undefined)) ||
    (existing.nameKind !== "canonical" && requestedNameKind === "canonical");
  if (changesCanonicalState) {
    return Effect.fail(
      new ValidationError({
        field: "nameKind",
        message: "Canonical names must be changed through renameCanonical.",
      })
    );
  }
  return updates.displayName === undefined
    ? Effect.void
    : validateTermName(updates.displayName, "displayName").pipe(Effect.asVoid);
};

const writeCanonicalName = (
  executor: DatabaseExecutor,
  id: TermId,
  canonicalName: string,
  normalizedName: string,
  kind: TermKind,
  timestamp: string,
  currentCanonical: TermNameRow,
  destination: TermNameRow | undefined
) => {
  if (currentCanonical.name === normalizedName) {
    executor
      .update(termNames)
      .set({ displayName: canonicalName })
      .where(and(eq(termNames.termId, id), eq(termNames.name, currentCanonical.name)))
      .run();
    return;
  }

  executor
    .update(termNames)
    .set({ nameKind: "deprecated" })
    .where(and(eq(termNames.termId, id), eq(termNames.name, currentCanonical.name)))
    .run();
  if (destination) {
    executor
      .update(termNames)
      .set({ displayName: canonicalName, nameKind: "canonical" })
      .where(and(eq(termNames.termId, id), eq(termNames.name, normalizedName)))
      .run();
    return;
  }

  executor
    .insert(termNames)
    .values({
      termId: id,
      kind,
      name: normalizedName,
      displayName: canonicalName,
      nameKind: "canonical",
      createdAt: timestamp,
    })
    .run();
};

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

export const SqliteTermRepositorySessionLive = Layer.effect(
  TermRepositoryTag,
  Effect.gen(function* () {
    const { drizzle, transaction, write } = yield* DatabaseSessionTag;

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
      Effect.gen(function* () {
        yield* validateTermName(input.canonicalName, "canonicalName");
        for (const alias of input.aliases ?? []) {
          yield* validateTermName(alias, "aliases");
        }

        return yield* Effect.try({
          try: () => {
            const timestamp = now();
            transaction((tx) => {
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
            });

            const row = drizzle.select().from(terms).where(eq(terms.id, input.id)).get();
            if (!row) throw new Error(`Inserted term not found: ${input.id}`);
            return rowToTerm(row);
          },
          catch: (error) => writeError("create term", input.canonicalName, error),
        });
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
        if ((input.nameKind as string) === "canonical") {
          return yield* new ValidationError({
            field: "nameKind",
            message: "Canonical names must be changed through renameCanonical.",
          });
        }
        const normalizedName = yield* validateTermName(input.name, "name");
        yield* validateTermName(input.displayName, "displayName");

        return yield* Effect.try({
          try: () => {
            const timestamp = now();
            write(() =>
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
          catch: (error) => writeError("add term name", input.displayName, error),
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

    const updateName = (termId: TermId, name: string, updates: UpdateTermNameInput) =>
      Effect.gen(function* () {
        yield* getById(termId);
        const normalizedName = normalizeTermName(name);

        const existing = yield* Effect.try({
          try: () =>
            drizzle
              .select()
              .from(termNames)
              .where(and(eq(termNames.termId, termId), eq(termNames.name, normalizedName)))
              .get(),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to get term name: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        if (!existing) {
          return yield* new TermNotFoundError({ name: normalizedName });
        }
        yield* validateNameUpdate(existing, updates);

        yield* Effect.try({
          try: () =>
            write(() =>
              drizzle
                .update(termNames)
                .set({
                  displayName: updates.displayName ?? existing.displayName,
                  nameKind: updates.nameKind ?? existing.nameKind,
                })
                .where(and(eq(termNames.termId, termId), eq(termNames.name, normalizedName)))
                .run()
            ),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to update term name: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        const row = yield* Effect.try({
          try: () =>
            drizzle
              .select()
              .from(termNames)
              .where(and(eq(termNames.termId, termId), eq(termNames.name, normalizedName)))
              .get(),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to get updated term name: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        if (!row) {
          return yield* new TermNotFoundError({ name: normalizedName });
        }

        return rowToTermName(row);
      });

    const update = (id: TermId, updates: UpdateTermInput) =>
      Effect.gen(function* () {
        const existing = yield* getById(id);
        const requestedCanonicalName = (updates as { readonly canonicalName?: string })
          .canonicalName;
        if (
          requestedCanonicalName !== undefined &&
          requestedCanonicalName !== existing.canonicalName
        ) {
          return yield* new ValidationError({
            field: "canonicalName",
            message: "Canonical names must be changed through renameCanonical.",
          });
        }

        yield* Effect.try({
          try: () =>
            write(() =>
              drizzle
                .update(terms)
                .set({
                  canonicalName: existing.canonicalName,
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

    const renameCanonical = (id: TermId, canonicalName: string) =>
      Effect.gen(function* () {
        const existing = yield* getById(id);
        const normalizedName = yield* validateTermName(canonicalName, "canonicalName");
        const conflict = (yield* findByName(canonicalName, existing.kind)).find(
          ({ term }) => term.id !== id
        );
        if (conflict) {
          return yield* new TermAlreadyExistsError({
            name: canonicalName,
            message: `Term name '${canonicalName}' already belongs to '${conflict.term.canonicalName}'.`,
          });
        }

        yield* Effect.try({
          try: () => {
            const timestamp = now();
            transaction((tx) => {
              const names = tx.select().from(termNames).where(eq(termNames.termId, id)).all();
              const currentCanonical = names.find(({ nameKind }) => nameKind === "canonical");
              if (!currentCanonical) {
                throw new Error(`Canonical term name not found for ${id}`);
              }

              const destination = names.find(({ name }) => name === normalizedName);
              writeCanonicalName(
                tx,
                id,
                canonicalName,
                normalizedName,
                existing.kind,
                timestamp,
                currentCanonical,
                destination
              );

              tx.update(terms)
                .set({ canonicalName, updatedAt: timestamp })
                .where(eq(terms.id, id))
                .run();
            });
          },
          catch: (error) => writeError("rename canonical term", canonicalName, error),
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
      updateName,
      update,
      renameCanonical,
    } satisfies TermRepository;
  })
);

export const SqliteTermRepositoryLive = SqliteTermRepositorySessionLive.pipe(
  Layer.provide(RootDatabaseSessionLive)
);
