/**
 * Query Command
 * Retrieval operations for project memory graph context.
 */
import { Args, Command, Options } from "@effect/cli";
import {
  type Entity,
  EntityTypeEnum,
  type GraphService,
  GraphServiceTag,
  type Link,
} from "@kioku/core";
import { Console, Data, Effect, Option } from "effect";
import { ConfigServiceTag } from "../config.js";
import { CliCoreLive } from "../db/index.js";

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
// Formatting Helpers
// ============================================================================

const roleOrder = [
  EntityTypeEnum.Doc,
  EntityTypeEnum.CodeRef,
  EntityTypeEnum.Story,
  EntityTypeEnum.Diagram,
] as const;

const roleLabel = (type: Entity["_tag"]): string => {
  switch (type) {
    case EntityTypeEnum.Doc:
      return "Docs";
    case EntityTypeEnum.CodeRef:
      return "Code refs";
    case EntityTypeEnum.Story:
      return "Stories";
    case EntityTypeEnum.Diagram:
      return "Diagrams";
  }
};

const preview = (content: string): string => {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= 100) return normalized;
  return `${normalized.slice(0, 100)}...`;
};

const codeLocation = (entity: Entity): string | undefined => {
  if (entity._tag !== EntityTypeEnum.CodeRef) return undefined;

  const start = entity.startLine ? `:${entity.startLine}` : "";
  const end = entity.endLine ? `-${entity.endLine}` : "";
  return `${entity.filePath}${start}${end}`;
};

const entitySummary = (entity: Entity): string => {
  const location = codeLocation(entity);
  const suffix = location ? ` (${location})` : "";
  return `${entity.id}  [${entity._tag}] ${entity.title}${suffix}`;
};

const printEntityDetails = (entity: Entity) =>
  Effect.gen(function* () {
    yield* Console.log(`  ${entitySummary(entity)}`);

    if (entity._tag === EntityTypeEnum.Story) {
      const priority = entity.priority ? `, priority: ${entity.priority}` : "";
      yield* Console.log(`    status: ${entity.status}${priority}`);
    }

    const text = preview(entity.content);
    if (text) {
      yield* Console.log(`    ${text}`);
    }

    yield* Console.log(`    next: kioku query --related-to ${entity.id}`);
    yield* Console.log(`    next: kioku query --traverse ${entity.id} --depth 2`);
  });

const printGroupedEntities = (title: string, entities: ReadonlyArray<Entity>) =>
  Effect.gen(function* () {
    yield* Console.log("");
    yield* Console.log(`${title} (${entities.length})`);
    yield* Console.log("=".repeat(40));

    if (entities.length === 0) {
      yield* Console.log("");
      yield* Console.log("No matching entities found.");
      yield* Console.log("");
      return;
    }

    // Follow-up story needed: the product asks for role groupings such as decisions,
    // constraints, risks, canonical docs, and open questions, but the current domain
    // model has no authoritative role field. Entity type is stable and explicit, so
    // we use it here instead of inferring roles from titles/content or baking in tag
    // naming conventions that could become hard to unwind later.
    for (const role of roleOrder) {
      const roleEntities = entities.filter((entity) => entity._tag === role);
      if (roleEntities.length === 0) continue;

      yield* Console.log("");
      yield* Console.log(roleLabel(role));
      yield* Console.log("-".repeat(roleLabel(role).length));

      for (const entity of roleEntities) {
        yield* printEntityDetails(entity);
        yield* Console.log("");
      }
    }
  });

const linkDirectionLabel = (link: Link, entityId: string): string => {
  if (link.sourceId === entityId) return `--${link.type}-->`;
  return `<--${link.type}--`;
};

const otherEntityId = (link: Link, entityId: string): string =>
  link.sourceId === entityId ? link.targetId : link.sourceId;

const findLinkBetween = (
  links: ReadonlyArray<Link>,
  fromId: string,
  toId: string
): Link | undefined =>
  links.find(
    (link) =>
      (link.sourceId === fromId && link.targetId === toId) ||
      (link.sourceId === toId && link.targetId === fromId)
  );

const splitTags = (value: string): ReadonlyArray<string> =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

const runTagsQuery = (graphService: GraphService, tagValue: string) =>
  Effect.gen(function* () {
    const tagIds = splitTags(tagValue);
    if (tagIds.length === 0) {
      return yield* Effect.fail(
        new InvalidQueryError({ message: "--tags must include at least one tag." })
      );
    }

    const entities = yield* graphService.findByTagPath(tagIds);
    yield* printGroupedEntities(
      `Tag intersection: ${tagIds.map((tag) => `#${tag}`).join(", ")}`,
      entities
    );
  });

const runRelatedQuery = (graphService: GraphService, relatedToValue: string) =>
  Effect.gen(function* () {
    const center = yield* graphService.getEntityWithLinks(relatedToValue);
    const related = yield* graphService.getRelatedEntities(relatedToValue);
    const relatedById = new Map<string, Entity>(related.map((entity) => [entity.id, entity]));

    yield* Console.log("");
    yield* Console.log(`Related to ${center.entity.title} (${center.entity.id})`);
    yield* Console.log("=".repeat(40));

    if (related.length === 0) {
      yield* Console.log("");
      yield* Console.log("No linked entities found.");
      yield* Console.log("");
      return;
    }

    const links = [...center.outgoingLinks, ...center.incomingLinks];
    for (const link of links) {
      const target = relatedById.get(otherEntityId(link, relatedToValue));
      if (!target) continue;

      yield* Console.log("");
      yield* Console.log(
        `  ${center.entity.id} ${linkDirectionLabel(link, relatedToValue)} ${target.id}`
      );
      yield* printEntityDetails(target);
    }

    yield* Console.log("");
    yield* Console.log(`next: kioku query --traverse ${center.entity.id} --depth 2`);
    yield* Console.log("");
  });

