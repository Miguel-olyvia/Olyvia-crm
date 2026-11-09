-- =============================================================================
-- 20270110910000 — permissões, lote 2: ajustes da revisão (09/11) a 20270110900000_ambito_no_servidor
-- =============================================================================
-- Só permissões. Sem tabelas, colunas nem índices novos. Corpos a partir do texto VIVO (09/11); a guarda para se mudaram.
-- 1. fn_neg_ambito_tudo: quem tem no PERFIL uma permissão de back-office do Negócio vê/grava todos os negócios, como quem tem o Papel
--    no Negócio equivalente (Financeiro, Operações, Compras/armazém): negocios.validar_pagamento, negocios.registar_fatura,
--    negocios.obra.planear, negocios.obra.fechar, negocios.obra.imprevistos, purchase_orders.approve.
--    negocios.margem.aprovar fica de fora: o perfil «comercial» da organização tem-na, e o comercial continua com o âmbito.
-- 2. fn_doc_no_ambito: o passo do negócio (barato) antes do dos contratos; os contratos ligados em consultas separadas (por id, pela
--    chave primária; por quote_id / proposal_id - a tabela não tem índice nessas colunas, ver o relatório).
-- 3. fn_doc_no_ambito: p_org tem de ser a organização do registo e uma das do utilizador (get_user_crm_org_ids); as chaves de outras
--    organizações são ignoradas; p_orgs_neg só conta para esta organização; um negócio de p_negs_tarefa só conta se a pessoa tiver
--    mesmo tarefas na obra (fn_neg_tem_tarefa). As policies que a chamam já passam estes valores e não mudam.
-- 4. quotes_delete_policy e "Users with permission can delete proposals": as chaves da própria ação (quotes.delete / proposals.delete).
-- =============================================================================

SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_neg_ambito_tudo(uuid,text)'::regprocedure) IS DISTINCT FROM '89701fa138f34ce9b09065590a5e6c2b' THEN
    RAISE EXCEPTION 'public.fn_neg_ambito_tudo(uuid,text) mudou desde a leitura de 09/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_doc_no_ambito(text,uuid,uuid,text[],text[],uuid[],uuid[])'::regprocedure) IS DISTINCT FROM '2bec6a97691a60e486237ddb7208d282' THEN
    RAISE EXCEPTION 'public.fn_doc_no_ambito mudou desde a leitura de 09/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(qual) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'quotes' AND policyname = 'quotes_delete_policy') IS DISTINCT FROM '14adf9b4fafe933ead02de8ac474b61c' THEN
    RAISE EXCEPTION 'policy quotes.quotes_delete_policy mudou desde a leitura de 09/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(qual) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'proposals' AND policyname = 'Users with permission can delete proposals') IS DISTINCT FROM 'ae133139b0a3d3fd6ea9f61d2d21539e' THEN
    RAISE EXCEPTION 'policy proposals."Users with permission can delete proposals" mudou desde a leitura de 09/11: rever antes de aplicar';
  END IF;
END
$guarda$;

