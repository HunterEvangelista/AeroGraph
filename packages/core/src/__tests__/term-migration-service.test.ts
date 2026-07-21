import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import type { Entity, EntityId, EntityType } from "../domain/entity.js";
import { EntityTypeEnum } from "../domain/entity.js";
import type { Tag, TagId, UpdateTagInput } from "../domain/tag.js";
import type {
  CreateTermInput,
  CreateTermNameInput,
  JournalEntryId,
  MigrationJournalEntry,
  RecordJournalEntryInput,
  Term,
  TermId,
  TermKind,
  TermName,
  UpdateTermInput,
  UpdateTermNameInput,
} from "../domain/term.js";
import { normalizeTermName } from "../domain/term.js";
import {
  AmbiguousTermNameError,
  EntityNotFoundError,
  MigrationJournalEntryNotFoundError,
  TagNotFoundError,
  TermAlreadyExistsError,
  TermNotFoundError,
  ValidationError,
} from "../errors.js";
import type { EntityRepository } from "../repository/entity-repository.js";
import { EntityRepositoryTag } from "../repository/entity-repository.js";
import type { MigrationJournalRepository } from "../repository/migration-journal-repository.js";
import { MigrationJournalRepositoryTag } from "../repository/migration-journal-repository.js";
import type { TagRepository } from "../repository/tag-repository.js";
import { TagRepositoryTag } from "../repository/tag-repository.js";
import type { ResolvedTermName, TermRepository } from "../repository/term-repository.js";
import { TermRepositoryTag } from "../repository/term-repository.js";
import type {
  TransactionEngine,
  TransactionRepositories,
} from "../repository/transaction-engine.js";
import { TransactionEngineTag } from "../repository/transaction-engine.js";
import { MigrationServiceTag } from "../services/migration-service.js";
import { MigrationServiceLive } from "../services/migration-service.live.js";
import { TermServiceTag } from "../services/term-service.js";
import { TermServiceLive } from "../services/term-service.live.js";
import { FIXED_TIMESTAMP_ISO } from "./helpers/index.js";

const FIXED_DATE = new Date(FIXED_TIMESTAMP_ISO);

interface TermStore {
  readonly terms: Map<string, Term>;
  readonly names: TermName[];
}

interface MigrationStore {
  readonly entries: MigrationJournalEntry[];
}

const createTestEntity = (id: string, tags: ReadonlyArray<string> = []): Entity => ({
  _tag: EntityTypeEnum.Doc,
  id: id as EntityId,
  title: `Entity ${id}`,
  content: `Content for ${id}`,
  tags: [...tags],
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
  version: 1,
});

const createTestTag = (
  id: string,
  name: string,
  options: { aliases?: ReadonlyArray<string>; termId?: TermId } = {}
): Tag => ({
  id: id as TagId,
  name,
  ...(options.aliases ? { aliases: [...options.aliases] } : {}),
  ...(options.termId ? { termId: options.termId } : {}),
  createdAt: FIXED_DATE,
});

const applyTagUpdates = (existing: Tag, updates: UpdateTagInput): Tag => ({
  ...existing,
  name: updates.name ?? existing.name,
  ...(updates.description !== undefined ? { description: updates.description } : {}),
  ...(updates.parentId !== undefined ? { parentId: updates.parentId } : {}),
  ...(updates.aliases !== undefined ? { aliases: updates.aliases } : {}),
  ...(updates.termId !== undefined ? { termId: updates.termId } : {}),
});

const createTestTerm = (
  id: string,
  canonicalName: string,
  kind: TermKind,
  options: { status?: Term["status"]; mergedIntoId?: TermId } = {}
): Term => ({
  id: id as TermId,
  canonicalName,
  kind,
  status: options.status ?? "active",
  ...(options.mergedIntoId ? { mergedIntoId: options.mergedIntoId } : {}),
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
});

const createTestTermName = (
  termId: TermId,
  kind: TermKind,
  displayName: string,
  nameKind: TermName["nameKind"]
): TermName => ({
  termId,
  kind,
  name: normalizeTermName(displayName),
  displayName,
  nameKind,
  createdAt: FIXED_DATE,
});

const createTermStore = (): TermStore => ({ terms: new Map(), names: [] });

