// Workflow tools — Fase 5.
// Owns: list_workflow_rules, list_workflow_logs, execute_workflow.
//
// Gates:
//  - list_workflow_rules: nenhum app-gate; RLS de workflow_automation_rules já
//    filtra por organization_id ∈ visibleOrgIds OR organization_id IS NULL.
//  - list_workflow_logs: workflow_execution_log NÃO tem organization_id (policy
//    é USING(true)) — segurança é via rule_id IN visibleRuleIds calculado aqui.
//  - execute_workflow: <modulo>.edit do source_entity (lead/deal/quote/proposal)
//    + Fase 2 entity-role check defensivo quando o registo tem entity_id.
//
// Nota: a edge function execute-workflow recebe o id do registo num campo
// chamado entity_id por motivos históricos; aqui o input público é record_id e
// a tradução é feita no momento do invoke.

import { can } from "../shared/authz.ts";
import { resolveEntityRolesInOrg } from "./activities.ts";
import type { ExecCtx, Handler, ToolDef, ToolResult } from "../shared/types.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SOURCE_ENTITIES = ["lead", "deal", "quote", "proposal"] as const;
type SourceEntity = typeof SOURCE_ENTITIES[number];

const LOG_STATUSES = ["pending", "success", "error"] as const;

const QUOTE_ESTADOS = ["rascunho", "enviado", "aceite", "finalizado", "perdido"] as const;

const RECORD_TABLE: Record<SourceEntity, string> = {
  lead: "anew_leads",
  deal: "deals",
  quote: "quotes",
  proposal: "proposals",
};

const MODULE_PERM: Record<SourceEntity, string> = {
  lead: "leads.edit",
  deal: "deals.edit",
  quote: "quotes.edit",
  proposal: "proposals.edit",
};

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

// Resolve rules visíveis (org + globais) aplicando filtros opcionais em ambas
// as queries. Sem .or() — duas queries paralelas e merge no handler.
async function fetchVisibleRules(
  supabase: any,
  organizationId: string,
  filters: { is_active?: boolean; source_entity?: string; trigger_type?: string },
  columns: string,
): Promise<any[]> {
  const applyFilters = (q: any) => {
    if (filters.is_active !== undefined) q = q.eq("is_active", filters.is_active);
    if (filters.source_entity) q = q.eq("source_entity", filters.source_entity);
    if (filters.trigger_type) q = q.eq("trigger_type", filters.trigger_type);
    return q;
  };

  const [orgRes, globalRes] = await Promise.all([
    applyFilters(supabase.from("workflow_automation_rules").select(columns).eq("organization_id", organizationId)),
    applyFilters(supabase.from("workflow_automation_rules").select(columns).is("organization_id", null)),
  ]);

  if (orgRes.error) throw orgRes.error;
  if (globalRes.error) throw globalRes.error;

  const seen = new Set<string>();
  const merged: any[] = [];
  for (const row of [...(orgRes.data || []), ...(globalRes.data || [])]) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      merged.push(row);
    }
  }
  return merged;
}

// ===== list_workflow_rules =====

export const listWorkflowRulesDef: ToolDef = {
  type: "function",
  function: {
    name: "list_workflow_rules",
    description: "Lista regras de automação visíveis (da org + globais). Visibilidade controlada pela RLS.",
    parameters: {
      type: "object",
      properties: {
        is_active: { type: "boolean" },
        source_entity: { type: "string", enum: [...SOURCE_ENTITIES] },
        trigger_type: { type: "string" },
        limit: { type: "number", description: "1-25, default 10" },
      },
    },
  },
};

