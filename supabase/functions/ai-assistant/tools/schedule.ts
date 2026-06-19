// Schedule tools — extracted verbatim from index.ts.

import { can, permissionExists, requireWrite } from "../shared/authz.ts";
import type { Handler, ToolDef, ToolResult } from "../shared/types.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
const SCHEDULE_STATUSES = ["draft","scheduled","confirmed","in_progress","completed","cancelled","rescheduled"] as const;

export const createScheduleItemDef: ToolDef = {
  type: "function",
  function: {
    name: "create_schedule_item",
    description: "Agenda reunião/visita/chamada/tarefa. Suporta atribuição directa de resources, link a entidade (client/contact/deal), assigned_to (user_id) e auto-atribuição por proximidade (postal_code).",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        start_time: { type: "string", description: "HH:MM" },
        end_time: { type: "string", description: "HH:MM (opcional se duration_minutes presente)" },
        duration_minutes: { type: "number", description: "Alternativa a end_time. Default 60 quando nenhum é dado." },
        item_type: { type: "string", enum: ["meeting", "visit", "call", "task"], description: "Guardado em metadata.item_type." },
        location: { type: "string" },
        postal_code: { type: "string", description: "Usado por auto_assign_resource." },
        client_id: { type: "string", description: "UUID de clients." },
        contact_id: { type: "string", description: "UUID de contacts." },
        deal_id: { type: "string", description: "UUID de deals." },
        assigned_to: { type: "string", description: "UUID anew_users.id (campo user_id do item)." },
        resource_ids: { type: "array", items: { type: "string" }, maxItems: 20, description: "UUIDs de schedule_resources." },
        auto_assign_resource: { type: "boolean", description: "Se true e resource_ids vazio, chama find_nearest_resources e usa o melhor candidato. Requer postal_code." },
      },
      required: ["title", "date", "start_time"],
    },
  },
};

