import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import {
  loadFormEmailConfig,
  sendEmailNow,
  defaultMeetingHtml,
  buildManageUrl,
} from '../_shared/formEmails.ts';
import { sendSmsNow } from '../_shared/sendSms.ts';
import { resolveCallerIdentity, validateOrgScope, authErrorResponse } from '../_shared/auth.ts';
import { getCorsHeadersExtended } from '../_shared/cors.ts';
import { checkRateLimit, recordRateLimitAttempt, rateLimitResponse } from '../_shared/rateLimit.ts';
import { initSentry, captureError } from '../_shared/sentry.ts';
import { resolveNoticeKind, buildNoticeCopy } from '../_shared/scheduleChangeNotice.ts';
import { z } from 'npm:zod';

initSentry();

/**
 * Notify Schedule Change API
 *
 * AUTHENTICATED endpoint (verify_jwt = true, default — no config.toml entry).
 * Called by the internal Agenda screen (src/pages/Scheduling.tsx) right after
 * a team member manually reschedules a visit or changes its assigned
 * commercial. Sends an optional client/lead notice, gated per-organization by
 * schedule_settings.notify_client_on_reschedule / notify_client_on_reassign.
 *
 * POST /notify-schedule-change
 * Body: { schedule_item_id: uuid, changes: ('datetime'|'assignee')[] }
 * Returns (200): { sent: { email: boolean; sms: boolean }, skipped: string | null }
 *
 * Never writes to the database (no metadata, no scheduled_emails/scheduled_sms
 * rows) and never reschedules reminders — out of scope, see plan section 6.
 */

const requestSchema = z.object({
  schedule_item_id: z.string().uuid(),
  changes: z.array(z.enum(['datetime', 'assignee'])).min(1).max(2),
});

const RATE_LIMIT_BUCKET = 'notify-schedule-change';
const RATE_LIMIT_MAX_ATTEMPTS = 6;
const RATE_LIMIT_WINDOW_MINUTES = 10;

