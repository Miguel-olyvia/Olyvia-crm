/**
 * Shared AI-credits gate for Edge Functions that call the AI gateway.
 *
 * Mirrors the pattern already used by rateLimit.ts (checkRateLimit /
 * rateLimitResponse): a small helper each caller invokes right before
 * `callAiGateway()`, plus a ready-made HTTP response builder for the
 * blocked case.
 *
 * Unlike rate limiting (abuse prevention), this is a BILLING gate — it
 * checks (and atomically consumes) an organization's AI-credit balance via
 * the `fn_check_and_consume_ai_credits(_organization_id, _amount)` Postgres
 * RPC, called through a service_role Supabase client so it runs with full DB
 * access regardless of the caller's own RLS.
 *
 * Usage (same shape as checkRateLimit/rateLimitResponse):
 *   const creditsResult = await checkAndConsumeAiCredits(supabaseAdmin, organizationId, AI_CREDIT_COSTS["ai-assistant"]);
 *   if (creditsResult.blocked) {
 *     return aiCreditsBlockedResponse(creditsResult, corsHeaders);
 *   }
 *   try {
 *     const response = await callAiGateway({ ... });
 *     ...
 *   } catch (e) {
 *     await refundAiCredits(supabaseAdmin, organizationId, AI_CREDIT_COSTS["ai-assistant"]);
 *     throw e;
 *   }
 *
 * ---------------------------------------------------------------------------
 * ATOMIC DEBIT / REFUND-ON-FAILURE — read before touching this file
 * ---------------------------------------------------------------------------
 * `fn_check_and_consume_ai_credits` debits the credit in the SAME statement
 * that checks the balance (check+consume is one atomic DB operation, to
 * avoid a check -> [race] -> consume gap under concurrent requests). That
 * means the credit is already spent by the time control returns to the
 * caller — BEFORE `callAiGateway()` has even been invoked.
 *
 * If the subsequent `callAiGateway()` call then fails — a thrown exception,
 * or a non-ok response that reflects a genuine PROVIDER failure (e.g. 5xx,
 * timeout) rather than a problem with the caller's own request — the
 * organization would otherwise be charged for an AI response it never
 * received.
 *
 * The mitigation is `refundAiCredits()`: every caller wraps its
 * `callAiGateway()` call (after a successful, non-blocked credits check) so
 * that a gateway failure triggers `refundAiCredits()` with the same amount,
 * via the symmetric `fn_refund_ai_credits(_organization_id, _amount)` RPC.
 *
 * This is a best-effort mitigation, NOT a distributed transaction spanning
 * the credits RPC and the upstream Gemini call — there is a small window
 * where a refund itself could fail (network blip on the refund call). It
 * covers the common failure mode (upstream error/timeout) so it doesn't
 * silently cost the organization credits, without requiring a second
 * "confirm after success" DB round trip.
 *
 * The alternative design — only debit AFTER a confirmed successful AI
 * response — would remove the need for a refund path entirely, but
 * reintroduces the check -> [race] -> consume gap the atomic RPC exists to
 * close, and adds a second write to every request. That trade-off is a
 * product/business decision, not one this helper should make silently, so
 * it's documented here instead.
 */

import { captureError } from "./sentry.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClientLike = any;

/** Reason returned when the credits system itself could not be consulted. */
export const CREDITS_CHECK_UNAVAILABLE = "credits_check_unavailable";

function creditsUnavailable(): AiCreditsCheckResult {
  return { blocked: true, reason: CREDITS_CHECK_UNAVAILABLE };
}

export interface AiCreditsCheckResult {
  blocked: boolean;
  reason?: string;
  source?: string;
  limit_value?: number | null;
  used_value?: number | null;
  balance_credits?: number | null;
}

/**
 * Checks AND atomically consumes `amount` AI credits for `organizationId`
 * via `fn_check_and_consume_ai_credits`. Must be called with a service_role
 * Supabase client — the RPC is not meant to be exposed to anon/authenticated
 * roles.
 *
 * FAILS CLOSED: an RPC error, an empty result or a thrown exception returns
 * `{ blocked: true, reason: "credits_check_unavailable" }`. Billing must never
 * be bypassed because the credits system is down. `aiCreditsBlockedResponse`
 * maps that reason to a 503 instead of the 402 upsell.
 */
