import { Schema } from "effect";
import { PositiveInteger } from "./scalars.js";

// ============================================================================
// Entity Types
// ============================================================================

export const EntityType = {
  Doc: "doc",
  CodeRef: "code_ref",
  Story: "story",
  Diagram: "diagram",
} as const;

export type EntityType = (typeof EntityType)[keyof typeof EntityType];
export const EntityTypes: ReadonlyArray<EntityType> = Object.freeze(Object.values(EntityType));
export const EntityTypeSchema = Schema.Literals(EntityTypes);

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

export const StoryStatusSchema = Schema.Enum(StoryStatusEnum);
export type StoryStatus = typeof StoryStatusSchema.Type;

export enum PriorityEnum {
  Low = "low",
  Medium = "medium",
  High = "high",
  Urgent = "urgent",
}

export const PrioritySchema = Schema.Enum(PriorityEnum);
export type Priority = typeof PrioritySchema.Type;

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

export const DiagramTypeSchema = Schema.Enum(DiagramTypeEnum);
export type DiagramType = typeof DiagramTypeSchema.Type;

// ============================================================================
// Base Entity Schema (untagged)
// ============================================================================

export const BrandedId = Schema.String.check(Schema.isNonEmpty()).pipe(Schema.brand("EntityId"));

const BaseEntityFields = {
  id: BrandedId,
  title: Schema.String.check(Schema.isNonEmpty()),
  content: Schema.String,
  tags: Schema.Array(Schema.String),
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
  version: PositiveInteger,
};

export const BaseEntitySchema = Schema.Struct(BaseEntityFields);

export type BaseEntity = typeof BaseEntitySchema.Type;
export type EntityId = (typeof BaseEntitySchema.Type)["id"];

// ============================================================================
// Untagged Entity Variants
// ============================================================================

export const DocSchema = Schema.TaggedStruct(EntityType.Doc, {
  ...BaseEntityFields,
});
export type Doc = typeof DocSchema.Type;

export const CodeRefSchema = Schema.TaggedStruct(EntityType.CodeRef, {
  ...BaseEntityFields,
  repoPath: Schema.String,
  filePath: Schema.String.check(Schema.isNonEmpty()),
  startLine: Schema.optional(PositiveInteger),
  endLine: Schema.optional(PositiveInteger),
  commitHash: Schema.optional(Schema.String),
  symbol: Schema.optional(Schema.String),
});
export type CodeRef = typeof CodeRefSchema.Type;

export const StorySchema = Schema.TaggedStruct(EntityType.Story, {
  ...BaseEntityFields,
  status: StoryStatusSchema,
  priority: Schema.optional(PrioritySchema),
  parentId: Schema.optional(Schema.String),
});
export type Story = typeof StorySchema.Type;

export const DiagramSchema = Schema.TaggedStruct(EntityType.Diagram, {
  ...BaseEntityFields,
  diagramType: DiagramTypeSchema,
  source: Schema.String,
  generatedFrom: Schema.optional(Schema.Array(Schema.String)),
});
export type Diagram = typeof DiagramSchema.Type;

// ============================================================================
// Entity Unions
// ============================================================================

export const EntitySchema = Schema.Union([DocSchema, CodeRefSchema, StorySchema, DiagramSchema]);
export type Entity = typeof EntitySchema.Type;

// ============================================================================
// Entity Creation Inputs (without auto-generated fields)
// ============================================================================

export const CreateDocInputSchema = Schema.Struct({
  title: Schema.String.check(Schema.isNonEmpty()),
  content: Schema.String,
  tags: Schema.optional(Schema.Array(Schema.String)),
});

export type CreateDocInput = typeof CreateDocInputSchema.Type;

export const CreateCodeRefInputSchema = Schema.Struct({
  title: Schema.String.check(Schema.isNonEmpty()),
  content: Schema.String,
  tags: Schema.optional(Schema.Array(Schema.String)),
  repoPath: Schema.String,
  filePath: Schema.String.check(Schema.isNonEmpty()),
  startLine: Schema.optional(PositiveInteger),
  endLine: Schema.optional(PositiveInteger),
  commitHash: Schema.optional(Schema.String),
  symbol: Schema.optional(Schema.String),
});

export type CreateCodeRefInput = typeof CreateCodeRefInputSchema.Type;

export const CreateStoryInputSchema = Schema.Struct({
  title: Schema.String.check(Schema.isNonEmpty()),
  content: Schema.String,
  tags: Schema.optional(Schema.Array(Schema.String)),
  status: Schema.optional(StoryStatusSchema),
  priority: Schema.optional(PrioritySchema),
  parentId: Schema.optional(Schema.String),
});

export type CreateStoryInput = typeof CreateStoryInputSchema.Type;

export const CreateDiagramInputSchema = Schema.Struct({
  title: Schema.String.check(Schema.isNonEmpty()),
  content: Schema.String,
  tags: Schema.optional(Schema.Array(Schema.String)),
  diagramType: DiagramTypeSchema,
  source: Schema.String,
  generatedFrom: Schema.optional(Schema.Array(Schema.String)),
});

export type CreateDiagramInput = typeof CreateDiagramInputSchema.Type;
