/**
 * Code Ref Commands
 * CRUD operations for implementation anchors.
 */
import { Args, Command, Options } from "@effect/cli";
import {
  type CodeRef,
  EntityServiceTag,
  EntityTypeEnum,
  GraphServiceTag,
  TagServiceTag,
} from "@kioku/core";
import { Console, Data, Effect, Option } from "effect";
import { ConfigServiceTag } from "../config.js";
import { CliCoreLive } from "../db/index.js";

class NotACodeRefError extends Data.TaggedError("NotACodeRefError")<{
  readonly id: string;
}> {}

class InvalidCodeRefInputError extends Data.TaggedError("InvalidCodeRefInputError")<{
  readonly message: string;
}> {}

const splitTags = (value: string): ReadonlyArray<string> =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

const formatCodeRefError = (error: {
  readonly _tag?: string;
  readonly message?: string;
}): string => {
  if (error._tag === "NotACodeRefError" && "id" in error) {
    return `Entity is not a code ref: ${String(error.id)}`;
  }

  if (error._tag === "InvalidCodeRefInputError") {
    return error.message ?? "Invalid code ref input";
  }

  if (error._tag === "EntityNotFoundError" && "entityId" in error) {
    return `Entity not found: ${String(error.entityId)}`;
  }

  return `${error._tag ?? "Error"}: ${error.message ?? String(error)}`;
};

const lineRange = (codeRef: CodeRef): string => {
  if (codeRef.startLine && codeRef.endLine) return `${codeRef.startLine}-${codeRef.endLine}`;
  if (codeRef.startLine) return `${codeRef.startLine}`;
  return "(not set)";
};

const validateLineRange = (startLine: number | undefined, endLine: number | undefined) =>
  Effect.gen(function* () {
    if (endLine !== undefined && startLine === undefined) {
      return yield* Effect.fail(
        new InvalidCodeRefInputError({ message: "--end-line requires --start-line" })
      );
    }

    if (startLine !== undefined && endLine !== undefined && endLine < startLine) {
      return yield* Effect.fail(
        new InvalidCodeRefInputError({
          message: "--end-line must be greater than or equal to --start-line",
        })
      );
    }
  });

const codeRefAddCommand = Command.make(
  "add",
  {
    title: Options.text("title").pipe(Options.withDescription("Code ref title")),
    file: Options.text("file").pipe(Options.withDescription("Workspace-relative file path")),
    startLine: Options.integer("start-line").pipe(
      Options.withDescription("Starting line number"),
      Options.optional
    ),
    endLine: Options.integer("end-line").pipe(
      Options.withDescription("Ending line number"),
      Options.optional
    ),
    symbol: Options.text("symbol").pipe(Options.withDescription("Symbol name"), Options.optional),
    commitHash: Options.text("commit-hash").pipe(
      Options.withDescription("Commit hash for this anchor"),
      Options.optional
    ),
    tag: Options.text("tag").pipe(
      Options.withAlias("t"),
      Options.withDescription("Comma-separated tags to apply"),
      Options.optional
    ),
  },
  ({ title, file, startLine, endLine, symbol, commitHash, tag }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag;
      const workspace = yield* configService.load();
      const ServiceLayers = CliCoreLive(workspace.dbPath);
      const startLineValue = Option.getOrUndefined(startLine);
      const endLineValue = Option.getOrUndefined(endLine);
      const symbolValue = Option.getOrUndefined(symbol);
      const commitHashValue = Option.getOrUndefined(commitHash);
      const tagValue = Option.getOrUndefined(tag);

      yield* validateLineRange(startLineValue, endLineValue);

      const codeRef = yield* Effect.scoped(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;
          const codeRef = yield* entityService.createCodeRef({
            title,
            content: "",
            repoPath: workspace.config.repoPath ?? workspace.rootPath,
            filePath: file,
            startLine: startLineValue,
            endLine: endLineValue,
            commitHash: commitHashValue,
            symbol: symbolValue,
          });

          if (tagValue) {
            const tagService = yield* TagServiceTag;
            for (const tagPath of splitTags(tagValue)) {
              const tag = yield* tagService.ensureHierarchy(tagPath);
              yield* tagService.applyToEntity(tag.id, codeRef.id);
            }
          }

          return codeRef;
        }).pipe(Effect.provide(ServiceLayers))
      );

      yield* Console.log("");
      yield* Console.log("Code ref created successfully!");
      yield* Console.log("");
      yield* Console.log(`ID:      ${codeRef.id}`);
      yield* Console.log(`Title:   ${codeRef.title}`);
      yield* Console.log(`File:    ${codeRef.filePath}`);
      yield* Console.log(`Lines:   ${lineRange(codeRef)}`);
      if (codeRef.symbol) yield* Console.log(`Symbol:  ${codeRef.symbol}`);
      yield* Console.log(`Version: ${codeRef.version}`);
      yield* Console.log("");
    }).pipe(
      Effect.catchAll((error) =>
        Console.error(`Error: ${formatCodeRefError(error)}`).pipe(
          Effect.zipRight(Effect.fail(error))
        )
      )
    )
);