export async function checkAndConsumeAiCredits(
  supabaseAdminClient: SupabaseClientLike,
  organizationId: string,
  amount: number,
): Promise<AiCreditsCheckResult> {
  try {
    const { data, error } = await supabaseAdminClient.rpc("fn_check_and_consume_ai_credits", {
      _organization_id: organizationId,
      _amount: amount,
    });

    if (error) {
      console.error("[aiCredits] fn_check_and_consume_ai_credits failed — failing closed:", error.message);
      await captureError(new Error(`fn_check_and_consume_ai_credits: ${error.message}`), {
        function: "aiCredits",
        organization_id: organizationId,
      });
      return creditsUnavailable();
    }

    // PostgREST can wrap a single-row RPC result either as a plain object or
    // as a one-element array/rowset depending on the function's return type
    // — normalize both shapes.
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      console.error("[aiCredits] fn_check_and_consume_ai_credits returned no data — failing closed");
      await captureError(new Error("fn_check_and_consume_ai_credits returned no data"), {
        function: "aiCredits",
        organization_id: organizationId,
      });
      return creditsUnavailable();
    }

    return {
      blocked: row.blocked === true,
      reason: row.reason ?? undefined,
      source: row.source ?? undefined,
      limit_value: row.limit_value ?? null,
      used_value: row.used_value ?? null,
      balance_credits: row.balance_credits ?? null,
    };
  } catch (e) {
    console.error("[aiCredits] fn_check_and_consume_ai_credits threw — failing closed:", e);
    await captureError(e, { function: "aiCredits", organization_id: organizationId });
    return creditsUnavailable();
  }
}

/**
 * Refunds `amount` AI credits to `organizationId` via `fn_refund_ai_credits`
 * — the symmetric counterpart of `checkAndConsumeAiCredits`'s debit. Call
 * this from a catch block wrapped around `callAiGateway()` (or after
 * checking `response.ok` and finding a genuine provider-side failure), right
 * after a debit that actually happened (i.e. `checkAndConsumeAiCredits`
 * returned `blocked: false`) — see the module-level comment for why this
 * exists.
 *
 * Best-effort: logs and swallows its own errors rather than throwing, so a
 * failed refund never masks or replaces the real upstream error the caller
 * is already handling/rethrowing.
 */
export async function refundAiCredits(
  supabaseAdminClient: SupabaseClientLike,
  organizationId: string,
  amount: number,
): Promise<void> {
  try {
    const { error } = await supabaseAdminClient.rpc("fn_refund_ai_credits", {
      _organization_id: organizationId,
      _amount: amount,
    });
    if (error) {
      console.error("[aiCredits] fn_refund_ai_credits failed:", error.message);
    }
  } catch (e) {
    console.error("[aiCredits] fn_refund_ai_credits threw:", e);
  }
}

/**
 * Builds the response for a blocked AI-credit check. A genuine
 * out-of-credits/limit block is the standard 402 Payment Required with the
 * upsell payload; `credits_check_unavailable` (fail-closed) is a 503, since
 * offering a purchase would be wrong when the credits system is down. Callers
 * that use this helper get the 503 mapping for free. Same style as
 * `rateLimitResponse()` — callers still own their own CORS headers.
 */
export function aiCreditsBlockedResponse(
  result: AiCreditsCheckResult,
  corsHeaders: Record<string, string>,
): Response {
  if (result.reason === CREDITS_CHECK_UNAVAILABLE) {
    return new Response(
      JSON.stringify({ error: CREDITS_CHECK_UNAVAILABLE, reason: CREDITS_CHECK_UNAVAILABLE }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  return new Response(
    JSON.stringify({
      error: "limit_exceeded",
      limit_type: "ai_credits",
      reason: result.reason,
      limit_value: result.limit_value,
      used_value: result.used_value,
      balance_credits: result.balance_credits,
      upsell: {
        canUpgrade: true,
        canBuyCredits: true,
      },
    }),
    {
      status: 402,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    },
  );
}
