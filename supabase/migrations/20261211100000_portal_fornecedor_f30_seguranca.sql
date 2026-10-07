-- ============================================================
-- 20261211100000_portal_fornecedor_f30_seguranca
-- ============================================================
-- Portal do Fornecedor, F3.0: pré-requisitos de segurança.
--
-- O portal vai criar contas no Supabase Auth SEM anew_users e SEM
-- anew_memberships. Antes do primeiro convite, nenhuma conta autenticada sem
-- vínculo interno pode ler ou escrever dados do CRM. Esta migration fecha o
-- que estava aberto a "qualquer authenticated" (e, nalguns casos, a anon).
--
-- Tudo foi lido AO VIVO (pg_policies, pg_proc, information_schema) a
-- 07/10/2026, não de migrations antigas.
--
-- "Membro interno" = tem pelo menos uma anew_memberships ativa com
-- role_is_client IS NOT TRUE (a mesma regra de get_user_visible_org_ids).
-- Os system admins (miguel.carvalho, crodrigues) têm vínculo direto
-- system_admin, por isso também contam como internos.
--
-- 1. item_suppliers_public (view)
--    • Não é security_invoker: corre como o dono (postgres) e filtra no WHERE
--      com auth.uid() (system admin, ou org visível + products.view /
--      services.view). O SELECT filtra bem: conta sem vínculo e clientes do
--      portal leem 0 linhas.
--    • authenticated tinha INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER e
--      a view não tem CHECK OPTION. Um INSERT pela view corria como postgres e
--      passava por cima da RLS de item_suppliers (qualquer org); UPDATE/DELETE
--      saltavam products.edit/services.edit; UPDATE permitia também
--      SELECT ... FOR UPDATE/KEY SHARE.
--    • Ninguém escreve pela view: src/ só faz .select() (SupplierCatalogDialog,
--      Products, ItemSuppliersTable); supabase/functions/ não a refere.
--    → fica só SELECT para authenticated.
--
-- 2. team_hub_entries, team_hub_comments, user_presence
--    • Não têm organization_id (são globais). SELECT era USING (true) para
--      authenticated, e o INSERT bastava ter linha em anew_users (os 684
--      clientes do portal têm).
--    → SELECT e INSERT passam a exigir membro interno. UPDATE/DELETE já
--      exigiam ser o autor ou admin; user_presence INSERT/UPDATE já só
--      deixam escrever a própria linha (exige anew_users) — ficam iguais.
--
-- 3. Tabelas que qualquer authenticated podia alterar
--    • form_fields, form_steps (ALL USING auth.uid() IS NOT NULL) e
--      form_districts (INSERT/UPDATE/DELETE auth.uid() IS NOT NULL):
--      escrita passa a exigir system admin, ou a org do formulário visível
--      + forms.create/edit/delete ou campaigns.create/edit/delete (o ecrã
--      Formulários usa forms.*, a RLS de forms usa campaigns.*; aceitam-se as
--      duas famílias para não cortar ninguém). O SELECT USING (true) fica:
--      os formulários públicos são públicos por desenho (forms tem
--      forms_public_select para anon e as edge functions get-form-data,
--      create-lead, etc. leem estas tabelas).
--    • help_articles (ALL USING auth.uid() IS NOT NULL): não há ecrã que
--      escreva; escrita só system admin. Leitura pública de is_active fica.
--    • lead_contact_results: as 9 linhas são globais (organization_id NULL) e
--      qualquer authenticated as podia editar. Globais: escrita só system
--      admin; leitura só internos. Da organização: org visível + leads.config
--      ou leads.manage (o org_admin do Grupo BMLar só tem leads.manage; hoje não
--      existe nenhuma linha de organização). O ecrã só edita linhas da
--      organização; as globais já não eram editáveis no ecrã.
--    • user_creation_templates, user_template_fields, user_template_attributes,
--      user_template_organizations: globais editáveis por qualquer
--      authenticated. O ecrã (UserTemplateManager) cria SEMPRE os modelos com
--      organization_id NULL, por isso a escrita de globais fica para system
--      admin OU membro interno com users.create/users.edit (só assim não se
--      parte o ecrã). Leitura dos globais só internos.
--
-- 4. purchase_orders.status
--    • A RLS de UPDATE só exige purchase_orders.edit; só
--      rpc_update_purchase_order verifica purchase_orders.approve para
--      'ordered'. Nenhum sítio do frontend (development-rafael e main) nem das
--      edge functions faz UPDATE/INSERT direto a purchase_orders: tudo passa
--      por RPCs SECURITY DEFINER (rpc_create_/update_/delete_/restore_/
--      import_..., receive_..., revert_..., cancel_po_..., undo_...) ou por
--      gatilhos DEFINER (fn_proposal_supplier_request, fn_*_cancelled_
--      supplier_request_reversal, fn_client_order_request_missing).
--    → gatilho de guarda (padrão trg_*_00_guard_system_columns, por
--      current_user): pedidos diretos (authenticated/anon) não mudam o
--      estado e só criam encomendas em 'pending'. Dentro das RPCs
--      SECURITY DEFINER o current_user é postgres e passa.
--
-- 5. Funções SECURITY DEFINER executáveis por anon sem verificação
--    Revoga-se EXECUTE a PUBLIC, anon e authenticated (fica service_role) em
--    9 funções que escrevem ou devolvem dados por uuid sem verificar quem
--    chama, e que não têm uso em src/, nem chamadas sem sessão:
--      archive_campaign(uuid)            DELETE de qualquer campanha; sem uso.
--      sync_client_contact_roles(...)    só chamada por trg_sync_from_client
--                                        (DEFINER, dono postgres).
--      cleanup_duplicate_notifications() só generate-notifications
--      cleanup_orphan_notifications()    (edge function com service_role).
--      ops_relatorio_html(uuid)          HTML de qualquer ordem (cliente,
--                                        local, tarefas); só chamada por
--                                        ops_agendar_relatorio e
--                                        rpc_ops_enviar_relatorio (DEFINER).
--      calculate_product_margin(uuid)    custo/preço de qualquer produto; sem uso.
--      create_company_base_roles(uuid,uuid) cria papéis em qualquer empresa;
--      create_tenant_base_roles(uuid,uuid)  sem uso (nem BD, nem cron).
--      increment_channel_metric_leads(uuid,date,integer) escreve métricas de
--                                        qualquer canal; sem uso.
--    Nenhuma está em pg_cron nem é usada em políticas RLS.
--
-- Não mexe em: corpo de funções existentes, donos, dados.
-- Nota: um DROP + CREATE futuro destas funções volta a dar EXECUTE a anon e
-- authenticated pelos default privileges do Supabase — repetir o REVOKE.
-- ============================================================


