import assert from "node:assert/strict";
import {
  BrandedId,
  EntityRepositoryTag,
  EntityServiceTag,
  ProjectIdSchema,
  ProjectRepositoryTag,
  RepositoryError,
  TagRepositoryTag,
  TransactionEngineTag,
  VersionRepositoryTag,
} from "@aerograph/core";
import { Effect, Exit } from "effect";
import { CliServicesLive } from "../../layers";

const missingEntityId = BrandedId.make("missing-entity");
const missingProjectId = ProjectIdSchema.make("missing-project");

const program = Effect.gen(function* () {
  const projects = yield* ProjectRepositoryTag;
  const entities = yield* EntityRepositoryTag;
  const entityService = yield* EntityServiceTag;
  const tags = yield* TagRepositoryTag;
  const versions = yield* VersionRepositoryTag;
  const transactions = yield* TransactionEngineTag;

  assert.deepEqual(yield* projects.getAll, []);
  const second = yield* projects.create({ id: "project-b", name: "Shared name" });
  const first = yield* projects.create({ id: "project-a", name: "Shared name" });
  assert.equal(first.id, "project-a");
  assert.ok(first.createdAt instanceof Date);
  assert.deepEqual(yield* projects.getById(first.id), first);
  assert.deepEqual(yield* projects.getAll, [first, second]);
  assert.equal(
    (yield* Effect.flip(projects.getById(missingProjectId)))._tag,
    "ProjectNotFoundError"
  );
  assert.equal(
    (yield* Effect.flip(projects.create({ id: first.id, name: "Duplicate ID" })))._tag,
    "RepositoryError"
  );
  assert.equal(
    (yield* Effect.flip(projects.create({ id: "", name: "Invalid" })))._tag,
    "ValidationError"
  );
  assert.equal(
    (yield* Effect.flip(projects.create({ id: "invalid-name", name: "" })))._tag,
    "ValidationError"
  );
  assert.deepEqual(yield* projects.getAll, [first, second]);

  const shared = yield* entityService.createDoc({ title: "Shared", content: "Shared knowledge" });
  const local = yield* entities.createDoc({ title: "Local", content: "" });
  const unassigned = yield* entities.createDoc({ title: "Unassigned", content: "" });
  const tag = yield* tags.create({ id: "shared-tag", name: "Shared tag" });
  yield* tags.applyToEntity(tag.id, shared.id);
  const before = yield* entities.getById(shared.id);
  const historyBefore = yield* versions.getAllForEntity(shared.id);

  assert.deepEqual(yield* projects.getProjectsForEntity(shared.id), []);
  yield* projects.addEntity(first.id, shared.id);
  yield* projects.addEntity(first.id, shared.id);
  yield* projects.addEntity(second.id, shared.id);
  yield* projects.addEntity(first.id, local.id);
  assert.deepEqual(yield* projects.getProjectsForEntity(shared.id), [first, second]);
  assert.deepEqual(yield* projects.getProjectsForEntity(unassigned.id), []);
  assert.deepEqual(yield* projects.getProjectsForEntity(missingEntityId), []);
  assert.deepEqual(yield* projects.getEntityIds([]), []);
  assert.deepEqual(yield* projects.getEntityIds([missingProjectId]), []);
  assert.deepEqual(yield* projects.getEntityIds([second.id]), [shared.id]);
  assert.deepEqual(
    yield* projects.getEntityIds([second.id, first.id, second.id]),
    [shared.id, local.id].sort()
  );
  const largeScope = [
    first.id,
    ...Array.from({ length: 65_536 }, (_, index) => ProjectIdSchema.make(`absent-${index}`)),
    second.id,
  ];
  assert.deepEqual(yield* projects.getEntityIds(largeScope), [shared.id, local.id].sort());
  assert.deepEqual(
    yield* transactions.run((repositories) => repositories.projects.getEntityIds(largeScope)),
    [shared.id, local.id].sort()
  );
  assert.equal(
    (yield* Effect.flip(projects.addEntity(missingProjectId, shared.id)))._tag,
    "RepositoryError"
  );
  assert.equal(
    (yield* Effect.flip(projects.addEntity(first.id, missingEntityId)))._tag,
    "RepositoryError"
  );

  assert.equal(yield* projects.removeEntity(first.id, shared.id), true);
  assert.equal(yield* projects.removeEntity(first.id, shared.id), false);
  assert.equal(yield* projects.removeEntity(missingProjectId, shared.id), false);
  assert.deepEqual(yield* projects.getProjectsForEntity(shared.id), [second]);
  assert.equal(yield* projects.removeEntity(second.id, shared.id), true);
  assert.deepEqual(yield* projects.getProjectsForEntity(shared.id), []);
  assert.deepEqual(yield* entities.getById(shared.id), before);
  assert.deepEqual(yield* versions.getAllForEntity(shared.id), historyBefore);
  assert.deepEqual(yield* tags.getTagsForEntity(shared.id), [tag]);

  const rollbackId = ProjectIdSchema.make("project-rollback");
  const countBefore = yield* entities.count();
  const failure = yield* Effect.flip(
    transactions.run((repositories) =>
      Effect.gen(function* () {
        const project = yield* repositories.projects.create({ id: rollbackId, name: "Rollback" });
        const doc = yield* repositories.entities.createDoc({ title: "Rollback", content: "" });
        yield* repositories.projects.addEntity(project.id, doc.id);
        yield* repositories.projects.addEntity(first.id, shared.id);
        yield* repositories.projects.removeEntity(first.id, local.id);
        return yield* new RepositoryError({ message: "Injected aggregate failure" });
      })
    )
  );
  assert.equal(failure.message, "Injected aggregate failure");
  assert.equal((yield* Effect.flip(projects.getById(rollbackId)))._tag, "ProjectNotFoundError");
  assert.equal(yield* entities.count(), countBefore);
  assert.deepEqual(yield* projects.getProjectsForEntity(shared.id), []);
  assert.deepEqual(yield* projects.getEntityIds([first.id]), [local.id]);

  const defect = yield* Effect.exit(
    transactions.run((repositories) =>
      repositories.projects
        .addEntity(first.id, shared.id)
        .pipe(Effect.andThen(Effect.die(new Error("Injected defect"))))
    )
  );
  assert.ok(Exit.isFailure(defect));
  assert.deepEqual(yield* projects.getProjectsForEntity(shared.id), []);

  yield* transactions.run((repositories) => repositories.projects.addEntity(first.id, shared.id));
  assert.deepEqual(yield* projects.getProjectsForEntity(shared.id), [first]);
  yield* entities.delete(shared.id);
  assert.deepEqual(yield* projects.getProjectsForEntity(shared.id), []);
  assert.deepEqual(yield* projects.getAll, [first, second]);
});

const mode = process.argv[2];
const dbPath = process.argv[3] ?? ":memory:";
const concurrencyProgram = Effect.gen(function* () {
  const projects = yield* ProjectRepositoryTag;
  const entities = yield* EntityRepositoryTag;
  const projectId = ProjectIdSchema.make("concurrent-project");
  if (mode === "seed") {
    yield* projects.create({ id: projectId, name: "Concurrent" });
    yield* entities.createDoc({ title: "Concurrent membership", content: "" });
    return;
  }
  const entity = (yield* entities.getAll())[0];
  assert.ok(entity);
  if (mode === "attach") {
    for (let attempt = 0; attempt < 10; attempt++) yield* projects.addEntity(projectId, entity.id);
    return;
  }
  assert.deepEqual(yield* projects.getEntityIds([projectId]), [entity.id]);
  assert.equal((yield* projects.getProjectsForEntity(entity.id)).length, 1);
});

await Effect.runPromise(
  Effect.scoped(Effect.provide(mode ? concurrencyProgram : program, CliServicesLive(dbPath)))
);
