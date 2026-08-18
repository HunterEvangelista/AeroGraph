/**
 * @kioku/cli
 * Command-line interface for the Kioku knowledge platform
 */

export { termCommand } from "./commands/term";
export type { ConfigService, KiokuConfig, WorkspaceInfo } from "./config";
// Re-export for programmatic usage
export { ConfigServiceLive, ConfigServiceTag } from "./config";
export * from "./db/index";
