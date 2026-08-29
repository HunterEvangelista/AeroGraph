import { Effect } from "effect";

export const runEffect = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(effect);

export const runEffectExit = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromiseExit(effect);
