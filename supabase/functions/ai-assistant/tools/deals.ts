// Deal tools — extracted verbatim from index.ts.

import { requireWrite } from "../shared/authz.ts";
import type { Handler, ToolDef, ToolResult } from "../shared/types.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function invokeFn(authHeader: string, name: string, body: any): Promise<{ ok: boolean; status: number; json: any }> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": authHeader, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, json };
}

export const createDealDef: ToolDef = {
  type: "function",
  function: {
    name: "create_deal",
    description: "Cria um Pedido de Proposta (PP). Resolve stage do pipeline automaticamente.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        value: { type: "number", description: "Valor esperado em euros" },
        client_name: { type: "string" },
      },
      required: ["title"],
    },
  },
};

export const listDealsDef: ToolDef = {
  type: "function",
  function: {
    name: "list_deals",
    description: "Lista os PP mais recentes da organização.",
    parameters: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
  },
};

const createDeal: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, businessUserId, organizationId } = ctx;
  const createdBy = businessUserId || null;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const permD = requireWrite(ctx, "deals.create", "criar PP");
  if (permD) return permD;
  // deal_stages is global (no organization_id, no is_active) — use order_index
  const { data: stage } = await supabase
    .from("deal_stages")
    .select("id")
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!stage) return { success: false, message: "Nenhum stage configurado em deal_stages." };

  const { data, error } = await supabase
    .from("deals")
    .insert({
      title: args.title,
      description: args.description || null,
      value: args.value ?? 0,
      stage_id: stage.id,
      organization_id: organizationId,
      root_organization_id: organizationId,
      created_by: createdBy,
    })
    .select("id")
    .single();

  if (error) throw error;
  return {
    success: true,
    message: `PP "${args.title}" criado.`,
    data: { id: data.id, link: `/deals?open=${data.id}` },
  };
};

const listDeals: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const limit = args?.limit ?? 10;
  const { data, error } = await supabase
    .from("deals")
    .select("id, title, value, stage_id, deal_stages(name)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return { success: true, message: `${data?.length || 0} PP encontrado(s).`, data: data || [] };
};

export const createDealFromLeadDef: ToolDef = {
  type: "function",
  function: {
    name: "create_deal_from_lead",
    description: "Cria um Pedido de Proposta (PP) a partir de um lead. Reutiliza o PP se já existir para o lead (dedup por lead_id). Como efeito secundário muda o lead (status='qualified', workflow_stage_id='proposta') e cria entidade se o lead não tinha. Devolve o deal_id.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string", description: "UUID do lead" },
        title: { type: "string", description: "Título opcional do PP" },
      },
      required: ["lead_id"],
    },
  },
};

export const updateDealDef: ToolDef = {
  type: "function",
  function: {
    name: "update_deal",
    description: "Edita um PP (title, value, stage_id, assigned_to). Não toca closed_at — usa close_deal.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        value: { type: "number" },
        stage_id: { type: "string", description: "UUID de deal_stages" },
        assigned_to: { type: "string", description: "UUID anew_users.id" },
      },
      required: ["id"],
    },
  },
};

export const closeDealDef: ToolDef = {
  type: "function",
  function: {
    name: "close_deal",
    description: "Fecha um PP com resultado ganho ou perdido. Resolve o stage com is_won/is_lost e marca closed_at.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        outcome: { type: "string", enum: ["won", "lost"] },
      },
      required: ["id", "outcome"],
    },
  },
};