export const listScheduleDef: ToolDef = {
  type: "function",
  function: {
    name: "list_schedule",
    description: "Lista itens da agenda numa janela de datas.",
    parameters: {
      type: "object",
      properties: {
        from_date: { type: "string", description: "YYYY-MM-DD" },
        to_date: { type: "string", description: "YYYY-MM-DD" },
      },
    },
  },
};

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const createScheduleItem: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, businessUserId, organizationId } = ctx;
  const createdBy = businessUserId || null;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (permissionExists(ctx, "scheduling.items.create")) {
    const permS = requireWrite(ctx, "scheduling.items.create", "criar itens de agenda");
    if (permS) return permS;
  }

  // Validations
  if (!args?.title || !args?.date || !args?.start_time) {
    return { success: false, message: "title, date e start_time são obrigatórios." };
  }
  if (!HHMM_RE.test(String(args.start_time))) {
    return { success: false, message: "start_time inválido (HH:MM)." };
  }
  if (args.end_time !== undefined && !HHMM_RE.test(String(args.end_time))) {
    return { success: false, message: "end_time inválido (HH:MM)." };
  }
  for (const k of ["client_id", "contact_id", "deal_id", "assigned_to"]) {
    if (args[k] !== undefined && args[k] !== null && !UUID_RE.test(String(args[k]))) {
      return { success: false, message: `${k} inválido (UUID).` };
    }
  }
  const resourceIds: string[] = Array.isArray(args.resource_ids)
    ? Array.from(new Set(args.resource_ids.map(String).filter((s: string) => UUID_RE.test(s))))
    : [];
  if (resourceIds.length > 20) return { success: false, message: "Máximo 20 resources." };

  // Find or create board
  let boardId: string;
  const { data: boards } = await supabase
    .from("schedule_boards")
    .select("id")
    .eq("organization_id", organizationId)
    .limit(1);

  if (boards && boards.length > 0) {
    boardId = boards[0].id;
  } else {
    const { data: newBoard, error: be } = await supabase
      .from("schedule_boards")
      .insert({
        name: "Agendamentos",
        organization_id: organizationId,
        created_by: createdBy,
      })
      .select("id")
      .single();
    if (be) throw be;
    boardId = newBoard.id;
  }

  // Compute datetimes
  const startDateTime = `${args.date}T${args.start_time}:00`;
  let endDateTime: string;
  if (args.end_time) {
    endDateTime = `${args.date}T${args.end_time}:00`;
  } else {
    const dur = typeof args.duration_minutes === "number" && args.duration_minutes > 0
      ? Math.min(args.duration_minutes, 24 * 60)
      : 60;
    const [h, m] = args.start_time.split(":").map((s: string) => parseInt(s, 10));
    const total = h * 60 + m + dur;
    const eh = Math.floor(total / 60) % 24;
    const em = total % 60;
    endDateTime = `${args.date}T${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00`;
  }

  // Auto-assign resource via postal_code
  let autoResolvedResource: { id: string; name?: string } | null = null;
  if (resourceIds.length === 0 && args.auto_assign_resource === true) {
    if (!args.postal_code) {
      return { success: false, message: "auto_assign_resource requer postal_code." };
    }
    const durMin = typeof args.duration_minutes === "number" && args.duration_minutes > 0
      ? args.duration_minutes
      : 60;
    const { data: cands, error: rpcErr } = await supabase.rpc("find_nearest_resources", {
      p_board_id: boardId,
      p_target_postal_code: String(args.postal_code),
      p_target_date: args.date,
      p_duration_minutes: durMin,
      p_limit: 1,
    });
    if (rpcErr) throw rpcErr;
    const best = Array.isArray(cands) && cands.length > 0 ? cands[0] : null;
    if (!best?.resource_id) {
      return {
        success: false,
        message: "Sem recursos disponíveis para esse postal_code/data.",
        data: { board_id: boardId, candidates: cands ?? [] },
      };
    }
    autoResolvedResource = { id: best.resource_id, name: best.resource_name };
    resourceIds.push(best.resource_id);
  }

  // Validate resource_ids belong to org
  if (resourceIds.length > 0) {
    const { data: validRes } = await supabase
      .from("schedule_resources")
      .select("id")
      .eq("organization_id", organizationId)
      .in("id", resourceIds);
    const validSet = new Set((validRes ?? []).map((r: any) => r.id));
    const bad = resourceIds.filter((id) => !validSet.has(id));
    if (bad.length > 0) {
      return { success: false, message: `Resources fora da org ou inexistentes: ${bad.join(", ")}.` };
    }
  }

  const metadata: Record<string, any> = {};
  if (args.item_type) metadata.item_type = args.item_type;

  const insertPayload: Record<string, any> = {
    board_id: boardId,
    title: args.title,
    description: args.description || null,
    start_datetime: startDateTime,
    end_datetime: endDateTime,
    location: args.location || null,
    status: "scheduled",
    organization_id: organizationId,
    created_by: createdBy,
    metadata,
  };
  if (args.client_id) insertPayload.client_id = args.client_id;
  if (args.contact_id) insertPayload.contact_id = args.contact_id;
  if (args.deal_id) insertPayload.deal_id = args.deal_id;
  if (args.assigned_to) insertPayload.user_id = args.assigned_to;

  const { data, error } = await supabase
    .from("schedule_items")
    .insert(insertPayload)
    .select("id")
    .single();
  if (error) throw error;

  // Insert assignees
  if (resourceIds.length > 0) {
    const rows = resourceIds.map((rid) => ({ item_id: data.id, resource_id: rid }));
    const { error: insErr } = await supabase.from("schedule_item_assignees").insert(rows);
    if (insErr) {
      console.error("create_schedule_item: assignees insert failed", insErr);
    }
  }

  const suffix = autoResolvedResource
    ? ` Recurso atribuído: ${autoResolvedResource.name ?? autoResolvedResource.id}.`
    : resourceIds.length > 0
    ? ` ${resourceIds.length} recurso(s) atribuído(s).`
    : "";
  return {
    success: true,
    message: `Agendado: "${args.title}" em ${args.date} às ${args.start_time}.${suffix}`,
    data: {
      id: data.id,
      resource_ids: resourceIds,
      auto_resolved_resource: autoResolvedResource,
      link: "/scheduling",
    },
  };
};


