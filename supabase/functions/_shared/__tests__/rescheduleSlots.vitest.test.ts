import { describe, expect, it, vi } from 'vitest';

// Os feriados vem de uma API externa: nos testes nao se chama a rede.
vi.mock('../ensureHolidays', () => ({ ensureHolidaysPersisted: vi.fn(async () => undefined) }));

import {
  evaluateDay,
  listDaysWithSlots,
  loadRescheduleContext,
  resolveRescheduleTarget,
  validateRescheduleSlot,
  visitsOnDay,
  type RescheduleContext,
} from '../rescheduleSlots';
import { buildLunchBreakConfig } from '../travelFeasibility';

// Fixture de distancia (igual a travelFeasibility.vitest): A-B ~ 20 min a 35 km/h.
const A = { lat: 38.7223, lng: -9.1393 };
const B = { lat: 38.8266, lng: -9.1393 };
const DAY = '2026-09-29';
const iso = (t: string) => `${DAY}T${t}Z`;

const ITEM_ID = 'item-1';
const RES_ID = 'res-1';
const ORG_ID = 'org-1';

type Row = Record<string, unknown>;
type RpcCall = { name: string; params: Record<string, unknown> };

/** Supabase simulado: tabelas fixas + rpc por nome. */
function makeSupabase(cfg: {
  tables?: Record<string, Row | Row[] | null>;
  rpc?: (name: string, params: Record<string, unknown>) => { data?: unknown; error?: unknown };
}) {
  const calls: RpcCall[] = [];
  const supabase = {
    calls,
    from(table: string) {
      const value = cfg.tables?.[table];
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: Array.isArray(value) ? (value[0] ?? null) : (value ?? null) }),
        then: (resolve: (v: unknown) => void) => resolve({ data: value ?? [] }),
      };
      return q;
    },
    async rpc(name: string, params: Record<string, unknown>) {
      calls.push({ name, params });
      const r = cfg.rpc?.(name, params) ?? { data: [] };
      return { data: r.data ?? null, error: r.error ?? null };
    },
  };
  return supabase;
}

function ctxFor(overrides: Partial<RescheduleContext> = {}): RescheduleContext {
  return {
    itemId: ITEM_ID,
    resourceId: RES_ID,
    organizationId: ORG_ID,
    durationMinutes: 60,
    minAdvanceHours: 24,
    lat: B.lat,
    lng: B.lng,
    lunchBreak: null,
    countryCode: 'PT',
    visitsPromise: null,
    ...overrides,
  };
}

const slot = (from: string, to: string) => ({ slot_start: iso(from), slot_end: iso(to) });

// Vizinhas do comercial: a visita de A que termina as 10:00Z e A PROPRIA visita
// (que, se contasse, recusava quase tudo).
const assignees = (extra: Row[] = []) => [
  { schedule_items: { id: 'outra', start_datetime: iso('09:00:00'), end_datetime: iso('10:00:00'), location_lat: A.lat, location_lng: A.lng, status: 'scheduled' } },
  { schedule_items: { id: ITEM_ID, start_datetime: iso('10:00:00'), end_datetime: iso('11:00:00'), location_lat: A.lat, location_lng: A.lng, status: 'scheduled' } },
  ...extra.map((schedule_items) => ({ schedule_items })),
];