-- ------------------------------------------------------------
-- 0. Funções auxiliares (novas)
-- ------------------------------------------------------------

-- Membro interno: vínculo ativo que não é de cliente.
CREATE FUNCTION public.fn_is_internal_crm_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.anew_users u
      JOIN public.anew_memberships m ON m.user_id = u.id
     WHERE u.auth_user_id = auth.uid()
       AND m.status = 'active'
       AND m.role_is_client IS NOT TRUE
  )
$function$;

COMMENT ON FUNCTION public.fn_is_internal_crm_user() IS
  'Portal do fornecedor F3.0: true se quem chama tem um vínculo ativo que não é de cliente (equivalente a get_user_visible_org_ids não vazio).';

-- Pode gerir um formulário (passos, campos, distritos).
CREATE FUNCTION public.fn_can_manage_form(_form_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.forms f
     WHERE f.id = _form_id
       AND (
         public.is_system_admin_user(auth.uid())
         OR (
           f.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
           AND (
                public.has_anew_permission(auth.uid(), 'forms.create')
             OR public.has_anew_permission(auth.uid(), 'forms.edit')
             OR public.has_anew_permission(auth.uid(), 'forms.delete')
             OR public.has_anew_permission(auth.uid(), 'campaigns.create')
             OR public.has_anew_permission(auth.uid(), 'campaigns.edit')
             OR public.has_anew_permission(auth.uid(), 'campaigns.delete')
           )
         )
       )
  )
