import {
  type CodeRef,
  EntityServiceTag,
  EntityType,
  GraphServiceTag,
  TagServiceTag,
} from "@kioku/core";
import { Console, Data, Effect, Option } from "effect";
/**
 * Code Ref Commands
 * CRUD operations for implementation anchors.
 */
import { Argument, Command, Flag } from "effect/unstable/cli";
import { ConfigServiceTag } from "../config";
import { CliServicesLive } from "../db/index";
import { formattedEntityId, loadFormattedEntityIds } from "../entity-display";
import { resolveEntityId } from "../entity-id";
import { isPositiveInteger } from "./validation";

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
    if (startLine !== undefined && !isPositiveInteger(startLine)) {
      return yield* new InvalidCodeRefInputError({
        message: "--start-line must be a positive integer",
      });
    }

    if (endLine !== undefined && !isPositiveInteger(endLine)) {
      return yield* new InvalidCodeRefInputError({
        message: "--end-line must be a positive integer",
      });
    }

    if (endLine !== undefined && startLine === undefined) {
      return yield* new InvalidCodeRefInputError({ message: "--end-line requires --start-line" });
    }

    if (startLine !== undefined && endLine !== undefined && endLine < startLine) {
      return yield* new InvalidCodeRefInputError({
        message: "--end-line must be greater than or equal to --start-line",
      });
    }
  });

const codeRefAddCommand = Command.make(
  "add",
  {
    title: Flag.string("title").pipe(Flag.withDescription("Code ref title")),
    file: Flag.string("file").pipe(Flag.withDescription("Workspace-relative file path")),
    startLine: Flag.integer("start-line").pipe(
      Flag.withDescription("Starting line number"),
      Flag.optional
    ),
    endLine: Flag.integer("end-line").pipe(
      Flag.withDescription("Ending line number"),
      Flag.optional
    ),
    symbol: Flag.string("symbol").pipe(Flag.withDescription("Symbol name"), Flag.optional),
    commitHash: Flag.string("commit-hash").pipe(
      Flag.withDescription("Commit hash for this anchor"),
      Flag.optional
    ),
    tag: Flag.string("tag").pipe(
      Flag.withAlias("t"),
      Flag.withDescription("Comma-separated tags to apply"),
      Flag.optional
    ),
  },
  ({ title, file, startLine, endLine, symbol, commitHash, tag }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag;
      const workspace = yield* configService.load();
      const ServiceLayers = CliServicesLive(workspace.dbPath);
      const startLineValue = Option.getOrUndefined(startLine);
      const endLineValue = Option.getOrUndefined(endLine);
      const symbolValue = Option.getOrUndefined(symbol);
      const commitHashValue = Option.getOrUndefined(commitHash);
      const tagValue = Option.getOrUndefined(tag);

      yield* validateLineRange(startLineValue, endLineValue);

      const { codeRef, displayIds } = yield* Effect.scoped(
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

          const displayIds = yield* loadFormattedEntityIds([codeRef.id]);
          return { codeRef, displayIds };
        }).pipe(Effect.provide(ServiceLayers))
      );

      yield* Console.log("");
      yield* Console.log("Code ref created successfully!");
      yield* Console.log("");
      yield* Console.log(`ID:      ${formattedEntityId(displayIds, codeRef.id)}`);
      yield* Console.log(`Title:   ${codeRef.title}`);
      yield* Console.log(`File:    ${codeRef.filePath}`);
      yield* Console.log(`Lines:   ${lineRange(codeRef)}`);
      if (codeRef.symbol) yield* Console.log(`Symbol:  ${codeRef.symbol}`);
      yield* Console.log(`Version: ${codeRef.version}`);
      yield* Console.log("");
    }).pipe(
      Effect.catch((error) =>
        Console.error(`Error: ${formatCodeRefError(error)}`).pipe(
          Effect.andThen(Effect.fail(error))
        )
      )
    )
);

