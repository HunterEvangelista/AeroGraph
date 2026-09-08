import { Cause, Option, Schema } from "effect";
import type { ExecutionErrorCategory, ExecutionOutcome } from "./execution-event";

const ERROR_CATEGORIES = {
  AmbiguousEntityIdError: "validation",
  AmbiguousTermNameError: "validation",
  ConfigError: "config",
  DatabaseError: "database",
  DuplicateOption: "usage",
  EditorConfigurationError: "config",
  EditorFileError: "validation",
  EditorProcessError: "internal",
  EntityNotFoundError: "not_found",
  InvalidCodeRefInputError: "validation",
  InvalidContextQueryError: "validation",
  InvalidHistoryArgsError: "validation",
  InvalidLinkCommandError: "validation",
  InvalidLinkTypeError: "validation",
  InvalidNextArgsError: "validation",
  InvalidQueryError: "validation",
  InvalidStoryStatusError: "validation",
  InvalidValue: "usage",
  LinkNotFoundError: "not_found",
  MissingArgument: "usage",
  MissingOption: "usage",
  MigrationError: "database",
  MigrationJournalEntryNotFoundError: "not_found",
  NoNextSuggestionError: "not_found",
  NoUpdatesError: "validation",
  NotACodeRefError: "validation",
  NotADocError: "validation",
  NotAStoryError: "validation",
  RepositoryError: "repository",
  ShowHelp: "usage",
  TagNotFoundError: "not_found",
  TermAlreadyExistsError: "conflict",
  TermMigrationError: "validation",
  TermNotFoundError: "not_found",
  UnexpectedArgument: "usage",
  UnknownSubcommand: "usage",
  UnrecognizedOption: "usage",
  UserError: "usage",
  ValidationError: "validation",
  VersionNotFoundError: "not_found",
  WorkspaceAlreadyExistsError: "conflict",
  WorkspaceNotFoundError: "workspace",
} as const satisfies Readonly<Record<string, ExecutionErrorCategory>>;

const TaggedErrorSchema = Schema.Struct({ _tag: Schema.String });
const categoryByTag = new Map<string, ExecutionErrorCategory>(Object.entries(ERROR_CATEGORIES));

export const errorCategory = <E>(error: E): ExecutionErrorCategory =>
  Option.match(Schema.decodeUnknownOption(TaggedErrorSchema)(error), {
    onNone: () => "unknown",
    onSome: (taggedError) => categoryByTag.get(taggedError._tag) ?? "unknown",
  });

export interface ClassifiedExit {
  readonly outcome: ExecutionOutcome;
  readonly errorCategory?: ExecutionErrorCategory | undefined;
}

export const classifyCause = <E>(cause: Cause.Cause<E>): ClassifiedExit => {
  if (Cause.hasInterruptsOnly(cause)) {
    return { outcome: "interrupted" };
  }
  if (Cause.hasDies(cause)) {
    return { outcome: "failure", errorCategory: "internal" };
  }

  const failure = cause.reasons.find(Cause.isFailReason);
  return {
    outcome: "failure",
    errorCategory: failure === undefined ? "unknown" : errorCategory(failure.error),
  };
};
