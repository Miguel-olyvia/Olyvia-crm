// Reagendamento pelo link publico: as MESMAS regras que a marcacao aplica, mas
// para o recurso que ja tem a visita (o comercial nao muda) e sem contar a
// propria visita contra si.
//
// Uma so fonte de verdade: o calendario (public-availability, com
// booking_token) e a validacao final (reschedule-booking) usam as funcoes deste
// modulo, por isso o que o calendario mostra e o que a validacao aceita nao
// podem divergir. So REDUZ: nunca acrescenta horarios -- parte do que o recurso
// tem livre (feriados, dias uteis, ausencias, antecedencia minima, capacidade
// diaria, conflitos) e retira o que a deslocacao/almoco nao permite.

import { buildLunchBreakConfig, checkTravelFeasible, type LunchBreakConfig } from "./travelFeasibility.ts";
import { ensureHolidaysPersisted } from "./ensureHolidays.ts";

export interface SlotRange {
  start: string;
  end: string;
}

export interface VisitLike {
  id?: string;
  start_datetime: string;
  end_datetime: string;
  location_lat: number | null;
  location_lng: number | null;
}

export interface RescheduleContext {
  itemId: string;
  resourceId: string;
  organizationId: string;
  durationMinutes: number;
  minAdvanceHours: number | null;
  /** Coordenadas JA guardadas na visita (nao se volta a geocodificar). */
  lat: number | null;
  lng: number | null;
  lunchBreak: LunchBreakConfig | null;
  countryCode: string;
  /** Visitas do recurso, sem a propria, lidas uma vez. */
  visitsPromise: Promise<VisitLike[]> | null;
}

export interface DayEvaluation {
  /** Horarios que o recurso tem e a deslocacao/almoco permitem. */
  offered: SlotRange[];
  /** Horarios livres que a deslocacao ou o almoco impedem. */
  travelRejected: SlotRange[];
}

// deno-lint-ignore no-explicit-any
type Supabase = any;

/** A funcao nova ainda nao existe na base (migration por aplicar). */
function isMissingFunction(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("could not find the function") || msg.includes("does not exist");
}

/**
 * Horarios livres do recurso nesse dia, sem contar `excludeItemId`.
 * Usa a funcao que exclui a visita; se ainda nao existir na base, cai na
 * funcao de sempre (com organizacao e antecedencia, mas a visita conta contra
 * si propria na capacidade e na sobreposicao).
 */
export async function fetchFreeSlots(
  supabase: Supabase,
  ctx: RescheduleContext,
  day: string,
): Promise<{ slots: { slot_start: string; slot_end: string }[]; error: unknown }> {
  const base = {
    p_resource_id: ctx.resourceId,
    p_date: day,
    p_duration_minutes: ctx.durationMinutes,
    p_organization_id: ctx.organizationId,
    p_min_advance_hours: ctx.minAdvanceHours,
  };
  const first = await supabase.rpc("get_resource_available_slots_excluding_item", {
    ...base,
    p_exclude_item_id: ctx.itemId,
  });
  if (!first.error) return { slots: first.data ?? [], error: null };
  if (!isMissingFunction(first.error)) return { slots: [], error: first.error };

  const fallback = await supabase.rpc("get_resource_available_slots", base);
  if (fallback.error) return { slots: [], error: fallback.error };
  return { slots: fallback.data ?? [], error: null };
}

function loadVisits(supabase: Supabase, ctx: RescheduleContext): Promise<VisitLike[]> {
  if (!ctx.visitsPromise) {
    ctx.visitsPromise = (async () => {
      const { data } = await supabase
        .from("schedule_item_assignees")
        .select("schedule_items(id, start_datetime, end_datetime, location_lat, location_lng, status)")
        .eq("resource_id", ctx.resourceId);
      return (data ?? [])
        // deno-lint-ignore no-explicit-any
        .map((a: any) => a.schedule_items)
        // deno-lint-ignore no-explicit-any
        .filter((si: any) => si && si.status !== "cancelled" && si.id !== ctx.itemId) as VisitLike[];
    })();
  }
  return ctx.visitsPromise;
}

