/**
 * Version domain model
 * Entity version history for append-only versioning
 */
import { Schema } from "effect"
import type { Entity } from "./entity.js"

// ============================================================================
// Change Types
// ============================================================================

export const ChangeType = Schema.Literal("create", "update", "delete")
export type ChangeType = typeof ChangeType.Type

// ============================================================================
// Entity Version Schema
// ============================================================================

export const EntityVersion = Schema.Struct({
  id: Schema.String.pipe(Schema.brand("VersionId")),
  entityId: Schema.String,
  version: Schema.Number.pipe(Schema.int(), Schema.positive()),
  data: Schema.Unknown, // JSON snapshot of entity at this version
  changeType: ChangeType,
  changedFields: Schema.optional(Schema.Array(Schema.String)),
  createdAt: Schema.Date,
  authorId: Schema.optional(Schema.String),
})

export type EntityVersion = typeof EntityVersion.Type
export type VersionId = (typeof EntityVersion.Type)["id"]

// ============================================================================
// Typed Entity Version (for runtime use)
// ============================================================================

export interface TypedEntityVersion<E extends Entity = Entity> {
  id: VersionId
  entityId: string
  version: number
  data: E
  changeType: ChangeType
  changedFields?: readonly string[]
  createdAt: Date
  authorId?: string
}
