-- Moradas de entrega: acessíveis a quem vê/edita as encomendas de cliente da organização.
--
-- Problema: fn_entity_delivery_address_access só aceitava a regra da ficha de
-- contacto (is_entity_contact_in_owner_scope + system_admin_pii_default_deny).
-- Um system admin que vê a organização pela hierarquia (ex.: BMClean) abre a
-- encomenda mas não consegue listar as moradas de entrega do cliente.
--
-- Correção: segunda via, alternativa (OR), igual às RPCs das encomendas:
--   * 'view' (listar): ficha anew_clients da entidade (não apagada) numa
--     organização com fn_deal_org_in_scope + inventory.view + client_contracts.view
--     (rpc_list_client_order_documents / rpc_get_client_order_document).
--   * 'add' (novo modo, adicionar): mesma ligação + client_contracts.edit
--     (rpc_update_manual_client_order / rpc_get_manual_client_order_edit).
--   * 'edit' fica EXATAMENTE como estava e continua a ser o modo do
--     rpc_remove_entity_delivery_address (remover não ganha a via nova).
-- rpc_add_entity_delivery_address passa a pedir o modo 'add' (restante corpo
-- igual à definição ao vivo).

CREATE OR REPLACE FUNCTION public.fn_entity_delivery_address_access(p_entity_id uuid, p_mode text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_original boolean := true;
BEGIN
  IF p_entity_id IS NULL OR v_uid IS NULL OR p_mode NOT IN ('view', 'edit', 'add') THEN
    RETURN false;
  END IF;

  -- ── Via 1: regra original (ficha de contacto) ─────────────────────────────
  IF p_mode = 'view' THEN
    IF NOT public.is_entity_contact_in_owner_scope(
             p_entity_id,
             public.crm_scope_keys('leads.view'),
             public.crm_scope_keys('clients.view')) THEN
      v_original := false;
    END IF;
  ELSE
    -- 'edit' e 'add'
    IF NOT public.is_entity_contact_in_owner_scope(
             p_entity_id,
             public.crm_scope_keys('leads.edit'),
             public.crm_scope_keys('clients.edit')) THEN
      v_original := false;
    END IF;
  END IF;

  -- system_admin_pii_default_deny (RESTRICTIVE)
  IF v_original AND public.is_system_admin(v_uid) THEN
    IF NOT (
      EXISTS (
        SELECT 1
        FROM public.anew_entity_roles er
        WHERE er.entity_id = p_entity_id
          AND er.deleted_at IS NULL
          AND er.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))
      )
      OR EXISTS (
        SELECT 1
        FROM public.anew_entity_roles er
        WHERE er.entity_id = p_entity_id
          AND er.deleted_at IS NULL
          AND public.has_active_support_access(er.organization_id)
      )
    ) THEN
      v_original := false;
    END IF;
  END IF;

  IF v_original THEN
    RETURN true;
  END IF;

  -- 'edit' (usado pelo remover) não tem segunda via.
  IF p_mode = 'edit' THEN
    RETURN false;
  END IF;

  -- ── Via 2: encomendas de cliente da organização ──────────────────────────
  IF p_mode = 'view' THEN
    IF NOT public.has_anew_permission(v_uid, 'inventory.view')
       OR NOT public.has_anew_permission(v_uid, 'client_contracts.view') THEN
      RETURN false;
    END IF;
  ELSE
    -- 'add'
    IF NOT public.has_anew_permission(v_uid, 'client_contracts.edit') THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.anew_clients c
    WHERE c.entity_id = p_entity_id
      AND c.deleted_at IS NULL
      AND public.fn_deal_org_in_scope(c.organization_id)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_entity_delivery_address_access(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_entity_delivery_address_access(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.fn_entity_delivery_address_access(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_entity_delivery_address_access(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_add_entity_delivery_address(p_entity_id uuid, p_street text, p_number text DEFAULT NULL::text, p_postal_code text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_floor text DEFAULT NULL::text, p_unit text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor      uuid;
  v_street     text := btrim(coalesce(p_street, ''));
  v_number     text := btrim(coalesce(p_number, ''));
  v_floor      text := nullif(btrim(coalesce(p_floor, '')), '');
  v_unit       text := nullif(btrim(coalesce(p_unit, '')), '');
  v_postal     text := btrim(coalesce(p_postal_code, ''));
  v_city       text := btrim(coalesce(p_city, ''));
  v_country    text := 'PT';
  v_key        text;
  v_address_id uuid;
  v_link_id    uuid;
  v_existing   boolean := false;
  v_formatted  text;
BEGIN
  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'entity_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_entities e WHERE e.id = p_entity_id) THEN
    RAISE EXCEPTION 'Cliente não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.fn_entity_delivery_address_access(p_entity_id, 'add') THEN
    RAISE EXCEPTION 'Sem permissão para alterar as moradas deste cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_street = '' THEN
    RAISE EXCEPTION 'A rua é obrigatória' USING ERRCODE = 'check_violation';
  END IF;
  IF v_postal = '' THEN
    RAISE EXCEPTION 'O código postal é obrigatório' USING ERRCODE = 'check_violation';
  END IF;
  -- Mesmo formato da ficha (POSTAL_CODE_PT_PATTERN / sync_entity_primary_address).
  IF v_postal !~ '^[0-9]{4}-[0-9]{3}$' OR v_postal = '0000-000' THEN
    RAISE EXCEPTION 'Código postal inválido (formato 0000-000)' USING ERRCODE = 'check_violation';
  END IF;
  IF v_city = '' THEN
    RAISE EXCEPTION 'A localidade é obrigatória' USING ERRCODE = 'check_violation';
  END IF;

  -- Mesmo cálculo de address_key que assign_address_to_org.
  v_key :=
    lower(v_street) || '|' ||
    lower(v_number) || '|' ||
    lower(coalesce(v_floor, '')) || '|' ||
    lower(coalesce(v_unit, '')) || '|' ||
    lower(v_postal) || '|' ||
    lower(v_city) || '|' ||
    lower(v_country);

  -- Reutiliza uma morada existente (nunca lhe faz UPDATE); senão cria.
  SELECT a.id INTO v_address_id
  FROM public.anew_addresses a
  WHERE a.address_key = v_key
  ORDER BY a.created_at
  LIMIT 1;

  IF v_address_id IS NULL THEN
    INSERT INTO public.anew_addresses (
      street, number, floor, unit, postal_code, city, country, address_key, created_by
    ) VALUES (
      v_street, v_number, v_floor, v_unit, v_postal, v_city, v_country, v_key, v_actor
    )
    RETURNING id INTO v_address_id;
  ELSE
    -- Já ligada a esta entidade como entrega ativa? Devolve a existente.
    SELECT ea.id INTO v_link_id
    FROM public.anew_entity_addresses ea
    WHERE ea.entity_id = p_entity_id
      AND ea.address_id = v_address_id
      AND ea.address_type = 'delivery'
      AND (ea.valid_to IS NULL OR ea.valid_to > now())
    ORDER BY ea.created_at
    LIMIT 1;
    v_existing := v_link_id IS NOT NULL;
  END IF;

  IF v_link_id IS NULL THEN
    INSERT INTO public.anew_entity_addresses (
      entity_id, address_id, address_type, is_primary, is_fiscal, valid_from, created_by
    ) VALUES (
      p_entity_id, v_address_id, 'delivery', false, false, now(), v_actor
    )
    RETURNING id INTO v_link_id;
  END IF;

  SELECT nullif(concat_ws(', ',
           nullif(btrim(a.street), ''),
           nullif(btrim(a.number), ''),
           nullif(btrim(a.postal_code), ''),
           nullif(btrim(a.city), '')
         ), '')
    INTO v_formatted
  FROM public.anew_addresses a
  WHERE a.id = v_address_id;

  RETURN jsonb_build_object(
    'entity_address_id', v_link_id,
    'address_id',        v_address_id,
    'formatted',         v_formatted,
    'already_existed',   v_existing
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_add_entity_delivery_address(uuid, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_add_entity_delivery_address(uuid, text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_add_entity_delivery_address(uuid, text, text, text, text, text, text) TO authenticated;