-- ── 1. fn_neg_ambito_tudo ────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_neg_ambito_tudo(p_org uuid, p_perm text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_org IS NOT NULL AND auth.uid() IS NOT NULL AND (
    public.fn_ambito_admin(auth.uid(), p_org)
    OR NOT public.has_anew_permission_in_org(auth.uid(), p_perm, p_org)
    OR EXISTS (SELECT 1
               FROM public.pessoas_papeis_negocio pp
               JOIN public.neg_papeis_permissoes m ON m.papel = pp.papel AND m.permission_code = p_perm
               WHERE pp.pessoa_id = public.fn_neg_pessoa_da_conta(p_org) AND pp.organization_id = p_org)
    -- 20270110910000: o back-office do Negócio no PERFIL (o que o Financeiro, as Operações e Compras/armazém fazem a todos os
    -- negócios) vê/grava todos, como o Papel no Negócio equivalente. negocios.margem.aprovar não entra: o perfil comercial tem-na.
    OR EXISTS (SELECT 1
               FROM unnest(ARRAY['negocios.validar_pagamento', 'negocios.registar_fatura', 'negocios.obra.planear', 'negocios.obra.fechar',
                                 'negocios.obra.imprevistos', 'purchase_orders.approve']) AS c(codigo)
               WHERE public.has_anew_permission_in_org(auth.uid(), c.codigo, p_org)))
$function$;

-- ── 2/3. fn_doc_no_ambito ────────────────────────────────────────────────────────────────────────────────────────────────────────
-- O negócio de um documento está no âmbito? (o passo 4 de fn_doc_no_ambito, separado para servir os negócios do documento e os dos
-- contratos ligados). Interna: só fn_doc_no_ambito a chama.
CREATE OR REPLACE FUNCTION public.fn_doc_neg_no_ambito(p_negs uuid[], p_org uuid, p_chaves text[], p_chaves_neg text[], p_orgs_neg uuid[], p_negs_tarefa uuid[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.negocios n
    WHERE n.id = ANY (coalesce(p_negs, '{}'::uuid[])) AND n.deleted_at IS NULL AND n.organization_id = p_org
      AND (p_org = ANY (coalesce(p_orgs_neg, '{}'::uuid[]))
           OR public.fn_ambito_casa(p_chaves, p_org, ARRAY[n.assigned_to, n.created_by])
           OR public.fn_ambito_casa(p_chaves_neg, p_org, ARRAY[n.assigned_to, n.created_by])
           OR (n.id = ANY (coalesce(p_negs_tarefa, '{}'::uuid[]))
               AND public.fn_neg_tem_tarefa(n.id, public.fn_neg_pessoa_da_conta(p_org)))))
$function$;
REVOKE ALL ON FUNCTION public.fn_doc_neg_no_ambito(uuid[], uuid, text[], text[], uuid[], uuid[]) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_doc_no_ambito(p_tipo text, p_id uuid, p_org uuid, p_chaves text[], p_chaves_neg text[], p_orgs_neg uuid[], p_negs_tarefa uuid[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER COST 1000
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org   uuid;
  v_donos uuid[] := '{}';
  v_deals uuid[] := '{}';
  v_negs  uuid[] := '{}';
  v_prop  uuid;
  v_cc    uuid;
  v_a     uuid[];
  v_b     uuid[];
  v_c     uuid[];
  v_orgsn uuid[];   -- 20270110910000: p_orgs_neg só conta para esta organização
BEGIN
  IF auth.uid() IS NULL OR p_id IS NULL OR p_org IS NULL THEN
    RETURN false;
  END IF;
  -- 20270110910000: p_org tem de ser uma organização do utilizador (o mesmo critério de get_user_crm_org_ids, que a policy que a
  -- chama já aplica). As chaves de outras organizações não contam: todas as comparações abaixo são com p_org (fn_ambito_casa só
  -- casa p_org:* e p_org:<dono>).
  IF NOT EXISTS (SELECT 1 FROM public.anew_memberships m JOIN public.anew_users u ON u.id = m.user_id
                 WHERE u.auth_user_id = auth.uid() AND m.organization_id = p_org AND m.status = 'active'
                   AND m.role_is_client IS NOT TRUE) THEN
    RETURN false;
  END IF;
  v_orgsn := CASE WHEN p_org = ANY (coalesce(p_orgs_neg, '{}'::uuid[])) THEN ARRAY[p_org] ELSE '{}'::uuid[] END;

  -- 1. o registo e o que está a um passo (por chave primária / índice); p_org tem de ser a organização dele
  IF p_tipo = 'quote' THEN
    SELECT q.organization_id, ARRAY[q.created_by, q.assigned_to, p.created_by, p.assigned_to], ARRAY[q.deal_id, p.deal_id],
           ARRAY[q.negocio_id, p.negocio_id], q.proposal_id, p.client_contract_id
      INTO v_org, v_donos, v_deals, v_negs, v_prop, v_cc
    FROM public.quotes q LEFT JOIN public.proposals p ON p.id = q.proposal_id
    WHERE q.id = p_id;
  ELSIF p_tipo = 'proposal' THEN
    SELECT p.organization_id, ARRAY[p.created_by, p.assigned_to], ARRAY[p.deal_id], ARRAY[p.negocio_id], p.id, p.client_contract_id
      INTO v_org, v_donos, v_deals, v_negs, v_prop, v_cc
    FROM public.proposals p WHERE p.id = p_id;
  ELSIF p_tipo = 'contract' THEN
    SELECT c.organization_id, ARRAY[c.created_by, c.assigned_to, p.created_by, p.assigned_to, q.created_by, q.assigned_to],
           ARRAY[p.deal_id, q.deal_id], ARRAY[c.negocio_id, p.negocio_id, q.negocio_id]
      INTO v_org, v_donos, v_deals, v_negs
    FROM public.client_contracts c
    LEFT JOIN public.proposals p ON p.id = c.proposal_id
    LEFT JOIN public.quotes q ON q.id = c.quote_id
    WHERE c.id = p_id;
  ELSE
    RETURN false;
  END IF;
  IF v_org IS DISTINCT FROM p_org THEN
    RETURN false;
  END IF;
  IF (p_org::text || ':*') = ANY (coalesce(p_chaves, '{}'::text[])) THEN
    RETURN true;
  END IF;
  -- os outros documentos a um passo (por índice): os orçamentos da proposta, as propostas do contrato
  IF p_tipo = 'proposal' THEN
    SELECT array_agg(q.created_by) || array_agg(q.assigned_to), array_agg(q.deal_id), array_agg(q.negocio_id)
      INTO v_a, v_b, v_c
    FROM public.quotes q WHERE q.proposal_id = p_id;
    v_donos := v_donos || coalesce(v_a, '{}'); v_deals := v_deals || coalesce(v_b, '{}'); v_negs := v_negs || coalesce(v_c, '{}');
  ELSIF p_tipo = 'contract' THEN
    SELECT array_agg(p.created_by) || array_agg(p.assigned_to), array_agg(p.deal_id), array_agg(p.negocio_id)
      INTO v_a, v_b, v_c
    FROM public.proposals p WHERE p.client_contract_id = p_id;
    v_donos := v_donos || coalesce(v_a, '{}'); v_deals := v_deals || coalesce(v_b, '{}'); v_negs := v_negs || coalesce(v_c, '{}');
  END IF;

  IF public.fn_ambito_casa(p_chaves, p_org, v_donos) THEN
    RETURN true;
  END IF;

  -- 2. o pedido de proposta e a lead dele
  IF EXISTS (SELECT 1 FROM public.deals d LEFT JOIN public.anew_leads l ON l.id = d.lead_id
             WHERE d.id = ANY (v_deals)
               AND public.fn_ambito_casa(p_chaves, p_org, ARRAY[d.created_by, d.assigned_to, l.created_by, l.assigned_to])) THEN
    RETURN true;
  END IF;

  -- 3. o negócio (20270110910000: antes dos contratos, que é o passo mais caro)
  IF public.fn_doc_neg_no_ambito(v_negs, p_org, p_chaves, p_chaves_neg, v_orgsn, p_negs_tarefa) THEN
    RETURN true;
  END IF;

  -- 4. os contratos ligados ao orçamento / à proposta, em consultas separadas (20270110910000): pela chave primária
  --    (proposals.client_contract_id) e por quote_id / proposal_id (sem índice nessas colunas)
  IF p_tipo IN ('quote', 'proposal') THEN
    SELECT array_agg(x.cb) || array_agg(x.ab), array_agg(x.neg) INTO v_a, v_c
    FROM (
      SELECT c.created_by AS cb, c.assigned_to AS ab, c.negocio_id AS neg FROM public.client_contracts c WHERE v_cc IS NOT NULL AND c.id = v_cc
      UNION ALL
      SELECT c.created_by, c.assigned_to, c.negocio_id FROM public.client_contracts c WHERE p_tipo = 'quote' AND c.quote_id = p_id
      UNION ALL
      SELECT c.created_by, c.assigned_to, c.negocio_id FROM public.client_contracts c WHERE v_prop IS NOT NULL AND c.proposal_id = v_prop
    ) x;
    IF public.fn_ambito_casa(p_chaves, p_org, v_a) THEN
      RETURN true;
    END IF;
    RETURN public.fn_doc_neg_no_ambito(v_c, p_org, p_chaves, p_chaves_neg, v_orgsn, p_negs_tarefa);
  END IF;
  RETURN false;
END
$function$;

-- ── 4. DELETE com as chaves da própria ação ──────────────────────────────────────────────────────────────────────────────────────
-- antes: ... crm_scope_keys('quotes.view'::text) ...
ALTER POLICY "quotes_delete_policy" ON public.quotes
  USING (((organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) AND has_anew_permission(( SELECT auth.uid() AS uid), 'quotes.delete'::text) AND (EXISTS ( SELECT 1
   FROM unnest(( SELECT crm_scope_keys('quotes.delete'::text) AS crm_scope_keys)) k(scope_key)
  WHERE ((k.scope_key = ((quotes.organization_id)::text || ':*'::text)) OR (k.scope_key = (((quotes.organization_id)::text || ':'::text) || (quotes.assigned_to)::text)) OR (k.scope_key = (((quotes.organization_id)::text || ':'::text) || (quotes.created_by)::text)))))));

-- antes: ... crm_scope_keys('proposals.view'::text) ...
ALTER POLICY "Users with permission can delete proposals" ON public.proposals
  USING ((has_anew_permission(( SELECT auth.uid() AS uid), 'proposals.delete'::text) AND (organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) AND (EXISTS ( SELECT 1
   FROM unnest(( SELECT crm_scope_keys('proposals.delete'::text) AS crm_scope_keys)) k(scope_key)
  WHERE ((k.scope_key = ((proposals.organization_id)::text || ':*'::text)) OR (k.scope_key = (((proposals.organization_id)::text || ':'::text) || (proposals.assigned_to)::text)) OR (k.scope_key = (((proposals.organization_id)::text || ':'::text) || (proposals.created_by)::text)))))));
