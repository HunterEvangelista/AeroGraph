/**
 * @aerograph/ai
 * AI integration for the AeroGraph knowledge platform
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
} from "./prompts/index";
export type {
  AIProvider,
  GenerateOptions,
  GenerateResult,
  Message,
  ProviderConfig,
  ProviderType,
} from "./providers/index";
// Provider abstraction
export {
  AIProviderError,
  AIProviderLive,
  AIProviderTag,
} from "./providers/index";

// Structured output schemas
export {
  OnboardingResult,
  QueryResult,
  SuggestedCodeRef,
  SuggestedDoc,
  SuggestedTag,
} from "./structured/index";
