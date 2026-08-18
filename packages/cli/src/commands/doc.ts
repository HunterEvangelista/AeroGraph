import { EntityServiceTag, EntityType, LinkRepositoryTag, TagServiceTag } from "@kioku/core";
import { Console, Data, Effect, Option } from "effect";
/**
 * Doc Commands
 * CRUD operations for document entities
 */
import { Argument, Command, Flag } from "effect/unstable/cli";
import { formattedEntityId, loadFormattedEntityIds } from "../entity-display";
import { formatEntityIdMatches, resolveEntityId } from "../entity-id";
import { withCliServices } from "./workspace";

// ============================================================================
// Custom Error Types
// ============================================================================

class NotADocError extends Data.TaggedError("NotADocError")<{
  readonly id: string;
}> {}

class NoUpdatesError extends Data.TaggedError("NoUpdatesError")<object> {}

interface DocUpdates {
  title?: string;
  content?: string;
}

interface DocCommandError {
  readonly _tag: string;
  readonly matches?: Parameters<typeof formatEntityIdMatches>[0];
  readonly message?: string;
  readonly value?: string;
}

const formatDocError = (error: DocCommandError): string => {
  if (error._tag === "AmbiguousEntityIdError") {
    return `Entity id "${error.value ?? ""}" is ambiguous: ${formatEntityIdMatches(error.matches ?? [])}`;
  }

  return `${error._tag}: ${error.message ?? String(error)}`;
};

// ============================================================================
// Doc Create Command
// ============================================================================

const docCreateCommand = Command.make(
  "create",
  {
    title: Argument.string("title"),
    content: Flag.string("content").pipe(
      Flag.withAlias("c"),
      Flag.withDescription("Document content (markdown)"),
      Flag.optional
    ),
    tags: Flag.string("tags").pipe(
      Flag.withAlias("t"),
      Flag.withDescription("Comma-separated tags to apply"),
      Flag.optional
    ),
  },
  ({ title, content, tags }) =>
    Effect.gen(function* () {
      const { doc, displayIds } = yield* withCliServices(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;

          const contentValue = Option.getOrElse(content, () => "");
          const doc = yield* entityService.createDoc({
            title,
            content: contentValue,
          });

          // Apply tags if provided
          const tagsValue = Option.getOrUndefined(tags);
          if (tagsValue) {
            const tagService = yield* TagServiceTag;
            const tagList = tagsValue.split(",").map((t) => t.trim());

            for (const tagPath of tagList) {
              if (!tagPath) continue;
              // Ensure tag hierarchy exists
              const tag = yield* tagService.ensureHierarchy(tagPath);
              // Apply tag to entity
              yield* tagService.applyToEntity(tag.id, doc.id);
            }
          }

          const displayIds = yield* loadFormattedEntityIds([doc.id]);
          return { doc, displayIds };
        })
      );

      yield* Console.log("");
      yield* Console.log("Document created successfully!");
      yield* Console.log("");
      yield* Console.log(`ID:      ${formattedEntityId(displayIds, doc.id)}`);
      yield* Console.log(`Title:   ${doc.title}`);
      yield* Console.log(`Version: ${doc.version}`);
      yield* Console.log("");
    }).pipe(
      Effect.catch((error) =>
        Console.error(
          `Error: ${error._tag}: ${"message" in error ? error.message : String(error)}`
        ).pipe(Effect.andThen(Effect.fail(error)))
      )
    )
);

// ============================================================================
// Doc Show Command
// ============================================================================

