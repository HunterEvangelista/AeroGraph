/**
 * Service Layer Unit Tests (KIOKU-17)
 *
 * Tests for TagService and GraphService business logic using mock repositories.
 * These are unit tests - they verify service behavior in isolation.
 */
import { Effect, Exit, Layer } from "effect";
import { describe, expect, it } from "vitest";

import type {
  CodeRef,
  Diagram,
  Doc,
  Entity,
  EntityId,
  EntityType,
  Story,
} from "../domain/entity.js";
import { DiagramTypeEnum, EntityTypeEnum, StoryStatusEnum } from "../domain/entity.js";
import type { Link, LinkId, LinkType } from "../domain/link.js";
import type { Tag, TagId } from "../domain/tag.js";
import { EntityNotFoundError, RepositoryError, TagNotFoundError } from "../errors.js";
import type { EntityRepository } from "../repository/entity-repository.js";
import { EntityRepositoryTag } from "../repository/entity-repository.js";
import type { LinkRepository } from "../repository/link-repository.js";
import { LinkRepositoryTag } from "../repository/link-repository.js";
import type { TagRepository } from "../repository/tag-repository.js";
import { TagRepositoryTag } from "../repository/tag-repository.js";
import { GraphServiceTag } from "../services/graph-service.js";
import { GraphServiceLive } from "../services/graph-service.live.js";
import { TagServiceTag } from "../services/tag-service.js";
import { TagServiceLive } from "../services/tag-service.live.js";
import { FIXED_TIMESTAMP_ISO } from "./helpers/index.js";

// ============================================================================
// Test Fixtures
// ============================================================================

const FIXED_DATE = new Date(FIXED_TIMESTAMP_ISO);

const createTestDoc = (id: string): Doc => ({
  _tag: EntityTypeEnum.Doc,
  id: id as EntityId,
  title: `Entity ${id}`,
  content: `Content for ${id}`,
  tags: [],
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
  version: 1,
});

const createTestCodeRef = (id: string): CodeRef => ({
  _tag: EntityTypeEnum.CodeRef,
  id: id as EntityId,
  title: `Entity ${id}`,
  content: `Content for ${id}`,
  tags: [],
  repoPath: "packages/core",
  filePath: "src/test.ts",
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
  version: 1,
});

const createTestStory = (id: string): Story => ({
  _tag: EntityTypeEnum.Story,
  id: id as EntityId,
  title: `Entity ${id}`,
  content: `Content for ${id}`,
  tags: [],
  status: StoryStatusEnum.Todo,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
  version: 1,
});

const createTestDiagram = (id: string): Diagram => ({
  _tag: EntityTypeEnum.Diagram,
  id: id as EntityId,
  title: `Entity ${id}`,
  content: `Content for ${id}`,
  tags: [],
  diagramType: DiagramTypeEnum.Flowchart,
  source: "A -> B",
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
  version: 1,
});

const createTestEntity = (id: string, type: EntityType = EntityTypeEnum.Doc): Entity => {
  switch (type) {
    case EntityTypeEnum.Doc:
      return createTestDoc(id);
    case EntityTypeEnum.CodeRef:
      return createTestCodeRef(id);
    case EntityTypeEnum.Story:
      return createTestStory(id);
    case EntityTypeEnum.Diagram:
      return createTestDiagram(id);
  }
};

const createTestTag = (id: string, name: string, parentId?: string): Tag => ({
  id: id as TagId,
  name,
  parentId,
  createdAt: FIXED_DATE,
});

const createTestLink = (id: string, sourceId: string, targetId: string, type: LinkType): Link => ({
  id: id as LinkId,
  sourceId,
  targetId,
  type,
  createdAt: FIXED_DATE,
});

// ============================================================================
// Mock Repository Factories
// ============================================================================

interface MockTagRepositoryConfig {
  tags?: Map<string, Tag>;
  createBehavior?: "success" | "error";
}

