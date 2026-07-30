import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCallerIdentity, validateOrgScope, authErrorResponse } from "../_shared/auth.ts";
import { z } from "npm:zod";

import { getCorsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { callAiGateway, getAiGatewayKey } from "../_shared/aiGateway.ts";

initSentry();

// Authenticated, org-scoped AI assistant — persistent (DB-backed) rate limit
// per organization, to bound AI-gateway cost/abuse.
const RATE_LIMIT_BUCKET = "quote-ai-assistant";
const RATE_LIMIT_MAX_ATTEMPTS = 30;
const RATE_LIMIT_WINDOW_MINUTES = 1;

const requestSchema = z.object({
  query: z.string(),
  company_id: z.string().optional(),
  organization_id: z.string().optional(),
});

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    getAiGatewayKey();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Scoped client — carries the caller's own JWT, so identity resolution,
    // org-scope validation and every business-data read below run under the
    // caller's real RLS/permissions (has_anew_permission, get_user_visible_org_ids),
    // exactly as if the frontend had called them directly.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    // Residual service-role client — ONLY for:
    //  - the persistent rate-limit table (RLS enabled, zero policies for
    //    "authenticated" by design);
    //  - ai_suggestion_ratings, which also has RLS enabled with zero policies
    //    (read-only signal used to bias suggestions; failing closed under the
    //    scoped client would silently and permanently empty out that context).
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Auth: resolve caller identity
    const caller = await resolveCallerIdentity(req, supabase);

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { query, company_id, organization_id: org_id } = parsed.data;
    const effective_org_id = org_id || company_id;

    // Scope check: caller must belong to the organization
    const hasAccess = await validateOrgScope(supabase, caller, effective_org_id);
    if (!hasAccess) {
      return new Response(
        JSON.stringify({ error: "Access denied to this organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limiting — persistent, DB-backed; scoped per organization.
    const rateLimit = await checkRateLimit(supabaseAdmin, {
      bucket: RATE_LIMIT_BUCKET,
      identifier: effective_org_id || caller.anewUserId,
      maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
      windowMinutes: RATE_LIMIT_WINDOW_MINUTES,
    });
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit, corsHeaders);
    }
    await recordRateLimitAttempt(supabaseAdmin, RATE_LIMIT_BUCKET, effective_org_id || caller.anewUserId);

    // Fetch historical quote data for context
    const { data: recentQuotes, error: quotesError } = await supabase
      .from("quotes")
      .select(`
        id, title, total_value,
        quote_lines(
          descricao_snapshot, categoria, qt, custo_material_unit
        )
      `)
      .eq("organization_id", effective_org_id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (quotesError) {
      console.error("Error fetching quotes:", quotesError);
    }

    // Fetch available products with prices - filter by company if provided
    let productsQuery = supabase
      .from("products")
      .select(`
        id, name, description, sku, is_active,
        product_categories!category_id(name)
      `)
      .eq("is_sellable", true)
      .eq("is_active", true);
    
    if (effective_org_id) {
      productsQuery = productsQuery.eq("organization_id", effective_org_id);
    }
    
    const { data: products, error: productsError } = await productsQuery.limit(200);

    if (productsError) {
      console.error("Error fetching products:", productsError);
    }

    // Fetch product prices
    const productIds = (products || []).map((p: any) => p.id);
    const { data: productPrices } = productIds.length > 0 
      ? await supabase
          .from("product_prices")
          .select("product_id, price")
          .eq("price_type", "retail")
          .in("product_id", productIds)
      : { data: [] };
    
    const productPriceMap = new Map((productPrices || []).map((p: any) => [p.product_id, p.price]));

    // Fetch available services - filter by company if provided
    let servicesQuery = supabase
      .from("services")
      .select(`
        id, name, short_desc, sku, is_active,
        service_categories!service_category_id(name)
      `)
      .eq("is_active", true);
    
    if (effective_org_id) {
      servicesQuery = servicesQuery.eq("organization_id", effective_org_id);
    }
    
    const { data: services, error: servicesError } = await servicesQuery.limit(50);

    // Fetch service prices
    const serviceIds = (services || []).map((s: any) => s.id);
    const { data: servicePrices } = serviceIds.length > 0 
      ? await supabase
          .from("service_prices")
          .select("service_id, price")
          .eq("price_type", "retail")
          .in("service_id", serviceIds)
      : { data: [] };
    
    const servicePriceMap = new Map((servicePrices || []).map((p: any) => [p.service_id, p.price]));

    if (servicesError) {
      console.error("Error fetching services:", servicesError);
    }

    // Fetch AI ratings to learn from user feedback.
    // ai_suggestion_ratings has RLS enabled with zero policies for
    // "authenticated" — read via the residual service-role client (see note
    // above); this is a read-only, org-filtered signal, not a privilege escalation.
    const { data: ratings } = await supabaseAdmin
      .from("ai_suggestion_ratings")
      .select("suggestion_name, suggestion_category, suggestion_type, rating")
      .eq("organization_id", effective_org_id)
      .order("created_at", { ascending: false })
      .limit(100);

    // Calculate average ratings per suggestion
    const ratingStats: Record<string, { totalRating: number; count: number; avgRating: number }> = {};
    (ratings || []).forEach((r: any) => {
      const key = r.suggestion_name?.toLowerCase();
      if (!key) return;
      if (!ratingStats[key]) {
        ratingStats[key] = { totalRating: 0, count: 0, avgRating: 0 };
      }
      ratingStats[key].totalRating += r.rating;
      ratingStats[key].count++;
      ratingStats[key].avgRating = ratingStats[key].totalRating / ratingStats[key].count;
    });

    // Get highly rated suggestions
    const highlyRated = Object.entries(ratingStats)
      .filter(([_, stats]) => stats.avgRating >= 4 && stats.count >= 2)
      .map(([name, stats]) => ({ name, avgRating: stats.avgRating, timesRated: stats.count }))
      .slice(0, 10);

    // Get poorly rated suggestions to avoid
    const poorlyRated = Object.entries(ratingStats)
      .filter(([_, stats]) => stats.avgRating <= 2 && stats.count >= 2)
      .map(([name]) => name)
      .slice(0, 10);

    // Build context for AI
    const productList = (products || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      category: p.product_categories?.name || "Sem categoria",
      price: productPriceMap.get(p.id) || 0,
      sku: p.sku,
      type: "product",
    }));

    const serviceList = (services || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      category: s.service_categories?.name || "Sem categoria",
      price: servicePriceMap.get(s.id) || 0,
      type: "service",
    }));

    // Analyze common patterns from historical quotes
    const productPatterns: Record<string, { count: number; avgQty: number; commonWith: string[] }> = {};
    (recentQuotes || []).forEach(quote => {
      const lines = quote.quote_lines || [];
      lines.forEach((line: any) => {
        const key = line.descricao_snapshot?.toLowerCase();
        if (!key) return;
        
        if (!productPatterns[key]) {
          productPatterns[key] = { count: 0, avgQty: 0, commonWith: [] };
        }
        productPatterns[key].count++;
        productPatterns[key].avgQty = (productPatterns[key].avgQty + (line.qt || 1)) / 2;
        
        // Track commonly paired items
        lines.forEach((otherLine: any) => {
          if (otherLine.descricao_snapshot !== line.descricao_snapshot) {
            if (!productPatterns[key].commonWith.includes(otherLine.descricao_snapshot)) {
              productPatterns[key].commonWith.push(otherLine.descricao_snapshot);
            }
          }
        });
      });
    });

    // Limit patterns context to avoid token limits
    const topPatterns = Object.entries(productPatterns)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([name, data]) => ({
        name,
        frequency: data.count,
        avgQty: Math.round(data.avgQty),
        usuallyWith: data.commonWith.slice(0, 5),
      }));

    const systemPrompt = `Tu és um assistente especializado em orçamentos de construção, remodelação e instalações.
O teu objetivo é ajudar a sugerir produtos e serviços apropriados com base no pedido do cliente.

PRODUTOS DISPONÍVEIS (primeiros 200):
${JSON.stringify(productList.slice(0, 100), null, 2)}

SERVIÇOS DISPONÍVEIS:
${JSON.stringify(serviceList, null, 2)}

PADRÕES COMUNS DE ORÇAMENTOS (produtos mais frequentes):
${JSON.stringify(topPatterns, null, 2)}

SUGESTÕES BEM AVALIADAS PELOS UTILIZADORES (prioriza estas):
${JSON.stringify(highlyRated, null, 2)}

SUGESTÕES MAL AVALIADAS (evita sugerir estas):
${JSON.stringify(poorlyRated, null, 2)}

INSTRUÇÕES:
1. Analisa o pedido do utilizador
2. Sugere produtos e serviços relevantes do catálogo
3. Baseia-te nos padrões históricos para sugerir quantidades e produtos complementares
4. PRIORIZA sugestões que foram bem avaliadas pelos utilizadores
5. EVITA sugestões que foram mal avaliadas
6. Responde sempre em português
7. Devolve uma resposta estruturada com produtos/serviços sugeridos

FORMATO DE RESPOSTA:
Deves responder SEMPRE com um JSON válido no seguinte formato:
{
  "message": "Mensagem explicativa para o utilizador",
  "suggestions": [
    {
      "product_id": "id do produto ou serviço",
      "name": "nome do produto ou serviço",
      "category": "categoria",
      "quantity": 1,
      "price": 15.00,
      "reason": "razão da sugestão",
      "type": "product" ou "service"
    }
  ],
  "tips": ["dica 1", "dica 2"]
}`;

    const response = await callAiGateway({
      model: "gemini-3.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      temperature: 0.7,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add credits" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "";

    console.log("AI Response content:", content);

    // Try to parse JSON from response
    let parsedResponse;
    try {
      // Extract JSON from response (might be wrapped in markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        parsedResponse = {
          message: content,
          suggestions: [],
          tips: [],
        };
      }
    } catch (parseError) {
      console.error("Error parsing AI response:", parseError);
      parsedResponse = {
        message: content,
        suggestions: [],
        tips: [],
      };
    }

    return new Response(
      JSON.stringify(parsedResponse),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    const authResp = authErrorResponse(error, corsHeaders);
    if (authResp) return authResp;
    console.error("Quote AI Assistant error:", error);
    await captureError(error, { function: "quote-ai-assistant" });
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