/** Visitas do comercial nesse dia (dia UTC, como a marcacao), sem a propria. */
export function visitsOnDay(visits: readonly VisitLike[], day: string): VisitLike[] {
  const from = Date.parse(`${day}T00:00:00.000Z`);
  const to = Date.parse(`${day}T23:59:59.999Z`);
  return visits.filter((v) => {
    const t = Date.parse(v.start_datetime);
    return t >= from && t <= to;
  });
}

/** Parte os horarios livres entre os que a deslocacao/almoco permitem e os que nao. */
export function splitByTravel(params: {
  slots: readonly SlotRange[];
  neighbors: VisitLike[];
  lat: number | null;
  lng: number | null;
  lunchBreak: LunchBreakConfig | null;
}): DayEvaluation {
  const offered: SlotRange[] = [];
  const travelRejected: SlotRange[] = [];
  for (const s of params.slots) {
    const { feasible } = checkTravelFeasible({
      clientLat: params.lat,
      clientLng: params.lng,
      slotStart: s.start,
      slotEnd: s.end,
      neighbors: params.neighbors,
      lunchBreak: params.lunchBreak,
    });
    (feasible ? offered : travelRejected).push(s);
  }
  return { offered, travelRejected };
}

/** Uma visita pode ter varios comerciais: as funcoes publicas aceitam um contexto ou a lista. */
export type ContextOrContexts = RescheduleContext | readonly RescheduleContext[];

function asList(c: ContextOrContexts): readonly RescheduleContext[] {
  return Array.isArray(c) ? c : [c as RescheduleContext];
}

const startMs = (r: SlotRange) => new Date(r.start).getTime();

/**
 * Varios comerciais na mesma visita: um horario so e oferecido se passa para
 * TODOS (disponibilidade, capacidade, deslocacao e almoco de cada um). Recusado
 * por deslocacao se estava livre para todos mas algum nao consegue chegar.
 */
export function combineEvaluations(list: readonly DayEvaluation[]): DayEvaluation {
  if (list.length === 1) return list[0];
  const first = list[0];
  const offeredBy = list.map((e) => new Set(e.offered.map(startMs)));
  const freeBy = list.map((e) => new Set([...e.offered, ...e.travelRejected].map(startMs)));
  const universe = [...first.offered, ...first.travelRejected];
  const offered: SlotRange[] = [];
  const travelRejected: SlotRange[] = [];
  for (const s of universe) {
    const ms = startMs(s);
    if (!freeBy.every((f) => f.has(ms))) continue;
    (offeredBy.every((o) => o.has(ms)) ? offered : travelRejected).push(s);
  }
  return { offered, travelRejected };
}

export async function evaluateDay(
  supabase: Supabase,
  ctxs: ContextOrContexts,
  day: string,
): Promise<{ evaluation: DayEvaluation; error: unknown }> {
  const list = asList(ctxs);
  if (list.length === 1) return evaluateSingleDay(supabase, list[0], day);
  const results = await Promise.all(list.map((c) => evaluateSingleDay(supabase, c, day)));
  const failed = results.find((r) => r.error);
  if (failed) return { evaluation: { offered: [], travelRejected: [] }, error: failed.error };
  return { evaluation: combineEvaluations(results.map((r) => r.evaluation)), error: null };
}

async function evaluateSingleDay(
  supabase: Supabase,
  ctx: RescheduleContext,
  day: string,
): Promise<{ evaluation: DayEvaluation; error: unknown }> {
  const { slots, error } = await fetchFreeSlots(supabase, ctx, day);
  if (error) return { evaluation: { offered: [], travelRejected: [] }, error };

  const free: SlotRange[] = slots.map((s) => ({ start: s.slot_start, end: s.slot_end }));
  const needsTravel = (ctx.lat !== null && ctx.lng !== null) || !!ctx.lunchBreak;
  const neighbors = needsTravel && free.length > 0
    ? visitsOnDay(await loadVisits(supabase, ctx), day)
    : [];
  return {
    evaluation: splitByTravel({ slots: free, neighbors, lat: ctx.lat, lng: ctx.lng, lunchBreak: ctx.lunchBreak }),
    error: null,
  };
}

