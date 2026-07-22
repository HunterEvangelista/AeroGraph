import { Effect, Layer, Result } from "effect";
import { type Entity, EntityTypeEnum } from "../domain/entity.js";
import type { LinkType } from "../domain/link.js";
import { EntityNotFoundError } from "../errors.js";
import { EntityRepositoryTag } from "../repository/entity-repository.js";
import { LinkRepositoryTag } from "../repository/link-repository.js";
import { TagRepositoryTag } from "../repository/tag-repository.js";
import {
  type EntityWithLinks,
  type GraphService,
  GraphServiceTag,
  type GraphStats,
  type TraversalResult,
} from "./graph-service.js";

export const GraphServiceLive = Layer.effect(
  GraphServiceTag,
  Effect.gen(function* () {
    const entityRepo = yield* EntityRepositoryTag;
    const linkRepo = yield* LinkRepositoryTag;
    const tagRepo = yield* TagRepositoryTag;

    const getEntityWithLinks = (entityId: string) =>
      Effect.gen(function* () {
        const entity = yield* entityRepo.getById(entityId as Entity["id"]);
        const allLinks = yield* linkRepo.getAllForEntity(entityId);

        const incomingLinks = allLinks.filter((l) => l.targetId === entityId);
        const outgoingLinks = allLinks.filter((l) => l.sourceId === entityId);

        return { entity, incomingLinks, outgoingLinks } satisfies EntityWithLinks;
      });

    const getRelatedEntities = (entityId: string, linkTypes?: ReadonlyArray<LinkType>) =>
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
          const result = yield* Effect.result(entityRepo.getById(id as Entity["id"]));
          if (Result.isSuccess(result)) {
            entities.push(result.success);
          } else if (!(result.failure instanceof EntityNotFoundError)) {
            return yield* result.failure;
          }
        }

        return entities;
      });

    const traverse = (entityId: string, maxDepth: number, linkTypes?: ReadonlyArray<LinkType>) =>
      Effect.gen(function* () {
        const visited = new Set<string>([entityId]);
        const entities: Entity[] = [];
        let currentLevel = [entityId];
        let depth = 0;

        while (currentLevel.length > 0 && depth < maxDepth) {
          const nextLevel: string[] = [];

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

    const getStats = () =>
      Effect.gen(function* () {
        const [totalEntities, totalTags, totalLinks] = yield* Effect.all([
          entityRepo.count(),
          tagRepo.count(),
          linkRepo.count(),
        ]);

        const entitiesByType: Record<string, number> = {};
        for (const type of [
          EntityTypeEnum.Doc,
          EntityTypeEnum.CodeRef,
          EntityTypeEnum.Story,
          EntityTypeEnum.Diagram,
        ] as const) {
          entitiesByType[type] = yield* entityRepo.count(type);
        }

        return { totalEntities, totalTags, totalLinks, entitiesByType } satisfies GraphStats;
      });

    const findPath = (sourceId: string, targetId: string, maxDepth = 5) =>
      Effect.gen(function* () {
        const visited = new Set<string>([sourceId]);
        const parentMap = new Map<string, string>();
        let queue = [sourceId];

        for (let depth = 0; depth <= maxDepth && queue.length > 0; depth++) {
          const nextQueue: string[] = [];

          for (const currentId of queue) {
            if (currentId === targetId) {
              const path: Entity[] = [];
              let id: string | undefined = targetId;
              while (id) {
                const entity = yield* entityRepo.getById(id as Entity["id"]);
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
