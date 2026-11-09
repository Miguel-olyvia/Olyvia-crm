-- 20270109420000 — Lixo: restaurar pede a permissão de apagar de cada tipo, na organização do registo.
-- restore_business_entity: deal -> deals.delete, quote -> quotes.delete, proposal -> proposals.delete (contratos e encomendas
--   já pediam client_contracts.delete / client_orders.delete). restore_entity_facet: lead -> leads.delete,
--   contact -> contacts.delete, client -> clients.delete (as mesmas que soft_delete_entity_facet).
-- Antes bastava a organização ser visível. Quem hoje restaura (só super_admin/system_admin têm trash.view) tem todas estas.
-- Partiu de pg_get_functiondef das versões vivas (md5 confirmado abaixo).

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.restore_business_entity(text,uuid)'::regprocedure)) <> 'b8f7e957ca751f5aacb2c3f06314d9c4' THEN
    RAISE EXCEPTION 'restore_business_entity mudou desde a leitura - parar e reler';
  END IF;
  IF md5(pg_get_functiondef('public.restore_entity_facet(text,uuid)'::regprocedure)) <> '87356db27c271c22bd7261a4cb5a320e' THEN
    RAISE EXCEPTION 'restore_entity_facet mudou desde a leitura - parar e reler';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.restore_business_entity(p_kind text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid;
  v_org_id uuid;
  v_actor uuid := auth.uid();
  v_target_org uuid;
  -- NOVO (20261204900000)
  v_contract_manual boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kind NOT IN ('deal','quote','proposal','contract') THEN
    RAISE EXCEPTION 'Invalid kind: %', p_kind;
  END IF;

  -- Determine organization of the target row BEFORE acting.
  IF p_kind = 'deal' THEN
    SELECT organization_id INTO v_target_org FROM public.deals WHERE id = p_id;
  ELSIF p_kind = 'quote' THEN
    SELECT organization_id INTO v_target_org FROM public.quotes WHERE id = p_id;
  ELSIF p_kind = 'proposal' THEN
    SELECT organization_id INTO v_target_org FROM public.proposals WHERE id = p_id;
  ELSE
    SELECT organization_id, is_manual_order INTO v_target_org, v_contract_manual
      FROM public.client_contracts WHERE id = p_id;
  END IF;

  IF v_target_org IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT (v_target_org IN (SELECT public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- NOVO (20261204900000): restaurar é o inverso de eliminar e exige a mesma
  -- permissão. Encomendas de cliente (manuais / venda direta) exigem
  -- client_orders.delete; contratos reais client_contracts.delete. Uma
  -- encomenda restaurada continua 'cancelled' (sem efeitos em stock) e a VD
  -- continua 'cancelada' — só volta a aparecer.
  IF p_kind = 'contract' THEN
    IF COALESCE(v_contract_manual, false) THEN
      IF NOT public.has_anew_permission_for_org(v_actor, 'client_orders.delete', v_target_org) THEN
        RAISE EXCEPTION 'Sem permissao para restaurar encomendas de cliente' USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSIF NOT public.has_anew_permission(v_actor, 'client_contracts.delete') THEN
      RAISE EXCEPTION 'Sem permissao para restaurar contratos' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- 20270109420000: pedidos de proposta, orçamentos e propostas também só se restauram com a permissão de apagar do tipo,
  -- na organização do registo (antes bastava a organização ser visível).
  IF p_kind = 'deal' AND NOT public.has_anew_permission_for_org(v_actor, 'deals.delete', v_target_org) THEN
    RAISE EXCEPTION 'Sem permissao para restaurar pedidos de proposta' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_kind = 'quote' AND NOT public.has_anew_permission_for_org(v_actor, 'quotes.delete', v_target_org) THEN
    RAISE EXCEPTION 'Sem permissao para restaurar orcamentos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_kind = 'proposal' AND NOT public.has_anew_permission_for_org(v_actor, 'proposals.delete', v_target_org) THEN
    RAISE EXCEPTION 'Sem permissao para restaurar propostas' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kind = 'deal' THEN
    UPDATE public.deals SET deleted_at = NULL, deleted_by = NULL
      WHERE id = p_id AND deleted_at IS NOT NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSIF p_kind = 'quote' THEN
    UPDATE public.quotes SET deleted_at = NULL, deleted_by = NULL
      WHERE id = p_id AND deleted_at IS NOT NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSIF p_kind = 'proposal' THEN
    UPDATE public.proposals SET deleted_at = NULL, deleted_by = NULL, is_deleted = false
      WHERE id = p_id AND deleted_at IS NOT NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSE
    UPDATE public.client_contracts SET deleted_at = NULL, deleted_by = NULL
      WHERE id = p_id AND deleted_at IS NOT NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  END IF;

  IF v_entity_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.anew_entity_history(entity_id, change_type, field_name, old_value, new_value, changed_by, metadata)
      VALUES (v_entity_id, 'restored', p_kind, p_id::text, NULL, v_actor,
              jsonb_build_object('kind', p_kind, 'id', p_id, 'organization_id', v_org_id));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_entity_facet(p_kind text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth       uuid := auth.uid();
  v_actor      uuid := public.resolve_business_user_id(auth.uid());
  v_table      text;
  v_entity_id  uuid;
  v_org_id     uuid;
  v_deleted_at timestamptz;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'restore_entity_facet: actor not resolved for auth.uid=%', auth.uid()
      USING ERRCODE = 'P0001';
  END IF;

  v_table := CASE p_kind
    WHEN 'lead'    THEN 'anew_leads'
    WHEN 'contact' THEN 'anew_contacts'
    WHEN 'client'  THEN 'anew_clients'
    ELSE NULL END;
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Invalid kind: %', p_kind;
  END IF;

  EXECUTE format(
    'SELECT entity_id, organization_id, deleted_at FROM public.%I WHERE id = $1', v_table)
  INTO v_entity_id, v_org_id, v_deleted_at
  USING p_id;

  IF v_deleted_at IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Determine organization of the target row BEFORE acting: reject cross-org
  -- restore attempts (same check as restore_business_entity).
  IF NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(v_auth))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270109420000: restaurar pede a mesma permissão que apagar (soft_delete_entity_facet), na organização do registo.
  IF NOT public.has_anew_permission_for_org(
           v_auth,
           CASE p_kind WHEN 'lead' THEN 'leads.delete' WHEN 'contact' THEN 'contacts.delete' ELSE 'clients.delete' END,
           v_org_id) THEN
    RAISE EXCEPTION 'Sem permissao para restaurar' USING ERRCODE = 'insufficient_privilege';
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET deleted_at = NULL, deleted_by = NULL WHERE id = $1', v_table)
  USING p_id;

  UPDATE public.anew_entity_roles
     SET status          = COALESCE(previous_status, 'active'),
         previous_status = NULL,
         deleted_at      = NULL,
         deleted_by      = NULL
   WHERE entity_id = v_entity_id
     AND organization_id = v_org_id
     AND role = p_kind
     AND status = 'deleted'
     AND deleted_at = v_deleted_at;

  UPDATE public.deals SET deleted_at = NULL, deleted_by = NULL
   WHERE entity_id = v_entity_id AND organization_id = v_org_id AND deleted_at = v_deleted_at;

  UPDATE public.quotes SET deleted_at = NULL, deleted_by = NULL
   WHERE entity_id = v_entity_id AND organization_id = v_org_id AND deleted_at = v_deleted_at;

  UPDATE public.client_contracts SET deleted_at = NULL, deleted_by = NULL
   WHERE entity_id = v_entity_id AND organization_id = v_org_id AND deleted_at = v_deleted_at;

  UPDATE public.proposals SET deleted_at = NULL, deleted_by = NULL, is_deleted = FALSE
   WHERE entity_id = v_entity_id AND organization_id = v_org_id AND deleted_at = v_deleted_at;

  BEGIN
    INSERT INTO public.anew_entity_history(entity_id, change_type, field_name, old_value, new_value, changed_by, metadata)
    VALUES (v_entity_id, 'restored', p_kind, p_id::text, NULL, v_actor,
            jsonb_build_object('kind', p_kind, 'id', p_id, 'organization_id', v_org_id,
                               'deleted_at', v_deleted_at));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN TRUE;
END;
$function$;
