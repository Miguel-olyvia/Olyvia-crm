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
 * Idempotency: Stripe explicitly documents that webhook events can be
 * delivered more than once (retries on slow/ambiguous responses). Two
 * independent safety nets:
 *   1. Application-level: if the invoice is already status='pago', return
 *      200 immediately without repeating the credit/subscription update.
 *   2. DB-level: idx_invoices_stripe_checkout_session_id (unique, partial)
 *      from 20261112420000 ensures a given Checkout Session can only ever
 *      be linked to one invoice row in the first place.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { captureError, initSentry } from "../_shared/sentry.ts";
import { verifyStripeWebhookSignature } from "../_shared/stripe.ts";

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

  // Service-role client — this endpoint has no user JWT at all, and is the
  // one place in the codebase intentionally allowed to transition
  // invoices.status to 'pago'/'cancelado' and write organization_subscriptions,
  // exactly as documented in 20261112390000 and 20261111040000.
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const invoiceId: string | undefined = session.metadata?.invoice_id;
        const organizationId: string | undefined = session.metadata?.organization_id;

        if (!invoiceId) {
          // Not one of ours (or a bug upstream) — nothing to do, but this
          // is a verified genuine Stripe event, so still ack with 200 to
          // stop Stripe from retrying it forever.
          console.error("stripe-webhook: checkout.session.completed sem metadata.invoice_id", session.id);
          break;
        }

        // Idempotency (application-level): if already paid, do nothing.
        const { data: existingInvoice } = await supabaseAdmin
          .from("invoices")
          .select("id, status")
          .eq("id", invoiceId)
          .maybeSingle();

        if (existingInvoice?.status === "pago") {
          break;
        }

        // The WHERE clause matches BOTH id AND stripe_checkout_session_id —
        // see header comment on why this double-match matters. If zero rows
        // match, this invoice/session pair doesn't correspond (e.g. stale
        // metadata) and nothing is silently marked paid.
        const { data: updatedRows, error: updateError } = await supabaseAdmin
          .from("invoices")
          .update({
            status: "pago",
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: session.payment_intent ?? null,
          })
          .eq("id", invoiceId)
          .eq("stripe_checkout_session_id", session.id)
          .select("id");

        if (updateError) {
          throw new Error(`Failed to mark invoice as paid: ${updateError.message}`);
        }
        if (!updatedRows || updatedRows.length === 0) {
          console.error(
            "stripe-webhook: checkout.session.completed não encontrou fatura correspondente (id + stripe_checkout_session_id)",
            { invoiceId, sessionId: session.id },
          );
          break;
        }

        // Subscription checkout (mode='subscription') also carries the
        // target plan — activate it on organization_subscriptions.
        const targetPlan: string | undefined = session.metadata?.target_plan;
        if (session.mode === "subscription" && targetPlan && organizationId) {
          const { error: subError } = await supabaseAdmin
            .from("organization_subscriptions")
            .update({
              plan: targetPlan,
              status: "active",
              stripe_customer_id: session.customer ?? null,
              stripe_subscription_id: session.subscription ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq("organization_id", organizationId);

          if (subError) {
            console.error("stripe-webhook: failed to update organization_subscriptions after checkout", subError);
          }
        }

        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const currentPeriodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null;

        const { error: subError } = await supabaseAdmin
          .from("organization_subscriptions")
          .update({
            status: subscription.status,
            current_period_end: currentPeriodEnd,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id);

        if (subError) {
          console.error("stripe-webhook: failed to sync customer.subscription.updated", subError);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;

        const { error: subError } = await supabaseAdmin
          .from("organization_subscriptions")
          .update({
            status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id);

        if (subError) {
          console.error("stripe-webhook: failed to sync customer.subscription.deleted", subError);
        }
        break;
      }

      case "invoice.payment_failed": {
        // Stripe's own recurring-invoice object (subscription renewal
        // failure) — NOT our `invoices` table, which only tracks
        // one-off/plan-upgrade purchases made through this app's checkout.
        const stripeInvoice = event.data.object;
        const customerId: string | undefined = stripeInvoice.customer;

        if (!customerId) break;

        const { error: subError } = await supabaseAdmin
          .from("organization_subscriptions")
          .update({
            status: "past_due",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId);

        if (subError) {
          console.error("stripe-webhook: failed to sync invoice.payment_failed", subError);
        }
        break;
      }

      default:
        // Unhandled event type — ack quickly with 200, as Stripe
        // recommends, rather than erroring on events we don't care about.
        break;
    }

    return jsonResponse({ received: true }, 200);
  } catch (error: any) {
    console.error("stripe-webhook error:", error);
    await captureError(error, { function: "stripe-webhook", eventType: event?.type });
    // Non-200 tells Stripe to retry this event later — appropriate here
    // since the failure is on our side (DB/unexpected error), not a
    // signature/validation problem.
    return jsonResponse({ error: "Internal error processing webhook" }, 500);
  }
});
