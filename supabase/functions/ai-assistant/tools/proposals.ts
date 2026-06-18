// Proposal tools — extracted verbatim from index.ts.

import { requireWrite } from "../shared/authz.ts";
import type { Handler, ToolDef, ToolResult } from "../shared/types.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export const createProposalDef: ToolDef = {
  type: "function",
  function: {
    name: "create_proposal",
    description: "Cria uma Proposta formal (P).",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        value: { type: "number", description: "Valor total em euros" },
        valid_until: { type: "string", description: "YYYY-MM-DD" },
        notes: { type: "string" },
      },
      required: ["title", "value"],
    },
  },
};

export const listProposalsDef: ToolDef = {
  type: "function",
  function: {
    name: "list_proposals",
    description: "Lista propostas devolvendo `proposal_number` (P-AAAA-NNNN) + título — usa SEMPRE este número (nunca o UUID) para referir a proposta ao utilizador e como input das outras tools (`get_proposal_details`, `update_proposal`, `send_proposal`, `cancel_proposal`). Filtros opcionais: `status`, `search` (ilike em título e número).",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number" },
        status: { type: "string" },
        search: { type: "string", description: "Texto parcial — pesquisa em título e proposal_number." },
      },
    },
  },
};

const createProposal: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, businessUserId, organizationId } = ctx;
  const createdBy = businessUserId || null;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const permP = requireWrite(ctx, "proposals.create", "criar propostas");
  if (permP) return permP;
  const validUntil =
    args.valid_until ||
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("proposals")
    .insert({
      title: args.title,
      description: args.description || null,
      value: args.value,
      valid_until: validUntil,
      notes: args.notes || null,
      status: "draft",
      organization_id: organizationId,
      root_organization_id: organizationId,
      created_by: createdBy,
    })
    .select("id, proposal_number")
    .single();

  if (error) throw error;
  const proposalNumber = data?.proposal_number ?? null;
  return {
    success: true,
    message: `Proposta ${proposalNumber ? proposalNumber + " " : ""}"${args.title}" criada (€${Number(args.value).toLocaleString("pt-PT")}, válida até ${validUntil}).`,
    data: { id: data.id, proposal_number: proposalNumber, link: `/proposals?open=${data.id}` },
  };
};

const listProposals: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const limit = args?.limit ?? 10;
  let q = supabase
    .from("proposals")
    .select("proposal_number, title, value, status, valid_until, id")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (args?.status) q = q.eq("status", args.status);
  if (args?.search && typeof args.search === "string" && args.search.trim().length > 0) {
    const raw = args.search.trim();
    const escaped = raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    const like = `%${escaped}%`;
    q = q.or(`title.ilike.${like},proposal_number.ilike.${like}`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return { success: true, message: `${data?.length || 0} proposta(s).`, data: data || [] };
};

export const sendProposalDef: ToolDef = {
  type: "function",
  function: {
    name: "send_proposal",
    description: "Envia uma proposta por email via send-proposal-email.",
    parameters: {
      type: "object",
      properties: {
        proposal_id: { type: "string" },
        recipient_email: { type: "string" },
        recipient_name: { type: "string" },
        recipients: { type: "array", items: { type: "string" } },
        cc: { type: "array", items: { type: "string" } },
        subject: { type: "string" },
        message: { type: "string" },
      },
      required: ["proposal_id", "recipient_email"],
    },
  },
};

const sendProposal: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId, authHeader } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const perm = requireWrite(ctx, "proposals.edit", "enviar propostas");
  if (perm) return perm;
  if (!args?.proposal_id || !UUID_RE.test(String(args.proposal_id))) return { success: false, message: "proposal_id inválido." };
  const recipient = String(args.recipient_email || "").trim();
  if (!EMAIL_RE.test(recipient)) return { success: false, message: "recipient_email inválido." };

  const { data: p } = await supabase
    .from("proposals")
    .select("id")
    .eq("id", args.proposal_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!p) return { success: false, message: "Proposta não encontrada ou fora de scope." };

  if (!authHeader) return { success: false, message: "Sessão sem token — não é possível invocar send-proposal-email." };
  const body: Record<string, any> = { proposal_id: args.proposal_id, recipient_email: recipient };
  if (args.recipient_name) body.recipient_name = String(args.recipient_name);
  if (Array.isArray(args.recipients)) body.recipients = args.recipients;
  if (Array.isArray(args.cc)) body.cc = args.cc;
  if (args.subject) body.subject = String(args.subject);
  if (args.message) body.message = String(args.message);

  const { ok, status, json } = await invokeFn(authHeader, "send-proposal-email", body);
  if (!ok) return { success: false, message: `Falha no envio (${status}): ${json?.error || json?.message || "erro desconhecido"}` };
  return { success: true, message: "Proposta enviada.", data: json };
};

