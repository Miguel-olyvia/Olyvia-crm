// Fase 4 — search_users + assign_crm_record.
// Sem .or(), sem SQL raw, sem .select('*'), sem embeds onde 2 queries chegam.

import type { Handler, ToolDef, ToolResult } from "../shared/types.ts";
import { requireWrite } from "../shared/authz.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeIlike(q: string): string {
  return q.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// ─────────────────────────── search_users ───────────────────────────

export const searchUsersDef: ToolDef = {
  type: "function",
  function: {
    name: "search_users",
    description:
      "Procura membros da organização actual por name ou email (anew_users). Mínimo 2 caracteres. Por defeito só devolve membership e user activos. Devolve sempre membership_status e user_status para o modelo poder filtrar antes de propor atribuições. Nunca expõe auth_user_id.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Texto de pesquisa (min 2 chars). Aplica-se a name e email." },
        limit: { type: "number", description: "Entre 1 e 25 (default 10)." },
        include_inactive: {
          type: "boolean",
          description: "Default false. Quando true devolve também memberships não-activas e users inactivos — usa membership_status e user_status para decidir.",
        },
      },
      required: ["query"],
    },
  },
};

const search_users: Handler = async (ctx, args): Promise<ToolResult> => {
  const supabase = ctx.supabase;
  const orgId = ctx.organizationId;
  if (!orgId) return { success: false, message: "organização não definida no contexto" };

  const rawQuery = typeof args?.query === "string" ? args.query.trim() : "";
  if (rawQuery.length < 2) return { success: false, message: "query precisa de ≥2 caracteres" };

  const includeInactive = args?.include_inactive === true;
  const limit = Math.max(1, Math.min(25, Number(args?.limit) || 10));
  const pattern = `%${escapeIlike(rawQuery)}%`;

  // 1) memberships da org
  let mq = supabase
    .from("anew_memberships")
    .select("user_id, status")
    .eq("organization_id", orgId)
    .limit(500);
  if (!includeInactive) mq = mq.eq("status", "active");
  const { data: memberships, error: mErr } = await mq;
  if (mErr) {
    console.error("search_users memberships:", mErr);
    return { success: false, message: `erro ao ler memberships: ${String(mErr.message || mErr).slice(0, 200)}` };
  }

  // Dedupe preferindo membership_status='active'
  const msByUser = new Map<string, string>();
  for (const m of (memberships ?? []) as Array<{ user_id: string; status: string }>) {
    if (!m?.user_id) continue;
    const prev = msByUser.get(m.user_id);
    if (prev === "active") continue;
    if (m.status === "active" || !prev) msByUser.set(m.user_id, m.status);
  }
  const userIds = Array.from(msByUser.keys());
  if (userIds.length === 0) return { success: true, data: { items: [], query: rawQuery } };

  // 2) anew_users — 2 queries (name + email)
  function baseUsers() {
    let q = supabase
      .from("anew_users")
      .select("id, name, email, status")
      .in("id", userIds)
      .limit(50);
    if (!includeInactive) q = q.eq("status", "active");
    return q;
  }

  const [byName, byEmail] = await Promise.all([
    baseUsers().ilike("name", pattern),
    baseUsers().ilike("email", pattern),
  ]);

  if (byName.error) {
    console.error("search_users name:", byName.error);
    return { success: false, message: `erro ao ler users: ${String(byName.error.message || byName.error).slice(0, 200)}` };
  }
  if (byEmail.error) {
    console.error("search_users email:", byEmail.error);
    return { success: false, message: `erro ao ler users: ${String(byEmail.error.message || byEmail.error).slice(0, 200)}` };
  }

  type Row = { id: string; name: string | null; email: string | null; status: string };
  const qLower = rawQuery.toLowerCase();
  const byId = new Map<string, { id: string; name: string | null; email: string | null; membership_status: string; user_status: string }>();
  for (const r of [...(byName.data ?? []), ...(byEmail.data ?? [])] as Row[]) {
    if (!r?.id || byId.has(r.id)) continue;
    byId.set(r.id, {
      id: r.id,
      name: r.name ?? null,
      email: r.email ?? null,
      membership_status: msByUser.get(r.id) ?? "unknown",
      user_status: r.status,
    });
  }

  function score(it: { name: string | null; email: string | null }): number {
    const n = (it.name ?? "").toLowerCase();
    const e = (it.email ?? "").toLowerCase();
    if (n.startsWith(qLower) || e.startsWith(qLower)) return 2;
    if (n.includes(qLower) || e.includes(qLower)) return 1;
    return 0;
  }

  const items = Array.from(byId.values())
    .map((it) => ({ it, s: score(it) }))
    .sort((a, b) => b.s - a.s || (a.it.name ?? "").localeCompare(b.it.name ?? ""))
    .slice(0, limit)
    .map((x) => x.it);

  return { success: true, data: { items, query: rawQuery }, link: null };
};