/** Dias de [startDate, endDate] com pelo menos um horario oferecido. */
export async function listDaysWithSlots(
  supabase: Supabase,
  ctx: ContextOrContexts,
  startDate: string,
  endDate: string,
): Promise<string[]> {
  const days: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const last = new Date(`${endDate}T00:00:00.000Z`);
  // Um mes, no maximo, para nao deixar um pedido publico varrer meses.
  for (let i = 0; cursor <= last && i < 62; i++) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const withSlots: string[] = [];
  const BATCH = 6;
  for (let i = 0; i < days.length; i += BATCH) {
    const batch = days.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async (day) => {
      const { evaluation, error } = await evaluateDay(supabase, ctx, day);
      return !error && evaluation.offered.length > 0;
    }));
    batch.forEach((day, idx) => { if (results[idx]) withSlots.push(day); });
  }
  return withSlots;
}

export type RescheduleVerdict =
  | { ok: true }
  | { ok: false; code: "SLOT_TAKEN"; error: string; reason: "unavailable" | "travel" | "check_failed" };

/** O horario pedido e um dos oferecidos ao recurso da visita nesse dia? */
export async function validateRescheduleSlot(
  supabase: Supabase,
  ctx: ContextOrContexts,
  slotStartIso: string,
): Promise<RescheduleVerdict> {
  const day = new Date(slotStartIso).toISOString().slice(0, 10);
  const { evaluation, error } = await evaluateDay(supabase, ctx, day);
  if (error) {
    return {
      ok: false, code: "SLOT_TAKEN", reason: "check_failed",
      error: "Não foi possível confirmar a disponibilidade. Tente novamente.",
    };
  }
  const ms = new Date(slotStartIso).getTime();
  if (evaluation.offered.some((s) => new Date(s.start).getTime() === ms)) return { ok: true };
  if (evaluation.travelRejected.some((s) => new Date(s.start).getTime() === ms)) {
    return {
      ok: false, code: "SLOT_TAKEN", reason: "travel",
      error: "Este horário já não é possível por causa das outras visitas do dia. Escolha outro.",
    };
  }
  return {
    ok: false, code: "SLOT_TAKEN", reason: "unavailable",
    error: "Este horário não está disponível. Escolha outro.",
  };
}

export interface RescheduleItemRow {
  id: string;
  organization_id: string;
  metadata: unknown;
  start_datetime: string;
  end_datetime: string;
  location_lat?: number | null;
  location_lng?: number | null;
}

/**
 * Regras da marcacao que valem para esta visita: antecedencia do formulario,
 * almoco e pais dos feriados (que ficam gravados para o ano do pedido).
 */
export async function loadRescheduleContext(
  supabase: Supabase,
  item: RescheduleItemRow,
  resourceId: string,
  opts: { years?: number[] } = {},
): Promise<RescheduleContext> {
  const metadata = (item.metadata && typeof item.metadata === "object")
    ? item.metadata as Record<string, unknown>
    : {};
  const formId = typeof metadata.form_id === "string" ? metadata.form_id : null;

  let minAdvanceHours: number | null = null;
  if (formId) {
    const { data: step } = await supabase
      .from("form_steps")
      .select("scheduling_min_advance_hours")
      .eq("form_id", formId)
      .eq("step_type", "scheduling")
      .limit(1)
      .maybeSingle();
    minAdvanceHours = step?.scheduling_min_advance_hours ?? null;
  }

  const { data: settings } = await supabase
    .from("schedule_settings")
    .select("country_code, timezone, lunch_window_start, lunch_window_end, lunch_duration_minutes")
    .eq("organization_id", item.organization_id)
    .maybeSingle();
  const countryCode = settings?.country_code || "PT";

  const startMs = new Date(item.start_datetime).getTime();
  const durationMs = new Date(item.end_datetime).getTime() - startMs;
  const durationMinutes = Number.isFinite(durationMs) && durationMs > 0
    ? Math.max(1, Math.round(durationMs / 60000))
    : 60;

  try {
    const years = opts.years && opts.years.length > 0 ? opts.years : [new Date().getUTCFullYear()];
    await ensureHolidaysPersisted(supabase, countryCode, years);
  } catch (e) {
    console.error("[rescheduleSlots] ensureHolidaysPersisted failed (non-fatal):", e);
  }

  return {
    itemId: item.id,
    resourceId,
    organizationId: item.organization_id,
    durationMinutes,
    minAdvanceHours,
    lat: item.location_lat ?? null,
    lng: item.location_lng ?? null,
    lunchBreak: buildLunchBreakConfig(settings),
    countryCode,
    visitsPromise: null,
  };
}

