import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";
import { corsHeaders as _corsBase } from "../_shared/cors.ts";

const getNearestResourcesSchema = z.object({
  postal_code: z.string().min(1),
  board_id: z.string().uuid(),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "date deve ser uma data válida" }),
  duration: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? parseInt(val, 10) : 60))
    .pipe(z.number().int().positive()),
});

const getAvailableSlotsSchema = z.object({
  resource_id: z.string().uuid(),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "date deve ser uma data válida" }),
  duration: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? parseInt(val, 10) : 60))
    .pipe(z.number().int().positive()),
});

const requestSchema = z.object({
  title: z.string(),
  board_id: z.string().optional(),
  description: z.string().optional(),
  client_id: z.string().optional(),
  contact_id: z.string().optional(),
  deal_id: z.string().optional(),
  location: z.string().optional(),
  postal_code: z.string().optional(),
  duration_minutes: z.number().optional(),
  preferred_date: z.string().optional(),
  preferred_time_start: z.string().optional(),
  preferred_time_end: z.string().optional(),
  preferred_resource_ids: z.array(z.string()).optional(),
  priority: z.number().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  organization_id: z.string().optional(),
  campaign_id: z.string().optional(),
  auto_assign: z.boolean().optional(),
  use_proximity: z.boolean().optional(),
});

// Extend the shared safe CORS headers with the extra headers this function needs.
// Never use "?? *" as a fallback — _corsBase resolves the origin securely.
const corsHeaders = {
  ..._corsBase,
  "Access-Control-Allow-Headers":
    _corsBase["Access-Control-Allow-Headers"] +
    ", x-api-key, x-internal-source",
};

const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');

// Google Maps Distance Matrix API interface
interface DistanceMatrixResponse {
  status: string;
  rows: {
    elements: {
      status: string;
      distance?: { value: number; text: string };
      duration?: { value: number; text: string };
    }[];
  }[];
}

