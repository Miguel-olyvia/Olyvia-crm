import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const querySchema = z.object({
  campaign_id: z.string().uuid(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Get Campaign Districts API
 * 
 * PUBLIC endpoint - Returns the districts where a campaign is active.
 * 
 * GET /get-campaign-districts?campaign_id=xxx
 * 
 * Response:
 * {
 *   "campaign_id": "...",
 *   "campaign_name": "...",
 *   "country_code": "PT",
 *   "districts": [
 *     { "id": "...", "name": "Lisboa", "code": "11" },
 *     { "id": "...", "name": "Porto", "code": "13" }
 *   ]
 * }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use GET.' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const url = new URL(req.url);
    const parsed = querySchema.safeParse({ campaign_id: url.searchParams.get('campaign_id') });
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: parsed.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const { campaign_id: campaignId } = parsed.data;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get campaign info
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, name, country_code, status')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return new Response(
        JSON.stringify({ error: 'Campaign not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get districts linked to this campaign
    const { data: campaignDistricts, error: districtsError } = await supabase
      .from('campaign_districts')
      .select(`
        district_id,
        administrative_divisions (
          id,
          name,
          code,
          country_code
        )
      `)
      .eq('campaign_id', campaignId);

    if (districtsError) {
      console.error('Error fetching campaign districts:', districtsError);
      return new Response(
        JSON.stringify({ error: 'Error fetching districts' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format the response
    const districts = (campaignDistricts || [])
      .filter((cd: any) => cd.administrative_divisions)
      .map((cd: any) => ({
        id: cd.administrative_divisions.id,
        name: cd.administrative_divisions.name,
        code: cd.administrative_divisions.code,
        country_code: cd.administrative_divisions.country_code,
      }));

    return new Response(
      JSON.stringify({
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        campaign_status: campaign.status,
        country_code: campaign.country_code,
        total_districts: districts.length,
        districts: districts,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in get-campaign-districts:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