const docShowCommand = Command.make(
  "show",
  {
    id: Argument.string("id"),
  },
  ({ id }) =>
    Effect.gen(function* () {
      const { doc, links, linkedEntities, tags, displayIds } = yield* withCliServices(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;
          const linkRepository = yield* LinkRepositoryTag;
          const tagService = yield* TagServiceTag;

          const resolvedId = yield* resolveEntityId(id);
          const entity = yield* entityService.getById(resolvedId);

          if (entity._tag !== EntityType.Doc) {
            return yield* new NotADocError({ id: resolvedId });
          }

          const tags = yield* tagService.getTagsForEntity(entity.id);
          const links = yield* linkRepository.getAllForEntity(entity.id);
          const linkedEntities = new Map<string, string>();

          for (const link of links) {
            const otherId = link.sourceId === entity.id ? link.targetId : link.sourceId;
            const other = yield* entityService.getById(otherId);
            linkedEntities.set(other.id, `[${other._tag}] ${other.title}`);
          }

          const displayIds = yield* loadFormattedEntityIds([entity.id, ...linkedEntities.keys()]);
          return { doc: entity, links, linkedEntities, tags, displayIds };
        })
      );

      yield* Console.log("");
      yield* Console.log(`# ${doc.title}`);
      yield* Console.log("");
      yield* Console.log(`ID:      ${formattedEntityId(displayIds, doc.id)}`);
      yield* Console.log(`Version: ${doc.version}`);
      yield* Console.log(`Created: ${doc.createdAt.toISOString()}`);
      yield* Console.log(`Updated: ${doc.updatedAt.toISOString()}`);

      if (tags.length > 0) {
        yield* Console.log(`Tags:    ${tags.map((t) => `#${t.id}`).join(", ")}`);
      }

      yield* Console.log("");
      yield* Console.log("-".repeat(40));
      yield* Console.log("");

      if (doc.content) {
        yield* Console.log(doc.content);
      } else {
        yield* Console.log("(No content)");
      }

      if (links.length > 0) {
        yield* Console.log("");
        yield* Console.log("Links");
        yield* Console.log("-".repeat(40));

        for (const link of links) {
          const isOutgoing = link.sourceId === doc.id;
          const otherId = isOutgoing ? link.targetId : link.sourceId;
          const direction = isOutgoing ? `--${link.type}-->` : `<--${link.type}--`;
          const summary = linkedEntities.get(otherId) ?? otherId;
          yield* Console.log(
            `  ${direction} ${formattedEntityId(displayIds, otherId)}  ${summary}`
          );
        }
      }

      yield* Console.log("");
    }).pipe(
      Effect.catch((error) =>
        Console.error(`Error: ${formatDocError(error)}`).pipe(Effect.andThen(Effect.fail(error)))
      )
    )
);

// ============================================================================
// Doc List Command
// ============================================================================

const docListCommand = Command.make(
  "list",
  {
    tag: Flag.string("tag").pipe(
      Flag.withAlias("t"),
      Flag.withDescription("Filter by tag"),
      Flag.optional
    ),
    search: Flag.string("search").pipe(
      Flag.withAlias("s"),
      Flag.withDescription("Search in title/content"),
      Flag.optional
    ),
  },
  ({ tag, search }) =>
    Effect.gen(function* () {
      const { docs, displayIds } = yield* withCliServices(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;

          const tagValue = Option.getOrUndefined(tag);
          const searchValue = Option.getOrUndefined(search);

          if (searchValue) {
            const results = yield* entityService.search(searchValue);
            const docs = results.filter((e) => e._tag === EntityType.Doc);
            const displayIds = yield* loadFormattedEntityIds(docs.map((doc) => doc.id));
            return { docs, displayIds };
          }

          if (tagValue) {
            const results = yield* entityService.getByTag(tagValue);
            const docs = results.filter((e) => e._tag === EntityType.Doc);
            const displayIds = yield* loadFormattedEntityIds(docs.map((doc) => doc.id));
            return { docs, displayIds };
          }

          const docs = yield* entityService.getAll(EntityType.Doc);
          const displayIds = yield* loadFormattedEntityIds(docs.map((doc) => doc.id));
          return { docs, displayIds };
        })
      );

      yield* Console.log("");
      yield* Console.log(`Documents (${docs.length})`);
      yield* Console.log("=".repeat(40));
      yield* Console.log("");

      if (docs.length === 0) {
        yield* Console.log("No documents found.");
        yield* Console.log("");
        yield* Console.log('Create one with: kioku doc create "My Document"');
      } else {
        for (const doc of docs) {
          const preview = doc.content.slice(0, 50).replace(/\n/g, " ");
          const ellipsis = doc.content.length > 50 ? "..." : "";
          yield* Console.log(`${formattedEntityId(displayIds, doc.id)}  ${doc.title}`);
          if (preview) {
            yield* Console.log(`          ${preview}${ellipsis}`);
          }
          yield* Console.log("");
        }
      }
    }).pipe(
      Effect.catch((error) =>
        Console.error(
          `Error: ${error._tag}: ${"message" in error ? error.message : String(error)}`
        ).pipe(Effect.andThen(Effect.fail(error)))
      )
    )
);