const uniqueTermNames = (
  canonicalName: string,
  aliases: ReadonlyArray<string> | undefined
): ReadonlyArray<{ displayName: string; nameKind: "canonical" | "alias" }> => {
  const seen = new Set<string>();
  const names = [
    { displayName: canonicalName, nameKind: "canonical" as const },
    ...(aliases ?? []).map((displayName) => ({ displayName, nameKind: "alias" as const })),
  ];

  return names.filter(({ displayName }) => {
    const normalizedName = normalizeTermName(displayName);
    if (seen.has(normalizedName)) return false;
    seen.add(normalizedName);
    return true;
  });
};

const createMockTermRepository = (store: TermStore): TermRepository => {
  const getById = (id: TermId) =>
    Effect.gen(function* () {
      const term = store.terms.get(id);
      if (!term) {
        return yield* new TermNotFoundError({ name: id });
      }
      return term;
    });

  const findByName = (name: string, kind?: TermKind) =>
    Effect.succeed(
      store.names
        .filter(
          (termName) =>
            termName.name === normalizeTermName(name) && (!kind || termName.kind === kind)
        )
        .map((termName): ResolvedTermName | undefined => {
          const term = store.terms.get(termName.termId);
          return term ? { term, termName } : undefined;
        })
        .filter((match): match is ResolvedTermName => Boolean(match))
        .sort(
          (left, right) =>
            left.term.kind.localeCompare(right.term.kind) ||
            left.term.canonicalName.localeCompare(right.term.canonicalName)
        )
    );

  const addName = (input: CreateTermNameInput) =>
    Effect.gen(function* () {
      const term = yield* getById(input.termId);
      if (term.kind !== input.kind) {
        return yield* new ValidationError({ field: "kind", message: "Term name kind mismatch" });
      }

      const normalizedName = normalizeTermName(input.name);
      if (store.names.some((name) => name.kind === input.kind && name.name === normalizedName)) {
        return yield* new ValidationError({ field: "name", message: "Term name already exists" });
      }

      const termName: TermName = {
        termId: input.termId,
        kind: input.kind,
        name: normalizedName,
        displayName: input.displayName,
        nameKind: input.nameKind,
        createdAt: FIXED_DATE,
      };
      store.names.push(termName);
      return termName;
    });

  const updateName = (termId: TermId, name: string, updates: UpdateTermNameInput) =>
    Effect.gen(function* () {
      yield* getById(termId);
      const normalizedName = normalizeTermName(name);
      const index = store.names.findIndex(
        (termName) => termName.termId === termId && termName.name === normalizedName
      );

      if (index === -1) {
        return yield* new TermNotFoundError({ name: normalizedName });
      }

      const existing = store.names[index];
      if (!existing) {
        return yield* new TermNotFoundError({ name: normalizedName });
      }

      const updated: TermName = {
        ...existing,
        displayName: updates.displayName ?? existing.displayName,
        nameKind: updates.nameKind ?? existing.nameKind,
      };
      store.names[index] = updated;
      return updated;
    });

  return {
    create: (input: CreateTermInput) =>
      Effect.gen(function* () {
        if (store.terms.has(input.id)) {
          return yield* new TermAlreadyExistsError({ name: input.id });
        }

        const conflictingName = store.names.find(
          (termName) =>
            termName.kind === input.kind &&
            uniqueTermNames(input.canonicalName, input.aliases).some(
              ({ displayName }) => termName.name === normalizeTermName(displayName)
            )
        );

        if (conflictingName) {
          return yield* new TermAlreadyExistsError({ name: conflictingName.displayName });
        }

        const term = createTestTerm(input.id, input.canonicalName, input.kind);
        store.terms.set(term.id, term);

        for (const termName of uniqueTermNames(input.canonicalName, input.aliases)) {
          store.names.push(
            createTestTermName(term.id, input.kind, termName.displayName, termName.nameKind)
          );
        }

        return term;
      }),
    getById,
    getByCanonicalName: (kind, canonicalName) =>
      Effect.gen(function* () {
        const term = Array.from(store.terms.values()).find(
          (candidate) => candidate.kind === kind && candidate.canonicalName === canonicalName
        );
        if (!term) {
          return yield* new TermNotFoundError({ name: canonicalName });
        }
        return term;
      }),
    findByName,
    list: (kind) =>
      Effect.succeed(
        Array.from(store.terms.values()).filter((term) => !kind || term.kind === kind)
      ),
    addName,
    listNames: (termId) =>
      Effect.gen(function* () {
        yield* getById(termId);
        return store.names.filter((termName) => termName.termId === termId);
      }),
    updateName,
    update: (id: TermId, updates: UpdateTermInput) =>
      Effect.gen(function* () {
        const existing = yield* getById(id);
        const updated: Term = {
          ...existing,
          canonicalName: updates.canonicalName ?? existing.canonicalName,
          status: updates.status ?? existing.status,
          ...(updates.description !== undefined ? { description: updates.description } : {}),
          ...(updates.mergedIntoId !== undefined
            ? { mergedIntoId: updates.mergedIntoId }
            : existing.mergedIntoId
              ? { mergedIntoId: existing.mergedIntoId }
              : {}),
          updatedAt: FIXED_DATE,
        };
        store.terms.set(id, updated);
        return updated;
      }),
  };
};