// ─────────────────────────── assign_crm_record ───────────────────────────

type EntityType = "lead" | "deal" | "contact";
const ENTITY_TABLE: Record<EntityType, string> = {
  lead: "anew_leads",
  deal: "deals",
  contact: "anew_contacts",
};
const ENTITY_PERM: Record<EntityType, string> = {
  lead: "leads.edit",
  deal: "deals.edit",
  contact: "contacts.edit",
};
const ENTITY_LABEL: Record<EntityType, string> = {
  lead: "lead",
  deal: "PP",
  contact: "contacto",
};

export const assignCrmRecordDef: ToolDef = {
  type: "function",
  function: {
    name: "assign_crm_record",
    description:
      "Atribui (ou desatribui com null) um lead, deal ou contacto a um utilizador. Exige permissão .edit do módulo e, quando assignee_user_id não é null, que o assignee tenha user_status='active' E membership_status='active' na organização actual. assignee_user_id é anew_users.id, nunca auth_user_id.",
    parameters: {
      type: "object",
      properties: {
        entity_type: { type: "string", enum: ["lead", "deal", "contact"] },
        record_id: { type: "string", description: "UUID do registo (anew_leads.id | deals.id | anew_contacts.id)." },
        assignee_user_id: { type: ["string", "null"], description: "anew_users.id ou null para desatribuir." },
      },
      required: ["entity_type", "record_id", "assignee_user_id"],
    },
  },
};

const assign_crm_record: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };

  const entityType = args?.entity_type as EntityType;
  if (!entityType || !(entityType in ENTITY_TABLE)) {
    return { success: false, message: "entity_type inválido. Aceites: lead, deal, contact." };
  }
  const recordId = String(args?.record_id || "");
  if (!UUID_RE.test(recordId)) return { success: false, message: "record_id inválido." };

  const assigneeRaw = args?.assignee_user_id;
  const assignee: string | null = assigneeRaw === null ? null : String(assigneeRaw || "");
  if (assignee !== null && !UUID_RE.test(assignee)) return { success: false, message: "assignee_user_id inválido." };

  // Gate de módulo
  const perm = requireWrite(ctx, ENTITY_PERM[entityType], `editar ${ENTITY_LABEL[entityType]}s`);
  if (perm) return perm;

  const table = ENTITY_TABLE[entityType];

  // Carregar registo + scope da org
  const { data: rec, error: recErr } = await supabase
    .from(table)
    .select("id, organization_id, deleted_at, assigned_to")
    .eq("id", recordId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (recErr) {
    console.error("assign_crm_record load:", recErr);
    return { success: false, message: `erro ao ler registo: ${String(recErr.message || recErr).slice(0, 200)}` };
  }
  if (!rec) return { success: false, message: `${ENTITY_LABEL[entityType]} não encontrado nesta organização.` };
  if (rec.deleted_at) return { success: false, message: `${ENTITY_LABEL[entityType]} eliminado (soft-delete).` };

  // Validar assignee quando aplicável
  if (assignee !== null) {
    const { data: u, error: uErr } = await supabase
      .from("anew_users")
      .select("status")
      .eq("id", assignee)
      .maybeSingle();
    if (uErr) {
      console.error("assign_crm_record user:", uErr);
      return { success: false, message: `erro ao validar utilizador: ${String(uErr.message || uErr).slice(0, 200)}` };
    }
    if (!u) return { success: false, message: "utilizador não existe." };
    if (u.status !== "active") return { success: false, message: "utilizador inactivo." };

    const { data: ms, error: msErr } = await supabase
      .from("anew_memberships")
      .select("user_id")
      .eq("user_id", assignee)
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (msErr) {
      console.error("assign_crm_record membership:", msErr);
      return { success: false, message: `erro ao validar membership: ${String(msErr.message || msErr).slice(0, 200)}` };
    }
    if (!ms) return { success: false, message: "utilizador não é membro activo desta organização." };
  }

  const { data: updated, error: upErr } = await supabase
    .from(table)
    .update({ assigned_to: assignee })
    .eq("id", recordId)
    .eq("organization_id", organizationId)
    .select("id, assigned_to")
    .maybeSingle();
  if (upErr) {
    console.error("assign_crm_record update:", upErr);
    return { success: false, message: `erro ao atribuir: ${String(upErr.message || upErr).slice(0, 200)}` };
  }
  if (!updated) return { success: false, message: `${ENTITY_LABEL[entityType]} não actualizado.` };

  return {
    success: true,
    entity_type: entityType,
    record_id: recordId,
    assigned_to: updated.assigned_to,
    message: assignee === null ? `${ENTITY_LABEL[entityType]} desatribuído.` : `${ENTITY_LABEL[entityType]} atribuído.`,
    link: null,
  };
};

export const handlers: Record<string, Handler> = {
  search_users,
  assign_crm_record,
};
