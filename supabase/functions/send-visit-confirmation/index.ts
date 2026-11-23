import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { z } from 'npm:zod';
import { resolveCallerIdentity, validateOrgScope, authErrorResponse, getServiceRoleKey } from '../_shared/auth.ts';
import { getCorsHeadersExtended } from '../_shared/cors.ts';
import { checkRateLimit, recordRateLimitAttempt, rateLimitResponse } from '../_shared/rateLimit.ts';
import { initSentry, captureError } from '../_shared/sentry.ts';
import { sendEmailDetailed } from '../_shared/formEmails.ts';
import { sendSmsNow } from '../_shared/sendSms.ts';
import { createReminderLines } from '../_shared/reminderLines.ts';
import { processClaimedRows } from '../_shared/visitConfirmationProcessor.ts';
import type { ClaimedConfirmationRow } from '../_shared/visitConfirmationProcessor.ts';

initSentry();

/**
 * Send Visit Confirmation
 *
 * Envia ao cliente o email/SMS de confirmacao quando a EMPRESA confirma a visita
 * na Agenda (modo 'agenda_confirm'). As linhas nascem na fila
 * visit_confirmation_sends pelo gatilho da base; esta funcao so as processa.
 *
 * Duas formas de chamar (verify_jwt = false em config.toml; autentica-se aqui):
 *  - Ecra da Agenda, logo a seguir a gravar (JWT do utilizador):
 *      POST { schedule_item_id } -> processa SO as linhas dessa visita.
 *      Exige scheduling.items.edit com ambito sobre a visita.
 *  - Processamento em lote (process-scheduled-emails a cada minuto, com a
 *    credencial interna que ja traz do cron):
 *      POST { } ou { schedule_item_id } -> processa as linhas pendentes.
 *
 * A linha e reclamada (pending -> sending) por fn_visit_confirmation_claim com
 * FOR UPDATE SKIP LOCKED: os dois caminhos nunca enviam a mesma linha duas vezes.
 *
 * Resposta 200: { processed, sent, skipped, retried, failed, reminders }
 */

const requestSchema = z.object({
  schedule_item_id: z.string().uuid().optional(),
});

const RATE_LIMIT_BUCKET = 'send-visit-confirmation';
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MINUTES = 10;
const BATCH_LIMIT = 25;

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeadersExtended(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, getServiceRoleKey());
    const caller = await resolveCallerIdentity(req, admin);

    const rawBody = await req.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(rawBody ?? {});
    if (!parsed.success) return json({ error: 'Invalid request', details: parsed.error.issues }, 400);
    const itemId = parsed.data.schedule_item_id ?? null;

    if (!caller.isServiceRole) {
      // Utilizador: so a visita que pode editar.
      if (!itemId) return json({ error: 'schedule_item_id e obrigatorio.' }, 400);

      const { data: item } = await admin
        .from('schedule_items')
        .select('id, organization_id, created_by, user_id')
        .eq('id', itemId)
        .maybeSingle();
      if (!item) return json({ error: 'Agendamento nao encontrado.' }, 404);

      if (!(await validateOrgScope(admin, caller, item.organization_id))) {
        return json({ error: 'Sem acesso a esta organizacao.' }, 403);
      }

      // Mesmo predicado da politica de UPDATE de schedule_items (e do notify-schedule-change).
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
      );
      const { data: scopeRows } = await userClient.rpc('get_schedule_item_scope_context', {
        p_org_id: item.organization_id,
        p_permission_code: 'scheduling.items.edit',
      });
      const scopeCtx = Array.isArray(scopeRows) ? scopeRows[0] : scopeRows;
      const appliedScope: string | null = scopeCtx?.applied_scope ?? null;
      const ownerIds: string[] = Array.isArray(scopeCtx?.owner_ids) ? scopeCtx.owner_ids : [];
      let inScope = appliedScope === 'ORG'
        || (!!item.created_by && ownerIds.includes(item.created_by))
        || (!!item.user_id && ownerIds.includes(item.user_id));
      if (!inScope && ownerIds.length > 0) {
        const { data: assigned } = await admin.rpc('schedule_item_assigned_to_owners', {
          p_item_id: itemId,
          p_owner_ids: ownerIds,
        });
        inScope = assigned === true;
      }
      if (!inScope) return json({ error: 'Sem permissao para editar este agendamento.' }, 403);

      const rateLimit = await checkRateLimit(admin, {
        bucket: RATE_LIMIT_BUCKET,
        identifier: itemId,
        maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
        windowMinutes: RATE_LIMIT_WINDOW_MINUTES,
      });
      if (!rateLimit.allowed) return rateLimitResponse(rateLimit, corsHeaders);
      await recordRateLimitAttempt(admin, RATE_LIMIT_BUCKET, itemId);
    }

    const { data: claimed, error: claimErr } = await admin.rpc('fn_visit_confirmation_claim', {
      p_item_id: itemId,
      p_limit: BATCH_LIMIT,
    });
    if (claimErr) {
      console.error('[send-visit-confirmation] claim falhou:', claimErr);
      return json({ error: 'Nao foi possivel ler a fila de confirmacoes.' }, 500);
    }
    const rows = (Array.isArray(claimed) ? claimed : []) as ClaimedConfirmationRow[];
    if (rows.length === 0) {
      return json({ processed: 0, sent: 0, skipped: 0, retried: 0, failed: 0, reminders: 0 });
    }

    const summary = await processClaimedRows(rows, {
      supabase: admin,
      sendEmail: (p) => sendEmailDetailed(p),
      sendSms: (p) => sendSmsNow(p),
      createReminders: (p) => createReminderLines(p),
      siteUrl: Deno.env.get('SITE_URL') || 'https://olyvia.lovable.app',
      now: () => new Date(),
    });
    return json(summary);
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return authErrorResponse(error, corsHeaders);
    }
    console.error('[send-visit-confirmation] erro:', error);
    await captureError(error, { function: 'send-visit-confirmation' });
    return json({ error: 'Internal server error' }, 500);
  }
});
