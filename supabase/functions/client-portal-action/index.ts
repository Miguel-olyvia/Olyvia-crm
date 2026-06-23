import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";
import { isNotificationEnabled } from "../_shared/notificationSettings.ts";

const requestSchema = z.object({
  action: z.string(),
  params: z.record(z.unknown()).optional(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
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
    const { data: { user }, error: userError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
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
      .select("id, organization_id, created_by, client_id, proposal_id, quote_id, contract_id")
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
      column: "proposal_id" | "quote_id" | "contract_id",
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
    async function assertOwnership(column: "proposal_id" | "quote_id" | "contract_id", id: string): Promise<boolean> {
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
      column: "proposal_id" | "quote_id" | "contract_id",
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
      referenceType: "proposal" | "contract",
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


    // Server-side IP detection (do not trust client-provided IP)
    const xff = req.headers.get("x-forwarded-for") || "";
    const detectedIp = xff.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;

    // Validate rejection reason text (10..500 chars, basic HTML strip)
    function sanitizeReason(text: unknown): string | null {
      if (typeof text !== "string") return null;
      const stripped = text.replace(/<[^>]*>/g, "").trim();
      if (stripped.length < 10 || stripped.length > 500) return null;
      return stripped;
    }

    /**
     * Resolve the commercial responsible for this portal user.
     * Priority: client.assigned_to > deal.assigned_to > portalUser.created_by
     */
    async function resolveCommercialId(): Promise<string | null> {
      // 1) Check anew_clients.assigned_to via portal user's client_id
      if (portalUser.client_id) {
        const { data: client } = await supabase
          .from("anew_clients")
          .select("assigned_to")
          .eq("id", portalUser.client_id)
          .maybeSingle();
        if (client?.assigned_to) return client.assigned_to;
      }

      // 2) Check deal.assigned_to via proposal or quote
      const dealLookupId = portalUser.proposal_id || portalUser.quote_id;
      if (dealLookupId) {
        const table = portalUser.proposal_id ? "proposals" : "quotes";
        const { data: doc } = await supabase
          .from(table)
          .select("deal_id")
          .eq("id", dealLookupId)
          .maybeSingle();
        if (doc?.deal_id) {
          const { data: deal } = await supabase
            .from("deals")
            .select("assigned_to, client_id")
            .eq("id", doc.deal_id)
            .maybeSingle();
          // 2a) deal's client assigned_to
          if (deal?.client_id) {
            const { data: dealClient } = await supabase
              .from("anew_clients")
              .select("assigned_to")
              .eq("id", deal.client_id)
              .maybeSingle();
            if (dealClient?.assigned_to) return dealClient.assigned_to;
          }
          // 2b) deal.assigned_to
          if (deal?.assigned_to) return deal.assigned_to;
        }
      }

      // 3) Fallback to portal access creator
      return portalUser.created_by || null;
    }

    // Resolve once per request — convert internal ID to auth UUID for notifications
    const commercialInternalId = await resolveCommercialId();
    let commercialAuthId: string | null = null;
    if (commercialInternalId) {
      const { data: anewUser } = await supabase
        .from("anew_users")
        .select("auth_user_id")
        .eq("id", commercialInternalId)
        .maybeSingle();
      commercialAuthId = anewUser?.auth_user_id || null;
    }

    /** Helper: insert notification only if enabled for this org */
    async function maybeNotify(type: string, payload: Record<string, any>) {
      if (!commercialAuthId) return;
      const enabled = await isNotificationEnabled(supabase, portalUser.organization_id, type);
      if (!enabled) return;
      await supabase.from("notifications").insert({
        user_id: commercialAuthId,
        organization_id: portalUser.organization_id,
        type,
        kind: "notification",
        ...payload,
      });
    }

    switch (action) {
      case "accept_quote": {
        const { quote_id } = params;
        if (!quote_id) return new Response(JSON.stringify({ error: "quote_id required" }), { status: 400, headers: corsHeaders });
        if (!(await assertOwnership("quote_id", quote_id))) return forbidden();

        // Update quote status
        await supabase.from("quotes").update({ estado: "aceite" }).eq("id", quote_id);

        // Update portal status to signed for this quote
        await supabase.from("client_portal_users")
          .update({ portal_status: "signed" })
          .eq("auth_user_id", user.id)
          .eq("quote_id", quote_id);

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
                await supabase.from("proposal_items").insert(proposalItems);
              }

              // Update pipeline_links
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
        });

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

        await supabase.from("quotes").update({
          estado: "rejeitado",
          client_notes: safeReason,
        }).eq("id", quote_id);

        const { data: rejQuote } = await supabase.from("quotes").select("quote_number").eq("id", quote_id).maybeSingle();
        await maybeNotify("client_rejected_quote", {
          title: "Orçamento rejeitado no portal",
          message: `O cliente ${clientName} rejeitou o orçamento ${rejQuote?.quote_number || ""}.${safeReason ? ` Motivo: ${safeReason}` : ""}`,
          priority: "high",
        });

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
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
          await supabase.from("quotes").update({ estado: "aceite" }).in("id", ownedQuoteIds);
          await supabase.from("quotes").update({ estado: "rejeitado" }).eq("proposal_id", proposal_id).not("id", "in", `(${ownedQuoteIds.join(",")})`);
        }

        const now = new Date().toISOString();
        await supabase.from("proposals").update({
          status: "accepted",
          accepted_at: now,
          signature_image,
          acceptance_ip: detectedIp,
          acceptance_user_agent: req.headers.get("user-agent") || null,
        }).eq("id", proposal_id);

        await supabase.from("client_portal_users")
          .update({ portal_status: "signed" })
          .eq("auth_user_id", user.id)
          .eq("proposal_id", proposal_id);

        // ── Auto-create contract from accepted proposal ──
        let createdContractId: string | null = null;
        try {
          const { data: existingContract } = await supabase
            .from("client_contracts")
            .select("id")
            .eq("proposal_id", proposal_id)
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

              const { data: pi } = await supabase.from("proposal_items").select("*").eq("proposal_id", proposal_id).order("sort_order");
              let contractValue = fullProposal.value || 0;
              if (pi && pi.length > 0) {
                contractValue = pi.reduce((s: number, i: any) => s + (Number(i.total) || (Number(i.quantity) * Number(i.unit_price) * (1 + (Number(i.vat_rate) || 0) / 100))), 0);
              }
              if ((!pi || pi.length === 0) && linkedQuoteId) {
                const { data: ql } = await supabase.from("quote_lines").select("total_com_iva").eq("quote_id", linkedQuoteId);
                if (ql && ql.length > 0) {
                  contractValue = ql.reduce((s: number, l: any) => s + (Number(l.total_com_iva) || 0), 0);
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
                const { data: updatedLinks, error: linkUpdateError } = await supabase.from("pipeline_links")
                  .update({ contract_id: contract.id } as any)
                  .eq("proposal_id", proposal_id)
                  .eq("status", "active")
                  .select("id");

                if (!linkUpdateError && (!updatedLinks || updatedLinks.length === 0)) {
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
        });

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
        await supabase.from("proposals").update({
          status: "rejected",
          rejected_at: now,
          rejection_reason_code: reason_code || null,
          rejection_notes: safeReasonText,
        }).eq("id", proposal_id);

        const { data: rejProp } = await supabase.from("proposals").select("proposal_number, title").eq("id", proposal_id).maybeSingle();
        await maybeNotify("client_rejected_proposal", {
          title: "Proposta rejeitada no portal",
          message: `O cliente ${clientName} rejeitou a proposta ${rejProp?.proposal_number || rejProp?.title || ""}.${reason_code ? ` Motivo: ${reason_code}` : ""}`,
          priority: "high",
          link: `/proposals`,
        });

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
        await supabase.from("client_contracts").update({
          status: "signed",
          signature_image,
          signature_date: now,
          signature_ip: detectedIp,
          accepted_at: now,
          signed_by_name: clientName,
        }).eq("id", contract_id);

        await supabase.from("client_portal_users")
          .update({ portal_status: "signed" })
          .eq("auth_user_id", user.id)
          .eq("contract_id", contract_id);

        const { data: signedContract } = await supabase.from("client_contracts").select("contract_number").eq("id", contract_id).maybeSingle();
        await maybeNotify("client_signed_contract", {
          title: "🎉 Contrato assinado no portal!",
          message: `O cliente ${clientName} assinou o contrato ${signedContract?.contract_number || ""}!`,
          priority: "urgent",
          link: `/client-contracts`,
        });

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
        await supabase.from("client_contracts").update({
          status: "rejected",
          rejected_at: now,
          rejection_reason: reason_code || null,
          rejection_notes: safeReasonText,
        }).eq("id", contract_id);

        const { data: rejContract } = await supabase.from("client_contracts").select("contract_number").eq("id", contract_id).maybeSingle();
        await maybeNotify("client_rejected_contract", {
          title: "Contrato rejeitado no portal",
          message: `O cliente ${clientName} rejeitou o contrato ${rejContract?.contract_number || ""}.${reason_code ? ` Motivo: ${reason_code}` : ""}`,
          priority: "high",
          link: `/client-contracts`,
        });

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
        });

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

        const filterCol = document_type === "proposal" ? "proposal_id" : document_type === "quote" ? "quote_id" : "contract_id";

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

        await supabase.from("client_portal_users")
          .update({ portal_status: "viewed", last_login_at: new Date().toISOString() })
          .eq("id", portalUserId)
          .eq("portal_status", "sent");


        // H7 — correct label for all three document types
        const docLabel = document_type === "proposal" ? "proposta"
          : document_type === "quote" ? "orçamento"
          : "contrato";

        await maybeNotify(`client_viewed_${document_type}`, {
          title: `Cliente visualizou ${docLabel}`,
          message: `O cliente ${clientName} visualizou um(a) ${docLabel} no portal.`,
          priority: "low",
        });

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders });
    }
  } catch (err: any) {
    console.error("Error in client-portal-action:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