const listWorkflowRules: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };

  let limit = 10;
  if (args?.limit !== undefined) {
    const n = Number(args.limit);
    if (!Number.isInteger(n) || n < 1 || n > 25) return { success: false, message: "limit inválido (1-25)." };
    limit = n;
  }
  if (args?.source_entity !== undefined && !SOURCE_ENTITIES.includes(args.source_entity)) {
    return { success: false, message: `source_entity inválido. Aceites: ${SOURCE_ENTITIES.join(", ")}.` };
  }

  try {
    const rows = await fetchVisibleRules(
      supabase,
      organizationId,
      { is_active: args?.is_active, source_entity: args?.source_entity, trigger_type: args?.trigger_type },
      "id, name, description, is_active, source_entity, trigger_type, target_entity, action_type, execution_order, organization_id",
    );
    rows.sort((a, b) => (a.execution_order ?? 0) - (b.execution_order ?? 0));
    const items = rows.slice(0, limit);
    return { success: true, message: `${items.length} regra(s).`, data: items };
  } catch (e: any) {
    console.error("list_workflow_rules failed", e?.message);
    return { success: false, message: `Não foi possível listar regras: ${String(e?.message || e).slice(0, 160)}` };
  }
};

// ===== list_workflow_logs =====

export const listWorkflowLogsDef: ToolDef = {
  type: "function",
  function: {
    name: "list_workflow_logs",
    description: "Lista execuções recentes de workflows. Filtra apenas pelas regras visíveis ao utilizador.",
    parameters: {
      type: "object",
      properties: {
        rule_id: { type: "string" },
        source_entity: { type: "string", enum: [...SOURCE_ENTITIES] },
        source_record_id: { type: "string" },
        status: { type: "string", enum: [...LOG_STATUSES] },
        limit: { type: "number", description: "1-25, default 10" },
      },
    },
  },
};

const listWorkflowLogs: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };

  let limit = 10;
  if (args?.limit !== undefined) {
    const n = Number(args.limit);
    if (!Number.isInteger(n) || n < 1 || n > 25) return { success: false, message: "limit inválido (1-25)." };
    limit = n;
  }
  if (args?.rule_id !== undefined && !UUID_RE.test(String(args.rule_id))) {
    return { success: false, message: "rule_id inválido." };
  }
  if (args?.source_record_id !== undefined && !UUID_RE.test(String(args.source_record_id))) {
    return { success: false, message: "source_record_id inválido." };
  }
  if (args?.source_entity !== undefined && !SOURCE_ENTITIES.includes(args.source_entity)) {
    return { success: false, message: `source_entity inválido. Aceites: ${SOURCE_ENTITIES.join(", ")}.` };
  }
  if (args?.status !== undefined && !LOG_STATUSES.includes(args.status)) {
    return { success: false, message: `status inválido. Aceites: ${LOG_STATUSES.join(", ")}.` };
  }

  try {
    const visibleRules = await fetchVisibleRules(supabase, organizationId, {}, "id");
    const visibleRuleIds = visibleRules.map((r: any) => r.id);
    if (visibleRuleIds.length === 0) {
      return { success: true, message: "0 execuções.", data: [] };
    }
    if (args?.rule_id && !visibleRuleIds.includes(String(args.rule_id))) {
      return { success: true, message: "0 execuções.", data: [] };
    }

    let q = supabase
      .from("workflow_execution_log")
      .select("id, rule_id, source_entity, source_record_id, target_entity, target_record_id, action_type, status, error_message, executed_at, executed_by")
      .in("rule_id", args?.rule_id ? [args.rule_id] : visibleRuleIds)
      .order("executed_at", { ascending: false })
      .limit(limit);
    if (args?.source_entity) q = q.eq("source_entity", args.source_entity);
    if (args?.source_record_id) q = q.eq("source_record_id", args.source_record_id);
    if (args?.status) q = q.eq("status", args.status);

    const { data: logs, error } = await q;
    if (error) {
      console.error("list_workflow_logs failed", error.message);
      return { success: false, message: `Não foi possível listar execuções: ${String(error.message).slice(0, 160)}` };
    }
    const rows = logs || [];

    // Enriquecer rule_name em memória (sem JOIN sintético).
    const ruleIds = Array.from(new Set(rows.map((r: any) => r.rule_id).filter(Boolean)));
    const nameMap = new Map<string, string>();
    if (ruleIds.length > 0) {
      const { data: nameRows } = await supabase
        .from("workflow_automation_rules")
        .select("id, name")
        .in("id", ruleIds);
      for (const r of nameRows || []) nameMap.set(r.id, r.name);
    }
    const enriched = rows.map((r: any) => ({ ...r, rule_name: nameMap.get(r.rule_id) || null }));

    return { success: true, message: `${enriched.length} execução(ões).`, data: enriched };
  } catch (e: any) {
    console.error("list_workflow_logs failed", e?.message);
    return { success: false, message: `Não foi possível listar execuções: ${String(e?.message || e).slice(0, 160)}` };
  }
};

