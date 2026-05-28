import { Effect } from "effect";
import { ConfigServiceTag } from "../config.js";
import { CliServicesLive } from "../db/index.js";

export const withCliServices = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const configService = yield* ConfigServiceTag;
    const workspace = yield* configService.load();
    return yield* Effect.scoped(effect.pipe(Effect.provide(CliServicesLive(workspace.dbPath))));
  });
