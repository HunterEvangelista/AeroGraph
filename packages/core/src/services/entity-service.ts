/**
 * Entity Service
 * Business logic layer for entity operations
 */
import { Context, Effect, Layer } from "effect"
import type {
  CodeRef,
  CreateCodeRefInput,
  CreateDiagramInput,
  CreateDocInput,
  CreateStoryInput,
  Diagram,
  Doc,
  Entity,
  EntityId,
  EntityType,
  Story,
} from "../domain/entity.js"
import type { EntityNotFoundError, RepositoryError, ValidationError } from "../errors.js"
import { EntityRepositoryTag } from "../repository/entity-repository.js"

// ============================================================================
// Entity Service Interface
// ============================================================================

export interface EntityService {
  readonly createDoc: (
    input: CreateDocInput
  ) => Effect.Effect<Doc, ValidationError | RepositoryError>

  readonly createCodeRef: (
    input: CreateCodeRefInput
  ) => Effect.Effect<CodeRef, ValidationError | RepositoryError>

  readonly createStory: (
    input: CreateStoryInput
  ) => Effect.Effect<Story, ValidationError | RepositoryError>

  readonly createDiagram: (
    input: CreateDiagramInput
  ) => Effect.Effect<Diagram, ValidationError | RepositoryError>

  readonly getById: (id: EntityId) => Effect.Effect<Entity, EntityNotFoundError | RepositoryError>

  readonly getAll: (type?: EntityType) => Effect.Effect<ReadonlyArray<Entity>, RepositoryError>

  readonly getByTag: (tagId: string) => Effect.Effect<ReadonlyArray<Entity>, RepositoryError>

  readonly getByTags: (
    tagIds: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlyArray<Entity>, RepositoryError>

  readonly update: (
    id: EntityId,
    updates: Partial<Entity>
  ) => Effect.Effect<Entity, EntityNotFoundError | ValidationError | RepositoryError>

  readonly delete: (id: EntityId) => Effect.Effect<void, EntityNotFoundError | RepositoryError>

  readonly count: (type?: EntityType) => Effect.Effect<number, RepositoryError>

  readonly search: (query: string) => Effect.Effect<ReadonlyArray<Entity>, RepositoryError>
}

// ============================================================================
// Entity Service Tag
// ============================================================================

export class EntityServiceTag extends Context.Tag("EntityService")<
  EntityServiceTag,
  EntityService
>() {}

// ============================================================================
// Entity Service Implementation
// ============================================================================

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
