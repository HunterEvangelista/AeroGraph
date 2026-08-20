import { Effect, Layer, Schema } from "effect";
import { describe, expect, it } from "vitest";
import type { Entity } from "../domain/entity";
import { BrandedId, EntityType } from "../domain/entity";
import type { Tag, TagId } from "../domain/tag";
import { TagIdSchema, Tag as TagSchema } from "../domain/tag";
import type { JournalEntryId, Term, TermId, TermName } from "../domain/term";
import {
  JournalEntryIdSchema,
  MigrationJournalEntry as MigrationJournalEntrySchema,
  normalizeTermName,
  TermIdSchema,
  Term as TermSchema,
} from "../domain/term";
import {
  EntityNotFoundError,
  TagNotFoundError,
  TermMigrationError,
  TermNotFoundError,
  ValidationError,
} from "../errors";
import type { EntityRepository } from "../repository/entity-repository";
import { EntityRepositoryTag } from "../repository/entity-repository";
import type { MigrationJournalRepository } from "../repository/migration-journal-repository";
import { MigrationJournalRepositoryTag } from "../repository/migration-journal-repository";
import type { TagRepository } from "../repository/tag-repository";
import { TagRepositoryTag } from "../repository/tag-repository";
import type { TermRepository } from "../repository/term-repository";
import { TermRepositoryTag } from "../repository/term-repository";
import type { TransactionEngine, TransactionRepositories } from "../repository/transaction-engine";
import { TransactionEngineTag } from "../repository/transaction-engine";
import { MigrationServiceTag } from "../services/migration-service";
import { MigrationServiceLive } from "../services/migration-service.live";
import { TermServiceTag } from "../services/term-service";
import { TermServiceLive } from "../services/term-service.live";

const date = new Date("2025-01-01T00:00:00.000Z");
const termId = (value: string): TermId => Schema.decodeUnknownSync(TermIdSchema)(value);
const tagId = (value: string): TagId => Schema.decodeUnknownSync(TagIdSchema)(value);
const journalEntryId = (value: string): JournalEntryId =>
  Schema.decodeUnknownSync(JournalEntryIdSchema)(value);
const entityId = (value: string) => Schema.decodeUnknownSync(BrandedId)(value);
const decodeTerm = (value: Schema.Codec.Encoded<typeof TermSchema>): Term =>
  Schema.decodeUnknownSync(TermSchema)(value);
const decodeTag = (value: Schema.Codec.Encoded<typeof TagSchema>): Tag =>
  Schema.decodeUnknownSync(TagSchema)(value);
const decodeJournalEntry = (
  value: Schema.Codec.Encoded<typeof MigrationJournalEntrySchema>
): import("../domain/term").MigrationJournalEntry =>
  Schema.decodeUnknownSync(MigrationJournalEntrySchema)(value);

const term = (
  id: string,
  name: string,
  kind: Term["kind"],
  status: Term["status"] = "active"
): Term => ({
  id: termId(id),
  canonicalName: name,
  kind,
  status,
  createdAt: date,
  updatedAt: date,
});
const name = (
  id: TermId,
  kind: Term["kind"],
  displayName: string,
  nameKind: TermName["nameKind"]
): TermName => ({
  termId: id,
  kind,
  name: normalizeTermName(displayName),
  displayName,
  nameKind,
  createdAt: date,
});
const entity = (id: string): Entity => ({
  _tag: EntityType.Doc,
  id: entityId(id),
  title: id,
  content: "",
  tags: [],
  createdAt: date,
  updatedAt: date,
  version: 1,
});
const tag = (id: string, displayName: string, termId: TermId): Tag => ({
  id: tagId(id),
  name: displayName,
  aliases: [`legacy-${id}`],
  termId,
  createdAt: date,
});

interface State {
  terms: Map<string, Term>;
  names: TermName[];
  tags: Map<string, Tag>;
  entities: Map<string, Entity>;
  byTag: Map<string, Set<string>>;
  entries: import("../domain/term").MigrationJournalEntry[];
}

