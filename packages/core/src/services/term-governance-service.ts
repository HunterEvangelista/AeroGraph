import { Context, type Effect } from "effect";
import type { MigrationJournalEntry, TermKind, TermName } from "../domain/term.js";
import type {
  AmbiguousTermNameError,
  RepositoryError,
  TermAlreadyExistsError,
  TermMigrationError,
  TermNotFoundError,
  ValidationError,
} from "../errors.js";
import type { TermInspection, TermSelector } from "./term-service.js";

export interface AddTermAliasInput {
  readonly term: TermSelector;
  readonly alias: string;
  readonly displayName?: string;
}

export interface TermAudit {
  readonly selector: string;
  readonly inspection: TermInspection;
  readonly entries: ReadonlyArray<MigrationJournalEntry>;
}

export interface TermGovernanceService {
  readonly list: (
    kind?: TermKind
  ) => Effect.Effect<
    ReadonlyArray<TermInspection>,
    RepositoryError | TermMigrationError | TermNotFoundError
  >;
  readonly show: (
    selector: TermSelector
  ) => Effect.Effect<
    TermInspection,
    AmbiguousTermNameError | TermMigrationError | TermNotFoundError | RepositoryError
  >;
  readonly addAlias: (
    input: AddTermAliasInput
  ) => Effect.Effect<
    TermName,
    | AmbiguousTermNameError
    | TermAlreadyExistsError
    | TermMigrationError
    | TermNotFoundError
    | ValidationError
    | RepositoryError
  >;
  readonly audit: (
    selector: TermSelector
  ) => Effect.Effect<
    TermAudit,
    AmbiguousTermNameError | TermMigrationError | TermNotFoundError | RepositoryError
  >;
}

export class TermGovernanceServiceTag extends Context.Service<
  TermGovernanceServiceTag,
  TermGovernanceService
>()("TermGovernanceService") {}