// ===== execute_workflow =====

export const executeWorkflowDef: ToolDef = {
  type: "function",
  function: {
    name: "execute_workflow",
    description:
      "Força a transição de stage de um registo (lead/deal/quote/proposal) e dispara as automações associadas. record_id é o id do registo operacional (anew_leads.id, deals.id, quotes.id, proposals.id) — NÃO é o entity_id. Para quote, new_stage_id é uma string do estado (rascunho|enviado|aceite|finalizado|perdido); para os outros é UUID do stage.",
    parameters: {
      type: "object",
      properties: {
        source_entity: { type: "string", enum: [...SOURCE_ENTITIES] },
        record_id: { type: "string" },
        new_stage_id: { type: "string", description: "UUID do stage (lead/deal/proposal) ou string do estado (quote)" },
        old_stage_id: { type: "string" },
      },
      required: ["source_entity", "record_id", "new_stage_id"],
    },
  },
};

const executeWorkflow: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId, authHeader, authUid } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!authHeader) return { success: false, message: "Sessão sem token — não é possível invocar execute-workflow." };

  if (!args?.source_entity || !SOURCE_ENTITIES.includes(args.source_entity)) {
    return { success: false, message: `source_entity inválido. Aceites: ${SOURCE_ENTITIES.join(", ")}.` };
  }
  const sourceEntity: SourceEntity = args.source_entity;
  if (!args?.record_id || !UUID_RE.test(String(args.record_id))) {
    return { success: false, message: "record_id inválido." };
  }
  if (!args?.new_stage_id) return { success: false, message: "new_stage_id obrigatório." };

  // Validar new_stage_id consoante source_entity.
  if (sourceEntity === "quote") {
    if (!QUOTE_ESTADOS.includes(args.new_stage_id)) {
      return { success: false, message: `new_stage_id inválido para quote. Aceites: ${QUOTE_ESTADOS.join(", ")}.` };
    }
    if (args.old_stage_id !== undefined && args.old_stage_id !== null && !QUOTE_ESTADOS.includes(args.old_stage_id)) {
      return { success: false, message: `old_stage_id inválido para quote. Aceites: ${QUOTE_ESTADOS.join(", ")}.` };
    }
  } else {
    if (!UUID_RE.test(String(args.new_stage_id))) {
      return { success: false, message: `new_stage_id inválido — esperado UUID para ${sourceEntity}.` };
    }
    if (args.old_stage_id !== undefined && args.old_stage_id !== null && !UUID_RE.test(String(args.old_stage_id))) {
      return { success: false, message: `old_stage_id inválido — esperado UUID para ${sourceEntity}.` };
    }
  }

  // Carregar registo: id, organization_id, entity_id, deleted_at.
  const table = RECORD_TABLE[sourceEntity];
  const { data: rec, error: recErr } = await supabase
    .from(table)
    .select("id, organization_id, entity_id, deleted_at")
    .eq("id", args.record_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (recErr) {
    console.error("execute_workflow record load failed", recErr.message);
    return { success: false, message: `Não foi possível carregar o registo: ${String(recErr.message).slice(0, 160)}` };
  }
  if (!rec) return { success: false, message: "Registo não encontrado nesta organização." };
  if (rec.deleted_at) return { success: false, message: "Registo apagado." };

  // Gate de módulo.
  const modulePerm = MODULE_PERM[sourceEntity];
  if (!can(ctx, modulePerm)) {
    return { success: false, message: `Sem permissão para alterar este ${sourceEntity} (requer ${modulePerm}).` };
  }

  // Gate defensivo por entidade (quando o registo tem entity_id).
  if (rec.entity_id) {
    const roles = await resolveEntityRolesInOrg(supabase, rec.entity_id, organizationId);
    if (!roles.found) return { success: false, message: "Entidade associada inválida (soft-deleted ou sem papel activo)." };
  }

  const body = {
    source_entity: sourceEntity,
    entity_id: args.record_id, // tradução: edge function espera o id do registo aqui
    new_stage_id: args.new_stage_id,
    old_stage_id: args.old_stage_id ?? null,
    organization_id: organizationId,
    triggered_by: authUid,
  };
  const { ok, status, json } = await invokeFn(authHeader, "execute-workflow", body);
  if (!ok) {
    const msg = json?.error || `HTTP ${status}`;
    return { success: false, message: `execute-workflow falhou: ${String(msg).slice(0, 160)}` };
  }

  const logs = Array.isArray(json?.logs) ? json.logs.slice(0, 10) : [];
  return {
    success: true,
    message: "Workflow executado.",
    data: {
      source_entity: sourceEntity,
      record_id: args.record_id,
      automationRules: json?.automationRules ?? 0,
      stageActions: json?.stageActions ?? 0,
      logs,
      link: null,
    },
  };
};

