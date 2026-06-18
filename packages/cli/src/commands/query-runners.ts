import { type Entity, EntityTypeEnum, GraphServiceTag, type Link } from "@kioku/core";
import { Console, Effect } from "effect";
import { formattedEntityId, loadFormattedEntityIds } from "../entity-display.js";

export interface QueryRunResult {
  readonly displayedEntityIds: ReadonlyArray<string>;
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

const entitySummary = (entity: Entity, displayIds: ReadonlyMap<string, string>): string => {
  const location = codeLocation(entity);
  const suffix = location ? ` (${location})` : "";
  return `${formattedEntityId(displayIds, entity.id)}  [${entity._tag}] ${entity.title}${suffix}`;
};

const printEntityBody = (entity: Entity, displayIds: ReadonlyMap<string, string>) =>
  Effect.gen(function* () {
    if (entity._tag === EntityTypeEnum.Story) {
      const priority = entity.priority ? `, priority: ${entity.priority}` : "";
      yield* Console.log(`    status: ${entity.status}${priority}`);
    }

    const text = preview(entity.content);
    if (text) {
      yield* Console.log(`    ${text}`);
    }

    const prefix = formattedEntityId(displayIds, entity.id);
    yield* Console.log(`    next ${prefix} --related`);
    yield* Console.log(`    next ${prefix} --traverse`);
  });

const printEntityDetails = (entity: Entity, displayIds: ReadonlyMap<string, string>) =>
  Effect.gen(function* () {
    yield* Console.log(`  ${entitySummary(entity, displayIds)}`);
    yield* printEntityBody(entity, displayIds);
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

    const displayIds = yield* loadFormattedEntityIds(entities.map((entity) => entity.id));

    for (const role of roleOrder) {
      const roleEntities = entities.filter((entity) => entity._tag === role);
      if (roleEntities.length === 0) continue;

      yield* Console.log("");
      yield* Console.log(roleLabel(role));
      yield* Console.log("-".repeat(roleLabel(role).length));

      for (const entity of roleEntities) {
        yield* printEntityDetails(entity, displayIds);
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

// ============================================================================
// Query Runners
// ============================================================================

export const runTagsQuery = (tagIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const graphService = yield* GraphServiceTag;
    const entities = yield* graphService.findByTagPath(tagIds);
    yield* printGroupedEntities(
      `Tag intersection: ${tagIds.map((tag) => `#${tag}`).join(", ")}`,
      entities
    );
    return { displayedEntityIds: entities.map((entity) => entity.id) } satisfies QueryRunResult;
  });

export const runRelatedQuery = (entityId: string) =>
  Effect.gen(function* () {
    const graphService = yield* GraphServiceTag;
    const center = yield* graphService.getEntityWithLinks(entityId);
    const related = yield* graphService.getRelatedEntities(entityId);
    const relatedById = new Map<string, Entity>(related.map((entity) => [entity.id, entity]));
    const displayIds = yield* loadFormattedEntityIds([
      center.entity.id,
      ...related.map((entity) => entity.id),
    ]);

    yield* Console.log("");
    yield* Console.log(
      `Related to ${center.entity.title} (${formattedEntityId(displayIds, center.entity.id)})`
    );
    yield* Console.log("=".repeat(40));

    if (related.length === 0) {
      yield* Console.log("");
      yield* Console.log("No linked entities found.");
      yield* Console.log("");
      return { displayedEntityIds: [center.entity.id] } satisfies QueryRunResult;
    }

    const links = [...center.outgoingLinks, ...center.incomingLinks];
    for (const link of links) {
      const target = relatedById.get(otherEntityId(link, entityId));
      if (!target) continue;

      yield* Console.log("");
      yield* Console.log(
        `  ${formattedEntityId(displayIds, center.entity.id)} ${linkDirectionLabel(link, entityId)} ${entitySummary(target, displayIds)}`
      );
      yield* printEntityBody(target, displayIds);
    }

    yield* Console.log("");
    yield* Console.log(`next ${formattedEntityId(displayIds, center.entity.id)} --traverse`);
    yield* Console.log("");
    return {
      displayedEntityIds: [center.entity.id, ...related.map((entity) => entity.id)],
    } satisfies QueryRunResult;
  });

export const runTraverseQuery = (entityId: string, depth: number) =>
  Effect.gen(function* () {
    const graphService = yield* GraphServiceTag;
    const result = yield* graphService.traverse(entityId, depth);
    yield* printGroupedEntities(
      `Traversal from ${entityId} to depth ${depth} (visited depth ${result.depth})`,
      result.entities
    );
    return {
      displayedEntityIds: result.entities.map((entity) => entity.id),
    } satisfies QueryRunResult;
  });

export const runPathQuery = (fromId: string, toId: string) =>
  Effect.gen(function* () {
    const graphService = yield* GraphServiceTag;
    const pathEntities = yield* graphService.findPath(fromId, toId);
    const displayIds = yield* loadFormattedEntityIds(
      pathEntities?.map((entity) => entity.id) ?? [fromId, toId]
    );

    yield* Console.log("");
    yield* Console.log(
      `Shortest path: ${formattedEntityId(displayIds, fromId)} -> ${formattedEntityId(displayIds, toId)}`
    );
    yield* Console.log("=".repeat(40));

    if (!pathEntities) {
      yield* Console.log("");
      yield* Console.log("No path found.");
      yield* Console.log("");
      return { displayedEntityIds: [] } satisfies QueryRunResult;
    }

    for (const [i, entity] of pathEntities.entries()) {
      yield* Console.log("");
      yield* Console.log(`${i + 1}. ${entitySummary(entity, displayIds)}`);

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
    yield* Console.log(`next ${formattedEntityId(displayIds, fromId)} --related`);
    yield* Console.log(`next ${formattedEntityId(displayIds, toId)} --related`);
    yield* Console.log("");
    return { displayedEntityIds: pathEntities.map((entity) => entity.id) } satisfies QueryRunResult;
  });
