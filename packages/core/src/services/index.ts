/**
 * Services module exports
 */

export type { EntityService } from "./entity-service.js";
export { EntityServiceTag } from "./entity-service.js";
export { EntityServiceLive } from "./entity-service.live.js";
export type {
  EntityWithLinks,
  GraphService,
  GraphStats,
  TraversalResult,
} from "./graph-service.js";
export { GraphServiceTag } from "./graph-service.js";
export { GraphServiceLive } from "./graph-service.live.js";
export type {
  DeprecateMigrationPlan,
  DeprecateMigrationResult,
  DeprecateTermInput,
  MergeMigrationPlan,
  MergeMigrationResult,
  MergeTermInput,
  MigrationService,
  RenameMigrationPlan,
  RenameMigrationResult,
  RenameTermInput,
} from "./migration-service.js";
export { MigrationServiceTag } from "./migration-service.js";
export { MigrationServiceLive } from "./migration-service.live.js";
export type { NextService, NextSuggestedEntity } from "./next-service.js";
export { NextServiceTag } from "./next-service.js";
export { NextServiceLive } from "./next-service.live.js";
export type { ResolvedTagSelector } from "./tag-selector.js";
export { resolveTagSelectors } from "./tag-selector.js";
export type { TagService } from "./tag-service.js";
export { TagServiceTag } from "./tag-service.js";
export { TagServiceLive } from "./tag-service.live.js";
export type {
  AddTermAliasInput,
  TermAudit,
  TermGovernanceService,
} from "./term-governance-service.js";
export { TermGovernanceServiceTag } from "./term-governance-service.js";
export { TermGovernanceServiceLive } from "./term-governance-service.live.js";
export type {
  TermInspection,
  TermResolution,
  TermResolutionMetadata,
  TermSelector,
  TermService,
} from "./term-service.js";
export { TermServiceTag } from "./term-service.js";
export { TermServiceLive } from "./term-service.live.js";
