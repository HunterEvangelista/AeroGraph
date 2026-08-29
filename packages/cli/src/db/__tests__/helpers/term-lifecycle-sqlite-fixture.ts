import assert from "node:assert/strict";
import {
  EntityRepositoryTag,
  JournalEntryIdSchema,
  MigrationJournalRepositoryTag,
  MigrationServiceTag,
  TagRepositoryTag,
  TermRepositoryTag,
} from "@aerograph/core";
import { Effect, Exit } from "effect";
import { CliServicesLive } from "../../layers";

const result = await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const terms = yield* TermRepositoryTag;
      const journal = yield* MigrationJournalRepositoryTag;
      const source = yield* terms.create({ id: "source", canonicalName: "Old API", kind: "api" });
      const target = yield* terms.create({
        id: "target",
        canonicalName: "Current API",
        kind: "api",
      });

      yield* terms.update(source.id, { status: "deprecated", replacementTermId: target.id });
      const stored = yield* terms.getById(source.id);
      const entry = yield* journal.record({
        id: "journal-deprecate",
        operation: "deprecate",
        kind: "api",
        fromName: source.canonicalName,
        toName: target.canonicalName,
        termId: source.id,
        relatedTermId: target.id,
        affectedEntityIds: [],
        dryRun: false,
      });
      assert.equal(stored.replacementTermId, target.id);
      assert.equal(entry.toName, target.canonicalName);
      assert.deepEqual(
        (yield* journal.listByTerm(source.id)).map(({ id }) => id),
        [entry.id]
      );
      assert.deepEqual(
        (yield* journal.listByTerm(target.id)).map(({ id }) => id),
        [entry.id]
      );

      const tagRepo = yield* TagRepositoryTag;
      const entityRepo = yield* EntityRepositoryTag;
      const migrations = yield* MigrationServiceTag;
      const entity = yield* entityRepo.createDoc({ title: "Affected", content: "body" });
      const mergeSource = yield* terms.create({
        id: "merge-source",
        canonicalName: "Legacy",
        kind: "project",
      });
      const mergeTarget = yield* terms.create({
        id: "merge-target",
        canonicalName: "Current",
        kind: "project",
      });
      const mergeTag = yield* tagRepo.create({
        id: "merge-tag",
        name: "Legacy",
        termId: mergeSource.id,
      });
      yield* tagRepo.applyToEntity(mergeTag.id, entity.id);
      yield* migrations.applyMerge({
        source: { id: mergeSource.id },
        destination: { id: mergeTarget.id },
        journalEntryId: JournalEntryIdSchema.make("duplicate-journal"),
      });

      const secondSource = yield* terms.create({
        id: "merge-source-2",
        canonicalName: "Legacy Two",
        kind: "project",
      });
      const secondTag = yield* tagRepo.create({
        id: "merge-tag-2",
        name: "Legacy Two",
        termId: secondSource.id,
      });
      const failed = yield* Effect.exit(
        migrations.applyMerge({
          source: { id: secondSource.id },
          destination: { id: mergeTarget.id },
          journalEntryId: JournalEntryIdSchema.make("duplicate-journal"),
        })
      );
      assert.ok(Exit.isFailure(failed));
      assert.equal((yield* terms.getById(secondSource.id)).status, "active");
      assert.equal((yield* tagRepo.getById(secondTag.id)).termId, secondSource.id);
      assert.deepEqual(
        (yield* tagRepo.getTagsForEntity(entity.id)).map(({ id }) => id),
        [mergeTag.id]
      );
    })
  ).pipe(Effect.provide(CliServicesLive(":memory:")))
);

assert.ok(result === undefined);
