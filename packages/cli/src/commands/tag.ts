import { type TagId, TagServiceTag } from "@kioku/core";
import { Console, Effect, Option } from "effect";
/**
 * Tag Commands
 * Operations for managing tags and entity tagging
 */
import { Argument, Command, Flag } from "effect/unstable/cli";
import { withCliServices } from "./workspace.js";

// ============================================================================
// Tag Create Command
// ============================================================================

const tagCreateCommand = Command.make(
  "create",
  {
    name: Argument.string("name"),
    parent: Flag.string("parent").pipe(
      Flag.withAlias("p"),
      Flag.withDescription("Parent tag ID for hierarchy"),
      Flag.optional
    ),
    description: Flag.string("description").pipe(
      Flag.withAlias("d"),
      Flag.withDescription("Tag description"),
      Flag.optional
    ),
  },
  ({ name, parent, description }) =>
    Effect.gen(function* () {
      const parentValue = Option.getOrUndefined(parent);
      const descValue = Option.getOrUndefined(description);

      const tag = yield* withCliServices(
        Effect.gen(function* () {
          const tagService = yield* TagServiceTag;

          // If parent is specified, use hierarchical creation
          if (parentValue) {
            const tagPath = `${parentValue}/${name}`;
            return yield* tagService.ensureHierarchy(tagPath);
          }

          // Otherwise create a root tag
          return yield* tagService.create({
            id: name,
            name,
            description: descValue,
          });
        })
      );

      yield* Console.log("");
      yield* Console.log("Tag created successfully!");
      yield* Console.log("");
      yield* Console.log(`ID:     #${tag.id}`);
      yield* Console.log(`Name:   ${tag.name}`);
      if (tag.description) {
        yield* Console.log(`Desc:   ${tag.description}`);
      }
      if (tag.parentId) {
        yield* Console.log(`Parent: #${tag.parentId}`);
      }
      yield* Console.log("");
    }).pipe(
      Effect.catchTags({
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        ValidationError: (e) =>
          Console.error(`Validation error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
      })
    )
);

// ============================================================================
// Tag List Command
// ============================================================================

const tagListCommand = Command.make(
  "list",
  {
    search: Flag.string("search").pipe(
      Flag.withAlias("s"),
      Flag.withDescription("Search tags by name"),
      Flag.optional
    ),
    tree: Flag.boolean("tree").pipe(
      Flag.withDescription("Show as hierarchy tree"),
      Flag.withDefault(false)
    ),
  },
  ({ search, tree }) =>
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Existing tree rendering logic is localized to the list command.
    Effect.gen(function* () {
      const searchValue = Option.getOrUndefined(search);

      const tags = yield* withCliServices(
        Effect.gen(function* () {
          const tagService = yield* TagServiceTag;

          if (searchValue) {
            return yield* tagService.search(searchValue);
          }

          return yield* tagService.getAll();
        })
      );

      yield* Console.log("");
      yield* Console.log(`Tags (${tags.length})`);
      yield* Console.log("=".repeat(40));
      yield* Console.log("");

      if (tags.length === 0) {
        yield* Console.log("No tags found.");
        yield* Console.log("");
        yield* Console.log("Create one with: kioku tag create <name>");
      } else if (tree) {
        // Build tree structure
        const rootTags = tags.filter((t) => !t.parentId);
        const childMap = new Map<string, Array<(typeof tags)[0]>>();

        for (const tag of tags) {
          if (tag.parentId) {
            const children = childMap.get(tag.parentId) || [];
            children.push(tag);
            childMap.set(tag.parentId, children);
          }
        }

        const printTag = function* (
          tag: (typeof tags)[0],
          indent: number
        ): Generator<Effect.Effect<void, never, never>, void, void> {
          const prefix = "  ".repeat(indent);
          const desc = tag.description ? ` - ${tag.description}` : "";
          yield Console.log(`${prefix}#${tag.id}${desc}`);

          const children = childMap.get(tag.id) || [];
          for (const child of children) {
            yield* printTag(child, indent + 1);
          }
        };

        for (const rootTag of rootTags) {
          yield* Effect.gen(function* () {
            for (const effect of printTag(rootTag, 0)) {
              yield* effect;
            }
          });
        }
      } else {
        for (const tag of tags) {
          const desc = tag.description ? ` - ${tag.description}` : "";
          const parent = tag.parentId ? ` (parent: #${tag.parentId})` : "";
          yield* Console.log(`#${tag.id}${desc}${parent}`);
        }
      }

      yield* Console.log("");
    }).pipe(
      Effect.catchTags({
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
      })
    )
);

// ============================================================================
// Tag Apply Command
// ============================================================================

