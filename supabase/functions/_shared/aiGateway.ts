/**
 * AI gateway helper — single point of configuration for the model provider.
 *
 * Centralizes the endpoint URL and API key so a future provider swap (like
 * the Lovable → Gemini migration this replaces) is a one-file change instead
 * of touching every Edge Function that calls the model. Callers keep full
 * control over the request body (model, messages, tools, stream, ...) — this
 * only injects the URL and Authorization header.
 */

const AI_GATEWAY_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

export function getAiGatewayKey(): string {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
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
