// Activities tools — Fase 2.
// Owns: add_note, log_call, list_activities (entity_interactions).
//
// Permission gate: discovers which roles the entity actually plays in the org
// (lead/contact/client/deal, ignoring soft-deleted and inactive rows) and
// requires the matching .edit (write) or .view (read) permission for at least
// one of the detected roles.

import { can } from "../shared/authz.ts";
import type { ExecCtx, Handler, ToolDef, ToolResult } from "../shared/types.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

const CALL_RESULTS = ["connected", "no_answer", "voicemail", "busy", "wrong_number"] as const;
const SENTIMENTS = ["positive", "neutral", "negative"] as const;
const NEXT_CHANNELS = ["call", "email", "whatsapp", "meeting"] as const;
const INTERACTION_TYPES = ["note", "call", "email", "whatsapp"] as const;

const LEAD_INACTIVE = ["converted", "lost", "rejected"];

export type EntityRoles = {
  isLead: boolean;
  isContact: boolean;
  isClient: boolean;
  hasDeal: boolean;
  found: boolean;
};

export async function resolveEntityRolesInOrg(
  supabase: any,
  entityId: string,
  orgId: string,
): Promise<EntityRoles> {
  const [leadRes, contactRes, clientRes, dealRes] = await Promise.all([
    supabase
      .from("anew_leads")
      .select("id")
      .eq("entity_id", entityId)
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .not("status", "in", `(${LEAD_INACTIVE.join(",")})`)
      .limit(1),
    supabase
      .from("anew_contacts")
      .select("id, status")
      .eq("entity_id", entityId)
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .limit(1),
    supabase
      .from("anew_clients")
      .select("id, status")
      .eq("entity_id", entityId)
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .limit(1),
    supabase
      .from("deals")
      .select("id")
      .eq("entity_id", entityId)
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .limit(1),
  ]);

  const contactRow = contactRes.data?.[0];
  const clientRow = clientRes.data?.[0];
  const isContact = !!contactRow && (contactRow.status == null || contactRow.status !== "inactive");
  const isClient = !!clientRow && (clientRow.status == null || clientRow.status !== "inactive");
  const isLead = !!leadRes.data?.[0];
  const hasDeal = !!dealRes.data?.[0];

  return { isLead, isContact, isClient, hasDeal, found: isLead || isContact || isClient || hasDeal };
}

function checkRolePerm(
  ctx: ExecCtx,
  roles: EntityRoles,
  action: "edit" | "view",
): { ok: true } | { ok: false; message: string } {
  const detected: string[] = [];
  const accepted: string[] = [];
  if (roles.isLead) { detected.push("lead"); accepted.push(`leads.${action}`); }
  if (roles.isContact) { detected.push("contact"); accepted.push(`contacts.${action}`); }
  if (roles.isClient) { detected.push("client"); accepted.push(`clients.${action}`); }
  if (roles.hasDeal) { detected.push("deal"); accepted.push(`deals.${action}`); }

  const ok = accepted.some((p) => can(ctx, p));
  if (ok) return { ok: true };
  const verb = action === "edit" ? "registar atividade" : "ver atividade";
  return {
    ok: false,
    message: `Sem permissão para ${verb} nesta entidade (papéis: ${detected.join("|")}).`,
  };
}

// ===== add_note =====

export const addNoteDef: ToolDef = {
  type: "function",
  function: {
    name: "add_note",
    description: "Adiciona uma nota a uma entidade (lead/contact/client/deal). Requer permissão de edit num dos papéis activos da entidade.",
    parameters: {
      type: "object",
      properties: {
        entity_id: { type: "string", description: "UUID da entidade (anew_entities.id)" },
        subject: { type: "string" },
        notes: { type: "string" },
      },
      required: ["entity_id", "notes"],
    },
  },
};

const addNote: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId, businessUserId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.entity_id || !UUID_RE.test(String(args.entity_id))) return { success: false, message: "entity_id inválido." };
  const notes = typeof args.notes === "string" ? args.notes.trim() : "";
  if (notes.length < 1) return { success: false, message: "notes obrigatório." };
  const subject = args.subject !== undefined ? String(args.subject).slice(0, 200) : null;

  const roles = await resolveEntityRolesInOrg(supabase, args.entity_id, organizationId);
  if (!roles.found) return { success: false, message: "Entidade sem papel activo na organização (ou apagada)." };
  const perm = checkRolePerm(ctx, roles, "edit");
  if (!perm.ok) return { success: false, message: perm.message };

  const { data, error } = await supabase
    .from("entity_interactions")
    .insert({
      entity_id: args.entity_id,
      organization_id: organizationId,
      interaction_type: "note",
      subject,
      notes,
      interaction_at: new Date().toISOString(),
      created_by: businessUserId ? String(businessUserId) : null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("add_note insert failed", error.message);
    return { success: false, message: `Não foi possível guardar a nota: ${String(error.message).slice(0, 160)}` };
  }
  return { success: true, message: "Nota adicionada.", data: { interaction_id: data.id, entity_id: args.entity_id, link: null } };
};

// ===== log_call =====

