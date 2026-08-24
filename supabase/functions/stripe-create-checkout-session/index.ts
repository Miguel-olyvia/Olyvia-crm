/**
 * stripe-create-checkout-session
 * ============================================================
 * Authenticated (verify_jwt = true — see supabase/config.toml), org-scoped
 * entry point for both billing flows in the app:
 *   - type: "creditos"  -> buy a fixed AI-credit package (package_id) or a
 *                          custom amount of credits (credits_amount, at
 *                          €0.70/credit).
 *   - type: "plano"     -> upgrade the organization's subscription plan
 *                          (target_plan), priced from plan_pricing.
 *
 * FEATURE FLAG — this is the load-bearing behavior of this whole file:
 *   - isStripeConfigured() === false (STRIPE_SECRET_KEY not set as a
 *     Supabase secret): falls back to the EXACT pre-Stripe manual flow —
 *     insert an `invoices` row with status='pendente', same as
 *     PlanoFaturacaoCard.tsx already does today directly from the
 *     frontend. No Stripe API call is made. Returns { mode: "manual",
 *     invoice_id }.
 *   - isStripeConfigured() === true: creates the `invoices` row (also
 *     status='pendente' — it only becomes 'pago' once stripe-webhook
 *     confirms payment) AND a real Stripe Checkout Session, returning
 *     { mode: "stripe", url } for the frontend to redirect to.
 *
 * This means: until the business configures STRIPE_SECRET_KEY, calling
 * this function has identical observable effects to today's direct
 * `invoices` insert from the frontend — nothing breaks, nothing changes.
 * See supabase/functions/_shared/STRIPE_SETUP.md for the activation steps.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "npm:zod";
import {
  authErrorResponse,
  resolveCallerIdentity,
  validateOrgScope,
} from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { captureError, initSentry } from "../_shared/sentry.ts";
import { isStripeConfigured, stripeRequest } from "../_shared/stripe.ts";

initSentry();

// €0.70 per AI credit for "à vulso" (custom amount, no fixed package)
// purchases — same price point already implied by ai_credit_packages'
// existing packages (e.g. "Mini": 100 credits / €50 ≈ €0.50/credit at bulk
// discount; à-vulso is intentionally priced higher than any fixed package).
const CREDITS_PRICE_PER_UNIT_EUR = 0.70;

const requestSchema = z.object({
  organization_id: z.string().uuid(),
  type: z.enum(["creditos", "plano"]),
  package_id: z.string().uuid().optional(),
  credits_amount: z.number().int().positive().optional(),
  target_plan: z.enum(["trial", "starter", "pro", "enterprise"]).optional(),
});

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

/**
 * APP_URL is the primary, documented env var for this function (see
 * STRIPE_SETUP.md) — falls back to the existing SITE_URL convention used
 * elsewhere in this repo (send-proposal-email, book-slot, ...), and finally
 * to the known production origin, so success_url/cancel_url are never
 * malformed even before either secret is configured.
 */
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

    // Scoped client (caller's own JWT) — identity resolution and org-scope
    // validation run under the caller's real RLS, exactly like
    // quote-ai-assistant/index.ts and every other org-scoped AI function.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: { Authorization: req.headers.get("Authorization") ?? "" },
      },
    });

    // Service-role client — ALL writes here (invoices inserts/updates,
    // plan_pricing / ai_credit_packages reads including stripe_price_id)
    // intentionally bypass RLS. This mirrors 20261112390000's documented
    // model: authenticated can INSERT a status='pendente' invoice for its
    // own org directly, but this function does it centrally instead so the
    // Stripe-specific columns (stripe_checkout_session_id, credits_amount
    // exclusivity, etc.) are always written correctly and atomically with
    // the Stripe API call.
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

    const parsed = requestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonResponse(
        { error: "Invalid request", details: parsed.error.issues },
        400,
        corsHeaders,
      );
    }
    const { organization_id, type, package_id, credits_amount, target_plan } =
      parsed.data;

    // Scope check: caller must belong to (or have visibility over) this org
    // — same helper/pattern used by every other org-scoped Edge Function.
    const hasAccess = await validateOrgScope(supabase, caller, organization_id);
    if (!hasAccess) {
      return jsonResponse(
        { error: "Access denied to this organization" },
        403,
        corsHeaders,
      );
    }

    if (type === "creditos") {
      if (!package_id && !credits_amount) {
        return jsonResponse(
          { error: "package_id ou credits_amount é obrigatório para type=creditos" },
          400,
          corsHeaders,
        );
      }
      if (package_id && credits_amount) {
        return jsonResponse(
          { error: "package_id e credits_amount são mutuamente exclusivos" },
          400,
          corsHeaders,
        );
      }
    }
    if (type === "plano" && !target_plan) {
      return jsonResponse(
        { error: "target_plan é obrigatório para type=plano" },
        400,
        corsHeaders,
      );
    }

    // ------------------------------------------------------------------
    // MODO MANUAL — Stripe não configurado. Comportamento idêntico ao
    // insert direto que PlanoFaturacaoCard.tsx já faz hoje: cria a fatura
    // 'pendente' e para por aqui, sem nenhuma chamada Stripe.
    // ------------------------------------------------------------------
    if (!isStripeConfigured()) {
      if (type === "creditos") {
        if (package_id) {
          const { data: pkg, error: pkgError } = await supabaseAdmin
            .from("ai_credit_packages")
            .select("id, name, price_sale, active")
            .eq("id", package_id)
            .maybeSingle();
          if (pkgError || !pkg) {
            return jsonResponse({ error: "package_not_found" }, 404, corsHeaders);
          }

          const { data: invoice, error: invoiceError } = await supabaseAdmin
            .from("invoices")
            .insert({
              organization_id,
              type: "creditos",
              package_id: pkg.id,
              amount: pkg.price_sale,
              status: "pendente",
              description: `Compra de créditos: ${pkg.name}`,
            })
            .select("id")
            .single();
          if (invoiceError || !invoice) {
            throw new Error(invoiceError?.message || "Failed to create invoice");
          }

          return jsonResponse({ mode: "manual", invoice_id: invoice.id }, 200, corsHeaders);
        }

        // credits_amount (compra à vulso)
        const amount = Math.round(credits_amount! * CREDITS_PRICE_PER_UNIT_EUR * 100) / 100;
        const { data: invoice, error: invoiceError } = await supabaseAdmin
          .from("invoices")
          .insert({
            organization_id,
            type: "creditos",
            credits_amount,
            amount,
            status: "pendente",
            description: `Compra de ${credits_amount} créditos IA`,
          })
          .select("id")
          .single();
        if (invoiceError || !invoice) {
          throw new Error(invoiceError?.message || "Failed to create invoice");
        }

        return jsonResponse({ mode: "manual", invoice_id: invoice.id }, 200, corsHeaders);
      }

      // type === "plano"
      const { data: pricing } = await supabaseAdmin
        .from("plan_pricing")
        .select("price_eur")
        .eq("plan", target_plan)
        .maybeSingle();
      if (!pricing || pricing.price_eur === null) {
        return jsonResponse({ error: "plan_pricing_not_configured" }, 400, corsHeaders);
      }

      const { data: invoice, error: invoiceError } = await supabaseAdmin
        .from("invoices")
        .insert({
          organization_id,
          type: "plano",
          amount: pricing.price_eur,
          status: "pendente",
          description: `Upgrade de plano: ${target_plan}`,
        })
        .select("id")
        .single();
      if (invoiceError || !invoice) {
        throw new Error(invoiceError?.message || "Failed to create invoice");
      }

      return jsonResponse({ mode: "manual", invoice_id: invoice.id }, 200, corsHeaders);
    }

    // ------------------------------------------------------------------
    // MODO STRIPE — STRIPE_SECRET_KEY configurado. Cria a fatura 'pendente'
    // (idêntico ao modo manual — só passa a 'pago' via stripe-webhook) e a
    // Checkout Session correspondente, correlacionadas via metadata +
    // stripe_checkout_session_id.
    // ------------------------------------------------------------------
    const appUrl = resolveAppUrl();
    const successUrl =
      `${appUrl}/definicoes?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}/definicoes?checkout=cancel`;

    if (type === "creditos") {
      let invoiceId: string;
      let lineItem: Record<string, unknown>;

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

        const { data: invoice, error: invoiceError } = await supabaseAdmin
          .from("invoices")
          .insert({
            organization_id,
            type: "creditos",
            package_id: pkg.id,
            amount: pkg.price_sale,
            status: "pendente",
            description: `Compra de créditos: ${pkg.name}`,
          })
          .select("id")
          .single();
        if (invoiceError || !invoice) {
          throw new Error(invoiceError?.message || "Failed to create invoice");
        }
        invoiceId = invoice.id;

        lineItem = pkg.stripe_price_id
          ? { price: pkg.stripe_price_id, quantity: 1 }
          : {
            price_data: {
              currency: "eur",
              unit_amount: Math.round(Number(pkg.price_sale) * 100),
              product_data: { name: pkg.name },
            },
            quantity: 1,
          };
      } else {
        const amount = Math.round(credits_amount! * CREDITS_PRICE_PER_UNIT_EUR * 100) / 100;

        const { data: invoice, error: invoiceError } = await supabaseAdmin
          .from("invoices")
          .insert({
            organization_id,
            type: "creditos",
            credits_amount,
            amount,
            status: "pendente",
            description: `Compra de ${credits_amount} créditos IA`,
          })
          .select("id")
          .single();
        if (invoiceError || !invoice) {
          throw new Error(invoiceError?.message || "Failed to create invoice");
        }
        invoiceId = invoice.id;

        lineItem = {
          price_data: {
            currency: "eur",
            unit_amount: Math.round(credits_amount! * CREDITS_PRICE_PER_UNIT_EUR * 100),
            product_data: { name: `${credits_amount} créditos IA` },
          },
          quantity: 1,
        };
      }

      let session: any;
      try {
        session = await stripeRequest("checkout/sessions", {
          mode: "payment",
          line_items: [lineItem],
          metadata: { invoice_id: invoiceId, organization_id },
          success_url: successUrl,
          cancel_url: cancelUrl,
        });
      } catch (stripeError) {
        // Invoice already exists as 'pendente' with no
        // stripe_checkout_session_id — safe to leave as-is (same shape as
        // a manual-mode invoice); the user can retry the purchase, which
        // creates a fresh invoice. Not auto-cancelled here to avoid
        // masking the real Stripe error with a second DB write that could
        // itself fail.
        console.error("stripe-create-checkout-session: Stripe error (creditos)", stripeError);
        throw stripeError;
      }

      const { error: updateError } = await supabaseAdmin
        .from("invoices")
        .update({ stripe_checkout_session_id: session.id })
        .eq("id", invoiceId);
      if (updateError) {
        // Session was created successfully in Stripe; failing to record its
        // id locally would break the webhook's ability to match it back to
        // this invoice (see idx_invoices_stripe_checkout_session_id) — this
        // must surface as an error rather than be silently swallowed.
        throw new Error(
          `Checkout session created but failed to persist stripe_checkout_session_id: ${updateError.message}`,
        );
      }

      return jsonResponse({ mode: "stripe", url: session.url }, 200, corsHeaders);
    }

    // type === "plano"
    const { data: pricing } = await supabaseAdmin
      .from("plan_pricing")
      .select("price_eur, stripe_price_id")
      .eq("plan", target_plan)
      .maybeSingle();
    if (!pricing || pricing.price_eur === null) {
      return jsonResponse({ error: "plan_pricing_not_configured" }, 400, corsHeaders);
    }

    const amount = Number(pricing.price_eur);

    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .insert({
        organization_id,
        type: "plano",
        amount,
        status: "pendente",
        description: `Upgrade de plano: ${target_plan}`,
      })
      .select("id")
      .single();
    if (invoiceError || !invoice) {
      throw new Error(invoiceError?.message || "Failed to create invoice");
    }

    const lineItem = pricing.stripe_price_id
      ? { price: pricing.stripe_price_id, quantity: 1 }
      : {
        price_data: {
          currency: "eur",
          unit_amount: Math.round(amount * 100),
          recurring: { interval: "month" },
          product_data: { name: `Plano ${target_plan}` },
        },
        quantity: 1,
      };

    let session: any;
    try {
      session = await stripeRequest("checkout/sessions", {
        mode: "subscription",
        line_items: [lineItem],
        metadata: { invoice_id: invoice.id, organization_id, target_plan },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    } catch (stripeError) {
      console.error("stripe-create-checkout-session: Stripe error (plano)", stripeError);
      throw stripeError;
    }

    const { error: updateError } = await supabaseAdmin
      .from("invoices")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", invoice.id);
    if (updateError) {
      throw new Error(
        `Checkout session created but failed to persist stripe_checkout_session_id: ${updateError.message}`,
      );
    }

    return jsonResponse({ mode: "stripe", url: session.url }, 200, corsHeaders);
  } catch (error: any) {
    const authResp = authErrorResponse(error, corsHeaders);
    if (authResp) return authResp;
    console.error("stripe-create-checkout-session error:", error);
    await captureError(error, { function: "stripe-create-checkout-session" });
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});
