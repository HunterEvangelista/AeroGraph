import { Cause, Effect, Exit, Layer, Schema } from "effect";
import { describe, expect, it } from "vitest";

import type { CodeRef, Diagram, Doc, Entity, EntityId, Story } from "../domain/entity";
import { BrandedId, DiagramTypeEnum, EntityType, StoryStatusEnum } from "../domain/entity";
import type { Link, LinkId, LinkType } from "../domain/link";
import type { Tag } from "../domain/tag";
import { TagIdSchema } from "../domain/tag";
import type { Term, TermName } from "../domain/term";
import { normalizeTermName, TermIdSchema } from "../domain/term";
import {
  EntityNotFoundError,
  RepositoryError,
  TagNotFoundError,
  TermNotFoundError,
  ValidationError,
} from "../errors";
import type { EntityRepository } from "../repository/entity-repository";
import { EntityRepositoryTag } from "../repository/entity-repository";
import type { LinkRepository } from "../repository/link-repository";
import { LinkRepositoryTag } from "../repository/link-repository";
import type { TagRepository } from "../repository/tag-repository";
import { TagRepositoryTag } from "../repository/tag-repository";
import type { ResolvedTermName, TermRepository } from "../repository/term-repository";
import { TermRepositoryTag } from "../repository/term-repository";
import { GraphServiceTag } from "../services/graph-service";
import { GraphServiceLive } from "../services/graph-service.live";
import { TagServiceTag } from "../services/tag-service";
import { TagServiceLive } from "../services/tag-service.live";
import { FIXED_TIMESTAMP_ISO } from "./helpers/index";

// ============================================================================
// Test Fixtures
// ============================================================================

const FIXED_DATE = new Date(FIXED_TIMESTAMP_ISO);

const testEntityId = (id: string): EntityId => Schema.decodeUnknownSync(BrandedId)(id);
const testTagId = (id: string): Tag["id"] => Schema.decodeUnknownSync(TagIdSchema)(id);
const testTermId = (id: string): Term["id"] => Schema.decodeUnknownSync(TermIdSchema)(id);
const LinkIdSchema = Schema.String.pipe(Schema.brand("LinkId"));
const testLinkId = (id: string): LinkId => Schema.decodeUnknownSync(LinkIdSchema)(id);

const createTestDoc = (id: string): Doc => ({
  _tag: EntityType.Doc,
  id: testEntityId(id),
  title: `Entity ${id}`,
  content: `Content for ${id}`,
  tags: [],
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
  version: 1,
});

const createTestCodeRef = (id: string): CodeRef => ({
  _tag: EntityType.CodeRef,
  id: testEntityId(id),
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
  _tag: EntityType.Story,
  id: testEntityId(id),
  title: `Entity ${id}`,
  content: `Content for ${id}`,
  tags: [],
  status: StoryStatusEnum.Todo,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
  version: 1,
});

const createTestDiagram = (id: string): Diagram => ({
  _tag: EntityType.Diagram,
  id: testEntityId(id),
  title: `Entity ${id}`,
  content: `Content for ${id}`,
  tags: [],
  diagramType: DiagramTypeEnum.Flowchart,
  source: "A -> B",
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
  version: 1,
});

const createTestEntity = (id: string, type: EntityType = EntityType.Doc): Entity => {
  switch (type) {
    case EntityType.Doc:
      return createTestDoc(id);
    case EntityType.CodeRef:
      return createTestCodeRef(id);
    case EntityType.Story:
      return createTestStory(id);
    case EntityType.Diagram:
      return createTestDiagram(id);
  }
};

const createTestTag = (id: string, name: string, parentId?: string): Tag => ({
  id: testTagId(id),
  name,
  parentId,
  createdAt: FIXED_DATE,
});

const createTestLink = (id: string, sourceId: string, targetId: string, type: LinkType): Link => ({
  id: testLinkId(id),
  sourceId: testEntityId(sourceId),
  targetId: testEntityId(targetId),
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
          return yield* new RepositoryError({ message: "Create failed" });
        }
        const tag: Tag = {
          id: testTagId(input.id),
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
          return yield* new TagNotFoundError({ tagId: id });
        }
        return tag;
      }),

    getAll: Effect.sync(() => Array.from(tags.values())),
    getChildren: () => Effect.succeed([]),
    getAncestors: () => Effect.succeed([]),
    update: (id) =>
      Effect.gen(function* () {
        const tag = tags.get(id);
        if (!tag) {
          return yield* new TagNotFoundError({ tagId: id });
        }
        return tag;
      }),
    delete: () => Effect.void,
    applyToEntity: () => Effect.void,
    removeFromEntity: () => Effect.void,
    getTagsForEntity: () => Effect.succeed([]),
    search: () => Effect.succeed([]),
    count: Effect.sync(() => tags.size),
  };
};

