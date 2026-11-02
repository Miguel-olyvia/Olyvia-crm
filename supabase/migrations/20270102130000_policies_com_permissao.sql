-- ============================================================
-- 20270102130000_policies_com_permissao
-- ============================================================
-- O que faz
--   Policies de escrita que só verificavam a organização (ou nem isso)
--   passam a exigir TAMBÉM a permissão que o ecrã correspondente já usa.
--   A condição de organização mantém-se tal como estava (ALTER POLICY com o
--   mesmo texto + a permissão). As leituras (SELECT) não mudam.
--
--   Estilo: has_anew_permission(auth.uid(), código) -- o mesmo das policies
--   irmãs já existentes (purchase_orders, products, roles, quotes...). Não se
--   usa has_anew_permission_in_org aqui porque estas policies aceitam as orgs
--   da hierarquia (get_user_visible_org_ids) e exigir membership direta na
--   org da linha cortaria o acesso de quem trabalha a partir da org-mãe.
--
--   fn_tem_alguma_permissao(text[]): verdadeiro se quem chama tem pelo menos
--   uma das permissões (para escritas partilhadas por vários ecrãs).
--
-- Escritores verificados (src/, supabase/functions, funções vivas):
--   purchase_order_items     só RPCs SECURITY DEFINER (frontend só lê)
--   product_stock            só RPCs/triggers definer (frontend não escreve)
--   price_contexts           ninguém escreve no frontend
--   product_attribute_orgs   ninguém escreve no frontend
--   proposal_items           RPCs definer + edges service_role
--   proposal_templates       ProposalTemplates (proposals.manage),
--                            QuoteTemplates (rota quotes.manage)
--   quote_templates/_items   QuoteModels/QuoteTemplateEditor
--                            (quote_templates.*) e "Guardar como modelo" do
--                            QuoteBuilder (quem escreve orçamentos)
--   custom_contract_variables  ContractTemplates, só com canManage
--                            (client_contracts.manage_templates)
--   contract_sends           envio por email/WhatsApp no ecrã de contratos
--                            (canSendSignature = system admin ou
--                            client_contracts.send_signature)
--   lead_* de configuração   LeadWorkflowConfig / LeadAISchedulingRulesConfig,
--   e lead_contact_results   abertos só com PermissionGate leads.config
--   email_templates          EmailTemplates (email_templates.create/
--                            duplicate/edit/delete)
--   organization_smtp_settings  INSERT só via rpc_upsert_org_smtp_settings
--                            (definer); UPDATE/DELETE já exigiam settings.update
--   organization_teams(_members)  OrganizationDetail, canManage =
--                            organizations.edit
--   form_fields/form_steps   Forms/FormBuilder (forms.*) e campos de campanha
--                            (CampaignFieldsConfig/FieldOptionIcons,
--                            campaigns.*); passam a exigir também que o
--                            formulário seja de uma org visível (antes:
--                            qualquer utilizador autenticado, de qualquer org)
--   help_articles            nenhum ecrã escreve; leitura mantém-se para
--                            autenticados
--   client_portal_documents  só a edge create-client-portal-access
--                            (service_role) e RPCs definer escrevem
--   anew_entity_roles        AnewClients (criar/converter/estado/apagar
--                            clientes), AnewLeads (importação); edges com
--                            service_role
--   anew_entity_relationships  ninguém escreve no frontend
--   proposals UPDATE         o ramo "criador" passa a exigir proposals.edit
--                            (o WITH CHECK, can_write_proposal_row, já o
--                            exigia: na prática nada muda para quem grava)
--   quotes INSERT            frontend não insere (rpc_save_quote, definer);
--                            edges com service_role
--
-- NÃO alterado (ver relatório): anew_entities.authenticated_insert_anew_entities,
--   contract_stage_actions, user_creation_templates, lead_field_definitions.
--
-- Funções SECURITY DEFINER e service_role não são afetadas por RLS.
-- Sem tabelas nem colunas novas.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_tem_alguma_permissao(p_codes text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.anew_users au
    JOIN public.anew_memberships am
      ON am.user_id = au.id
     AND am.status = 'active'
    JOIN public.anew_role_permissions arp
      ON arp.role_id = am.role_id
     AND arp.permission_code = ANY (p_codes)
    WHERE au.auth_user_id = auth.uid()
  )