describe('reagendar: deslocacao (com as coordenadas guardadas na visita)', () => {
  it('recusa a hora a que a deslocacao nao chega', async () => {
    const sb = makeSupabase({
      tables: { schedule_item_assignees: assignees() },
      rpc: () => ({ data: [slot('10:10:00', '11:10:00'), slot('10:30:00', '11:30:00')] }),
    });
    const verdict = await validateRescheduleSlot(sb, ctxFor(), iso('10:10:00'));
    expect(verdict).toMatchObject({ ok: false, code: 'SLOT_TAKEN', reason: 'travel' });
  });

  it('aceita a hora em que a deslocacao chega', async () => {
    const sb = makeSupabase({
      tables: { schedule_item_assignees: assignees() },
      rpc: () => ({ data: [slot('10:10:00', '11:10:00'), slot('10:30:00', '11:30:00')] }),
    });
    expect(await validateRescheduleSlot(sb, ctxFor(), iso('10:30:00'))).toEqual({ ok: true });
  });

  it('a propria visita nao conta como vizinha (nao se auto-recusa por deslocacao)', async () => {
    // A propria visita acaba as 10:05 em A: se contasse como vizinha, deixava
    // so 5 min para chegar a B (precisa de ~20) e recusava a hora 10:10.
    const onlyOwn = [{ schedule_items: { id: ITEM_ID, start_datetime: iso('09:05:00'), end_datetime: iso('10:05:00'), location_lat: A.lat, location_lng: A.lng, status: 'scheduled' } }];
    const sb = makeSupabase({
      tables: { schedule_item_assignees: onlyOwn },
      rpc: () => ({ data: [slot('11:00:00', '12:00:00'), slot('10:10:00', '11:10:00')] }),
    });
    expect(await validateRescheduleSlot(sb, ctxFor({ lat: B.lat, lng: B.lng }), iso('10:10:00'))).toEqual({ ok: true });
  });

  it('almoco: recusa quando a folga apos uma visita que acaba no almoco nao chega', async () => {
    const lunch = buildLunchBreakConfig({
      timezone: 'Europe/Lisbon', // 12:00-13:00 locais = 11:00Z-12:00Z
      lunch_window_start: '12:00:00',
      lunch_window_end: '13:00:00',
      lunch_duration_minutes: 60,
    });
    const acabaNoAlmoco = [{ schedule_items: { id: 'x', start_datetime: iso('10:30:00'), end_datetime: iso('11:30:00'), location_lat: null, location_lng: null, status: 'scheduled' } }];
    const sb = makeSupabase({
      tables: { schedule_item_assignees: acabaNoAlmoco },
      rpc: () => ({ data: [slot('12:00:00', '13:00:00'), slot('12:30:00', '13:30:00')] }),
    });
    const ctx = ctxFor({ lat: null, lng: null, lunchBreak: lunch });
    expect(await validateRescheduleSlot(sb, ctx, iso('12:00:00'))).toMatchObject({ ok: false, reason: 'travel' });
    expect(await validateRescheduleSlot(sb, ctx, iso('12:30:00'))).toEqual({ ok: true });
  });
});

describe('reagendar: disponibilidade do recurso da visita', () => {
  it('chama a funcao que EXCLUI a propria visita, com organizacao e antecedencia do formulario', async () => {
    const sb = makeSupabase({
      tables: { schedule_item_assignees: [] },
      // A hora antiga da propria visita e oferecida: nao se auto-conta.
      rpc: () => ({ data: [slot('10:00:00', '11:00:00')] }),
    });
    const verdict = await validateRescheduleSlot(sb, ctxFor({ minAdvanceHours: 48 }), iso('10:00:00'));
    expect(verdict).toEqual({ ok: true });
    expect(sb.calls).toHaveLength(1);
    expect(sb.calls[0].name).toBe('get_resource_available_slots_excluding_item');
    expect(sb.calls[0].params).toMatchObject({
      p_resource_id: RES_ID,
      p_date: DAY,
      p_duration_minutes: 60,
      p_organization_id: ORG_ID,
      p_min_advance_hours: 48,
      p_exclude_item_id: ITEM_ID,
    });
  });

  it('feriado, dia cheio ou fora da antecedencia (a funcao devolve nada): recusa como indisponivel', async () => {
    const sb = makeSupabase({ rpc: () => ({ data: [] }) });
    const verdict = await validateRescheduleSlot(sb, ctxFor(), iso('10:00:00'));
    expect(verdict).toMatchObject({ ok: false, code: 'SLOT_TAKEN', reason: 'unavailable' });
  });

  it('sem a migration (funcao nova em falta): cai na funcao antiga, ainda com organizacao e antecedencia', async () => {
    const sb = makeSupabase({
      tables: { schedule_item_assignees: [] },
      rpc: (name) => name === 'get_resource_available_slots_excluding_item'
        ? { error: { code: 'PGRST202', message: 'Could not find the function' } }
        : { data: [slot('10:00:00', '11:00:00')] },
    });
    expect(await validateRescheduleSlot(sb, ctxFor({ minAdvanceHours: 24 }), iso('10:00:00'))).toEqual({ ok: true });
    expect(sb.calls.map((c) => c.name)).toEqual([
      'get_resource_available_slots_excluding_item',
      'get_resource_available_slots',
    ]);
    expect(sb.calls[1].params).toMatchObject({ p_organization_id: ORG_ID, p_min_advance_hours: 24 });
    expect(sb.calls[1].params).not.toHaveProperty('p_exclude_item_id');
  });

  it('erro real da base: nao aceita nem diz que esta ocupado', async () => {
    const sb = makeSupabase({ rpc: () => ({ error: { code: 'XX000', message: 'boom' } }) });
    const verdict = await validateRescheduleSlot(sb, ctxFor(), iso('10:00:00'));
    expect(verdict).toMatchObject({ ok: false, reason: 'check_failed' });
    expect(sb.calls).toHaveLength(1);
  });
});

