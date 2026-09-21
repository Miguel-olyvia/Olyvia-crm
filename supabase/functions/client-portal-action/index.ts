import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";
import { isNotificationEnabled } from "../_shared/notificationSettings.ts";
import { resolveNotifyTarget, type NotifyTarget } from "../_shared/portalNotifyTarget.ts";
import { withRetryResult } from "../_shared/retry.ts";
import { resolveProposalStageId } from "../_shared/proposalWorkflowStage.ts";
import { detectClientIp } from "../_shared/clientIp.ts";
// Só usados pelo case "get_direct_sale_pdf_data": o NIF nunca está em claro
// na base de dados (fiscal_entities.nif_encrypted), e o PDF da proforma
// precisa dele. Mesmo caminho da edge function nif-reveal.
import { decryptNif, deriveKeyFromEnv } from "../_shared/nifCrypto.ts";

const requestSchema = z.object({
  action: z.string(),
  params: z.record(z.unknown()).optional(),
});

import { getCorsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry();

// Guards against a slow/unresponsive downstream call keeping this Edge
// Function alive past its execution limit — when that happens the platform
// kills the invocation mid-flight with no response body/CORS headers at
// all, and the browser surfaces a generic "Failed to send a request to
// the Edge Function" instead of any real error message.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout`)), ms)),
  ]);
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get user from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    let user: any;
    try {
      const { data, error: userError } = await withTimeout(
        anonClient.auth.getUser(authHeader.replace("Bearer ", "")),
        5000,
        "auth_getUser",
      );
      if (userError || !data.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
      }
      user = data.user;
    } catch {
      return new Response(
        JSON.stringify({ error: "auth_unavailable", message: "Serviço de autenticação indisponível. Tente novamente." }),
        { status: 503, headers: corsHeaders },
      );
    }

    const body = await req.json();
    const parsedBody = requestSchema.safeParse(body);
    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsedBody.error.issues }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    const { action, params: _params } = parsedBody.data;
    const params = (_params ?? body) as Record<string, any>;

    // Verify this user is a portal client
    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("id, organization_id, created_by, client_id, proposal_id, quote_id, contract_id, direct_sale_id")
      .eq("auth_user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!portalUser) {
      return new Response(JSON.stringify({ error: "Not a portal user" }), { status: 403, headers: corsHeaders });
    }

    const clientName = user.user_metadata?.full_name || user.email || "Cliente";

    // ── Resolve (entity_id, organization_id) for a document column ──
    // Shared by assertOwnership and resolveAuthorizedPortalUserId.
    async function resolveDocEntity(
      column: "proposal_id" | "quote_id" | "contract_id" | "direct_sale_id",
      id: string,
    ): Promise<{ entityId: string | null; orgId: string | null }> {
      if (!id) return { entityId: null, orgId: null };
      let entityId: string | null = null;
      let orgId: string | null = null;
      if (column === "proposal_id") {
        const { data: p } = await supabase.from("proposals")
          .select("entity_id, organization_id").eq("id", id).maybeSingle();
        entityId = (p as any)?.entity_id || null;
        orgId = (p as any)?.organization_id || null;
      } else if (column === "contract_id") {
        const { data: c } = await supabase.from("client_contracts")
          .select("entity_id, organization_id").eq("id", id).maybeSingle();
        entityId = (c as any)?.entity_id || null;
        orgId = (c as any)?.organization_id || null;
      } else if (column === "direct_sale_id") {
        const { data: ds } = await supabase.from("direct_sales")
          .select("entity_id, organization_id").eq("id", id).maybeSingle();
        entityId = (ds as any)?.entity_id || null;
        orgId = (ds as any)?.organization_id || null;
      } else if (column === "quote_id") {
        const { data: q } = await supabase.from("quotes")
          .select("entity_id, organization_id, deal_id, proposal_id").eq("id", id).maybeSingle();
        entityId = (q as any)?.entity_id || null;
        orgId = (q as any)?.organization_id || null;
        // Fallback 1: via parent proposal
        if (!entityId && (q as any)?.proposal_id) {
          const { data: pp } = await supabase.from("proposals")
            .select("entity_id, organization_id").eq("id", (q as any).proposal_id).maybeSingle();
          entityId = entityId || (pp as any)?.entity_id || null;
          orgId = orgId || (pp as any)?.organization_id || null;
        }
        // Fallback 2: via deal
        if (!entityId && (q as any)?.deal_id) {
          const { data: d } = await supabase.from("deals")
            .select("entity_id, organization_id").eq("id", (q as any).deal_id).maybeSingle();
          entityId = entityId || (d as any)?.entity_id || null;
          orgId = orgId || (d as any)?.organization_id || null;
        }
      }
      return { entityId, orgId };
    }

    // ── IDOR GUARD: direct portal-user row match, with entity_id fallback ──
    async function assertOwnership(column: "proposal_id" | "quote_id" | "contract_id" | "direct_sale_id", id: string): Promise<boolean> {
      if (!id) return false;

      // 1) Direct match: this portal user has a row for this exact document
      const { data: direct } = await supabase
        .from("client_portal_users")
        .select("id")
        .eq("auth_user_id", user.id)
        .eq(column, id)
        .maybeSingle();
      if (direct) return true;

      // 2) Entity-scoped fallback (uses resolveDocEntity to handle quote→proposal→deal chain)
      const { entityId, orgId } = await resolveDocEntity(column, id);
      if (!entityId || !orgId) return false;

      const { data: scoped } = await supabase
        .from("client_portal_users")
        .select("id")
        .eq("auth_user_id", user.id)
        .eq("entity_id", entityId)
        .eq("organization_id", orgId)
        .limit(1);
      return !!(scoped && scoped.length > 0);
    }

    // ── Resolve which client_portal_users row authorizes this user for a doc ──
    // Returns the portal_user_id row id (for logging / rate-limit scoping).
    async function resolveAuthorizedPortalUserId(
      column: "proposal_id" | "quote_id" | "contract_id" | "direct_sale_id",
      id: string,
    ): Promise<string | null> {
      // 1) Direct row
      const { data: direct } = await supabase
        .from("client_portal_users")
        .select("id")
        .eq("auth_user_id", user.id)
        .eq(column, id)
        .maybeSingle();
      if (direct) return (direct as any).id;

      // 2) Entity-scoped fallback
      const { entityId, orgId } = await resolveDocEntity(column, id);
      if (!entityId || !orgId) return null;
      const { data: scoped } = await supabase
        .from("client_portal_users")
        .select("id")
        .eq("auth_user_id", user.id)
        .eq("entity_id", entityId)
        .eq("organization_id", orgId)
        .limit(1)
        .maybeSingle();
      return (scoped as any)?.id ?? null;
    }
    const forbidden = () => new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });

    // ── OTP single-use guard: atomically claim a verified OTP. ──
    // Combines lookup + consume in one UPDATE..WHERE..RETURNING so concurrent
    // calls cannot both consume the same OTP. Requires auth_user_id match so
    // OTPs issued to user A cannot be replayed by user B. OTPs issued before
    // the auth_user_id rollout will have auth_user_id IS NULL and will fail
    // by design — users must request a fresh code post-deploy.
    async function consumeVerifiedOtp(
      referenceType: "proposal" | "contract" | "direct_sale",
      referenceId: string,
      purpose: string,
    ): Promise<{ ok: boolean; otpId?: string }> {
      if (!referenceId || !purpose) return { ok: false };
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const nowIso = new Date().toISOString();

      // 1) Select the most recent eligible OTP id
      const { data: candidate } = await supabase
        .from("sms_otp_codes")
        .select("id")
        .eq("auth_user_id", user.id)
        .eq("reference_id", referenceId)
        .eq("reference_type", referenceType)
        .eq("purpose", purpose)
        .not("verified_at", "is", null)
        .is("consumed_at", null)
        .gte("verified_at", tenMinAgo)
        .order("verified_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!candidate) return { ok: false };
      const otpId = (candidate as any).id;

      // 2) Atomically consume that specific id (guards against race within the window)
      const { data: claimed, error } = await supabase
        .from("sms_otp_codes")
        .update({ consumed_at: nowIso })
        .eq("id", otpId)
        .is("consumed_at", null)
        .gte("verified_at", tenMinAgo)
        .select("id");

      if (error || !claimed || claimed.length === 0) return { ok: false };
      return { ok: true, otpId };
    }


    // Server-side IP detection (do not trust client-provided IP).
    // Was inlined here; now in _shared/clientIp.ts so the public-link accept
    // path and the OTP path derive the evidence IP the exact same way instead
    // of each inventing their own (one of them wrote the literal "client").
    const detectedIp = detectClientIp(req);

    // Validate rejection reason text (10..500 chars, basic HTML strip)
    function sanitizeReason(text: unknown): string | null {
      if (typeof text !== "string") return null;
      const stripped = text.replace(/<[^>]*>/g, "").trim();
      if (stripped.length < 10 || stripped.length > 500) return null;
      return stripped;
    }

    // Per-request cache so several notifications about the same document resolve
    // its target (org + commercial) only once. The resolution itself lives in
    // the shared, unit-tested `resolveNotifyTarget` helper.
    const notifyTargetCache = new Map<string, NotifyTarget>();

    /**
     * Insert a notification for the document's commercial, in the document's own
     * organization — only if that notification type is enabled for that org.
     * `docRef` is the document the action is about, so multi-org logins always
     * notify the right company's commercial (see portalNotifyTarget.ts).
     */
    async function maybeNotify(
      type: string,
      payload: Record<string, any>,
      docRef: { column: "proposal_id" | "quote_id" | "contract_id" | "direct_sale_id"; id: string },
    ) {
      const cacheKey = `${docRef.column}:${docRef.id}`;
      let target = notifyTargetCache.get(cacheKey);
      if (!target) {
        target = await resolveNotifyTarget(supabase, docRef.column, docRef.id);
        notifyTargetCache.set(cacheKey, target);
      }
      const { orgId, commercialAuthId } = target;
      if (!commercialAuthId || !orgId) return;
      const enabled = await isNotificationEnabled(supabase, orgId, type);
      if (!enabled) return;
      await supabase.from("notifications").insert({
        user_id: commercialAuthId,
        organization_id: orgId,
        type,
        kind: "notification",
        ...payload,
      });
    }

    // Never leaves the server: costs and margins are internal.
    // Declarado ao nível do serve() (e não dentro de um `case`) porque é
    // preciso em mais do que uma rota: as linhas de orçamento do PDF da
    // proposta e as linhas da venda direta. Corpo e lista de colunas
    // inalterados face à declaração anterior, que vivia dentro do
    // case "get_proposal_pdf_data".
    const SENSITIVE_LINE_COLUMNS = [
      "cost_price",
      "custo_mao_obra_unit",
      "custo_material_unit",
      "margem_percent",
    ];
    const stripCosts = (row: Record<string, unknown>) => {
      const clean: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (!SENSITIVE_LINE_COLUMNS.includes(key)) clean[key] = value;
      }
      return clean;
    };

    switch (action) {
      case "accept_quote": {
        const { quote_id } = params;
        if (!quote_id) return new Response(JSON.stringify({ error: "quote_id required" }), { status: 400, headers: corsHeaders });
        if (!(await assertOwnership("quote_id", quote_id))) return forbidden();

        // Update quote status
        await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
        await withRetryResult(() => supabase.from("quotes").update({ estado: "aceite" }).eq("id", quote_id));

        // Update portal status to signed for this quote
        await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
        await withRetryResult(() => supabase.from("client_portal_users")
          .update({ portal_status: "signed" })
          .eq("auth_user_id", user.id)
          .eq("quote_id", quote_id));

        // Auto-create proposal from accepted quote
        let createdProposalId: string | null = null;
        try {
          const { data: quote } = await supabase.from("quotes").select("*").eq("id", quote_id).single();
          if (quote) {
            const resolvedOrgId = quote.organization_id || portalUser.organization_id;

            // Get quote lines
            const { data: quoteLines } = await supabase
              .from("quote_lines")
              .select("*")
              .eq("quote_id", quote_id)
              .order("sort_order", { ascending: true });

            // Calculate total from quote or quote lines
            const totalValue = quote.total || quote.valor_total || (quoteLines || []).reduce((s: number, l: any) => s + (Number(l.total_com_iva) || 0), 0);

            // Resolve entity_id: from quote, or fallback to deal's entity_id
            let resolvedEntityId = quote.entity_id || null;
            if (!resolvedEntityId && quote.deal_id) {
              const { data: deal } = await supabase.from("deals").select("entity_id, contact_id, client_id").eq("id", quote.deal_id).maybeSingle();
              if (deal) {
                resolvedEntityId = deal.entity_id || null;
              }
            }

            // Create proposal
            await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
            const { data: proposal, error: pErr } = await supabase
              .from("proposals")
              .insert({
                title: quote.title || `Proposta - ${quote.quote_number}`,
                value: totalValue,
                status: "draft",
                deal_id: quote.deal_id || null,
                client_id: quote.cliente_id || null,
                entity_id: resolvedEntityId,
                organization_id: resolvedOrgId,
                root_organization_id: (quote as any).root_organization_id || resolvedOrgId,
                created_by: quote.created_by,
                notes: `Proposta gerada automaticamente do orçamento ${quote.quote_number || ""} aceite no portal.`,
              } as any)
              .select("id")
              .single();

            if (!pErr && proposal) {
              createdProposalId = proposal.id;

              // Copy quote lines to proposal items using correct column names
              if (quoteLines && quoteLines.length > 0) {
                const proposalItems = quoteLines.map((line: any, idx: number) => {
                  const qty = Number(line.qt) || Number(line.quantidade) || 1;
                  const totalSemIva = Number(line.total_sem_iva) || 0;
                  const unitPrice = qty > 0 ? totalSemIva / qty : totalSemIva;
                  const vatRate = Number(line.iva_percent) || Number(line.taxa_iva) || 23;

                  return {
                    proposal_id: proposal.id,
                    description: line.descricao_snapshot || line.descricao || line.produto_nome || "Item",
                    quantity: qty,
                    unit_price: unitPrice,
                    vat_rate: vatRate,
                    sort_order: line.sort_order || line.ordem || idx,
                  };
                });
                await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
                await supabase.from("proposal_items").insert(proposalItems);
              }

              // Update pipeline_links
              await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
              await supabase.from("pipeline_links")
                .update({ proposal_id: proposal.id } as any)
                .eq("quote_id", quote_id)
                .eq("status", "active");
            }
          }
        } catch (e) {
          console.error("Auto-create proposal from quote error:", e);
        }

        // Notify commercial
        const { data: acceptedQuote } = await supabase.from("quotes").select("quote_number").eq("id", quote_id).maybeSingle();
        const proposalNote = createdProposalId ? " Uma proposta foi gerada automaticamente." : "";
        await maybeNotify("client_accepted_quote", {
          title: "🎉 Orçamento aceite no portal!",
          message: `O cliente ${clientName} aceitou o orçamento ${acceptedQuote?.quote_number || ""} no portal.${proposalNote}`,
          priority: "urgent",
          link: createdProposalId ? `/proposals` : `/quotes`,
        }, { column: "quote_id", id: quote_id });

        return new Response(JSON.stringify({ success: true, proposal_id: createdProposalId }), { headers: corsHeaders });
      }

      case "reject_quote": {
        const { quote_id, reason } = params;
        if (!quote_id) return new Response(JSON.stringify({ error: "quote_id required" }), { status: 400, headers: corsHeaders });
        if (!(await assertOwnership("quote_id", quote_id))) return forbidden();

        const safeReason = reason ? sanitizeReason(reason) : null;
        if (reason && !safeReason) {
          return new Response(JSON.stringify({ error: "Motivo deve ter entre 10 e 500 caracteres" }), { status: 400, headers: corsHeaders });
        }

        await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
        await withRetryResult(() => supabase.from("quotes").update({
          estado: "rejeitado",
          client_notes: safeReason,
          lost_reason: safeReason,
        }).eq("id", quote_id));

        const { data: rejQuote } = await supabase.from("quotes").select("quote_number").eq("id", quote_id).maybeSingle();
        await maybeNotify("client_rejected_quote", {
          title: "Orçamento rejeitado no portal",
          message: `O cliente ${clientName} rejeitou o orçamento ${rejQuote?.quote_number || ""}.${safeReason ? ` Motivo: ${safeReason}` : ""}`,
          priority: "high",
        }, { column: "quote_id", id: quote_id });

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // Data needed to render the proposal PDF in the client's browser.
      //
      // The portal's "download PDF" button used the same generator as the CRM,
      // which merges the PDFs of the proposal's quotes. Portal users cannot
      // read `quotes` (RLS), so it always found zero and threw — the button
      // silently did nothing, for every client.
      //
      // Opening RLS on quotes/quote_lines was not an option: quote_lines holds
      // cost_price, custo_mao_obra_unit, custo_material_unit and
      // margem_percent — the company's costs and margins. Instead the data is
      // read here with service_role, stripped of those four columns, and
      // returned only to a caller that owns the proposal.
      case "get_proposal_pdf_data": {
        const { proposal_id } = params;
        if (!proposal_id) {
          return new Response(JSON.stringify({ error: "proposal_id required" }), { status: 400, headers: corsHeaders });
        }
        if (!(await assertOwnership("proposal_id", proposal_id))) return forbidden();

        const { data: proposal } = await supabase
          .from("proposals")
          // template_snapshot vai junto: e ele que manda no aspecto do PDF
          // (generateProposalPdfBlob), para o documento do portal nao mudar
          // quando alguem edita o modelo partilhado.
          .select("id, proposal_number, title, template_id, template_snapshot, organization_id")
          .eq("id", proposal_id)
          .maybeSingle();

        // Same resolution order as generateProposalPdfBlob: quotes linked
        // directly, falling back to pipeline_links for the ones whose
        // quotes.proposal_id was never filled in.
        let quoteRows: any[] = [];
        const { data: directQuotes } = await supabase
          .from("quotes")
          .select("*")
          .eq("proposal_id", proposal_id)
          .is("deleted_at", null)
          .order("created_at", { ascending: true });
        quoteRows = directQuotes || [];

        if (quoteRows.length === 0) {
          const { data: links } = await supabase
            .from("pipeline_links")
            .select("quote_id")
            .eq("proposal_id", proposal_id)
            .eq("status", "active")
            .not("quote_id", "is", null);
          const linkedIds = (links || []).map((l: any) => l.quote_id).filter(Boolean);
          if (linkedIds.length > 0) {
            const { data: linkedQuotes } = await supabase
              .from("quotes")
              .select("*")
              .in("id", linkedIds)
              .is("deleted_at", null)
              .order("created_at", { ascending: true });
            quoteRows = linkedQuotes || [];
          }
        }

        // SENSITIVE_LINE_COLUMNS/stripCosts vivem agora no escopo do serve()
        // (acima do switch) — mesmo corpo, mesma lista de colunas.
        const quotes: any[] = [];
        for (const quote of quoteRows) {
          const [{ data: lines }, { data: fees }] = await Promise.all([
            // visible_to_client tem de ser filtrado AQUI. A policy de RLS
            // "Client can view own quote lines" filtra-o, e o gerador do CRM
            // (generateProposalPdfBlob.ts:157) também — mas esta função corre
            // com service_role, por isso a RLS não se aplica e sem esta linha
            // as linhas internas iam dentro do PDF que o cliente descarrega.
            // Hoje nada no frontend marca uma linha de orçamento como interna,
            // logo não há fuga em curso; isto é a armadilha a desarmar antes
            // de as linhas internas voltarem aos orçamentos.
            supabase
              .from("quote_lines")
              .select("*, products (sku), services (sku)")
              .eq("quote_id", quote.id)
              .eq("visible_to_client", true)
              .order("ordem"),
            supabase
              .from("quote_fees")
              .select("*, service_fee_types (name, calculation_type, percentage, fixed_amount)")
              .eq("quote_id", quote.id),
          ]);
          quotes.push({
            quote,
            lines: (lines || []).map((l: any) => stripCosts(l)),
            fees: fees || [],
          });
        }

        return new Response(JSON.stringify({ proposal, quotes }), { headers: corsHeaders });
      }

      case "sign_proposal": {
        const { proposal_id, signature_image, selected_quote_ids } = params;
        if (!proposal_id || !signature_image) {
          return new Response(JSON.stringify({ error: "proposal_id and signature_image required" }), { status: 400, headers: corsHeaders });
        }
        if (!(await assertOwnership("proposal_id", proposal_id))) return forbidden();
        // B1 — atomically claim OTP BEFORE any sign-side mutation
        const otpClaim = await consumeVerifiedOtp("proposal", proposal_id, "proposal_signature");
        if (!otpClaim.ok) {
          return new Response(
            JSON.stringify({ error: "otp_required", message: "OTP inválido, expirado ou já utilizado. Peça um novo código." }),
            { status: 403, headers: corsHeaders },
          );
        }

        const selectedQuoteIds = Array.isArray(selected_quote_ids)
          ? selected_quote_ids.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
          : [];

        if (selectedQuoteIds.length > 0) {
          const { data: proposalQuotes } = await supabase
            .from("quotes")
            .select("id")
            .eq("proposal_id", proposal_id)
            .in("id", selectedQuoteIds);
          const ownedQuoteIds = (proposalQuotes || []).map((quote: any) => quote.id);
          if (ownedQuoteIds.length !== selectedQuoteIds.length) return forbidden();
          await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
          await supabase.from("quotes").update({ estado: "aceite" }).in("id", ownedQuoteIds);
          await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
          await supabase.from("quotes").update({ estado: "rejeitado" }).eq("proposal_id", proposal_id).not("id", "in", `(${ownedQuoteIds.join(",")})`);
        }

        const now = new Date().toISOString();
        const { data: proposalOrgForAccept } = await supabase.from("proposals").select("organization_id").eq("id", proposal_id).maybeSingle();
        const acceptedStageId = await resolveProposalStageId(supabase, proposalOrgForAccept?.organization_id ?? null, "is_won");
        await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
        await withRetryResult(() => supabase.from("proposals").update({
          status: "accepted",
          accepted_at: now,
          signature_image,
          acceptance_ip: detectedIp,
          acceptance_user_agent: req.headers.get("user-agent") || null,
          ...(acceptedStageId ? { stage_id: acceptedStageId } : {}),
        }).eq("id", proposal_id));

        // Freeze the decided snapshot for later change detection — fail-soft,
        // never blocks the acceptance flow that already succeeded above.
        try {
          const { error: decisionError } = await supabase.rpc(
            'record_proposal_decision',
            { p_proposal_id: proposal_id },
          );
          if (decisionError) {
            console.error("record_proposal_decision error:", decisionError);
          }
        } catch (e) {
          console.error("Error recording proposal decision:", e);
        }

        await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
        await withRetryResult(() => supabase.from("client_portal_users")
          .update({ portal_status: "signed" })
          .eq("auth_user_id", user.id)
          .eq("proposal_id", proposal_id));

        // ── Auto-create contract from accepted proposal ──
        let createdContractId: string | null = null;
        try {
          const { data: existingContract } = await supabase
            .from("client_contracts")
            .select("id")
            .eq("proposal_id", proposal_id)
            .is("deleted_at", null)
            .limit(1);

          if (existingContract && existingContract.length > 0) {
            createdContractId = existingContract[0].id;
          } else {
            const { data: fullProposal } = await supabase.from("proposals").select("*").eq("id", proposal_id).single();
            if (fullProposal) {
              const resolvedEntityId = fullProposal.entity_id || null;
              const resolvedOrgId = fullProposal.organization_id || portalUser.organization_id;
              const resolvedRootOrgId = (fullProposal as any).root_organization_id || resolvedOrgId;

              let clientId = null;
              if (resolvedEntityId) {
                const { data: anewClient } = await supabase
                  .from("anew_clients").select("id").eq("entity_id", resolvedEntityId).maybeSingle();
                clientId = anewClient?.id || null;
              }

              let linkedQuoteId = null;
              const { data: pLink } = await supabase
                .from("pipeline_links").select("quote_id").eq("proposal_id", proposal_id).eq("status", "active").maybeSingle();
              if (pLink?.quote_id) linkedQuoteId = pLink.quote_id;

              // contractValue: proposals.value é a fonte de verdade sincronizada
              // (trigger trg_sync_proposal_value_from_quote / calculate_proposal_value_from_quotes,
              // ver migration 20261113060000_fix_proposal_value_trigger_estado.sql). Só recorremos
              // a outras fontes se vier vazio/zero — nunca prevalecem sobre um valor já sincronizado
              // (proposal_items é só um snapshot estático e pode divergir por arredondamento).
              let contractValue = Number(fullProposal.value) || 0;

              if (!contractValue && linkedQuoteId) {
                const { data: ql } = await supabase.from("quote_lines").select("total_com_iva").eq("quote_id", linkedQuoteId);
                if (ql && ql.length > 0) {
                  contractValue = ql.reduce((s: number, l: any) => s + (Number(l.total_com_iva) || 0), 0);
                }
              }

              if (!contractValue) {
                const { data: pi } = await supabase.from("proposal_items").select("*").eq("proposal_id", proposal_id).order("sort_order");
                if (pi && pi.length > 0) {
                  contractValue = pi.reduce((s: number, i: any) => s + (Number(i.total) || (Number(i.quantity) * Number(i.unit_price) * (1 + (Number(i.vat_rate) || 0) / 100))), 0);
                }
              }

              let entityName = "";
              if (resolvedEntityId) {
                const { data: ent } = await supabase.from("anew_entities").select("display_name").eq("id", resolvedEntityId).single();
                if (ent) entityName = ent.display_name;
              }

              const startDate = new Date();
              const endDate = new Date();
              endDate.setFullYear(endDate.getFullYear() + 1);

              await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
              const { data: contract, error: cErr } = await supabase
                .from("client_contracts")
                .insert({
                  client_id: clientId,
                  entity_id: resolvedEntityId,
                  proposal_id: proposal_id,
                  quote_id: linkedQuoteId,
                  organization_id: resolvedOrgId,
                  root_organization_id: resolvedRootOrgId,
                  created_by: fullProposal.created_by,
                  status: "draft",
                  total_value: contractValue,
                  start_date: startDate.toISOString().split("T")[0],
                  end_date: endDate.toISOString().split("T")[0],
                  notes: entityName ? `Contrato gerado automaticamente da proposta aceite no portal - ${entityName}` : "Contrato gerado automaticamente da proposta aceite no portal",
                } as any)
                .select("id")
                .single();

              if (!cErr && contract) {
                createdContractId = contract.id;
                await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
                const { data: updatedLinks, error: linkUpdateError } = await supabase.from("pipeline_links")
                  .update({ contract_id: contract.id } as any)
                  .eq("proposal_id", proposal_id)
                  .eq("status", "active")
                  .select("id");

                if (!linkUpdateError && (!updatedLinks || updatedLinks.length === 0)) {
                  await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
                  await supabase.from("pipeline_links").insert({
                    proposal_id,
                    quote_id: linkedQuoteId,
                    contract_id: contract.id,
                    organization_id: resolvedOrgId,
                    root_organization_id: resolvedRootOrgId,
                    status: "active",
                  } as any);
                }
              }
            }
          }
        } catch (e) {
          console.error("Auto-create contract error:", e);
        }

        // NOTA: Não associamos o contract_id à row do portal da proposta.
        // O acesso ao portal para o contrato só deve ser criado quando o
        // utilizador clicar explicitamente em "Enviar para o portal" na
        // página de contratos (gera uma row própria com portal_status correto).

        const { data: propData } = await supabase.from("proposals").select("proposal_number, title").eq("id", proposal_id).maybeSingle();
        const contractNote = createdContractId ? " Um contrato foi gerado automaticamente." : "";
        await maybeNotify("client_signed_proposal", {
          title: "🎉 Proposta assinada no portal!",
          message: `O cliente ${clientName} assinou a proposta ${propData?.proposal_number || propData?.title || ""}!${contractNote}`,
          priority: "urgent",
          link: createdContractId ? `/client-contracts` : `/proposals`,
        }, { column: "proposal_id", id: proposal_id });

        return new Response(JSON.stringify({ success: true, contract_id: createdContractId }), { headers: corsHeaders });
      }

      case "reject_proposal": {
        const { proposal_id, reason_code, reason_text } = params;
        if (!proposal_id) return new Response(JSON.stringify({ error: "proposal_id required" }), { status: 400, headers: corsHeaders });
        if (!(await assertOwnership("proposal_id", proposal_id))) return forbidden();

        const safeReasonText = reason_text ? sanitizeReason(reason_text) : null;
        if (reason_text && !safeReasonText) {
          return new Response(JSON.stringify({ error: "Motivo deve ter entre 10 e 500 caracteres" }), { status: 400, headers: corsHeaders });
        }

        const now = new Date().toISOString();
        const { data: proposalOrgForReject } = await supabase.from("proposals").select("organization_id").eq("id", proposal_id).maybeSingle();
        const rejectedStageId = await resolveProposalStageId(supabase, proposalOrgForReject?.organization_id ?? null, "is_lost");
        await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
        await withRetryResult(() => supabase.from("proposals").update({
          status: "rejected",
          rejected_at: now,
          rejection_reason_code: reason_code || null,
          rejection_notes: safeReasonText,
          ...(rejectedStageId ? { stage_id: rejectedStageId } : {}),
        }).eq("id", proposal_id));

        // Cascade rejection into quotes still open under this proposal, keeping
        // the same rejection motive so lost-reason reporting stays consistent.
        const cascadeReason = safeReasonText || reason_code || null;
        await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
        await withRetryResult(() => supabase.from("quotes")
          .update({ estado: "rejeitado", lost_reason: cascadeReason })
          .eq("proposal_id", proposal_id)
          .in("estado", ["rascunho", "enviado"]));

        // Freeze the decided snapshot for later change detection — fail-soft,
        // never blocks the rejection flow that already succeeded above.
        try {
          const { error: decisionError } = await supabase.rpc(
            'record_proposal_decision',
            { p_proposal_id: proposal_id },
          );
          if (decisionError) {
            console.error("record_proposal_decision error:", decisionError);
          }
        } catch (e) {
          console.error("Error recording proposal decision:", e);
        }

        const { data: rejProp } = await supabase.from("proposals").select("proposal_number, title").eq("id", proposal_id).maybeSingle();
        await maybeNotify("client_rejected_proposal", {
          title: "Proposta rejeitada no portal",
          message: `O cliente ${clientName} rejeitou a proposta ${rejProp?.proposal_number || rejProp?.title || ""}.${reason_code ? ` Motivo: ${reason_code}` : ""}`,
          priority: "high",
          link: `/proposals`,
        }, { column: "proposal_id", id: proposal_id });

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      case "sign_contract": {
        const { contract_id, signature_image } = params;
        if (!contract_id || !signature_image) {
          return new Response(JSON.stringify({ error: "contract_id and signature_image required" }), { status: 400, headers: corsHeaders });
        }
        if (!(await assertOwnership("contract_id", contract_id))) return forbidden();
        // B1 — atomically claim OTP BEFORE any sign-side mutation
        {
          const otpClaim = await consumeVerifiedOtp("contract", contract_id, "contract_signature");
          if (!otpClaim.ok) {
            return new Response(
              JSON.stringify({ error: "otp_required", message: "OTP inválido, expirado ou já utilizado. Peça um novo código." }),
              { status: 403, headers: corsHeaders },
            );
          }
        }

        const now = new Date().toISOString();
        await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
        await withRetryResult(() => supabase.from("client_contracts").update({
          status: "signed",
          signature_image,
          signature_date: now,
          signature_ip: detectedIp,
          accepted_at: now,
          signed_by_name: clientName,
          // Assinar muda o documento: a assinatura passa a fazer parte dele.
          // Qualquer copia congelada anterior fica desactualizada, por isso e
          // limpa -- a proxima leitura reconstroi o documento ja assinado e
          // volta a congela-lo. A partir dai deixa de mudar por alguem o abrir.
          contract_body_frozen_html: null,
          contract_frozen_at: null,
        }).eq("id", contract_id));

        await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
        await withRetryResult(() => supabase.from("client_portal_users")
          .update({ portal_status: "signed" })
          .eq("auth_user_id", user.id)
          .eq("contract_id", contract_id));

        // Trigger the same workflow the CRM's manual "sign" action uses
        // (pipeline-automation's finalize_contract → execute-workflow) so a
        // client signature converts the linked contact into a client too —
        // without this, only signatures done manually inside the CRM did.
        try {
          // Bounded — this is a best-effort automation trigger fired *after*
          // the contract is already persisted as signed above. Without a
          // timeout, a slow execute-workflow chain could keep this whole
          // invocation alive past the platform's execution limit, which
          // kills it mid-flight with no response at all (the client then
          // sees a generic "Failed to send a request to the Edge Function"
          // even though the signature was actually saved).
          const wfController = new AbortController();
          const wfTimeout = setTimeout(() => wfController.abort(), 8000);
          const wfResp = await fetch(`${supabaseUrl}/functions/v1/execute-workflow`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({
              source_entity: "contract",
              entity_id: contract_id,
              new_stage_id: "signed",
              triggered_by: null,
            }),
            signal: wfController.signal,
          });
          clearTimeout(wfTimeout);
          const wfData = await wfResp.json();
          console.log("[client-portal-action] sign_contract execute-workflow response:", wfData);
        } catch (wfErr) {
          console.error("[client-portal-action] Error triggering execute-workflow for signed contract:", wfErr);
        }

        const { data: signedContract } = await supabase.from("client_contracts").select("contract_number").eq("id", contract_id).maybeSingle();
        await maybeNotify("client_signed_contract", {
          title: "🎉 Contrato assinado no portal!",
          message: `O cliente ${clientName} assinou o contrato ${signedContract?.contract_number || ""}!`,
          priority: "urgent",
          link: `/client-contracts`,
        }, { column: "contract_id", id: contract_id });

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      case "reject_contract": {
        const { contract_id, reason_code, reason_text } = params;
        if (!contract_id) return new Response(JSON.stringify({ error: "contract_id required" }), { status: 400, headers: corsHeaders });
        if (!(await assertOwnership("contract_id", contract_id))) return forbidden();

        const safeReasonText = reason_text ? sanitizeReason(reason_text) : null;
        if (reason_text && !safeReasonText) {
          return new Response(JSON.stringify({ error: "Motivo deve ter entre 10 e 500 caracteres" }), { status: 400, headers: corsHeaders });
        }

        const now = new Date().toISOString();
        await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
        await withRetryResult(() => supabase.from("client_contracts").update({
          status: "rejected",
          rejected_at: now,
          rejection_reason: reason_code || null,
          rejection_notes: safeReasonText,
        }).eq("id", contract_id));

        const { data: rejContract } = await supabase.from("client_contracts").select("contract_number").eq("id", contract_id).maybeSingle();
        await maybeNotify("client_rejected_contract", {
          title: "Contrato rejeitado no portal",
          message: `O cliente ${clientName} rejeitou o contrato ${rejContract?.contract_number || ""}.${reason_code ? ` Motivo: ${reason_code}` : ""}`,
          priority: "high",
          link: `/client-contracts`,
        }, { column: "contract_id", id: contract_id });

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }


      case "ask_question": {
        const { document_type, document_id, message } = params;
        if (!document_type || !document_id || !message) {
          return new Response(JSON.stringify({ error: "document_type, document_id and message required" }), { status: 400, headers: corsHeaders });
        }

        const filterCol = document_type === "proposal" ? "proposal_id" : document_type === "quote" ? "quote_id" : "contract_id";

        // H9 — ownership check
        if (!(await assertOwnership(filterCol as any, document_id))) return forbidden();

        // B4 — resolve the authorized portal_user_id for this doc (handles entity_id fallback)
        const portalUserId = await resolveAuthorizedPortalUserId(filterCol as any, document_id);
        if (!portalUserId) return forbidden();

        // H9 — sanitize message (strip HTML, trim, cap length)
        const safeMessage = typeof message === "string"
          ? message.replace(/<[^>]*>/g, "").trim().slice(0, 2000)
          : "";
        if (safeMessage.length < 1) {
          return new Response(JSON.stringify({ error: "Mensagem inválida" }), { status: 400, headers: corsHeaders });
        }

        // B4 — rate limit: 5 questions/hour per (portal_user, document_type, document_id)
        const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
        const { count: recentCount } = await supabase
          .from("client_portal_access_log")
          .select("id", { count: "exact", head: true })
          .eq("portal_user_id", portalUserId)
          .eq("document_type", document_type)
          .eq("document_id", document_id)
          .eq("action", "question")
          .gte("created_at", oneHourAgo);
        if ((recentCount ?? 0) >= 5) {
          return new Response(JSON.stringify({ error: "Limite de perguntas atingido. Tente novamente mais tarde." }), { status: 429, headers: corsHeaders });
        }

        const docLabel = document_type === "proposal" ? "proposta" : document_type === "quote" ? "orçamento" : "contrato";

        let docRef = "";
        if (document_type === "proposal") {
          const { data: p } = await supabase.from("proposals").select("proposal_number, title").eq("id", document_id).maybeSingle();
          docRef = p?.proposal_number || p?.title || "";
        } else if (document_type === "quote") {
          const { data: q } = await supabase.from("quotes").select("quote_number").eq("id", document_id).maybeSingle();
          docRef = q?.quote_number || "";
        } else {
          const { data: c } = await supabase.from("client_contracts").select("contract_number").eq("id", document_id).maybeSingle();
          docRef = c?.contract_number || "";
        }

        await maybeNotify("client_question", {
          title: `💬 Dúvida sobre ${docLabel}`,
          message: `O cliente ${clientName} tem uma dúvida sobre a ${docLabel} ${docRef}: "${safeMessage}"`,
          priority: "high",
          link: document_type === "proposal" ? `/proposals` : document_type === "quote" ? `/quotes` : `/client-contracts`,
          entity_type: document_type,
          entity_id: document_id,
        }, { column: filterCol as "proposal_id" | "quote_id" | "contract_id", id: document_id });

        // Log the question (reuse resolved portalUserId)
        await supabase.from("client_portal_access_log").insert({
          portal_user_id: portalUserId,
          document_type,
          document_id,
          action: "question",
        });

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      case "log_view": {
        const { document_type, document_id } = params;
        if (!document_type || !document_id) {
          return new Response(JSON.stringify({ error: "document_type and document_id required" }), { status: 400, headers: corsHeaders });
        }

        // Mapa explícito em vez do ternário anterior: com o ternário, o `else`
        // era "contract_id", por isso um document_type novo (direct_sale)
        // cairia silenciosamente na coluna do contrato. Os 3 mapeamentos
        // anteriores mantêm-se exactamente iguais, incluindo o fallback para
        // "contract_id" de qualquer valor não reconhecido (que continua a não
        // resolver nenhum portal user e a devolver forbidden()).
        const DOC_TYPE_COLUMN: Record<string, "proposal_id" | "quote_id" | "contract_id" | "direct_sale_id"> = {
          proposal: "proposal_id",
          quote: "quote_id",
          contract: "contract_id",
          direct_sale: "direct_sale_id",
        };
        const filterCol = DOC_TYPE_COLUMN[document_type as string] ?? "contract_id";

        // resolveAuthorizedPortalUserId covers both direct (proposal/quote/contract_id)
        // and entity-scoped access. Returns null when the caller has no access.
        const portalUserId = await resolveAuthorizedPortalUserId(filterCol as any, document_id);
        if (!portalUserId) return forbidden();

        await supabase.from("client_portal_access_log").insert({
          portal_user_id: portalUserId,
          document_type,
          document_id,
          action: "viewed",
        });

        await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
        await supabase.from("client_portal_users")
          .update({ portal_status: "viewed", last_login_at: new Date().toISOString() })
          .eq("id", portalUserId)
          .eq("portal_status", "sent");


        // H7 — correct label for all document types.
        // Mapa explícito pelo mesmo motivo do DOC_TYPE_COLUMN acima: com o
        // ternário anterior o `else` era "contrato", por isso um
        // document_type novo (direct_sale) produzia "Cliente visualizou
        // contrato". Os 3 rótulos anteriores mantêm-se exactamente iguais,
        // incluindo o fallback para "contrato" de qualquer valor não
        // reconhecido (que, tal como antes, nem chega aqui — o filterCol
        // cai em contract_id e a resolução devolve forbidden()).
        const DOC_TYPE_LABEL: Record<string, string> = {
          proposal: "proposta",
          quote: "orçamento",
          contract: "contrato",
          direct_sale: "venda direta",
        };
        const docLabel = DOC_TYPE_LABEL[document_type as string] ?? "contrato";

        await maybeNotify(`client_viewed_${document_type}`, {
          title: `Cliente visualizou ${docLabel}`,
          message: `O cliente ${clientName} visualizou um(a) ${docLabel} no portal.`,
          priority: "low",
        }, { column: filterCol as "proposal_id" | "quote_id" | "contract_id" | "direct_sale_id", id: document_id });

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // Dados da Venda Direta para o portal do cliente.
      //
      // ATENÇÃO: esta função corre com service_role, logo a RLS de
      // direct_sale_lines ("Client can view own direct sale lines",
      // migration 20261201110000) NÃO se aplica aqui. O filtro
      // visible_to_client = true tem de ser explícito — sem ele, as linhas
      // internas da venda direta chegavam ao cliente.
      //
      // direct_sale_lines tem cost_price e margem_percent com o mesmo
      // significado interno que quote_lines, por isso as linhas passam pelo
      // mesmo stripCosts (as outras duas colunas da lista não existem nesta
      // tabela; o helper ignora as que faltam).
      case "get_direct_sale_data": {
        const { direct_sale_id } = params;
        if (!direct_sale_id) {
          return new Response(JSON.stringify({ error: "direct_sale_id required" }), { status: 400, headers: corsHeaders });
        }
        if (!(await assertOwnership("direct_sale_id", direct_sale_id))) return forbidden();

        const { data: directSale } = await supabase
          .from("direct_sales")
          // Colunas nomeadas de propósito (nunca select("*")): o cabeçalho tem
          // campos que não dizem respeito ao cliente (client_contract_id,
          // assigned_to, invoice_*, search_text, ...).
          .select(
            // `notes` NÃO entra: é o campo interno do comercial — a própria UI
            // diz "Nunca são mostradas ao cliente" (translations/directSales).
            // O que o cliente pode ver é `client_notes`.
            "id, sale_number, title, description, status, client_notes, subtotal, total, iva_rate, currency, valid_until, sent_at, accepted_at, rejected_at, proforma_number, proforma_issued_at, organization_id",
          )
          .eq("id", direct_sale_id)
          .maybeSingle();

        const { data: saleLines } = await supabase
          .from("direct_sale_lines")
          .select("*")
          .eq("direct_sale_id", direct_sale_id)
          // Obrigatório — ver comentário acima (service_role ignora a RLS).
          .eq("visible_to_client", true)
          .order("ordem", { ascending: true });

        return new Response(
          JSON.stringify({
            direct_sale: directSale,
            lines: (saleLines || []).map((l: any) => stripCosts(l)),
          }),
          { headers: corsHeaders },
        );
      }

      // Aceitação da Venda Direta no portal. Espelha sign_proposal na parte
      // que é comum (OTP antes de qualquer escrita, prova de aceitação,
      // portal_status, notificação), SEM nada do fluxo pesado de propostas:
      // não há selecção de orçamentos, não há stage de pipeline e não há
      // record_proposal_decision.
      //
      // A Encomenda Cliente (Fase 5) é criada por rpc_create_direct_sale_order,
      // e NÃO por inserts encadeados aqui como faz sign_proposal: cada chamada
      // PostgREST é a sua própria transação, e um contrato criado sem a
      // promoção a 'signed' seria uma encomenda invisível e sem stock deduzido.
      // A RPC é uma transação real — ou nasce tudo, ou não nasce nada.
      case "accept_direct_sale": {
        const { direct_sale_id, signature_image } = params;
        if (!direct_sale_id || !signature_image) {
          return new Response(JSON.stringify({ error: "direct_sale_id and signature_image required" }), { status: 400, headers: corsHeaders });
        }
        if (!(await assertOwnership("direct_sale_id", direct_sale_id))) return forbidden();
        // B1 — atomically claim OTP BEFORE any sign-side mutation
        {
          const otpClaim = await consumeVerifiedOtp("direct_sale", direct_sale_id, "direct_sale_acceptance");
          if (!otpClaim.ok) {
            return new Response(
              JSON.stringify({ error: "otp_required", message: "OTP inválido, expirado ou já utilizado. Peça um novo código." }),
              { status: 403, headers: corsHeaders },
            );
          }
        }

        const now = new Date().toISOString();
        await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
        await withRetryResult(() => supabase.from("direct_sales").update({
          status: "aceite",
          accepted_at: now,
          signature_image,
          acceptance_ip: detectedIp,
          acceptance_user_agent: req.headers.get("user-agent") || null,
        }).eq("id", direct_sale_id));

        await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
        await withRetryResult(() => supabase.from("client_portal_users")
          .update({ portal_status: "signed" })
          .eq("auth_user_id", user.id)
          .eq("direct_sale_id", direct_sale_id));

        // Fase 5 — Encomenda Cliente. Fail-soft, como o bloco equivalente de
        // sign_proposal: a venda JÁ está aceite e a proforma JÁ foi numerada
        // pelo trigger, por isso uma falha aqui não pode devolver erro ao
        // cliente nem desfazer a aceitação. A RPC é idempotente, portanto o
        // caso falhado recupera-se voltando a chamá-la para a mesma venda.
        let createdContractId: string | null = null;
        try {
          const { data: orderContract, error: orderError } = await supabase
            .rpc("rpc_create_direct_sale_order", { p_direct_sale_id: direct_sale_id });
          if (orderError) {
            console.error("accept_direct_sale: create client order failed:", orderError);
          } else {
            createdContractId = (orderContract as { id?: string } | null)?.id ?? null;
          }
        } catch (e) {
          console.error("accept_direct_sale: create client order threw:", e);
        }

        const { data: acceptedSale } = await supabase.from("direct_sales").select("sale_number, title").eq("id", direct_sale_id).maybeSingle();
        const orderNote = createdContractId ? " Encomenda de cliente criada." : "";
        await maybeNotify("client_accepted_direct_sale", {
          title: "🎉 Venda direta aceite no portal!",
          message: `O cliente ${clientName} aceitou a venda direta ${acceptedSale?.sale_number || acceptedSale?.title || ""}!${orderNote}`,
          priority: "urgent",
          link: `/direct-sales`,
        }, { column: "direct_sale_id", id: direct_sale_id });

        return new Response(JSON.stringify({ success: true, contract_id: createdContractId }), { headers: corsHeaders });
      }

      // Rejeição da Venda Direta no portal. O molde é o reject_proposal: tal
      // como ele, NÃO exige OTP — só posse do documento. A prova forte (SMS)
      // é para o compromisso (aceitar/assinar); recusar não cria obrigação
      // nenhuma e exigir código aí só serviria para prender o cliente a um
      // documento que ele não quer.
      //
      // Do molde ficam de fora, de propósito:
      //   - a cascata para `quotes` (uma venda direta não tem orçamentos);
      //   - o resolveProposalStageId (direct_sales não tem stage_id);
      //   - o record_proposal_decision (é um snapshot de proposta).
      // Também não se mexe em client_portal_users.portal_status, exactamente
      // como o reject_proposal: esse campo só avança para "signed" nos fluxos
      // de assinatura/aceitação e não tem valor de "rejeitado" (a coluna é
      // NOT NULL com default 'sent' e é o que o republish repõe).
      case "reject_direct_sale": {
        const { direct_sale_id, reason_code, reason_text } = params;
        if (!direct_sale_id) {
          return new Response(JSON.stringify({ error: "direct_sale_id required" }), { status: 400, headers: corsHeaders });
        }
        if (!(await assertOwnership("direct_sale_id", direct_sale_id))) return forbidden();

        const safeReasonText = reason_text ? sanitizeReason(reason_text) : null;
        if (reason_text && !safeReasonText) {
          return new Response(JSON.stringify({ error: "Motivo deve ter entre 10 e 500 caracteres" }), { status: 400, headers: corsHeaders });
        }

        const now = new Date().toISOString();
        await supabase.rpc('set_audit_context', { p_user_id: null, p_source: 'portal' });
        await withRetryResult(() => supabase.from("direct_sales").update({
          status: "rejeitada",
          rejected_at: now,
          rejection_reason_code: reason_code || null,
          rejection_notes: safeReasonText,
        }).eq("id", direct_sale_id));

        const { data: rejSale } = await supabase.from("direct_sales").select("sale_number, title").eq("id", direct_sale_id).maybeSingle();
        await maybeNotify("client_rejected_direct_sale", {
          title: "Venda direta rejeitada no portal",
          message: `O cliente ${clientName} rejeitou a venda direta ${rejSale?.sale_number || rejSale?.title || ""}.${reason_code ? ` Motivo: ${reason_code}` : ""}`,
          priority: "high",
          link: `/direct-sales`,
        }, { column: "direct_sale_id", id: direct_sale_id });

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // Dados para gerar o PDF da PROFORMA da venda direta no browser do
      // cliente. Molde: get_proposal_pdf_data (validar → assertOwnership →
      // ler com service_role → devolver), pelo mesmo motivo de fundo: a RLS
      // do portal não dá acesso a anew_organizations nem às tabelas de
      // identificação do cliente (entidades, moradas, fiscal_entities), por
      // isso um gerador que fosse buscá-los directamente recebia vazio em
      // silêncio e produzia um documento sem emitente nem destinatário.
      //
      // Esta rota NÃO substitui o get_direct_sale_data (ecrã do portal), que
      // fica exactamente como está: é leitura adicional, só para o documento.
      //
      // Tal como aí, corre com service_role e por isso a RLS de
      // direct_sale_lines não se aplica — o filtro visible_to_client = true
      // é explícito e obrigatório, e as linhas passam pelo mesmo stripCosts.
      case "get_direct_sale_pdf_data": {
        const { direct_sale_id } = params;
        if (!direct_sale_id) {
          return new Response(JSON.stringify({ error: "direct_sale_id required" }), { status: 400, headers: corsHeaders });
        }
        if (!(await assertOwnership("direct_sale_id", direct_sale_id))) return forbidden();

        const { data: directSale } = await supabase
          .from("direct_sales")
          // Colunas nomeadas de propósito (nunca select("*")): só o que o
          // documento mostra, mais os ids necessários para resolver emitente
          // (organization_id) e destinatário (entity_id/client_id). Ficam de
          // fora os campos internos do cabeçalho (assigned_to, invoice_*,
          // client_contract_id, search_text, ...).
          .select(
            // client_notes entra porque o documento mostra-o (ProformaPDFDocument);
            // sem ele a proforma do portal sairia diferente da do CRM, para a
            // mesma venda. `notes` continua de fora — é o campo interno.
            "id, sale_number, title, description, status, client_notes, subtotal, total, iva_rate, currency, accepted_at, proforma_number, proforma_issued_at, organization_id, entity_id, client_id",
          )
          .eq("id", direct_sale_id)
          .maybeSingle();

        if (!directSale) {
          return new Response(JSON.stringify({ error: "Venda direta não encontrada" }), { status: 404, headers: corsHeaders });
        }

        // Sem número não há documento. O proforma_number é escrito pelo
        // trigger da BD quando o status passa a 'aceite'; até lá devolvemos
        // 404 em vez de um payload meio vazio que faria o frontend gerar uma
        // proforma sem número — um documento inválido é pior que um erro.
        if (!(directSale as any).proforma_number) {
          return new Response(JSON.stringify({ error: "Proforma ainda não emitida" }), { status: 404, headers: corsHeaders });
        }

        const saleOrgId = (directSale as any).organization_id || null;
        const saleEntityId = (directSale as any).entity_id || null;
        const saleClientId = (directSale as any).client_id || null;

        // Mesma junção de morada do useOrgHeaderData (src/components/contracts/
        // useOrgHeaderData.ts), para a proforma ler igual aos outros documentos.
        const joinAddress = (address: any): string | null => {
          if (!address || typeof address !== "object") return null;
          const joined = [address.street, address.number, address.postal_code, address.city]
            .map((value: unknown) => (value == null ? "" : String(value).trim()))
            .filter(Boolean)
            .join(", ");
          return joined || null;
        };

        // Logótipo como data URI base64. Mesmo racional do generateQuotePdfBlob
        // no CRM (:69-85): o gerador de PDF precisa dos bytes, não de uma URL.
        // Aqui é ainda mais necessário, porque quem vai renderizar é o browser
        // de um cliente do portal. Timeout curto e degradação para null — uma
        // imagem lenta ou em falta nunca pode impedir a emissão da proforma.
        const fetchLogoAsDataUri = async (url: string | null): Promise<string | null> => {
          if (!url) return null;
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            if (!response.ok) return null;

            const contentType = response.headers.get("content-type") || "image/png";
            if (!contentType.startsWith("image/")) return null;

            const bytes = new Uint8Array(await response.arrayBuffer());
            // 2 MB: acima disto o payload do portal fica pesado e o logótipo
            // quase de certeza está mal configurado.
            if (bytes.byteLength > 2_000_000) return null;

            let binary = "";
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            return `data:${contentType};base64,${btoa(binary)}`;
          } catch (logoError) {
            console.error("proforma: logo fetch failed", logoError);
            return null;
          }
        };

        // NIF em claro a partir de fiscal_entities.nif_encrypted — o mesmo
        // caminho (e só esse) da edge function nif-reveal; a coluna legada
        // `nif` nunca é lida. Falha sempre em silêncio para null: a chave
        // pode não estar configurada e um PDF sem NIF é melhor que um erro.
        let nifKey: Uint8Array | null = null;
        let nifKeyResolved = false;
        const revealPrimaryNif = async (entityId: string | null): Promise<string | null> => {
          if (!entityId) return null;
          const { data: fiscalLink } = await supabase
            .from("anew_entity_fiscal_entities")
            .select("fiscal_entity_id")
            .eq("entity_id", entityId)
            .eq("is_primary", true)
            .limit(1)
            .maybeSingle();
          const fiscalEntityId = (fiscalLink as any)?.fiscal_entity_id;
          if (!fiscalEntityId) return null;

          const { data: fiscalEntity } = await supabase
            .from("fiscal_entities")
            .select("nif_encrypted")
            .eq("id", fiscalEntityId)
            .maybeSingle();
          const encryptedNif = (fiscalEntity as any)?.nif_encrypted;
          if (!encryptedNif) return null;

          if (!nifKeyResolved) {
            nifKeyResolved = true;
            try {
              nifKey = deriveKeyFromEnv("NIF_ENC_KEY", "AES-GCM");
            } catch (keyError) {
              console.error(
                "get_direct_sale_pdf_data: NIF decryption key unavailable:",
                keyError instanceof Error ? keyError.message : keyError,
              );
            }
          }
          const key = nifKey;
          if (!key) return null;

          try {
            return await decryptNif(encryptedNif, key);
          } catch {
            console.error(`get_direct_sale_pdf_data: failed to decrypt nif for fiscal_entity ${fiscalEntityId}`);
            return null;
          }
        };

        // Empresa emitente. anew_organizations não tem colunas de NIF nem de
        // morada: a resolução canónica é a do useOrgHeaderData —
        //   morada: anew_org_addresses (fiscal primeiro, valid_to null) →
        //           anew_entity_addresses (primária) → metadata.address
        //   NIF:    fiscal_entities (link primário) → metadata.vat/metadata.nif
        const loadCompany = async () => {
          if (!saleOrgId) return null;
          const { data: org } = await supabase
            .from("anew_organizations")
            .select("id, name, entity_id, logo_url, metadata")
            .eq("id", saleOrgId)
            .maybeSingle();
          if (!org) return null;

          const meta = ((org as any).metadata || {}) as Record<string, any>;
          const orgEntityId = (org as any).entity_id || null;

          const { data: orgAddresses } = await supabase
            .from("anew_org_addresses")
            .select("anew_addresses(street, number, postal_code, city)")
            .eq("org_id", saleOrgId)
            .is("valid_to", null)
            .order("is_fiscal", { ascending: false })
            .limit(1);
          let address = joinAddress((orgAddresses as any)?.[0]?.anew_addresses);

          if (!address && orgEntityId) {
            const { data: orgEntityAddresses } = await supabase
              .from("anew_entity_addresses")
              .select("anew_addresses(street, number, postal_code, city)")
              .eq("entity_id", orgEntityId)
              .order("is_primary", { ascending: false })
              .limit(1);
            address = joinAddress((orgEntityAddresses as any)?.[0]?.anew_addresses);
          }
          if (!address && meta.address) address = String(meta.address);

          const nif = (await revealPrimaryNif(orgEntityId)) || meta.vat || meta.nif || null;

          return {
            name: (org as any).name || null,
            // `vat`, não `nif`: é o nome do campo no contrato que o frontend já
            // tem (ProformaPdfCompany em generateProformaPdfBlob.ts e
            // ProformaPDFDocument, que lê company.vat). Na BD chama-se nif; o
            // contrato do documento chama-lhe vat. Manter os dois alinhados.
            vat: nif || null,
            address: address || null,
            // Data URI base64, NÃO a URL. O @react-pdf/renderer a correr no
            // browser do cliente do portal não consegue carregar a URL crua de
            // forma fiável, e falha em silêncio — o PDF sai sem logótipo e
            // ninguém percebe porquê. Convertido aqui, do lado do servidor,
            // onde não há CORS. Se falhar, vai null e o documento sai sem
            // logótipo: nunca impedir a emissão da proforma por causa de uma
            // imagem.
            logo_url: await fetchLogoAsDataUri((org as any).logo_url || null),
          };
        };

        // Cliente destinatário. entity_id é a fonte; client_id (ficha de
        // cliente da organização) é só o caminho alternativo para lá chegar,
        // como já faz o resto do ficheiro (ver sign_proposal / resolveDocEntity).
        const loadClient = async () => {
          let clientEntityId = saleEntityId;
          if (!clientEntityId && saleClientId) {
            const { data: anewClient } = await supabase
              .from("anew_clients")
              .select("entity_id")
              .eq("id", saleClientId)
              .maybeSingle();
            clientEntityId = (anewClient as any)?.entity_id || null;
          }
          if (!clientEntityId) return null;

          const { data: entity } = await supabase
            .from("anew_entities")
            .select("id, display_name, first_name, last_name")
            .eq("id", clientEntityId)
            .maybeSingle();
          if (!entity) return null;

          const { data: entityAddresses } = await supabase
            .from("anew_entity_addresses")
            .select("anew_addresses(street, number, postal_code, city)")
            .eq("entity_id", clientEntityId)
            .order("is_primary", { ascending: false })
            .limit(1);

          const displayName = (entity as any).display_name
            || [(entity as any).first_name, (entity as any).last_name].filter(Boolean).join(" ")
            || null;

          return {
            name: displayName || null,
            // `vat` pelo mesmo motivo do bloco da empresa, acima.
            vat: await revealPrimaryNif(clientEntityId),
            address: joinAddress((entityAddresses as any)?.[0]?.anew_addresses),
          };
        };

        // Lista branca, não select("*") + stripCosts. O stripCosts é uma lista
        // NEGRA: qualquer coluna interna acrescentada a direct_sale_lines no
        // futuro passaria a ser enviada ao cliente no dia em que fosse criada,
        // sem ninguém dar por isso. Estas são exactamente as 10 colunas que o
        // documento usa (generateProformaPdfBlob.ts:273-275). O stripCosts
        // continua aplicado a seguir, como rede de segurança.
        const { data: saleLines } = await supabase
          .from("direct_sale_lines")
          .select(
            "id, descricao_snapshot, qt, unidade, retail_price_unit, iva_percent, total_sem_iva, total_com_iva, total_com_desconto, ordem",
          )
          // Obrigatório — ver comentário acima (service_role ignora a RLS).
          .eq("visible_to_client", true)
          .eq("direct_sale_id", direct_sale_id)
          .order("ordem", { ascending: true });

        const company = await loadCompany();
        const client = await loadClient();

        return new Response(
          JSON.stringify({
            direct_sale: directSale,
            lines: (saleLines || []).map((l: any) => stripCosts(l)),
            company,
            client,
          }),
          { headers: corsHeaders },
        );
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders });
    }
  } catch (err: any) {
    console.error("Error in client-portal-action:", err);
    await captureError(err, { function: "client-portal-action" });
    // Mensagem genérica, nunca err.message: esta função passou a manipular NIF
    // decifrado (get_direct_sale_pdf_data), e a nif-reveal tem a mesma regra
    // escrita à mão — "never echo it raw, since this handles decrypted NIF
    // data". O erro real vai inteiro para o console e para o Sentry acima.
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: corsHeaders });
  }
});
