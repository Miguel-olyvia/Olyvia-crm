// Entity facet CRUD + restore tools (Fase 4.A)
// - emails / phones / addresses CRUD on anew_entity_*
// - contact_tags CRUD
// - restore_lead / restore_contact / restore_client (clear deleted_at)
//
// Permissões: contacts.edit / clients.edit / leads.edit (catálogo confirmado).
// NÃO toca em permissionAliases.ts.

import { requireWrite } from "../shared/authz.ts";
import { sanitizeEmail, sanitizePhone } from "../../_shared/inputSanitizers.ts";
import { buildAddressKey, syncEntityPrimaryAddressFromLead } from "../../_shared/addressSanitization.ts";
import type { ExecCtx, Handler, ToolDef, ToolResult } from "../shared/types.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

// Tipo aceite por anew_entity_addresses.address_type (valores reais no DB).
const ADDRESS_TYPES = ["primary", "residential", "home", "work"] as const;
type AddressType = (typeof ADDRESS_TYPES)[number];

// ----------------------------------------------------------------------------
// Helper: resolve um entity_id a partir de {entity_id, contact_id, lead_id, client_id}.
// Todos UUIDs; lookups scoped à organização activa e não-soft-deleted.
// ----------------------------------------------------------------------------
async function resolveTargetEntityId(
  ctx: ExecCtx,
  args: { entity_id?: string; contact_id?: string; lead_id?: string; client_id?: string },
): Promise<{ ok: true; entityId: string } | { ok: false; result: ToolResult }> {
  const { supabase, organizationId } = ctx;

  if (args.entity_id) {
    if (!isUuid(args.entity_id)) return { ok: false, result: { success: false, message: "entity_id inválido." } };
    // valida org closure via anew_entity_org_links (ou existência em lead/contact/client)
    const { data } = await supabase
      .from("anew_entity_org_links")
      .select("entity_id")
      .eq("entity_id", args.entity_id)
      .eq("organization_id", organizationId)
      .limit(1);
    if (data && data.length) return { ok: true, entityId: args.entity_id };
    // fallback: existe presença em lead/contact/client?
    for (const t of ["anew_leads", "anew_contacts", "anew_clients"]) {
      const { data: r } = await supabase
        .from(t).select("entity_id")
        .eq("entity_id", args.entity_id).eq("organization_id", organizationId)
        .is("deleted_at", null).limit(1);
      if (r && r.length) return { ok: true, entityId: args.entity_id };
    }
    return { ok: false, result: { success: false, message: "entity_id não pertence a esta organização." } };
  }

  const facetMap: Array<[keyof typeof args, string]> = [
    ["contact_id", "anew_contacts"],
    ["lead_id", "anew_leads"],
    ["client_id", "anew_clients"],
  ];
  for (const [key, table] of facetMap) {
    const v = args[key];
    if (!v) continue;
    if (!isUuid(v)) return { ok: false, result: { success: false, message: `${key} inválido.` } };
    const { data, error } = await supabase
      .from(table).select("entity_id")
      .eq("id", v).eq("organization_id", organizationId)
      .is("deleted_at", null).maybeSingle();
    if (error) throw error;
    if (!data?.entity_id) return { ok: false, result: { success: false, message: `${key} não encontrado nesta organização.` } };
    return { ok: true, entityId: data.entity_id as string };
  }

  return { ok: false, result: { success: false, message: "Indica entity_id, contact_id, lead_id ou client_id." } };
}

const TARGET_PROPS = {
  entity_id: { type: "string", description: "UUID da entidade (preferido)." },
  contact_id: { type: "string", description: "UUID do contacto (alternativa a entity_id)." },
  lead_id: { type: "string", description: "UUID do lead (alternativa a entity_id)." },
  client_id: { type: "string", description: "UUID do cliente (alternativa a entity_id)." },
};

// ============================================================================
// EMAILS
// ============================================================================

export const addEntityEmailDef: ToolDef = {
  type: "function",
  function: {
    name: "add_entity_email",
    description: "Adiciona um email à entidade (anew_entity_emails). Se is_primary=true, despromove os restantes.",
    parameters: {
      type: "object",
      properties: {
        ...TARGET_PROPS,
        email: { type: "string" },
        email_type: { type: "string", description: "personal|work|other (opcional)" },
        is_primary: { type: "boolean" },
      },
      required: ["email"],
    },
  },
};