const listSchedule: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const today = new Date().toISOString().split("T")[0];
  const from = args?.from_date || today;
  const to = args?.to_date || from;
  const { data, error } = await supabase
    .from("schedule_items")
    .select("id, title, start_datetime, end_datetime, status")
    .eq("organization_id", organizationId)
    .gte("start_datetime", `${from}T00:00:00`)
    .lte("start_datetime", `${to}T23:59:59`)
    .order("start_datetime", { ascending: true });
  if (error) throw error;
  return { success: true, message: `${data?.length || 0} item(ns) na agenda.`, data: data || [] };
};

export const updateScheduleItemDef: ToolDef = {
  type: "function",
  function: {
    name: "update_schedule_item",
    description: "Edita um item da agenda (title, datetimes, status). Permite ao criador editar mesmo sem scheduling.items.edit.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        start_datetime: { type: "string", description: "ISO 8601" },
        end_datetime: { type: "string", description: "ISO 8601" },
        status: { type: "string", enum: [...SCHEDULE_STATUSES] },
      },
      required: ["id"],
    },
  },
};

const updateScheduleItem: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId, businessUserId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.id || !UUID_RE.test(String(args.id))) return { success: false, message: "id inválido." };

  const patch: Record<string, any> = {};
  if (args.title !== undefined) patch.title = String(args.title);
  if (args.start_datetime !== undefined) {
    if (!ISO_RE.test(String(args.start_datetime))) return { success: false, message: "start_datetime inválido (ISO 8601)." };
    patch.start_datetime = args.start_datetime;
  }
  if (args.end_datetime !== undefined) {
    if (!ISO_RE.test(String(args.end_datetime))) return { success: false, message: "end_datetime inválido (ISO 8601)." };
    patch.end_datetime = args.end_datetime;
  }
  if (args.status !== undefined) {
    if (!SCHEDULE_STATUSES.includes(args.status)) return { success: false, message: `status inválido. Aceites: ${SCHEDULE_STATUSES.join(", ")}.` };
    patch.status = args.status;
  }
  if (Object.keys(patch).length === 0) return { success: false, message: "Nada para atualizar." };

  // Ownership flow: load first (need created_by for fallback)
  const { data: row, error: selErr } = await supabase
    .from("schedule_items")
    .select("id, created_by")
    .eq("id", args.id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (selErr) throw selErr;
  if (!row) return { success: false, message: "Item de agenda não encontrado ou fora de scope." };

  const hasPerm = permissionExists(ctx, "scheduling.items.edit") && can(ctx, "scheduling.items.edit");
  const isOwner = !!businessUserId && row.created_by === businessUserId;
  if (!hasPerm && !isOwner) return { success: false, message: "Sem permissão para editar este item." };

  const { data, error } = await supabase
    .from("schedule_items")
    .update(patch)
    .eq("id", args.id)
    .eq("organization_id", organizationId)
    .select("id, title, start_datetime, end_datetime, status")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { success: false, message: "Item de agenda não encontrado ou fora de scope." };
  return { success: true, message: "Item de agenda atualizado.", data };
};

// ============================================================================
// Fase 4.C — Scheduling read/mutations
// 7 tools: get_schedule_item, complete_schedule_item, cancel_schedule_item,
// reschedule_schedule_item, assign_schedule_item, list_my_agenda,
// find_available_resources.
// Sem hardcode de gates scheduling.* (não estão em permissionAliases.ts).
// Padrão: soft-check + owner-fallback do update_schedule_item.
// ============================================================================

type ScheduleRow = { id: string; created_by: string | null; status: string; organization_id: string };

function canEditScheduleItem(ctx: any, row: ScheduleRow): boolean {
  const hasPerm = permissionExists(ctx, "scheduling.items.edit") && can(ctx, "scheduling.items.edit");
  const isOwner = !!ctx.businessUserId && row.created_by === ctx.businessUserId;
  return hasPerm || isOwner;
}

