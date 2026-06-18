// Fase 4.D — Contratos (read + light edits).
// 5 tools: list_contracts, get_contract_details, update_contract, cancel_contract, restore_contract.
//
// - Sem hardcode de gates client_contracts.* (não estão em permissionAliases.ts).
//   Soft-check: só enforce se a perm existir no set do utilizador; senão skip.
// - Owner-fallback (created_by === businessUserId) para mutations.
// - Sem coluna `title` no schema. Identificação humana = `contract_number` (imutável).
// - Status real em uso: draft|signed. Cancelar = soft-delete via deleted_at.

import { can, permissionExists } from "../shared/authz.ts";
import type { ExecCtx, Handler, ToolDef, ToolResult } from "../shared/types.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function escapeIlike(q: string): string {
  return q.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// Soft-check: respeita a perm se o user a tiver; caso contrário cai para owner-check.
function canEditContract(ctx: ExecCtx, row: { created_by: string | null }, permCode: string): boolean {
  const hasPerm = permissionExists(ctx, permCode) && can(ctx, permCode);
  const isOwner = !!ctx.businessUserId && row.created_by === ctx.businessUserId;
  return hasPerm || isOwner;
}

function checkViewPerm(ctx: ExecCtx): ToolResult | null {
  // Soft-check: se a perm não estiver no set do user, skip (paridade com scheduling.*).
  if (permissionExists(ctx, "client_contracts.view") && !can(ctx, "client_contracts.view")) {
    return { success: false, message: "Não tens permissão para ver contratos (falta: client_contracts.view)." };
  }
  return null;
}

// Resolve nome do cliente para uma lista de client_ids.
async function resolveClientNames(supabase: any, clientIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (clientIds.length === 0) return map;
  const { data: clients } = await supabase
    .from("anew_clients")
    .select("id, entity_id")
    .in("id", clientIds);
  const entityIds = (clients ?? []).map((c: any) => c.entity_id).filter(Boolean);
  const entityById = new Map<string, string>();
  if (entityIds.length > 0) {
    const { data: entities } = await supabase
      .from("anew_entities")
      .select("id, display_name")
      .in("id", entityIds);
    for (const e of entities ?? []) entityById.set(e.id, e.display_name ?? "");
  }
  for (const c of clients ?? []) {
    map.set(c.id, entityById.get(c.entity_id) ?? "");
  }
  return map;
}

// ============================================================================
// list_contracts
// ============================================================================
export const listContractsDef: ToolDef = {
  type: "function",
  function: {
    name: "list_contracts",
    description:
      "Lista contratos da organização. Filtros AND: status (draft|signed), client_name (parcial), contract_number (parcial, ex.: 'C-2026-0042'), date_from/date_to (em start_date), limit. Soft-deleted excluídos.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["draft", "signed"] },
        client_name: { type: "string" },
        contract_number: { type: "string" },
        date_from: { type: "string", description: "YYYY-MM-DD" },
        date_to: { type: "string", description: "YYYY-MM-DD" },
        limit: { type: "number" },
      },
    },
  },
};

const listContracts: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const denied = checkViewPerm(ctx);
  if (denied) return denied;

  const limit = Math.min(Math.max(Number(args?.limit) || 25, 1), 100);

  // Se filtrar por client_name, resolve client_ids primeiro.
  let clientIdFilter: string[] | null = null;
  if (typeof args?.client_name === "string" && args.client_name.trim().length >= 2) {
    const like = `%${escapeIlike(args.client_name.trim())}%`;
    const { data: ents } = await supabase
      .from("anew_entities")
      .select("id")
      .ilike("display_name", like)
      .limit(200);
    const entIds = (ents ?? []).map((e: any) => e.id);
    if (entIds.length === 0) {
      return { success: true, message: "0 contratos.", data: [] };
    }
    const { data: clients } = await supabase
      .from("anew_clients")
      .select("id")
      .eq("organization_id", organizationId)
      .in("entity_id", entIds)
      .limit(500);
    clientIdFilter = (clients ?? []).map((c: any) => c.id);
    if (clientIdFilter.length === 0) return { success: true, message: "0 contratos.", data: [] };
  }

  let q = supabase
    .from("client_contracts")
    .select("id, contract_number, status, start_date, end_date, total_value, currency, client_id, created_at")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (args?.status) q = q.eq("status", args.status);
  if (args?.contract_number) q = q.ilike("contract_number", `%${escapeIlike(String(args.contract_number))}%`);
  if (clientIdFilter) q = q.in("client_id", clientIdFilter);
  if (args?.date_from && DATE_RE.test(args.date_from)) q = q.gte("start_date", args.date_from);
  if (args?.date_to && DATE_RE.test(args.date_to)) q = q.lte("start_date", args.date_to);

  const { data, error } = await q;
  if (error) throw error;

  const rows = data ?? [];
  const clientIds = Array.from(new Set(rows.map((r: any) => r.client_id).filter(Boolean))) as string[];
  const nameMap = await resolveClientNames(supabase, clientIds);

  const out = rows.map((r: any) => ({
    id: r.id,
    contract_number: r.contract_number,
    status: r.status,
    start_date: r.start_date,
    end_date: r.end_date,
    total_value: r.total_value,
    currency: r.currency,
    client_id: r.client_id,
    client_name: r.client_id ? (nameMap.get(r.client_id) ?? null) : null,
    link: "/contracts",
  }));

  return { success: true, message: `${out.length} contrato(s).`, data: out };
};

