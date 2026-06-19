import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { buildExecCtx } from "./shared/context.ts";
import { fetchSystemPrompt, fetchHelpKnowledge } from "./shared/prompt.ts";
import { summarizeToolArgs } from "./shared/summarizeArgs.ts";
import { resolveEntityId, type EntityKind } from "./shared/resolveEntityId.ts";
import { TOOLS, HANDLERS } from "./tools/registry.ts";
import type { ExecCtx, ToolResult } from "./shared/types.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-2.5-flash";

type ToolCallView = {
  id: string;
  name: string;
  argsSummary: string;
  status: "done" | "needs_confirmation" | "error";
  errorMessage?: string;
  durationMs?: number;
};

function toolCallView(
  id: string,
  name: string,
  args: unknown,
  result: ToolResult | null | undefined,
  durationMs: number,
): ToolCallView {
  let status: ToolCallView["status"] = "done";
  let errorMessage: string | undefined;
  if (result?.requires_confirmation) status = "needs_confirmation";
  else if (result && result.success === false) {
    status = "error";
    errorMessage = typeof result.message === "string" ? result.message : undefined;
  }
  return {
    id,
    name,
    argsSummary: summarizeToolArgs(args),
    status,
    ...(errorMessage ? { errorMessage } : {}),
    durationMs: Math.round(durationMs),
  };
}

function streamWithToolCalls(
  upstream: ReadableStream<Uint8Array>,
  toolCalls: ToolCallView[],
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        if (toolCalls.length > 0) {
          const frame = `event: tool_calls\ndata: ${JSON.stringify({ toolCalls })}\n\n`;
          controller.enqueue(encoder.encode(frame));
        }
        const reader = upstream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }
      } catch (e) {
        controller.error(e);
        return;
      }
      controller.close();
    },
  });
}

