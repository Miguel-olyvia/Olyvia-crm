// CRM tools — extracted verbatim from index.ts.
// Owns: create_lead, create_contact, update_lead_status,
//       search_clients, search_leads, search_contacts.
// Private helpers: ensurePersonEntity (@deprecated), resolveEntityForCreation.

import { findLocalEntityForOrg, ensureEntityOrgLinkSR } from "../../_shared/entityScopedLookup.ts";
import { sanitizeEmail, sanitizePhone } from "../../_shared/inputSanitizers.ts";
import { requireWrite } from "../shared/authz.ts";
import type { ExecCtx, Handler, ToolDef, ToolResult } from "../shared/types.ts";

/**
 * @deprecated — DO NOT use in create_lead / create_contact (Fase 0A guardrail).
 * Kept only as a low-level fallback for legacy paths; new code MUST go through
 * `create_entity_with_contacts_and_roles` RPC with `findLocalEntityForOrg` first.
 */
// deno-lint-ignore no-unused-vars
async function ensurePersonEntity(supabase: any, fullName: string, createdBy?: string): Promise<string> {
  const parts = fullName.trim().split(/\s+/);
  const first_name = parts[0];
  const last_name = parts.slice(1).join(" ") || null;

  const { data, error } = await supabase
    .from("anew_entities")
    .insert({
      type: "person",
      display_name: fullName.trim(),
      first_name,
      last_name,
      status: "active",
      created_by: createdBy ?? null,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

const UUID_RE_LOCAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: unknown): boolean {
  return typeof v === "string" && UUID_RE_LOCAL.test(v);
}

/**
 * Fail-closed: true sse a entidade já tem presença operacional na org activa.
 * Qualquer erro de query é propagado (throw) — nunca devolve true por defeito.
 */
async function isEntityLocalToOrg(ctx: ExecCtx, entityId: string): Promise<boolean> {
  const sb = ctx.supabase;
  const org = ctx.organizationId as string;

  {
    const { data, error } = await sb.from("anew_entity_org_links")
      .select("entity_id").eq("organization_id", org).eq("entity_id", entityId).limit(1);
    if (error) throw new Error(`isEntityLocalToOrg(anew_entity_org_links): ${error.message}`);
    if (data && data.length) return true;
  }
  {
    const { data, error } = await sb.from("anew_leads")
      .select("id").eq("organization_id", org).eq("entity_id", entityId)
      .is("deleted_at", null)
      .not("status", "in", "(converted,lost,rejected)")
      .limit(1);
    if (error) throw new Error(`isEntityLocalToOrg(anew_leads): ${error.message}`);
    if (data && data.length) return true;
  }
  {
    const { data, error } = await sb.from("anew_contacts")
      .select("id").eq("organization_id", org).eq("entity_id", entityId)
      .eq("status", "active").is("deleted_at", null).limit(1);
    if (error) throw new Error(`isEntityLocalToOrg(anew_contacts): ${error.message}`);
    if (data && data.length) return true;
  }
  {
    const { data, error } = await sb.from("anew_clients")
      .select("id").eq("organization_id", org).eq("entity_id", entityId)
      .eq("status", "active").is("deleted_at", null).limit(1);
    if (error) throw new Error(`isEntityLocalToOrg(anew_clients): ${error.message}`);
    if (data && data.length) return true;
  }
  {
    const { data, error } = await sb.from("anew_entity_roles")
      .select("id").eq("organization_id", org).eq("entity_id", entityId)
      .eq("status", "active").limit(1);
    if (error) throw new Error(`isEntityLocalToOrg(anew_entity_roles): ${error.message}`);
    if (data && data.length) return true;
  }
  return false;
}

/**
 * Anti-duplication helper for create_lead / create_contact (Fase 0A.7).
 */
async function resolveEntityForCreation(
  ctx: ExecCtx,
  args: any,
  proposedPayload: any,
): Promise<
  | { mode: "confirm"; payload: any }
  | { mode: "reuse"; entityId: string }
  | { mode: "create" }
> {
  const email = sanitizeEmail(args.email);
  const phone = sanitizePhone(args.phone);
  const nif = args.nif ? String(args.nif).trim().toUpperCase() : null;

  if (args.confirmed_entity_id) {
    if (!isUuid(args.confirmed_entity_id)) {
      return { mode: "confirm", payload: { success: false,
        message: "confirmed_entity_id inválido (deve ser UUID)." } };
    }
    let local = false;
    try {
      local = await isEntityLocalToOrg(ctx, args.confirmed_entity_id);
    } catch (e) {
      console.error("isEntityLocalToOrg failed", e);
      return { mode: "confirm", payload: { success: false,
        message: "Não foi possível validar confirmed_entity_id. Tenta novamente." } };
    }
    if (!local) {
      return { mode: "confirm", payload: { success: false,
        message: "confirmed_entity_id não pertence a esta organização. Cria registo novo ou usa candidate_entity_id devolvido por requires_confirmation." } };
    }
    return { mode: "reuse", entityId: args.confirmed_entity_id };
  }
  if (args.force_create === true) return { mode: "create" };

  if (!email && !phone && !nif) return { mode: "create" };

  const hit = await findLocalEntityForOrg({
    supabase: ctx.supabase,
    organizationId: ctx.organizationId as string,
    email,
    phone,
    nif,
  });
  if (!hit) return { mode: "create" };

  const { data: ent } = await ctx.supabase
    .from("anew_entities")
    .select("display_name")
    .eq("id", hit.entityId)
    .maybeSingle();

  return {
    mode: "confirm",
    payload: {
      success: false,
      requires_confirmation: true,
      message: `Já existe ${ent?.display_name ?? "uma entidade"} nesta organização com o mesmo ${hit.matchField}. Confirmas que é a mesma pessoa?`,
      candidate_entity_id: hit.entityId,
      candidate_name: ent?.display_name ?? null,
      match_field: hit.matchField,
      proposed_payload: proposedPayload,
    },
  };
}

// ───── Tool definitions ─────

export const createLeadDef: ToolDef = {
  type: "function",
  function: {
    name: "create_lead",
    description: "Cria um novo lead. Nome completo é dividido em first_name/last_name automaticamente. Se houver entidade duplicada (mesmo email/telefone) na org, devolve requires_confirmation; chama novamente com confirmed_entity_id (reutilizar) ou force_create=true (criar nova). confirmed_entity_id só é aceite se for UUID válido e a entidade já tiver presença na organização activa (link, lead, contacto, cliente ou role). Caso contrário a chamada falha — cria registo novo.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome completo do lead" },
        email: { type: "string" },
        phone: { type: "string" },
        notes: { type: "string" },
        source: { type: "string" },
        confirmed_entity_id: { type: "string", description: "ID de entidade existente a reutilizar (depois de requires_confirmation)" },
        force_create: { type: "boolean", description: "Forçar criação de nova entidade ignorando duplicados" },
      },
      required: ["name", "phone"],
    },
  },
};

