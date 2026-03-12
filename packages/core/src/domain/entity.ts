import { Schema } from "effect";

// ============================================================================
// Entity Types
// ============================================================================

export enum EntityTypeEnum {
  Doc = "doc",
  CodeRef = "code_ref",
  Story = "story",
  Diagram = "diagram",
}

export const EntityType = Schema.Enums(EntityTypeEnum);
export type EntityType = typeof EntityType.Type;

// ============================================================================
// Story Status & Priority
// ============================================================================

export enum StoryStatusEnum {
  Backlog = "backlog",
  Todo = "todo",
  InProgress = "in_progress",
  Done = "done",
  Cancelled = "cancelled",
}

export const StoryStatus = Schema.Enums(StoryStatusEnum);
export type StoryStatus = typeof StoryStatus.Type;

export enum PriorityEnum {
  Low = "low",
  Medium = "medium",
  High = "high",
  Urgent = "urgent",
}

export const Priority = Schema.Enums(PriorityEnum);
export type Priority = typeof Priority.Type;

// ============================================================================
// Diagram Types
// ============================================================================

export enum DiagramTypeEnum {
  Flowchart = "flowchart",
  Sequence = "sequence",
  Erd = "erd",
  ClassDiagram = "classDiagram",
  Other = "other",
}

export const DiagramType = Schema.Enums(DiagramTypeEnum);
export type DiagramType = typeof DiagramType.Type;

// ============================================================================
// Base Entity Schema (untagged)
// ============================================================================

export const BrandedId = Schema.String.pipe(Schema.brand("EntityId"));

const BaseEntityFields = {
  id: BrandedId,
  title: Schema.String.pipe(Schema.nonEmptyString()),
  content: Schema.String,
  tags: Schema.Array(Schema.String),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
  version: Schema.Number.pipe(Schema.int(), Schema.positive()),
};

export const BaseEntity = Schema.Struct(BaseEntityFields);

export type BaseEntity = typeof BaseEntity.Type;
export type EntityId = (typeof BaseEntity.Type)["id"];

// ============================================================================
// Untagged Entity Variants
// ============================================================================

export const Doc = Schema.TaggedStruct(EntityTypeEnum.Doc, {
  ...BaseEntityFields,
});
export type Doc = typeof Doc.Type;

export const CodeRef = Schema.TaggedStruct(EntityTypeEnum.CodeRef, {
  ...BaseEntityFields,
  repoPath: Schema.String,
  filePath: Schema.String.pipe(Schema.nonEmptyString()),
  startLine: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.positive())),
  endLine: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.positive())),
  commitHash: Schema.optional(Schema.String),
});
export type CodeRef = typeof CodeRef.Type;

export const Story = Schema.TaggedStruct(EntityTypeEnum.Story, {
  ...BaseEntityFields,
  status: StoryStatus,
  priority: Schema.optional(Priority),
  parentId: Schema.optional(Schema.String),
});
export type Story = typeof Story.Type;

export const Diagram = Schema.TaggedStruct(EntityTypeEnum.Diagram, {
  ...BaseEntityFields,
  diagramType: DiagramType,
  source: Schema.String,
  generatedFrom: Schema.optional(Schema.Array(Schema.String)),
});
export type Diagram = typeof Diagram.Type;

// ============================================================================
// Entity Unions
// ============================================================================

export const Entity = Schema.Union(Doc, CodeRef, Story, Diagram);
export type Entity = typeof Entity.Type;


// ============================================================================
// Entity Creation Inputs (without auto-generated fields)
// ============================================================================

export const CreateDocInput = Schema.Struct({
  title: Schema.String.pipe(Schema.nonEmptyString()),
  content: Schema.String,
  tags: Schema.optional(Schema.Array(Schema.String)),
});

export type CreateDocInput = typeof CreateDocInput.Type;

export const CreateCodeRefInput = Schema.Struct({
  title: Schema.String.pipe(Schema.nonEmptyString()),
  content: Schema.String,
  tags: Schema.optional(Schema.Array(Schema.String)),
  repoPath: Schema.String,
  filePath: Schema.String.pipe(Schema.nonEmptyString()),
  startLine: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.positive())),
  endLine: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.positive())),
  commitHash: Schema.optional(Schema.String),
});

export type CreateCodeRefInput = typeof CreateCodeRefInput.Type;

export const CreateStoryInput = Schema.Struct({
  title: Schema.String.pipe(Schema.nonEmptyString()),
  content: Schema.String,
  tags: Schema.optional(Schema.Array(Schema.String)),
  status: Schema.optional(StoryStatus),
  priority: Schema.optional(Priority),
  parentId: Schema.optional(Schema.String),
});

export type CreateStoryInput = typeof CreateStoryInput.Type;

export const CreateDiagramInput = Schema.Struct({
  title: Schema.String.pipe(Schema.nonEmptyString()),
  content: Schema.String,
  tags: Schema.optional(Schema.Array(Schema.String)),
  diagramType: DiagramType,
  source: Schema.String,
  generatedFrom: Schema.optional(Schema.Array(Schema.String)),
});

export type CreateDiagramInput = typeof CreateDiagramInput.Type;
