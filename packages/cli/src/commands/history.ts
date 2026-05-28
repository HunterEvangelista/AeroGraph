import { Args, Command } from "@effect/cli";
import { type Entity, VersionRepositoryTag } from "@kioku/core";
import { Console, Data, Effect } from "effect";
import { formatEntityIdMatches, resolveEntityId } from "../entity-id.js";
import { withCliServices } from "./workspace.js";

const entitySummary = (entity: Entity): string => `[${entity._tag}] ${entity.title}`;

const preview = (content: string): string => {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= 90) return normalized;
  return `${normalized.slice(0, 90)}...`;
};

const formatChangedFields = (fields: ReadonlyArray<string> | undefined): string =>
  fields && fields.length > 0 ? fields.join(", ") : "snapshot";

class InvalidHistoryArgsError extends Data.TaggedError("InvalidHistoryArgsError")<{
  readonly message: string;
}> {}

const parseHistoryArgs = (args: ReadonlyArray<string>) =>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keeps option-after-id parsing localized for `history <id> --version 1`.
  Effect.gen(function* () {
    let entityId: string | undefined;
    let version: number | undefined;

    for (let index = 0; index < args.length; index++) {
      const arg = args[index];
      if (!arg) continue;

      if (arg === "--version") {
        const value = args[index + 1];
        if (!value || value.startsWith("-")) {
          return yield* Effect.fail(
            new InvalidHistoryArgsError({ message: "--version requires a value." })
          );
        }
        if (!/^\d+$/.test(value)) {
          return yield* Effect.fail(
            new InvalidHistoryArgsError({ message: "--version must be a positive integer." })
          );
        }

        version = Number.parseInt(value, 10);
        if (version < 1) {
          return yield* Effect.fail(
            new InvalidHistoryArgsError({ message: "--version must be a positive integer." })
          );
        }
        index++;
      } else if (arg.startsWith("-")) {
        return yield* Effect.fail(
          new InvalidHistoryArgsError({ message: `Unknown option: ${arg}` })
        );
      } else if (!entityId) {
        entityId = arg;
      } else {
        return yield* Effect.fail(
          new InvalidHistoryArgsError({ message: `Unexpected argument: ${arg}` })
        );
      }
    }

    if (!entityId) {
      return yield* Effect.fail(
        new InvalidHistoryArgsError({ message: "history requires <entityId>." })
      );
    }

    return { entityId, version };
  });

export const historyCommand = Command.make(
  "history",
  {
    args: Args.text({ name: "args" }).pipe(Args.repeated),
  },
  ({ args }) =>
    withCliServices(
      Effect.gen(function* () {
        const versionRepository = yield* VersionRepositoryTag;
        const parsed = yield* parseHistoryArgs(args);
        const resolvedId = yield* resolveEntityId(parsed.entityId);
        const versionValue = parsed.version;

        if (versionValue !== undefined) {
          const record = yield* versionRepository.getEntityAtVersion<Entity>(
            resolvedId,
            versionValue
          );
          const entity = record.data;

          yield* Console.log("");
          yield* Console.log(`Version ${record.version}: ${entitySummary(entity)}`);
          yield* Console.log("=".repeat(40));
          yield* Console.log("");
          yield* Console.log(`ID:      ${record.entityId}`);
          yield* Console.log(`Changed: ${record.changeType}`);
          yield* Console.log(`Fields:  ${formatChangedFields(record.changedFields)}`);
          yield* Console.log(`Date:    ${record.createdAt.toLocaleString()}`);
          yield* Console.log("");
          yield* Console.log(entity.content || "(No content)");
          yield* Console.log("");
          return;
        }

        const versions = yield* versionRepository.getAllForEntity(resolvedId);

        yield* Console.log("");
        yield* Console.log(`History for ${resolvedId} (${versions.length})`);
        yield* Console.log("=".repeat(40));
        yield* Console.log("");

        if (versions.length === 0) {
          yield* Console.log("No versions found.");
          yield* Console.log("");
          return;
        }

        for (const record of [...versions].sort((a, b) => a.version - b.version)) {
          const entity = record.data as Entity;
          yield* Console.log(
            `v${record.version}  ${record.changeType}  ${record.createdAt.toLocaleString()}  ${formatChangedFields(record.changedFields)}`
          );
          yield* Console.log(`     ${entitySummary(entity)}`);
          const text = preview(entity.content);
          if (text) yield* Console.log(`     ${text}`);
          yield* Console.log(`     next: kioku history ${resolvedId} --version ${record.version}`);
          yield* Console.log("");
        }
      })
    ).pipe(
      Effect.catchTags({
        AmbiguousEntityIdError: (e) =>
          Console.error(
            `Error: Entity id "${e.value}" is ambiguous: ${formatEntityIdMatches(e.matches)}`
          ).pipe(Effect.zipRight(Effect.fail(e))),
        EntityNotFoundError: (e) =>
          Console.error(`Error: Entity not found: ${e.entityId}`).pipe(
            Effect.zipRight(Effect.fail(e))
          ),
        VersionNotFoundError: (e) =>
          Console.error(`Error: Version not found: ${e.entityId} v${e.version}`).pipe(
            Effect.zipRight(Effect.fail(e))
          ),
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        InvalidHistoryArgsError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
      })
    )
).pipe(Command.withDescription("Show entity version history"));