const createMockTagRepository = (tags: Map<string, Tag>): TagRepository => ({
  create: (input) =>
    Effect.succeed(
      createTestTag(input.id, input.name, {
        ...(input.aliases ? { aliases: input.aliases } : {}),
        ...(input.termId ? { termId: input.termId } : {}),
      })
    ),
  getById: (id) =>
    Effect.gen(function* () {
      const tag = tags.get(id);
      if (!tag) {
        return yield* new TagNotFoundError({ tagId: id });
      }
      return tag;
    }),
  getAll: () => Effect.succeed(Array.from(tags.values())),
  getChildren: () => Effect.succeed([]),
  getAncestors: () => Effect.succeed([]),
  update: (id, updates) =>
    Effect.gen(function* () {
      const existing = tags.get(id);
      if (!existing) {
        return yield* new TagNotFoundError({ tagId: id });
      }

      const updated = applyTagUpdates(existing, updates);
      tags.set(id, updated);
      return updated;
    }),
  delete: (id) =>
    Effect.gen(function* () {
      if (!tags.delete(id)) {
        return yield* new TagNotFoundError({ tagId: id });
      }
    }),
  applyToEntity: () => Effect.void,
  removeFromEntity: () => Effect.void,
  getTagsForEntity: () => Effect.succeed([]),
  search: () => Effect.succeed([]),
  count: () => Effect.succeed(tags.size),
});

const createMockEntityRepository = (
  entities: Map<string, Entity>,
  taggedEntities: Map<string, Set<string>>
): EntityRepository => ({
  createDoc: () => Effect.die(new Error("not implemented")),
  createCodeRef: () => Effect.die(new Error("not implemented")),
  createStory: () => Effect.die(new Error("not implemented")),
  createDiagram: () => Effect.die(new Error("not implemented")),
  getById: (id) =>
    Effect.gen(function* () {
      const entity = entities.get(id);
      if (!entity) {
        return yield* new EntityNotFoundError({ entityId: id });
      }
      return entity;
    }),
  getAll: (type?: EntityType) =>
    Effect.succeed(Array.from(entities.values()).filter((entity) => !type || entity._tag === type)),
  getByTag: (tagId) =>
    Effect.succeed(
      Array.from(taggedEntities.get(tagId) ?? [])
        .map((entityId) => entities.get(entityId))
        .filter((entity): entity is Entity => Boolean(entity))
    ),
  getByTags: () => Effect.succeed([]),
  update: () => Effect.die(new Error("not implemented")),
  delete: () => Effect.void,
  count: () => Effect.succeed(entities.size),
  search: () => Effect.succeed([]),
});

const createMockMigrationJournalRepository = (
  store: MigrationStore
): MigrationJournalRepository => ({
  record: (input: RecordJournalEntryInput) =>
    Effect.succeed(() => {
      const entry: MigrationJournalEntry = {
        id: input.id as JournalEntryId,
        operation: input.operation,
        ...(input.kind ? { kind: input.kind } : {}),
        fromName: input.fromName,
        toName: input.toName,
        termId: input.termId,
        affectedEntityIds: input.affectedEntityIds,
        affectedCount: input.affectedEntityIds.length,
        ...(input.reason ? { reason: input.reason } : {}),
        appliedAt: FIXED_DATE,
        ...(input.appliedBy ? { appliedBy: input.appliedBy } : {}),
        dryRun: input.dryRun,
      };
      store.entries.push(entry);
      return entry;
    }).pipe(Effect.flatMap((createEntry) => Effect.succeed(createEntry()))),
  getById: (id) =>
    Effect.gen(function* () {
      const entry = store.entries.find((candidate) => candidate.id === id);
      if (!entry) {
        return yield* new MigrationJournalEntryNotFoundError({ id });
      }
      return entry;
    }),
  listByTerm: (termId) =>
    Effect.succeed([...store.entries].reverse().filter((entry) => entry.termId === termId)),
  listRecent: (limit = 50) => Effect.succeed([...store.entries].reverse().slice(0, limit)),
});

