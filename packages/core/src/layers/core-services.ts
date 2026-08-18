/**
 * Core service layer bundles
 */
import { Layer } from "effect";
import { EntityServiceLive } from "../services/entity-service.live";
import { GraphServiceLive } from "../services/graph-service.live";
import { MigrationServiceLive } from "../services/migration-service.live";
import { NextServiceLive } from "../services/next-service.live";
import { TagServiceLive } from "../services/tag-service.live";
import { TermServiceLive } from "../services/term-service.live";

export const CoreServicesLive = Layer.mergeAll(
  EntityServiceLive,
  TagServiceLive,
  TermServiceLive,
  MigrationServiceLive,
  GraphServiceLive,
  NextServiceLive
);
