/**
 * @kioku/cli
 * Command-line interface for the Kioku knowledge platform
 */

// Re-export for programmatic usage
export { ConfigServiceLive, ConfigServiceTag } from "./config.js"
export type { ConfigService, KiokuConfig, WorkspaceInfo } from "./config.js"

export * from "./db/index.js"

// Run CLI when executed directly
import "./cli.js"
