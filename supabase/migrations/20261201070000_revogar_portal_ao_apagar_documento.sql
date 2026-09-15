-- ============================================================
-- 20261201070000_revogar_portal_ao_apagar_documento
-- ============================================================
-- Recuperada da base de dados: esta migration foi aplicada ao projeto
-- remoto sem ficheiro correspondente no repositorio. O SQL abaixo foi
-- extraido de supabase_migrations.schema_migrations.statements, para o
-- historico local voltar a refletir o estado real da base de dados.
-- Ja aplicada e registada no remoto — nao volta a correr num db push.
-- ============================================================

-- ============================================================
-- Eliminar uma proposta/orçamento/contrato retira-o do portal do cliente
-- ============================================================
-- Problema encontrado: soft_delete_business_entity() marca a linha como
-- apagada (deleted_at/is_deleted) mas nunca toca em client_portal_documents.
-- Nem a política de leitura do portal (portal_user_can_see_document, que só
-- olha para is_visible) nem o código do portal (ClientPortalProposals.tsx,
-- proposalPortalData.ts) filtram por deleted_at. Resultado: o cliente
-- continua a ver, no portal, um documento que a equipa já apagou.
--
-- Medido em produção antes desta migração: 20 propostas, 5 orçamentos e
-- 5 contratos já apagados continuam com is_visible = true no portal —
-- incluindo propostas em estado 'sent' e 'accepted', apagadas via
-- eliminação em massa (que não tem, e continua a não ter, restrição de
-- estado; essa é uma decisão de produto em aberto, não tratada aqui).
--
-- Esta migração:
--   1. Corrige _soft_delete_business_entity_impl para revogar o(s)
--      client_portal_documents correspondente(s) na mesma transação em que
--      apaga quote/proposal/contract (nunca em 'deal', que não tem portal).
--   2. Corrige os dados já expostos: revoga is_visible para os documentos
--      cuja entidade já está apagada, usando a data/autor reais da
--      eliminação (deleted_at/deleted_by), não "agora".
--
-- Prerequisites: 20260615130000_baseline_new_database.sql
--                (client_portal_documents.is_visible/revoked_at/revoked_by)

-- ============================================================
-- 1. _soft_delete_business_entity_impl — revogar o portal ao apagar
-- ============================================================

CREATE OR REPLACE FUNCTION public._soft_delete_business_entity_impl(p_kind text, p_id uuid, p_actor uuid, p_auth_uid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid; v_org_id uuid;
  v_target_org uuid;
BEGIN
  IF p_kind NOT IN ('deal','quote','proposal','contract') THEN
    RAISE EXCEPTION 'Invalid kind: %', p_kind;
  END IF;

  IF p_kind = 'deal' THEN
    SELECT organization_id INTO v_target_org FROM public.deals WHERE id = p_id;
  ELSIF p_kind = 'quote' THEN
    SELECT organization_id INTO v_target_org FROM public.quotes WHERE id = p_id;
  ELSIF p_kind = 'proposal' THEN
    SELECT organization_id INTO v_target_org FROM public.proposals WHERE id = p_id;
  ELSE
    SELECT organization_id INTO v_target_org FROM public.client_contracts WHERE id = p_id;
  END IF;

  IF v_target_org IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT (v_target_org IN (SELECT public.get_user_visible_org_ids(p_auth_uid))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kind = 'deal' THEN
    UPDATE public.deals SET deleted_at=now(), deleted_by=p_actor
      WHERE id=p_id AND deleted_at IS NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSIF p_kind = 'quote' THEN
    UPDATE public.quotes SET deleted_at=now(), deleted_by=p_actor
      WHERE id=p_id AND deleted_at IS NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSIF p_kind = 'proposal' THEN
    UPDATE public.proposals SET deleted_at=now(), deleted_by=p_actor, is_deleted=true
      WHERE id=p_id AND deleted_at IS NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSE
    UPDATE public.client_contracts SET deleted_at=now(), deleted_by=p_actor
      WHERE id=p_id AND deleted_at IS NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  END IF;

  IF v_entity_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.anew_entity_history(entity_id, change_type, field_name, old_value, new_value, changed_by, metadata)
      VALUES (v_entity_id, 'deleted', p_kind, NULL, p_id::text, p_actor,
              jsonb_build_object('kind', p_kind, 'id', p_id, 'organization_id', v_org_id));
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Retirar do portal do cliente na mesma transação. 'deal' não tem
    -- portal_document_type e fica de fora deste bloco.
    IF p_kind IN ('quote', 'proposal', 'contract') THEN
      UPDATE public.client_portal_documents
      SET is_visible = false,
          revoked_at = now(),
          revoked_by = p_actor
      WHERE document_type = p_kind::public.portal_document_type
        AND document_id = p_id
        AND is_visible = true;
    END IF;
  END IF;
  RETURN TRUE;
END;
$function$;

-- ============================================================
-- 2. Corrigir os documentos já expostos por eliminações anteriores
-- ============================================================
-- Data e autor reais da eliminação (não "agora"), para o registo continuar
-- a dizer a verdade sobre quando isto aconteceu.

UPDATE public.client_portal_documents d
SET is_visible = false,
    revoked_at = p.deleted_at,
    revoked_by = p.deleted_by
FROM public.proposals p
WHERE d.document_type = 'proposal'
  AND d.document_id = p.id
  AND p.deleted_at IS NOT NULL
  AND d.is_visible = true;

UPDATE public.client_portal_documents d
SET is_visible = false,
    revoked_at = q.deleted_at,
    revoked_by = q.deleted_by
FROM public.quotes q
WHERE d.document_type = 'quote'
  AND d.document_id = q.id
  AND q.deleted_at IS NOT NULL
  AND d.is_visible = true;

UPDATE public.client_portal_documents d
SET is_visible = false,
    revoked_at = cc.deleted_at,
    revoked_by = cc.deleted_by
FROM public.client_contracts cc
WHERE d.document_type = 'contract'
  AND d.document_id = cc.id
  AND cc.deleted_at IS NOT NULL
  AND d.is_visible = true;

-- ============================================================
-- CONFERIR
-- ============================================================
DO $$
DECLARE
  v_ainda_expostos int;
BEGIN
  SELECT count(*) INTO v_ainda_expostos
  FROM public.client_portal_documents d
  WHERE d.is_visible = true
    AND (
      (d.document_type = 'proposal' AND EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = d.document_id AND p.deleted_at IS NOT NULL))
      OR (d.document_type = 'quote' AND EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = d.document_id AND q.deleted_at IS NOT NULL))
      OR (d.document_type = 'contract' AND EXISTS (SELECT 1 FROM public.client_contracts cc WHERE cc.id = d.document_id AND cc.deleted_at IS NOT NULL))
    );

  IF v_ainda_expostos <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: % documento(s) apagado(s) continuam visíveis no portal', v_ainda_expostos;
  END IF;
END;
$$;
