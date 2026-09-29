import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import {
  loadFormEmailConfig,
  sendEmailNow,
  defaultMeetingHtml,
  buildManageUrl,
  renderHtml,
  renderSubject,
} from '../_shared/formEmails.ts';
import { sendSmsNow } from '../_shared/sendSms.ts';
import { resolveCallerIdentity, validateOrgScope, authErrorResponse } from '../_shared/auth.ts';
import { getCorsHeadersExtended } from '../_shared/cors.ts';
import { checkRateLimit, recordRateLimitAttempt, rateLimitResponse } from '../_shared/rateLimit.ts';
import { initSentry, captureError } from '../_shared/sentry.ts';
import { resolveNoticeKind, buildNoticeCopy, resolveNoticeChannels } from '../_shared/scheduleChangeNotice.ts';
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
      .select('id, organization_id, status, metadata, start_datetime, end_datetime, location, time_off_type, created_by, user_id, lead_id')
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
      .select('notify_client_on_reschedule, notify_client_on_reassign, timezone, reschedule_notify_email, reschedule_notify_sms, reschedule_email_template_id, reschedule_sms_message, reassign_notify_email, reassign_notify_sms, reassign_email_template_id, reassign_sms_message, notify_client_smtp_id, notify_client_sms_include_link')
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

    // Canais e modelos vem da configuracao PROPRIA da Agenda (schedule_settings),
    // nao do formulario de origem.
    const channels = resolveNoticeChannels(kind, settings ?? {});
    if (!channels.email && !channels.sms) {
      return json({ sent: { email: false, sms: false }, skipped: 'channels_off' });
    }

    // O formulario e um extra opcional: so cor, logotipo e URL de gestao.
    // metadata.form_id e controlavel por quem edita a visita -- confirmar que
    // pertence a organizacao do item antes de o usar.
    let formId: string | null = typeof metadata.form_id === 'string' ? metadata.form_id : null;
    if (formId) {
      const { data: formRow } = await admin
        .from('forms')
        .select('id')
        .eq('id', formId)
        .eq('organization_id', item.organization_id)
        .maybeSingle();
      if (!formRow) formId = null;
    }

    // Lead: coluna lead_id primeiro, depois metadata.lead_id, depois
    // anew_leads.scheduled_visit_id. A leitura da lead abaixo filtra sempre pela org.
    let leadId: string | null = typeof item.lead_id === 'string' ? item.lead_id : null;
    if (!leadId && typeof metadata.lead_id === 'string') leadId = metadata.lead_id;
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

    const emailCfg = formId ? await loadFormEmailConfig(admin, formId) : null;

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

    const canEmail = Boolean(channels.email && leadEmail);
    const canSms = Boolean(channels.sms && leadPhone);
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
      ? buildManageUrl(emailCfg?.booking_manage_url_template, null, tokenRow.token, siteUrl)
      : undefined;

    const { data: orgRow } = await admin
      .from('anew_organizations')
      .select('name, logo_url')
      .eq('id', item.organization_id)
      .maybeSingle();
    const companyName = orgRow?.name || '';

    // Modelo e SMTP escolhidos na Agenda: lidos com service role, por isso
    // SEMPRE filtrados pela org do item -- um id de outra org e ignorado
    // e cai no omissao (texto fixo / SMTP padrao).
    let template: { subject: string; body_html: string } | null = null;
    if (canEmail && channels.templateId) {
      const { data: tplRow } = await admin
        .from('email_templates')
        .select('subject, body_html')
        .eq('id', channels.templateId)
        .eq('organization_id', item.organization_id)
        .eq('is_active', true)
        .maybeSingle();
      if (tplRow?.body_html) {
        template = { subject: tplRow.subject || '', body_html: tplRow.body_html };
      }
    }
    let smtpId: string | null = null;
    if (canEmail && settings?.notify_client_smtp_id) {
      const { data: smtpRow } = await admin
        .from('organization_smtp_settings')
        .select('id')
        .eq('id', settings.notify_client_smtp_id)
        .eq('organization_id', item.organization_id)
        .eq('is_active', true)
        .maybeSingle();
      smtpId = smtpRow?.id ?? null;
    }

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

    const includeSmsLink = settings?.notify_client_sms_include_link === true;
    const copy = buildNoticeCopy(kind, {
      companyName,
      meetingDate,
      technicianName,
      manageUrl,
      includeSmsLink,
    });

    // Mesmas variaveis que o book-slot.
    const baseVars: Record<string, string> = {
      lead_name: leadName,
      client_name: leadName,
      lead_email: leadEmail,
      client_email: leadEmail,
      lead_phone: leadPhone,
      company_name: companyName,
      technician_name: technicianName,
      meeting_date: meetingDate,
      meeting_datetime: meetingDate,
      location: item.location || '',
      cancel_url: manageUrl || '',
    };

    const sent = { email: false, sms: false };

    if (canEmail) {
      try {
        sent.email = await sendEmailNow({
          organizationId: item.organization_id,
          smtpId,
          to: leadEmail,
          subject: template
            ? renderSubject(template.subject || copy.subject, baseVars)
            : copy.subject,
          html: template
            ? renderHtml(template.body_html, baseVars)
            : defaultMeetingHtml({
              heading: copy.heading,
              intro: copy.intro,
              leadName,
              when: meetingDate,
              location: item.location || undefined,
              technicianName: technicianName || undefined,
              cancelUrl: manageUrl,
              primaryColor: emailCfg?.primary_color,
              logoUrl: emailCfg?.logo_url ?? orgRow?.logo_url ?? null,
            }),
        });
      } catch (emailErr) {
        console.error('[notify-schedule-change] email send failed (non-fatal):', emailErr);
      }
    }

    if (canSms) {
      try {
        const smsText = channels.smsMessage
          ? renderSubject(channels.smsMessage, includeSmsLink ? baseVars : { ...baseVars, cancel_url: '' })
          : copy.sms;
        const r = await sendSmsNow({ toPhone: leadPhone, message: smsText });
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
