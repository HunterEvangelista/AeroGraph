import { Context, type Effect } from "effect";
import type { EntityId } from "../domain/entity";
import type { CreateProjectInput, Project, ProjectId } from "../domain/project";
import type { ProjectNotFoundError, RepositoryError, ValidationError } from "../errors";

/**
 * Persistence boundary for projects and their entity memberships.
 * Membership operations never create or remove entities; duplicate additions are no-ops.
 */
export interface ProjectRepository {
  readonly create: (
    input: CreateProjectInput
  ) => Effect.Effect<Project, ValidationError | RepositoryError>;
  readonly getById: (
    id: ProjectId
  ) => Effect.Effect<Project, ProjectNotFoundError | RepositoryError>;
  readonly getAll: Effect.Effect<ReadonlyArray<Project>, RepositoryError>;
  /** Adds one constrained membership; invalid project or entity endpoints are repository failures. */
  readonly addEntity: (
    projectId: ProjectId,
    entityId: EntityId
  ) => Effect.Effect<void, RepositoryError>;
  /** Returns true only when an existing membership was deleted. */
  readonly removeEntity: (
    projectId: ProjectId,
    entityId: EntityId
  ) => Effect.Effect<boolean, RepositoryError>;
  readonly getProjectsForEntity: (
    entityId: EntityId
  ) => Effect.Effect<ReadonlyArray<Project>, RepositoryError>;
  /** Returns the deduplicated union of entity IDs in deterministic order. */
  readonly getEntityIds: (
    projectIds: ReadonlyArray<ProjectId>
  ) => Effect.Effect<ReadonlyArray<EntityId>, RepositoryError>;
}

export class ProjectRepositoryTag extends Context.Service<
  ProjectRepositoryTag,
  ProjectRepository
>()("ProjectRepository") {}