$function$;

COMMENT ON FUNCTION public.fn_can_manage_form(uuid) IS
  'Portal do fornecedor F3.0: escrita em form_steps/form_fields/form_districts. System admin, ou org do formulário visível + forms.* ou campaigns.* (create/edit/delete).';

-- Pode gerir modelos de criação de utilizadores de uma organização (NULL = global).
CREATE FUNCTION public.fn_can_manage_user_template_org(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.is_system_admin_user(auth.uid())
    OR (
      (
        (_org_id IS NULL AND public.fn_is_internal_crm_user())
        OR _org_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
      )
      AND (
           public.has_anew_permission(auth.uid(), 'users.create')
        OR public.has_anew_permission(auth.uid(), 'users.edit')
      )
    )
$function$;

COMMENT ON FUNCTION public.fn_can_manage_user_template_org(uuid) IS
  'Portal do fornecedor F3.0: escrita em user_creation_templates. System admin, ou membro interno (org visível; NULL = global) com users.create/users.edit.';

CREATE FUNCTION public.fn_can_manage_user_template(_template_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT public.fn_can_manage_user_template_org(t.organization_id)
      FROM public.user_creation_templates t
     WHERE t.id = _template_id
  ), false)
$function$;

COMMENT ON FUNCTION public.fn_can_manage_user_template(uuid) IS
  'Portal do fornecedor F3.0: escrita em user_template_fields/_attributes/_organizations, pela regra do modelo.';

REVOKE ALL ON FUNCTION public.fn_is_internal_crm_user() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_can_manage_form(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_can_manage_user_template_org(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_can_manage_user_template(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_is_internal_crm_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_can_manage_form(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_can_manage_user_template_org(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_can_manage_user_template(uuid) TO authenticated, service_role;


-- ------------------------------------------------------------
-- 1. item_suppliers_public: só leitura
-- ------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.item_suppliers_public FROM authenticated, anon, PUBLIC;
GRANT SELECT ON public.item_suppliers_public TO authenticated;


-- ------------------------------------------------------------
-- 2. team_hub_entries, team_hub_comments, user_presence
-- ------------------------------------------------------------
DROP POLICY "Authenticated users can view team hub entries" ON public.team_hub_entries;
CREATE POLICY "team_hub_entries_select_internal" ON public.team_hub_entries
  FOR SELECT TO authenticated
  USING ((SELECT public.fn_is_internal_crm_user()));

DROP POLICY "Authenticated users can create team hub entries" ON public.team_hub_entries;
CREATE POLICY "team_hub_entries_insert_internal" ON public.team_hub_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id IN (SELECT anew_users.id FROM public.anew_users WHERE anew_users.auth_user_id = auth.uid())
    AND (SELECT public.fn_is_internal_crm_user())
  );

DROP POLICY "Anyone authenticated can view comments" ON public.team_hub_comments;
CREATE POLICY "team_hub_comments_select_internal" ON public.team_hub_comments
  FOR SELECT TO authenticated
  USING ((SELECT public.fn_is_internal_crm_user()));

DROP POLICY "Authenticated users can insert comments" ON public.team_hub_comments;
CREATE POLICY "team_hub_comments_insert_internal" ON public.team_hub_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT u.id FROM public.anew_users u WHERE u.auth_user_id = auth.uid() LIMIT 1)
    AND (SELECT public.fn_is_internal_crm_user())
  );

DROP POLICY "Authenticated users can read presence" ON public.user_presence;
CREATE POLICY "user_presence_select_internal" ON public.user_presence
  FOR SELECT TO authenticated
  USING ((SELECT public.fn_is_internal_crm_user()));


-- ------------------------------------------------------------
-- 3a. form_fields, form_steps, form_districts: escrita só para quem gere o formulário
--     (o SELECT USING (true) mantém-se: formulários públicos)
-- ------------------------------------------------------------
DROP POLICY "Users can manage form fields" ON public.form_fields;
CREATE POLICY "form_fields_insert_manage" ON public.form_fields
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_can_manage_form(form_id));
CREATE POLICY "form_fields_update_manage" ON public.form_fields
  FOR UPDATE TO authenticated
  USING (public.fn_can_manage_form(form_id))
  WITH CHECK (public.fn_can_manage_form(form_id));
CREATE POLICY "form_fields_delete_manage" ON public.form_fields
  FOR DELETE TO authenticated
  USING (public.fn_can_manage_form(form_id));

DROP POLICY "Users can manage form steps" ON public.form_steps;
CREATE POLICY "form_steps_insert_manage" ON public.form_steps
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_can_manage_form(form_id));
CREATE POLICY "form_steps_update_manage" ON public.form_steps
  FOR UPDATE TO authenticated
  USING (public.fn_can_manage_form(form_id))
  WITH CHECK (public.fn_can_manage_form(form_id));