async function insertScheduleEvent(
  supabase: any,
  params: {
    item_id: string;
    businessUserId: string | null;
    event_type: string;
    description?: string | null;
    old_values?: any;
    new_values?: any;
  },
): Promise<void> {
  if (!params.businessUserId) return;
  const { error } = await supabase.from("schedule_item_events").insert({
    item_id: params.item_id,
    event_type: params.event_type,
    description: params.description ?? null,
    old_values: params.old_values ?? null,
    new_values: params.new_values ?? null,
    created_by: params.businessUserId,
  });
  if (error) console.error("insertScheduleEvent failed:", error);
}

// ---------- get_schedule_item ----------
export const getScheduleItemDef: ToolDef = {
  type: "function",
  function: {
    name: "get_schedule_item",
    description: "Detalhes de um item de agenda: header, assignees (resource + utilizador) e últimos eventos. item_id aceita UUID ou título parcial.",
    parameters: {
      type: "object",
      properties: { item_id: { type: "string" } },
      required: ["item_id"],
    },
  },
};

const getScheduleItem: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.item_id || !UUID_RE.test(String(args.item_id))) return { success: false, message: "item_id inválido." };

  const { data: item, error } = await supabase
    .from("schedule_items")
    .select("id, board_id, title, description, status, start_datetime, end_datetime, location, priority, created_by, client_id, contact_id, deal_id")
    .eq("id", args.item_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!item) return { success: false, message: "Item de agenda não encontrado." };

  const { data: assignees } = await supabase
    .from("schedule_item_assignees")
    .select("resource_id, role, schedule_resources(id, name, user_id)")
    .eq("item_id", item.id);

  const { data: events } = await supabase
    .from("schedule_item_events")
    .select("event_type, description, old_values, new_values, created_by, created_at")
    .eq("item_id", item.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return {
    success: true,
    message: `Item "${item.title}".`,
    data: {
      ...item,
      assignees: (assignees ?? []).map((a: any) => ({
        resource_id: a.resource_id,
        resource_name: a.schedule_resources?.name ?? null,
        user_id: a.schedule_resources?.user_id ?? null,
        role: a.role,
      })),
      events: events ?? [],
      link: "/scheduling",
    },
  };
};

// ---------- complete_schedule_item ----------
export const completeScheduleItemDef: ToolDef = {
  type: "function",
  function: {
    name: "complete_schedule_item",
    description: "Marca um item de agenda como concluído. Permitido ao criador mesmo sem scheduling.items.edit.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        outcome_notes: { type: "string" },
      },
      required: ["item_id"],
    },
  },
};

const completeScheduleItem: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId, businessUserId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.item_id || !UUID_RE.test(String(args.item_id))) return { success: false, message: "item_id inválido." };

  const { data: row } = await supabase
    .from("schedule_items")
    .select("id, created_by, status, organization_id")
    .eq("id", args.item_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!row) return { success: false, message: "Item de agenda não encontrado." };
  if (row.status === "completed") return { success: false, message: "Item já estava concluído." };
  if (row.status === "cancelled") return { success: false, message: "Item está cancelado — não pode ser concluído." };
  if (!canEditScheduleItem(ctx, row as ScheduleRow)) return { success: false, message: "Sem permissão para concluir este item." };

  const { error } = await supabase
    .from("schedule_items")
    .update({ status: "completed" })
    .eq("id", args.item_id)
    .eq("organization_id", organizationId);
  if (error) throw error;

  await insertScheduleEvent(supabase, {
    item_id: args.item_id,
    businessUserId,
    event_type: "completed",
    description: args.outcome_notes ? String(args.outcome_notes) : null,
    old_values: { status: row.status },
    new_values: { status: "completed" },
  });

  return { success: true, message: "Item concluído.", data: { id: args.item_id, link: "/scheduling" } };
};

// ---------- cancel_schedule_item ----------
export const cancelScheduleItemDef: ToolDef = {
  type: "function",
  function: {
    name: "cancel_schedule_item",
    description: "Cancela um item de agenda. Acção terminal — exige confirm:true.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        confirm: { type: "boolean" },
        reason: { type: "string" },
      },
      required: ["item_id", "confirm"],
    },
  },
};

