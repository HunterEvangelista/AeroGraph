/** Core service layer bundles. */
import { Layer } from "effect";
import { EntityServiceLive } from "../services/entity-service.live";
import { GraphServiceLive } from "../services/graph-service.live";
import { MigrationServiceLive } from "../services/migration-service.live";
import { NextServiceLive } from "../services/next-service.live";
import { TagServiceLive } from "../services/tag-service.live";
import { TermGovernanceServiceLive } from "../services/term-governance-service.live";
import { TermServiceLive } from "../services/term-service.live";

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
