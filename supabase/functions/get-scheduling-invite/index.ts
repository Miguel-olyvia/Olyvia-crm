import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { checkRateLimit, getClientIp, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { resolverConvite } from "../_shared/schedulingInvite.ts";

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

    // O convite aponta a entidade e a SUBMISSAO a retomar; `lead_id` na resposta
    // e o id dessa submissao (a chave de continuacao que o formulario ja usa).
    const convite = await resolverConvite({ supabase, token });
    if (!convite.ok) {
      return json({
        error: convite.error,
        code: convite.code,
        ...(convite.already_booked ? { already_booked: true } : {}),
      }, convite.code === 'RETRY' ? 503 : 200);
    }

    return json({
      form_id: convite.form_id,
      step_number: convite.step_number,
      lead_id: convite.lead_id,
      organization_id: convite.organization_id,
      field_values: convite.field_values,
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