const cancelScheduleItem: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId, businessUserId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.item_id || !UUID_RE.test(String(args.item_id))) return { success: false, message: "item_id inválido." };
  if (args.confirm !== true) return { success: false, message: "É necessário confirmar (confirm:true)." };

  const { data: row } = await supabase
    .from("schedule_items")
    .select("id, created_by, status, organization_id")
    .eq("id", args.item_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!row) return { success: false, message: "Item de agenda não encontrado." };
  if (row.status === "completed") return { success: false, message: "Item já concluído — não pode ser cancelado." };
  if (row.status === "cancelled") return { success: false, message: "Item já estava cancelado." };
  if (!canEditScheduleItem(ctx, row as ScheduleRow)) return { success: false, message: "Sem permissão para cancelar este item." };

  const { error } = await supabase
    .from("schedule_items")
    .update({ status: "cancelled" })
    .eq("id", args.item_id)
    .eq("organization_id", organizationId);
  if (error) throw error;

  await insertScheduleEvent(supabase, {
    item_id: args.item_id,
    businessUserId,
    event_type: "cancelled",
    description: args.reason ? String(args.reason) : null,
    old_values: { status: row.status },
    new_values: { status: "cancelled" },
  });

  return { success: true, message: "Item cancelado.", data: { id: args.item_id, link: "/scheduling" } };
};

// ---------- reschedule_schedule_item ----------
export const rescheduleScheduleItemDef: ToolDef = {
  type: "function",
  function: {
    name: "reschedule_schedule_item",
    description: "Reagenda um item (start/end). Emite evento 'rescheduled'. Usa esta tool em vez de update_schedule_item para mudanças de data/hora.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        start_datetime: { type: "string", description: "ISO 8601" },
        end_datetime: { type: "string", description: "ISO 8601" },
      },
      required: ["item_id", "start_datetime", "end_datetime"],
    },
  },
};

const rescheduleScheduleItem: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId, businessUserId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.item_id || !UUID_RE.test(String(args.item_id))) return { success: false, message: "item_id inválido." };
  if (!ISO_RE.test(String(args.start_datetime))) return { success: false, message: "start_datetime inválido (ISO 8601)." };
  if (!ISO_RE.test(String(args.end_datetime))) return { success: false, message: "end_datetime inválido (ISO 8601)." };

  const { data: row } = await supabase
    .from("schedule_items")
    .select("id, created_by, status, organization_id, start_datetime, end_datetime")
    .eq("id", args.item_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!row) return { success: false, message: "Item de agenda não encontrado." };
  if (row.status === "completed" || row.status === "cancelled") {
    return { success: false, message: `Item está ${row.status} — não pode ser reagendado.` };
  }
  if (!canEditScheduleItem(ctx, row as ScheduleRow)) return { success: false, message: "Sem permissão para reagendar este item." };

  const patch: Record<string, any> = {
    start_datetime: args.start_datetime,
    end_datetime: args.end_datetime,
  };
  const newStatus = (row.status === "scheduled" || row.status === "confirmed") ? "rescheduled" : row.status;
  if (newStatus !== row.status) patch.status = newStatus;

  const { error } = await supabase
    .from("schedule_items")
    .update(patch)
    .eq("id", args.item_id)
    .eq("organization_id", organizationId);
  if (error) throw error;

  await insertScheduleEvent(supabase, {
    item_id: args.item_id,
    businessUserId,
    event_type: "rescheduled",
    old_values: { start_datetime: row.start_datetime, end_datetime: row.end_datetime, status: row.status },
    new_values: { start_datetime: args.start_datetime, end_datetime: args.end_datetime, status: newStatus },
  });

  return { success: true, message: "Item reagendado.", data: { id: args.item_id, link: "/scheduling" } };
};

// ---------- assign_schedule_item ----------
export const assignScheduleItemDef: ToolDef = {
  type: "function",
  function: {
    name: "assign_schedule_item",
    description: "Substitui atomicamente a lista de assignees (resources) de um item. resource_ids são UUIDs de schedule_resources da org. Máx 20.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        resource_ids: { type: "array", items: { type: "string" }, maxItems: 20 },
      },
      required: ["item_id", "resource_ids"],
    },
  },
};

