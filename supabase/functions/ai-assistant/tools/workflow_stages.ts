// Workflow stages — Fase 6.
// Tools: list_workflow_stages, create_workflow_stage, update_workflow_stage, deactivate_workflow_stage.
//
// Módulos:
//  - lead     → lead_workflow_stages       (escrita ok; trigger updated_at OK)
//  - proposal → proposal_workflow_stages   (escrita ok; SEM trigger updated_at)
//  - quote    → quote_workflow_stages      (escrita ok; SEM trigger updated_at; sem created_by)
//  - deal     → deal_stages                (READ-ONLY via agente; tabela global sem organization_id)
//
// Edge corre com service role → bypassa RLS. Gate aplicado: workflows.edit.
//
// normalizeStageOrder é best-effort, sem transacção. updateWorkflowStage força
// updated_at=now() no patch para garantir reposicionamento determinístico em
// proposal/quote, onde não há trigger BEFORE UPDATE.

import { can } from "../shared/authz.ts";
import type { ExecCtx, Handler, ToolDef, ToolResult } from "../shared/types.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MODULES = ["lead", "deal", "proposal", "quote"] as const;
type Module = typeof MODULES[number];

const WRITE_MODULES: Module[] = ["lead", "proposal", "quote"];

type StageTableConfig = {
  table: string;
  orderField: string;
  hasCreatedBy: boolean;
  labelRequired: boolean;
  labelAllowed: boolean;
  updatable: readonly string[];
  recordTable: string | null;        // null for deal (writes suspended)
  recordStageField: string | null;
  recordStageMatch: "id" | "name";   // quote matches by stage.name in quotes.estado
};

const CONFIG: Record<Module, StageTableConfig> = {
  lead: {
    table: "lead_workflow_stages",
    orderField: "stage_order",
    hasCreatedBy: true,
    labelRequired: true,
    labelAllowed: true,
    updatable: ["name", "label", "color", "stage_order", "is_active", "is_final", "is_conversion", "is_rejection", "default_status"],
    recordTable: "anew_leads",
    recordStageField: "workflow_stage_id",
    recordStageMatch: "id",
  },
  proposal: {
    table: "proposal_workflow_stages",
    orderField: "stage_order",
    hasCreatedBy: true,
    labelRequired: true,
    labelAllowed: true,
    updatable: ["name", "label", "color", "icon", "stage_order", "is_active", "is_final", "is_won", "is_lost"],
    recordTable: "proposals",
    recordStageField: "stage_id",
    recordStageMatch: "id",
  },
  quote: {
    table: "quote_workflow_stages",
    orderField: "stage_order",
    hasCreatedBy: false,
    labelRequired: false,
    labelAllowed: true,
    updatable: ["name", "label", "color", "icon", "stage_order", "is_active", "is_final", "is_won", "is_lost"],
    recordTable: "quotes",
    recordStageField: "estado",
    recordStageMatch: "name",
  },
  deal: {
    table: "deal_stages",
    orderField: "order_index",
    hasCreatedBy: false,
    labelRequired: false,
    labelAllowed: false,
    updatable: [],
    recordTable: null,
    recordStageField: null,
    recordStageMatch: "id",
  },
};

function isWriteModule(m: string): m is Module {
  return (WRITE_MODULES as string[]).includes(m);
}

function validateName(v: unknown, field: string, max = 100): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof v !== "string") return { ok: false, message: `${field} inválido (string).` };
  const t = v.trim();
  if (t.length < 1 || t.length > max) return { ok: false, message: `${field} inválido (1..${max}).` };
  return { ok: true, value: t };
}