export const getProposalDetailsDef: ToolDef = {
  type: "function",
  function: {
    name: "get_proposal_details",
    description: "Devolve detalhes completos de uma Proposta (header + totais + quote associada + contagem/últimos envios). Sem mutação.",
    parameters: {
      type: "object",
      properties: {
        proposal_id: { type: "string", description: "UUID, proposal_number ou título parcial — o servidor resolve." },
      },
      required: ["proposal_id"],
    },
  },
};

export const updateProposalDef: ToolDef = {
  type: "function",
  function: {
    name: "update_proposal",
    description: "Altera campos editáveis do header de uma Proposta em draft (title, description, valid_until, notes, value). Só funciona se a proposta ainda não foi enviada/aceite.",
    parameters: {
      type: "object",
      properties: {
        proposal_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        notes: { type: "string" },
        valid_until: { type: "string", description: "YYYY-MM-DD" },
        value: { type: "number" },
      },
      required: ["proposal_id"],
    },
  },
};

export const cancelProposalDef: ToolDef = {
  type: "function",
  function: {
    name: "cancel_proposal",
    description: "Cancela (soft delete) uma Proposta. Acção TERMINAL — pedir confirmação explícita ao utilizador antes de chamar com confirm=true. Bloqueado se a proposta já foi aceite (accepted_at IS NOT NULL).",
    parameters: {
      type: "object",
      properties: {
        proposal_id: { type: "string" },
        confirm: { type: "boolean" },
      },
      required: ["proposal_id", "confirm"],
    },
  },
};

const getProposalDetails: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const perm = requireWrite(ctx, "proposals.view", "ver propostas");
  if (perm) return perm;
  if (!args?.proposal_id || !UUID_RE.test(String(args.proposal_id))) {
    return { success: false, message: "proposal_id inválido." };
  }

  const { data: p, error } = await supabase
    .from("proposals")
    .select("id, proposal_number, title, description, status, value, valid_until, notes, accepted_at, created_at, entity_id, created_by")
    .eq("id", args.proposal_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!p) return { success: false, message: "Proposta não encontrada ou fora de scope." };

  let client: { id: string; name: string } | null = null;
  if (p.entity_id) {
    const { data: e } = await supabase
      .from("anew_entities")
      .select("id, display_name")
      .eq("id", p.entity_id)
      .maybeSingle();
    if (e) client = { id: e.id, name: e.display_name };
  }

  const { data: links } = await supabase
    .from("pipeline_links")
    .select("quote_id, deal_id")
    .eq("proposal_id", args.proposal_id)
    .eq("organization_id", organizationId)
    .eq("status", "active");

  const { count: sendsCount } = await supabase
    .from("proposal_sends")
    .select("id", { count: "exact", head: true })
    .eq("proposal_id", args.proposal_id);

  const { data: recentSends } = await supabase
    .from("proposal_sends")
    .select("id, sent_at, recipient_email, status")
    .eq("proposal_id", args.proposal_id)
    .order("sent_at", { ascending: false })
    .limit(5);

  return {
    success: true,
    message: `Proposta ${p.proposal_number ?? p.id}.`,
    data: {
      id: p.id,
      proposal_number: p.proposal_number,
      title: p.title,
      description: p.description,
      status: p.status,
      value: Number(p.value ?? 0),
      valid_until: p.valid_until,
      notes: p.notes,
      accepted_at: p.accepted_at,
      created_at: p.created_at,
      client,
      pipeline: {
        quote_ids: Array.from(new Set((links ?? []).map((l: any) => l.quote_id).filter(Boolean))),
        deal_ids: Array.from(new Set((links ?? []).map((l: any) => l.deal_id).filter(Boolean))),
      },
      sends: {
        total: sendsCount ?? 0,
        recent: recentSends ?? [],
      },
      link: `/proposals?open=${p.id}`,
    },
  };
};

