import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCallerIdentity, validateOrgScope, authErrorResponse } from "../_shared/auth.ts";
import { z } from "npm:zod";

const requestSchema = z.object({
  organization_id: z.string(),
  campaign_id: z.string().optional(),
  requested_date: z.string(),
  requested_time: z.string().optional(),
  duration_minutes: z.number().optional(),
  lead_postal_code: z.string().optional(),
});

import { getCorsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { callAiGateway } from "../_shared/aiGateway.ts";

initSentry();

// Authenticated, org-scoped internal AI tool — persistent (DB-backed) rate
// limit per organization, to bound AI-gateway cost/abuse.
const RATE_LIMIT_BUCKET = "suggest-schedule-assignee";
const RATE_LIMIT_MAX_ATTEMPTS = 30;
const RATE_LIMIT_WINDOW_MINUTES = 1;

interface AISchedulingRules {
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  min_visit_duration_minutes: number;
  max_visits_per_day_per_employee: number;
  max_visits_per_week_per_employee: number;
  earliest_start_time: string;
  latest_end_time: string;
  allowed_weekdays: number[];
  use_postal_code_proximity: boolean;
  max_distance_km: number;
  prioritize_nearest: boolean;
  balance_workload: boolean;
  workload_weight_percent: number;
  ai_system_prompt: string | null;
  ai_considerations: string[] | null;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Scoped client — carries the caller's own JWT, so identity resolution,
  // org-scope validation and every business-data read below run under the
  // caller's real RLS/permissions (has_scheduling_permission,
  // get_user_visible_org_ids), exactly as if the frontend had called them directly.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  // Residual service-role client — ONLY for the persistent rate-limit table
  // (RLS enabled, zero policies for "authenticated" by design).
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // Auth: resolve caller and validate org scope
    const caller = await resolveCallerIdentity(req, supabase);

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const {
      organization_id,
      campaign_id,
      requested_date,
      requested_time,
      lead_postal_code,
    } = parsed.data;
    const duration_minutes = parsed.data.duration_minutes ?? 60;

    // Scope check: caller must belong to the requested organization
    const hasAccess = await validateOrgScope(supabase, caller, organization_id);
    if (!hasAccess) {
      return new Response(
        JSON.stringify({ error: "Access denied to this organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limiting — persistent, DB-backed; scoped per organization.
    const rateLimit = await checkRateLimit(supabaseAdmin, {
      bucket: RATE_LIMIT_BUCKET,
      identifier: organization_id || caller.anewUserId,
      maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
      windowMinutes: RATE_LIMIT_WINDOW_MINUTES,
    });
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit, corsHeaders);
    }
    await recordRateLimitAttempt(supabaseAdmin, RATE_LIMIT_BUCKET, organization_id || caller.anewUserId);

    // 1. Load AI Scheduling Rules (campaign-specific, then organization, then template)
    let rules: AISchedulingRules;
    
    // First try campaign-specific rules
    if (campaign_id) {
      const { data: campaignRules } = await supabase
        .from("lead_ai_scheduling_rules")
        .select("*")
        .eq("campaign_id", campaign_id)
        .eq("organization_id", organization_id)
        .eq("is_active", true)
        .order("priority", { ascending: false })
        .limit(1)
        .single();
      
      if (campaignRules) {
        rules = campaignRules;
      }
    }

    // Then try organization-specific rules
    if (!rules!) {
      const { data: orgRules } = await supabase
        .from("lead_ai_scheduling_rules")
        .select("*")
        .eq("organization_id", organization_id)
        .is("campaign_id", null)
        .eq("is_active", true)
        .order("priority", { ascending: false })
        .limit(1)
        .single();

      if (orgRules) {
        rules = orgRules;
      }
    }

    // Finally fallback to template
    if (!rules!) {
      const { data: templateRules } = await supabase
        .from("lead_ai_scheduling_rules")
        .select("*")
        .is("organization_id", null)
        .is("campaign_id", null)
        .eq("is_active", true)
        .order("priority", { ascending: false })
        .limit(1)
        .single();
      
      rules = templateRules || {
        buffer_before_minutes: 30,
        buffer_after_minutes: 30,
        min_visit_duration_minutes: 60,
        max_visits_per_day_per_employee: 6,
        max_visits_per_week_per_employee: 25,
        earliest_start_time: "08:00",
        latest_end_time: "18:00",
        allowed_weekdays: [1, 2, 3, 4, 5],
        use_postal_code_proximity: true,
        max_distance_km: 50,
        prioritize_nearest: true,
        balance_workload: true,
        workload_weight_percent: 30,
        ai_system_prompt: null,
        ai_considerations: null
      };
    }

    const totalBuffer = rules.buffer_before_minutes + rules.buffer_after_minutes;

    // 2. Get assignees via anew_memberships + anew_users + schedule_resources
    
    // 2a. Get users from anew_memberships for this organization
    const { data: memberships, error: membershipsError } = await supabase
      .from("anew_memberships")
      .select("user_id")
      .eq("organization_id", organization_id)
      .eq("status", "active")
      .limit(500);
    
    if (membershipsError) {
      console.error("Error fetching memberships:", membershipsError);
    }

    const memberUserIds = (memberships || []).map(m => m.user_id).filter(Boolean);
    let userProfiles: { id: string; display_name: string | null }[] = [];
    
    if (memberUserIds.length > 0) {
      const { data: users } = await supabase
        .from("anew_users")
        .select("id, display_name")
        .in("id", memberUserIds);
      userProfiles = users || [];
    }

    // 2b. Get schedule resources for this organization
    const { data: resources } = await supabase
      .from("schedule_resources")
      .select("id, user_id, name, metadata")
      .eq("is_active", true)
      .eq("organization_id", organization_id)
      .limit(500);

    // Combine and deduplicate (priority: resources > memberships)
    // schedule_resources.user_id now stores anew_users.id directly (no auth UUID resolution needed)
    const seenAnewUserIds = new Set<string>();
    const allAssignees: {
      id: string;
      type: string;
      user_id: string | null;
      resource_id: string | null;
      name: string;
      postal_code: string | null;
    }[] = [];

    // First add schedule_resources (user_id is already anew_users.id)
    (resources || []).forEach(r => {
      if (r.user_id && !seenAnewUserIds.has(r.user_id)) {
        seenAnewUserIds.add(r.user_id);
        allAssignees.push({
          id: r.id,
          type: "resource",
          user_id: r.user_id,         // anew_users.id (internal)
          resource_id: r.id,           // schedule_resources.id (for scheduling)
          name: r.name,
          postal_code: (r.metadata as any)?.postal_code || null,
        });
      }
    });

    // Then add membership users not already added
    userProfiles.forEach(profile => {
      if (profile.id && !seenAnewUserIds.has(profile.id)) {
        seenAnewUserIds.add(profile.id);
        allAssignees.push({
          id: profile.id,
          type: "user",
          user_id: profile.id,
          resource_id: null,
          name: profile.display_name || "Utilizador",
          postal_code: null,
        });
      }
    });

    const uniqueAssignees = allAssignees.filter(a => a.user_id);

    if (uniqueAssignees.length === 0) {
      return new Response(
        JSON.stringify({ 
          suggestions: [],
          message: "Nenhum colaborador disponível encontrado nesta organização" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Get existing schedule items for the requested date
    const dateStart = `${requested_date}T00:00:00`;
    const dateEnd = `${requested_date}T23:59:59`;

    const requestedDateObj = new Date(requested_date);
    const dayOfWeek = requestedDateObj.getDay();
    const weekStart = new Date(requestedDateObj);
    weekStart.setDate(requestedDateObj.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    const resourceIds = uniqueAssignees.filter(a => a.type === "resource").map(a => a.id);
    
    let existingItems: any[] = [];
    let weeklyItems: any[] = [];
    
    if (resourceIds.length > 0) {
      const { data: dayAssignments } = await supabase
        .from("schedule_item_assignees")
        .select(`
          resource_id,
          schedule_items!inner (
            id, start_datetime, end_datetime, status, location
          )
        `)
        .in("resource_id", resourceIds)
        .gte("schedule_items.start_datetime", dateStart)
        .lte("schedule_items.start_datetime", dateEnd)
        .neq("schedule_items.status", "cancelled");

      if (dayAssignments) {
        existingItems = dayAssignments.map((a: any) => ({
          ...a.schedule_items,
          resource_id: a.resource_id
        }));
      }

      const { data: weekAssignments } = await supabase
        .from("schedule_item_assignees")
        .select(`
          resource_id,
          schedule_items!inner (
            id, start_datetime, end_datetime, status
          )
        `)
        .in("resource_id", resourceIds)
        .gte("schedule_items.start_datetime", `${weekStartStr}T00:00:00`)
        .lte("schedule_items.start_datetime", `${weekEndStr}T23:59:59`)
        .neq("schedule_items.status", "cancelled");

      if (weekAssignments) {
        weeklyItems = weekAssignments;
      }
    }

    // 4. Get last visit for each assignee
    const lastVisits: Record<string, { date: string; location: string | null }> = {};
    
    if (resourceIds.length > 0) {
      const { data: lastVisitData } = await supabase
        .from("schedule_item_assignees")
        .select(`
          resource_id,
          schedule_items!inner (
            id, start_datetime, location
          )
        `)
        .in("resource_id", resourceIds)
        .lt("schedule_items.start_datetime", dateStart)
        .order("schedule_items.start_datetime", { ascending: false })
        .limit(100);

      if (lastVisitData) {
        for (const item of lastVisitData) {
          const resId = (item as any).resource_id;
          if (!lastVisits[resId]) {
            lastVisits[resId] = {
              date: (item as any).schedule_items.start_datetime,
              location: (item as any).schedule_items.location
            };
          }
        }
      }
    }

    // 5. Build context for each assignee
    const requestedStart = requested_time ? `${requested_date}T${requested_time}:00` : null;
    const requestedEnd = requestedStart 
      ? new Date(new Date(requestedStart).getTime() + duration_minutes * 60000).toISOString()
      : null;

    const assigneeSchedules = uniqueAssignees.map(assignee => {
      const assigneeItems = existingItems.filter((item: any) => item.resource_id === assignee.id);
      const weeklyCount = weeklyItems.filter((item: any) => item.resource_id === assignee.id).length;
      const dailyCount = assigneeItems.length;
      const lastVisit = lastVisits[assignee.id] || null;
      
      return {
        ...assignee,
        scheduled_items: assigneeItems.map(item => ({
          start: item.start_datetime,
          end: item.end_datetime,
          status: item.status,
          location: item.location
        })),
        daily_visits_count: dailyCount,
        weekly_visits_count: weeklyCount,
        last_visit: lastVisit ? {
          date: lastVisit.date,
          location: lastVisit.location
        } : null,
        postal_code_match: lead_postal_code && assignee.postal_code && 
          assignee.postal_code.substring(0, 4) === lead_postal_code.substring(0, 4)
      };
    });

    // 6. Use AI to analyze and suggest best assignees
    if (!Deno.env.get("AI_GATEWAY_API_KEY")) {
      // Fallback without AI
      const availableAssignees = assigneeSchedules
        .filter(assignee => {
          if (assignee.daily_visits_count >= rules.max_visits_per_day_per_employee) return false;
          if (assignee.weekly_visits_count >= rules.max_visits_per_week_per_employee) return false;
          
          if (!requestedStart) return true;
          
          const requestedStartTime = new Date(requestedStart).getTime();
          const requestedEndTime = new Date(requestedEnd!).getTime();
          const bufferMs = totalBuffer * 60000;
          
          for (const item of assignee.scheduled_items) {
            const itemStart = new Date(item.start).getTime();
            const itemEnd = new Date(item.end).getTime();
            
            if (
              (requestedStartTime >= itemStart - bufferMs && requestedStartTime < itemEnd + bufferMs) ||
              (requestedEndTime > itemStart - bufferMs && requestedEndTime <= itemEnd + bufferMs) ||
              (requestedStartTime <= itemStart && requestedEndTime >= itemEnd)
            ) {
              return false;
            }
          }
          return true;
        })
        .sort((a, b) => {
          if (a.postal_code_match && !b.postal_code_match) return -1;
          if (!a.postal_code_match && b.postal_code_match) return 1;
          return a.weekly_visits_count - b.weekly_visits_count;
        });

      return new Response(
        JSON.stringify({
          suggestions: availableAssignees.map((a, idx) => ({
            user_id: a.user_id,
            name: a.name,
            type: a.type,
            resource_id: a.resource_id || null,
            score: 100 - idx * 10,
            reason: a.postal_code_match 
              ? "Código postal próximo" 
              : `${a.weekly_visits_count} visitas esta semana`,
            available: true,
            daily_visits: a.daily_visits_count,
            weekly_visits: a.weekly_visits_count,
            last_visit: a.last_visit,
            postal_code_match: a.postal_code_match
          })).slice(0, 5),
          ai_used: false,
          rules_applied: {
            buffer_minutes: totalBuffer,
            max_daily: rules.max_visits_per_day_per_employee,
            max_weekly: rules.max_visits_per_week_per_employee
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build AI prompt
    const systemPrompt = rules.ai_system_prompt || 
      "És um assistente de agendamento inteligente para uma empresa. Analisa a disponibilidade dos colaboradores e sugere os mais adequados para uma visita.";

    const additionalConsiderations = rules.ai_considerations?.length 
      ? `\n\nConsiderações adicionais:\n${rules.ai_considerations.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
      : "";

    const prompt = `Analisa os seguintes colaboradores e as suas agendas para o dia ${requested_date}.
O cliente pretende uma visita ${requestedStart ? `às ${requested_time} com duração de ${duration_minutes} minutos` : "num horário a definir"}.
${lead_postal_code ? `O código postal do cliente é: ${lead_postal_code}` : ""}

REGRAS DE AGENDAMENTO:
- Buffer antes da visita: ${rules.buffer_before_minutes} minutos
- Buffer depois da visita: ${rules.buffer_after_minutes} minutos
- Máximo visitas por dia por colaborador: ${rules.max_visits_per_day_per_employee}
- Máximo visitas por semana por colaborador: ${rules.max_visits_per_week_per_employee}
- Horário permitido: ${rules.earliest_start_time} às ${rules.latest_end_time}
- Priorizar proximidade: ${rules.use_postal_code_proximity ? 'Sim' : 'Não'}
- Balancear carga de trabalho: ${rules.balance_workload ? 'Sim' : 'Não'}
${rules.balance_workload ? `- Peso do balanceamento: ${rules.workload_weight_percent}% carga vs ${100 - rules.workload_weight_percent}% proximidade` : ""}
${additionalConsiderations}

Colaboradores e agendas:
${JSON.stringify(assigneeSchedules.map(a => ({
  user_id: a.user_id,
  name: a.name,
  postal_code: a.postal_code,
  daily_visits: a.daily_visits_count,
  weekly_visits: a.weekly_visits_count,
  last_visit: a.last_visit,
  scheduled_today: a.scheduled_items,
  postal_code_match: a.postal_code_match
})), null, 2)}

Responde APENAS com um JSON array contendo os colaboradores ordenados do mais adequado para o menos adequado:
[
  {
    "user_id": "uuid",
    "name": "nome",
    "score": 0-100,
    "reason": "explicação curta em português",
    "available": true/false,
    "suggested_time": "HH:MM" (se o horário pedido não for possível, sugere alternativa),
    "daily_visits": número,
    "weekly_visits": número,
    "last_visit_info": "data e local da última visita ou null"
  }
]`;

    const aiResponse = await callAiGateway({
      model: "google/gemini-3-flash",
      messages: [
        { role: "system", content: systemPrompt + " Responde apenas com JSON válido, sem markdown." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "[]";
    
    let suggestions: any[] = [];
    try {
      const cleanContent = aiContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleanContent);
      suggestions = Array.isArray(parsed) ? parsed : (parsed?.suggestions || []);
    } catch (e) {
      console.error("Failed to parse AI response:", aiContent);
      suggestions = [];
    }

    const enrichedSuggestions = suggestions.map((s: any) => {
      const assignee = uniqueAssignees.find(a => a.user_id === s.user_id);
      const scheduleData = assigneeSchedules.find(a => a.user_id === s.user_id);
      return {
        ...s,
        user_id: assignee?.user_id || s.user_id,       // always anew_users.id
        resource_id: assignee?.resource_id || null,      // schedule_resources.id
        type: assignee?.type || "unknown",
        last_visit: scheduleData?.last_visit || null,
        postal_code_match: scheduleData?.postal_code_match || false
      };
    });

    return new Response(
      JSON.stringify({
        suggestions: enrichedSuggestions,
        ai_used: true,
        rules_applied: {
          buffer_minutes: totalBuffer,
          max_daily: rules.max_visits_per_day_per_employee,
          max_weekly: rules.max_visits_per_week_per_employee
        },
        requested_date,
        requested_time
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const authResp = authErrorResponse(error, corsHeaders);
    if (authResp) return authResp;
    console.error("Error:", error);
    await captureError(error, { function: "suggest-schedule-assignee" });
    // Never echo a raw internal exception (e.g. Postgres/RPC error) to the
    // client — the real error is already logged above and sent to Sentry.
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});