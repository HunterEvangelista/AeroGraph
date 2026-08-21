/**
 * @aerograph/cli
 * Command-line interface for the AeroGraph knowledge platform
 */

export { termCommand } from "./commands/term";
export type {
  AeroGraphConfig,
  AeroGraphProject,
  AeroGraphRegistry,
  ConfigService,
  WorkspaceInfo,
} from "./config";
// Re-export for programmatic usage
export { ConfigServiceLive, ConfigServiceTag } from "./config";
export * from "./db/index";
