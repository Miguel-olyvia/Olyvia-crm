import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "npm:zod";

const requestSchema = z.object({
  proposal_id: z.string().optional(),
  tracking_token: z.string().optional(),
  send_id: z.string().optional(),
  event: z.enum(["view", "time", "pixel"]),
  // Cap time_seconds server-side to prevent unbounded inflation by unauthenticated callers
  time_seconds: z.number().min(0).max(3600).optional(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TrackingRequest {
  proposal_id?: string;
  tracking_token?: string;
  send_id?: string;
  event: "view" | "time" | "pixel";
  time_seconds?: number;
}

// Parse user agent for device info
function parseUserAgent(ua: string) {
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const isTablet = /iPad|Tablet/i.test(ua);
  
  let browser = "Unknown";
  if (/Chrome/i.test(ua)) browser = "Chrome";
  else if (/Firefox/i.test(ua)) browser = "Firefox";
  else if (/Safari/i.test(ua)) browser = "Safari";
  else if (/Edge/i.test(ua)) browser = "Edge";
  else if (/Opera/i.test(ua)) browser = "Opera";

  let os = "Unknown";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iOS|iPhone|iPad/i.test(ua)) os = "iOS";

  return {
    device_type: isTablet ? "Tablet" : isMobile ? "Mobile" : "Desktop",
    browser,
    os,
  };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Check if it's a pixel request (GET with tracking_token in query)
    const url = new URL(req.url);
    const pixelToken = url.searchParams.get("t");
    
    if (req.method === "GET" && pixelToken) {
      // Handle tracking pixel
      const { data: proposal } = await supabaseClient
        .from("proposals")
        .select("id")
        .eq("tracking_token", pixelToken)
        .single();

      if (proposal) {
        // Get the most recent send for this proposal
        const { data: send } = await supabaseClient
          .from("proposal_sends")
          .select("id, first_opened_at, open_count")
          .eq("proposal_id", proposal.id)
          .order("sent_at", { ascending: false })
          .limit(1)
          .single();

        if (send) {
          const userAgent = req.headers.get("user-agent") || "";
          const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
          const deviceInfo = parseUserAgent(userAgent);

          const now = new Date().toISOString();
          const updateData: Record<string, any> = {
            last_opened_at: now,
            open_count: (send.open_count || 0) + 1,
          };

          if (!send.first_opened_at) {
            updateData.first_opened_at = now;
            updateData.ip_address = ip;
            updateData.device_type = deviceInfo.device_type;
            updateData.browser = deviceInfo.browser;
            updateData.os = deviceInfo.os;
          }

          await supabaseClient.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
          await supabaseClient
            .from("proposal_sends")
            .update(updateData)
            .eq("id", send.id);

          await supabaseClient.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
          // Also update proposal view count
          await supabaseClient
            .from("proposals")
            .update({ last_viewed_at: now })
            .eq("id", proposal.id);
        }
      }

      // Return 1x1 transparent GIF
      const gif = new Uint8Array([
        0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00,
        0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21,
        0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00,
        0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
        0x01, 0x00, 0x3b
      ]);

      return new Response(gif, {
        status: 200,
        headers: {
          "Content-Type": "image/gif",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          ...corsHeaders,
        },
      });
    }

    // Handle POST requests for page view tracking
    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    const { proposal_id, tracking_token, send_id, event, time_seconds } = parsed.data;

    const userAgent = req.headers.get("user-agent") || "";
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const deviceInfo = parseUserAgent(userAgent);

    // Require tracking_token for all POST tracking events — a raw proposal_id
    // without a token would let unauthenticated callers mark arbitrary proposals as viewed.
    if (!tracking_token) {
      return new Response(
        JSON.stringify({ error: "tracking_token required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let proposalIdToUse = proposal_id;

    // Resolve proposal from tracking_token
    if (!proposalIdToUse) {
      const { data: proposal } = await supabaseClient
        .from("proposals")
        .select("id")
        .eq("tracking_token", tracking_token)
        .single();
      
      if (proposal) {
        proposalIdToUse = proposal.id;
      }
    } else {
      // When caller supplies proposal_id directly, verify the tracking_token matches
      // that specific proposal so they cannot use a valid token to affect another proposal.
      const { data: tokenProposal } = await supabaseClient
        .from("proposals")
        .select("id")
        .eq("tracking_token", tracking_token)
        .eq("id", proposalIdToUse)
        .maybeSingle();
      if (!tokenProposal) {
        return new Response(
          JSON.stringify({ error: "Invalid tracking_token for this proposal" }),
          { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    if (!proposalIdToUse) {
      return new Response(
        JSON.stringify({ error: "Proposal not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const now = new Date().toISOString();

    if (event === "view") {
      // Record a page view
      // Find the most recent send
      const { data: send } = await supabaseClient
        .from("proposal_sends")
        .select("id, first_opened_at, open_count")
        .eq("proposal_id", proposalIdToUse)
        .order("sent_at", { ascending: false })
        .limit(1)
        .single();

      if (send) {
        const updateData: any = {
          last_opened_at: now,
          open_count: (send.open_count || 0) + 1,
        };

        if (!send.first_opened_at) {
          updateData.first_opened_at = now;
          updateData.ip_address = ip;
          updateData.device_type = deviceInfo.device_type;
          updateData.browser = deviceInfo.browser;
          updateData.os = deviceInfo.os;
        }

        await supabaseClient.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
        await supabaseClient
          .from("proposal_sends")
          .update(updateData)
          .eq("id", send.id);
      }

      await supabaseClient.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
      // Update proposal
      await supabaseClient
        .from("proposals")
        .update({ last_viewed_at: now })
        .eq("id", proposalIdToUse);

    } else if (event === "time" && time_seconds) {
      // Update time spent
      const { data: send } = await supabaseClient
        .from("proposal_sends")
        .select("id, total_view_time_seconds")
        .eq("proposal_id", proposalIdToUse)
        .order("sent_at", { ascending: false })
        .limit(1)
        .single();

      if (send) {
        await supabaseClient.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
        await supabaseClient
          .from("proposal_sends")
          .update({
            total_view_time_seconds: (send.total_view_time_seconds || 0) + time_seconds,
            last_opened_at: now,
          })
          .eq("id", send.id);
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error tracking:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