describe('calendario do reagendamento', () => {
  it('evaluateDay so devolve o que o recurso tem livre (nunca acrescenta)', async () => {
    const free = [slot('13:00:00', '14:00:00'), slot('15:00:00', '16:00:00')];
    const sb = makeSupabase({ tables: { schedule_item_assignees: [] }, rpc: () => ({ data: free }) });
    const { evaluation, error } = await evaluateDay(sb, ctxFor(), DAY);
    expect(error).toBeNull();
    expect(evaluation.offered.map((s) => s.start)).toEqual([iso('13:00:00'), iso('15:00:00')]);
  });

  it('listDaysWithSlots marca so os dias com horarios oferecidos', async () => {
    const sb = makeSupabase({
      tables: { schedule_item_assignees: [] },
      rpc: (_n, p) => ({ data: p.p_date === '2026-09-30' ? [slot('13:00:00', '14:00:00')] : [] }),
    });
    expect(await listDaysWithSlots(sb, ctxFor(), '2026-09-29', '2026-10-02')).toEqual(['2026-09-30']);
  });

  it('listDaysWithSlots limita o intervalo (pedido publico nao varre meses)', async () => {
    const sb = makeSupabase({ rpc: () => ({ data: [] }) });
    await listDaysWithSlots(sb, ctxFor(), '2026-01-01', '2027-12-31');
    expect(sb.calls.length).toBeLessThanOrEqual(62);
  });

  it('visitsOnDay so guarda as do dia', () => {
    const v = (d: string) => ({ start_datetime: `${d}T10:00:00Z`, end_datetime: `${d}T11:00:00Z`, location_lat: null, location_lng: null });
    expect(visitsOnDay([v('2026-09-28'), v(DAY), v('2026-09-30')], DAY)).toHaveLength(1);
  });
});

