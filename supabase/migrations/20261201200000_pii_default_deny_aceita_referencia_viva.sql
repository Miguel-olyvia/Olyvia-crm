-- ============================================================
-- system_admin_pii_default_deny passa a aceitar qualquer referência viva,
-- não só a etiqueta em anew_entity_roles
-- ============================================================
-- Problema encontrado (contrato CC-2026-0257, entidade "Inácio Sin Fan"):
--
-- Um system_admin não conseguia ver o nome do cliente numa proposta e num
-- contrato reais, ambos activos. A entidade tem uma lead activa e visível
-- na listagem de leads — os dados estão todos bem.
--
-- Causa: a política RESTRICTIVE system_admin_pii_default_deny exige, para
-- um system_admin ver os dados pessoais de uma entidade, que exista uma
-- linha ACTIVA (deleted_at IS NULL) em anew_entity_roles para ela. Essa
-- tabela guarda no máximo UMA linha por (entidade, organização, papel) —
-- é actualizada, não duplicada, quando a mesma pessoa gera uma segunda
-- lead. Esta pessoa teve duas leads criadas no mesmo dia (29/08); uma
-- ficou incompleta e foi apagada a 31/08 — soft_delete_entity_facet apaga
-- a etiqueta partilhada de (entidade, organização, papel) sem verificar se
-- ainda há outra lead viva da mesma pessoa. A etiqueta ficou riscada;
-- a outra lead, a proposta e o contrato continuaram vivos.
--
-- Ou seja: a política confia numa única etiqueta frágil como única prova
-- de "esta pessoa pertence aqui", quando o próprio sistema já sabe
-- responder a essa pergunta de forma mais robusta — é exactamente o que
-- can_see_entity() já faz para a política de leitura normal, olhando para
-- leads/contactos/clientes/orçamentos/negócios/contratos/propostas vivos,
-- não só para anew_entity_roles.
--
-- Medido em produção antes desta migração: 11 entidades no sistema inteiro
-- estão nesta situação — referenciadas por um documento vivo, sem nenhuma
-- linha activa em anew_entity_roles.
--
-- Correcção: nova função entity_has_live_business_reference(), que alarga
-- exactamente essa pergunta (entity_roles OU lead/contacto/cliente/
-- orçamento/negócio/contrato/proposta vivos numa organização visível) e é
-- usada na política em vez do EXISTS estreito anterior. Não se reutiliza
-- can_see_entity() directamente porque essa função já faz bypass total
-- para system_admin logo na primeira linha — usá-la aqui anularia a
-- política inteira. can_see_entity() mantém-se inalterada.

-- ============================================================
-- 1. Nova função: entidade tem alguma referência viva numa org visível?
-- ============================================================

CREATE OR REPLACE FUNCTION public.entity_has_live_business_reference(p_entity_id uuid, p_auth_uid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_visible uuid[];
BEGIN
  IF p_entity_id IS NULL OR p_auth_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT ARRAY(SELECT public.get_user_visible_org_ids(p_auth_uid)) INTO v_visible;
  IF v_visible IS NULL OR array_length(v_visible, 1) IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.anew_entity_roles er
    WHERE er.entity_id = p_entity_id
      AND er.deleted_at IS NULL
      AND er.organization_id = ANY(v_visible)
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.anew_leads x
    WHERE x.entity_id = p_entity_id AND x.deleted_at IS NULL
      AND (x.organization_id = ANY(v_visible) OR x.root_organization_id = ANY(v_visible))
  ) THEN RETURN true; END IF;

  IF EXISTS (
    SELECT 1 FROM public.anew_contacts x
    WHERE x.entity_id = p_entity_id AND x.deleted_at IS NULL
      AND (x.organization_id = ANY(v_visible) OR x.root_organization_id = ANY(v_visible))
  ) THEN RETURN true; END IF;

  IF EXISTS (
    SELECT 1 FROM public.anew_clients x
    WHERE x.entity_id = p_entity_id AND x.deleted_at IS NULL
      AND (x.organization_id = ANY(v_visible) OR x.root_organization_id = ANY(v_visible))
  ) THEN RETURN true; END IF;

  IF EXISTS (
    SELECT 1 FROM public.quotes x
    WHERE x.entity_id = p_entity_id AND x.deleted_at IS NULL
      AND (x.organization_id = ANY(v_visible) OR x.root_organization_id = ANY(v_visible))
  ) THEN RETURN true; END IF;

  IF EXISTS (
    SELECT 1 FROM public.deals x
    WHERE x.entity_id = p_entity_id AND x.deleted_at IS NULL
      AND (x.organization_id = ANY(v_visible) OR x.root_organization_id = ANY(v_visible))
  ) THEN RETURN true; END IF;

  IF EXISTS (
    SELECT 1 FROM public.client_contracts x
    WHERE x.entity_id = p_entity_id AND x.deleted_at IS NULL
      AND (x.organization_id = ANY(v_visible) OR x.root_organization_id = ANY(v_visible))
  ) THEN RETURN true; END IF;

  IF EXISTS (
    SELECT 1 FROM public.proposals x
    WHERE x.entity_id = p_entity_id AND x.deleted_at IS NULL
      AND (x.organization_id = ANY(v_visible) OR x.root_organization_id = ANY(v_visible))
  ) THEN RETURN true; END IF;

  RETURN false;
END;
$function$;

-- ============================================================
-- 2. system_admin_pii_default_deny — usar a função nova
-- ============================================================

DROP POLICY IF EXISTS system_admin_pii_default_deny ON public.anew_entities;

CREATE POLICY system_admin_pii_default_deny
  ON public.anew_entities
  AS RESTRICTIVE
  FOR ALL
  USING (
    (NOT public.is_system_admin((SELECT auth.uid())))
    OR public.entity_has_live_business_reference(anew_entities.id, (SELECT auth.uid()))
    OR (
      public.is_system_admin((SELECT auth.uid()))
      AND EXISTS (
        SELECT 1 FROM public.anew_entity_roles er
        WHERE er.entity_id = anew_entities.id
          AND er.deleted_at IS NULL
          AND public.has_active_support_access(er.organization_id)
      )
    )
  )
  WITH CHECK (
    (NOT public.is_system_admin((SELECT auth.uid())))
    OR public.entity_has_live_business_reference(anew_entities.id, (SELECT auth.uid()))
  );

-- ============================================================
-- CONFERIR
-- ============================================================
DO $$
DECLARE
  v_visivel boolean;
BEGIN
  -- Simula exactamente o caso que originou esta migração: entidade com
  -- proposta e contrato vivos na Mudelar, mas sem anew_entity_roles activo.
  SELECT public.entity_has_live_business_reference(
    '8dbad11c-e77a-47bb-9b57-7b4c6ee11143'::uuid,
    (SELECT auth_user_id FROM public.anew_users WHERE email = 'miguel.carvalho@bmlar.pt')
  ) INTO v_visivel;

  IF v_visivel IS NOT TRUE THEN
    RAISE EXCEPTION 'CONFERIR: entity_has_live_business_reference deveria devolver true para o caso Inacio Sin Fan';
  END IF;
END;
$$;