// ============================================================================
// get_contract_details
// ============================================================================
export const getContractDetailsDef: ToolDef = {
  type: "function",
  function: {
    name: "get_contract_details",
    description:
      "Detalhes de um contrato: header, cliente, ligações (proposal/quote), signatários e último pedido de assinatura. contract_id aceita UUID ou contract_number (ex.: 'C-2026-0042'); o servidor resolve.",
    parameters: {
      type: "object",
      properties: { contract_id: { type: "string" } },
      required: ["contract_id"],
    },
  },
};

const getContractDetails: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const denied = checkViewPerm(ctx);
  if (denied) return denied;
  if (!isUuid(args?.contract_id)) return { success: false, message: "contract_id inválido." };

  const { data: row, error } = await supabase
    .from("client_contracts")
    .select(
      "id, contract_number, status, start_date, end_date, total_value, currency, client_id, proposal_id, quote_id, payment_terms, notes, created_by, created_at, signature_date, signed_by_name, accepted_at, deleted_at",
    )
    .eq("id", args.contract_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!row) return { success: false, message: "Contrato não encontrado nesta organização." };

  const nameMap = row.client_id ? await resolveClientNames(supabase, [row.client_id]) : new Map<string, string>();

  const { data: parties } = await supabase
    .from("client_contract_parties")
    .select("id, role, is_signatory, signing_order, signing_name, signing_email, status, signed_at")
    .eq("contract_id", row.id)
    .order("signing_order", { ascending: true });

  const { data: lastReq } = await supabase
    .from("client_contract_signature_requests")
    .select("id, status, provider, expires_at, created_at")
    .eq("contract_id", row.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    success: true,
    message: `Contrato ${row.contract_number ?? row.id}.`,
    data: {
      ...row,
      client_name: row.client_id ? (nameMap.get(row.client_id) ?? null) : null,
      parties: parties ?? [],
      last_signature_request: lastReq ?? null,
      link: "/contracts",
    },
  };
};

// ============================================================================
// update_contract — draft only; sem title (coluna não existe), sem contract_number (imutável)
// ============================================================================
export const updateContractDef: ToolDef = {
  type: "function",
  function: {
    name: "update_contract",
    description:
      "Edita campos editáveis do contrato em rascunho: notes, payment_terms, start_date, end_date, total_value. NÃO suporta title (não existe) nem contract_number (imutável). Bloqueado se status='signed'.",
    parameters: {
      type: "object",
      properties: {
        contract_id: { type: "string" },
        notes: { type: "string" },
        payment_terms: { type: "string" },
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD" },
        total_value: { type: "number" },
      },
      required: ["contract_id"],
    },
  },
};