// ============================================================================
// P5 — Workflow Rules CRUD (create / update / toggle / delete)
// Edge corre com service role → bypassa a RLS. A app aplica os mesmos critérios
// da RLS aqui (gate `workflows.edit`, escopo via visibleOrgIds, globais só para
// system admin) porque a RLS não vai bloquear.
// ============================================================================

const TRIGGER_TYPE_MAX = 50;
const ACTION_TYPE_MAX = 50;
const RELATIONSHIP_FIELD_MAX = 100;
const NAME_MAX = 200;

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function validateNameTrim(name: unknown): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof name !== "string") return { ok: false, message: "name inválido (string)." };
  const v = name.trim();
  if (v.length < 1 || v.length > NAME_MAX) return { ok: false, message: `name inválido (1..${NAME_MAX}).` };
  return { ok: true, value: v };
}

async function loadEditableRule(
  ctx: ExecCtx,
  ruleId: string,
): Promise<{ ok: true; rule: { id: string; organization_id: string | null } } | { ok: false; message: string }> {
  if (!UUID_RE.test(String(ruleId))) return { ok: false, message: "rule_id inválido." };
  const { data, error } = await ctx.supabase
    .from("workflow_automation_rules")
    .select("id, organization_id")
    .eq("id", ruleId)
    .maybeSingle();
  if (error) {
    console.error("loadEditableRule failed", error.message);
    return { ok: false, message: `Não foi possível carregar a regra: ${String(error.message).slice(0, 160)}` };
  }
  if (!data) return { ok: false, message: "Regra não encontrada." };
  if (data.organization_id === null) {
    if (!ctx.isSystemAdmin) return { ok: false, message: "Apenas system admin pode alterar regras globais." };
  } else {
    if (!ctx.visibleOrgIds.includes(data.organization_id)) {
      return { ok: false, message: "Regra fora do escopo visível." };
    }
  }
  return { ok: true, rule: data };
}

// ===== create_workflow_rule =====

export const createWorkflowRuleDef: ToolDef = {
  type: "function",
  function: {
    name: "create_workflow_rule",
    description:
      "Cria regra de automação cross-entity ou condicional (entity-to-entity). NÃO é exclusiva de change_stage — suporta múltiplos trigger_type/action_type. Para reacção SIMPLES no MESMO módulo (ex.: 'quando lead muda para qualificado, converter em contacto') preferir create_stage_action — mais directo, sem cross-entity overhead. Usar create_workflow_rule apenas para: condicionais (trigger_conditions), cross-entity (source≠target), ou actions não suportadas em stage_actions. scope='org' usa a organização ativa; scope='global' (system admin only) cria regra sem organization_id. trigger_conditions e action_config têm de ser objetos JSON (não arrays).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        source_entity: { type: "string", enum: [...SOURCE_ENTITIES] },
        target_entity: { type: "string", enum: [...SOURCE_ENTITIES] },
        trigger_type: { type: "string" },
        trigger_stage_id: { type: "string" },
        trigger_conditions: { type: "object" },
        action_type: { type: "string" },
        action_stage_id: { type: "string" },
        action_config: { type: "object" },
        relationship_field: { type: "string" },
        execution_order: { type: "number" },
        stop_on_error: { type: "boolean" },
        is_active: { type: "boolean" },
        description: { type: "string" },
        scope: { type: "string", enum: ["org", "global"] },
      },
      required: ["name", "source_entity", "target_entity"],
    },
  },
};

