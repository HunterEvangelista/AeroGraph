import { join } from "node:path";
import {
  TagIdSchema,
  TagRepositoryTag,
  TermIdSchema,
  TermKind,
  TermRepositoryTag,
} from "@aerograph/core";
import { Effect, Schema } from "effect";
import { CliServicesLive } from "../../db/layers";

const rootPath = process.argv[2];
if (!rootPath) {
  throw new Error("Expected workspace root path");
}

const canonicalName = process.argv[3] ?? "Kioku";
const kindValue = process.argv[4] ?? "brand";
const kind = Schema.decodeUnknownSync(TermKind)(kindValue);
const termId = TermIdSchema.make(process.argv[5] ?? "term-brand-kioku");
const tagIds = (process.argv[6] ?? "kioku")
  .split(",")
  .filter(Boolean)
  .map((tagId) => TagIdSchema.make(tagId));

const program = Effect.gen(function* () {
  const termRepo = yield* TermRepositoryTag;
  const tagRepo = yield* TagRepositoryTag;
  yield* termRepo.create({
    id: termId,
    canonicalName,
    kind,
  });
  for (const tagId of tagIds) {
    yield* tagRepo.update(tagId, { termId });
  }
});

await Effect.runPromise(
  Effect.scoped(
    Effect.provide(program, CliServicesLive(join(rootPath, ".aerograph", "aerograph.db")))
  )
);