export const createContactDef: ToolDef = {
  type: "function",
  function: {
    name: "create_contact",
    description: "Cria um contacto (entidade pessoa) no CRM. Anti-duplicação igual a create_lead. confirmed_entity_id só é aceite se for UUID válido e a entidade já tiver presença na organização activa (link, lead, contacto, cliente ou role). Caso contrário a chamada falha — cria registo novo.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome completo" },
        email: { type: "string" },
        phone: { type: "string" },
        nif: { type: "string" },
        position: { type: "string" },
        confirmed_entity_id: { type: "string" },
        force_create: { type: "boolean" },
      },
      required: ["name"],
    },
  },
};

export const searchClientsDef: ToolDef = {
  type: "function",
  function: {
    name: "search_clients",
    description: "Pesquisa clientes pelo nome.",
    parameters: {
      type: "object",
      properties: { search_term: { type: "string" } },
      required: ["search_term"],
    },
  },
};

export const searchLeadsDef: ToolDef = {
  type: "function",
  function: {
    name: "search_leads",
    description: "Pesquisa leads pelo nome (display_name da entidade).",
    parameters: {
      type: "object",
      properties: { search_term: { type: "string" } },
      required: ["search_term"],
    },
  },
};

export const searchContactsDef: ToolDef = {
  type: "function",
  function: {
    name: "search_contacts",
    description: "Pesquisa contactos (entidades pessoa) pelo nome.",
    parameters: {
      type: "object",
      properties: { search_term: { type: "string" } },
      required: ["search_term"],
    },
  },
};

export const updateLeadStatusDef: ToolDef = {
  type: "function",
  function: {
    name: "update_lead_status",
    description: "Atualiza estado de um lead.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        status: { type: "string" },
      },
      required: ["lead_id", "status"],
    },
  },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEAD_STATUSES = ["new","contacted","callback_scheduled","no_answer","qualified","scheduled","visit_scheduled","rejected","incomplete"] as const;
const CONTACT_STATUSES = ["active","inactive"] as const;

export const updateLeadDef: ToolDef = {
  type: "function",
  function: {
    name: "update_lead",
    description: "Edita um lead (assigned_to, status e/ou workflow_stage_id). 'status' é o enum CRM em inglês (new|contacted|...); 'workflow_stage_id' é o UUID definido pela organização em lead_workflow_stages — são independentes. Para mover um lead no pipeline visual usa workflow_stage_id (NÃO update_lead_status). Quando workflow_stage_id muda, dispara automaticamente execute-workflow (stage_actions + workflow_rules). 'converted' não é aceite — usa convert_lead.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "UUID do lead" },
        assigned_to: { type: "string", description: "UUID anew_users.id" },
        status: { type: "string", enum: [...LEAD_STATUSES] },
        workflow_stage_id: { type: "string", description: "UUID de lead_workflow_stages — obter via list_workflow_stages({module:'lead'})" },
      },
      required: ["id"],
    },
  },
};

export const convertLeadDef: ToolDef = {
  type: "function",
  function: {
    name: "convert_lead",
    description: "Converte um lead em contacto e/ou cliente. Opcionalmente cria também um PP (Pedido de Proposta). Pelo menos um de to_contact ou to_client tem de ser true. Idempotente: lead já 'converted' devolve erro controlado. Para criar apenas um PP a partir de um lead já convertido, usa create_deal_from_lead.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string", description: "UUID do lead" },
        to_contact: { type: "boolean", description: "Converter em contacto (default true)" },
        to_client: { type: "boolean", description: "Converter em cliente (default false)" },
        create_deal: { type: "boolean", description: "Criar PP a partir do lead (default false)" },
        deal_title: { type: "string", description: "Título do PP (só usado se create_deal=true)" },
      },
      required: ["lead_id"],
    },
  },
};

export const updateContactDef: ToolDef = {
  type: "function",
  function: {
    name: "update_contact",
    description: "Edita um contacto (assigned_to e/ou status). Não altera email/telefone.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "UUID do contacto" },
        assigned_to: { type: "string", description: "UUID anew_users.id" },
        status: { type: "string", enum: [...CONTACT_STATUSES] },
      },
      required: ["id"],
    },
  },
};

// ───── Handlers ─────

