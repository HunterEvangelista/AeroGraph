/**
 * Tag Service
 * Business logic layer for tag operations
 */
import { Context, Effect, Layer } from "effect"
import type { CreateTagInput, Tag, TagId, UpdateTagInput } from "../domain/tag.js"
import {
  type EntityNotFoundError,
  type RepositoryError,
  type TagNotFoundError,
  ValidationError,
} from "../errors.js"
import { TagRepositoryTag } from "../repository/tag-repository.js"

// ============================================================================
// Tag Service Interface
// ============================================================================

export interface TagService {
  readonly create: (input: CreateTagInput) => Effect.Effect<Tag, ValidationError | RepositoryError>

  readonly getById: (id: TagId) => Effect.Effect<Tag, TagNotFoundError | RepositoryError>

  readonly getAll: () => Effect.Effect<ReadonlyArray<Tag>, RepositoryError>

  readonly getChildren: (
    parentId: TagId
  ) => Effect.Effect<ReadonlyArray<Tag>, TagNotFoundError | RepositoryError>

  readonly getAncestors: (
    id: TagId
  ) => Effect.Effect<ReadonlyArray<Tag>, TagNotFoundError | RepositoryError>

  readonly update: (
    id: TagId,
    updates: UpdateTagInput
  ) => Effect.Effect<Tag, TagNotFoundError | ValidationError | RepositoryError>

  readonly delete: (id: TagId) => Effect.Effect<void, TagNotFoundError | RepositoryError>

  readonly applyToEntity: (
    tagId: TagId,
    entityId: string
  ) => Effect.Effect<void, TagNotFoundError | EntityNotFoundError | RepositoryError>

  readonly removeFromEntity: (
    tagId: TagId,
    entityId: string
  ) => Effect.Effect<void, TagNotFoundError | EntityNotFoundError | RepositoryError>

  readonly getTagsForEntity: (
    entityId: string
  ) => Effect.Effect<ReadonlyArray<Tag>, EntityNotFoundError | RepositoryError>

  readonly search: (query: string) => Effect.Effect<ReadonlyArray<Tag>, RepositoryError>

  readonly count: () => Effect.Effect<number, RepositoryError>

  /**
   * Parse a hierarchical tag string (e.g., "checkout/rate-limiting")
   * and ensure all parent tags exist
   */
  readonly ensureHierarchy: (
    tagPath: string
  ) => Effect.Effect<Tag, ValidationError | RepositoryError>
}

// ============================================================================
// Tag Service Tag
// ============================================================================

export class TagServiceTag extends Context.Tag("TagService")<TagServiceTag, TagService>() {}

// ============================================================================
// Tag Service Implementation
// ============================================================================

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

          // Try to get existing tag
          const existingTag = yield* Effect.either(repo.getById(tagId as TagId))

          if (existingTag._tag === "Right") {
            currentTag = existingTag.right
            parentId = tagId
          } else {
            // Create the tag
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
