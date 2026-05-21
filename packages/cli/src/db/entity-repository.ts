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
  EntityTypeEnum,
  type EntityType,
  StoryStatusEnum,
  RepositoryError,
  type Story,
} from "@kioku/core"
/**
 * SQLite Entity Repository Implementation
 */
import { Effect, Layer } from "effect"
import { DatabaseClientTag } from "./client.js"

// ============================================================================
// Helper Functions
// ============================================================================

const generateId = (): string => crypto.randomUUID()

const now = (): string => new Date().toISOString()

interface EntityRow {
  id: string
  type: string
  title: string
  content: string | null
  metadata: string | null
  created_at: string
  updated_at: string
  version: number
}

const rowToEntity = (row: EntityRow): Entity => {
  const metadata = row.metadata ? JSON.parse(row.metadata) : {}
  const base = {
    id: row.id as EntityId,
    title: row.title,
    content: row.content ?? "",
    tags: [], // Tags are loaded separately
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    version: row.version,
  }

  switch (row.type) {
    case "doc":
      return { ...base, _tag: EntityTypeEnum.Doc } as Doc
    case "code_ref":
      return {
        ...base,
        _tag: EntityTypeEnum.CodeRef,
        repoPath: metadata.repoPath ?? "",
        filePath: metadata.filePath ?? "",
        startLine: metadata.startLine,
        endLine: metadata.endLine,
        commitHash: metadata.commitHash,
      } as CodeRef
    case "story":
      return {
        ...base,
        _tag: EntityTypeEnum.Story,
        status: metadata.status ?? StoryStatusEnum.Backlog,
        priority: metadata.priority,
        parentId: metadata.parentId,
      } as Story
    case "diagram":
      return {
        ...base,
        _tag: EntityTypeEnum.Diagram,
        diagramType: metadata.diagramType ?? "other",
        source: metadata.source ?? "",
        generatedFrom: metadata.generatedFrom,
      } as Diagram
    default:
      throw new Error(`Unknown entity type: ${row.type}`)
  }
}

// ============================================================================
// Repository Implementation
// ============================================================================

