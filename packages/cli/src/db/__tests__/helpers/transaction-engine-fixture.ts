import assert from "node:assert/strict";
import {
  EntityRepositoryTag,
  type JournalEntryId,
  MigrationJournalRepositoryTag,
  MigrationServiceTag,
  type TagId,
  TagRepositoryTag,
  type TermId,
  TermRepositoryTag,
  TransactionEngineTag,
} from "@kioku/core";
import { Effect } from "effect";
import { CliServicesLive } from "../../layers.js";

const program = Effect.gen(function* () {
  const entityRepo = yield* EntityRepositoryTag;
  const tagRepo = yield* TagRepositoryTag;
  const termRepo = yield* TermRepositoryTag;
  const journalRepo = yield* MigrationJournalRepositoryTag;
  const migrationService = yield* MigrationServiceTag;
  const transactionEngine = yield* TransactionEngineTag;

  const nestedError = yield* transactionEngine.run(() =>
    Effect.flip(transactionEngine.run(() => Effect.void))
  );
  assert.equal(nestedError._tag, "RepositoryError");

  const document = yield* entityRepo.createDoc({
    title: "Rename rollback",
    content: "Historical Kioku context.",
  });
  const tagId = "kioku" as TagId;
  yield* tagRepo.create({ id: tagId, name: "Kioku" });
  yield* tagRepo.applyToEntity(tagId, document.id);

  const seedTerm = yield* termRepo.create({
    id: "term-brand-seed",
    canonicalName: "Seed",
    kind: "brand",
  });
  const duplicateJournalId = "journal-duplicate" as JournalEntryId;
  yield* journalRepo.record({
    id: duplicateJournalId,
    operation: "rename",
    kind: "brand",
    fromName: "seed-old",
    toName: "seed",
    termId: seedTerm.id,
    affectedEntityIds: [],
    dryRun: false,
  });

  const error = yield* Effect.flip(
    migrationService.applyRename({
      kind: "brand",
      fromName: "kioku",
      toName: "AeroGraph",
      termId: "term-brand-aerograph" as TermId,
      journalEntryId: duplicateJournalId,
    })
  );

  assert.equal(error._tag, "RepositoryError");
  assert.deepEqual(yield* termRepo.findByName("AeroGraph", "brand"), []);

  const tag = yield* tagRepo.getById(tagId);
  assert.equal(tag.name, "Kioku");
  assert.equal(tag.aliases, undefined);
  assert.equal(tag.termId, undefined);

  const attachedEntities = yield* entityRepo.getByTag(tagId);
  assert.deepEqual(
    attachedEntities.map(({ id }) => id),
    [document.id]
  );
  assert.equal((yield* journalRepo.listRecent()).length, 1);
});

await Effect.runPromise(Effect.scoped(Effect.provide(program, CliServicesLive(":memory:"))));
