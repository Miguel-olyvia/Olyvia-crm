/**
 * Records the REAL Google API token cost of an AI gateway call, separate
 * from the flat AI-credit price charged to the customer (aiCreditsCosts.ts).
 *
 * aiCreditsCosts.ts is a business decision ("charge 1/2/3 credits per
 * action"), not a measurement. callAiGateway() already extracts the real
 * token usage from Gemini's response (usageMetadata) into a `usage` field,
 * but until this helper existed nothing read it — it was computed and
 * discarded. Without it there is no way to tell whether the flat credit
 * price for an operation actually covers what Olyvia pays Google for it.
 *
 * Call this once per request, after the AI operation's own credits check
 * (checkAndConsumeAiCredits) and after callAiGateway() has returned —
 * whether the response ultimately succeeded or not is up to the caller;
 * pass whatever `usage` came back (or undefined if the call never reached
 * a response with usageMetadata, e.g. an interrupted stream).
 *
 * Best-effort: logs and swallows its own errors, same as refundAiCredits —
 * a logging failure must never affect the actual AI response given to the
 * user.
 */

// deno-lint-ignore no-explicit-any
type SupabaseClientLike = any;

export interface AiGatewayUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export async function logAiGatewayUsage(
  supabaseAdminClient: SupabaseClientLike,
  organizationId: string,
  operation: string,
  creditsCharged: number,
  usage?: AiGatewayUsage,
): Promise<void> {
  try {
    const { error } = await supabaseAdminClient.from("ai_gateway_usage_log").insert({
      organization_id: organizationId,
      operation,
      credits_charged: creditsCharged,
      prompt_tokens: usage?.prompt_tokens ?? null,
      completion_tokens: usage?.completion_tokens ?? null,
      total_tokens: usage?.total_tokens ?? null,
    });
    if (error) {
      console.error("[aiUsageLog] failed to record ai_gateway_usage_log:", error.message);
    }
  } catch (e) {
    console.error("[aiUsageLog] threw while recording ai_gateway_usage_log:", e);
  }
}