async function executeTool(ctx: ExecCtx, toolName: string, args: any): Promise<ToolResult> {
  const handler = HANDLERS[toolName];
  if (!handler) return { success: false, message: `Ferramenta "${toolName}" não reconhecida.` };
  try {
    return await handler(ctx, args);
  } catch (error: any) {
    console.error(`Error executing tool ${toolName}:`, error);
    return { success: false, message: `Erro: ${error.message}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase configuration missing");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Body is parsed exactly ONCE.
    const body = await req.json();
    const {
      messages = [],
      language = "pt",
      organizationId: bodyOrgId,
      companyId,
      currentContext = null,
      pendingTool = null,
    } = body;
    const organizationId: string | null = bodyOrgId || companyId || null;

    const built = await buildExecCtx({ req, supabase, organizationId });
    if (!built.ok) {
      return new Response(JSON.stringify(built.body), {
        status: built.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ctx = built.ctx;

    // Capabilities block — fonte canónica = TOOLS no registry, gerado em runtime
    // para que o prompt da BD nunca tenha de listar nomes de tools.
    const capabilitiesBlock = (() => {
      const lines = TOOLS
        .map((t: any) => {
          const fn = t?.function;
          if (!fn?.name) return null;
          const desc = (fn.description || "").replace(/\s+/g, " ").trim();
          return `- ${fn.name}: ${desc}`;
        })
        .filter(Boolean) as string[];
      return `## CAPACIDADES (auto)\nFerramentas reais disponíveis nesta sessão. Usa estes nomes exactos; se algo não está aqui, não existe.\n${lines.join("\n")}`;
    })();

    const systemPrompt = await fetchSystemPrompt(supabase, capabilitiesBlock);
    const helpKnowledge = await fetchHelpKnowledge(supabase, language);
    const deepLinksFormat = `\n\n## DEEP LINKS:\nQuando incluíres links no texto, usa formato markdown [Texto](/caminho). O frontend deteta automaticamente. Para abrir um ecrã sem fazer outra ação, usa a ferramenta navigate.`;

    // Build runtime context (active org, user, roles, date) so Olyvia knows where she is
    const _now = new Date();
    const _today = _now.toISOString().slice(0, 10);
    let runtimeContext = `\n\n## CONTEXTO ATUAL:\n- Data/hora: ${_now.toISOString()} (hoje: ${_today})\n`;
    const { data: org } = await supabase
      .from("anew_organizations")
      .select("name, type, sector")
      .eq("id", ctx.organizationId)
      .maybeSingle();
    if (org) {
      runtimeContext += `- Organização ativa: **${org.name}**${org.type ? ` (${org.type})` : ""}${org.sector ? ` — ${org.sector}` : ""}\n- ID da organização: ${ctx.organizationId}\n`;
    }
    if (ctx.businessUserId) {
      const { data: u } = await supabase
        .from("anew_users")
        .select("name, email")
        .eq("id", ctx.businessUserId)
        .maybeSingle();
      if (u) runtimeContext += `- Utilizador: ${u.name} (${u.email})\n`;

      // Roles activas — 2 queries, sem embed, suporta multi-role
      const { data: _ms } = await supabase
        .from("anew_memberships")
        .select("role_id")
        .eq("user_id", ctx.businessUserId)
        .eq("organization_id", ctx.organizationId)
        .eq("status", "active")
        .limit(10);
      const _roleIds = Array.from(
        new Set(((_ms ?? []) as Array<{ role_id: string | null }>).map((m) => m?.role_id).filter(Boolean) as string[]),
      );
      if (_roleIds.length > 0) {
        const { data: _roles } = await supabase
          .from("anew_roles")
          .select("code")
          .in("id", _roleIds)
          .limit(10);
        const _roleCodes = ((_roles ?? []) as Array<{ code: string | null }>)
          .map((r) => r?.code)
          .filter(Boolean)
          .sort() as string[];
        if (_roleCodes.length > 0) runtimeContext += `- Roles activas: ${_roleCodes.join(", ")}\n`;
      }
    }
    runtimeContext += `\nQuando perguntarem "em que empresa estou", "qual é a organização ativa" ou similar, responde diretamente com o nome acima — não digas que não sabes.`;

    // Frontend-supplied UI context (current route, selected entity, etc.)
    if (currentContext && typeof currentContext === "object") {
      try {
        const lines: string[] = [];
        if (currentContext.path) lines.push(`- Página actual: ${String(currentContext.path)}`);
        if (currentContext.entityType && currentContext.entityId) {
          lines.push(`- Registo seleccionado: ${String(currentContext.entityType)} id=${String(currentContext.entityId)}`);
        }
        if (currentContext.extra && typeof currentContext.extra === "object") {
          for (const [k, v] of Object.entries(currentContext.extra)) {
            if (v == null) continue;
            lines.push(`- ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
          }
        }
        if (lines.length > 0) {
          runtimeContext += `\n\n## CONTEXTO DA UI (onde o utilizador está agora):\n${lines.join("\n")}\n`;
        }
      } catch (_e) { /* ignore malformed currentContext */ }
    }

    const fullSystemPrompt = systemPrompt + helpKnowledge + deepLinksFormat + runtimeContext;

    // Limit context window
    const trimmedMessages = messages.slice(-20);

    // ---- pendingTool path: user resolved a confirmation in the UI; bypass first model call ----
    // NOTA: pendingTool é usado para confirmações de UI (ex.: anti-dup de entidades) e
    // não passa pelo guard de catalogSearchIds. Se algum dia for usado para
    // add_quote_items / create_quote(items[]), aplicar o mesmo guard aqui ou rejeitar.
    if (pendingTool && typeof pendingTool === "object" && typeof pendingTool.name === "string") {
      const args = (pendingTool.args && typeof pendingTool.args === "object") ? pendingTool.args : {};
      const toolCallId = `pending_${Date.now()}`;
      const startedAt = performance.now();
      const result = await executeTool(ctx, pendingTool.name, args);
      const durationMs = performance.now() - startedAt;
      const callView = toolCallView(toolCallId, pendingTool.name, args, result, durationMs);

      // If the tool STILL asks for confirmation (e.g. invalid id), surface it again to the UI.
      if (result && result.requires_confirmation) {
        return new Response(
          JSON.stringify({
            type: "confirmation",
            confirmations: [{
              tool: pendingTool.name,
              args,
              candidate_entity_id: result.candidate_entity_id ?? null,
              candidate_name: result.candidate_name ?? null,
              match_field: result.match_field ?? null,
              proposed_payload: result.proposed_payload ?? null,
              message: result.message ?? "É necessário confirmar.",
            }],
            toolCalls: [callView],
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const synthAssistantMsg = {
        role: "assistant",
        content: null,
        tool_calls: [{
          id: toolCallId,
          type: "function",
          function: { name: pendingTool.name, arguments: JSON.stringify(args) },
        }],
      };
      const toolMsg = { role: "tool", tool_call_id: toolCallId, content: JSON.stringify(result) };

      const followUpResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: fullSystemPrompt },
            ...trimmedMessages,
            synthAssistantMsg,
            toolMsg,
          ],
          stream: true,
        }),
      });

      if (!followUpResponse.ok || !followUpResponse.body) throw new Error("Follow-up AI request failed (pendingTool)");
      return new Response(streamWithToolCalls(followUpResponse.body, [callView]), {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // ---- Multi-turn tool calling loop ----
    // O modelo pode encadear várias tools na mesma resposta (ex.:
    // search_products -> add_quote_items). Iteramos até o modelo parar
    // de pedir tools ou atingirmos o cap de segurança.
    const MAX_TOOL_ITERATIONS = 5;
    const conversation: any[] = [...trimmedMessages];
    const allExecutedToolCalls: ToolCallView[] = [];
    let toolLoopAborted = false;

    // Guard server-side: só UUIDs devolvidos por search_products desta sessão podem ser
    // usados em add_quote_items / create_quote(items[]). O set é actualizado DEPOIS de
    // executar o lote de tools, pelo que search_products e add_quote_items não podem
    // coexistir no mesmo lote — têm de ir em iterações separadas.
    const catalogSearchIds = new Set<string>();
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    type SkippedItem = {
      item: any;
      reason: string;
      field?: "product_id" | "service_id" | "bundle_id";
      kind?: "product" | "service" | "bundle";
      query?: string;            // present only quando rescue é possível (texto não-UUID)
      search_results?: Array<{ id: string; name?: string; sku?: string; kind?: string }>;
    };

    function validateCatalogItems(items: any[]): { ok: true } | { ok: false; skipped: SkippedItem[] } {
      const skipped: SkippedItem[] = [];
      for (const raw of items ?? []) {
        const fields: Array<["product_id" | "service_id" | "bundle_id", "product" | "service" | "bundle"]> = [
          ["product_id", "product"],
          ["service_id", "service"],
          ["bundle_id", "bundle"],
        ];
        for (const [field, kind] of fields) {
          const v = raw?.[field];
          if (v == null) continue;
          const s = String(v);
          if (!UUID_RE.test(s)) {
            skipped.push({
              item: raw,
              field,
              kind,
              query: s,
              reason: `Fluxo incorrecto: ${field}="${s}" não é UUID. O servidor pesquisou por ti — vê search_results.`,
            });
          } else if (!catalogSearchIds.has(s)) {
            skipped.push({
              item: raw,
              field,
              kind,
              // sem `query` -> não há rescue possível (UUID inventado)
              reason: `Fluxo incorrecto: ${field}=${s} não veio de uma search_products desta sessão. Não inventes UUIDs nem reutilizes UUIDs de outras conversas. Chama search_products({kind:"${kind}", query:"<nome>"}) primeiro.`,
            });
          }
        }
      }
      return skipped.length > 0 ? { ok: false, skipped } : { ok: true };
    }

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "system", content: fullSystemPrompt }, ...conversation],
          tools: TOOLS,
          tool_choice: "auto",
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Limite de pedidos excedido. Tenta novamente em breve." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: "Créditos insuficientes. Contacta o administrador." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const errorText = await response.text();
        console.error("AI gateway error:", response.status, errorText);
        throw new Error("AI gateway error");
      }

      const aiResponse = await response.json();
      const choice = aiResponse.choices?.[0];
      const toolCalls = choice?.message?.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        // Modelo terminou — sai do loop e deixa o caminho de streaming final entregar o conteúdo.
        break;
      }

      console.log(`[ai-assistant] iter=${iter + 1} toolCalls=[${toolCalls.map((tc: any) => tc.function?.name).join(", ")}]`);

      const toolResults = await Promise.all(
        toolCalls.map(async (tc: any) => {
          const toolName = tc.function.name;
          let toolArgs: any = {};
          try {
            toolArgs = JSON.parse(tc.function.arguments || "{}");
          } catch (e) {
            console.error(`Bad args for ${toolName}:`, e);
          }
          const startedAt = performance.now();

          // Views extra geradas por auto-rescue (search_products / lookup de quote_number
          // executados pelo servidor em nome do modelo). São APENAS para UI — não vão
          // ao histórico do modelo.
          const rescueViews: ToolCallView[] = [];
          let result: ToolResult;

          // ---- Auto-rescue de IDs: modelo costuma passar quote_number / proposal_number /
          // título em vez do UUID. Resolvemos via helper partilhado scoped à org activa.
          // Cobre quote_id, deal_id e proposal_id; cada tool entra apenas no seu set.
          type IdResolverEntry = {
            tools: Set<string>;
            argKey: string | string[];
            kind: EntityKind;
            label: string; // pt: "orçamento" | "PP" | "proposta" | "lead" | "contacto" | "cliente"
          };
          const ID_RESOLVERS: IdResolverEntry[] = [
            {
              tools: new Set([
                "add_quote_items",
                "set_quote_template",
                "set_quote_model",
                "send_quote",
                "duplicate_quote",
                "get_quote_details",
                "remove_quote_lines",
                "update_quote_line",
                "update_quote",
                "delete_quote",
              ]),
              argKey: "quote_id",
              kind: "quote",
              label: "orçamento",
            },
            {
              tools: new Set([
                "update_deal",
                "close_deal",
                "get_deal_details",
                "cancel_deal",
              ]),
              argKey: "deal_id",
              kind: "deal",
              label: "PP",
            },
            {
              tools: new Set([
                "send_proposal",
                "get_proposal_details",
                "update_proposal",
                "cancel_proposal",
              ]),
              argKey: "proposal_id",
              kind: "proposal",
              label: "proposta",
            },
            {
              tools: new Set([
                "get_lead_details",
                "delete_lead",
                "update_lead",
                "update_lead_status",
              ]),
              argKey: ["lead_id", "id"],
              kind: "lead",
              label: "lead",
            },
            {
              tools: new Set([
                "get_contact_details",
                "update_contact_notes",
                "delete_contact",
                "update_contact",
              ]),
              argKey: ["contact_id", "id"],
              kind: "contact",
              label: "contacto",
            },
            {
              tools: new Set([
                "get_client_details",
                "update_client",
                "delete_client",
              ]),
              argKey: "client_id",
              kind: "client",
              label: "cliente",
            },
            {
              tools: new Set(["get_product_details", "get_product_price", "get_product_stock"]),
              argKey: "product_id",
              kind: "product",
              label: "produto",
            },
            {
              tools: new Set(["get_service_details"]),
              argKey: "service_id",
              kind: "service",
              label: "serviço",
            },
            {
              tools: new Set(["get_bundle_details"]),
              argKey: "bundle_id",
              kind: "bundle",
              label: "bundle",
            },
            {
              tools: new Set([
                "get_schedule_item",
                "complete_schedule_item",
                "cancel_schedule_item",
                "reschedule_schedule_item",
                "assign_schedule_item",
              ]),
              argKey: ["item_id", "id"],
              kind: "schedule_item",
              label: "item de agenda",
            },
            {
              tools: new Set([
                "get_contract_details",
                "update_contract",
                "cancel_contract",
              ]),
              argKey: ["contract_id", "id"],
              kind: "contract",
              label: "contrato",
            },
          ];

          const resolver = ID_RESOLVERS.find((r) => r.tools.has(toolName));
          const resolverArgKey: string | null = resolver
            ? (Array.isArray(resolver.argKey)
                ? (resolver.argKey.find((k) => typeof toolArgs?.[k] === "string") ?? null)
                : (typeof toolArgs?.[resolver.argKey] === "string" ? resolver.argKey : null))
            : null;
          if (resolver && resolverArgKey && !UUID_RE.test(toolArgs[resolverArgKey])) {
            const rawRef = String(toolArgs[resolverArgKey]).trim();
            const lookupStart = performance.now();
            let resolveOutcome: Awaited<ReturnType<typeof resolveEntityId>>;
            try {
              resolveOutcome = await resolveEntityId(ctx.supabase, ctx.organizationId as string, resolver.kind, rawRef);
            } catch (e) {
              resolveOutcome = { notFound: true };
              console.error("resolveEntityId failed:", e);
            }
            const lookupDuration = performance.now() - lookupStart;

            const lookupResult: ToolResult = "uuid" in resolveOutcome
              ? { success: true, message: `${resolver.label} "${rawRef}" resolvido.`, data: { id: resolveOutcome.uuid } }
              : "ambiguous" in resolveOutcome
                ? { success: false, message: `Vários ${resolver.label}s correspondem a "${rawRef}".`, data: { candidates: resolveOutcome.ambiguous } }
                : { success: false, message: `Não encontrei ${resolver.label} com "${rawRef}".` };
            rescueViews.push(toolCallView(
              `rescue_${tc.id}_${resolverArgKey}_${Date.now()}`,
              `resolve_${resolver.kind}_id`,
              { [resolverArgKey]: rawRef },
              lookupResult,
              lookupDuration,
            ));

            if ("uuid" in resolveOutcome) {
              toolArgs = { ...toolArgs, [resolverArgKey]: resolveOutcome.uuid };
            } else {
              result = "ambiguous" in resolveOutcome
                ? {
                  success: false,
                  message: `Encontrei vários ${resolver.label}s para "${rawRef}". Pede ao utilizador para escolher pelo número/título completo.`,
                  data: { candidates: resolveOutcome.ambiguous },
                }
                : {
                  success: false,
                  message: `Não encontrei ${resolver.label} com "${rawRef}" nesta organização.`,
                };
              const durationMs = performance.now() - startedAt;
              return {
                tool_call_id: tc.id,
                tool_name: toolName,
                tool_args: toolArgs,
                result,
                content: JSON.stringify(result),
                view: toolCallView(tc.id, toolName, toolArgs, result, durationMs),
                extraViews: rescueViews,
              };
            }
          }


          // Guard: bloquear add_quote_items / create_quote(items[]) com IDs que não
          // venham de uma search_products já processada em iteração anterior.
          const needsGuard =
            toolName === "add_quote_items" ||
            (toolName === "create_quote" && Array.isArray(toolArgs?.items) && toolArgs.items.length > 0);

          if (needsGuard) {
            const items = Array.isArray(toolArgs?.items) ? toolArgs.items : [];
            const check = validateCatalogItems(items);
            if (!check.ok) {
              // Auto-rescue: para cada skipped recuperável (texto não-UUID, tem `query`),
              // corre search_products e anexa search_results ao próprio skipped.
              for (const sk of check.skipped) {
                if (!sk.query || !sk.kind) continue; // sem rescue possível (UUID inventado)
                const searchArgs = { query: sk.query, kind: sk.kind, limit: 10 };
                const rescueStart = performance.now();
                const searchResult = await executeTool(ctx, "search_products", searchArgs);
                const rescueDuration = performance.now() - rescueStart;
                rescueViews.push(toolCallView(
                  `rescue_${tc.id}_${sk.field}_${Date.now()}`,
                  "search_products",
                  searchArgs,
                  searchResult,
                  rescueDuration,
                ));
                const found = Array.isArray(searchResult?.data?.items) ? searchResult.data.items : [];
                sk.search_results = found.map((it: any) => ({
                  id: it?.id,
                  name: it?.name,
                  sku: it?.sku,
                  kind: it?.kind ?? sk.kind,
                }));
                // 1 match único → legitima esse UUID para a próxima iteração.
                // 0 ou >1 → NÃO adiciona; modelo tem de perguntar ao utilizador.
                if (found.length === 1 && typeof found[0]?.id === "string") {
                  catalogSearchIds.add(found[0].id);
                }
              }

              const message = toolName === "create_quote"
                ? "Fluxo incorrecto antes de criar o orçamento — passaste *_id sem search_products prévia. O ORÇAMENTO NÃO FOI CRIADO (a validação acontece antes da mutation). Pesquisei por ti — vê data.skipped[*].search_results. Resolve cada *_id (1 match → usa o id; vários → pergunta ao utilizador qual escolher antes de tentar de novo; 0 → diz que não existe) e chama create_quote outra vez."
                : "Não chamaste search_products primeiro. Pesquisei por ti — vê data.skipped[*].search_results. Se houver 1 match, chama add_quote_items com esse *_id. Se houver vários, mostra os candidatos (nome + sku) ao utilizador e pergunta qual usar antes de inserir. Nenhuma linha foi adicionada ao orçamento.";

              result = {
                success: false,
                message,
                data: { added: 0, skipped: check.skipped },
              };
              const durationMs = performance.now() - startedAt;
              console.warn(`[ai-assistant] guard bloqueou ${toolName} — ${check.skipped.length} item(s); rescue=${rescueViews.length}.`);
              return {
                tool_call_id: tc.id,
                tool_name: toolName,
                tool_args: toolArgs,
                result,
                content: JSON.stringify(result),
                view: toolCallView(tc.id, toolName, toolArgs, result, durationMs),
                extraViews: rescueViews,
              };
            }
          }

          result = await executeTool(ctx, toolName, toolArgs);
          const durationMs = performance.now() - startedAt;
          return {
            tool_call_id: tc.id,
            tool_name: toolName,
            tool_args: toolArgs,
            result,
            content: JSON.stringify(result),
            view: toolCallView(tc.id, toolName, toolArgs, result, durationMs),
          };
        }),
      );

      // Actualizar o set com IDs devolvidos por search_products desta iteração,
      // ANTES da próxima iteração mas DEPOIS de validar/executar a actual.
      for (const r of toolResults) {
        if (r.tool_name === "search_products" && r.result?.success === true) {
          const items = r.result?.data?.items;
          if (Array.isArray(items)) {
            for (const it of items) {
              if (it?.id && typeof it.id === "string") catalogSearchIds.add(it.id);
            }
          }
        }
      }

      for (const r of toolResults) {
        allExecutedToolCalls.push(r.view);
        if (Array.isArray((r as any).extraViews)) {
          for (const v of (r as any).extraViews) allExecutedToolCalls.push(v);
        }
      }

      // Short-circuit: alguma tool pediu confirmação à UI.
      const pendingConfirmations = toolResults.filter((r) => r.result && r.result.requires_confirmation);
      if (pendingConfirmations.length > 0) {
        return new Response(
          JSON.stringify({
            type: "confirmation",
            confirmations: pendingConfirmations.map((r) => ({
              tool: r.tool_name,
              args: r.tool_args,
              candidate_entity_id: r.result.candidate_entity_id ?? null,
              candidate_name: r.result.candidate_name ?? null,
              match_field: r.result.match_field ?? null,
              proposed_payload: r.result.proposed_payload ?? null,
              message: r.result.message ?? "É necessário confirmar.",
            })),
            toolCalls: allExecutedToolCalls,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Acumula assistant + tool results no histórico para a próxima iteração.
      conversation.push(choice.message);
      for (const r of toolResults) {
        conversation.push({ role: "tool", tool_call_id: r.tool_call_id, content: r.content });
      }

      if (iter === MAX_TOOL_ITERATIONS - 1) {
        toolLoopAborted = true;
        console.warn(`[ai-assistant] tool loop hit MAX_TOOL_ITERATIONS=${MAX_TOOL_ITERATIONS}`);
        conversation.push({
          role: "user",
          content: "Atingiste o limite de iterações de ferramentas. Resume já o que conseguiste fazer e o que falta, sem chamar mais tools.",
        });
      }
    }

    // ---- Final streaming call (sem tools) — entrega texto ao cliente ----
    const streamResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: fullSystemPrompt }, ...conversation],
        stream: true,
      }),
    });

    if (!streamResponse.ok || !streamResponse.body) throw new Error("Final stream AI request failed");

    if (allExecutedToolCalls.length > 0 || toolLoopAborted) {
      return new Response(streamWithToolCalls(streamResponse.body, allExecutedToolCalls), {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    return new Response(streamResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("AI assistant error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