const updateContract: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!isUuid(args?.contract_id)) return { success: false, message: "contract_id inválido." };

  const patch: Record<string, any> = {};
  if (typeof args.notes === "string") patch.notes = args.notes;
  if (typeof args.payment_terms === "string") patch.payment_terms = args.payment_terms;
  if (typeof args.start_date === "string") {
    if (!DATE_RE.test(args.start_date)) return { success: false, message: "start_date inválido (YYYY-MM-DD)." };
    patch.start_date = args.start_date;
  }
  if (typeof args.end_date === "string") {
    if (!DATE_RE.test(args.end_date)) return { success: false, message: "end_date inválido (YYYY-MM-DD)." };
    patch.end_date = args.end_date;
  }
  if (typeof args.total_value === "number" && Number.isFinite(args.total_value)) {
    patch.total_value = args.total_value;
  }
  if (Object.keys(patch).length === 0) return { success: false, message: "Nada para atualizar." };

  const { data: row } = await supabase
    .from("client_contracts")
    .select("id, status, created_by, deleted_at")
    .eq("id", args.contract_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!row) return { success: false, message: "Contrato não encontrado nesta organização." };
  if (row.deleted_at) return { success: false, message: "Contrato apagado — restaurar primeiro." };
  if (row.status === "signed") return { success: false, message: "Contrato assinado — imutável." };

  if (!canEditContract(ctx, row as any, "client_contracts.edit")) {
    return { success: false, message: "Sem permissão para editar este contrato." };
  }

  const { error } = await supabase
    .from("client_contracts")
    .update(patch)
    .eq("id", args.contract_id)
    .eq("organization_id", organizationId);
  if (error) throw error;

  return { success: true, message: "Contrato atualizado.", data: { id: args.contract_id, link: "/contracts" } };
};

// ============================================================================
// cancel_contract — soft delete (não há status 'cancelled')
// ============================================================================
export const cancelContractDef: ToolDef = {
  type: "function",
  function: {
    name: "cancel_contract",
    description:
      "Cancela (soft-delete) um contrato em rascunho. Acção terminal — exige confirm:true. Bloqueado se status='signed'.",
    parameters: {
      type: "object",
      properties: {
        contract_id: { type: "string" },
        confirm: { type: "boolean" },
        reason: { type: "string" },
      },
      required: ["contract_id", "confirm"],
    },
  },
};

const cancelContract: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId, businessUserId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!isUuid(args?.contract_id)) return { success: false, message: "contract_id inválido." };
  if (args.confirm !== true) return { success: false, message: "É necessário confirmar (confirm:true)." };

  const { data: row } = await supabase
    .from("client_contracts")
    .select("id, status, created_by, deleted_at")
    .eq("id", args.contract_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!row) return { success: false, message: "Contrato não encontrado nesta organização." };
  if (row.deleted_at) return { success: false, message: "Contrato já estava apagado." };
  if (row.status === "signed") return { success: false, message: "Contrato assinado — não pode ser cancelado." };

  if (!canEditContract(ctx, row as any, "client_contracts.delete")) {
    return { success: false, message: "Sem permissão para cancelar este contrato." };
  }

  const patch: Record<string, any> = {
    deleted_at: new Date().toISOString(),
    deleted_by: businessUserId ?? null,
  };
  if (typeof args.reason === "string" && args.reason.trim()) {
    // Anota motivo no notes (não há coluna dedicada).
    patch.notes = `[Cancelado] ${args.reason}`;
  }

  const { error } = await supabase
    .from("client_contracts")
    .update(patch)
    .eq("id", args.contract_id)
    .eq("organization_id", organizationId);
  if (error) throw error;

  return { success: true, message: "Contrato cancelado.", data: { id: args.contract_id, link: "/contracts" } };
};

// ============================================================================
// restore_contract — paridade com restore_lead/_contact/_client
// ============================================================================
export const restoreContractDef: ToolDef = {
  type: "function",
  function: {
    name: "restore_contract",
    description: "Restaura um contrato soft-deleted (limpa deleted_at).",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
};

const restoreContract: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!isUuid(args?.id)) return { success: false, message: "id inválido." };

  const { data: row } = await supabase
    .from("client_contracts")
    .select("id, deleted_at, created_by")
    .eq("id", args.id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!row) return { success: false, message: "Contrato não encontrado nesta organização." };
  if (!row.deleted_at) return { success: false, message: "Contrato não está apagado." };

  if (!canEditContract(ctx, row as any, "client_contracts.edit")) {
    return { success: false, message: "Sem permissão para restaurar este contrato." };
  }

  const { error } = await supabase
    .from("client_contracts")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", args.id)
    .eq("organization_id", organizationId);
  if (error) throw error;
  return { success: true, message: "Contrato restaurado.", data: { id: args.id, link: "/contracts" } };
};

// ----------------------------------------------------------------------------
export const handlers: Record<string, Handler> = {
  list_contracts: listContracts,
  get_contract_details: getContractDetails,
  update_contract: updateContract,
  cancel_contract: cancelContract,
  restore_contract: restoreContract,
};
