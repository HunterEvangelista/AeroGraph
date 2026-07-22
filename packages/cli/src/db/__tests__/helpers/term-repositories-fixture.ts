import assert from "node:assert/strict";
import {
  type JournalEntryId,
  MigrationJournalRepositoryTag,
  TermAlreadyExistsError,
  type TermId,
  TermRepositoryTag,
  ValidationError,
} from "@kioku/core";
import { Effect, Layer } from "effect";
import { DatabaseClientLive } from "../../client.js";
import { SqliteMigrationJournalRepositoryLive } from "../../migration-journal-repository.js";
import { SqliteTermRepositoryLive } from "../../term-repository.js";

const createRepositoryLayer = () => {
  return Layer.mergeAll(SqliteTermRepositoryLive, SqliteMigrationJournalRepositoryLive).pipe(
    Layer.provide(DatabaseClientLive(":memory:"))
  );
};

const runTermCreateScenario = Effect.gen(function* () {
  const repo = yield* TermRepositoryTag;
  const term = yield* repo.create({
    id: "term-aerograph",
    canonicalName: "AeroGraph",
    kind: "brand",
    aliases: ["Kioku", "KIOKU"],
  });
  const names = yield* repo.listNames(term.id);

  assert.equal(term.canonicalName, "AeroGraph");
  assert.equal(term.status, "active");
  assert.deepEqual(
    names.map(({ name, displayName, nameKind }) => ({ name, displayName, nameKind })),
    [
      { name: "aerograph", displayName: "AeroGraph", nameKind: "canonical" },
      { name: "kioku", displayName: "Kioku", nameKind: "alias" },
    ]
  );
});

const runTermResolutionScenario = Effect.gen(function* () {
  const repo = yield* TermRepositoryTag;
  yield* repo.create({
    id: "term-brand-aerograph",
    canonicalName: "AeroGraph",
    kind: "brand",
    aliases: ["Kioku"],
  });
  yield* repo.create({
    id: "term-package-kioku",
    canonicalName: "Kioku",
    kind: "package",
  });

  const allMatches = yield* repo.findByName("KIOKU");
  const brandMatches = yield* repo.findByName("kioku", "brand");

  assert.deepEqual(
    allMatches.map(({ term }) => [term.kind, term.canonicalName]),
    [
      ["brand", "AeroGraph"],
      ["package", "Kioku"],
    ]
  );
  assert.equal(brandMatches.length, 1);
  assert.equal(brandMatches[0]?.term.kind, "brand");
  assert.equal(brandMatches[0]?.termName.name, "kioku");
});

const runTermUpdateScenario = Effect.gen(function* () {
  const repo = yield* TermRepositoryTag;
  const term = yield* repo.create({
    id: "term-feature-memory",
    canonicalName: "Memory Graph",
    kind: "feature",
  });

  const deprecatedName = yield* repo.addName({
    termId: term.id,
    kind: "feature",
    name: "Project_Memory",
    displayName: "Project Memory",
    nameKind: "deprecated",
  });

  const renamed = yield* repo.renameCanonical(term.id, "Governed Memory Graph");
  const displayCorrected = yield* repo.renameCanonical(term.id, "GOVERNED_MEMORY_GRAPH");
  const updated = yield* repo.update(term.id, { status: "deprecated" });
  const renamedName = yield* repo.updateName(term.id, "Project Memory", {
    nameKind: "alias",
    displayName: "Project Memory Legacy",
  });

  assert.equal(deprecatedName.name, "project-memory");
  assert.equal(deprecatedName.displayName, "Project Memory");
  assert.equal(renamedName.nameKind, "alias");
  assert.equal(renamedName.displayName, "Project Memory Legacy");
  assert.equal(renamed.canonicalName, "Governed Memory Graph");
  assert.equal(displayCorrected.canonicalName, "GOVERNED_MEMORY_GRAPH");
  assert.equal(updated.status, "deprecated");
  const names = yield* repo.listNames(term.id);
  assert.equal(names.filter(({ nameKind }) => nameKind === "canonical").length, 1);
  const canonical = names.find(({ nameKind }) => nameKind === "canonical");
  assert.equal(canonical?.name, "governed-memory-graph");
  assert.equal(canonical?.displayName, "GOVERNED_MEMORY_GRAPH");

  const canonicalAddError = yield* Effect.flip(
    repo.addName({
      termId: term.id,
      kind: "feature",
      name: "Second Canonical",
      displayName: "Second Canonical",
      nameKind: "canonical",
    } as never)
  );
  assert.ok(canonicalAddError instanceof ValidationError);
  const canonicalUpdateError = yield* Effect.flip(
    repo.update(term.id, { canonicalName: "Direct Change" } as never)
  );
  assert.ok(canonicalUpdateError instanceof ValidationError);
});

const runDuplicateScenario = Effect.gen(function* () {
  const repo = yield* TermRepositoryTag;
  yield* repo.create({ id: "term-brand-kioku", canonicalName: "Kioku", kind: "brand" });
  const error = yield* Effect.flip(
    repo.create({ id: "term-brand-kioku-duplicate", canonicalName: "KIOKU", kind: "brand" })
  );
  assert.ok(error instanceof TermAlreadyExistsError);
});

const runJournalScenario = Effect.gen(function* () {
  const termRepo = yield* TermRepositoryTag;
  const journalRepo = yield* MigrationJournalRepositoryTag;

  const term = yield* termRepo.create({
    id: "term-journal-aerograph",
    canonicalName: "AeroGraph",
    kind: "brand",
  });

  const entry = yield* journalRepo.record({
    id: "journal-rename-1",
    operation: "rename",
    kind: "brand",
    fromName: "kioku",
    toName: "aerograph",
    termId: term.id,
    affectedEntityIds: ["doc-1", "doc-2"],
    reason: "Project rename",
    appliedBy: "test",
    dryRun: false,
  });

  const byId = yield* journalRepo.getById(entry.id as JournalEntryId);
  const byTerm = yield* journalRepo.listByTerm(term.id as TermId);
  const recent = yield* journalRepo.listRecent(1);

  assert.equal(entry.affectedCount, 2);
  assert.deepEqual(entry.affectedEntityIds, ["doc-1", "doc-2"]);
  assert.equal(byId.reason, "Project rename");
  assert.deepEqual(
    byTerm.map(({ id }) => id),
    [entry.id]
  );
  assert.deepEqual(
    recent.map(({ id }) => id),
    [entry.id]
  );
});

await Effect.runPromise(Effect.provide(runTermCreateScenario, createRepositoryLayer()));
await Effect.runPromise(Effect.provide(runTermResolutionScenario, createRepositoryLayer()));
await Effect.runPromise(Effect.provide(runTermUpdateScenario, createRepositoryLayer()));
await Effect.runPromise(Effect.provide(runDuplicateScenario, createRepositoryLayer()));
await Effect.runPromise(Effect.provide(runJournalScenario, createRepositoryLayer()));