const updateProposal: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.proposal_id || !UUID_RE.test(String(args.proposal_id))) {
    return { success: false, message: "proposal_id inválido." };
  }
  const perm = requireWrite(ctx, "proposals.edit", "alterar propostas");
  if (perm) return perm;

  const { data: p, error } = await supabase
    .from("proposals")
    .select("id, status, accepted_at")
    .eq("id", args.proposal_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!p) return { success: false, message: "Proposta não encontrada ou fora de scope." };
  if (p.status !== "draft") {
    return { success: false, message: `Proposta está em estado '${p.status}'. Só rascunhos aceitam alterações.` };
  }

  const patch: Record<string, any> = {};
  if (args.title !== undefined) {
    const v = String(args.title).trim();
    if (!v) return { success: false, message: "title vazio." };
    patch.title = v;
  }
  if (args.description !== undefined) patch.description = args.description === null ? null : String(args.description);
  if (args.notes !== undefined) patch.notes = args.notes === null ? null : String(args.notes);
  if (args.valid_until !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(args.valid_until))) {
      return { success: false, message: "valid_until tem de ser YYYY-MM-DD." };
    }
    patch.valid_until = args.valid_until;
  }
  if (args.value !== undefined) {
    const v = Number(args.value);
    if (!Number.isFinite(v) || v < 0) return { success: false, message: "value inválido." };
    patch.value = v;
  }
  if (Object.keys(patch).length === 0) {
    return { success: false, message: "Nada para actualizar — passa pelo menos um campo." };
  }

  const { error: upErr } = await supabase
    .from("proposals")
    .update(patch)
    .eq("id", args.proposal_id);
  if (upErr) throw upErr;

  return {
    success: true,
    message: "Proposta actualizada.",
    data: { id: args.proposal_id, updated_fields: Object.keys(patch), link: `/proposals?open=${args.proposal_id}` },
  };
};

const cancelProposal: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.proposal_id || !UUID_RE.test(String(args.proposal_id))) {
    return { success: false, message: "proposal_id inválido." };
  }
  if (args?.confirm !== true) {
    return { success: false, message: "Confirmação obrigatória — pede ao utilizador para confirmar e volta a chamar com confirm=true." };
  }
  const perm = requireWrite(ctx, "proposals.edit", "cancelar propostas");
  if (perm) return perm;

  const { data: p, error } = await supabase
    .from("proposals")
    .select("id, proposal_number, accepted_at")
    .eq("id", args.proposal_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!p) return { success: false, message: "Proposta não encontrada ou fora de scope." };
  if (p.accepted_at) {
    return { success: false, message: `Proposta ${p.proposal_number ?? p.id} já foi aceite — não pode ser cancelada.` };
  }

  const { error: rpcErr } = await supabase.rpc("soft_delete_business_entity", {
    p_kind: "proposal",
    p_id: args.proposal_id,
  });
  if (rpcErr) return { success: false, message: `Falha ao cancelar: ${rpcErr.message}` };

  return {
    success: true,
    message: `Proposta ${p.proposal_number ?? p.id} cancelada.`,
    data: { id: args.proposal_id, link: "/proposals" },
  };
};

export const handlers: Record<string, Handler> = {
  create_proposal: createProposal,
  list_proposals: listProposals,
  send_proposal: sendProposal,
  get_proposal_details: getProposalDetails,
  update_proposal: updateProposal,
  cancel_proposal: cancelProposal,
};