$$;

REVOKE ALL ON FUNCTION public.fn_tem_alguma_permissao(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tem_alguma_permissao(text[]) TO authenticated;

-- ── purchase_order_items ────────────────────────────────────────────────────
ALTER POLICY "Users can insert purchase order items" ON public.purchase_order_items
  WITH CHECK ((EXISTS ( SELECT 1 FROM purchase_orders po
     WHERE ((po.id = purchase_order_items.purchase_order_id) AND (po.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)))))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['purchase_orders.create','purchase_orders.edit'])));
ALTER POLICY "Users can update purchase order items" ON public.purchase_order_items
  USING ((EXISTS ( SELECT 1 FROM purchase_orders po
     WHERE ((po.id = purchase_order_items.purchase_order_id) AND (po.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)))))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'purchase_orders.edit')));
ALTER POLICY "Users can delete purchase order items" ON public.purchase_order_items
  USING ((EXISTS ( SELECT 1 FROM purchase_orders po
     WHERE ((po.id = purchase_order_items.purchase_order_id) AND (po.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)))))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['purchase_orders.edit','purchase_orders.delete'])));

-- ── product_stock ───────────────────────────────────────────────────────────
ALTER POLICY auth_insert_product_stock ON public.product_stock
  WITH CHECK ((product_id IN ( SELECT products.id FROM products
     WHERE (products.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['inventory.edit','inventory.adjust'])));
ALTER POLICY auth_update_product_stock ON public.product_stock
  USING ((product_id IN ( SELECT products.id FROM products
     WHERE (products.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['inventory.edit','inventory.adjust'])));
ALTER POLICY auth_delete_product_stock ON public.product_stock
  USING ((product_id IN ( SELECT products.id FROM products
     WHERE (products.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['inventory.edit','inventory.delete'])));

-- ── price_contexts: o ALL (que também dava SELECT) passa a I/U/D; o SELECT
--    continua coberto por price_contexts_select (org nula ou visível). ──────
DROP POLICY IF EXISTS price_contexts_manage ON public.price_contexts;
CREATE POLICY price_contexts_insert ON public.price_contexts FOR INSERT TO authenticated
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'products.manage_prices')));
CREATE POLICY price_contexts_update ON public.price_contexts FOR UPDATE TO authenticated
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'products.manage_prices')))
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'products.manage_prices')));
CREATE POLICY price_contexts_delete ON public.price_contexts FOR DELETE TO authenticated
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'products.manage_prices')));

-- ── product_attribute_organizations ─────────────────────────────────────────
ALTER POLICY auth_insert_product_attribute_organizations ON public.product_attribute_organizations
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['products.edit','products.manage_attributes'])));
ALTER POLICY auth_update_product_attribute_organizations ON public.product_attribute_organizations
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['products.edit','products.manage_attributes'])));
ALTER POLICY auth_delete_product_attribute_organizations ON public.product_attribute_organizations
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['products.edit','products.manage_attributes'])));

-- ── proposal_items ──────────────────────────────────────────────────────────
ALTER POLICY proposal_items_insert ON public.proposal_items
  WITH CHECK ((proposal_id IN ( SELECT proposals.id FROM proposals
     WHERE ((proposals.organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) OR (proposals.organization_id IS NULL) OR (proposals.created_by = ( SELECT anew_users.id FROM anew_users WHERE (anew_users.auth_user_id = ( SELECT auth.uid() AS uid)) LIMIT 1)))))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['proposals.create','proposals.edit'])));