const codeRefShowCommand = Command.make(
  "show",
  {
    id: Args.text({ name: "id" }),
  },
  ({ id }) =>
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Detail views load tags and both link directions for a complete implementation anchor.
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag;
      const workspace = yield* configService.load();
      const ServiceLayers = CliCoreLive(workspace.dbPath);

      const { codeRef, tags, links, linkedEntities } = yield* Effect.scoped(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;
          const graphService = yield* GraphServiceTag;
          const tagService = yield* TagServiceTag;
          const withLinks = yield* graphService.getEntityWithLinks(id);
          const entity = withLinks.entity;

          if (entity._tag !== EntityTypeEnum.CodeRef) {
            return yield* Effect.fail(new NotACodeRefError({ id }));
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

          return { codeRef: entity, tags, links, linkedEntities };
        }).pipe(Effect.provide(ServiceLayers))
      );

      yield* Console.log("");
      yield* Console.log(`# ${codeRef.title}`);
      yield* Console.log("");
      yield* Console.log(`ID:      ${codeRef.id}`);
      yield* Console.log(`File:    ${codeRef.filePath}`);
      yield* Console.log(`Lines:   ${lineRange(codeRef)}`);
      if (codeRef.symbol) yield* Console.log(`Symbol:  ${codeRef.symbol}`);
      yield* Console.log(`Repo:    ${codeRef.repoPath}`);
      if (codeRef.commitHash) yield* Console.log(`Commit:  ${codeRef.commitHash}`);
      yield* Console.log(`Version: ${codeRef.version}`);
      yield* Console.log(`Created: ${codeRef.createdAt.toISOString()}`);
      yield* Console.log(`Updated: ${codeRef.updatedAt.toISOString()}`);

      if (tags.length > 0) {
        yield* Console.log(`Tags:    ${tags.map((tag) => `#${tag.id}`).join(", ")}`);
      }

      if (links.length > 0) {
        yield* Console.log("");
        yield* Console.log("Links");
        yield* Console.log("-".repeat(40));

        for (const link of links) {
          const isOutgoing = link.sourceId === codeRef.id;
          const otherId = isOutgoing ? link.targetId : link.sourceId;
          const direction = isOutgoing ? `--${link.type}-->` : `<--${link.type}--`;
          const summary = linkedEntities.get(otherId) ?? otherId;
          yield* Console.log(`  ${direction} ${otherId}  ${summary}`);
        }
      }

      yield* Console.log("");
    }).pipe(
      Effect.catchAll((error) =>
        Console.error(`Error: ${formatCodeRefError(error)}`).pipe(
          Effect.zipRight(Effect.fail(error))
        )
      )
    )
);

const codeRefListCommand = Command.make(
  "list",
  {
    file: Options.text("file").pipe(
      Options.withDescription("Filter by file path"),
      Options.optional
    ),
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
  ({ file, tag, search }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag;
      const workspace = yield* configService.load();
      const ServiceLayers = CliCoreLive(workspace.dbPath);

      const codeRefs = yield* Effect.scoped(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;
          const fileValue = Option.getOrUndefined(file);
          const tagValue = Option.getOrUndefined(tag);
          const searchValue = Option.getOrUndefined(search);
          const results = searchValue
            ? yield* entityService.search(searchValue)
            : tagValue
              ? yield* entityService.getByTag(tagValue)
              : yield* entityService.getAll(EntityTypeEnum.CodeRef);

          return results.filter(
            (entity): entity is CodeRef =>
              entity._tag === EntityTypeEnum.CodeRef &&
              (fileValue === undefined || entity.filePath === fileValue)
          );
        }).pipe(Effect.provide(ServiceLayers))
      );

      yield* Console.log("");
      yield* Console.log(`Code refs (${codeRefs.length})`);
      yield* Console.log("=".repeat(40));
      yield* Console.log("");

      if (codeRefs.length === 0) {
        yield* Console.log("No code refs found.");
        yield* Console.log("");
        yield* Console.log(
          'Create one with: kioku code-ref add --title "Auth middleware" --file src/middleware/auth.ts'
        );
      } else {
        for (const codeRef of codeRefs) {
          const symbol = codeRef.symbol ? ` [${codeRef.symbol}]` : "";
          yield* Console.log(
            `${codeRef.id.slice(0, 8)}  ${codeRef.filePath}:${lineRange(codeRef)}${symbol}  ${codeRef.title}`
          );
          yield* Console.log("");
        }
      }
    }).pipe(
      Effect.catchAll((error) =>
        Console.error(`Error: ${formatCodeRefError(error)}`).pipe(
          Effect.zipRight(Effect.fail(error))
        )
      )
    )
);

const codeRefDeleteCommand = Command.make(
  "delete",
  {
    id: Args.text({ name: "id" }),
    force: Options.boolean("force").pipe(Options.withAlias("f"), Options.withDefault(false)),
  },
  ({ id, force }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag;
      const workspace = yield* configService.load();
      const ServiceLayers = CliCoreLive(workspace.dbPath);

      yield* Effect.scoped(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;
          const existing = yield* entityService.getById(
            id as Parameters<typeof entityService.getById>[0]
          );

          if (existing._tag !== EntityTypeEnum.CodeRef) {
            return yield* Effect.fail(new NotACodeRefError({ id }));
          }

          if (!force) {
            yield* Console.log(`Deleting code ref: ${existing.title}`);
            yield* Console.log("(Use --force to skip this confirmation in scripts)");
          }

          yield* entityService.delete(id as Parameters<typeof entityService.getById>[0]);
        }).pipe(Effect.provide(ServiceLayers))
      );

      yield* Console.log("");
      yield* Console.log(`Code ref ${id} deleted.`);
      yield* Console.log("");
    }).pipe(
      Effect.catchAll((error) =>
        Console.error(`Error: ${formatCodeRefError(error)}`).pipe(
          Effect.zipRight(Effect.fail(error))
        )
      )
    )
);

export const codeRefCommand = Command.make("code-ref").pipe(
  Command.withDescription("Manage code reference entities"),
  Command.withSubcommands([
    codeRefAddCommand,
    codeRefShowCommand,
    codeRefListCommand,
    codeRefDeleteCommand,
  ])
);