CREATE POLICY "form_steps_delete_manage" ON public.form_steps
  FOR DELETE TO authenticated
  USING (public.fn_can_manage_form(form_id));

DROP POLICY "Users can insert form districts" ON public.form_districts;
DROP POLICY "Users can update form districts" ON public.form_districts;
DROP POLICY "Users can delete form districts" ON public.form_districts;
CREATE POLICY "form_districts_insert_manage" ON public.form_districts
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_can_manage_form(form_id));
CREATE POLICY "form_districts_update_manage" ON public.form_districts
  FOR UPDATE TO authenticated
  USING (public.fn_can_manage_form(form_id))
  WITH CHECK (public.fn_can_manage_form(form_id));
CREATE POLICY "form_districts_delete_manage" ON public.form_districts
  FOR DELETE TO authenticated
  USING (public.fn_can_manage_form(form_id));


-- ------------------------------------------------------------
-- 3b. help_articles: escrita só system admin
--     ("Help articles are publicly readable" USING (is_active = true) mantém-se)
-- ------------------------------------------------------------
DROP POLICY "Authenticated users can manage help articles" ON public.help_articles;
CREATE POLICY "help_articles_manage_system_admin" ON public.help_articles
  FOR ALL TO authenticated
  USING (public.is_system_admin_user((SELECT auth.uid())))
  WITH CHECK (public.is_system_admin_user((SELECT auth.uid())));


-- ------------------------------------------------------------
-- 3c. lead_contact_results
-- ------------------------------------------------------------
DROP POLICY "anew_contact_results_select" ON public.lead_contact_results;
DROP POLICY "anew_contact_results_insert" ON public.lead_contact_results;
DROP POLICY "anew_contact_results_update" ON public.lead_contact_results;
DROP POLICY "anew_contact_results_delete" ON public.lead_contact_results;

CREATE POLICY "anew_contact_results_select" ON public.lead_contact_results
  FOR SELECT TO authenticated
  USING (
    (organization_id IS NULL AND (SELECT public.fn_is_internal_crm_user()))
    OR organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  );

CREATE POLICY "anew_contact_results_insert" ON public.lead_contact_results
  FOR INSERT TO authenticated
  WITH CHECK (
    (organization_id IS NULL AND public.is_system_admin_user((SELECT auth.uid())))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND (public.has_anew_permission((SELECT auth.uid()), 'leads.config')
           OR public.has_anew_permission((SELECT auth.uid()), 'leads.manage'))
    )
  );

