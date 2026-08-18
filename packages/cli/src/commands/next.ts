import { type NextCommandType, NextServiceTag } from "@kioku/core";
import { Console, Data, Effect } from "effect";
/**
 * Next Command
 * Runnable follow-up suggestions emitted by prior commands.
 */
import { Argument, Command, Flag } from "effect/unstable/cli";
import { EntityPrefixIndexTag, formatEntityIdWithBoldPrefix } from "../db/entity-prefix-index";
import { formatEntityIdMatches, resolveEntityId } from "../entity-id";
import { runRelatedQuery, runTraverseQuery } from "./query-runners";
import { withCliServices } from "./workspace";

// ============================================================================
// Custom Error Types
// ============================================================================

class InvalidNextArgsError extends Data.TaggedError("InvalidNextArgsError")<{
  readonly message: string;
}> {}

class NoNextSuggestionError extends Data.TaggedError("NoNextSuggestionError")<{
  readonly entityId: string;
  readonly commandType?: string;
}> {}

const formatNextLabel = (
  entityId: string,
  prefix: string,
  commandType: NextCommandType
): string => {
  const displayId = formatEntityIdWithBoldPrefix(entityId, prefix);
  return `next ${displayId} --${commandType === "related_to" ? "related" : "traverse"}`;
};

const recordDisplayedEntities = (entityIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const nextService = yield* NextServiceTag;
    const prefixIndex = yield* EntityPrefixIndexTag;
    const prefixes = yield* prefixIndex.getDisplayPrefixes(entityIds);

    return yield* nextService.recordDisplayedEntities(
      entityIds.map((entityId) => ({
        entityId,
        prefix: prefixes.get(entityId) ?? entityId,
      }))
    );
  });

// ============================================================================
// Next Run (default handler)
// ============================================================================

const nextRunCommand = Command.make(
  "next",
  {
    entityId: Argument.string("entityId"),
    related: Flag.boolean("related").pipe(
      Flag.withDescription("Run the related-to follow-up (default)"),
      Flag.withDefault(false)
    ),
    traverse: Flag.boolean("traverse").pipe(
      Flag.withDescription("Run the traverse follow-up"),
      Flag.withDefault(false)
    ),
  },
  ({ entityId, related, traverse }) =>
    withCliServices(
      Effect.gen(function* () {
        if (related && traverse) {
          return yield* new InvalidNextArgsError({
            message: "Cannot use --related and --traverse together.",
          });
        }

        const commandType = (traverse ? "traverse" : "related_to") satisfies NextCommandType;
        const isDefault = !related && !traverse;

        const resolvedId = yield* resolveEntityId(entityId);

        const nextService = yield* NextServiceTag;
        const suggestion = yield* nextService.find(resolvedId, commandType);
        if (!suggestion) {
          return yield* new NoNextSuggestionError({ entityId, commandType });
        }

        if (isDefault) {
          yield* Console.log(`(Defaulting to --related for ${entityId})`);
          yield* Console.log("");
        }

        if (commandType === "traverse") {
          const result = yield* runTraverseQuery(resolvedId, 2);
          yield* recordDisplayedEntities(result.displayedEntityIds);
        } else {
          const result = yield* runRelatedQuery(resolvedId);
          yield* recordDisplayedEntities(result.displayedEntityIds);
        }
      })
    ).pipe(
      Effect.catchTags({
        InvalidNextArgsError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        NoNextSuggestionError: (e) => {
          const detail = e.commandType
            ? ` No saved --${e.commandType === "related_to" ? "related" : "traverse"} command`
            : " No saved next commands";
          return Console.error(
            `Error: Entity "${e.entityId}" has no saved next command.${detail}`
          ).pipe(Effect.andThen(Effect.fail(e)));
        },
        AmbiguousEntityIdError: (e) =>
          Console.error(
            `Error: Entity id "${e.value}" is ambiguous: ${formatEntityIdMatches(e.matches)}`
          ).pipe(Effect.andThen(Effect.fail(e))),
        EntityNotFoundError: (e) =>
          Console.error(`Error: Entity not found: ${e.entityId}`).pipe(
            Effect.andThen(Effect.fail(e))
          ),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
      })
    )
);

// ============================================================================
// Next List
// ============================================================================

const nextListCommand = Command.make("list", {}, () =>
  withCliServices(
    Effect.gen(function* () {
      const nextService = yield* NextServiceTag;
      const suggestions = yield* nextService.list();

      if (suggestions.length === 0) {
        yield* Console.log("No saved next commands.");
        yield* Console.log("Run a query to generate follow-up suggestions.");
        yield* Console.log("");
        return;
      }

      yield* Console.log("Saved next commands:");
      yield* Console.log("");
      for (const s of suggestions) {
        yield* Console.log(`  ${formatNextLabel(s.entityId, s.prefix, s.commandType)}`);
      }
      yield* Console.log("");
    })
  ).pipe(
    Effect.catchTags({
      RepositoryError: (e) =>
        Console.error(`Database error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
      WorkspaceNotFoundError: (e) =>
        Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
      ConfigError: (e) => Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
    })
  )
);

// ============================================================================
// Next Clear
// ============================================================================

const nextClearCommand = Command.make("clear", {}, () =>
  withCliServices(
    Effect.gen(function* () {
      const nextService = yield* NextServiceTag;
      const count = yield* nextService.clear();

      if (count > 0) {
        yield* Console.log(`Cleared ${count} next command${count === 1 ? "" : "s"}.`);
      } else {
        yield* Console.log("No next commands to clear.");
      }
    })
  ).pipe(
    Effect.catchTags({
      RepositoryError: (e) =>
        Console.error(`Database error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
      WorkspaceNotFoundError: (e) =>
        Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
      ConfigError: (e) => Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
    })
  )
);

// ============================================================================
// Next Parent Command
// ============================================================================

export const nextCommand = nextRunCommand.pipe(
  Command.withDescription("Run or manage saved follow-up suggestions"),
  Command.withSubcommands([nextListCommand, nextClearCommand])
);