const addEntityEmail: Handler = async (ctx, args): Promise<ToolResult> => {
  const perm = requireWrite(ctx, "contacts.edit", "editar contactos");
  if (perm) return perm;
  const r = await resolveTargetEntityId(ctx, args);
  if (!r.ok) return r.result;
  const cleanEmail = sanitizeEmail(String(args.email ?? ""));
  if (!cleanEmail) return { success: false, message: "Email inválido." };

  // Despromove se vai ficar primary
  if (args.is_primary === true) {
    await ctx.supabase.from("anew_entity_emails")
      .update({ is_primary: false }).eq("entity_id", r.entityId).eq("is_primary", true);
  }

  const { data, error } = await ctx.supabase.from("anew_entity_emails").insert({
    entity_id: r.entityId,
    email: cleanEmail,
    email_type: args.email_type ?? null,
    is_primary: args.is_primary === true,
    created_by: ctx.businessUserId || null,
  }).select("id, email, is_primary").single();
  if (error) return { success: false, message: error.message };
  return { success: true, message: `Email "${cleanEmail}" adicionado.`, data };
};

export const deleteEntityEmailDef: ToolDef = {
  type: "function",
  function: {
    name: "delete_entity_email",
    description: "Remove um email da entidade pelo email_id (anew_entity_emails.id).",
    parameters: {
      type: "object",
      properties: { email_id: { type: "string" }, confirm: { type: "boolean" } },
      required: ["email_id", "confirm"],
    },
  },
};

const deleteEntityEmail: Handler = async (ctx, args): Promise<ToolResult> => {
  const perm = requireWrite(ctx, "contacts.edit", "editar contactos");
  if (perm) return perm;
  if (args.confirm !== true) return { success: false, message: "Pede confirmação (confirm=true) antes de remover." };
  if (!isUuid(args.email_id)) return { success: false, message: "email_id inválido." };

  // valida que pertence a entidade desta org
  const { data: row } = await ctx.supabase
    .from("anew_entity_emails").select("id, entity_id, email").eq("id", args.email_id).maybeSingle();
  if (!row) return { success: false, message: "Email não encontrado." };
  const check = await resolveTargetEntityId(ctx, { entity_id: row.entity_id });
  if (!check.ok) return check.result;

  const { error } = await ctx.supabase.from("anew_entity_emails").delete().eq("id", args.email_id);
  if (error) return { success: false, message: error.message };
  return { success: true, message: `Email "${row.email}" removido.` };
};

export const setPrimaryEmailDef: ToolDef = {
  type: "function",
  function: {
    name: "set_primary_email",
    description: "Marca um email como primário (despromovendo os outros da mesma entidade).",
    parameters: {
      type: "object",
      properties: { email_id: { type: "string" } },
      required: ["email_id"],
    },
  },
};

const setPrimaryEmail: Handler = async (ctx, args): Promise<ToolResult> => {
  const perm = requireWrite(ctx, "contacts.edit", "editar contactos");
  if (perm) return perm;
  if (!isUuid(args.email_id)) return { success: false, message: "email_id inválido." };
  const { data: row } = await ctx.supabase
    .from("anew_entity_emails").select("id, entity_id, email").eq("id", args.email_id).maybeSingle();
  if (!row) return { success: false, message: "Email não encontrado." };
  const check = await resolveTargetEntityId(ctx, { entity_id: row.entity_id });
  if (!check.ok) return check.result;

  await ctx.supabase.from("anew_entity_emails")
    .update({ is_primary: false }).eq("entity_id", row.entity_id).eq("is_primary", true);
  const { error } = await ctx.supabase.from("anew_entity_emails")
    .update({ is_primary: true }).eq("id", args.email_id);
  if (error) return { success: false, message: error.message };
  return { success: true, message: `Email "${row.email}" definido como primário.` };
};

// ============================================================================
// PHONES
// ============================================================================

export const addEntityPhoneDef: ToolDef = {
  type: "function",
  function: {
    name: "add_entity_phone",
    description: "Adiciona um telefone à entidade (anew_entity_phones).",
    parameters: {
      type: "object",
      properties: {
        ...TARGET_PROPS,
        phone_number: { type: "string" },
        country_code: { type: "string", description: "Ex: +351" },
        phone_type: { type: "string", description: "mobile|landline|work|other" },
        is_primary: { type: "boolean" },
      },
      required: ["phone_number"],
    },
  },
};

