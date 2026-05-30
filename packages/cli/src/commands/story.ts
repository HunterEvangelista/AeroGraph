import {
  EntityServiceTag,
  EntityTypeEnum,
  GraphServiceTag,
  type Story,
  StoryStatusEnum,
  TagServiceTag,
} from "@kioku/core";
import { Console, Data, Effect, Option } from "effect";
/**
 * Story Commands
 * CRUD operations for story entities
 */
import { Argument, Command, Flag } from "effect/unstable/cli";
import { ConfigServiceTag } from "../config.js";
import { CliCoreLive } from "../db/index.js";

// ============================================================================
// Custom Error Types
// ============================================================================

class NotAStoryError extends Data.TaggedError("NotAStoryError")<{
  readonly id: string;
}> {}

class NoUpdatesError extends Data.TaggedError("NoUpdatesError")<object> {}

class InvalidStoryStatusError extends Data.TaggedError("InvalidStoryStatusError")<{
  readonly status: string;
}> {}

class InvalidStoryArgsError extends Data.TaggedError("InvalidStoryArgsError")<{
  readonly message: string;
}> {}

// ============================================================================
// Helpers
// ============================================================================

const acceptedStatuses = [
  StoryStatusEnum.Backlog,
  StoryStatusEnum.Todo,
  StoryStatusEnum.InProgress,
  "in-progress",
  StoryStatusEnum.Done,
  StoryStatusEnum.Cancelled,
] as const;

const parseStoryStatus = (status: string) => {
  const normalized = status.trim().replace(/-/g, "_");

  switch (normalized) {
    case StoryStatusEnum.Backlog:
      return StoryStatusEnum.Backlog;
    case StoryStatusEnum.Todo:
      return StoryStatusEnum.Todo;
    case StoryStatusEnum.InProgress:
      return StoryStatusEnum.InProgress;
    case StoryStatusEnum.Done:
      return StoryStatusEnum.Done;
    case StoryStatusEnum.Cancelled:
      return StoryStatusEnum.Cancelled;
    default:
      return new InvalidStoryStatusError({ status });
  }
};

const splitTags = (value: string): ReadonlyArray<string> =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

const formatStoryError = (error: { readonly _tag?: string; readonly message?: string }): string => {
  if (error._tag === "NotAStoryError" && "id" in error) {
    return `Entity is not a story: ${String(error.id)}`;
  }

  if (error._tag === "NoUpdatesError") {
    return "Provide at least --title, --content, or --status to update";
  }

  if (error._tag === "InvalidStoryStatusError" && "status" in error) {
    return `Invalid story status "${String(error.status)}". Expected one of: ${acceptedStatuses.join(", ")}`;
  }

  if (error._tag === "InvalidStoryArgsError") {
    return error.message ?? "Invalid story command arguments";
  }

  if (error._tag === "EntityNotFoundError" && "entityId" in error) {
    return `Entity not found: ${String(error.entityId)}`;
  }

  return `${error._tag ?? "Error"}: ${error.message ?? String(error)}`;
};

const parseOptionalStatus = (status: Option.Option<string>) =>
  Effect.gen(function* () {
    const value = Option.getOrUndefined(status);
    if (!value) return undefined;

    const parsed = parseStoryStatus(value);
    if (parsed instanceof InvalidStoryStatusError) {
      return yield* Effect.fail(parsed);
    }

    return parsed;
  });

const parseStoryDeleteArgs = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    let id: string | undefined;
    let force = false;

    for (const arg of args) {
      if (arg === "--force" || arg === "-f") {
        force = true;
      } else if (arg.startsWith("-")) {
        return yield* Effect.fail(new InvalidStoryArgsError({ message: `Unknown option: ${arg}` }));
      } else if (!id) {
        id = arg;
      } else {
        return yield* Effect.fail(
          new InvalidStoryArgsError({ message: `Unexpected argument: ${arg}` })
        );
      }
    }

    if (!id) {
      return yield* Effect.fail(
        new InvalidStoryArgsError({ message: "story delete requires <id>" })
      );
    }

    return { id, force };
  });

const printStoryDetails = (story: Story) =>
  Effect.gen(function* () {
    yield* Console.log("");
    yield* Console.log(`# ${story.title}`);
    yield* Console.log("");
    yield* Console.log(`ID:      ${story.id}`);
    yield* Console.log(`Status:  ${story.status}`);
    if (story.priority) {
      yield* Console.log(`Priority: ${story.priority}`);
    }
    yield* Console.log(`Version: ${story.version}`);
    yield* Console.log(`Created: ${story.createdAt.toISOString()}`);
    yield* Console.log(`Updated: ${story.updatedAt.toISOString()}`);
  });

// ============================================================================
// Story Create Command
// ============================================================================

