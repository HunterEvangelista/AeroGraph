import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import { Effect, Layer, Stdio } from "effect";
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
import { ExecutionRecorderLive, withExecutionLifecycle } from "./observability/index";
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

const runCommand = Command.runWith(command, {
  version: CLI_VERSION,
});

const cli = Stdio.Stdio.use(({ args }) =>
  args.pipe(
    Effect.flatMap((commandArgs) =>
      withExecutionLifecycle(commandArgs, CLI_VERSION, runCommand(commandArgs))
    )
  )
);

// ============================================================================
// Run
// ============================================================================

const PlatformLive = BunServices.layer;
const RecorderLive = ExecutionRecorderLive.pipe(Layer.provide(PlatformLive));
const MainLive = Layer.mergeAll(ConfigServiceLive, PlatformLive, RecorderLive);

cli.pipe(Effect.provide(MainLive), BunRuntime.runMain);
