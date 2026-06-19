// Stage actions — Fase 6.
// Tools: list_stage_actions, create_stage_action, toggle_stage_action, delete_stage_action.
//
// Módulos:
//  - lead     → lead_stage_actions       (executor: convert_to_contact | convert_to_client | create_task)
//  - deal     → deal_stage_actions       (executor: create_quote | create_proposal | create_task)
//  - quote    → quote_stage_actions      (executor: create_proposal)
//  - proposal → proposal_stage_actions   (READ-ONLY via agente — executor NÃO lê esta tabela)
//
// Gate de escrita: workflows.edit (paridade com workflow_automation_rules).
// Bloqueio de duplicado aplica-se SÓ enquanto a action existente está is_active=true.

import { can } from "../shared/authz.ts";
import type { ExecCtx, Handler, ToolDef, ToolResult } from "../shared/types.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MODULES = ["lead", "deal", "proposal", "quote"] as const;
type Module = typeof MODULES[number];

const WRITE_MODULES: Module[] = ["lead", "deal", "quote"];

const TABLE: Record<Module, string> = {
  lead: "lead_stage_actions",
  deal: "deal_stage_actions",
  proposal: "proposal_stage_actions",
  quote: "quote_stage_actions",
};

const STAGE_TABLE: Record<Module, string> = {
  lead: "lead_workflow_stages",
  deal: "deal_stages",
  proposal: "proposal_workflow_stages",
  quote: "quote_workflow_stages",
};

// Source of truth dos action_types executados pela edge function execute-workflow.
const EXECUTED_ACTION_TYPES: Record<Module, string[]> = {
  lead: ["convert_to_contact", "convert_to_client", "create_task"],
  deal: ["create_quote", "create_proposal", "create_task"],
  quote: ["create_proposal"],
  proposal: [], // não executado
};

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isWriteModule(m: string): m is Module {
  return (WRITE_MODULES as string[]).includes(m);
}

// ============================================================================
// list_stage_actions
// ============================================================================

export const listStageActionsDef: ToolDef = {
  type: "function",
  function: {
    name: "list_stage_actions",
    description:
      "Lista actions configuradas para os stages do módulo (lead|deal|quote|proposal). Filtrar por stage_id opcional. proposal_stage_actions é listável mas não é executado pelo motor de workflows.",
    parameters: {
      type: "object",
      properties: {
        module: { type: "string", enum: [...MODULES] },
        stage_id: { type: "string" },
        is_active: { type: "boolean" },
        limit: { type: "number", description: "1-50, default 25" },
      },
      required: ["module"],
    },
  },
};

const listStageActions: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!args?.module || !(MODULES as readonly string[]).includes(args.module)) {
    return { success: false, message: `module inválido. Aceites: ${MODULES.join(", ")}.` };
  }
  const mod: Module = args.module;
  if (mod !== "deal" && !organizationId) return { success: false, message: "Organização não definida." };
  if (args?.stage_id !== undefined && !UUID_RE.test(String(args.stage_id))) {
    return { success: false, message: "stage_id inválido." };
  }
  let limit = 25;
  if (args?.limit !== undefined) {
    const n = Number(args.limit);
    if (!Number.isInteger(n) || n < 1 || n > 50) return { success: false, message: "limit inválido (1-50)." };
    limit = n;
  }

  let q = supabase.from(TABLE[mod])
    .select("id, organization_id, stage_id, action_type, action_config, is_active, execution_order, created_at")
    .order("execution_order", { ascending: true })
    .limit(limit);
  if (organizationId) q = q.eq("organization_id", organizationId);
  if (args?.stage_id) q = q.eq("stage_id", args.stage_id);
  if (args?.is_active !== undefined) q = q.eq("is_active", args.is_active);

  const { data, error } = await q;
  if (error) return { success: false, message: `Não foi possível listar: ${String(error.message).slice(0, 160)}` };
  const items = data || [];
  const note = mod === "proposal" ? " (proposal_stage_actions não é executado pelo motor.)" : "";
  return { success: true, message: `${items.length} action(s).${note}`, data: items };
};

// ============================================================================
// create_stage_action
// ============================================================================

