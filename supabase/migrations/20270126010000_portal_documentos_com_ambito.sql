-- 20270126010000 (auditoria de permissões 23/11, lote Contratos/Portal, A3): pôr/tirar documentos do portal do cliente com âmbito.
-- As políticas INSERT/UPDATE/DELETE de client_portal_documents (20270102130000) pediam fn_tem_alguma_permissao(portal.manage,
-- client_contracts.edit, client_contracts.send_signature, proposals.edit) — em QUALQUER organização e sem âmbito: o comercial B e o
-- Financeiro (client_contracts.edit) punham/tiravam do portal os documentos do comercial A.
-- Para proposta/orçamento/contrato passam a pedir (fn_portal_doc_pode) a regra de create-client-portal-access, na organização da
-- linha (fn_cat_pode): portal.manage OU contrato -> client_contracts.send_signature, proposta -> negocios.proposta.enviar,
-- orçamento -> client_contracts.edit; E o documento no âmbito de quem o faz (fn_portal_doc_no_ambito -> fn_doc_no_ambito_acao com a
-- chave de edit do tipo: client_contracts.edit / proposals.edit / quotes.edit, e pessoas.edit para a cadeia do negócio).
-- O resto das políticas (organização, portal_document_in_org, portal_user_in_org) fica igual; direct_sale mantém a regra antiga.
-- republish_proposal_snapshot passa a pedir também o âmbito da proposta. A edge function create-client-portal-access (service_role,
-- não passa pelas políticas) chama fn_portal_doc_no_ambito com o JWT de quem pede.
-- Funções novas (só leitura, SECURITY DEFINER): fn_portal_doc_no_ambito(text, uuid), fn_portal_doc_pode(text, uuid, uuid).
-- Partiu das versões vivas (pg_get_functiondef / pg_policies, 23/11) — guardas md5 abaixo.

DO $guarda$
BEGIN
  IF (SELECT md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'client_portal_documents' AND policyname = 'Org members delete portal documents') IS DISTINCT FROM '820fcc2556292eeada2e2bfc2db88ac6' THEN
    RAISE EXCEPTION 'A política «Org members delete portal documents» mudou desde a leitura (23/11): rever esta migração antes de aplicar.';
  END IF;
  IF (SELECT md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'client_portal_documents' AND policyname = 'Org members insert portal documents') IS DISTINCT FROM 'e5c3219439cd62522a66dd5b90be7def' THEN
    RAISE EXCEPTION 'A política «Org members insert portal documents» mudou desde a leitura (23/11): rever esta migração antes de aplicar.';
  END IF;
  IF (SELECT md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'client_portal_documents' AND policyname = 'Org members update portal documents') IS DISTINCT FROM 'b2d1f7fd7640d3c8a89f80bb4a4e4545' THEN
    RAISE EXCEPTION 'A política «Org members update portal documents» mudou desde a leitura (23/11): rever esta migração antes de aplicar.';
  END IF;
END $guarda$;

