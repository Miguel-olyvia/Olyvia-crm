import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { checkRateLimit, getClientIp, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { cancelarConvite } from "../_shared/schedulingInvite.ts";

initSentry();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT_BUCKET = 'scheduling-invite-optout';
const RATE_LIMIT_MAX_ATTEMPTS = 20;
const RATE_LIMIT_WINDOW_MINUTES = 5;

/**
 * Scheduling Invite Opt-out API
 *
 * PUBLIC endpoint — authenticated ONLY by a scheduling-invite token. Lets a lead stop
 * receiving the "finish scheduling" recovery nudges ("já não quero receber"). Marks the
 * invite unsubscribed and cancels any still-pending nudge emails for that lead. Idempotent.
 *
 * POST /scheduling-invite-optout
 * Body: { token }
 * Returns (200): { success: true }  |  { error, code }  code ∈ 'INVALID'
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

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

    // Idempotente: marca o convite e cancela os emails pendentes da ENTIDADE
    // do convite (na organizacao do convite).
    const resultado = await cancelarConvite({ supabase, token });
    // Falha de base de dados: 503 RETRY, nunca um "sucesso" que nao aconteceu.
    if (!resultado.ok) return json({ error: resultado.error, code: resultado.code }, resultado.code === 'RETRY' ? 503 : 200);

    return json({ success: true });
  } catch (error: unknown) {
    console.error('Error in scheduling-invite-optout:', error);
    await captureError(error, { function: "scheduling-invite-optout" });
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