// Re-escreve stage_order/order_index sequencial nos stages activos da org.
// Ordena por order asc, updated_at desc, id asc — empate cede ao stage tocado.
async function normalizeStageOrder(supabase: any, mod: Module, organizationId: string): Promise<void> {
  const cfg = CONFIG[mod];
  const { data, error } = await supabase
    .from(cfg.table)
    .select(`id, ${cfg.orderField}, updated_at`)
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  if (error || !Array.isArray(data)) return;
  const sorted = [...data].sort((a: any, b: any) => {
    const oa = Number(a[cfg.orderField] ?? 0);
    const ob = Number(b[cfg.orderField] ?? 0);
    if (oa !== ob) return oa - ob;
    const ua = String(a.updated_at ?? "");
    const ub = String(b.updated_at ?? "");
    if (ua !== ub) return ub.localeCompare(ua);
    return String(a.id).localeCompare(String(b.id));
  });
  for (let i = 0; i < sorted.length; i++) {
    const desired = i + 1;
    if (Number(sorted[i][cfg.orderField] ?? 0) === desired) continue;
    try {
      await supabase
        .from(cfg.table)
        .update({ [cfg.orderField]: desired })
        .eq("id", sorted[i].id)
        .eq("organization_id", organizationId);
    } catch (e) {
      console.warn(`normalizeStageOrder skip ${mod}/${sorted[i].id}`, e);
    }
  }
}

// ============================================================================
// list_workflow_stages
// ============================================================================

export const listWorkflowStagesDef: ToolDef = {
  type: "function",
  function: {
    name: "list_workflow_stages",
    description:
      "Lista stages do workflow do módulo (lead|deal|proposal|quote). PASSO OBRIGATÓRIO antes de create_stage_action — usa o stage_id devolvido (não o nome) e confirma is_active=true. Para deal devolve estágios globais (writes via agente suspensos).",
    parameters: {
      type: "object",
      properties: {
        module: { type: "string", enum: [...MODULES] },
        is_active: { type: "boolean" },
        limit: { type: "number", description: "1-50, default 25" },
      },
      required: ["module"],
    },
  },
};

const listWorkflowStages: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!args?.module || !(MODULES as readonly string[]).includes(args.module)) {
    return { success: false, message: `module inválido. Aceites: ${MODULES.join(", ")}.` };
  }
  const mod: Module = args.module;
  let limit = 25;
  if (args?.limit !== undefined) {
    const n = Number(args.limit);
    if (!Number.isInteger(n) || n < 1 || n > 50) return { success: false, message: "limit inválido (1-50)." };
    limit = n;
  }

  const cfg = CONFIG[mod];

  if (mod === "deal") {
    let q = supabase.from(cfg.table).select("id, name, stage_key, order_index, color, is_won, is_lost, is_final").order("order_index", { ascending: true }).limit(limit);
    const { data, error } = await q;
    if (error) return { success: false, message: `Não foi possível listar: ${String(error.message).slice(0, 160)}` };
    return { success: true, message: `${(data || []).length} stage(s). Writes via agente suspensos (deal_stages é global).`, data: data || [] };
  }

  if (!organizationId) return { success: false, message: "Organização não definida." };

  const selectCols = mod === "lead"
    ? "id, name, label, color, stage_order, is_active, is_final, is_conversion, is_rejection, default_status, organization_id"
    : "id, name, label, color, icon, stage_order, is_active, is_final, is_won, is_lost, organization_id";

  // org + globais
  const [orgRes, globalRes] = await Promise.all([
    supabase.from(cfg.table).select(selectCols).eq("organization_id", organizationId).order(cfg.orderField, { ascending: true }),
    supabase.from(cfg.table).select(selectCols).is("organization_id", null).order(cfg.orderField, { ascending: true }),
  ]);
  if (orgRes.error) return { success: false, message: `Não foi possível listar: ${String(orgRes.error.message).slice(0, 160)}` };
  if (globalRes.error) return { success: false, message: `Não foi possível listar: ${String(globalRes.error.message).slice(0, 160)}` };

  let rows = [...(orgRes.data || []), ...(globalRes.data || [])];
  if (args?.is_active !== undefined) rows = rows.filter((r: any) => r.is_active === args.is_active);
  rows.sort((a: any, b: any) => Number(a[cfg.orderField] ?? 0) - Number(b[cfg.orderField] ?? 0));
  return { success: true, message: `${Math.min(rows.length, limit)} stage(s).`, data: rows.slice(0, limit) };
};

