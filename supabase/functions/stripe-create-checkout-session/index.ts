/**
 * stripe-create-checkout-session
 * ============================================================
 * Authenticated (verify_jwt = true), org-scoped entry point for both billing
 * flows:
 *   - type: "creditos" -> buy a fixed AI-credit package (package_id) or a
 *                         custom amount of credits (credits_amount, max
 *                         10 000, at EUR 0.70/credit).
 *   - type: "plano"    -> buy a paid plan (starter | pro | enterprise),
 *                         priced from plan_pricing.
 *
 * BILLING BELONGS TO THE ROOT PAYER USER, not to an organization. One payer
 * may own several work orgs sharing one plan. So:
 *   - the billing org is resolved server-side (resolve_billing_organization_id)
 *     and every invoice / subscription / Stripe customer is keyed on it, never
 *     on the incoming organization_id;
 *   - only the root payer (resolve_root_payer_user_id) may start a checkout
 *     (403 otherwise, no system_admin exception);
 *   - nobody changes plan except through a Stripe payment verified
 *     server-side by stripe-webhook.
 *
 * Without STRIPE_SECRET_KEY the function answers 503 billing_unavailable: the
 * old "manual" mode created pending invoices anyone could later be tricked
 * into paying, and is gone.
 *
 * Pure rules live in _shared/checkoutPolicy.ts (unit-tested with vitest).
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  authErrorResponse,
  resolveCallerIdentity,
  validateOrgScope,
} from "../_shared/auth.ts";
import {
  creditsPriceEur,
  collectOpenPlanSessions,
  decidePendingCheckout,
  evaluateCreditsPurchase,
  ensureStripeCustomer,
  evaluatePlanPurchase,
  gateCheckout,
  validateCheckoutRequest,
} from "../_shared/checkoutPolicy.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { captureError, initSentry } from "../_shared/sentry.ts";
import { isStripeConfigured, stripeRequest } from "../_shared/stripe.ts";

initSentry();

function jsonResponse(
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** APP_URL, else SITE_URL, else the production origin. */
function resolveAppUrl(): string {
  const raw = Deno.env.get("APP_URL") || Deno.env.get("SITE_URL") ||
    "https://www.olyvia-ai.com";
  return raw.replace(/\/$/, "");
}

// deno-lint-ignore no-explicit-any
type Admin = any;

function ensureCustomer(
  admin: Admin,
  billingOrgId: string,
  existing: string | null | undefined,
): Promise<string> {
  return ensureStripeCustomer(
    admin,
    billingOrgId,
    existing,
    (idempotencyKey) =>
      stripeRequest(
        "customers",
        { metadata: { organization_id: billingOrgId } },
        { idempotencyKey },
      ),
  );
}

