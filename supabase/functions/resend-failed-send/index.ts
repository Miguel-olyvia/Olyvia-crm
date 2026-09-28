import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { getServiceRoleKey } from "../_shared/auth.ts";
import { getCorsHeadersExtended } from "../_shared/cors.ts";
import { sendSmsNow } from "../_shared/sendSms.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry();

/**
 * Resend Failed Send API (Regra 11)
 *
 * AUTHENTICATED endpoint — real user JWT required. Reuses the exact
 * to/subject/body stored on the failed email_logs/sms_logs row (no
 * editing before resend, by explicit decision) and inserts a fresh log
 * row with the new attempt's outcome, leaving the original failed row
 * untouched as history.
 *
 * POST /resend-failed-send
 * Body: { type: 'email' | 'sms', log_id: string }
 * Returns: { success: true } | { error: string }
 */
Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeadersExtended(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceClient = createClient(supabaseUrl, getServiceRoleKey());

    // Resolve the caller's identity from their own token (never trust a
    // client-sent user id).
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await serviceClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: anewUser } = await serviceClient
      .from("anew_users")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!anewUser) {
      return new Response(JSON.stringify({ error: "User profile not found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { type, log_id } = await req.json();
    if (type !== "email" && type !== "sms") {
      return new Response(JSON.stringify({ error: "type must be 'email' or 'sms'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!log_id || typeof log_id !== "string") {
      return new Response(JSON.stringify({ error: "log_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "email") {
      const { data: logRow } = await serviceClient
        .from("email_logs")
        .select("organization_id, user_id, entity_id, to_email, subject, body_html, smtp_id")
        .eq("id", log_id)
        .eq("status", "failed")
        .maybeSingle();

      if (!logRow) {
        return new Response(JSON.stringify({ error: "Registo não encontrado ou já não está falhado." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Scope check: the caller must actually belong to the log's organization
      // — mirrors send-email's own membership check, done here up front since
      // this function calls send-email with service-role auth afterwards.
      if (logRow.organization_id) {
        const { data: membership } = await serviceClient
          .from("anew_memberships")
          .select("id")
          .eq("user_id", anewUser.id)
          .eq("organization_id", logRow.organization_id)
          .eq("status", "active")
          .maybeSingle();
        if (!membership) {
          return new Response(JSON.stringify({ error: "Sem permissão para reenviar este email." }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getServiceRoleKey()}` },
        body: JSON.stringify({
          organization_id: logRow.organization_id,
          user_id: logRow.user_id,
          entity_id: logRow.entity_id,
          smtp_id: logRow.smtp_id,
          to: logRow.to_email,
          subject: logRow.subject,
          html: logRow.body_html,
        }),
      });
      const sendResult = await sendResponse.json();
      if (!sendResponse.ok || sendResult.error) {
        return new Response(JSON.stringify({ error: sendResult.error || `HTTP ${sendResponse.status}` }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // type === "sms"
    const { data: logRow } = await serviceClient
      .from("sms_logs")
      .select("organization_id, created_by, entity_type, entity_id, to_phone, message")
      .eq("id", log_id)
      .eq("status", "failed")
      .maybeSingle();

    if (!logRow) {
      return new Response(JSON.stringify({ error: "Registo não encontrado ou já não está falhado." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (logRow.organization_id) {
      const { data: membership } = await serviceClient
        .from("anew_memberships")
        .select("id")
        .eq("user_id", anewUser.id)
        .eq("organization_id", logRow.organization_id)
        .eq("status", "active")
        .maybeSingle();
      if (!membership) {
        return new Response(JSON.stringify({ error: "Sem permissão para reenviar este SMS." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const smsResult = await sendSmsNow({ toPhone: logRow.to_phone, message: logRow.message });
    await serviceClient.from("sms_logs").insert({
      organization_id: logRow.organization_id,
      created_by: logRow.created_by,
      entity_type: logRow.entity_type,
      entity_id: logRow.entity_id,
      to_phone: logRow.to_phone,
      message: logRow.message,
      status: smsResult.ok ? "sent" : "failed",
      error_message: smsResult.ok ? null : smsResult.error,
      sent_at: smsResult.ok ? new Date().toISOString() : null,
    });

    if (!smsResult.ok) {
      return new Response(JSON.stringify({ error: smsResult.error }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in resend-failed-send:", error);
    await captureError(error, { function: "resend-failed-send" });
    return new Response(JSON.stringify({ error: "Erro interno." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
