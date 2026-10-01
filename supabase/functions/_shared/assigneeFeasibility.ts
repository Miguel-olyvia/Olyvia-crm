// Filtro determinista de um comercial para uma hora pedida. Usado pelo ramo
// sem IA e, depois da resposta, pelo ramo com IA do suggest-schedule-assignee,
// para os dois darem a mesma resposta. Puro e sem Deno.
import { checkTravelFeasible, type LunchBreakConfig } from './travelFeasibility.ts';
import { zonedLocalToIso } from './zonedTime.ts';

export interface AssigneeVisit {
  start: string;
  end: string;
  location_lat: number | null;
  location_lng: number | null;
}

export interface AssigneeScheduleForFeasibility {
  scheduled_items: AssigneeVisit[];
  daily_visits_count: number;
  weekly_visits_count: number;
}

export interface AssigneeFeasibilityContext {
  date: string; // YYYY-MM-DD, dia local
  timezone: string;
  durationMinutes: number;
  bufferMinutes: number;
  rules: { max_visits_per_day_per_employee: number; max_visits_per_week_per_employee: number };
  clientLat: number | null;
  clientLng: number | null;
  lunchBreak: LunchBreakConfig | null;
}

export interface RequestedRange {
  startIso: string;
  endIso: string;
}

export interface FeasibilityResult {
  feasible: boolean;
  reason?: string;
}

export function isAssigneeSlotFeasible(
  schedule: AssigneeScheduleForFeasibility,
  requested: RequestedRange | null,
  ctx: AssigneeFeasibilityContext,
): FeasibilityResult {
  if (schedule.daily_visits_count >= ctx.rules.max_visits_per_day_per_employee) {
    return { feasible: false, reason: 'limite diario de visitas atingido' };
  }
  if (schedule.weekly_visits_count >= ctx.rules.max_visits_per_week_per_employee) {
    return { feasible: false, reason: 'limite semanal de visitas atingido' };
  }
  if (!requested) return { feasible: true };

  const reqStart = new Date(requested.startIso).getTime();
  const reqEnd = new Date(requested.endIso).getTime();
  const bufferMs = ctx.bufferMinutes * 60000;

  for (const item of schedule.scheduled_items) {
    const itemStart = new Date(item.start).getTime();
    const itemEnd = new Date(item.end).getTime();
    if (
      (reqStart >= itemStart - bufferMs && reqStart < itemEnd + bufferMs) ||
      (reqEnd > itemStart - bufferMs && reqEnd <= itemEnd + bufferMs) ||
      (reqStart <= itemStart && reqEnd >= itemEnd)
    ) {
      return { feasible: false, reason: 'ja tem uma visita nesse horario' };
    }
  }

  if ((ctx.clientLat !== null && ctx.clientLng !== null) || ctx.lunchBreak) {
    const { feasible, reason } = checkTravelFeasible({
      clientLat: ctx.clientLat,
      clientLng: ctx.clientLng,
      slotStart: requested.startIso,
      slotEnd: requested.endIso,
      neighbors: schedule.scheduled_items.map((item) => ({
        start_datetime: item.start,
        end_datetime: item.end,
        location_lat: item.location_lat,
        location_lng: item.location_lng,
      })),
      lunchBreak: ctx.lunchBreak,
    });
    if (!feasible) return { feasible: false, reason: reason ?? 'sem tempo de deslocacao ou de almoco' };
  }

  return { feasible: true };
}

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

/**
 * Aplica o filtro determinista a uma sugestao devolvida pela IA. Nunca torna
 * disponivel quem a IA deu como indisponivel. Agenda em falta = indisponivel.
 * O suggested_time so se mantem se ele proprio passar no filtro.
 */
export function constrainAiSuggestion<
  T extends { available?: unknown; reason?: unknown; suggested_time?: unknown },
>(
  suggestion: T,
  schedule: AssigneeScheduleForFeasibility | undefined,
  requested: RequestedRange | null,
  ctx: AssigneeFeasibilityContext,
): T {
  const out: T = { ...suggestion };
  const baseReason = typeof out.reason === 'string' ? out.reason : '';
  const withReason = (why: string): string => (baseReason ? `${baseReason} (${why})` : why);

  if (!schedule) {
    out.available = false;
    out.reason = withReason('agenda do colaborador indisponivel');
    out.suggested_time = null;
    return out;
  }

  const check = isAssigneeSlotFeasible(schedule, requested, ctx);
  if (!check.feasible) {
    out.available = false;
    out.reason = withReason(check.reason ?? 'horario nao viavel');
  }

  const suggestedTime = out.suggested_time;
  if (suggestedTime !== null && suggestedTime !== undefined) {
    let keep = false;
    if (typeof suggestedTime === 'string' && HHMM.test(suggestedTime)) {
      const startIso = zonedLocalToIso(ctx.date, suggestedTime, ctx.timezone);
      if (startIso) {
        const endIso = new Date(new Date(startIso).getTime() + ctx.durationMinutes * 60000).toISOString();
        keep = isAssigneeSlotFeasible(schedule, { startIso, endIso }, ctx).feasible;
      }
    }
    if (!keep) out.suggested_time = null;
  }

  return out;
}
