/**
 * @kioku/ai
 * AI integration for the Kioku knowledge platform
 *
 * This package provides:
 * - LLM provider abstraction (OpenAI, Anthropic, Ollama)
 * - Prompt templates for agents
 * - Structured output schemas
 *
 * Implementation coming in Phase 3.
 */

// Prompt templates
export {
  formatEntityContext,
  formatTagSuggestion,
  ONBOARDING_SYSTEM_PROMPT,
  QUERY_SYSTEM_PROMPT,
} from "./prompts/index.js";
export type {
  AIProvider,
  GenerateOptions,
  GenerateResult,
  Message,
  ProviderConfig,
  ProviderType,
} from "./providers/index.js";
// Provider abstraction
export {
  AIProviderError,
  AIProviderLive,
  AIProviderTag,
} from "./providers/index.js";

// Structured output schemas
export {
  OnboardingResult,
  QueryResult,
  SuggestedCodeRef,
  SuggestedDoc,
  SuggestedTag,
} from "./structured/index.js";
