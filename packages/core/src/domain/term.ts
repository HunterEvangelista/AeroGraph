/**
 * Term registry domain model
 * Governed terminology with rename-safe identity for tags.
 *
 * Tags can change their display name while preserving a stable term identity.
 * The `term_names.name` field stores the normalized lookup form while
 * `term_names.displayName` preserves original casing/spelling for UI output.
 */
import { Schema } from "effect";
import { NonNegativeInteger } from "./scalars.js";

export const TERM_KINDS = [
  "brand",
  "project",
  "feature",
  "api",
  "concept",
  "package",
  "other",
] as const;

export const TERM_STATUSES = ["active", "deprecated", "merged"] as const;

export const TERM_NAME_KINDS = ["canonical", "alias", "deprecated"] as const;

export const MIGRATION_OPERATIONS = ["rename", "merge", "deprecate", "create"] as const;

export const normalizeTermName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");

const TermNameText = Schema.String.check(Schema.isNonEmpty(), Schema.isPattern(/^[^,]+$/));

const MutableTermNameKind = Schema.Literals(["alias", "deprecated"]);

// ============================================================================
// Term Kind
// ============================================================================

export const TermKind = Schema.Literals(TERM_KINDS);
export type TermKind = typeof TermKind.Type;

// ============================================================================
// Term Status
// ============================================================================

export const TermStatus = Schema.Literals(TERM_STATUSES);
export type TermStatus = typeof TermStatus.Type;

// ============================================================================
// Term Name Kind
// ============================================================================

export const TermNameKind = Schema.Literals(TERM_NAME_KINDS);
export type TermNameKind = typeof TermNameKind.Type;

// ============================================================================
// Migration Operation
// ============================================================================

export const MigrationOperation = Schema.Literals(MIGRATION_OPERATIONS);
export type MigrationOperation = typeof MigrationOperation.Type;

// ============================================================================
// Term Schema
// ============================================================================

export const TermIdSchema = Schema.String.pipe(Schema.brand("TermId"));

export const Term = Schema.Struct({
  id: TermIdSchema,
  canonicalName: TermNameText,
  kind: TermKind,
  description: Schema.optional(Schema.String),
  status: TermStatus,
  mergedIntoId: Schema.optional(TermIdSchema),
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
});

export type Term = typeof Term.Type;
export type TermId = (typeof Term.Type)["id"];

// ============================================================================
// Term Name Schema
// ============================================================================

export const TermName = Schema.Struct({
  termId: TermIdSchema,
  kind: TermKind,
  name: TermNameText,
  displayName: TermNameText,
  nameKind: TermNameKind,
  createdAt: Schema.DateFromString,
});

export type TermName = typeof TermName.Type;

// ============================================================================
// Migration Journal Entry Schema
// ============================================================================

export const JournalEntryIdSchema = Schema.String.pipe(Schema.brand("JournalEntryId"));

export const MigrationJournalEntry = Schema.Struct({
  id: JournalEntryIdSchema,
  operation: MigrationOperation,
  kind: Schema.optional(TermKind),
  fromName: Schema.String.check(Schema.isNonEmpty()),
  toName: Schema.String.check(Schema.isNonEmpty()),
  termId: TermIdSchema,
  affectedEntityIds: Schema.Array(Schema.String),
  affectedCount: NonNegativeInteger,
  reason: Schema.optional(Schema.String),
  appliedAt: Schema.DateFromString,
  appliedBy: Schema.optional(Schema.String),
  dryRun: Schema.Boolean,
});

export type MigrationJournalEntry = typeof MigrationJournalEntry.Type;
export type JournalEntryId = (typeof MigrationJournalEntry.Type)["id"];

// ============================================================================
// Term Creation Input
// ============================================================================

export const CreateTermInput = Schema.Struct({
  id: Schema.String.check(Schema.isNonEmpty()),
  canonicalName: TermNameText,
  kind: TermKind,
  description: Schema.optional(Schema.String),
  aliases: Schema.optional(Schema.Array(TermNameText)),
});

export type CreateTermInput = typeof CreateTermInput.Type;

// ============================================================================
// Term Update Input
// ============================================================================

export const UpdateTermInput = Schema.Struct({
  description: Schema.optional(Schema.String),
  status: Schema.optional(TermStatus),
  mergedIntoId: Schema.optional(TermIdSchema),
});

export type UpdateTermInput = typeof UpdateTermInput.Type;

// ============================================================================
// Term Name Creation Input
// ============================================================================

export const CreateTermNameInput = Schema.Struct({
  termId: TermIdSchema,
  kind: TermKind,
  name: TermNameText,
  displayName: TermNameText,
  nameKind: MutableTermNameKind,
});

export type CreateTermNameInput = typeof CreateTermNameInput.Type;

// ============================================================================
// Term Name Update Input
// ============================================================================

export const UpdateTermNameInput = Schema.Struct({
  displayName: Schema.optional(TermNameText),
  nameKind: Schema.optional(MutableTermNameKind),
});

export type UpdateTermNameInput = typeof UpdateTermNameInput.Type;

// ============================================================================
// Migration Journal Record Input
// ============================================================================

export const RecordJournalEntryInput = Schema.Struct({
  id: Schema.String.check(Schema.isNonEmpty()),
  operation: MigrationOperation,
  kind: Schema.optional(TermKind),
  fromName: Schema.String.check(Schema.isNonEmpty()),
  toName: Schema.String.check(Schema.isNonEmpty()),
  termId: TermIdSchema,
  affectedEntityIds: Schema.Array(Schema.String),
  reason: Schema.optional(Schema.String),
  appliedBy: Schema.optional(Schema.String),
  dryRun: Schema.Boolean,
});

export type RecordJournalEntryInput = typeof RecordJournalEntryInput.Type;
