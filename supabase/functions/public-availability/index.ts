import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { z } from "npm:zod";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  board_id: z.string().optional(),
  duration_minutes: z.number().optional(),
  include_settings: z.boolean().optional(),
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
      postal_code, board_id: directBoardId, duration_minutes: directDuration,
      include_settings,
    } = parsed.data;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let boardId = directBoardId || null;
    let durationMinutes = directDuration || 60;

    // Resolve board_id and duration from form_steps if form_id provided
    if (form_id && step_number && !boardId) {
      const { data: step, error: stepError } = await supabase
        .from('form_steps')
        .select('scheduling_board_id, scheduling_duration_minutes, step_type')
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

      boardId = step.scheduling_board_id;
      durationMinutes = step.scheduling_duration_minutes || 60;
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
    // MODE 1: Range query (P3) — returns daily availability map
    // ═══════════════════════════════════════════════════════
    if (start_date && end_date) {
      const { data: monthData, error: monthError } = await supabase.rpc('get_month_availability', {
        p_board_id: boardId,
        p_start_date: start_date,
        p_end_date: end_date,
        p_duration_minutes: durationMinutes,
        p_postal_code: postal_code || null,
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

      const availableDates = (monthData || [])
        .filter((d: any) => d.has_slots)
        .map((d: any) => d.available_date);

      console.log(`public-availability range: ${start_date}→${end_date}, board=${boardId}, postal=${postal_code || 'none'}, available_days=${availableDates.length}`);

      return new Response(
        JSON.stringify({
          available_dates: availableDates,
          schedule_config: scheduleConfig,
          timezone: scheduleConfig.timezone,
          duration_minutes: durationMinutes,
        }),
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

    // With postal_code: use proximity-based search via find_nearest_resources RPC
    if (postal_code) {
      const { data: resources, error: rpcError } = await supabase
        .rpc('find_nearest_resources', {
          p_target_postal_code: postal_code,
          p_board_id: boardId,
          p_target_date: date,
          p_duration_minutes: durationMinutes,
          p_limit: 10,
        });

      if (rpcError) {
        console.error('Error calling find_nearest_resources:', rpcError);
        return new Response(
          JSON.stringify({ error: 'Failed to find available resources', details: rpcError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const coverage = resources && resources.length > 0;
      const slotMap = new Map<string, { start: string; end: string; available_count: number; resource_ids: string[] }>();

      for (const resource of (resources || [])) {
        const slots = resource.available_slots || [];
        for (const slot of slots) {
          const key = `${slot.start}|${slot.end}`;
          if (slotMap.has(key)) {
            const existing = slotMap.get(key)!;
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

      const aggregatedSlots = Array.from(slotMap.values()).sort((a, b) =>
        new Date(a.start).getTime() - new Date(b.start).getTime()
      );

      console.log(`public-availability: date=${date}, postal=${postal_code}, board=${boardId}, resources=${(resources || []).length}, slots=${aggregatedSlots.length}`);

      return new Response(
        JSON.stringify({
          slots: aggregatedSlots.map(s => ({ start: s.start, end: s.end, available_count: s.available_count })),
          timezone: scheduleConfig?.timezone || 'Europe/Lisbon',
          coverage,
          duration_minutes: durationMinutes,
          ...(scheduleConfig ? { schedule_config: scheduleConfig } : {}),
        }),
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

    const slotMap = new Map<string, { start: string; end: string; available_count: number }>();

    for (const resource of (boardResources || [])) {
      const { data: slots } = await supabase
        .rpc('get_resource_available_slots', {
          p_resource_id: resource.id,
          p_date: date,
          p_duration_minutes: durationMinutes,
          p_organization_id: orgId,
        });

      for (const slot of (slots || [])) {
        const key = `${slot.slot_start}|${slot.slot_end}`;
        if (slotMap.has(key)) {
          slotMap.get(key)!.available_count++;
        } else {
          slotMap.set(key, {
            start: slot.slot_start,
            end: slot.slot_end,
            available_count: 1,
          });
        }
      }
    }

    const aggregatedSlots = Array.from(slotMap.values()).sort((a, b) =>
      new Date(a.start).getTime() - new Date(b.start).getTime()
    );

    console.log(`public-availability (no postal): date=${date}, board=${boardId}, resources=${(boardResources || []).length}, slots=${aggregatedSlots.length}`);

    return new Response(
      JSON.stringify({
        slots: aggregatedSlots,
        timezone: scheduleConfig?.timezone || 'Europe/Lisbon',
        coverage: aggregatedSlots.length > 0,
        duration_minutes: durationMinutes,
        ...(scheduleConfig ? { schedule_config: scheduleConfig } : {}),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in public-availability:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
