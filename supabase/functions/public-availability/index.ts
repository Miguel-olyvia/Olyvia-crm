import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { z } from "npm:zod";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, getClientIp, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { geocodePostalCode } from "../_shared/postcodeGeocode.ts";
import { checkTravelFeasible, buildLunchBreakConfig, type LunchBreakConfig } from "../_shared/travelFeasibility.ts";
import { ensureHolidaysPersisted } from "../_shared/ensureHolidays.ts";
import { resolveKnownOwnerFromContact } from "../_shared/knownOwner.ts";
import { normalizeEmailForMatch, normalizePhoneForMatch } from "../_shared/leadDedup.ts";
import { buildDayResponse, buildMonthResponse } from "../_shared/availabilityResponse.ts";
import { resolveRescheduleTarget, listDaysWithSlots, evaluateDay, type RescheduleContext } from "../_shared/rescheduleSlots.ts";
import {
  aggregateFeasibleSlots,
  intersectMonthDays,
  restrictResourcesToOwner,
  type AggregatedSlot,
  type NeighborVisitLike,
} from "../_shared/slotAggregation.ts";

initSentry();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT_BUCKET = 'public-availability';
const RATE_LIMIT_MAX_ATTEMPTS = 30;
const RATE_LIMIT_WINDOW_MINUTES = 1;

// Segundo limite, so para pedidos com contacto (email/telefone): trava a
// enumeracao de quem e conhecido na organizacao. Acima dele o contacto e
// ignorado (calendario completo), nunca ha erro para o visitante.
const CONTACT_RATE_LIMIT_BUCKET = 'public-availability-contact';
const CONTACT_RATE_LIMIT_MAX_ATTEMPTS = 60;
const CONTACT_RATE_LIMIT_WINDOW_MINUTES = 60;

/**
 * Public Availability API
 *
 * PUBLIC endpoint (no auth) — Returns available scheduling slots.
 * Supports two modes:
 *   1. Single date: { date } → returns slots for that day
 *   2. Date range: { start_date, end_date } → returns which days have availability (via get_month_availability RPC)
 */
