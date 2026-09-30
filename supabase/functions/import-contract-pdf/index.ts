import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCallerIdentity, validateOrgScope, authErrorResponse } from "../_shared/auth.ts";
import { z } from "npm:zod";

import { getCorsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { callAiGateway, getAiGatewayKey } from "../_shared/aiGateway.ts";
import { checkAndConsumeAiCredits, aiCreditsBlockedResponse, refundAiCredits } from "../_shared/aiCredits.ts";
import { AI_CREDIT_COSTS } from "../_shared/aiCreditsCosts.ts";
import { requireActiveMembership } from "../_shared/orgMembership.ts";
import { logAiGatewayUsage } from "../_shared/aiUsageLog.ts";

initSentry();

// Authenticated internal AI-parsing tool — persistent (DB-backed) rate limit
// per user, to bound AI-gateway cost/abuse.
const RATE_LIMIT_BUCKET = "import-contract-pdf";
const RATE_LIMIT_MAX_ATTEMPTS = 20;
const RATE_LIMIT_WINDOW_MINUTES = 1;

const stripMarkdownCodeFences = (value: string) => value.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "").trim();

const requestSchema = z.object({
  organization_id: z.string().uuid(),
  fileName: z.string(),
  pdfBase64: z.string().max(10_000_000),
});

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Scoped client — carries the caller's own JWT, so identity resolution runs
  // under the caller's real RLS (anew_users.auth_user_id = auth.uid()).
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  // Residual service-role client — ONLY for the persistent rate-limit table,
  // which has RLS enabled with zero policies for "authenticated" (by design;
  // only the rate-limit helper is meant to touch it).
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Credits debited and not yet earned; refunded (once) on any failure path.
  let creditsToRefund = 0;
  let refundOrgId = "";
  const refundPending = async () => {
    if (creditsToRefund > 0) {
      const amount = creditsToRefund;
      creditsToRefund = 0;
      await refundAiCredits(supabaseAdmin, refundOrgId, amount);
    }
  };

  try {
    let caller;
    try {
      caller = await resolveCallerIdentity(req, supabase);
    } catch (e) {
      return authErrorResponse(e, corsHeaders);
    }

    // Rate limiting — persistent, DB-backed; scoped per authenticated user.
    const rateLimit = await checkRateLimit(supabaseAdmin, {
      bucket: RATE_LIMIT_BUCKET,
      identifier: caller.anewUserId,
      maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
      windowMinutes: RATE_LIMIT_WINDOW_MINUTES,
    });
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit, corsHeaders);
    }
    await recordRateLimitAttempt(supabaseAdmin, RATE_LIMIT_BUCKET, caller.anewUserId);

    getAiGatewayKey();

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { organization_id, fileName, pdfBase64 } = parsed.data;

    const hasAccess = await validateOrgScope(supabase, caller, organization_id);
    if (!hasAccess) {
      return new Response(
        JSON.stringify({ error: "Sem permissão para aceder a esta organização" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const base64Payload = pdfBase64.startsWith("data:")
      ? (pdfBase64.split(",")[1] ?? "")
      : pdfBase64;

    if (!base64Payload.startsWith('JVBERi0')) {
      return new Response(
        JSON.stringify({ error: 'Invalid file type' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalizedPdfBase64 = pdfBase64.startsWith("data:")
      ? pdfBase64
      : `data:application/pdf;base64,${pdfBase64}`;

    // Visibility is not enough to spend an organization's credits: require an
    // ACTIVE membership in exactly this organization, before any charge.
    if (!(await requireActiveMembership(supabaseAdmin, caller.anewUserId, organization_id))) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // AI credits — billing gate, scoped to the org-scope-validated
    // organization_id. Charged before the gateway call; refunded (best-effort)
    // on any gateway failure. See _shared/aiCredits.ts.
    const creditCost = AI_CREDIT_COSTS["import-contract-pdf"];
    const creditsResult = await checkAndConsumeAiCredits(supabaseAdmin, organization_id, creditCost);
    if (creditsResult.blocked) {
      return aiCreditsBlockedResponse(creditsResult, corsHeaders);
    }
    creditsToRefund = creditCost;
    refundOrgId = organization_id;

    let response: Response;
    try {
      response = await callAiGateway({
        model: "gemini-3.5-flash-lite",
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: "És um extractor de documentos jurídicos em português. Extrai o conteúdo de PDFs de contratos e devolve apenas HTML limpo e simples para um editor rich text. Preserva títulos, parágrafos, listas numeradas e listas com bullets quando existirem. Não inventes conteúdo. Não adiciones markdown. Não adiciones explicações."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extrai o texto deste contrato PDF e devolve apenas HTML válido para colar num editor. Usa <h1>, <h2>, <p>, <ol>, <ul>, <li>, <strong>, <em> quando fizer sentido. Se houver páginas sem OCR perfeito, devolve o melhor texto possível sem comentários."
              },
              {
                type: "file",
                file: {
                  filename: fileName,
                  file_data: normalizedPdfBase64,
                }
              }
            ]
          }
        ]
      });
    } catch (gatewayError) {
      await refundPending();
      throw gatewayError;
    }

    if (!response.ok) {
      await refundPending();
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite temporário excedido no processamento automático. Tente novamente dentro de instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "O processamento automático está temporariamente indisponível por limite de créditos." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const errorText = await response.text();
      throw new Error(`AI gateway error: ${response.status} - ${errorText}`);
    }

    const aiResponse = await response.json();

    const content = aiResponse.choices?.[0]?.message?.content?.trim?.() || "";
    const html = stripMarkdownCodeFences(content);

    if (!html || html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().length < 20) {
      // No usable output: the customer is not charged. Tokens were still spent,
      // so the usage is logged with 0 credits charged.
      await refundPending();
      await logAiGatewayUsage(supabaseAdmin, organization_id, "import-contract-pdf", 0, aiResponse.usage);
      return new Response(
        JSON.stringify({ error: "extraction_empty" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Real Google token cost, separate from the flat credit price charged
    // above — see _shared/aiUsageLog.ts.
    await logAiGatewayUsage(supabaseAdmin, organization_id, "import-contract-pdf", creditCost, aiResponse.usage);
    creditsToRefund = 0;

    return new Response(
      JSON.stringify({ html, extractedWith: "ai" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("import-contract-pdf error:", error);
    await captureError(error, { function: "import-contract-pdf" });
    await refundPending();

    // Never expose internal error text to the client: it is logged and sent to Sentry above.
    return new Response(
      JSON.stringify({ error: "Não foi possível processar este PDF automaticamente neste momento." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
