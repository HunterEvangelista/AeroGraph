import { Context, type Effect } from "effect";
import type { CreateNextCommandInput, NextCommand } from "../domain/next-command";
import type { EntityNotFoundError, RepositoryError } from "../errors";

export interface NextRepository {
  /**
   * Create a new next command suggestion
   */
  readonly create: (
    input: CreateNextCommandInput
  ) => Effect.Effect<NextCommand, EntityNotFoundError | RepositoryError>;

  /**
   * List next commands ordered by id, optionally narrowed by entity.
   * Non-destructive.
   */
  readonly list: (entityId?: string) => Effect.Effect<ReadonlyArray<NextCommand>, RepositoryError>;

  /**
   * Clear next commands, optionally narrowed by entity. Returns deleted count.
   */
  readonly clear: (entityId?: string) => Effect.Effect<number, RepositoryError>;

  /**
   * Atomically replace all next commands with a new set. Clears existing
   * commands then inserts the provided ones in a single transaction.
   */
  readonly replaceAll: (
    commands: ReadonlyArray<CreateNextCommandInput>
  ) => Effect.Effect<ReadonlyArray<NextCommand>, EntityNotFoundError | RepositoryError>;
}

// ============================================================================
// Next Repository Tag (for Effect DI)
// ============================================================================

export class NextRepositoryTag extends Context.Service<NextRepositoryTag, NextRepository>()(
  "NextRepository"
) {}