CREATE POLICY "anew_contact_results_update" ON public.lead_contact_results
  FOR UPDATE TO authenticated
  USING (
    (organization_id IS NULL AND public.is_system_admin_user((SELECT auth.uid())))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND (public.has_anew_permission((SELECT auth.uid()), 'leads.config')
           OR public.has_anew_permission((SELECT auth.uid()), 'leads.manage'))
    )
  )
  WITH CHECK (
    (organization_id IS NULL AND public.is_system_admin_user((SELECT auth.uid())))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND (public.has_anew_permission((SELECT auth.uid()), 'leads.config')
           OR public.has_anew_permission((SELECT auth.uid()), 'leads.manage'))
    )
  );

CREATE POLICY "anew_contact_results_delete" ON public.lead_contact_results
  FOR DELETE TO authenticated
  USING (
    (organization_id IS NULL AND public.is_system_admin_user((SELECT auth.uid())))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND (public.has_anew_permission((SELECT auth.uid()), 'leads.config')
           OR public.has_anew_permission((SELECT auth.uid()), 'leads.manage'))
    )
  );


-- ------------------------------------------------------------
-- 3d. Modelos de criação de utilizadores
-- ------------------------------------------------------------
DROP POLICY "auth_select_user_creation_templates" ON public.user_creation_templates;
DROP POLICY "auth_insert_user_creation_templates" ON public.user_creation_templates;
DROP POLICY "auth_update_user_creation_templates" ON public.user_creation_templates;
DROP POLICY "auth_delete_user_creation_templates" ON public.user_creation_templates;

CREATE POLICY "auth_select_user_creation_templates" ON public.user_creation_templates
  FOR SELECT TO authenticated
  USING (
    (organization_id IS NULL AND (SELECT public.fn_is_internal_crm_user()))
    OR organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  );
CREATE POLICY "auth_insert_user_creation_templates" ON public.user_creation_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_can_manage_user_template_org(organization_id));
CREATE POLICY "auth_update_user_creation_templates" ON public.user_creation_templates
  FOR UPDATE TO authenticated
  USING (public.fn_can_manage_user_template_org(organization_id))
  WITH CHECK (public.fn_can_manage_user_template_org(organization_id));
CREATE POLICY "auth_delete_user_creation_templates" ON public.user_creation_templates
  FOR DELETE TO authenticated
  USING (public.fn_can_manage_user_template_org(organization_id));

-- user_template_fields
DROP POLICY "auth_select_user_template_fields" ON public.user_template_fields;
DROP POLICY "auth_insert_user_template_fields" ON public.user_template_fields;
DROP POLICY "auth_update_user_template_fields" ON public.user_template_fields;
DROP POLICY "auth_delete_user_template_fields" ON public.user_template_fields;

CREATE POLICY "auth_select_user_template_fields" ON public.user_template_fields
  FOR SELECT TO authenticated
  USING (template_id IN (
    SELECT t.id FROM public.user_creation_templates t
     WHERE (t.organization_id IS NULL AND (SELECT public.fn_is_internal_crm_user()))
        OR t.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  ));
CREATE POLICY "auth_insert_user_template_fields" ON public.user_template_fields
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_can_manage_user_template(template_id));
CREATE POLICY "auth_update_user_template_fields" ON public.user_template_fields
  FOR UPDATE TO authenticated
  USING (public.fn_can_manage_user_template(template_id))
  WITH CHECK (public.fn_can_manage_user_template(template_id));
CREATE POLICY "auth_delete_user_template_fields" ON public.user_template_fields
  FOR DELETE TO authenticated
  USING (public.fn_can_manage_user_template(template_id));

-- user_template_attributes
DROP POLICY "auth_select_user_template_attributes" ON public.user_template_attributes;
DROP POLICY "auth_insert_user_template_attributes" ON public.user_template_attributes;
DROP POLICY "auth_update_user_template_attributes" ON public.user_template_attributes;
DROP POLICY "auth_delete_user_template_attributes" ON public.user_template_attributes;

CREATE POLICY "auth_select_user_template_attributes" ON public.user_template_attributes
  FOR SELECT TO authenticated
  USING (template_id IN (
    SELECT t.id FROM public.user_creation_templates t
     WHERE (t.organization_id IS NULL AND (SELECT public.fn_is_internal_crm_user()))
        OR t.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  ));