const createLead: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, businessUserId, organizationId } = ctx;
  const createdBy = businessUserId || null;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const perm = requireWrite(ctx, "leads.create", "criar leads");
  if (perm) return perm;

  const proposedPayload = {
    name: args.name, email: args.email, phone: args.phone,
    notes: args.notes, source: args.source,
  };
  const decision = await resolveEntityForCreation(ctx, args, proposedPayload);
  if (decision.mode === "confirm") return decision.payload;

  const parts = args.name.trim().split(/\s+/);
  const sanitizedEmail = sanitizeEmail(args.email);
  const sanitizedPhone = sanitizePhone(args.phone);
  let entityId: string;

  if (decision.mode === "reuse") {
    entityId = decision.entityId;
    await ensureEntityOrgLinkSR({ supabase, entityId, organizationId });
  } else {
    const { data: newEntityId, error: rpcErr } = await supabase.rpc(
      "create_entity_with_contacts_and_roles",
      {
        p_organization_id: organizationId,
        p_entity: {
          type: "person",
          display_name: args.name.trim(),
          first_name: parts[0],
          last_name: parts.slice(1).join(" ") || null,
          status: "active",
        },
        p_emails: sanitizedEmail ? [{ email: sanitizedEmail, is_primary: true }] : [],
        p_phones: sanitizedPhone ? [{ phone_number: sanitizedPhone, is_primary: true }] : [],
        p_roles: [],
        p_created_by: createdBy,
      },
    );
    if (rpcErr) throw rpcErr;
    entityId = newEntityId as string;
    await ensureEntityOrgLinkSR({ supabase, entityId, organizationId });
  }

  const { data, error } = await supabase
    .from("anew_leads")
    .insert({
      entity_id: entityId,
      field_values: {
        first_name: parts[0],
        last_name: parts.slice(1).join(" ") || null,
        full_name: args.name.trim(),
        phone: sanitizedPhone,
        email: sanitizedEmail,
      },
      notes: args.notes || null,
      source: args.source || "ai_assistant",
      status: "new",
      organization_id: organizationId,
      root_organization_id: organizationId,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) throw error;

  await supabase.from("anew_entity_roles").upsert(
    {
      organization_id: organizationId,
      entity_id: entityId,
      role: "lead",
      status: "active",
      source_type: "ai_assistant",
      source_id: data.id,
      created_by: createdBy,
    },
    { onConflict: "organization_id,entity_id,role" },
  );

  return {
    success: true,
    message: `Lead "${args.name}" criado${decision.mode === "reuse" ? " (entidade existente reutilizada)" : ""}.`,
    data: { id: data.id, link: `/leads?open=${data.id}`, entity_id: entityId },
  };
};

const createContact: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, businessUserId, organizationId } = ctx;
  const createdBy = businessUserId || null;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const permC = requireWrite(ctx, "contacts.create", "criar contactos");
  if (permC) return permC;

  const proposedPayload = {
    name: args.name, email: args.email, phone: args.phone,
    nif: args.nif, position: args.position,
  };
  const decision = await resolveEntityForCreation(ctx, args, proposedPayload);
  if (decision.mode === "confirm") return decision.payload;

  const parts = args.name.trim().split(/\s+/);
  const sanitizedEmail = sanitizeEmail(args.email);
  const sanitizedPhone = sanitizePhone(args.phone);
  let entityId: string;

  if (decision.mode === "reuse") {
    entityId = decision.entityId;
    await ensureEntityOrgLinkSR({ supabase, entityId, organizationId });
    if (sanitizedEmail) {
      await supabase.from("anew_entity_emails").insert({
        entity_id: entityId, email: sanitizedEmail, is_primary: false, created_by: createdBy,
      }).then(() => {}, () => {});
    }
    if (sanitizedPhone) {
      await supabase.from("anew_entity_phones").insert({
        entity_id: entityId, phone_number: sanitizedPhone, is_primary: false, created_by: createdBy,
      }).then(() => {}, () => {});
    }
  } else {
    const { data: newEntityId, error: rpcErr } = await supabase.rpc(
      "create_entity_with_contacts_and_roles",
      {
        p_organization_id: organizationId,
        p_entity: {
          type: "person",
          display_name: args.name.trim(),
          first_name: parts[0],
          last_name: parts.slice(1).join(" ") || null,
          status: "active",
        },
        p_emails: sanitizedEmail ? [{ email: sanitizedEmail, is_primary: true }] : [],
        p_phones: sanitizedPhone ? [{ phone_number: sanitizedPhone, is_primary: true }] : [],
        p_roles: [],
        p_created_by: createdBy,
      },
    );
    if (rpcErr) throw rpcErr;
    entityId = newEntityId as string;
    await ensureEntityOrgLinkSR({ supabase, entityId, organizationId });
  }

  const { data, error } = await supabase
    .from("anew_contacts")
    .insert({
      entity_id: entityId,
      position: args.position || null,
      organization_id: organizationId,
      root_organization_id: organizationId,
      status: "active",
      created_by: createdBy,
    })
    .select("id")
    .single();

  if (error) throw error;

  await supabase.from("anew_entity_roles").upsert(
    {
      organization_id: organizationId,
      entity_id: entityId,
      role: "contact",
      status: "active",
      source_type: "ai_assistant",
      source_id: data.id,
      created_by: createdBy,
    },
    { onConflict: "organization_id,entity_id,role" },
  );

  return {
    success: true,
    message: `Contacto "${args.name}" criado${decision.mode === "reuse" ? " (entidade existente reutilizada)" : ""}.`,
    data: { id: data.id, link: `/contacts?open=${data.id}`, entity_id: entityId },
  };
};

const searchClients: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const { data, error } = await supabase
    .from("anew_clients")
    .select("id, entity_id, anew_entities!inner(display_name)")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("deleted_at", null)
    .ilike("anew_entities.display_name", `%${args.search_term}%`)
    .limit(5);
  if (error) throw error;
  return {
    success: true,
    message: data?.length ? `${data.length} cliente(s) encontrado(s).` : `Nenhum cliente com "${args.search_term}".`,
    data: data || [],
  };
};

const searchLeads: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const { data, error } = await supabase
    .from("anew_leads")
    .select("id, status, entity_id, anew_entities!inner(display_name)")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .not("status", "in", "(converted,lost,rejected)")
    .ilike("anew_entities.display_name", `%${args.search_term}%`)
    .limit(5);
  if (error) throw error;
  return {
    success: true,
    message: data?.length ? `${data.length} lead(s) encontrado(s).` : `Nenhum lead com "${args.search_term}".`,
    data: data || [],
  };
};