const createTestLayer = (config: {
  termStore?: TermStore;
  tags?: Map<string, Tag>;
  entities?: Map<string, Entity>;
  taggedEntities?: Map<string, Set<string>>;
  migrationStore?: MigrationStore;
}) => {
  const termStore = config.termStore ?? createTermStore();
  const tags = config.tags ?? new Map<string, Tag>();
  const entities = config.entities ?? new Map<string, Entity>();
  const taggedEntities = config.taggedEntities ?? new Map<string, Set<string>>();
  const migrationStore = config.migrationStore ?? { entries: [] };
  const termRepository = createMockTermRepository(termStore);
  const tagRepository = createMockTagRepository(tags);
  const entityRepository = createMockEntityRepository(entities, taggedEntities);
  const migrationJournalRepository = createMockMigrationJournalRepository(migrationStore);
  const transactionRepositories = {
    terms: termRepository,
    tags: tagRepository,
    entities: entityRepository,
    migrationJournal: migrationJournalRepository,
  } as TransactionRepositories;
  const transactionEngine = {
    run: <A, E>(operation: (repositories: TransactionRepositories) => Effect.Effect<A, E>) =>
      operation(transactionRepositories),
  } satisfies TransactionEngine;

  const repoLayer = Layer.mergeAll(
    Layer.succeed(TermRepositoryTag, termRepository),
    Layer.succeed(TagRepositoryTag, tagRepository),
    Layer.succeed(EntityRepositoryTag, entityRepository),
    Layer.succeed(MigrationJournalRepositoryTag, migrationJournalRepository),
    Layer.succeed(TransactionEngineTag, transactionEngine)
  );

  return Layer.provideMerge(Layer.mergeAll(TermServiceLive, MigrationServiceLive), repoLayer);
};

describe("TermService", () => {
  it("resolves deprecated names with user-facing notes", async () => {
    const termStore = createTermStore();
    const term = createTestTerm("term-brand-aerograph", "AeroGraph", "brand");
    termStore.terms.set(term.id, term);
    termStore.names.push(createTestTermName(term.id, "brand", "AeroGraph", "canonical"));
    termStore.names.push(createTestTermName(term.id, "brand", "Kioku", "deprecated"));

    const program = Effect.gen(function* () {
      const service = yield* TermServiceTag;
      return yield* service.resolveName("KIOKU", "brand");
    });

    const result = await Effect.runPromise(Effect.provide(program, createTestLayer({ termStore })));

    expect(result.term.id).toBe("term-brand-aerograph");
    expect(result.matchedName.nameKind).toBe("deprecated");
    expect(result.resolutionNotes.join(" ")).toContain("deprecated");
  });

  it("returns ambiguity when resolving a name across multiple kinds", async () => {
    const termStore = createTermStore();
    const brandTerm = createTestTerm("term-brand-aerograph", "AeroGraph", "brand");
    const packageTerm = createTestTerm("term-package-kioku", "Kioku", "package");
    termStore.terms.set(brandTerm.id, brandTerm);
    termStore.terms.set(packageTerm.id, packageTerm);
    termStore.names.push(createTestTermName(brandTerm.id, "brand", "Kioku", "alias"));
    termStore.names.push(createTestTermName(packageTerm.id, "package", "Kioku", "canonical"));

    const program = Effect.gen(function* () {
      const service = yield* TermServiceTag;
      return yield* service.resolveName("kioku");
    });

    const error = await Effect.runPromise(
      Effect.flip(Effect.provide(program, createTestLayer({ termStore })))
    );

    expect(error).toBeInstanceOf(AmbiguousTermNameError);
    if (!(error instanceof AmbiguousTermNameError)) {
      throw error;
    }
    expect(error.candidates).toEqual(["brand:AeroGraph (alias)", "package:Kioku (canonical)"]);
  });
});

