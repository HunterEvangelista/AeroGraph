/**
 * Doc Commands
 * CRUD operations for document entities
 */
import { Args, Command, Options } from "@effect/cli";
import { EntityServiceTag, EntityTypeEnum, LinkRepositoryTag, TagServiceTag } from "@kioku/core";
import { Console, Data, Effect, Layer, Option } from "effect";
import { ConfigServiceTag } from "../config.js";
import { CliCoreLive, SqliteRepositoriesLive } from "../db/index.js";

// ============================================================================
// Custom Error Types
// ============================================================================

class NotADocError extends Data.TaggedError("NotADocError")<{
  readonly id: string;
}> {}

class NoUpdatesError extends Data.TaggedError("NoUpdatesError")<object> {}

// ============================================================================
// Doc Create Command
// ============================================================================

const docCreateCommand = Command.make(
  "create",
  {
    title: Args.text({ name: "title" }),
    content: Options.text("content").pipe(
      Options.withAlias("c"),
      Options.withDescription("Document content (markdown)"),
      Options.optional
    ),
    tags: Options.text("tags").pipe(
      Options.withAlias("t"),
      Options.withDescription("Comma-separated tags to apply"),
      Options.optional
    ),
  },
  ({ title, content, tags }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag;
      const workspace = yield* configService.load();
      const ServiceLayers = Layer.merge(
        CliCoreLive(workspace.dbPath),
        SqliteRepositoriesLive(workspace.dbPath)
      );

      const doc = yield* Effect.scoped(
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

          return doc;
        }).pipe(Effect.provide(ServiceLayers))
      );

      yield* Console.log("");
      yield* Console.log("Document created successfully!");
      yield* Console.log("");
      yield* Console.log(`ID:      ${doc.id}`);
      yield* Console.log(`Title:   ${doc.title}`);
      yield* Console.log(`Version: ${doc.version}`);
      yield* Console.log("");
    }).pipe(
      Effect.catchAll((error) =>
        Console.error(
          `Error: ${error._tag}: ${"message" in error ? error.message : String(error)}`
        ).pipe(Effect.zipRight(Effect.fail(error)))
      )
    )
);

// ============================================================================
// Doc Show Command
// ============================================================================

const docShowCommand = Command.make(
  "show",
  {
    id: Args.text({ name: "id" }),
  },
  ({ id }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag;
      const workspace = yield* configService.load();
      const ServiceLayers = Layer.merge(
        CliCoreLive(workspace.dbPath),
        SqliteRepositoriesLive(workspace.dbPath)
      );

      const { doc, links, linkedEntities, tags } = yield* Effect.scoped(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;
          const linkRepository = yield* LinkRepositoryTag;
          const tagService = yield* TagServiceTag;

          const entity = yield* entityService.getById(
            id as Parameters<typeof entityService.getById>[0]
          );

          if (entity._tag !== EntityTypeEnum.Doc) {
            return yield* Effect.fail(new NotADocError({ id }));
          }

          const tags = yield* tagService.getTagsForEntity(entity.id);
          const links = yield* linkRepository.getAllForEntity(entity.id);
          const linkedEntities = new Map<string, string>();

          for (const link of links) {
            const otherId = link.sourceId === entity.id ? link.targetId : link.sourceId;
            const other = yield* entityService.getById(
              otherId as Parameters<typeof entityService.getById>[0]
            );
            linkedEntities.set(other.id, `[${other._tag}] ${other.title}`);
          }

          return { doc: entity, links, linkedEntities, tags };
        }).pipe(Effect.provide(ServiceLayers))
      );

      yield* Console.log("");
      yield* Console.log(`# ${doc.title}`);
      yield* Console.log("");
      yield* Console.log(`ID:      ${doc.id}`);
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
          yield* Console.log(`  ${direction} ${otherId}  ${summary}`);
        }
      }

      yield* Console.log("");
    }).pipe(
      Effect.catchAll((error) =>
        Console.error(
          `Error: ${error._tag}: ${"message" in error ? error.message : String(error)}`
        ).pipe(Effect.zipRight(Effect.fail(error)))
      )
    )
);

// ============================================================================
// Doc List Command
// ============================================================================