// ============================================================================
// create_workflow_stage
// ============================================================================

export const createWorkflowStageDef: ToolDef = {
  type: "function",
  function: {
    name: "create_workflow_stage",
    description:
      "Cria um stage no módulo indicado (lead|proposal|quote). deal_stages é global e está suspenso para escrita via agente. label é obrigatório em lead/proposal e opcional em quote. order é calculado se omitido (MAX+1 entre todos os stages, activos ou não, para evitar colisões).",
    parameters: {
      type: "object",
      properties: {
        module: { type: "string", enum: [...WRITE_MODULES] },
        name: { type: "string" },
        label: { type: "string" },
        color: { type: "string" },
        icon: { type: "string" },
        order: { type: "number" },
        is_active: { type: "boolean" },
        is_final: { type: "boolean" },
        is_won: { type: "boolean" },
        is_lost: { type: "boolean" },
        is_conversion: { type: "boolean" },
        is_rejection: { type: "boolean" },
      },
      required: ["module", "name"],
    },
  },
};

const createWorkflowStage: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId, businessUserId } = ctx;
  if (!can(ctx, "workflows.edit")) return { success: false, message: "Sem permissão (workflows.edit)." };
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.module || !isWriteModule(args.module)) {
    return { success: false, message: `module inválido. Aceites para escrita: ${WRITE_MODULES.join(", ")}.` };
  }
  const mod: Module = args.module;
  const cfg = CONFIG[mod];

  const nameV = validateName(args?.name, "name");
  if (!nameV.ok) return { success: false, message: nameV.message };

  let label: string | undefined;
  if (cfg.labelRequired) {
    const lv = validateName(args?.label ?? args?.name, "label");
    if (!lv.ok) return { success: false, message: lv.message };
    label = lv.value;
  } else if (args?.label !== undefined) {
    const lv = validateName(args.label, "label");
    if (!lv.ok) return { success: false, message: lv.message };
    label = lv.value;
  }

  // Próximo order: varre TODOS os stages da org (activos e inactivos) para evitar colisões.
  let nextOrder: number;
  if (args?.order !== undefined) {
    const n = Number(args.order);
    if (!Number.isInteger(n) || n < 0) return { success: false, message: "order inválido (inteiro ≥ 0)." };
    nextOrder = n;
  } else {
    const { data: existing } = await supabase
      .from(cfg.table)
      .select(cfg.orderField)
      .eq("organization_id", organizationId);
    const max = (existing || []).reduce((m: number, r: any) => Math.max(m, Number(r[cfg.orderField] ?? 0)), 0);
    nextOrder = max + 1;
  }

  const payload: Record<string, unknown> = {
    organization_id: organizationId,
    name: nameV.value,
    [cfg.orderField]: nextOrder,
    is_active: args?.is_active ?? true,
  };
  if (label !== undefined) payload.label = label;
  if (args?.color !== undefined) payload.color = String(args.color).slice(0, 20);
  if (mod !== "lead" && args?.icon !== undefined) payload.icon = String(args.icon).slice(0, 50);
  if (args?.is_final !== undefined) payload.is_final = !!args.is_final;
  if (mod === "lead") {
    if (args?.is_conversion !== undefined) payload.is_conversion = !!args.is_conversion;
    if (args?.is_rejection !== undefined) payload.is_rejection = !!args.is_rejection;
  } else {
    if (args?.is_won !== undefined) payload.is_won = !!args.is_won;
    if (args?.is_lost !== undefined) payload.is_lost = !!args.is_lost;
  }
  if (cfg.hasCreatedBy && businessUserId) payload.created_by = businessUserId;

  const { data, error } = await supabase
    .from(cfg.table)
    .insert(payload)
    .select("id, name, " + cfg.orderField + ", is_active")
    .single();
  if (error) {
    console.error("create_workflow_stage failed", error.message);
    return { success: false, message: `Não foi possível criar stage: ${String(error.message).slice(0, 160)}` };
  }

  await normalizeStageOrder(supabase, mod, organizationId);

  return { success: true, message: `Stage "${data.name}" criado.`, data };
};