const createMockTagRepository = (config: MockTagRepositoryConfig = {}): TagRepository => {
  const tags = config.tags ?? new Map<string, Tag>();

  return {
    create: (input) =>
      Effect.gen(function* () {
        if (config.createBehavior === "error") {
          return yield* Effect.fail(new RepositoryError({ message: "Create failed" }));
        }
        const tag: Tag = {
          id: input.id as TagId,
          name: input.name,
          description: input.description,
          parentId: input.parentId,
          aliases: input.aliases,
          createdAt: FIXED_DATE,
        };
        tags.set(input.id, tag);
        return tag;
      }),

    getById: (id) =>
      Effect.gen(function* () {
        const tag = tags.get(id);
        if (!tag) {
          return yield* Effect.fail(new TagNotFoundError({ tagId: id }));
        }
        return tag;
      }),

    getAll: () => Effect.succeed(Array.from(tags.values())),
    getChildren: () => Effect.succeed([]),
    getAncestors: () => Effect.succeed([]),
    update: (id) =>
      Effect.gen(function* () {
        const tag = tags.get(id);
        if (!tag) {
          return yield* Effect.fail(new TagNotFoundError({ tagId: id }));
        }
        return tag;
      }),
    delete: () => Effect.succeed(undefined),
    applyToEntity: () => Effect.succeed(undefined),
    removeFromEntity: () => Effect.succeed(undefined),
    getTagsForEntity: () => Effect.succeed([]),
    search: () => Effect.succeed([]),
    count: () => Effect.succeed(tags.size),
  };
};

interface MockEntityRepositoryConfig {
  entities?: Map<string, Entity>;
  taggedEntities?: Map<string, Set<string>>; // tagId -> entityIds
}

const createMockEntityRepository = (config: MockEntityRepositoryConfig = {}): EntityRepository => {
  const entities = config.entities ?? new Map<string, Entity>();
  const taggedEntities = config.taggedEntities ?? new Map<string, Set<string>>();

  return {
    createDoc: (input) =>
      Effect.succeed({
        _tag: EntityTypeEnum.Doc,
        id: `doc-${Date.now()}` as EntityId,
        title: input.title,
        content: input.content,
        tags: input.tags ?? [],
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
        version: 1,
      }),
    createCodeRef: (input) =>
      Effect.succeed({
        _tag: EntityTypeEnum.CodeRef,
        id: `code-${Date.now()}` as EntityId,
        title: input.title,
        content: input.content,
        tags: input.tags ?? [],
        repoPath: input.repoPath,
        filePath: input.filePath,
        startLine: input.startLine,
        endLine: input.endLine,
        commitHash: input.commitHash,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
        version: 1,
      }),
    createStory: (input) =>
      Effect.succeed({
        _tag: EntityTypeEnum.Story,
        id: `story-${Date.now()}` as EntityId,
        title: input.title,
        content: input.content,
        tags: input.tags ?? [],
        status: input.status ?? StoryStatusEnum.Todo,
        priority: input.priority,
        parentId: input.parentId,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
        version: 1,
      }),
    createDiagram: (input) =>
      Effect.succeed({
        _tag: EntityTypeEnum.Diagram,
        id: `diagram-${Date.now()}` as EntityId,
        title: input.title,
        content: input.content,
        tags: input.tags ?? [],
        diagramType: input.diagramType,
        source: input.source,
        generatedFrom: input.generatedFrom,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
        version: 1,
      }),

    getById: (id) =>
      Effect.gen(function* () {
        const entity = entities.get(id);
        if (!entity) {
          return yield* Effect.fail(new EntityNotFoundError({ entityId: id }));
        }
        return entity;
      }),

    getAll: (type) =>
      Effect.succeed(Array.from(entities.values()).filter((e) => !type || e._tag === type)),

    getByTag: (tagId) =>
      Effect.succeed(
        Array.from(entities.values()).filter((e) => taggedEntities.get(tagId)?.has(e.id))
      ),

    getByTags: (tagIds) =>
      Effect.succeed(
        Array.from(entities.values()).filter((entity) =>
          tagIds.every((tagId) => taggedEntities.get(tagId)?.has(entity.id))
        )
      ),

    update: (id) =>
      Effect.gen(function* () {
        const entity = entities.get(id);
        if (!entity) {
          return yield* Effect.fail(new EntityNotFoundError({ entityId: id }));
        }
        return entity;
      }),

    delete: () => Effect.succeed(undefined),

    count: (type) =>
      Effect.succeed(Array.from(entities.values()).filter((e) => !type || e._tag === type).length),

    search: () => Effect.succeed([]),
  };
};

