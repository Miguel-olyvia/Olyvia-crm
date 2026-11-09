// Âmbito (OWNED / TEAM / ORG) nas tools do assistente — auditoria Administração F6.
//
// A edge function trabalha com a service_role (sem RLS), por isso as tools só filtravam `organization_id`: um utilizador
// com âmbito «só os seus» lia e alterava registos de colegas. Este módulo aplica o âmbito com as MESMAS funções que a RLS
// usa, chamadas com o JWT do próprio utilizador (`ctx.userSupabase`), sem reescrever nenhuma regra em TypeScript:
//
//   · VER     — o registo tem de ser visível ao utilizador pela RLS de SELECT da tabela (`select id ... in (ids)` com o
//               JWT dele). É a verdade do ecrã, incluindo permissão, organização e âmbito.
//   · ALTERAR — além de o ver, o âmbito da política de UPDATE dessa tabela:
//               anew_leads/anew_clients/quotes/client_contracts → crm_scope_keys('<módulo>.edit');
//               deals → crm_scope_keys('deals.view') (é o que a política de UPDATE de deals usa);
//               proposals → criador OU crm_scope_keys('proposals.edit');
//               anew_contacts → can_access_contact_row(..., 'contacts.edit');
//               schedule_items → get_schedule_item_scope_context(org, 'scheduling.items.edit') (+ admin de sistema);
//               entidades (e-mails/telefones/moradas/etiquetas) → is_entity_contact_in_owner_scope com as chaves de
//               leads.edit / clients.edit (a política de UPDATE de anew_entity_emails).
//
// Falha fechado: sem sessão (JWT) ou com erro numa destas leituras, a tool é recusada.
// O trabalho propriamente dito continua com a service_role — só se acrescentam verificações.

import type { ExecCtx, ToolResult } from "./types.ts";

export type ScopedTable =
  | "anew_leads"
  | "anew_contacts"
  | "anew_clients"
  | "deals"
  | "quotes"
  | "proposals"
  | "client_contracts"
  | "schedule_items";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

export class ScopeError extends Error {}

function userClient(ctx: ExecCtx): any {
  if (!ctx.userSupabase) throw new ScopeError("sessão do utilizador indisponível para verificar o âmbito");
  return ctx.userSupabase;
}

const CHUNK = 150;

/** Ids (do conjunto pedido) que o utilizador vê pela RLS de SELECT da tabela. Erro → ScopeError (fecha). */
export async function rlsVisibleIds(ctx: ExecCtx, table: ScopedTable, ids: Iterable<unknown>): Promise<Set<string>> {
  const unique = Array.from(new Set(Array.from(ids).filter(isUuid)));
  const out = new Set<string>();
  if (unique.length === 0) return out;
  const sb = userClient(ctx);
  for (let i = 0; i < unique.length; i += CHUNK) {
    const part = unique.slice(i, i + CHUNK);
    const { data, error } = await sb.from(table).select("id").in("id", part);
    if (error) throw new ScopeError(`não foi possível verificar o âmbito (${table}): ${String(error.message ?? error).slice(0, 120)}`);
    for (const r of (data ?? []) as Array<{ id: string }>) if (r?.id) out.add(r.id);
  }
  return out;
}

/** Mantém só as linhas visíveis ao utilizador (pela coluna `key`, por omissão `id`). Linhas sem id válido saem. */
export async function filterVisible<T extends Record<string, any>>(
  ctx: ExecCtx,
  table: ScopedTable,
  rows: T[] | null | undefined,
  key = "id",
): Promise<T[]> {
  const list = rows ?? [];
  if (list.length === 0) return [];
  const visible = await rlsVisibleIds(ctx, table, list.map((r) => r?.[key]));
  return list.filter((r) => visible.has(r?.[key]));
}

const keysCacheSym = Symbol("crmScopeKeys");

/** crm_scope_keys(<permissão>) com o JWT do utilizador (cache por pedido). */
export async function scopeKeys(ctx: ExecCtx, permission: string): Promise<string[]> {
  const anyCtx = ctx as any;
  const cache: Map<string, string[]> = anyCtx[keysCacheSym] ?? (anyCtx[keysCacheSym] = new Map());
  const hit = cache.get(permission);
  if (hit) return hit;
  const { data, error } = await userClient(ctx).rpc("crm_scope_keys", { p_permission_code: permission });
  if (error) throw new ScopeError(`não foi possível verificar o âmbito (${permission}): ${String(error.message ?? error).slice(0, 120)}`);
  const keys = Array.isArray(data) ? (data as string[]) : [];
  cache.set(permission, keys);
  return keys;
}

