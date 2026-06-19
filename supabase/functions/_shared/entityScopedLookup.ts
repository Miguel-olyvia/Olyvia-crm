// Org-scoped entity lookup for the public form / public API.
// Looks for an existing entity inside ONE organization by identifier
// (email / phone / nif). Cross-org identity is intentionally ignored:
// even if the email belongs to an entity in another org of the same
// hierarchy group, the public form must NOT silently share it.
// Cross-org sharing is always opt-in via the manual UI (link_entity_to_org).

export type ScopedLookupHit = {
  entityId: string;
  matchField: "email" | "phone" | "nif";
};

function normalizePhoneSuffix(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-9); // last 9 digits (PT mobile = 9 digits, ≥7 enforced)
}

export async function findLocalEntityForOrg(params: {
  supabase: any;
  organizationId: string;
  email?: string | null;
  phone?: string | null;
  nif?: string | null;
  countryCode?: string;
}): Promise<ScopedLookupHit | null> {
  const { supabase, organizationId, email, phone, nif, countryCode = "PT" } = params;
  if (!organizationId) return null;

  // --- 1. Resolve candidate entity_ids from each identifier ---
  const candidates: Array<{ entityId: string; matchField: ScopedLookupHit["matchField"] }> = [];

  if (email) {
    const norm = String(email).trim().toLowerCase();
    if (norm) {
      const { data } = await supabase
        .from("anew_entity_emails")
        .select("entity_id")
        .eq("email", norm)
        .limit(20);
      for (const r of data ?? []) {
        if (r?.entity_id) candidates.push({ entityId: r.entity_id, matchField: "email" });
      }
    }
  }

  if (phone) {
    const suffix = normalizePhoneSuffix(phone);
    if (suffix) {
      const { data } = await supabase
        .from("anew_entity_phones")
        .select("entity_id, phone_number")
        .ilike("phone_number", `%${suffix}`)
        .limit(50);
      for (const r of data ?? []) {
        if (r?.entity_id) candidates.push({ entityId: r.entity_id, matchField: "phone" });
      }
    }
  }

  if (nif) {
    const cleanNif = String(nif).trim().toUpperCase();
    if (cleanNif) {
      const { data: fes } = await supabase
        .from("fiscal_entities")
        .select("id")
        .eq("nif", cleanNif)
        .eq("country_code", countryCode)
        .limit(5);
      const feIds = (fes ?? []).map((f: any) => f.id);
      if (feIds.length) {
        const { data: links } = await supabase
          .from("anew_entity_fiscal_entities")
          .select("entity_id")
          .in("fiscal_entity_id", feIds)
          .limit(20);
        for (const r of links ?? []) {
          if (r?.entity_id) candidates.push({ entityId: r.entity_id, matchField: "nif" });
        }
      }
    }
  }

  if (candidates.length === 0) return null;

  // --- 2. Filter candidates against this org's entity links ---
  const ids = [...new Set(candidates.map((c) => c.entityId))];
  const { data: links } = await supabase
    .from("anew_entity_org_links")
    .select("entity_id")
    .eq("organization_id", organizationId)
    .in("entity_id", ids);
  const localIds = new Set((links ?? []).map((r: any) => r.entity_id));

  // Preference order: email > nif > phone (more specific first)
  const order = { email: 0, nif: 1, phone: 2 } as const;
  const local = candidates
    .filter((c) => localIds.has(c.entityId))
    .sort((a, b) => order[a.matchField] - order[b.matchField]);

  return local[0] ?? null;
}

export type ExistingRoleSummary = {
  hasContact: boolean;
  hasClient: boolean;
  activeLeadId: string | null;
  contactId: string | null;
  clientId: string | null;
  // anew_users.id of the responsible person (assigned_to or owner)
  assigneeAnewUserId: string | null;
  targetType: "lead" | "contact" | "client" | null;
  targetId: string | null;
};

