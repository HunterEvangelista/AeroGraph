/**
 * Link domain model
 * Relationships between entities
 */
import { Schema } from "effect";

// ============================================================================
// Link Types
// ============================================================================

export const LinkType = Schema.Literals([
  "references",
  "parent_of",
  "child_of",
  "blocks",
  "blocked_by",
  "related_to",
]);
export type LinkType = typeof LinkType.Type;

// ============================================================================
// Link Schema
// ============================================================================

export const Link = Schema.Struct({
  id: Schema.String.pipe(Schema.brand("LinkId")),
  sourceId: Schema.String,
  targetId: Schema.String,
  type: LinkType,
  createdAt: Schema.DateFromString,
});

export type Link = typeof Link.Type;
export type LinkId = (typeof Link.Type)["id"];

// ============================================================================
// Link Creation Input
// ============================================================================

export const CreateLinkInput = Schema.Struct({
  sourceId: Schema.String.check(Schema.isNonEmpty()),
  targetId: Schema.String.check(Schema.isNonEmpty()),
  type: LinkType,
});

export type CreateLinkInput = typeof CreateLinkInput.Type;

// ============================================================================
// Inverse Link Types (for bidirectional linking)
// ============================================================================

export const getInverseLinkType = (type: LinkType): LinkType => {
  switch (type) {
    case "parent_of":
      return "child_of";
    case "child_of":
      return "parent_of";
    case "blocks":
      return "blocked_by";
    case "blocked_by":
      return "blocks";
    case "references":
    case "related_to":
      return type; // Symmetric relationships
  }
};
