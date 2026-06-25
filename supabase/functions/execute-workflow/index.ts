import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCallerIdentity, validateOrgScope, authErrorResponse } from "../_shared/auth.ts";
import { z } from "npm:zod";
import { syncEntityPrimaryAddressFromLead } from "../_shared/addressSanitization.ts";
import {
  getWorkflowPermissionForSourceEntity,
  resolveWorkflowOrganizationFromRecord,
} from "../_shared/leadsValidation.ts";
import { corsHeaders } from "../_shared/cors.ts";

const requestSchema = z.object({
  source_entity: z.string(),
  entity_id: z.string(),
  new_stage_id: z.string().optional(),
  old_stage_id: z.string().optional(),
  organization_id: z.string().optional(),
  triggered_by: z.string().optional(),
});

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

    const results = { automationRules: 0, stageActions: 0, logs: [] as Array<{ type: string; status: string; message: string }> };

    // Helper functions
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
                const { data: ec } = await supabase.from("anew_clients").select("id").eq("entity_id", lead.entity_id).eq("organization_id", lead.organization_id).maybeSingle();
                let clientId = ec?.id;
                if (!ec) {
                  const { data: newClient, error: createClientError } = await supabase.from("anew_clients").insert([{ entity_id: lead.entity_id, organization_id: lead.organization_id, root_organization_id: lead.root_organization_id || lead.organization_id, source_type: sourceContactId ? "contact" : "workflow_automation", source_id: sourceContactId, status: "active", created_by: internalUserId, assigned_to: resolvedAssignedTo }]).select("id").single();
                  if (createClientError) throw createClientError;
                  clientId = newClient?.id;
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
                  .update({ status: "converted", converted_at: new Date().toISOString(), converted_by: internalUserId })
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
            } catch (e: any) { results.logs.push({ type: "create_deal_from_lead", status: "error", message: e.message }); }
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
      const { data: sa } = await supabase.from("deal_stage_actions").select("*").eq("organization_id", orgId).eq("stage_id", new_stage_id).eq("is_active", true).order("execution_order");
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
      const psn = psi?.name || "";

      if (psn === "accepted" && proposal) {
        try {
          // Create client_contract from proposal
          const resolvedEntityId = proposal.entity_id || null;
          const resolvedOrgId = proposal.organization_id || orgId;
          const resolvedRootOrgId = proposal.root_organization_id || resolvedOrgId;

          // Resolve client_id from anew_clients via entity_id
          let clientId = null;
          if (resolvedEntityId) {
            const { data: anewClient } = await supabase
              .from("anew_clients")
              .select("id")
              .eq("entity_id", resolvedEntityId)
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

          // Get proposal items for contract value
          const { data: pi } = await supabase.from("proposal_items").select("*").eq("proposal_id", proposal.id).order("sort_order");
          let contractValue = proposal.value || 0;
          if (pi && pi.length > 0) {
            contractValue = pi.reduce((s: number, i: any) => s + (Number(i.total) || (Number(i.quantity) * Number(i.unit_price) * (1 + (Number(i.vat_rate) || 0) / 100))), 0);
          }

          // If no proposal_items, use quote.total (already includes global discount + IVA)
          if ((!pi || pi.length === 0) && linkedQuoteId) {
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

          // Sync lead to "ganho" stage
          const lid = await resolveLeadFromPipeline("proposal", proposal.id);
          if (lid) await syncLeadToStage(lid, "ganho");

          results.stageActions++;
          results.logs.push({ type: "create_contract_from_proposal", status: "success", message: `Contract ${contract!.id} created` });
        } catch (e: any) { results.logs.push({ type: "create_contract_from_proposal", status: "error", message: e.message }); }
      }

      if (psn === "rejected" && proposal) {
        if (proposal.deal_id) { const { data: ds } = await supabase.from("deal_stages").select("id").eq("name", "Desqualificado").maybeSingle(); if (ds) await supabase.from("deals").update({ stage_id: ds.id }).eq("id", proposal.deal_id); }
        const lid = await resolveLeadFromPipeline("proposal", proposal.id); if (lid) await syncLeadToStage(lid, "perdido");
        await supabase.from("pipeline_links").update({ status: "rejected" }).eq("proposal_id", proposal.id).eq("status", "active");
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
        if (new_stage_id === "signed" || new_stage_id === "assinado") {
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
          console.log("[execute-workflow] Contract conversion - entity_id:", eId, "lead_id:", lid, "contract_id:", contract.id);
          if (eId) {
            const nowIso = new Date().toISOString();
            let resolvedClientId: string | null = contract.client_id || null;
            let fallbackContactOrgId: string | null = null;

            // Prefer client record in the same organization; fallback to same root org
            const { data: orgClient } = await supabase
              .from("anew_clients")
              .select("id, status")
              .eq("entity_id", eId)
              .eq("organization_id", contract.organization_id)
              .maybeSingle();

            if (orgClient) {
              resolvedClientId = orgClient.id;
              if (orgClient.status !== "active") {
                await supabase.from("anew_clients").update({ status: "active" }).eq("id", orgClient.id);
              }
            } else {
              const { data: rootClient } = await supabase
                .from("anew_clients")
                .select("id, organization_id, status")
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
          }
          if (lid) { await supabase.from("anew_leads").update({ status: "converted" }).eq("id", lid); await syncLeadToStage(lid, "ganho"); }
        }
        if (new_stage_id === "cancelled" || new_stage_id === "cancelado") {
          const lid = await resolveLeadFromPipeline("contract", contract.id); if (lid) await syncLeadToStage(lid, "perdido");
          await supabase.from("pipeline_links").update({ status: "rejected" }).eq("contract_id", contract.id).eq("status", "active");
        }
      }
    }

    // 6. AUTOMATION RULES
    const { data: rules } = await supabase.from("workflow_automation_rules").select("*").eq("source_entity", source_entity).eq("is_active", true).or(`organization_id.eq.${orgId},organization_id.is.null`).order("execution_order");
    if (rules && rules.length > 0) {
      let si: any = null;
      if (new_stage_id) { const st = source_entity === "proposal" ? "proposal_workflow_stages" : source_entity === "lead" ? "lead_workflow_stages" : "deal_stages"; const { data } = await supabase.from(st).select("is_won, is_lost").eq("id", new_stage_id).single(); si = data; }
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
            if (!tsid) { const tst = rule.target_entity === "proposal" ? "proposal_workflow_stages" : rule.target_entity === "lead" ? "lead_workflow_stages" : "deal_stages"; if (si?.is_won) { const { data: w } = await supabase.from(tst).select("id").eq("is_won", true).maybeSingle(); tsid = w?.id; } else if (si?.is_lost) { const { data: l } = await supabase.from(tst).select("id").eq("is_lost", true).maybeSingle(); tsid = l?.id; } }
            if (tsid) { const tt = rule.target_entity === "proposal" ? "proposals" : rule.target_entity === "lead" ? "anew_leads" : "deals"; const sf = rule.target_entity === "lead" ? "workflow_stage_id" : "stage_id"; const { error } = await supabase.from(tt).update({ [sf]: tsid } as any).eq("id", tid); if (!error) results.automationRules++; await supabase.from("workflow_execution_log").insert([{ rule_id: rule.id, source_entity: source_entity, source_record_id: entity_id, target_entity: rule.target_entity, target_record_id: tid, action_type: rule.action_type, status: error ? "error" : "success", error_message: error?.message || null, executed_by: triggered_by }]); }
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
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
