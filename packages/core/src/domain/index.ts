/**
 * Domain module exports
 */

export type { EntityId } from "./entity.js";
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
} from "./entity.js";
export type { LinkId } from "./link.js";
// Link types and schemas
export { CreateLinkInput, getInverseLinkType, Link, LinkType } from "./link.js";
export type { TagId } from "./tag.js";
// Tag types and schemas
export { CreateTagInput, Tag, UpdateTagInput } from "./tag.js";
export type { TypedEntityVersion, VersionId } from "./version.js";
// Version types and schemas
export { ChangeType, EntityVersion } from "./version.js";
