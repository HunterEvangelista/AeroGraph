/**
 * Next Command domain model
 * Runnable follow-up suggestions emitted by prior commands
 */
import { Schema } from "effect";
import { PositiveInteger } from "./scalars";

// ============================================================================
// Command Types
// ============================================================================

export const NextCommandTypeSchema = Schema.Literals(["traverse", "related_to"]);
export type NextCommandType = typeof NextCommandTypeSchema.Type;

// ============================================================================
// Next Command Schema
// ============================================================================

export const NextCommandIdSchema = PositiveInteger.pipe(Schema.brand("NextCommandId"));

export const NextCommandSchema = Schema.Struct({
  id: NextCommandIdSchema,
  entityId: Schema.String,
  prefix: Schema.String.check(Schema.isNonEmpty()),
  commandType: NextCommandTypeSchema,
  createdAt: Schema.DateFromString,
});

export type NextCommand = typeof NextCommandSchema.Type;
export type NextCommandId = (typeof NextCommandSchema.Type)["id"];

// ============================================================================
// Next Command Creation Input
// ============================================================================

export const CreateNextCommandInputSchema = Schema.Struct({
  entityId: Schema.String.check(Schema.isNonEmpty()),
  commandType: NextCommandTypeSchema,
  prefix: Schema.String.check(Schema.isNonEmpty()),
});

export type CreateNextCommandInput = typeof CreateNextCommandInputSchema.Type;