export const createStageActionDef: ToolDef = {
  type: "function",
  function: {
    name: "create_stage_action",
    description:
      "Cria automação 'quando entidade entra no stage X, executa Y'. Usa esta tool para pedidos do tipo 'quando lead muda para qualificado, converter em contacto' — é a forma canónica de reagir a mudanças de stage no mesmo módulo. Fluxo obrigatório: 1) list_workflow_stages({module}) para obter stage_id pelo nome, 2) list_stage_actions({module, stage_id}) para evitar duplicados, 3) create_stage_action. Módulos: lead|deal|quote (proposal é read-only). action_type por módulo: lead→convert_to_contact|convert_to_client|create_task; deal→create_quote|create_proposal|create_task; quote→create_proposal. create_task exige action_config.title. Bloqueia duplicado activo (stage_id+action_type com is_active=true).",
    parameters: {
      type: "object",
      properties: {
        module: { type: "string", enum: [...WRITE_MODULES] },
        stage_id: { type: "string" },
        action_type: { type: "string" },
        action_config: { type: "object" },
        is_active: { type: "boolean" },
        execution_order: { type: "number" },
      },
      required: ["module", "stage_id", "action_type"],
    },
  },
};

const createStageAction: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId, businessUserId } = ctx;
  if (!can(ctx, "workflows.edit")) return { success: false, message: "Sem permissão (workflows.edit)." };
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.module || !isWriteModule(args.module)) {
    return { success: false, message: `module inválido. Aceites: ${WRITE_MODULES.join(", ")}.` };
  }
  const mod: Module = args.module;
  if (!args?.stage_id || !UUID_RE.test(String(args.stage_id))) {
    return { success: false, message: "stage_id inválido." };
  }
  const allowed = EXECUTED_ACTION_TYPES[mod];
  if (typeof args?.action_type !== "string" || !allowed.includes(args.action_type)) {
    return { success: false, message: `action_type inválido para ${mod}. Aceites: ${allowed.join(", ")}.` };
  }
  if (args?.action_config !== undefined && !isPlainObject(args.action_config)) {
    return { success: false, message: "action_config inválido (objeto JSON)." };
  }
  if (args.action_type === "create_task") {
    const cfg = (args.action_config ?? {}) as Record<string, unknown>;
    if (typeof cfg.title !== "string" || cfg.title.trim().length < 1) {
      return { success: false, message: "create_task requer action_config.title (string)." };
    }
  }

  // Validar stage_id pertence ao módulo correcto, está visível e activo.
  const stageSel = mod === "deal"
    ? supabase.from(STAGE_TABLE[mod]).select("id, name").eq("id", args.stage_id).maybeSingle()
    : supabase.from(STAGE_TABLE[mod]).select("id, name, organization_id, is_active").eq("id", args.stage_id).maybeSingle();
  const { data: stage, error: stageErr } = await stageSel;
  if (stageErr) return { success: false, message: `Não foi possível validar stage: ${String(stageErr.message).slice(0, 160)}` };
  if (!stage) return { success: false, message: `stage_id não existe em ${STAGE_TABLE[mod]}.` };
  if (mod !== "deal") {
    const so = (stage as any).organization_id;
    if (so !== null && so !== organizationId) return { success: false, message: "Stage fora da organização activa." };
    if ((stage as any).is_active === false) return { success: false, message: "Stage está inactivo — reactiva antes de adicionar actions." };
  }

  // Bloquear duplicado activo.
  const { data: dup } = await supabase
    .from(TABLE[mod])
    .select("id")
    .eq("organization_id", organizationId)
    .eq("stage_id", args.stage_id)
    .eq("action_type", args.action_type)
    .eq("is_active", true)
    .maybeSingle();
  if (dup) return { success: false, message: "Já existe uma action activa deste tipo neste stage." };

  // Calcular execution_order.
  let execOrder: number;
  if (args?.execution_order !== undefined) {
    const n = Number(args.execution_order);
    if (!Number.isInteger(n) || n < 0) return { success: false, message: "execution_order inválido (inteiro ≥ 0)." };
    execOrder = n;
  } else {
    const { data: existing } = await supabase
      .from(TABLE[mod])
      .select("execution_order")
      .eq("organization_id", organizationId)
      .eq("stage_id", args.stage_id);
    const max = (existing || []).reduce((m: number, r: any) => Math.max(m, Number(r.execution_order ?? 0)), 0);
    execOrder = max + 1;
  }

  const payload: Record<string, unknown> = {
    organization_id: organizationId,
    stage_id: args.stage_id,
    action_type: args.action_type,
    action_config: args.action_config ?? {},
    is_active: args?.is_active ?? true,
    execution_order: execOrder,
  };
  if (businessUserId) payload.created_by = businessUserId;

  const { data, error } = await supabase
    .from(TABLE[mod])
    .insert(payload)
    .select("id, stage_id, action_type, is_active, execution_order")
    .single();
  if (error) {
    console.error("create_stage_action failed", error.message);
    return { success: false, message: `Não foi possível criar action: ${String(error.message).slice(0, 160)}` };
  }
  return { success: true, message: `Action "${args.action_type}" criada.`, data };
};