describe("MigrationService", () => {
  it("plans a rename with affected tags and entities without writing", async () => {
    const tags = new Map<string, Tag>();
    tags.set("kioku", createTestTag("kioku", "Kioku"));

    const entities = new Map<string, Entity>();
    entities.set("doc-1", createTestEntity("doc-1", ["kioku"]));
    entities.set("doc-2", createTestEntity("doc-2", ["kioku"]));

    const taggedEntities = new Map<string, Set<string>>();
    taggedEntities.set("kioku", new Set(["doc-1", "doc-2"]));

    const migrationStore = { entries: [] };
    const program = Effect.gen(function* () {
      const service = yield* MigrationServiceTag;
      return yield* service.planRename({
        kind: "brand",
        fromName: "kioku",
        toName: "AeroGraph",
      });
    });

    const result = await Effect.runPromise(
      Effect.provide(program, createTestLayer({ tags, entities, taggedEntities, migrationStore }))
    );

    expect(result.willCreateTerm).toBe(true);
    expect(result.affectedTags.map(({ id }) => id)).toEqual(["kioku"]);
    expect(result.affectedEntityIds).toEqual(["doc-1", "doc-2"]);
    expect(migrationStore.entries).toHaveLength(0);
  });

  it("applies a rename by creating the destination term, preserving tag identity, and journaling", async () => {
    const termStore = createTermStore();
    const migrationStore = { entries: [] };
    const tags = new Map<string, Tag>();
    tags.set("kioku", createTestTag("kioku", "Kioku"));

    const entities = new Map<string, Entity>();
    entities.set("doc-1", createTestEntity("doc-1", ["kioku"]));
    entities.set("doc-2", createTestEntity("doc-2", ["kioku"]));

    const taggedEntities = new Map<string, Set<string>>();
    taggedEntities.set("kioku", new Set(["doc-1", "doc-2"]));

    const program = Effect.gen(function* () {
      const service = yield* MigrationServiceTag;
      return yield* service.applyRename({
        kind: "brand",
        fromName: "kioku",
        toName: "AeroGraph",
        termId: "term-brand-aerograph" as TermId,
        journalEntryId: "journal-rename-1" as JournalEntryId,
        reason: "Project rename",
        appliedBy: "test",
      });
    });

    const result = await Effect.runPromise(
      Effect.provide(
        program,
        createTestLayer({ termStore, tags, entities, taggedEntities, migrationStore })
      )
    );
    const updatedTag = tags.get("kioku");
    const termNames = termStore.names.map(({ name, nameKind }) => [name, nameKind]);

    expect(result.term.id).toBe("term-brand-aerograph");
    expect(result.term.canonicalName).toBe("AeroGraph");
    expect(updatedTag?.id).toBe("kioku");
    expect(updatedTag?.name).toBe("AeroGraph");
    expect(updatedTag?.aliases).toEqual(["Kioku"]);
    expect(updatedTag?.termId).toBe("term-brand-aerograph");
    expect(termNames).toEqual([
      ["aerograph", "canonical"],
      ["kioku", "deprecated"],
    ]);
    expect(result.journalEntry.affectedEntityIds).toEqual(["doc-1", "doc-2"]);
    expect(migrationStore.entries).toHaveLength(1);
    expect(taggedEntities.get("kioku")).toEqual(new Set(["doc-1", "doc-2"]));
  });

  it("converts an existing source term into the renamed canonical term", async () => {
    const termStore = createTermStore();
    const sourceTerm = createTestTerm("term-brand-kioku", "Kioku", "brand");
    termStore.terms.set(sourceTerm.id, sourceTerm);
    termStore.names.push(createTestTermName(sourceTerm.id, "brand", "Kioku", "canonical"));

    const tags = new Map<string, Tag>();
    tags.set("kioku", createTestTag("kioku", "Kioku", { termId: sourceTerm.id }));

    const program = Effect.gen(function* () {
      const service = yield* MigrationServiceTag;
      return yield* service.applyRename({
        kind: "brand",
        fromName: "kioku",
        toName: "AeroGraph",
        journalEntryId: "journal-rename-2" as JournalEntryId,
      });
    });

    const result = await Effect.runPromise(
      Effect.provide(program, createTestLayer({ termStore, tags }))
    );

    expect(result.term.id).toBe("term-brand-kioku");
    expect(result.term.canonicalName).toBe("AeroGraph");
    expect(
      termStore.names
        .map(({ name, nameKind }) => ({ name, nameKind }))
        .sort((a, b) => a.name.localeCompare(b.name))
    ).toEqual([
      { name: "aerograph", nameKind: "canonical" },
      { name: "kioku", nameKind: "deprecated" },
    ]);
    expect(tags.get("kioku")?.termId).toBe("term-brand-kioku");
  });
});
