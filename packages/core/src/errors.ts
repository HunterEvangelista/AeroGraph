/**
 * Core error types
 * Typed errors for use with Effect
 */
import { Data } from "effect";

// ============================================================================
// Base Errors
// ============================================================================

export class RepositoryError extends Data.TaggedError("RepositoryError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
  readonly field?: string;
  readonly cause?: unknown;
}> {}

// ============================================================================
// Not Found Errors
// ============================================================================

export class EntityNotFoundError extends Data.TaggedError("EntityNotFoundError")<{
  readonly entityId: string;
  readonly message?: string;
}> {}

export class TagNotFoundError extends Data.TaggedError("TagNotFoundError")<{
  readonly tagId: string;
  readonly message?: string;
}> {}

export class TermNotFoundError extends Data.TaggedError("TermNotFoundError")<{
  readonly name: string;
  readonly message?: string;
}> {}

export class TermAlreadyExistsError extends Data.TaggedError("TermAlreadyExistsError")<{
  readonly name: string;
  readonly message?: string;
}> {}

export class AmbiguousTermNameError extends Data.TaggedError("AmbiguousTermNameError")<{
  readonly name: string;
  readonly candidates: ReadonlyArray<string>;
  readonly message?: string;
}> {}

export class TermMigrationError extends Data.TaggedError("TermMigrationError")<{
  readonly message: string;
  readonly operation?: string;
  readonly cause?: unknown;
}> {}

export class LinkNotFoundError extends Data.TaggedError("LinkNotFoundError")<{
  readonly linkId: string;
  readonly message?: string;
}> {}

export class VersionNotFoundError extends Data.TaggedError("VersionNotFoundError")<{
  readonly entityId: string;
  readonly version: number;
  readonly message?: string;
}> {}

// ============================================================================
// Configuration Errors
// ============================================================================

export class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly message: string;
  readonly path?: string;
  readonly cause?: unknown;
}> {}

export class WorkspaceNotFoundError extends Data.TaggedError("WorkspaceNotFoundError")<{
  readonly path: string;
  readonly message?: string;
}> {}

export class WorkspaceAlreadyExistsError extends Data.TaggedError("WorkspaceAlreadyExistsError")<{
  readonly path: string;
  readonly message?: string;
}> {}

// ============================================================================
// Database Errors
// ============================================================================

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class MigrationError extends Data.TaggedError("MigrationError")<{
  readonly message: string;
  readonly version?: number;
  readonly cause?: unknown;
}> {}

// ============================================================================
// Error Type Union
// ============================================================================

export type KiokuError =
  | RepositoryError
  | ValidationError
  | EntityNotFoundError
  | TagNotFoundError
  | TermNotFoundError
  | TermAlreadyExistsError
  | AmbiguousTermNameError
  | TermMigrationError
  | LinkNotFoundError
  | VersionNotFoundError
  | ConfigError
  | WorkspaceNotFoundError
  | WorkspaceAlreadyExistsError
  | DatabaseError
  | MigrationError;
