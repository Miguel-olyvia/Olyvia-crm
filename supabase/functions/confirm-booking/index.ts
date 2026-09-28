import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { checkRateLimit, getClientIp, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT_BUCKET = 'confirm-booking';
const RATE_LIMIT_MAX_ATTEMPTS = 15;
const RATE_LIMIT_WINDOW_MINUTES = 1;

/**
 * Confirm Booking API (Regra 12)
 *
 * PUBLIC endpoint — authenticated ONLY by a secret booking token.
 * Only ever reached from the {{confirm_url}} link in the REMINDER email sent
 * to the CLIENT (never the technician's copy, never the initial booking
 * confirmation) — the token is created solely when a reminder is scheduled,
 * see book-slot §(b).
 *
 * POST /confirm-booking
 * Body: { token }
 * Returns (200): { success: true }  (idempotent — success if already confirmed)
 * On problem (200 with error): { error, code }
 *   code ∈ 'INVALID' | 'EXPIRED' | 'USED' | 'CANCELLED'
 *
 * Steps:
 *  - schedule_items.confirmed_at = now() (only if not already set)
 *  - notifications: alert the assigned commercial (fail-soft, muteable via alert_settings)
 *  - booking_tokens.used_at = now()
 *
 * No "never confirmed" handling here on purpose — out of scope for this
 * delivery (see artefacto, regra 12).
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

    // 1. Resolve + validate token
    const { data: tokenRow } = await supabase
      .from('booking_tokens')
      .select('token, action, expires_at, used_at, schedule_item_id')
      .eq('token', token)
      .maybeSingle();

    if (!tokenRow || tokenRow.action !== 'confirm') {
      return json({ error: 'Este link não é válido.', code: 'INVALID' });
    }
    if (tokenRow.used_at) {
      // Already confirmed — idempotent success, same as cancel-booking.
      return json({ success: true });
    }
    if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
      return json({ error: 'Este link expirou.', code: 'EXPIRED' });
    }

    const itemId = tokenRow.schedule_item_id;

    // 2. Load the schedule item
    const { data: item } = await supabase
      .from('schedule_items')
      .select('id, status, organization_id, metadata, confirmed_at')
      .eq('id', itemId)
      .maybeSingle();

    if (!item) {
      return json({ error: 'Este agendamento já não existe.', code: 'INVALID' });
    }
    if (item.status === 'cancelled') {
      return json({ error: 'Esta visita já foi cancelada.', code: 'CANCELLED' });
    }

    // 3. Mark confirmed (CRITICAL — must succeed before we burn the token)
    if (!item.confirmed_at) {
      const { error: confirmError } = await supabase
        .from('schedule_items')
        .update({ confirmed_at: new Date().toISOString() })
        .eq('id', itemId);
      if (confirmError) {
        console.error('[confirm-booking] failed to mark confirmed:', confirmError);
        return json({ error: 'Não foi possível confirmar agora. Tente novamente.', code: 'RETRY' }, 503);
      }
    }

    // 4. Burn the token (compare-and-swap: only if still unused)
    const { error: tokenError } = await supabase
      .from('booking_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('token', token)
      .is('used_at', null);
    if (tokenError) {
      console.error('[confirm-booking] failed to mark token used:', tokenError);
    }

    // 5. Notify the assigned commercial (fail-soft — confirmation already succeeded).
    try {
      const { data: assignee } = await supabase
        .from('schedule_item_assignees')
        .select('resource_id')
        .eq('item_id', itemId)
        .limit(1)
        .maybeSingle();

      if (assignee?.resource_id) {
        const { data: resource } = await supabase
          .from('schedule_resources')
          .select('user_id')
          .eq('id', assignee.resource_id)
          .maybeSingle();

        if (resource?.user_id) {
          const { data: prof } = await supabase
            .from('anew_users')
            .select('auth_user_id')
            .eq('id', resource.user_id)
            .maybeSingle();

          if (prof?.auth_user_id) {
            let notifEnabled = true;
            const { data: setting } = await supabase
              .from('alert_settings')
              .select('is_active')
              .eq('organization_id', item.organization_id)
              .eq('alert_type', 'schedule_confirmed_by_client')
              .eq('kind', 'notification')
              .maybeSingle();
            if (setting && setting.is_active === false) notifEnabled = false;

            if (notifEnabled) {
              const metadata = (item.metadata && typeof item.metadata === 'object')
                ? item.metadata as Record<string, any>
                : {};
              let leadName = 'Cliente';
              const leadId: string | null = metadata.lead_id || null;
              if (leadId) {
                const { data: lead } = await supabase
                  .from('anew_leads')
                  .select('field_values')
                  .eq('id', leadId)
                  .maybeSingle();
                const fv = (lead?.field_values && typeof lead.field_values === 'object' && !Array.isArray(lead.field_values))
                  ? lead.field_values as Record<string, any>
                  : {};
                leadName = [
                  fv.first_name || fv.po_nome || fv.nome || '',
                  fv.last_name || fv.po_apelido || fv.apelido || '',
                ].filter(Boolean).join(' ').trim() || 'Cliente';
              }

              await supabase.from('notifications').insert({
                user_id: prof.auth_user_id,
                organization_id: item.organization_id,
                type: 'schedule_confirmed_by_client',
                kind: 'notification',
                title: 'Visita confirmada pelo cliente',
                message: `${leadName} confirmou a visita.`,
                link: '/scheduling',
                entity_type: 'schedule_item',
                entity_id: itemId,
                data: { schedule_item_id: itemId, lead_id: leadId },
              });
            }
          }
        }
      }
    } catch (notifErr) {
      console.error('[confirm-booking] notification failed (non-fatal):', notifErr);
    }

    return json({ success: true });
  } catch (error: any) {
    console.error('Error in confirm-booking:', error);
    await captureError(error, { function: 'confirm-booking' });
    return json({ error: 'Erro interno.' }, 500);
  }
});
