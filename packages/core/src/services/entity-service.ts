/**
 * Entity Service
 * Business logic layer for entity operations contract
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
// Entity Service Interface
// ============================================================================

export interface EntityService {
  readonly createDoc: (
    input: CreateDocInput
  ) => Effect.Effect<Doc, ValidationError | RepositoryError>;

  readonly createCodeRef: (
    input: CreateCodeRefInput
  ) => Effect.Effect<CodeRef, ValidationError | RepositoryError>;

  readonly createStory: (
    input: CreateStoryInput
  ) => Effect.Effect<Story, ValidationError | RepositoryError>;

  readonly createDiagram: (
    input: CreateDiagramInput
  ) => Effect.Effect<Diagram, ValidationError | RepositoryError>;

  readonly getById: (id: EntityId) => Effect.Effect<Entity, EntityNotFoundError | RepositoryError>;

  readonly getAll: (type?: EntityType) => Effect.Effect<ReadonlyArray<Entity>, RepositoryError>;

  readonly getByTag: (tagId: string) => Effect.Effect<ReadonlyArray<Entity>, RepositoryError>;

  readonly getByTags: (
    tagIds: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlyArray<Entity>, RepositoryError>;

  readonly update: (
    id: EntityId,
    updates: Partial<Entity>
  ) => Effect.Effect<Entity, EntityNotFoundError | ValidationError | RepositoryError>;

  readonly delete: (id: EntityId) => Effect.Effect<void, EntityNotFoundError | RepositoryError>;

  readonly count: (type?: EntityType) => Effect.Effect<number, RepositoryError>;

  readonly search: (query: string) => Effect.Effect<ReadonlyArray<Entity>, RepositoryError>;
}

// ============================================================================
// Entity Service Tag
// ============================================================================

// This remains a thin application boundary on purpose for now. Future
// entity-specific orchestration and policy should accumulate here rather than
// leaking into the repository layer. See KIOKU-25.

export class EntityServiceTag extends Context.Service<EntityServiceTag, EntityService>()(
  "EntityService"
) {}
