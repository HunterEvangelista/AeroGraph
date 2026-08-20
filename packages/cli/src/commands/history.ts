import { type Entity, VersionRepositoryTag } from "@aerograph/core";
import { Console, Data, Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { formatEntityIdMatches, resolveEntityId } from "../entity-id";
import { parsePositiveInteger } from "./validation";
import { withCliServices } from "./workspace";

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

const parseVersionFlag = (value: string) =>
  Effect.try({
    try: () => parsePositiveInteger(value),
    catch: () => new InvalidHistoryArgsError({ message: "--version must be a positive integer." }),
  });

export const historyCommand = Command.make(
  "history",
  {
    entityId: Argument.string("entityId"),
    version: Flag.string("version").pipe(Flag.optional),
  },
  ({ entityId, version }) =>
    withCliServices(
      Effect.gen(function* () {
        const versionRepository = yield* VersionRepositoryTag;
        const versionText = Option.getOrUndefined(version);
        const versionValue =
          versionText === undefined ? undefined : yield* parseVersionFlag(versionText);
        const resolvedId = yield* resolveEntityId(entityId);

        if (versionValue !== undefined) {
          const record = yield* versionRepository.getEntityAtVersion(resolvedId, versionValue);
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
          const entity = (yield* versionRepository.getEntityAtVersion(resolvedId, record.version))
            .data;
          yield* Console.log(
            `v${record.version}  ${record.changeType}  ${record.createdAt.toLocaleString()}  ${formatChangedFields(record.changedFields)}`
          );
          yield* Console.log(`     ${entitySummary(entity)}`);
          const text = preview(entity.content);
          if (text) yield* Console.log(`     ${text}`);
          yield* Console.log(
            `     next: aerograph history ${resolvedId} --version ${record.version}`
          );
          yield* Console.log("");
        }
      })
    ).pipe(
      Effect.catchTags({
        AmbiguousEntityIdError: (e) =>
          Console.error(
            `Error: Entity id "${e.value}" is ambiguous: ${formatEntityIdMatches(e.matches)}`
          ).pipe(Effect.andThen(Effect.fail(e))),
        EntityNotFoundError: (e) =>
          Console.error(`Error: Entity not found: ${e.entityId}`).pipe(
            Effect.andThen(Effect.fail(e))
          ),
        VersionNotFoundError: (e) =>
          Console.error(`Error: Version not found: ${e.entityId} v${e.version}`).pipe(
            Effect.andThen(Effect.fail(e))
          ),
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        InvalidHistoryArgsError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
      })
    )
).pipe(Command.withDescription("Show entity version history"));