const assignScheduleItem: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId, businessUserId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.item_id || !UUID_RE.test(String(args.item_id))) return { success: false, message: "item_id inválido." };
  if (!Array.isArray(args.resource_ids)) return { success: false, message: "resource_ids tem de ser array." };

  const dedup = Array.from(new Set(args.resource_ids.map(String).filter((s) => UUID_RE.test(s))));
  if (dedup.length > 20) return { success: false, message: "Máximo 20 resources por item." };

  const { data: row } = await supabase
    .from("schedule_items")
    .select("id, created_by, status, organization_id")
    .eq("id", args.item_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!row) return { success: false, message: "Item de agenda não encontrado." };
  if (!canEditScheduleItem(ctx, row as ScheduleRow)) return { success: false, message: "Sem permissão para atribuir este item." };

  // Validate resources belong to org
  if (dedup.length > 0) {
    const { data: validRes } = await supabase
      .from("schedule_resources")
      .select("id")
      .eq("organization_id", organizationId)
      .in("id", dedup);
    const validIds = new Set((validRes ?? []).map((r: any) => r.id));
    const invalid = dedup.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      return { success: false, message: `Resources fora da org ou inexistentes: ${invalid.join(", ")}.` };
    }
  }

  // Current assignees
  const { data: current } = await supabase
    .from("schedule_item_assignees")
    .select("resource_id")
    .eq("item_id", args.item_id);
  const currentSet = new Set((current ?? []).map((r: any) => r.resource_id));
  const newSet = new Set(dedup);
  const added = dedup.filter((id) => !currentSet.has(id));
  const removed = Array.from(currentSet).filter((id) => !newSet.has(id)) as string[];

  if (added.length === 0 && removed.length === 0) {
    return { success: true, message: "Sem alterações nas atribuições.", data: { id: args.item_id, added: [], removed: [] } };
  }

  // Replace atomically (best-effort: delete then insert)
  const { error: delErr } = await supabase
    .from("schedule_item_assignees")
    .delete()
    .eq("item_id", args.item_id);
  if (delErr) throw delErr;

  if (dedup.length > 0) {
    const rows = dedup.map((rid) => ({ item_id: args.item_id, resource_id: rid }));
    const { error: insErr } = await supabase.from("schedule_item_assignees").insert(rows);
    if (insErr) throw insErr;
  }

  await insertScheduleEvent(supabase, {
    item_id: args.item_id,
    businessUserId,
    event_type: "assigned",
    new_values: { added, removed },
  });

  return {
    success: true,
    message: `Atribuições actualizadas (+${added.length} / -${removed.length}).`,
    data: { id: args.item_id, added, removed, link: "/scheduling" },
  };
};

// ---------- list_my_agenda ----------
export const listMyAgendaDef: ToolDef = {
  type: "function",
  function: {
    name: "list_my_agenda",
    description: "Lista a agenda do utilizador actual (items onde está atribuído como resource) numa janela de datas. Usa para 'a minha agenda', 'tenho hoje', etc.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "YYYY-MM-DD" },
        to: { type: "string", description: "YYYY-MM-DD" },
        status: { type: "string", enum: [...SCHEDULE_STATUSES] },
      },
    },
  },
};

const listMyAgenda: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId, businessUserId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!businessUserId) return { success: false, message: "Utilizador não identificado." };

  const today = new Date().toISOString().split("T")[0];
  const from = args?.from || today;
  const to = args?.to || from;

  const { data: resources } = await supabase
    .from("schedule_resources")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", businessUserId);
  const resourceIds = (resources ?? []).map((r: any) => r.id);
  if (resourceIds.length === 0) {
    return { success: true, message: "Não tens nenhum schedule_resource associado nesta org.", data: [] };
  }

  const { data: assigns } = await supabase
    .from("schedule_item_assignees")
    .select("item_id")
    .in("resource_id", resourceIds);
  const itemIds = Array.from(new Set((assigns ?? []).map((a: any) => a.item_id)));
  if (itemIds.length === 0) return { success: true, message: "0 itens na tua agenda.", data: [] };

  let q = supabase
    .from("schedule_items")
    .select("id, title, start_datetime, end_datetime, status, location")
    .eq("organization_id", organizationId)
    .in("id", itemIds)
    .gte("start_datetime", `${from}T00:00:00`)
    .lte("start_datetime", `${to}T23:59:59`)
    .order("start_datetime", { ascending: true })
    .limit(200);
  if (args?.status) q = q.eq("status", args.status);
  const { data, error } = await q;
  if (error) throw error;
  return { success: true, message: `${data?.length || 0} item(ns) na tua agenda.`, data: data || [] };
};

