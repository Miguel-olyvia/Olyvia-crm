import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { resolveCallerIdentity, validateOrgScope, authErrorResponse, AuthError } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface DuplicateRequest {
  quote_id: string;
  title_suffix?: string; // optional, defaults to " (Cópia)"
  apply_discount_percent?: number; // optional, applied as desconto_global_percent
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const caller = await resolveCallerIdentity(req, supabaseAdmin);

    let body: DuplicateRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const quoteId = typeof body?.quote_id === "string" ? body.quote_id.trim() : "";
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!quoteId || !uuidRe.test(quoteId)) {
      return new Response(JSON.stringify({ error: "quote_id inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const titleSuffix = typeof body.title_suffix === "string" && body.title_suffix.length <= 50
      ? body.title_suffix
      : " (Cópia)";

    let discountOverride: number | null = null;
    if (typeof body.apply_discount_percent === "number" && Number.isFinite(body.apply_discount_percent)) {
      const clamped = Math.max(0, Math.min(100, body.apply_discount_percent));
      discountOverride = Number(clamped.toFixed(2));
    }

    // Fetch source quote
    const { data: src, error: srcErr } = await supabaseAdmin
      .from("quotes")
      .select("*")
      .eq("id", quoteId)
      .is("deleted_at", null)
      .maybeSingle();

    if (srcErr) {
      return new Response(JSON.stringify({ error: srcErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!src) {
      return new Response(JSON.stringify({ error: "Orçamento não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Org scope
    const allowed = await validateOrgScope(supabaseAdmin, caller, src.organization_id);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Sem permissão para este orçamento" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate new quote number
    const { data: numData, error: numErr } = await supabaseAdmin.rpc("generate_quote_number");
    if (numErr) {
      console.error("[duplicate-quote] generate_quote_number error", numErr);
    }
    const newNumber = (numData as string | null) || null;

    // Build new quote payload — strip identity/state/lifecycle fields
    const newQuote: Record<string, unknown> = {
      cliente_id: src.cliente_id,
      business_unit_id: src.business_unit_id,
      obra_endereco: src.obra_endereco,
      obra_notas: src.obra_notas,
      modelo_base: src.modelo_base,
      desconto_global_percent: discountOverride !== null ? discountOverride : src.desconto_global_percent,
      moeda: src.moeda,
      estado: "rascunho",
      created_by: caller.isServiceRole ? src.created_by : caller.anewUserId,
      quote_number: newNumber,
      validade_dias: src.validade_dias,
      site_address_id: src.site_address_id,
      deal_id: src.deal_id,
      organization_id: src.organization_id,
      entity_id: src.entity_id,
      root_organization_id: src.root_organization_id,
      title: (src.title || "Orçamento") + titleSuffix,
      template_id: src.template_id,
      client_notes: src.client_notes,
      conditions: src.conditions,
      iva_rate: src.iva_rate,
      assigned_to: src.assigned_to,
      // Explicitly NOT copied: proposal_id, accepted_at, request_date, delivered_at,
      // delivery_time_hours (generated), deleted_at, deleted_by, subtotal/total/total_fees
      // (will be recomputed by triggers/builder on save). Leave totals to copy as snapshot:
      subtotal: src.subtotal,
      total_fees: src.total_fees,
      total: src.total,
    };

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("quotes")
      .insert(newQuote)
      .select("id")
      .single();

    if (insErr || !inserted) {
      console.error("[duplicate-quote] insert quote error", insErr);
      return new Response(JSON.stringify({ error: insErr?.message || "Falha ao criar orçamento" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newQuoteId = inserted.id as string;

    // Copy quote_lines
    const { data: lines, error: linesErr } = await supabaseAdmin
      .from("quote_lines")
      .select("*")
      .eq("quote_id", quoteId);

    if (linesErr) {
      console.error("[duplicate-quote] read lines error", linesErr);
    }

    if (lines && lines.length > 0) {
      const newLines = lines.map((l: any) => {
        const { id: _id, created_at: _ca, quote_id: _qid, total_com_desconto: _tcd, ...rest } = l;
        // Recompute total_com_desconto if discount override changed
        const recomputed = discountOverride !== null && typeof rest.total_com_iva === "number"
          ? Number((rest.total_com_iva * (1 - discountOverride / 100)).toFixed(2))
          : _tcd;
        return {
          ...rest,
          quote_id: newQuoteId,
          total_com_desconto: recomputed,
        };
      });

      const { error: insLinesErr } = await supabaseAdmin
        .from("quote_lines")
        .insert(newLines);

      if (insLinesErr) {
        console.error("[duplicate-quote] insert lines error", insLinesErr);
        // Rollback: delete new quote
        await supabaseAdmin.from("quotes").delete().eq("id", newQuoteId);
        return new Response(JSON.stringify({ error: insLinesErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Copy quote_fees
    const { data: fees } = await supabaseAdmin
      .from("quote_fees")
      .select("*")
      .eq("quote_id", quoteId);

    if (fees && fees.length > 0) {
      const newFees = fees.map((f: any) => {
        const { id: _id, created_at: _ca, quote_id: _qid, ...rest } = f;
        return { ...rest, quote_id: newQuoteId };
      });
      const { error: feesErr } = await supabaseAdmin.from("quote_fees").insert(newFees);
      if (feesErr) {
        console.error("[duplicate-quote] insert fees error", feesErr);
        // Non-fatal; keep the duplicated quote, but report
      }
    }

    return new Response(
      JSON.stringify({ id: newQuoteId, quote_number: newNumber }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    try {
      return authErrorResponse(err, corsHeaders);
    } catch {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[duplicate-quote] unhandled", err);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }
});
