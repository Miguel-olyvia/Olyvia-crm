-- =============================================================================
-- 20270109500000 — as permissões «ver» passam a valer na LEITURA (auditoria 05/11, P3 do grupo A)
-- =============================================================================
-- deals.view, campaigns.view, forms.view, lead_sources.view, email_templates.view, quote_templates.view e flow_builder.view só
-- guardavam a rota e o menu: o SELECT destas tabelas só pedia a organização, e qualquer membro lia tudo pela API.
-- Agora o SELECT pede TAMBÉM, na organização da linha (Lote B: get_user_permission_org_ids), a permissão «ver» OU uma das
-- permissões dos fluxos que hoje leem a tabela noutros ecrãs (levantamento em src/ e supabase/functions, 05/11/2026):
--   deals            Pedidos (/deals) e os ecrãs de orçamentos, propostas e contratos (QuoteBuilder, Proposals, ClientContracts,
--                    PipelineBreadcrumb, envio de email, PDF), a ficha da pessoa (registar chamada), a pesquisa e o Lixo (âmbito de
--                    deals.view), os gatilhos de search_text de quotes/proposals (quem grava orçamentos/propostas).
--   lead_sources     Origens; Campanhas e Formulários (integrações); Pessoas (neg_ficha_pessoa/neg_resumo_pessoas, INVOKER; filtros;
--                    submissões) e Nova lead; Negócios (dadosDaLead) — este também pelo Papel no Negócio (pessoas.view do RH).
--   campaigns        Campanhas/Canais (e get_channel_dashboard); Formulários; Pessoas e Nova lead; Submissões pendentes;
--                    Integração de marketing (settings.update); Negócios (dadosDaLead, também pelo Papel no Negócio).
--                    channels e as linhas filhas seguem a campanha (a policy delas lê campaigns).
--   forms            Formulários; Campanhas; Pessoas (filtros, ficha, resumo) e Nova lead; Submissões pendentes.
--                    O formulário público continua: forms_public_select (anon) e as edge functions (service_role) não mudam.
--   email_templates  Modelos de email; marca do formulário (forms.*); definições da agenda (scheduling.settings); o seletor de
--                    modelo ao enviar email de orçamentos, propostas, contratos, pedidos e pessoas.
--   quote_templates  Modelos de orçamento; o QuoteBuilder e o orçamento da proposta (InlineQuoteBuilder): quotes.*, proposals.*,
--                    negocios.orcamento.editar. quote_template_items segue o modelo.
--   flow_builder_flows  só o Flow Builder: flow_builder.view/create/edit/delete na organização ou acima (como as escritas).
-- As permissões de escrita de cada tabela entram sempre (um UPDATE/DELETE só vê as linhas que o SELECT deixa ver).
-- As edge functions leem com service_role (sem RLS) e as funções SECURITY DEFINER não mudam.
-- Nenhum papel precisa de permissões novas: quem abre as páginas já tem a «ver» (a rota pede-a).
-- Fica de fora (reportado): o Painel (/dashboard) e a ficha do membro em Organizações contam pedidos; a quem não tem nenhuma
-- destas permissões passam a contar 0 (não eram dados que a pessoa pudesse abrir).
-- Sem tabelas nem colunas novas. Policies vivas lidas a 05/11/2026; o bloco de guarda para se alguma mudou.
-- =============================================================================

SET lock_timeout = '5s';

