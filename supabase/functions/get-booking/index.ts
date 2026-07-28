import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { checkRateLimit, getClientIp, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT_BUCKET = 'get-booking';
const RATE_LIMIT_MAX_ATTEMPTS = 20;
const RATE_LIMIT_WINDOW_MINUTES = 5;

/**
 * Get Booking API
 *
 * PUBLIC endpoint — authenticated ONLY by a secret booking token.
 * Loads the appointment behind a booking_tokens.token and returns a safe,
 * minimal payload for the public "manage booking" page.
 *
 * POST /get-booking
 * Body: { token }
 * Returns (200): {
 *   status, start_datetime, end_datetime, formatted_when,
 *   technician_name, location, board_id, form_id, step_number,
 *   organization_id, lead_name,
 *   address: { morada, codigo_postal, localidade }
 * }
 * On problem (200 with error): { error, code }
 *   code ∈ 'INVALID' | 'EXPIRED' | 'USED' | 'CANCELLED'
 */
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

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    const { token } = await req.json();

    if (!token || typeof token !== 'string') {
      return json({ error: 'Token em falta ou inválido.', code: 'INVALID' });
    }

    // 1. Resolve token
    const { data: tokenRow } = await supabase
      .from('booking_tokens')
      .select('token, action, expires_at, used_at, schedule_item_id')
      .eq('token', token)
      .maybeSingle();

    if (!tokenRow) {
      return json({ error: 'Este link não é válido.', code: 'INVALID' });
    }

    if (tokenRow.used_at) {
      return json({ error: 'Este link já foi utilizado.', code: 'USED' });
    }

    if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
      return json({ error: 'Este link expirou.', code: 'EXPIRED' });
    }

    // 2. Load schedule item
    const { data: item } = await supabase
      .from('schedule_items')
      .select('id, status, start_datetime, end_datetime, location, board_id, organization_id, metadata')
      .eq('id', tokenRow.schedule_item_id)
      .maybeSingle();

    if (!item) {
      return json({ error: 'Este agendamento já não existe.', code: 'INVALID' });
    }

    const metadata = (item.metadata && typeof item.metadata === 'object') ? item.metadata as Record<string, any> : {};
    const formId: string | null = metadata.form_id || null;
    const leadId: string | null = metadata.lead_id || null;

    // 3. Resolve scheduling step number for the form (used by the reschedule picker)
    let stepNumber: number | null = null;
    if (formId) {
      const { data: step } = await supabase
        .from('form_steps')
        .select('step_number')
        .eq('form_id', formId)
        .eq('step_type', 'scheduling')
        .order('step_number', { ascending: true })
        .limit(1)
        .maybeSingle();
      stepNumber = step?.step_number ?? null;
    }

    // 4. Resolve lead name (prefer field_values, fallback to entity display_name)
    //    and the current address the customer typed (keys vary across forms).
    let leadName = '';
    const address = { morada: '', codigo_postal: '', localidade: '' };
    if (leadId) {
      const { data: lead } = await supabase
        .from('anew_leads')
        .select('field_values, entity_id')
        .eq('id', leadId)
        .maybeSingle();
      const fv = (lead?.field_values && typeof lead.field_values === 'object' && !Array.isArray(lead.field_values))
        ? lead.field_values as Record<string, any>
        : {};
      const first = fv.first_name || fv.po_nome || fv.nome || '';
      const last = fv.last_name || fv.po_apelido || fv.apelido || '';
      leadName = [first, last].filter(Boolean).join(' ').trim();

      // Pick the first matching key among the known variants for each address field.
      const pick = (...keys: string[]): string => {
        for (const k of keys) {
          const v = fv[k];
          if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
        }
        return '';
      };
      address.morada = pick('address', 'morada');
      address.codigo_postal = pick('postal_code', 'codigo_postal');
      address.localidade = pick('city', 'localidade', 'cidade');

      if (!leadName && lead?.entity_id) {
        const { data: entity } = await supabase
          .from('anew_entities')
          .select('display_name')
          .eq('id', lead.entity_id)
          .maybeSingle();
        leadName = entity?.display_name || '';
      }
    }

    // 5. Resolve the assigned technician's name (schedule_item_assignees → schedule_resources → profiles)
    let technicianName = '';
    const { data: assignee } = await supabase
      .from('schedule_item_assignees')
      .select('resource_id')
      .eq('item_id', item.id)
      .limit(1)
      .maybeSingle();

    if (assignee?.resource_id) {
      const { data: resource } = await supabase
        .from('schedule_resources')
        .select('name, user_id')
        .eq('id', assignee.resource_id)
        .maybeSingle();
      technicianName = resource?.name || '';
      if (resource?.user_id) {
        const { data: prof } = await supabase
          .from('anew_users')
          .select('name')
          .eq('id', resource.user_id)
          .maybeSingle();
        if (prof?.name) technicianName = prof.name;
      }
    }

    const formattedWhen = new Date(item.start_datetime).toLocaleString('pt-PT', {
      timeZone: 'Europe/Lisbon',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return json({
      status: item.status,
      start_datetime: item.start_datetime,
      end_datetime: item.end_datetime,
      formatted_when: formattedWhen,
      technician_name: technicianName,
      location: item.location || '',
      board_id: item.board_id,
      form_id: formId,
      step_number: stepNumber,
      organization_id: item.organization_id,
      lead_name: leadName,
      address,
    });
  } catch (error: unknown) {
    console.error('Error in get-booking:', error);
    await captureError(error, { function: "get-booking" });
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