const createWorkflowRule: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId, businessUserId } = ctx;

  if (!can(ctx, "workflows.edit")) {
    return { success: false, message: "Sem permissão para gerir regras de automação (workflows.edit)." };
  }

  // Forma
  if (!args?.source_entity || !SOURCE_ENTITIES.includes(args.source_entity)) {
    return { success: false, message: `source_entity inválido. Aceites: ${SOURCE_ENTITIES.join(", ")}.` };
  }
  if (!args?.target_entity || !SOURCE_ENTITIES.includes(args.target_entity)) {
    return { success: false, message: `target_entity inválido. Aceites: ${SOURCE_ENTITIES.join(", ")}.` };
  }
  const nameV = validateNameTrim(args?.name);
  if (!nameV.ok) return { success: false, message: nameV.message };

  if (args?.trigger_stage_id !== undefined && args.trigger_stage_id !== null && !UUID_RE.test(String(args.trigger_stage_id))) {
    return { success: false, message: "trigger_stage_id inválido." };
  }
  if (args?.action_stage_id !== undefined && args.action_stage_id !== null && !UUID_RE.test(String(args.action_stage_id))) {
    return { success: false, message: "action_stage_id inválido." };
  }
  if (args?.trigger_conditions !== undefined && !isPlainObject(args.trigger_conditions)) {
    return { success: false, message: "trigger_conditions inválido (objeto JSON, não array)." };
  }
  if (args?.action_config !== undefined && !isPlainObject(args.action_config)) {
    return { success: false, message: "action_config inválido (objeto JSON, não array)." };
  }
  if (args?.execution_order !== undefined) {
    const n = Number(args.execution_order);
    if (!Number.isInteger(n)) return { success: false, message: "execution_order inválido (inteiro)." };
  }
  if (args?.trigger_type !== undefined && (typeof args.trigger_type !== "string" || args.trigger_type.length > TRIGGER_TYPE_MAX)) {
    return { success: false, message: `trigger_type inválido (1..${TRIGGER_TYPE_MAX}).` };
  }
  if (args?.action_type !== undefined && (typeof args.action_type !== "string" || args.action_type.length > ACTION_TYPE_MAX)) {
    return { success: false, message: `action_type inválido (1..${ACTION_TYPE_MAX}).` };
  }
  if (args?.relationship_field !== undefined && args.relationship_field !== null &&
      (typeof args.relationship_field !== "string" || args.relationship_field.length > RELATIONSHIP_FIELD_MAX)) {
    return { success: false, message: `relationship_field inválido (1..${RELATIONSHIP_FIELD_MAX}).` };
  }

  // Escopo
  const scope = args?.scope ?? "org";
  let orgIdForInsert: string | null;
  if (scope === "global") {
    if (!ctx.isSystemAdmin) {
      return { success: false, message: "Apenas system admin pode criar regras globais." };
    }
    orgIdForInsert = null;
  } else if (scope === "org") {
    if (!organizationId) return { success: false, message: "Organização não definida." };
    if (!ctx.visibleOrgIds.includes(organizationId)) {
      return { success: false, message: "Organização ativa fora do escopo visível." };
    }
    orgIdForInsert = organizationId;
  } else {
    return { success: false, message: "scope inválido (org|global)." };
  }

  const payload: Record<string, unknown> = {
    name: nameV.value,
    source_entity: args.source_entity,
    target_entity: args.target_entity,
    organization_id: orgIdForInsert,
    trigger_type: args?.trigger_type ?? "stage_change",
    action_type: args?.action_type ?? "change_stage",
    trigger_conditions: args?.trigger_conditions ?? {},
    action_config: args?.action_config ?? {},
    execution_order: args?.execution_order ?? 0,
    stop_on_error: args?.stop_on_error ?? false,
    is_active: args?.is_active ?? true,
    created_by: businessUserId || null,
  };
  if (args?.trigger_stage_id) payload.trigger_stage_id = args.trigger_stage_id;
  if (args?.action_stage_id) payload.action_stage_id = args.action_stage_id;
  if (args?.relationship_field) payload.relationship_field = args.relationship_field;
  if (args?.description !== undefined) payload.description = args.description;

  const { data, error } = await supabase
    .from("workflow_automation_rules")
    .insert(payload)
    .select("id, name, is_active, source_entity, target_entity, organization_id")
    .single();
  if (error) {
    console.error("create_workflow_rule failed", error.message);
    return { success: false, message: `Não foi possível criar a regra: ${String(error.message).slice(0, 160)}` };
  }
  return { success: true, message: `Regra "${data.name}" criada.`, data };
};

