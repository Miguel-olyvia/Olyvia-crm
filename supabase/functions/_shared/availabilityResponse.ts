// Montagem PURA da resposta do calendario publico (public-availability).
//
// Regra de privacidade: a resposta tem SEMPRE a mesma forma, com ou sem
// restricao ao comercial dono. A unica diferenca visivel e o conjunto de
// horarios. Assim ninguem consegue confirmar que um email e conhecido a partir
// das chaves, de contagens ou de metadados (o book-slot tambem nao distingue
// conhecido de novo).
//
//  - nunca ha `preferred_resource_id`;
//  - `available_count` e uma constante, igual em todos os pedidos;
//  - `coverage` e calculado pelo chamador SEM o filtro do dono.

import type { AggregatedSlot } from "./slotAggregation.ts";

/** Valor constante de `available_count` em todos os horarios publicos. */
export const PUBLIC_AVAILABLE_COUNT = 1;

export interface PublicSlot {
  start: string;
  end: string;
  available_count: number;
}

export function toPublicSlots(
  slots: readonly Pick<AggregatedSlot, "start" | "end">[],
): PublicSlot[] {
  return slots.map((s) => ({
    start: s.start,
    end: s.end,
    available_count: PUBLIC_AVAILABLE_COUNT,
  }));
}

export function buildDayResponse(params: {
  slots: readonly Pick<AggregatedSlot, "start" | "end">[];
  coverage: boolean;
  timezone?: string | null;
  durationMinutes: number;
  scheduleConfig?: unknown;
}) {
  const { slots, coverage, timezone, durationMinutes, scheduleConfig } = params;
  return {
    slots: toPublicSlots(slots),
    timezone: timezone || "Europe/Lisbon",
    coverage,
    duration_minutes: durationMinutes,
    ...(scheduleConfig ? { schedule_config: scheduleConfig } : {}),
  };
}

export function buildMonthResponse(params: {
  availableDates: readonly string[];
  scheduleConfig: { timezone: string };
  durationMinutes: number;
}) {
  const { availableDates, scheduleConfig, durationMinutes } = params;
  return {
    available_dates: [...availableDates],
    schedule_config: scheduleConfig,
    timezone: scheduleConfig.timezone,
    duration_minutes: durationMinutes,
  };
}