const requestSchema = z.object({
  form_id: z.string().optional(),
  step_number: z.number().optional(),
  date: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  postal_code: z.string().optional(),
  district_id: z.string().uuid().optional(),
  board_id: z.string().optional(),
  duration_minutes: z.number().optional(),
  include_settings: z.boolean().optional(),
  // Contacto ja escrito pelo visitante, para o calendario mostrar so os
  // horarios do comercial dono quando a pessoa ja e lead/cliente.
  email: z.string().max(254).optional(),
  phone: z.string().max(40).optional(),
  // Reagendamento pelo link publico: o calendario passa a mostrar so os
  // horarios do recurso DA VISITA, com as regras da marcacao (ver
  // _shared/rescheduleSlots.ts). Quando vem, ignora-se board/duracao/contacto.
  booking_token: z.string().max(200).optional(),
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Rate limiting check — persistent, DB-backed; must come before any other DB work
    const clientIp = getClientIp(req);
    const rateLimit = await checkRateLimit(supabase, {
      bucket: RATE_LIMIT_BUCKET,
      identifier: clientIp,
      maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
      windowMinutes: RATE_LIMIT_WINDOW_MINUTES,
    });
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit, corsHeaders);
    }
    await recordRateLimitAttempt(supabase, RATE_LIMIT_BUCKET, clientIp);

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const {
      form_id, step_number, date, start_date, end_date,
      postal_code, district_id, board_id: directBoardId, duration_minutes: directDuration,
      include_settings, email, phone, booking_token,
    } = parsed.data;

    let boardId = directBoardId || null;
    let durationMinutes = directDuration || 60;
    // Regra 1 (antecedencia minima): so resolvida a partir do passo do
    // formulario, tal como a duracao -- um pedido que passe board_id/duration
    // directos (sem form_id) fica sem restricao, mesmo padrao ja existente
    // para durationMinutes acima.
    let minAdvanceHours: number | null = null;

    // Reagendamento pelo link: recurso, duracao, antecedencia e regras vem da
    // VISITA, nao do pedido.
    let rescheduleCtx: RescheduleContext[] | null = null;
    if (booking_token) {
      const refDay = start_date || date;
      const y1 = refDay ? parseInt(refDay.substring(0, 4)) : new Date().getUTCFullYear();
      const y2 = end_date ? parseInt(end_date.substring(0, 4)) : y1;
      const years: number[] = [];
      for (let y = y1; y <= y2 && years.length < 3; y++) years.push(y);
      const target = await resolveRescheduleTarget(supabase, booking_token, { years });
      if (!target.ok) {
        return new Response(
          JSON.stringify({ error: target.error, code: target.code }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      rescheduleCtx = target.ctxs;
      boardId = target.item.board_id;
      durationMinutes = target.ctx.durationMinutes;
      minAdvanceHours = target.ctx.minAdvanceHours;
    }

    // Resolve minAdvanceHours (and board/duration when not passed directly)
    // from form_steps whenever form_id+step_number are given. Antes disto só
    // corria quando board_id não vinha no pedido -- mas o formulário público
    // (SchedulingStep.tsx) manda SEMPRE board_id e duration_minutes como
    // props diretas, então este bloco nunca chegava a correr em produção e a
    // antecedência mínima nunca era lida para o calendário de nenhum
    // formulário real (só passava quando testado sem esses parâmetros).
    if (!rescheduleCtx && form_id && step_number) {
      const { data: step, error: stepError } = await supabase
        .from('form_steps')
        .select('scheduling_board_id, scheduling_duration_minutes, scheduling_min_advance_hours, step_type')
        .eq('form_id', form_id)
        .eq('step_number', step_number)
        .single();

      if (stepError || !step) {
        return new Response(
          JSON.stringify({ error: 'Form step not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (step.step_type !== 'scheduling') {
        return new Response(
          JSON.stringify({ error: 'Step is not a scheduling step' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      boardId = boardId || step.scheduling_board_id;
      durationMinutes = directDuration || step.scheduling_duration_minutes || 60;
      minAdvanceHours = step.scheduling_min_advance_hours ?? null;
    }

    if (!boardId) {
      return new Response(
        JSON.stringify({ error: 'No scheduling board configured for this step' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get board's organization
    const { data: board } = await supabase
      .from('schedule_boards')
      .select('organization_id')
      .eq('id', boardId)
      .single();

    const orgId = board?.organization_id;
    if (!orgId) {
      return new Response(
        JSON.stringify({ error: 'Board not found or has no organization' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Regra 16: garante que os feriados do(s) ano(s) pedidos já estão
    // gravados em schedule_holidays ANTES de qualquer RPC de disponibilidade
    // correr -- sem isto, um feriado nunca gravado deixava marcar na mesma,
    // mesmo aparecendo riscado no calendário (ver ensureHolidays.ts).
    let lunchBreak: LunchBreakConfig | null = null;
    {
      const { data: orgSettings } = await supabase
        .from('schedule_settings')
        .select('country_code, timezone, lunch_window_start, lunch_window_end, lunch_duration_minutes')
        .eq('organization_id', orgId)
        .maybeSingle();
      lunchBreak = buildLunchBreakConfig(orgSettings);
      const countryCode = orgSettings?.country_code || 'PT';
      const refDate = start_date || date;
      if (refDate) {
        const startYear = parseInt(refDate.substring(0, 4));
        const endYear = end_date ? parseInt(end_date.substring(0, 4)) : startYear;
        const years: number[] = [];
        for (let y = startYear; y <= endYear; y++) years.push(y);
        await ensureHolidaysPersisted(supabase, countryCode, years);
      }
    }

    // Helper: fetch schedule config for the org
    const fetchScheduleConfig = async () => {
      const [settingsRes, holidaysRes] = await Promise.all([
        supabase
          .from('schedule_settings')
          .select('working_days, working_hours_start, working_hours_end, timezone, country_code, week_starts_on')
          .eq('organization_id', orgId)
          .maybeSingle(),
        supabase
          .from('schedule_holidays')
          .select('holiday_date, name')
          .or(`organization_id.eq.${orgId},organization_id.is.null`)
          .gte('holiday_date', `${(start_date || date).substring(0, 4)}-01-01`)
          .lte('holiday_date', `${(start_date || date).substring(0, 4)}-12-31`)
          .order('holiday_date'),
      ]);

      const settings = settingsRes.data;
      let holidayDates: string[] = (holidaysRes.data || []).map((h: any) => h.holiday_date);

      // If no holidays in DB, try fetching from API
      if (holidayDates.length === 0) {
        try {
          const countryCode = settings?.country_code || 'PT';
          const year = parseInt((start_date || date).substring(0, 4));
          const apiUrl = `${supabaseUrl}/functions/v1/fetch-holidays`;
          const hRes = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify({ countryCode, year }),
          });
          const hData = await hRes.json();
          holidayDates = (hData.holidays || []).map((h: any) => h.holiday_date);
        } catch (e) {
          console.error('Failed to fetch holidays from API:', e);
        }
      }

      return {
        working_days: settings?.working_days || [1, 2, 3, 4, 5],
        working_hours_start: settings?.working_hours_start || '09:00',
        working_hours_end: settings?.working_hours_end || '18:00',
        timezone: settings?.timezone || 'Europe/Lisbon',
        week_starts_on: settings?.week_starts_on ?? 1,
        holidays: holidayDates,
      };
    };

    // ═══════════════════════════════════════════════════════
    // Reagendamento: so o recurso da visita, com as regras da marcacao
    // ═══════════════════════════════════════════════════════
    // Mesma forma de resposta que o calendario normal. So REDUZ: parte do que
    // o recurso tem livre (sem contar a propria visita) e retira o que a
    // deslocacao/almoco nao permite. A validacao final (reschedule-booking)
    // usa exactamente o mesmo modulo.
    if (rescheduleCtx) {
      if (!start_date && !date) {
        return new Response(
          JSON.stringify({ error: 'date is required (YYYY-MM-DD) or start_date + end_date for range' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (start_date && end_date) {
        const scheduleConfig = await fetchScheduleConfig();
        const availableDates = await listDaysWithSlots(supabase, rescheduleCtx, start_date, end_date);
        console.log(`public-availability reschedule range: ${start_date}→${end_date}, available_days=${availableDates.length}`);
        return new Response(
          JSON.stringify(buildMonthResponse({ availableDates, scheduleConfig, durationMinutes })),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const scheduleConfig: any = include_settings ? await fetchScheduleConfig() : undefined;
      const { evaluation, error: dayError } = await evaluateDay(supabase, rescheduleCtx, date!);
      if (dayError) {
        console.error('public-availability reschedule day failed:', dayError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch availability' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log(`public-availability reschedule: date=${date}, offered=${evaluation.offered.length}, travel_rejected=${evaluation.travelRejected.length}`);
      return new Response(
        JSON.stringify(buildDayResponse({
          slots: evaluation.offered,
          coverage: evaluation.offered.length > 0,
          timezone: scheduleConfig?.timezone,
          durationMinutes,
          scheduleConfig,
        })),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ═══════════════════════════════════════════════════════
    // Restricao ao comercial dono (so REDUZ, nunca acrescenta)
    // ═══════════════════════════════════════════════════════
    // Quando o visitante e uma lead/cliente ja conhecida, so contam os recursos
    // do comercial a quem a ficha esta ligada. E uma INTERSECAO aplicada depois
    // de/junto com todas as regras (cobertura do distrito, antecedencia,
    // capacidade, ausencias, conflitos, feriados, deslocacao e almoco): o
    // recurso do dono passa pelas mesmas verificacoes que passaria sem
    // restricao. Sem entidade, sem dono, ou dono sem recurso activo => null =>
    // comportamento igual ao de sempre (o book-slot protege no fim).
    let ownerResourceIds: string[] | null = null;
    const contactEmail = normalizeEmailForMatch(email);
    const contactPhone = normalizePhoneForMatch(phone) ? phone : null;
    if ((contactEmail || contactPhone) && orgId) {
      // Limite proprio (anti-enumeracao): acima dele o contacto e ignorado e o
      // visitante ve o calendario completo, nunca um erro.
      const contactLimit = await checkRateLimit(supabase, {
        bucket: CONTACT_RATE_LIMIT_BUCKET,
        identifier: clientIp,
        maxAttempts: CONTACT_RATE_LIMIT_MAX_ATTEMPTS,
        windowMinutes: CONTACT_RATE_LIMIT_WINDOW_MINUTES,
      });
      if (contactLimit.allowed) {
        await recordRateLimitAttempt(supabase, CONTACT_RATE_LIMIT_BUCKET, clientIp);
        try {
          const ids = await resolveKnownOwnerFromContact({
            supabase, organizationId: orgId, email: contactEmail, phone: contactPhone,
          });
          ownerResourceIds = ids.length > 0 ? ids : null;
        } catch (ownerErr) {
          // Falha ao identificar: sem restricao (como hoje), nunca bloqueia.
          console.error('public-availability: owner lookup failed (continuing unrestricted):', ownerErr);
        }
      } else {
        console.log('public-availability: contact rate limit hit, ignoring contact');
      }
    }
    const restricted = ownerResourceIds !== null;

    // Coordenadas exactas do cliente via CP7 (regra 13), geocodificadas uma so vez.
    const cp7Digits = (postal_code || '').replace(/[^0-9]/g, '');
    let coordsPromise: Promise<void> | null = null;
    let clientLat: number | null = null;
    let clientLng: number | null = null;
    const resolveClientCoords = (): Promise<void> => {
      if (!coordsPromise) {
        coordsPromise = (async () => {
          if (cp7Digits.length !== 7) return;
          const geo = await geocodePostalCode(cp7Digits);
          if (geo) {
            clientLat = geo.latitude;
            clientLng = geo.longitude;
          }
        })();
      }
      return coordsPromise;
    };

    // Visitas de cada recurso (nao canceladas), lidas uma vez por recurso.
    const visitsCache = new Map<string, NeighborVisitLike[]>();
    const loadVisits = async (resourceId: string): Promise<NeighborVisitLike[]> => {
      const cached = visitsCache.get(resourceId);
      if (cached) return cached;
      const { data: assignedItems } = await supabase
        .from('schedule_item_assignees')
        .select('schedule_items(start_datetime, end_datetime, location_lat, location_lng, status)')
        .eq('resource_id', resourceId);
      const visits = (assignedItems || [])
        .map((a: any) => a.schedule_items)
        .filter((si: any) => si && si.status !== 'cancelled') as NeighborVisitLike[];
      visitsCache.set(resourceId, visits);
      return visits;
    };

    // Regra 13, no calendário (não só na confirmação final): um horário só
    // deve aparecer como escolhível se pelo menos UM comercial candidato
    // conseguir mesmo lá chegar a tempo -- não basta ter a agenda livre.
    // Cada comercial é verificado contra os SEUS próprios compromissos
    // vizinhos nesse dia; se um não der, outro pode dar. Com `restrictTo`, so
    // os recursos do dono entram -- e passam por exactamente esta verificacao.
    const evaluateDayWithProximity = async (day: string, restrictTo: string[] | null) => {
      const { data: resources, error: rpcError } = await supabase
        .rpc('find_nearest_resources', {
          p_target_postal_code: postal_code || null,
          p_board_id: boardId,
          p_target_date: day,
          p_duration_minutes: durationMinutes,
          p_limit: 10,
          p_district_id: district_id || null,
          p_min_advance_hours: minAdvanceHours,
        });
      if (rpcError) return { rpcError, resources: [] as any[], allResources: [] as any[], slots: [] as AggregatedSlot[] };

      const candidates = restrictResourcesToOwner<any>(resources || [], restrictTo);
      await resolveClientCoords();

      const dayStart = `${day}T00:00:00.000Z`;
      const dayEnd = `${day}T23:59:59.999Z`;
      const neighborsByResource = new Map<string, NeighborVisitLike[]>();
      if ((clientLat !== null && clientLng !== null) || lunchBreak) {
        for (const resource of candidates) {
          if ((resource.available_slots || []).length === 0) continue;
          const visits = await loadVisits(resource.resource_id);
          neighborsByResource.set(
            resource.resource_id,
            visits.filter((si) => si.start_datetime >= dayStart && si.start_datetime <= dayEnd),
          );
        }
      }

      const slots = aggregateFeasibleSlots({
        resources: candidates,
        ownerResourceIds: null, // ja restringido acima
        neighborsByResource,
        clientLat, clientLng, lunchBreak,
      });
      // allResources = lista ANTES do filtro do dono: e daqui que sai o `coverage`,
      // para ser igual com e sem restricao.
      return { rpcError: null, resources: candidates, allResources: (resources || []) as any[], slots };
    };

    // Sem CP nem distrito: todos os recursos activos da organizacao (ou so os do dono).
    const evaluateDayWithoutPostal = async (day: string, resourceIds: string[]) => {
      const slotMap = new Map<string, { start: string; end: string; available_count: number }>();
      for (const resourceId of resourceIds) {
        const { data: slots } = await supabase
          .rpc('get_resource_available_slots', {
            p_resource_id: resourceId,
            p_date: day,
            p_duration_minutes: durationMinutes,
            p_organization_id: orgId,
            p_min_advance_hours: minAdvanceHours,
          });
        for (const slot of (slots || [])) {
          const key = `${slot.slot_start}|${slot.slot_end}`;
          const existing = slotMap.get(key);
          if (existing) {
            existing.available_count++;
          } else {
            slotMap.set(key, { start: slot.slot_start, end: slot.slot_end, available_count: 1 });
          }
        }
      }
      return Array.from(slotMap.values()).sort((a, b) =>
        new Date(a.start).getTime() - new Date(b.start).getTime()
      );
    };

    // ═══════════════════════════════════════════════════════
    // MODE 1: Range query (P3) — returns daily availability map
    // ═══════════════════════════════════════════════════════
    if (start_date && end_date) {
      const { data: monthData, error: monthError } = await supabase.rpc('get_month_availability', {
        p_board_id: boardId,
        p_start_date: start_date,
        p_end_date: end_date,
        p_duration_minutes: durationMinutes,
        p_postal_code: postal_code || null,
        p_district_id: district_id || null,
        p_min_advance_hours: minAdvanceHours,
      });

      if (monthError) {
        console.error('Error calling get_month_availability:', monthError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch monthly availability', details: monthError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Always include schedule_config for range requests
      const scheduleConfig = await fetchScheduleConfig();

      let availableDates: string[] = (monthData || [])
        .filter((d: any) => d.has_slots)
        .map((d: any) => d.available_date);
      const unrestrictedDayCount = availableDates.length;

      if (ownerResourceIds) {
        // Um dia so fica marcado se estava marcado hoje (get_month_availability)
        // E o recurso do dono tem mesmo um horario nesse dia depois de todas as
        // regras (incluindo deslocacao e almoco). Subconjunto por construcao.
        const ownerIds = ownerResourceIds;
        const ownerDays = new Set<string>();
        const BATCH = 6;
        for (let i = 0; i < availableDates.length; i += BATCH) {
          const batch = availableDates.slice(i, i + BATCH);
          if (postal_code || district_id) await resolveClientCoords();
          const results = await Promise.all(batch.map(async (day) => {
            if (postal_code || district_id) {
              const r = await evaluateDayWithProximity(day, ownerIds);
              return r.rpcError ? false : r.slots.length > 0;
            }
            return (await evaluateDayWithoutPostal(day, ownerIds)).length > 0;
          }));
          batch.forEach((day, idx) => { if (results[idx]) ownerDays.add(day); });
        }
        availableDates = intersectMonthDays(availableDates, ownerDays);
      }

      console.log(`public-availability range: ${start_date}→${end_date}, board=${boardId}, postal=${postal_code || 'none'}, restricted=${restricted}, unrestricted_days=${unrestrictedDayCount}, available_days=${availableDates.length}`);

      return new Response(
        JSON.stringify(buildMonthResponse({ availableDates, scheduleConfig, durationMinutes })),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ═══════════════════════════════════════════════════════
    // MODE 2: Single date query — returns time slots
    // ═══════════════════════════════════════════════════════
    if (!date) {
      return new Response(
        JSON.stringify({ error: 'date is required (YYYY-MM-DD) or start_date + end_date for range' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Optionally fetch schedule config
    let scheduleConfig: any = undefined;
    if (include_settings) {
      scheduleConfig = await fetchScheduleConfig();
    }

    // With postal_code and/or district_id: use find_nearest_resources RPC,
    // which already implements the district-coverage rule.
    if (postal_code || district_id) {
      const { rpcError, resources, allResources, slots: aggregatedSlots } = await evaluateDayWithProximity(date, ownerResourceIds);

      if (rpcError) {
        console.error('Error calling find_nearest_resources:', rpcError);
        return new Response(
          JSON.stringify({ error: 'Failed to find available resources', details: rpcError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Cobertura da lista completa (antes do filtro do dono), igual ao pedido sem email.
      const coverage = allResources.length > 0;

      console.log(`public-availability: date=${date}, postal=${postal_code || 'none'}, district=${district_id || 'none'}, board=${boardId}, restricted=${restricted}, resources=${resources.length}, slots=${aggregatedSlots.length}`);

      return new Response(
        // Forma identica com e sem restricao: sem preferred_resource_id e com
        // available_count constante (ver _shared/availabilityResponse.ts).
        JSON.stringify(buildDayResponse({
          slots: aggregatedSlots,
          coverage,
          timezone: scheduleConfig?.timezone,
          durationMinutes,
          scheduleConfig,
        })),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Without postal_code: get all resources for this board's organization
    const { data: boardResources, error: brError } = await supabase
      .from('schedule_resources')
      .select('id, name')
      .eq('organization_id', orgId)
      .eq('is_active', true);

    if (brError) {
      console.error('Error fetching board resources:', brError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch resources' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allowedOwnerIds = ownerResourceIds ? new Set<string>(ownerResourceIds) : null;
    const resourceIdsForDay = (boardResources || [])
      .map((r: any) => r.id as string)
      .filter((id: string) => !allowedOwnerIds || allowedOwnerIds.has(id));

    const aggregatedSlots = await evaluateDayWithoutPostal(date, resourceIdsForDay);

    // Cobertura calculada SEM o filtro do dono, igual ao pedido sem email. So
    // se recalcula quando o dono nao tem horarios (com horarios, ha cobertura).
    let coverage = aggregatedSlots.length > 0;
    if (allowedOwnerIds && !coverage) {
      const allIds = (boardResources || []).map((r: any) => r.id as string);
      coverage = (await evaluateDayWithoutPostal(date, allIds)).length > 0;
    }

    console.log(`public-availability (no postal): date=${date}, board=${boardId}, restricted=${restricted}, resources=${resourceIdsForDay.length}, slots=${aggregatedSlots.length}`);

    return new Response(
      JSON.stringify(buildDayResponse({
        slots: aggregatedSlots,
        coverage,
        timezone: scheduleConfig?.timezone,
        durationMinutes,
        scheduleConfig,
      })),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in public-availability:', error);
    await captureError(error, { function: "public-availability" });
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
