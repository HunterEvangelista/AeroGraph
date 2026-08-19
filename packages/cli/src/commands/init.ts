import { Console, Effect, Option } from "effect";
/**
 * Init Command
 * Initialize a new AeroGraph workspace
 */
import { Argument, Command } from "effect/unstable/cli";
import { ConfigServiceTag } from "../config";
import { DatabaseClientLive, DatabaseClientTag } from "../db/index";

export const initCommand = Command.make(
  "init",
  {
    path: Argument.directory("path").pipe(Argument.optional),
  },
  ({ path }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag;

      yield* Console.log("Initializing AeroGraph workspace...");

      // Convert Option to string | undefined
      const pathValue = Option.getOrUndefined(path);
      const workspace = yield* configService.init(pathValue);

      // Initialize the database
      yield* Console.log("Creating database...");

      yield* Effect.scoped(
        DatabaseClientTag.pipe(Effect.provide(DatabaseClientLive(workspace.dbPath)))
      );

      yield* Console.log("");
      yield* Console.log(`AeroGraph workspace initialized at: ${workspace.rootPath}`);
      yield* Console.log("");
      yield* Console.log("Created:");
      yield* Console.log(`  ${workspace.configPath}`);
      yield* Console.log(`  ${workspace.dbPath}`);
      yield* Console.log("");
      yield* Console.log("Next steps:");
      yield* Console.log("  aerograph onboard    Start AI-assisted onboarding");
      yield* Console.log("  aerograph status     View workspace status");
      yield* Console.log("  aerograph doc create Create a new document");
    }).pipe(
      Effect.catchTags({
        WorkspaceAlreadyExistsError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
      })
    )
);
