import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { checkRateLimit, getClientIp, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT_BUCKET = 'get-scheduling-invite';
const RATE_LIMIT_MAX_ATTEMPTS = 20;
const RATE_LIMIT_WINDOW_MINUTES = 5;

/**
 * Get Scheduling Invite API
 *
 * PUBLIC endpoint — authenticated ONLY by a secret scheduling-invite token.
 * Resolves the token minted by create-lead for a lead that completed a scheduling
 * form WITHOUT booking a slot, so the public form can resume that lead at the
 * scheduling step (prefilled) and let the visitor finish booking their visit.
 *
 * POST /get-scheduling-invite
 * Body: { token }
 * Returns (200): { form_id, step_number, lead_id, field_values, organization_id, already_booked }
 * On problem (200 with error): { error, code }  code ∈ 'INVALID' | 'EXPIRED' | 'USED' | 'BOOKED'
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Rate limiting — a token-guessing attacker gets 20 tries per IP per 5min.
    // Must come before any DB lookup of the token itself.
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

    const { data: invite } = await supabase
      .from('scheduling_invites')
      .select('token, lead_id, form_id, step_number, organization_id, expires_at, used_at')
      .eq('token', token)
      .maybeSingle();

    if (!invite) return json({ error: 'Este link não é válido.', code: 'INVALID' });
    if (invite.used_at) return json({ error: 'Este link já foi utilizado.', code: 'USED' });
    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      return json({ error: 'Este link expirou.', code: 'EXPIRED' });
    }

    // If the lead already booked a visit in the meantime, there's nothing to resume.
    const { data: lead } = await supabase
      .from('anew_leads')
      .select('field_values, scheduled_visit_id')
      .eq('id', invite.lead_id)
      .maybeSingle();

    if (!lead) return json({ error: 'Este pedido já não existe.', code: 'INVALID' });
    if (lead.scheduled_visit_id) {
      return json({ error: 'A sua visita já está agendada.', code: 'BOOKED', already_booked: true });
    }

    const field_values = (lead.field_values && typeof lead.field_values === 'object' && !Array.isArray(lead.field_values))
      ? lead.field_values
      : {};

    return json({
      form_id: invite.form_id,
      step_number: invite.step_number,
      lead_id: invite.lead_id,
      organization_id: invite.organization_id,
      field_values,
      already_booked: false,
    });
  } catch (error: unknown) {
    console.error('Error in get-scheduling-invite:', error);
    await captureError(error, { function: "get-scheduling-invite" });
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
