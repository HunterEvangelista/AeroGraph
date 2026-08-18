/**
 * @kioku/cli
 * Command-line interface for the Kioku knowledge platform
 */

export { termCommand } from "./commands/term.js";
export type { ConfigService, KiokuConfig, WorkspaceInfo } from "./config.js";
// Re-export for programmatic usage
export { ConfigServiceLive, ConfigServiceTag } from "./config.js";
export * from "./db/index.js";
