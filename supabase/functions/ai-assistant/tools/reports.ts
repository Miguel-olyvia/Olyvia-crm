// Reports tools — Fase 3.
// Reads only. Aggregation done in TypeScript (no PostgREST aggregates).
// Hard cap of 10 000 base rows per source; returns `truncated: true` if hit.

import type { Handler, ToolDef, ToolResult } from "../shared/types.ts";
import { can } from "../shared/authz.ts";

const ROW_CAP = 10000;
const BATCH = 200;

// ---------- helpers ----------

function defaultRange(args: any): { from: string; to: string } {
  const to = args?.date_to ? new Date(args.date_to) : new Date();
  const from = args?.date_from ? new Date(args.date_from) : new Date(to.getTime() - 30 * 86400000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function monthStartIso(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function chunk<T>(arr: T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function resolveUserNames(supabase: any, ids: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (!ids.length) return map;
  for (const part of chunk(ids)) {
    const { data } = await supabase.from("anew_users").select("id, name").in("id", part);
    (data || []).forEach((u: any) => { map[u.id] = u.name; });
  }
  return map;
}

async function resolveClientNames(supabase: any, clientIds: string[]): Promise<Record<string, string | null>> {
  const map: Record<string, string | null> = {};
  if (!clientIds.length) return map;
  const entityByClient: Record<string, string | null> = {};
  for (const part of chunk(clientIds)) {
    const { data } = await supabase.from("anew_clients").select("id, entity_id").in("id", part);
    (data || []).forEach((c: any) => { entityByClient[c.id] = c.entity_id ?? null; });
  }
  const entityIds = [...new Set(Object.values(entityByClient).filter(Boolean) as string[])];
  const nameByEntity: Record<string, string | null> = {};
  for (const part of chunk(entityIds)) {
    const { data } = await supabase.from("anew_entities").select("id, display_name").in("id", part);
    (data || []).forEach((e: any) => { nameByEntity[e.id] = e.display_name ?? null; });
  }
  for (const cid of clientIds) {
    const eid = entityByClient[cid];
    map[cid] = eid ? (nameByEntity[eid] ?? null) : null;
  }
  return map;
}

// ===================================================================
// get_stats — backwards-compatible
// ===================================================================

export const getStatsDef: ToolDef = {
  type: "function",
  function: {
    name: "get_stats",
    description: "Estatísticas do mês corrente (leads, deals, proposals, quotes). Aceita date_from/date_to opcionais; sem args mantém contrato antigo. Inclui também data.dashboard com o JSON da RPC get_lead_dashboard_stats.",
    parameters: {
      type: "object",
      properties: {
        date_from: { type: "string", description: "ISO datetime (opcional)" },
        date_to: { type: "string", description: "ISO datetime (opcional)" },
      },
    },
  },
};

const getStats: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };

  const hasRange = !!(args?.date_from || args?.date_to);
  const startIso = args?.date_from ?? monthStartIso();
  const endIso = args?.date_to ?? null;

  const filterRange = (q: any) => {
    q = q.gte("created_at", startIso);
    if (endIso) q = q.lte("created_at", endIso);
    return q;
  };

  const [leads, deals, proposals, quotes] = await Promise.all([
    filterRange(supabase.from("anew_leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)),
    filterRange(supabase.from("deals").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)),
    filterRange(supabase.from("proposals").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)),
    filterRange(supabase.from("quotes").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)),
  ]);

  let dashboard: any = null;
  try {
    const { data, error } = await supabase.rpc("get_lead_dashboard_stats", {
      p_org_id: organizationId,
      p_date_from: args?.date_from ?? null,
      p_date_to: args?.date_to ?? null,
    });
    if (!error) dashboard = data;
  } catch (_e) {
    dashboard = null;
  }

  return {
    success: true,
    message: hasRange ? "Stats do período." : "Stats do mês.",
    data: {
      leads: leads.count || 0,
      deals: deals.count || 0,
      proposals: proposals.count || 0,
      quotes: quotes.count || 0,
      dashboard,
    },
  };
};

// ===================================================================
// get_pipeline_report
// ===================================================================

export const getPipelineReportDef: ToolDef = {
  type: "function",
  function: {
    name: "get_pipeline_report",
    description: "Distribuição por stage do pipeline (count e total) para deals ou proposals. quotes não suportado (sem stage_id no schema). Default: últimos 30 dias.",
    parameters: {
      type: "object",
      properties: {
        pipeline: { type: "string", enum: ["deals", "proposals"], description: "Default: deals" },
        date_from: { type: "string" },
        date_to: { type: "string" },
      },
    },
  },
};

const getPipelineReport: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };

  const pipeline = args?.pipeline ?? "deals";
  if (pipeline === "quotes") {
    return { success: false, message: "quotes não tem pipeline por stage no schema; usa get_top_clients ou get_overdue_items." };
  }
  if (pipeline !== "deals" && pipeline !== "proposals") {
    return { success: false, message: `pipeline desconhecido: ${pipeline}` };
  }

  const { from, to } = defaultRange(args);

  if (pipeline === "deals") {
    const { data: rows, error } = await supabase
      .from("deals")
      .select("id, stage_id, value")
      .eq("organization_id", organizationId)
      .gte("created_at", from).lte("created_at", to)
      .is("deleted_at", null)
      .limit(ROW_CAP);
    if (error) return { success: false, message: error.message };

    const { data: stages } = await supabase
      .from("deal_stages")
      .select("id, name, order_index, is_won, is_lost");

    const stageMap: Record<string, any> = {};
    (stages || []).forEach((s: any) => { stageMap[s.id] = s; });

    const agg: Record<string, { stage_id: string; stage_name: string; order_index: number; count: number; total: number }> = {};
    for (const r of (rows || [])) {
      const sid = r.stage_id || "__none__";
      const st = stageMap[sid] || { name: "(sem stage)", order_index: 9999 };
      if (!agg[sid]) agg[sid] = { stage_id: sid, stage_name: st.name, order_index: st.order_index ?? 9999, count: 0, total: 0 };
      agg[sid].count += 1;
      agg[sid].total += Number(r.value || 0);
    }
    const out = Object.values(agg).sort((a, b) => a.order_index - b.order_index);
    return {
      success: true,
      message: `Pipeline deals: ${out.length} stage(s).`,
      data: out,
      truncated: (rows?.length || 0) >= ROW_CAP,
      ...((rows?.length || 0) >= ROW_CAP ? { note: "limite de 10000 linhas atingido; agregado pode estar incompleto" } : {}),
    };
  }

  // proposals
  const { data: rows, error } = await supabase
    .from("proposals")
    .select("id, stage_id, value, is_deleted, deleted_at")
    .eq("organization_id", organizationId)
    .gte("created_at", from).lte("created_at", to)
    .is("deleted_at", null)
    .or("is_deleted.is.null,is_deleted.eq.false")
    .limit(ROW_CAP);
  if (error) return { success: false, message: error.message };

  const { data: stages } = await supabase
    .from("proposal_workflow_stages")
    .select("id, name, stage_order")
    .eq("organization_id", organizationId);

  const stageMap: Record<string, any> = {};
  (stages || []).forEach((s: any) => { stageMap[s.id] = s; });

  const agg: Record<string, { stage_id: string; stage_name: string; stage_order: number; count: number; total: number }> = {};
  for (const r of (rows || [])) {
    const sid = r.stage_id || "__none__";
    const st = stageMap[sid] || { name: "(sem stage)", stage_order: 9999 };
    if (!agg[sid]) agg[sid] = { stage_id: sid, stage_name: st.name, stage_order: st.stage_order ?? 9999, count: 0, total: 0 };
    agg[sid].count += 1;
    agg[sid].total += Number(r.value || 0);
  }
  const out = Object.values(agg).sort((a, b) => a.stage_order - b.stage_order);
  return {
    success: true,
    message: `Pipeline proposals: ${out.length} stage(s).`,
    data: out,
    truncated: (rows?.length || 0) >= ROW_CAP,
    ...((rows?.length || 0) >= ROW_CAP ? { note: "limite de 10000 linhas atingido; agregado pode estar incompleto" } : {}),
  };
};

