import { TagIdSchema, TagRepositoryTag } from "@aerograph/core";
import { Effect } from "effect";
import { CliServicesLive } from "../../db/layers";

const dbPath = process.argv[2];
const tagId = process.argv[3] ? TagIdSchema.make(process.argv[3]) : undefined;
const name = process.argv[4];
if (!dbPath || !tagId || !name) {
  throw new Error("Expected database path, tag ID, and display name");
}

await Effect.runPromise(
  Effect.scoped(
    Effect.provide(
      Effect.gen(function* () {
        const repository = yield* TagRepositoryTag;
        yield* repository.update(tagId, { name });
      }),
      CliServicesLive(dbPath)
    )
  )
);
