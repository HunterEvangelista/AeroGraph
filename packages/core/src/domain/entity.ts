/**
 * Entity domain models
 * Core data structures for the knowledge graph
 */
import { Schema } from "effect"

// ============================================================================
// Entity Types
// ============================================================================

export const EntityType = Schema.Literal("doc", "code_ref", "story", "diagram")
export type EntityType = typeof EntityType.Type

// ============================================================================
// Story Status & Priority
// ============================================================================

export const StoryStatus = Schema.Literal("backlog", "todo", "in_progress", "done", "cancelled")
export type StoryStatus = typeof StoryStatus.Type

export const Priority = Schema.Literal("low", "medium", "high", "urgent")
export type Priority = typeof Priority.Type

// ============================================================================
// Diagram Types
// ============================================================================

export const DiagramType = Schema.Literal("flowchart", "sequence", "erd", "classDiagram", "other")
export type DiagramType = typeof DiagramType.Type

// ============================================================================
// Base Entity Schema
// ============================================================================

export const BaseEntity = Schema.Struct({
  id: Schema.String.pipe(Schema.brand("EntityId")),
  type: EntityType,
  title: Schema.String.pipe(Schema.nonEmptyString()),
  content: Schema.String,
  tags: Schema.Array(Schema.String),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
  version: Schema.Number.pipe(Schema.int(), Schema.positive()),
})

export type BaseEntity = typeof BaseEntity.Type
export type EntityId = (typeof BaseEntity.Type)["id"]

// ============================================================================
// Document Entity
// ============================================================================

export const Doc = Schema.Struct({
  ...BaseEntity.fields,
  type: Schema.Literal("doc"),
})

export type Doc = typeof Doc.Type

// ============================================================================
// Code Reference Entity
// ============================================================================

export const CodeRef = Schema.Struct({
  ...BaseEntity.fields,
  type: Schema.Literal("code_ref"),
  repoPath: Schema.String,
  filePath: Schema.String.pipe(Schema.nonEmptyString()),
  startLine: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.positive())),
  endLine: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.positive())),
  commitHash: Schema.optional(Schema.String),
})

export type CodeRef = typeof CodeRef.Type

// ============================================================================
// Story Entity
// ============================================================================

export const Story = Schema.Struct({
  ...BaseEntity.fields,
  type: Schema.Literal("story"),
  status: StoryStatus,
  priority: Schema.optional(Priority),
  parentId: Schema.optional(Schema.String),
})

export type Story = typeof Story.Type

// ============================================================================
// Diagram Entity
// ============================================================================

export const Diagram = Schema.Struct({
  ...BaseEntity.fields,
  type: Schema.Literal("diagram"),
  diagramType: DiagramType,
  source: Schema.String,
  generatedFrom: Schema.optional(Schema.Array(Schema.String)),
})

export type Diagram = typeof Diagram.Type

// ============================================================================
// Entity Union
// ============================================================================

export const Entity = Schema.Union(Doc, CodeRef, Story, Diagram)
export type Entity = typeof Entity.Type

// ============================================================================
// Entity Creation Inputs (without auto-generated fields)
// ============================================================================

export const CreateDocInput = Schema.Struct({
  title: Schema.String.pipe(Schema.nonEmptyString()),
  content: Schema.String,
  tags: Schema.optional(Schema.Array(Schema.String)),
})

export type CreateDocInput = typeof CreateDocInput.Type

export const CreateCodeRefInput = Schema.Struct({
  title: Schema.String.pipe(Schema.nonEmptyString()),
  content: Schema.String,
  tags: Schema.optional(Schema.Array(Schema.String)),
  repoPath: Schema.String,
  filePath: Schema.String.pipe(Schema.nonEmptyString()),
  startLine: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.positive())),
  endLine: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.positive())),
  commitHash: Schema.optional(Schema.String),
})

export type CreateCodeRefInput = typeof CreateCodeRefInput.Type

export const CreateStoryInput = Schema.Struct({
  title: Schema.String.pipe(Schema.nonEmptyString()),
  content: Schema.String,
  tags: Schema.optional(Schema.Array(Schema.String)),
  status: Schema.optional(StoryStatus),
  priority: Schema.optional(Priority),
  parentId: Schema.optional(Schema.String),
})

export type CreateStoryInput = typeof CreateStoryInput.Type

export const CreateDiagramInput = Schema.Struct({
  title: Schema.String.pipe(Schema.nonEmptyString()),
  content: Schema.String,
  tags: Schema.optional(Schema.Array(Schema.String)),
  diagramType: DiagramType,
  source: Schema.String,
  generatedFrom: Schema.optional(Schema.Array(Schema.String)),
})

export type CreateDiagramInput = typeof CreateDiagramInput.Type