const searchContacts: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const { data, error } = await supabase
    .from("anew_contacts")
    .select("id, entity_id, position, anew_entities!inner(display_name)")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("deleted_at", null)
    .ilike("anew_entities.display_name", `%${args.search_term}%`)
    .limit(5);
  if (error) throw error;
  return {
    success: true,
    message: data?.length ? `${data.length} contacto(s) encontrado(s).` : `Nenhum contacto com "${args.search_term}".`,
    data: data || [],
  };
};

const updateLeadStatus: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const permU = requireWrite(ctx, "leads.edit", "editar leads");
  if (permU) return permU;
  const { data, error } = await supabase
    .from("anew_leads")
    .update({ status: args.status })
    .eq("id", args.lead_id)
    .eq("organization_id", organizationId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    return { success: false, message: "Lead não encontrado nesta organização." };
  }
  return { success: true, message: `Lead atualizado para "${args.status}".`, data: { id: args.lead_id } };
};

const updateLead: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId, authHeader, authUid } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const perm = requireWrite(ctx, "leads.edit", "editar leads");
  if (perm) return perm;
  if (!args?.id || !UUID_RE.test(String(args.id))) return { success: false, message: "id inválido." };
  const patch: Record<string, any> = {};
  if (args.status !== undefined) {
    if (!LEAD_STATUSES.includes(args.status)) return { success: false, message: `status inválido. Aceites: ${LEAD_STATUSES.join(", ")}.` };
    patch.status = args.status;
  }
  if (args.assigned_to !== undefined) {
    if (args.assigned_to !== null && !UUID_RE.test(String(args.assigned_to))) return { success: false, message: "assigned_to inválido." };
    patch.assigned_to = args.assigned_to;
  }

  // workflow_stage_id: validar pertença à org + activo, capturar old, e disparar execute-workflow se mudou.
  let oldStageId: string | null = null;
  let newStageId: string | null = null;
  let willTriggerWorkflow = false;
  if (args.workflow_stage_id !== undefined) {
    if (args.workflow_stage_id !== null && !UUID_RE.test(String(args.workflow_stage_id))) {
      return { success: false, message: "workflow_stage_id inválido." };
    }
    newStageId = args.workflow_stage_id;
    if (newStageId !== null) {
      const { data: stage, error: stageErr } = await supabase
        .from("lead_workflow_stages")
        .select("id, organization_id, is_active")
        .eq("id", newStageId)
        .maybeSingle();
      if (stageErr) return { success: false, message: `Não foi possível validar stage: ${String(stageErr.message).slice(0, 160)}` };
      if (!stage) return { success: false, message: "workflow_stage_id não encontrado." };
      if (stage.organization_id !== null && stage.organization_id !== organizationId) {
        return { success: false, message: "Stage fora da organização activa." };
      }
      if (stage.is_active === false) return { success: false, message: "Stage está inactivo." };
    }
    const { data: cur } = await supabase
      .from("anew_leads")
      .select("workflow_stage_id")
      .eq("id", args.id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();
    oldStageId = cur?.workflow_stage_id ?? null;
    patch.workflow_stage_id = newStageId;
    willTriggerWorkflow = oldStageId !== newStageId;
  }

  if (Object.keys(patch).length === 0) return { success: false, message: "Nada para atualizar." };
  const { data, error } = await supabase
    .from("anew_leads")
    .update(patch)
    .eq("id", args.id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select("id, status, assigned_to, workflow_stage_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { success: false, message: "Lead não encontrado ou fora de scope." };

  // Disparar execute-workflow se stage mudou e há sessão.
  if (willTriggerWorkflow && newStageId) {
    if (!authHeader) {
      return {
        success: true,
        message: "Lead atualizado. Stage mudou mas execute-workflow não foi invocado (sessão sem token).",
        data,
      };
    }
    try {
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/execute-workflow`;
      const body = {
        source_entity: "lead",
        entity_id: args.id,
        new_stage_id: newStageId,
        old_stage_id: oldStageId,
        organization_id: organizationId,
        triggered_by: authUid,
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let json: any = null; try { json = await res.json(); } catch { /* */ }
      if (!res.ok) {
        return {
          success: true,
          message: `Lead atualizado, mas execute-workflow falhou (${res.status}): ${String(json?.error || "").slice(0, 120)}`,
          data,
        };
      }
      return {
        success: true,
        message: "Lead atualizado e workflow executado.",
        data: { ...data, automationRules: json?.automationRules ?? 0, stageActions: json?.stageActions ?? 0 },
      };
    } catch (e: any) {
      return { success: true, message: `Lead atualizado, mas execute-workflow falhou: ${String(e?.message || e).slice(0, 120)}`, data };
    }
  }

  return { success: true, message: "Lead atualizado.", data };
};

const updateContact: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const perm = requireWrite(ctx, "contacts.edit", "editar contactos");
  if (perm) return perm;
  if (!args?.id || !UUID_RE.test(String(args.id))) return { success: false, message: "id inválido." };
  const patch: Record<string, any> = {};
  if (args.status !== undefined) {
    if (!CONTACT_STATUSES.includes(args.status)) return { success: false, message: `status inválido. Aceites: ${CONTACT_STATUSES.join(", ")}.` };
    patch.status = args.status;
  }
  if (args.assigned_to !== undefined) {
    if (args.assigned_to !== null && !UUID_RE.test(String(args.assigned_to))) return { success: false, message: "assigned_to inválido." };
    patch.assigned_to = args.assigned_to;
  }
  if (Object.keys(patch).length === 0) return { success: false, message: "Nada para atualizar." };
  const { data, error } = await supabase
    .from("anew_contacts")
    .update(patch)
    .eq("id", args.id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select("id, status, assigned_to")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { success: false, message: "Contacto não encontrado ou fora de scope." };
  return { success: true, message: "Contacto atualizado.", data };
};

const convertLead: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId, businessUserId, authHeader } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.lead_id || !UUID_RE.test(String(args.lead_id))) return { success: false, message: "lead_id inválido." };

  const toContact = args.to_contact !== false; // default true
  const toClient = args.to_client === true;
  const createDeal = args.create_deal === true;

  if (!toContact && !toClient) {
    return { success: false, message: "Indica to_contact=true e/ou to_client=true." };
  }

  // Step 0: validate permissions BEFORE any write
  const permL = requireWrite(ctx, "leads.edit", "editar leads (necessário para converter)");
  if (permL) return permL;
  if (toContact) {
    const p = requireWrite(ctx, "contacts.create", "criar contactos");
    if (p) return p;
  }
  if (toClient) {
    const p = requireWrite(ctx, "clients.create", "criar clientes");
    if (p) return p;
  }
  if (createDeal) {
    const p = requireWrite(ctx, "deals.create", "criar PP");
    if (p) return p;
    if (!authHeader) return { success: false, message: "Sessão sem token — não é possível invocar pipeline-automation." };
  }

  // Step 1: load lead (org-scoped, not deleted, has entity, not yet converted)
  const { data: lead, error: leadErr } = await supabase
    .from("anew_leads")
    .select("id, status, entity_id, assigned_to, organization_id, root_organization_id, created_by")
    .eq("id", args.lead_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (leadErr) throw leadErr;
  if (!lead) return { success: false, message: "Lead não encontrado ou fora de scope." };
  if (!lead.entity_id) return { success: false, message: "Lead sem entity_id — não pode ser convertido." };
  if (lead.status === "converted") return { success: false, message: "Lead já está convertido." };

  const eId = lead.entity_id as string;
  const rootOrg = lead.root_organization_id || organizationId;
  const actor = businessUserId || lead.created_by || null;

  // Step 2: resolve assigned_to
  let resolvedAssignedTo: string | null = actor;
  if (lead.assigned_to) {
    const { data: au } = await supabase.from("anew_users").select("id").eq("id", lead.assigned_to).maybeSingle();
    if (au) resolvedAssignedTo = au.id;
    else {
      const { data: au2 } = await supabase.from("anew_users").select("id").eq("auth_user_id", lead.assigned_to).maybeSingle();
      if (au2) resolvedAssignedTo = au2.id;
    }
  }

  let contactId: string | null = null;
  let clientId: string | null = null;
  let dealId: string | null = null;

  // Step 3: to_contact (SELECT-then-INSERT)
  if (toContact) {
    const { data: existing } = await supabase
      .from("anew_contacts")
      .select("id")
      .eq("entity_id", eId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (existing) {
      contactId = existing.id;
    } else {
      const { data: newC, error: insErr } = await supabase
        .from("anew_contacts")
        .insert([{
          entity_id: eId,
          organization_id: organizationId,
          root_organization_id: rootOrg,
          source_type: "ai_assistant",
          source_lead_id: lead.id,
          status: "active",
          created_by: actor,
          assigned_to: resolvedAssignedTo,
        }])
        .select("id")
        .single();
      if (insErr) throw insErr;
      contactId = newC.id;
    }

    // Only finalize lead conversion here if NOT also converting to client
    if (!toClient) {
      const { error: deactErr } = await supabase
        .from("anew_entity_roles")
        .update({ status: "inactive" })
        .eq("entity_id", eId).eq("role", "lead").eq("organization_id", organizationId);
      if (deactErr) throw deactErr;

      const { data: cRole } = await supabase
        .from("anew_entity_roles")
        .select("id")
        .eq("entity_id", eId).eq("role", "contact").eq("organization_id", organizationId)
        .maybeSingle();
      if (!cRole) {
        const { error: createRoleErr } = await supabase.from("anew_entity_roles").insert({
          entity_id: eId, role: "contact", status: "active",
          organization_id: organizationId,
          source_type: "ai_assistant", source_id: lead.id, created_by: actor,
        });
        if (createRoleErr) throw createRoleErr;
      } else {
        await supabase.from("anew_entity_roles").update({ status: "active" }).eq("id", cRole.id);
      }

      const { error: updLeadErr } = await supabase
        .from("anew_leads")
        .update({
          status: "converted",
          converted_to_contact_id: contactId,
          converted_at: new Date().toISOString(),
          converted_by: actor,
        })
        .eq("id", lead.id);
      if (updLeadErr) throw updLeadErr;
    }
  }

  // Step 4: to_client (SELECT-then-INSERT)
  if (toClient) {
    // Look for intermediate contact (may have just been created above, or pre-existing)
    const { data: interC } = await supabase
      .from("anew_contacts")
      .select("id")
      .eq("entity_id", eId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    const sourceContactId = interC?.id || null;

    const { data: existingClient } = await supabase
      .from("anew_clients")
      .select("id")
      .eq("entity_id", eId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (existingClient) {
      clientId = existingClient.id;
    } else {
      const { data: newCli, error: insErr } = await supabase
        .from("anew_clients")
        .insert([{
          entity_id: eId,
          organization_id: organizationId,
          root_organization_id: rootOrg,
          source_type: sourceContactId ? "contact" : "ai_assistant",
          source_id: sourceContactId,
          status: "active",
          created_by: actor,
          assigned_to: resolvedAssignedTo,
        }])
        .select("id")
        .single();
      if (insErr) throw insErr;
      clientId = newCli.id;
    }

    // Mark intermediate contact converted + deactivate contact role
    if (sourceContactId && clientId) {
      await supabase.from("anew_contacts")
        .update({ converted_to_client_id: clientId, converted_at: new Date().toISOString(), status: "inactive" })
        .eq("id", sourceContactId);
      await supabase.from("anew_entity_roles")
        .update({ status: "inactive" })
        .eq("entity_id", eId).eq("role", "contact").eq("organization_id", organizationId);
    }

    // Deactivate lead role, activate client role
    const { error: deactLead } = await supabase.from("anew_entity_roles")
      .update({ status: "inactive" })
      .eq("entity_id", eId).eq("role", "lead").eq("organization_id", organizationId);
    if (deactLead) throw deactLead;

    const { data: cliRole } = await supabase.from("anew_entity_roles")
      .select("id")
      .eq("entity_id", eId).eq("role", "client").eq("organization_id", organizationId)
      .maybeSingle();
    if (!cliRole) {
      const { error: e } = await supabase.from("anew_entity_roles").insert({
        entity_id: eId, role: "client", status: "active",
        organization_id: organizationId,
        source_type: "ai_assistant", source_id: lead.id, created_by: actor,
      });
      if (e) throw e;
    } else {
      await supabase.from("anew_entity_roles").update({ status: "active" }).eq("id", cliRole.id);
    }

    // Finalize lead
    const leadPatch: Record<string, any> = {
      status: "converted",
      converted_at: new Date().toISOString(),
      converted_by: actor,
    };
    if (contactId) leadPatch.converted_to_contact_id = contactId;
    const { error: updLeadErr } = await supabase.from("anew_leads").update(leadPatch).eq("id", lead.id);
    if (updLeadErr) throw updLeadErr;
  }

  // Step 5: create_deal via pipeline-automation (reuses create_deal_from_lead path)
  if (createDeal) {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pipeline-automation`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Authorization": authHeader as string, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_deal_from_lead",
        payload: {
          lead_id: lead.id,
          title: args.deal_title || undefined,
          organization_id: organizationId,
          root_organization_id: rootOrg,
        },
      }),
    });
    let json: any = null;
    try { json = await res.json(); } catch { /* ignore */ }
    if (!res.ok || !json?.success) {
      return {
        success: false,
        message: `Conversão feita mas falhou criação do PP (${res.status}): ${json?.message || "erro desconhecido"}`,
        data: {
          contact_id: contactId,
          client_id: clientId,
          links: {
            ...(contactId ? { contact: `/contacts?open=${contactId}` } : {}),
            ...(clientId ? { client: `/clients/${clientId}` } : {}),
          },
        },
      };
    }
    dealId = json.created_id;
  }

  const parts: string[] = [];
  if (contactId) parts.push("contacto");
  if (clientId) parts.push("cliente");
  if (dealId) parts.push("PP");
  return {
    success: true,
    message: `Lead convertido em ${parts.join(" + ")}.`,
    data: {
      ...(contactId ? { contact_id: contactId } : {}),
      ...(clientId ? { client_id: clientId } : {}),
      ...(dealId ? { deal_id: dealId } : {}),
      links: {
        ...(contactId ? { contact: `/contacts?open=${contactId}` } : {}),
        ...(clientId ? { client: `/clients/${clientId}` } : {}),
        ...(dealId ? { deal: `/deals/${dealId}` } : {}),
      },
    },
  };
};

