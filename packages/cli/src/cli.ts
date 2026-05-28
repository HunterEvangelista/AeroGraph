/**
 * Kioku CLI
 * Main entry point for the command-line interface
 */
import { Command } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import {
  docCommand,
  initCommand,
  linkCommand,
  queryCommand,
  statusCommand,
  tagCommand,
  unlinkCommand,
} from "./commands/index.js";
import { ConfigServiceLive } from "./config.js";

// ============================================================================
// CLI Application
// ============================================================================

const kioku = Command.make("kioku").pipe(
  Command.withDescription("A version-controlled knowledge platform for codebases")
);

const command = kioku.pipe(
  Command.withSubcommands([
    initCommand,
    statusCommand,
    docCommand,
    tagCommand,
    linkCommand,
    unlinkCommand,
    queryCommand,
  ])
);

const cli = Command.run(command, {
  name: "kioku",
  version: "0.1.0",
});

// ============================================================================
// Run
// ============================================================================

const MainLive = Layer.mergeAll(ConfigServiceLive, BunContext.layer);

cli(process.argv).pipe(Effect.provide(MainLive), BunRuntime.runMain);
