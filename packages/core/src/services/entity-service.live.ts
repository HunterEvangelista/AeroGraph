/**
 * Entity Service live implementation
 */
import { Effect, Layer } from "effect"
import { EntityRepositoryTag } from "../repository/entity-repository.js"
import { type EntityService, EntityServiceTag } from "./entity-service.js"

export const EntityServiceLive = Layer.effect(
  EntityServiceTag,
  Effect.gen(function* () {
    const repo = yield* EntityRepositoryTag

    return {
      createDoc: (input) => repo.createDoc(input),
      createCodeRef: (input) => repo.createCodeRef(input),
      createStory: (input) => repo.createStory(input),
      createDiagram: (input) => repo.createDiagram(input),
      getById: (id) => repo.getById(id),
      getAll: (type) => repo.getAll(type),
      getByTag: (tagId) => repo.getByTag(tagId),
      getByTags: (tagIds) => repo.getByTags(tagIds),
      update: (id, updates) => repo.update(id, updates),
      delete: (id) => repo.delete(id),
      count: (type) => repo.count(type),
      search: (query) => repo.search(query),
    } satisfies EntityService
  })
)
