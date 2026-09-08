import { randomUUID } from "node:crypto";
import { Clock, Effect, Exit, Ref } from "effect";
import { type ConfigService, ConfigServiceTag } from "../config";
import { canonicalCommandName } from "./command-name";
import { classifyCause } from "./error-category";
import { createExecutionEvent, type ProjectResolution } from "./execution-event";
import { ExecutionRecorderTag } from "./execution-recorder";

const observeProjectResolution = (
  configService: ConfigService,
  resolution: Ref.Ref<ProjectResolution>
): ConfigService => ({
  ...configService,
  init: (path) =>
    configService
      .init(path)
      .pipe(Effect.tap((workspace) => Ref.set(resolution, workspace.resolutionMethod))),
  load: (path) =>
    configService
      .load(path)
      .pipe(Effect.tap((workspace) => Ref.set(resolution, workspace.resolutionMethod))),
});

const replayExit = <A, E>(exit: Exit.Exit<A, E>): Effect.Effect<A, E> =>
  Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(exit.cause);

/**
 * The lifecycle wrapper observes the command's existing config calls rather than resolving a
 * workspace itself. Logging therefore cannot add filesystem or Git behavior to a command.
 */
export const withExecutionLifecycle = <A, E, R>(
  args: ReadonlyArray<string>,
  cliVersion: string,
  program: Effect.Effect<A, E, R>
) =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const configService = yield* ConfigServiceTag;
      const recorder = yield* ExecutionRecorderTag;
      const resolution = yield* Ref.make<ProjectResolution>("unresolved");
      const observedConfig = observeProjectResolution(configService, resolution);
      const runId = randomUUID();
      const startedAtMillis = yield* Clock.currentTimeMillis;
      const startedAtNanos = yield* Clock.monotonicTimeNanos;

      const exit = yield* Effect.exit(
        restore(program.pipe(Effect.provideService(ConfigServiceTag, observedConfig)))
      );

      const endedAtNanos = yield* Clock.monotonicTimeNanos;
      const endedAtMillis = yield* Clock.currentTimeMillis;
      const projectResolution = yield* Ref.get(resolution);
      const classified = Exit.isSuccess(exit)
        ? ({ outcome: "success" } as const)
        : classifyCause(exit.cause);

      const event = createExecutionEvent({
        runId,
        command: canonicalCommandName(args),
        cliVersion,
        startedAt: new Date(startedAtMillis).toISOString(),
        endedAt: new Date(endedAtMillis).toISOString(),
        durationMs: Number((endedAtNanos - startedAtNanos) / 1_000_000n),
        outcome: classified.outcome,
        errorCategory: classified.errorCategory,
        projectResolution,
      });

      yield* recorder.record(event).pipe(Effect.ignoreCause);
      return yield* replayExit(exit);
    })
  );