// ===== update_workflow_rule =====

const UPDATABLE_FIELDS = [
  "name", "description", "is_active",
  "trigger_type", "trigger_stage_id", "trigger_conditions",
  "action_type", "action_stage_id", "action_config",
  "relationship_field", "execution_order", "stop_on_error",
] as const;

export const updateWorkflowRuleDef: ToolDef = {
  type: "function",
  function: {
    name: "update_workflow_rule",
    description:
      "Atualiza uma regra de automação generalizada (cross-entity/condicional). source_entity, target_entity e organization_id são imutáveis (para preservar histórico em workflow_execution_log). Para reacções simples no mesmo módulo prefere editar via toggle_stage_action / create_stage_action.",
    parameters: {
      type: "object",
      properties: {
        rule_id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        is_active: { type: "boolean" },
        trigger_type: { type: "string" },
        trigger_stage_id: { type: "string" },
        trigger_conditions: { type: "object" },
        action_type: { type: "string" },
        action_stage_id: { type: "string" },
        action_config: { type: "object" },
        relationship_field: { type: "string" },
        execution_order: { type: "number" },
        stop_on_error: { type: "boolean" },
      },
      required: ["rule_id"],
    },
  },
};

const updateWorkflowRule: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase } = ctx;
  if (!can(ctx, "workflows.edit")) {
    return { success: false, message: "Sem permissão para gerir regras de automação (workflows.edit)." };
  }
  if (!args?.rule_id) return { success: false, message: "rule_id obrigatório." };

  const loaded = await loadEditableRule(ctx, String(args.rule_id));
  if (!loaded.ok) return { success: false, message: loaded.message };

  const patch: Record<string, unknown> = {};
  for (const field of UPDATABLE_FIELDS) {
    if (args[field] === undefined) continue;
    const v = args[field];
    if (field === "name") {
      const nv = validateNameTrim(v);
      if (!nv.ok) return { success: false, message: nv.message };
      patch.name = nv.value;
    } else if (field === "trigger_stage_id" || field === "action_stage_id") {
      if (v !== null && !UUID_RE.test(String(v))) return { success: false, message: `${field} inválido.` };
      patch[field] = v;
    } else if (field === "trigger_conditions" || field === "action_config") {
      if (!isPlainObject(v)) return { success: false, message: `${field} inválido (objeto JSON, não array).` };
      patch[field] = v;
    } else if (field === "execution_order") {
      const n = Number(v);
      if (!Number.isInteger(n)) return { success: false, message: "execution_order inválido (inteiro)." };
      patch.execution_order = n;
    } else if (field === "trigger_type") {
      if (typeof v !== "string" || v.length < 1 || v.length > TRIGGER_TYPE_MAX) {
        return { success: false, message: `trigger_type inválido (1..${TRIGGER_TYPE_MAX}).` };
      }
      patch.trigger_type = v;
    } else if (field === "action_type") {
      if (typeof v !== "string" || v.length < 1 || v.length > ACTION_TYPE_MAX) {
        return { success: false, message: `action_type inválido (1..${ACTION_TYPE_MAX}).` };
      }
      patch.action_type = v;
    } else if (field === "relationship_field") {
      if (v !== null && (typeof v !== "string" || v.length > RELATIONSHIP_FIELD_MAX)) {
        return { success: false, message: `relationship_field inválido (1..${RELATIONSHIP_FIELD_MAX}).` };
      }
      patch.relationship_field = v;
    } else {
      patch[field] = v;
    }
  }

  if (Object.keys(patch).length === 0) {
    return { success: false, message: "Nada para atualizar." };
  }

  const { error } = await supabase
    .from("workflow_automation_rules")
    .update(patch)
    .eq("id", loaded.rule.id);
  if (error) {
    console.error("update_workflow_rule failed", error.message);
    return { success: false, message: `Não foi possível atualizar: ${String(error.message).slice(0, 160)}` };
  }
  return { success: true, message: "Regra atualizada.", data: { id: loaded.rule.id, updated_fields: Object.keys(patch) } };
};