export async function classifyEntityInOrg(params: {
  supabase: any;
  entityId: string;
  organizationId: string;
}): Promise<ExistingRoleSummary> {
  const { supabase, entityId, organizationId } = params;
  const result: ExistingRoleSummary = {
    hasContact: false, hasClient: false, activeLeadId: null,
    contactId: null, clientId: null,
    assigneeAnewUserId: null, targetType: null, targetId: null,
  };

  const [leadsRes, contactsRes, clientsRes] = await Promise.all([
    supabase.from("anew_leads")
      .select("id, status, assigned_to, created_by")
      .eq("entity_id", entityId)
      .eq("organization_id", organizationId)
      .not("status", "in", '("converted","lost","rejected")')
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.from("anew_contacts")
      .select("id, status, assigned_to, created_by")
      .eq("entity_id", entityId)
      .eq("organization_id", organizationId)
      .not("status", "eq", "inactive")
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.from("anew_clients")
      .select("id, status, assigned_to, created_by")
      .eq("entity_id", entityId)
      .eq("organization_id", organizationId)
      .not("status", "eq", "inactive")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const lead = leadsRes.data?.[0];
  const contact = contactsRes.data?.[0];
  const client = clientsRes.data?.[0];

  if (client) {
    result.hasClient = true;
    result.clientId = client.id;
    result.targetType = "client";
    result.targetId = client.id;
    result.assigneeAnewUserId = client.assigned_to ?? client.created_by ?? null;
  } else if (contact) {
    result.hasContact = true;
    result.contactId = contact.id;
    result.targetType = "contact";
    result.targetId = contact.id;
    result.assigneeAnewUserId = contact.assigned_to ?? contact.created_by ?? null;
  } else if (lead) {
    result.activeLeadId = lead.id;
    result.targetType = "lead";
    result.targetId = lead.id;
    result.assigneeAnewUserId = lead.assigned_to ?? lead.created_by ?? null;
  }

  return result;
}

/**
 * Emits an alert notification when a public-form submission re-arrives for
 * an entity that is already a Contact / Client / has an active Lead in the
 * receiving org. Idempotent within a 24h window.
 *
 * Returns the notification id (or null on no-op / failure — non-fatal).
 */
export async function emitFormResubmissionAlert(params: {
  supabase: any;
  organizationId: string;
  entityId: string;
  summary: ExistingRoleSummary;
  campaignId: string | null;
  formId?: string | null;
  fieldValuesDiff?: Record<string, unknown> | null;
  displayName?: string | null;
}): Promise<string | null> {
  const { supabase, organizationId, entityId, summary, campaignId, formId, fieldValuesDiff, displayName } = params;

  if (!summary.targetType || !summary.targetId) return null;

  // Resolve auth_user_id for the assignee
  let authUserId: string | null = null;
  if (summary.assigneeAnewUserId) {
    const { data } = await supabase
      .from("anew_users")
      .select("auth_user_id")
      .eq("id", summary.assigneeAnewUserId)
      .maybeSingle();
    authUserId = data?.auth_user_id ?? null;
  }

  // Fallback: any active admin/owner of the org
  if (!authUserId) {
    const { data } = await supabase
      .from("anew_memberships")
      .select("user_id, role, anew_users!inner(auth_user_id)")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .in("role", ["owner", "admin"])
      .limit(1)
      .maybeSingle();
    authUserId = (data as any)?.anew_users?.auth_user_id ?? null;
  }

  if (!authUserId) {
    console.warn("[form-alert] no recipient for", { organizationId, entityId });
    return null;
  }

  const type = summary.targetType === "client"
    ? "form_resubmission_client"
    : summary.targetType === "contact"
      ? "form_resubmission_contact"
      : "form_resubmission_lead";

  const title = summary.targetType === "client"
    ? "Cliente submeteu formulário"
    : summary.targetType === "contact"
      ? "Contacto submeteu formulário"
      : "Lead existente voltou a submeter formulário";

  const labelName = displayName || "Entidade";
  const message = `${labelName} preencheu novamente o formulário. Não foi criada uma nova lead.`;

  const link = summary.targetType === "client"
    ? `/clients?open=${summary.targetId}`
    : summary.targetType === "contact"
      ? `/contacts?open=${summary.targetId}`
      : `/leads?open=${summary.targetId}`;

  // Idempotency — reuse pending notification of same type+entity in last 24h
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .from("notifications")
    .select("id, data")
    .eq("user_id", authUserId)
    .eq("type", type)
    .eq("entity_id", summary.targetId)
    .eq("is_resolved", false)
    .gte("created_at", sinceIso)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const prev = (existing as any).data || {};
    const count = (prev.repeat_count ?? 1) + 1;
    await supabase.from("notifications")
      .update({
        data: {
          ...prev,
          repeat_count: count,
          last_submitted_at: new Date().toISOString(),
          last_field_values_diff: fieldValuesDiff || null,
        },
      })
      .eq("id", existing.id);
    return existing.id as string;
  }

  const payload = {
    user_id: authUserId,
    organization_id: organizationId,
    type,
    title,
    message,
    link,
    entity_type: summary.targetType,
    entity_id: summary.targetId,
    priority: "medium",
    kind: "alert",
    data: {
      entity_id: entityId,
      campaign_id: campaignId,
      form_id: formId ?? null,
      submitted_at: new Date().toISOString(),
      field_values_diff: fieldValuesDiff || null,
      repeat_count: 1,
    },
  };

  const { data: inserted, error } = await supabase
    .from("notifications")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    console.warn("[form-alert] insert failed", error.message);
    return null;
  }
  return inserted?.id ?? null;
}