ALTER POLICY proposal_items_update ON public.proposal_items
  USING ((proposal_id IN ( SELECT proposals.id FROM proposals
     WHERE ((proposals.organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) OR (proposals.organization_id IS NULL) OR (proposals.created_by = ( SELECT anew_users.id FROM anew_users WHERE (anew_users.auth_user_id = ( SELECT auth.uid() AS uid)) LIMIT 1)))))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'proposals.edit')));
ALTER POLICY proposal_items_delete ON public.proposal_items
  USING ((proposal_id IN ( SELECT proposals.id FROM proposals
     WHERE ((proposals.organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) OR (proposals.organization_id IS NULL) OR (proposals.created_by = ( SELECT anew_users.id FROM anew_users WHERE (anew_users.auth_user_id = ( SELECT auth.uid() AS uid)) LIMIT 1)))))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['proposals.edit','proposals.delete'])));

-- ── proposal_templates ──────────────────────────────────────────────────────
ALTER POLICY auth_insert_proposal_templates ON public.proposal_templates
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['proposals.manage','quotes.manage'])));
ALTER POLICY auth_update_proposal_templates ON public.proposal_templates
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['proposals.manage','quotes.manage'])));
ALTER POLICY auth_delete_proposal_templates ON public.proposal_templates
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['proposals.manage','quotes.manage'])));

-- ── quote_templates ─────────────────────────────────────────────────────────
-- INSERT: quote_templates.create, ou quem escreve orçamentos ("Guardar como
-- modelo" do QuoteBuilder não tem gate próprio). DELETE: quote_templates.delete
-- ou o próprio criador (o QuoteBuilder apaga o modelo que acabou de criar se
-- as linhas falharem).
ALTER POLICY "Users can create quote templates" ON public.quote_templates
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['quote_templates.create','quotes.create','quotes.edit'])));
ALTER POLICY "Users can update quote templates" ON public.quote_templates
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'quote_templates.edit')));
ALTER POLICY "Users can delete quote templates" ON public.quote_templates
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND ((SELECT public.has_anew_permission((SELECT auth.uid()), 'quote_templates.delete'))
         OR created_by = (SELECT public.current_business_user_id())));

ALTER POLICY org_insert_quote_template_items ON public.quote_template_items
  WITH CHECK ((EXISTS ( SELECT 1 FROM quote_templates
     WHERE ((quote_templates.id = quote_template_items.template_id) AND (quote_templates.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)))))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['quote_templates.create','quote_templates.edit','quotes.create','quotes.edit'])));
ALTER POLICY org_update_quote_template_items ON public.quote_template_items
  USING ((EXISTS ( SELECT 1 FROM quote_templates
     WHERE ((quote_templates.id = quote_template_items.template_id) AND (quote_templates.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)))))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'quote_templates.edit')));
ALTER POLICY org_delete_quote_template_items ON public.quote_template_items
  USING ((EXISTS ( SELECT 1 FROM quote_templates
     WHERE ((quote_templates.id = quote_template_items.template_id) AND (quote_templates.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)))))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['quote_templates.edit','quote_templates.delete'])));

-- ── custom_contract_variables ───────────────────────────────────────────────
ALTER POLICY custom_vars_insert ON public.custom_contract_variables
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'client_contracts.manage_templates')));
ALTER POLICY custom_vars_update ON public.custom_contract_variables
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'client_contracts.manage_templates')));
ALTER POLICY custom_vars_delete ON public.custom_contract_variables
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'client_contracts.manage_templates')));

-- ── contract_sends (registo de envios do contrato) ──────────────────────────
ALTER POLICY "Authenticated users can insert contract sends" ON public.contract_sends
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))
    AND ((SELECT public.fn_tem_alguma_permissao(ARRAY['client_contracts.send_signature','client_contracts.edit']))
         OR (SELECT public.is_system_admin((SELECT auth.uid())))));

