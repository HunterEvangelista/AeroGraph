/**
 * Tag Service
 * Business logic layer for tag operations contract
 */
import { Context, type Effect } from "effect";
import type { CreateTagInput, Tag, TagId, UpdateTagInput } from "../domain/tag.js";
import type {
  EntityNotFoundError,
  RepositoryError,
  TagNotFoundError,
  ValidationError,
} from "../errors.js";

// ============================================================================
// Tag Service Interface
// ============================================================================

export interface TagService {
  readonly create: (input: CreateTagInput) => Effect.Effect<Tag, ValidationError | RepositoryError>;

  readonly getById: (id: TagId) => Effect.Effect<Tag, TagNotFoundError | RepositoryError>;

  readonly getAll: () => Effect.Effect<ReadonlyArray<Tag>, RepositoryError>;

  readonly getChildren: (
    parentId: TagId
  ) => Effect.Effect<ReadonlyArray<Tag>, TagNotFoundError | RepositoryError>;

  readonly getAncestors: (
    id: TagId
  ) => Effect.Effect<ReadonlyArray<Tag>, TagNotFoundError | RepositoryError>;

  readonly update: (
    id: TagId,
    updates: UpdateTagInput
  ) => Effect.Effect<Tag, TagNotFoundError | ValidationError | RepositoryError>;

  readonly delete: (id: TagId) => Effect.Effect<void, TagNotFoundError | RepositoryError>;

  readonly applyToEntity: (
    tagId: TagId,
    entityId: string
  ) => Effect.Effect<void, TagNotFoundError | EntityNotFoundError | RepositoryError>;

  readonly removeFromEntity: (
    tagId: TagId,
    entityId: string
  ) => Effect.Effect<void, TagNotFoundError | EntityNotFoundError | RepositoryError>;

  readonly getTagsForEntity: (
    entityId: string
  ) => Effect.Effect<ReadonlyArray<Tag>, EntityNotFoundError | RepositoryError>;

  readonly search: (query: string) => Effect.Effect<ReadonlyArray<Tag>, RepositoryError>;

  readonly count: () => Effect.Effect<number, RepositoryError>;

  /**
   * Parse a hierarchical tag string (e.g., "checkout/rate-limiting")
   * and ensure all parent tags exist
   */
  readonly ensureHierarchy: (
    tagPath: string
  ) => Effect.Effect<Tag, ValidationError | RepositoryError>;
}

// ============================================================================
// Tag Service Tag
// ============================================================================

export class TagServiceTag extends Context.Service<TagServiceTag, TagService>()("TagService") {}