// ───── Fase 3 (Olyvia) — details + edit notes + cancel para CRM ─────

export const getLeadDetailsDef: ToolDef = {
  type: "function",
  function: {
    name: "get_lead_details",
    description: "Devolve detalhes de um lead (header + entidade + conversões + PP/orçamentos/propostas activos ligados). Sem mutação. lead_id aceita UUID, nome ou email — o servidor resolve.",
    parameters: {
      type: "object",
      properties: { lead_id: { type: "string" } },
      required: ["lead_id"],
    },
  },
};

export const deleteLeadDef: ToolDef = {
  type: "function",
  function: {
    name: "delete_lead",
    description: "Cancela (soft delete) um lead. Acção TERMINAL — pede confirmação ao utilizador antes de enviar confirm=true. Bloqueado se lead já foi convertido (usa cancel do contacto/cliente associado).",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        confirm: { type: "boolean" },
      },
      required: ["lead_id", "confirm"],
    },
  },
};

export const getContactDetailsDef: ToolDef = {
  type: "function",
  function: {
    name: "get_contact_details",
    description: "Devolve detalhes de um contacto (header + entidade + lead de origem + cliente derivado + PP/orçamentos/propostas activos ligados via pipeline). Sem mutação. contact_id aceita UUID, nome ou email.",
    parameters: {
      type: "object",
      properties: { contact_id: { type: "string" } },
      required: ["contact_id"],
    },
  },
};