const docListCommand = Command.make(
  "list",
  {
    tag: Options.text("tag").pipe(
      Options.withAlias("t"),
      Options.withDescription("Filter by tag"),
      Options.optional
    ),
    search: Options.text("search").pipe(
      Options.withAlias("s"),
      Options.withDescription("Search in title/content"),
      Options.optional
    ),
  },
  ({ tag, search }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag;
      const workspace = yield* configService.load();
      const ServiceLayers = CliCoreLive(workspace.dbPath);

      const docs = yield* Effect.scoped(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;

          const tagValue = Option.getOrUndefined(tag);
          const searchValue = Option.getOrUndefined(search);

          if (searchValue) {
            const results = yield* entityService.search(searchValue);
            return results.filter((e) => e._tag === EntityTypeEnum.Doc);
          }

          if (tagValue) {
            const results = yield* entityService.getByTag(tagValue);
            return results.filter((e) => e._tag === EntityTypeEnum.Doc);
          }

          return yield* entityService.getAll(EntityTypeEnum.Doc);
        }).pipe(Effect.provide(ServiceLayers))
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
          yield* Console.log(`${doc.id.slice(0, 8)}  ${doc.title}`);
          if (preview) {
            yield* Console.log(`          ${preview}${ellipsis}`);
          }
          yield* Console.log("");
        }
      }
    }).pipe(
      Effect.catchAll((error) =>
        Console.error(
          `Error: ${error._tag}: ${"message" in error ? error.message : String(error)}`
        ).pipe(Effect.zipRight(Effect.fail(error)))
      )
    )
);

// ============================================================================
// Doc Edit Command
// ============================================================================

const docEditCommand = Command.make(
  "edit",
  {
    id: Args.text({ name: "id" }),
    title: Options.text("title").pipe(Options.withDescription("New title"), Options.optional),
    content: Options.text("content").pipe(
      Options.withAlias("c"),
      Options.withDescription("New content"),
      Options.optional
    ),
  },
  ({ id, title, content }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag;
      const workspace = yield* configService.load();
      const ServiceLayers = CliCoreLive(workspace.dbPath);

      const titleValue = Option.getOrUndefined(title);
      const contentValue = Option.getOrUndefined(content);

      if (!titleValue && !contentValue) {
        return yield* Effect.fail(new NoUpdatesError({}));
      }

      const updated = yield* Effect.scoped(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;

          // Verify it exists and is a doc
          const existing = yield* entityService.getById(
            id as Parameters<typeof entityService.getById>[0]
          );

          if (existing._tag !== EntityTypeEnum.Doc) {
            return yield* Effect.fail(new NotADocError({ id }));
          }

          const updates: { title?: string; content?: string } = {};
          if (titleValue) updates.title = titleValue;
          if (contentValue) updates.content = contentValue;

          return yield* entityService.update(
            id as Parameters<typeof entityService.getById>[0],
            updates
          );
        }).pipe(Effect.provide(ServiceLayers))
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
          Effect.zipRight(Effect.fail(new NoUpdatesError({})))
        )
      ),
      Effect.catchAll((error) =>
        Console.error(
          `Error: ${error._tag}: ${"message" in error ? error.message : String(error)}`
        ).pipe(Effect.zipRight(Effect.fail(error)))
      )
    )
);

// ============================================================================
// Doc Delete Command
// ============================================================================

const docDeleteCommand = Command.make(
  "delete",
  {
    id: Args.text({ name: "id" }),
    force: Options.boolean("force").pipe(
      Options.withAlias("f"),
      Options.withDescription("Skip confirmation"),
      Options.withDefault(false)
    ),
  },
  ({ id, force }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag;
      const workspace = yield* configService.load();
      const ServiceLayers = CliCoreLive(workspace.dbPath);

      yield* Effect.scoped(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;

          // Verify it exists and is a doc
          const existing = yield* entityService.getById(
            id as Parameters<typeof entityService.getById>[0]
          );

          if (existing._tag !== EntityTypeEnum.Doc) {
            return yield* Effect.fail(new NotADocError({ id }));
          }

          if (!force) {
            yield* Console.log(`Deleting document: ${existing.title}`);
            yield* Console.log("(Use --force to skip this confirmation in scripts)");
          }

          yield* entityService.delete(id as Parameters<typeof entityService.getById>[0]);
        }).pipe(Effect.provide(ServiceLayers))
      );

      yield* Console.log("");
      yield* Console.log(`Document ${id} deleted.`);
      yield* Console.log("");
    }).pipe(
      Effect.catchAll((error) =>
        Console.error(
          `Error: ${error._tag}: ${"message" in error ? error.message : String(error)}`
        ).pipe(Effect.zipRight(Effect.fail(error)))
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
