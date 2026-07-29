import { NextServiceTag } from "@kioku/core";
import { Console, Data, Effect, Option } from "effect";
/**
 * Query Command
 * Retrieval operations for project memory graph context.
 */
import { Argument, Command, Flag } from "effect/unstable/cli";
import { ConfigServiceTag } from "../config.js";
import { EntityPrefixIndexTag } from "../db/entity-prefix-index.js";
import { CliServicesLive } from "../db/index.js";
import { formatEntityIdMatches, resolveEntityId } from "../entity-id.js";
import { runPathQuery, runRelatedQuery, runTagsQuery, runTraverseQuery } from "./query-runners.js";
import { isPositiveInteger } from "./validation.js";

// ============================================================================
// Custom Error Types
// ============================================================================

class InvalidQueryError extends Data.TaggedError("InvalidQueryError")<{
  readonly message: string;
}> {}

interface QuerySelection {
  readonly tagValue: string | undefined;
  readonly relatedToValue: string | undefined;
  readonly traverseValue: string | undefined;
  readonly depthValue: number | undefined;
  readonly pathValue: ReadonlyArray<string> | undefined;
  readonly promptValue: string | undefined;
}

// ============================================================================
// Input Validation
// ============================================================================

const splitTags = (value: string): ReadonlyArray<string> =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

const validateDepth = (depth: number | undefined) => {
  if (depth === undefined || isPositiveInteger(depth)) return Effect.void;

  return Effect.fail(new InvalidQueryError({ message: "--depth must be greater than 0." }));
};

const printNaturalLanguageStub = () =>
  Effect.gen(function* () {
    yield* Console.log("");
    yield* Console.log("Natural-language query is not available in this edition yet.");
    yield* Console.log("");
    yield* Console.log("This will be implemented later as an LLM-backed retrieval feature.");
    yield* Console.log("Use structured query modes for now:");
    yield* Console.log("  kioku query --tags auth,middleware");
    yield* Console.log("  kioku query --related-to <entityId>");
    yield* Console.log("  kioku query --traverse <entityId> --depth 2");
    yield* Console.log("  kioku query --path <fromId> <toId>");
    yield* Console.log("");
  });

const validateQuerySelection = (selection: QuerySelection) =>
  Effect.gen(function* () {
    const selectedModes = [
      selection.tagValue,
      selection.relatedToValue,
      selection.traverseValue,
      selection.pathValue,
      selection.promptValue,
    ].filter((value) => value !== undefined).length;

    if (selectedModes !== 1) {
      return yield* new InvalidQueryError({
        message:
          "Choose exactly one query mode: --tags, --related-to, --traverse, --path, or a quoted natural-language prompt.",
      });
    }

    if (selection.depthValue !== undefined && !selection.traverseValue) {
      return yield* new InvalidQueryError({ message: "--depth is only valid with --traverse." });
    }

    if (selection.traverseValue && selection.depthValue === undefined) {
      return yield* new InvalidQueryError({
        message: "--traverse requires an explicit --depth value.",
      });
    }

    yield* validateDepth(selection.depthValue);
  });

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

const runStructuredQuery = (selection: QuerySelection) =>
  Effect.gen(function* () {
    if (selection.tagValue) {
      const tagIds = splitTags(selection.tagValue);
      if (tagIds.length === 0) {
        return yield* new InvalidQueryError({ message: "--tags must include at least one tag." });
      }
      const result = yield* runTagsQuery(tagIds);
      yield* recordDisplayedEntities(result.displayedEntityIds);
      return;
    }

    if (selection.relatedToValue) {
      const entityId = yield* resolveEntityId(selection.relatedToValue);
      const result = yield* runRelatedQuery(entityId);
      yield* recordDisplayedEntities(result.displayedEntityIds);
      return;
    }

    if (selection.traverseValue && selection.depthValue !== undefined) {
      const entityId = yield* resolveEntityId(selection.traverseValue);
      const result = yield* runTraverseQuery(entityId, selection.depthValue);
      yield* recordDisplayedEntities(result.displayedEntityIds);
      return;
    }

    if (selection.pathValue) {
      if (selection.pathValue.length !== 2) {
        return yield* new InvalidQueryError({ message: "--path requires <fromId> and <toId>." });
      }
      const [fromId, toId] = selection.pathValue as readonly [string, string];
      const resolvedFromId = yield* resolveEntityId(fromId);
      const resolvedToId = yield* resolveEntityId(toId);
      const result = yield* runPathQuery(resolvedFromId, resolvedToId);
      yield* recordDisplayedEntities(result.displayedEntityIds);
    }
  });

// ============================================================================
// Query Command
// ============================================================================

export const queryCommand = Command.make(
  "query",
  {
    tags: Flag.string("tags").pipe(
      Flag.withDescription("Comma-separated governed terms or literal tag IDs to intersect"),
      Flag.optional
    ),
    relatedTo: Flag.string("related-to").pipe(
      Flag.withDescription("Entity ID to retrieve 1-hop neighbors for"),
      Flag.optional
    ),
    traverse: Flag.string("traverse").pipe(
      Flag.withDescription("Entity ID to retrieve a bounded graph neighborhood for"),
      Flag.optional
    ),
    depth: Flag.integer("depth").pipe(
      Flag.withDescription("Required traversal depth for --traverse"),
      Flag.optional
    ),
    path: Flag.boolean("path").pipe(
      Flag.withDescription("Interpret positional values as shortest path endpoints"),
      Flag.withDefault(false)
    ),
    query: Argument.string("query").pipe(Argument.variadic()),
  },
  ({ tags, relatedTo, traverse, depth, path, query }) =>
    Effect.gen(function* () {
      const tagValue = Option.getOrUndefined(tags);
      const relatedToValue = Option.getOrUndefined(relatedTo);
      const traverseValue = Option.getOrUndefined(traverse);
      const depthValue = Option.getOrUndefined(depth);
      const pathValue = path ? query : undefined;
      const promptValue = !path && query.length > 0 ? query.join(" ") : undefined;
      const selection = {
        tagValue,
        relatedToValue,
        traverseValue,
        depthValue,
        pathValue,
        promptValue,
      } satisfies QuerySelection;

      yield* validateQuerySelection(selection);

      if (promptValue) {
        yield* printNaturalLanguageStub();
        return;
      }

      const configService = yield* ConfigServiceTag;
      const workspace = yield* configService.load();
      const ServiceLayers = CliServicesLive(workspace.dbPath);

      yield* Effect.scoped(runStructuredQuery(selection).pipe(Effect.provide(ServiceLayers)));
    }).pipe(
      Effect.catchTags({
        InvalidQueryError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        AmbiguousTermNameError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        EntityNotFoundError: (e) =>
          Console.error(`Error: Entity not found: ${e.entityId}`).pipe(
            Effect.andThen(Effect.fail(e))
          ),
        AmbiguousEntityIdError: (e) =>
          Console.error(
            `Error: Entity id "${e.value}" is ambiguous: ${formatEntityIdMatches(e.matches)}`
          ).pipe(Effect.andThen(Effect.fail(e))),
      })
    )
).pipe(Command.withDescription("Query project memory by tags, links, traversal, or paths"));
