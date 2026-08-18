/**
 * Entity Service live implementation
 */
import { Effect, Layer } from "effect";
import type { Entity } from "../domain/entity";
import { EntityRepositoryTag } from "../repository/entity-repository";
import { VersionRepositoryTag } from "../repository/version-repository";
import { type EntityService, EntityServiceTag } from "./entity-service";

export const EntityServiceLive = Layer.effect(
  EntityServiceTag,
  Effect.gen(function* () {
    const repo = yield* EntityRepositoryTag;
    const versionRepo = yield* VersionRepositoryTag;

    const createVersion = <E extends Entity>(
      entity: E,
      changeType: "create" | "update",
      changedFields?: ReadonlyArray<string>
    ) =>
      versionRepo
        .create(entity.id, entity.version, entity, changeType, changedFields)
        .pipe(Effect.as(entity));

    const changedFields = (before: Entity, after: Entity): ReadonlyArray<string> => {
      const fields = new Set<string>();
      for (const key of Object.keys(after) as Array<keyof Entity>) {
        if (key === "updatedAt" || key === "version") continue;
        if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
          fields.add(String(key));
        }
      }
      return [...fields];
    };

    return {
      createDoc: (input) =>
        repo.createDoc(input).pipe(Effect.flatMap((entity) => createVersion(entity, "create"))),
      createCodeRef: (input) =>
        repo.createCodeRef(input).pipe(Effect.flatMap((entity) => createVersion(entity, "create"))),
      createStory: (input) =>
        repo.createStory(input).pipe(Effect.flatMap((entity) => createVersion(entity, "create"))),
      createDiagram: (input) =>
        repo.createDiagram(input).pipe(Effect.flatMap((entity) => createVersion(entity, "create"))),
      getById: (id) => repo.getById(id),
      getAll: (type) => repo.getAll(type),
      getByTag: (tagId) => repo.getByTag(tagId),
      getByTags: (tagIds) => repo.getByTags(tagIds),
      update: (id, updates) =>
        Effect.gen(function* () {
          const before = yield* repo.getById(id);
          const updated = yield* repo.update(id, updates);
          return yield* createVersion(updated, "update", changedFields(before, updated));
        }),
      delete: (id) => repo.delete(id),
      count: (type) => repo.count(type),
      search: (query) => repo.search(query),
    } satisfies EntityService;
  })
);
