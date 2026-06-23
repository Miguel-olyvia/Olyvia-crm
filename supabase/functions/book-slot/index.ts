import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { z } from "npm:zod";

const requestSchema = z.object({
  form_id: z.string(),
  step_number: z.number().optional(),
  slot_start: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Invalid datetime" }),
  slot_end: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Invalid datetime" }),
  postal_code: z.string().optional(),
  field_values: z.record(z.unknown()),
  campaign_id: z.string().optional(),
  source_id: z.string().optional(),
  lead_id: z.string().optional(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- Rate Limiting (in-memory, per-isolate) ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;          // max requests per window
const RATE_WINDOW = 300_000;   // 5 minutes (300 seconds)

function checkRateLimit(req: Request): Response | null {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    'unknown';
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (entry && now < entry.resetAt) {
    entry.count++;
    if (entry.count > RATE_LIMIT) {
      return new Response(
        JSON.stringify({ error: 'Too many booking attempts. Try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '300' } }
      );
    }
  } else {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
  }

  // Cleanup stale entries when map grows large
  if (rateLimitMap.size > 10_000) {
    for (const [k, v] of rateLimitMap) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
  }

  return null; // not rate-limited
}

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

  // Rate limiting check — must come before any DB work
  const rateLimitResponse = checkRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  try {
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
      field_values,
      campaign_id,
      source_id,
      lead_id,
    } = parsed.data;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    // 3. Find a resource with availability at the requested slot
    let assignedResourceId: string | null = null;

    if (postal_code) {
      // Use proximity-based search
      const { data: resources } = await supabase.rpc('find_nearest_resources', {
        p_target_postal_code: postal_code,
        p_board_id: boardId,
        p_target_date: slot_start.split('T')[0],
        p_duration_minutes: durationMinutes,
        p_limit: 10,
      });

      // Find a resource that has the exact requested slot
      for (const res of (resources || [])) {
        const slots = res.available_slots || [];
        const hasSlot = slots.some((s: any) =>
          new Date(s.start).getTime() === new Date(slot_start).getTime() &&
          new Date(s.end).getTime() === new Date(slot_end).getTime()
        );
        if (hasSlot) {
          // Double-check no conflict
          const { data: conflict } = await supabase.rpc('check_schedule_conflict', {
            p_resource_id: res.resource_id,
            p_start: slot_start,
            p_end: slot_end,
          });
          if (!conflict) {
            assignedResourceId = res.resource_id;
            break;
          }
        }
      }
    } else {
      // Without postal code, find any resource in this organization
      const { data: boardResources } = await supabase
        .from('schedule_resources')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      for (const res of (boardResources || [])) {
        const { data: conflict } = await supabase.rpc('check_schedule_conflict', {
          p_resource_id: res.id,
          p_start: slot_start,
          p_end: slot_end,
        });
        if (!conflict) {
          assignedResourceId = res.id;
          break;
        }
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

    if (assignedResource?.resource_type === 'user' && assignedResource?.user_id) {
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
      console.error('Error creating schedule item assignee:', assigneeError);
    }

    // Update lead with scheduled_visit_id
    const leadUpdate: Record<string, any> = {
      scheduled_visit_id: scheduleItem.id,
      callback_scheduled_at: slot_start,
      status: 'scheduled',
    };
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

    // 11. Create booking token for cancellation
    const expiresAt = new Date(slot_start);
    expiresAt.setHours(expiresAt.getHours() + 24); // token valid until 24h after visit

    const { data: bookingToken } = await supabase
      .from('booking_tokens')
      .insert({
        schedule_item_id: scheduleItem.id,
        action: 'cancel',
        expires_at: expiresAt.toISOString(),
      })
      .select('token')
      .single();

    // 12. Insert scheduled email reminders (24h and 1h before)
    const startDate = new Date(slot_start);

    const reminder24h = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
    const reminder1h = new Date(startDate.getTime() - 1 * 60 * 60 * 1000);
    const now = new Date();

    const reminders = [];
    if (reminder24h > now) {
      reminders.push({
        organization_id: organizationId,
        email_type: 'schedule_reminder',
        recipient_email: leadEmail || '',
        subject: `Lembrete: Visita agendada para amanhã`,
        body: JSON.stringify({
          lead_id: lead.id,
          schedule_item_id: scheduleItem.id,
          slot_start,
          slot_end,
          lead_name: [leadFirstName, leadLastName].filter(Boolean).join(' '),
        }),
        scheduled_for: reminder24h.toISOString(),
        status: 'pending',
        metadata: { type: 'reminder_24h', schedule_item_id: scheduleItem.id },
      });
    }
    if (reminder1h > now) {
      reminders.push({
        organization_id: organizationId,
        email_type: 'schedule_reminder',
        recipient_email: leadEmail || '',
        subject: `Lembrete: Visita agendada dentro de 1 hora`,
        body: JSON.stringify({
          lead_id: lead.id,
          schedule_item_id: scheduleItem.id,
          slot_start,
          slot_end,
          lead_name: [leadFirstName, leadLastName].filter(Boolean).join(' '),
        }),
        scheduled_for: reminder1h.toISOString(),
        status: 'pending',
        metadata: { type: 'reminder_1h', schedule_item_id: scheduleItem.id },
      });
    }

    if (reminders.length > 0) {
      await supabase.from('scheduled_emails').insert(reminders);
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
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
