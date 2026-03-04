/**
 * Status Command
 * Display workspace and graph statistics
 */
import { Command } from "@effect/cli"
import { GraphServiceLive, GraphServiceTag } from "@kioku/core"
import { Console, Effect, Layer } from "effect"
import { ConfigServiceTag } from "../config.js"
import {
  DatabaseClientLive,
  SqliteEntityRepositoryLive,
  SqliteLinkRepositoryLive,
  SqliteTagRepositoryLive,
} from "../db/index.js"

export const statusCommand = Command.make("status", {}, () =>
  Effect.gen(function* () {
    const configService = yield* ConfigServiceTag

    const workspace = yield* configService.load()

    yield* Console.log("")
    yield* Console.log("Kioku Workspace Status")
    yield* Console.log("=".repeat(40))
    yield* Console.log("")
    yield* Console.log(`Root:     ${workspace.rootPath}`)
    yield* Console.log(`Database: ${workspace.dbPath}`)
    yield* Console.log(`Created:  ${workspace.config.createdAt}`)
    yield* Console.log("")

    // Create repository layers
    const DbLayer = DatabaseClientLive(workspace.dbPath)
    const RepoLayers = Layer.mergeAll(
      SqliteEntityRepositoryLive,
      SqliteTagRepositoryLive,
      SqliteLinkRepositoryLive
    ).pipe(Layer.provide(DbLayer))

    const GraphLayer = GraphServiceLive.pipe(Layer.provide(RepoLayers))

    const stats = yield* Effect.scoped(
      Effect.gen(function* () {
        const graphService = yield* GraphServiceTag
        return yield* graphService.getStats()
      }).pipe(Effect.provide(GraphLayer))
    )

    yield* Console.log("Graph Statistics")
    yield* Console.log("-".repeat(40))
    yield* Console.log(`Entities: ${stats.totalEntities}`)
    yield* Console.log(`  - Docs:      ${stats.entitiesByType["doc"] ?? 0}`)
    yield* Console.log(`  - Code Refs: ${stats.entitiesByType["code_ref"] ?? 0}`)
    yield* Console.log(`  - Stories:   ${stats.entitiesByType["story"] ?? 0}`)
    yield* Console.log(`  - Diagrams:  ${stats.entitiesByType["diagram"] ?? 0}`)
    yield* Console.log(`Tags:     ${stats.totalTags}`)
    yield* Console.log(`Links:    ${stats.totalLinks}`)
    yield* Console.log("")
  }).pipe(
    Effect.catchTags({
      WorkspaceNotFoundError: (e) =>
        Console.error(`Error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
      ConfigError: (e) =>
        Console.error(`Error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
      RepositoryError: (e) =>
        Console.error(`Database error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
    })
  )
)