DO $guarda$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('deals', 'Users can view deals in their org', '6c4b7d8d906ca0bdbca3be1deaf03a82'),
      ('campaigns', 'campaigns_select', 'f2dbafe54f6168753d05035ba797f9b3'),
      ('forms', 'forms_select', 'f2dbafe54f6168753d05035ba797f9b3'),
      ('lead_sources', 'lead_sources_select', '3e1ace7c772f2583c723693b6fb838fd'),
      ('email_templates', 'Users can view templates in their org hierarchy', 'f2dbafe54f6168753d05035ba797f9b3'),
      ('quote_templates', 'Users can view quote templates', 'f2dbafe54f6168753d05035ba797f9b3'),
      ('flow_builder_flows', 'Users can view flows from their organization', '6a0ffe08c50cb154ea4ff7190fd30aa3')
    ) AS v(tabela, policy, md5)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = r.tabela AND p.policyname = r.policy AND p.cmd = 'SELECT'
        AND md5(coalesce(p.qual, '') || '|' || coalesce(p.with_check, '')) = r.md5
    ) THEN
      RAISE EXCEPTION 'A policy % de % mudou desde a leitura de 05/11: rever antes de aplicar', r.policy, r.tabela;
    END IF;
  END LOOP;
  IF to_regprocedure('public.fn_orgs_com_alguma_permissao(text[],boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'fn_orgs_com_alguma_permissao já existe: rever antes de aplicar';
  END IF;
END
$guarda$;

-- As organizações (visíveis) onde quem pede tem ALGUMA das permissões, pelo perfil (get_user_permission_org_ids, o critério
-- do Lote B) e, com p_com_papel, também pelo Papel no Negócio (fn_neg_papel_permite, como fn_cat_pode). Devolve um conjunto
-- para a policy o avaliar uma vez por consulta (não linha a linha).
CREATE FUNCTION public.fn_orgs_com_alguma_permissao(p_codes text[], p_com_papel boolean DEFAULT false)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT g.org_id
  FROM unnest(p_codes) AS c(code)
  CROSS JOIN LATERAL public.get_user_permission_org_ids(auth.uid(), c.code) AS g(org_id)
  WHERE auth.uid() IS NOT NULL
  UNION
  SELECT v.org_id
  FROM public.get_user_visible_org_ids(auth.uid()) AS v(org_id)
  WHERE p_com_papel AND auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM unnest(p_codes) AS c(code) WHERE public.fn_neg_papel_permite(v.org_id, c.code))
$function$;

REVOKE ALL ON FUNCTION public.fn_orgs_com_alguma_permissao(text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_orgs_com_alguma_permissao(text[], boolean) TO authenticated, service_role;

-- deals · SELECT
ALTER POLICY "Users can view deals in their org" ON public.deals
  USING ((organization_id IN ( SELECT get_user_crm_org_ids(auth.uid()) AS get_user_crm_org_ids))
    AND (organization_id IN ( SELECT fn_orgs_com_alguma_permissao(ARRAY[
      'deals.view', 'deals.create', 'deals.edit', 'deals.delete',
      'quotes.view', 'quotes.create', 'quotes.edit',
      'proposals.view', 'proposals.create', 'proposals.edit',
      'client_contracts.view', 'client_contracts.create', 'client_contracts.edit',
      'pessoas.view', 'leads.view', 'clients.view'
    ]::text[], false) AS fn_orgs_com_alguma_permissao)));

-- campaigns · SELECT (channels e filhas seguem)
ALTER POLICY "campaigns_select" ON public.campaigns
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (organization_id IN ( SELECT fn_orgs_com_alguma_permissao(ARRAY[
      'campaigns.view', 'campaigns.create', 'campaigns.edit', 'campaigns.delete',
      'forms.view', 'forms.create', 'forms.edit', 'forms.delete',
      'pessoas.view', 'pessoas.create', 'pessoas.edit', 'leads.view', 'leads.create', 'leads.edit', 'clients.view',
      'platform.pending_submissions.view', 'settings.update'
    ]::text[], true) AS fn_orgs_com_alguma_permissao)));

-- forms · SELECT (forms_public_select, anon, não muda)
ALTER POLICY "forms_select" ON public.forms
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (organization_id IN ( SELECT fn_orgs_com_alguma_permissao(ARRAY[
      'forms.view', 'forms.create', 'forms.edit', 'forms.delete',
      'campaigns.view', 'campaigns.create', 'campaigns.edit', 'campaigns.delete',
      'pessoas.view', 'pessoas.create', 'pessoas.edit', 'leads.view', 'leads.create', 'leads.edit', 'clients.view',
      'platform.pending_submissions.view'
    ]::text[], false) AS fn_orgs_com_alguma_permissao)));

