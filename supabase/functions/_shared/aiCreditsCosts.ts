/**
 * Fixed AI-credit cost per Edge Function / AI operation.
 *
 * IMPORTANT: these numbers are a business STARTING POINT, not a measured or
 * exact calculation of the underlying model/token cost for each operation.
 * They exist so the product can charge a flat, predictable "AI credit" price
 * per action (the same way many SaaS products price "AI actions" or
 * "generations") instead of metering raw token usage. Adjust freely as
 * pricing strategy evolves — nothing in aiCredits.ts assumes these specific
 * values, it only reads whatever is defined here.
 *
 * Rough rationale for the current values:
 *  - 1 credit: cheap/short single-turn operations (a chat message, a quick
 *    suggestion) — ai-assistant, chat-widget-ai, quote-ai-assistant,
 *    suggest-schedule-assignee.
 *  - 2 credits: leads-dashboard-ai-report — a longer analytical report over
 *    a larger JSON payload.
 *  - 3 credits: generate-proposal-ai (produces a full commercial document)
 *    and import-contract-pdf (PDF processing/OCR-style extraction, which is
 *    comparatively expensive) — the two priciest operations of the seven.
 */
export const AI_CREDIT_COSTS = {
  "ai-assistant": 1,
  "chat-widget-ai": 1,
  "quote-ai-assistant": 1,
  "suggest-schedule-assignee": 1,
  "generate-proposal-ai": 3,
  "import-contract-pdf": 3,
  "leads-dashboard-ai-report": 2,
} as const;

export type AiCreditOperation = keyof typeof AI_CREDIT_COSTS;