const storyCreateCommand = Command.make(
  "create",
  {
    title: Flag.string("title").pipe(Flag.withDescription("Story title")),
    content: Flag.string("content").pipe(
      Flag.withAlias("c"),
      Flag.withDescription("Story content"),
      Flag.optional
    ),
    status: Flag.string("status").pipe(Flag.withDescription("Story status"), Flag.optional),
    tag: Flag.string("tag").pipe(
      Flag.withAlias("t"),
      Flag.withDescription("Comma-separated tags to apply"),
      Flag.optional
    ),
  },
  ({ title, content, status, tag }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag;
      const workspace = yield* configService.load();
      const ServiceLayers = CliCoreLive(workspace.dbPath);
      const statusValue = yield* parseOptionalStatus(status);

      const story = yield* Effect.scoped(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;
          const contentValue = Option.getOrElse(content, () => "");
          const story = yield* entityService.createStory({
            title,
            content: contentValue,
            status: statusValue,
          });

          const tagValue = Option.getOrUndefined(tag);
          if (tagValue) {
            const tagService = yield* TagServiceTag;
            for (const tagPath of splitTags(tagValue)) {
              const tag = yield* tagService.ensureHierarchy(tagPath);
              yield* tagService.applyToEntity(tag.id, story.id);
            }
          }

          return story;
        }).pipe(Effect.provide(ServiceLayers))
      );

      yield* Console.log("");
      yield* Console.log("Story created successfully!");
      yield* Console.log("");
      yield* Console.log(`ID:      ${story.id}`);
      yield* Console.log(`Title:   ${story.title}`);
      yield* Console.log(`Status:  ${story.status}`);
      yield* Console.log(`Version: ${story.version}`);
      yield* Console.log("");
    }).pipe(
      Effect.catch((error) =>
        Console.error(`Error: ${formatStoryError(error)}`).pipe(Effect.andThen(Effect.fail(error)))
      )
    )
);

// ============================================================================
// Story Show Command
// ============================================================================

const storyShowCommand = Command.make(
  "show",
  {
    id: Argument.string("id"),
  },
  ({ id }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag;
      const workspace = yield* configService.load();
      const ServiceLayers = CliCoreLive(workspace.dbPath);

      const { story, tags, links, linkedEntities } = yield* Effect.scoped(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;
          const graphService = yield* GraphServiceTag;
          const tagService = yield* TagServiceTag;
          const withLinks = yield* graphService.getEntityWithLinks(id);
          const entity = withLinks.entity;

          if (entity._tag !== EntityTypeEnum.Story) {
            return yield* Effect.fail(new NotAStoryError({ id }));
          }

          const tags = yield* tagService.getTagsForEntity(entity.id);
          const links = [...withLinks.outgoingLinks, ...withLinks.incomingLinks];
          const linkedEntities = new Map<string, string>();

          for (const link of links) {
            const otherId = link.sourceId === entity.id ? link.targetId : link.sourceId;
            const other = yield* entityService.getById(
              otherId as Parameters<typeof entityService.getById>[0]
            );
            linkedEntities.set(other.id, `[${other._tag}] ${other.title}`);
          }

          return { story: entity, tags, links, linkedEntities };
        }).pipe(Effect.provide(ServiceLayers))
      );

      yield* printStoryDetails(story);

      if (tags.length > 0) {
        yield* Console.log(`Tags:    ${tags.map((tag) => `#${tag.id}`).join(", ")}`);
      }

      yield* Console.log("");
      yield* Console.log("-".repeat(40));
      yield* Console.log("");

      if (story.content) {
        yield* Console.log(story.content);
      } else {
        yield* Console.log("(No content)");
      }

      if (links.length > 0) {
        yield* Console.log("");
        yield* Console.log("Links");
        yield* Console.log("-".repeat(40));

        for (const link of links) {
          const isOutgoing = link.sourceId === story.id;
          const otherId = isOutgoing ? link.targetId : link.sourceId;
          const direction = isOutgoing ? `--${link.type}-->` : `<--${link.type}--`;
          const summary = linkedEntities.get(otherId) ?? otherId;
          yield* Console.log(`  ${direction} ${otherId}  ${summary}`);
        }
      }

      yield* Console.log("");
    }).pipe(
      Effect.catch((error) =>
        Console.error(`Error: ${formatStoryError(error)}`).pipe(Effect.andThen(Effect.fail(error)))
      )
    )
);

// ============================================================================
// Story List Command
// ============================================================================

