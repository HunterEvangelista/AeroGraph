import { Effect, Layer, Schema } from "effect";
import { describe, expect, it } from "vitest";
import type { Tag, TagId } from "../domain/tag";
import { TagIdSchema } from "../domain/tag";
import type { Term, TermId, TermKind, TermName } from "../domain/term";
import { normalizeTermName, TermIdSchema } from "../domain/term";
import { TagNotFoundError, TermNotFoundError, ValidationError } from "../errors";
import type { MigrationJournalRepository } from "../repository/migration-journal-repository";
import { MigrationJournalRepositoryTag } from "../repository/migration-journal-repository";
import type { TagRepository } from "../repository/tag-repository";
import { TagRepositoryTag } from "../repository/tag-repository";
import type { ResolvedTermName, TermRepository } from "../repository/term-repository";
import { TermRepositoryTag } from "../repository/term-repository";
import type { TransactionEngine, TransactionRepositories } from "../repository/transaction-engine";
import { TransactionEngineTag } from "../repository/transaction-engine";
import type { GovernTagInput, TermGovernanceService } from "../services/term-governance-service";
import { TermGovernanceServiceTag } from "../services/term-governance-service";
import { TermGovernanceServiceLive } from "../services/term-governance-service.live";
import { TermServiceLive } from "../services/term-service.live";

const date = new Date("2025-01-01T00:00:00.000Z");
const id = (value: string): TermId => Schema.decodeUnknownSync(TermIdSchema)(value);
const tagId = (value: string): TagId => Schema.decodeUnknownSync(TagIdSchema)(value);

type Store = { terms: Map<TermId, Term>; names: TermName[]; tags: Map<TagId, Tag> };

const term = (value: string, canonicalName: string, kind: TermKind): Term => ({
  id: id(value),
  canonicalName,
  kind,
  status: "active",
  createdAt: date,
  updatedAt: date,
});
const tag = (value: string, name: string, termId?: TermId): Tag => ({
  id: tagId(value),
  name,
  termId,
  createdAt: date,
});
const addRegisteredName = (
  store: Store,
  value: Term,
  displayName: string,
  nameKind: TermName["nameKind"] = "canonical"
) =>
  store.names.push({
    termId: value.id,
    kind: value.kind,
    name: normalizeTermName(displayName),
    displayName,
    nameKind,
    createdAt: date,
  });

const makeLayer = (store: Store) => {
  const getById = (termId: TermId) => {
    const value = store.terms.get(termId);
    return value ? Effect.succeed(value) : Effect.fail(new TermNotFoundError({ name: termId }));
  };
  const findByName = (value: string, kind?: TermKind) =>
    Effect.succeed(
      store.names
        .filter((name) => name.name === normalizeTermName(value) && (!kind || name.kind === kind))
        .flatMap((name): ReadonlyArray<ResolvedTermName> => {
          const value = store.terms.get(name.termId);
          return value ? [{ term: value, termName: name }] : [];
        })
    );
  // SAFETY: The live services exercise only the repository operations implemented by this focused in-memory fixture.
  const terms = {
    create: (input: {
      id: string;
      canonicalName: string;
      kind: TermKind;
      aliases?: ReadonlyArray<string>;
    }) =>
      Effect.sync(() => {
        const value = term(input.id, input.canonicalName, input.kind);
        store.terms.set(value.id, value);
        addRegisteredName(store, value, input.canonicalName);
        for (const alias of input.aliases ?? []) addRegisteredName(store, value, alias, "alias");
        return value;
      }),
    getById,
    getByCanonicalName: () => Effect.die("unused"),
    findByName,
    list: (kind?: TermKind) =>
      Effect.succeed([...store.terms.values()].filter((value) => !kind || value.kind === kind)),
    addName: (input: {
      termId: TermId;
      kind: TermKind;
      name: string;
      displayName: string;
      nameKind: TermName["nameKind"];
    }) =>
      Effect.sync(() => {
        const value = {
          termId: input.termId,
          kind: input.kind,
          name: normalizeTermName(input.name),
          displayName: input.displayName,
          nameKind: input.nameKind,
          createdAt: date,
        };
        store.names.push(value);
        return value;
      }),
    ensureName: undefined,
    getByIds: (ids: ReadonlyArray<TermId>) =>
      Effect.succeed(
        ids.flatMap((value) => {
          const found = store.terms.get(value);
          return found ? [found] : [];
        })
      ),
    listNamesByTermIds: (ids: ReadonlyArray<TermId>) =>
      Effect.succeed(store.names.filter((name) => ids.includes(name.termId))),
    listMergedInto: () => Effect.succeed([]),
    listNames: (termId: TermId) =>
      Effect.succeed(store.names.filter((name) => name.termId === termId)),
    updateName: () => Effect.die("unused"),
    update: () => Effect.die("unused"),
    renameCanonical: () => Effect.die("unused"),
  } as TermRepository;
  // SAFETY: Governance only reads, lists, and updates tags in this focused in-memory fixture.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions
  const tags = {
    getById: (tagIdValue: TagId) => {
      const value = store.tags.get(tagIdValue);
      return value
        ? Effect.succeed(value)
        : Effect.fail(new TagNotFoundError({ tagId: tagIdValue }));
    },
    getAll: Effect.succeed([...store.tags.values()]),
    update: (tagIdValue: TagId, updates: { termId?: TermId }) =>
      Effect.gen(function* () {
        const current = yield* tags.getById(tagIdValue);
        const updated = { ...current, ...updates };
        store.tags.set(tagIdValue, updated);
        return updated;
      }),
    // SAFETY: The fixture implements the repository methods used by governance; other methods are irrelevant here.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions
  } as unknown as TagRepository;
  // SAFETY: Audit methods are not exercised by governance tests; these stubs satisfy the shared transaction fixture.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions
  const journal = {
    listByTerm: () => Effect.succeed([]),
    listRecent: () => Effect.succeed([]),
    record: () => Effect.die("unused"),
    getById: () => Effect.die("unused"),
    // SAFETY: The fixture implements no audit behavior because these tests cover governance only.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions
  } as unknown as MigrationJournalRepository;
  // SAFETY: The governance transaction path uses only terms and tags; unused repositories are intentionally omitted.
  const repositories = {
    terms,
    tags,
    migrationJournal: journal,
  } as TransactionRepositories;
  // SAFETY: Transaction execution is synchronous in this in-memory fixture and delegates to the supplied repositories.
  const transaction = {
    run: <A, E>(operation: (repositories: TransactionRepositories) => Effect.Effect<A, E>) =>
      operation(repositories),
  } as TransactionEngine;
  const repos = Layer.mergeAll(
    Layer.succeed(TermRepositoryTag, terms),
    Layer.succeed(TagRepositoryTag, tags),
    Layer.succeed(MigrationJournalRepositoryTag, journal),
    Layer.succeed(TransactionEngineTag, transaction)
  );
  return Layer.provideMerge(TermGovernanceServiceLive, Layer.provideMerge(TermServiceLive, repos));
};