type OwnerRow = { organization_id?: string | null; assigned_to?: string | null; created_by?: string | null };

/** A mesma comparação das políticas: org:* | org:assigned_to | org:created_by. */
export function rowMatchesKeys(keys: string[], row: OwnerRow): boolean {
  const org = row.organization_id;
  if (!org) return false;
  if (keys.includes(`${org}:*`)) return true;
  if (row.assigned_to && keys.includes(`${org}:${row.assigned_to}`)) return true;
  if (row.created_by && keys.includes(`${org}:${row.created_by}`)) return true;
  return false;
}

/** O utilizador tem âmbito ORG (toda a organização ativa) para esta permissão? */
export async function hasOrgWideScope(ctx: ExecCtx, permission: string): Promise<boolean> {
  if (!ctx.organizationId) return false;
  const keys = await scopeKeys(ctx, permission);
  return keys.includes(`${ctx.organizationId}:*`);
}

function fora(label: string): ToolResult {
  return { success: false, code: "forbidden", message: `${label} não encontrado ou fora do teu âmbito.` };
}

/** VER: o registo tem de ser visível pela RLS. Devolve null se pode, ou o ToolResult de recusa. */
export async function guardView(ctx: ExecCtx, table: ScopedTable, id: unknown, label: string): Promise<ToolResult | null> {
  if (!isUuid(id)) return null; // o handler valida o formato e responde ele próprio
  const visible = await rlsVisibleIds(ctx, table, [id]);
  return visible.has(id) ? null : fora(label);
}

const EDIT_KEYS: Partial<Record<ScopedTable, string>> = {
  anew_leads: "leads.edit",
  anew_clients: "clients.edit",
  quotes: "quotes.edit",
  client_contracts: "client_contracts.edit",
  deals: "deals.view", // política "Users can update deals in their org"
};

/** ALTERAR: visível (RLS SELECT) e dentro do âmbito da política de UPDATE da tabela. */
export async function guardEdit(ctx: ExecCtx, table: ScopedTable, id: unknown, label: string): Promise<ToolResult | null> {
  if (!isUuid(id)) return null;
  const denyView = await guardView(ctx, table, id, label);
  if (denyView) return denyView;

  const cols = table === "schedule_items"
    ? "id, organization_id, created_by, user_id"
    : "id, organization_id, assigned_to, created_by";
  const { data: row, error } = await ctx.supabase.from(table).select(cols).eq("id", id).maybeSingle();
  if (error) throw new ScopeError(`não foi possível verificar o âmbito (${table}): ${String(error.message ?? error).slice(0, 120)}`);
  if (!row) return fora(label);

  const keyPerm = EDIT_KEYS[table];
  if (keyPerm) {
    return rowMatchesKeys(await scopeKeys(ctx, keyPerm), row) ? null : semAmbitoEditar(label);
  }
  if (table === "proposals") {
    if (row.created_by && ctx.businessUserId && row.created_by === ctx.businessUserId) return null;
    return rowMatchesKeys(await scopeKeys(ctx, "proposals.edit"), row) ? null : semAmbitoEditar(label);
  }
  if (table === "anew_contacts") {
    const { data: ok, error: e } = await userClient(ctx).rpc("can_access_contact_row", {
      p_org_id: row.organization_id,
      p_created_by: row.created_by ?? null,
      p_assigned_to: row.assigned_to ?? null,
      p_permission_code: "contacts.edit",
    });
    if (e) throw new ScopeError(`não foi possível verificar o âmbito (contactos): ${String(e.message ?? e).slice(0, 120)}`);
    return ok === true ? null : semAmbitoEditar(label);
  }
  if (table === "schedule_items") {
    if (ctx.isSystemAdmin) return null; // política "System admins org access items" (organização visível: já filtrada)
    const { data: sc, error: e } = await userClient(ctx).rpc("get_schedule_item_scope_context", {
      p_org_id: row.organization_id,
      p_permission_code: "scheduling.items.edit",
    });
    if (e) throw new ScopeError(`não foi possível verificar o âmbito (agenda): ${String(e.message ?? e).slice(0, 120)}`);
    const c = Array.isArray(sc) ? sc[0] : sc;
    if (!c) return semAmbitoEditar(label);
    if (c.applied_scope === "ORG") return null;
    const owners: string[] = Array.isArray(c.owner_ids) ? c.owner_ids : [];
    if ((row.created_by && owners.includes(row.created_by)) || (row.user_id && owners.includes(row.user_id))) return null;
    if (owners.length === 0) return semAmbitoEditar(label);
    const { data: viaAssignee, error: e2 } = await userClient(ctx).rpc("schedule_item_assigned_to_owners", {
      p_item_id: id,
      p_owner_ids: owners,
    });
    if (e2) throw new ScopeError(`não foi possível verificar o âmbito (agenda): ${String(e2.message ?? e2).slice(0, 120)}`);
    return viaAssignee === true ? null : semAmbitoEditar(label);
  }
  return semAmbitoEditar(label);
}