// ===================================================================
// get_overdue_items
// ===================================================================

export const getOverdueItemsDef: ToolDef = {
  type: "function",
  function: {
    name: "get_overdue_items",
    description: "Items em atraso. Critério por entidade: schedule_items=start_datetime<now & status not in (completed,cancelled,rescheduled); deals=expected_close_date<hoje & closed_at null; proposals=valid_until<hoje & ainda não aceite/rejeitada; quotes=estado rascunho/enviado & criado há ≥30 dias.",
    parameters: {
      type: "object",
      properties: {
        entity: { type: "string", enum: ["deals", "proposals", "quotes", "schedule_items"] },
        limit: { type: "number", description: "default 20, máx 50" },
      },
      required: ["entity"],
    },
  },
};

const getOverdueItems: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const entity = args?.entity;
  if (!entity) return { success: false, message: "entity é obrigatório." };
  const limit = Math.min(Math.max(Number(args?.limit) || 20, 1), 50);
  const nowIso = new Date().toISOString();
  const todayIso = new Date().toISOString().slice(0, 10);

  if (entity === "schedule_items") {
    const { data, error } = await supabase
      .from("schedule_items")
      .select("id, title, start_datetime, status, user_id")
      .eq("organization_id", organizationId)
      .lt("start_datetime", nowIso)
      .not("status", "in", "(completed,cancelled,rescheduled)")
      .order("start_datetime", { ascending: true })
      .limit(limit);
    if (error) return { success: false, message: error.message };
    return { success: true, message: `${data?.length || 0} schedule item(s) em atraso.`, data: data || [] };
  }

  if (entity === "deals") {
    const { data, error } = await supabase
      .from("deals")
      .select("id, title, value, expected_close_date, assigned_to")
      .eq("organization_id", organizationId)
      .lt("expected_close_date", todayIso)
      .is("closed_at", null)
      .is("deleted_at", null)
      .order("expected_close_date", { ascending: true })
      .limit(limit);
    if (error) return { success: false, message: error.message };
    return { success: true, message: `${data?.length || 0} deal(s) em atraso.`, data: data || [] };
  }

  if (entity === "proposals") {
    const { data, error } = await supabase
      .from("proposals")
      .select("id, title, value, valid_until, status, assigned_to")
      .eq("organization_id", organizationId)
      .lt("valid_until", todayIso)
      .is("accepted_at", null)
      .is("rejected_at", null)
      .is("deleted_at", null)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .order("valid_until", { ascending: true })
      .limit(limit);
    if (error) return { success: false, message: error.message };
    return { success: true, message: `${data?.length || 0} proposal(s) em atraso.`, data: data || [] };
  }

  if (entity === "quotes") {
    const cutoffIso = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data, error } = await supabase
      .from("quotes")
      .select("id, title, total, estado, assigned_to, created_at")
      .eq("organization_id", organizationId)
      .in("estado", ["rascunho", "enviado"])
      .lt("created_at", cutoffIso)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) return { success: false, message: error.message };
    return { success: true, message: `${data?.length || 0} quote(s) ≥30 dias sem fechar.`, data: data || [] };
  }

  return { success: false, message: `entity desconhecida: ${entity}` };
};