const runTraverseQuery = (graphService: GraphService, traverseValue: string, depthValue: number) =>
  Effect.gen(function* () {
    const result = yield* graphService.traverse(traverseValue, depthValue);
    yield* printGroupedEntities(
      `Traversal from ${traverseValue} to depth ${depthValue} (visited depth ${result.depth})`,
      result.entities
    );
  });

const runPathQuery = (graphService: GraphService, pathValue: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    if (pathValue.length !== 2) {
      return yield* Effect.fail(
        new InvalidQueryError({ message: "--path requires <fromId> and <toId>." })
      );
    }

    const [fromId, toId] = pathValue as readonly [string, string];

    const pathEntities = yield* graphService.findPath(fromId, toId);

    yield* Console.log("");
    yield* Console.log(`Shortest path: ${fromId} -> ${toId}`);
    yield* Console.log("=".repeat(40));

    if (!pathEntities) {
      yield* Console.log("");
      yield* Console.log("No path found.");
      yield* Console.log("");
      return;
    }

    for (const [i, entity] of pathEntities.entries()) {
      yield* Console.log("");
      yield* Console.log(`${i + 1}. ${entitySummary(entity)}`);

      const next = pathEntities[i + 1];
      if (next) {
        const withLinks = yield* graphService.getEntityWithLinks(entity.id);
        const link = findLinkBetween(
          [...withLinks.outgoingLinks, ...withLinks.incomingLinks],
          entity.id,
          next.id
        );

        const label = link ? linkDirectionLabel(link, entity.id) : "--related-->";
        yield* Console.log(`   ${label}`);
      }
    }

    yield* Console.log("");
    yield* Console.log(`next: kioku query --related-to ${fromId}`);
    yield* Console.log(`next: kioku query --related-to ${toId}`);
    yield* Console.log("");
  });

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
      return yield* Effect.fail(
        new InvalidQueryError({
          message:
            "Choose exactly one query mode: --tags, --related-to, --traverse, --path, or a quoted natural-language prompt.",
        })
      );
    }

    if (selection.depthValue !== undefined && !selection.traverseValue) {
      return yield* Effect.fail(
        new InvalidQueryError({ message: "--depth is only valid with --traverse." })
      );
    }

    if (selection.traverseValue && selection.depthValue === undefined) {
      return yield* Effect.fail(
        new InvalidQueryError({ message: "--traverse requires an explicit --depth value." })
      );
    }

    if (selection.depthValue !== undefined && selection.depthValue < 1) {
      return yield* Effect.fail(
        new InvalidQueryError({ message: "--depth must be greater than 0." })
      );
    }
  });

const runStructuredQuery = (graphService: GraphService, selection: QuerySelection) =>
  Effect.gen(function* () {
    if (selection.tagValue) {
      yield* runTagsQuery(graphService, selection.tagValue);
      return;
    }

    if (selection.relatedToValue) {
      yield* runRelatedQuery(graphService, selection.relatedToValue);
      return;
    }

    if (selection.traverseValue && selection.depthValue !== undefined) {
      yield* runTraverseQuery(graphService, selection.traverseValue, selection.depthValue);
      return;
    }

    if (selection.pathValue) {
      yield* runPathQuery(graphService, selection.pathValue);
    }
  });

// ============================================================================
// Query Command
// ============================================================================

export const queryCommand = Command.make(
  "query",
  {
    tags: Options.text("tags").pipe(
      Options.withDescription("Comma-separated tags to intersect, matched exactly"),
      Options.optional
    ),
    relatedTo: Options.text("related-to").pipe(
      Options.withDescription("Entity ID to retrieve 1-hop neighbors for"),
      Options.optional
    ),
    traverse: Options.text("traverse").pipe(
      Options.withDescription("Entity ID to retrieve a bounded graph neighborhood for"),
      Options.optional
    ),
    depth: Options.integer("depth").pipe(
      Options.withDescription("Required traversal depth for --traverse"),
      Options.optional
    ),
    path: Options.boolean("path").pipe(
      Options.withDescription("Interpret positional values as shortest path endpoints"),
      Options.withDefault(false)
    ),
    query: Args.text({ name: "query" }).pipe(Args.repeated),
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
      const ServiceLayers = CliCoreLive(workspace.dbPath);

      yield* Effect.scoped(
        Effect.gen(function* () {
          const graphService = yield* GraphServiceTag;
          yield* runStructuredQuery(graphService, selection);
        }).pipe(Effect.provide(ServiceLayers))
      );
    }).pipe(
      Effect.catchTags({
        InvalidQueryError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        EntityNotFoundError: (e) =>
          Console.error(`Error: Entity not found: ${e.entityId}`).pipe(
            Effect.zipRight(Effect.fail(e))
          ),
      })
    )
).pipe(Command.withDescription("Query project memory by tags, links, traversal, or paths"));
