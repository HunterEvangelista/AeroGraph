/**
 * Tag domain model
 * Hierarchical tags for connecting entities
 */
import { Schema } from "effect";
import { TermIdSchema } from "./term.js";

// ============================================================================
// Tag Schema
// ============================================================================

export const TagIdSchema = Schema.String.pipe(Schema.brand("TagId"));

export const Tag = Schema.Struct({
  id: TagIdSchema,
  name: Schema.String.check(Schema.isNonEmpty()),
  description: Schema.optional(Schema.String),
  parentId: Schema.optional(Schema.String),
  aliases: Schema.optional(Schema.Array(Schema.String)),
  termId: Schema.optional(TermIdSchema),
  createdAt: Schema.DateFromString,
});

export type Tag = typeof Tag.Type;
export type TagId = Tag["id"];

// ============================================================================
// Tag Creation Input
// ============================================================================

export const CreateTagInput = Schema.Struct({
  id: Schema.String.check(Schema.isNonEmpty()),
  name: Schema.String.check(Schema.isNonEmpty()),
  description: Schema.optional(Schema.String),
  parentId: Schema.optional(Schema.String),
  aliases: Schema.optional(Schema.Array(Schema.String)),
  termId: Schema.optional(TermIdSchema),
});

export type CreateTagInput = typeof CreateTagInput.Type;

// ============================================================================
// Tag Update Input
// ============================================================================

export const UpdateTagInput = Schema.Struct({
  name: Schema.optional(Schema.String.check(Schema.isNonEmpty())),
  description: Schema.optional(Schema.String),
  parentId: Schema.optional(Schema.String),
  aliases: Schema.optional(Schema.Array(Schema.String)),
  termId: Schema.optional(TermIdSchema),
});

export type UpdateTagInput = typeof UpdateTagInput.Type;
