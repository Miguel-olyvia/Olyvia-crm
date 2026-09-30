/**
 * stripe-webhook
 * ============================================================
 * SECURITY-CRITICAL — this is the single most sensitive endpoint in the
 * billing system: it is the only path (besides a human with service_role
 * access) that can mark an `invoices` row as 'pago', which in turn fires
 * `fn_credit_org_on_invoice_paid` and credits real money-equivalent AI
 * credits to an organization. Read fully before touching.
 *
 * Public endpoint (verify_jwt = false in supabase/config.toml) — Stripe
 * cannot send our Supabase JWT, so this function CANNOT rely on
 * Authorization/JWT auth at all. Trust comes exclusively from verifying the
 * `Stripe-Signature` header against STRIPE_WEBHOOK_SECRET (see
 * _shared/stripe.ts#verifyStripeWebhookSignature). Any request that fails
 * that check — including one sent with no signature, or when the secret
 * itself isn't configured yet — is rejected with 400 BEFORE any parsing or
 * DB access happens. There is no fallback/degraded processing path here:
 * unlike stripe-create-checkout-session, this function does nothing at all
 * until STRIPE_WEBHOOK_SECRET is configured.
 *
 * Raw-body requirement: the signature is computed over the exact raw
 * request bytes Stripe sent. `await req.text()` MUST happen before any
 * `JSON.parse` — re-serializing a parsed-then-stringified body would very
 * likely produce different bytes (key order, spacing) and break
 * verification. This is why the JSON parse below happens strictly AFTER
 * signature verification succeeds.
 *
 * Anti-spoofing on checkout.session.completed: a valid Stripe signature
 * proves the EVENT came from Stripe, but Stripe's `session.metadata` is
 * data Stripe merely relays — it was originally set by
 * stripe-create-checkout-session from OUR OWN request, so it is already
 * trustworthy in that sense. The extra belt-and-braces here is the SQL
 * UPDATE's `WHERE id = invoice_id AND stripe_checkout_session_id =
 * session.id` — matching on BOTH fields means even a theoretical bug or
 * tampering that produced a mismatched invoice_id for a given session
 * cannot mark the wrong invoice as paid; the row simply won't match and
 * zero rows are updated.
 *
 * Idempotency / retries: every event id is recorded in
 * stripe_webhook_events first (see _shared/stripeWebhookLogic.ts). A DB error
 * or an unexpectedly empty UPDATE throws -> Sentry -> HTTP 500 so Stripe
 * retries; verified business mismatches are recorded 'rejected' and answered
 * 200. All business rules live in _shared/stripeWebhookLogic.ts.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { captureError, initSentry } from "../_shared/sentry.ts";
import { stripeRequest, verifyStripeWebhookSignature } from "../_shared/stripe.ts";
import { processStripeEvent } from "../_shared/stripeWebhookLogic.ts";

initSentry();

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ------------------------------------------------------------------
  // 1. Raw body FIRST — required for signature verification (see header
  //    comment). Do not parse/transform before this point.
  // ------------------------------------------------------------------
  const rawBody = await req.text();
  const sigHeader = req.headers.get("stripe-signature") ?? "";
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  // No secret configured yet (Stripe not activated) OR missing signature
  // header: reject immediately, no processing whatsoever. This is the
  // feature-flag for this whole function — mirrors isStripeConfigured()'s
  // role in stripe-create-checkout-session, but here "not configured"
  // means "refuse the request", not "fall back to a manual flow", because
  // there is no legitimate caller of this endpoint other than Stripe.
  if (!webhookSecret) {
    console.error("stripe-webhook: STRIPE_WEBHOOK_SECRET não está configurado — rejeitando pedido");
    return jsonResponse({ error: "Webhook not configured" }, 400);
  }

  const isValidSignature = await verifyStripeWebhookSignature(
    rawBody,
    sigHeader,
    webhookSecret,
  );
  if (!isValidSignature) {
    console.error("stripe-webhook: assinatura inválida — rejeitando pedido, payload NÃO processado");
    return jsonResponse({ error: "Invalid signature" }, 400);
  }

  // ------------------------------------------------------------------
  // 2. Only now, after a verified signature, is it safe to parse the body.
  // ------------------------------------------------------------------
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  // Service-role client — this endpoint has no user JWT at all.
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const result = await processStripeEvent(
      supabaseAdmin,
      event,
      (error, context) => captureError(error, context),
      {
        fetchSubscription: (id) =>
          stripeRequest(`subscriptions/${id}`, {}, { method: "GET" }),
        cancelSubscription: async (id) => {
          try {
            return await stripeRequest(`subscriptions/${id}`, {}, { method: "DELETE" });
          } catch (e) {
            // Already gone on Stripe's side: nothing left to cancel.
            if ((e as { status?: number })?.status === 404) return null;
            throw e;
          }
        },
        resolvePaymentIntentRefs: async (paymentIntentId) => {
          const pi = await stripeRequest(
            `payment_intents/${paymentIntentId}`,
            {},
            { method: "GET" },
          );
          const sessions = await stripeRequest(
            `checkout/sessions?payment_intent=${encodeURIComponent(paymentIntentId)}`,
            {},
            { method: "GET" },
          );
          return {
            invoiceId: typeof pi?.invoice === "string" ? pi.invoice : null,
            sessionId: sessions?.data?.[0]?.id ?? null,
          };
        },
      },
    );
    if (result.httpStatus === 409) {
      // Same event still being processed elsewhere: ask Stripe to retry.
      return jsonResponse({ error: "Event in progress" }, 409);
    }
    return jsonResponse({ received: true, outcome: result.outcome }, 200);
  } catch (error: unknown) {
    console.error("stripe-webhook error:", error);
    await captureError(error, { function: "stripe-webhook", eventType: event?.type });
    // Non-200 tells Stripe to retry this event later.
    return jsonResponse({ error: "Internal error processing webhook" }, 500);
  }
});