-- lead_sources · SELECT (as origens globais, sem organização, com qualquer destas permissões numa organização)
ALTER POLICY "lead_sources_select" ON public.lead_sources
  USING (((organization_id IS NULL) AND (EXISTS ( SELECT 1 FROM fn_orgs_com_alguma_permissao(ARRAY[
      'lead_sources.view', 'lead_sources.create', 'lead_sources.edit', 'lead_sources.delete',
      'campaigns.view', 'campaigns.create', 'campaigns.edit', 'campaigns.delete',
      'forms.view', 'forms.create', 'forms.edit', 'forms.delete',
      'pessoas.view', 'pessoas.create', 'pessoas.edit', 'leads.view', 'leads.create', 'leads.edit', 'clients.view'
    ]::text[], true) AS o(org_id))))
    OR ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
      AND (organization_id IN ( SELECT fn_orgs_com_alguma_permissao(ARRAY[
      'lead_sources.view', 'lead_sources.create', 'lead_sources.edit', 'lead_sources.delete',
      'campaigns.view', 'campaigns.create', 'campaigns.edit', 'campaigns.delete',
      'forms.view', 'forms.create', 'forms.edit', 'forms.delete',
      'pessoas.view', 'pessoas.create', 'pessoas.edit', 'leads.view', 'leads.create', 'leads.edit', 'clients.view'
    ]::text[], true) AS fn_orgs_com_alguma_permissao))));

-- email_templates · SELECT
ALTER POLICY "Users can view templates in their org hierarchy" ON public.email_templates
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (organization_id IN ( SELECT fn_orgs_com_alguma_permissao(ARRAY[
      'email_templates.view', 'email_templates.create', 'email_templates.edit', 'email_templates.delete', 'email_templates.duplicate',
      'forms.view', 'forms.create', 'forms.edit', 'scheduling.settings',
      'quotes.view', 'proposals.view', 'client_contracts.view', 'deals.view', 'pessoas.view', 'leads.view', 'clients.view'
    ]::text[], false) AS fn_orgs_com_alguma_permissao)));

-- quote_templates · SELECT (quote_template_items segue)
ALTER POLICY "Users can view quote templates" ON public.quote_templates
  USING ((organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (organization_id IN ( SELECT fn_orgs_com_alguma_permissao(ARRAY[
      'quote_templates.view', 'quote_templates.create', 'quote_templates.edit', 'quote_templates.delete', 'quote_templates.duplicate',
      'quotes.view', 'quotes.create', 'quotes.edit', 'proposals.create', 'proposals.edit', 'negocios.orcamento.editar'
    ]::text[], false) AS fn_orgs_com_alguma_permissao)));

-- flow_builder_flows · SELECT (o mesmo critério das escritas: na organização ou acima; o admin de sistema passa)
ALTER POLICY "Users can view flows from their organization" ON public.flow_builder_flows
  USING ((organization_id IN ( SELECT get_flow_user_org_ids(auth.uid()) AS get_flow_user_org_ids))
    AND (has_anew_permission_in_org_or_ancestor(( SELECT auth.uid() AS uid), 'flow_builder.view'::text, organization_id)
      OR has_anew_permission_in_org_or_ancestor(( SELECT auth.uid() AS uid), 'flow_builder.create'::text, organization_id)
      OR has_anew_permission_in_org_or_ancestor(( SELECT auth.uid() AS uid), 'flow_builder.edit'::text, organization_id)
      OR has_anew_permission_in_org_or_ancestor(( SELECT auth.uid() AS uid), 'flow_builder.delete'::text, organization_id)));