// ============================================================================
// update_workflow_stage
// ============================================================================

export const updateWorkflowStageDef: ToolDef = {
  type: "function",
  function: {
    name: "update_workflow_stage",
    description:
      "Atualiza um stage. Para repositioning passa o novo `order`. O handler força updated_at=now() para garantir reposicionamento determinístico em proposal/quote (sem trigger). Stages globais (organization_id IS NULL) são read-only via agente.",
    parameters: {
      type: "object",
      properties: {
        module: { type: "string", enum: [...WRITE_MODULES] },
        stage_id: { type: "string" },
        name: { type: "string" },
        label: { type: "string" },
        color: { type: "string" },
        icon: { type: "string" },
        order: { type: "number" },
        is_active: { type: "boolean" },
        is_final: { type: "boolean" },
        is_won: { type: "boolean" },
        is_lost: { type: "boolean" },
        is_conversion: { type: "boolean" },
        is_rejection: { type: "boolean" },
        default_status: { type: "string" },
      },
      required: ["module", "stage_id"],
    },
  },
};

const updateWorkflowStage: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!can(ctx, "workflows.edit")) return { success: false, message: "Sem permissão (workflows.edit)." };
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.module || !isWriteModule(args.module)) {
    return { success: false, message: `module inválido. Aceites: ${WRITE_MODULES.join(", ")}.` };
  }
  const mod: Module = args.module;
  const cfg = CONFIG[mod];
  if (!args?.stage_id || !UUID_RE.test(String(args.stage_id))) {
    return { success: false, message: "stage_id inválido." };
  }

  // Carregar stage e validar escopo.
  const { data: stage, error: loadErr } = await supabase
    .from(cfg.table)
    .select(`id, organization_id, name, ${cfg.orderField}`)
    .eq("id", args.stage_id)
    .maybeSingle();
  if (loadErr) return { success: false, message: `Não foi possível carregar: ${String(loadErr.message).slice(0, 160)}` };
  if (!stage) return { success: false, message: "Stage não encontrado." };
  if (stage.organization_id === null) return { success: false, message: "Stage global — não editável via agente." };
  if (stage.organization_id !== organizationId) return { success: false, message: "Stage fora da organização activa." };

  const patch: Record<string, unknown> = {};
  const map: Array<[string, string]> = [
    ["name", "name"], ["label", "label"], ["color", "color"], ["icon", "icon"],
    ["is_active", "is_active"], ["is_final", "is_final"],
    ["is_won", "is_won"], ["is_lost", "is_lost"],
    ["is_conversion", "is_conversion"], ["is_rejection", "is_rejection"],
    ["default_status", "default_status"],
  ];
  for (const [argKey, col] of map) {
    if (args[argKey] === undefined) continue;
    if (!cfg.updatable.includes(col)) continue;
    if (argKey === "name") {
      const v = validateName(args[argKey], "name"); if (!v.ok) return { success: false, message: v.message };
      patch.name = v.value;
    } else if (argKey === "label") {
      if (!cfg.labelAllowed) continue;
      const v = validateName(args[argKey], "label"); if (!v.ok) return { success: false, message: v.message };
      patch.label = v.value;
    } else if (argKey === "color") {
      patch.color = String(args[argKey]).slice(0, 20);
    } else if (argKey === "icon") {
      patch.icon = String(args[argKey]).slice(0, 50);
    } else if (argKey === "default_status") {
      patch.default_status = String(args[argKey]).slice(0, 100);
    } else {
      patch[col] = !!args[argKey];
    }
  }
  if (args?.order !== undefined) {
    const n = Number(args.order);
    if (!Number.isInteger(n) || n < 0) return { success: false, message: "order inválido (inteiro ≥ 0)." };
    patch[cfg.orderField] = n;
  }

  if (Object.keys(patch).length === 0) return { success: false, message: "Nada para atualizar." };

  // Forçar updated_at=now() — garante reposicionamento determinístico em proposal/quote (sem trigger).
  patch.updated_at = new Date().toISOString();

  const { error: updErr } = await supabase
    .from(cfg.table)
    .update(patch)
    .eq("id", stage.id)
    .eq("organization_id", organizationId);
  if (updErr) {
    console.error("update_workflow_stage failed", updErr.message);
    return { success: false, message: `Não foi possível atualizar: ${String(updErr.message).slice(0, 160)}` };
  }

  if (args?.order !== undefined) {
    await normalizeStageOrder(supabase, mod, organizationId);
  }

  return { success: true, message: "Stage atualizado.", data: { id: stage.id, updated_fields: Object.keys(patch).filter((k) => k !== "updated_at") } };
};