const codeRefShowCommand = Command.make(
  "show",
  {
    id: Argument.string("id"),
  },
  ({ id }) =>
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Detail views load tags and both link directions for a complete implementation anchor.
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag;
      const workspace = yield* configService.load();
      const ServiceLayers = CliServicesLive(workspace.dbPath);

      const { codeRef, tags, links, linkedEntities, displayIds } = yield* Effect.scoped(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;
          const graphService = yield* GraphServiceTag;
          const tagService = yield* TagServiceTag;
          const resolvedId = yield* resolveEntityId(id);
          const withLinks = yield* graphService.getEntityWithLinks(resolvedId);
          const entity = withLinks.entity;

          if (entity._tag !== EntityType.CodeRef) {
            return yield* new NotACodeRefError({ id: resolvedId });
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

          const displayIds = yield* loadFormattedEntityIds([entity.id, ...linkedEntities.keys()]);
          return { codeRef: entity, tags, links, linkedEntities, displayIds };
        }).pipe(Effect.provide(ServiceLayers))
      );

      yield* Console.log("");
      yield* Console.log(`# ${codeRef.title}`);
      yield* Console.log("");
      yield* Console.log(`ID:      ${formattedEntityId(displayIds, codeRef.id)}`);
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
          yield* Console.log(
            `  ${direction} ${formattedEntityId(displayIds, otherId)}  ${summary}`
          );
        }
      }

      yield* Console.log("");
    }).pipe(
      Effect.catch((error) =>
        Console.error(`Error: ${formatCodeRefError(error)}`).pipe(
          Effect.andThen(Effect.fail(error))
        )
      )
    )
);

const codeRefListCommand = Command.make(
  "list",
  {
    file: Flag.string("file").pipe(Flag.withDescription("Filter by file path"), Flag.optional),
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
  ({ file, tag, search }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag;
      const workspace = yield* configService.load();
      const ServiceLayers = CliServicesLive(workspace.dbPath);

      const { codeRefs, displayIds } = yield* Effect.scoped(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;
          const fileValue = Option.getOrUndefined(file);
          const tagValue = Option.getOrUndefined(tag);
          const searchValue = Option.getOrUndefined(search);
          const results = searchValue
            ? yield* entityService.search(searchValue)
            : tagValue
              ? yield* entityService.getByTag(tagValue)
              : yield* entityService.getAll(EntityType.CodeRef);

          const codeRefs = results.filter(
            (entity): entity is CodeRef =>
              entity._tag === EntityType.CodeRef &&
              (fileValue === undefined || entity.filePath === fileValue)
          );
          const displayIds = yield* loadFormattedEntityIds(codeRefs.map((codeRef) => codeRef.id));
          return { codeRefs, displayIds };
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
            `${formattedEntityId(displayIds, codeRef.id)}  ${codeRef.filePath}:${lineRange(codeRef)}${symbol}  ${codeRef.title}`
          );
          yield* Console.log("");
        }
      }
    }).pipe(
      Effect.catch((error) =>
        Console.error(`Error: ${formatCodeRefError(error)}`).pipe(
          Effect.andThen(Effect.fail(error))
        )
      )
    )
);

const codeRefDeleteCommand = Command.make(
  "delete",
  {
    id: Argument.string("id"),
    force: Flag.boolean("force").pipe(Flag.withAlias("f"), Flag.withDefault(false)),
  },
  ({ id, force }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag;
      const workspace = yield* configService.load();
      const ServiceLayers = CliServicesLive(workspace.dbPath);

      yield* Effect.scoped(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;
          const resolvedId = yield* resolveEntityId(id);
          const existing = yield* entityService.getById(
            resolvedId as Parameters<typeof entityService.getById>[0]
          );

          if (existing._tag !== EntityType.CodeRef) {
            return yield* new NotACodeRefError({ id: resolvedId });
          }

          if (!force) {
            yield* Console.log(`Deleting code ref: ${existing.title}`);
            yield* Console.log("(Use --force to skip this confirmation in scripts)");
          }

          yield* entityService.delete(resolvedId as Parameters<typeof entityService.getById>[0]);
        }).pipe(Effect.provide(ServiceLayers))
      );

      yield* Console.log("");
      yield* Console.log(`Code ref ${id} deleted.`);
      yield* Console.log("");
    }).pipe(
      Effect.catch((error) =>
        Console.error(`Error: ${formatCodeRefError(error)}`).pipe(
          Effect.andThen(Effect.fail(error))
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
