-- ============================================================
-- 20270108310000_lixo_pedidos_orcamentos_exige_apagar
-- ============================================================
-- O que faz (auditoria de permissões 05/11, P1.6):
--   soft_delete_business_entity('deal'|'quote') mandava pedidos de proposta e orçamentos para o Lixo a qualquer membro da
--   organização (_soft_delete_business_entity_impl só verificava permissão para 'proposal' e 'contract'). Passa a exigir
--   deals.delete / quotes.delete na organização do registo (ou numa acima; o admin de sistema passa) — a mesma permissão que o
--   ecrã pede (Deals.tsx deletePermission/canActOnDeal("deals.delete"); Quotes.tsx PermissionGate quotes.delete).
--   rpc_bulk_delete_deal (eliminação em massa no ecrã de Pedidos de Proposta) tinha o mesmo buraco: passa a exigir deals.delete.
-- Papéis verificados antes (05/11): só super_admin e system_admin têm deals.edit/quotes.edit e ambos têm deals.delete/quotes.delete;
--   ninguém perde acesso. (O assistente IA pré-verifica deals.edit/quotes.edit para «cancelar»; agora o servidor pede delete.)
-- Funções reescritas a partir de pg_get_functiondef (vivas, 05/11/2026); só se acrescentou a verificação. Sem tabelas nem colunas.
-- ============================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public._soft_delete_business_entity_impl(p_kind text, p_id uuid, p_actor uuid, p_auth_uid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid; v_org_id uuid;
  v_target_org uuid;
  v_proposal_status text;
  -- NOVO (20261204900000)
  v_contract_status     text;
  v_contract_manual     boolean;
  v_contract_created_by uuid;
  v_contract_assigned   uuid;
  v_full_access         boolean;
BEGIN
  IF p_kind NOT IN ('deal','quote','proposal','contract') THEN
    RAISE EXCEPTION 'Invalid kind: %', p_kind;
  END IF;

  IF p_kind = 'deal' THEN
    SELECT organization_id INTO v_target_org FROM public.deals WHERE id = p_id;
  ELSIF p_kind = 'quote' THEN
    SELECT organization_id INTO v_target_org FROM public.quotes WHERE id = p_id;
  ELSIF p_kind = 'proposal' THEN
    SELECT organization_id, status INTO v_target_org, v_proposal_status FROM public.proposals WHERE id = p_id;
  ELSE
    -- NOVO (20261204900000): também estado, origem e dono.
    SELECT organization_id, status, is_manual_order, created_by, assigned_to
      INTO v_target_org, v_contract_status, v_contract_manual, v_contract_created_by, v_contract_assigned
      FROM public.client_contracts WHERE id = p_id;
  END IF;

  IF v_target_org IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT (v_target_org IN (SELECT public.get_user_visible_org_ids(p_auth_uid))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270108310000: pedidos de proposta e orçamentos exigem a permissão de apagar NA organização do registo (ou numa acima;
  -- o admin de sistema passa). Antes bastava a organização ser visível (auditoria de permissões 05/11, P1.6).
  IF p_kind = 'deal' AND NOT public.has_anew_permission_in_org_or_ancestor(p_auth_uid, 'deals.delete', v_target_org) THEN
    RAISE EXCEPTION 'Sem permissao para eliminar pedidos de proposta' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_kind = 'quote' AND NOT public.has_anew_permission_in_org_or_ancestor(p_auth_uid, 'quotes.delete', v_target_org) THEN
    RAISE EXCEPTION 'Sem permissao para eliminar orcamentos' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Eliminar uma proposta exige 'proposals.delete'; eliminar uma que já
  -- saiu de rascunho exige adicionalmente 'proposals.delete_sent'. Fecha
  -- o caminho da RPC directa, da eliminação em massa e da ferramenta
  -- cancel_proposal do assistente de IA (que só verificava
  -- 'proposals.edit').
  IF p_kind = 'proposal' THEN
    IF NOT public.has_anew_permission(p_auth_uid, 'proposals.delete') THEN
      RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_proposal_status IS DISTINCT FROM 'draft'
       AND NOT public.has_anew_permission(p_auth_uid, 'proposals.delete_sent') THEN
      RAISE EXCEPTION 'Sem permissao para eliminar propostas ja enviadas' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- NOVO (20261204900000): contratos exigem client_contracts.delete com
  -- âmbito, nunca assinados, e nunca encomendas de cliente (essas têm de
  -- passar por rpc_delete_client_order, que estorna stock e cancela POs).
  IF p_kind = 'contract' THEN
    IF NOT public.has_anew_permission(p_auth_uid, 'client_contracts.delete') THEN
      RAISE EXCEPTION 'Sem permissao para eliminar contratos' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF COALESCE(v_contract_manual, false) THEN
      RAISE EXCEPTION 'Encomendas de cliente eliminam-se em Encomendas Clientes (rpc_delete_client_order), que devolve o stock e cancela os pedidos a fornecedor'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_contract_status IN ('signed', 'active', 'assinado') THEN
      RAISE EXCEPTION 'Contratos assinados têm de ser anulados antes de eliminar' USING ERRCODE = 'check_violation';
    END IF;

    -- Âmbito: system admin mantém o comportamento anterior (organização
    -- visível chega); super admin na organização ou num antepassado = ORG
    -- (como resolve_lead_access_context e o frontend). Restantes: chaves de
    -- client_contracts.delete casadas com created_by/assigned_to, como a RLS
    -- client_contracts_delete. crm_scope_keys usa auth.uid(): um chamador
    -- service_role a agir por outro utilizador não tem chaves e é recusado.
    v_full_access :=
      public.is_system_admin(p_auth_uid)
      OR EXISTS (
        WITH RECURSIVE chain AS (
          SELECT v_target_org AS org_id
          UNION
          SELECT h.parent_org_id
            FROM public.anew_hierarchy h
            JOIN chain c ON c.org_id = h.child_org_id
           WHERE h.parent_org_id IS NOT NULL
        )
        SELECT 1
          FROM public.anew_memberships m
          JOIN public.anew_users u ON u.id = m.user_id
          JOIN public.anew_roles r ON r.id = m.role_id
         WHERE u.auth_user_id = p_auth_uid
           AND m.status = 'active'
           AND r.code = 'super_admin'
           AND m.organization_id IN (SELECT org_id FROM chain)
      );

    IF NOT v_full_access AND (
         p_auth_uid IS DISTINCT FROM auth.uid()
         OR NOT EXISTS (
           SELECT 1
             FROM unnest(public.crm_scope_keys('client_contracts.delete')) AS k(scope_key)
            WHERE k.scope_key = v_target_org::text || ':*'
               OR k.scope_key = v_target_org::text || ':' || v_contract_created_by::text
               OR k.scope_key = v_target_org::text || ':' || v_contract_assigned::text
         )
       ) THEN
      RAISE EXCEPTION 'Sem permissao para eliminar este contrato (fora do seu ambito)' USING ERRCODE = 'insufficient_privilege';
    END IF;
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

    -- Retirar do portal do cliente na mesma transação (20261201070000).
    -- 'deal' não tem portal_document_type e fica de fora deste bloco.
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

CREATE OR REPLACE FUNCTION public.rpc_bulk_delete_deal(p_ids uuid[], p_organization_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor       uuid;
  v_ids         uuid[];
  v_before      public.deals;
  v_count       integer := 0;
BEGIN
  -- Consolidate all writes into per-entity audit rows via fn_manual_audit_log,
  -- suppressing the trigger fan-out on deals.
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para eliminação em massa'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Authorization parity with deals_delete RLS ────────────────────────────
  IF NOT public.fn_deal_org_in_scope(p_organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270108310000: a eliminação em massa exige deals.delete na organização (como soft_delete_business_entity e a política
  -- de DELETE de deals). Antes bastava a organização ser visível.
  IF NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'deals.delete', p_organization_id) THEN
    RAISE EXCEPTION 'Sem permissao para eliminar pedidos de proposta' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Dedup ids (mirrors the Set-backed selection, ignore NULLs) ────────────
  IF p_ids IS NULL THEN
    v_ids := ARRAY[]::uuid[];
  ELSE
    SELECT COALESCE(array_agg(DISTINCT o), ARRAY[]::uuid[])
    INTO   v_ids
    FROM   unnest(p_ids) AS u(o)
    WHERE  o IS NOT NULL;
  END IF;

  IF array_length(v_ids, 1) IS NULL OR array_length(v_ids, 1) = 0 THEN
    RETURN 0;
  END IF;

  -- ── Soft-delete the in-scope, not-yet-deleted rows; audit once each ───────
  -- Scoping by organization_id = p_organization_id reproduces the FE's
  -- .in("id", ids).eq("organization_id", org): a deal whose org differs from
  -- the active org is silently skipped. deleted_at IS NULL makes this
  -- idempotent for already-deleted deals in the selection, matching
  -- soft_delete_business_entity's own guard.
  FOR v_before IN
    SELECT * FROM public.deals
    WHERE id = ANY (v_ids)
      AND organization_id = p_organization_id
      AND deleted_at IS NULL
  LOOP
    UPDATE public.deals
    SET    deleted_at = now(), deleted_by = v_actor
    WHERE  id = v_before.id
      AND  organization_id = p_organization_id;

    -- One consolidated UPDATE audit row per deal — the row is never removed.
    PERFORM public.fn_manual_audit_log(
      'deals',
      v_before.id,
      p_organization_id,
      'UPDATE',
      jsonb_build_object(
        'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now())),
        'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', to_jsonb(v_actor))
      ),
      'web_app'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;
