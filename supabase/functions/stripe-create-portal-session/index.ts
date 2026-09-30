/**
 * stripe-create-portal-session
 * ============================================================
 * Authenticated (verify_jwt = true). Opens a Stripe Billing Portal session so
 * the ROOT PAYER can manage the card, invoices and subscription.
 *
 * Billing belongs to the root payer user, not to the incoming organization:
 *   - the billing org and root payer are resolved server-side with the
 *     service-role client (resolve_billing_organization_id /
 *     resolve_root_payer_user_id);
 *   - only the root payer may open the portal (403 only_payer_can_manage; no
 *     system_admin or service-role exception);
 *   - the Stripe customer is read from the BILLING org's subscription row.
 *
 * Manual prerequisite: the Billing Portal must be configured once in the
 * Stripe Dashboard (Settings > Billing > Customer portal). Without a saved
 * configuration Stripe rejects the call and this function answers 500.
 *
 * Pure rules live in _shared/portalPolicy.ts (unit-tested with vitest).
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  authErrorResponse,
  resolveCallerIdentity,
  validateOrgScope,
} from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  decidePortalAccess,
  portalReturnUrl,
  validatePortalRequest,
} from "../_shared/portalPolicy.ts";
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

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: { Authorization: req.headers.get("Authorization") ?? "" },
      },
    });
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
    const parsed = validatePortalRequest(rawBody);
    if (!parsed.ok) {
      return jsonResponse({ error: parsed.error }, parsed.status, corsHeaders);
    }
    const { organization_id } = parsed.data;

    const hasAccess = await validateOrgScope(supabase, caller, organization_id);
    if (!hasAccess) {
      return jsonResponse(
        { error: "Access denied to this organization" },
        403,
        corsHeaders,
      );
    }

    // Billing org + root payer, never the incoming organization_id.
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

    // Payer check runs before the customer read so a non-payer learns nothing
    // about the billing org's Stripe state.
    const payerGate = decidePortalAccess({
      callerAnewUserId: caller.anewUserId,
      rootPayerUserId: rootPayerId,
      stripeCustomerId: "payer-check-only",
      stripeConfigured: true,
    });
    if (!payerGate.ok) {
      return jsonResponse({ error: payerGate.error }, payerGate.status, corsHeaders);
    }

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("organization_subscriptions")
      .select("stripe_customer_id")
      .eq("organization_id", billingOrgId)
      .maybeSingle();
    if (subErr) {
      throw new Error(`Failed to read subscription: ${subErr.message}`);
    }

    const decision = decidePortalAccess({
      callerAnewUserId: caller.anewUserId,
      rootPayerUserId: rootPayerId,
      stripeCustomerId: sub?.stripe_customer_id,
      stripeConfigured: isStripeConfigured(),
    });
    if (!decision.ok) {
      return jsonResponse({ error: decision.error }, decision.status, corsHeaders);
    }

    // Portal sessions are single-use and cheap: no idempotency key.
    const session = await stripeRequest("billing_portal/sessions", {
      customer: decision.customerId,
      return_url: portalReturnUrl(resolveAppUrl()),
    });
    if (!session?.url) {
      throw new Error("Stripe portal session returned no url");
    }
    return jsonResponse({ url: session.url }, 200, corsHeaders);
  } catch (error: unknown) {
    const authResp = authErrorResponse(error, corsHeaders);
    if (authResp) return authResp;
    console.error("stripe-create-portal-session error:", error);
    await captureError(error, { function: "stripe-create-portal-session" });
    // Never leak internal messages (SQL, Stripe) to the browser.
    return jsonResponse({ error: "internal_error" }, 500, corsHeaders);
  }
});
