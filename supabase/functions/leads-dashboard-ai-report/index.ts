/**
 * leads-dashboard-ai-report
 *
 * Generates a Markdown executive report over the Leads dashboard KPIs
 * (already computed client-side via get_lead_dashboard_stats_scoped) using
 * the shared AI gateway. Ported from the sibling Lovable-connected repo
 * (ricardobelchior1984-code/olyvia, supabase/functions/leads-dashboard-ai-report)
 * and adapted to this repo's conventions:
 *
 *   - Auth: resolveCallerIdentity + validateOrgScope (../_shared/auth.ts)
 *     instead of Lovable's unauthenticated function.
 *   - LLM: the shared aiGateway helper (../_shared/aiGateway.ts), which
 *     targets this repo's real provider (Gemini via GEMINI_API_KEY),
 *     instead of Lovable's ai.gateway.lovable.dev + LOVABLE_API_KEY.
 *   - Schema: anew_leads is this repo's single fused leads/contacts table;
 *     nothing here queries a separate contacts table.
 *   - Stage labels: fetches the organization's real `lead_workflow_stages`
 *     (label, ordered by stage_order) and threads them into the prompt so
 *     the report reflects an org's actual, possibly renamed, funnel stages
 *     instead of hardcoded Portuguese wording like "Qualificado" /
 *     "Negociação em curso" (which is what the frontend's STATUS_LABELS
 *     fallback in leadsDashboardHelpers.ts uses when no org-specific stage
 *     is configured — see deriveStageFunnel for the org-aware equivalent).
 */
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { z } from "npm:zod";
import { resolveCallerIdentity, validateOrgScope, authErrorResponse } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { callAiGateway, getAiGatewayKey } from "../_shared/aiGateway.ts";
import { checkRateLimit, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";

initSentry();

const MODEL = "gemini-3.5-flash";

// Authenticated, per-user feature — persistent (DB-backed) rate limit bounds
// AI-gateway cost/abuse the same way ai-assistant does.
const RATE_LIMIT_BUCKET = "leads-dashboard-ai-report";
const RATE_LIMIT_MAX_ATTEMPTS = 20;
const RATE_LIMIT_WINDOW_MINUTES = 1;

const PayloadSchema = z.object({
  organization_id: z.string().uuid(),
  periodLabel: z.string().max(200),
  periodMode: z.enum(["range", "global"]).optional(),
  assigneeName: z.string().max(200).nullable().optional(),
  kpis: z.object({
    totalLeads: z.number(),
    leadsInPeriod: z.number(),
    leadsToday: z.number(),
    todayInRange: z.boolean().optional(),
    pendingLeads: z.number(),
    contactedLeads: z.number(),
    qualifiedLeads: z.number(),
    convertedLeads: z.number(),
    cohortConversions: z.number(),
    conversionRate: z.union([z.number(), z.string()]),
    avgLeadsPerDay: z.union([z.number(), z.string()]),
    visitsScheduled: z.number(),
    totalGrowth: z.number().optional(),
  }),
  topAssignees: z
    .array(z.object({ name: z.string(), count: z.number() }))
    .max(20)
    .optional(),
  evolution: z
    .array(z.object({ date: z.string(), leads: z.number() }))
    .max(120)
    .optional(),
  // `name` may be either a raw stage key (e.g. "qualified") or an already
  // display-formatted label — resolved against the org's real stage labels
  // below before it reaches the prompt.
  statusDistribution: z
    .array(z.object({ name: z.string(), value: z.number() }))
    .max(30)
    .optional(),
});

interface WorkflowStageRow {
  name: string;
  label: string;
  stage_order: number;
  is_final: boolean | null;
  is_conversion: boolean | null;
  is_rejection: boolean | null;
}

// Generic fallback keys used when an org has no matching configured stage
// for a given KPI concept — mirrors src/components/leads/leadsDashboardHelpers.ts's
// STATUS_LABELS so behavior degrades gracefully instead of failing.
const GENERIC_STAGE_LABELS: Record<string, string> = {
  pending: "Pendentes",
  contacted: "Contactados",
  qualified: "Qualificados",
  converted: "Convertidos",
  negotiation: "Em Negociação",
};

function resolveStageLabel(stages: WorkflowStageRow[], ...candidateNames: string[]): string {
  for (const candidate of candidateNames) {
    const match = stages.find((s) => s.name === candidate);
    if (match) return match.label;
  }
  const firstCandidate = candidateNames[0];
  return GENERIC_STAGE_LABELS[firstCandidate] ?? firstCandidate;
}

/**
 * Builds the block of prompt text describing the organization's real,
 * ordered funnel stages, plus a resolved label for each core KPI concept
 * the fixed report sections refer to. Replaces hardcoded stage wording so
 * an org that renamed its funnel (e.g. "Qualificado" -> "Lead Quente")
 * still gets an accurate report.
 */
function buildStageContext(stages: WorkflowStageRow[]) {
  const orderedLines = [...stages]
    .sort((a, b) => a.stage_order - b.stage_order)
    .map((s, i) => {
      const flags = [
        s.is_conversion ? "conversão" : null,
        s.is_rejection ? "rejeição" : null,
        s.is_final ? "final" : null,
      ].filter(Boolean);
      return `${i + 1}. ${s.label}${flags.length ? ` (${flags.join(", ")})` : ""}`;
    });

  const pendingLabel = resolveStageLabel(stages, "pending", "new", "novo");
  const contactedLabel = resolveStageLabel(stages, "contacted", "contactado");
  const qualifiedLabel = resolveStageLabel(stages, "qualified", "qualificado");
  const convertedLabel = resolveStageLabel(stages, "converted", "convertido");

  const stagesBlock = orderedLines.length > 0
    ? `As etapas REAIS do funil desta organização, pela ordem configurada, são:\n${orderedLines.join("\n")}\n\nUsa EXACTAMENTE estas etiquetas sempre que te referires a etapas do funil. NÃO uses nomes genéricos como "Qualificado" ou "Negociação em curso" se a organização usar outra designação — usa sempre o nome real listado acima.`
    : `Esta organização ainda não tem etapas de funil configuradas; usa apenas os KPIs numéricos fornecidos e evita nomear etapas específicas.`;

  return {
    stagesBlock,
    pendingLabel,
    contactedLabel,
    qualifiedLabel,
    convertedLabel,
  };
}

/** Resolves each statusDistribution entry's display name against the org's real stage labels. */
function resolveStatusDistributionLabels(
  statusDistribution: Array<{ name: string; value: number }> | undefined,
  stages: WorkflowStageRow[],
) {
  if (!statusDistribution) return statusDistribution;
  return statusDistribution.map((entry) => {
    const match = stages.find((s) => s.name === entry.name);
    return match ? { ...entry, name: match.label } : entry;
  });
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    getAiGatewayKey();

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase configuration missing");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let caller;
    try {
      caller = await resolveCallerIdentity(req, supabase);
    } catch (e) {
      return authErrorResponse(e, corsHeaders);
    }

    const body = await req.json();
    const parsed = PayloadSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid payload", details: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const {
      organization_id,
      periodLabel,
      periodMode,
      assigneeName,
      kpis,
      topAssignees,
      evolution,
      statusDistribution,
    } = parsed.data;

    const hasAccess = await validateOrgScope(supabase, caller, organization_id);
    if (!hasAccess) {
      return new Response(
        JSON.stringify({ error: "Sem permissão para aceder a esta organização" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Persistent, DB-backed rate limit — scoped per authenticated user, same
    // pattern as ai-assistant.
    const rateLimitIdentifier = caller.anewUserId || organization_id;
    const rateLimit = await checkRateLimit(supabase, {
      bucket: RATE_LIMIT_BUCKET,
      identifier: rateLimitIdentifier,
      maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
      windowMinutes: RATE_LIMIT_WINDOW_MINUTES,
    });
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit, corsHeaders);
    }
    await recordRateLimitAttempt(supabase, RATE_LIMIT_BUCKET, rateLimitIdentifier);

    // Real, org-resolved funnel stage labels — replaces any hardcoded
    // "Qualificado" / "Negociação em curso" wording in the prompt below.
    const { data: stagesData, error: stagesError } = await supabase
      .from("lead_workflow_stages")
      .select("name, label, stage_order, is_final, is_conversion, is_rejection")
      .eq("organization_id", organization_id)
      .eq("is_active", true)
      .order("stage_order", { ascending: true });

    if (stagesError) {
      console.error("leads-dashboard-ai-report: failed to load lead_workflow_stages", stagesError);
    }
    const stages: WorkflowStageRow[] = stagesData ?? [];
    const { stagesBlock, pendingLabel, contactedLabel, qualifiedLabel, convertedLabel } =
      buildStageContext(stages);
    const resolvedStatusDistribution = resolveStatusDistributionLabels(statusDistribution, stages);

    const systemPrompt = `És um analista sénior de vendas e CRM. Escreves em português de Portugal, tom objectivo e executivo.
REGRAS ESTRITAS:
- Usa APENAS os números fornecidos no payload. NÃO inventes, estimes ou arredondes valores para além do necessário para leitura.
- Não repitas todos os KPIs — interpreta-os.
- Sê breve, concreto e accionável.
- Formata em Markdown com as secções pedidas.
- Se não houver dados suficientes numa secção, escreve "Sem dados suficientes." em vez de inventar.
- Nunca inventes nomes de etapas do funil: usa apenas as etiquetas reais fornecidas abaixo.

${stagesBlock}`;

    const periodClause =
      periodMode === "global"
        ? `Âmbito temporal: GLOBAL — os KPIs cobrem TODO o histórico da conta (sem filtro de datas). Sempre que fizeres referência ao período, diz explicitamente "todo o histórico" e NÃO menciones um intervalo de datas.`
        : `Âmbito temporal: intervalo específico — ${periodLabel}. Toda a análise deve referir-se estritamente a este período; não extrapoles para fora dele.`;

    const userPrompt = `${periodClause}

Analisa a performance do dashboard de Leads/Contactos${
      assigneeName ? ` — colaborador em foco: ${assigneeName}` : ""
    }.

Dados (JSON):
${JSON.stringify({ kpis, topAssignees, statusDistribution: resolvedStatusDistribution, evolution }, null, 2)}

Produz um relatório em Markdown com esta estrutura:

## Resumo executivo
2 a 3 linhas com a leitura geral do período.

## Leitura dos KPIs
Análise curta de: Novos no Período, Pipeline Ativo, "${qualifiedLabel}"/"${contactedLabel}"/"${pendingLabel}", Visitas Agendadas, Último Dia.

## Conversão em coorte
Interpreta "Conversões (coorte)" e "Taxa de Conversão (coorte)" — conversão significa lead criado no período que já atingiu a etapa "${convertedLabel}" (via proposta aceite). Comenta se está saudável, baixa ou pontual.

## Colaboradores
Comenta a distribuição (top / cauda) usando topAssignees. Se vazio, escreve "Sem dados suficientes.".

## Riscos e sinais
2 a 4 bullets com riscos concretos (ex.: muitos leads em "${qualifiedLabel}" sem avançar, concentração num colaborador, dias sem entradas, etc.).

## Recomendações
Exactamente 3 bullets accionáveis para a semana seguinte.`;

    const aiRes = await callAiGateway({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    if (aiRes.status === 429) {
      return new Response(
        JSON.stringify({ error: "rate_limited", message: "Demasiados pedidos. Tenta novamente daqui a instantes." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (aiRes.status === 402) {
      return new Response(
        JSON.stringify({ error: "credits_exhausted", message: "Créditos de IA esgotados. Contacta o administrador." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!aiRes.ok) {
      const text = await aiRes.text();
      console.error("leads-dashboard-ai-report: AI gateway error", aiRes.status, text);
      return new Response(
        // `detail` surfaces the real upstream error text (already logged
        // server-side above) so it's visible in "Detalhes técnicos" without
        // needing Edge Function log access to diagnose provider-side issues.
        JSON.stringify({ error: "ai_gateway_error", status: aiRes.status, detail: text }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await aiRes.json();
    const report = data?.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ report }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("leads-dashboard-ai-report error", err);
    await captureError(err, { function: "leads-dashboard-ai-report" });
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
