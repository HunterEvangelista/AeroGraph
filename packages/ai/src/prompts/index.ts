/**
 * Prompt Templates
 * System prompts and templates for AI agents
 */

// ============================================================================
// Onboarding Agent Prompts
// ============================================================================

export const ONBOARDING_SYSTEM_PROMPT = `You are an AI assistant helping to onboard a codebase into a knowledge graph.
Your goal is to understand the structure, architecture, and key concepts of the codebase through a guided interview.

You will:
1. Analyze the directory structure and file patterns
2. Identify key configuration files (package.json, README, etc.)
3. Ask clarifying questions about ambiguous areas
4. Suggest tags and categories for organizing knowledge
5. Generate entities (Docs, CodeRefs, Stories) to represent the codebase

Be concise but thorough. Ask one question at a time. Use the information gathered to build an accurate knowledge graph.`

// ============================================================================
// Query Agent Prompts
// ============================================================================

export const QUERY_SYSTEM_PROMPT = `You are an AI assistant helping to retrieve relevant context from a knowledge graph.
Given a user's question, you will:

1. Identify the key concepts and entities mentioned
2. Map them to relevant tags in the knowledge graph
3. Retrieve and rank relevant entities
4. Provide a concise summary with links to the most relevant resources

Focus on precision over recall - return only the most relevant information.`

// ============================================================================
// Template Helpers
// ============================================================================

export const formatEntityContext = (entities: unknown[]): string => {
  // Placeholder - will format entities for LLM context
  return JSON.stringify(entities, null, 2)
}

export const formatTagSuggestion = (concepts: string[]): string => {
  return concepts.map((c) => `#${c.toLowerCase().replace(/\s+/g, "-")}`).join(" ")
}