// ===== toggle_workflow_rule =====

export const toggleWorkflowRuleDef: ToolDef = {
  type: "function",
  function: {
    name: "toggle_workflow_rule",
    description: "Ativa ou desativa uma regra de automação.",
    parameters: {
      type: "object",
      properties: {
        rule_id: { type: "string" },
        is_active: { type: "boolean" },
      },
      required: ["rule_id", "is_active"],
    },
  },
};

const toggleWorkflowRule: Handler = async (ctx, args): Promise<ToolResult> => {
  if (!can(ctx, "workflows.edit")) {
    return { success: false, message: "Sem permissão para gerir regras de automação (workflows.edit)." };
  }
  if (!args?.rule_id) return { success: false, message: "rule_id obrigatório." };
  if (typeof args?.is_active !== "boolean") return { success: false, message: "is_active obrigatório (boolean)." };

  const loaded = await loadEditableRule(ctx, String(args.rule_id));
  if (!loaded.ok) return { success: false, message: loaded.message };

  const { error } = await ctx.supabase
    .from("workflow_automation_rules")
    .update({ is_active: args.is_active })
    .eq("id", loaded.rule.id);
  if (error) {
    console.error("toggle_workflow_rule failed", error.message);
    return { success: false, message: `Não foi possível alterar estado: ${String(error.message).slice(0, 160)}` };
  }
  return {
    success: true,
    message: `Regra ${args.is_active ? "ativada" : "desativada"}.`,
    data: { id: loaded.rule.id, is_active: args.is_active },
  };
};

// ===== delete_workflow_rule =====

export const deleteWorkflowRuleDef: ToolDef = {
  type: "function",
  function: {
    name: "delete_workflow_rule",
    description:
      "Apaga uma regra de automação. workflow_execution_log.rule_id fica a NULL (ON DELETE SET NULL) — histórico preservado.",
    parameters: {
      type: "object",
      properties: {
        rule_id: { type: "string" },
      },
      required: ["rule_id"],
    },
  },
};

const deleteWorkflowRule: Handler = async (ctx, args): Promise<ToolResult> => {
  if (!can(ctx, "workflows.edit")) {
    return { success: false, message: "Sem permissão para gerir regras de automação (workflows.edit)." };
  }
  if (!args?.rule_id) return { success: false, message: "rule_id obrigatório." };

  const loaded = await loadEditableRule(ctx, String(args.rule_id));
  if (!loaded.ok) return { success: false, message: loaded.message };

  const { error } = await ctx.supabase
    .from("workflow_automation_rules")
    .delete()
    .eq("id", loaded.rule.id);
  if (error) {
    console.error("delete_workflow_rule failed", error.message);
    return { success: false, message: `Não foi possível apagar: ${String(error.message).slice(0, 160)}` };
  }
  return { success: true, message: "Regra apagada.", data: { id: loaded.rule.id, deleted: true } };
};

export const handlers: Record<string, Handler> = {
  list_workflow_rules: listWorkflowRules,
  list_workflow_logs: listWorkflowLogs,
  execute_workflow: executeWorkflow,
  create_workflow_rule: createWorkflowRule,
  update_workflow_rule: updateWorkflowRule,
  toggle_workflow_rule: toggleWorkflowRule,
  delete_workflow_rule: deleteWorkflowRule,
};