-- ── lead_* de configuração (leads.config) ───────────────────────────────────
DROP POLICY IF EXISTS auth_manage_lead_ai_scheduling_rules ON public.lead_ai_scheduling_rules;
CREATE POLICY auth_insert_lead_ai_scheduling_rules ON public.lead_ai_scheduling_rules FOR INSERT TO authenticated
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')));
CREATE POLICY auth_update_lead_ai_scheduling_rules ON public.lead_ai_scheduling_rules FOR UPDATE TO authenticated
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')))
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')));
CREATE POLICY auth_delete_lead_ai_scheduling_rules ON public.lead_ai_scheduling_rules FOR DELETE TO authenticated
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')));

ALTER POLICY authenticated_insert_lead_pipeline_settings ON public.lead_pipeline_settings
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')));
ALTER POLICY authenticated_update_lead_pipeline_settings ON public.lead_pipeline_settings
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')))
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')));
ALTER POLICY authenticated_delete_lead_pipeline_settings ON public.lead_pipeline_settings
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')));

ALTER POLICY authenticated_insert_lead_qualification_rules ON public.lead_qualification_rules
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')));
ALTER POLICY authenticated_update_lead_qualification_rules ON public.lead_qualification_rules
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')))
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')));
ALTER POLICY authenticated_delete_lead_qualification_rules ON public.lead_qualification_rules
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')));

ALTER POLICY anew_insert_lead_stage_actions ON public.lead_stage_actions
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')));
ALTER POLICY anew_update_lead_stage_actions ON public.lead_stage_actions
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')));
ALTER POLICY anew_delete_lead_stage_actions ON public.lead_stage_actions
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')));

ALTER POLICY anew_insert_lead_stage_transitions ON public.lead_stage_transitions
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')));
ALTER POLICY anew_update_lead_stage_transitions ON public.lead_stage_transitions
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')));
ALTER POLICY anew_delete_lead_stage_transitions ON public.lead_stage_transitions
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')));

ALTER POLICY anew_insert_lead_workflow_stages ON public.lead_workflow_stages
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')));
ALTER POLICY anew_update_lead_workflow_stages ON public.lead_workflow_stages
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')));
ALTER POLICY anew_delete_lead_workflow_stages ON public.lead_workflow_stages
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')));

ALTER POLICY anew_contact_results_insert ON public.lead_contact_results
  WITH CHECK (((organization_id IS NULL) OR (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')));
ALTER POLICY anew_contact_results_update ON public.lead_contact_results
  USING (((organization_id IS NULL) OR (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')));
ALTER POLICY anew_contact_results_delete ON public.lead_contact_results
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'leads.config')));

-- ── email_templates ─────────────────────────────────────────────────────────
ALTER POLICY "Users can insert templates in their org hierarchy" ON public.email_templates
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['email_templates.create','email_templates.duplicate'])));
ALTER POLICY "Users can update templates in their org hierarchy" ON public.email_templates
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'email_templates.edit')))
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'email_templates.edit')));
ALTER POLICY "Users can delete non-system templates in their org hierarchy" ON public.email_templates
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)) AND (is_system = false)
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'email_templates.delete')));

-- ── organization_smtp_settings (INSERT alinhado com UPDATE/DELETE) ──────────
ALTER POLICY org_smtp_insert ON public.organization_smtp_settings
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['settings.update','smtp.edit'])));

-- ── organization_teams / organization_team_members (organizations.edit) ─────
ALTER POLICY "Users can insert teams in visible orgs" ON public.organization_teams
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'organizations.edit')));
ALTER POLICY "Users can update teams in visible orgs" ON public.organization_teams
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'organizations.edit')))
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'organizations.edit')));
ALTER POLICY "Users can delete teams in visible orgs" ON public.organization_teams
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'organizations.edit')));

