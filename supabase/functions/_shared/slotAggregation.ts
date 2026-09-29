// Logica pura do calendario publico: junta os horarios dos recursos
// candidatos aplicando a regra 13 (deslocacao + pausa de almoco) a cada um,
// e, opcionalmente, restringe ao(s) recurso(s) do comercial dono.
//
// A restricao ao dono e SO uma intersecao: filtra os recursos ANTES de
// aplicar as mesmas verificacoes, por isso o resultado restrito e sempre um
// subconjunto do nao restrito para o mesmo pedido. Nunca acrescenta horarios.

import { checkTravelFeasible, type LunchBreakConfig } from "./travelFeasibility.ts";

export interface NeighborVisitLike {
  start_datetime: string;
  end_datetime: string;
  location_lat: number | null;
  location_lng: number | null;
}

export interface CandidateResource {
  resource_id: string;
  available_slots?: { start: string; end: string }[] | null;
}

export interface AggregatedSlot {
  start: string;
  end: string;
  available_count: number;
  resource_ids: string[];
}

/** Recursos a considerar: todos, ou so os do dono quando ha restricao. */
export function restrictResourcesToOwner<T extends { resource_id: string }>(
  resources: readonly T[],
  ownerResourceIds: readonly string[] | null,
): T[] {
  if (!ownerResourceIds || ownerResourceIds.length === 0) return [...resources];
  const allowed = new Set(ownerResourceIds);
  return resources.filter((r) => allowed.has(r.resource_id));
}

export function aggregateFeasibleSlots(params: {
  resources: readonly CandidateResource[];
  ownerResourceIds: readonly string[] | null;
  neighborsByResource: ReadonlyMap<string, NeighborVisitLike[]>;
  clientLat: number | null;
  clientLng: number | null;
  lunchBreak: LunchBreakConfig | null;
}): AggregatedSlot[] {
  const { resources, ownerResourceIds, neighborsByResource, clientLat, clientLng, lunchBreak } = params;
  const slotMap = new Map<string, AggregatedSlot>();

  for (const resource of restrictResourcesToOwner(resources, ownerResourceIds)) {
    const slots = resource.available_slots || [];
    if (slots.length === 0) continue;
    const neighbors = neighborsByResource.get(resource.resource_id) ?? [];

    for (const slot of slots) {
      const { feasible } = checkTravelFeasible({
        clientLat, clientLng, slotStart: slot.start, slotEnd: slot.end, neighbors, lunchBreak,
      });
      if (!feasible) continue;

      const key = `${slot.start}|${slot.end}`;
      const existing = slotMap.get(key);
      if (existing) {
        existing.available_count++;
        existing.resource_ids.push(resource.resource_id);
      } else {
        slotMap.set(key, {
          start: slot.start,
          end: slot.end,
          available_count: 1,
          resource_ids: [resource.resource_id],
        });
      }
    }
  }

  return Array.from(slotMap.values()).sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
}

/**
 * Modo mes: um dia so fica marcado se estava marcado (has_slots) E o dono tem
 * pelo menos um horario nesse dia. `ownerDaysWithSlots` vem da avaliacao
 * completa do dia (com deslocacao/almoco) so para os recursos do dono.
 */
export function intersectMonthDays(
  availableDates: readonly string[],
  ownerDaysWithSlots: ReadonlySet<string>,
): string[] {
  return availableDates.filter((d) => ownerDaysWithSlots.has(d));
}