const addEntityPhone: Handler = async (ctx, args): Promise<ToolResult> => {
  const perm = requireWrite(ctx, "contacts.edit", "editar contactos");
  if (perm) return perm;
  const r = await resolveTargetEntityId(ctx, args);
  if (!r.ok) return r.result;
  const cleanPhone = sanitizePhone(String(args.phone_number ?? ""));
  if (!cleanPhone) return { success: false, message: "Telefone inválido." };

  if (args.is_primary === true) {
    await ctx.supabase.from("anew_entity_phones")
      .update({ is_primary: false }).eq("entity_id", r.entityId).eq("is_primary", true);
  }

  const { data, error } = await ctx.supabase.from("anew_entity_phones").insert({
    entity_id: r.entityId,
    phone_number: cleanPhone,
    country_code: args.country_code ?? null,
    phone_type: args.phone_type ?? null,
    is_primary: args.is_primary === true,
    created_by: ctx.businessUserId || null,
  }).select("id, phone_number, is_primary").single();
  if (error) return { success: false, message: error.message };
  return { success: true, message: `Telefone "${cleanPhone}" adicionado.`, data };
};

export const deleteEntityPhoneDef: ToolDef = {
  type: "function",
  function: {
    name: "delete_entity_phone",
    description: "Remove um telefone da entidade pelo phone_id.",
    parameters: {
      type: "object",
      properties: { phone_id: { type: "string" }, confirm: { type: "boolean" } },
      required: ["phone_id", "confirm"],
    },
  },
};

const deleteEntityPhone: Handler = async (ctx, args): Promise<ToolResult> => {
  const perm = requireWrite(ctx, "contacts.edit", "editar contactos");
  if (perm) return perm;
  if (args.confirm !== true) return { success: false, message: "Pede confirmação (confirm=true) antes de remover." };
  if (!isUuid(args.phone_id)) return { success: false, message: "phone_id inválido." };
  const { data: row } = await ctx.supabase
    .from("anew_entity_phones").select("id, entity_id, phone_number").eq("id", args.phone_id).maybeSingle();
  if (!row) return { success: false, message: "Telefone não encontrado." };
  const check = await resolveTargetEntityId(ctx, { entity_id: row.entity_id });
  if (!check.ok) return check.result;
  const { error } = await ctx.supabase.from("anew_entity_phones").delete().eq("id", args.phone_id);
  if (error) return { success: false, message: error.message };
  return { success: true, message: `Telefone "${row.phone_number}" removido.` };
};

export const setPrimaryPhoneDef: ToolDef = {
  type: "function",
  function: {
    name: "set_primary_phone",
    description: "Marca um telefone como primário (despromovendo os outros).",
    parameters: {
      type: "object",
      properties: { phone_id: { type: "string" } },
      required: ["phone_id"],
    },
  },
};

const setPrimaryPhone: Handler = async (ctx, args): Promise<ToolResult> => {
  const perm = requireWrite(ctx, "contacts.edit", "editar contactos");
  if (perm) return perm;
  if (!isUuid(args.phone_id)) return { success: false, message: "phone_id inválido." };
  const { data: row } = await ctx.supabase
    .from("anew_entity_phones").select("id, entity_id, phone_number").eq("id", args.phone_id).maybeSingle();
  if (!row) return { success: false, message: "Telefone não encontrado." };
  const check = await resolveTargetEntityId(ctx, { entity_id: row.entity_id });
  if (!check.ok) return check.result;

  await ctx.supabase.from("anew_entity_phones")
    .update({ is_primary: false }).eq("entity_id", row.entity_id).eq("is_primary", true);
  const { error } = await ctx.supabase.from("anew_entity_phones")
    .update({ is_primary: true }).eq("id", args.phone_id);
  if (error) return { success: false, message: error.message };
  return { success: true, message: `Telefone "${row.phone_number}" definido como primário.` };
};

// ============================================================================
// ADDRESS — set_entity_address (upsert simples)
// ============================================================================