function semAmbitoEditar(label: string): ToolResult {
  return { success: false, code: "forbidden", message: `Não tens âmbito para alterar este ${label}.` };
}

async function entityOwnerScope(ctx: ExecCtx, entityId: string, leadPerm: string, clientPerm: string): Promise<boolean> {
  const [leadKeys, clientKeys] = await Promise.all([scopeKeys(ctx, leadPerm), scopeKeys(ctx, clientPerm)]);
  const { data, error } = await userClient(ctx).rpc("is_entity_contact_in_owner_scope", {
    _entity_id: entityId,
    _lead_scope_keys: leadKeys,
    _client_scope_keys: clientKeys,
  });
  if (error) throw new ScopeError(`não foi possível verificar o âmbito (entidade): ${String(error.message ?? error).slice(0, 120)}`);
  return data === true;
}

/**
 * Entidade (e-mails, telefones, moradas, etiquetas): as políticas de anew_entity_emails.
 *   view   → SELECT: is_entity_contact_in_owner_scope(leads.view, clients.view)
 *   insert → INSERT: is_entity_in_user_scope(entidade, uid)
 *   edit   → UPDATE: is_entity_contact_in_owner_scope(leads.edit, clients.edit)
 *   delete → DELETE: (leads.delete, clients.delete) OU (leads.edit, clients.edit)
 */
export async function guardEntity(
  ctx: ExecCtx,
  entityId: unknown,
  mode: "view" | "insert" | "edit" | "delete",
): Promise<ToolResult | null> {
  if (!isUuid(entityId)) return null;
  let ok = false;
  if (mode === "view") {
    ok = await entityOwnerScope(ctx, entityId, "leads.view", "clients.view");
  } else if (mode === "insert") {
    const { data, error } = await userClient(ctx).rpc("is_entity_in_user_scope", {
      _entity_id: entityId,
      _auth_uid: ctx.authUid,
    });
    if (error) throw new ScopeError(`não foi possível verificar o âmbito (entidade): ${String(error.message ?? error).slice(0, 120)}`);
    ok = data === true;
  } else if (mode === "edit") {
    ok = await entityOwnerScope(ctx, entityId, "leads.edit", "clients.edit");
  } else {
    ok = (await entityOwnerScope(ctx, entityId, "leads.delete", "clients.delete")) ||
      (await entityOwnerScope(ctx, entityId, "leads.edit", "clients.edit"));
  }
  if (ok) return null;
  return mode === "view"
    ? fora("Entidade")
    : { success: false, code: "forbidden", message: "Não tens âmbito para alterar esta entidade." };
}

/**
 * Atividades (entity_interactions) de uma entidade: o utilizador tem de ver (RLS) pelo menos um dos registos
 * ativos dessa entidade na organização — lead, contacto, cliente ou PP. É o papel em que a tool já se apoia.
 */
export async function guardEntityFacetsVisible(ctx: ExecCtx, entityId: unknown): Promise<ToolResult | null> {
  if (!isUuid(entityId) || !ctx.organizationId) return null;
  const tables: ScopedTable[] = ["anew_leads", "anew_contacts", "anew_clients", "deals"];
  for (const t of tables) {
    const { data, error } = await ctx.supabase
      .from(t)
      .select("id")
      .eq("entity_id", entityId)
      .eq("organization_id", ctx.organizationId)
      .is("deleted_at", null)
      .limit(50);
    if (error) throw new ScopeError(`não foi possível verificar o âmbito (${t}): ${String(error.message ?? error).slice(0, 120)}`);
    const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (ids.length && (await rlsVisibleIds(ctx, t, ids)).size > 0) return null;
  }
  return fora("Entidade");
}

/** Janela a ler antes de filtrar por âmbito, para que um `limit` pequeno ainda mostre registos visíveis. */
export function scopeWindow(limit: unknown): number {
  const n = Number(limit) || 10;
  return Math.min(Math.max(n * 5, 50), 500);
}
