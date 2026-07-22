import { join } from "node:path";
import {
  type TagId,
  TagRepositoryTag,
  TERM_KINDS,
  type TermId,
  type TermKind,
  TermRepositoryTag,
} from "@kioku/core";
import { Effect } from "effect";
import { CliServicesLive } from "../../db/layers.js";

const rootPath = process.argv[2];
if (!rootPath) {
  throw new Error("Expected workspace root path");
}

const canonicalName = process.argv[3] ?? "Kioku";
const kindValue = process.argv[4] ?? "brand";
if (!(TERM_KINDS as ReadonlyArray<string>).includes(kindValue)) {
  throw new Error(`Invalid term kind: ${kindValue}`);
}
const kind = kindValue as TermKind;
const termId = (process.argv[5] ?? "term-brand-kioku") as TermId;
const tagIds = (process.argv[6] ?? "kioku")
  .split(",")
  .filter(Boolean)
  .map((tagId) => tagId as TagId);

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
  Effect.scoped(Effect.provide(program, CliServicesLive(join(rootPath, ".kioku", "kioku.db"))))
);
