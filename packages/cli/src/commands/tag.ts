/**
 * Tag Commands
 * Operations for managing tags and entity tagging
 */
import { Args, Command, Options } from "@effect/cli"
import { type TagId, TagServiceLive, TagServiceTag } from "@kioku/core"
import { Console, Effect, Layer, Option } from "effect"
import { ConfigServiceTag } from "../config.js"
import {
  DatabaseClientLive,
  SqliteEntityRepositoryLive,
  SqliteLinkRepositoryLive,
  SqliteTagRepositoryLive,
} from "../db/index.js"

// ============================================================================
// Helper: Create service layers from workspace
// ============================================================================

const makeServiceLayers = (dbPath: string) => {
  const DbLayer = DatabaseClientLive(dbPath)
  const RepoLayers = Layer.mergeAll(
    SqliteEntityRepositoryLive,
    SqliteTagRepositoryLive,
    SqliteLinkRepositoryLive
  ).pipe(Layer.provide(DbLayer))

  return TagServiceLive.pipe(Layer.provide(RepoLayers))
}

// ============================================================================
// Tag Create Command
// ============================================================================

const tagCreateCommand = Command.make(
  "create",
  {
    name: Args.text({ name: "name" }),
    parent: Options.text("parent").pipe(
      Options.withAlias("p"),
      Options.withDescription("Parent tag ID for hierarchy"),
      Options.optional
    ),
    description: Options.text("description").pipe(
      Options.withAlias("d"),
      Options.withDescription("Tag description"),
      Options.optional
    ),
  },
  ({ name, parent, description }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag
      const workspace = yield* configService.load()
      const ServiceLayers = makeServiceLayers(workspace.dbPath)

      const parentValue = Option.getOrUndefined(parent)
      const descValue = Option.getOrUndefined(description)

      const tag = yield* Effect.scoped(
        Effect.gen(function* () {
          const tagService = yield* TagServiceTag

          // If parent is specified, use hierarchical creation
          if (parentValue) {
            const tagPath = `${parentValue}/${name}`
            return yield* tagService.ensureHierarchy(tagPath)
          }

          // Otherwise create a root tag
          return yield* tagService.create({
            id: name,
            name,
            description: descValue,
          })
        }).pipe(Effect.provide(ServiceLayers))
      )

      yield* Console.log("")
      yield* Console.log("Tag created successfully!")
      yield* Console.log("")
      yield* Console.log(`ID:     #${tag.id}`)
      yield* Console.log(`Name:   ${tag.name}`)
      if (tag.description) {
        yield* Console.log(`Desc:   ${tag.description}`)
      }
      if (tag.parentId) {
        yield* Console.log(`Parent: #${tag.parentId}`)
      }
      yield* Console.log("")
    }).pipe(
      Effect.catchTags({
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        ValidationError: (e) =>
          Console.error(`Validation error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
      })
    )
)

// ============================================================================
// Tag List Command
// ============================================================================

const tagListCommand = Command.make(
  "list",
  {
    search: Options.text("search").pipe(
      Options.withAlias("s"),
      Options.withDescription("Search tags by name"),
      Options.optional
    ),
    tree: Options.boolean("tree").pipe(
      Options.withDescription("Show as hierarchy tree"),
      Options.withDefault(false)
    ),
  },
  ({ search, tree }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag
      const workspace = yield* configService.load()
      const ServiceLayers = makeServiceLayers(workspace.dbPath)

      const searchValue = Option.getOrUndefined(search)

      const tags = yield* Effect.scoped(
        Effect.gen(function* () {
          const tagService = yield* TagServiceTag

          if (searchValue) {
            return yield* tagService.search(searchValue)
          }

          return yield* tagService.getAll()
        }).pipe(Effect.provide(ServiceLayers))
      )

      yield* Console.log("")
      yield* Console.log(`Tags (${tags.length})`)
      yield* Console.log("=".repeat(40))
      yield* Console.log("")

      if (tags.length === 0) {
        yield* Console.log("No tags found.")
        yield* Console.log("")
        yield* Console.log("Create one with: kioku tag create <name>")
      } else if (tree) {
        // Build tree structure
        const rootTags = tags.filter((t) => !t.parentId)
        const childMap = new Map<string, Array<(typeof tags)[0]>>()

        for (const tag of tags) {
          if (tag.parentId) {
            const children = childMap.get(tag.parentId) || []
            children.push(tag)
            childMap.set(tag.parentId, children)
          }
        }

        const printTag = function* (
          tag: (typeof tags)[0],
          indent: number
        ): Generator<Effect.Effect<void, never, never>, void, void> {
          const prefix = "  ".repeat(indent)
          const desc = tag.description ? ` - ${tag.description}` : ""
          yield Console.log(`${prefix}#${tag.id}${desc}`)

          const children = childMap.get(tag.id) || []
          for (const child of children) {
            yield* printTag(child, indent + 1)
          }
        }

        for (const rootTag of rootTags) {
          yield* Effect.gen(function* () {
            for (const effect of printTag(rootTag, 0)) {
              yield* effect
            }
          })
        }
      } else {
        for (const tag of tags) {
          const desc = tag.description ? ` - ${tag.description}` : ""
          const parent = tag.parentId ? ` (parent: #${tag.parentId})` : ""
          yield* Console.log(`#${tag.id}${desc}${parent}`)
        }
      }

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

// ============================================================================
// Tag Apply Command
// ============================================================================

const tagApplyCommand = Command.make(
  "apply",
  {
    entityId: Args.text({ name: "entity-id" }),
    tagId: Args.text({ name: "tag" }),
  },
  ({ entityId, tagId }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag
      const workspace = yield* configService.load()
      const ServiceLayers = makeServiceLayers(workspace.dbPath)

      yield* Effect.scoped(
        Effect.gen(function* () {
          const tagService = yield* TagServiceTag

          // Ensure tag exists (creates hierarchy if needed)
          const tag = yield* tagService.ensureHierarchy(tagId)

          // Apply to entity
          yield* tagService.applyToEntity(tag.id, entityId)
        }).pipe(Effect.provide(ServiceLayers))
      )

      yield* Console.log("")
      yield* Console.log(`Tag #${tagId} applied to entity ${entityId}`)
      yield* Console.log("")
    }).pipe(
      Effect.catchTags({
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        EntityNotFoundError: (e) =>
          Console.error(`Error: Entity not found: ${e.entityId}`).pipe(
            Effect.zipRight(Effect.fail(e))
          ),
        TagNotFoundError: (e) =>
          Console.error(`Error: Tag not found: ${e.tagId}`).pipe(Effect.zipRight(Effect.fail(e))),
        ValidationError: (e) =>
          Console.error(`Validation error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
      })
    )
)

// ============================================================================
// Tag Remove Command
// ============================================================================

const tagRemoveCommand = Command.make(
  "remove",
  {
    entityId: Args.text({ name: "entity-id" }),
    tagId: Args.text({ name: "tag" }),
  },
  ({ entityId, tagId }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag
      const workspace = yield* configService.load()
      const ServiceLayers = makeServiceLayers(workspace.dbPath)

      yield* Effect.scoped(
        Effect.gen(function* () {
          const tagService = yield* TagServiceTag
          yield* tagService.removeFromEntity(tagId as TagId, entityId)
        }).pipe(Effect.provide(ServiceLayers))
      )

      yield* Console.log("")
      yield* Console.log(`Tag #${tagId} removed from entity ${entityId}`)
      yield* Console.log("")
    }).pipe(
      Effect.catchTags({
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        EntityNotFoundError: (e) =>
          Console.error(`Error: Entity not found: ${e.entityId}`).pipe(
            Effect.zipRight(Effect.fail(e))
          ),
        TagNotFoundError: (e) =>
          Console.error(`Error: Tag not found: ${e.tagId}`).pipe(Effect.zipRight(Effect.fail(e))),
      })
    )
)

// ============================================================================
// Tag Show Command
// ============================================================================

const tagShowCommand = Command.make(
  "show",
  {
    id: Args.text({ name: "tag-id" }),
  },
  ({ id }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag
      const workspace = yield* configService.load()
      const ServiceLayers = makeServiceLayers(workspace.dbPath)

      const { tag, ancestors, children } = yield* Effect.scoped(
        Effect.gen(function* () {
          const tagService = yield* TagServiceTag

          const tag = yield* tagService.getById(id as TagId)
          const ancestors = yield* tagService.getAncestors(tag.id)
          const children = yield* Effect.catchAll(tagService.getChildren(tag.id), () =>
            Effect.succeed([] as ReadonlyArray<typeof tag>)
          )

          return { tag, ancestors, children }
        }).pipe(Effect.provide(ServiceLayers))
      )

      yield* Console.log("")
      yield* Console.log(`Tag: #${tag.id}`)
      yield* Console.log("=".repeat(40))
      yield* Console.log("")
      yield* Console.log(`Name:    ${tag.name}`)
      if (tag.description) {
        yield* Console.log(`Desc:    ${tag.description}`)
      }
      yield* Console.log(`Created: ${tag.createdAt.toISOString()}`)

      if (ancestors.length > 0) {
        yield* Console.log("")
        yield* Console.log("Ancestors:")
        for (const ancestor of [...ancestors].reverse()) {
          yield* Console.log(`  #${ancestor.id}`)
        }
      }

      if (children.length > 0) {
        yield* Console.log("")
        yield* Console.log("Children:")
        for (const child of children) {
          yield* Console.log(`  #${child.id}`)
        }
      }

      yield* Console.log("")
    }).pipe(
      Effect.catchTags({
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        TagNotFoundError: (e) =>
          Console.error(`Error: Tag not found: ${e.tagId}`).pipe(Effect.zipRight(Effect.fail(e))),
      })
    )
)

// ============================================================================
// Tag Delete Command
// ============================================================================

const tagDeleteCommand = Command.make(
  "delete",
  {
    id: Args.text({ name: "tag-id" }),
    force: Options.boolean("force").pipe(
      Options.withAlias("f"),
      Options.withDescription("Skip confirmation"),
      Options.withDefault(false)
    ),
  },
  ({ id, force }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag
      const workspace = yield* configService.load()
      const ServiceLayers = makeServiceLayers(workspace.dbPath)

      yield* Effect.scoped(
        Effect.gen(function* () {
          const tagService = yield* TagServiceTag

          const tag = yield* tagService.getById(id as TagId)

          if (!force) {
            yield* Console.log(`Deleting tag: #${tag.id}`)
            yield* Console.log("(Use --force to skip this confirmation in scripts)")
          }

          yield* tagService.delete(tag.id)
        }).pipe(Effect.provide(ServiceLayers))
      )

      yield* Console.log("")
      yield* Console.log(`Tag #${id} deleted.`)
      yield* Console.log("")
    }).pipe(
      Effect.catchTags({
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        TagNotFoundError: (e) =>
          Console.error(`Error: Tag not found: ${e.tagId}`).pipe(Effect.zipRight(Effect.fail(e))),
      })
    )
)

// ============================================================================
// Tag Parent Command (with subcommands)
// ============================================================================

export const tagCommand = Command.make("tag").pipe(
  Command.withDescription("Manage tags and entity tagging"),
  Command.withSubcommands([
    tagCreateCommand,
    tagListCommand,
    tagApplyCommand,
    tagRemoveCommand,
    tagShowCommand,
    tagDeleteCommand,
  ])
)
