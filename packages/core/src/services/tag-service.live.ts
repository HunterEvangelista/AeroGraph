/**
 * Tag Service live implementation
 */
import { Effect, Layer } from "effect"
import { ValidationError } from "../errors.js"
import { TagRepositoryTag } from "../repository/tag-repository.js"
import { type Tag, type TagId } from "../domain/tag.js"
import { type TagService, TagServiceTag } from "./tag-service.js"

export const TagServiceLive = Layer.effect(
  TagServiceTag,
  Effect.gen(function* () {
    const repo = yield* TagRepositoryTag

    const ensureHierarchy = (tagPath: string) =>
      Effect.gen(function* () {
        const parts = tagPath.split("/")
        let parentId: string | undefined
        let currentTag: Tag | undefined

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i]
          if (!part) continue

          const tagId = parts.slice(0, i + 1).join("/")

          const existingTag = yield* Effect.either(repo.getById(tagId as TagId))

          if (existingTag._tag === "Right") {
            currentTag = existingTag.right
            parentId = tagId
          } else {
            currentTag = yield* repo.create({
              id: tagId,
              name: part,
              parentId,
            })
            parentId = tagId
          }
        }

        if (!currentTag) {
          return yield* Effect.fail(
            new ValidationError({
              message: `Invalid tag path: ${tagPath}`,
            })
          )
        }

        return currentTag
      })

    return {
      create: (input) => repo.create(input),
      getById: (id) => repo.getById(id),
      getAll: () => repo.getAll(),
      getChildren: (parentId) => repo.getChildren(parentId),
      getAncestors: (id) => repo.getAncestors(id),
      update: (id, updates) => repo.update(id, updates),
      delete: (id) => repo.delete(id),
      applyToEntity: (tagId, entityId) => repo.applyToEntity(tagId, entityId),
      removeFromEntity: (tagId, entityId) => repo.removeFromEntity(tagId, entityId),
      getTagsForEntity: (entityId) => repo.getTagsForEntity(entityId),
      search: (query) => repo.search(query),
      count: () => repo.count(),
      ensureHierarchy,
    } satisfies TagService
  })
)