ALTER POLICY "Users can insert team members" ON public.organization_team_members
  WITH CHECK ((team_id IN ( SELECT organization_teams.id FROM organization_teams
     WHERE (organization_teams.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'organizations.edit')));
ALTER POLICY "Users can update team members" ON public.organization_team_members
  USING ((team_id IN ( SELECT ot.id FROM organization_teams ot
     WHERE (ot.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'organizations.edit')))
  WITH CHECK ((team_id IN ( SELECT ot.id FROM organization_teams ot
     WHERE (ot.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'organizations.edit')));
ALTER POLICY "Users can delete team members" ON public.organization_team_members
  USING ((team_id IN ( SELECT organization_teams.id FROM organization_teams
     WHERE (organization_teams.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'organizations.edit')));

-- ── form_fields / form_steps: o ALL "qualquer autenticado" passa a I/U/D com
--    formulário de org visível + permissão de formulários/campanhas. A leitura
--    pública ("Users can view form ...", USING true) fica igual. ──────────────
DROP POLICY IF EXISTS "Users can manage form fields" ON public.form_fields;
CREATE POLICY form_fields_insert ON public.form_fields FOR INSERT TO authenticated
  WITH CHECK ((EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_fields.form_id
                AND f.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['forms.create','forms.edit','campaigns.create','campaigns.edit'])));
CREATE POLICY form_fields_update ON public.form_fields FOR UPDATE TO authenticated
  USING ((EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_fields.form_id
                AND f.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['forms.create','forms.edit','campaigns.create','campaigns.edit'])))
  WITH CHECK ((EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_fields.form_id
                AND f.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['forms.create','forms.edit','campaigns.create','campaigns.edit'])));
CREATE POLICY form_fields_delete ON public.form_fields FOR DELETE TO authenticated
  USING ((EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_fields.form_id
                AND f.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['forms.create','forms.edit','forms.delete','campaigns.edit','campaigns.delete'])));

DROP POLICY IF EXISTS "Users can manage form steps" ON public.form_steps;
CREATE POLICY form_steps_insert ON public.form_steps FOR INSERT TO authenticated
  WITH CHECK ((EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_steps.form_id
                AND f.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['forms.create','forms.edit','campaigns.create','campaigns.edit'])));
CREATE POLICY form_steps_update ON public.form_steps FOR UPDATE TO authenticated
  USING ((EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_steps.form_id
                AND f.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['forms.create','forms.edit','campaigns.create','campaigns.edit'])))
  WITH CHECK ((EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_steps.form_id
                AND f.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['forms.create','forms.edit','campaigns.create','campaigns.edit'])));
CREATE POLICY form_steps_delete ON public.form_steps FOR DELETE TO authenticated
  USING ((EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_steps.form_id
                AND f.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['forms.create','forms.edit','forms.delete','campaigns.edit','campaigns.delete'])));

-- ── help_articles: leitura para autenticados (como antes), escrita com
--    settings.update / platform.settings.manage ───────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage help articles" ON public.help_articles;
CREATE POLICY help_articles_select_authenticated ON public.help_articles FOR SELECT TO authenticated
  USING (true);
CREATE POLICY help_articles_insert ON public.help_articles FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.fn_tem_alguma_permissao(ARRAY['settings.update','platform.settings.manage'])));
CREATE POLICY help_articles_update ON public.help_articles FOR UPDATE TO authenticated
  USING ((SELECT public.fn_tem_alguma_permissao(ARRAY['settings.update','platform.settings.manage'])))
  WITH CHECK ((SELECT public.fn_tem_alguma_permissao(ARRAY['settings.update','platform.settings.manage'])));
CREATE POLICY help_articles_delete ON public.help_articles FOR DELETE TO authenticated
  USING ((SELECT public.fn_tem_alguma_permissao(ARRAY['settings.update','platform.settings.manage'])));

-- ── client_portal_documents: o ALL dos membros passa a SELECT igual + I/U/D
--    com permissão de portal/documentos ──────────────────────────────────────
DROP POLICY IF EXISTS "Org members manage portal documents" ON public.client_portal_documents;
CREATE POLICY "Org members read portal documents" ON public.client_portal_documents FOR SELECT TO authenticated
  USING ((organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) AND portal_document_in_org(document_type, document_id, organization_id));
