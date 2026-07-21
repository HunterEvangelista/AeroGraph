/**
 * Core service layer bundles
 */
import { Layer } from "effect";
import { EntityServiceLive } from "../services/entity-service.live.js";
import { GraphServiceLive } from "../services/graph-service.live.js";
import { MigrationServiceLive } from "../services/migration-service.live.js";
import { NextServiceLive } from "../services/next-service.live.js";
import { TagServiceLive } from "../services/tag-service.live.js";
import { TermServiceLive } from "../services/term-service.live.js";

export const CoreServicesLive = Layer.mergeAll(
  EntityServiceLive,
  TagServiceLive,
  TermServiceLive,
  MigrationServiceLive,
  GraphServiceLive,
  NextServiceLive
);