const storyListCommand = Command.make(
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
    status: Flag.string("status").pipe(Flag.withDescription("Filter by status"), Flag.optional),
  },
  ({ tag, search, status }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag;
      const workspace = yield* configService.load();
      const ServiceLayers = CliCoreLive(workspace.dbPath);
      const statusValue = yield* parseOptionalStatus(status);

      const stories = yield* Effect.scoped(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;
          const tagValue = Option.getOrUndefined(tag);
          const searchValue = Option.getOrUndefined(search);

          const results = searchValue
            ? yield* entityService.search(searchValue)
            : tagValue
              ? yield* entityService.getByTag(tagValue)
              : yield* entityService.getAll(EntityTypeEnum.Story);

          return results.filter(
            (entity): entity is Story =>
              entity._tag === EntityTypeEnum.Story &&
              (statusValue === undefined || entity.status === statusValue)
          );
        }).pipe(Effect.provide(ServiceLayers))
      );

      yield* Console.log("");
      yield* Console.log(`Stories (${stories.length})`);
      yield* Console.log("=".repeat(40));
      yield* Console.log("");

      if (stories.length === 0) {
        yield* Console.log("No stories found.");
        yield* Console.log("");
        yield* Console.log('Create one with: kioku story create --title "User can sign in"');
      } else {
        for (const story of stories) {
          const preview = story.content.slice(0, 50).replace(/\n/g, " ");
          const ellipsis = story.content.length > 50 ? "..." : "";
          yield* Console.log(`${story.id.slice(0, 8)}  [${story.status}] ${story.title}`);
          if (preview) {
            yield* Console.log(`          ${preview}${ellipsis}`);
          }
          yield* Console.log("");
        }
      }
    }).pipe(
      Effect.catch((error) =>
        Console.error(`Error: ${formatStoryError(error)}`).pipe(Effect.andThen(Effect.fail(error)))
      )
    )
);

// ============================================================================
// Story Edit Command
// ============================================================================

const storyEditCommand = Command.make(
  "edit",
  {
    id: Argument.string("id"),
    title: Flag.string("title").pipe(Flag.optional),
    content: Flag.string("content").pipe(Flag.withAlias("c"), Flag.optional),
    status: Flag.string("status").pipe(Flag.optional),
  },
  ({ id, title, content, status }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag;
      const workspace = yield* configService.load();
      const ServiceLayers = CliCoreLive(workspace.dbPath);
      const titleValue = Option.getOrUndefined(title);
      const contentValue = Option.getOrUndefined(content);
      const statusValue = yield* parseOptionalStatus(status);

      if (titleValue === undefined && contentValue === undefined && statusValue === undefined) {
        return yield* Effect.fail(new NoUpdatesError());
      }

      const updated = yield* Effect.scoped(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;
          const existing = yield* entityService.getById(
            id as Parameters<typeof entityService.getById>[0]
          );

          if (existing._tag !== EntityTypeEnum.Story) {
            return yield* Effect.fail(new NotAStoryError({ id }));
          }

          const updates: { title?: string; content?: string; status?: StoryStatusEnum } = {};
          if (titleValue !== undefined) updates.title = titleValue;
          if (contentValue !== undefined) updates.content = contentValue;
          if (statusValue !== undefined) updates.status = statusValue;

          return yield* entityService.update(
            id as Parameters<typeof entityService.getById>[0],
            updates
          );
        }).pipe(Effect.provide(ServiceLayers))
      );

      if (updated._tag !== EntityTypeEnum.Story) {
        return yield* Effect.fail(new NotAStoryError({ id: updated.id }));
      }

      yield* Console.log("");
      yield* Console.log("Story updated successfully!");
      yield* Console.log("");
      yield* Console.log(`ID:      ${updated.id}`);
      yield* Console.log(`Title:   ${updated.title}`);
      yield* Console.log(`Status:  ${updated.status}`);
      yield* Console.log(`Version: ${updated.version}`);
      yield* Console.log("");
    }).pipe(
      Effect.catch((error) =>
        Console.error(`Error: ${formatStoryError(error)}`).pipe(Effect.andThen(Effect.fail(error)))
      )
    )
);

// ============================================================================
// Story Delete Command
// ============================================================================

const storyDeleteCommand = Command.make(
  "delete",
  {
    args: Argument.string("args").pipe(Argument.variadic()),
  },
  ({ args }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag;
      const workspace = yield* configService.load();
      const ServiceLayers = CliCoreLive(workspace.dbPath);
      const values = yield* parseStoryDeleteArgs(args);

      yield* Effect.scoped(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;
          const existing = yield* entityService.getById(
            values.id as Parameters<typeof entityService.getById>[0]
          );

          if (existing._tag !== EntityTypeEnum.Story) {
            return yield* Effect.fail(new NotAStoryError({ id: values.id }));
          }

          if (!values.force) {
            yield* Console.log(`Deleting story: ${existing.title}`);
            yield* Console.log("(Use --force to skip this confirmation in scripts)");
          }

          yield* entityService.delete(values.id as Parameters<typeof entityService.getById>[0]);
        }).pipe(Effect.provide(ServiceLayers))
      );

      yield* Console.log("");
      yield* Console.log(`Story ${values.id} deleted.`);
      yield* Console.log("");
    }).pipe(
      Effect.catch((error) =>
        Console.error(`Error: ${formatStoryError(error)}`).pipe(Effect.andThen(Effect.fail(error)))
      )
    )
);

// ============================================================================
// Story Parent Command (with subcommands)
// ============================================================================

export const storyCommand = Command.make("story").pipe(
  Command.withDescription("Manage story entities"),
  Command.withSubcommands([
    storyCreateCommand,
    storyShowCommand,
    storyListCommand,
    storyEditCommand,
    storyDeleteCommand,
  ])
);