// ===================================================================
// get_top_clients
// ===================================================================

export const getTopClientsDef: ToolDef = {
  type: "function",
  function: {
    name: "get_top_clients",
    description: "Top clientes por volume (count e total) em deals, quotes ou proposals. Default últimos 30 dias.",
    parameters: {
      type: "object",
      properties: {
        metric: { type: "string", enum: ["deals", "quotes", "proposals"], description: "Default: deals" },
        date_from: { type: "string" },
        date_to: { type: "string" },
        limit: { type: "number", description: "default 10, máx 20" },
      },
    },
  },
};

const getTopClients: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const metric = args?.metric ?? "deals";
  const limit = Math.min(Math.max(Number(args?.limit) || 10, 1), 20);
  const { from, to } = defaultRange(args);

  let rows: any[] = [];
  let clientCol: "client_id" | "cliente_id" = "client_id";
  let valueCol: "value" | "total" = "value";

  if (metric === "deals") {
    const { data, error } = await supabase
      .from("deals")
      .select("client_id, value")
      .eq("organization_id", organizationId)
      .gte("created_at", from).lte("created_at", to)
      .is("deleted_at", null)
      .not("client_id", "is", null)
      .limit(ROW_CAP);
    if (error) return { success: false, message: error.message };
    rows = data || [];
  } else if (metric === "proposals") {
    const { data, error } = await supabase
      .from("proposals")
      .select("client_id, value")
      .eq("organization_id", organizationId)
      .gte("created_at", from).lte("created_at", to)
      .is("deleted_at", null)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .not("client_id", "is", null)
      .limit(ROW_CAP);
    if (error) return { success: false, message: error.message };
    rows = data || [];
  } else if (metric === "quotes") {
    clientCol = "cliente_id";
    valueCol = "total";
    const { data, error } = await supabase
      .from("quotes")
      .select("cliente_id, total")
      .eq("organization_id", organizationId)
      .gte("created_at", from).lte("created_at", to)
      .is("deleted_at", null)
      .not("cliente_id", "is", null)
      .limit(ROW_CAP);
    if (error) return { success: false, message: error.message };
    rows = data || [];
  } else {
    return { success: false, message: `metric desconhecida: ${metric}` };
  }

  const agg: Record<string, { client_id: string; items: number; total: number }> = {};
  for (const r of rows) {
    const cid = r[clientCol];
    if (!cid) continue;
    if (!agg[cid]) agg[cid] = { client_id: cid, items: 0, total: 0 };
    agg[cid].items += 1;
    agg[cid].total += Number(r[valueCol] || 0);
  }
  const ranked = Object.values(agg).sort((a, b) => b.total - a.total).slice(0, limit);
  const nameMap = await resolveClientNames(supabase, ranked.map((r) => r.client_id));
  const out = ranked.map((r) => ({ ...r, display_name: nameMap[r.client_id] ?? null }));

  return {
    success: true,
    message: `Top ${out.length} cliente(s) por ${metric}.`,
    data: out,
    truncated: rows.length >= ROW_CAP,
    ...(rows.length >= ROW_CAP ? { note: "limite de 10000 linhas atingido; agregado pode estar incompleto" } : {}),
  };
};

