import type { RepositoryError } from "@kioku/core";
import type { Effect } from "effect";

// TODO: Need to define the return shape, and specific arg error types

export interface NextRepository {
  /**
   * Create a new next command
   */
  readonly create: (entityId: Readonly<string>) => Effect.Effect<void, RepositoryError>;

  /**
   * Returns next options, optional specifier to narrow by entityId
   */
  readonly list: (entityId?: Readonly<string>) => Effect.Effect<void, RepositoryError>;

  /**
   * Returns the next command of specified type. Scoped to either entityId or next index.
   * Throws if entityId and index are undefined, If both are passed, preference given to entityId
   */
  readonly get: (
    commandType: Readonly<string>,
    entityId?: Readonly<string>,
    index?: Readonly<number>
  ) => Effect.Effect<void, RepositoryError>;
}
