import { describe, expect, it } from "bun:test";
import { Deferred, Effect, Exit, Fiber, Layer } from "effect";
import { ConfigServiceLive } from "../config";
import type { ExecutionEvent } from "./execution-event";
import { ExecutionRecorderTag } from "./execution-recorder";
import { withExecutionLifecycle } from "./lifecycle";

const runLifecycle = async (
  program: Effect.Effect<void, never>
): Promise<{
  readonly exit: Exit.Exit<void, never>;
  readonly events: ReadonlyArray<ExecutionEvent>;
}> => {
  const events: ExecutionEvent[] = [];
  const recorder = Layer.succeed(ExecutionRecorderTag, {
    record: (event) => Effect.sync(() => events.push(event)),
  });
  const services = Layer.merge(ConfigServiceLive, recorder);
  const exit = await Effect.runPromise(
    Effect.exit(withExecutionLifecycle(["status"], "test-version", program)).pipe(
      Effect.provide(services)
    )
  );
  return { exit, events };
};

describe("execution lifecycle finalization", () => {
  it("records defects without serializing the defect", async () => {
    const defectCanary = "PRIVATE_DEFECT_CANARY_7193";
    const { events, exit } = await runLifecycle(Effect.die(new Error(defectCanary)));

    expect(Exit.isFailure(exit)).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]?.outcome).toBe("failure");
    expect(events[0]?.errorCategory).toBe("internal");
    expect(JSON.stringify(events)).not.toContain(defectCanary);
  });

  it("records self-interruption before replaying it", async () => {
    const { events, exit } = await runLifecycle(Effect.interrupt);

    expect(Exit.isFailure(exit)).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]?.outcome).toBe("interrupted");
    expect(events[0]?.errorCategory).toBeUndefined();
  });

  it("records an external fiber interruption before the lifecycle exits", async () => {
    const events: ExecutionEvent[] = [];
    const recorder = Layer.succeed(ExecutionRecorderTag, {
      record: (event) => Effect.sync(() => events.push(event)),
    });
    const services = Layer.merge(ConfigServiceLive, recorder);

    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const command = Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never));
        const fiber = yield* Effect.forkChild(
          withExecutionLifecycle(["status"], "test-version", command)
        );
        yield* Deferred.await(started);
        yield* Fiber.interrupt(fiber);
        return yield* Fiber.await(fiber);
      }).pipe(Effect.provide(services))
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]?.outcome).toBe("interrupted");
  });
});