export const SqliteEntityRepositoryLive = Layer.effect(
  EntityRepositoryTag,
  Effect.gen(function* () {
    const { db } = yield* DatabaseClientTag

    const insertEntity = db.prepare(`
      INSERT INTO entities (id, type, title, content, metadata, created_at, updated_at, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `)

    const selectById = db.prepare("SELECT * FROM entities WHERE id = ?")

    const selectAll = db.prepare("SELECT * FROM entities ORDER BY updated_at DESC")

    const selectByType = db.prepare(
      "SELECT * FROM entities WHERE type = ? ORDER BY updated_at DESC"
    )

    const selectByTag = db.prepare(`
      SELECT e.* FROM entities e
      JOIN entity_tags et ON e.id = et.entity_id
      WHERE et.tag_id = ?
      ORDER BY e.updated_at DESC
    `)

    const updateEntity = db.prepare(`
      UPDATE entities 
      SET title = ?, content = ?, metadata = ?, updated_at = ?, version = version + 1
      WHERE id = ?
    `)

    const deleteEntity = db.prepare("DELETE FROM entities WHERE id = ?")

    const countAll = db.prepare("SELECT COUNT(*) as count FROM entities")

    const countByType = db.prepare("SELECT COUNT(*) as count FROM entities WHERE type = ?")

    const searchFts = db.prepare(`
      SELECT e.* FROM entities e
      JOIN entities_fts fts ON e.id = fts.id
      WHERE entities_fts MATCH ?
      ORDER BY rank
      LIMIT 50
    `)

    const createDoc = (input: CreateDocInput) =>
      Effect.try({
        try: () => {
          const id = generateId()
          const timestamp = now()
          insertEntity.run(id, "doc", input.title, input.content, null, timestamp, timestamp)
          const row = selectById.get(id) as EntityRow
          return rowToEntity(row) as Doc
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to create doc: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      })

    const createCodeRef = (input: CreateCodeRefInput) =>
      Effect.try({
        try: () => {
          const id = generateId()
          const timestamp = now()
          const metadata = JSON.stringify({
            repoPath: input.repoPath,
            filePath: input.filePath,
            startLine: input.startLine,
            endLine: input.endLine,
            commitHash: input.commitHash,
          })
          insertEntity.run(
            id,
            "code_ref",
            input.title,
            input.content,
            metadata,
            timestamp,
            timestamp
          )
          const row = selectById.get(id) as EntityRow
          return rowToEntity(row) as CodeRef
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to create code ref: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      })

    const createStory = (input: CreateStoryInput) =>
      Effect.try({
        try: () => {
          const id = generateId()
          const timestamp = now()
          const metadata = JSON.stringify({
            status: input.status ?? "backlog",
            priority: input.priority,
            parentId: input.parentId,
          })
          insertEntity.run(id, "story", input.title, input.content, metadata, timestamp, timestamp)
          const row = selectById.get(id) as EntityRow
          return rowToEntity(row) as Story
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to create story: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      })

    const createDiagram = (input: CreateDiagramInput) =>
      Effect.try({
        try: () => {
          const id = generateId()
          const timestamp = now()
          const metadata = JSON.stringify({
            diagramType: input.diagramType,
            source: input.source,
            generatedFrom: input.generatedFrom,
          })
          insertEntity.run(
            id,
            "diagram",
            input.title,
            input.content,
            metadata,
            timestamp,
            timestamp
          )
          const row = selectById.get(id) as EntityRow
          return rowToEntity(row) as Diagram
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to create diagram: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      })

    const getById = (id: EntityId) =>
      Effect.gen(function* () {
        const row = yield* Effect.try({
          try: () => selectById.get(id) as EntityRow | undefined,
          catch: (error) =>
            new RepositoryError({
              message: `Failed to get entity: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        })

        if (!row) {
          return yield* Effect.fail(new EntityNotFoundError({ entityId: id }))
        }

        return rowToEntity(row)
      })

    const getAll = (type?: EntityType) =>
      Effect.try({
        try: () => {
          const rows = (type ? selectByType.all(type) : selectAll.all()) as EntityRow[]
          return rows.map(rowToEntity)
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to get entities: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      })

    const getByTag = (tagId: string) =>
      Effect.try({
        try: () => {
          const rows = selectByTag.all(tagId) as EntityRow[]
          return rows.map(rowToEntity)
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to get entities by tag: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      })

    const getByTags = (tagIds: ReadonlyArray<string>) =>
      Effect.try({
        try: () => {
          if (tagIds.length === 0) return []

          // Build query for intersection
          const placeholders = tagIds.map(() => "?").join(", ")
          const query = db.prepare(`
            SELECT e.* FROM entities e
            JOIN entity_tags et ON e.id = et.entity_id
            WHERE et.tag_id IN (${placeholders})
            GROUP BY e.id
            HAVING COUNT(DISTINCT et.tag_id) = ?
            ORDER BY e.updated_at DESC
          `)

          const rows = query.all(...tagIds, tagIds.length) as EntityRow[]
          return rows.map(rowToEntity)
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to get entities by tags: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      })

    const update = (id: EntityId, updates: Partial<Entity>) =>
      Effect.gen(function* () {
        const existing = yield* getById(id)

        const newTitle = updates.title ?? existing.title
        const newContent = updates.content ?? existing.content

        // Merge metadata based on type
        let newMetadata: string | null = null
        if (existing._tag === EntityTypeEnum.CodeRef) {
          const codeRef = existing as CodeRef
          const codeUpdates = updates as Partial<CodeRef>
          newMetadata = JSON.stringify({
            repoPath: codeUpdates.repoPath ?? codeRef.repoPath,
            filePath: codeUpdates.filePath ?? codeRef.filePath,
            startLine: codeUpdates.startLine ?? codeRef.startLine,
            endLine: codeUpdates.endLine ?? codeRef.endLine,
            commitHash: codeUpdates.commitHash ?? codeRef.commitHash,
          })
        } else if (existing._tag === EntityTypeEnum.Story) {
          const story = existing as Story
          const storyUpdates = updates as Partial<Story>
          newMetadata = JSON.stringify({
            status: storyUpdates.status ?? story.status,
            priority: storyUpdates.priority ?? story.priority,
            parentId: storyUpdates.parentId ?? story.parentId,
          })
        } else if (existing._tag === EntityTypeEnum.Diagram) {
          const diagram = existing as Diagram
          const diagramUpdates = updates as Partial<Diagram>
          newMetadata = JSON.stringify({
            diagramType: diagramUpdates.diagramType ?? diagram.diagramType,
            source: diagramUpdates.source ?? diagram.source,
            generatedFrom: diagramUpdates.generatedFrom ?? diagram.generatedFrom,
          })
        }

        yield* Effect.try({
          try: () => updateEntity.run(newTitle, newContent, newMetadata, now(), id),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to update entity: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        })

        return yield* getById(id)
      })

    const deleteById = (id: EntityId) =>
      Effect.gen(function* () {
        // Check exists first
        yield* getById(id)

        yield* Effect.try({
          try: () => deleteEntity.run(id),
          catch: (error) =>
            new RepositoryError({
              message: `Failed to delete entity: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        })
      })

    const count = (type?: EntityType) =>
      Effect.try({
        try: () => {
          const result = (type ? countByType.get(type) : countAll.get()) as { count: number }
          return result.count
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to count entities: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      })

    const search = (query: string) =>
      Effect.try({
        try: () => {
          // Escape special FTS characters and add prefix matching
          const sanitized = query.replace(/['"]/g, "").trim()
          if (!sanitized) return []

          const rows = searchFts.all(`${sanitized}*`) as EntityRow[]
          return rows.map(rowToEntity)
        },
        catch: (error) =>
          new RepositoryError({
            message: `Failed to search entities: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      })

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
    } satisfies EntityRepository
  })
)
