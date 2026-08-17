import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      proposal_id,
      public_token,
      rejection_reason_code,
      rejection_reason,
      rejection_notes,
    } = await req.json();

    if (!proposal_id || !public_token) {
      return new Response(
        JSON.stringify({ error: "proposal_id and public_token are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data, error } = await supabase.rpc("reject_proposal_atomic", {
      p_proposal_id:           proposal_id,
      p_public_token:          public_token,
      p_rejection_reason_code: rejection_reason_code ?? null,
      p_rejection_reason:      rejection_reason      ?? null,
      p_rejection_notes:       rejection_notes       ?? null,
    });

    if (error) {
      console.error("[reject-proposal] RPC error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, result: data }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (err: any) {
    console.error("[reject-proposal] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
});