const createDealFromLead: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId, authHeader } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const permL = requireWrite(ctx, "leads.edit", "editar leads (necessário para converter)");
  if (permL) return permL;
  const permD = requireWrite(ctx, "deals.create", "criar PP");
  if (permD) return permD;
  if (!args?.lead_id || !UUID_RE.test(String(args.lead_id))) return { success: false, message: "lead_id inválido." };

  // Org-scope: lead must belong to active org
  const { data: lead } = await supabase
    .from("anew_leads")
    .select("id, organization_id")
    .eq("id", args.lead_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!lead) return { success: false, message: "Lead não encontrado ou fora de scope." };

  if (!authHeader) return { success: false, message: "Sessão sem token — não é possível invocar pipeline-automation." };

  const { ok, status, json } = await invokeFn(authHeader, "pipeline-automation", {
    action: "create_deal_from_lead",
    payload: {
      lead_id: args.lead_id,
      title: args.title || undefined,
      organization_id: organizationId,
      root_organization_id: organizationId,
    },
  });
  if (!ok || !json?.success) {
    return { success: false, message: `Falha ao criar PP (${status}): ${json?.message || "erro desconhecido"}` };
  }
  const dealId = json.created_id;
  return {
    success: true,
    message: json.message || "Pedido de Proposta criado.",
    data: { id: dealId, deal_id: dealId, link: `/deals?open=${dealId}` },
  };
};

const updateDeal: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const perm = requireWrite(ctx, "deals.edit", "editar PP");
  if (perm) return perm;
  if (!args?.id || !UUID_RE.test(String(args.id))) return { success: false, message: "id inválido." };
  const patch: Record<string, any> = {};
  if (args.title !== undefined) patch.title = String(args.title);
  if (args.value !== undefined) {
    const v = Number(args.value);
    if (!Number.isFinite(v)) return { success: false, message: "value inválido." };
    patch.value = v;
  }
  if (args.assigned_to !== undefined) {
    if (args.assigned_to !== null && !UUID_RE.test(String(args.assigned_to))) return { success: false, message: "assigned_to inválido." };
    patch.assigned_to = args.assigned_to;
  }
  if (args.stage_id !== undefined) {
    if (!UUID_RE.test(String(args.stage_id))) return { success: false, message: "stage_id inválido." };
    const { data: stage } = await supabase.from("deal_stages").select("id").eq("id", args.stage_id).maybeSingle();
    if (!stage) return { success: false, message: "stage_id não existe em deal_stages." };
    patch.stage_id = args.stage_id;
  }
  if (Object.keys(patch).length === 0) return { success: false, message: "Nada para atualizar." };
  const { data, error } = await supabase
    .from("deals")
    .update(patch)
    .eq("id", args.id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select("id, title, value, stage_id, assigned_to")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { success: false, message: "PP não encontrado ou fora de scope." };
  return { success: true, message: "PP atualizado.", data };
};