interface MockLinkRepositoryConfig {
  links?: Map<string, Link>;
}

const createMockLinkRepository = (config: MockLinkRepositoryConfig = {}): LinkRepository => {
  const links = config.links ?? new Map<string, Link>();

  const getAllForEntity = (entityId: string) =>
    Effect.succeed(
      Array.from(links.values()).filter((l) => l.sourceId === entityId || l.targetId === entityId)
    );

  return {
    create: (input) =>
      Effect.succeed({
        id: `link-${Date.now()}` as LinkId,
        sourceId: input.sourceId,
        targetId: input.targetId,
        type: input.type,
        createdAt: FIXED_DATE,
      }),
    createBidirectional: (input) =>
      Effect.succeed([
        {
          id: `link-${Date.now()}-fwd` as LinkId,
          sourceId: input.sourceId,
          targetId: input.targetId,
          type: input.type,
          createdAt: FIXED_DATE,
        },
        {
          id: `link-${Date.now()}-rev` as LinkId,
          sourceId: input.targetId,
          targetId: input.sourceId,
          type: input.type,
          createdAt: FIXED_DATE,
        },
      ] as const),
    getById: (id) =>
      Effect.gen(function* () {
        const link = links.get(id);
        if (!link) {
          return yield* Effect.fail(new RepositoryError({ message: `Link ${id} not found` }));
        }
        return link;
      }),
    getFromSource: (sourceId) =>
      Effect.succeed(Array.from(links.values()).filter((l) => l.sourceId === sourceId)),
    getToTarget: (targetId) =>
      Effect.succeed(Array.from(links.values()).filter((l) => l.targetId === targetId)),
    getAllForEntity,
    getByType: (type) => Effect.succeed(Array.from(links.values()).filter((l) => l.type === type)),
    getLinkBetween: (sourceId, targetId) =>
      Effect.succeed(
        Array.from(links.values()).find(
          (l) => l.sourceId === sourceId && l.targetId === targetId
        ) ?? null
      ),
    delete: () => Effect.succeed(undefined),
    deleteAllForEntity: () => Effect.succeed(0),
    deleteBetween: () => Effect.succeed(undefined),
    count: () => Effect.succeed(links.size),
  };
};

// ============================================================================
// Test Layer Factory
// ============================================================================

const createTestLayer = (config: {
  tagRepo?: TagRepository;
  entityRepo?: EntityRepository;
  linkRepo?: LinkRepository;
}) => {
  const tagRepoLayer = Layer.succeed(TagRepositoryTag, config.tagRepo ?? createMockTagRepository());
  const entityRepoLayer = Layer.succeed(
    EntityRepositoryTag,
    config.entityRepo ?? createMockEntityRepository()
  );
  const linkRepoLayer = Layer.succeed(
    LinkRepositoryTag,
    config.linkRepo ?? createMockLinkRepository()
  );

  const repoLayer = Layer.mergeAll(tagRepoLayer, entityRepoLayer, linkRepoLayer);

  return Layer.provideMerge(Layer.merge(TagServiceLive, GraphServiceLive), repoLayer);
};

// ============================================================================
// TagService Tests
// ============================================================================