export const setEntityAddressDef: ToolDef = {
  type: "function",
  function: {
    name: "set_entity_address",
    description: "Define/actualiza uma morada da entidade. address_type ∈ {primary,residential,home,work}. Se primary, usa o helper canónico que reaproveita ou substitui a morada primária existente.",
    parameters: {
      type: "object",
      properties: {
        ...TARGET_PROPS,
        street: { type: "string" },
        number: { type: "string" },
        postal_code: { type: "string", description: "Formato PT: NNNN-NNN" },
        city: { type: "string" },
        country: { type: "string", description: "Código ISO-2 (default PT)" },
        district: { type: "string" },
        address_type: { type: "string", enum: [...ADDRESS_TYPES] },
      },
      required: ["street", "postal_code", "city"],
    },
  },
};

const setEntityAddress: Handler = async (ctx, args): Promise<ToolResult> => {
  const perm = requireWrite(ctx, "contacts.edit", "editar contactos");
  if (perm) return perm;
  const r = await resolveTargetEntityId(ctx, args);
  if (!r.ok) return r.result;
  const addressType: AddressType = ADDRESS_TYPES.includes(args.address_type) ? args.address_type : "primary";
  const country = String(args.country ?? "PT").toUpperCase().slice(0, 2);

  // Caminho primary: helper partilhado lida com substituição/clone.
  if (addressType === "primary") {
    const res = await syncEntityPrimaryAddressFromLead({
      supabase: ctx.supabase,
      entityId: r.entityId,
      fieldValues: {
        street: args.street,
        postal_code: args.postal_code,
        city: args.city,
        district: args.district ?? null,
      },
      actorId: ctx.businessUserId || null,
      allowOverwriteValid: true,
    });
    if (res.decision === "error") return { success: false, message: res.reason ?? "Erro a gravar morada." };
    return {
      success: true,
      message: `Morada primária ${res.decision === "insert_new" ? "criada" : "actualizada"}.`,
      data: { address_id: res.addressId, decision: res.decision },
    };
  }

  // Caminho secundário (residential/home/work): insert directo de morada e link.
  const newAddrId = crypto.randomUUID();
  const addressKey = buildAddressKey({
    street: args.street, number: args.number ?? "",
    postal_code: args.postal_code, city: args.city, country,
  });
  const { error: aErr } = await ctx.supabase.from("anew_addresses").insert({
    id: newAddrId,
    address_key: addressKey,
    street: String(args.street),
    number: String(args.number ?? ""),
    postal_code: String(args.postal_code),
    city: String(args.city),
    district: args.district ?? null,
    country,
    created_by: ctx.businessUserId || null,
  });
  if (aErr) return { success: false, message: aErr.message };
  const { error: lErr } = await ctx.supabase.from("anew_entity_addresses").insert({
    entity_id: r.entityId,
    address_id: newAddrId,
    address_type: addressType,
    is_primary: false,
    created_by: ctx.businessUserId || null,
  });
  if (lErr) return { success: false, message: lErr.message };
  return { success: true, message: `Morada (${addressType}) adicionada.`, data: { address_id: newAddrId } };
};

// ============================================================================
// CONTACT TAGS (created_by é TEXT no schema)
// ============================================================================

export const addContactTagDef: ToolDef = {
  type: "function",
  function: {
    name: "add_contact_tag",
    description: "Adiciona uma tag à entidade (contact_tags). UNIQUE em (entity_id, organization_id, tag).",
    parameters: {
      type: "object",
      properties: {
        ...TARGET_PROPS,
        tag: { type: "string" },
        color: { type: "string", description: "Nome ou hex (default blue)" },
      },
      required: ["tag"],
    },
  },
};

const addContactTag: Handler = async (ctx, args): Promise<ToolResult> => {
  const perm = requireWrite(ctx, "contacts.edit", "editar contactos");
  if (perm) return perm;
  const r = await resolveTargetEntityId(ctx, args);
  if (!r.ok) return r.result;
  const tag = String(args.tag ?? "").trim();
  if (!tag) return { success: false, message: "Tag inválida." };

  const { data, error } = await ctx.supabase.from("contact_tags").upsert({
    entity_id: r.entityId,
    organization_id: ctx.organizationId,
    tag,
    color: args.color ?? "blue",
    created_by: ctx.businessUserId ? String(ctx.businessUserId) : null,
  }, { onConflict: "entity_id,organization_id,tag" }).select("id, tag, color").single();
  if (error) return { success: false, message: error.message };
  return { success: true, message: `Tag "${tag}" adicionada.`, data };
};

