import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import {
  loadFormEmailConfig,
  sendEmailNow,
  renderSubject,
  parseEmailList,
  uniqueEmails,
  buildManageUrl,
  defaultMeetingHtml,
} from '../_shared/formEmails.ts';
import { checkRateLimit, getClientIp, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT_BUCKET = 'cancel-booking';
const RATE_LIMIT_MAX_ATTEMPTS = 15;
const RATE_LIMIT_WINDOW_MINUTES = 1;

/**
 * Cancel Booking API
 *
 * PUBLIC endpoint — authenticated ONLY by a secret booking token.
 * Cancels the appointment behind a booking_tokens.token.
 *
 * POST /cancel-booking
 * Body: { token }
 * Returns (200): { success: true }  (idempotent — success if already cancelled)
 * On problem (200 with error): { error, code }
 *   code ∈ 'INVALID' | 'EXPIRED' | 'USED'
 *
 * Steps (as atomic as possible with the JS client):
 *  - schedule_items.status = 'cancelled'
 *  - delete schedule_item_assignees (frees the resource slot)
 *  - anew_leads: status='cancelled', callback_scheduled_at=null, scheduled_visit_id=null
 *  - scheduled_emails (pending, this lead): status='cancelled'
 *  - booking_tokens.used_at = now()
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

    const { token, lang } = await req.json();
    const leadLocale = (typeof lang === 'string' && lang.trim()) ? lang.trim().toLowerCase() : null;

    if (!token || typeof token !== 'string') {
      return json({ error: 'Token em falta ou inválido.', code: 'INVALID' });
    }

    // 1. Resolve + validate token
    const { data: tokenRow } = await supabase
      .from('booking_tokens')
      .select('token, expires_at, used_at, schedule_item_id')
      .eq('token', token)
      .maybeSingle();

    if (!tokenRow) {
      return json({ error: 'Este link não é válido.', code: 'INVALID' });
    }
    if (tokenRow.used_at) {
      // Token already consumed — the booking is already cancelled. Idempotent success.
      return json({ success: true });
    }
    if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
      return json({ error: 'Este link expirou.', code: 'EXPIRED' });
    }

    const itemId = tokenRow.schedule_item_id;

    // 2. Load the schedule item (to find the linked lead)
    const { data: item } = await supabase
      .from('schedule_items')
      .select('id, status, organization_id, metadata, start_datetime, end_datetime, location')
      .eq('id', itemId)
      .maybeSingle();

    if (!item) {
      // Nothing to cancel — treat as done, and burn the token.
      await supabase.from('booking_tokens').update({ used_at: new Date().toISOString() }).eq('token', token);
      return json({ success: true });
    }

    const metadata = (item.metadata && typeof item.metadata === 'object') ? item.metadata as Record<string, any> : {};
    let leadId: string | null = metadata.lead_id || null;
    const formId: string | null = metadata.form_id || null;
    const organizationId: string = item.organization_id;

    // Fallback: find the lead via scheduled_visit_id when metadata is missing.
    if (!leadId) {
      const { data: leadByVisit } = await supabase
        .from('anew_leads')
        .select('id')
        .eq('scheduled_visit_id', itemId)
        .maybeSingle();
      leadId = leadByVisit?.id || null;
    }

    // Resolve the assigned technician's name + email NOW, BEFORE step 4 deletes
    // schedule_item_assignees. schedule_item_assignees → schedule_resources.user_id
    // → anew_users(email, name). Fail-soft: never let this block the cancel.
    let technicianEmail = '';
    let technicianName = '';
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
          .select('name, user_id')
          .eq('id', assignee.resource_id)
          .maybeSingle();
        technicianName = resource?.name || '';
        if (resource?.user_id) {
          const { data: prof } = await supabase
            .from('anew_users')
            .select('email, name')
            .eq('id', resource.user_id)
            .maybeSingle();
          technicianEmail = (prof?.email || '').toLowerCase().trim();
          if (prof?.name) technicianName = prof.name;
        }
      }
    } catch (resolveErr) {
      console.error('[cancel-booking] technician resolution failed (non-fatal):', resolveErr);
    }

    // 3. Cancel the schedule item (CRITICAL — must succeed before we burn the token)
    const { error: itemUpdateError } = await supabase
      .from('schedule_items')
      .update({ status: 'cancelled' })
      .eq('id', itemId);
    if (itemUpdateError) {
      console.error('[cancel-booking] failed to cancel schedule_item:', itemUpdateError);
    }

    // 4. Free the resource slot (CRITICAL — frees the commercial's agenda)
    const { error: assigneeError } = await supabase
      .from('schedule_item_assignees')
      .delete()
      .eq('item_id', itemId);
    if (assigneeError) {
      console.error('[cancel-booking] failed to delete assignees:', assigneeError);
    }

    // If a critical write failed, do NOT burn the token — leave it usable for a retry
    // instead of leaving a ghost booking on the agenda with a dead link.
    if (itemUpdateError || assigneeError) {
      return json({ error: 'Não foi possível cancelar agora. Tente novamente.', code: 'RETRY' }, 503);
    }

    // 5. Update the lead
    if (leadId) {
      const { error: leadError } = await supabase
        .from('anew_leads')
        .update({
          status: 'cancelled',
          callback_scheduled_at: null,
          scheduled_visit_id: null,
        })
        .eq('id', leadId);
      if (leadError) {
        console.error('[cancel-booking] failed to update lead:', leadError);
      }
    }

    // 6. Cancel pending reminders for this lead
    if (leadId) {
      const { error: emailError } = await supabase
        .from('scheduled_emails')
        .update({ status: 'cancelled' })
        .eq('entity_type', 'leads')
        .eq('entity_id', leadId)
        .eq('status', 'pending');
      if (emailError) {
        console.error('[cancel-booking] failed to cancel scheduled_emails:', emailError);
      }
    }

    // 7. Burn the token (compare-and-swap: only if still unused)
    const { error: tokenError } = await supabase
      .from('booking_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('token', token)
      .is('used_at', null);
    if (tokenError) {
      console.error('[cancel-booking] failed to mark token used:', tokenError);
    }

    // 8. "Visita cancelada" notification (config on form_branding). Fail-soft:
    //     the cancel already succeeded; email issues must never break it. Notifies
    //     the assigned technician + meeting_notify_emails extras (internal), and
    //     the client with a cancellation confirmation. Mirrors book-slot §12.
    //     (technicianEmail/technicianName were resolved above, BEFORE the
    //     schedule_item_assignees rows were deleted in step 4.)
    try {
      const emailCfg = await loadFormEmailConfig(supabase, formId);

      // Resolve client email + name from the lead's field_values.
      let leadEmail = '';
      let leadName = 'Cliente';
      if (leadId) {
        const { data: lead } = await supabase
          .from('anew_leads')
          .select('field_values')
          .eq('id', leadId)
          .maybeSingle();
        const fv = (lead?.field_values && typeof lead.field_values === 'object' && !Array.isArray(lead.field_values))
          ? lead.field_values as Record<string, any>
          : {};
        const leadEmailRaw = fv.email || fv.po_email || fv.Email || null;
        leadEmail = leadEmailRaw ? String(leadEmailRaw).toLowerCase().trim() : '';
        leadName = [
          fv.first_name || fv.po_nome || fv.nome || '',
          fv.last_name || fv.po_apelido || fv.apelido || '',
        ].filter(Boolean).join(' ').trim() || 'Cliente';
      }

      const { data: orgRow } = await supabase
        .from('anew_organizations')
        .select('name')
        .eq('id', organizationId)
        .maybeSingle();

      // Original slot — the visit that was cancelled.
      const formattedWhen = item.start_datetime
        ? new Date(item.start_datetime).toLocaleString('pt-PT', {
            timeZone: 'Europe/Lisbon',
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';

      const siteUrlEnv = Deno.env.get('SITE_URL') || 'https://olyvia.lovable.app';
      // Manage link is informational only here (token is now burned).
      const manageLink = buildManageUrl(emailCfg?.booking_manage_url_template, leadLocale, token, siteUrlEnv);

      const baseVars: Record<string, string> = {
        lead_name: leadName,
        client_name: leadName,
        lead_email: leadEmail,
        client_email: leadEmail,
        company_name: orgRow?.name || '',
        technician_name: technicianName,
        meeting_date: formattedWhen,
        meeting_datetime: formattedWhen,
        location: item.location || '',
        cancel_url: manageLink,
      };

      // A cancellation must NEVER reuse the "meeting_notify" (new-booking) template:
      // that template's copy announces a visit was *scheduled* — the exact opposite of
      // what happened — and its placeholders (e.g. {{lead_phone}}) render raw because the
      // cancel flow doesn't populate them. Always send a purpose-built cancellation notice.
      const subject = renderSubject('Visita cancelada — {{lead_name}}', baseVars);
      const htmlFor = (kind: 'client' | 'technician') => defaultMeetingHtml({
        heading: 'Visita cancelada',
        intro: kind === 'client'
          ? 'A sua visita agendada foi cancelada.'
          : 'Uma visita agendada foi cancelada.',
        leadName: leadName,
        when: formattedWhen,
        location: item.location || undefined,
        technicianName: technicianName || undefined,
      });

      // (a) Technician + extra notify emails: internal cancellation notice.
      const extra = parseEmailList(emailCfg?.meeting_notify_emails);
      const notifyList = uniqueEmails([technicianEmail, ...extra]);
      if (notifyList.length > 0) {
        await sendEmailNow({
          organizationId,
          smtpId: emailCfg?.email_smtp_id,
          to: notifyList[0],
          recipients: notifyList,
          subject,
          html: htmlFor('technician'),
        });
      }

      // (b) Client: cancellation confirmation.
      if (leadEmail) {
        await sendEmailNow({
          organizationId,
          smtpId: emailCfg?.email_smtp_id,
          to: leadEmail,
          subject,
          html: htmlFor('client'),
        });
      }
    } catch (emailErr) {
      console.error('[cancel-booking] cancellation notification failed (non-fatal):', emailErr);
    }

    return json({ success: true });
  } catch (error: unknown) {
    console.error('Error in cancel-booking:', error);
    await captureError(error, { function: "cancel-booking" });
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