// ============================================================================
// Doc Edit Command
// ============================================================================

const docEditCommand = Command.make(
  "edit",
  {
    id: Argument.string("id"),
    title: Flag.string("title").pipe(Flag.withDescription("New title"), Flag.optional),
    content: Flag.string("content").pipe(
      Flag.withAlias("c"),
      Flag.withDescription("New content"),
      Flag.optional
    ),
  },
  ({ id, title, content }) =>
    Effect.gen(function* () {
      const titleValue = Option.getOrUndefined(title);
      const contentValue = Option.getOrUndefined(content);

      if (!titleValue && !contentValue) {
        return yield* new NoUpdatesError();
      }

      const updated = yield* withCliServices(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;

          // Verify it exists and is a doc
          const resolvedId = yield* resolveEntityId(id);
          const existing = yield* entityService.getById(resolvedId);

          if (existing._tag !== EntityType.Doc) {
            return yield* new NotADocError({ id: resolvedId });
          }

          const updates: DocUpdates = {};
          if (titleValue) updates.title = titleValue;
          if (contentValue) updates.content = contentValue;

          return yield* entityService.update(resolvedId, updates);
        })
      );

      yield* Console.log("");
      yield* Console.log("Document updated successfully!");
      yield* Console.log("");
      yield* Console.log(`ID:      ${updated.id}`);
      yield* Console.log(`Title:   ${updated.title}`);
      yield* Console.log(`Version: ${updated.version}`);
      yield* Console.log("");
    }).pipe(
      Effect.catchTag("NoUpdatesError", () =>
        Console.error("Error: Provide at least --title or --content to update").pipe(
          Effect.andThen(Effect.fail(new NoUpdatesError()))
        )
      ),
      Effect.catch((error) =>
        Console.error(`Error: ${formatDocError(error)}`).pipe(Effect.andThen(Effect.fail(error)))
      )
    )
);

// ============================================================================
// Doc Delete Command
// ============================================================================

const docDeleteCommand = Command.make(
  "delete",
  {
    id: Argument.string("id"),
    force: Flag.boolean("force").pipe(
      Flag.withAlias("f"),
      Flag.withDescription("Skip confirmation"),
      Flag.withDefault(false)
    ),
  },
  ({ id, force }) =>
    Effect.gen(function* () {
      const deletedId = yield* withCliServices(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;

          // Verify it exists and is a doc
          const resolvedId = yield* resolveEntityId(id);
          const existing = yield* entityService.getById(resolvedId);

          if (existing._tag !== EntityType.Doc) {
            return yield* new NotADocError({ id: resolvedId });
          }

          if (!force) {
            yield* Console.log(`Deleting document: ${existing.title}`);
            yield* Console.log("(Use --force to skip this confirmation in scripts)");
          }

          yield* entityService.delete(resolvedId);
          return existing.id;
        })
      );

      yield* Console.log("");
      yield* Console.log(`Document ${deletedId} deleted.`);
      yield* Console.log("");
    }).pipe(
      Effect.catch((error) =>
        Console.error(`Error: ${formatDocError(error)}`).pipe(Effect.andThen(Effect.fail(error)))
      )
    )
);

// ============================================================================
// Doc Parent Command (with subcommands)
// ============================================================================

export const docCommand = Command.make("doc").pipe(
  Command.withDescription("Manage document entities"),
  Command.withSubcommands([
    docCreateCommand,
    docShowCommand,
    docListCommand,
    docEditCommand,
    docDeleteCommand,
  ])
);
