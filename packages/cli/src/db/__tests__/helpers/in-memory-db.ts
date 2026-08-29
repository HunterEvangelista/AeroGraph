import { Effect } from "effect";

export interface InMemoryDatabase {
  readonly db: unknown;
  readonly close: () => Promise<void>;
}

export const createInMemoryDatabase = async (): Promise<InMemoryDatabase> => {
  const { makeDatabaseClient } = await import("../../client");
  const client = await Effect.runPromise(makeDatabaseClient(":memory:"));

  return {
    db: client.db,
    close: () => Effect.runPromise(client.close),
  };
};
