/** biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: deferred */
import { Effect, Layer, Result } from "effect";
import { type Entity, type EntityId, type EntityType, EntityTypes } from "../domain/entity";
import type { LinkType } from "../domain/link";
import { EntityNotFoundError } from "../errors";
import { EntityRepositoryTag } from "../repository/entity-repository";
import { LinkRepositoryTag } from "../repository/link-repository";
import { TagRepositoryTag } from "../repository/tag-repository";
import {
  type EntityWithLinks,
  type GraphService,
  GraphServiceTag,
  type GraphStats,
  type TraversalResult,
} from "./graph-service";

export const GraphServiceLive = Layer.effect(
  GraphServiceTag,
  Effect.gen(function* () {
    const entityRepo = yield* EntityRepositoryTag;
    const linkRepo = yield* LinkRepositoryTag;
    const tagRepo = yield* TagRepositoryTag;

    const getEntityWithLinks = (entityId: EntityId) =>
      Effect.gen(function* () {
        const entity = yield* entityRepo.getById(entityId);
        const allLinks = yield* linkRepo.getAllForEntity(entityId);

        const incomingLinks = allLinks.filter((l) => l.targetId === entityId);
        const outgoingLinks = allLinks.filter((l) => l.sourceId === entityId);

        return { entity, incomingLinks, outgoingLinks } satisfies EntityWithLinks;
      });

    const getRelatedEntities = (entityId: EntityId, linkTypes?: ReadonlyArray<LinkType>) =>
      Effect.gen(function* () {
        const links = yield* linkRepo.getAllForEntity(entityId);

        const filteredLinks = linkTypes ? links.filter((l) => linkTypes.includes(l.type)) : links;

        const relatedIds = new Set<string>();
        for (const link of filteredLinks) {
          if (link.sourceId === entityId) {
            relatedIds.add(link.targetId);
          } else {
            relatedIds.add(link.sourceId);
          }
        }

        const entities: Entity[] = [];
        for (const id of relatedIds) {
          // SAFETY: Related IDs come directly from persisted links and use the entity ID representation.
          const result = yield* Effect.result(entityRepo.getById(id as Entity["id"]));
          if (Result.isSuccess(result)) {
            entities.push(result.success);
          } else if (!(result.failure instanceof EntityNotFoundError)) {
            return yield* result.failure;
          }
        }

        return entities;
      });

    const traverse = (entityId: EntityId, maxDepth: number, linkTypes?: ReadonlyArray<LinkType>) =>
      Effect.gen(function* () {
        const visited = new Set([entityId]);
        const entities: Entity[] = [];
        let currentLevel = [entityId];
        let depth = 0;

        while (currentLevel.length > 0 && depth < maxDepth) {
          const nextLevel: EntityId[] = [];

          for (const id of currentLevel) {
            const related = yield* getRelatedEntities(id, linkTypes);
            for (const entity of related) {
              if (!visited.has(entity.id)) {
                visited.add(entity.id);
                entities.push(entity);
                nextLevel.push(entity.id);
              }
            }
          }

          currentLevel = nextLevel;
          depth++;
        }

        return { entities, depth } satisfies TraversalResult;
      });

    const findByTagPath = (tagIds: ReadonlyArray<string>) => entityRepo.getByTags(tagIds);

    const findByTagGroups = (tagIdGroups: ReadonlyArray<ReadonlyArray<string>>) =>
      Effect.gen(function* () {
        if (tagIdGroups.length === 0 || tagIdGroups.some((group) => group.length === 0)) {
          return [];
        }

        const matchesByGroup = yield* Effect.all(
          tagIdGroups.map((group) =>
            Effect.all([...new Set(group)].map((tagId) => entityRepo.getByTag(tagId))).pipe(
              Effect.map(
                (matches) => new Map(matches.flat().map((entity) => [entity.id, entity] as const))
              )
            )
          )
        );
        const [first, ...rest] = matchesByGroup;
        if (!first) return [];

        return [...first.values()].filter((entity) =>
          rest.every((matches) => matches.has(entity.id))
        );
      });

    const getStats = Effect.gen(function* () {
      const [totalEntities, totalTags, totalLinks] = yield* Effect.all([
        entityRepo.count(),
        tagRepo.count,
        linkRepo.count,
      ]);

      const entitiesByType: Partial<Record<EntityType, number>> = {};
      for (const type of EntityTypes) {
        entitiesByType[type] = yield* entityRepo.count(type);
      }

      return { totalEntities, totalTags, totalLinks, entitiesByType } satisfies GraphStats;
    });

    const findPath = (sourceId: EntityId, targetId: EntityId, maxDepth = 5) =>
      Effect.gen(function* () {
        const visited = new Set<string>([sourceId]);
        const parentMap = new Map<EntityId, EntityId>();
        let queue = [sourceId];

        for (let depth = 0; depth <= maxDepth && queue.length > 0; depth++) {
          const nextQueue: EntityId[] = [];

          for (const currentId of queue) {
            if (currentId === targetId) {
              const path: Entity[] = [];
              let id: EntityId | undefined = targetId;
              while (id) {
                const entity = yield* entityRepo.getById(id);
                path.unshift(entity);
                id = parentMap.get(id);
              }
              return path;
            }

            const links = yield* linkRepo.getAllForEntity(currentId);
            for (const link of links) {
              const neighborId = link.sourceId === currentId ? link.targetId : link.sourceId;
              if (!visited.has(neighborId)) {
                visited.add(neighborId);
                parentMap.set(neighborId, currentId);
                nextQueue.push(neighborId);
              }
            }
          }

          queue = nextQueue;
        }

        return null;
      });

    return {
      getEntityWithLinks,
      getRelatedEntities,
      traverse,
      findByTagPath,
      findByTagGroups,
      getStats,
      findPath,
    } satisfies GraphService;
  })
);
