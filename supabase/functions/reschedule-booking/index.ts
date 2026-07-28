import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import {
  loadFormEmailConfig,
  loadTemplate,
  scheduleEmail,
  sendEmailNow,
  renderHtml,
  renderSubject,
  parseEmailList,
  uniqueEmails,
  pickTemplateId,
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

const RATE_LIMIT_BUCKET = 'reschedule-booking';
const RATE_LIMIT_MAX_ATTEMPTS = 15;
const RATE_LIMIT_WINDOW_MINUTES = 1;

/**
 * Reschedule Booking API
 *
 * PUBLIC endpoint — authenticated ONLY by a secret booking token.
 * Moves the appointment behind a booking_tokens.token to a new slot,
 * verifying the new slot is still free for the SAME assigned resource.
 *
 * POST /reschedule-booking
 * Body: { token, slot_start, slot_end }  (ISO timestamps)
 * Returns (200): { success, new_start, new_end, formatted_when }
 * On problem (200 with error): { error, code }
 *   code ∈ 'INVALID' | 'EXPIRED' | 'USED' | 'CANCELLED' | 'SLOT_TAKEN' | 'BAD_INPUT'
 *
 * The token is KEPT usable for further changes (used_at is NOT set on reschedule),
 * so the customer can reschedule or cancel again from the same link.
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

    const { token, slot_start, slot_end, lang } = await req.json();
    const leadLocale = (typeof lang === 'string' && lang.trim()) ? lang.trim().toLowerCase() : null;

    if (!token || typeof token !== 'string') {
      return json({ error: 'Token em falta ou inválido.', code: 'INVALID' });
    }
    if (!slot_start || !slot_end) {
      return json({ error: 'Horário inválido.', code: 'BAD_INPUT' });
    }
    if (new Date(slot_start).getTime() <= Date.now()) {
      return json({ error: 'Não é possível agendar para uma data no passado.', code: 'BAD_INPUT' });
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
      return json({ error: 'Este link já foi utilizado.', code: 'USED' });
    }
    if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
      return json({ error: 'Este link expirou.', code: 'EXPIRED' });
    }

    const itemId = tokenRow.schedule_item_id;

    // 2. Load the schedule item
    const { data: item } = await supabase
      .from('schedule_items')
      .select('id, status, board_id, organization_id, metadata, start_datetime, end_datetime, location')
      .eq('id', itemId)
      .maybeSingle();

    if (!item) {
      return json({ error: 'Este agendamento já não existe.', code: 'INVALID' });
    }
    if (item.status === 'cancelled') {
      return json({ error: 'Este agendamento já foi cancelado.', code: 'CANCELLED' });
    }

    const metadata = (item.metadata && typeof item.metadata === 'object') ? item.metadata as Record<string, any> : {};
    let leadId: string | null = metadata.lead_id || null;
    const formId: string | null = metadata.form_id || null;
    const organizationId: string = item.organization_id;

    if (!leadId) {
      const { data: leadByVisit } = await supabase
        .from('anew_leads')
        .select('id')
        .eq('scheduled_visit_id', itemId)
        .maybeSingle();
      leadId = leadByVisit?.id || null;
    }

    // 3. Find the currently assigned resource — the reschedule must keep the same resource.
    const { data: assignee } = await supabase
      .from('schedule_item_assignees')
      .select('resource_id')
      .eq('item_id', itemId)
      .limit(1)
      .maybeSingle();

    if (!assignee?.resource_id) {
      return json({ error: 'Não foi possível encontrar o técnico atribuído.', code: 'INVALID' });
    }
    const resourceId = assignee.resource_id;

    // 4. Derive the real duration from the ORIGINAL booking — never trust the
    //    client-supplied slot_end (this is a public endpoint).
    const origDurationMs = (() => {
      const s = new Date(item.start_datetime).getTime();
      const e = new Date(item.end_datetime).getTime();
      const d = e - s;
      if (Number.isFinite(d) && d > 0) return d;
      const cd = new Date(slot_end).getTime() - new Date(slot_start).getTime();
      return (Number.isFinite(cd) && cd > 0) ? cd : 60 * 60000;
    })();
    const durationMinutes = Math.max(1, Math.round(origDurationMs / 60000));
    const effectiveEnd = new Date(new Date(slot_start).getTime() + origDurationMs).toISOString();

    // 5. Validate the requested slot against the resource's REAL availability
    //    (working hours, time-off, granularity), not just raw overlap.
    const slotDate = new Date(slot_start).toISOString().slice(0, 10);
    const { data: availSlots, error: availError } = await supabase.rpc('get_resource_available_slots', {
      p_resource_id: resourceId,
      p_date: slotDate,
      p_duration_minutes: durationMinutes,
    });
    if (availError) {
      console.error('[reschedule-booking] availability check failed:', availError);
      return json({ error: 'Não foi possível confirmar a disponibilidade. Tente novamente.', code: 'SLOT_TAKEN' });
    }
    const slotMs = new Date(slot_start).getTime();
    const slotOffered = Array.isArray(availSlots) && availSlots.some((s: any) => new Date(s.slot_start).getTime() === slotMs);
    if (!slotOffered) {
      return json({ error: 'Este horário não está disponível. Escolha outro.', code: 'SLOT_TAKEN' });
    }

    // 6. Final overlap guard, EXCLUDING this item's own (old) slot so a shift that
    //    overlaps the current booking isn't rejected against itself.
    const { data: conflict, error: conflictError } = await supabase.rpc('check_schedule_conflict', {
      p_resource_id: resourceId,
      p_start: slot_start,
      p_end: effectiveEnd,
      p_exclude_item_id: itemId,
    });

    if (conflictError) {
      console.error('[reschedule-booking] conflict check failed:', conflictError);
      return json({ error: 'Não foi possível confirmar a disponibilidade. Tente novamente.', code: 'SLOT_TAKEN' });
    }
    if (conflict) {
      return json({ error: 'Este horário já não está disponível. Escolha outro.', code: 'SLOT_TAKEN' });
    }

    // 7. Move the schedule item to the new slot (server-derived end, keep status 'scheduled')
    const { error: itemUpdateError } = await supabase
      .from('schedule_items')
      .update({
        start_datetime: slot_start,
        end_datetime: effectiveEnd,
        status: 'scheduled',
      })
      .eq('id', itemId);

    if (itemUpdateError) {
      console.error('[reschedule-booking] failed to update schedule_item:', itemUpdateError);
      return json({ error: 'Não foi possível reagendar. Tente novamente.', code: 'SLOT_TAKEN' });
    }

    // Update the lead's callback time
    if (leadId) {
      const { error: leadError } = await supabase
        .from('anew_leads')
        .update({ callback_scheduled_at: slot_start, status: 'scheduled' })
        .eq('id', leadId);
      if (leadError) {
        console.error('[reschedule-booking] failed to update lead:', leadError);
      }
    }

    const formattedWhen = new Date(slot_start).toLocaleString('pt-PT', {
      timeZone: 'Europe/Lisbon',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // Reschedule reminder emails: cancel existing pending, then re-insert
    // a new reminder at (new start − reminder_hours_before). Fail-soft.
    if (leadId) {
      try {
        // Cancel existing pending reminders for this lead.
        await supabase
          .from('scheduled_emails')
          .update({ status: 'cancelled' })
          .eq('entity_type', 'leads')
          .eq('entity_id', leadId)
          .eq('status', 'pending');

        const emailCfg = formId ? await loadFormEmailConfig(supabase, formId) : null;

        if (emailCfg?.reminder_enabled) {
          const hoursBefore = emailCfg.reminder_hours_before && emailCfg.reminder_hours_before > 0
            ? emailCfg.reminder_hours_before
            : 2;
          const remindAt = new Date(new Date(slot_start).getTime() - hoursBefore * 3600000);

          if (remindAt.getTime() > Date.now()) {
            // Resolve lead email + name, technician email + name, and a user_id for the row.
            const { data: lead } = await supabase
              .from('anew_leads')
              .select('field_values, entity_id, created_by, assigned_to')
              .eq('id', leadId)
              .maybeSingle();

            const fv = (lead?.field_values && typeof lead.field_values === 'object' && !Array.isArray(lead.field_values))
              ? lead.field_values as Record<string, any>
              : {};
            const leadEmailRaw = fv.email || fv.po_email || fv.Email || null;
            const leadEmail = leadEmailRaw ? String(leadEmailRaw).toLowerCase().trim() : '';
            const leadName = [
              fv.first_name || fv.po_nome || fv.nome || '',
              fv.last_name || fv.po_apelido || fv.apelido || '',
            ].filter(Boolean).join(' ').trim() || 'Cliente';

            const userId = lead?.assigned_to || lead?.created_by || null;

            // Technician email + name via the assigned resource.
            let technicianEmail = '';
            let technicianName = '';
            const { data: resource } = await supabase
              .from('schedule_resources')
              .select('name, user_id')
              .eq('id', resourceId)
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

            const { data: orgRow } = await supabase
              .from('anew_organizations')
              .select('name')
              .eq('id', organizationId)
              .maybeSingle();

            const siteUrl = Deno.env.get('SITE_URL') || 'https://olyvia.lovable.app';
            const manageLink = `${siteUrl}/booking/manage?token=${token}`;

            const baseVars: Record<string, string> = {
              lead_name: leadName,
              client_name: leadName,
              lead_email: leadEmail,
              client_email: leadEmail,
              lead_phone: String(fv.phone || fv.po_telefone || fv.telefone || ''),
              company_name: orgRow?.name || '',
              technician_name: technicianName,
              meeting_date: formattedWhen,
              meeting_datetime: formattedWhen,
              location: item.location || '',
              cancel_url: manageLink,
            };

            const reminderTemplateId = pickTemplateId(emailCfg, 'reminder', leadLocale, emailCfg.reminder_template_id);
            const tpl = await loadTemplate(supabase, reminderTemplateId);
            const subject = renderSubject(tpl?.subject || 'Lembrete: reunião {{meeting_date}}', baseVars);
            const htmlFor = (kind: 'client' | 'technician') => tpl?.body_html
              ? renderHtml(tpl.body_html, baseVars)
              : defaultMeetingHtml({
                  heading: 'Lembrete de reunião',
                  intro: kind === 'client' ? 'Este é um lembrete da sua visita agendada.' : 'Lembrete: tem uma visita agendada.',
                  leadName,
                  when: formattedWhen,
                  technicianName: technicianName || undefined,
                  cancelUrl: kind === 'client' ? manageLink : undefined,
                });

            const targets: { email: string; kind: 'client' | 'technician' }[] = [];
            if (leadEmail) targets.push({ email: leadEmail, kind: 'client' });
            if (technicianEmail) targets.push({ email: technicianEmail, kind: 'technician' });

            // scheduled_emails.user_id/entity_id are NOT NULL — only schedule when both resolve.
            if (userId && leadId) {
              for (const t of targets) {
                await scheduleEmail(supabase, {
                  organizationId,
                  userId,
                  smtpId: emailCfg.email_smtp_id,
                  toEmail: t.email,
                  subject,
                  bodyHtml: htmlFor(t.kind),
                  scheduledFor: remindAt.toISOString(),
                  entityType: 'leads',
                  entityId: leadId,
                  templateId: reminderTemplateId || null,
                });
              }
            }
          }
        }
      } catch (emailErr) {
        console.error('[reschedule-booking] reminder reschedule failed (non-fatal):', emailErr);
      }
    }

    // "Reunião reagendada" notification (config on form_branding). Fail-soft:
    // the reschedule already succeeded; email issues must never break it.
    // Notifies the client (friendly heading) and the assigned technician +
    // meeting_notify_emails extras (internal heading). Mirrors book-slot.
    try {
      const emailCfg = await loadFormEmailConfig(supabase, formId);

      // Resolve client email + name + phone from the lead's field_values.
      let leadEmail = '';
      let leadName = 'Cliente';
      let leadPhone = '';
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
        leadPhone = String(fv.phone || fv.po_telefone || fv.telefone || '');
      }

      // Resolve the assigned technician's name + email via the resource → anew_users.
      let technicianEmail = '';
      let technicianName = '';
      const { data: resource } = await supabase
        .from('schedule_resources')
        .select('name, user_id')
        .eq('id', resourceId)
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

      const { data: orgRow } = await supabase
        .from('anew_organizations')
        .select('name')
        .eq('id', organizationId)
        .maybeSingle();

      const siteUrlEnv = Deno.env.get('SITE_URL') || 'https://olyvia.lovable.app';
      const cancelLink = buildManageUrl(emailCfg?.booking_manage_url_template, leadLocale, token, siteUrlEnv);

      const baseVars: Record<string, string> = {
        lead_name: leadName,
        client_name: leadName,
        lead_email: leadEmail,
        client_email: leadEmail,
        lead_phone: leadPhone,
        company_name: orgRow?.name || '',
        technician_name: technicianName,
        meeting_date: formattedWhen,
        meeting_datetime: formattedWhen,
        location: item.location || '',
        cancel_url: cancelLink,
      };

      const notifyTemplateId = pickTemplateId(emailCfg, 'meeting_notify', leadLocale, emailCfg?.meeting_notify_template_id ?? null);
      const tpl = await loadTemplate(supabase, notifyTemplateId);
      const subject = renderSubject(tpl?.subject || 'Reunião reagendada — {{lead_name}}', baseVars);
      const htmlFor = (kind: 'client' | 'technician') => tpl?.body_html
        ? renderHtml(tpl.body_html, baseVars)
        : defaultMeetingHtml({
            heading: 'Reunião reagendada',
            intro: kind === 'client'
              ? 'A sua visita foi reagendada para a data abaixo.'
              : 'Uma visita foi reagendada para a data abaixo.',
            leadName: leadName,
            when: formattedWhen,
            location: item.location || undefined,
            technicianName: technicianName || undefined,
            cancelUrl: kind === 'client' ? (cancelLink || undefined) : undefined,
          });

      // (a) Client: friendly confirmation of the new slot.
      if (leadEmail) {
        await sendEmailNow({
          organizationId,
          smtpId: emailCfg?.email_smtp_id,
          to: leadEmail,
          subject,
          html: htmlFor('client'),
        });
      }

      // (b) Technician + extra notify emails: internal notification.
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
    } catch (emailErr) {
      console.error('[reschedule-booking] reschedule notification failed (non-fatal):', emailErr);
    }

    return json({
      success: true,
      new_start: slot_start,
      new_end: effectiveEnd,
      formatted_when: formattedWhen,
    });
  } catch (error: unknown) {
    console.error('Error in reschedule-booking:', error);
    await captureError(error, { function: "reschedule-booking" });
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
