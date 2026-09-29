import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { requireServiceRole, getServiceRoleKey } from "../_shared/auth.ts";
import { getCorsHeadersExtended } from "../_shared/cors.ts";
import { sendSmsNow } from "../_shared/sendSms.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry();

/**
 * Process Scheduled SMS (Regra 3 — lembrete por SMS)
 *
 * Invoked by pg_cron every 5 minutes. Sends sendSmsNow() DIRECTLY, in-process
 * — no network hop to a separate edge function, so the gateway-JWT bug that
 * kept email reminders silently "sent" for weeks (see process-scheduled-emails,
 * migration 20261203180000) has no equivalent here to reproduce.
 */
Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeadersExtended(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!requireServiceRole(req)) {
    return new Response(JSON.stringify({ error: "This endpoint is for internal use only" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, getServiceRoleKey());

    const { data: due, error: fetchError } = await supabase
      .from("scheduled_sms")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .limit(50);

    if (fetchError) throw fetchError;
    if (!due || due.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let failed = 0;

    for (const row of due) {
      try {
        const result = await sendSmsNow({ toPhone: row.to_phone, message: row.message });

        await supabase.from("scheduled_sms").update({
          status: result.ok ? "sent" : "failed",
          sent_at: result.ok ? new Date().toISOString() : null,
          error_message: result.ok ? null : result.error,
        }).eq("id", row.id);

        // Espelha em sms_logs -- mesmo historico consultado pelo ecra de
        // falhas de envio (regra 11), independente de ser um SMS imediato
        // (confirmação) ou agendado (lembrete).
        await supabase.from("sms_logs").insert({
          organization_id: row.organization_id,
          created_by: row.created_by,
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          to_phone: row.to_phone,
          message: row.message,
          status: result.ok ? "sent" : "failed",
          error_message: result.ok ? null : result.error,
          sent_at: result.ok ? new Date().toISOString() : null,
        });

        if (result.ok) processed++; else failed++;
      } catch (err: any) {
        console.error(`[process-scheduled-sms] row ${row.id} failed:`, err);
        await supabase.from("scheduled_sms").update({
          status: "failed",
          error_message: err instanceof Error ? err.message : String(err),
        }).eq("id", row.id);
        failed++;
      }
    }

    return new Response(JSON.stringify({ processed, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in process-scheduled-sms:", error);
    await captureError(error, { function: "process-scheduled-sms" });
    return new Response(JSON.stringify({ error: "Erro interno." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
