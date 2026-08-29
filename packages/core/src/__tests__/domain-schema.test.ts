import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { DiagramTypeEnum, EntityType, PriorityEnum, StoryStatusEnum } from "../domain/entity";
import {
  CodeRefSchema,
  CreateTagInput,
  DiagramSchema,
  DocSchema,
  EntitySchema,
  getInverseLinkType,
  LinkType,
  StorySchema,
  Tag,
  UpdateTagInput,
} from "../domain/index";
import { ChangeType, EntityVersion } from "../domain/version";
import {
  ConfigError,
  DatabaseError,
  EntityNotFoundError,
  LinkNotFoundError,
  MigrationError,
  RepositoryError,
  TagNotFoundError,
  ValidationError,
  VersionNotFoundError,
  WorkspaceAlreadyExistsError,
  WorkspaceNotFoundError,
} from "../errors";
import { FIXED_TIMESTAMP_ISO } from "./helpers/index";

const FIXED_DATE_ISO = FIXED_TIMESTAMP_ISO;

const decodeSync = <S extends Schema.ConstraintDecoder<Schema.Schema.Type<S>>>(
  schema: S,
  input: S["Encoded"]
): S["Type"] => Schema.decodeSync(schema)(input);

describe("domain schema unit tests", () => {
  describe("entity.ts", () => {
    it("decodes a valid doc entity", () => {
      const result = decodeSync(DocSchema, {
        id: "entity-0001",
        _tag: EntityType.Doc,
        title: "Architecture Overview",
        content: "System design notes",
        tags: ["architecture", "docs"],
        createdAt: FIXED_DATE_ISO,
        updatedAt: FIXED_DATE_ISO,
        version: 1,
      });

      expect(result.id).toBe("entity-0001");
      expect(result._tag).toBe(EntityType.Doc);
      expect(result.title).toBe("Architecture Overview");
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it("decodes a valid code_ref entity", () => {
      const result = decodeSync(CodeRefSchema, {
        id: "entity-0002",
        _tag: EntityType.CodeRef,
        title: "Graph service traversal",
        content: "Traversal implementation reference",
        tags: ["service"],
        createdAt: FIXED_DATE_ISO,
        updatedAt: FIXED_DATE_ISO,
        version: 2,
        repoPath: "packages/core",
        filePath: "src/services/graph-service.ts",
        startLine: 10,
        endLine: 42,
        commitHash: "abc123",
      });

      expect(result.id).toBe("entity-0002");
      expect(result._tag).toBe(EntityType.CodeRef);
      expect(result.filePath).toBe("src/services/graph-service.ts");
      expect(result.startLine).toBe(10);
      expect(result.endLine).toBe(42);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it("decodes a valid story entity", () => {
      const result = decodeSync(StorySchema, {
        id: "entity-0003",
        title: "Implement graph traversal",
        _tag: EntityType.Story,
        content: "Add BFS traversal support",
        tags: ["story"],
        createdAt: FIXED_DATE_ISO,
        updatedAt: FIXED_DATE_ISO,
        version: 1,
        status: StoryStatusEnum.InProgress,
        priority: PriorityEnum.High,
        parentId: "story-epic-1",
      });

      expect(result.id).toBe("entity-0003");
      expect(result._tag).toBe(EntityType.Story);
      expect(result.status).toBe("in_progress");
      expect(result.priority).toBe("high");
      expect(result.parentId).toBe("story-epic-1");
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it("decodes a valid diagram entity", () => {
      const result = decodeSync(DiagramSchema, {
        id: "entity-0004",
        _tag: EntityType.Diagram,
        title: "Entity relationship diagram",
        content: "ERD for graph storage",
        tags: ["diagram"],
        createdAt: FIXED_DATE_ISO,
        updatedAt: FIXED_DATE_ISO,
        version: 3,
        diagramType: DiagramTypeEnum.Erd,
        source: "entity -> link -> tag",
        generatedFrom: ["entity-0001", "entity-0002"],
      });

      expect(result.id).toBe("entity-0004");
      expect(result._tag).toBe(EntityType.Diagram);
      expect(result.diagramType).toBe("erd");
      expect(result.generatedFrom).toEqual(["entity-0001", "entity-0002"]);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it("decodes all supported entity variants through the union", () => {
      const variants: ReadonlyArray<Schema.Codec.Encoded<typeof EntitySchema>> = [
        {
          id: "entity-doc",
          _tag: EntityType.Doc,
          title: "Doc",
          content: "Content",
          tags: [],
          createdAt: FIXED_DATE_ISO,
          updatedAt: FIXED_DATE_ISO,
          version: 1,
        },
        {
          id: "entity-code",
          _tag: "code_ref",
          title: "Code Ref",
          content: "Content",
          tags: [],
          createdAt: FIXED_DATE_ISO,
          updatedAt: FIXED_DATE_ISO,
          version: 1,
          repoPath: "packages/core",
          filePath: "src/domain/entity.ts",
        },
        {
          id: "entity-story",
          _tag: "story",
          title: "Story",
          content: "Content",
          tags: [],
          createdAt: FIXED_DATE_ISO,
          updatedAt: FIXED_DATE_ISO,
          version: 1,
          status: StoryStatusEnum.Todo,
        },
        {
          id: "entity-diagram",
          _tag: "diagram",
          title: "Diagram",
          content: "Content",
          tags: [],
          createdAt: FIXED_DATE_ISO,
          updatedAt: FIXED_DATE_ISO,
          version: 1,
          diagramType: DiagramTypeEnum.Flowchart,
          source: "A -> B",
        },
      ];

      const decoded = variants.map((variant) => decodeSync(EntitySchema, variant));

      expect(decoded.map((entity) => entity._tag)).toEqual(["doc", "code_ref", "story", "diagram"]);
    });

    it("rejects invalid entity shapes", () => {
      expect(() =>
        Schema.decodeUnknownSync(DocSchema)({
          id: "entity-invalid",
          title: "",
          content: "Missing non-empty title",
          tags: [],
          createdAt: FIXED_DATE_ISO,
          updatedAt: FIXED_DATE_ISO,
          version: 1,
        })
      ).toThrow();

      expect(() =>
        Schema.decodeUnknownSync(CodeRefSchema)({
          id: "entity-invalid",
          title: "Broken code ref",
          content: "Missing filePath",
          tags: [],
          createdAt: FIXED_DATE_ISO,
          updatedAt: FIXED_DATE_ISO,
          version: 1,
          repoPath: "packages/core",
          filePath: "",
        })
      ).toThrow();

      expect(() =>
        Schema.decodeUnknownSync(StorySchema)({
          id: "entity-invalid",
          title: "Broken story",
          content: "Invalid status",
          tags: [],
          createdAt: FIXED_DATE_ISO,
          updatedAt: FIXED_DATE_ISO,
          version: 1,
          status: "shipped",
        })
      ).toThrow();

      expect(() =>
        Schema.decodeUnknownSync(DiagramSchema)({
          id: "entity-invalid",
          title: "Broken diagram",
          content: "Invalid type",
          tags: [],
          createdAt: FIXED_DATE_ISO,
          updatedAt: FIXED_DATE_ISO,
          version: 1,
          diagramType: "uml",
          source: "A -> B",
        })
      ).toThrow();
    });
  });

  describe("tag.ts", () => {
    it("accepts optional fields when present or omitted", () => {
      const tag = decodeSync(Tag, {
        id: "tag-0001",
        name: "architecture",
        createdAt: FIXED_DATE_ISO,
      });

      const createInput = decodeSync(CreateTagInput, {
        id: "tag-0002",
        name: "backend",
        description: "Backend systems",
        parentId: "tag-0001",
        aliases: ["server", "api"],
      });

      const updateInput = decodeSync(UpdateTagInput, {
        name: "platform",
        description: "Platform concerns",
        parentId: "tag-root",
        aliases: ["infra"],
      });

      expect(tag.id).toBe("tag-0001");
      expect(tag.createdAt).toBeInstanceOf(Date);
      expect(tag.description).toBeUndefined();
      expect(tag.aliases).toBeUndefined();
      expect(createInput.aliases).toEqual(["server", "api"]);
      expect(updateInput.parentId).toBe("tag-root");
    });

    it("rejects invalid tag inputs", () => {
      expect(() =>
        decodeSync(Tag, {
          id: "tag-0001",
          name: "",
          createdAt: FIXED_DATE_ISO,
        })
      ).toThrow();

      expect(() =>
        decodeSync(CreateTagInput, {
          id: "",
          name: "valid-name",
        })
      ).toThrow();

      expect(() =>
        decodeSync(UpdateTagInput, {
          name: "",
        })
      ).toThrow();
    });
  });

  describe("link.ts", () => {
    it("accepts all link types and returns correct inverse mappings", async () => {
      const validTypes = [
        "references",
        "parent_of",
        "child_of",
        "blocks",
        "blocked_by",
        "related_to",
      ] as const;

      for (const type of validTypes) {
        const decoded = decodeSync(LinkType, type);
        expect(decoded).toBe(type);
      }

      expect(getInverseLinkType("references")).toBe("references");
      expect(getInverseLinkType("related_to")).toBe("related_to");
      expect(getInverseLinkType("parent_of")).toBe("child_of");
      expect(getInverseLinkType("child_of")).toBe("parent_of");
      expect(getInverseLinkType("blocks")).toBe("blocked_by");
      expect(getInverseLinkType("blocked_by")).toBe("blocks");
    });

    it("rejects invalid link types", () => {
      expect(() => Schema.decodeUnknownSync(LinkType)("depends_on")).toThrow();
    });
  });

  describe("version.ts", () => {
    it("validates version schema and change types", () => {
      const version = decodeSync(EntityVersion, {
        id: "version-0001",
        entityId: "entity-0001",
        version: 1,
        data: { title: "Snapshot" },
        changeType: "update",
        changedFields: ["title", "content"],
        createdAt: FIXED_DATE_ISO,
        authorId: "user-123",
      });

      expect(version.id).toBe("version-0001");
      expect(version.version).toBe(1);
      expect(version.changeType).toBe("update");
      expect(version.changedFields).toEqual(["title", "content"]);
      expect(version.createdAt).toBeInstanceOf(Date);

      expect(decodeSync(ChangeType, "create")).toBe("create");
      expect(decodeSync(ChangeType, "update")).toBe("update");
      expect(decodeSync(ChangeType, "delete")).toBe("delete");
    });

    it("rejects invalid version edge cases", () => {
      expect(() =>
        decodeSync(EntityVersion, {
          id: "version-0002",
          entityId: "entity-0001",
          version: 0,
          data: {},
          changeType: "create",
          createdAt: FIXED_DATE_ISO,
        })
      ).toThrow();

      expect(() => Schema.decodeUnknownSync(ChangeType)("restore")).toThrow();
    });
  });

  describe("errors.ts", () => {
    it("constructs tagged errors with consistent shape", () => {
      const repositoryError = new RepositoryError({
        message: "Repository failed",
        cause: new Error("disk"),
      });
      const validationError = new ValidationError({
        message: "Invalid field",
        field: "title",
      });
      const entityNotFoundError = new EntityNotFoundError({
        entityId: "entity-404",
        message: "Missing entity",
      });
      const tagNotFoundError = new TagNotFoundError({
        tagId: "tag-404",
      });
      const linkNotFoundError = new LinkNotFoundError({
        linkId: "link-404",
      });
      const versionNotFoundError = new VersionNotFoundError({
        entityId: "entity-0001",
        version: 7,
      });
      const configError = new ConfigError({
        message: "Missing config",
        path: "/tmp/aerograph.json",
      });
      const workspaceNotFoundError = new WorkspaceNotFoundError({
        path: "/workspace/aerograph",
      });
      const workspaceAlreadyExistsError = new WorkspaceAlreadyExistsError({
        path: "/workspace/aerograph",
      });
      const databaseError = new DatabaseError({
        message: "SQLite failure",
      });
      const migrationError = new MigrationError({
        message: "Migration failed",
        version: 2,
      });

      expect(repositoryError._tag).toBe("RepositoryError");
      expect(repositoryError.message).toBe("Repository failed");

      expect(validationError._tag).toBe("ValidationError");
      expect(validationError.field).toBe("title");

      expect(entityNotFoundError._tag).toBe("EntityNotFoundError");
      expect(entityNotFoundError.entityId).toBe("entity-404");

      expect(tagNotFoundError._tag).toBe("TagNotFoundError");
      expect(tagNotFoundError.tagId).toBe("tag-404");

      expect(linkNotFoundError._tag).toBe("LinkNotFoundError");
      expect(linkNotFoundError.linkId).toBe("link-404");

      expect(versionNotFoundError._tag).toBe("VersionNotFoundError");
      expect(versionNotFoundError.version).toBe(7);

      expect(configError._tag).toBe("ConfigError");
      expect(configError.path).toBe("/tmp/aerograph.json");

      expect(workspaceNotFoundError._tag).toBe("WorkspaceNotFoundError");
      expect(workspaceNotFoundError.path).toBe("/workspace/aerograph");

      expect(workspaceAlreadyExistsError._tag).toBe("WorkspaceAlreadyExistsError");
      expect(workspaceAlreadyExistsError.path).toBe("/workspace/aerograph");

      expect(databaseError._tag).toBe("DatabaseError");
      expect(databaseError.message).toBe("SQLite failure");

      expect(migrationError._tag).toBe("MigrationError");
      expect(migrationError.version).toBe(2);
    });
  });
});
