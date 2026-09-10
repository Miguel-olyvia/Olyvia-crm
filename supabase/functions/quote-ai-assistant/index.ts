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

initSentry();

// Authenticated, org-scoped AI assistant — persistent (DB-backed) rate limit
// per organization, to bound AI-gateway cost/abuse.
const RATE_LIMIT_BUCKET = "quote-ai-assistant";
const RATE_LIMIT_MAX_ATTEMPTS = 30;
const RATE_LIMIT_WINDOW_MINUTES = 1;

const requestSchema = z.object({
  // NOTE: relaxed from required to optional — mode="diagnostic_suggestions"
  // has no free-text query. mode="chat" (default) is unaffected: every real
  // chat caller still sends `query`, so this is a widening, not a behaviour
  // change, for the existing flow.
  query: z.string().optional(),
  company_id: z.string().optional(),
  organization_id: z.string().optional(),
  mode: z.enum(["chat", "diagnostic_suggestions"]).optional().default("chat"),
  diagnostic_context: z
    .object({
      source_field: z.enum(["area_m2", "demolir", "proteger", "intervencao"]),
      area_m2: z.number().nullable().optional(),
      demolir_descricao: z.string().nullable().optional(),
      proteger_descricao: z.string().nullable().optional(),
      intervencao_tipo: z.string().nullable().optional(),
      intervencao_descricao: z.string().nullable().optional(),
    })
    .optional(),
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
    const { query, company_id, organization_id: org_id, mode, diagnostic_context } = parsed.data;
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

    // ────────────────────────────────────────────────────────────────────────
    // Mode: diagnostic_suggestions — IA fallback (2ª via) para a Fase 1 do
    // diagnóstico de orçamento, usada quando rpc_preview_diagnostic_suggestions
    // (regras determinísticas) não devolveu nada. O catálogo é pré-filtrado por
    // palavras-chave ANTES de chamar o modelo, e o modelo só pode escolher
    // ids dentro dessa pré-filtragem — nunca pode inventar um produto/serviço.
    // Reaproveita resolveCallerIdentity/validateOrgScope/checkRateLimit/
    // recordRateLimitAttempt já executados acima (mesmo bucket, sem contagem
    // paralela) e chama checkAndConsumeAiCredits/refundAiCredits tal como o
    // modo chat mais abaixo (mesmo AI_CREDIT_COSTS["quote-ai-assistant"]).
    // ────────────────────────────────────────────────────────────────────────
    if (mode === "diagnostic_suggestions") {
      if (!diagnostic_context) {
        return new Response(
          JSON.stringify({ error: "diagnostic_context é obrigatório para mode=diagnostic_suggestions" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const {
        source_field,
        area_m2,
        demolir_descricao,
        proteger_descricao,
        intervencao_tipo,
        intervencao_descricao,
      } = diagnostic_context;

      // Stopwords PT comuns — mantém apenas termos com carga semântica para a
      // pesquisa ilike sobre name/sku.
      const PT_STOPWORDS = new Set([
        "de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "para", "com",
        "em", "no", "na", "nos", "nas", "um", "uma", "uns", "umas", "por", "que",
        "se", "ao", "aos", "à", "às", "é", "ou",
      ]);

      const extractKeywords = (text: string | null | undefined): string[] => {
        if (!text) return [];
        return text
          .toLowerCase()
          .split(/[^\p{L}\p{N}]+/u)
          .map((t) => t.trim())
          .filter((t) => t.length >= 3 && !PT_STOPWORDS.has(t));
      };

      // Pequeno mapa estático de sinónimos por source_field (complementa a
      // extração de palavras-chave do texto livre).
      const FIELD_SYNONYMS: Record<string, string[]> = {
        demolir: ["demolição", "entulho"],
        proteger: ["proteção", "proteccao"],
        intervencao: ["sanitário", "impermeabilização", "duche", "base de duche"],
      };

      const relevantText =
        source_field === "intervencao"
          ? [intervencao_tipo, intervencao_descricao].filter(Boolean).join(" ")
          : source_field === "demolir"
          ? demolir_descricao
          : source_field === "proteger"
          ? proteger_descricao
          : null; // area_m2: sem campo de texto associado — só sinónimos (nenhum definido)

      const terms = Array.from(
        new Set([...extractKeywords(relevantText), ...(FIELD_SYNONYMS[source_field] || [])])
      );

      // Sem termos de pesquisa: não há forma de filtrar candidatos com segurança
      // (evitar mandar o catálogo inteiro para o modelo) — devolve [] sem chamar
      // a IA nem consumir créditos.
      if (terms.length === 0) {
        return new Response(
          JSON.stringify({ suggestions: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const orFilter = terms.flatMap((t) => [`name.ilike.%${t}%`, `sku.ilike.%${t}%`]).join(",");

      const [{ data: candidateProductsRaw, error: candidateProductsError },
             { data: candidateServicesRaw, error: candidateServicesError }] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, sku")
          .eq("organization_id", effective_org_id)
          .eq("is_active", true)
          .eq("is_deleted", false)
          .or(orFilter)
          .limit(40),
        supabase
          .from("services")
          .select("id, name, sku")
          .eq("organization_id", effective_org_id)
          .eq("is_active", true)
          .eq("is_deleted", false)
          .or(orFilter)
          .limit(40),
      ]);

      if (candidateProductsError) console.error("Error fetching candidate products:", candidateProductsError);
      if (candidateServicesError) console.error("Error fetching candidate services:", candidateServicesError);

      const candidateProducts = candidateProductsRaw || [];
      const candidateServices = candidateServicesRaw || [];

      // Sem candidatos: nada para o modelo escolher — devolve [] sem chamar a
      // IA nem consumir créditos.
      if (candidateProducts.length === 0 && candidateServices.length === 0) {
        return new Response(
          JSON.stringify({ suggestions: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const validProductIds = new Set(candidateProducts.map((p: any) => p.id));
      const validServiceIds = new Set(candidateServices.map((s: any) => s.id));

      // Nomes reais do catálogo por id — usados para preencher `descricao` na
      // resposta final em vez do campo `name` livre que a IA devolve (mesma
      // filosofia anti-alucinação já aplicada aos ids).
      const productNameById = new Map<string, string>(candidateProducts.map((p: any) => [p.id, p.name]));
      const serviceNameById = new Map<string, string>(candidateServices.map((s: any) => [s.id, s.name]));

      const candidatesForPrompt = [
        ...candidateProducts.map((p: any) => ({ id: p.id, type: "product", name: p.name, sku: p.sku })),
        ...candidateServices.map((s: any) => ({ id: s.id, type: "service", name: s.name, sku: s.sku })),
      ];

      // Distinção crítica que o modelo tem de fazer: o texto de "demolir"/
      // "proteger" descreve um OBJETO físico já existente no espaço (que vai
      // ser destruído, ou que precisa de proteção) — não é o nome de um
      // produto a comprar/instalar. Sem isto, a pesquisa por palavra-chave
      // pode devolver, por coincidência, um produto do catálogo com o mesmo
      // nome do objeto (ex.: texto "um armário" + produto real "Armário
      // Inferior Termolaminado"), e o modelo sugere-o como se fosse a
      // resposta — quando devia sugerir algo para proteger/demolir esse
      // armário, nunca o próprio armário. Só "intervencao" descreve
      // diretamente o trabalho a fazer, por isso não precisa deste aviso.
      const FIELD_GUIDANCE: Partial<Record<typeof source_field, string>> = {
        demolir:
          'O texto de "demolir" descreve o elemento físico que vai ser destruído/removido (ex.: "uma parede", "um lavatório") — NÃO é o nome de um produto a comprar. Sugere só serviços de mão-de-obra de demolição, remoção/transporte de entulho, ou consumíveis de demolição. NUNCA sugiras um produto cujo nome coincida com o próprio elemento a demolir.',
        proteger:
          'O texto de "proteger" descreve o elemento físico já existente no espaço que precisa de ser protegido durante a obra (ex.: "um armário") — NÃO é o nome de um produto a comprar/instalar. Sugere só consumíveis ou serviços de proteção de obra (filme plástico, fita, cartão, mantas de proteção, etc.). NUNCA sugiras o próprio objeto mencionado como se fosse um produto a comprar — esse objeto já existe e só precisa de ser protegido, não substituído.',
      };
      const fieldGuidance = FIELD_GUIDANCE[source_field];

      const diagnosticSystemPrompt = `Tu és um assistente que sugere produtos e serviços de um catálogo já filtrado, no contexto do diagnóstico de uma obra de remodelação (Fase 1 do orçamento).

CAMPO EM ANÁLISE: ${source_field}
${fieldGuidance ? `CONTEXTO IMPORTANTE PARA ESTE CAMPO: ${fieldGuidance}\n` : ""}
DADOS DA ÁREA:
- área (m2): ${area_m2 ?? "não indicada"}
- demolir: ${demolir_descricao ?? "não indicado"}
- proteger: ${proteger_descricao ?? "não indicado"}
- tipo de intervenção: ${intervencao_tipo ?? "não indicado"}
- descrição da intervenção: ${intervencao_descricao ?? "não indicada"}

CATÁLOGO DISPONÍVEL (escolhe exclusivamente destes, usa o id exato):
${JSON.stringify(candidatesForPrompt, null, 2)}

INSTRUÇÕES:
1. Escolhe só produtos/serviços da lista acima que sejam relevantes para o campo em análise.
2. Distingue sempre o objeto mencionado no texto (que já existe no espaço, ou vai ser destruído) do produto/serviço a sugerir (que serve para agir sobre esse objeto — proteger, demolir, remover). Nunca sugiras o próprio objeto como se fosse a resposta, mesmo que um produto do catálogo tenha um nome parecido ou igual.
3. NUNCA inventes um id ou um produto/serviço que não esteja na lista.
4. Se nenhum for adequado, devolve suggestions: [].
5. Responde SEMPRE em português e SÓ com um JSON válido, neste formato:
{
  "suggestions": [
    { "product_id": "uuid ou null", "service_id": "uuid ou null", "name": "nome exato do catálogo", "reason": "razão da sugestão", "confidence": 0.0 }
  ]
}`;

      // AI credits — mesmo gate/bucket de custo do modo chat (AI_CREDIT_COSTS["quote-ai-assistant"]).
      const creditsResultDiag = await checkAndConsumeAiCredits(
        supabaseAdmin,
        effective_org_id as string,
        AI_CREDIT_COSTS["quote-ai-assistant"],
      );
      if (creditsResultDiag.blocked) {
        return aiCreditsBlockedResponse(creditsResultDiag, corsHeaders);
      }

      let diagResponse;
      try {
        diagResponse = await callAiGateway({
          model: "gemini-3.5-flash-lite",
          messages: [
            { role: "system", content: diagnosticSystemPrompt },
            { role: "user", content: "Sugere produtos/serviços para este campo do diagnóstico." },
          ],
          temperature: 0.7,
          response_format: { type: "json_object" },
        });
      } catch (gatewayError) {
        await refundAiCredits(supabaseAdmin, effective_org_id as string, AI_CREDIT_COSTS["quote-ai-assistant"]);
        throw gatewayError;
      }

      if (!diagResponse.ok) {
        const errorText = await diagResponse.text();
        console.error("AI Gateway error (diagnostic_suggestions):", diagResponse.status, errorText);

        if (diagResponse.status === 429) {
          await refundAiCredits(supabaseAdmin, effective_org_id as string, AI_CREDIT_COSTS["quote-ai-assistant"]);
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (diagResponse.status === 402) {
          await refundAiCredits(supabaseAdmin, effective_org_id as string, AI_CREDIT_COSTS["quote-ai-assistant"]);
          return new Response(
            JSON.stringify({ error: "Payment required, please add credits" }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await refundAiCredits(supabaseAdmin, effective_org_id as string, AI_CREDIT_COSTS["quote-ai-assistant"]);
        throw new Error(`AI gateway error: ${diagResponse.status}`);
      }

      const diagAiResponse = await diagResponse.json();
      const diagContent = diagAiResponse.choices?.[0]?.message?.content || "";

      // Mesma abordagem de extração de JSON já usada no modo chat abaixo
      // (regex de salvaguarda, além do response_format:{type:"json_object"}).
      let parsedDiagnostic: any;
      try {
        const jsonMatch = diagContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedDiagnostic = JSON.parse(jsonMatch[0]);
        } else {
          parsedDiagnostic = { suggestions: [] };
        }
      } catch (parseError) {
        console.error("Error parsing AI response (diagnostic_suggestions):", parseError);
        parsedDiagnostic = { suggestions: [] };
      }

      const rawSuggestions = Array.isArray(parsedDiagnostic?.suggestions) ? parsedDiagnostic.suggestions : [];

      // Validação anti-alucinação obrigatória: só passam sugestões cujo
      // product_id/service_id esteja no conjunto de candidatos devolvidos
      // pela query desta chamada. Descarta silenciosamente o resto (sem erro
      // visível ao utilizador), registando um aviso via captureError. Ao
      // mesmo tempo, mapeia cada sugestão válida para o contrato esperado
      // pelo frontend (AiSuggestionResponseItem em useQuoteDiagnosticSuggestions.ts).
      const mappedSuggestions = rawSuggestions.map((s: any) => {
        const pid = s?.product_id || null;
        const sid = s?.service_id || null;

        if (pid && validProductIds.has(pid)) {
          return {
            target_type: "product" as const,
            product_id: pid,
            service_id: null,
            catalog_item_id: null,
            // Nome real do catálogo, nunca o `name` livre da IA — proteção
            // anti-alucinação extra (fallback "" nunca deve ocorrer, o id já
            // foi validado contra validProductIds).
            descricao: productNameById.get(pid) ?? "",
            // A IA não estima quantidade neste modo (só a via de regras
            // calcula por fórmula) — fixa em 1 para nunca deixar passar uma
            // linha com qty 0 (Number(undefined) || 0 no frontend).
            qty: 1,
            // Nem products nem services têm coluna de unidade direta na BD
            // (a via de regras usa default_qt_unit da própria regra).
            unidade: null,
            rationale: s?.reason ?? null,
            confidence: typeof s?.confidence === "number" ? s.confidence : null,
          };
        }

        if (sid && validServiceIds.has(sid)) {
          return {
            target_type: "service" as const,
            product_id: null,
            service_id: sid,
            catalog_item_id: null,
            descricao: serviceNameById.get(sid) ?? "",
            qty: 1,
            unidade: null,
            rationale: s?.reason ?? null,
            confidence: typeof s?.confidence === "number" ? s.confidence : null,
          };
        }

        return null;
      });

      const filteredSuggestions = mappedSuggestions.filter((s: any) => s !== null);

      if (filteredSuggestions.length !== rawSuggestions.length) {
        await captureError(
          new Error("quote-ai-assistant diagnostic_suggestions: modelo devolveu id fora do catálogo filtrado"),
          {
            function: "quote-ai-assistant",
            mode: "diagnostic_suggestions",
            organization_id: effective_org_id,
            discarded_count: rawSuggestions.length - filteredSuggestions.length,
          },
        );
      }

      return new Response(
        JSON.stringify({ suggestions: filteredSuggestions }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // AI credits — billing gate, scoped to the (already org-scope-validated)
    // effective_org_id. See _shared/aiCredits.ts for the atomic
    // debit/refund-on-failure mechanics behind the error branches below.
    const creditsResult = await checkAndConsumeAiCredits(
      supabaseAdmin,
      effective_org_id as string,
      AI_CREDIT_COSTS["quote-ai-assistant"],
    );
    if (creditsResult.blocked) {
      return aiCreditsBlockedResponse(creditsResult, corsHeaders);
    }

    let response;
    try {
      response = await callAiGateway({
        model: "gemini-3.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query },
        ],
        temperature: 0.7,
      });
    } catch (gatewayError) {
      await refundAiCredits(supabaseAdmin, effective_org_id as string, AI_CREDIT_COSTS["quote-ai-assistant"]);
      throw gatewayError;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);

      if (response.status === 429) {
        await refundAiCredits(supabaseAdmin, effective_org_id as string, AI_CREDIT_COSTS["quote-ai-assistant"]);
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        await refundAiCredits(supabaseAdmin, effective_org_id as string, AI_CREDIT_COSTS["quote-ai-assistant"]);
        return new Response(
          JSON.stringify({ error: "Payment required, please add credits" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await refundAiCredits(supabaseAdmin, effective_org_id as string, AI_CREDIT_COSTS["quote-ai-assistant"]);
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
