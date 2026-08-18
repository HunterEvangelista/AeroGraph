import { Context, type Effect } from "effect";
import type { Tag, TagId } from "../domain/tag";
import type { MigrationJournalEntry, TermKind, TermName } from "../domain/term";
import type {
  AmbiguousTermNameError,
  RepositoryError,
  TagNotFoundError,
  TermAlreadyExistsError,
  TermMigrationError,
  TermNotFoundError,
  ValidationError,
} from "../errors";
import type { TermInspection, TermSelector } from "./term-service";

export interface AddTermAliasInput {
  readonly term: TermSelector;
  readonly alias: string;
  readonly displayName?: string;
}

export interface CreateGovernedTermInput {
  readonly id?: string;
  readonly canonicalName: string;
  readonly kind: TermKind;
  readonly description?: string;
  readonly aliases?: ReadonlyArray<string>;
}

export type TagGovernanceFilter = "governed" | "ungoverned";

export interface GovernTagInput {
  readonly tagId: TagId;
  readonly term: TermSelector;
  readonly replace?: TermSelector;
}

export interface TagGovernanceInspection {
  readonly tag: Tag;
  readonly term?: TermInspection;
}

export interface TermAudit {
  readonly selector: string;
  readonly inspection: TermInspection;
  readonly entries: ReadonlyArray<MigrationJournalEntry>;
}

export interface TermGovernanceService {
  readonly create: (
    input: CreateGovernedTermInput
  ) => Effect.Effect<
    TermInspection,
    | AmbiguousTermNameError
    | TermAlreadyExistsError
    | ValidationError
    | RepositoryError
    | TermNotFoundError
    | TermMigrationError
  >;
  readonly inspectTag: (
    tagId: TagId
  ) => Effect.Effect<
    TagGovernanceInspection,
    | AmbiguousTermNameError
    | TagNotFoundError
    | TermNotFoundError
    | RepositoryError
    | TermMigrationError
  >;
  readonly listTags: (
    governance?: TagGovernanceFilter
  ) => Effect.Effect<
    ReadonlyArray<TagGovernanceInspection>,
    AmbiguousTermNameError | TermNotFoundError | RepositoryError | TermMigrationError
  >;
  readonly governTag: (
    input: GovernTagInput
  ) => Effect.Effect<
    TagGovernanceInspection,
    | AmbiguousTermNameError
    | RepositoryError
    | TagNotFoundError
    | TermMigrationError
    | TermNotFoundError
    | ValidationError
  >;
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