// ---------- find_available_resources ----------
export const findAvailableResourcesDef: ToolDef = {
  type: "function",
  function: {
    name: "find_available_resources",
    description: "Sugere recursos (técnicos/equipas) disponíveis para uma data, com base em distância (postal_code) e duração. Wrap de find_nearest_resources. Se board_id for omitido tenta resolver o board único activo da org.",
    parameters: {
      type: "object",
      properties: {
        board_id: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        duration_minutes: { type: "number" },
        postal_code: { type: "string" },
      },
      required: ["date"],
    },
  },
};

const findAvailableResources: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.date) return { success: false, message: "date é obrigatório (YYYY-MM-DD)." };

  let boardId: string | null = args.board_id && UUID_RE.test(String(args.board_id)) ? String(args.board_id) : null;
  if (!boardId) {
    const { data: boards } = await supabase
      .from("schedule_boards")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .limit(5);
    if (!boards || boards.length === 0) {
      return { success: false, message: "Nenhum board activo nesta org." };
    }
    if (boards.length > 1) {
      return {
        success: false,
        message: "Vários boards activos — indica board_id.",
        data: { candidates: boards.map((b: any) => ({ id: b.id, label: b.name })) },
      };
    }
    boardId = boards[0].id;
  }

  const { data, error } = await supabase.rpc("find_nearest_resources", {
    p_board_id: boardId,
    p_target_postal_code: args.postal_code ?? "",
    p_target_date: args.date,
    p_duration_minutes: typeof args.duration_minutes === "number" ? args.duration_minutes : 60,
    p_limit: 10,
  });
  if (error) throw error;
  return {
    success: true,
    message: `${(data ?? []).length} candidato(s).`,
    data: { board_id: boardId, candidates: data ?? [] },
  };
};

// ---------- list_schedule_resources ----------
export const listScheduleResourcesDef: ToolDef = {
  type: "function",
  function: {
    name: "list_schedule_resources",
    description: "Lista recursos (técnicos/equipas) visíveis da org para descobrir UUIDs antes de criar/atribuir agendamentos. Filtra por board_id (via assignees recentes não é aplicado — devolve toda a org), is_active e limit.",
    parameters: {
      type: "object",
      properties: {
        is_active: { type: "boolean", description: "Default true." },
        limit: { type: "number", description: "1..50, default 25." },
      },
    },
  },
};

const listScheduleResources: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const limit = Math.min(Math.max(typeof args?.limit === "number" ? args.limit : 25, 1), 50);
  const isActive = typeof args?.is_active === "boolean" ? args.is_active : true;

  let q = supabase
    .from("schedule_resources")
    .select("id, name, resource_type, user_id, employee_id, color, max_daily_capacity, is_active")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true })
    .limit(limit);
  if (isActive !== undefined) q = q.eq("is_active", isActive);

  const { data, error } = await q;
  if (error) throw error;
  return {
    success: true,
    message: `${data?.length || 0} recurso(s).`,
    data: data ?? [],
  };
};

export const handlers: Record<string, Handler> = {
  create_schedule_item: createScheduleItem,
  list_schedule: listSchedule,
  update_schedule_item: updateScheduleItem,
  get_schedule_item: getScheduleItem,
  complete_schedule_item: completeScheduleItem,
  cancel_schedule_item: cancelScheduleItem,
  reschedule_schedule_item: rescheduleScheduleItem,
  assign_schedule_item: assignScheduleItem,
  list_my_agenda: listMyAgenda,
  find_available_resources: findAvailableResources,
  list_schedule_resources: listScheduleResources,
};