export const updateContactNotesDef: ToolDef = {
  type: "function",
  function: {
    name: "update_contact_notes",
    description: "Edita notes e/ou position de um contacto. Não altera status nem assigned_to — para isso usa update_contact.",
    parameters: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        notes: { type: "string" },
        position: { type: "string" },
      },
      required: ["contact_id"],
    },
  },
};

export const deleteContactDef: ToolDef = {
  type: "function",
  function: {
    name: "delete_contact",
    description: "Cancela (soft delete) um contacto. Acção TERMINAL — pede confirmação. Bloqueado se contacto já foi convertido em cliente.",
    parameters: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        confirm: { type: "boolean" },
      },
      required: ["contact_id", "confirm"],
    },
  },
};

export const getClientDetailsDef: ToolDef = {
  type: "function",
  function: {
    name: "get_client_details",
    description: "Devolve detalhes de um cliente (header + entidade + PP/orçamentos/propostas activos + contratos activos). Sem mutação. client_id aceita UUID, nome ou email.",
    parameters: {
      type: "object",
      properties: { client_id: { type: "string" } },
      required: ["client_id"],
    },
  },
};

export const updateClientDef: ToolDef = {
  type: "function",
  function: {
    name: "update_client",
    description: "Edita campos do header de um cliente (notes, assigned_to, status).",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        notes: { type: "string" },
        assigned_to: { type: "string", description: "UUID anew_users.id" },
        status: { type: "string", enum: ["active", "inactive"] },
      },
      required: ["client_id"],
    },
  },
};

export const deleteClientDef: ToolDef = {
  type: "function",
  function: {
    name: "delete_client",
    description: "Cancela (soft delete) um cliente. Acção TERMINAL — pede confirmação. Bloqueado se existirem contratos activos ou PP abertos ligados.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        confirm: { type: "boolean" },
      },
      required: ["client_id", "confirm"],
    },
  },
};

// ─── Shared helpers ───

