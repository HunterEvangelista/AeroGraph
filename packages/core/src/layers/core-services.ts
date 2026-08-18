/** Core service layer bundles. */
import { Layer } from "effect";
import { EntityServiceLive } from "../services/entity-service.live.js";
import { GraphServiceLive } from "../services/graph-service.live.js";
import { MigrationServiceLive } from "../services/migration-service.live.js";
import { NextServiceLive } from "../services/next-service.live.js";
import { TagServiceLive } from "../services/tag-service.live.js";
import { TermGovernanceServiceLive } from "../services/term-governance-service.live.js";
import { TermServiceLive } from "../services/term-service.live.js";

// Each stateful service is constructed once. Governance depends on that same
// TermService instance; lifecycle uses repository-scoped resolution directly.
const CoreServices = Layer.mergeAll(
  EntityServiceLive,
  TagServiceLive,
  GraphServiceLive,
  NextServiceLive,
  TermServiceLive,
  MigrationServiceLive
);

export const CoreServicesLive = TermGovernanceServiceLive.pipe(Layer.provideMerge(CoreServices));
