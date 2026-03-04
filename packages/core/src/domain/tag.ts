/**
 * Tag domain model
 * Hierarchical tags for connecting entities
 */
import { Schema } from "effect"

// ============================================================================
// Tag Schema
// ============================================================================

export const Tag = Schema.Struct({
  id: Schema.String.pipe(Schema.brand("TagId")),
  name: Schema.String.pipe(Schema.nonEmptyString()),
  description: Schema.optional(Schema.String),
  parentId: Schema.optional(Schema.String),
  aliases: Schema.optional(Schema.Array(Schema.String)),
  createdAt: Schema.Date,
})

export type Tag = typeof Tag.Type
export type TagId = (typeof Tag.Type)["id"]

// ============================================================================
// Tag Creation Input
// ============================================================================

export const CreateTagInput = Schema.Struct({
  id: Schema.String.pipe(Schema.nonEmptyString()),
  name: Schema.String.pipe(Schema.nonEmptyString()),
  description: Schema.optional(Schema.String),
  parentId: Schema.optional(Schema.String),
  aliases: Schema.optional(Schema.Array(Schema.String)),
})

export type CreateTagInput = typeof CreateTagInput.Type

// ============================================================================
// Tag Update Input
// ============================================================================

export const UpdateTagInput = Schema.Struct({
  name: Schema.optional(Schema.String.pipe(Schema.nonEmptyString())),
  description: Schema.optional(Schema.String),
  parentId: Schema.optional(Schema.String),
  aliases: Schema.optional(Schema.Array(Schema.String)),
})

export type UpdateTagInput = typeof UpdateTagInput.Type
