import { Context, type Effect } from "effect";
import type { CreateLinkInput, Link, LinkId, LinkType } from "../domain/link.js";
import type {
  EntityNotFoundError,
  LinkNotFoundError,
  RepositoryError,
  ValidationError,
} from "../errors.js";

// ============================================================================
// Link Repository Interface
// ============================================================================

export interface LinkRepository {
  /**
   * Create a new link between entities
   */
  readonly create: (
    input: CreateLinkInput
  ) => Effect.Effect<Link, ValidationError | EntityNotFoundError | RepositoryError>;

  /**
   * Create bidirectional link (creates both forward and inverse links)
   */
  readonly createBidirectional: (
    input: CreateLinkInput
  ) => Effect.Effect<
    readonly [Link, Link],
    ValidationError | EntityNotFoundError | RepositoryError
  >;

  /**
   * Get a link by ID
   */
  readonly getById: (id: LinkId) => Effect.Effect<Link, LinkNotFoundError | RepositoryError>;

  /**
   * Get all links from a source entity
   */
  readonly getFromSource: (sourceId: string) => Effect.Effect<ReadonlyArray<Link>, RepositoryError>;

  /**
   * Get all links to a target entity
   */
  readonly getToTarget: (targetId: string) => Effect.Effect<ReadonlyArray<Link>, RepositoryError>;

  /**
   * Get all links for an entity (both directions)
   */
  readonly getAllForEntity: (
    entityId: string
  ) => Effect.Effect<ReadonlyArray<Link>, RepositoryError>;

  /**
   * Get links by type
   */
  readonly getByType: (type: LinkType) => Effect.Effect<ReadonlyArray<Link>, RepositoryError>;

  /**
   * Get link between two specific entities
   */
  readonly getLinkBetween: (
    sourceId: string,
    targetId: string
  ) => Effect.Effect<Link | null, RepositoryError>;

  /**
   * Delete a link
   */
  readonly delete: (id: LinkId) => Effect.Effect<void, LinkNotFoundError | RepositoryError>;

  /**
   * Delete all links for an entity
   */
  readonly deleteAllForEntity: (entityId: string) => Effect.Effect<number, RepositoryError>;

  /**
   * Delete link between two entities
   */
  readonly deleteBetween: (
    sourceId: string,
    targetId: string,
    type?: LinkType
  ) => Effect.Effect<void, LinkNotFoundError | RepositoryError>;

  /**
   * Count links
   */
  readonly count: Effect.Effect<number, RepositoryError>;
}

// ============================================================================
// Link Repository Tag (for Effect DI)
// ============================================================================

export class LinkRepositoryTag extends Context.Service<LinkRepositoryTag, LinkRepository>()(
  "LinkRepository"
) {}
