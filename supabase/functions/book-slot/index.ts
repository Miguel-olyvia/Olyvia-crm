import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { z } from "npm:zod";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, getClientIp, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { orderByLeastBusy } from "../_shared/leastBusy.ts";
import {
  loadFormEmailConfig,
  loadTemplate,
  sendEmailNow,
  scheduleEmail,
  renderHtml,
  renderSubject,
  parseEmailList,
  uniqueEmails,
  defaultMeetingHtml,
  pickTemplateId,
  buildManageUrl,
} from '../_shared/formEmails.ts';

initSentry();

const requestSchema = z.object({
  form_id: z.string(),
  step_number: z.number().optional(),
  slot_start: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Invalid datetime" }),
  slot_end: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Invalid datetime" }),
  postal_code: z.string().optional(),
  district_id: z.string().uuid().optional(),
  field_values: z.record(z.unknown()),
  campaign_id: z.string().optional(),
  // Nullable: PublicLeadForm.tsx sends `source_id: resolvedSourceId || null`
  // whenever no tracking source resolved (the normal case for an organic/
  // direct visit) - .optional() alone only accepts undefined, rejecting the
  // real null the client sends with a 400. Same bug class fixed earlier
  // today in create-lead/index.ts's source_id/sourceId fields; line 409
  // below already treats null as the correct "no source" value.
  source_id: z.string().optional().nullable(),
  lead_id: z.string().optional(),
  lang: z.string().optional(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT_BUCKET = 'book-slot';
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MINUTES = 5;

/**
 * Book Slot API
 * 
 * PUBLIC endpoint (no auth) — Books a scheduling slot from a public form.
 * Creates lead + schedule_item + assignee + booking_token + scheduled reminders.
 *
 * POST /book-slot
 * Body: {
 *   form_id, step_number, slot_start, slot_end,
 *   postal_code?, field_values, campaign_id?, source_id?, lead_id?
 * }
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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Rate limiting check — persistent, DB-backed; must come before any other DB work
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

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: parsed.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const {
      form_id,
      step_number,
      slot_start,
      slot_end,
      postal_code,
      district_id,
      field_values,
      campaign_id,
      source_id,
      lead_id,
      lang,
    } = parsed.data;
    const leadLocale = (typeof lang === 'string' && lang.trim()) ? lang.trim().toLowerCase() : null;

    // 1. Get form info
    const { data: form, error: formError } = await supabase
      .from('forms')
      .select('id, organization_id')
      .eq('id', form_id)
      .eq('is_active', true)
      .single();

    if (formError || !form) {
      return new Response(
        JSON.stringify({ error: 'Form not found or inactive' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const organizationId = form.organization_id;

    // 2. Get scheduling step config
    let boardId: string | null = null;
    let durationMinutes = 60;

    if (step_number) {
      const { data: step } = await supabase
        .from('form_steps')
        .select('scheduling_board_id, scheduling_duration_minutes')
        .eq('form_id', form_id)
        .eq('step_number', step_number)
        .single();

      if (step) {
        boardId = step.scheduling_board_id;
        durationMinutes = step.scheduling_duration_minutes || 60;
      }
    }

    if (!boardId) {
      // Try to find any scheduling step in this form
      const { data: schedulingStep } = await supabase
        .from('form_steps')
        .select('scheduling_board_id, scheduling_duration_minutes')
        .eq('form_id', form_id)
        .eq('step_type', 'scheduling')
        .limit(1)
        .maybeSingle();

      if (schedulingStep) {
        boardId = schedulingStep.scheduling_board_id;
        durationMinutes = schedulingStep.scheduling_duration_minutes || 60;
      }
    }

    if (!boardId) {
      return new Response(
        JSON.stringify({ error: 'No scheduling board configured for this form' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Find a resource with availability at the requested slot.
    // find_nearest_resources already applies the district-coverage-with-
    // fallback rule and excludes resources at max_daily_capacity for this
    // date (get_resource_available_slots enforces that). Among the
    // resources that actually have the exact requested slot, assignment
    // uses the same least_busy strategy as the internal auto-schedule flow
    // (supabase/functions/_shared/leastBusy.ts) — not a second, parallel
    // "fewest bookings" implementation.
    let assignedResourceId: string | null = null;

    const { data: resources } = await supabase.rpc('find_nearest_resources', {
      p_target_postal_code: postal_code || null,
      p_board_id: boardId,
      p_target_date: slot_start.split('T')[0],
      p_duration_minutes: durationMinutes,
      p_limit: 50,
      p_district_id: district_id || null,
    });

    const candidatesWithSlot = (resources || []).filter((res: any) => {
      const slots = res.available_slots || [];
      return slots.some((s: any) =>
        new Date(s.start).getTime() === new Date(slot_start).getTime() &&
        new Date(s.end).getTime() === new Date(slot_end).getTime()
      );
    });

    const orderedCandidates = await orderByLeastBusy(
      supabase,
      candidatesWithSlot.map((res: any) => ({ id: res.resource_id }))
    );

    for (const candidate of orderedCandidates) {
      // Re-verify at confirmation time — availability may have been computed
      // moments earlier and another booking could have taken the slot since.
      const { data: conflict } = await supabase.rpc('check_schedule_conflict', {
        p_resource_id: candidate.id,
        p_start: slot_start,
        p_end: slot_end,
      });
      if (!conflict) {
        assignedResourceId = candidate.id;
        break;
      }
    }

    if (!assignedResourceId) {
      return new Response(
        JSON.stringify({ error: 'Selected slot is no longer available. Please choose another.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Get root organization
    const { data: hierarchy } = await supabase
      .from('anew_hierarchy')
      .select('parent_org_id')
      .eq('child_org_id', organizationId)
      .limit(1)
      .maybeSingle();

    let rootOrganizationId = hierarchy?.parent_org_id || organizationId;

    // 5. Find admin user for created_by AND assigned_to (anew_users.id)
    let createdBy: string | null = null;   // anew_users.id for schedule_items.created_by
    let assignedToAnewId: string | null = null; // anew_users.id for anew_leads.assigned_to

    const { data: adminUser } = await supabase
      .from('anew_memberships')
      .select('user_id')
      .eq('organization_id', rootOrganizationId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (adminUser?.user_id) {
      assignedToAnewId = adminUser.user_id; // anew_users.id
      createdBy = adminUser.user_id;
    }

    // Fallback: use the board's created_by only after resolving it to anew_users.id.
    if (!createdBy) {
      const { data: board } = await supabase
        .from('schedule_boards')
        .select('created_by')
        .eq('id', boardId)
        .maybeSingle();
      const boardCreatedBy = board?.created_by || null;

      if (boardCreatedBy) {
        const { data: byBusinessId } = await supabase
          .from('anew_users')
          .select('id')
          .eq('id', boardCreatedBy)
          .maybeSingle();

        if (byBusinessId?.id) {
          createdBy = byBusinessId.id;
          assignedToAnewId = assignedToAnewId || byBusinessId.id;
        } else {
          const { data: byAuthId } = await supabase
            .from('anew_users')
            .select('id')
            .eq('auth_user_id', boardCreatedBy)
            .maybeSingle();
          createdBy = byAuthId?.id || null;
          assignedToAnewId = assignedToAnewId || byAuthId?.id || null;
        }
      }
    }

    if (!createdBy) {
      return new Response(
        JSON.stringify({ error: 'No valid user found to create schedule item' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Resolve existing lead + merged field values
    let lead: { id: string } | null = null;
    let entityId: string | null = null;
    let mergedFieldValues: Record<string, any> = field_values;

    if (lead_id) {
      const { data: existingLead, error: existingLeadError } = await supabase
        .from('anew_leads')
        .select('id, entity_id, field_values, root_organization_id')
        .eq('id', lead_id)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (existingLeadError || !existingLead) {
        return new Response(
          JSON.stringify({ error: 'Lead not found for this form', details: existingLeadError?.message }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      lead = { id: existingLead.id };
      entityId = existingLead.entity_id;
      rootOrganizationId = existingLead.root_organization_id || rootOrganizationId;

      const existingFieldValues = existingLead.field_values && typeof existingLead.field_values === 'object' && !Array.isArray(existingLead.field_values)
        ? existingLead.field_values as Record<string, any>
        : {};

      mergedFieldValues = {
        ...existingFieldValues,
        ...field_values,
      };
    }

    // 7. Entity deduplication (same logic as insert-lead)
    const leadEmailRaw = mergedFieldValues.email || mergedFieldValues.po_email || mergedFieldValues.Email || null;
    const leadEmail = leadEmailRaw ? String(leadEmailRaw).toLowerCase().trim() : null;
    const leadPhone = mergedFieldValues.phone || mergedFieldValues.po_telefone || mergedFieldValues.telefone || null;
    const leadFirstName = mergedFieldValues.first_name || mergedFieldValues.po_nome || mergedFieldValues.nome || '';
    const leadLastName = mergedFieldValues.last_name || mergedFieldValues.po_apelido || mergedFieldValues.apelido || '';
    // extractField: substring fallback ONLY for fullLocation (descriptive text)
    const extractField = (values: Record<string, any>, ...patterns: string[]): string => {
      for (const p of patterns) { if (values[p]) return String(values[p]); }
      for (const [k, v] of Object.entries(values)) {
        if (patterns.some(p => k.toLowerCase().includes(p)) && v) return String(v);
      }
      return '';
    };

    const fullLocation = [
      extractField(mergedFieldValues, 'address', 'morada'),
      postal_code || extractField(mergedFieldValues, 'postal_code', 'codigo_postal'),
      extractField(mergedFieldValues, 'city', 'localidade', 'cidade'),
    ].filter(Boolean).join(', ');

    if (leadEmail) {
      const { data: existingEmail } = await supabase
        .from('anew_entity_emails')
        .select('entity_id')
        .eq('email', leadEmail)
        .limit(1)
        .maybeSingle();

      if (existingEmail?.entity_id) {
        entityId = existingEmail.entity_id;
      }
    }

    if (!entityId) {
      const displayName = [leadFirstName, leadLastName].filter(Boolean).join(' ') || 'Lead';
      const entityInsert: Record<string, any> = {
        display_name: displayName,
        type: 'person',
        status: 'active',
      };
      if (leadFirstName) entityInsert.first_name = leadFirstName;
      if (leadLastName) entityInsert.last_name = leadLastName;

      const { data: newEntity, error: entityError } = await supabase
        .from('anew_entities')
        .insert(entityInsert)
        .select('id')
        .single();

      if (!entityError && newEntity) {
        entityId = newEntity.id;

        const promises: Promise<any>[] = [];
        if (leadEmail) {
          promises.push(supabase.from('anew_entity_emails').insert({
            entity_id: entityId, email: leadEmail, is_primary: true,
          }));
        }
        if (leadPhone) {
          promises.push(supabase.from('anew_entity_phones').insert({
            entity_id: entityId, phone_number: String(leadPhone), is_primary: true,
          }));
        }
        await Promise.all(promises);
      }
    }

    // P5: Resolve resource user_id BEFORE lead creation
    const { data: assignedResource } = await supabase
      .from('schedule_resources')
      .select('resource_type, user_id')
      .eq('id', assignedResourceId)
      .maybeSingle();

    // Any resource linked to a user hands the lead to that user. The previous
    // `resource_type === 'user'` guard meant technicians stored under any other
    // resource_type were skipped, and the lead fell back to the arbitrary
    // organization member picked earlier — so the person doing the visit and
    // the lead's owner were different people.
    if (assignedResource?.user_id) {
      assignedToAnewId = assignedResource.user_id;
    }

    // 8. Create lead when needed
    if (!lead) {
      const { data: newLead, error: leadError } = await supabase
        .from('anew_leads')
        .insert({
          organization_id: organizationId,
          root_organization_id: rootOrganizationId,
          entity_id: entityId,
          field_values: mergedFieldValues,
          source: 'form',
          source_id: source_id || null,
          campaign_id: campaign_id || null,
          status: 'scheduled',
          created_by: assignedToAnewId || null,
          assigned_to: assignedToAnewId || null,
          callback_scheduled_at: slot_start,
          lead_district_id: district_id || null,
        })
        .select('id')
        .single();

      if (leadError || !newLead) {
        console.error('Error creating lead:', leadError);
        return new Response(
          JSON.stringify({ error: 'Failed to create lead', details: leadError?.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      lead = newLead;
    }

    // 9. Create schedule_item
    const title = `Visita - ${[leadFirstName, leadLastName].filter(Boolean).join(' ') || 'Lead'}`;

    const { data: scheduleItem, error: itemError } = await supabase
      .from('schedule_items')
      .insert({
        board_id: boardId,
        title,
        description: `Lead: ${lead.id}`,
        status: 'scheduled',
        origin: 'api',
        start_datetime: slot_start,
        end_datetime: slot_end,
        // duration_minutes is a generated column, skip it
        location: fullLocation || null,
        priority: 0,
        metadata: {
          lead_id: lead.id,
          form_id,
          postal_code: postal_code || field_values.postal_code,
          booked_via: 'public_form',
        },
        organization_id: organizationId,
        created_by: createdBy,
      })
      .select('id')
      .single();

    if (itemError || !scheduleItem) {
      console.error('Error creating schedule item:', itemError);
      return new Response(
        JSON.stringify({ error: 'Failed to create schedule item', details: itemError?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 10. Link resource to schedule item (prevents double bookings)
    const { error: assigneeError } = await supabase
      .from('schedule_item_assignees')
      .insert({
        item_id: scheduleItem.id,
        resource_id: assignedResourceId,
        role: 'assigned',
      });

    if (assigneeError) {
      // Without the resource link the booking is a ghost: no technician assigned and,
      // crucially, invisible to check_schedule_conflict (which joins assignees). Rather
      // than mark the lead 'scheduled' on a phantom item, roll the item back and fail so
      // the client can retry.
      console.error('Error creating schedule item assignee:', assigneeError);
      await supabase.from('schedule_items').update({ status: 'cancelled' }).eq('id', scheduleItem.id);
      return new Response(
        JSON.stringify({ error: 'Não foi possível concluir a reserva. Tente novamente.', code: 'RETRY' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 10b. Double-booking guard (TOCTOU). The earlier conflict check and this insert are
    //      not atomic, so a concurrent request could have booked the same resource+time in
    //      between. Re-check NOW, excluding our own just-created item; if a real overlap
    //      exists, roll back (free the assignee + cancel our item) and ask for another slot.
    const { data: nowConflicts } = await supabase.rpc('check_schedule_conflict', {
      p_resource_id: assignedResourceId,
      p_start: slot_start,
      p_end: slot_end,
      p_exclude_item_id: scheduleItem.id,
    });
    if (nowConflicts === true) {
      await supabase.from('schedule_item_assignees').delete().eq('item_id', scheduleItem.id);
      await supabase.from('schedule_items').update({ status: 'cancelled' }).eq('id', scheduleItem.id);
      return new Response(
        JSON.stringify({ error: 'Este horário já não está disponível. Escolha outro.', code: 'SLOT_TAKEN' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update lead with scheduled_visit_id
    const leadUpdate: Record<string, any> = {
      scheduled_visit_id: scheduleItem.id,
      callback_scheduled_at: slot_start,
      status: 'scheduled',
    };
    if (district_id) {
      leadUpdate.lead_district_id = district_id;
    }
    if (assignedToAnewId) {
      leadUpdate.assigned_to = assignedToAnewId;
    }
    if (lead_id) {
      leadUpdate.field_values = mergedFieldValues;
      leadUpdate.entity_id = entityId;
    }

    const { error: leadUpdateError } = await supabase
      .from('anew_leads')
      .update(leadUpdate)
      .eq('id', lead.id);

    if (leadUpdateError) {
      console.error('Error updating lead after booking:', leadUpdateError);
    }

    // If this lead had a pending "finish scheduling" invite (completed the form earlier
    // without picking a slot), burn it and cancel its follow-up email now that a slot is
    // booked — so the nudge never lands after the visit is already scheduled. Fail-soft.
    try {
      await supabase.from('scheduling_invites').update({ used_at: new Date().toISOString() }).eq('lead_id', lead.id).is('used_at', null);
      await supabase.from('scheduled_emails').update({ status: 'cancelled' }).eq('entity_type', 'lead_scheduling_invite').eq('entity_id', lead.id).eq('status', 'pending');
    } catch (inviteBurnErr) {
      console.error('[book-slot] failed to burn scheduling invite (non-fatal):', inviteBurnErr);
    }

    // 11. Create booking token for cancellation.
    // Add 24h in milliseconds (UTC) rather than setHours(), which does local-time
    // arithmetic and drifts by an hour across a DST transition.
    const expiresAt = new Date(new Date(slot_start).getTime() + 24 * 3600000); // valid until 24h after visit

    const { data: bookingToken } = await supabase
      .from('booking_tokens')
      .insert({
        schedule_item_id: scheduleItem.id,
        action: 'cancel',
        expires_at: expiresAt.toISOString(),
      })
      .select('token')
      .single();

    // 12. Per-form meeting emails (config on form_branding). Fail-soft: booking
    //     must succeed regardless of email issues.
    try {
      const emailCfg = await loadFormEmailConfig(supabase, form_id);

      // Resolve the assigned technician's name + email (schedule_resources.user_id → profiles).
      let technicianEmail = '';
      let technicianName = '';
      if (assignedResource?.user_id) {
        const { data: prof } = await supabase
          .from('anew_users')
          .select('email, name, auth_user_id')
          .eq('id', assignedResource.user_id)
          .maybeSingle();
        technicianEmail = (prof?.email || '').toLowerCase().trim();
        technicianName = prof?.name || '';

        // In-app bell notification to the assigned commercial/technician —
        // separate from (and unconditional on) the meeting_notify_commercial
        // email toggle below, matching the always-on pattern used for other
        // assignment notifications (see send-schedule-invite). notifications.user_id
        // is the AUTH user id (anew_users.auth_user_id), while schedule_resources.user_id
        // is the business (anew_users) id.
        try {
          if (prof?.auth_user_id) {
            // Respect a per-org mute for this notification, if configured (default: on).
            let notifEnabled = true;
            const { data: setting } = await supabase
              .from('alert_settings')
              .select('is_active')
              .eq('organization_id', organizationId)
              .eq('alert_type', 'schedule_booking')
              .eq('kind', 'notification')
              .maybeSingle();
            if (setting && setting.is_active === false) notifEnabled = false;

            if (notifEnabled) {
              const leadFullNameForNotif = [leadFirstName, leadLastName].filter(Boolean).join(' ') || 'Lead';
              const whenFormattedForNotif = new Date(slot_start).toLocaleString('pt-PT', {
                timeZone: 'Europe/Lisbon', weekday: 'long', day: 'numeric', month: 'long',
                hour: '2-digit', minute: '2-digit',
              });
              await supabase.from('notifications').insert({
                user_id: prof.auth_user_id,
                organization_id: organizationId,
                type: 'schedule_booking',
                kind: 'notification',
                title: 'Nova visita agendada',
                message: `${leadFullNameForNotif} agendou uma visita para ${whenFormattedForNotif}`,
                link: '/scheduling',
                entity_type: 'schedule_item',
                entity_id: scheduleItem.id,
                data: { schedule_item_id: scheduleItem.id, lead_id: lead.id },
              });
            }
          }
        } catch (notifErr) {
          console.error('[book-slot] in-app notification failed (non-fatal):', notifErr);
        }
      }

      // If this lead had a pending "finish scheduling" invite (completed the
      // form earlier without picking a slot), burn it and cancel its
      // follow-up nudge now that a slot IS booked — otherwise the visitor
      // would get a confusing "you still need to book" email after already
      // booking. Fail-soft.
      try {
        await supabase.from('scheduling_invites').update({ used_at: new Date().toISOString() }).eq('lead_id', lead.id).is('used_at', null);
        await supabase.from('scheduled_emails').update({ status: 'cancelled' }).eq('entity_type', 'lead_scheduling_invite').eq('entity_id', lead.id).eq('status', 'pending');
      } catch (inviteBurnErr) {
        console.error('[book-slot] failed to burn scheduling invite (non-fatal):', inviteBurnErr);
      }

      const { data: orgRow } = await supabase
        .from('anew_organizations')
        .select('name')
        .eq('id', organizationId)
        .maybeSingle();

      const leadFullName = [leadFirstName, leadLastName].filter(Boolean).join(' ') || 'Lead';
      const whenFormatted = new Date(slot_start).toLocaleString('pt-PT', {
        timeZone: 'Europe/Lisbon', weekday: 'long', day: 'numeric', month: 'long',
        hour: '2-digit', minute: '2-digit',
      });
      const siteUrlEnv = Deno.env.get('SITE_URL') || 'https://olyvia.lovable.app';
      const cancelLink = bookingToken?.token
        ? buildManageUrl(emailCfg?.booking_manage_url_template, leadLocale, bookingToken.token, siteUrlEnv)
        : '';

      const baseVars: Record<string, string> = {
        lead_name: leadFullName,
        client_name: leadFullName,
        lead_email: leadEmail || '',
        client_email: leadEmail || '',
        lead_phone: String(leadPhone || ''),
        company_name: orgRow?.name || '',
        technician_name: technicianName,
        meeting_date: whenFormatted,
        meeting_datetime: whenFormatted,
        location: fullLocation || '',
        cancel_url: cancelLink,
      };

      // (0) Client confirmation email — includes the booked {{meeting_date}} and the
      //     manage/cancel link {{cancel_url}}. Only when confirmation is enabled, we
      //     have a client email, and a template resolves.
      if (emailCfg?.confirmation_email_enabled && leadEmail) {
        const confTemplateId = pickTemplateId(emailCfg, 'confirmation', leadLocale, emailCfg.confirmation_email_template_id);
        const confTpl = confTemplateId ? await loadTemplate(supabase, confTemplateId) : null;
        if (confTpl?.body_html) {
          await sendEmailNow({
            organizationId,
            smtpId: emailCfg.email_smtp_id,
            to: leadEmail,
            subject: renderSubject(confTpl.subject || 'Confirmação', baseVars),
            html: renderHtml(confTpl.body_html, baseVars),
          });
        }
      }

      // (a) Immediate notification to the assigned commercial + any extra emails.
      if (emailCfg?.meeting_notify_commercial || emailCfg?.meeting_notify_emails) {
        const extra = parseEmailList(emailCfg?.meeting_notify_emails);
        const notifyList = uniqueEmails([
          emailCfg?.meeting_notify_commercial ? technicianEmail : null,
          ...extra,
        ]);
        if (notifyList.length > 0) {
          const tpl = await loadTemplate(supabase, pickTemplateId(emailCfg, 'meeting_notify', leadLocale, emailCfg?.meeting_notify_template_id));
          const subject = renderSubject(tpl?.subject || 'Nova reunião agendada — {{lead_name}}', baseVars);
          const html = tpl?.body_html
            ? renderHtml(tpl.body_html, baseVars)
            : defaultMeetingHtml({
                heading: 'Nova reunião agendada',
                intro: 'Foi marcada uma nova visita através do formulário.',
                leadName: leadFullName, when: whenFormatted,
                location: fullLocation || undefined,
                technicianName: technicianName || undefined,
                cancelUrl: cancelLink || undefined,
              });
          await sendEmailNow({ organizationId, userId: createdBy, smtpId: emailCfg?.email_smtp_id, to: notifyList[0], recipients: notifyList, subject, html });
        }
      }

      // (b) Reminder X hours before — to the technician AND the client.
      if (emailCfg?.reminder_enabled) {
        const hoursBefore = emailCfg.reminder_hours_before && emailCfg.reminder_hours_before > 0 ? emailCfg.reminder_hours_before : 2;
        const remindAt = new Date(new Date(slot_start).getTime() - hoursBefore * 3600000);
        if (remindAt.getTime() > Date.now()) {
          const reminderTemplateId = pickTemplateId(emailCfg, 'reminder', leadLocale, emailCfg.reminder_template_id);
          const tpl = await loadTemplate(supabase, reminderTemplateId);
          const subject = renderSubject(tpl?.subject || 'Lembrete: reunião {{meeting_date}}', baseVars);
          const htmlFor = (kind: 'client' | 'technician') => tpl?.body_html
            ? renderHtml(tpl.body_html, baseVars)
            : defaultMeetingHtml({
                heading: 'Lembrete de reunião',
                intro: kind === 'client' ? 'Este é um lembrete da sua visita agendada.' : 'Lembrete: tem uma visita agendada.',
                leadName: leadFullName, when: whenFormatted,
                location: fullLocation || undefined,
                technicianName: technicianName || undefined,
                cancelUrl: kind === 'client' ? (cancelLink || undefined) : undefined,
              });
          const targets: { email: string; kind: 'client' | 'technician' }[] = [];
          if (leadEmail) targets.push({ email: leadEmail, kind: 'client' });
          if (technicianEmail) targets.push({ email: technicianEmail, kind: 'technician' });
          for (const t of targets) {
            await scheduleEmail(supabase, {
              organizationId, userId: createdBy, toEmail: t.email,
              subject, bodyHtml: htmlFor(t.kind), scheduledFor: remindAt.toISOString(),
              entityType: 'leads', entityId: lead.id, templateId: reminderTemplateId || null, smtpId: emailCfg.email_smtp_id,
            });
          }
        }
      }
    } catch (emailErr) {
      console.error('[book-slot] meeting emails failed (non-fatal):', emailErr);
    }

    // Build response
    const siteUrl = Deno.env.get('SITE_URL') || 'https://olyvia.lovable.app';
    const cancelUrl = bookingToken?.token
      ? `${siteUrl}/booking/cancel?token=${bookingToken.token}`
      : undefined;

    const formattedStart = new Date(slot_start).toLocaleString('pt-PT', {
      timeZone: 'Europe/Lisbon',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    console.log(`book-slot: lead=${lead.id}, item=${scheduleItem.id}, resource=${assignedResourceId}, slot=${slot_start}`);

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: lead.id,
        schedule_item_id: scheduleItem.id,
        booking_ref: scheduleItem.id.slice(0, 8).toUpperCase(),
        scheduled_start: slot_start,
        scheduled_end: slot_end,
        scheduled_start_formatted: formattedStart,
        cancel_url: cancelUrl,
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in book-slot:', error);
    await captureError(error, { function: "book-slot" });
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
