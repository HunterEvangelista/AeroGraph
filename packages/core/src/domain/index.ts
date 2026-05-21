/**
 * Domain module exports
 */

// Entity types and schemas
export {
  BaseEntity,
  CodeRef,
  CreateCodeRefInput,
  CreateDiagramInput,
  CreateDocInput,
  CreateStoryInput,
  Diagram,
  DiagramType,
  DiagramTypeEnum,
  Doc,
  Entity,
  EntityType,
  EntityTypeEnum,
  Priority,
  PriorityEnum,
  Story,
  StoryStatus,
  StoryStatusEnum,
} from "./entity.js"
export type { EntityId } from "./entity.js"

// Tag types and schemas
export { CreateTagInput, Tag, UpdateTagInput } from "./tag.js"
export type { TagId } from "./tag.js"

// Link types and schemas
export { CreateLinkInput, getInverseLinkType, Link, LinkType } from "./link.js"
export type { LinkId } from "./link.js"

// Version types and schemas
export { ChangeType, EntityVersion } from "./version.js"
export type { TypedEntityVersion, VersionId } from "./version.js"
