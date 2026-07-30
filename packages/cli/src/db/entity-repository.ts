import {
  type CodeRef,
  type CreateCodeRefInput,
  type CreateDiagramInput,
  type CreateDocInput,
  type CreateStoryInput,
  type Diagram,
  type Doc,
  type Entity,
  type EntityId,
  EntityNotFoundError,
  type EntityRepository,
  EntityRepositoryTag,
  EntityType,
  RepositoryError,
  type Story,
  StoryStatusEnum,
} from "@kioku/core";
import { desc, count as drizzleCount, eq, inArray, sql } from "drizzle-orm";
import { Effect, Layer } from "effect";
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

const rowToEntity = (row: EntityRow): Entity => {
  const metadata = row.metadata ? JSON.parse(row.metadata) : {};
  const base = {
    id: row.id as EntityId,
    title: row.title,
    content: row.content ?? "",
    tags: [], // Tags are loaded separately
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    version: row.version,
  };

  switch (row.type) {
    case "doc":
      return { ...base, _tag: EntityType.Doc } as Doc;
    case "code_ref":
      return {
        ...base,
        _tag: EntityType.CodeRef,
        repoPath: metadata.repoPath ?? "",
        filePath: metadata.filePath ?? "",
        startLine: metadata.startLine,
        endLine: metadata.endLine,
        commitHash: metadata.commitHash,
        symbol: metadata.symbol,
      } as CodeRef;
    case "story":
      return {
        ...base,
        _tag: EntityType.Story,
        status: metadata.status ?? StoryStatusEnum.Backlog,
        priority: metadata.priority,
        parentId: metadata.parentId,
      } as Story;
    case "diagram":
      return {
        ...base,
        _tag: EntityType.Diagram,
        diagramType: metadata.diagramType ?? "other",
        source: metadata.source ?? "",
        generatedFrom: metadata.generatedFrom,
      } as Diagram;
    default:
      throw new Error(`Unknown entity type: ${row.type}`);
  }
};

const mergeDocMetadata = (_existing: Doc, _updates: Partial<Doc>): string | null => null;

const mergeCodeRefMetadata = (existing: CodeRef, updates: Partial<CodeRef>): string =>
  JSON.stringify({
    repoPath: updates.repoPath ?? existing.repoPath,
    filePath: updates.filePath ?? existing.filePath,
    startLine: updates.startLine ?? existing.startLine,
    endLine: updates.endLine ?? existing.endLine,
    commitHash: updates.commitHash ?? existing.commitHash,
    symbol: updates.symbol ?? existing.symbol,
  });

const mergeStoryMetadata = (existing: Story, updates: Partial<Story>): string =>
  JSON.stringify({
    status: updates.status ?? existing.status,
    priority: updates.priority ?? existing.priority,
    parentId: updates.parentId ?? existing.parentId,
  });

const mergeDiagramMetadata = (existing: Diagram, updates: Partial<Diagram>): string =>
  JSON.stringify({
    diagramType: updates.diagramType ?? existing.diagramType,
    source: updates.source ?? existing.source,
    generatedFrom: updates.generatedFrom ?? existing.generatedFrom,
  });

const mergeEntityMetadata = (existing: Entity, updates: Partial<Entity>): string | null => {
  switch (existing._tag) {
    case EntityType.Doc:
      return mergeDocMetadata(existing, updates as Partial<Doc>);
    case EntityType.CodeRef:
      return mergeCodeRefMetadata(existing, updates as Partial<CodeRef>);
    case EntityType.Story:
      return mergeStoryMetadata(existing, updates as Partial<Story>);
    case EntityType.Diagram:
      return mergeDiagramMetadata(existing, updates as Partial<Diagram>);
  }
};

// ============================================================================
// Repository Implementation
// ============================================================================

export const SqliteEntityRepositorySessionLive = Layer.effect(
  EntityRepositoryTag,
  Effect.gen(function* () {
    const { db, drizzle, transaction, write } = yield* DatabaseSessionTag;

    const searchFts = db.prepare(`
      SELECT e.* FROM entities e
      JOIN entities_fts fts ON e.id = fts.id
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
          return rowToEntity(row) as Doc;
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
          return rowToEntity(row) as CodeRef;
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
          return rowToEntity(row) as Story;
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
          return rowToEntity(row) as Diagram;
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

          const rows = searchFts.all(`${sanitized}*`) as RawEntityRow[];
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