describe("TagService", () => {
  describe("ensureHierarchy()", () => {
    it("creates nested tags from a path with proper parent relationships", async () => {
      const tags = new Map<string, Tag>();
      const tagRepo = createMockTagRepository({ tags });
      const layer = createTestLayer({ tagRepo });

      const program = Effect.gen(function* () {
        const tagService = yield* TagServiceTag;
        return yield* tagService.ensureHierarchy("checkout/rate-limiting/redis");
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      expect(result.id).toBe("checkout/rate-limiting/redis");
      expect(result.name).toBe("redis");
      expect(result.parentId).toBe("checkout/rate-limiting");

      // Verify all tags were created
      expect(tags.size).toBe(3);
      expect(tags.get("checkout")?.parentId).toBeUndefined();
      expect(tags.get("checkout/rate-limiting")?.parentId).toBe("checkout");
      expect(tags.get("checkout/rate-limiting/redis")?.parentId).toBe("checkout/rate-limiting");
    });

    it("reuses existing tags in partial chains", async () => {
      const tags = new Map<string, Tag>();
      // Pre-populate with existing parent tags
      tags.set("checkout", createTestTag("checkout", "checkout"));
      tags.set(
        "checkout/rate-limiting",
        createTestTag("checkout/rate-limiting", "rate-limiting", "checkout")
      );

      const tagRepo = createMockTagRepository({ tags });
      const layer = createTestLayer({ tagRepo });

      const program = Effect.gen(function* () {
        const tagService = yield* TagServiceTag;
        return yield* tagService.ensureHierarchy("checkout/rate-limiting/redis");
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      expect(result.id).toBe("checkout/rate-limiting/redis");
      // Only the new tag should have been created
      expect(tags.size).toBe(3);
    });

    it("is idempotent - calling twice returns the same tag", async () => {
      const tags = new Map<string, Tag>();
      const tagRepo = createMockTagRepository({ tags });
      const layer = createTestLayer({ tagRepo });

      const program = Effect.gen(function* () {
        const tagService = yield* TagServiceTag;
        const first = yield* tagService.ensureHierarchy("architecture/backend");
        const second = yield* tagService.ensureHierarchy("architecture/backend");
        return { first, second };
      });

      const { first, second } = await Effect.runPromise(Effect.provide(program, layer));

      expect(first.id).toBe(second.id);
      expect(tags.size).toBe(2); // Only 2 tags created, not 4
    });

    it("returns ValidationError for empty path", async () => {
      const layer = createTestLayer({});

      const program = Effect.gen(function* () {
        const tagService = yield* TagServiceTag;
        return yield* tagService.ensureHierarchy("");
      });

      const exit = await Effect.runPromiseExit(Effect.provide(program, layer));

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = exit.cause;
        expect(error._tag).toBe("Fail");
      }
    });
  });
});

// ============================================================================
// GraphService Tests
// ============================================================================

describe("GraphService", () => {
  describe("getEntityWithLinks()", () => {
    it("splits links into incoming and outgoing correctly", async () => {
      const entities = new Map<string, Entity>();
      entities.set("e1", createTestEntity("e1"));
      entities.set("e2", createTestEntity("e2"));
      entities.set("e3", createTestEntity("e3"));

      const links = new Map<string, Link>();
      // e1 -> e2 (outgoing from e1)
      links.set("l1", createTestLink("l1", "e1", "e2", "references"));
      // e3 -> e1 (incoming to e1)
      links.set("l2", createTestLink("l2", "e3", "e1", "blocks"));

      const layer = createTestLayer({
        entityRepo: createMockEntityRepository({ entities }),
        linkRepo: createMockLinkRepository({ links }),
      });

      const program = Effect.gen(function* () {
        const graphService = yield* GraphServiceTag;
        return yield* graphService.getEntityWithLinks("e1");
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      expect(result.entity.id).toBe("e1");
      expect(result.outgoingLinks).toHaveLength(1);
      expect(result.outgoingLinks[0]!.targetId).toBe("e2");
      expect(result.incomingLinks).toHaveLength(1);
      expect(result.incomingLinks[0]!.sourceId).toBe("e3");
    });

    it("returns EntityNotFoundError for missing entity", async () => {
      const layer = createTestLayer({
        entityRepo: createMockEntityRepository({ entities: new Map() }),
      });

      const program = Effect.gen(function* () {
        const graphService = yield* GraphServiceTag;
        return yield* graphService.getEntityWithLinks("nonexistent");
      });

      const exit = await Effect.runPromiseExit(Effect.provide(program, layer));

      expect(Exit.isFailure(exit)).toBe(true);
    });
  });

  describe("getRelatedEntities()", () => {
    it("returns de-duplicated related entities", async () => {
      const entities = new Map<string, Entity>();
      entities.set("center", createTestEntity("center"));
      entities.set("related1", createTestEntity("related1"));
      entities.set("related2", createTestEntity("related2"));

      const links = new Map<string, Link>();
      // Two links to same entity (should de-dup)
      links.set("l1", createTestLink("l1", "center", "related1", "references"));
      links.set("l2", createTestLink("l2", "related1", "center", "related_to"));
      // Link to different entity
      links.set("l3", createTestLink("l3", "center", "related2", "blocks"));

      const layer = createTestLayer({
        entityRepo: createMockEntityRepository({ entities }),
        linkRepo: createMockLinkRepository({ links }),
      });

      const program = Effect.gen(function* () {
        const graphService = yield* GraphServiceTag;
        return yield* graphService.getRelatedEntities("center");
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      // Should have 2 unique related entities, not 3
      expect(result).toHaveLength(2);
      const ids = result.map((e) => e.id);
      expect(ids).toContain("related1");
      expect(ids).toContain("related2");
    });

    it("respects optional linkTypes filter", async () => {
      const entities = new Map<string, Entity>();
      entities.set("center", createTestEntity("center"));
      entities.set("ref", createTestEntity("ref"));
      entities.set("blocked", createTestEntity("blocked"));

      const links = new Map<string, Link>();
      links.set("l1", createTestLink("l1", "center", "ref", "references"));
      links.set("l2", createTestLink("l2", "center", "blocked", "blocks"));

      const layer = createTestLayer({
        entityRepo: createMockEntityRepository({ entities }),
        linkRepo: createMockLinkRepository({ links }),
      });

      const program = Effect.gen(function* () {
        const graphService = yield* GraphServiceTag;
        return yield* graphService.getRelatedEntities("center", ["references"]);
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("ref");
    });

    it("returns empty array when no links exist", async () => {
      const entities = new Map<string, Entity>();
      entities.set("isolated", createTestEntity("isolated"));

      const layer = createTestLayer({
        entityRepo: createMockEntityRepository({ entities }),
        linkRepo: createMockLinkRepository({ links: new Map() }),
      });

      const program = Effect.gen(function* () {
        const graphService = yield* GraphServiceTag;
        return yield* graphService.getRelatedEntities("isolated");
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      expect(result).toHaveLength(0);
    });
  });

  describe("traverse()", () => {
    it("respects maxDepth limit with BFS", async () => {
      // Create a chain: e1 -> e2 -> e3 -> e4
      const entities = new Map<string, Entity>();
      entities.set("e1", createTestEntity("e1"));
      entities.set("e2", createTestEntity("e2"));
      entities.set("e3", createTestEntity("e3"));
      entities.set("e4", createTestEntity("e4"));

      const links = new Map<string, Link>();
      links.set("l1", createTestLink("l1", "e1", "e2", "references"));
      links.set("l2", createTestLink("l2", "e2", "e3", "references"));
      links.set("l3", createTestLink("l3", "e3", "e4", "references"));

      const layer = createTestLayer({
        entityRepo: createMockEntityRepository({ entities }),
        linkRepo: createMockLinkRepository({ links }),
      });

      const program = Effect.gen(function* () {
        const graphService = yield* GraphServiceTag;
        return yield* graphService.traverse("e1", 2); // Only go 2 hops
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      // From e1 with maxDepth 2: should reach e2 (depth 1) and e3 (depth 2), but not e4
      expect(result.entities.map((e) => e.id)).toContain("e2");
      expect(result.entities.map((e) => e.id)).toContain("e3");
      expect(result.entities.map((e) => e.id)).not.toContain("e4");
    });

    it("handles cycles without infinite loop", async () => {
      // Create a cycle: e1 -> e2 -> e3 -> e1
      const entities = new Map<string, Entity>();
      entities.set("e1", createTestEntity("e1"));
      entities.set("e2", createTestEntity("e2"));
      entities.set("e3", createTestEntity("e3"));

      const links = new Map<string, Link>();
      links.set("l1", createTestLink("l1", "e1", "e2", "references"));
      links.set("l2", createTestLink("l2", "e2", "e3", "references"));
      links.set("l3", createTestLink("l3", "e3", "e1", "references")); // Cycle back

      const layer = createTestLayer({
        entityRepo: createMockEntityRepository({ entities }),
        linkRepo: createMockLinkRepository({ links }),
      });

      const program = Effect.gen(function* () {
        const graphService = yield* GraphServiceTag;
        return yield* graphService.traverse("e1", 10); // High depth to test cycle handling
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      // Should visit each entity exactly once (excluding start)
      expect(result.entities).toHaveLength(2); // e2 and e3, not e1 again
    });

    it("returns empty result for isolated node", async () => {
      const entities = new Map<string, Entity>();
      entities.set("isolated", createTestEntity("isolated"));

      const layer = createTestLayer({
        entityRepo: createMockEntityRepository({ entities }),
        linkRepo: createMockLinkRepository({ links: new Map() }),
      });

      const program = Effect.gen(function* () {
        const graphService = yield* GraphServiceTag;
        return yield* graphService.traverse("isolated", 5);
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      expect(result.entities).toHaveLength(0);
    });
  });

  describe("findByTagPath()", () => {
    it("returns entities matching a single tag", async () => {
      const entities = new Map<string, Entity>();
      entities.set("e1", createTestEntity("e1"));
      entities.set("e2", createTestEntity("e2"));

      const taggedEntities = new Map<string, Set<string>>();
      taggedEntities.set("architecture", new Set(["e1"]));

      const layer = createTestLayer({
        entityRepo: createMockEntityRepository({ entities, taggedEntities }),
      });

      const program = Effect.gen(function* () {
        const graphService = yield* GraphServiceTag;
        return yield* graphService.findByTagPath(["architecture"]);
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("e1");
    });

    it("returns intersection for multiple tags", async () => {
      const entities = new Map<string, Entity>();
      entities.set("e1", createTestEntity("e1"));
      entities.set("e2", createTestEntity("e2"));
      entities.set("e3", createTestEntity("e3"));

      const taggedEntities = new Map<string, Set<string>>();
      taggedEntities.set("architecture", new Set(["e1", "e2"]));
      taggedEntities.set("backend", new Set(["e2", "e3"]));

      const layer = createTestLayer({
        entityRepo: createMockEntityRepository({ entities, taggedEntities }),
      });

      const program = Effect.gen(function* () {
        const graphService = yield* GraphServiceTag;
        return yield* graphService.findByTagPath(["architecture", "backend"]);
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      // Only e2 has both tags
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("e2");
    });
  });

  describe("findPath()", () => {
    it("finds direct connection as 2-entity path", async () => {
      const entities = new Map<string, Entity>();
      entities.set("source", createTestEntity("source"));
      entities.set("target", createTestEntity("target"));

      const links = new Map<string, Link>();
      links.set("l1", createTestLink("l1", "source", "target", "references"));

      const layer = createTestLayer({
        entityRepo: createMockEntityRepository({ entities }),
        linkRepo: createMockLinkRepository({ links }),
      });

      const program = Effect.gen(function* () {
        const graphService = yield* GraphServiceTag;
        return yield* graphService.findPath("source", "target");
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      expect(result).not.toBeNull();
      expect(result).toHaveLength(2);
      expect(result![0]!.id).toBe("source");
      expect(result![1]!.id).toBe("target");
    });

    it("finds shortest multi-hop path", async () => {
      // Graph: source -> a -> target
      //        source -> b -> c -> target (longer path)
      const entities = new Map<string, Entity>();
      entities.set("source", createTestEntity("source"));
      entities.set("a", createTestEntity("a"));
      entities.set("b", createTestEntity("b"));
      entities.set("c", createTestEntity("c"));
      entities.set("target", createTestEntity("target"));

      const links = new Map<string, Link>();
      // Short path: source -> a -> target
      links.set("l1", createTestLink("l1", "source", "a", "references"));
      links.set("l2", createTestLink("l2", "a", "target", "references"));
      // Long path: source -> b -> c -> target
      links.set("l3", createTestLink("l3", "source", "b", "references"));
      links.set("l4", createTestLink("l4", "b", "c", "references"));
      links.set("l5", createTestLink("l5", "c", "target", "references"));

      const layer = createTestLayer({
        entityRepo: createMockEntityRepository({ entities }),
        linkRepo: createMockLinkRepository({ links }),
      });

      const program = Effect.gen(function* () {
        const graphService = yield* GraphServiceTag;
        return yield* graphService.findPath("source", "target");
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      expect(result).not.toBeNull();
      // BFS finds shortest path: source -> a -> target (3 entities)
      expect(result).toHaveLength(3);
      expect(result![0]!.id).toBe("source");
      expect(result![2]!.id).toBe("target");
    });

    it("returns null when no path exists", async () => {
      const entities = new Map<string, Entity>();
      entities.set("island1", createTestEntity("island1"));
      entities.set("island2", createTestEntity("island2"));

      const layer = createTestLayer({
        entityRepo: createMockEntityRepository({ entities }),
        linkRepo: createMockLinkRepository({ links: new Map() }),
      });

      const program = Effect.gen(function* () {
        const graphService = yield* GraphServiceTag;
        return yield* graphService.findPath("island1", "island2");
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      expect(result).toBeNull();
    });
  });

  describe("getStats()", () => {
    it("returns correct totals and entity-type breakdown", async () => {
      const entities = new Map<string, Entity>();
      entities.set("doc1", createTestEntity("doc1", EntityTypeEnum.Doc));
      entities.set("doc2", createTestEntity("doc2", EntityTypeEnum.Doc));
      entities.set("code1", createTestEntity("code1", EntityTypeEnum.CodeRef));
      entities.set("story1", createTestEntity("story1", EntityTypeEnum.Story));

      const tags = new Map<string, Tag>();
      tags.set("tag1", createTestTag("tag1", "tag1"));
      tags.set("tag2", createTestTag("tag2", "tag2"));

      const links = new Map<string, Link>();
      links.set("l1", createTestLink("l1", "doc1", "doc2", "references"));

      const layer = createTestLayer({
        entityRepo: createMockEntityRepository({ entities }),
        tagRepo: createMockTagRepository({ tags }),
        linkRepo: createMockLinkRepository({ links }),
      });

      const program = Effect.gen(function* () {
        const graphService = yield* GraphServiceTag;
        return yield* graphService.getStats();
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      expect(result.totalEntities).toBe(4);
      expect(result.totalTags).toBe(2);
      expect(result.totalLinks).toBe(1);
      expect(result.entitiesByType[EntityTypeEnum.Doc]).toBe(2);
      expect(result.entitiesByType[EntityTypeEnum.CodeRef]).toBe(1);
      expect(result.entitiesByType[EntityTypeEnum.Story]).toBe(1);
      expect(result.entitiesByType[EntityTypeEnum.Diagram]).toBe(0);
    });
  });
});
