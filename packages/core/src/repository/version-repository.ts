/**
 * Version Repository Interface
 * Storage-agnostic interface for version history operations
 */
import { Context, type Effect } from "effect";
import type { Entity } from "../domain/entity";
import type { ChangeType, EntityVersion, TypedEntityVersion } from "../domain/version";
import type { EntityNotFoundError, RepositoryError, VersionNotFoundError } from "../errors";

// ============================================================================
// Version Repository Interface
// ============================================================================

export interface VersionRepository {
  /**
   * Create a new version entry for an entity
   */
  readonly create: (
    entityId: string,
    version: number,
    data: Entity,
    changeType: ChangeType,
    changedFields?: ReadonlyArray<string>
  ) => Effect.Effect<EntityVersion, RepositoryError>;

  /**
   * Get a specific version of an entity
   */
  readonly getVersion: (
    entityId: string,
    version: number
  ) => Effect.Effect<EntityVersion, VersionNotFoundError | RepositoryError>;

  /**
   * Get all versions for an entity
   */
  readonly getAllForEntity: (
    entityId: string
  ) => Effect.Effect<ReadonlyArray<EntityVersion>, EntityNotFoundError | RepositoryError>;

  /**
   * Get the latest version for an entity
   */
  readonly getLatest: (
    entityId: string
  ) => Effect.Effect<EntityVersion, EntityNotFoundError | RepositoryError>;

  /**
   * Get entity data at a specific version
   */
  readonly getEntityAtVersion: <E extends Entity>(
    entityId: string,
    version: number
  ) => Effect.Effect<TypedEntityVersion<E>, VersionNotFoundError | RepositoryError>;

  /**
   * Get version count for an entity
   */
  readonly countForEntity: (
    entityId: string
  ) => Effect.Effect<number, EntityNotFoundError | RepositoryError>;

  /**
   * Get versions created within a time range
   */
  readonly getInTimeRange: (
    start: Date,
    end: Date
  ) => Effect.Effect<ReadonlyArray<EntityVersion>, RepositoryError>;

  /**
   * Delete all versions for an entity
   */
  readonly deleteAllForEntity: (entityId: string) => Effect.Effect<number, RepositoryError>;
}

// ============================================================================
// Version Repository Tag (for Effect DI)
// ============================================================================

export class VersionRepositoryTag extends Context.Service<
  VersionRepositoryTag,
  VersionRepository
>()("VersionRepository") {}