CREATE POLICY "Org members insert portal documents" ON public.client_portal_documents FOR INSERT TO authenticated
  WITH CHECK ((organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) AND portal_document_in_org(document_type, document_id, organization_id) AND portal_user_in_org(portal_user_id, organization_id)
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['portal.manage','client_contracts.edit','client_contracts.send_signature','proposals.edit'])));
CREATE POLICY "Org members update portal documents" ON public.client_portal_documents FOR UPDATE TO authenticated
  USING ((organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) AND portal_document_in_org(document_type, document_id, organization_id)
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['portal.manage','client_contracts.edit','client_contracts.send_signature','proposals.edit'])))
  WITH CHECK ((organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) AND portal_document_in_org(document_type, document_id, organization_id) AND portal_user_in_org(portal_user_id, organization_id)
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['portal.manage','client_contracts.edit','client_contracts.send_signature','proposals.edit'])));
CREATE POLICY "Org members delete portal documents" ON public.client_portal_documents FOR DELETE TO authenticated
  USING ((organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) AND portal_document_in_org(document_type, document_id, organization_id)
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['portal.manage','client_contracts.edit','client_contracts.send_signature','proposals.edit'])));

-- ── anew_entity_roles / anew_entity_relationships ───────────────────────────
ALTER POLICY authenticated_insert_anew_entity_roles ON public.anew_entity_roles
  WITH CHECK ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['clients.create','clients.edit','clients.import','leads.create','leads.edit','leads.convert','leads.import','contacts.create','contacts.edit','contacts.import','pessoas.create','pessoas.edit'])));
ALTER POLICY authenticated_update_anew_entity_roles ON public.anew_entity_roles
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['clients.create','clients.edit','clients.delete','clients.import','leads.create','leads.edit','leads.convert','leads.import','leads.delete','contacts.create','contacts.edit','contacts.delete','contacts.import','pessoas.create','pessoas.edit','pessoas.delete'])));
ALTER POLICY authenticated_delete_anew_entity_roles ON public.anew_entity_roles
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['clients.delete','clients.edit','leads.delete','leads.edit','contacts.delete','contacts.edit','pessoas.delete','pessoas.edit'])));

ALTER POLICY authenticated_insert_anew_entity_relationships ON public.anew_entity_relationships
  WITH CHECK ((root_organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['clients.create','clients.edit','leads.create','leads.edit','contacts.create','contacts.edit','pessoas.create','pessoas.edit'])));
ALTER POLICY authenticated_update_anew_entity_relationships ON public.anew_entity_relationships
  USING ((root_organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['clients.edit','leads.edit','contacts.edit','pessoas.edit'])));
ALTER POLICY authenticated_delete_anew_entity_relationships ON public.anew_entity_relationships
  USING ((root_organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (SELECT public.fn_tem_alguma_permissao(ARRAY['clients.edit','clients.delete','leads.edit','leads.delete','contacts.edit','contacts.delete','pessoas.edit','pessoas.delete'])));

-- ── proposals UPDATE: o criador também precisa de proposals.edit ───────────
ALTER POLICY "Users with permission can update proposals" ON public.proposals
  USING ((((created_by = current_business_user_id()) AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'proposals.edit')))
     OR (has_anew_permission(( SELECT auth.uid() AS uid), 'proposals.edit'::text) AND (organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) AND (EXISTS ( SELECT 1
   FROM unnest(( SELECT crm_scope_keys('proposals.view'::text) AS crm_scope_keys)) k(scope_key)
  WHERE ((k.scope_key = ((proposals.organization_id)::text || ':*'::text)) OR (k.scope_key = (((proposals.organization_id)::text || ':'::text) || (proposals.assigned_to)::text)) OR (k.scope_key = (((proposals.organization_id)::text || ':'::text) || (proposals.created_by)::text))))))));

-- ── quotes INSERT: quotes.create ────────────────────────────────────────────
ALTER POLICY quotes_insert_policy ON public.quotes
  WITH CHECK ((created_by = current_business_user_id()) AND (organization_id IN ( SELECT get_user_crm_org_ids(auth.uid()) AS get_user_crm_org_ids))
    AND (SELECT public.has_anew_permission((SELECT auth.uid()), 'quotes.create')));

COMMIT;