async function insertInvoice(
  admin: Admin,
  row: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await admin
    .from("invoices")
    .insert({ ...row, status: "pendente" })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Failed to create invoice");
  }
  return data.id as string;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Caller-scoped client: identity + org-scope run under the caller's RLS.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: { Authorization: req.headers.get("Authorization") ?? "" },
      },
    });

    // Service-role client: invoices are inserted only here (members have no
    // INSERT policy), plus billing-org resolution and Stripe id storage.
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const caller = await resolveCallerIdentity(req, supabase);

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders);
    }

    const parsed = validateCheckoutRequest(rawBody);
    if (!parsed.ok) {
      return jsonResponse(
        { error: parsed.error, details: parsed.details },
        parsed.status,
        corsHeaders,
      );
    }
    const { organization_id, type, package_id, credits_amount, target_plan } =
      parsed.data;

    const hasAccess = await validateOrgScope(supabase, caller, organization_id);
    if (!hasAccess) {
      return jsonResponse(
        { error: "Access denied to this organization" },
        403,
        corsHeaders,
      );
    }

    // ------------------------------------------------------------------
    // Billing org + root payer. Every write below uses billingOrgId.
    // ------------------------------------------------------------------
    const { data: billingOrgId, error: billingErr } = await supabaseAdmin.rpc(
      "resolve_billing_organization_id",
      { p_organization_id: organization_id },
    );
    if (billingErr || !billingOrgId) {
      throw new Error(
        `resolve_billing_organization_id failed: ${billingErr?.message ?? "null"}`,
      );
    }
    const { data: rootPayerId, error: payerErr } = await supabaseAdmin.rpc(
      "resolve_root_payer_user_id",
      { p_organization_id: organization_id },
    );
    if (payerErr) {
      throw new Error(`resolve_root_payer_user_id failed: ${payerErr.message}`);
    }
    const gate = gateCheckout({
      callerAnewUserId: caller.anewUserId,
      rootPayerUserId: rootPayerId,
      stripeConfigured: isStripeConfigured(),
    });
    if (!gate.ok) {
      return jsonResponse({ error: gate.error }, gate.status, corsHeaders);
    }

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("organization_subscriptions")
      .select("plan, status, stripe_customer_id, stripe_subscription_id")
      .eq("organization_id", billingOrgId)
      .maybeSingle();
    if (subErr) {
      throw new Error(`Failed to read subscription: ${subErr.message}`);
    }

    const appUrl = resolveAppUrl();
    const successUrl =
      `${appUrl}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}/billing?checkout=cancel`;

    // ================================================================
    // type === "creditos"
    // ================================================================
    if (type === "creditos") {
      const creditsDecision = evaluateCreditsPurchase(sub);
      if (!creditsDecision.ok) {
        return jsonResponse({ error: creditsDecision.error }, creditsDecision.status, corsHeaders);
      }
      let invoiceId: string;
      let lineItem: Record<string, unknown>;
      // Customer first: an invoice must never be left orphaned by a failure here.
      const customerId = await ensureCustomer(
        supabaseAdmin,
        billingOrgId,
        sub?.stripe_customer_id,
      );

      if (package_id) {
        const { data: pkg, error: pkgError } = await supabaseAdmin
          .from("ai_credit_packages")
          .select("id, name, price_sale, stripe_price_id, active")
          .eq("id", package_id)
          .maybeSingle();
        if (pkgError || !pkg) {
          return jsonResponse({ error: "package_not_found" }, 404, corsHeaders);
        }
        if (!pkg.active) {
          return jsonResponse({ error: "package_inactive" }, 400, corsHeaders);
        }

        invoiceId = await insertInvoice(supabaseAdmin, {
          organization_id: billingOrgId,
          type: "creditos",
          package_id: pkg.id,
          amount: pkg.price_sale,
          description: `Compra de créditos: ${pkg.name}`,
        });

        // The webhook checks amount_total against invoice.amount, so the
        // line item is always priced from the invoice amount.
        lineItem = {
          price_data: {
            currency: "eur",
            unit_amount: Math.round(Number(pkg.price_sale) * 100),
            product_data: { name: pkg.name },
          },
          quantity: 1,
        };
      } else {
        const amount = creditsPriceEur(credits_amount!);
        invoiceId = await insertInvoice(supabaseAdmin, {
          organization_id: billingOrgId,
          type: "creditos",
          credits_amount,
          amount,
          description: `Compra de ${credits_amount} créditos IA`,
        });
        lineItem = {
          price_data: {
            currency: "eur",
            unit_amount: Math.round(amount * 100),
            product_data: { name: `${credits_amount} créditos IA` },
          },
          quantity: 1,
        };
      }

      let session: { id: string; url: string };
      try {
        session = await stripeRequest("checkout/sessions", {
          mode: "payment",
          customer: customerId,
          line_items: [lineItem],
          metadata: { invoice_id: invoiceId, organization_id: billingOrgId },
          success_url: successUrl,
          cancel_url: cancelUrl,
        }, { idempotencyKey: `checkout:${invoiceId}` });
      } catch (stripeError) {
        console.error("stripe-create-checkout-session: Stripe error (creditos)", stripeError);
        await deleteOrphanInvoice(supabaseAdmin, invoiceId);
        throw stripeError;
      }

      await persistSessionId(supabaseAdmin, invoiceId, session.id);
      return jsonResponse({ mode: "stripe", url: session.url }, 200, corsHeaders);
    }

    // ================================================================
    // type === "plano"
    // ================================================================
    const decision = evaluatePlanPurchase(target_plan!, sub);
    if (!decision.ok) {
      return jsonResponse({ error: decision.error }, decision.status, corsHeaders);
    }

    // Any live plan checkout of this billing org blocks a different one.
    const { data: pendingRows, error: pendingErr } = await supabaseAdmin
      .from("invoices")
      .select("id, created_at, target_plan, stripe_checkout_session_id")
      .eq("organization_id", billingOrgId)
      .eq("type", "plano")
      .eq("status", "pendente")
      .not("stripe_checkout_session_id", "is", null)
      .order("created_at", { ascending: false });
    if (pendingErr) {
      throw new Error(`Failed to read pending invoices: ${pendingErr.message}`);
    }
    const openSessions = await collectOpenPlanSessions(
      pendingRows ?? [],
      (sessionId) =>
        stripeRequest(`checkout/sessions/${sessionId}`, {}, { method: "GET" }),
      async (invoiceId) => {
        const { error } = await supabaseAdmin
          .from("invoices")
          .update({ status: "cancelado" })
          .eq("id", invoiceId)
          .eq("status", "pendente");
        if (error) {
          throw new Error(`Failed to cancel dead pending invoice: ${error.message}`);
        }
      },
    );
    const pendingDecision = decidePendingCheckout(openSessions, target_plan!);
    if (pendingDecision.action === "reuse") {
      return jsonResponse({ mode: "stripe", url: pendingDecision.url }, 200, corsHeaders);
    }
    if (pendingDecision.action === "conflict") {
      return jsonResponse({ error: pendingDecision.error }, pendingDecision.status, corsHeaders);
    }

    const { data: pricing, error: pricingErr } = await supabaseAdmin
      .from("plan_pricing")
      .select("price_eur")
      .eq("plan", target_plan)
      .maybeSingle();
    if (pricingErr) {
      throw new Error(`Failed to read plan_pricing: ${pricingErr.message}`);
    }
    if (!pricing || pricing.price_eur === null) {
      return jsonResponse({ error: "plan_pricing_not_configured" }, 400, corsHeaders);
    }
    const amount = Number(pricing.price_eur);

    const customerId = await ensureCustomer(
      supabaseAdmin,
      billingOrgId,
      sub?.stripe_customer_id,
    );

    const invoiceId = await insertInvoice(supabaseAdmin, {
      organization_id: billingOrgId,
      type: "plano",
      target_plan,
      amount,
      description: `Upgrade de plano: ${target_plan}`,
    });

    let session: { id: string; url: string };
    try {
      session = await stripeRequest("checkout/sessions", {
        mode: "subscription",
        customer: customerId,
        // Stripe allows 30 min - 24 h; 23 h matches the reuse window.
        expires_at: Math.floor(Date.now() / 1000) + 23 * 60 * 60,
        line_items: [{
          price_data: {
            currency: "eur",
            unit_amount: Math.round(amount * 100),
            recurring: { interval: "month" },
            product_data: { name: `Plano ${target_plan}` },
          },
          quantity: 1,
        }],
        // target_plan stays for the compat window with the previous webhook;
        // the current webhook takes the plan from invoices.target_plan.
        metadata: {
          invoice_id: invoiceId,
          organization_id: billingOrgId,
          target_plan,
        },
        // Lets subscription-scoped webhook events find the invoice that
        // binds them even before checkout.session.completed is processed.
        subscription_data: {
          metadata: { invoice_id: invoiceId, organization_id: billingOrgId },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      }, { idempotencyKey: `checkout:${invoiceId}` });
    } catch (stripeError) {
      console.error("stripe-create-checkout-session: Stripe error (plano)", stripeError);
      await deleteOrphanInvoice(supabaseAdmin, invoiceId);
      throw stripeError;
    }

    await persistSessionId(supabaseAdmin, invoiceId, session.id);
    return jsonResponse({ mode: "stripe", url: session.url }, 200, corsHeaders);
  } catch (error: unknown) {
    const authResp = authErrorResponse(error, corsHeaders);
    if (authResp) return authResp;
    console.error("stripe-create-checkout-session error:", error);
    await captureError(error, { function: "stripe-create-checkout-session" });
    // Never leak internal messages (SQL, Stripe) to the browser.
    return jsonResponse({ error: "internal_error" }, 500, corsHeaders);
  }
});

async function persistSessionId(
  admin: Admin,
  invoiceId: string,
  sessionId: string,
): Promise<void> {
  const { error } = await admin
    .from("invoices")
    .update({ stripe_checkout_session_id: sessionId })
    .eq("id", invoiceId);
  if (error) {
    // Without this id the webhook cannot match the payment back.
    throw new Error(
      `Checkout session created but failed to persist stripe_checkout_session_id: ${error.message}`,
    );
  }
}

/** Best-effort: a pending invoice with no Stripe session is dead weight. */
async function deleteOrphanInvoice(admin: Admin, invoiceId: string): Promise<void> {
  try {
    await admin.from("invoices").delete().eq("id", invoiceId).eq("status", "pendente");
  } catch (e) {
    console.error("stripe-create-checkout-session: could not delete orphan invoice", invoiceId, e);
  }
}