function extractFieldValues(fv: unknown): Record<string, unknown> {
  return (fv && typeof fv === 'object' && !Array.isArray(fv)) ? (fv as Record<string, unknown>) : {};
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeadersExtended(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    // Scoped client — carries the caller's own JWT, so auth.uid() resolves
    // correctly inside get_schedule_item_scope_context (a plain RPC, not
    // SECURITY DEFINER on auth context) for the per-item scope check below.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );

    const caller = await resolveCallerIdentity(req, admin);
    if (caller.isServiceRole) {
      return json({ error: 'Este endpoint e so para utilizadores.' }, 403);
    }

    const rawBody = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return json({ error: 'Invalid request', details: parsed.error.issues }, 400);
    }
    const { schedule_item_id: itemId, changes } = parsed.data;

    const { data: item } = await admin
      .from('schedule_items')
      .select('id, organization_id, status, metadata, start_datetime, end_datetime, location, time_off_type, created_by, user_id')
      .eq('id', itemId)
      .maybeSingle();

    if (!item) {
      return json({ error: 'Agendamento nao encontrado.' }, 404);
    }

    const hasOrgAccess = await validateOrgScope(admin, caller, item.organization_id);
    if (!hasOrgAccess) {
      return json({ error: 'Sem acesso a esta organizacao.' }, 403);
    }

    // Per-item scope check, mirroring the exact predicate the RLS "Users can
    // update schedule items" policy and rpc_update_schedule_item_assignees use
    // (20261119100000_schedule_items_ambito_na_escrita.sql) -- has_scheduling_permission
    // alone is a global yes/no and would let an OWNED-scope user trigger this
    // for any item in the organization, not just their own.
    const { data: scopeRows } = await userClient.rpc('get_schedule_item_scope_context', {
      p_org_id: item.organization_id,
      p_permission_code: 'scheduling.items.edit',
    });
    const scopeCtx = Array.isArray(scopeRows) ? scopeRows[0] : scopeRows;
    const appliedScope: string | null = scopeCtx?.applied_scope ?? null;
    const ownerIds: string[] = Array.isArray(scopeCtx?.owner_ids) ? scopeCtx.owner_ids : [];

    let inScope = appliedScope === 'ORG'
      || (item.created_by && ownerIds.includes(item.created_by))
      || (item.user_id && ownerIds.includes(item.user_id));
    if (!inScope && ownerIds.length > 0) {
      const { data: assignedToOwner } = await admin.rpc('schedule_item_assigned_to_owners', {
        p_item_id: itemId,
        p_owner_ids: ownerIds,
      });
      inScope = assignedToOwner === true;
    }
    if (!inScope) {
      return json({ error: 'Sem permissao para editar este agendamento.' }, 403);
    }

    const rateLimit = await checkRateLimit(admin, {
      bucket: RATE_LIMIT_BUCKET,
      identifier: itemId,
      maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
      windowMinutes: RATE_LIMIT_WINDOW_MINUTES,
    });
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit, corsHeaders);
    }
    await recordRateLimitAttempt(admin, RATE_LIMIT_BUCKET, itemId);

    if (item.time_off_type) {
      return json({ sent: { email: false, sms: false }, skipped: 'time_off' });
    }
    if (item.status === 'cancelled') {
      return json({ sent: { email: false, sms: false }, skipped: 'cancelled' });
    }
    if (new Date(item.start_datetime).getTime() <= Date.now()) {
      return json({ sent: { email: false, sms: false }, skipped: 'past' });
    }

    const { data: settings } = await admin
      .from('schedule_settings')
      .select('notify_client_on_reschedule, notify_client_on_reassign, timezone')
      .eq('organization_id', item.organization_id)
      .maybeSingle();

    const toggles = {
      notify_client_on_reschedule: settings?.notify_client_on_reschedule ?? false,
      notify_client_on_reassign: settings?.notify_client_on_reassign ?? false,
    };
    const kind = resolveNoticeKind(changes, toggles);
    if (!kind) {
      return json({ sent: { email: false, sms: false }, skipped: 'disabled' });
    }

    const metadata = (item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata))
      ? item.metadata as Record<string, unknown>
      : {};
    const formId = typeof metadata.form_id === 'string' ? metadata.form_id : null;
    if (!formId) {
      return json({ sent: { email: false, sms: false }, skipped: 'no_form' });
    }

    // The form referenced by metadata.form_id is attacker-controllable (any
    // user with scheduling.items.edit can write arbitrary metadata via the
    // existing update path) -- confirm it actually belongs to this item's
    // organization before trusting its email config for anyone.
    const { data: formRow } = await admin
      .from('forms')
      .select('id')
      .eq('id', formId)
      .eq('organization_id', item.organization_id)
      .maybeSingle();
    if (!formRow) {
      return json({ sent: { email: false, sms: false }, skipped: 'no_form' });
    }

    let leadId: string | null = typeof metadata.lead_id === 'string' ? metadata.lead_id : null;
    if (!leadId) {
      const { data: leadByVisit } = await admin
        .from('anew_leads')
        .select('id')
        .eq('scheduled_visit_id', itemId)
        .eq('organization_id', item.organization_id)
        .maybeSingle();
      leadId = leadByVisit?.id || null;
    }
    if (!leadId) {
      return json({ sent: { email: false, sms: false }, skipped: 'no_lead' });
    }

    const emailCfg = await loadFormEmailConfig(admin, formId);
    if (!emailCfg?.confirmation_email_enabled && !emailCfg?.confirmation_sms_enabled) {
      return json({ sent: { email: false, sms: false }, skipped: 'channels_off' });
    }

    // metadata.lead_id is likewise attacker-controllable -- same org filter,
    // otherwise a cross-tenant lead_id would leak that lead's contact info
    // and name to whoever triggered this on an unrelated organization's visit.
    const { data: lead } = await admin
      .from('anew_leads')
      .select('field_values')
      .eq('id', leadId)
      .eq('organization_id', item.organization_id)
      .maybeSingle();
    if (!lead) {
      return json({ sent: { email: false, sms: false }, skipped: 'no_lead' });
    }
    const fv = extractFieldValues(lead?.field_values);
    const leadEmailRaw = fv.email || fv.po_email || fv.Email || null;
    const leadEmail = leadEmailRaw ? String(leadEmailRaw).toLowerCase().trim() : '';
    const leadName = [
      fv.first_name || fv.po_nome || fv.nome || '',
      fv.last_name || fv.po_apelido || fv.apelido || '',
    ].filter(Boolean).join(' ').trim() || 'Cliente';
    const leadPhone = String(fv.phone || fv.po_telefone || fv.telefone || '');

    const canEmail = Boolean(emailCfg.confirmation_email_enabled && leadEmail);
    const canSms = Boolean(emailCfg.confirmation_sms_enabled && leadPhone);
    if (!canEmail && !canSms) {
      return json({ sent: { email: false, sms: false }, skipped: 'no_contact' });
    }

    // Comercial(is) actual(is)
    const { data: assignees } = await admin
      .from('schedule_item_assignees')
      .select('resource_id')
      .eq('item_id', itemId);

    const technicianNames: string[] = [];
    for (const a of assignees || []) {
      const { data: resource } = await admin
        .from('schedule_resources')
        .select('name, user_id')
        .eq('id', a.resource_id)
        .maybeSingle();
      let name = resource?.name || '';
      if (resource?.user_id) {
        const { data: userRow } = await admin
          .from('anew_users')
          .select('name')
          .eq('id', resource.user_id)
          .maybeSingle();
        if (userRow?.name) name = userRow.name;
      }
      if (name && !technicianNames.includes(name)) technicianNames.push(name);
    }
    const technicianName = technicianNames.join(', ');

    // Link de gestao (se houver token de reserva valido)
    const { data: tokenRow } = await admin
      .from('booking_tokens')
      .select('token, expires_at')
      .eq('schedule_item_id', itemId)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const siteUrl = Deno.env.get('SITE_URL') || 'https://olyvia.lovable.app';
    const manageUrl = tokenRow?.token
      ? buildManageUrl(emailCfg.booking_manage_url_template, null, tokenRow.token, siteUrl)
      : undefined;

    const { data: orgRow } = await admin
      .from('anew_organizations')
      .select('name')
      .eq('id', item.organization_id)
      .maybeSingle();
    const companyName = orgRow?.name || '';

    const timezone = settings?.timezone || 'Europe/Lisbon';
    const meetingDate = new Date(item.start_datetime).toLocaleString('pt-PT', {
      timeZone: timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const includeSmsLink = emailCfg.confirmation_sms_include_link === true;
    const copy = buildNoticeCopy(kind, {
      companyName,
      meetingDate,
      technicianName,
      manageUrl,
      includeSmsLink,
    });

    const sent = { email: false, sms: false };

    if (canEmail) {
      try {
        sent.email = await sendEmailNow({
          organizationId: item.organization_id,
          smtpId: emailCfg.email_smtp_id,
          to: leadEmail,
          subject: copy.subject,
          html: defaultMeetingHtml({
            heading: copy.heading,
            intro: copy.intro,
            leadName,
            when: meetingDate,
            location: item.location || undefined,
            technicianName: technicianName || undefined,
            cancelUrl: manageUrl,
            primaryColor: emailCfg.primary_color,
            logoUrl: emailCfg.logo_url,
          }),
        });
      } catch (emailErr) {
        console.error('[notify-schedule-change] email send failed (non-fatal):', emailErr);
      }
    }

    if (canSms) {
      try {
        const r = await sendSmsNow({ toPhone: leadPhone, message: copy.sms });
        sent.sms = r.ok;
        if (!r.ok) console.error('[notify-schedule-change] sms send failed:', r.error);
      } catch (smsErr) {
        console.error('[notify-schedule-change] sms send failed (non-fatal):', smsErr);
      }
    }

    return json({ sent, skipped: null });
  } catch (error: unknown) {
    let authResp: Response | null = null;
    try { authResp = authErrorResponse(error, corsHeaders); } catch (_) { authResp = null; }
    if (authResp) return authResp;
    console.error('Error in notify-schedule-change:', error);
    await captureError(error, { function: 'notify-schedule-change' });
    return json({ error: 'Internal server error' }, 500);
  }
});
