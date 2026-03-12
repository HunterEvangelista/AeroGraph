/**
 * Graph Service
 * Graph traversal algorithms and relationship queries
 */
import { Context, Effect, Layer } from "effect"
import { type Entity, EntityTypeEnum } from "../domain/entity.js"
import type { Link, LinkType } from "../domain/link.js"
import type { EntityNotFoundError, RepositoryError } from "../errors.js"
import { EntityRepositoryTag } from "../repository/entity-repository.js"
import { LinkRepositoryTag } from "../repository/link-repository.js"
import { TagRepositoryTag } from "../repository/tag-repository.js"

// ============================================================================
// Graph Query Result Types
// ============================================================================

export interface EntityWithLinks {
  readonly entity: Entity
  readonly incomingLinks: ReadonlyArray<Link>
  readonly outgoingLinks: ReadonlyArray<Link>
}

export interface TraversalResult {
  readonly entities: ReadonlyArray<Entity>
  readonly depth: number
}

export interface GraphStats {
  readonly totalEntities: number
  readonly totalTags: number
  readonly totalLinks: number
  readonly entitiesByType: Record<string, number>
}

// ============================================================================
// Graph Service Interface
// ============================================================================

export interface GraphService {
  /**
   * Get an entity with all its links
   */
  readonly getEntityWithLinks: (
    entityId: string
  ) => Effect.Effect<EntityWithLinks, EntityNotFoundError | RepositoryError>

  /**
   * Get related entities (1 hop)
   */
  readonly getRelatedEntities: (
    entityId: string,
    linkTypes?: ReadonlyArray<LinkType>
  ) => Effect.Effect<ReadonlyArray<Entity>, EntityNotFoundError | RepositoryError>

  /**
   * Traverse graph from entity up to N hops
   */
  readonly traverse: (
    entityId: string,
    maxDepth: number,
    linkTypes?: ReadonlyArray<LinkType>
  ) => Effect.Effect<TraversalResult, EntityNotFoundError | RepositoryError>

  /**
   * Find all entities connected by a path through tags
   */
  readonly findByTagPath: (
    tagIds: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlyArray<Entity>, RepositoryError>

  /**
   * Get graph statistics
   */
  readonly getStats: () => Effect.Effect<GraphStats, RepositoryError>

  /**
   * Find shortest path between two entities (via links)
   */
  readonly findPath: (
    sourceId: string,
    targetId: string,
    maxDepth?: number
  ) => Effect.Effect<ReadonlyArray<Entity> | null, EntityNotFoundError | RepositoryError>
}

// ============================================================================
// Graph Service Tag
// ============================================================================

export class GraphServiceTag extends Context.Tag("GraphService")<GraphServiceTag, GraphService>() {}

// ============================================================================
// Graph Service Implementation
// ============================================================================

export const GraphServiceLive = Layer.effect(
  GraphServiceTag,
  Effect.gen(function* () {
    const entityRepo = yield* EntityRepositoryTag
    const linkRepo = yield* LinkRepositoryTag
    const tagRepo = yield* TagRepositoryTag

    const getEntityWithLinks = (entityId: string) =>
      Effect.gen(function* () {
        const entity = yield* entityRepo.getById(entityId as Entity["id"])
        const allLinks = yield* linkRepo.getAllForEntity(entityId)

        const incomingLinks = allLinks.filter((l) => l.targetId === entityId)
        const outgoingLinks = allLinks.filter((l) => l.sourceId === entityId)

        return { entity, incomingLinks, outgoingLinks } satisfies EntityWithLinks
      })

    const getRelatedEntities = (entityId: string, linkTypes?: ReadonlyArray<LinkType>) =>
      Effect.gen(function* () {
        const links = yield* linkRepo.getAllForEntity(entityId)

        const filteredLinks = linkTypes ? links.filter((l) => linkTypes.includes(l.type)) : links

        const relatedIds = new Set<string>()
        for (const link of filteredLinks) {
          if (link.sourceId === entityId) {
            relatedIds.add(link.targetId)
          } else {
            relatedIds.add(link.sourceId)
          }
        }

        const entities: Entity[] = []
        for (const id of relatedIds) {
          const result = yield* Effect.either(entityRepo.getById(id as Entity["id"]))
          if (result._tag === "Right") {
            entities.push(result.right)
          }
        }

        return entities
      })

    const traverse = (entityId: string, maxDepth: number, linkTypes?: ReadonlyArray<LinkType>) =>
      Effect.gen(function* () {
        const visited = new Set<string>([entityId])
        const entities: Entity[] = []
        let currentLevel = [entityId]
        let depth = 0

        while (currentLevel.length > 0 && depth < maxDepth) {
          const nextLevel: string[] = []

          for (const id of currentLevel) {
            const related = yield* getRelatedEntities(id, linkTypes)
            for (const entity of related) {
              if (!visited.has(entity.id)) {
                visited.add(entity.id)
                entities.push(entity)
                nextLevel.push(entity.id)
              }
            }
          }

          currentLevel = nextLevel
          depth++
        }

        return { entities, depth } satisfies TraversalResult
      })

    const findByTagPath = (tagIds: ReadonlyArray<string>) => entityRepo.getByTags(tagIds)

    const getStats = () =>
      Effect.gen(function* () {
        const [totalEntities, totalTags, totalLinks] = yield* Effect.all([
          entityRepo.count(),
          tagRepo.count(),
          linkRepo.count(),
        ])

        const entitiesByType: Record<string, number> = {}
        for (const type of [
          EntityTypeEnum.Doc,
          EntityTypeEnum.CodeRef,
          EntityTypeEnum.Story,
          EntityTypeEnum.Diagram,
        ] as const) {
          entitiesByType[type] = yield* entityRepo.count(type)
        }

        return { totalEntities, totalTags, totalLinks, entitiesByType } satisfies GraphStats
      })

    const findPath = (sourceId: string, targetId: string, maxDepth = 5) =>
      Effect.gen(function* () {
        // BFS to find shortest path
        const visited = new Set<string>([sourceId])
        const parentMap = new Map<string, string>()
        let queue = [sourceId]

        for (let depth = 0; depth < maxDepth && queue.length > 0; depth++) {
          const nextQueue: string[] = []

          for (const currentId of queue) {
            if (currentId === targetId) {
              // Reconstruct path
              const path: Entity[] = []
              let id: string | undefined = targetId
              while (id) {
                const entity = yield* entityRepo.getById(id as Entity["id"])
                path.unshift(entity)
                id = parentMap.get(id)
              }
              return path
            }

            const links = yield* linkRepo.getAllForEntity(currentId)
            for (const link of links) {
              const neighborId = link.sourceId === currentId ? link.targetId : link.sourceId
              if (!visited.has(neighborId)) {
                visited.add(neighborId)
                parentMap.set(neighborId, currentId)
                nextQueue.push(neighborId)
              }
            }
          }

          queue = nextQueue
        }

        return null
      })

    return {
      getEntityWithLinks,
      getRelatedEntities,
      traverse,
      findByTagPath,
      getStats,
      findPath,
    } satisfies GraphService
  })
)
