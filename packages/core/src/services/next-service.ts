import { Context, type Effect } from "effect";
import type { NextCommand, NextCommandType } from "../domain/next-command.js";
import type { EntityNotFoundError, RepositoryError } from "../errors.js";

export interface NextSuggestedEntity {
  readonly entityId: string;
  readonly prefix: string;
}

export interface NextService {
  /**
   * Replace saved suggestions with the default next actions for displayed entities.
   */
  readonly recordDisplayedEntities: (
    entities: ReadonlyArray<NextSuggestedEntity>
  ) => Effect.Effect<ReadonlyArray<NextCommand>, EntityNotFoundError | RepositoryError>;

  readonly list: (entityId?: string) => Effect.Effect<ReadonlyArray<NextCommand>, RepositoryError>;

  readonly clear: (entityId?: string) => Effect.Effect<number, RepositoryError>;

  readonly find: (
    entityId: string,
    commandType: NextCommandType
  ) => Effect.Effect<NextCommand | undefined, RepositoryError>;
}

export class NextServiceTag extends Context.Service<NextServiceTag, NextService>()("NextService") {}