type GovernanceEffect<A> = Effect.Effect<A, unknown, TermGovernanceServiceTag>;
const run = <A>(store: Store, effect: GovernanceEffect<A>) =>
  Effect.runPromise(Effect.provide(effect, makeLayer(store)));
const serviceEffect = <A>(
  f: (service: TermGovernanceService) => Effect.Effect<A, unknown>
): GovernanceEffect<A> =>
  Effect.gen(function* () {
    return yield* f(yield* TermGovernanceServiceTag);
  });
const fresh = (): Store => ({ terms: new Map(), names: [], tags: new Map() });
const governed = (
  store: Store,
  termValue: Term,
  tagValue = tag("tag", termValue.canonicalName)
) => {
  store.terms.set(termValue.id, termValue);
  addRegisteredName(store, termValue, termValue.canonicalName);
  tagValue = { ...tagValue, termId: termValue.id };
  store.tags.set(tagValue.id, tagValue);
  return tagValue;
};

const failure = async <A>(store: Store, effect: GovernanceEffect<A>) =>
  Effect.runPromise(Effect.flip(Effect.provide(effect, makeLayer(store))));

describe("TermGovernanceService", () => {
  it("generates term-prefixed IDs, accepts custom IDs, and exposes aliases", async () => {
    const store = fresh();
    const result = await run(
      store,
      serviceEffect((service) =>
        Effect.all([
          service.create({ canonicalName: "Authentication", kind: "concept", aliases: ["Auth"] }),
          service.create({
            id: "custom-term",
            canonicalName: "Payments",
            kind: "feature",
            aliases: ["Billing"],
          }),
        ])
      )
    );
    expect(result[0]?.term.id).toMatch(/^term-/);
    expect(result[1]?.term.id).toBe("custom-term");
    expect(result[0]?.aliases.map((alias) => alias.displayName)).toEqual(["Auth"]);
    expect(
      (
        await run(
          store,
          serviceEffect((service) => service.show("Auth"))
        )
      ).aliases[0]?.displayName
    ).toBe("Auth");
  });

  it("inspects and lists governed and ungoverned tags", async () => {
    const store = fresh();
    const value = term("concept-auth", "Authentication", "concept");
    const governedTag = governed(store, value, tag("a", "Auth"));
    store.tags.set(tagId("b"), tag("b", "Loose"));
    const service = serviceEffect((service) =>
      Effect.all([
        service.inspectTag(governedTag.id),
        service.listTags("governed"),
        service.listTags("ungoverned"),
      ])
    );
    const [inspection, governedTags, ungovernedTags] = await run(store, service);
    expect(inspection.term?.term.id).toBe(value.id);
    expect(governedTags.map((item) => item.tag.id)).toEqual([governedTag.id]);
    expect(ungovernedTags.map((item) => item.tag.id)).toEqual([tagId("b")]);
  });

  it("supports first assignment and an idempotent same assignment", async () => {
    const store = fresh();
    const value = term("concept-auth", "Authentication", "concept");
    store.terms.set(value.id, value);
    addRegisteredName(store, value, value.canonicalName);
    store.tags.set(tagId("a"), tag("a", "Auth"));
    const result = await run(
      store,
      serviceEffect((service) =>
        Effect.gen(function* () {
          const first = yield* service.governTag({ tagId: tagId("a"), term: { id: value.id } });
          const second = yield* service.governTag({ tagId: tagId("a"), term: "Authentication" });
          return [first, second];
        })
      )
    );
    expect(result[0]?.term?.term.id).toBe(value.id);
    expect(result[1]?.tag.termId).toBe(value.id);
  });

  it("rejects unsafe assignments without mutating the tag", async () => {
    const store = fresh();
    const old = term("old", "Old", "concept");
    const next = term("next", "Next", "concept");
    const other = term("other", "Other", "feature");
    for (const value of [old, next, other]) {
      store.terms.set(value.id, value);
      addRegisteredName(store, value, value.canonicalName);
    }
    store.tags.set(tagId("a"), tag("a", "Old", old.id));
    store.tags.set(tagId("b"), tag("b", "Loose"));
    const attempt = (input: GovernTagInput) => serviceEffect((service) => service.governTag(input));
    const cases = [
      attempt({ tagId: tagId("a"), term: { id: next.id } }),
      attempt({ tagId: tagId("a"), term: { id: next.id }, replace: { id: other.id } }),
      attempt({ tagId: tagId("b"), term: { id: next.id }, replace: { id: old.id } }),
      attempt({ tagId: tagId("a"), term: { id: other.id }, replace: { id: old.id } }),
    ];
    for (const operation of cases) {
      const error = await failure(store, operation);
      expect(error).toBeInstanceOf(ValidationError);
      expect(store.tags.get(tagId("a"))?.termId).toBe(old.id);
      expect(store.tags.get(tagId("b"))?.termId).toBeUndefined();
    }
  });

  it("replaces safely with the same kind and resolves a merged target to its active destination", async () => {
    const store = fresh();
    const old = term("old", "Old", "concept");
    const replacement = term("replacement", "Replacement", "concept");
    const destination = term("destination", "Current", "concept");
    const other = term("other", "Other", "feature");
    const source = {
      ...term("source", "Legacy", "concept"),
      status: "merged" as const,
      mergedIntoId: destination.id,
    };
    for (const value of [old, replacement, destination, other, source]) {
      store.terms.set(value.id, value);
      addRegisteredName(store, value, value.canonicalName);
    }
    store.tags.set(tagId("a"), tag("a", "Old", old.id));
    const safelyReplaced = await run(
      store,
      serviceEffect((service) =>
        service.governTag({
          tagId: tagId("a"),
          term: { id: replacement.id },
          replace: { id: old.id },
        })
      )
    );
    expect(safelyReplaced.tag.termId).toBe(replacement.id);
    const result = await run(
      store,
      serviceEffect((service) =>
        service.governTag({
          tagId: tagId("a"),
          term: { name: "Legacy", kind: "concept" },
          replace: { id: replacement.id },
        })
      )
    );
    expect(result.tag.termId).toBe(destination.id);
    expect(store.tags.get(tagId("a"))?.termId).toBe(destination.id);
    const failed = await failure(
      store,
      serviceEffect((service) =>
        service.governTag({
          tagId: tagId("a"),
          term: { id: other.id },
          replace: { id: destination.id },
        })
      )
    );
    expect(failed).toBeInstanceOf(ValidationError);
    expect(store.tags.get(tagId("a"))?.termId).toBe(destination.id);
  });

  it("reports missing tags and missing target terms without writes", async () => {
    const store = fresh();
    const value = term("value", "Value", "concept");
    governed(store, value);
    const missingTag = await failure(
      store,
      serviceEffect((service) =>
        service.governTag({ tagId: tagId("missing"), term: { id: value.id } })
      )
    );
    const missingTarget = await failure(
      store,
      serviceEffect((service) =>
        service.governTag({ tagId: tagId("tag"), term: { id: id("missing") } })
      )
    );
    expect(missingTag).toBeInstanceOf(TagNotFoundError);
    expect(missingTarget).toBeInstanceOf(TermNotFoundError);
    expect(store.tags.get(tagId("tag"))?.termId).toBe(value.id);
  });
});
