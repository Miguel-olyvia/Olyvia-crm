/**
 * AI gateway helper — single point of configuration for the model provider.
 *
 * Calls Vercel AI Gateway's OpenAI-compatible chat completions endpoint,
 * which fronts multiple providers (Google, OpenAI, Anthropic, ...) behind
 * one API. This replaces a previous Gemini-direct setup (itself a
 * Lovable → Gemini migration) so spend limits, audit logs, and automatic
 * provider fallback are centralized instead of tied to a single provider.
 * Centralizes the endpoint URL and API key so a future provider swap is a
 * one-file change instead of touching every Edge Function that calls the
 * model. Callers keep full control over the request body (model, messages,
 * tools, stream, ...) — this only injects the URL and Authorization header.
 */

const AI_GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";

export function getAiGatewayKey(): string {
  const key = Deno.env.get("AI_GATEWAY_API_KEY");
  if (!key) throw new Error("AI_GATEWAY_API_KEY is not configured");
  return key;
}

export async function callAiGateway(body: Record<string, unknown>): Promise<Response> {
  return await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getAiGatewayKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
