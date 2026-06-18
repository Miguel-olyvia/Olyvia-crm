import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

/**
 * API Proxy Edge Function
 * Provides a clean API endpoint that forwards requests to the insert-lead function
 * This allows using custom domains without exposing Supabase URLs
 */
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname;

    // Route to appropriate function based on path
    if (path.includes('/leads') || path.includes('/insert-lead')) {
      // Forward to insert-lead function
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const apiKey = req.headers.get('x-api-key');
      const body = await req.text();

      const response = await fetch(`${supabaseUrl}/functions/v1/insert-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey || '',
        },
        body: body,
      });

      const data = await response.text();
      
      return new Response(data, {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Unknown endpoint
    return new Response(
      JSON.stringify({ 
        error: 'Unknown endpoint',
        available_endpoints: ['/api/leads', '/api/insert-lead']
      }),
      { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: any) {
    console.error('Error in api-proxy function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});