describe('reagendar: varios comerciais na visita, todos tem de poder', () => {
  const RES_2 = 'res-2';
  // res-1 tem 10:00 e 11:00 livres; res-2 so tem 11:00 e 12:00.
  const rpcByResource = (name: string, params: Record<string, unknown>) => {
    if (name !== 'get_resource_available_slots_excluding_item') return { data: [] };
    return params.p_resource_id === RES_ID
      ? { data: [slot('10:00:00', '11:00:00'), slot('11:00:00', '12:00:00')] }
      : { data: [slot('11:00:00', '12:00:00'), slot('12:00:00', '13:00:00')] };
  };
  const two = () => [ctxFor({ lat: null, lng: null }), ctxFor({ resourceId: RES_2, lat: null, lng: null })];

  it('so oferece o horario que passa para TODOS os comerciais', async () => {
    const sb = makeSupabase({ tables: { schedule_item_assignees: [] }, rpc: rpcByResource });
    const { evaluation } = await evaluateDay(sb, two(), DAY);
    expect(evaluation.offered.map((s) => s.start)).toEqual([iso('11:00:00')]);
  });

  it('recusa um horario livre para o primeiro mas nao para o segundo', async () => {
    const sb = makeSupabase({ tables: { schedule_item_assignees: [] }, rpc: rpcByResource });
    expect(await validateRescheduleSlot(sb, two(), iso('10:00:00'))).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(await validateRescheduleSlot(sb, two(), iso('12:00:00'))).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(await validateRescheduleSlot(sb, two(), iso('11:00:00'))).toEqual({ ok: true });
    // com so o primeiro no contexto (o comportamento antigo) a 10:00 passava
    expect(await validateRescheduleSlot(sb, ctxFor({ lat: null, lng: null }), iso('10:00:00'))).toEqual({ ok: true });
  });

  it('a deslocacao do SEGUNDO comercial tambem conta', async () => {
    // res-2 tem uma visita em A que acaba as 10:55; chegar a B as 11:00 e impossivel para ele.
    const sb = makeSupabase({ tables: {}, rpc: rpcByResource });
    (sb as any).from = (t: string) => {
      const q: any = {
        select: () => q,
        eq: (_c: string, v: string) => { q.res = v; return q; },
        maybeSingle: async () => ({ data: null }),
        then: (resolve: (v: unknown) => void) => resolve({
          data: t === 'schedule_item_assignees' && q.res === RES_2
            ? [{ schedule_items: { id: 'outra', start_datetime: iso('09:55:00'), end_datetime: iso('10:55:00'), location_lat: A.lat, location_lng: A.lng, status: 'scheduled' } }]
            : [],
        }),
      };
      return q;
    };
    const ctxs = [ctxFor({ lat: B.lat, lng: B.lng }), ctxFor({ resourceId: RES_2, lat: B.lat, lng: B.lng })];
    expect(await validateRescheduleSlot(sb, ctxs, iso('11:00:00'))).toMatchObject({ ok: false, reason: 'travel' });
  });

  it('um erro num dos comerciais nao deixa passar nada', async () => {
    const sb = makeSupabase({
      tables: { schedule_item_assignees: [] },
      rpc: (n, p) => (p.p_resource_id === RES_2 ? { error: { code: 'XX', message: 'boom' } } : rpcByResource(n, p)),
    });
    expect(await validateRescheduleSlot(sb, two(), iso('11:00:00'))).toMatchObject({ ok: false, reason: 'check_failed' });
  });

  it('listDaysWithSlots so marca o dia se ha horario comum', async () => {
    const sb = makeSupabase({
      tables: { schedule_item_assignees: [] },
      rpc: (_n, p) => (p.p_resource_id === RES_ID ? { data: [slot('10:00:00', '11:00:00')] } : { data: [slot('12:00:00', '13:00:00')] }),
    });
    expect(await listDaysWithSlots(sb, two(), DAY, DAY)).toEqual([]);
  });
});

