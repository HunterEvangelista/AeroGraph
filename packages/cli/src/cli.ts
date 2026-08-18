import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
/**
 * Kioku CLI
 * Main entry point for the command-line interface
 */
import { Command } from "effect/unstable/cli";
import {
  codeRefCommand,
  contextCommand,
  docCommand,
  historyCommand,
  initCommand,
  linkCommand,
  migrateCommand,
  nextCommand,
  queryCommand,
  statusCommand,
  storyCommand,
  tagCommand,
  termCommand,
  unlinkCommand,
} from "./commands/index";
import { ConfigServiceLive } from "./config";

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
    codeRefCommand,
    historyCommand,
    contextCommand,
    storyCommand,
    tagCommand,
    termCommand,
    linkCommand,
    unlinkCommand,
    migrateCommand,
    queryCommand,
    nextCommand,
  ])
);

const cli = Command.run(command, {
  version: "0.1.0",
});

// ============================================================================
// Run
// ============================================================================

const MainLive = Layer.mergeAll(ConfigServiceLive, BunServices.layer);

cli.pipe(Effect.provide(MainLive), BunRuntime.runMain);