export type RescheduleTarget =
  | {
    ok: true;
    item: RescheduleItemRow & { status: string; board_id: string | null; location: string | null };
    /** Primeiro recurso da visita (ordem estavel). */
    resourceId: string;
    /** TODOS os recursos atribuidos, a validar todos. */
    resourceIds: string[];
    ctx: RescheduleContext;
    /** Um contexto por recurso (o primeiro e ctx). */
    ctxs: RescheduleContext[];
  }
  | { ok: false; error: string; code: "INVALID" | "EXPIRED" | "USED" | "CANCELLED" };

/** Token do link publico -> visita, recurso e regras. Mesmos codigos de erro do reagendamento. */
export async function resolveRescheduleTarget(
  supabase: Supabase,
  token: string,
  opts: { years?: number[] } = {},
): Promise<RescheduleTarget> {
  const { data: tokenRow } = await supabase
    .from("booking_tokens")
    .select("token, expires_at, used_at, schedule_item_id")
    .eq("token", token)
    .maybeSingle();
  if (!tokenRow) return { ok: false, error: "Este link não é válido.", code: "INVALID" };
  if (tokenRow.used_at) return { ok: false, error: "Este link já foi utilizado.", code: "USED" };
  if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: "Este link expirou.", code: "EXPIRED" };
  }

  const { data: item } = await supabase
    .from("schedule_items")
    .select("id, status, board_id, organization_id, metadata, start_datetime, end_datetime, location, location_lat, location_lng")
    .eq("id", tokenRow.schedule_item_id)
    .maybeSingle();
  if (!item) return { ok: false, error: "Este agendamento já não existe.", code: "INVALID" };
  if (item.status === "cancelled") {
    return { ok: false, error: "Este agendamento já foi cancelado.", code: "CANCELLED" };
  }

  const { data: assignees, error: assigneesError } = await supabase
    .from("schedule_item_assignees")
    .select("resource_id")
    .eq("item_id", item.id);
  if (assigneesError) {
    return { ok: false, error: "Não foi possível confirmar o técnico atribuído. Tente novamente.", code: "INVALID" };
  }
  const resourceIds = [
    ...new Set(
      // deno-lint-ignore no-explicit-any
      ((assignees ?? []) as any[]).map((a) => a.resource_id).filter((id): id is string => typeof id === "string" && id !== ""),
    ),
  ].sort();
  if (resourceIds.length === 0) {
    return { ok: false, error: "Não foi possível encontrar o técnico atribuído.", code: "INVALID" };
  }

  // As regras da visita (antecedencia, almoco, feriados) sao as mesmas para todos
  // os recursos: le-se uma vez e replica-se com o recurso de cada um.
  const ctx = await loadRescheduleContext(supabase, item, resourceIds[0], opts);
  const ctxs = [ctx, ...resourceIds.slice(1).map((id) => ({ ...ctx, resourceId: id, visitsPromise: null }))];
  return { ok: true, item, resourceId: resourceIds[0], resourceIds, ctx, ctxs };
}
