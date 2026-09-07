import { Effect, Layer } from "effect";
/**
 * AeroGraph CLI
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
import { runtimeKind } from "./runtime";
import { CLI_VERSION } from "./version";

// ============================================================================
// CLI Application
// ============================================================================

const aerograph = Command.make("aerograph").pipe(
  Command.withDescription("A version-controlled knowledge platform for codebases")
);

const command = aerograph.pipe(
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
  version: CLI_VERSION,
});

// ============================================================================
// Run
// ============================================================================

const run = async (): Promise<void> => {
  if (runtimeKind === "bun") {
    const [BunRuntime, BunServices] = await Promise.all([
      import("@effect/platform-bun/BunRuntime"),
      import("@effect/platform-bun/BunServices"),
    ]);
    const MainLive = Layer.mergeAll(ConfigServiceLive, BunServices.layer);
    BunRuntime.runMain(cli.pipe(Effect.provide(MainLive)));
    return;
  }

  const [NodeRuntime, NodeServices] = await Promise.all([
    import("@effect/platform-node/NodeRuntime"),
    import("@effect/platform-node/NodeServices"),
  ]);
  const MainLive = Layer.mergeAll(ConfigServiceLive, NodeServices.layer);
  NodeRuntime.runMain(cli.pipe(Effect.provide(MainLive)));
};

void run();
