import { join } from "node:path";
import { type TagId, TagRepositoryTag } from "@kioku/core";
import { Effect } from "effect";
import { CliServicesLive } from "../../db/layers.js";

const rootPath = process.argv[2];
const tagId = process.argv[3] as TagId | undefined;
const name = process.argv[4];
if (!rootPath || !tagId || !name) {
  throw new Error("Expected workspace root path, tag ID, and display name");
}

await Effect.runPromise(
  Effect.scoped(
    Effect.provide(
      Effect.gen(function* () {
        const repository = yield* TagRepositoryTag;
        yield* repository.update(tagId, { name });
      }),
      CliServicesLive(join(rootPath, ".kioku", "kioku.db"))
    )
  )
);