const layer = (state: State) => {
  const getTerm = (id: TermId) =>
    Effect.gen(function* () {
      const value = state.terms.get(id);
      if (!value) return yield* new TermNotFoundError({ name: id });
      return value;
    });
  const terms: TermRepository = {
    create: () => Effect.die("unused"),
    getById: getTerm,
    getByCanonicalName: () => Effect.die("unused"),
    findByName: (value, kind) =>
      Effect.succeed(
        state.names
          .filter((n) => n.name === normalizeTermName(value) && (!kind || n.kind === kind))
          .flatMap((n) => {
            const t = state.terms.get(n.termId);
            return t ? [{ term: t, termName: n }] : [];
          })
      ),
    list: (kind) =>
      Effect.succeed([...state.terms.values()].filter((t) => !kind || t.kind === kind)),
    addName: (input) =>
      Effect.succeed({
        ...name(input.termId, input.kind, input.displayName, input.nameKind),
        name: normalizeTermName(input.name),
      }),
    getByIds: (ids) =>
      Effect.succeed(
        ids.flatMap((id) => {
          const value = state.terms.get(id);
          return value ? [value] : [];
        })
      ),
    listNamesByTermIds: (ids) => Effect.succeed(state.names.filter((n) => ids.includes(n.termId))),
    listMergedInto: (termId) =>
      Effect.succeed([...state.terms.values()].filter((term) => term.mergedIntoId === termId)),
    listNames: (id) => Effect.succeed(state.names.filter((n) => n.termId === id)),
    updateName: () => Effect.die("unused"),
    update: (id, updates) =>
      Effect.gen(function* () {
        const current = yield* getTerm(id);
        const next = decodeTerm({
          ...current,
          createdAt: current.createdAt.toISOString(),
          updatedAt: date.toISOString(),
          status: updates.status ?? current.status,
          mergedIntoId:
            updates.mergedIntoId === undefined
              ? current.mergedIntoId
              : (updates.mergedIntoId ?? undefined),
          replacementTermId:
            updates.replacementTermId === undefined
              ? current.replacementTermId
              : (updates.replacementTermId ?? undefined),
        });
        state.terms.set(id, next);
        return next;
      }),
    renameCanonical: () => Effect.die("unused"),
  };
  const tags: TagRepository = {
    create: () => Effect.die("unused"),
    getById: (id) =>
      Effect.gen(function* () {
        const value = state.tags.get(id);
        if (!value) return yield* new TagNotFoundError({ tagId: id });
        return value;
      }),
    getAll: Effect.succeed([...state.tags.values()]),
    getChildren: () => Effect.succeed([]),
    getAncestors: () => Effect.succeed([]),
    update: (id, updates) =>
      Effect.gen(function* () {
        const existing = state.tags.get(id);
        if (!existing) return yield* new TagNotFoundError({ tagId: id });
        const next = decodeTag({
          ...existing,
          ...updates,
          name: updates.name ?? existing.name,
          createdAt: existing.createdAt.toISOString(),
        });
        state.tags.set(id, next);
        return next;
      }),
    delete: () => Effect.void,
    applyToEntity: () => Effect.void,
    removeFromEntity: () => Effect.void,
    getTagsForEntity: () => Effect.succeed([]),
    search: () => Effect.succeed([]),
    count: Effect.succeed(0),
  };
  const entities: EntityRepository = {
    createDoc: () => Effect.die("unused"),
    createCodeRef: () => Effect.die("unused"),
    createStory: () => Effect.die("unused"),
    createDiagram: () => Effect.die("unused"),
    getById: (id) =>
      Effect.gen(function* () {
        const value = state.entities.get(id);
        if (!value) return yield* new EntityNotFoundError({ entityId: id });
        return value;
      }),
    getAll: () => Effect.succeed([...state.entities.values()]),
    getByTag: (id) =>
      Effect.succeed(
        [...(state.byTag.get(id) ?? [])].flatMap((entityId) => {
          const value = state.entities.get(entityId);
          return value ? [value] : [];
        })
      ),
    getByTags: () => Effect.succeed([]),
    update: () => Effect.die("unused"),
    delete: () => Effect.void,
    count: () => Effect.succeed(0),
    search: () => Effect.succeed([]),
  };
  const journal: MigrationJournalRepository = {
    record: (input) =>
      Effect.sync(() => {
        const entry = decodeJournalEntry({
          id: journalEntryId(input.id),
          operation: input.operation,
          kind: input.kind,
          fromName: input.fromName,
          toName: input.toName,
          termId: input.termId,
          relatedTermId: input.relatedTermId,
          affectedEntityIds: input.affectedEntityIds,
          affectedCount: input.affectedEntityIds.length,
          appliedAt: date.toISOString(),
          appliedBy: undefined,
          reason: undefined,
          dryRun: input.dryRun,
        });
        state.entries.push(entry);
        return entry;
      }),
    getById: () => Effect.die("unused"),
    listByTerm: (id) =>
      Effect.succeed(state.entries.filter((e) => e.termId === id || e.relatedTermId === id)),
    listRecent: () => Effect.succeed([...state.entries].reverse()),
  };
  const repositories = {
    terms,
    tags,
    entities,
    migrationJournal: journal,
  };
  // SAFETY: This layer is only provided to term and migration services, whose transaction effects use these repositories.
  const typedRepositories = repositories as TransactionRepositories;
  const tx: TransactionEngine = { run: (operation) => operation(typedRepositories) };
  return Layer.provideMerge(
    Layer.mergeAll(TermServiceLive, MigrationServiceLive),
    Layer.mergeAll(
      Layer.succeed(TermRepositoryTag, terms),
      Layer.succeed(TagRepositoryTag, tags),
      Layer.succeed(EntityRepositoryTag, entities),
      Layer.succeed(MigrationJournalRepositoryTag, journal),
      Layer.succeed(TransactionEngineTag, tx)
    )
  );
};