export const removeContactTagDef: ToolDef = {
  type: "function",
  function: {
    name: "remove_contact_tag",
    description: "Remove uma tag da entidade. Identifica por (entity_id|contact_id|lead_id|client_id) + tag.",
    parameters: {
      type: "object",
      properties: { ...TARGET_PROPS, tag: { type: "string" } },
      required: ["tag"],
    },
  },
};

const removeContactTag: Handler = async (ctx, args): Promise<ToolResult> => {
  const perm = requireWrite(ctx, "contacts.edit", "editar contactos");
  if (perm) return perm;
  const r = await resolveTargetEntityId(ctx, args);
  if (!r.ok) return r.result;
  const tag = String(args.tag ?? "").trim();
  if (!tag) return { success: false, message: "Tag inválida." };
  const { error, count } = await ctx.supabase.from("contact_tags").delete({ count: "exact" })
    .eq("entity_id", r.entityId).eq("organization_id", ctx.organizationId).eq("tag", tag);
  if (error) return { success: false, message: error.message };
  if (!count) return { success: false, message: `Tag "${tag}" não encontrada na entidade.` };
  return { success: true, message: `Tag "${tag}" removida.` };
};

export const listContactTagsDef: ToolDef = {
  type: "function",
  function: {
    name: "list_contact_tags",
    description: "Lista as tags da entidade.",
    parameters: { type: "object", properties: { ...TARGET_PROPS } },
  },
};

const listContactTags: Handler = async (ctx, args): Promise<ToolResult> => {
  const r = await resolveTargetEntityId(ctx, args);
  if (!r.ok) return r.result;
  const { data, error } = await ctx.supabase.from("contact_tags")
    .select("id, tag, color, created_at")
    .eq("entity_id", r.entityId).eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false });
  if (error) return { success: false, message: error.message };
  return { success: true, message: `${data?.length ?? 0} tag(s).`, data: data ?? [] };
};

// ============================================================================
// RESTORE — clear deleted_at em leads/contacts/clients
// ============================================================================

function makeRestoreHandler(table: string, label: string, permCode: string): Handler {
  return async (ctx, args): Promise<ToolResult> => {
    const perm = requireWrite(ctx, permCode, `restaurar ${label}`);
    if (perm) return perm;
    if (!isUuid(args.id)) return { success: false, message: "id inválido." };
    const { data: row } = await ctx.supabase.from(table)
      .select("id, deleted_at").eq("id", args.id).eq("organization_id", ctx.organizationId).maybeSingle();
    if (!row) return { success: false, message: `${label} não encontrado nesta organização.` };
    if (!row.deleted_at) return { success: false, message: `${label} não está apagado.` };
    const { error } = await ctx.supabase.from(table)
      .update({ deleted_at: null }).eq("id", args.id).eq("organization_id", ctx.organizationId);
    if (error) return { success: false, message: error.message };
    return { success: true, message: `${label} restaurado.`, data: { id: args.id } };
  };
}

export const restoreLeadDef: ToolDef = {
  type: "function",
  function: {
    name: "restore_lead",
    description: "Restaura um lead soft-deleted (deleted_at IS NOT NULL).",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
};
export const restoreContactDef: ToolDef = {
  type: "function",
  function: {
    name: "restore_contact",
    description: "Restaura um contacto soft-deleted.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
};
export const restoreClientDef: ToolDef = {
  type: "function",
  function: {
    name: "restore_client",
    description: "Restaura um cliente soft-deleted.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
};

// ----------------------------------------------------------------------------
export const handlers: Record<string, Handler> = {
  add_entity_email: addEntityEmail,
  delete_entity_email: deleteEntityEmail,
  set_primary_email: setPrimaryEmail,
  add_entity_phone: addEntityPhone,
  delete_entity_phone: deleteEntityPhone,
  set_primary_phone: setPrimaryPhone,
  set_entity_address: setEntityAddress,
  add_contact_tag: addContactTag,
  remove_contact_tag: removeContactTag,
  list_contact_tags: listContactTags,
  restore_lead: makeRestoreHandler("anew_leads", "Lead", "leads.edit"),
  restore_contact: makeRestoreHandler("anew_contacts", "Contacto", "contacts.edit"),
  restore_client: makeRestoreHandler("anew_clients", "Cliente", "clients.edit"),
};
