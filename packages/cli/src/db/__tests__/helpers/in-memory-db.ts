import { Effect } from "effect";

export interface InMemoryDatabase {
  readonly db: unknown;
  readonly close: () => Promise<void>;
}

export const createInMemoryDatabase = async (): Promise<InMemoryDatabase> => {
  if (typeof Bun === "undefined") {
    throw new Error("In-memory SQLite helper requires Bun runtime");
  }

  const { makeDatabaseClient } = await import("../../client");
  const client = await Effect.runPromise(makeDatabaseClient(":memory:"));

  return {
    db: client.db,
    close: () => Effect.runPromise(client.close),
  };
};
