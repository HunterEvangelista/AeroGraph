/**
 * AI Provider Abstraction
 * Wraps Vercel AI SDK for provider-agnostic LLM access
 */
import { Context, Effect, Layer } from "effect"

// ============================================================================
// Provider Types
// ============================================================================

export type ProviderType = "openai" | "anthropic" | "ollama"

export interface ProviderConfig {
  type: ProviderType
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface Message {
  role: "system" | "user" | "assistant"
  content: string
}

export interface GenerateOptions {
  messages: Message[]
  maxTokens?: number
  temperature?: number
  stream?: boolean
}

export interface GenerateResult {
  content: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

// ============================================================================
// AI Provider Interface
// ============================================================================

export interface AIProvider {
  /**
   * Generate a completion
   */
  readonly generate: (options: GenerateOptions) => Effect.Effect<GenerateResult, AIProviderError>

  /**
   * Generate structured output
   */
  readonly generateStructured: <T>(
    options: GenerateOptions & { schema: unknown }
  ) => Effect.Effect<T, AIProviderError>
}

// ============================================================================
// Error Types
// ============================================================================

import { Data } from "effect"

export class AIProviderError extends Data.TaggedError("AIProviderError")<{
  readonly message: string
  readonly provider?: string
  readonly cause?: unknown
}> {}

// ============================================================================
// AI Provider Tag
// ============================================================================

export class AIProviderTag extends Context.Tag("AIProvider")<AIProviderTag, AIProvider>() {}

// ============================================================================
// Placeholder Implementation
// ============================================================================

export const AIProviderLive = (_config: ProviderConfig) =>
  Layer.succeed(AIProviderTag, {
    generate: (_options) =>
      Effect.fail(
        new AIProviderError({
          message: "AI provider not yet implemented. Coming in Phase 3.",
        })
      ),
    generateStructured: (_options) =>
      Effect.fail(
        new AIProviderError({
          message: "AI provider not yet implemented. Coming in Phase 3.",
        })
      ),
  } satisfies AIProvider)
