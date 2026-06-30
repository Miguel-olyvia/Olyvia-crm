import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCallerIdentity, validateOrgScope, authErrorResponse } from "../_shared/auth.ts";
import { z } from "npm:zod";

import { corsHeaders } from "../_shared/cors.ts";

const requestSchema = z.object({
  action: z.string(),
  payload: z.record(z.unknown()).optional(),
});

// ── Sub-schemas por ação ─────────────────────────────────────────────────────
const uuid = z.string().uuid();
const optionalUuid = z.string().uuid().optional();
const optionalString = z.string().min(1).optional();

const payloadSchemas: Record<string, z.ZodTypeAny> = {
  create_deal_from_lead: z.object({
    lead_id: uuid,
    organization_id: uuid,
    root_organization_id: optionalUuid,
    title: optionalString,
    created_by: optionalString,
    entity_id: optionalUuid,
  }),
  create_quote_from_deal: z.object({
    deal_id: uuid,
    organization_id: uuid,
    root_organization_id: optionalUuid,
    title: optionalString,
    created_by: optionalString,
  }),
  create_proposal_from_quote: z.object({
    quote_id: uuid,
    organization_id: uuid,
    root_organization_id: optionalUuid,
    deal_id: optionalUuid,
    title: optionalString,
    created_by: optionalString,
  }),
  create_proposal_from_deal: z.object({
    deal_id: uuid,
    organization_id: uuid,
    root_organization_id: optionalUuid,
    entity_id: optionalUuid,
    title: optionalString,
    created_by: optionalString,
  }),
  create_quote_from_proposal: z.object({
    proposal_id: uuid,
    organization_id: uuid,
    root_organization_id: optionalUuid,
    deal_id: optionalUuid,
    created_by: optionalString,
  }),
  create_contract_from_quote: z.object({
    quote_id: optionalUuid,
    proposal_id: optionalUuid,
    organization_id: uuid,
    root_organization_id: optionalUuid,
    client_id: optionalUuid,
    created_by: optionalString,
  }),
  finalize_contract: z.object({
    contract_id: uuid,
    user_id: optionalString,
  }),
  propagate_rejection: z.object({
    entity_type: z.enum(["proposal", "quote", "contract"]),
    entity_id: uuid,
    reason: optionalString,
  }),
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Auth: resolve caller identity ──
    let caller;
    try {
      caller = await resolveCallerIdentity(req, supabase);
    } catch (e) {
      return authErrorResponse(e, corsHeaders);
    }

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ success: false, message: "Invalid request", details: parsed.error.issues }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { action } = parsed.data;

    // ── Validação do payload por ação ────────────────────────────────────────
    const payloadSchema = payloadSchemas[action];
    if (!payloadSchema) {
      return new Response(
        JSON.stringify({ success: false, message: `Ação desconhecida: ${action}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const payloadParsed = payloadSchema.safeParse(parsed.data.payload ?? {});
    if (!payloadParsed.success) {
      return new Response(
        JSON.stringify({ success: false, message: "Payload inválido para a ação", details: payloadParsed.error.issues }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const payload = payloadParsed.data;

    console.log("Pipeline automation:", action, payload, "caller:", caller.anewUserId);

    // ── Scope check: validate caller has access to the organization ──
    const orgId = payload?.organization_id;
    if (orgId) {
      const hasAccess = await validateOrgScope(supabase, caller, orgId);
      if (!hasAccess) {
        return new Response(
          JSON.stringify({ success: false, message: "Sem permissão para esta organização" }),
          { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    const results: { success: boolean; message: string; created_id?: string } = {
      success: false,
      message: "",
    };

    // ─── Helper: Upsert pipeline_links ───────────────────────
    async function upsertPipelineLink(field: string, fieldId: string, updates: Record<string, any>) {
      const { data: existing } = await supabase
        .from("pipeline_links")
        .select("id")
        .eq(field, fieldId)
        .eq("status", "active")
        .maybeSingle();

      if (existing) {
        await supabase.from("pipeline_links").update(updates).eq("id", existing.id);
      } else {
        await supabase.from("pipeline_links").insert({ [field]: fieldId, ...updates });
      }
    }

    async function findExistingQuoteForDeal(dealId: string) {
      const { data } = await supabase
        .from("quotes")
        .select("id")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return data?.id || null;
    }

    async function findExistingProposalForDeal(dealId: string) {
      const { data } = await supabase
        .from("proposals")
        .select("id")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return data?.id || null;
    }

    async function findExistingProposalForQuote(quoteId: string) {
      const { data } = await supabase
        .from("pipeline_links")
        .select("proposal_id")
        .eq("quote_id", quoteId)
        .eq("status", "active")
        .not("proposal_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.proposal_id) return data.proposal_id;

      const { data: quote } = await supabase
        .from("quotes")
        .select("proposal_id")
        .eq("id", quoteId)
        .maybeSingle();

      return quote?.proposal_id || null;
    }

    async function findExistingQuoteForProposal(proposalId: string) {
      const { data } = await supabase
        .from("quotes")
        .select("id")
        .eq("proposal_id", proposalId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return data?.id || null;
    }

    type ActorSource = { source: string; value?: string | null };

    async function normalizeBusinessActorId(value: string | null | undefined, context: string): Promise<string | null> {
      if (!value || value === "service_role") return null;
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(value)) return null;

      const { data: asBusinessUser, error: businessError } = await supabase
        .from("anew_users")
        .select("id")
        .eq("id", value)
        .maybeSingle();
      if (businessError) throw businessError;
      if (asBusinessUser?.id) return asBusinessUser.id;

      const { data: authMatches, error: authError } = await supabase
        .from("anew_users")
        .select("id")
        .eq("auth_user_id", value)
        .limit(2);
      if (authError) throw authError;

      if ((authMatches || []).length === 1) return authMatches![0].id;
      if ((authMatches || []).length > 1) {
        throw new Error(`Actor ambíguo para ${context}: payload/source mapeia para múltiplos utilizadores de negócio`);
      }

      return null;
    }

    async function resolveCreatedByForAction(actionName: string, payloadCreatedBy: string | null | undefined, inheritedActors: ActorSource[] = []): Promise<string> {
      // Fase A: backend-first e compatível.
      // Actor do registo criado: preferir caller.anewUserId quando há JWT de utilizador.
      // Actor técnico do workflow: triggered_by/user_id continuam auth audit por defeito e não entram aqui.
      // Actor herdado da entidade origem: só aceite se já for business id válido ou mapeável sem ambiguidade.
      if (!caller.isServiceRole && caller.anewUserId && caller.anewUserId !== "service_role") {
        return caller.anewUserId;
      }

      for (const inherited of inheritedActors) {
        const normalized = await normalizeBusinessActorId(inherited.value, `${actionName}:${inherited.source}`);
        if (normalized) return normalized;
      }

      const normalizedPayloadActor = await normalizeBusinessActorId(payloadCreatedBy, `${actionName}:payload.created_by`);
      if (normalizedPayloadActor) return normalizedPayloadActor;

      throw new Error(`${actionName}: não foi possível resolver created_by de negócio sem heurística`);
    }

    // ─── ACTION: Create Deal from Lead ───────────────────────
    if (action === "create_deal_from_lead") {
      const { lead_id, title, organization_id, root_organization_id, created_by, entity_id } = payload;

      // 1. Load the lead to check entity_id
      const { data: lead } = await supabase.from("anew_leads").select("*").eq("id", lead_id).single();
      if (!lead) throw new Error("Lead not found");

      const resolvedCreatedBy = await resolveCreatedByForAction("create_deal_from_lead", created_by, [
        { source: "lead.created_by", value: lead.created_by },
      ]);

      // 2. Ensure lead has an entity_id — create one if missing
      let resolvedEntityId = entity_id || lead.entity_id;
      if (!resolvedEntityId) {
        console.log("Lead has no entity_id, creating entity from field_values...");
        const fv = (lead.field_values || {}) as Record<string, string>;
        const firstName = fv.first_name || fv.nome || fv.name || "";
        const lastName = fv.last_name || fv.apelido || "";
        const displayName = `${firstName} ${lastName}`.trim() || "Lead sem nome";

        const { data: newEntity, error: entityErr } = await supabase
          .from("anew_entities")
          .insert({ type: "person", display_name: displayName, status: "active", created_by: resolvedCreatedBy })
          .select("id")
          .single();
        if (entityErr) throw entityErr;
        resolvedEntityId = newEntity.id;

        // Populate entity emails/phones from field_values
        const email = fv.email;
        const phone = fv.phone || fv.telefone;
        if (email) {
          await supabase.from("anew_entity_emails").insert({ entity_id: resolvedEntityId, email, is_primary: true });
        }
        if (phone) {
          await supabase.from("anew_entity_phones").insert({ entity_id: resolvedEntityId, phone_number: phone, is_primary: true });
        }

        // Create lead role
        await supabase.from("anew_entity_roles").insert({
          entity_id: resolvedEntityId,
          organization_id,
          role: "lead",
          status: "active",
          source_type: "lead",
          source_id: lead_id,
        });

        // Update lead with entity_id
        await supabase.from("anew_leads").update({ entity_id: resolvedEntityId }).eq("id", lead_id);
        console.log("Created entity", resolvedEntityId, "for lead", lead_id);
      }

      // Check if deal already exists for this lead
      const { data: existingDeal } = await supabase.from("deals")
        .select("id").eq("lead_id", lead_id).maybeSingle();

      let dealId: string;

      if (existingDeal) {
        // Deal already exists, just update entity_id if needed
        dealId = existingDeal.id;
        await supabase.from("deals").update({ entity_id: resolvedEntityId }).eq("id", dealId);
      } else {
        // Get default "Novo" stage (entry stage for deals)
        const { data: defaultStage } = await supabase
          .from("deal_stages")
          .select("id")
          .eq("name", "Novo")
          .maybeSingle();

        let stageId = defaultStage?.id;
        if (!stageId) {
          const { data: anyStage } = await supabase
            .from("deal_stages")
            .select("id")
            .order("order_index")
            .limit(1)
            .maybeSingle();
          if (!anyStage) throw new Error("No deal stages found");
          stageId = anyStage.id;
        }

        const { data: deal, error } = await supabase
          .from("deals")
          .insert({
            title: title || "Pedido de Proposta",
            lead_id,
            entity_id: resolvedEntityId,
            organization_id,
            root_organization_id: root_organization_id || organization_id,
            stage_id: stageId,
            created_by: resolvedCreatedBy,
            value: 0,
          })
          .select("id")
          .single();

        if (error) throw error;
        dealId = deal.id;
      }

      // Create/update pipeline link
      await upsertPipelineLink("lead_id", lead_id, {
        deal_id: dealId,
        organization_id,
        root_organization_id: root_organization_id || organization_id,
      });

      // 3. Trigger workflow: move lead to "proposta" stage and execute automations
      const { data: propostaStage } = await supabase
        .from("lead_workflow_stages")
        .select("id")
        .eq("name", "proposta")
        .or(`organization_id.eq.${organization_id},organization_id.is.null`)
        .order("organization_id", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (propostaStage?.id) {
        await supabase.from("anew_leads").update({
          workflow_stage_id: propostaStage.id,
          status: "qualified",
        }).eq("id", lead_id);

        // NOTE: We intentionally do NOT call execute-workflow here.
        // The deal was already created above, so the workflow's auto "create_deal_from_lead"
        // action would race and create a duplicate. The lead stage is already updated.
      }

      results.success = true;
      results.created_id = dealId;
      results.message = "Pedido de Proposta criado com sucesso";
    }

    // ─── ACTION: Create Quote from Deal ─────────────────────
    if (action === "create_quote_from_deal") {
      const { deal_id, organization_id, root_organization_id, created_by, title } = payload;

      const existingQuoteId = await findExistingQuoteForDeal(deal_id);
      if (existingQuoteId) {
        await upsertPipelineLink("deal_id", deal_id, {
          quote_id: existingQuoteId,
          organization_id,
          root_organization_id: root_organization_id || organization_id,
        });

        results.success = true;
        results.created_id = existingQuoteId;
        results.message = "Orçamento já existente reutilizado";
        return new Response(JSON.stringify(results), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch deal to get entity_id
      const { data: dealData } = await supabase
        .from("deals")
        .select("entity_id, created_by")
        .eq("id", deal_id)
        .single();

      const resolvedCreatedBy = await resolveCreatedByForAction("create_quote_from_deal", created_by, [
        { source: "deal.created_by", value: dealData?.created_by },
      ]);

      const { data: quote, error } = await supabase
        .from("quotes")
        .insert({
          deal_id,
          organization_id,
          root_organization_id: root_organization_id || organization_id,
          created_by: resolvedCreatedBy,
          entity_id: dealData?.entity_id || null,
          estado: "rascunho",
          modelo_base: "manual",
          total: 0,
          subtotal: 0,
        })
        .select("id")
        .single();

      if (error) throw error;

      // ─── Copy deal values → quote ─────────────────────────
      try {
        let appliedTotals = false;
        const { data: fullDeal } = await supabase
          .from("deals")
          .select("title, value, description")
          .eq("id", deal_id)
          .single();

        const { data: dealNeeds } = await supabase
          .from("deal_needs")
          .select("id, title")
          .eq("deal_id", deal_id);

        if (dealNeeds && dealNeeds.length > 0) {
            const needTitleMap = Object.fromEntries(dealNeeds.map((need: any) => [need.id, need.title || "Geral"]));
          const needIds = dealNeeds.map((n: any) => n.id);
          const { data: needItems } = await supabase
            .from("deal_need_items")
              .select("deal_need_id, product_id, service_id, item_type, quantity, sort_order")
            .in("deal_need_id", needIds);

          if (needItems && needItems.length > 0) {
            // Collect product/service IDs for price lookup
            const productIds = needItems.filter((i: any) => i.product_id).map((i: any) => i.product_id);
            const serviceIds = needItems.filter((i: any) => i.service_id).map((i: any) => i.service_id);

            // Fetch product prices (retail) and names
            const priceMap: Record<string, { price: number; name: string }> = {};
            if (productIds.length > 0) {
              const { data: products } = await supabase
                .from("products")
                .select("id, name")
                .in("id", productIds);
              const { data: prices } = await supabase
                .from("product_prices")
                .select("product_id, price")
                .in("product_id", productIds)
                .eq("price_type", "retail");
              (products || []).forEach((p: any) => {
                priceMap[p.id] = { price: 0, name: p.name || "" };
              });
              (prices || []).forEach((pp: any) => {
                if (priceMap[pp.product_id]) priceMap[pp.product_id].price = pp.price || 0;
                else priceMap[pp.product_id] = { price: pp.price || 0, name: "" };
              });
            }

            // Fetch service names
            const serviceMap: Record<string, string> = {};
            if (serviceIds.length > 0) {
              const { data: services } = await supabase
                .from("services")
                .select("id, name")
                .in("id", serviceIds);
              (services || []).forEach((s: any) => { serviceMap[s.id] = s.name || ""; });
            }

            // Build quote_lines
            const quoteLines = needItems.map((item: any, idx: number) => {
              const isProduct = item.item_type === "product" && item.product_id;
              const priceInfo = isProduct ? priceMap[item.product_id] : null;
              const unitPrice = priceInfo?.price || 0;
              const qty = item.quantity || 1;
              const category = needTitleMap[item.deal_need_id] || "Geral";
              const descricao = isProduct
                ? (priceInfo?.name || "Produto")
                : (serviceMap[item.service_id] || "Serviço");
              const totalSemIva = unitPrice * qty;

              return {
                quote_id: quote.id,
                product_id: item.product_id || null,
                service_id: item.service_id || null,
                categoria: category,
                section_name: category,
                descricao_snapshot: descricao,
                qt: qty,
                custo_material_unit: unitPrice,
                custo_mao_obra_unit: 0,
                margem_percent: 0,
                iva_percent: 23,
                int_percent: 0,
                total_sem_iva: totalSemIva,
                total_com_iva: totalSemIva * 1.23,
                total_com_desconto: totalSemIva * 1.23,
                ordem: item.sort_order || idx,
              };
            });

            if (quoteLines.length > 0) {
              const { error: quoteLinesError } = await supabase.from("quote_lines").insert(quoteLines);
              if (quoteLinesError) throw quoteLinesError;

              // Update quote totals
              const subtotal = quoteLines.reduce((sum: number, l: any) => sum + (l.total_sem_iva || 0), 0);
              const total = quoteLines.reduce((sum: number, l: any) => sum + (l.total_com_iva || 0), 0);
              await supabase.from("quotes").update({ subtotal, total }).eq("id", quote.id);
              appliedTotals = true;
            }
          }
        }

        if (!appliedTotals && Number(fullDeal?.value || 0) > 0) {
          const fallbackSubtotal = Number(fullDeal?.value || 0);
          const fallbackCategory = fullDeal?.title || "Geral";
          const fallbackDescription = fullDeal?.description?.trim() || fullDeal?.title || "Valor manual do pedido";
          const fallbackLine = {
            quote_id: quote.id,
            categoria: fallbackCategory,
            section_name: fallbackCategory,
            descricao_snapshot: fallbackDescription,
            qt: 1,
            custo_material_unit: fallbackSubtotal,
            custo_mao_obra_unit: 0,
            margem_percent: 0,
            iva_percent: 23,
            int_percent: 0,
            total_sem_iva: fallbackSubtotal,
            total_com_iva: fallbackSubtotal * 1.23,
            total_com_desconto: fallbackSubtotal * 1.23,
            ordem: 0,
          };

          const { error: fallbackLineError } = await supabase.from("quote_lines").insert(fallbackLine);
          if (fallbackLineError) throw fallbackLineError;

          await supabase
            .from("quotes")
            .update({ subtotal: fallbackSubtotal, total: fallbackSubtotal * 1.23 })
            .eq("id", quote.id);
        }
      } catch (copyErr) {
        console.error("Error copying deal items to quote:", copyErr);
        // Non-fatal: quote is created even if item copy fails
      }

      // Update pipeline links
      await upsertPipelineLink("deal_id", deal_id, {
        quote_id: quote.id,
        organization_id,
        root_organization_id: root_organization_id || organization_id,
      });

      results.success = true;
      results.created_id = quote.id;
      results.message = "Orçamento criado em Rascunho";
    }

    // ─── ACTION: Create Proposal from Accepted Quote ─────────
    if (action === "create_proposal_from_quote") {
      const { quote_id, deal_id, organization_id, root_organization_id, created_by, title } = payload;

      const existingProposalId = await findExistingProposalForQuote(quote_id);
      if (existingProposalId) {
        await upsertPipelineLink("quote_id", quote_id, {
          proposal_id: existingProposalId,
          organization_id,
          root_organization_id: root_organization_id || organization_id,
        });

        if (deal_id) {
          await upsertPipelineLink("deal_id", deal_id, {
            proposal_id: existingProposalId,
            quote_id,
            organization_id,
            root_organization_id: root_organization_id || organization_id,
          });
        }

        results.success = true;
        results.created_id = existingProposalId;
        results.message = "Proposta já existente reutilizada";
        return new Response(JSON.stringify(results), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get quote value
      const { data: quoteData } = await supabase
        .from("quotes")
        .select("total, created_by")
        .eq("id", quote_id)
        .single();

      const resolvedCreatedBy = await resolveCreatedByForAction("create_proposal_from_quote", created_by, [
        { source: "quote.created_by", value: quoteData?.created_by },
      ]);

      // Try "rascunho" first, fallback to "draft"
      let draftStage: { id: string } | null = null;
      const { data: ds1 } = await supabase
        .from("proposal_workflow_stages")
        .select("id")
        .eq("name", "rascunho")
        .maybeSingle();
      draftStage = ds1;
      if (!draftStage) {
        const { data: ds2 } = await supabase
          .from("proposal_workflow_stages")
          .select("id")
          .eq("name", "draft")
          .maybeSingle();
        draftStage = ds2;
      }
      const stageId2 = draftStage?.id || null;

      const { data: proposal, error } = await supabase
        .from("proposals")
        .insert({
          title: title || "Proposta",
          deal_id,
          organization_id,
          root_organization_id: root_organization_id || organization_id,
          created_by: resolvedCreatedBy,
          stage_id: stageId2,
           status: "draft",
          value: quoteData?.total || 0,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Update pipeline links
      await upsertPipelineLink("quote_id", quote_id, {
        proposal_id: proposal.id,
        organization_id,
        root_organization_id: root_organization_id || organization_id,
      });

      // Also link deal if present
      if (deal_id) {
        await upsertPipelineLink("deal_id", deal_id, {
          proposal_id: proposal.id,
          quote_id: quote_id,
          organization_id,
          root_organization_id: root_organization_id || organization_id,
        });
      }

      results.success = true;
      results.created_id = proposal.id;
      results.message = "Proposta criada a partir do Orçamento aceite";
    }

    // ─── ACTION: Create Proposal from Deal (legacy) ──────────
    if (action === "create_proposal_from_deal") {
      const { deal_id, organization_id, root_organization_id, created_by, entity_id, title } = payload;

      const existingProposalId = await findExistingProposalForDeal(deal_id);
      if (existingProposalId) {
        await upsertPipelineLink("deal_id", deal_id, {
          proposal_id: existingProposalId,
          organization_id,
          root_organization_id: root_organization_id || organization_id,
        });

        results.success = true;
        results.created_id = existingProposalId;
        results.message = "Proposta já existente reutilizada";
        return new Response(JSON.stringify(results), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: dealData } = await supabase
        .from("deals")
        .select("created_by")
        .eq("id", deal_id)
        .maybeSingle();

      const resolvedCreatedBy = await resolveCreatedByForAction("create_proposal_from_deal", created_by, [
        { source: "deal.created_by", value: dealData?.created_by },
      ]);

      // Try "rascunho" first, fallback to "draft"
      let draftStage3: { id: string } | null = null;
      const { data: ds3 } = await supabase
        .from("proposal_workflow_stages")
        .select("id")
        .eq("name", "rascunho")
        .maybeSingle();
      draftStage3 = ds3;
      if (!draftStage3) {
        const { data: ds4 } = await supabase
          .from("proposal_workflow_stages")
          .select("id")
          .eq("name", "draft")
          .maybeSingle();
        draftStage3 = ds4;
      }
      const stageId3 = draftStage3?.id || null;

      const { data: proposal, error } = await supabase
        .from("proposals")
        .insert({
          title: title || "Proposta",
          deal_id,
          organization_id,
          root_organization_id: root_organization_id || organization_id,
          created_by: resolvedCreatedBy,
          stage_id: stageId3,
          status: "draft",
          value: 0,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Update pipeline links
      await upsertPipelineLink("deal_id", deal_id, {
        proposal_id: proposal.id,
        organization_id,
        root_organization_id: root_organization_id || organization_id,
      });

      results.success = true;
      results.created_id = proposal.id;
      results.message = "Proposta criada em Rascunho";
    }

    // ─── ACTION: Create Quote from Proposal ──────────────────
    if (action === "create_quote_from_proposal") {
      const { proposal_id, organization_id, root_organization_id, created_by, deal_id } = payload;

      const existingQuoteId = await findExistingQuoteForProposal(proposal_id);
      if (existingQuoteId) {
        await upsertPipelineLink("proposal_id", proposal_id, {
          quote_id: existingQuoteId,
          organization_id,
          root_organization_id: root_organization_id || organization_id,
        });

        results.success = true;
        results.created_id = existingQuoteId;
        results.message = "Orçamento já existente reutilizado";
        return new Response(JSON.stringify(results), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: proposalSource } = await supabase
        .from("proposals")
        .select("created_by")
        .eq("id", proposal_id)
        .maybeSingle();

      const resolvedCreatedBy = await resolveCreatedByForAction("create_quote_from_proposal", created_by, [
        { source: "proposal.created_by", value: proposalSource?.created_by },
      ]);

      // Resolve entity_id from proposal's deal
      let resolvedEntityId: string | null = null;
      if (deal_id) {
        const { data: dd } = await supabase.from("deals").select("entity_id").eq("id", deal_id).single();
        resolvedEntityId = dd?.entity_id || null;
      }

      // Copy manual items from proposal
      const { data: manualItems } = await supabase
        .from("proposal_manual_items")
        .select("*")
        .eq("proposal_id", proposal_id)
        .order("sort_order");

      const total = (manualItems || []).reduce((sum: number, item: any) => sum + (item.quantity * item.unit_price), 0);

      const { data: quote, error } = await supabase
        .from("quotes")
        .insert({
          proposal_id,
          deal_id,
          organization_id,
          root_organization_id: root_organization_id || organization_id,
          created_by: resolvedCreatedBy,
          entity_id: resolvedEntityId,
          estado: "enviado",
          modelo_base: "manual",
          total,
          subtotal: total,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Update pipeline links
      await upsertPipelineLink("proposal_id", proposal_id, {
        quote_id: quote.id,
        organization_id,
        root_organization_id: root_organization_id || organization_id,
      });

      results.success = true;
      results.created_id = quote.id;
      results.message = "Orçamento criado com estado Enviado";
    }

    // ─── ACTION: Create Contract from Quote ──────────────────
    if (action === "create_contract_from_quote") {
      const { quote_id, proposal_id, organization_id, root_organization_id, created_by, client_id } = payload;

      const inheritedContractActors: ActorSource[] = [];
      if (proposal_id) {
        const { data: proposalSource } = await supabase
          .from("proposals")
          .select("created_by")
          .eq("id", proposal_id)
          .maybeSingle();
        inheritedContractActors.push({ source: "proposal.created_by", value: proposalSource?.created_by });
      }
      if (quote_id) {
        const { data: quoteSource } = await supabase
          .from("quotes")
          .select("created_by")
          .eq("id", quote_id)
          .maybeSingle();
        inheritedContractActors.push({ source: "quote.created_by", value: quoteSource?.created_by });
      }
      const resolvedCreatedBy = await resolveCreatedByForAction("create_contract_from_quote", created_by, inheritedContractActors);

      // Check if a contract already exists for this proposal/quote to avoid duplicates
      let existingQuery = supabase.from("client_contracts").select("id").limit(1);
      if (proposal_id) existingQuery = existingQuery.eq("proposal_id", proposal_id);
      else if (quote_id) existingQuery = existingQuery.eq("quote_id", quote_id);
      const { data: existingContracts } = await existingQuery;

      if (existingContracts && existingContracts.length > 0) {
        results.success = true;
        results.created_id = existingContracts[0].id;
        results.message = "Contrato já existente";
      } else {
        // Resolve entity_id from anew_clients
        let entityId = null;
        if (client_id) {
          const { data: anewClient } = await supabase
            .from("anew_clients")
            .select("entity_id")
            .eq("id", client_id)
            .maybeSingle();
          entityId = anewClient?.entity_id || null;
        }

        const contractNumber = `CT-${Date.now().toString(36).toUpperCase()}`;

        await supabase.rpc('set_audit_context', { p_user_id: resolvedCreatedBy, p_source: 'pipeline' });
        const { data: contract, error } = await supabase
          .from("client_contracts")
          .insert({
            client_id,
            entity_id: entityId,
            quote_id,
            proposal_id,
            organization_id,
            root_organization_id: root_organization_id || organization_id,
            created_by: resolvedCreatedBy,
            status: "draft",
            contract_number: contractNumber,
          })
          .select("id")
          .single();

        if (error) throw error;

        await upsertPipelineLink("quote_id", quote_id, {
          contract_id: contract.id,
          organization_id,
          root_organization_id: root_organization_id || organization_id,
        });

        results.success = true;
        results.created_id = contract.id;
        results.message = "Contrato criado em Rascunho";
      }
    }

    // ─── ACTION: Finalize Contract & Convert to Client ──────
    if (action === "finalize_contract") {
      const { contract_id, user_id } = payload;

      const { data: contract, error: contractErr } = await supabase
        .from("client_contracts")
        .select("*, anew_clients(*)")
        .eq("id", contract_id)
        .single();

      if (contractErr || !contract) throw new Error("Contract not found");

      // Update contract status to signed
      if (caller.anewUserId) {
        await supabase.rpc('set_audit_context', { p_user_id: caller.anewUserId, p_source: 'pipeline' });
      }
      await supabase.from("client_contracts").update({ status: "signed" }).eq("id", contract_id);

      // Trigger execute-workflow to handle full client conversion logic
      // (creates anew_clients, sets entity roles, converts lead, updates pipeline_links)
      try {
        console.log("[pipeline-automation] finalize_contract: triggering execute-workflow for contract:", contract_id);
        const wfResp = await fetch(`${supabaseUrl}/functions/v1/execute-workflow`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            source_entity: "contract",
            entity_id: contract_id,
            new_stage_id: "signed",
            triggered_by: user_id || null,
          }),
        });
        const wfData = await wfResp.json();
        console.log("[pipeline-automation] execute-workflow response:", wfData);
      } catch (wfErr) {
        console.error("[pipeline-automation] Error triggering execute-workflow:", wfErr);
      }

      // Fallback: if client_id already exists on contract, ensure it's active
      if (contract.client_id) {
        await supabase.from("anew_clients")
          .update({ status: "active" })
          .eq("id", contract.client_id);
      }

      results.success = true;
      results.message = "Contrato assinado e cliente ativado";
    }

    // ─── ACTION: Propagate rejection backwards ───────────────
    if (action === "propagate_rejection") {
      const { entity_type, entity_id, reason } = payload;

      // Find the pipeline link
      const colMap: Record<string, string> = {
        proposal: "proposal_id",
        quote: "quote_id",
        contract: "contract_id",
      };
      const col = colMap[entity_type];
      if (!col) throw new Error("Invalid entity type for rejection");

      const { data: link } = await supabase
        .from("pipeline_links")
        .select("*")
        .eq(col, entity_id)
        .eq("status", "active")
        .maybeSingle();

      if (link) {
        // Propagate rejection backwards
        if (entity_type === "contract" && link.quote_id) {
          await supabase.from("quotes").update({ estado: "perdido" }).eq("id", link.quote_id);
        }
        if ((entity_type === "contract" || entity_type === "quote") && link.proposal_id) {
          const { data: rejectedStage } = await supabase
            .from("proposal_workflow_stages")
            .select("id")
            .eq("name", "rejeitada") // changed from "rascunho" to match expected rejection stage
            .maybeSingle();
          
          if (rejectedStage) {
            await supabase.from("proposals")
              .update({ stage_id: rejectedStage.id, status: "rejeitada", rejection_reason: reason })
              .eq("id", link.proposal_id);
          }
        }
        if (link.deal_id) {
          // Move deal to "Desqualificado" stage
          const { data: disqualifiedStage } = await supabase
            .from("deal_stages")
            .select("id")
            .eq("name", "Desqualificado")
            .maybeSingle();
          if (disqualifiedStage) {
            await supabase.from("deals")
              .update({ stage_id: disqualifiedStage.id, lost_reason: reason })
              .eq("id", link.deal_id);
          }
        }

        // Update pipeline status
        await supabase.from("pipeline_links").update({ status: "rejected" }).eq("id", link.id);
      }

      results.success = true;
      results.message = "Rejeição propagada";
    }

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Pipeline automation error:", error);
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
