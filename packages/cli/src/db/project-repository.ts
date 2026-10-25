import {
  BrandedId,
  CreateProjectInputSchema,
  type EntityId,
  type Project,
  ProjectIdSchema,
  ProjectNotFoundError,
  type ProjectRepository,
  ProjectRepositoryTag,
  ProjectSchema,
  RepositoryError,
  ValidationError,
} from "@aerograph/core";
import { and, eq, inArray } from "drizzle-orm";
import { Effect, Layer, Schema } from "effect";
import { entityProjects, projects } from "./schema";
import { type DatabaseExecutor, DatabaseSessionTag, RootDatabaseSessionLive } from "./session";

const PROJECT_ID_BATCH_SIZE = 500;
const decodeProject = Schema.decodeUnknownSync(ProjectSchema);
const decodeEntityId = Schema.decodeUnknownSync(BrandedId);

export const SqliteProjectRepositorySessionLive = Layer.effect(
  ProjectRepositoryTag,
  Effect.gen(function* () {
    const { drizzle, write, transaction } = yield* DatabaseSessionTag;

    const create: ProjectRepository["create"] = (input) =>
      Effect.gen(function* () {
        const validated = yield* Schema.decodeUnknownEffect(CreateProjectInputSchema)(input).pipe(
          Effect.mapError(
            (cause) => new ValidationError({ message: "Invalid project input.", cause })
          )
        );
        const project: Project = {
          id: ProjectIdSchema.make(validated.id),
          name: validated.name,
          createdAt: new Date(),
        };
        yield* Effect.try({
          try: () =>
            write(() =>
              drizzle
                .insert(projects)
                .values({ ...project, createdAt: project.createdAt.toISOString() })
                .run()
            ),
          catch: (cause) => new RepositoryError({ message: "Failed to create project.", cause }),
        });
        return project;
      });

    const getById: ProjectRepository["getById"] = (id) =>
      Effect.gen(function* () {
        const project = yield* Effect.try({
          try: () => {
            const row = drizzle.select().from(projects).where(eq(projects.id, id)).get();
            return row ? decodeProject(row) : undefined;
          },
          catch: (cause) => new RepositoryError({ message: "Failed to get project.", cause }),
        });
        if (!project) return yield* new ProjectNotFoundError({ projectId: id });
        return project;
      });

    const getAll = Effect.try({
      try: () =>
        drizzle
          .select()
          .from(projects)
          .orderBy(projects.id)
          .all()
          .map((row) => decodeProject(row)),
      catch: (cause) => new RepositoryError({ message: "Failed to list projects.", cause }),
    });

    const addEntity: ProjectRepository["addEntity"] = (projectId, entityId) =>
      Effect.try({
        try: () => {
          const createdAt = new Date().toISOString();
          write(() =>
            drizzle
              .insert(entityProjects)
              .values({ projectId, entityId, createdAt })
              .onConflictDoNothing({ target: [entityProjects.entityId, entityProjects.projectId] })
              .run()
          );
        },
        catch: (cause) =>
          new RepositoryError({ message: "Failed to add entity project membership.", cause }),
      });

    const removeEntity: ProjectRepository["removeEntity"] = (projectId, entityId) =>
      Effect.try({
        try: () =>
          write(
            () =>
              drizzle
                .delete(entityProjects)
                .where(
                  and(
                    eq(entityProjects.projectId, projectId),
                    eq(entityProjects.entityId, entityId)
                  )
                )
                .returning({ entityId: entityProjects.entityId })
                .all().length > 0
          ),
        catch: (cause) =>
          new RepositoryError({ message: "Failed to remove entity project membership.", cause }),
      });

    const getProjectsForEntity: ProjectRepository["getProjectsForEntity"] = (entityId) =>
      Effect.try({
        try: () =>
          drizzle
            .select({ id: projects.id, name: projects.name, createdAt: projects.createdAt })
            .from(projects)
            .innerJoin(entityProjects, eq(projects.id, entityProjects.projectId))
            .where(eq(entityProjects.entityId, entityId))
            .orderBy(projects.id)
            .all()
            .map((row) => decodeProject(row)),
        catch: (cause) =>
          new RepositoryError({ message: "Failed to list entity project memberships.", cause }),
      });

    const getEntityIds: ProjectRepository["getEntityIds"] = (projectIds) =>
      Effect.try({
        try: () => {
          if (projectIds.length === 0) return [];
          const uniqueProjectIds = [...new Set(projectIds)];
          const collect = (executor: DatabaseExecutor) => {
            const entityIds = new Set<EntityId>();
            for (
              let offset = 0;
              offset < uniqueProjectIds.length;
              offset += PROJECT_ID_BATCH_SIZE
            ) {
              const batch = uniqueProjectIds.slice(offset, offset + PROJECT_ID_BATCH_SIZE);
              const rows = executor
                .selectDistinct({ entityId: entityProjects.entityId })
                .from(entityProjects)
                .where(inArray(entityProjects.projectId, batch))
                .all();
              for (const row of rows) entityIds.add(decodeEntityId(row.entityId));
            }
            return [...entityIds].sort();
          };
          // Batched scope reads share a snapshot so concurrent membership changes cannot mix states.
          return uniqueProjectIds.length > PROJECT_ID_BATCH_SIZE
            ? transaction(collect)
            : collect(drizzle);
        },
        catch: (cause) =>
          new RepositoryError({ message: "Failed to list project entity IDs.", cause }),
      });

    return {
      create,
      getById,
      getAll,
      addEntity,
      removeEntity,
      getProjectsForEntity,
      getEntityIds,
    } satisfies ProjectRepository;
  })
);

export const SqliteProjectRepositoryLive = SqliteProjectRepositorySessionLive.pipe(
  Layer.provide(RootDatabaseSessionLive)
);
