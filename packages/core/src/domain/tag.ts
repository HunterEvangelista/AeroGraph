/**
 * Tag domain model
 * Hierarchical tags for connecting entities
 */
import { Schema } from "effect";

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
  createdAt: Schema.DateFromString,
});

export type Tag = typeof Tag.Type;
export type TagId = (typeof Tag.Type)["id"];

// ============================================================================
// Tag Creation Input
// ============================================================================

export const CreateTagInput = Schema.Struct({
  id: Schema.String.check(Schema.isNonEmpty()),
  name: Schema.String.check(Schema.isNonEmpty()),
  description: Schema.optional(Schema.String),
  parentId: Schema.optional(Schema.String),
  aliases: Schema.optional(Schema.Array(Schema.String)),
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
});

export type UpdateTagInput = typeof UpdateTagInput.Type;
