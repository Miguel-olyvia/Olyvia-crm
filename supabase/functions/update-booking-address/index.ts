import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { checkRateLimit, getClientIp, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT_BUCKET = 'update-booking-address';
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MINUTES = 5;

/**
 * Update Booking Address API
 *
 * PUBLIC endpoint — authenticated ONLY by a secret booking token.
 * Lets the customer correct the address stored on the lead behind a
 * booking_tokens.token, from the public "manage booking" page.
 *
 * POST /update-booking-address
 * Body: { token, morada, codigo_postal, localidade }
 * Returns (200): { success: true }
 * On problem (200 with error): { error, code }
 *   code ∈ 'INVALID' | 'EXPIRED' | 'USED'
 *
 * Notes:
 *  - Repeatable: this does NOT consume the token (the customer may edit again).
 *  - Only address-related keys in anew_leads.field_values are overwritten;
 *    everything else is preserved.
 *  - schedule_items.location is refreshed with a composed address string.
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

    const { token, morada, codigo_postal, localidade } = await req.json();

    if (!token || typeof token !== 'string') {
      return json({ error: 'Token em falta ou inválido.', code: 'INVALID' });
    }

    const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    const newMorada = clean(morada);
    const newPostal = clean(codigo_postal);
    const newLocalidade = clean(localidade);

    // 1. Resolve + validate token (exactly like get-booking).
    const { data: tokenRow } = await supabase
      .from('booking_tokens')
      .select('token, expires_at, used_at, schedule_item_id')
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

    const itemId = tokenRow.schedule_item_id;

    // 2. Load the schedule item (to find the linked lead).
    const { data: item } = await supabase
      .from('schedule_items')
      .select('id, metadata')
      .eq('id', itemId)
      .maybeSingle();

    if (!item) {
      return json({ error: 'Este agendamento já não existe.', code: 'INVALID' });
    }

    const metadata = (item.metadata && typeof item.metadata === 'object')
      ? item.metadata as Record<string, any>
      : {};
    let leadId: string | null = metadata.lead_id || null;

    // Fallback: find the lead via scheduled_visit_id when metadata is missing.
    if (!leadId) {
      const { data: leadByVisit } = await supabase
        .from('anew_leads')
        .select('id')
        .eq('scheduled_visit_id', itemId)
        .maybeSingle();
      leadId = leadByVisit?.id || null;
    }

    if (!leadId) {
      return json({ error: 'Não foi possível encontrar os seus dados. Contacte-nos.', code: 'INVALID' });
    }

    // 3. Load the current field_values so we merge instead of overwrite.
    const { data: lead } = await supabase
      .from('anew_leads')
      .select('field_values')
      .eq('id', leadId)
      .maybeSingle();

    const fv = (lead?.field_values && typeof lead.field_values === 'object' && !Array.isArray(lead.field_values))
      ? { ...(lead.field_values as Record<string, any>) }
      : {};

    // Overwrite ONLY the address-related keys, preferring whichever variant
    // already exists on the lead; otherwise fall back to the canonical key.
    const setField = (variants: string[], canonical: string, value: string) => {
      const existing = variants.find((k) => k in fv);
      fv[existing ?? canonical] = value;
    };
    setField(['address', 'morada'], 'morada', newMorada);
    setField(['postal_code', 'codigo_postal'], 'codigo_postal', newPostal);
    setField(['city', 'localidade', 'cidade'], 'localidade', newLocalidade);

    // 4. Persist the merged field_values on the lead.
    const { error: leadError } = await supabase
      .from('anew_leads')
      .update({ field_values: fv })
      .eq('id', leadId);
    if (leadError) {
      console.error('[update-booking-address] failed to update lead:', leadError);
      return json({ error: 'Não foi possível guardar a morada agora. Tente novamente.', code: 'RETRY' }, 503);
    }

    // 5. Refresh the composed location on the schedule item (best-effort).
    const composed = [newMorada, newPostal, newLocalidade]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(', ');
    const { error: itemError } = await supabase
      .from('schedule_items')
      .update({ location: composed })
      .eq('id', itemId);
    if (itemError) {
      console.error('[update-booking-address] failed to update schedule_item location:', itemError);
    }

    // NOTE: intentionally NOT burning the token — address edits are repeatable.
    return json({ success: true });
  } catch (error: unknown) {
    console.error('Error in update-booking-address:', error);
    await captureError(error, { function: "update-booking-address" });
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