/**
 * Non-destructive merge of new field_values into an existing target row
 * (lead / contact / client). Only sets keys that are null / undefined /
 * empty-string on the existing row.
 */
export async function mergeFieldValuesNonDestructive(params: {
  supabase: any;
  table: "anew_leads" | "anew_contacts" | "anew_clients";
  rowId: string;
  newFieldValues: Record<string, any>;
}): Promise<Record<string, any>> {
  const { supabase, table, rowId, newFieldValues } = params;
  if (!newFieldValues || Object.keys(newFieldValues).length === 0) return {};

  const { data: existing } = await supabase
    .from(table)
    .select("field_values")
    .eq("id", rowId)
    .maybeSingle();
  const current = (existing?.field_values || {}) as Record<string, any>;

  const merged: Record<string, any> = { ...current };
  const diff: Record<string, any> = {};
  for (const [k, v] of Object.entries(newFieldValues)) {
    const cur = current[k];
    const isEmpty = cur === null || cur === undefined || cur === "" || (Array.isArray(cur) && cur.length === 0);
    if (isEmpty && v !== null && v !== undefined && v !== "") {
      merged[k] = v;
      diff[k] = v;
    }
  }

  if (Object.keys(diff).length > 0) {
    await supabase
      .from(table)
      .update({ field_values: merged })
      .eq("id", rowId);
  }
  return diff;
}

/**
 * Local-only idempotent link insert. Service-role context bypasses the
 * blocked RLS on anew_entity_org_links — only call this from edge functions
 * using service_role. Never writes shared_* metadata.
 */
export async function ensureEntityOrgLinkSR(params: {
  supabase: any;
  entityId: string;
  organizationId: string;
  isPrimary?: boolean;
}): Promise<void> {
  const { supabase, entityId, organizationId, isPrimary = false } = params;
  if (!entityId || !organizationId) return;
  const { error } = await supabase
    .from("anew_entity_org_links")
    .upsert(
      { entity_id: entityId, organization_id: organizationId, is_primary: !!isPrimary },
      { onConflict: "entity_id,organization_id", ignoreDuplicates: true },
    );
  if (error) console.warn("[org-link/sr] upsert failed", error.message);
}
