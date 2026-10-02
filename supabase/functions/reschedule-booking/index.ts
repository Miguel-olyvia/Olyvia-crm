import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import {
  loadFormEmailConfig,
  loadTemplate,
  sendEmailNow,
  renderHtml,
  renderSubject,
  parseEmailList,
  uniqueEmails,
  buildManageUrl,
  defaultMeetingHtml,
  shouldNotifyClient,
} from '../_shared/formEmails.ts';
import { checkRateLimit, getClientIp, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { buildAudienceVars, pickAudienceTemplateId } from "../_shared/audienceTemplates.ts";
import { createReminderLines } from "../_shared/reminderLines.ts";
import { formatVisitWhen } from "../_shared/reminderContent.ts";
import { anyReminderEnabled, reminderRuleFor } from "../_shared/reminderRule.ts";
import { resolveRescheduleTarget, validateRescheduleSlot } from "../_shared/rescheduleSlots.ts";
import { needsNewReminderLines } from "../_shared/reminderReconcile.ts";
import { cancelLegacyVisitReminders, loadVisitTechnicians, reconcileItem } from "../_shared/reminderRunner.ts";

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

    // 1-3. Token -> visita, recurso atribuido (o comercial nao muda) e as regras
    //      da marcacao que valem para esta visita (antecedencia do formulario,
    //      almoco, feriados). Mesmo modulo que o calendario publico usa.
    const target = await resolveRescheduleTarget(supabase, token, {
      years: [new Date(slot_start).getUTCFullYear()],
    });
    if (!target.ok) {
      return json({ error: target.error, code: target.code });
    }
    const { item, resourceId, resourceIds, ctx, ctxs } = target;
    const itemId = item.id;

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

    // 4. A duracao vem da marcacao ORIGINAL -- nunca do slot_end do cliente
    //    (endpoint publico).
    const origDurationMs = ctx.durationMinutes * 60000;
    const effectiveEnd = new Date(new Date(slot_start).getTime() + origDurationMs).toISOString();

    // 5. O horario pedido tem de ser um dos que o recurso desta visita tem
    //    mesmo livres: feriados, dias uteis, ausencias, antecedencia minima do
    //    formulario, capacidade diaria (sem contar esta visita) e deslocacao +
    //    almoco contra as outras visitas do dia (com as coordenadas ja
    //    guardadas na visita). Com varios comerciais, tem de passar para TODOS.
    const verdict = await validateRescheduleSlot(supabase, ctxs, slot_start);
    if (!verdict.ok) {
      if (verdict.reason === 'check_failed') {
        console.error('[reschedule-booking] availability check failed');
      }
      return json({ error: verdict.error, code: verdict.code });
    }

    // 6. Final overlap guard, EXCLUDING this item's own (old) slot so a shift that
    //    overlaps the current booking isn't rejected against itself.
    for (const rid of resourceIds) {
      const { data: conflict, error: conflictError } = await supabase.rpc('check_schedule_conflict', {
        p_resource_id: rid,
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
    }

    // 7. Move the schedule item to the new slot (server-derived end, keep status 'scheduled')
    const { error: itemUpdateError } = await supabase
      .from('schedule_items')
      .update({
        start_datetime: slot_start,
        end_datetime: effectiveEnd,
        status: 'scheduled',
        // A hora mudou: a confirmacao do cliente deixa de valer (o gatilho da base tambem o garante).
        confirmed_at: null,
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

    // Lembretes: acompanham a visita. Os que ja estao ligados a ela (criados na
    // marcacao) sao acertados aqui e pelo processador: movem-se para
    // "nova hora - intervalo do formulario", ou cancelam-se com motivo se essa
    // hora ja passou. So se a visita nao tem nenhum lembrete ligado e que se
    // criam (ou se a unica que havia era da data anterior: ja enviada, falhada ou
    // cancelada por a hora ja ter passado). Nunca se cancela tudo o que e da lead (isso matava tambem os emails
    // por fase). Fail-soft.
    try {
      await reconcileItem(supabase, itemId);

      // Lembretes antigos, ainda nao ligados a visita: so os de visita.
      if (leadId) {
        await cancelLegacyVisitReminders(supabase, 'leads', leadId, 'Visita reagendada: o lembrete foi refeito');
      }

      const [linkedEmailsRes, linkedSmsRes] = await Promise.all([
        supabase.from('scheduled_emails').select('status').eq('schedule_item_id', itemId),
        supabase.from('scheduled_sms').select('status').eq('schedule_item_id', itemId),
      ]);
      if (linkedEmailsRes.error || linkedSmsRes.error) {
        // Sem saber o que ha, nao se cria (evita duplicados); o processador acerta.
        throw new Error('leitura dos lembretes ligados falhou');
      }
      const createNewReminders = needsNewReminderLines([
        ...(linkedEmailsRes.data ?? []),
        ...(linkedSmsRes.data ?? []),
      ]);

      const emailCfg = formId ? await loadFormEmailConfig(supabase, formId) : null;

      if (leadId && createNewReminders && emailCfg && anyReminderEnabled(emailCfg)) {
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
        const leadPhone = String(fv.phone || fv.po_telefone || fv.telefone || '');

        // scheduled_emails.user_id/entity_id sao NOT NULL: so se agenda quando resolvem.
        const createdBy: string | null = lead?.created_by || lead?.assigned_to || null;
        const technicians = (await loadVisitTechnicians(supabase, itemId))
          .filter((t) => !!t.email)
          .map((t) => ({ email: t.email as string, userId: t.user_id, name: t.name }));

        if (createdBy) {
          const { data: orgRow } = await supabase
            .from('anew_organizations')
            .select('name')
            .eq('id', organizationId)
            .maybeSingle();

          const siteUrl = Deno.env.get('SITE_URL') || 'https://olyvia.lovable.app';
          const manageLink = buildManageUrl(emailCfg.booking_manage_url_template, leadLocale, token, siteUrl);

          // Link "Confirmo a visita" para a hora nova (o antigo expirou com a hora antiga).
          // O link e do cliente: so se o lembrete do CLIENTE estiver ligado.
          const { data: confirmToken } = reminderRuleFor(emailCfg, 'client').enabled
            ? await supabase
              .from('booking_tokens')
              .insert({ schedule_item_id: itemId, action: 'confirm', expires_at: slot_start })
              .select('token')
              .single()
            : { data: null };
          const confirmLink = confirmToken?.token ? `${siteUrl}/booking/confirm?token=${confirmToken.token}` : '';

          const when = formatVisitWhen(slot_start);
          await createReminderLines({
            supabase,
            organizationId,
            itemId,
            formId,
            locale: leadLocale,
            cfg: emailCfg,
            startIso: slot_start,
            entityType: 'leads',
            entityId: leadId,
            createdBy,
            companyName: orgRow?.name || '',
            clientVars: {
              lead_name: leadName,
              client_name: leadName,
              lead_email: leadEmail,
              client_email: leadEmail,
              lead_phone: leadPhone,
              company_name: orgRow?.name || '',
              technician_name: technicians.map((t) => t.name).filter(Boolean).join(', '),
              meeting_date: when,
              meeting_datetime: when,
              location: item.location || '',
              cancel_url: manageLink,
            },
            confirmUrl: confirmLink,
            leadEmail,
            leadPhone,
            address: item.location || '',
            appointmentUrl: `${siteUrl.replace(/\/+$/, '')}/scheduling`,
            technicians,
            rescheduled: true,
          });
        }
      }
    } catch (emailErr) {
      console.error('[reschedule-booking] reminder reschedule failed (non-fatal):', emailErr);
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

      // Modelo proprio por destinatario (reschedule_client / reschedule_technician);
      // sem nenhum configurado, o texto padrao do PROPRIO lado (nunca o do outro,
      // nem o aviso de nova reuniao). O comercial nunca recebe os links do cliente.
      const buildMail = async (kind: 'client' | 'technician') => {
        const defaultSubject = kind === 'client'
          ? 'A sua visita foi reagendada'
          : 'Reunião reagendada — {{lead_name}}';
        const vars = buildAudienceVars(baseVars, kind, {
          cancelUrl: cancelLink,
          leadPhone,
          leadEmail,
          address: item.location || '',
          appointmentUrl: `${siteUrlEnv.replace(/\/+$/, '')}/scheduling`,
        });
        const tpl = await loadTemplate(supabase, pickAudienceTemplateId(emailCfg, 'reschedule', kind, leadLocale));
        if (tpl?.body_html) {
          return {
            subject: renderSubject(tpl.subject || defaultSubject, vars),
            html: renderHtml(tpl.body_html, vars),
          };
        }
        return {
          subject: renderSubject(defaultSubject, vars),
          html: defaultMeetingHtml({
            audience: kind,
            leadPhone: kind === 'technician' ? (leadPhone || undefined) : undefined,
            leadEmail: kind === 'technician' ? (leadEmail || undefined) : undefined,
            address: kind === 'technician' ? (item.location || undefined) : undefined,
            appointmentUrl: kind === 'technician' ? `${siteUrlEnv.replace(/\/+$/, '')}/scheduling` : undefined,
            heading: 'Reunião reagendada',
            intro: kind === 'client'
              ? 'A sua visita foi reagendada para a data abaixo.'
              : 'Uma visita foi reagendada para a data abaixo.',
            leadName: leadName,
            when: formattedWhen,
            location: item.location || undefined,
            technicianName: technicianName || undefined,
            cancelUrl: kind === 'client' ? (cancelLink || undefined) : undefined,
            primaryColor: emailCfg?.primary_color, logoUrl: emailCfg?.logo_url,
          }),
        };
      };

      // (a) Client: friendly confirmation of the new slot. Has its own toggle
      // (reschedule_notify_client); absent config counts as on.
      if (leadEmail && shouldNotifyClient(emailCfg, 'reschedule')) {
        const mail = await buildMail('client');
        await sendEmailNow({
          organizationId,
          smtpId: emailCfg?.email_smtp_id,
          to: leadEmail,
          subject: mail.subject,
          html: mail.html,
        });
      }

      // (b) Technician + extra notify emails: internal notification.
      // Its own toggle ("Aviso ao comercial ao reagendar"), independent from
      // the new-booking and cancellation toggles.
      const extra = parseEmailList(emailCfg?.reschedule_notify_emails);
      const notifyList = uniqueEmails([
        emailCfg?.reschedule_notify_commercial ? technicianEmail : null,
        ...extra,
      ]);
      if (notifyList.length > 0) {
        const mail = await buildMail('technician');
        await sendEmailNow({
          organizationId,
          smtpId: emailCfg?.email_smtp_id,
          to: notifyList[0],
          recipients: notifyList,
          subject: mail.subject,
          html: mail.html,
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
