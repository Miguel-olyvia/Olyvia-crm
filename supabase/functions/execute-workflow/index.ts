import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCallerIdentity, validateOrgScope, authErrorResponse } from "../_shared/auth.ts";
import { z } from "npm:zod";
import { syncEntityPrimaryAddressFromLead } from "../_shared/addressSanitization.ts";
import {
  getWorkflowPermissionForSourceEntity,
  resolveWorkflowOrganizationFromRecord,
} from "../_shared/leadsValidation.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry();

const requestSchema = z.object({
  source_entity: z.string(),
  entity_id: z.string(),
  new_stage_id: z.string().optional(),
  old_stage_id: z.string().optional(),
  organization_id: z.string().optional(),
  triggered_by: z.string().optional(),
});

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
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

    // ── Audit context: tag all subsequent writes as workflow-sourced ──
    // Must run before any write so the F1 audit trigger attributes correctly.
    const { error: auditCtxError } = await supabase.rpc("set_audit_context", {
      p_user_id: caller.anewUserId,
      p_source: "workflow",
    });
    if (auditCtxError) {
      console.error("set_audit_context failed:", auditCtxError.message);
    }

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    const { source_entity, entity_id, new_stage_id, old_stage_id, organization_id, triggered_by } = parsed.data;

    const workflowSourceTable: Record<string, string> = {
      lead: "anew_leads",
      deal: "deals",
      quote: "quotes",
      proposal: "proposals",
      contract: "client_contracts",
    };
    const sourceTable = workflowSourceTable[source_entity];
    if (!sourceTable) {
      return new Response(
        JSON.stringify({ error: `Unsupported source_entity: ${source_entity}` }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: sourceRecord, error: sourceRecordError } = await supabase
      .from(sourceTable)
      .select("*")
      .eq("id", entity_id)
      .maybeSingle();
    if (sourceRecordError || !sourceRecord) {
      return new Response(
        JSON.stringify({ error: `${source_entity} not found` }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const orgId = resolveWorkflowOrganizationFromRecord(source_entity, sourceRecord);
    if (!orgId) {
      return new Response(
        JSON.stringify({ error: "Could not resolve organization for workflow source record" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Workflow execution request:", {
      source_entity,
      entity_id,
      new_stage_id,
      old_stage_id,
      request_org_id: organization_id,
      derived_org_id: orgId,
      triggered_by,
      caller: caller.anewUserId,
    });

    // ── Scope check ──
    if (orgId) {
      const hasAccess = await validateOrgScope(supabase, caller, orgId);
      if (!hasAccess) {
        return new Response(
          JSON.stringify({ error: "Sem permissão para esta organização" }),
          { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    if (!caller?.isServiceRole) {
      const permissionCode = getWorkflowPermissionForSourceEntity(source_entity);
      if (!permissionCode) {
        return new Response(
          JSON.stringify({ error: `No workflow permission mapping for source_entity: ${source_entity}` }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const aliasCode = permissionCode.endsWith(".edit")
        ? permissionCode.replace(".edit", ".update")
        : permissionCode;
      const { data: hasPermission, error: permissionError } = await supabase.rpc("has_anew_permission", {
        _auth_uid: caller.authUid,
        _permission_code: permissionCode,
      });
      const { data: hasAliasPermission, error: aliasPermissionError } = aliasCode !== permissionCode
        ? await supabase.rpc("has_anew_permission", {
          _auth_uid: caller.authUid,
          _permission_code: aliasCode,
        })
        : { data: false, error: null };

      if (permissionError || aliasPermissionError || (!hasPermission && !hasAliasPermission)) {
        return new Response(
          JSON.stringify({ error: `Sem permissão funcional para ${source_entity}` }),
          { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    let internalUserId: string | null = caller?.isServiceRole ? null : (caller?.anewUserId ?? null);
    if (!internalUserId && triggered_by) {
      const { data: anewUser } = await supabase.from("anew_users").select("id").eq("auth_user_id", triggered_by).maybeSingle();
      internalUserId = anewUser?.id ?? null;
    }
    if (!internalUserId && !caller?.isServiceRole) {
      return new Response(
        JSON.stringify({ error: "Business user (anew_users.id) could not be resolved for the caller" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Workflow execution grouping ──
    // One execution_id per invocation groups every workflow_execution_log row
    // (hardcoded cascades below and the configurable automation-rule engine)
    // produced by this single request together.
    const executionId = crypto.randomUUID();
    // Verified identity for workflow_execution_log.executed_by — never trust
    // the client-supplied triggered_by field as the identity source. Falls
    // back to the resolved internalUserId (itself only derived from
    // triggered_by via a verified anew_users lookup) when acting as service role.
    const workflowExecutedBy: string | null = caller?.isServiceRole ? (internalUserId ?? null) : (caller?.anewUserId ?? null);

    const results = { automationRules: 0, stageActions: 0, logs: [] as Array<{ type: string; status: string; message: string }> };

    // Helper functions
    interface WorkflowExecutionLogParams {
      ruleId: string | null;
      sourceEntity: string;
      sourceRecordId: string;
      targetEntity: string;
      targetRecordId: string | null;
      actionType: string;
      status: "success" | "error";
      errorMessage?: string | null;
      executionData?: Record<string, unknown> | null;
    }

    async function logWorkflowExecution(params: WorkflowExecutionLogParams): Promise<void> {
      const { error } = await supabase.from("workflow_execution_log").insert([{
        execution_id: executionId,
        rule_id: params.ruleId,
        source_entity: params.sourceEntity,
        source_record_id: params.sourceRecordId,
        target_entity: params.targetEntity,
        target_record_id: params.targetRecordId,
        action_type: params.actionType,
        status: params.status,
        error_message: params.errorMessage ?? null,
        execution_data: params.executionData ?? null,
        executed_by: workflowExecutedBy,
      }]);
      if (error) {
        console.error("logWorkflowExecution failed:", error.message);
      }
    }

    // ------------------------------------------------------------------
    // Criadores genericos da cadeia
    // ------------------------------------------------------------------
    // O ecra "Pipeline Comercial - Automacoes" deixa reordenar os modulos, e a
    // accao configurada passa a ser "cria o modulo seguinte" -- seja ele qual for.
    // Isso da 24 ordens possiveis e 18 pares origem->destino, dos quais o motor
    // implementava 6: os outros 12 caiam num `else` que apenas registava
    // "nao implementada", e so uma das 24 ordens funcionava de ponta a ponta.
    //
    // Em vez de 12 implementacoes avulsas, cinco criadores -- um por entidade da
    // cadeia. Cada um recebe a MESMA origem normalizada, venha ela de um pedido,
    // orcamento, proposta ou contrato. Uma correccao num criador vale para todas
    // as ordens, e nao ha 12 sitios onde o mesmo defeito possa reaparecer.

    /** O que qualquer origem da cadeia sabe dizer sobre si. */
    interface OrigemCadeia {
      /** modulo de origem, para os registos: deal | quote | proposal | contract */
      tipo: string;
      id: string;
      organization_id: string;
      root_organization_id?: string | null;
      entity_id?: string | null;
      assigned_to?: string | null;
      created_by?: string | null;
      /** titulo legivel, para dar nome ao que se cria */
      titulo?: string | null;
      valor?: number | null;
      /** ligacoes que a origem ja tem, para nao as perder */
      lead_id?: string | null;
      deal_id?: string | null;
      quote_id?: string | null;
      proposal_id?: string | null;
      client_id?: string | null;
    }

    const CAMPO_LIGACAO: Record<string, string> = {
      deal: "deal_id", quote: "quote_id", proposal: "proposal_id", contract: "contract_id",
    };

    async function nomeDaEntidade(entityId?: string | null): Promise<string | null> {
      if (!entityId) return null;
      const { data } = await supabase.from("anew_entities").select("display_name").eq("id", entityId).maybeSingle();
      return data?.display_name || null;
    }

    /** Guarda a ligacao da origem para o que foi criado, sem perder o resto. */
    async function ligarACadeia(origem: OrigemCadeia, novo: Record<string, any>) {
      const campo = CAMPO_LIGACAO[origem.tipo];
      if (!campo) return;
      await upsertPipelineLink(campo, origem.id, {
        ...novo,
        organization_id: origem.organization_id,
        root_organization_id: origem.root_organization_id || origem.organization_id,
      });
    }

    const baseComum = (o: OrigemCadeia) => ({
      organization_id: o.organization_id,
      root_organization_id: o.root_organization_id || o.organization_id,
      created_by: internalUserId || o.created_by || null,
      entity_id: o.entity_id || null,
    });

    async function criarPedido(o: OrigemCadeia): Promise<string> {
      // Fase inicial dos Pedidos: "Novo" se existir, senao a de menor ordem.
      let { data: fase } = await supabase.from("deal_stages").select("id").eq("name", "Novo").limit(1).maybeSingle();
      if (!fase) {
        const { data: primeira } = await supabase.from("deal_stages").select("id").order("order_index").limit(1).maybeSingle();
        fase = primeira;
      }
      const nome = o.titulo || (await nomeDaEntidade(o.entity_id)) || "Pedido";
      const { data, error } = await supabase.from("deals").insert({
        ...baseComum(o),
        title: "Pedido - " + nome,
        lead_id: o.lead_id || null,
        stage_id: fase?.id || null,
        assigned_to: o.assigned_to || internalUserId || null,
        value: o.valor || 0,
      } as any).select("id").single();
      if (error) throw error;
      await ligarACadeia(o, { deal_id: data!.id });
      return data!.id;
    }

    async function criarOrcamento(o: OrigemCadeia): Promise<string> {
      const { data, error } = await supabase.from("quotes").insert({
        ...baseComum(o),
        deal_id: o.deal_id || (o.tipo === "deal" ? o.id : null),
        estado: "rascunho",
        modelo_base: "manual",
        total: o.valor || 0,
        subtotal: o.valor || 0,
      } as any).select("id").single();
      if (error) throw error;
      await ligarACadeia(o, { quote_id: data!.id });
      return data!.id;
    }

    async function criarProposta(o: OrigemCadeia): Promise<string> {
      // Fase de rascunho: a da organizacao, senao a global, senao a primeira.
      let { data: fase } = await supabase.from("proposal_workflow_stages").select("id")
        .eq("name", "draft").eq("organization_id", o.organization_id).limit(1).maybeSingle();
      if (!fase) {
        const { data: g } = await supabase.from("proposal_workflow_stages").select("id")
          .eq("name", "draft").is("organization_id", null).limit(1).maybeSingle();
        fase = g;
      }
      if (!fase) {
        const { data: qualquer } = await supabase.from("proposal_workflow_stages").select("id").limit(1).maybeSingle();
        fase = qualquer;
      }
      const nome = o.titulo || (await nomeDaEntidade(o.entity_id)) || "cliente";
      const { data, error } = await supabase.from("proposals").insert({
        ...baseComum(o),
        title: "Proposta para " + nome,
        deal_id: o.deal_id || (o.tipo === "deal" ? o.id : null),
        // `proposals` NAO tem `quote_id` -- a chave esta do outro lado, em
        // `quotes.proposal_id`. A ligacao faz-se por `pipeline_links` (ver
        // `ligarACadeia`) e, quando a origem e um orcamento, pelo proprio
        // orcamento a apontar para ca, mais abaixo.
        stage_id: fase?.id || null,
        status: "draft",
        value: o.valor || 0,
        assigned_to: o.assigned_to || null,
      } as any).select("id").single();
      if (error) throw error;
      await ligarACadeia(o, { proposal_id: data!.id });
      // O lado que guarda a chave e o orcamento.
      const orcamentoId = o.quote_id || (o.tipo === "quote" ? o.id : null);
      if (orcamentoId) {
        await supabase.from("quotes").update({ proposal_id: data!.id }).eq("id", orcamentoId);
      }
      return data!.id;
    }

    async function criarContrato(o: OrigemCadeia): Promise<string> {
      // Uma proposta nunca deve ter dois contratos.
      const propostaId = o.proposal_id || (o.tipo === "proposal" ? o.id : null);
      if (propostaId) {
        const { data: existente } = await supabase.from("client_contracts")
          .select("id").eq("proposal_id", propostaId).is("deleted_at", null).limit(1).maybeSingle();
        if (existente?.id) return existente.id;
      }
      const nome = await nomeDaEntidade(o.entity_id);
      const inicio = new Date();
      const fim = new Date(inicio); fim.setFullYear(fim.getFullYear() + 1);
      const { data, error } = await supabase.from("client_contracts").insert({
        ...baseComum(o),
        client_id: o.client_id || null,
        proposal_id: propostaId,
        quote_id: o.quote_id || (o.tipo === "quote" ? o.id : null),
        status: "draft",
        total_value: o.valor || 0,
        start_date: inicio.toISOString().split("T")[0],
        end_date: fim.toISOString().split("T")[0],
        notes: nome
          ? "Contrato criado automaticamente pela automacao do pipeline - " + nome
          : "Contrato criado automaticamente pela automacao do pipeline",
      } as any).select("id").single();
      if (error) throw error;
      await ligarACadeia(o, { contract_id: data!.id });
      return data!.id;
    }

    async function converterEmCliente(o: OrigemCadeia): Promise<string | null> {
      if (!o.entity_id) return null;
      const { data: existente } = await supabase.from("anew_clients")
        .select("id, status").eq("entity_id", o.entity_id).eq("organization_id", o.organization_id).limit(1).maybeSingle();
      if (existente?.id) {
        if (existente.status !== "active") {
          await supabase.from("anew_clients").update({ status: "active" }).eq("id", existente.id);
        }
        return existente.id;
      }
      const { data, error } = await supabase.from("anew_clients").insert({
        ...baseComum(o),
        status: "active",
        assigned_to: o.assigned_to || internalUserId || null,
      } as any).select("id").single();
      if (error) throw error;
      return data!.id;
    }

    /**
     * Executa qualquer accao da cadeia a partir de qualquer origem.
     * Devolve null quando a accao nao pertence a cadeia (ex.: create_task),
     * para o chamador a tratar como sempre tratou.
     */
    async function executarAccaoDaCadeia(accao: string, o: OrigemCadeia): Promise<{ alvo: string; id: string | null } | null> {
      switch (accao) {
        case "create_deal":       return { alvo: "deal",     id: await criarPedido(o) };
        case "create_quote":      return { alvo: "quote",    id: await criarOrcamento(o) };
        case "create_proposal":   return { alvo: "proposal", id: await criarProposta(o) };
        case "create_contract":   return { alvo: "contract", id: await criarContrato(o) };
        case "convert_to_client": {
          const id = await converterEmCliente(o);
          // Sem entidade nao ha nada para converter. Dizer "cliente criado" com
          // id nulo seria um sucesso falso -- e um registo que engana quem o le.
          if (!id) throw new Error("Sem entidade associada: nao ha quem converter em cliente");
          return { alvo: "client", id };
        }
        default: return null;
      }
    }

    async function upsertPipelineLink(field: string, fieldId: string, updates: Record<string, any>) {
      const { data: existing } = await supabase.from("pipeline_links").select("id").eq(field, fieldId).eq("status", "active").maybeSingle();
      if (existing) await supabase.from("pipeline_links").update(updates).eq("id", existing.id);
      else await supabase.from("pipeline_links").insert({ [field]: fieldId, ...updates });
    }

    async function getLeadStageByName(name: string) {
      const { data } = await supabase.from("lead_workflow_stages").select("id").eq("name", name).is("organization_id", null).maybeSingle();
      return data?.id || null;
    }

    async function syncLeadToStage(leadId: string, stageName: string) {
      const stageId = await getLeadStageByName(stageName);
      if (stageId) {
        await supabase.from("anew_leads").update({ workflow_stage_id: stageId, status: stageName === "ganho" ? "converted" : stageName === "perdido" ? "rejected" : undefined }).eq("id", leadId);
        return true;
      }
      return false;
    }

    async function resolveLeadFromPipeline(entityType: string, eId: string): Promise<string | null> {
      if (entityType === "deal") { const { data } = await supabase.from("deals").select("lead_id").eq("id", eId).single(); return data?.lead_id || null; }
      const col = `${entityType}_id`;
      const { data: link } = await supabase.from("pipeline_links").select("lead_id, deal_id").eq(col, eId).eq("status", "active").maybeSingle();
      if (link?.lead_id) return link.lead_id;
      if (link?.deal_id) { const { data: deal } = await supabase.from("deals").select("lead_id").eq("id", link.deal_id).single(); return deal?.lead_id || null; }
      return null;
    }

    // 1. LEAD STAGE ACTIONS
    if (source_entity === "lead" && new_stage_id && orgId) {
      const leadOrgId = orgId;
      let { data: stageActions } = await supabase.from("lead_stage_actions").select("*").eq("organization_id", leadOrgId).eq("stage_id", new_stage_id).eq("is_active", true).order("execution_order");
      if (!stageActions || stageActions.length === 0) {
        const { data: stageInfo } = await supabase.from("lead_workflow_stages").select("name").eq("id", new_stage_id).single();
        if (stageInfo?.name) {
          const { data: allStages } = await supabase.from("lead_workflow_stages").select("id").eq("name", stageInfo.name);
          const ids = (allStages || []).map(s => s.id);
          if (ids.length > 0) {
            const { data: r } = await supabase.from("lead_stage_actions").select("*").eq("organization_id", leadOrgId).in("stage_id", ids).eq("is_active", true).order("execution_order");
            if (r && r.length > 0) stageActions = r;
            else { const { data: g } = await supabase.from("lead_stage_actions").select("*").is("organization_id", null).in("stage_id", ids).eq("is_active", true).order("execution_order"); if (g && g.length > 0) stageActions = g; }
          }
        }
      }

      const { data: lead } = await supabase.from("anew_leads").select("*").eq("id", entity_id).single();
      if (lead) {
        const { data: stageInfo } = await supabase.from("lead_workflow_stages").select("name").eq("id", new_stage_id).single();
        const stageName = stageInfo?.name || "";
        if (stageActions && stageActions.length > 0) {
          for (const action of stageActions) {
            try {
              if (action.action_type === "convert_to_contact") {
                let eId = lead.entity_id;
                const fv = (lead.field_values || {}) as Record<string, string>;
                // Robust name extraction supporting po_nome, nome, first_name etc.
                let fn = fv.first_name || fv.primeiro_nome || null;
                let ln = fv.last_name || fv.apelido || null;
                if (!fn && !ln) {
                  const fullName = (fv.po_nome || fv.nome || fv.name || fv.full_name || "").trim();
                  if (fullName) {
                    const parts = fullName.split(/\s+/);
                    if (parts.length >= 2) { fn = parts[0]; ln = parts.slice(1).join(" "); }
                    else { fn = fullName; }
                  }
                }
                const dn = [fn, ln].filter(Boolean).join(" ") || "Lead sem nome";
                const leadEmail = fv.email || fv.po_email || fv.poEmail || fv.e_mail || fv.mail || null;
                const leadPhone = fv.phone || fv.telefone || fv.po_telefone || fv.poTelefone || fv.telemovel || fv.mobile || fv.celular || null;

                if (!eId) {
                  const entityInsert: Record<string, any> = { type: "person", display_name: dn, status: "active", created_by: internalUserId || lead.created_by };
                  if (fn) entityInsert.first_name = fn;
                  if (ln) entityInsert.last_name = ln;
                  const { data: ne } = await supabase.from("anew_entities").insert(entityInsert).select("id").single();
                  eId = ne!.id;
                  if (leadEmail) await supabase.from("anew_entity_emails").insert({ entity_id: eId, email: leadEmail, is_primary: true }).catch(() => {});
                  if (leadPhone) await supabase.from("anew_entity_phones").insert({ entity_id: eId, phone_number: leadPhone, is_primary: true }).catch(() => {});
                  await supabase.from("anew_entity_roles").insert({ entity_id: eId, organization_id: lead.organization_id, role: "lead", status: "active", source_type: "lead", source_id: entity_id });
                  await supabase.from("anew_leads").update({ entity_id: eId }).eq("id", entity_id);
                  lead.entity_id = eId;
                } else {
                  // Entity exists — ensure first_name/last_name are populated from field_values
                  const { data: existingEntity } = await supabase.from("anew_entities").select("first_name, last_name").eq("id", eId).single();
                  if (existingEntity && (!existingEntity.first_name || existingEntity.first_name === "")) {
                    const entityUpdate: Record<string, any> = {};
                    if (fn) entityUpdate.first_name = fn;
                    if (ln) entityUpdate.last_name = ln;
                    if (Object.keys(entityUpdate).length > 0) {
                      await supabase.from("anew_entities").update(entityUpdate).eq("id", eId);
                    }
                  }
                  // Ensure email and phone exist on entity
                  if (leadEmail) {
                    const { data: existingEmail } = await supabase.from("anew_entity_emails").select("id").eq("entity_id", eId).limit(1).maybeSingle();
                    if (!existingEmail) await supabase.from("anew_entity_emails").insert({ entity_id: eId, email: leadEmail, is_primary: true }).catch(() => {});
                  }
                  if (leadPhone) {
                    const { data: existingPhone } = await supabase.from("anew_entity_phones").select("id").eq("entity_id", eId).limit(1).maybeSingle();
                    if (!existingPhone) await supabase.from("anew_entity_phones").insert({ entity_id: eId, phone_number: leadPhone, is_primary: true }).catch(() => {});
                  }
                }

                // ─── Sync primary address via safe orchestrator ───
                if (eId && fv) {
                  try {
                    const syncRes = await syncEntityPrimaryAddressFromLead({
                      supabase,
                      entityId: eId,
                      fieldValues: fv,
                      actorId: internalUserId || lead.created_by,
                      allowOverwriteValid: false,
                    });
                    console.log("[address-sync/workflow]", syncRes);
                  } catch (e) {
                    console.error("[address-sync/workflow] failed", e);
                  }
                }

                if (eId) {
                  // Resolve assigned_to to internal anew_users ID
                  let resolvedAssignedTo = internalUserId;
                  if (lead.assigned_to) {
                    const { data: assignedUser } = await supabase.from("anew_users").select("id").eq("id", lead.assigned_to).maybeSingle();
                    if (assignedUser) resolvedAssignedTo = assignedUser.id;
                    else {
                      const { data: assignedByAuth } = await supabase.from("anew_users").select("id").eq("auth_user_id", lead.assigned_to).maybeSingle();
                      if (assignedByAuth) resolvedAssignedTo = assignedByAuth.id;
                    }
                  }
                  const { data: ec } = await supabase.from("anew_contacts").select("id").eq("entity_id", eId).eq("organization_id", lead.organization_id).maybeSingle();
                  let contactId = ec?.id;
                  if (!ec) {
                    const { data: newContact, error: newContactError } = await supabase
                      .from("anew_contacts")
                      .insert([{ entity_id: eId, organization_id: lead.organization_id, root_organization_id: lead.root_organization_id || lead.organization_id, source_type: "workflow_automation", source_lead_id: entity_id, status: "active", created_by: internalUserId || lead.created_by, assigned_to: resolvedAssignedTo }])
                      .select("id")
                      .single();
                    if (newContactError) throw newContactError;
                    contactId = newContact?.id;
                  }
                  // Deactivate lead role, activate contact role
                  const { error: deactivateLeadRoleError } = await supabase.from("anew_entity_roles").update({ status: "inactive" }).eq("entity_id", eId).eq("role", "lead").eq("organization_id", lead.organization_id);
                  if (deactivateLeadRoleError) throw deactivateLeadRoleError;
                  const { data: contactRole } = await supabase.from("anew_entity_roles").select("id").eq("entity_id", eId).eq("role", "contact").eq("organization_id", lead.organization_id).maybeSingle();
                  if (!contactRole) {
                    const { error: createContactRoleError } = await supabase.from("anew_entity_roles").insert({ entity_id: eId, role: "contact", status: "active", organization_id: lead.organization_id, source_type: "workflow_automation", source_id: entity_id, created_by: internalUserId || lead.created_by });
                    if (createContactRoleError) throw createContactRoleError;
                  } else {
                    const { error: activateContactRoleError } = await supabase.from("anew_entity_roles").update({ status: "active" }).eq("id", contactRole.id);
                    if (activateContactRoleError) throw activateContactRoleError;
                  }
                  // Update lead with conversion data
                  const { error: convertLeadError } = await supabase
                    .from("anew_leads")
                    .update({ status: "converted", converted_to_contact_id: contactId || null, converted_at: new Date().toISOString(), converted_by: internalUserId || lead.created_by })
                    .eq("id", entity_id);
                  if (convertLeadError) throw convertLeadError;

                  // ─── Migrate lead notes to entity_interactions ───
                  try {
                    const { data: leadHistory } = await supabase
                      .from("lead_contact_history")
                      .select("*")
                      .eq("lead_id", entity_id);

                    if (leadHistory && leadHistory.length > 0) {
                      const interactions = [];
                      for (const h of leadHistory) {
                        if (!h.notes && !h.result) continue;
                        let createdBy = internalUserId || lead.created_by;
                        if (h.contacted_by && h.contacted_by !== triggered_by) {
                          const { data: hUser } = await supabase.from("anew_users").select("id").eq("auth_user_id", h.contacted_by).maybeSingle();
                          if (hUser) createdBy = hUser.id;
                        }
                        interactions.push({
                          entity_id: eId,
                          organization_id: lead.organization_id,
                          interaction_type: "note",
                          subject: "Nota de Lead",
                          notes: h.notes || h.result || "",
                          result: h.result || null,
                          interaction_at: h.contacted_at || new Date().toISOString(),
                          created_by: createdBy,
                        });
                      }
                      if (interactions.length > 0) {
                        const { error: interErr } = await supabase.from("entity_interactions").insert(interactions);
                        if (interErr) console.error("Error migrating lead notes:", interErr);
                        else console.log(`Migrated ${interactions.length} lead notes to entity_interactions for entity ${eId}`);
                      }
                    }
                  } catch (noteErr: any) {
                    console.error("Non-fatal: failed to migrate lead notes:", noteErr.message);
                  }

                  results.stageActions++;
                }
              } else if (action.action_type === "convert_to_client" && lead.entity_id) {
                // Resolve assigned_to to internal anew_users ID
                let resolvedAssignedTo = internalUserId;
                if (lead.assigned_to) {
                  const { data: assignedUser } = await supabase.from("anew_users").select("id").eq("id", lead.assigned_to).maybeSingle();
                  if (assignedUser) resolvedAssignedTo = assignedUser.id;
                  else {
                    const { data: assignedByAuth } = await supabase.from("anew_users").select("id").eq("auth_user_id", lead.assigned_to).maybeSingle();
                    if (assignedByAuth) resolvedAssignedTo = assignedByAuth.id;
                  }
                }
                // Find if there's an intermediate contact for this entity
                const { data: intermediateContact } = await supabase.from("anew_contacts").select("id").eq("entity_id", lead.entity_id).eq("organization_id", lead.organization_id).maybeSingle();
                const sourceContactId = intermediateContact?.id || null;
                const { data: ec } = await supabase.from("anew_clients").select("id, origin_source, origin_source_id, origin_campaign_id").eq("entity_id", lead.entity_id).eq("organization_id", lead.organization_id).maybeSingle();
                let clientId = ec?.id;
                if (!ec) {
                  const { data: newClient, error: createClientError } = await supabase.from("anew_clients").insert([{ entity_id: lead.entity_id, organization_id: lead.organization_id, root_organization_id: lead.root_organization_id || lead.organization_id, source_type: sourceContactId ? "contact" : "workflow_automation", source_id: sourceContactId, status: "active", created_by: internalUserId, assigned_to: resolvedAssignedTo, origin_source: lead.source, origin_source_id: lead.source_id, origin_campaign_id: lead.campaign_id }]).select("id").single();
                  if (createClientError) throw createClientError;
                  clientId = newClient?.id;
                } else if (!ec.origin_source && !ec.origin_source_id && !ec.origin_campaign_id && (lead.source || lead.source_id || lead.campaign_id)) {
                  // Best-effort backfill: only fill marketing origin on a reused client when still empty.
                  await supabase.from("anew_clients").update({ origin_source: lead.source, origin_source_id: lead.source_id, origin_campaign_id: lead.campaign_id }).eq("id", ec.id);
                }
                // Mark intermediate contact as converted if exists
                if (sourceContactId && clientId) {
                  await supabase.from("anew_contacts").update({ converted_to_client_id: clientId, converted_at: new Date().toISOString(), status: "inactive" }).eq("id", sourceContactId);
                  // Deactivate contact role
                  await supabase.from("anew_entity_roles").update({ status: "inactive" }).eq("entity_id", lead.entity_id).eq("role", "contact").eq("organization_id", lead.organization_id);
                }
                // Deactivate lead role, activate client role
                const { error: deactivateLeadRoleError } = await supabase.from("anew_entity_roles").update({ status: "inactive" }).eq("entity_id", lead.entity_id).eq("role", "lead").eq("organization_id", lead.organization_id);
                if (deactivateLeadRoleError) throw deactivateLeadRoleError;
                const { data: clientRole } = await supabase.from("anew_entity_roles").select("id").eq("entity_id", lead.entity_id).eq("role", "client").eq("organization_id", lead.organization_id).maybeSingle();
                if (!clientRole) {
                  const { error: createClientRoleError } = await supabase.from("anew_entity_roles").insert({ entity_id: lead.entity_id, role: "client", status: "active", organization_id: lead.organization_id, source_type: "workflow_automation", source_id: entity_id, created_by: internalUserId });
                  if (createClientRoleError) throw createClientRoleError;
                } else {
                  const { error: activateClientRoleError } = await supabase.from("anew_entity_roles").update({ status: "active" }).eq("id", clientRole.id);
                  if (activateClientRoleError) throw activateClientRoleError;
                }
                const { error: convertLeadError } = await supabase
                  .from("anew_leads")
                  // converted_to_client_id must be written together with converted_at:
                  // omitting it left the lead half-converted (converted_at set,
                  // no link to the client it became).
                  .update({ status: "converted", converted_to_client_id: clientId || null, converted_at: new Date().toISOString(), converted_by: internalUserId })
                  .eq("id", entity_id);
                if (convertLeadError) throw convertLeadError;
                results.stageActions++;
              } else if (action.action_type === "create_task") {
                const config = action.action_config as Record<string, string>;
                await supabase.from("entity_interactions").insert([{ subject: config.title || "Tarefa automática", interaction_type: "task", created_by: internalUserId, assigned_to: lead.assigned_to || internalUserId, entity_id: lead.entity_id, entity_type: "contact", organization_id: lead.organization_id, notes: "Tarefa criada automaticamente pelo workflow." }]);
                results.stageActions++;
              }
            } catch (e: any) { results.logs.push({ type: action.action_type, status: "error", message: e.message }); }
          }
        }
        // Auto: Lead "proposta" → Create Deal (skip if deal already exists for this lead)
        if (stageName === "proposta" && lead.entity_id) {
          const { data: existingDeals } = await supabase.from("deals").select("id").eq("lead_id", entity_id);
          if (!existingDeals || existingDeals.length === 0) {
            try {
              const { data: ent } = await supabase.from("anew_entities").select("display_name").eq("id", lead.entity_id).single();
              const { data: ns } = await supabase.from("deal_stages").select("id").eq("name", "Novo").maybeSingle();
              const { data: deal } = await supabase.from("deals").insert({ title: `Pedido - ${ent?.display_name || "Lead"}`, lead_id: entity_id, entity_id: lead.entity_id, organization_id: lead.organization_id, root_organization_id: lead.root_organization_id || lead.organization_id, stage_id: ns?.id || null, assigned_to: lead.assigned_to || internalUserId, created_by: internalUserId, value: 0 }).select("id").single();
              await upsertPipelineLink("lead_id", entity_id, { deal_id: deal!.id, organization_id: lead.organization_id, root_organization_id: lead.root_organization_id });
              results.stageActions++;
              await logWorkflowExecution({
                ruleId: null,
                sourceEntity: "lead",
                sourceRecordId: entity_id,
                targetEntity: "deal",
                targetRecordId: deal!.id,
                actionType: "hardcoded:lead_proposta_create_deal",
                status: "success",
              });
            } catch (e: any) {
              results.logs.push({ type: "create_deal_from_lead", status: "error", message: e.message });
              await logWorkflowExecution({
                ruleId: null,
                sourceEntity: "lead",
                sourceRecordId: entity_id,
                targetEntity: "deal",
                targetRecordId: null,
                actionType: "hardcoded:lead_proposta_create_deal",
                status: "error",
                errorMessage: e.message,
              });
            }
          } else {
            console.log(`Skipping deal creation for lead ${entity_id} — ${existingDeals.length} deal(s) already exist`);
          }
        }
        // Lead "perdido" → propagate
        if (stageName === "perdido") {
          const { data: ed } = await supabase.from("deals").select("id").eq("lead_id", entity_id).maybeSingle();
          if (ed) {
            const { data: ds } = await supabase.from("deal_stages").select("id").eq("name", "Desqualificado").maybeSingle();
            if (ds) await supabase.from("deals").update({ stage_id: ds.id, lost_reason: "Lead perdida manualmente" }).eq("id", ed.id);
            await supabase.from("pipeline_links").update({ status: "rejected" }).eq("deal_id", ed.id).eq("status", "active");
          }
        }
      }
    }

    // 2. DEAL STAGE ACTIONS
    if (source_entity === "deal" && new_stage_id && orgId) {
      // Os Pedidos eram o unico modulo sem recurso as regras globais: Leads,
      // Orcamentos e Contratos caem para `organization_id IS NULL` quando a
      // organizacao nao tem regra propria, e este filtrava so por organizacao.
      // Uma organizacao sem regras de Pedido ficava sem automacao nenhuma,
      // quando nos outros modulos herdaria as globais. Assimetria sem razao
      // aparente -- alinhado com os outros tres a 2026-08-31.
      let { data: sa } = await supabase.from("deal_stage_actions").select("*").eq("organization_id", orgId).eq("stage_id", new_stage_id).eq("is_active", true).order("execution_order");
      if (!sa || sa.length === 0) {
        const { data: globalSa } = await supabase.from("deal_stage_actions").select("*").is("organization_id", null).eq("stage_id", new_stage_id).eq("is_active", true).order("execution_order");
        if (globalSa && globalSa.length > 0) sa = globalSa;
      }
      if (sa && sa.length > 0) {
        const { data: deal } = await supabase.from("deals").select("*").eq("id", entity_id).single();
        if (deal) {
          for (const action of sa) {
            try {
              if (action.action_type === "create_quote") {
                const { data: q } = await supabase.from("quotes").insert({ deal_id: deal.id, organization_id: deal.organization_id, root_organization_id: deal.root_organization_id || deal.organization_id, created_by: internalUserId, entity_id: deal.entity_id || null, estado: "rascunho", modelo_base: "manual", total: 0, subtotal: 0 } as any).select("id").single();
                await upsertPipelineLink("deal_id", deal.id, { quote_id: q!.id, organization_id: deal.organization_id });
                // Copy deal values to quote lines
                try {
                  let appliedTotals = false;
                  const { data: fullDeal } = await supabase.from("deals").select("title, value, description").eq("id", deal.id).single();
                  const { data: dn } = await supabase.from("deal_needs").select("id, title").eq("deal_id", deal.id);
                  if (dn && dn.length > 0) {
                    const needTitleMap = Object.fromEntries(dn.map((need: any) => [need.id, need.title || "Geral"]));
                    const { data: items } = await supabase.from("deal_need_items").select("deal_need_id, product_id, service_id, item_type, quantity, sort_order").in("deal_need_id", dn.map((n: any) => n.id));
                    if (items && items.length > 0) {
                      const pIds = items.filter((i: any) => i.product_id).map((i: any) => i.product_id);
                      const sIds = items.filter((i: any) => i.service_id).map((i: any) => i.service_id);
                      const pm: Record<string, { price: number; name: string }> = {};
                      const sm: Record<string, string> = {};
                      if (pIds.length > 0) {
                        const [{ data: prods }, { data: prs }] = await Promise.all([
                          supabase.from("products").select("id, name").in("id", pIds),
                          supabase.from("product_prices").select("product_id, price").in("product_id", pIds).eq("price_type", "retail"),
                        ]);
                        (prods || []).forEach((p: any) => { pm[p.id] = { price: 0, name: p.name || "" }; });
                        (prs || []).forEach((pp: any) => { if (pm[pp.product_id]) pm[pp.product_id].price = pp.price || 0; else pm[pp.product_id] = { price: pp.price || 0, name: "" }; });
                      }
                      if (sIds.length > 0) {
                        const { data: svcs } = await supabase.from("services").select("id, name").in("id", sIds);
                        (svcs || []).forEach((s: any) => { sm[s.id] = s.name || ""; });
                      }
                      const lines = items.map((item: any, idx: number) => {
                        const isP = item.item_type === "product" && item.product_id;
                        const pi = isP ? pm[item.product_id] : null;
                        const up = pi?.price || 0;
                        const qty = item.quantity || 1;
                        const desc = isP ? (pi?.name || "Produto") : (sm[item.service_id] || "Serviço");
                        const category = needTitleMap[item.deal_need_id] || "Geral";
                        const tsIva = up * qty;
                        return { quote_id: q!.id, product_id: item.product_id || null, service_id: item.service_id || null, categoria: category, section_name: category, descricao_snapshot: desc, qt: qty, custo_material_unit: up, custo_mao_obra_unit: 0, margem_percent: 0, iva_percent: 23, int_percent: 0, total_sem_iva: tsIva, total_com_iva: tsIva * 1.23, total_com_desconto: tsIva * 1.23, ordem: item.sort_order || idx };
                      });
                      if (lines.length > 0) {
                        const { error: linesError } = await supabase.from("quote_lines").insert(lines);
                        if (linesError) throw linesError;
                        const sub = lines.reduce((s: number, l: any) => s + (l.total_sem_iva || 0), 0);
                        const tot = lines.reduce((s: number, l: any) => s + (l.total_com_iva || 0), 0);
                        await supabase.from("quotes").update({ subtotal: sub, total: tot }).eq("id", q!.id);
                        appliedTotals = true;
                      }
                    }
                  }

                  if (!appliedTotals && Number(fullDeal?.value || 0) > 0) {
                    const fallbackSubtotal = Number(fullDeal?.value || 0);
                    const fallbackCategory = fullDeal?.title || "Geral";
                    const fallbackDescription = fullDeal?.description?.trim() || fullDeal?.title || "Valor manual do pedido";
                    const fallbackLine = {
                      quote_id: q!.id,
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
                    await supabase.from("quotes").update({ subtotal: fallbackSubtotal, total: fallbackSubtotal * 1.23 }).eq("id", q!.id);
                  }
                } catch (e) { console.error("Error copying deal items to quote:", e); }
                results.stageActions++;
              } else if (action.action_type === "create_proposal") {
                let ds: any = null;
                const { data: d1 } = await supabase.from("proposal_workflow_stages").select("id").eq("name", "rascunho").maybeSingle(); ds = d1;
                if (!ds) { const { data: d2 } = await supabase.from("proposal_workflow_stages").select("id").eq("name", "draft").maybeSingle(); ds = d2; }
                const { data: p } = await supabase.from("proposals").insert({ title: `Proposta para ${deal.title}`, deal_id: deal.id, organization_id: deal.organization_id, root_organization_id: deal.root_organization_id || deal.organization_id, created_by: internalUserId, entity_id: deal.entity_id || null, stage_id: ds?.id || null, status: "draft", value: deal.value || 0 } as any).select("id").single();
                await upsertPipelineLink("deal_id", deal.id, { proposal_id: p!.id, organization_id: deal.organization_id });
                results.stageActions++;
              } else if (action.action_type === "create_task") {
                const config = action.action_config as Record<string, string>;
                await supabase.from("entity_interactions").insert([{ subject: config.title || "Tarefa automática", interaction_type: "task", created_by: internalUserId, assigned_to: deal.assigned_to || internalUserId, entity_id: deal.entity_id, entity_type: "deal", organization_id: deal.organization_id, notes: "Tarefa criada pelo workflow." }]);
                results.stageActions++;
              } else {
                // Qualquer outra accao da cadeia (create_contract, convert_to_client)
                // passa pelos criadores genericos -- a UI pode oferece-las assim que
                // se reordene o pipeline, e o motor tem de as saber executar.
                const feito = await executarAccaoDaCadeia(action.action_type, {
                  tipo: "deal", id: deal.id,
                  organization_id: deal.organization_id,
                  root_organization_id: deal.root_organization_id,
                  entity_id: deal.entity_id,
                  assigned_to: deal.assigned_to,
                  created_by: deal.created_by,
                  titulo: deal.title,
                  valor: deal.value,
                  lead_id: deal.lead_id,
                  deal_id: deal.id,
                });
                if (feito) {
                  results.stageActions++;
                  results.logs.push({ type: action.action_type, status: "success", message: `${feito.alvo} ${feito.id} criado a partir do pedido` });
                  await logWorkflowExecution({
                    ruleId: null, sourceEntity: "deal", sourceRecordId: deal.id,
                    targetEntity: feito.alvo, targetRecordId: feito.id,
                    actionType: `config:deal_${action.action_type}`, status: "success",
                  });
                } else {
                  // Nao pertence a cadeia (ex.: send_email). Continua a ficar audivel.
                  results.logs.push({ type: action.action_type, status: "error", message: `Accao "${action.action_type}" nao esta implementada para o modulo pedido` });
                  await logWorkflowExecution({
                    ruleId: null, sourceEntity: "deal", sourceRecordId: deal.id,
                    targetEntity: null, targetRecordId: null,
                    actionType: `unimplemented:deal_${action.action_type}`, status: "error",
                    errorMessage: "Accao configurada na UI mas nao implementada no motor para o modulo pedido",
                  });
                }
              }
            } catch (e: any) { results.logs.push({ type: action.action_type, status: "error", message: e.message }); }
          }
        }
      }
    }

    // 3. PROPOSAL STAGE ACTIONS
    if (source_entity === "proposal" && new_stage_id && orgId) {
      const { data: proposal } = await supabase.from("proposals").select("*").eq("id", entity_id).single();
      const { data: psi } = await supabase.from("proposal_workflow_stages").select("name, is_won, is_lost").eq("id", new_stage_id).single();

      // Ate 2026-08-31 este bloco ignorava por completo `proposal_stage_actions`:
      // a criacao do contrato dependia so da flag `is_won` da fase. O ecra
      // "Pipeline Comercial - Automacoes" mostrava a regra e deixava desliga-la,
      // e o motor criava o contrato na mesma. Confirmado ao vivo na nike a
      // 2026-08-30: regra desactivada, proposta aceite, contrato criado na mesma.
      //
      // Passa a valer o que esta configurado, com a mesma precedencia dos outros
      // modulos (organizacao primeiro, globais como recurso):
      //
      //   regra activa      -> cria
      //   regra desactivada -> NAO cria (era este o caso que se perdia)
      //   nenhuma regra     -> recorre a `is_won`, como antes
      //
      // O recurso existe para nao tirar automacao a quem nunca configurou nada:
      // das 15 organizacoes, so a Mudelar e a nike tem regras nesta tabela. Quem
      // nao tem continua a funcionar como funcionava, e o registo diz `fallback:`
      // para se poder medir quantas ainda dependem disso.
      let proposalRules: any[] | null = null;
      {
        const { data: orgRules } = await supabase
          .from("proposal_stage_actions")
          .select("stage_id, action_type, is_active")
          .eq("organization_id", orgId);
        if (orgRules && orgRules.length > 0) {
          proposalRules = orgRules;
        } else {
          const { data: globalRules } = await supabase
            .from("proposal_stage_actions")
            .select("stage_id, action_type, is_active")
            .is("organization_id", null);
          if (globalRules && globalRules.length > 0) proposalRules = globalRules;
        }
      }
      // A decisao olha para a regra DESTA fase e DESTA accao -- nao para "a
      // organizacao tem regras nesta tabela". A primeira versao desta correcção
      // usava o criterio largo e tinha uma regressao latente: bastava alguem
      // acrescentar um `create_task` numa fase qualquer para a organizacao
      // passar a contar como "configurada", nao haver `create_contract` activo
      // nesta fase, e a criacao de contratos parar por completo -- por causa de
      // uma alteracao sem relacao nenhuma, e sem sinal nenhum.
      const contractRuleForStage = (proposalRules ?? []).find(
        (r: any) => r.stage_id === new_stage_id && r.action_type === "create_contract",
      );
      // Quem manda e a ACCAO configurada, e so ela. A flag `is_won` diz que a
      // proposta foi ganha -- nao diz que dai tem de nascer um contrato. Sao
      // duas afirmacoes diferentes, e so a segunda e uma decisao de automacao.
      //
      // Ate 2026-08-31 isto recorria ao `is_won` quando nao havia regra, o que
      // mantinha o mesmo defeito por outra porta: uma organizacao sem regra
      // nenhuma via contratos a nascer sem nada nesta tabela o explicar. O
      // recurso passa a ser a regra GLOBAL (`organization_id IS NULL`), que ja
      // e lida acima -- configuracao, tambem, e visivel no ecra.
      const shouldCreateContract = contractRuleForStage?.is_active === true;

      // As restantes accoes da cadeia configuradas nesta fase. A criacao do
      // contrato continua a ter o seu caminho proprio, mais abaixo, com as
      // guardas e os registos que ja tinha; aqui tratam-se as outras -- criar
      // Pedido, criar Orcamento, converter em Cliente -- que a UI passou a poder
      // oferecer e que este bloco nunca lia.
      if (proposal) {
        const outras = (proposalRules ?? []).filter(
          (r: any) => r.stage_id === new_stage_id && r.is_active === true && r.action_type !== "create_contract",
        );
        for (const r of outras) {
          try {
            const feito = await executarAccaoDaCadeia(r.action_type, {
              tipo: "proposal", id: proposal.id,
              organization_id: proposal.organization_id,
              root_organization_id: (proposal as any).root_organization_id,
              entity_id: proposal.entity_id,
              assigned_to: (proposal as any).assigned_to,
              created_by: proposal.created_by,
              titulo: proposal.title,
              valor: (proposal as any).value,
              deal_id: proposal.deal_id,
              quote_id: (proposal as any).quote_id,
              proposal_id: proposal.id,
            });
            if (feito) {
              results.stageActions++;
              results.logs.push({ type: r.action_type, status: "success", message: `${feito.alvo} ${feito.id} criado a partir da proposta` });
              await logWorkflowExecution({
                ruleId: null, sourceEntity: "proposal", sourceRecordId: proposal.id,
                targetEntity: feito.alvo, targetRecordId: feito.id,
                actionType: `config:proposal_${r.action_type}`, status: "success",
              });
            } else {
              results.logs.push({ type: r.action_type, status: "error", message: `Accao "${r.action_type}" nao esta implementada para o modulo proposta` });
              await logWorkflowExecution({
                ruleId: null, sourceEntity: "proposal", sourceRecordId: proposal.id,
                targetEntity: null, targetRecordId: null,
                actionType: `unimplemented:proposal_${r.action_type}`, status: "error",
                errorMessage: "Accao configurada na UI mas nao implementada no motor para o modulo proposta",
              });
            }
          } catch (e: any) {
            results.logs.push({ type: r.action_type, status: "error", message: e.message });
            await logWorkflowExecution({
              ruleId: null, sourceEntity: "proposal", sourceRecordId: proposal.id,
              targetEntity: null, targetRecordId: null,
              actionType: `config:proposal_${r.action_type}`, status: "error",
              errorMessage: e.message,
            });
          }
        }
      }
      const contractActionType = "config:proposal_create_contract";

      // Detect "ganho"/"perdido" by the stage's own flag, never by its name —
      // the org can rename or recreate this stage (e.g. "aceite" vs
      // "accepted") and this must keep working without code changes.
      // A lead NAO fica ganha por a proposta ser ganha.
      //
      // Uma proposta aceite ainda nao e um cliente: pode nao chegar a contrato,
      // ou o contrato pode nao ser assinado. A lead so esta ganha quando de
      // facto se converteu em cliente -- e essa marcacao vive no caminho da
      // conversao (bloco do contrato assinado), onde acontece logo a seguir a
      // criar o cliente.
      //
      // Ate 31/08 marcava-se aqui tambem, o que dava leads "ganhas" sem cliente
      // nenhum do outro lado.
      // `lid` continua a ser resolvido: o bloco do contrato, mais abaixo, precisa
      // dele. So a marcacao como ganha e que saiu daqui.
      let lid: string | null = null;
      if (psi?.is_won === true && proposal) {
        lid = await resolveLeadFromPipeline("proposal", proposal.id);
      }

      // "A regra esta desligada e o motor respeitou-a" tem de ser distinguivel de
      // "o motor nunca correu". Sem isto, as duas parecem iguais: silencio.
      if (!shouldCreateContract && proposal && psi?.is_won === true) {
        const porque = contractRuleForStage
          ? "Regra create_contract desactivada para esta fase"
          : "Nenhuma regra create_contract configurada para esta fase";
        results.logs.push({ type: "create_contract_from_proposal", status: "skipped", message: porque });
        await logWorkflowExecution({
          ruleId: null,
          sourceEntity: "proposal",
          sourceRecordId: proposal.id,
          targetEntity: "contract",
          targetRecordId: null,
          actionType: "config:proposal_create_contract_skipped",
          status: "success",
          errorMessage: `${porque} (stage_id=${new_stage_id})`,
        });
      }

      if (shouldCreateContract && proposal) {
        try {
          // Duplicate-contract guard: a proposal can be re-sent into the won
          // stage more than once (retry, double click, race condition) —
          // never create a second client_contracts row for the same proposal.
          const { data: existingContract } = await supabase
            .from("client_contracts")
            .select("id")
            .eq("proposal_id", proposal.id)
            .is("deleted_at", null)
            .limit(1)
            .maybeSingle();

          if (existingContract?.id) {
            results.logs.push({ type: "create_contract_from_proposal", status: "skipped", message: `Contract ${existingContract.id} already exists for this proposal` });
          } else {
          // Create client_contract from proposal
          // Resolve entity_id: from proposal, then deal (some proposals are
          // created from a deal and only carry entity_id via deal_id, not on
          // the proposal row itself — without this fallback the contract is
          // created with entity_id = null and the client name can't be
          // resolved anywhere downstream, showing as "?" in the UI).
          let resolvedEntityId = proposal.entity_id || null;
          if (!resolvedEntityId && proposal.deal_id) {
            const { data: dealForEntity } = await supabase.from("deals").select("entity_id").eq("id", proposal.deal_id).single();
            resolvedEntityId = dealForEntity?.entity_id || null;
          }
          const resolvedOrgId = proposal.organization_id || orgId;
          const resolvedRootOrgId = proposal.root_organization_id || resolvedOrgId;

          // Resolve client_id from anew_clients via entity_id (scoped to this
          // proposal's organization — an entity can have anew_clients rows in
          // more than one org, so an unscoped lookup could pick another
          // tenant's client id here).
          let clientId = null;
          if (resolvedEntityId) {
            const { data: anewClient } = await supabase
              .from("anew_clients")
              .select("id")
              .eq("entity_id", resolvedEntityId)
              .eq("organization_id", resolvedOrgId)
              .maybeSingle();
            clientId = anewClient?.id || null;
          }

          // Get linked quote via pipeline_links
          let linkedQuoteId = null;
          const { data: pLink } = await supabase
            .from("pipeline_links")
            .select("quote_id")
            .eq("proposal_id", proposal.id)
            .eq("status", "active")
            .maybeSingle();
          if (pLink?.quote_id) linkedQuoteId = pLink.quote_id;

          // contractValue: proposals.value é a fonte de verdade sincronizada
          // (trigger trg_sync_proposal_value_from_quote / calculate_proposal_value_from_quotes,
          // ver migration 20261113060000_fix_proposal_value_trigger_estado.sql). Só recorremos
          // a outras fontes se vier vazio/zero — nunca prevalecem sobre um valor já sincronizado
          // (proposal_items é só um snapshot estático e pode divergir por arredondamento).
          let contractValue = Number(proposal.value) || 0;

          if (!contractValue && linkedQuoteId) {
            const { data: qt } = await supabase.from("quotes").select("total").eq("id", linkedQuoteId).maybeSingle();
            if (qt?.total != null) {
              contractValue = Number(qt.total);
            } else {
              const { data: ql } = await supabase.from("quote_lines").select("total_com_iva").eq("quote_id", linkedQuoteId);
              if (ql && ql.length > 0) {
                contractValue = ql.reduce((s: number, l: any) => s + (Number(l.total_com_iva) || 0), 0);
              }
            }
          }

          if (!contractValue) {
            const { data: pi } = await supabase.from("proposal_items").select("*").eq("proposal_id", proposal.id).order("sort_order");
            if (pi && pi.length > 0) {
              contractValue = pi.reduce((s: number, i: any) => s + (Number(i.total) || (Number(i.quantity) * Number(i.unit_price) * (1 + (Number(i.vat_rate) || 0) / 100))), 0);
            }
          }

          // Get entity name for notes
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
              proposal_id: proposal.id,
              quote_id: linkedQuoteId,
              organization_id: resolvedOrgId,
              root_organization_id: resolvedRootOrgId,
              created_by: internalUserId || proposal.created_by,
              status: "draft",
              total_value: contractValue,
              start_date: startDate.toISOString().split("T")[0],
              end_date: endDate.toISOString().split("T")[0],
              notes: entityName ? `Contrato gerado automaticamente da proposta aceite - ${entityName}` : "Contrato gerado automaticamente da proposta aceite",
            } as any)
            .select("id")
            .single();

          if (cErr) throw cErr;

          // Update pipeline_links
          await upsertPipelineLink("proposal_id", proposal.id, {
            contract_id: contract!.id,
            organization_id: resolvedOrgId,
          });

          // Write back the contract onto the proposal's own dedicated column
          // (in addition to pipeline_links) so lookups like "Ver contrato"
          // don't depend solely on the cross-entity link table.
          await supabase.from("proposals").update({ client_contract_id: contract!.id }).eq("id", proposal.id);

          results.stageActions++;
          results.logs.push({ type: "create_contract_from_proposal", status: "success", message: `Contract ${contract!.id} created` });
          await logWorkflowExecution({
            ruleId: null,
            sourceEntity: "proposal",
            sourceRecordId: proposal.id,
            targetEntity: "contract",
            targetRecordId: contract!.id,
            actionType: contractActionType,
            status: "success",
          });
          } // end duplicate-contract guard (else branch)
        } catch (e: any) {
          results.logs.push({ type: "create_contract_from_proposal", status: "error", message: e.message });
          await logWorkflowExecution({
            ruleId: null,
            sourceEntity: "proposal",
            sourceRecordId: proposal.id,
            targetEntity: "contract",
            targetRecordId: null,
            actionType: contractActionType,
            status: "error",
            errorMessage: e.message,
          });
        }
      }

      if (psi?.is_lost === true && proposal) {
        try {
          if (proposal.deal_id) { const { data: ds } = await supabase.from("deal_stages").select("id").eq("name", "Desqualificado").maybeSingle(); if (ds) await supabase.from("deals").update({ stage_id: ds.id }).eq("id", proposal.deal_id); }
          const lid = await resolveLeadFromPipeline("proposal", proposal.id); if (lid) await syncLeadToStage(lid, "perdido");
          await supabase.from("pipeline_links").update({ status: "rejected" }).eq("proposal_id", proposal.id).eq("status", "active");
          if (lid) {
            await logWorkflowExecution({
              ruleId: null,
              sourceEntity: "proposal",
              sourceRecordId: proposal.id,
              targetEntity: "lead",
              targetRecordId: lid,
              actionType: "hardcoded:proposal_rejected_lead_sync_perdido",
              status: "success",
            });
          }
        } catch (e: any) {
          results.logs.push({ type: "proposal_rejected_lead_sync", status: "error", message: e.message });
          await logWorkflowExecution({
            ruleId: null,
            sourceEntity: "proposal",
            sourceRecordId: proposal.id,
            targetEntity: "lead",
            targetRecordId: null,
            actionType: "hardcoded:proposal_rejected_lead_sync_perdido",
            status: "error",
            errorMessage: e.message,
          });
        }
      }
    }

    // 4. QUOTE STAGE ACTIONS
    if (source_entity === "quote" && new_stage_id && orgId) {
      const { data: quote } = await supabase.from("quotes").select("*").eq("id", entity_id).single();
      
      if (quote) {
        // Check for configured stage actions (e.g. "aceite" → create_proposal)
        // new_stage_id for quotes is the estado string (e.g. "aceite", "perdido")
        const { data: quoteStageObj } = await supabase
          .from("quote_workflow_stages")
          .select("id")
          .eq("name", new_stage_id)
          .maybeSingle();

        if (quoteStageObj) {
          // Try org-specific actions first, then global
          let { data: qsa } = await supabase
            .from("quote_stage_actions")
            .select("*")
            .eq("stage_id", quoteStageObj.id)
            .eq("organization_id", orgId)
            .eq("is_active", true)
            .order("execution_order");
          
          if (!qsa || qsa.length === 0) {
            const { data: globalQsa } = await supabase
              .from("quote_stage_actions")
              .select("*")
              .eq("stage_id", quoteStageObj.id)
              .is("organization_id", null)
              .eq("is_active", true)
              .order("execution_order");
            if (globalQsa && globalQsa.length > 0) qsa = globalQsa;
          }

          if (qsa && qsa.length > 0) {
            for (const action of qsa) {
              try {
                if (action.action_type === "create_proposal") {
                  // Guarda de idempotencia. Este caminho e o gatilho SQL
                  // `trg_auto_proposal_from_quote` fazem os DOIS a mesma coisa, e o
                  // gatilho ja provocou um incidente real a 2026-08-05: proposta
                  // duplicada e o orcamento re-parentado para longe da proposta
                  // acabada de assinar (ver migration 20261111530000). O gatilho
                  // ganhou entao a sua guarda; este lado nunca teve nenhuma, e
                  // so estava protegido pela ordem por que as duas coisas correm.
                  //
                  // Com esta guarda, nenhuma ordem de execucao consegue produzir
                  // duas propostas -- que e a condicao para se poder desligar o
                  // gatilho mais tarde sem partir nada.
                  const { data: quoteAgora } = await supabase.from("quotes").select("proposal_id").eq("id", quote.id).maybeSingle();
                  const { data: ligacaoExistente } = await supabase.from("pipeline_links").select("proposal_id").eq("quote_id", quote.id).not("proposal_id", "is", null).limit(1).maybeSingle();
                  const jaTemProposta = quoteAgora?.proposal_id || ligacaoExistente?.proposal_id;
                  if (jaTemProposta) {
                    results.logs.push({ type: "create_proposal", status: "skipped", message: `Orcamento ja tem a proposta ${jaTemProposta}` });
                    await logWorkflowExecution({
                      ruleId: null,
                      sourceEntity: "quote",
                      sourceRecordId: quote.id,
                      targetEntity: "proposal",
                      targetRecordId: String(jaTemProposta),
                      actionType: "config:quote_create_proposal_skipped",
                      status: "success",
                      errorMessage: "Proposta ja existia -- criacao ignorada (guarda de idempotencia)",
                    });
                  } else {
                  // Get draft proposal stage
                  let ds: any = null;
                  const { data: d1 } = await supabase.from("proposal_workflow_stages").select("id").eq("name", "rascunho").maybeSingle(); ds = d1;
                  if (!ds) { const { data: d2 } = await supabase.from("proposal_workflow_stages").select("id").eq("name", "draft").maybeSingle(); ds = d2; }

                  // Resolve entity_id: from quote, then deal
                  let resolvedEntityId = (quote as any).entity_id || null;
                  if (!resolvedEntityId && quote.deal_id) {
                    const { data: dd } = await supabase.from("deals").select("entity_id").eq("id", quote.deal_id).single();
                    resolvedEntityId = dd?.entity_id || null;
                  }

                  // Get entity display name for title
                  let entityName = "Orçamento";
                  if (resolvedEntityId) {
                    const { data: ent } = await supabase.from("anew_entities").select("display_name").eq("id", resolvedEntityId).single();
                    if (ent) entityName = ent.display_name;
                  }

                  const { data: p, error: pErr } = await supabase.from("proposals").insert({
                    title: `Proposta - ${entityName}`,
                    deal_id: quote.deal_id,
                    organization_id: quote.organization_id,
                    root_organization_id: (quote as any).root_organization_id || quote.organization_id,
                    created_by: internalUserId || (quote as any).created_by,
                    entity_id: resolvedEntityId,
                    stage_id: ds?.id || null,
                    status: "draft",
                    value: (quote as any).total || 0,
                  } as any).select("id").single();

                  if (pErr) throw pErr;

                  // Copy quote lines to proposal items
                  const { data: ql } = await supabase.from("quote_lines").select("*").eq("quote_id", quote.id).order("ordem");
                  if (ql && ql.length > 0) {
                    await supabase.from("proposal_items").insert(ql.map((line: any, idx: number) => ({
                      proposal_id: p!.id,
                      description: line.descricao || line.description || "",
                      quantity: line.quantidade || line.quantity || 1,
                      unit_price: line.preco_unitario || line.unit_price || 0,
                      vat_rate: line.taxa_iva || 23,
                      subtotal: (line.quantidade || 1) * (line.preco_unitario || 0),
                      vat_amount: ((line.quantidade || 1) * (line.preco_unitario || 0)) * ((line.taxa_iva || 23) / 100),
                      total: ((line.quantidade || 1) * (line.preco_unitario || 0)) * (1 + (line.taxa_iva || 23) / 100),
                      sort_order: idx,
                    })));
                  }

                  // Update pipeline links
                  await upsertPipelineLink("quote_id", quote.id, {
                    proposal_id: p!.id,
                    organization_id: quote.organization_id,
                    root_organization_id: (quote as any).root_organization_id || quote.organization_id,
                  });
                  if (quote.deal_id) {
                    await upsertPipelineLink("deal_id", quote.deal_id, {
                      quote_id: quote.id,
                      proposal_id: p!.id,
                      organization_id: quote.organization_id,
                      root_organization_id: (quote as any).root_organization_id || quote.organization_id,
                    });
                  }

                  results.stageActions++;
                  results.logs.push({ type: "create_proposal", status: "success", message: `Proposta criada: ${p!.id}` });
                  } // fim da guarda de idempotencia
                } else {
                  const feito = await executarAccaoDaCadeia(action.action_type, {
                    tipo: "quote", id: quote.id,
                    organization_id: quote.organization_id,
                    root_organization_id: (quote as any).root_organization_id,
                    entity_id: quote.entity_id,
                    assigned_to: (quote as any).assigned_to,
                    created_by: quote.created_by,
                    valor: quote.total,
                    deal_id: quote.deal_id,
                    quote_id: quote.id,
                    proposal_id: (quote as any).proposal_id,
                  });
                  if (feito) {
                    results.stageActions++;
                    results.logs.push({ type: action.action_type, status: "success", message: `${feito.alvo} ${feito.id} criado a partir do orcamento` });
                    await logWorkflowExecution({
                      ruleId: null, sourceEntity: "quote", sourceRecordId: quote.id,
                      targetEntity: feito.alvo, targetRecordId: feito.id,
                      actionType: `config:quote_${action.action_type}`, status: "success",
                    });
                  } else {
                    results.logs.push({ type: action.action_type, status: "error", message: `Accao "${action.action_type}" nao esta implementada para o modulo orcamento` });
                    await logWorkflowExecution({
                      ruleId: null, sourceEntity: "quote", sourceRecordId: quote.id,
                      targetEntity: null, targetRecordId: null,
                      actionType: `unimplemented:quote_${action.action_type}`, status: "error",
                      errorMessage: "Accao configurada na UI mas nao implementada no motor para o modulo orcamento",
                    });
                  }
                }
              } catch (e: any) {
                results.logs.push({ type: action.action_type, status: "error", message: e.message });
              }
            }
          }
        }

        // Handle "perdido" propagation
        if (new_stage_id === "perdido") {
          await supabase.from("pipeline_links").update({ status: "rejected" }).eq("quote_id", quote.id).eq("status", "active");
          if (quote.deal_id) {
            const { data: sibs } = await supabase.from("quotes").select("id, estado").eq("deal_id", quote.deal_id).neq("id", quote.id);
            if (!(sibs || []).some((q: any) => q.estado !== "perdido" && q.estado !== "cancelado")) {
              const { data: ds } = await supabase.from("deal_stages").select("id").eq("name", "Desqualificado").maybeSingle();
              if (ds) await supabase.from("deals").update({ stage_id: ds.id, lost_reason: "Todos os orçamentos recusados" }).eq("id", quote.deal_id);
              const lid = await resolveLeadFromPipeline("quote", quote.id); if (lid) await syncLeadToStage(lid, "perdido");
            }
          }
        }
      }
    }

    // 5. CONTRACT STATUS CHANGES
    if (source_entity === "contract" && new_stage_id) {
      const { data: contract } = await supabase.from("client_contracts").select("*").eq("id", entity_id).single();
      if (contract) {
        // "signed" (English, sent by pipeline-automation's finalize_contract) and
        // "assinado" (Portuguese, the only value the UI ever writes into
        // contract_stage_actions.stage_id) refer to the same logical stage.
        const signedAliases = ["signed", "assinado"];
        if (signedAliases.includes(new_stage_id)) {
          // Resolve configured contract_stage_actions for this org/stage, falling
          // back to a global (organization_id IS NULL) default row — same
          // org-then-global pattern used by lead/deal/quote stage actions above.
          let { data: csa } = await supabase
            .from("contract_stage_actions")
            .select("*")
            .eq("organization_id", contract.organization_id)
            .in("stage_id", signedAliases)
            .eq("is_active", true)
            .order("execution_order");
          if (!csa || csa.length === 0) {
            const { data: globalCsa } = await supabase
              .from("contract_stage_actions")
              .select("*")
              .is("organization_id", null)
              .in("stage_id", signedAliases)
              .eq("is_active", true)
              .order("execution_order");
            if (globalCsa && globalCsa.length > 0) csa = globalCsa;
          }
          const hasConvertToClient = (csa || []).some((a: any) => a.action_type === "convert_to_client");

          // As restantes accoes da cadeia configuradas para esta fase do contrato.
          // A conversao em cliente continua a ter o caminho proprio abaixo; aqui
          // tratam-se criar Pedido, criar Orcamento e criar Proposta, que a UI
          // passou a poder oferecer e que este bloco nunca lia.
          const outrasC = (csa || []).filter(
            (a: any) => a.is_active !== false && a.action_type !== "convert_to_client",
          );
          for (const a of outrasC) {
            try {
              const feito = await executarAccaoDaCadeia(a.action_type, {
                tipo: "contract", id: contract.id,
                organization_id: contract.organization_id,
                root_organization_id: (contract as any).root_organization_id,
                entity_id: contract.entity_id,
                assigned_to: (contract as any).assigned_to,
                created_by: contract.created_by,
                valor: (contract as any).total_value,
                quote_id: (contract as any).quote_id,
                proposal_id: (contract as any).proposal_id,
                client_id: (contract as any).client_id,
              });
              if (feito) {
                results.stageActions++;
                results.logs.push({ type: a.action_type, status: "success", message: `${feito.alvo} ${feito.id} criado a partir do contrato` });
                await logWorkflowExecution({
                  ruleId: null, sourceEntity: "contract", sourceRecordId: contract.id,
                  targetEntity: feito.alvo, targetRecordId: feito.id,
                  actionType: `config:contract_${a.action_type}`, status: "success",
                });
              } else {
                results.logs.push({ type: a.action_type, status: "error", message: `Accao "${a.action_type}" nao esta implementada para o modulo contrato` });
                await logWorkflowExecution({
                  ruleId: null, sourceEntity: "contract", sourceRecordId: contract.id,
                  targetEntity: null, targetRecordId: null,
                  actionType: `unimplemented:contract_${a.action_type}`, status: "error",
                  errorMessage: "Accao configurada na UI mas nao implementada no motor para o modulo contrato",
                });
              }
            } catch (e: any) {
              results.logs.push({ type: a.action_type, status: "error", message: e.message });
              await logWorkflowExecution({
                ruleId: null, sourceEntity: "contract", sourceRecordId: contract.id,
                targetEntity: null, targetRecordId: null,
                actionType: `config:contract_${a.action_type}`, status: "error",
                errorMessage: e.message,
              });
            }
          }

          let eId: string | null = null; let lid: string | null = null;
          // 1. Direct entity_id on contract
          if (contract.entity_id) eId = contract.entity_id;
          // 2. Try to resolve entity_id from anew_clients
          if (!eId && contract.client_id) {
            const { data: ac } = await supabase.from("anew_clients").select("entity_id").eq("id", contract.client_id).maybeSingle();
            if (ac?.entity_id) eId = ac.entity_id;
          }
          // 3. Try pipeline_links → deals
          if (!eId) { const { data: l } = await supabase.from("pipeline_links").select("lead_id, deal_id").eq("contract_id", contract.id).eq("status", "active").maybeSingle(); if (l?.deal_id) { const { data: d } = await supabase.from("deals").select("entity_id, lead_id").eq("id", l.deal_id).single(); if (d) { eId = d.entity_id; lid = d.lead_id; } } if (l?.lead_id) lid = l.lead_id; }
          if (!lid) lid = await resolveLeadFromPipeline("contract", contract.id);
          // 4. Fallback: contracts created via the manual "Novo Contrato" form
          // (rpc_create_client_contract) never write to pipeline_links.contract_id, so
          // resolveLeadFromPipeline above always returns null for them. Mirror the
          // entity_id join already used by evaluate_lead_signals_v2's has_signed_contract
          // signal (anew_leads.entity_id = client_contracts.entity_id) as a last resort.
          // Only auto-apply when unambiguous (exactly one still-open lead for this
          // entity, scoped to the contract's own organization); if more than one
          // candidate exists, log it instead of guessing which lead to convert.
          if (!lid && eId) {
            const { data: candidateLeads } = await supabase
              .from("anew_leads")
              .select("id, status, created_at")
              .eq("entity_id", eId)
              .eq("organization_id", contract.organization_id)
              .is("deleted_at", null)
              .not("status", "in", '("converted","archived","rejected")');
            if (candidateLeads && candidateLeads.length === 1) {
              lid = candidateLeads[0].id;
            } else if (candidateLeads && candidateLeads.length > 1) {
              await logWorkflowExecution({
                ruleId: null,
                sourceEntity: "contract",
                sourceRecordId: contract.id,
                targetEntity: "lead",
                targetRecordId: null,
                actionType: "diagnostic:contract_signed_lead_entity_fallback_ambiguous",
                status: "success",
                executionData: {
                  reason: "entity_id fallback found more than one open lead for this entity; skipped auto-conversion to avoid converting the wrong lead",
                  entity_id: eId,
                  candidate_lead_ids: candidateLeads.map((l: any) => l.id),
                },
              });
            }
          }
          console.log("[execute-workflow] Contract conversion - entity_id:", eId, "lead_id:", lid, "contract_id:", contract.id, "hasConvertToClient:", hasConvertToClient);

          // Resolve marketing origin (source/source_id/campaign_id) for the client
          // that will be created/reused below: prefer the resolved lead directly,
          // else fall back to the shared DB resolver (mirrors fn_resolve_client_marketing_origin).
          let originSource = null, originSourceId = null, originCampaignId = null;
          if (lid) {
            const { data: originLead } = await supabase.from("anew_leads").select("source, source_id, campaign_id").eq("id", lid).maybeSingle();
            if (originLead) { originSource = originLead.source; originSourceId = originLead.source_id; originCampaignId = originLead.campaign_id; }
          }
          if (!originSource && !originSourceId && !originCampaignId) {
            const { data: resolved } = await supabase.rpc("fn_resolve_client_marketing_origin", { p_entity_id: eId, p_organization_id: contract.organization_id });
            const row = Array.isArray(resolved) ? resolved[0] : resolved;
            if (row) { originSource = row.origin_source; originSourceId = row.origin_source_id; originCampaignId = row.origin_campaign_id; }
          }

          if (eId && !hasConvertToClient) {
            // No active contract_stage_actions row (org-specific or global) configures
            // convert_to_client for this stage — skip the conversion, but log it clearly
            // so this isn't a silent no-op.
            await logWorkflowExecution({
              ruleId: null,
              sourceEntity: "contract",
              sourceRecordId: contract.id,
              targetEntity: "client",
              targetRecordId: null,
              actionType: "config:contract_signed_client_conversion_skipped",
              status: "success",
              executionData: {
                reason: "No active contract_stage_actions row with action_type=convert_to_client for this organization/stage (nor a global fallback)",
                stage_id: new_stage_id,
                resolved_action_types: (csa || []).map((a: any) => a.action_type),
              },
            });
          }
          if (eId && hasConvertToClient) {
            try {
            const nowIso = new Date().toISOString();
            let resolvedClientId: string | null = contract.client_id || null;
            let fallbackContactOrgId: string | null = null;

            // Prefer client record in the same organization; fallback to same root org
            const { data: orgClient } = await supabase
              .from("anew_clients")
              .select("id, status, origin_source, origin_source_id, origin_campaign_id")
              .eq("entity_id", eId)
              .eq("organization_id", contract.organization_id)
              .maybeSingle();

            if (orgClient) {
              resolvedClientId = orgClient.id;
              if (orgClient.status !== "active") {
                await supabase.from("anew_clients").update({ status: "active" }).eq("id", orgClient.id);
              }
              if (!orgClient.origin_source && !orgClient.origin_source_id && !orgClient.origin_campaign_id && (originSource || originSourceId || originCampaignId)) {
                await supabase.from("anew_clients").update({ origin_source: originSource, origin_source_id: originSourceId, origin_campaign_id: originCampaignId }).eq("id", orgClient.id);
              }
            } else {
              const { data: rootClient } = await supabase
                .from("anew_clients")
                .select("id, organization_id, status, origin_source, origin_source_id, origin_campaign_id")
                .eq("entity_id", eId)
                .eq("root_organization_id", contract.root_organization_id || contract.organization_id)
                .maybeSingle();

              if (rootClient) {
                resolvedClientId = rootClient.id;
                fallbackContactOrgId = rootClient.organization_id || null;

                const clientUpdates: Record<string, any> = {};
                if (rootClient.status !== "active") {
                  clientUpdates.status = "active";
                }
                if (contract.organization_id && rootClient.organization_id !== contract.organization_id) {
                  // Keep a single client per root org, but move it to the contract org for visibility
                  clientUpdates.organization_id = contract.organization_id;
                }
                if (!rootClient.origin_source && !rootClient.origin_source_id && !rootClient.origin_campaign_id && (originSource || originSourceId || originCampaignId)) {
                  clientUpdates.origin_source = originSource;
                  clientUpdates.origin_source_id = originSourceId;
                  clientUpdates.origin_campaign_id = originCampaignId;
                }

                if (Object.keys(clientUpdates).length > 0) {
                  await supabase.from("anew_clients").update(clientUpdates).eq("id", rootClient.id);
                }
              } else {
                const { data: insertedClient } = await supabase
                  .from("anew_clients")
                  .insert({
                    entity_id: eId,
                    organization_id: contract.organization_id,
                    root_organization_id: contract.root_organization_id || contract.organization_id,
                    status: "active",
                    source_type: "contract",
                    source_id: contract.id,
                    created_by: internalUserId,
                    origin_source: originSource,
                    origin_source_id: originSourceId,
                    origin_campaign_id: originCampaignId,
                  })
                  .select("id")
                  .single();
                resolvedClientId = insertedClient?.id || null;
              }
            }

            if (resolvedClientId && contract.client_id !== resolvedClientId) {
              await supabase.from("client_contracts").update({ client_id: resolvedClientId }).eq("id", contract.id);
            }

            // Create/activate client entity role for the contract org
            const { data: existingClientRole } = await supabase
              .from("anew_entity_roles")
              .select("id")
              .eq("entity_id", eId)
              .eq("role", "client")
              .eq("organization_id", contract.organization_id)
              .maybeSingle();

            if (!existingClientRole) {
              await supabase.from("anew_entity_roles").insert({
                entity_id: eId,
                role: "client",
                status: "active",
                organization_id: contract.organization_id,
                source_type: "contract",
                source_id: contract.id,
                created_by: internalUserId,
              });
            } else {
              await supabase.from("anew_entity_roles").update({ status: "active" }).eq("id", existingClientRole.id);
            }

            // Deactivate contact role + contact record in contract org and fallback org (if client existed in root org)
            const orgIdsToSync = Array.from(new Set([contract.organization_id, fallbackContactOrgId].filter(Boolean)));

            let contactRoleUpdateQuery: any = supabase
              .from("anew_entity_roles")
              .update({ status: "inactive" })
              .eq("entity_id", eId)
              .eq("role", "contact");
            if (orgIdsToSync.length > 0) {
              contactRoleUpdateQuery = contactRoleUpdateQuery.in("organization_id", orgIdsToSync);
            }
            await contactRoleUpdateQuery;

            let contactStatusUpdateQuery: any = supabase
              .from("anew_contacts")
              .update({ status: "inactive", converted_at: nowIso })
              .eq("entity_id", eId);
            if (orgIdsToSync.length > 0) {
              contactStatusUpdateQuery = contactStatusUpdateQuery.in("organization_id", orgIdsToSync);
            }
            await contactStatusUpdateQuery;

            if (resolvedClientId) {
              let convertedRefQuery: any = supabase
                .from("anew_contacts")
                .update({ converted_to_client_id: resolvedClientId })
                .eq("entity_id", eId);
              if (orgIdsToSync.length > 0) {
                convertedRefQuery = convertedRefQuery.in("organization_id", orgIdsToSync);
              }

              const { error: convertedRefError } = await convertedRefQuery;
              if (convertedRefError) {
                console.warn("[execute-workflow] Could not set converted_to_client_id on anew_contacts:", convertedRefError.message);
              }
            }

            await logWorkflowExecution({
              ruleId: null,
              sourceEntity: "contract",
              sourceRecordId: contract.id,
              targetEntity: "client",
              targetRecordId: resolvedClientId,
              actionType: "config:contract_signed_client_conversion",
              status: "success",
            });
            } catch (e: any) {
              console.error("[execute-workflow] Contract signed client conversion failed:", e.message);
              await logWorkflowExecution({
                ruleId: null,
                sourceEntity: "contract",
                sourceRecordId: contract.id,
                targetEntity: "client",
                targetRecordId: null,
                actionType: "config:contract_signed_client_conversion",
                status: "error",
                errorMessage: e.message,
              });
            }
          }
          if (lid) {
            await supabase.from("anew_leads").update({ status: "converted" }).eq("id", lid);
            await syncLeadToStage(lid, "ganho");
            await logWorkflowExecution({
              ruleId: null,
              sourceEntity: "contract",
              sourceRecordId: contract.id,
              targetEntity: "lead",
              targetRecordId: lid,
              actionType: "hardcoded:contract_signed_lead_sync_ganho",
              status: "success",
            });
          }
        }
        if (new_stage_id === "cancelled" || new_stage_id === "cancelado") {
          const lid = await resolveLeadFromPipeline("contract", contract.id); if (lid) await syncLeadToStage(lid, "perdido");
          await supabase.from("pipeline_links").update({ status: "rejected" }).eq("contract_id", contract.id).eq("status", "active");
          if (lid) {
            await logWorkflowExecution({
              ruleId: null,
              sourceEntity: "contract",
              sourceRecordId: contract.id,
              targetEntity: "lead",
              targetRecordId: lid,
              actionType: "hardcoded:contract_cancelled_lead_sync_perdido",
              status: "success",
            });
          }
        }
      }
    }

    // 6. AUTOMATION RULES
    const { data: rules } = await supabase.from("workflow_automation_rules").select("*").eq("source_entity", source_entity).eq("is_active", true).or(`organization_id.eq.${orgId},organization_id.is.null`).order("execution_order");
    if (rules && rules.length > 0) {
      let si: any = null;
      if (new_stage_id) {
        const st = source_entity === "proposal" ? "proposal_workflow_stages" : source_entity === "lead" ? "lead_workflow_stages" : "deal_stages";
        // lead_workflow_stages has no is_won/is_lost columns — it uses
        // counts_as_converted/counts_as_lost instead.
        const wonCol = st === "lead_workflow_stages" ? "counts_as_converted" : "is_won";
        const lostCol = st === "lead_workflow_stages" ? "counts_as_lost" : "is_lost";
        const { data } = await supabase.from(st).select(`${wonCol}, ${lostCol}`).eq("id", new_stage_id).single();
        si = data ? { is_won: (data as any)[wonCol], is_lost: (data as any)[lostCol] } : null;
      }
      const stm: Record<string, string> = { proposal: "proposals", lead: "anew_leads", deal: "deals", quote: "quotes" };
      const { data: sd } = await supabase.from(stm[source_entity] || "deals").select("*").eq("id", entity_id).single();
      if (sd) {
        for (const rule of rules) {
          let exec = false;
          if (rule.trigger_type === "stage_change") {
            if (rule.trigger_stage_id === new_stage_id) exec = true;
            else if (!rule.trigger_stage_id) { const rn = rule.name.toLowerCase(); if (si?.is_won && (rn.includes("ganha") || rn.includes("won"))) exec = true; if (si?.is_lost && (rn.includes("perdida") || rn.includes("lost"))) exec = true; }
          }
          if (!exec) continue;
          const rf = rule.relationship_field || `${rule.target_entity}_id`;
          const tid = (sd as any)[rf]; if (!tid) continue;
          if (rule.action_type === "change_stage") {
            let tsid = rule.action_stage_id;
            if (!tsid) {
              const tst = rule.target_entity === "proposal" ? "proposal_workflow_stages" : rule.target_entity === "lead" ? "lead_workflow_stages" : "deal_stages";
              // lead_workflow_stages has no is_won/is_lost columns — it uses
              // counts_as_converted/counts_as_lost instead.
              const wonCol = tst === "lead_workflow_stages" ? "counts_as_converted" : "is_won";
              const lostCol = tst === "lead_workflow_stages" ? "counts_as_lost" : "is_lost";
              // deal_stages has no organization_id (global only); proposal_workflow_stages
              // and lead_workflow_stages can have both a global row and an org-specific
              // override, so scope to the org and prefer the org-specific row (ordered
              // non-null first, limit 1) — otherwise .maybeSingle() errors on >1 rows.
              const scopeToOrg = tst !== "deal_stages";
              if (si?.is_won) {
                let q = supabase.from(tst).select("id").eq(wonCol, true);
                if (scopeToOrg) q = q.or(`organization_id.eq.${orgId},organization_id.is.null`).order("organization_id", { ascending: false, nullsFirst: false }).limit(1);
                const { data: w } = await q.maybeSingle();
                tsid = w?.id;
              } else if (si?.is_lost) {
                let q = supabase.from(tst).select("id").eq(lostCol, true);
                if (scopeToOrg) q = q.or(`organization_id.eq.${orgId},organization_id.is.null`).order("organization_id", { ascending: false, nullsFirst: false }).limit(1);
                const { data: l } = await q.maybeSingle();
                tsid = l?.id;
              }
            }
            if (tsid) {
              const tt = rule.target_entity === "proposal" ? "proposals" : rule.target_entity === "lead" ? "anew_leads" : "deals";
              const sf = rule.target_entity === "lead" ? "workflow_stage_id" : "stage_id";
              const { error } = await supabase.from(tt).update({ [sf]: tsid } as any).eq("id", tid);
              if (!error) results.automationRules++;
              await logWorkflowExecution({
                ruleId: rule.id,
                sourceEntity: source_entity,
                sourceRecordId: entity_id,
                targetEntity: rule.target_entity,
                targetRecordId: tid,
                actionType: rule.action_type,
                status: error ? "error" : "success",
                errorMessage: error?.message || null,
              });
            }
          }
        }
      }
    }

    // 7. TRIGGER EMAIL TEMPLATES (auto/semi-auto)
    if (new_stage_id && orgId) {
      try {
        // Resolve the stage name for the trigger
        let phaseName = new_stage_id; // For quotes, new_stage_id is already the estado string
        if (source_entity === "lead") {
          const { data: s } = await supabase.from("lead_workflow_stages").select("name").eq("id", new_stage_id).maybeSingle();
          if (s) phaseName = s.name;
        } else if (source_entity === "proposal") {
          const { data: s } = await supabase.from("proposal_workflow_stages").select("name").eq("id", new_stage_id).maybeSingle();
          if (s) phaseName = s.name;
        } else if (source_entity === "deal") {
          const { data: s } = await supabase.from("deal_stages").select("name").eq("id", new_stage_id).maybeSingle();
          if (s) phaseName = s.name;
        }

        // Map source_entity to template module names
        const moduleMap: Record<string, string> = { lead: "leads", proposal: "proposals", quote: "quotes", deal: "deals", contract: "contracts" };
        const moduleName = moduleMap[source_entity] || source_entity;

        await fetch(`${supabaseUrl}/functions/v1/trigger-email-template`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({ entity_type: moduleName, entity_id, new_phase: phaseName, organization_id: orgId, triggered_by }),
        });
      } catch (e: any) {
        console.error("Error triggering email templates:", e.message);
        results.logs.push({ type: "trigger_email_template", status: "error", message: e.message });
      }
    }

    return new Response(JSON.stringify({ success: true, ...results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("Workflow execution error:", error);
    await captureError(error, { function: "execute-workflow" });
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