// Calculate distance using Google Maps Distance Matrix API
async function calculateGoogleMapsDistance(
  originPostalCode: string,
  destinationPostalCodes: string[]
): Promise<Map<string, { distance_km: number; duration_minutes: number }>> {
  const results = new Map<string, { distance_km: number; duration_minutes: number }>();
  
  if (!GOOGLE_MAPS_API_KEY) {
    console.error('GOOGLE_MAPS_API_KEY not configured');
    return results;
  }

  if (destinationPostalCodes.length === 0) {
    return results;
  }

  try {
    // Format postal codes for Portugal (add ", Portugal" for better accuracy)
    const origin = `${originPostalCode}, Portugal`;
    const destinations = destinationPostalCodes.map(pc => `${pc}, Portugal`).join('|');
    
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destinations)}&key=${GOOGLE_MAPS_API_KEY}&units=metric`;
    
    console.log(`Calling Google Maps API for ${destinationPostalCodes.length} destinations`);
    
    const response = await fetch(url);
    const data: DistanceMatrixResponse = await response.json();
    
    if (data.status !== 'OK') {
      console.error('Google Maps API error:', data.status);
      return results;
    }

    if (data.rows[0]?.elements) {
      data.rows[0].elements.forEach((element, index) => {
        if (element.status === 'OK' && element.distance && element.duration) {
          results.set(destinationPostalCodes[index], {
            distance_km: element.distance.value / 1000, // Convert meters to km
            duration_minutes: Math.ceil(element.duration.value / 60) // Convert seconds to minutes
          });
        }
      });
    }

    console.log(`Got distances for ${results.size} destinations`);
  } catch (error) {
    console.error('Error calling Google Maps API:', error);
  }

  return results;
}

interface ScheduleRequest {
  board_id?: string;
  title: string;
  description?: string;
  client_id?: string;
  contact_id?: string;
  deal_id?: string;
  location?: string;
  postal_code?: string;
  duration_minutes?: number;
  preferred_date?: string;
  preferred_time_start?: string;
  preferred_time_end?: string;
  preferred_resource_ids?: string[];
  priority?: number;
  tags?: string[];
  metadata?: Record<string, any>;
  organization_id?: string;
  campaign_id?: string;
  auto_assign?: boolean;
  use_proximity?: boolean;
}

interface AutoScheduleResult {
  success: boolean;
  item_id?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  assigned_resources?: string[];
  resource_details?: {
    id: string;
    name: string;
    distance_km?: number;
    travel_time_minutes?: number;
  }[];
  message?: string;
  error?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check for API key authentication
    const apiKey = req.headers.get('x-api-key');
    const authHeader = req.headers.get('authorization');
    const internalSource = req.headers.get('x-internal-source');

    let companyId: string | null = null; // maps to organization_id
    let userId: string | null = null;

    // AUDIT 03 #7: trusted internal call from insert-lead.
    // Requires x-internal-source: insert-lead AND Authorization: Bearer <service_role_key>.
    // organization_id is derived from the request body (insert-lead validates it via the API token).
    let internalTrusted = false;
    if (internalSource === 'insert-lead' && authHeader) {
      const token = authHeader.replace('Bearer ', '').trim();
      if (token && token === supabaseServiceKey) {
        internalTrusted = true;
        try {
          const cloned = req.clone();
          const peek = await cloned.json();
          if (peek?.organization_id) companyId = peek.organization_id;
        } catch (_) { /* body parse handled below */ }
      }
    }

    // Validate API key or JWT (skipped when internalTrusted)
    if (!internalTrusted && apiKey) {
      console.log('Authenticating with API key');
      const { data: tokenData, error: tokenError } = await supabase
        .rpc('validate_scoped_api_token', { _token_key: apiKey });
      
      if (tokenError || !tokenData || tokenData.length === 0) {
        console.error('Invalid API key:', tokenError);
        return new Response(
          JSON.stringify({ error: 'Invalid or expired API key' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      companyId = tokenData[0].organization_id;
    } else if (!internalTrusted && authHeader) {
      console.log('Authenticating with JWT');
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      
      if (userError || !user) {
        console.error('Invalid JWT:', userError);
        return new Response(
          JSON.stringify({ error: 'Invalid authentication token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      userId = user.id;
      console.log('JWT validated for user:', userId);
    } else if (!internalTrusted) {
      return new Response(
        JSON.stringify({ error: 'Authentication required. Provide x-api-key or Authorization header.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST') {
      const rawBody = await req.json();
      console.log('Schedule request received:', JSON.stringify(rawBody));

      const parsed = requestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return new Response(
          JSON.stringify({ error: 'Invalid request', details: parsed.error.issues }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const body: ScheduleRequest = parsed.data;

      if (!userId && !apiKey && !internalTrusted) {
        return new Response(
          JSON.stringify({ error: 'userId is required for scheduling' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const result = await processScheduleRequest(supabase, body, companyId, userId);
      
      return new Response(
        JSON.stringify(result),
        { 
          status: result.success ? 200 : 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const action = url.searchParams.get('action');

      // Get nearest resources for a postal code using Google Maps API
      if (action === 'nearest_resources') {
        const nearestParsed = getNearestResourcesSchema.safeParse({
          postal_code: url.searchParams.get('postal_code') ?? undefined,
          board_id: url.searchParams.get('board_id') ?? undefined,
          date: url.searchParams.get('date') ?? undefined,
          duration: url.searchParams.get('duration') ?? undefined,
        });
        if (!nearestParsed.success) {
          return new Response(
            JSON.stringify({ error: 'Parâmetros inválidos', details: nearestParsed.error.issues }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const { postal_code: postalCode, board_id: boardId, date, duration } = nearestParsed.data;

        console.log(`Finding nearest resources for postal code ${postalCode} on ${date}`);

        // Get all active resources with their service areas
        const { data: resources, error: resourcesError } = await supabase
          .from('schedule_resources')
          .select(`
            *,
            service_areas:resource_service_areas(postal_code_prefix, priority, max_distance_km)
          `)
          .eq('is_active', true)
          .eq('organization_id', companyId);

        if (resourcesError) {
          console.error('Error fetching resources:', resourcesError);
          return new Response(
            JSON.stringify({ error: 'Failed to fetch resources', details: resourcesError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get postal codes for each resource from their service areas
        const resourcePostalCodes: Map<string, string[]> = new Map();
        resources?.forEach(resource => {
          const postalCodes = resource.service_areas?.map((sa: any) => sa.postal_code_prefix) || [];
          resourcePostalCodes.set(resource.id, postalCodes);
        });

        // Get unique postal code prefixes to calculate distances
        const allPostalPrefixes = new Set<string>();
        resourcePostalCodes.forEach(prefixes => prefixes.forEach(p => allPostalPrefixes.add(p)));
        
        // Calculate distances using Google Maps API
        const distances = await calculateGoogleMapsDistance(
          postalCode,
          Array.from(allPostalPrefixes)
        );

        // Calculate minimum distance for each resource
        const resourceDistances: { resource: any; min_distance_km: number; travel_time_minutes: number }[] = [];
        
        resources?.forEach(resource => {
          const servicePrefixes = resourcePostalCodes.get(resource.id) || [];
          let minDistance = Infinity;
          let travelTime = 0;
          
          servicePrefixes.forEach(prefix => {
            const dist = distances.get(prefix);
            if (dist && dist.distance_km < minDistance) {
              minDistance = dist.distance_km;
              travelTime = dist.duration_minutes;
            }
          });

          // If no service area defined, use a large distance
          if (minDistance === Infinity) {
            minDistance = 999;
          }

          resourceDistances.push({
            resource,
            min_distance_km: minDistance,
            travel_time_minutes: travelTime
          });
        });

        // Sort by distance
        resourceDistances.sort((a, b) => a.min_distance_km - b.min_distance_km);

        // Get available slots for each resource
        const resourcesWithSlots = await Promise.all(
          resourceDistances.slice(0, 10).map(async ({ resource, min_distance_km, travel_time_minutes }) => {
            const { data: slots } = await supabase
              .rpc('get_resource_available_slots', {
                p_resource_id: resource.id,
                p_date: date,
                p_duration_minutes: duration
              });

            return {
              resource_id: resource.id,
              resource_name: resource.name,
              resource_type: resource.resource_type,
              distance_km: min_distance_km,
              travel_time_minutes,
              available_slots: slots?.map((s: any) => ({ start: s.slot_start, end: s.slot_end })) || [],
              priority: resource.service_areas?.[0]?.priority || 1
            };
          })
        );

        // Filter to only resources with available slots
        const availableResources = resourcesWithSlots.filter(r => r.available_slots.length > 0);

        console.log(`Found ${availableResources.length} available resources with slots`);

        return new Response(
          JSON.stringify({ resources: availableResources }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get available slots for a resource
      const slotsParsed = getAvailableSlotsSchema.safeParse({
        resource_id: url.searchParams.get('resource_id') ?? undefined,
        date: url.searchParams.get('date') ?? undefined,
        duration: url.searchParams.get('duration') ?? undefined,
      });
      if (!slotsParsed.success) {
        return new Response(
          JSON.stringify({ error: 'Parâmetros inválidos', details: slotsParsed.error.issues }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const { resource_id: resourceId, date, duration } = slotsParsed.data;

      const { data: slots, error: slotsError } = await supabase
        .rpc('get_resource_available_slots', {
          p_resource_id: resourceId,
          p_date: date,
          p_duration_minutes: duration
        });

      if (slotsError) {
        console.error('Error fetching slots:', slotsError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch available slots' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ slots }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function processScheduleRequest(
  supabase: any,
  request: ScheduleRequest,
  companyId: string | null,
  userId: string | null
): Promise<AutoScheduleResult> {
  const effectiveCompanyId = request.organization_id || companyId;
  const durationMinutes = request.duration_minutes || 60;
  const businessUserId = userId ? await resolveBusinessUserId(supabase, userId) : null;
  if (!businessUserId) {
    return { success: false, error: 'Business user could not be resolved for scheduling' };
  }

  // If auto_assign is true, find the best slot using rules
  if (request.auto_assign) {
    console.log('Auto-assign enabled, finding best slot...');
    
    // Check if campaign has scheduling enabled
    if (request.campaign_id) {
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .select('has_scheduling')
        .eq('id', request.campaign_id)
        .single();

      if (campaignError) {
        console.error('Error fetching campaign:', campaignError);
      } else if (!campaign?.has_scheduling) {
        return { success: false, error: 'Scheduling is not enabled for this campaign' };
      }
    }

    // Get applicable auto-schedule rules
    const { data: rules, error: rulesError } = await supabase
      .from('auto_schedule_rules')
      .select('*')
      .eq('is_active', true)
      .or(`organization_id.is.null,organization_id.eq.${effectiveCompanyId}`)
      .order('priority', { ascending: false });

    if (rulesError) {
      console.error('Error fetching rules:', rulesError);
      return { success: false, error: 'Failed to fetch scheduling rules' };
    }

    const rule = rules && rules.length > 0 ? rules[0] : null;
    const strategy = rule?.strategy || 'first_available';
    const searchDate = request.preferred_date || new Date().toISOString().split('T')[0];

    // NEW: Use proximity-based matching if postal code is provided
    if (request.use_proximity && request.postal_code) {
      console.log(`Using proximity-based matching for postal code: ${request.postal_code}`);
      
      // Get default board if not provided
      let boardId = request.board_id;
      if (!boardId) {
        const { data: boards } = await supabase
          .from('schedule_boards')
          .select('id')
          .eq('is_active', true)
          .limit(1);
        boardId = boards?.[0]?.id;
      }

      if (!boardId) {
        return { success: false, error: 'No active schedule board found' };
      }

      // Find nearest available resources using the new function
      const result = await findNearestAvailableSlot(
        supabase,
        request.postal_code,
        boardId,
        searchDate,
        durationMinutes,
        request.preferred_time_start,
        request.preferred_time_end,
        rule
      );

      if (!result) {
        return { 
          success: false, 
          error: 'No available slots found for the requested location and parameters' 
        };
      }

      // Create the schedule item
      const { data: item, error: itemError } = await supabase
        .from('schedule_items')
        .insert({
          board_id: boardId,
          title: request.title,
          description: request.description,
          status: 'scheduled',
          origin: 'api',
          start_datetime: result.slot.start,
          end_datetime: result.slot.end,
          duration_minutes: durationMinutes,
          client_id: request.client_id,
          contact_id: request.contact_id,
          deal_id: request.deal_id,
          location: request.location,
          priority: request.priority || 0,
          tags: request.tags,
          metadata: {
            ...request.metadata,
            postal_code: request.postal_code,
            distance_km: result.distance_km,
            travel_time_minutes: result.travel_time_minutes,
            auto_scheduled: true,
            proximity_based: true,
            google_maps_calculated: true
          },
          organization_id: effectiveCompanyId,
          created_by: businessUserId
        })
        .select()
        .single();

      if (itemError) {
        console.error('Error creating schedule item:', itemError);
        return { success: false, error: 'Failed to create schedule item' };
      }

      // Assign the resource
      const { error: assignError } = await supabase
        .from('schedule_item_assignees')
        .insert({
          item_id: item.id,
          resource_id: result.resource.id,
          role: 'assignee'
        });

      if (assignError) {
        console.error('Error assigning resource:', assignError);
      }

      console.log(`Schedule item created: ${item.id}, assigned to ${result.resource.name} (${result.distance_km.toFixed(1)}km, ${result.travel_time_minutes}min away)`);

      return {
        success: true,
        item_id: item.id,
        scheduled_start: result.slot.start,
        scheduled_end: result.slot.end,
        assigned_resources: [result.resource.id],
        resource_details: [{
          id: result.resource.id,
          name: result.resource.name,
          distance_km: result.distance_km,
          travel_time_minutes: result.travel_time_minutes
        }],
        message: `Scheduled with ${result.resource.name} (${result.distance_km.toFixed(1)}km, ~${result.travel_time_minutes}min drive)`
      };
    }

    // Original non-proximity based scheduling
    let resourceQuery = supabase
      .from('schedule_resources')
      .select('*')
      .eq('is_active', true);
    
    if (effectiveCompanyId) {
      resourceQuery = resourceQuery.eq('organization_id', effectiveCompanyId);
    }

    if (request.preferred_resource_ids && request.preferred_resource_ids.length > 0) {
      resourceQuery = resourceQuery.in('id', request.preferred_resource_ids);
    }

    const { data: resources, error: resourcesError } = await resourceQuery;

    if (resourcesError || !resources || resources.length === 0) {
      console.error('No resources available:', resourcesError);
      return { success: false, error: 'No resources available for scheduling' };
    }

    console.log(`Using strategy: ${strategy} with ${resources.length} resources`);

    // Find available slot based on strategy
    const slot = await findAvailableSlot(
      supabase,
      resources,
      strategy,
      durationMinutes,
      request.preferred_date,
      request.preferred_time_start,
      request.preferred_time_end,
      rule
    );

    if (!slot) {
      return { 
        success: false, 
        error: 'No available slots found for the requested parameters' 
      };
    }

    // Create the schedule item
    const { data: item, error: itemError } = await supabase
      .from('schedule_items')
      .insert({
        board_id: request.board_id || slot.boardId,
        title: request.title,
        description: request.description,
        status: 'scheduled',
        origin: 'api',
        start_datetime: slot.start,
        end_datetime: slot.end,
        duration_minutes: durationMinutes,
        client_id: request.client_id,
        contact_id: request.contact_id,
        deal_id: request.deal_id,
        location: request.location,
        priority: request.priority || 0,
        tags: request.tags,
        metadata: { ...request.metadata, auto_scheduled: true },
        organization_id: effectiveCompanyId,
        created_by: businessUserId
      })
      .select()
      .single();

    if (itemError) {
      console.error('Error creating schedule item:', itemError);
      return { success: false, error: 'Failed to create schedule item' };
    }

    // Assign the resource
    const { error: assignError } = await supabase
      .from('schedule_item_assignees')
      .insert({
        item_id: item.id,
        resource_id: slot.resourceId,
        role: 'assignee'
      });

    if (assignError) {
      console.error('Error assigning resource:', assignError);
    }

    console.log('Schedule item created successfully:', item.id);

    return {
      success: true,
      item_id: item.id,
      scheduled_start: slot.start,
      scheduled_end: slot.end,
      assigned_resources: [slot.resourceId],
      message: 'Schedule item created and assigned successfully'
    };

  } else {
    // Manual scheduling - just create the item with provided times
    if (!request.preferred_date) {
      return { success: false, error: 'preferred_date is required for manual scheduling' };
    }

    const startTime = request.preferred_time_start || '09:00';
    const startDatetime = `${request.preferred_date}T${startTime}:00`;
    const endDatetime = new Date(new Date(startDatetime).getTime() + durationMinutes * 60000).toISOString();

    // Get default board if not provided
    let boardId = request.board_id;
    if (!boardId) {
      const { data: boards } = await supabase
        .from('schedule_boards')
        .select('id')
        .eq('is_active', true)
        .limit(1);
      
      boardId = boards?.[0]?.id;
    }

    const { data: item, error: itemError } = await supabase
      .from('schedule_items')
      .insert({
        board_id: boardId,
        title: request.title,
        description: request.description,
        status: 'draft',
        origin: 'api',
        start_datetime: startDatetime,
        end_datetime: endDatetime,
        duration_minutes: durationMinutes,
        client_id: request.client_id,
        contact_id: request.contact_id,
        deal_id: request.deal_id,
        location: request.location,
        priority: request.priority || 0,
        tags: request.tags,
        metadata: request.metadata || {},
          organization_id: effectiveCompanyId,
          created_by: businessUserId
        })
        .select()
        .single();

    if (itemError) {
      console.error('Error creating schedule item:', itemError);
      return { success: false, error: 'Failed to create schedule item' };
    }

    return {
      success: true,
      item_id: item.id,
      scheduled_start: startDatetime,
      scheduled_end: endDatetime,
      message: 'Schedule item created (manual mode - no auto-assignment)'
    };
  }
}

async function resolveBusinessUserId(supabase: any, authUserId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('anew_users')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error) {
    console.error('Error resolving business user id:', error);
    return null;
  }

  return data?.id || null;
}

// Find nearest available slot using Google Maps Distance Matrix API
async function findNearestAvailableSlot(
  supabase: any,
  postalCode: string,
  boardId: string,
  startDate: string,
  durationMinutes: number,
  preferredTimeStart?: string,
  preferredTimeEnd?: string,
  rule?: any
): Promise<{ resource: { id: string; name: string }; slot: { start: string; end: string }; distance_km: number; travel_time_minutes: number } | null> {
  
  const maxDaysToSearch = 14; // Search up to 2 weeks ahead

  // Get all active resources with their service areas
  const { data: allResources, error: resourcesError } = await supabase
    .from('schedule_resources')
    .select(`
      *,
      service_areas:resource_service_areas(postal_code_prefix, priority, max_distance_km)
    `)
    .eq('is_active', true);

  if (resourcesError || !allResources || allResources.length === 0) {
    console.error('Error fetching resources:', resourcesError);
    return null;
  }

  // Get unique postal code prefixes from all resources
  const allPostalPrefixes = new Set<string>();
  allResources.forEach((resource: any) => {
    resource.service_areas?.forEach((sa: any) => {
      if (sa.postal_code_prefix) {
        allPostalPrefixes.add(sa.postal_code_prefix);
      }
    });
  });

  // Calculate distances to all service areas using Google Maps API
  console.log(`Calculating distances to ${allPostalPrefixes.size} service area postal codes`);
  const distances = await calculateGoogleMapsDistance(postalCode, Array.from(allPostalPrefixes));

  // Calculate minimum distance for each resource
  const resourcesWithDistance = allResources.map((resource: any) => {
    const servicePrefixes = resource.service_areas?.map((sa: any) => sa.postal_code_prefix) || [];
    let minDistance = Infinity;
    let travelTime = 0;
    let priority = 1;
    let maxDistanceAllowed = Infinity;

    servicePrefixes.forEach((prefix: string) => {
      const dist = distances.get(prefix);
      const serviceArea = resource.service_areas?.find((sa: any) => sa.postal_code_prefix === prefix);
      
      if (dist && dist.distance_km < minDistance) {
        minDistance = dist.distance_km;
        travelTime = dist.duration_minutes;
        priority = serviceArea?.priority || 1;
        maxDistanceAllowed = serviceArea?.max_distance_km || Infinity;
      }
    });

    // Check if within max distance
    if (minDistance > maxDistanceAllowed) {
      return null;
    }

    return {
      ...resource,
      distance_km: minDistance === Infinity ? 999 : minDistance,
      travel_time_minutes: travelTime,
      priority
    };
  }).filter(Boolean);

  // Sort by priority (desc) then distance (asc)
  resourcesWithDistance.sort((a: any, b: any) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.distance_km - b.distance_km;
  });

  console.log(`Processing ${resourcesWithDistance.length} resources sorted by proximity`);

  for (let dayOffset = 0; dayOffset < maxDaysToSearch; dayOffset++) {
    const checkDate = new Date(startDate);
    checkDate.setDate(checkDate.getDate() + dayOffset);
    const dateStr = checkDate.toISOString().split('T')[0];
    const dayOfWeek = checkDate.getDay();

    // Check if day is allowed by rule
    if (rule?.allowed_days && !rule.allowed_days.includes(dayOfWeek)) {
      continue;
    }

    console.log(`Searching for slots on ${dateStr}...`);

    // Check each resource for availability (already sorted by distance)
    for (const resource of resourcesWithDistance) {
      // Get available slots for this resource
      const { data: slots, error: slotsError } = await supabase
        .rpc('get_resource_available_slots', {
          p_resource_id: resource.id,
          p_date: dateStr,
          p_duration_minutes: durationMinutes
        });

      if (slotsError || !slots || slots.length === 0) {
        continue;
      }

      // Filter slots by time preferences
      let filteredSlots = slots.map((s: any) => ({ start: s.slot_start, end: s.slot_end }));

      if (preferredTimeStart) {
        const prefStart = preferredTimeStart.replace(':', '');
        filteredSlots = filteredSlots.filter((slot: any) => {
          const slotTime = new Date(slot.start).toTimeString().slice(0, 5).replace(':', '');
          return slotTime >= prefStart;
        });
      }

      if (preferredTimeEnd) {
        const prefEnd = preferredTimeEnd.replace(':', '');
        filteredSlots = filteredSlots.filter((slot: any) => {
          const slotTime = new Date(slot.end).toTimeString().slice(0, 5).replace(':', '');
          return slotTime <= prefEnd;
        });
      }

      // Apply rule time constraints
      if (rule?.earliest_time) {
        const earliest = rule.earliest_time.replace(':', '');
        filteredSlots = filteredSlots.filter((slot: any) => {
          const slotTime = new Date(slot.start).toTimeString().slice(0, 5).replace(':', '');
          return slotTime >= earliest;
        });
      }

      if (rule?.latest_time) {
        const latest = rule.latest_time.replace(':', '');
        filteredSlots = filteredSlots.filter((slot: any) => {
          const slotTime = new Date(slot.end).toTimeString().slice(0, 5).replace(':', '');
          return slotTime <= latest;
        });
      }

      if (filteredSlots.length > 0) {
        const selectedSlot = filteredSlots[0];
        console.log(`Selected slot: ${selectedSlot.start} with ${resource.name} (${resource.distance_km.toFixed(1)}km, ${resource.travel_time_minutes}min)`);
        
        return {
          resource: {
            id: resource.id,
            name: resource.name
          },
          slot: {
            start: selectedSlot.start,
            end: selectedSlot.end
          },
          distance_km: resource.distance_km,
          travel_time_minutes: resource.travel_time_minutes
        };
      }
    }
  }

  return null;
}

async function findAvailableSlot(
  supabase: any,
  resources: any[],
  strategy: string,
  durationMinutes: number,
  preferredDate?: string,
  preferredTimeStart?: string,
  preferredTimeEnd?: string,
  rule?: any
): Promise<{ start: string; end: string; resourceId: string; boardId?: string } | null> {
  
  const searchDate = preferredDate || new Date().toISOString().split('T')[0];
  const maxDaysToSearch = 14;

  // Get default board
  const { data: boards } = await supabase
    .from('schedule_boards')
    .select('id')
    .eq('is_active', true)
    .limit(1);
  
  const defaultBoardId = boards?.[0]?.id;

  for (let dayOffset = 0; dayOffset < maxDaysToSearch; dayOffset++) {
    const checkDate = new Date(searchDate);
    checkDate.setDate(checkDate.getDate() + dayOffset);
    const dateStr = checkDate.toISOString().split('T')[0];
    const dayOfWeek = checkDate.getDay();

    if (rule?.allowed_days && !rule.allowed_days.includes(dayOfWeek)) {
      continue;
    }

    let orderedResources = [...resources];
    
    if (strategy === 'round_robin') {
      orderedResources = orderedResources.sort(() => Math.random() - 0.5);
    } else if (strategy === 'least_busy') {
      const workloads = await Promise.all(
        resources.map(async (resource) => {
          const { count } = await supabase
            .from('schedule_item_assignees')
            .select('*', { count: 'exact', head: true })
            .eq('resource_id', resource.id);
          return { resource, count: count || 0 };
        })
      );
      orderedResources = workloads
        .sort((a, b) => a.count - b.count)
        .map(w => w.resource);
    }

    for (const resource of orderedResources) {
      if (rule?.respect_capacity && resource.max_daily_capacity) {
        const { count } = await supabase
          .from('schedule_item_assignees')
          .select('item_id!inner(start_datetime)', { count: 'exact', head: true })
          .eq('resource_id', resource.id)
          .gte('item_id.start_datetime', `${dateStr}T00:00:00`)
          .lt('item_id.start_datetime', `${dateStr}T23:59:59`);

        if ((count || 0) >= resource.max_daily_capacity) {
          continue;
        }
      }

      const { data: slots, error: slotsError } = await supabase
        .rpc('get_resource_available_slots', {
          p_resource_id: resource.id,
          p_date: dateStr,
          p_duration_minutes: durationMinutes
        });

      if (slotsError || !slots || slots.length === 0) {
        continue;
      }

      let filteredSlots = slots;
      if (preferredTimeStart) {
        const prefStart = preferredTimeStart.replace(':', '');
        filteredSlots = filteredSlots.filter((slot: any) => {
          const slotTime = new Date(slot.slot_start).toTimeString().slice(0, 5).replace(':', '');
          return slotTime >= prefStart;
        });
      }
      if (preferredTimeEnd) {
        const prefEnd = preferredTimeEnd.replace(':', '');
        filteredSlots = filteredSlots.filter((slot: any) => {
          const slotTime = new Date(slot.slot_end).toTimeString().slice(0, 5).replace(':', '');
          return slotTime <= prefEnd;
        });
      }

      if (rule?.earliest_time) {
        const earliest = rule.earliest_time.replace(':', '');
        filteredSlots = filteredSlots.filter((slot: any) => {
          const slotTime = new Date(slot.slot_start).toTimeString().slice(0, 5).replace(':', '');
          return slotTime >= earliest;
        });
      }
      if (rule?.latest_time) {
        const latest = rule.latest_time.replace(':', '');
        filteredSlots = filteredSlots.filter((slot: any) => {
          const slotTime = new Date(slot.slot_end).toTimeString().slice(0, 5).replace(':', '');
          return slotTime <= latest;
        });
      }

      if (filteredSlots.length > 0) {
        const selectedSlot = filteredSlots[0];
        return {
          start: selectedSlot.slot_start,
          end: selectedSlot.slot_end,
          resourceId: resource.id,
          boardId: defaultBoardId
        };
      }
    }
  }

  return null;
}
