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

// Pausa de almoço somada ao tempo de deslocação (regra 13, complemento
// 28/09). Quando uma visita TERMINA dentro de (windowStartMin, windowEndMin]
// (hora local em timezone, início excluído, fim incluído), a folga até à
// marcação SEGUINTE desse comercial tem de ser deslocação + durationMinutes.
// Só conta o lado anterior ao candidato: uma visita que ocupa o almoço nunca
// é recusada por isso, e as visitas já marcadas depois dela não a impedem.
// windowEndMin serve só para decidir se a visita toca o almoço -- nunca é
// usado para calcular folgas: soma-se sempre a duração a partir do FIM da
// visita, nunca a partir do fim da janela (alternativa testada e rejeitada:
// dava zero minutos de almoço quando janela e visita terminavam ao mesmo
// instante).
export interface LunchBreakConfig {
  windowStartMin: number; // minutos desde 00:00, hora local
  windowEndMin: number; // idem, incluído
  durationMinutes: number;
  timezone: string; // IANA, ex. 'Europe/Lisbon'
}

const DEFAULT_LUNCH_TIMEZONE = 'Europe/Lisbon';

// 'HH:MM' ou 'HH:MM:SS' -> minutos desde 00:00; null se inválido.
function parseTimeOfDay(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

// Fonte única de verdade para os chamadores construírem a config de almoço
// a partir de uma linha de schedule_settings. null desliga a regra --
// omissão (qualquer um dos três campos em falta), janela inválida
// (start >= end) ou duração <= 0 desligam-na também, em vez de rebentar.
export function buildLunchBreakConfig(
  row:
    | {
        timezone?: string | null;
        lunch_window_start?: string | null;
        lunch_window_end?: string | null;
        lunch_duration_minutes?: number | null;
      }
    | null
    | undefined,
): LunchBreakConfig | null {
  if (!row) return null;
  const { lunch_window_start, lunch_window_end, lunch_duration_minutes } = row;
  if (lunch_window_start == null || lunch_window_end == null || lunch_duration_minutes == null) {
    return null;
  }
  const windowStartMin = parseTimeOfDay(lunch_window_start);
  const windowEndMin = parseTimeOfDay(lunch_window_end);
  if (windowStartMin === null || windowEndMin === null) return null;
  if (windowStartMin >= windowEndMin) return null;
  if (!(lunch_duration_minutes > 0)) return null;

  return {
    windowStartMin,
    windowEndMin,
    durationMinutes: lunch_duration_minutes,
    timezone: row.timezone || DEFAULT_LUNCH_TIMEZONE,
  };
}

// Minutos desde a meia-noite local (hora de cfg.timezone) em que `iso` cai,
// verificado contra [windowStartMin, windowEndMin], início excluído, fim incluído.
export function endsInsideLunchWindow(iso: string, cfg: LunchBreakConfig): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: cfg.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const totalMin = hour * 60 + minute;
  return totalMin > cfg.windowStartMin && totalMin <= cfg.windowEndMin;
}

