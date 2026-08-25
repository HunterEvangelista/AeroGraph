import { EntityType, GraphServiceTag } from "@aerograph/core";
import { Effect } from "effect";
/**
 * Status Command
 * Display project and graph statistics
 */
import { Command, Flag } from "effect/unstable/cli";
import { ConfigServiceTag } from "../config";
import { CliCoreLive } from "../db/index";
import { emitError, emitOutput } from "../ui/output";
import { formatStatus, type StatusResult } from "../ui/status-output";

export const statusCommand = Command.make(
  "status",
  {
    verbose: Flag.boolean("verbose").pipe(
      Flag.withDescription("Show registry, database, and resolution details"),
      Flag.withDefault(false)
    ),
  },
  ({ verbose }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag;

      const workspace = yield* configService.load();

      const ServiceLayer = CliCoreLive(workspace.dbPath);

      const stats = yield* Effect.scoped(
        Effect.gen(function* () {
          const graphService = yield* GraphServiceTag;
          return yield* graphService.getStats;
        }).pipe(Effect.provide(ServiceLayer))
      );

      const result: StatusResult = {
        project: {
          name: workspace.projectName,
          id: workspace.projectId,
          rootPath: workspace.rootPath,
          createdAt: workspace.config.createdAt,
        },
        storage: {
          resolutionMethod: workspace.resolutionMethod,
          configPath: workspace.configPath,
          dbPath: workspace.dbPath,
          gitCommonDir: workspace.gitCommonDir,
        },
        graph: {
          totalEntities: stats.totalEntities,
          docs: stats.entitiesByType[EntityType.Doc] ?? 0,
          codeRefs: stats.entitiesByType[EntityType.CodeRef] ?? 0,
          stories: stats.entitiesByType[EntityType.Story] ?? 0,
          diagrams: stats.entitiesByType[EntityType.Diagram] ?? 0,
          totalTags: stats.totalTags,
          totalLinks: stats.totalLinks,
        },
      };

      yield* emitOutput(formatStatus(result, verbose));
    }).pipe(
      Effect.catchTags({
        WorkspaceNotFoundError: (e) =>
          emitError(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        ConfigError: (e) => emitError(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        RepositoryError: (e) =>
          emitError(`Database error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
      })
    )
);
