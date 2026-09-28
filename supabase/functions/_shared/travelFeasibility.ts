import { haversineKm } from "./distance.ts";

// Velocidade média assumida para converter distância em tempo de
// deslocação necessário, quando não há Google Maps (regra 13) -- estimativa
// por linha recta, não tempo real de estrada/trânsito. 35 km/h é uma
// aproximação razoável para deslocações urbanas/suburbanas em Portugal
// com trânsito; ajustável se a experiência real mostrar outro valor melhor.
const ASSUMED_AVG_SPEED_KMH = 35;

export function requiredTravelMinutes(distanceKm: number): number {
  return (distanceKm / ASSUMED_AVG_SPEED_KMH) * 60;
}

interface NeighborVisit {
  start_datetime: string;
  end_datetime: string;
  location_lat: number | null;
  location_lng: number | null;
}

/**
 * Verifica se um horário candidato cabe na agenda de um recurso nesse dia,
 * tendo em conta o tempo de deslocação real (estimado) desde/para a visita
 * imediatamente antes/depois -- regra 13, Lógica 1+2 (ver artefacto/registo
 * 23/09). Quando um lado não tem visita vizinha com coordenadas, esse lado
 * não é verificado (decisão tomada nesse mesmo desenho).
 *
 * clientLat/clientLng nulos (código postal não geocodificado, ou regra não
 * activa nesse passo) fazem esta função devolver sempre feasible=true --
 * fica um no-op, sem bloquear nada onde não há dados.
 */
export function checkTravelFeasible(params: {
  clientLat: number | null;
  clientLng: number | null;
  slotStart: string;
  slotEnd: string;
  neighbors: NeighborVisit[];
}): { feasible: boolean; reason?: string } {
  const { clientLat, clientLng, slotStart, slotEnd, neighbors } = params;
  if (clientLat === null || clientLng === null) return { feasible: true };

  const slotStartMs = new Date(slotStart).getTime();
  const slotEndMs = new Date(slotEnd).getTime();

  // Visita imediatamente antes (a que acaba mais tarde, entre as que acabam
  // antes do candidato começar) e imediatamente depois (a que começa mais
  // cedo, entre as que começam depois do candidato acabar).
  let before: NeighborVisit | null = null;
  let after: NeighborVisit | null = null;
  for (const n of neighbors) {
    if (n.location_lat === null || n.location_lng === null) continue;
    const nStart = new Date(n.start_datetime).getTime();
    const nEnd = new Date(n.end_datetime).getTime();
    if (nEnd <= slotStartMs) {
      if (!before || nEnd > new Date(before.end_datetime).getTime()) before = n;
    } else if (nStart >= slotEndMs) {
      if (!after || nStart < new Date(after.start_datetime).getTime()) after = n;
    }
  }

  if (before) {
    const km = haversineKm(clientLat, clientLng, before.location_lat!, before.location_lng!);
    const neededMin = requiredTravelMinutes(km);
    const gapMin = (slotStartMs - new Date(before.end_datetime).getTime()) / 60000;
    if (gapMin < neededMin) {
      return { feasible: false, reason: `not enough travel time from previous visit (${km.toFixed(1)}km, needs ~${Math.ceil(neededMin)}min, has ${Math.floor(gapMin)}min)` };
    }
  }

  if (after) {
    const km = haversineKm(clientLat, clientLng, after.location_lat!, after.location_lng!);
    const neededMin = requiredTravelMinutes(km);
    const gapMin = (new Date(after.start_datetime).getTime() - slotEndMs) / 60000;
    if (gapMin < neededMin) {
      return { feasible: false, reason: `not enough travel time to next visit (${km.toFixed(1)}km, needs ~${Math.ceil(neededMin)}min, has ${Math.floor(gapMin)}min)` };
    }
  }

  return { feasible: true };
}
