/**
 * Tag Repository Interface
 * Storage-agnostic interface for tag operations
 */
import { Context, type Effect } from "effect";
import type { CreateTagInput, Tag, TagId, UpdateTagInput } from "../domain/tag";
import type {
  EntityNotFoundError,
  RepositoryError,
  TagNotFoundError,
  ValidationError,
} from "../errors";

// ============================================================================
// Tag Repository Interface
// ============================================================================

export interface TagRepository {
  /**
   * Create a new tag
   */
  readonly create: (input: CreateTagInput) => Effect.Effect<Tag, ValidationError | RepositoryError>;

  /**
   * Get a tag by ID
   */
  readonly getById: (id: TagId) => Effect.Effect<Tag, TagNotFoundError | RepositoryError>;

  /**
   * Get all tags
   */
  readonly getAll: Effect.Effect<ReadonlyArray<Tag>, RepositoryError>;

  /**
   * Get child tags of a parent tag
   */
  readonly getChildren: (
    parentId: TagId
  ) => Effect.Effect<ReadonlyArray<Tag>, TagNotFoundError | RepositoryError>;

  /**
   * Get all ancestor tags (parent chain)
   */
  readonly getAncestors: (
    id: TagId
  ) => Effect.Effect<ReadonlyArray<Tag>, TagNotFoundError | RepositoryError>;

  /**
   * Update a tag
   */
  readonly update: (
    id: TagId,
    updates: UpdateTagInput
  ) => Effect.Effect<Tag, TagNotFoundError | ValidationError | RepositoryError>;

  /**
   * Delete a tag
   */
  readonly delete: (id: TagId) => Effect.Effect<void, TagNotFoundError | RepositoryError>;

  /**
   * Apply a tag to an entity
   */
  readonly applyToEntity: (
    tagId: TagId,
    entityId: string
  ) => Effect.Effect<void, TagNotFoundError | EntityNotFoundError | RepositoryError>;

  /**
   * Remove a tag from an entity
   */
  readonly removeFromEntity: (
    tagId: TagId,
    entityId: string
  ) => Effect.Effect<void, TagNotFoundError | EntityNotFoundError | RepositoryError>;

  /**
   * Get all tags for an entity
   */
  readonly getTagsForEntity: (
    entityId: string
  ) => Effect.Effect<ReadonlyArray<Tag>, EntityNotFoundError | RepositoryError>;

  /**
   * Search tags by name or alias
   */
  readonly search: (query: string) => Effect.Effect<ReadonlyArray<Tag>, RepositoryError>;

  /**
   * Count tags
   */
  readonly count: Effect.Effect<number, RepositoryError>;
}

// ============================================================================
// Tag Repository Tag (for Effect DI)
// ============================================================================

export class TagRepositoryTag extends Context.Service<TagRepositoryTag, TagRepository>()(
  "TagRepository"
) {}