describe('resolver o link e carregar as regras da visita', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const baseItem = {
    id: ITEM_ID, status: 'scheduled', board_id: 'board-1', organization_id: ORG_ID,
    metadata: { form_id: 'form-1' }, start_datetime: iso('10:00:00'), end_datetime: iso('11:30:00'),
    location: 'Rua X', location_lat: A.lat, location_lng: A.lng,
  };

  it('token inexistente, usado, expirado e visita cancelada: mesmos codigos de sempre', async () => {
    const run = (tables: Record<string, Row | Row[] | null>) =>
      resolveRescheduleTarget(makeSupabase({ tables }), 'tok');
    expect(await run({ booking_tokens: null })).toMatchObject({ ok: false, code: 'INVALID' });
    expect(await run({ booking_tokens: { expires_at: future, used_at: 'x', schedule_item_id: ITEM_ID } })).toMatchObject({ ok: false, code: 'USED' });
    expect(await run({ booking_tokens: { expires_at: '2020-01-01T00:00:00Z', used_at: null, schedule_item_id: ITEM_ID } })).toMatchObject({ ok: false, code: 'EXPIRED' });
    expect(await run({
      booking_tokens: { expires_at: future, used_at: null, schedule_item_id: ITEM_ID },
      schedule_items: { ...baseItem, status: 'cancelled' },
    })).toMatchObject({ ok: false, code: 'CANCELLED' });
  });

  it('visita sem recurso atribuido: INVALID', async () => {
    const r = await resolveRescheduleTarget(makeSupabase({ tables: {
      booking_tokens: { expires_at: future, used_at: null, schedule_item_id: ITEM_ID },
      schedule_items: baseItem,
      schedule_item_assignees: null,
    } }), 'tok');
    expect(r).toMatchObject({ ok: false, code: 'INVALID' });
  });

  it('caminho feliz: recurso, duracao real da visita, antecedencia do formulario e coordenadas guardadas', async () => {
    const r = await resolveRescheduleTarget(makeSupabase({ tables: {
      booking_tokens: { expires_at: future, used_at: null, schedule_item_id: ITEM_ID },
      schedule_items: baseItem,
      schedule_item_assignees: [{ resource_id: RES_ID }],
      form_steps: { scheduling_min_advance_hours: 72 },
      schedule_settings: { country_code: 'PT', timezone: 'Europe/Lisbon', lunch_window_start: '12:00:00', lunch_window_end: '13:00:00', lunch_duration_minutes: 60 },
    } }), 'tok', { years: [2026] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resourceId).toBe(RES_ID);
    expect(r.ctx).toMatchObject({
      itemId: ITEM_ID, resourceId: RES_ID, organizationId: ORG_ID,
      durationMinutes: 90, minAdvanceHours: 72, lat: A.lat, lng: A.lng,
    });
    expect(r.ctx.lunchBreak).not.toBeNull();
  });

  it('varios comerciais: devolve TODOS os recursos (ordem estavel), um contexto por recurso', async () => {
    const r = await resolveRescheduleTarget(makeSupabase({ tables: {
      booking_tokens: { expires_at: future, used_at: null, schedule_item_id: ITEM_ID },
      schedule_items: baseItem,
      schedule_item_assignees: [{ resource_id: 'res-2' }, { resource_id: RES_ID }, { resource_id: 'res-2' }],
      schedule_settings: null,
    } }), 'tok', { years: [2026] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resourceIds).toEqual([RES_ID, 'res-2']);
    expect(r.resourceId).toBe(RES_ID);
    expect(r.ctxs.map((c) => c.resourceId)).toEqual([RES_ID, 'res-2']);
    expect(r.ctxs[1]).toMatchObject({ itemId: ITEM_ID, durationMinutes: 90 });
    expect(r.ctxs[1].visitsPromise).toBeNull();
  });

  it('erro a ler os comerciais da visita: recusa (nao assume "sem tecnico" e nao valida so um)', async () => {
    const sb = makeSupabase({ tables: {
      booking_tokens: { expires_at: future, used_at: null, schedule_item_id: ITEM_ID },
      schedule_items: baseItem,
    } });
    const realFrom = sb.from.bind(sb);
    (sb as any).from = (t: string) => {
      const q = realFrom(t) as any;
      if (t === 'schedule_item_assignees') q.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: 'x' } });
      return q;
    };
    expect(await resolveRescheduleTarget(sb, 'tok')).toMatchObject({ ok: false, code: 'INVALID' });
  });

  it('sem formulario: sem antecedencia propria (a funcao ja poe "agora" como minimo)', async () => {
    const ctx = await loadRescheduleContext(
      makeSupabase({ tables: { schedule_settings: null } }),
      { ...baseItem, metadata: {} },
      RES_ID,
    );
    expect(ctx.minAdvanceHours).toBeNull();
    expect(ctx.lunchBreak).toBeNull();
  });
});
