/**
 * Graph Service
 * Graph traversal algorithms and relationship queries contract
 */
import { Context, type Effect } from "effect";
import type { Entity } from "../domain/entity.js";
import type { Link, LinkType } from "../domain/link.js";
import type { EntityNotFoundError, RepositoryError } from "../errors.js";

// ============================================================================
// Graph Query Result Types
// ============================================================================

export interface EntityWithLinks {
  readonly entity: Entity;
  readonly incomingLinks: ReadonlyArray<Link>;
  readonly outgoingLinks: ReadonlyArray<Link>;
}

export interface TraversalResult {
  readonly entities: ReadonlyArray<Entity>;
  readonly depth: number;
}

export interface GraphStats {
  readonly totalEntities: number;
  readonly totalTags: number;
  readonly totalLinks: number;
  readonly entitiesByType: Record<string, number>;
}

// ============================================================================
// Graph Service Interface
// ============================================================================

export interface GraphService {
  /**
   * Get an entity with all its links
   */
  readonly getEntityWithLinks: (
    entityId: string
  ) => Effect.Effect<EntityWithLinks, EntityNotFoundError | RepositoryError>;

  /**
   * Get related entities (1 hop)
   */
  readonly getRelatedEntities: (
    entityId: string,
    linkTypes?: ReadonlyArray<LinkType>
  ) => Effect.Effect<ReadonlyArray<Entity>, EntityNotFoundError | RepositoryError>;

  /**
   * Traverse graph from entity up to N hops
   */
  readonly traverse: (
    entityId: string,
    maxDepth: number,
    linkTypes?: ReadonlyArray<LinkType>
  ) => Effect.Effect<TraversalResult, EntityNotFoundError | RepositoryError>;

  /**
   * Find all entities connected by a path through tags
   */
  readonly findByTagPath: (
    tagIds: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlyArray<Entity>, RepositoryError>;

  /**
   * Get graph statistics
   */
  readonly getStats: () => Effect.Effect<GraphStats, RepositoryError>;

  /**
   * Find shortest path between two entities (via links)
   */
  readonly findPath: (
    sourceId: string,
    targetId: string,
    maxDepth?: number
  ) => Effect.Effect<ReadonlyArray<Entity> | null, EntityNotFoundError | RepositoryError>;
}

// ============================================================================
// Graph Service Tag
// ============================================================================

export class GraphServiceTag extends Context.Service<GraphServiceTag, GraphService>()(
  "GraphService"
) {}
