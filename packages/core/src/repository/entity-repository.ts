/**
 * Entity Repository Interface
 * Storage-agnostic interface for entity CRUD operations
 */
import { Context, type Effect } from "effect";
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
} from "../domain/entity";
import type { EntityNotFoundError, RepositoryError, ValidationError } from "../errors";

// ============================================================================
// Entity Repository Interface
// ============================================================================

export interface EntityRepository {
  /**
   * Create a new document entity
   */
  readonly createDoc: (
    input: CreateDocInput
  ) => Effect.Effect<Doc, ValidationError | RepositoryError>;

  /**
   * Create a new code reference entity
   */
  readonly createCodeRef: (
    input: CreateCodeRefInput
  ) => Effect.Effect<CodeRef, ValidationError | RepositoryError>;

  /**
   * Create a new story entity
   */
  readonly createStory: (
    input: CreateStoryInput
  ) => Effect.Effect<Story, ValidationError | RepositoryError>;

  /**
   * Create a new diagram entity
   */
  readonly createDiagram: (
    input: CreateDiagramInput
  ) => Effect.Effect<Diagram, ValidationError | RepositoryError>;

  /**
   * Get an entity by ID
   */
  readonly getById: (id: EntityId) => Effect.Effect<Entity, EntityNotFoundError | RepositoryError>;

  /**
   * Get all entities, optionally filtered by type
   */
  readonly getAll: (type?: EntityType) => Effect.Effect<ReadonlyArray<Entity>, RepositoryError>;

  /**
   * Get entities by tag
   */
  readonly getByTag: (tagId: string) => Effect.Effect<ReadonlyArray<Entity>, RepositoryError>;

  /**
   * Get entities by multiple tags (intersection)
   */
  readonly getByTags: (
    tagIds: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlyArray<Entity>, RepositoryError>;

  /**
   * Update an entity
   */
  readonly update: (
    id: EntityId,
    updates: Partial<Entity>
  ) => Effect.Effect<Entity, EntityNotFoundError | ValidationError | RepositoryError>;

  /**
   * Delete an entity
   */
  readonly delete: (id: EntityId) => Effect.Effect<void, EntityNotFoundError | RepositoryError>;

  /**
   * Count entities, optionally filtered by type
   */
  readonly count: (type?: EntityType) => Effect.Effect<number, RepositoryError>;

  /**
   * Search entities by title or content
   */
  readonly search: (query: string) => Effect.Effect<ReadonlyArray<Entity>, RepositoryError>;
}

// ============================================================================
// Entity Repository Tag (for Effect DI)
// ============================================================================

export class EntityRepositoryTag extends Context.Service<EntityRepositoryTag, EntityRepository>()(
  "EntityRepository"
) {}