// Minutos desde a meia-noite local (hora de `timezone`) em que cai `ms`.
function localMinutesOfDay(ms: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

// Janela de almoço em instantes absolutos, no dia LOCAL (fuso da organização)
// em que cai `slotStart`. Sem tabelas nem pesquisas: o desvio do fuso vem da
// hora local de slotStart. (Numa mudança de hora dentro do próprio dia o
// desvio pode errar uma hora; essas mudanças ocorrem de madrugada, e a
// janela típica, ao meio-dia, fica depois delas.)
export function lunchWindowBounds(
  slotStart: string,
  cfg: LunchBreakConfig,
): { startMs: number; endMs: number } {
  const ms = new Date(slotStart).getTime();
  const localMin = localMinutesOfDay(ms, cfg.timezone);
  const minuteFloorMs = ms - (ms % 60000);
  const dayStartMs = minuteFloorMs - localMin * 60000;
  return {
    startMs: dayStartMs + cfg.windowStartMin * 60000,
    endMs: dayStartMs + cfg.windowEndMin * 60000,
  };
}

interface LunchItem {
  startMs: number;
  endMs: number;
  lat: number | null;
  lng: number | null;
}

// Minutos livres dentro da janela: duração da janela menos a união das
// partes das visitas que caem nela.
export function freeLunchMinutes(
  items: ReadonlyArray<{ startMs: number; endMs: number }>,
  window: { startMs: number; endMs: number },
): number {
  const clipped = items
    .map((i) => ({ s: Math.max(i.startMs, window.startMs), e: Math.min(i.endMs, window.endMs) }))
    .filter((i) => i.e > i.s)
    .sort((a, b) => a.s - b.s);
  let busy = 0;
  let curS = 0;
  let curE = 0;
  let open = false;
  for (const c of clipped) {
    if (!open) {
      curS = c.s;
      curE = c.e;
      open = true;
    } else if (c.s <= curE) {
      curE = Math.max(curE, c.e);
    } else {
      busy += curE - curS;
      curS = c.s;
      curE = c.e;
    }
  }
  if (open) busy += curE - curS;
  return (window.endMs - window.startMs - busy) / 60000;
}

// Regra B (almoço, 29/09; 30/09 só o lado anterior): se as visitas JÁ
// MARCADAS do comercial nesse dia (sem contar o candidato) não deixam livre
// dentro da janela a duração do almoço, a marcação seguinte à última que toca
// a janela só pode começar depois de fim + deslocação + almoço. O candidato
// nunca é recusado por ocupar ou cobrir o almoço: só conta se vier DEPOIS da
// visita que o consumiu. Visitas marcadas depois do candidato não o impedem.
function checkLunchCoverage(params: {
  clientLat: number | null;
  clientLng: number | null;
  slotStartMs: number;
  slotStart: string;
  neighbors: NeighborVisit[];
  lunch: LunchBreakConfig;
}): { feasible: boolean; reason?: string } {
  const { clientLat, clientLng, slotStartMs, neighbors, lunch } = params;
  const window = lunchWindowBounds(params.slotStart, lunch);

  const items: LunchItem[] = neighbors.map((n) => ({
    startMs: new Date(n.start_datetime).getTime(),
    endMs: new Date(n.end_datetime).getTime(),
    lat: n.location_lat,
    lng: n.location_lng,
  }));

  if (freeLunchMinutes(items, window) >= lunch.durationMinutes) return { feasible: true };

  let last: LunchItem | null = null;
  for (const i of items) {
    const touches = Math.min(i.endMs, window.endMs) > Math.max(i.startMs, window.startMs);
    if (touches && (!last || i.endMs > last.endMs)) last = i;
  }
  if (!last || slotStartMs < last.endMs) return { feasible: true };

  // Se já há uma visita marcada entre `last` e o candidato, a marcação
  // seguinte a `last` é essa, não o candidato.
  const lastEndMs = last.endMs;
  if (items.some((i) => i.startMs >= lastEndMs && i.startMs < slotStartMs)) {
    return { feasible: true };
  }

  const travel =
    last.lat !== null && last.lng !== null && clientLat !== null && clientLng !== null
      ? requiredTravelMinutes(haversineKm(last.lat, last.lng, clientLat, clientLng))
      : 0;
  const needed = travel + lunch.durationMinutes;
  const gap = (slotStartMs - lastEndMs) / 60000;
  if (gap < needed) {
    return {
      feasible: false,
      reason: `lunch break not free in window (needs ~${Math.ceil(needed)}min after last visit in window incl. ${lunch.durationMinutes}min lunch, has ${Math.floor(gap)}min)`,
    };
  }
  return { feasible: true };
}

// Vizinha mais próxima antes/depois do candidato, com ou sem exigir
// coordenadas -- usado tanto para a deslocação (regra 13 original, só com
// coordenadas) como para o almoço (aplica-se mesmo sem coordenadas).
function findNearestNeighbors(
  neighbors: NeighborVisit[],
  slotStartMs: number,
  slotEndMs: number,
  requireCoords: boolean,
): { before: NeighborVisit | null; after: NeighborVisit | null } {
  let before: NeighborVisit | null = null;
  let after: NeighborVisit | null = null;
  for (const n of neighbors) {
    if (requireCoords && (n.location_lat === null || n.location_lng === null)) continue;
    const nStart = new Date(n.start_datetime).getTime();
    const nEnd = new Date(n.end_datetime).getTime();
    if (nEnd <= slotStartMs) {
      if (!before || nEnd > new Date(before.end_datetime).getTime()) before = n;
    } else if (nStart >= slotEndMs) {
      if (!after || nStart < new Date(after.start_datetime).getTime()) after = n;
    }
  }
  return { before, after };
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
 * fica um no-op, sem bloquear nada onde não há dados -- EXCEPTO quando
 * lunchBreak está configurado: a pausa de almoço aplica-se mesmo sem
 * coordenadas (a deslocação conta 0 nesse caso), para não desaparecer em
 * silêncio para leads por geocodificar (complemento 28/09).
 *
 * lunchBreak (opcional): quando presente, soma a duração do almoço ao tempo
 * de deslocação sempre que a visita ANTERIOR ao candidato TERMINA dentro da
 * janela configurada (início excluído, fim incluído) ou deixou o almoço sem
 * tempo livre. O candidato nunca é recusado por ocupar o almoço, e as visitas
 * já marcadas depois dele não contam para o almoço.
 * Omitir o parâmetro reproduz o comportamento de hoje byte a byte.
 */
export function checkTravelFeasible(params: {
  clientLat: number | null;
  clientLng: number | null;
  slotStart: string;
  slotEnd: string;
  neighbors: NeighborVisit[];
  lunchBreak?: LunchBreakConfig | null;
}): { feasible: boolean; reason?: string } {
  const { clientLat, clientLng, slotStart, slotEnd, neighbors } = params;
  const lunch = params.lunchBreak ?? null;
  const hasClient = clientLat !== null && clientLng !== null;
  if (!hasClient && !lunch) return { feasible: true };

  const slotStartMs = new Date(slotStart).getTime();
  const slotEndMs = new Date(slotEnd).getTime();

  // Vizinhas com coordenadas (para a deslocação) e vizinhas quaisquer (para
  // o almoço, que se aplica mesmo sem coordenadas).
  const { before, after } = findNearestNeighbors(neighbors, slotStartMs, slotEndMs, true);
  const { before: beforeAny } = findNearestNeighbors(neighbors, slotStartMs, slotEndMs, false);

  if (hasClient) {
    if (before) {
      const km = haversineKm(clientLat!, clientLng!, before.location_lat!, before.location_lng!);
      const neededMin = requiredTravelMinutes(km);
      const gapMin = (slotStartMs - new Date(before.end_datetime).getTime()) / 60000;
      if (gapMin < neededMin) {
        return { feasible: false, reason: `not enough travel time from previous visit (${km.toFixed(1)}km, needs ~${Math.ceil(neededMin)}min, has ${Math.floor(gapMin)}min)` };
      }
    }

    if (after) {
      const km = haversineKm(clientLat!, clientLng!, after.location_lat!, after.location_lng!);
      const neededMin = requiredTravelMinutes(km);
      const gapMin = (new Date(after.start_datetime).getTime() - slotEndMs) / 60000;
      if (gapMin < neededMin) {
        return { feasible: false, reason: `not enough travel time to next visit (${km.toFixed(1)}km, needs ~${Math.ceil(neededMin)}min, has ${Math.floor(gapMin)}min)` };
      }
    }
  }

  if (lunch) {
    // Lado anterior: a vizinha que acaba antes do candidato terminou dentro
    // da janela de almoço -- a folga até ao candidato tem de incluir a
    // deslocação (0 se faltarem coordenadas de um dos lados) + o almoço.
    if (beforeAny && endsInsideLunchWindow(beforeAny.end_datetime, lunch)) {
      const travel =
        hasClient && beforeAny.location_lat !== null && beforeAny.location_lng !== null
          ? requiredTravelMinutes(haversineKm(clientLat!, clientLng!, beforeAny.location_lat, beforeAny.location_lng))
          : 0;
      const needed = travel + lunch.durationMinutes;
      const gap = (slotStartMs - new Date(beforeAny.end_datetime).getTime()) / 60000;
      if (gap < needed) {
        return {
          feasible: false,
          reason: `lunch break after previous visit (needs ~${Math.ceil(needed)}min incl. ${lunch.durationMinutes}min lunch, has ${Math.floor(gap)}min)`,
        };
      }
    }

    const coverage = checkLunchCoverage({
      clientLat,
      clientLng,
      slotStartMs,
      slotStart,
      neighbors,
      lunch,
    });
    if (!coverage.feasible) return coverage;
  }

  return { feasible: true };
}
