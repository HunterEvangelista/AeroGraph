import type { SQLQueryBindings } from "bun:sqlite";
import {
  type CodeRef,
  CodeRefSchema,
  type CreateCodeRefInput,
  type CreateDiagramInput,
  type CreateDocInput,
  type CreateStoryInput,
  type Diagram,
  DiagramSchema,
  type Doc,
  DocSchema,
  type Entity,
  type EntityId,
  EntityNotFoundError,
  type EntityRepository,
  EntityRepositoryTag,
  EntityType,
  RepositoryError,
  type Story,
  StorySchema,
  StoryStatusEnum,
} from "@aerograph/core";
import { desc, count as drizzleCount, eq, inArray, sql } from "drizzle-orm";
import { Effect, Layer, Schema } from "effect";
import { rebuildEntityIdPrefixes } from "./entity-prefix-index";
import { entities, entityTags } from "./schema";
import { DatabaseSessionTag, RootDatabaseSessionLive } from "./session";

// ============================================================================
// Helper Functions
// ============================================================================

const generateId = (): string => crypto.randomUUID();

const now = (): string => new Date().toISOString();

interface EntityRow {
  id: string;
  type: "doc" | "code_ref" | "story" | "diagram";
  title: string;
  content: string | null;
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

interface RawEntityRow {
  id: string;
  type: "doc" | "code_ref" | "story" | "diagram";
  title: string;
  content: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

const rawRowToEntityRow = (row: RawEntityRow): EntityRow => ({
  id: row.id,
  type: row.type,
  title: row.title,
  content: row.content,
  metadata: row.metadata,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  version: row.version,
});

const EntityMetadataSchema = Schema.Record(Schema.String, Schema.Unknown);

const parseMetadata = (value: string | null) =>
  Schema.decodeUnknownSync(EntityMetadataSchema)(value === null ? {} : JSON.parse(value));

const rowToEntity = (row: EntityRow): Entity => {
  const metadata = parseMetadata(row.metadata);
  const base = {
    id: row.id,
    title: row.title,
    content: row.content ?? "",
    tags: [], // Tags are loaded separately
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };

  switch (row.type) {
    case "doc":
      return Schema.decodeUnknownSync(DocSchema)({ ...base, _tag: EntityType.Doc });
    case "code_ref":
      return Schema.decodeUnknownSync(CodeRefSchema)({
        ...base,
        _tag: EntityType.CodeRef,
        repoPath: metadata["repoPath"] ?? "",
        filePath: metadata["filePath"] ?? "",
        startLine: metadata["startLine"],
        endLine: metadata["endLine"],
        commitHash: metadata["commitHash"],
        symbol: metadata["symbol"],
      });
    case "story":
      return Schema.decodeUnknownSync(StorySchema)({
        ...base,
        _tag: EntityType.Story,
        status: metadata["status"] ?? StoryStatusEnum.Backlog,
        priority: metadata["priority"],
        parentId: metadata["parentId"],
      });
    case "diagram":
      return Schema.decodeUnknownSync(DiagramSchema)({
        ...base,
        _tag: EntityType.Diagram,
        diagramType: metadata["diagramType"] ?? "other",
        source: metadata["source"] ?? "",
        generatedFrom: metadata["generatedFrom"],
      });
  }
};

const mergeDocMetadata = (_existing: Doc, _updates: Partial<Entity>): string | null => null;

const mergeCodeRefMetadata = (existing: CodeRef, updates: Partial<Entity>): string =>
  JSON.stringify({
    repoPath: "repoPath" in updates ? (updates.repoPath ?? existing.repoPath) : existing.repoPath,
    filePath: "filePath" in updates ? (updates.filePath ?? existing.filePath) : existing.filePath,
    startLine:
      "startLine" in updates ? (updates.startLine ?? existing.startLine) : existing.startLine,
    endLine: "endLine" in updates ? (updates.endLine ?? existing.endLine) : existing.endLine,
    commitHash:
      "commitHash" in updates ? (updates.commitHash ?? existing.commitHash) : existing.commitHash,
    symbol: "symbol" in updates ? (updates.symbol ?? existing.symbol) : existing.symbol,
  });

const mergeStoryMetadata = (existing: Story, updates: Partial<Entity>): string =>
  JSON.stringify({
    status: "status" in updates ? (updates.status ?? existing.status) : existing.status,
    priority: "priority" in updates ? (updates.priority ?? existing.priority) : existing.priority,
    parentId: "parentId" in updates ? (updates.parentId ?? existing.parentId) : existing.parentId,
  });

const mergeDiagramMetadata = (existing: Diagram, updates: Partial<Entity>): string =>
  JSON.stringify({
    diagramType:
      "diagramType" in updates
        ? (updates.diagramType ?? existing.diagramType)
        : existing.diagramType,
    source: "source" in updates ? (updates.source ?? existing.source) : existing.source,
    generatedFrom:
      "generatedFrom" in updates
        ? (updates.generatedFrom ?? existing.generatedFrom)
        : existing.generatedFrom,
  });

const mergeEntityMetadata = (existing: Entity, updates: Partial<Entity>): string | null => {
  switch (existing._tag) {
    case EntityType.Doc:
      return mergeDocMetadata(existing, updates);
    case EntityType.CodeRef:
      return mergeCodeRefMetadata(existing, updates);
    case EntityType.Story:
      return mergeStoryMetadata(existing, updates);
    case EntityType.Diagram:
      return mergeDiagramMetadata(existing, updates);
  }
};

// ============================================================================
// Repository Implementation
// ============================================================================

export const SqliteEntityRepositorySessionLive = Layer.effect(
  EntityRepositoryTag,
  Effect.gen(function* () {
    const { db, drizzle, transaction, write } = yield* DatabaseSessionTag;

    const searchFts = db.prepare<RawEntityRow, SQLQueryBindings[]>(`
      SELECT e.* FROM entities e
      JOIN entities_fts fts ON e.rowid = fts.rowid
      WHERE entities_fts MATCH ?
      ORDER BY rank
      LIMIT 50
    `);

    const createDoc = (input: CreateDocInput) =>
      Effect.try({
        try: () => {
          const id = generateId();
          const timestamp = now();
          write(() =>
            drizzle
              .insert(entities)
              .values({
                id,
                type: EntityType.Doc,
                title: input.title,
                content: input.content,
                metadata: null,
                createdAt: timestamp,
                updatedAt: timestamp,
              })
              .run()
          );
          const row = drizzle.select().from(entities).where(eq(entities.id, id)).get();
          if (!row) throw new Error(`Inserted entity not found: ${id}`);
          rebuildEntityIdPrefixes(drizzle, undefined, transaction);
          const entity = rowToEntity(row);
          if (entity._tag !== EntityType.Doc)
            throw new Error("Inserted entity has an unexpected type");
          return entity;
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to create doc: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const createCodeRef = (input: CreateCodeRefInput) =>
      Effect.try({
        try: () => {
          const id = generateId();
          const timestamp = now();
          const metadata = JSON.stringify({
            repoPath: input.repoPath,
            filePath: input.filePath,
            startLine: input.startLine,
            endLine: input.endLine,
            commitHash: input.commitHash,
            symbol: input.symbol,
          });
          write(() =>
            drizzle
              .insert(entities)
              .values({
                id,
                type: EntityType.CodeRef,
                title: input.title,
                content: input.content,
                metadata,
                createdAt: timestamp,
                updatedAt: timestamp,
              })
              .run()
          );
          const row = drizzle.select().from(entities).where(eq(entities.id, id)).get();
          if (!row) throw new Error(`Inserted entity not found: ${id}`);
          rebuildEntityIdPrefixes(drizzle, undefined, transaction);
          const entity = rowToEntity(row);
          if (entity._tag !== EntityType.CodeRef)
            throw new Error("Inserted entity has an unexpected type");
          return entity;
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to create code ref: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const createStory = (input: CreateStoryInput) =>
      Effect.try({
        try: () => {
          const id = generateId();
          const timestamp = now();
          const metadata = JSON.stringify({
            status: input.status ?? "backlog",
            priority: input.priority,
            parentId: input.parentId,
          });
          write(() =>
            drizzle
              .insert(entities)
              .values({
                id,
                type: EntityType.Story,
                title: input.title,
                content: input.content,
                metadata,
                createdAt: timestamp,
                updatedAt: timestamp,
              })
              .run()
          );
          const row = drizzle.select().from(entities).where(eq(entities.id, id)).get();
          if (!row) throw new Error(`Inserted entity not found: ${id}`);
          rebuildEntityIdPrefixes(drizzle, undefined, transaction);
          const entity = rowToEntity(row);
          if (entity._tag !== EntityType.Story)
            throw new Error("Inserted entity has an unexpected type");
          return entity;
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to create story: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const createDiagram = (input: CreateDiagramInput) =>
      Effect.try({
        try: () => {
          const id = generateId();
          const timestamp = now();
          const metadata = JSON.stringify({
            diagramType: input.diagramType,
            source: input.source,
            generatedFrom: input.generatedFrom,
          });
          write(() =>
            drizzle
              .insert(entities)
              .values({
                id,
                type: EntityType.Diagram,
                title: input.title,
                content: input.content,
                metadata,
                createdAt: timestamp,
                updatedAt: timestamp,
              })
              .run()
          );
          const row = drizzle.select().from(entities).where(eq(entities.id, id)).get();
          if (!row) throw new Error(`Inserted entity not found: ${id}`);
          rebuildEntityIdPrefixes(drizzle, undefined, transaction);
          const entity = rowToEntity(row);
          if (entity._tag !== EntityType.Diagram)
            throw new Error("Inserted entity has an unexpected type");
          return entity;
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to create diagram: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const getById = (id: EntityId) =>
      Effect.gen(function* () {
        const row = yield* Effect.try({
          try: () => drizzle.select().from(entities).where(eq(entities.id, id)).get(),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to get entity: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        if (!row) {
          return yield* new EntityNotFoundError({ entityId: id });
        }

        return rowToEntity(row);
      });

    const getAll = (type?: EntityType) =>
      Effect.try({
        try: () => {
          const rows = type
            ? drizzle
                .select()
                .from(entities)
                .where(eq(entities.type, type))
                .orderBy(desc(entities.updatedAt))
                .all()
            : drizzle.select().from(entities).orderBy(desc(entities.updatedAt)).all();
          return rows.map(rowToEntity);
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to get entities: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const getByTag = (tagId: string) =>
      Effect.try({
        try: () => {
          const rows = drizzle
            .select({
              id: entities.id,
              type: entities.type,
              title: entities.title,
              content: entities.content,
              metadata: entities.metadata,
              createdAt: entities.createdAt,
              updatedAt: entities.updatedAt,
              version: entities.version,
            })
            .from(entities)
            .innerJoin(entityTags, eq(entities.id, entityTags.entityId))
            .where(eq(entityTags.tagId, tagId))
            .orderBy(desc(entities.updatedAt))
            .all();
          return rows.map(rowToEntity);
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to get entities by tag: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const getByTags = (tagIds: ReadonlyArray<string>) =>
      Effect.try({
        try: () => {
          if (tagIds.length === 0) return [];

          const rows = drizzle
            .select({
              id: entities.id,
              type: entities.type,
              title: entities.title,
              content: entities.content,
              metadata: entities.metadata,
              createdAt: entities.createdAt,
              updatedAt: entities.updatedAt,
              version: entities.version,
            })
            .from(entities)
            .innerJoin(entityTags, eq(entities.id, entityTags.entityId))
            .where(inArray(entityTags.tagId, [...tagIds]))
            .groupBy(entities.id)
            .having(sql`count(distinct ${entityTags.tagId}) = ${tagIds.length}`)
            .orderBy(desc(entities.updatedAt))
            .all();
          return rows.map(rowToEntity);
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to get entities by tags: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const update = (id: EntityId, updates: Partial<Entity>) =>
      Effect.gen(function* () {
        const existing = yield* getById(id);

        const newTitle = updates.title ?? existing.title;
        const newContent = updates.content ?? existing.content;

        const newMetadata = mergeEntityMetadata(existing, updates);

        yield* Effect.try({
          try: () =>
            write(() =>
              drizzle
                .update(entities)
                .set({
                  title: newTitle,
                  content: newContent,
                  metadata: newMetadata,
                  updatedAt: now(),
                  version: sql`${entities.version} + 1`,
                })
                .where(eq(entities.id, id))
                .run()
            ),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to update entity: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });

        return yield* getById(id);
      });

    const deleteById = (id: EntityId) =>
      Effect.gen(function* () {
        // Check exists first
        yield* getById(id);

        yield* Effect.try({
          try: () => {
            write(() => drizzle.delete(entities).where(eq(entities.id, id)).run());
            rebuildEntityIdPrefixes(drizzle, undefined, transaction);
          },
          catch: (error) =>
            new RepositoryError({
              message: `Failed to delete entity: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });
      });

    const count = (type?: EntityType) =>
      Effect.try({
        try: () => {
          const result = type
            ? drizzle
                .select({ count: drizzleCount() })
                .from(entities)
                .where(eq(entities.type, type))
                .get()
            : drizzle.select({ count: drizzleCount() }).from(entities).get();
          return result?.count ?? 0;
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to count entities: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    const search = (query: string) =>
      Effect.try({
        try: () => {
          // Escape special FTS characters and add prefix matching
          const sanitized = query.replace(/['"]/g, "").trim();
          if (!sanitized) return [];

          const rows = searchFts.all(`${sanitized}*`);
          return rows.map((row) => rowToEntity(rawRowToEntityRow(row)));
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to search entities: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

    return {
      createDoc,
      createCodeRef,
      createStory,
      createDiagram,
      getById,
      getAll,
      getByTag,
      getByTags,
      update,
      delete: deleteById,
      count,
      search,
    } satisfies EntityRepository;
  })
);

export const SqliteEntityRepositoryLive = SqliteEntityRepositorySessionLive.pipe(
  Layer.provide(RootDatabaseSessionLive)
);