DO $guarda$
BEGIN
  IF md5(pg_get_functiondef('public.republish_proposal_snapshot(uuid,uuid)'::regprocedure)) IS DISTINCT FROM '7fe591b5cb10c29286438743bd302245' THEN
    RAISE EXCEPTION 'A versão viva de public.republish_proposal_snapshot(uuid,uuid) mudou desde a leitura (23/11): rever esta migração antes de aplicar.';
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public.fn_portal_doc_no_ambito(p_tipo text, p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20270126010000: o documento (proposta/orçamento/contrato) está no âmbito de quem pede, com a chave de edit do tipo
  SELECT coalesce(CASE p_tipo
    WHEN 'contract' THEN public.fn_doc_no_ambito_acao('contract', p_id, 'client_contracts.edit', 'pessoas.edit')
    WHEN 'proposal' THEN public.fn_doc_no_ambito_acao('proposal', p_id, 'proposals.edit', 'pessoas.edit')
    WHEN 'quote'    THEN public.fn_doc_no_ambito_acao('quote', p_id, 'quotes.edit', 'pessoas.edit')
  END, false)
$function$;

CREATE OR REPLACE FUNCTION public.fn_portal_doc_pode(p_tipo text, p_id uuid, p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20270126010000: pôr/tirar do portal = a permissão de create-client-portal-access na organização + o documento no âmbito
  SELECT coalesce(p_tipo IN ('contract', 'proposal', 'quote') AND p_org IS NOT NULL
    AND (public.fn_cat_pode(p_org, 'portal.manage')
         OR public.fn_cat_pode(p_org, CASE p_tipo WHEN 'contract' THEN 'client_contracts.send_signature'
                                                  WHEN 'proposal' THEN 'negocios.proposta.enviar'
                                                  ELSE 'client_contracts.edit' END))
    AND public.fn_portal_doc_no_ambito(p_tipo, p_id), false)
$function$;

REVOKE ALL ON FUNCTION public.fn_portal_doc_no_ambito(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_portal_doc_pode(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_portal_doc_no_ambito(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_portal_doc_pode(text, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.republish_proposal_snapshot(p_proposal_id uuid, p_published_by uuid DEFAULT NULL::uuid)
 RETURNS TABLE(proposal_id uuid, published_at timestamp with time zone, published_snapshot_hash text, has_unpublished_changes boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid;
  v_authorized boolean;
  v_status text;
  v_old_hash text;
  v_hash text;
  v_snapshot jsonb;
  v_now timestamptz := now();
  v_has_org_stages boolean;
  v_sent_stage_id uuid;
  v_contract_id uuid;
  v_contract_status text;
  v_actor uuid := COALESCE(p_published_by, public.resolve_business_user_id(auth.uid()));
BEGIN
  SELECT p.organization_id, p.status, p.decided_snapshot_hash
  INTO v_org, v_status, v_old_hash
  FROM public.proposals p
  WHERE p.id = p_proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal % not found', p_proposal_id;
  END IF;

  SELECT v_org IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  INTO v_authorized;

  IF NOT COALESCE(v_authorized, false) THEN
    RAISE EXCEPTION 'not authorized for organization %', v_org;
  END IF;

  -- 20270106600000: publicar a proposta no portal pede portal.manage OU negocios.proposta.enviar na organização da proposta
  -- (a mesma regra de create-client-portal-access). Antes bastava ver a organização.
  IF NOT (public.fn_cat_pode(v_org, 'portal.manage') OR public.fn_cat_pode(v_org, 'negocios.proposta.enviar')) THEN
    RAISE EXCEPTION 'Sem permissão para enviar a proposta ao portal (requer negocios.proposta.enviar ou portal.manage)'
      USING ERRCODE = '42501';
  END IF;
  -- 20270126010000: e a proposta tem de estar no âmbito de quem a publica (fn_portal_doc_no_ambito)
  IF NOT public.fn_portal_doc_no_ambito('proposal', p_proposal_id) THEN
    RAISE EXCEPTION 'Sem permissão para enviar esta proposta ao portal: está fora do seu âmbito'
      USING ERRCODE = '42501';
  END IF;

  v_hash := public.compute_proposal_business_hash(p_proposal_id);

  SELECT jsonb_build_object(
    'proposal_id', p.id, 'computed_at', v_now, 'source', 'republish', 'published_by', p_published_by,
    'business', jsonb_build_object(
      'proposal', row_to_json(p.*)::jsonb,
      'manual_items', COALESCE((SELECT jsonb_agg(row_to_json(mi.*)::jsonb ORDER BY mi.sort_order, mi.id) FROM public.proposal_manual_items mi WHERE mi.proposal_id = p.id), '[]'::jsonb),
      'quote_selections', COALESCE((SELECT jsonb_agg(row_to_json(qs.*)::jsonb ORDER BY qs.quote_id) FROM public.proposal_quote_selections qs WHERE qs.proposal_id = p.id), '[]'::jsonb),
      'quotes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'quote', row_to_json(q.*)::jsonb,
          'lines', COALESCE((SELECT jsonb_agg(row_to_json(ql.*)::jsonb ORDER BY ql.ordem NULLS LAST, ql.id) FROM public.quote_lines ql WHERE ql.quote_id = q.id), '[]'::jsonb),
          'fees', COALESCE((SELECT jsonb_agg(row_to_json(qf.*)::jsonb ORDER BY qf.id) FROM public.quote_fees qf WHERE qf.quote_id = q.id), '[]'::jsonb)
        ) ORDER BY q.id)
        FROM public.quotes q WHERE q.proposal_id = p.id AND q.deleted_at IS NULL
      ), '[]'::jsonb)
    )
  )
  INTO v_snapshot
  FROM public.proposals p
  WHERE p.id = p_proposal_id;

  -- Reopen decided proposals when business content changed since decision.
  IF v_status IN ('accepted', 'rejected') AND v_old_hash IS NOT NULL AND v_hash <> v_old_hash THEN
    SELECT cc.id, cc.status INTO v_contract_id, v_contract_status
    FROM public.client_contracts cc
    WHERE cc.proposal_id = p_proposal_id AND cc.deleted_at IS NULL
    ORDER BY cc.created_at DESC
    LIMIT 1;

    IF v_contract_status IN ('signed', 'active') THEN
      RAISE EXCEPTION 'proposal_has_signed_contract';
    END IF;

    IF v_contract_id IS NOT NULL THEN
      UPDATE public.client_contracts
      SET deleted_at = v_now, deleted_by = v_actor
      WHERE id = v_contract_id;

      UPDATE public.proposals
      SET client_contract_id = NULL
      WHERE id = p_proposal_id AND client_contract_id = v_contract_id;
    END IF;

    SELECT EXISTS(
      SELECT 1 FROM public.proposal_workflow_stages
      WHERE organization_id = v_org AND is_active = true
    ) INTO v_has_org_stages;

    SELECT id INTO v_sent_stage_id
    FROM public.proposal_workflow_stages
    WHERE name = 'sent'
      AND is_active = true
      AND (
        (v_has_org_stages AND organization_id = v_org)
        OR (NOT v_has_org_stages AND organization_id IS NULL)
      )
    LIMIT 1;

    UPDATE public.proposals
    SET status = 'sent',
        stage_id = COALESCE(v_sent_stage_id, stage_id),
        accepted_at = NULL,
        signature_image = NULL,
        acceptance_ip = NULL,
        acceptance_user_agent = NULL,
        rejected_at = NULL,
        rejection_reason = NULL,
        updated_at = v_now
    WHERE id = p_proposal_id;

    UPDATE public.client_portal_users
    SET portal_status = 'sent', updated_at = v_now
    WHERE client_portal_users.proposal_id = p_proposal_id;
  END IF;

  UPDATE public.proposals
  SET published_snapshot = v_snapshot,
      published_snapshot_hash = v_hash,
      published_at = v_now,
      has_unpublished_changes = false,
      updated_at = v_now
  WHERE id = p_proposal_id;

  IF v_status IN ('accepted', 'rejected') AND v_old_hash IS NOT NULL AND v_hash = v_old_hash THEN
    UPDATE public.proposals
    SET decided_snapshot = v_snapshot, decided_snapshot_hash = v_hash
    WHERE id = p_proposal_id;
  END IF;

  RETURN QUERY SELECT p_proposal_id, v_now, v_hash, false;
END;
$function$;

ALTER POLICY "Org members delete portal documents" ON public.client_portal_documents
  USING (((organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) AND portal_document_in_org(document_type, document_id, organization_id) AND (CASE WHEN ((document_type)::text = ANY (ARRAY['contract'::text, 'proposal'::text, 'quote'::text])) THEN public.fn_portal_doc_pode((document_type)::text, document_id, organization_id) ELSE ( SELECT fn_tem_alguma_permissao(ARRAY['portal.manage'::text, 'client_contracts.edit'::text, 'client_contracts.send_signature'::text, 'proposals.edit'::text]) AS fn_tem_alguma_permissao) END)));

ALTER POLICY "Org members insert portal documents" ON public.client_portal_documents
  WITH CHECK (((organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) AND portal_document_in_org(document_type, document_id, organization_id) AND portal_user_in_org(portal_user_id, organization_id) AND (CASE WHEN ((document_type)::text = ANY (ARRAY['contract'::text, 'proposal'::text, 'quote'::text])) THEN public.fn_portal_doc_pode((document_type)::text, document_id, organization_id) ELSE ( SELECT fn_tem_alguma_permissao(ARRAY['portal.manage'::text, 'client_contracts.edit'::text, 'client_contracts.send_signature'::text, 'proposals.edit'::text]) AS fn_tem_alguma_permissao) END)));

ALTER POLICY "Org members update portal documents" ON public.client_portal_documents
  USING (((organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) AND portal_document_in_org(document_type, document_id, organization_id) AND (CASE WHEN ((document_type)::text = ANY (ARRAY['contract'::text, 'proposal'::text, 'quote'::text])) THEN public.fn_portal_doc_pode((document_type)::text, document_id, organization_id) ELSE ( SELECT fn_tem_alguma_permissao(ARRAY['portal.manage'::text, 'client_contracts.edit'::text, 'client_contracts.send_signature'::text, 'proposals.edit'::text]) AS fn_tem_alguma_permissao) END)))
  WITH CHECK (((organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) AND portal_document_in_org(document_type, document_id, organization_id) AND portal_user_in_org(portal_user_id, organization_id) AND (CASE WHEN ((document_type)::text = ANY (ARRAY['contract'::text, 'proposal'::text, 'quote'::text])) THEN public.fn_portal_doc_pode((document_type)::text, document_id, organization_id) ELSE ( SELECT fn_tem_alguma_permissao(ARRAY['portal.manage'::text, 'client_contracts.edit'::text, 'client_contracts.send_signature'::text, 'proposals.edit'::text]) AS fn_tem_alguma_permissao) END)));
