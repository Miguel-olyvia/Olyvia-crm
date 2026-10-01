import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { requireServiceRole, getServiceRoleKey } from "../_shared/auth.ts";
import { getCorsHeadersExtended } from "../_shared/cors.ts";
import { sendSmsNow } from "../_shared/sendSms.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { reconcileDrift, reconcileDueItems, renderLinkedSms } from "../_shared/reminderRunner.ts";
import { collectDueBatch, decideRendered, DUE_BATCH_SIZE, isHeldBack } from "../_shared/reminderBatch.ts";

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

    // Antes do lote: acertar os lembretes de visita com o estado ACTUAL da
    // visita (cancelada, movida). Fail-soft: nunca impede o envio dos restantes.
    let reconcileSummary: Record<string, number> | null = null;
    try {
      reconcileSummary = { ...(await reconcileDrift(supabase)) };
    } catch (reconcileErr) {
      console.error("[process-scheduled-sms] reconcile failed (non-fatal):", reconcileErr);
    }

    // Mais antigas primeiro, e sem as linhas que ja foram vistas nesta corrida.
    const fetchDue = async (excludeIds: readonly string[]) => {
      let q = supabase
        .from("scheduled_sms")
        .select("*")
        .eq("status", "pending")
        .lte("scheduled_for", new Date().toISOString())
        .order("scheduled_for", { ascending: true })
        .order("id", { ascending: true })
        .limit(DUE_BATCH_SIZE);
      if (excludeIds.length > 0) q = q.not("id", "in", `(${excludeIds.join(",")})`);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    };

    // Confirmar a visita de cada lembrete que vai sair agora. Visitas cujo acerto
    // FALHOU: os seus lembretes ficam para o proximo lote e nao ocupam este.
    const batch = await collectDueBatch({
      fetchDue,
      reconcile: (ids) => reconcileDueItems(supabase, ids),
    });
    const due = batch.rows;
    const unreconciled = batch.unreconciled;
    if (due.length === 0) {
      return new Response(JSON.stringify({ processed: 0, deferred: batch.deferred, reconcile: reconcileSummary }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let failed = 0;
    let deferred = batch.deferred;
    let cancelled = 0;

    for (const row of due) {
      try {
        if (isHeldBack(row, unreconciled)) {
          deferred++;
          continue;
        }
        // Lembrete ligado a visita: o texto e montado agora, com a hora actual.
        // Nunca sai com {{chavetas}} por substituir nem com uma data que ja nao e
        // a da visita: ou fica para o proximo lote, ou cancela-se com motivo.
        const rendered = row.schedule_item_id ? await renderLinkedSms(supabase, row) : { kind: "stored" as const };
        const decision = decideRendered(rendered);
        if (decision.kind === "defer") {
          console.error("[process-scheduled-sms] lembrete adiado:", row.id, decision.reason);
          deferred++;
          continue;
        }
        if (decision.kind === "cancel") {
          const { error: cancelErr } = await supabase.from("scheduled_sms").update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancel_reason: decision.reason,
          }).eq("id", row.id).eq("status", "pending");
          if (cancelErr) {
            // Nao se conseguiu cancelar: fica pendente para o proximo lote, nunca sai.
            console.error("[process-scheduled-sms] cancelamento falhou, lembrete adiado:", row.id, cancelErr);
            deferred++;
          } else {
            cancelled++;
          }
          continue;
        }
        const message: string = decision.content ?? row.message;
        const result = await sendSmsNow({ toPhone: row.to_phone, message });

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
          message,
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

    return new Response(JSON.stringify({ processed, failed, cancelled, deferred, reconcile: reconcileSummary }), {
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