const base = (): State => ({
  terms: new Map(),
  names: [],
  tags: new Map(),
  entities: new Map(),
  byTag: new Map(),
  entries: [],
});

describe("governed term lifecycle", () => {
  it("prefers an exact stable ID over a same-text registered name", async () => {
    const s = base();
    const byId = term("same", "Readable", "brand");
    const other = term("other", "same", "brand");
    s.terms.set(byId.id, byId);
    s.terms.set(other.id, other);
    s.names.push(
      name(byId.id, "brand", "Readable", "canonical"),
      name(other.id, "brand", "same", "canonical")
    );
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          return yield* (yield* TermServiceTag).resolveName("same");
        }),
        layer(s)
      )
    );
    expect(result.term.id).toBe("same");
    expect(result.resolutionMetadata.matchedBy).toBe("id");
  });

  it("plans deprecation without writes and retains read resolution without a fallback", async () => {
    const s = base();
    const source = term("source", "Old API", "api");
    s.terms.set(source.id, source);
    s.names.push(name(source.id, "api", "Old API", "canonical"));
    s.tags.set("t", tag("t", "Old API", source.id));
    s.entities.set("e", entity("e"));
    s.byTag.set("t", new Set(["e"]));
    const plan = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          return yield* (yield* MigrationServiceTag).planDeprecate({ term: { id: source.id } });
        }),
        layer(s)
      )
    );
    expect(plan.affectedEntityIds).toEqual(["e"]);
    expect(s.terms.get("source")?.status).toBe("active");
    expect(s.entries).toHaveLength(0);
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          return yield* (yield* MigrationServiceTag).applyDeprecate({
            term: { id: source.id },
            journalEntryId: journalEntryId("j"),
          });
        }),
        layer(s)
      )
    );
    expect(result.term.status).toBe("deprecated");
    expect(result.journalEntry.toName).toBeUndefined();
    const resolution = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          return yield* (yield* TermServiceTag).resolveName("Old API", "api");
        }),
        layer(s)
      )
    );
    expect(resolution.term.id).toBe(source.id);
    expect(resolution.resolutionNotes.join(" ")).toContain("deprecated");
  });

  it("rejects invalid fallback targets and keeps advisory fallback reads on the deprecated term", async () => {
    const s = base();
    const source = term("source", "Old", "concept");
    const replacement = term("replacement", "New", "concept");
    s.terms.set(source.id, source);
    s.terms.set(replacement.id, replacement);
    s.names.push(
      name(source.id, "concept", "Old", "canonical"),
      name(replacement.id, "concept", "New", "canonical")
    );
    const service = Effect.gen(function* () {
      return yield* (yield* MigrationServiceTag).applyDeprecate({
        term: { id: source.id },
        replacement: { id: replacement.id },
        journalEntryId: journalEntryId("j"),
      });
    });
    const result = await Effect.runPromise(Effect.provide(service, layer(s)));
    expect(result.term.replacementTermId).toBe(replacement.id);
    expect(result.journalEntry.relatedTermId).toBe(replacement.id);
    const resolved = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          return yield* (yield* TermServiceTag).resolveName("Old", "concept");
        }),
        layer(s)
      )
    );
    expect(resolved.term.id).toBe(source.id);
    expect(resolved.resolutionMetadata.recommendedReplacementTermId).toBe(replacement.id);
    const invalid = await Effect.runPromise(
      Effect.flip(
        Effect.provide(
          Effect.gen(function* () {
            return yield* (yield* MigrationServiceTag).planDeprecate({
              term: { id: source.id },
              replacement: { id: source.id },
            });
          }),
          layer(s)
        )
      )
    );
    expect(invalid).toBeInstanceOf(ValidationError);
  });

  it("merges same-kind terms, reassigns tags only, deduplicates affected entities, and redirects names", async () => {
    const s = base();
    const source = term("source", "Legacy", "project");
    const destination = term("destination", "Current", "project");
    s.terms.set(source.id, source);
    s.terms.set(destination.id, destination);
    s.names.push(
      name(source.id, "project", "Legacy", "canonical"),
      name(source.id, "project", "Old Project", "alias"),
      name(destination.id, "project", "Current", "canonical")
    );
    s.tags.set("a", tag("a", "Legacy", source.id));
    s.tags.set("b", tag("b", "Old Project", source.id));
    s.entities.set("e", entity("e"));
    s.byTag.set("a", new Set(["e"]));
    s.byTag.set("b", new Set(["e"]));
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          return yield* (yield* MigrationServiceTag).applyMerge({
            source: { id: source.id },
            destination: { id: destination.id },
            journalEntryId: journalEntryId("j"),
          });
        }),
        layer(s)
      )
    );
    expect(result.plan.affectedEntityIds).toEqual(["e"]);
    expect(s.tags.get("a")).toMatchObject({
      name: "Legacy",
      aliases: ["legacy-a"],
      termId: destination.id,
    });
    expect(s.tags.get("b")).toMatchObject({
      name: "Old Project",
      aliases: ["legacy-b"],
      termId: destination.id,
    });
    expect(s.terms.get("source")?.status).toBe("merged");
    expect(s.entries[0]).toMatchObject({ termId: source.id, relatedTermId: destination.id });
    const redirected = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          return yield* (yield* TermServiceTag).resolveName("Old Project", "project");
        }),
        layer(s)
      )
    );
    expect(redirected.term.id).toBe(destination.id);
  });

  it("preserves alias metadata across a multi-hop merge redirect", async () => {
    const s = base();
    const source = {
      ...term("source", "Legacy", "concept"),
      status: "merged" as const,
      mergedIntoId: termId("middle"),
    };
    const middle = {
      ...term("middle", "Former", "concept"),
      status: "merged" as const,
      mergedIntoId: termId("destination"),
    };
    const destination = term("destination", "Current", "concept");
    for (const value of [source, middle, destination]) s.terms.set(value.id, value);
    s.names.push(
      name(source.id, "concept", "Legacy", "canonical"),
      name(source.id, "concept", "Old Alias", "alias"),
      name(middle.id, "concept", "Former", "canonical"),
      name(destination.id, "concept", "Current", "canonical")
    );

    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          return yield* (yield* TermServiceTag).resolveName("Old Alias", "concept");
        }),
        layer(s)
      )
    );
    expect(result.term.id).toBe(destination.id);
    expect(result.matchedName.displayName).toBe("Old Alias");
    expect(result.matchedName.nameKind).toBe("alias");
    expect(result.resolutionMetadata.matchedNameKind).toBe("alias");
    expect(result.resolutionMetadata.selectedTermId).toBe(source.id);
    expect(result.resolutionMetadata.redirectPath).toEqual([source.id, middle.id, destination.id]);
  });

  it("preserves deprecated-name metadata across a multi-hop merge redirect", async () => {
    const s = base();
    const source = {
      ...term("source", "Legacy", "concept"),
      status: "merged" as const,
      mergedIntoId: termId("middle"),
    };
    const middle = {
      ...term("middle", "Former", "concept"),
      status: "merged" as const,
      mergedIntoId: termId("destination"),
    };
    const destination = term("destination", "Current", "concept");
    for (const value of [source, middle, destination]) s.terms.set(value.id, value);
    s.names.push(
      name(source.id, "concept", "Legacy", "canonical"),
      name(source.id, "concept", "Old Name", "deprecated"),
      name(middle.id, "concept", "Former", "canonical"),
      name(destination.id, "concept", "Current", "canonical")
    );

    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          return yield* (yield* TermServiceTag).resolveName("Old Name", "concept");
        }),
        layer(s)
      )
    );
    expect(result.term.id).toBe(destination.id);
    expect(result.matchedName.displayName).toBe("Old Name");
    expect(result.matchedName.nameKind).toBe("deprecated");
    expect(result.resolutionMetadata.matchedNameKind).toBe("deprecated");
    expect(result.resolutionMetadata.selectedTermId).toBe(source.id);
  });

  it("reports a missing merge pointer as lifecycle corruption", async () => {
    const s = base();
    const source = {
      ...term("source", "Legacy", "concept"),
      status: "merged" as const,
      mergedIntoId: termId("missing"),
    };
    s.terms.set(source.id, source);
    s.names.push(name(source.id, "concept", "Legacy", "canonical"));
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.provide(
          Effect.gen(function* () {
            return yield* (yield* TermServiceTag).resolveName("Legacy", "concept");
          }),
          layer(s)
        )
      )
    );
    expect(error).toBeInstanceOf(TermMigrationError);
    expect(error).not.toBeInstanceOf(TermNotFoundError);
  });

  it.each(["destination", "missing"] as const)(
    "rejects deprecated terms with merge destinations during resolution (%s target)",
    async (target) => {
      const s = base();
      const source = {
        ...term("source", "Legacy", "concept", "deprecated"),
        mergedIntoId: termId(target),
      };
      s.terms.set(source.id, source);
      s.names.push(name(source.id, "concept", "Legacy", "canonical"));
      if (target === "destination") {
        const destination = term(target, "Current", "concept");
        s.terms.set(destination.id, destination);
        s.names.push(name(destination.id, "concept", "Current", "canonical"));
      }

      const error = await Effect.runPromise(
        Effect.flip(
          Effect.provide(
            Effect.gen(function* () {
              return yield* (yield* TermServiceTag).resolveName("Legacy", "concept");
            }),
            layer(s)
          )
        )
      );
      expect(error._tag).toBe("TermMigrationError");
      expect(error.message).toBe("Deprecated term 'Legacy' must not have a merge destination.");
    }
  );

  it("merges a deprecated source and clears its advisory replacement", async () => {
    const s = base();
    const source = {
      ...term("source", "Legacy", "concept", "deprecated"),
      replacementTermId: termId("replacement"),
    };
    const replacement = term("replacement", "Recommended", "concept");
    const destination = term("destination", "Current", "concept");
    for (const value of [source, replacement, destination]) s.terms.set(value.id, value);
    s.names.push(
      name(source.id, "concept", "Legacy", "canonical"),
      name(replacement.id, "concept", "Recommended", "canonical"),
      name(destination.id, "concept", "Current", "canonical")
    );
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          return yield* (yield* MigrationServiceTag).applyMerge({
            source: { id: source.id },
            destination: { id: destination.id },
            journalEntryId: journalEntryId("merge-deprecated"),
          });
        }),
        layer(s)
      )
    );
    expect(result.source.status).toBe("merged");
    expect(result.source.replacementTermId).toBeUndefined();
    expect(s.terms.get(source.id)?.replacementTermId).toBeUndefined();
  });

  it("allows replacing or clearing a deprecation recommendation but rejects an exact no-op", async () => {
    const s = base();
    const source = {
      ...term("source", "Legacy", "concept", "deprecated"),
      replacementTermId: termId("first"),
    };
    const first = term("first", "First", "concept");
    const second = term("second", "Second", "concept");
    for (const value of [source, first, second]) s.terms.set(value.id, value);
    s.names.push(
      name(source.id, "concept", "Legacy", "canonical"),
      name(first.id, "concept", "First", "canonical"),
      name(second.id, "concept", "Second", "canonical")
    );
    const service = MigrationServiceTag;
    const noOp = await Effect.runPromise(
      Effect.flip(
        Effect.provide(
          Effect.gen(function* () {
            return yield* (yield* service).planDeprecate({
              term: { id: source.id },
              replacement: { id: first.id },
            });
          }),
          layer(s)
        )
      )
    );
    expect(noOp).toBeInstanceOf(ValidationError);
    expect(noOp.message).toContain("already deprecated");

    const changed = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          return yield* (yield* MigrationServiceTag).applyDeprecate({
            term: { id: source.id },
            replacement: { id: second.id },
            journalEntryId: journalEntryId("change"),
          });
        }),
        layer(s)
      )
    );
    expect(changed.term.replacementTermId).toBe(second.id);

    const cleared = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          return yield* (yield* MigrationServiceTag).applyDeprecate({
            term: { id: source.id },
            journalEntryId: journalEntryId("clear"),
          });
        }),
        layer(s)
      )
    );
    expect(cleared.term.replacementTermId).toBeUndefined();
  });

  it("generates unique journal IDs when callers do not supply one", async () => {
    const s = base();
    const first = term("first", "First", "concept");
    const second = term("second", "Second", "concept");
    s.terms.set(first.id, first);
    s.terms.set(second.id, second);
    s.names.push(
      name(first.id, "concept", "First", "canonical"),
      name(second.id, "concept", "Second", "canonical")
    );
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const service = yield* MigrationServiceTag;
          const one = yield* service.applyDeprecate({ term: { id: first.id } });
          const two = yield* service.applyDeprecate({ term: { id: second.id } });
          return [one.journalEntry.id, two.journalEntry.id];
        }),
        layer(s)
      )
    );
    expect(result[0]).not.toBe(result[1]);
    expect(result[0]).toMatch(/^journal-deprecate-first-none-/);
  });

  it("rejects malformed local lifecycle state before planning", async () => {
    const s = base();
    const malformed = {
      ...term("malformed", "Malformed", "concept"),
      replacementTermId: termId("target"),
    };
    const target = term("target", "Target", "concept");
    s.terms.set(malformed.id, malformed);
    s.terms.set(target.id, target);
    s.names.push(
      name(malformed.id, "concept", "Malformed", "canonical"),
      name(target.id, "concept", "Target", "canonical")
    );
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.provide(
          Effect.gen(function* () {
            return yield* (yield* MigrationServiceTag).planDeprecate({
              term: { id: malformed.id },
            });
          }),
          layer(s)
        )
      )
    );
    expect(error).toBeInstanceOf(TermMigrationError);
  });

  it("rejects multi-hop replacement cycles instead of shallowly accepting them", async () => {
    const s = base();
    const source = term("source", "Old", "concept");
    const first = { ...term("first", "First", "concept"), replacementTermId: termId("second") };
    const second = { ...term("second", "Second", "concept"), replacementTermId: first.id };
    s.terms.set(source.id, source);
    s.terms.set(first.id, first);
    s.terms.set(second.id, second);
    s.names.push(
      name(source.id, "concept", "Old", "canonical"),
      name(first.id, "concept", "First", "canonical"),
      name(second.id, "concept", "Second", "canonical")
    );

    const error = await Effect.runPromise(
      Effect.flip(
        Effect.provide(
          Effect.gen(function* () {
            return yield* (yield* MigrationServiceTag).planDeprecate({
              term: { id: source.id },
              replacement: { id: first.id },
            });
          }),
          layer(s)
        )
      )
    );
    expect(error).toBeInstanceOf(TermMigrationError);
    expect(error.message).toContain("lifecycle pointers");
  });
});