const tagApplyCommand = Command.make(
  "apply",
  {
    entityId: Argument.string("entity-id"),
    tagId: Argument.string("tag"),
  },
  ({ entityId, tagId }) =>
    Effect.gen(function* () {
      yield* withCliServices(
        Effect.gen(function* () {
          const tagService = yield* TagServiceTag;

          // Ensure tag exists (creates hierarchy if needed)
          const tag = yield* tagService.ensureHierarchy(tagId);

          // Apply to entity
          yield* tagService.applyToEntity(tag.id, entityId);
        })
      );

      yield* Console.log("");
      yield* Console.log(`Tag #${tagId} applied to entity ${entityId}`);
      yield* Console.log("");
    }).pipe(
      Effect.catchTags({
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        EntityNotFoundError: (e) =>
          Console.error(`Error: Entity not found: ${e.entityId}`).pipe(
            Effect.andThen(Effect.fail(e))
          ),
        TagNotFoundError: (e) =>
          Console.error(`Error: Tag not found: ${e.tagId}`).pipe(Effect.andThen(Effect.fail(e))),
        ValidationError: (e) =>
          Console.error(`Validation error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
      })
    )
);

// ============================================================================
// Tag Remove Command
// ============================================================================

const tagRemoveCommand = Command.make(
  "remove",
  {
    entityId: Argument.string("entity-id"),
    tagId: Argument.string("tag"),
  },
  ({ entityId, tagId }) =>
    Effect.gen(function* () {
      yield* withCliServices(
        Effect.gen(function* () {
          const tagService = yield* TagServiceTag;
          yield* tagService.removeFromEntity(tagId as TagId, entityId);
        })
      );

      yield* Console.log("");
      yield* Console.log(`Tag #${tagId} removed from entity ${entityId}`);
      yield* Console.log("");
    }).pipe(
      Effect.catchTags({
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        EntityNotFoundError: (e) =>
          Console.error(`Error: Entity not found: ${e.entityId}`).pipe(
            Effect.andThen(Effect.fail(e))
          ),
        TagNotFoundError: (e) =>
          Console.error(`Error: Tag not found: ${e.tagId}`).pipe(Effect.andThen(Effect.fail(e))),
      })
    )
);

// ============================================================================
// Tag Show Command
// ============================================================================

const tagShowCommand = Command.make(
  "show",
  {
    id: Argument.string("tag-id"),
  },
  ({ id }) =>
    Effect.gen(function* () {
      const { tag, ancestors, children } = yield* withCliServices(
        Effect.gen(function* () {
          const tagService = yield* TagServiceTag;

          const tag = yield* tagService.getById(id as TagId);
          const ancestors = yield* tagService.getAncestors(tag.id);
          const children = yield* Effect.catch(tagService.getChildren(tag.id), () =>
            Effect.succeed([] as ReadonlyArray<typeof tag>)
          );

          return { tag, ancestors, children };
        })
      );

      yield* Console.log("");
      yield* Console.log(`Tag: #${tag.id}`);
      yield* Console.log("=".repeat(40));
      yield* Console.log("");
      yield* Console.log(`Name:    ${tag.name}`);
      if (tag.description) {
        yield* Console.log(`Desc:    ${tag.description}`);
      }
      yield* Console.log(`Created: ${tag.createdAt.toISOString()}`);

      if (ancestors.length > 0) {
        yield* Console.log("");
        yield* Console.log("Ancestors:");
        for (const ancestor of [...ancestors].reverse()) {
          yield* Console.log(`  #${ancestor.id}`);
        }
      }

      if (children.length > 0) {
        yield* Console.log("");
        yield* Console.log("Children:");
        for (const child of children) {
          yield* Console.log(`  #${child.id}`);
        }
      }

      yield* Console.log("");
    }).pipe(
      Effect.catchTags({
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        TagNotFoundError: (e) =>
          Console.error(`Error: Tag not found: ${e.tagId}`).pipe(Effect.andThen(Effect.fail(e))),
      })
    )
);

// ============================================================================
// Tag Delete Command
// ============================================================================

const tagDeleteCommand = Command.make(
  "delete",
  {
    id: Argument.string("tag-id"),
    force: Flag.boolean("force").pipe(
      Flag.withAlias("f"),
      Flag.withDescription("Skip confirmation"),
      Flag.withDefault(false)
    ),
  },
  ({ id, force }) =>
    Effect.gen(function* () {
      yield* withCliServices(
        Effect.gen(function* () {
          const tagService = yield* TagServiceTag;

          const tag = yield* tagService.getById(id as TagId);

          if (!force) {
            yield* Console.log(`Deleting tag: #${tag.id}`);
            yield* Console.log("(Use --force to skip this confirmation in scripts)");
          }

          yield* tagService.delete(tag.id);
        })
      );

      yield* Console.log("");
      yield* Console.log(`Tag #${id} deleted.`);
      yield* Console.log("");
    }).pipe(
      Effect.catchTags({
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        TagNotFoundError: (e) =>
          Console.error(`Error: Tag not found: ${e.tagId}`).pipe(Effect.andThen(Effect.fail(e))),
      })
    )
);

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
);