async function loadEntityHeader(supabase: any, entityId: string | null) {
  if (!entityId) return null;
  const [eRes, emailsRes, phonesRes] = await Promise.all([
    supabase.from("anew_entities").select("id, display_name, type").eq("id", entityId).maybeSingle(),
    supabase.from("anew_entity_emails").select("email, is_primary").eq("entity_id", entityId).order("is_primary", { ascending: false }).limit(3),
    supabase.from("anew_entity_phones").select("phone_number, country_code, is_primary").eq("entity_id", entityId).order("is_primary", { ascending: false }).limit(3),
  ]);
  const e = eRes.data;
  if (!e) return null;
  return {
    id: e.id,
    display_name: e.display_name,
    type: e.type,
    emails: (emailsRes.data ?? []).map((r: any) => r.email),
    phones: (phonesRes.data ?? []).map((r: any) => `${r.country_code ?? ""}${r.phone_number}`.trim()),
  };
}

async function loadPipelineForEntity(supabase: any, organizationId: string, entityId: string | null) {
  if (!entityId) return { deal_ids: [], quote_ids: [], proposal_ids: [], contract_ids: [] };
  const [dealsRes, quotesRes, propsRes, contractsRes] = await Promise.all([
    supabase.from("deals").select("id, title, closed_at").eq("organization_id", organizationId).eq("entity_id", entityId).is("deleted_at", null).is("closed_at", null).limit(50),
    supabase.from("quotes").select("id, quote_number, title, status").eq("organization_id", organizationId).eq("entity_id", entityId).is("deleted_at", null).limit(50),
    supabase.from("proposals").select("id, proposal_number, title, status").eq("organization_id", organizationId).eq("entity_id", entityId).is("deleted_at", null).limit(50),
    supabase.from("client_contracts").select("id, status, end_date").eq("organization_id", organizationId).eq("entity_id", entityId).is("deleted_at", null).limit(50),
  ]);
  return {
    deals: dealsRes.data ?? [],
    quotes: quotesRes.data ?? [],
    proposals: propsRes.data ?? [],
    contracts: contractsRes.data ?? [],
  };
}

// ─── Handlers ───

const getLeadDetails: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const perm = requireWrite(ctx, "leads.view", "ver leads");
  if (perm) return perm;
  if (!args?.lead_id || !UUID_RE.test(String(args.lead_id))) return { success: false, message: "lead_id inválido." };

  const { data: lead, error } = await supabase
    .from("anew_leads")
    .select("id, status, source, assigned_to, notes, entity_id, converted_to_contact_id, converted_to_client_id, created_at")
    .eq("id", args.lead_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!lead) return { success: false, message: "Lead não encontrado ou fora de scope." };

  const entity = await loadEntityHeader(supabase, lead.entity_id);
  const pipeline = await loadPipelineForEntity(supabase, organizationId, lead.entity_id);

  return {
    success: true,
    message: `Lead "${entity?.display_name ?? lead.id}".`,
    data: {
      id: lead.id,
      status: lead.status,
      source: lead.source,
      assigned_to: lead.assigned_to,
      notes: lead.notes,
      created_at: lead.created_at,
      converted_to_contact_id: lead.converted_to_contact_id,
      converted_to_client_id: lead.converted_to_client_id,
      entity,
      pipeline,
      link: `/leads?open=${lead.id}`,
    },
  };
};

const deleteLead: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.lead_id || !UUID_RE.test(String(args.lead_id))) return { success: false, message: "lead_id inválido." };
  if (args?.confirm !== true) return { success: false, message: "Confirmação obrigatória — pede ao utilizador para confirmar e volta a chamar com confirm=true." };
  const perm = requireWrite(ctx, "leads.edit", "cancelar leads");
  if (perm) return perm;

  const { data: lead, error } = await supabase
    .from("anew_leads")
    .select("id, status, entity_id")
    .eq("id", args.lead_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!lead) return { success: false, message: "Lead não encontrado ou fora de scope." };
  if (lead.status === "converted") {
    return { success: false, message: "Lead já foi convertido — cancela/elimina o contacto ou cliente associado." };
  }

  const { error: rpcErr } = await supabase.rpc("soft_delete_entity_facet", { p_kind: "lead", p_id: args.lead_id });
  if (rpcErr) return { success: false, message: `Falha ao cancelar lead: ${rpcErr.message}` };

  return { success: true, message: "Lead cancelado.", data: { id: args.lead_id, link: "/leads" } };
};

const getContactDetails: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const perm = requireWrite(ctx, "contacts.view", "ver contactos");
  if (perm) return perm;
  if (!args?.contact_id || !UUID_RE.test(String(args.contact_id))) return { success: false, message: "contact_id inválido." };

  const { data: contact, error } = await supabase
    .from("anew_contacts")
    .select("id, status, position, assigned_to, notes, entity_id, source_lead_id, converted_to_client_id, created_at")
    .eq("id", args.contact_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!contact) return { success: false, message: "Contacto não encontrado ou fora de scope." };

  const entity = await loadEntityHeader(supabase, contact.entity_id);
  const pipeline = await loadPipelineForEntity(supabase, organizationId, contact.entity_id);

  return {
    success: true,
    message: `Contacto "${entity?.display_name ?? contact.id}".`,
    data: {
      id: contact.id,
      status: contact.status,
      position: contact.position,
      assigned_to: contact.assigned_to,
      notes: contact.notes,
      created_at: contact.created_at,
      source_lead_id: contact.source_lead_id,
      converted_to_client_id: contact.converted_to_client_id,
      entity,
      pipeline,
      link: `/contacts?open=${contact.id}`,
    },
  };
};

const updateContactNotes: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const perm = requireWrite(ctx, "contacts.edit", "editar contactos");
  if (perm) return perm;
  if (!args?.contact_id || !UUID_RE.test(String(args.contact_id))) return { success: false, message: "contact_id inválido." };

  const patch: Record<string, any> = {};
  if (args.notes !== undefined) patch.notes = args.notes === null ? null : String(args.notes);
  if (args.position !== undefined) patch.position = args.position === null ? null : String(args.position);
  if (Object.keys(patch).length === 0) return { success: false, message: "Nada para atualizar." };

  const { data, error } = await supabase
    .from("anew_contacts")
    .update(patch)
    .eq("id", args.contact_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select("id, notes, position")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { success: false, message: "Contacto não encontrado ou fora de scope." };
  return { success: true, message: "Contacto atualizado.", data };
};