// ===================================================================
// get_team_performance
// ===================================================================

export const getTeamPerformanceDef: ToolDef = {
  type: "function",
  function: {
    name: "get_team_performance",
    description: "Performance por membro: contagens de leads, deals, quotes e proposals criados no período. Default últimos 30 dias. Inclui só membros activos da organização.",
    parameters: {
      type: "object",
      properties: {
        date_from: { type: "string" },
        date_to: { type: "string" },
        limit: { type: "number", description: "default 20, máx 50" },
      },
    },
  },
};

const getTeamPerformance: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const limit = Math.min(Math.max(Number(args?.limit) || 20, 1), 50);
  const { from, to } = defaultRange(args);

  const [{ data: leads }, { data: deals }, { data: quotes }, { data: proposals }, { data: members }] = await Promise.all([
    supabase.from("anew_leads").select("assigned_to")
      .eq("organization_id", organizationId).gte("created_at", from).lte("created_at", to)
      .is("deleted_at", null).not("assigned_to", "is", null).limit(ROW_CAP),
    supabase.from("deals").select("assigned_to")
      .eq("organization_id", organizationId).gte("created_at", from).lte("created_at", to)
      .is("deleted_at", null).not("assigned_to", "is", null).limit(ROW_CAP),
    supabase.from("quotes").select("assigned_to")
      .eq("organization_id", organizationId).gte("created_at", from).lte("created_at", to)
      .is("deleted_at", null).not("assigned_to", "is", null).limit(ROW_CAP),
    supabase.from("proposals").select("assigned_to, is_deleted, deleted_at")
      .eq("organization_id", organizationId).gte("created_at", from).lte("created_at", to)
      .is("deleted_at", null).or("is_deleted.is.null,is_deleted.eq.false")
      .not("assigned_to", "is", null).limit(ROW_CAP),
    supabase.from("anew_memberships").select("user_id")
      .eq("organization_id", organizationId).eq("status", "active"),
  ]);

  const activeSet = new Set((members || []).map((m: any) => m.user_id));
  const agg: Record<string, { user_id: string; leads: number; deals: number; quotes: number; proposals: number; total: number }> = {};
  const bump = (uid: string, key: "leads" | "deals" | "quotes" | "proposals") => {
    if (!activeSet.has(uid)) return;
    if (!agg[uid]) agg[uid] = { user_id: uid, leads: 0, deals: 0, quotes: 0, proposals: 0, total: 0 };
    agg[uid][key] += 1;
    agg[uid].total += 1;
  };
  (leads || []).forEach((r: any) => bump(r.assigned_to, "leads"));
  (deals || []).forEach((r: any) => bump(r.assigned_to, "deals"));
  (quotes || []).forEach((r: any) => bump(r.assigned_to, "quotes"));
  (proposals || []).forEach((r: any) => bump(r.assigned_to, "proposals"));

  const ranked = Object.values(agg).sort((a, b) => b.total - a.total).slice(0, limit);
  const nameMap = await resolveUserNames(supabase, ranked.map((r) => r.user_id));
  const out = ranked.map((r) => ({ ...r, name: nameMap[r.user_id] ?? null }));

  const truncated = [leads, deals, quotes, proposals].some((arr) => (arr?.length || 0) >= ROW_CAP);
  return {
    success: true,
    message: `Performance de ${out.length} membro(s).`,
    data: out,
    truncated,
    ...(truncated ? { note: "limite de 10000 linhas atingido em pelo menos uma fonte; agregado pode estar incompleto" } : {}),
  };
};

