/**
 * Structured Output Schemas
 * Effect Schema definitions for AI-generated structured outputs
 */
import { Schema } from "effect";

// ============================================================================
// Onboarding Output Schemas
// ============================================================================

export const SuggestedTag = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  parentId: Schema.optional(Schema.String),
});

export const SuggestedDoc = Schema.Struct({
  title: Schema.String,
  content: Schema.String,
  tags: Schema.Array(Schema.String),
});

export const SuggestedCodeRef = Schema.Struct({
  title: Schema.String,
  filePath: Schema.String,
  description: Schema.String,
  tags: Schema.Array(Schema.String),
  startLine: Schema.optional(Schema.Finite),
  endLine: Schema.optional(Schema.Finite),
});

export const OnboardingResult = Schema.Struct({
  tags: Schema.Array(SuggestedTag),
  docs: Schema.Array(SuggestedDoc),
  codeRefs: Schema.Array(SuggestedCodeRef),
  summary: Schema.String,
});

export type OnboardingResult = typeof OnboardingResult.Type;

// ============================================================================
// Query Output Schemas
// ============================================================================

export const QueryResult = Schema.Struct({
  relevantEntityIds: Schema.Array(Schema.String),
  summary: Schema.String,
  suggestedTags: Schema.Array(Schema.String),
  confidence: Schema.Finite,
});

export type QueryResult = typeof QueryResult.Type;