const deleteContact: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.contact_id || !UUID_RE.test(String(args.contact_id))) return { success: false, message: "contact_id inválido." };
  if (args?.confirm !== true) return { success: false, message: "Confirmação obrigatória — pede ao utilizador para confirmar e volta a chamar com confirm=true." };
  const perm = requireWrite(ctx, "contacts.edit", "cancelar contactos");
  if (perm) return perm;

  const { data: contact, error } = await supabase
    .from("anew_contacts")
    .select("id, converted_to_client_id")
    .eq("id", args.contact_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!contact) return { success: false, message: "Contacto não encontrado ou fora de scope." };
  if (contact.converted_to_client_id) {
    return { success: false, message: "Contacto já foi convertido em cliente — cancela/elimina o cliente em vez disto." };
  }

  const { error: rpcErr } = await supabase.rpc("soft_delete_entity_facet", { p_kind: "contact", p_id: args.contact_id });
  if (rpcErr) return { success: false, message: `Falha ao cancelar contacto: ${rpcErr.message}` };

  return { success: true, message: "Contacto cancelado.", data: { id: args.contact_id, link: "/contacts" } };
};

const getClientDetails: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const perm = requireWrite(ctx, "clients.view", "ver clientes");
  if (perm) return perm;
  if (!args?.client_id || !UUID_RE.test(String(args.client_id))) return { success: false, message: "client_id inválido." };

  const { data: client, error } = await supabase
    .from("anew_clients")
    .select("id, status, assigned_to, notes, entity_id, created_at")
    .eq("id", args.client_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!client) return { success: false, message: "Cliente não encontrado ou fora de scope." };

  const entity = await loadEntityHeader(supabase, client.entity_id);
  const pipeline = await loadPipelineForEntity(supabase, organizationId, client.entity_id);

  return {
    success: true,
    message: `Cliente "${entity?.display_name ?? client.id}".`,
    data: {
      id: client.id,
      status: client.status,
      assigned_to: client.assigned_to,
      notes: client.notes,
      created_at: client.created_at,
      entity,
      pipeline,
      link: `/clients/${client.id}`,
    },
  };
};

const updateClient: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const perm = requireWrite(ctx, "clients.edit", "editar clientes");
  if (perm) return perm;
  if (!args?.client_id || !UUID_RE.test(String(args.client_id))) return { success: false, message: "client_id inválido." };

  const patch: Record<string, any> = {};
  if (args.notes !== undefined) patch.notes = args.notes === null ? null : String(args.notes);
  if (args.status !== undefined) {
    if (!CONTACT_STATUSES.includes(args.status)) return { success: false, message: `status inválido. Aceites: ${CONTACT_STATUSES.join(", ")}.` };
    patch.status = args.status;
  }
  if (args.assigned_to !== undefined) {
    if (args.assigned_to !== null && !UUID_RE.test(String(args.assigned_to))) return { success: false, message: "assigned_to inválido." };
    patch.assigned_to = args.assigned_to;
  }
  if (Object.keys(patch).length === 0) return { success: false, message: "Nada para atualizar." };

  const { data, error } = await supabase
    .from("anew_clients")
    .update(patch)
    .eq("id", args.client_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select("id, status, assigned_to, notes")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { success: false, message: "Cliente não encontrado ou fora de scope." };
  return { success: true, message: "Cliente atualizado.", data };
};

const deleteClient: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.client_id || !UUID_RE.test(String(args.client_id))) return { success: false, message: "client_id inválido." };
  if (args?.confirm !== true) return { success: false, message: "Confirmação obrigatória — pede ao utilizador para confirmar e volta a chamar com confirm=true." };
  const perm = requireWrite(ctx, "clients.edit", "cancelar clientes");
  if (perm) return perm;

  const { data: client, error } = await supabase
    .from("anew_clients")
    .select("id, entity_id")
    .eq("id", args.client_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!client) return { success: false, message: "Cliente não encontrado ou fora de scope." };

  // State gate — open deals or active contracts block deletion
  if (client.entity_id) {
    const [openDealsRes, contractsRes] = await Promise.all([
      supabase
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("entity_id", client.entity_id)
        .is("deleted_at", null)
        .is("closed_at", null),
      supabase
        .from("client_contracts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("entity_id", client.entity_id)
        .is("deleted_at", null),
    ]);
    const openDeals = openDealsRes.count ?? 0;
    const contracts = contractsRes.count ?? 0;
    if (openDeals > 0 || contracts > 0) {
      const parts: string[] = [];
      if (openDeals > 0) parts.push(`${openDeals} PP aberto(s)`);
      if (contracts > 0) parts.push(`${contracts} contrato(s) activo(s)`);
      return { success: false, message: `Cliente tem ${parts.join(" e ")} — fecha-os primeiro.` };
    }
  }

  const { error: rpcErr } = await supabase.rpc("soft_delete_entity_facet", { p_kind: "client", p_id: args.client_id });
  if (rpcErr) return { success: false, message: `Falha ao cancelar cliente: ${rpcErr.message}` };

  return { success: true, message: "Cliente cancelado.", data: { id: args.client_id, link: "/clients" } };
};

export const handlers: Record<string, Handler> = {
  create_lead: createLead,
  create_contact: createContact,
  search_clients: searchClients,
  search_leads: searchLeads,
  search_contacts: searchContacts,
  update_lead_status: updateLeadStatus,
  update_lead: updateLead,
  update_contact: updateContact,
  convert_lead: convertLead,
  // Fase 3 (Olyvia)
  get_lead_details: getLeadDetails,
  delete_lead: deleteLead,
  get_contact_details: getContactDetails,
  update_contact_notes: updateContactNotes,
  delete_contact: deleteContact,
  get_client_details: getClientDetails,
  update_client: updateClient,
  delete_client: deleteClient,
};
