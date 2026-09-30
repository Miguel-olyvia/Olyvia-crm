// O comercial DONO de uma ficha ja existente e sempre o prioritario: os seus
// recursos sao avaliados DIRECTAMENTE, sem passar por find_nearest_resources.
// Nao ha corte de proximidade (limite de 10 no calendario, 50 na marcacao), nem
// veto de cobertura de distrito, nem distancia maxima -- o dono vale fora da
// zona dele.
//
// Continuam a aplicar-se as regras REAIS da agenda, todas dentro de
// get_resource_available_slots (horario de trabalho e fuso, capacidade diaria,
// ausencias, feriados, antecedencia minima, conflitos) e, aqui, a deslocacao
// (regra 13, so com coordenadas) e o almoco.
//
// Calendario (dia e mes) e marcacao (book-slot) usam ESTA funcao: o que o
// calendario oferece e o que a marcacao aceita. Este modulo e puro; as
// chamadas a base entram por `deps`, e so makeOwnerDeps fala com ela.

import {
  aggregateFeasibleSlots,
  type AggregatedSlot,
  type CandidateResource,
  type NeighborVisitLike,
} from "./slotAggregation.ts";
import { visitsOnDay } from "./rescheduleSlots.ts";
import type { LunchBreakConfig } from "./travelFeasibility.ts";

export interface OwnerSlotRange {
  start: string;
  end: string;
}

export interface OwnerDeps {
  /** Horarios livres do recurso nesse dia, com todas as regras da agenda. */
  getSlots(resourceId: string, day: string): Promise<{ slots: OwnerSlotRange[]; error: unknown }>;
  /** Visitas nao canceladas do recurso (com cache por recurso). */
  getVisits(resourceId: string): Promise<NeighborVisitLike[]>;
}

/** Um mes, no maximo, para nao deixar um pedido publico varrer meses. */
export const MAX_OWNER_RANGE_DAYS = 62;

export async function evaluateOwnerDay(params: {
  ownerResourceIds: readonly string[];
  day: string;
  clientLat: number | null;
  clientLng: number | null;
  lunchBreak: LunchBreakConfig | null;
  deps: OwnerDeps;
}): Promise<{ slots: AggregatedSlot[]; error: unknown }> {
  const { ownerResourceIds, day, clientLat, clientLng, lunchBreak, deps } = params;
  const needsNeighbors = (clientLat !== null && clientLng !== null) || !!lunchBreak;
  const resources: CandidateResource[] = [];
  const neighborsByResource = new Map<string, NeighborVisitLike[]>();

  for (const resourceId of ownerResourceIds) {
    const { slots, error } = await deps.getSlots(resourceId, day);
    if (error) return { slots: [], error };
    resources.push({ resource_id: resourceId, available_slots: slots });
    if (needsNeighbors && slots.length > 0) {
      neighborsByResource.set(resourceId, visitsOnDay(await deps.getVisits(resourceId), day));
    }
  }

  return {
    slots: aggregateFeasibleSlots({
      resources, ownerResourceIds: null, neighborsByResource, clientLat, clientLng, lunchBreak,
    }),
    error: null,
  };
}

/** Recursos do dono que tem mesmo o horario pedido (compara instantes, nao texto). */
export function ownerResourcesForSlot(
  slots: readonly AggregatedSlot[],
  start: string,
  end: string,
): string[] {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const ids: string[] = [];
  for (const s of slots) {
    if (Date.parse(s.start) === startMs && Date.parse(s.end) === endMs) {
      for (const id of s.resource_ids) if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

/**
 * Dias de [start, end] que podem ter horarios: dia de trabalho (0 = domingo),
 * nao feriado e nao passado. So poupa chamadas; a decisao final e sempre da
 * propria RPC de horarios. No maximo MAX_OWNER_RANGE_DAYS dias corridos.
 */
export function candidateDays(
  start: string,
  end: string,
  workingDays: readonly number[],
  holidays: readonly string[],
  today: string,
): string[] {
  const holidaySet = new Set(holidays);
  const days: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  for (let i = 0; cursor <= last && i < MAX_OWNER_RANGE_DAYS; i++) {
    const day = cursor.toISOString().slice(0, 10);
    if (day >= today && workingDays.includes(cursor.getUTCDay()) && !holidaySet.has(day)) {
      days.push(day);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/**
 * A unica parte com base. Passa SEMPRE `p_organization_id`: sem ele a RPC deixa
 * de aplicar feriados, dias uteis e antecedencia minima.
 */
export function makeOwnerDeps(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  organizationId: string,
  durationMinutes: number,
  minAdvanceHours: number | null,
): OwnerDeps {
  const visitsCache = new Map<string, Promise<NeighborVisitLike[]>>();
  return {
    async getSlots(resourceId, day) {
      const { data, error } = await supabase.rpc("get_resource_available_slots", {
        p_resource_id: resourceId,
        p_date: day,
        p_duration_minutes: durationMinutes,
        p_organization_id: organizationId,
        p_min_advance_hours: minAdvanceHours,
      });
      if (error) return { slots: [], error };
      return {
        // deno-lint-ignore no-explicit-any
        slots: (data || []).map((s: any) => ({ start: s.slot_start as string, end: s.slot_end as string })),
        error: null,
      };
    },
    getVisits(resourceId) {
      let cached = visitsCache.get(resourceId);
      if (!cached) {
        cached = (async () => {
          const { data } = await supabase
            .from("schedule_item_assignees")
            .select("schedule_items(start_datetime, end_datetime, location_lat, location_lng, status)")
            .eq("resource_id", resourceId);
          return (data || [])
            // deno-lint-ignore no-explicit-any
            .map((a: any) => a.schedule_items)
            // deno-lint-ignore no-explicit-any
            .filter((si: any) => si && si.status !== "cancelled") as NeighborVisitLike[];
        })();
        visitsCache.set(resourceId, cached);
      }
      return cached;
    },
  };
}

/**
 * `coverage` do dia de um dono conhecido. Vem da lista de proximidade, mas os
 * horarios vem do dono; um dono fora da zona daria coverage=false COM horarios,
 * combinacao que um desconhecido nunca recebe (para ele coverage=false implica
 * horarios vazios) e denunciaria que o contacto e conhecido. Por isso: coverage
 * e true sempre que ha horarios. Sem horarios, vale o da proximidade.
 */
export function coverageForOwnerDay(
  coverageFromProximity: boolean,
  slots: readonly unknown[],
): boolean {
  return coverageFromProximity || slots.length > 0;
}