const createMockTermRepository = (
  matches: ReadonlyArray<ResolvedTermName> = []
): TermRepository => ({
  create: () => Effect.die(new Error("not implemented")),
  getById: (id) => {
    const match = matches.find(({ term }) => term.id === id);
    return match ? Effect.succeed(match.term) : Effect.fail(new TermNotFoundError({ name: id }));
  },
  getByIds: () => Effect.succeed([]),
  listNamesByTermIds: () => Effect.succeed([]),
  listMergedInto: () => Effect.succeed([]),
  getByCanonicalName: () => Effect.die(new Error("not implemented")),
  findByName: (name) =>
    Effect.succeed(matches.filter(({ termName }) => termName.name === normalizeTermName(name))),
  list: () => Effect.succeed([]),
  addName: () => Effect.die(new Error("not implemented")),
  listNames: (id) =>
    Effect.succeed(matches.filter(({ term }) => term.id === id).map(({ termName }) => termName)),
  updateName: () => Effect.die(new Error("not implemented")),
  update: () => Effect.die(new Error("not implemented")),
  renameCanonical: () => Effect.die(new Error("not implemented")),
});

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
        _tag: EntityType.Doc,
        id: testEntityId(`doc-${Date.now()}`),
        title: input.title,
        content: input.content,
        tags: input.tags ?? [],
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
        version: 1,
      }),
    createCodeRef: (input) =>
      Effect.succeed({
        _tag: EntityType.CodeRef,
        id: testEntityId(`code-${Date.now()}`),
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
        _tag: EntityType.Story,
        id: testEntityId(`story-${Date.now()}`),
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
        _tag: EntityType.Diagram,
        id: testEntityId(`diagram-${Date.now()}`),
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
          return yield* new EntityNotFoundError({ entityId: id });
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
          return yield* new EntityNotFoundError({ entityId: id });
        }
        return entity;
      }),

    delete: () => Effect.void,

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
        id: testLinkId(`link-${Date.now()}`),
        sourceId: input.sourceId,
        targetId: input.targetId,
        type: input.type,
        createdAt: FIXED_DATE,
      }),
    createBidirectional: (input) =>
      Effect.succeed([
        {
          id: testLinkId(`link-${Date.now()}-fwd`),
          sourceId: input.sourceId,
          targetId: input.targetId,
          type: input.type,
          createdAt: FIXED_DATE,
        },
        {
          id: testLinkId(`link-${Date.now()}-rev`),
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
          return yield* new RepositoryError({ message: `Link ${id} not found` });
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
    delete: () => Effect.void,
    deleteAllForEntity: () => Effect.succeed(0),
    deleteBetween: () => Effect.void,
    count: Effect.sync(() => links.size),
  };
};

// ============================================================================
// Test Layer Factory
// ============================================================================

const createTestLayer = (config: {
  tagRepo?: TagRepository;
  entityRepo?: EntityRepository;
  linkRepo?: LinkRepository;
  termRepo?: TermRepository;
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
  const termRepoLayer = Layer.succeed(
    TermRepositoryTag,
    config.termRepo ?? createMockTermRepository()
  );

  const repoLayer = Layer.mergeAll(tagRepoLayer, entityRepoLayer, linkRepoLayer, termRepoLayer);

  return Layer.provideMerge(Layer.merge(TagServiceLive, GraphServiceLive), repoLayer);
};

// ============================================================================
// TagService Tests
// ============================================================================

describe("TagService", () => {
  describe("ensureHierarchy()", () => {
    it("reuses a single stable tag when an attachment uses a governed term name", async () => {
      const term: Term = {
        id: testTermId("term-brand-aerograph"),
        canonicalName: "AeroGraph",
        kind: "brand",
        status: "active",
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      };
      const termName: TermName = {
        termId: term.id,
        kind: term.kind,
        name: "aerograph",
        displayName: "AeroGraph",
        nameKind: "canonical",
        createdAt: FIXED_DATE,
      };
      const tags = new Map<string, Tag>([
        [
          "kioku",
          {
            id: testTagId("kioku"),
            name: "AeroGraph",
            termId: term.id,
            createdAt: FIXED_DATE,
          },
        ],
      ]);
      const layer = createTestLayer({
        tagRepo: createMockTagRepository({ tags }),
        termRepo: createMockTermRepository([{ term, termName }]),
      });

      const result = await Effect.runPromise(
        Effect.provide(
          Effect.gen(function* () {
            const tagService = yield* TagServiceTag;
            return yield* tagService.ensureHierarchy("AeroGraph");
          }),
          layer
        )
      );

      expect(result.id).toBe("kioku");
      expect(tags.has("AeroGraph")).toBe(false);
    });

    it("resolves slash-bearing governed names before applying hierarchy semantics", async () => {
      const term: Term = {
        id: testTermId("term-feature-editor-indexer"),
        canonicalName: "editor/indexer",
        kind: "feature",
        status: "active",
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      };
      const termName: TermName = {
        termId: term.id,
        kind: term.kind,
        name: "editor/indexer",
        displayName: "editor/indexer",
        nameKind: "canonical",
        createdAt: FIXED_DATE,
      };
      const tags = new Map<string, Tag>([
        [
          "editor-indexer",
          {
            id: testTagId("editor-indexer"),
            name: "editor/indexer",
            termId: term.id,
            createdAt: FIXED_DATE,
          },
        ],
      ]);
      const layer = createTestLayer({
        tagRepo: createMockTagRepository({ tags }),
        termRepo: createMockTermRepository([{ term, termName }]),
      });

      const result = await Effect.runPromise(
        Effect.provide(
          Effect.gen(function* () {
            const tagService = yield* TagServiceTag;
            return yield* tagService.ensureHierarchy("editor/indexer");
          }),
          layer
        )
      );

      expect(result.id).toBe("editor-indexer");
      expect(tags.has("editor")).toBe(false);
    });

    it("rejects governed attachment names with multiple possible physical tags", async () => {
      const term: Term = {
        id: testTermId("term-concept-auth"),
        canonicalName: "Authentication",
        kind: "concept",
        status: "active",
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      };
      const termName: TermName = {
        termId: term.id,
        kind: term.kind,
        name: "authentication",
        displayName: "Authentication",
        nameKind: "canonical",
        createdAt: FIXED_DATE,
      };
      const tags = new Map<string, Tag>([
        ["auth", { id: testTagId("auth"), name: "Auth", termId: term.id, createdAt: FIXED_DATE }],
        [
          "login",
          { id: testTagId("login"), name: "Login", termId: term.id, createdAt: FIXED_DATE },
        ],
      ]);
      const layer = createTestLayer({
        tagRepo: createMockTagRepository({ tags }),
        termRepo: createMockTermRepository([{ term, termName }]),
      });

      const error = await Effect.runPromise(
        Effect.flip(
          Effect.provide(
            Effect.gen(function* () {
              const tagService = yield* TagServiceTag;
              return yield* tagService.ensureHierarchy("Authentication");
            }),
            layer
          )
        )
      );

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toContain("multiple attachment tags");
    });

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

    it("tolerates concurrent creation races when ensuring a hierarchy", async () => {
      const tags = new Map<string, Tag>();
      const baseTagRepo = createMockTagRepository({ tags });
      const tagRepo: TagRepository = {
        ...baseTagRepo,
        create: (input) =>
          Effect.gen(function* () {
            tags.set(input.id, createTestTag(input.id, input.name, input.parentId));
            return yield* new RepositoryError({ message: "Tag was created concurrently" });
          }),
      };
      const layer = createTestLayer({ tagRepo });

      const program = Effect.gen(function* () {
        const tagService = yield* TagServiceTag;
        return yield* tagService.ensureHierarchy("concurrency");
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      expect(result.id).toBe("concurrency");
      expect(result.name).toBe("concurrency");
      expect(tags.size).toBe(1);
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
        expect(exit.cause.reasons.some(Cause.isFailReason)).toBe(true);
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
        return yield* graphService.getEntityWithLinks(testEntityId("e1"));
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      expect(result.entity.id).toBe("e1");
      expect(result.outgoingLinks).toHaveLength(1);
      // biome-ignore lint/style/noNonNullAssertion: Assertions narrow but type checker cant infer
      expect(result.outgoingLinks[0]!.targetId).toBe("e2");
      expect(result.incomingLinks).toHaveLength(1);
      // biome-ignore lint/style/noNonNullAssertion: Assertions narrow but type checker cant infer
      expect(result.incomingLinks[0]!.sourceId).toBe("e3");
    });

    it("returns EntityNotFoundError for missing entity", async () => {
      const layer = createTestLayer({
        entityRepo: createMockEntityRepository({ entities: new Map() }),
      });

      const program = Effect.gen(function* () {
        const graphService = yield* GraphServiceTag;
        return yield* graphService.getEntityWithLinks(testEntityId("nonexistent"));
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
        return yield* graphService.getRelatedEntities(testEntityId("center"));
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
        return yield* graphService.getRelatedEntities(testEntityId("center"), ["references"]);
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      expect(result).toHaveLength(1);
      // biome-ignore lint/style/noNonNullAssertion: Assertions narrow but type checker cant infer
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
        return yield* graphService.getRelatedEntities(testEntityId("isolated"));
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
        return yield* graphService.traverse(testEntityId("e1"), 2); // Only go 2 hops
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
        return yield* graphService.traverse(testEntityId("e1"), 10); // High depth to test cycle handling
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
        return yield* graphService.traverse(testEntityId("isolated"), 5);
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
      // biome-ignore lint/style/noNonNullAssertion: Assertions narrow but type checker cant infer
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
      // biome-ignore lint/style/noNonNullAssertion: Assertions narrow but type checker cant infer
      expect(result[0]!.id).toBe("e2");
    });
  });

  describe("findByTagGroups()", () => {
    it("unions tags within groups and intersects separate groups", async () => {
      const entities = new Map<string, Entity>();
      entities.set("e1", createTestEntity("e1"));
      entities.set("e2", createTestEntity("e2"));
      entities.set("e3", createTestEntity("e3"));

      const taggedEntities = new Map<string, Set<string>>();
      taggedEntities.set("legacy-auth", new Set(["e1"]));
      taggedEntities.set("current-auth", new Set(["e2", "e3"]));
      taggedEntities.set("middleware", new Set(["e2"]));

      const layer = createTestLayer({
        entityRepo: createMockEntityRepository({ entities, taggedEntities }),
      });
      const program = Effect.gen(function* () {
        const graphService = yield* GraphServiceTag;
        return yield* graphService.findByTagGroups([
          ["legacy-auth", "current-auth"],
          ["middleware"],
        ]);
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      expect(result.map(({ id }) => id)).toEqual(["e2"]);
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
        return yield* graphService.findPath(testEntityId("source"), testEntityId("target"));
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      expect(result).not.toBeNull();
      expect(result).toHaveLength(2);
      // biome-ignore lint/style/noNonNullAssertion: Assertions narrow but type checker cant infer
      expect(result![0]?.id).toBe("source");
      // biome-ignore lint/style/noNonNullAssertion: Assertions narrow but type checker cant infer
      expect(result![1]?.id).toBe("target");
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
        return yield* graphService.findPath(testEntityId("source"), testEntityId("target"));
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      expect(result).not.toBeNull();
      // BFS finds shortest path: source -> a -> target (3 entities)
      expect(result).toHaveLength(3);

      // biome-ignore lint/style/noNonNullAssertion: Assertions narrow but type checker cant infer
      expect(result![0]?.id).toBe("source");
      // biome-ignore lint/style/noNonNullAssertion: Assertions narrow but type checker cant infer
      expect(result![2]?.id).toBe("target");
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
        return yield* graphService.findPath(testEntityId("island1"), testEntityId("island2"));
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      expect(result).toBeNull();
    });
  });

  describe("getStats()", () => {
    it("returns correct totals and entity-type breakdown", async () => {
      const entities = new Map<string, Entity>();
      entities.set("doc1", createTestEntity("doc1", EntityType.Doc));
      entities.set("doc2", createTestEntity("doc2", EntityType.Doc));
      entities.set("code1", createTestEntity("code1", EntityType.CodeRef));
      entities.set("story1", createTestEntity("story1", EntityType.Story));

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
        return yield* graphService.getStats;
      });

      const result = await Effect.runPromise(Effect.provide(program, layer));

      expect(result.totalEntities).toBe(4);
      expect(result.totalTags).toBe(2);
      expect(result.totalLinks).toBe(1);
      expect(result.entitiesByType[EntityType.Doc]).toBe(2);
      expect(result.entitiesByType[EntityType.CodeRef]).toBe(1);
      expect(result.entitiesByType[EntityType.Story]).toBe(1);
      expect(result.entitiesByType[EntityType.Diagram]).toBe(0);
    });
  });
});
