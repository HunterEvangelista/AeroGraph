import { join } from "node:path";
import { EntityRepositoryTag, TagRepositoryTag, TermRepositoryTag } from "@kioku/core";
import { Effect } from "effect";
import { CliServicesLive } from "../../db/layers";

const root = process.argv[2];
if (!root) throw new Error("Workspace path is required");

const program = Effect.gen(function* () {
  const terms = yield* TermRepositoryTag;
  const tags = yield* TagRepositoryTag;
  const entities = yield* EntityRepositoryTag;
  const oldApi = yield* terms.create({
    id: "term-old-api",
    canonicalName: "Shared",
    kind: "api",
    description: "Old API",
    aliases: ["Legacy Shared"],
  });
  yield* terms.create({ id: "term-shared-project", canonicalName: "Shared", kind: "project" });
  yield* terms.create({ id: "term-new-api", canonicalName: "New API", kind: "api" });
  // The same replacement name exists in another kind so CLI resolution must
  // carry the source kind through to lifecycle operations.
  yield* terms.create({ id: "term-new-project", canonicalName: "New API", kind: "project" });
  yield* terms.create({ id: "term-unrelated", canonicalName: "Unrelated", kind: "concept" });
  // Deliberately has no tags: lifecycle output must still describe a real change.
  yield* terms.create({ id: "term-zero-api", canonicalName: "Zero API", kind: "api" });
  const primaryTag = yield* tags.create({
    id: "shared-tag",
    name: "Shared",
    aliases: ["legacy-shared", "shared-api"],
    termId: oldApi.id,
  });
  const secondaryTag = yield* tags.create({
    id: "shared-tag-alias",
    name: "Shared API",
    aliases: ["legacy-shared-api"],
    termId: oldApi.id,
  });
  const entity = yield* entities.createDoc({ title: "Shared document", content: "fixture" });
  yield* tags.applyToEntity(primaryTag.id, entity.id);
  yield* tags.applyToEntity(secondaryTag.id, entity.id);
});

await Effect.runPromise(
  Effect.scoped(Effect.provide(program, CliServicesLive(join(root, ".kioku", "kioku.db"))))
);