// ============================================================================
// deactivate_workflow_stage
// ============================================================================

export const deactivateWorkflowStageDef: ToolDef = {
  type: "function",
  function: {
    name: "deactivate_workflow_stage",
    description:
      "Desativa (soft) um stage. Bloqueia se houver registos activos no stage (anew_leads / proposals / quotes não eliminados). Stages globais não são desativáveis via agente.",
    parameters: {
      type: "object",
      properties: {
        module: { type: "string", enum: [...WRITE_MODULES] },
        stage_id: { type: "string" },
      },
      required: ["module", "stage_id"],
    },
  },
};

const deactivateWorkflowStage: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!can(ctx, "workflows.edit")) return { success: false, message: "Sem permissão (workflows.edit)." };
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.module || !isWriteModule(args.module)) {
    return { success: false, message: `module inválido. Aceites: ${WRITE_MODULES.join(", ")}.` };
  }
  const mod: Module = args.module;
  const cfg = CONFIG[mod];
  if (!args?.stage_id || !UUID_RE.test(String(args.stage_id))) {
    return { success: false, message: "stage_id inválido." };
  }

  const { data: stage, error: loadErr } = await supabase
    .from(cfg.table)
    .select("id, organization_id, name, is_active")
    .eq("id", args.stage_id)
    .maybeSingle();
  if (loadErr) return { success: false, message: `Não foi possível carregar: ${String(loadErr.message).slice(0, 160)}` };
  if (!stage) return { success: false, message: "Stage não encontrado." };
  if (stage.organization_id === null) return { success: false, message: "Stage global — não desativável via agente." };
  if (stage.organization_id !== organizationId) return { success: false, message: "Stage fora da organização activa." };
  if (stage.is_active === false) return { success: true, message: "Stage já estava inactivo.", data: { id: stage.id, is_active: false } };

  // Contar registos activos no stage.
  if (cfg.recordTable && cfg.recordStageField) {
    const matchValue = cfg.recordStageMatch === "name" ? stage.name : stage.id;
    const { count, error: cntErr } = await supabase
      .from(cfg.recordTable)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq(cfg.recordStageField, matchValue)
      .is("deleted_at", null);
    if (cntErr) return { success: false, message: `Não foi possível verificar uso: ${String(cntErr.message).slice(0, 160)}` };
    if ((count ?? 0) > 0) {
      return { success: false, message: `Não é possível desativar: ${count} registo(s) activo(s) neste stage.` };
    }
  }

  const { error: updErr } = await supabase
    .from(cfg.table)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", stage.id)
    .eq("organization_id", organizationId);
  if (updErr) {
    console.error("deactivate_workflow_stage failed", updErr.message);
    return { success: false, message: `Não foi possível desativar: ${String(updErr.message).slice(0, 160)}` };
  }

  return { success: true, message: `Stage "${stage.name}" desativado.`, data: { id: stage.id, is_active: false } };
};

export const handlers: Record<string, Handler> = {
  list_workflow_stages: listWorkflowStages,
  create_workflow_stage: createWorkflowStage,
  update_workflow_stage: updateWorkflowStage,
  deactivate_workflow_stage: deactivateWorkflowStage,
};
