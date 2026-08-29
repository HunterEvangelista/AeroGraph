import { JournalEntryIdSchema, MigrationJournalRepositoryTag } from "@aerograph/core";
import { Effect } from "effect";
import { CliServicesLive } from "../../db/layers";

const dbPath = process.argv[2];
const journalId = process.argv[3] ? JournalEntryIdSchema.make(process.argv[3]) : undefined;
if (!dbPath || !journalId) {
  throw new Error("Expected database path and journal ID");
}

const entry = await Effect.runPromise(
  Effect.scoped(
    Effect.provide(
      Effect.gen(function* () {
        const repository = yield* MigrationJournalRepositoryTag;
        return yield* repository.getById(journalId);
      }),
      CliServicesLive(dbPath)
    )
  )
);

console.log(JSON.stringify(entry));