// ===================================================================
// get_leads_report — P3
// ===================================================================

export const getLeadsReportDef: ToolDef = {
  type: "function",
  function: {
    name: "get_leads_report",
    description: "Relatório agregado de leads da org: totais (total, converted, lost, rejected, open, conversion_rate, avg_days_to_convert, unassigned_count) e breakdowns por status, source e owner. Default últimos 30 dias. Requer permissão leads.view.",
    parameters: {
      type: "object",
      properties: {
        date_from: { type: "string", description: "ISO datetime (opcional)" },
        date_to: { type: "string", description: "ISO datetime (opcional)" },
        limit: { type: "number", description: "Top-N em by_source/by_owner. Default 10, máx 50." },
      },
    },
  },
};

const getLeadsReport: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!can(ctx, "leads.view")) return { success: false, message: "Sem permissão para ler leads (leads.view)." };

  const limit = Math.min(Math.max(Number(args?.limit) || 10, 1), 50);
  const { from, to } = defaultRange(args);

  const { data: rows, error } = await supabase
    .from("anew_leads")
    .select("id,status,source,source_id,assigned_to,created_at,converted_at")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .gte("created_at", from).lte("created_at", to)
    .limit(ROW_CAP);
  if (error) return { success: false, message: error.message };

  const leads = rows || [];
  const truncated = leads.length >= ROW_CAP;

  // Resolve names — users (assigned_to) + lead_sources (source_id)
  const userIds = [...new Set(leads.map((l: any) => l.assigned_to).filter(Boolean))] as string[];
  const sourceIds = [...new Set(leads.map((l: any) => l.source_id).filter(Boolean))] as string[];

  const nameByUserId = await resolveUserNames(supabase, userIds);

  let nameBySourceId: Record<string, string> = {};
  try {
    for (const part of chunk(sourceIds)) {
      const { data, error: srcErr } = await supabase
        .from("lead_sources").select("id,name").in("id", part);
      if (srcErr) throw srcErr;
      (data || []).forEach((s: any) => { nameBySourceId[s.id] = s.name; });
    }
  } catch (e) {
    console.warn("[get_leads_report] lead_sources name lookup failed; falling back to textual source.", e);
    nameBySourceId = {};
  }

  // Single-pass aggregation
  const statusMap = new Map<string, number>();
  const sourceBuckets = new Map<string, { source_id: string | null; source_label: string; count: number; converted: number }>();
  const ownerBuckets = new Map<string, { user_id: string; count: number; converted: number }>();

  let converted = 0;
  let lost = 0;
  let rejected = 0;
  let unassigned = 0;
  let convertSum = 0;
  let convertN = 0;

  for (const l of leads as any[]) {
    const status = l.status ?? "(sem status)";
    statusMap.set(status, (statusMap.get(status) || 0) + 1);

    const isConverted = status === "converted";
    if (isConverted) converted++;
    if (status === "lost") lost++;
    if (status === "rejected") rejected++;

    if (isConverted && l.converted_at && l.created_at) {
      const days = (new Date(l.converted_at).getTime() - new Date(l.created_at).getTime()) / 86400000;
      if (Number.isFinite(days) && days >= 0) { convertSum += days; convertN++; }
    }

    // by_source
    let key: string;
    let sId: string | null = null;
    let label: string;
    if (l.source_id) {
      sId = l.source_id;
      key = l.source_id;
      label = nameBySourceId[l.source_id] ?? (l.source || "(sem origem)");
    } else if (l.source) {
      key = "text:" + l.source;
      label = l.source;
    } else {
      key = "none";
      label = "(sem origem)";
    }
    let sb = sourceBuckets.get(key);
    if (!sb) { sb = { source_id: sId, source_label: label, count: 0, converted: 0 }; sourceBuckets.set(key, sb); }
    sb.count++;
    if (isConverted) sb.converted++;

    // by_owner
    if (!l.assigned_to) {
      unassigned++;
    } else {
      let ob = ownerBuckets.get(l.assigned_to);
      if (!ob) { ob = { user_id: l.assigned_to, count: 0, converted: 0 }; ownerBuckets.set(l.assigned_to, ob); }
      ob.count++;
      if (isConverted) ob.converted++;
    }
  }

  const total = leads.length;
  const open = Math.max(0, total - converted - lost - rejected);

  const by_status = [...statusMap.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  const by_source = [...sourceBuckets.values()]
    .map((b) => ({
      source_id: b.source_id,
      source_label: b.source_label,
      count: b.count,
      converted: b.converted,
      conversion_rate: b.count > 0 ? b.converted / b.count : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  const by_owner = [...ownerBuckets.values()]
    .map((b) => ({
      user_id: b.user_id,
      name: nameByUserId[b.user_id] ?? null,
      count: b.count,
      converted: b.converted,
      conversion_rate: b.count > 0 ? b.converted / b.count : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return {
    success: true,
    message: `Relatório de ${total} lead(s) entre ${from} e ${to}.`,
    data: {
      range: { from, to },
      totals: {
        total,
        converted,
        lost,
        rejected,
        open,
        conversion_rate: total > 0 ? converted / total : 0,
        avg_days_to_convert: convertN > 0 ? convertSum / convertN : null,
        unassigned_count: unassigned,
      },
      by_status,
      by_source,
      by_owner,
    },
    truncated,
    ...(truncated ? { note: "limite de 10000 linhas atingido; agregado pode estar incompleto" } : {}),
  };
};

// ===================================================================
// exports
// ===================================================================

export const handlers: Record<string, Handler> = {
  get_stats: getStats,
  get_pipeline_report: getPipelineReport,
  get_overdue_items: getOverdueItems,
  get_top_clients: getTopClients,
  get_team_performance: getTeamPerformance,
  get_leads_report: getLeadsReport,
};