export const logCallDef: ToolDef = {
  type: "function",
  function: {
    name: "log_call",
    description: "Regista uma chamada feita/recebida numa entidade. Requer permissão de edit num dos papéis activos.",
    parameters: {
      type: "object",
      properties: {
        entity_id: { type: "string" },
        subject: { type: "string" },
        notes: { type: "string" },
        duration_minutes: { type: "number" },
        result: { type: "string", enum: [...CALL_RESULTS] },
        sentiment: { type: "string", enum: [...SENTIMENTS] },
        next_action_type: { type: "string" },
        next_action_date: { type: "string", description: "ISO 8601" },
        next_action_channel: { type: "string", enum: [...NEXT_CHANNELS] },
      },
      required: ["entity_id"],
    },
  },
};

const logCall: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId, businessUserId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.entity_id || !UUID_RE.test(String(args.entity_id))) return { success: false, message: "entity_id inválido." };

  const payload: Record<string, any> = {
    entity_id: args.entity_id,
    organization_id: organizationId,
    interaction_type: "call",
    interaction_at: new Date().toISOString(),
    created_by: businessUserId ? String(businessUserId) : null,
  };
  if (args.subject !== undefined) payload.subject = String(args.subject).slice(0, 200);
  if (args.notes !== undefined) payload.notes = String(args.notes);
  if (args.duration_minutes !== undefined) {
    const n = Number(args.duration_minutes);
    if (!Number.isInteger(n) || n < 0 || n > 600) return { success: false, message: "duration_minutes inválido (0-600)." };
    payload.duration_minutes = n;
  }
  if (args.result !== undefined) {
    if (!CALL_RESULTS.includes(args.result)) return { success: false, message: `result inválido. Aceites: ${CALL_RESULTS.join(", ")}.` };
    payload.result = args.result;
  }
  if (args.sentiment !== undefined) {
    if (!SENTIMENTS.includes(args.sentiment)) return { success: false, message: `sentiment inválido. Aceites: ${SENTIMENTS.join(", ")}.` };
    payload.sentiment = args.sentiment;
  }
  if (args.next_action_type !== undefined) payload.next_action_type = String(args.next_action_type).slice(0, 50);
  if (args.next_action_date !== undefined) {
    if (!ISO_RE.test(String(args.next_action_date))) return { success: false, message: "next_action_date inválido (ISO 8601)." };
    payload.next_action_date = args.next_action_date;
  }
  if (args.next_action_channel !== undefined) {
    if (!NEXT_CHANNELS.includes(args.next_action_channel)) return { success: false, message: `next_action_channel inválido. Aceites: ${NEXT_CHANNELS.join(", ")}.` };
    payload.next_action_channel = args.next_action_channel;
  }

  const roles = await resolveEntityRolesInOrg(supabase, args.entity_id, organizationId);
  if (!roles.found) return { success: false, message: "Entidade sem papel activo na organização (ou apagada)." };
  const perm = checkRolePerm(ctx, roles, "edit");
  if (!perm.ok) return { success: false, message: perm.message };

  const { data, error } = await supabase
    .from("entity_interactions")
    .insert(payload)
    .select("id")
    .single();
  if (error) {
    console.error("log_call insert failed", error.message);
    return { success: false, message: `Não foi possível registar a chamada: ${String(error.message).slice(0, 160)}` };
  }
  return { success: true, message: "Chamada registada.", data: { interaction_id: data.id, entity_id: args.entity_id, link: null } };
};

// ===== list_activities =====

export const listActivitiesDef: ToolDef = {
  type: "function",
  function: {
    name: "list_activities",
    description: "Lista atividades (notes/calls/emails/whatsapp) de uma entidade, mais recente primeiro.",
    parameters: {
      type: "object",
      properties: {
        entity_id: { type: "string" },
        interaction_type: { type: "string", enum: [...INTERACTION_TYPES] },
        limit: { type: "number", description: "1-25, default 10" },
      },
      required: ["entity_id"],
    },
  },
};

const listActivities: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.entity_id || !UUID_RE.test(String(args.entity_id))) return { success: false, message: "entity_id inválido." };

  let limit = 10;
  if (args.limit !== undefined) {
    const n = Number(args.limit);
    if (!Number.isInteger(n) || n < 1 || n > 25) return { success: false, message: "limit inválido (1-25)." };
    limit = n;
  }
  if (args.interaction_type !== undefined && !INTERACTION_TYPES.includes(args.interaction_type)) {
    return { success: false, message: `interaction_type inválido. Aceites: ${INTERACTION_TYPES.join(", ")}.` };
  }

  const roles = await resolveEntityRolesInOrg(supabase, args.entity_id, organizationId);
  if (!roles.found) return { success: false, message: "Entidade sem papel activo na organização (ou apagada)." };
  const perm = checkRolePerm(ctx, roles, "view");
  if (!perm.ok) return { success: false, message: perm.message };

  let q = supabase
    .from("entity_interactions")
    .select("id, interaction_type, subject, notes, duration_minutes, result, sentiment, interaction_at, created_by, next_action_type, next_action_date, next_action_channel")
    .eq("entity_id", args.entity_id)
    .eq("organization_id", organizationId)
    .order("interaction_at", { ascending: false })
    .limit(limit);
  if (args.interaction_type) q = q.eq("interaction_type", args.interaction_type);

  const { data, error } = await q;
  if (error) {
    console.error("list_activities failed", error.message);
    return { success: false, message: `Não foi possível listar atividades: ${String(error.message).slice(0, 160)}` };
  }
  return { success: true, message: `${data?.length || 0} atividade(s).`, data: data || [] };
};

export const handlers: Record<string, Handler> = {
  add_note: addNote,
  log_call: logCall,
  list_activities: listActivities,
};