CREATE POLICY "auth_insert_user_template_attributes" ON public.user_template_attributes
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_can_manage_user_template(template_id));
CREATE POLICY "auth_update_user_template_attributes" ON public.user_template_attributes
  FOR UPDATE TO authenticated
  USING (public.fn_can_manage_user_template(template_id))
  WITH CHECK (public.fn_can_manage_user_template(template_id));
CREATE POLICY "auth_delete_user_template_attributes" ON public.user_template_attributes
  FOR DELETE TO authenticated
  USING (public.fn_can_manage_user_template(template_id));

-- user_template_organizations
DROP POLICY "auth_select_user_template_organizations" ON public.user_template_organizations;
DROP POLICY "auth_manage_user_template_organizations" ON public.user_template_organizations;

CREATE POLICY "auth_select_user_template_organizations" ON public.user_template_organizations
  FOR SELECT TO authenticated
  USING (template_id IN (
    SELECT t.id FROM public.user_creation_templates t
     WHERE (t.organization_id IS NULL AND (SELECT public.fn_is_internal_crm_user()))
        OR t.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  ));
CREATE POLICY "auth_insert_user_template_organizations" ON public.user_template_organizations
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_can_manage_user_template(template_id));
CREATE POLICY "auth_update_user_template_organizations" ON public.user_template_organizations
  FOR UPDATE TO authenticated
  USING (public.fn_can_manage_user_template(template_id))
  WITH CHECK (public.fn_can_manage_user_template(template_id));
CREATE POLICY "auth_delete_user_template_organizations" ON public.user_template_organizations
  FOR DELETE TO authenticated
  USING (public.fn_can_manage_user_template(template_id));


-- ------------------------------------------------------------
-- 4. purchase_orders: estado só pelas funções do sistema
-- ------------------------------------------------------------
CREATE FUNCTION public.fn_purchase_orders_guard_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Só pedidos diretos do PostgREST. Dentro de uma RPC SECURITY DEFINER o
  -- current_user é o dono da RPC (postgres) e passa.
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' AND NEW.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'Uma encomenda a fornecedor nasce sempre pendente; o estado só muda pelas funções do sistema'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'O estado da encomenda a fornecedor só pode ser alterado pelas funções do sistema (Encomendar, Receber, Anular, Reverter)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_purchase_orders_guard_status() IS
  'Portal do fornecedor F3.0: recusa INSERT com estado diferente de pending e qualquer mudança de status feitos diretamente por authenticated/anon. As RPCs SECURITY DEFINER passam.';

REVOKE ALL ON FUNCTION public.fn_purchase_orders_guard_status() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_purchase_orders_00_guard_status
  BEFORE INSERT OR UPDATE OF status ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_purchase_orders_guard_status();


-- ------------------------------------------------------------
-- 5. Funções DEFINER sem verificação: fora de anon e authenticated
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.archive_campaign(_campaign_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_client_contact_roles(_entity_id uuid, _organization_id uuid, _client_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_duplicate_notifications() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_orphan_notifications() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ops_relatorio_html(_ordem_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_product_margin(p_product_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_company_base_roles(_company_id uuid, _created_by uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_tenant_base_roles(_tenant_id uuid, _created_by uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_channel_metric_leads(p_channel_id uuid, p_metric_date date, p_delta integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.archive_campaign(_campaign_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_client_contact_roles(_entity_id uuid, _organization_id uuid, _client_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_duplicate_notifications() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_orphan_notifications() TO service_role;
GRANT EXECUTE ON FUNCTION public.ops_relatorio_html(_ordem_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_product_margin(p_product_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_company_base_roles(_company_id uuid, _created_by uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_tenant_base_roles(_tenant_id uuid, _created_by uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_channel_metric_leads(p_channel_id uuid, p_metric_date date, p_delta integer) TO service_role;
