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
import {
  commandCatalog,
  ExecutionRecorderLive,
  withExecutionLifecycle,
} from "./observability/index";
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

const executionCommands = commandCatalog(command);
const runCommand = Command.runWith(command, {
  version: CLI_VERSION,
});

const cli = Stdio.Stdio.use(({ args }) =>
  args.pipe(
    Effect.flatMap((commandArgs) =>
      withExecutionLifecycle(executionCommands, commandArgs, CLI_VERSION, runCommand(commandArgs))
    )
  )
);

// ============================================================================
// Run
// ============================================================================

const run = async (): Promise<void> => {
  if (runtimeKind === "bun") {
    const [BunRuntime, BunServices] = await Promise.all([
      import("@effect/platform-bun/BunRuntime"),
      import("@effect/platform-bun/BunServices"),
    ]);
    const PlatformLive = BunServices.layer;
    const RecorderLive = ExecutionRecorderLive(executionCommands).pipe(Layer.provide(PlatformLive));
    const MainLive = Layer.mergeAll(ConfigServiceLive, PlatformLive, RecorderLive);
    BunRuntime.runMain(cli.pipe(Effect.provide(MainLive)));
    return;
  }

  const [NodeRuntime, NodeServices] = await Promise.all([
    import("@effect/platform-node/NodeRuntime"),
    import("@effect/platform-node/NodeServices"),
  ]);
  const PlatformLive = NodeServices.layer;
  const RecorderLive = ExecutionRecorderLive(executionCommands).pipe(Layer.provide(PlatformLive));
  const MainLive = Layer.mergeAll(ConfigServiceLive, PlatformLive, RecorderLive);
  NodeRuntime.runMain(cli.pipe(Effect.provide(MainLive)));
};

void run();