// ============================================================================
// toggle_stage_action
// ============================================================================

export const toggleStageActionDef: ToolDef = {
  type: "function",
  function: {
    name: "toggle_stage_action",
    description: "Ativa ou desativa uma stage action.",
    parameters: {
      type: "object",
      properties: {
        module: { type: "string", enum: [...WRITE_MODULES] },
        action_id: { type: "string" },
        is_active: { type: "boolean" },
      },
      required: ["module", "action_id", "is_active"],
    },
  },
};

const toggleStageAction: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!can(ctx, "workflows.edit")) return { success: false, message: "Sem permissão (workflows.edit)." };
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.module || !isWriteModule(args.module)) {
    return { success: false, message: `module inválido. Aceites: ${WRITE_MODULES.join(", ")}.` };
  }
  const mod: Module = args.module;
  if (!args?.action_id || !UUID_RE.test(String(args.action_id))) {
    return { success: false, message: "action_id inválido." };
  }
  if (typeof args?.is_active !== "boolean") return { success: false, message: "is_active obrigatório (boolean)." };

  const { data: rec, error: loadErr } = await supabase
    .from(TABLE[mod])
    .select("id, organization_id, stage_id, action_type")
    .eq("id", args.action_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (loadErr) return { success: false, message: `Não foi possível carregar: ${String(loadErr.message).slice(0, 160)}` };
  if (!rec) return { success: false, message: "Action não encontrada nesta organização." };

  // Se está a activar, garantir que não cria duplicado activo.
  if (args.is_active) {
    const { data: dup } = await supabase
      .from(TABLE[mod])
      .select("id")
      .eq("organization_id", organizationId)
      .eq("stage_id", rec.stage_id)
      .eq("action_type", rec.action_type)
      .eq("is_active", true)
      .neq("id", rec.id)
      .maybeSingle();
    if (dup) return { success: false, message: "Já existe outra action activa deste tipo neste stage." };
  }

  const { error: updErr } = await supabase
    .from(TABLE[mod])
    .update({ is_active: args.is_active, updated_at: new Date().toISOString() })
    .eq("id", rec.id)
    .eq("organization_id", organizationId);
  if (updErr) return { success: false, message: `Não foi possível alterar: ${String(updErr.message).slice(0, 160)}` };

  return { success: true, message: `Action ${args.is_active ? "activada" : "desactivada"}.`, data: { id: rec.id, is_active: args.is_active } };
};

// ============================================================================
// delete_stage_action
// ============================================================================

export const deleteStageActionDef: ToolDef = {
  type: "function",
  function: {
    name: "delete_stage_action",
    description: "Apaga uma stage action. Acção terminal — requer confirm=true.",
    parameters: {
      type: "object",
      properties: {
        module: { type: "string", enum: [...WRITE_MODULES] },
        action_id: { type: "string" },
        confirm: { type: "boolean" },
      },
      required: ["module", "action_id", "confirm"],
    },
  },
};

const deleteStageAction: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!can(ctx, "workflows.edit")) return { success: false, message: "Sem permissão (workflows.edit)." };
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.module || !isWriteModule(args.module)) {
    return { success: false, message: `module inválido. Aceites: ${WRITE_MODULES.join(", ")}.` };
  }
  const mod: Module = args.module;
  if (!args?.action_id || !UUID_RE.test(String(args.action_id))) {
    return { success: false, message: "action_id inválido." };
  }
  if (args?.confirm !== true) return { success: false, message: "Acção terminal — passa confirm=true para apagar." };

  const { data: rec, error: loadErr } = await supabase
    .from(TABLE[mod])
    .select("id, organization_id")
    .eq("id", args.action_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (loadErr) return { success: false, message: `Não foi possível carregar: ${String(loadErr.message).slice(0, 160)}` };
  if (!rec) return { success: false, message: "Action não encontrada nesta organização." };

  const { error } = await supabase
    .from(TABLE[mod])
    .delete()
    .eq("id", rec.id)
    .eq("organization_id", organizationId);
  if (error) return { success: false, message: `Não foi possível apagar: ${String(error.message).slice(0, 160)}` };
  return { success: true, message: "Action apagada.", data: { id: rec.id, deleted: true } };
};

export const handlers: Record<string, Handler> = {
  list_stage_actions: listStageActions,
  create_stage_action: createStageAction,
  toggle_stage_action: toggleStageAction,
  delete_stage_action: deleteStageAction,
};