const closeDeal: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const perm = requireWrite(ctx, "deals.edit", "fechar PP");
  if (perm) return perm;
  if (!args?.id || !UUID_RE.test(String(args.id))) return { success: false, message: "id inválido." };
  if (args.outcome !== "won" && args.outcome !== "lost") return { success: false, message: "outcome deve ser 'won' ou 'lost'." };

  const flagCol = args.outcome === "won" ? "is_won" : "is_lost";
  const { data: stage } = await supabase
    .from("deal_stages")
    .select("id")
    .eq(flagCol, true)
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!stage) return { success: false, message: `Nenhum stage com ${flagCol}=true em deal_stages.` };

  const { data, error } = await supabase
    .from("deals")
    .update({ stage_id: stage.id, closed_at: new Date().toISOString() })
    .eq("id", args.id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select("id, stage_id, closed_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { success: false, message: "PP não encontrado ou fora de scope." };
  return { success: true, message: `PP fechado (${args.outcome}).`, data };
};

export const getDealDetailsDef: ToolDef = {
  type: "function",
  function: {
    name: "get_deal_details",
    description: "Devolve detalhes completos de um PP (header + cliente + stage + pipeline associada: quotes/proposals/contracts ligados). Sem mutação.",
    parameters: {
      type: "object",
      properties: {
        deal_id: { type: "string", description: "UUID ou título parcial — o servidor resolve." },
      },
      required: ["deal_id"],
    },
  },
};

export const cancelDealDef: ToolDef = {
  type: "function",
  function: {
    name: "cancel_deal",
    description: "Cancela (soft delete) um PP. Acção TERMINAL — pedir confirmação explícita ao utilizador antes de chamar com confirm=true. Bloqueado se o PP já estiver fechado (closed_at IS NOT NULL).",
    parameters: {
      type: "object",
      properties: {
        deal_id: { type: "string", description: "UUID ou título parcial — o servidor resolve." },
        confirm: { type: "boolean", description: "Tem de ser true." },
      },
      required: ["deal_id", "confirm"],
    },
  },
};

const getDealDetails: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const perm = requireWrite(ctx, "deals.view", "ver PP");
  if (perm) return perm;
  if (!args?.deal_id || !UUID_RE.test(String(args.deal_id))) {
    return { success: false, message: "deal_id inválido." };
  }

  const { data: deal, error } = await supabase
    .from("deals")
    .select("id, title, value, stage_id, assigned_to, entity_id, created_at, closed_at, created_by, deal_stages(name)")
    .eq("id", args.deal_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!deal) return { success: false, message: "PP não encontrado ou fora de scope." };

  let client: { id: string; name: string } | null = null;
  if (deal.entity_id) {
    const { data: e } = await supabase
      .from("anew_entities")
      .select("id, display_name")
      .eq("id", deal.entity_id)
      .maybeSingle();
    if (e) client = { id: e.id, name: e.display_name };
  }

  const { data: links } = await supabase
    .from("pipeline_links")
    .select("quote_id, proposal_id, contract_id")
    .eq("deal_id", args.deal_id)
    .eq("organization_id", organizationId)
    .eq("status", "active");

  const quoteIds = Array.from(new Set((links ?? []).map((l: any) => l.quote_id).filter(Boolean)));
  const proposalIds = Array.from(new Set((links ?? []).map((l: any) => l.proposal_id).filter(Boolean)));
  const contractIds = Array.from(new Set((links ?? []).map((l: any) => l.contract_id).filter(Boolean)));

  return {
    success: true,
    message: `PP "${deal.title}".`,
    data: {
      id: deal.id,
      title: deal.title,
      value: Number(deal.value ?? 0),
      stage: deal.deal_stages?.name ?? null,
      stage_id: deal.stage_id,
      assigned_to: deal.assigned_to,
      client,
      created_at: deal.created_at,
      closed_at: deal.closed_at,
      pipeline: {
        quote_ids: quoteIds,
        proposal_ids: proposalIds,
        contract_ids: contractIds,
      },
      link: `/deals?open=${deal.id}`,
    },
  };
};

const cancelDeal: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.deal_id || !UUID_RE.test(String(args.deal_id))) {
    return { success: false, message: "deal_id inválido." };
  }
  if (args?.confirm !== true) {
    return { success: false, message: "Confirmação obrigatória — pede ao utilizador para confirmar e volta a chamar com confirm=true." };
  }
  const perm = requireWrite(ctx, "deals.edit", "cancelar PP");
  if (perm) return perm;

  const { data: deal, error } = await supabase
    .from("deals")
    .select("id, title, closed_at")
    .eq("id", args.deal_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!deal) return { success: false, message: "PP não encontrado ou fora de scope." };
  if (deal.closed_at) {
    return { success: false, message: `PP "${deal.title}" já está fechado — não pode ser cancelado.` };
  }

  const { error: rpcErr } = await supabase.rpc("soft_delete_business_entity", {
    p_kind: "deal",
    p_id: args.deal_id,
  });
  if (rpcErr) return { success: false, message: `Falha ao cancelar: ${rpcErr.message}` };

  return {
    success: true,
    message: `PP "${deal.title}" cancelado.`,
    data: { id: args.deal_id, link: "/deals" },
  };
};

export const handlers: Record<string, Handler> = {
  create_deal: createDeal,
  list_deals: listDeals,
  create_deal_from_lead: createDealFromLead,
  update_deal: updateDeal,
  close_deal: closeDeal,
  get_deal_details: getDealDetails,
  cancel_deal: cancelDeal,
};

