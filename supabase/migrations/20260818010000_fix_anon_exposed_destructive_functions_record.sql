-- Registo (record-only): estas 9 funcoes ja foram corrigidas e aplicadas diretamente na BD live nesta sessao.
-- Este ficheiro so documenta o estado atual para que um futuro supabase db reset nao reintroduza as vulnerabilidades.
-- Fix: adicionado guard auth.uid()/v_actor IS NULL + verificacao de organizacao/permissao + REVOKE de anon/PUBLIC.

-- === delete_organization_subtree ===
CREATE OR REPLACE FUNCTION public.delete_organization_subtree(p_root_org_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_root_org_id IS NULL THEN
    RAISE EXCEPTION 'root_org_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = p_root_org_id) THEN
    RAISE EXCEPTION 'Organization does not exist';
  END IF;

  IF NOT (p_root_org_id = ANY (public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(v_actor, 'organizations.delete') THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH RECURSIVE subtree AS (
    SELECT p_root_org_id AS org_id
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN subtree s ON h.parent_org_id = s.org_id
  )
  SELECT array_agg(org_id) INTO v_ids FROM subtree;

  DELETE FROM public.anew_hierarchy
  WHERE parent_org_id = ANY(v_ids)
     OR child_org_id = ANY(v_ids);

  DELETE FROM public.anew_organizations
  WHERE id = ANY(v_ids);

  RETURN v_ids;
END;
$function$
;

-- === move_organization_node ===
CREATE OR REPLACE FUNCTION public.move_organization_node(p_child_org_id uuid, p_new_parent_org_id uuid, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_child uuid;
  v_actor uuid := auth.uid();
  v_visible uuid[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_child_org_id IS NULL OR p_new_parent_org_id IS NULL THEN
    RAISE EXCEPTION 'child_org_id and new_parent_org_id are required';
  END IF;

  IF p_child_org_id = p_new_parent_org_id THEN
    RAISE EXCEPTION 'An organization cannot be its own parent';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = p_child_org_id) THEN
    RAISE EXCEPTION 'Child organization does not exist';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = p_new_parent_org_id) THEN
    RAISE EXCEPTION 'Parent organization does not exist';
  END IF;

  -- Do not trust client-supplied identity: derive actor from auth.uid().
  -- p_created_by is intentionally ignored.
  v_visible := public.get_user_visible_org_ids(v_actor);
  IF NOT (p_child_org_id = ANY (v_visible)) OR NOT (p_new_parent_org_id = ANY (v_visible)) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH RECURSIVE descendants AS (
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    WHERE h.parent_org_id = p_child_org_id
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN descendants d ON h.parent_org_id = d.child_org_id
  )
  SELECT child_org_id INTO v_existing_child
  FROM descendants
  WHERE child_org_id = p_new_parent_org_id
  LIMIT 1;

  IF v_existing_child IS NOT NULL THEN
    RAISE EXCEPTION 'Move would create a hierarchy cycle';
  END IF;

  DELETE FROM public.anew_hierarchy
  WHERE child_org_id = p_child_org_id;

  INSERT INTO public.anew_hierarchy (
    parent_org_id,
    child_org_id,
    relationship_type,
    is_primary,
    created_by
  ) VALUES (
    p_new_parent_org_id,
    p_child_org_id,
    'parent_of',
    true,
    v_actor
  );
END;
$function$
;

-- === purge_business_entity ===
CREATE OR REPLACE FUNCTION public.purge_business_entity(p_kind text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid;
  v_org_id uuid;
  v_actor uuid := auth.uid();
  v_live_count int;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kind NOT IN ('deal','quote','proposal','contract') THEN
    RAISE EXCEPTION 'Invalid kind: %', p_kind;
  END IF;

  -- Determine organization of the target row BEFORE acting.
  IF p_kind = 'deal' THEN
    SELECT entity_id, organization_id INTO v_entity_id, v_org_id FROM public.deals WHERE id = p_id;
  ELSIF p_kind = 'quote' THEN
    SELECT entity_id, organization_id INTO v_entity_id, v_org_id FROM public.quotes WHERE id = p_id;
  ELSIF p_kind = 'proposal' THEN
    SELECT entity_id, organization_id INTO v_entity_id, v_org_id FROM public.proposals WHERE id = p_id;
  ELSE
    SELECT entity_id, organization_id INTO v_entity_id, v_org_id FROM public.client_contracts WHERE id = p_id;
  END IF;

  IF v_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT (v_org_id = ANY (public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(v_actor, 'deals.delete') THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kind = 'deal' THEN
    -- bloqueio: não permitir purge se houver quotes/proposals vivos ligados
    SELECT count(*) INTO v_live_count FROM public.quotes WHERE deal_id = p_id AND deleted_at IS NULL;
    IF v_live_count > 0 THEN
      RAISE EXCEPTION 'Não é possível eliminar definitivamente: existem % orçamento(s) vivos ligados. Apague-os primeiro.', v_live_count;
    END IF;
    SELECT count(*) INTO v_live_count FROM public.proposals WHERE deal_id = p_id AND deleted_at IS NULL;
    IF v_live_count > 0 THEN
      RAISE EXCEPTION 'Não é possível eliminar definitivamente: existem % proposta(s) vivas ligadas. Apague-as primeiro.', v_live_count;
    END IF;

    -- purge filhos soft-deleted explicitamente (CASCADE trataria, mas queremos limpar tudo)
    DELETE FROM public.proposals WHERE deal_id = p_id; -- CASCADE em proposal_*
    DELETE FROM public.quotes WHERE deal_id = p_id;    -- CASCADE em quote_*
    DELETE FROM public.deals WHERE id = p_id;

  ELSIF p_kind = 'quote' THEN
    -- quote_lines, quote_fees, quote_documents já têm ON DELETE CASCADE
    DELETE FROM public.quote_sends WHERE quote_id = p_id;
    DELETE FROM public.quotes WHERE id = p_id;

  ELSIF p_kind = 'proposal' THEN
    -- proposal_items, proposal_sends, proposal_access_tokens, proposal_deliveries, proposal_verification_codes têm CASCADE
    DELETE FROM public.proposals WHERE id = p_id;

  ELSE -- contract
    -- contract_sends, client_contract_*, contract_documents têm CASCADE
    DELETE FROM public.client_contracts WHERE id = p_id;
  END IF;

  IF v_entity_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.anew_entity_history(entity_id, change_type, field_name, old_value, new_value, changed_by, metadata)
      VALUES (v_entity_id, 'purged', p_kind, p_id::text, NULL, v_actor,
              jsonb_build_object('kind', p_kind, 'id', p_id, 'organization_id', v_org_id));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN TRUE;
END;
$function$
;

-- === purge_entity_facet ===
CREATE OR REPLACE FUNCTION public.purge_entity_facet(p_kind text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid; v_org_id uuid; v_role text;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kind NOT IN ('lead','contact','client') THEN
    RAISE EXCEPTION 'Invalid kind: %', p_kind;
  END IF;
  v_role := p_kind;

  IF p_kind = 'lead' THEN
    SELECT entity_id, organization_id INTO v_entity_id, v_org_id FROM public.anew_leads WHERE id = p_id;
  ELSIF p_kind = 'contact' THEN
    SELECT entity_id, organization_id INTO v_entity_id, v_org_id FROM public.anew_contacts WHERE id = p_id;
  ELSE
    SELECT entity_id, organization_id INTO v_entity_id, v_org_id FROM public.anew_clients WHERE id = p_id;
  END IF;

  IF v_org_id IS NULL THEN
    -- Row not found (or already gone): nothing to purge, do not leak.
    RETURN FALSE;
  END IF;

  IF NOT (v_org_id = ANY (public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(v_actor, 'organizations.delete') THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kind = 'lead' THEN
    DELETE FROM public.anew_leads WHERE id = p_id;
  ELSIF p_kind = 'contact' THEN
    DELETE FROM public.anew_contacts WHERE id = p_id;
  ELSE
    DELETE FROM public.anew_clients WHERE id = p_id;
  END IF;

  IF v_entity_id IS NOT NULL THEN
    DELETE FROM public.anew_entity_roles
      WHERE entity_id = v_entity_id AND organization_id = v_org_id AND role = v_role;
    INSERT INTO public.anew_entity_history(entity_id, change_type, field_name, old_value, new_value, changed_by, metadata)
    VALUES (v_entity_id, 'purged', v_role, p_id::text, NULL, v_actor,
            jsonb_build_object('kind', p_kind, 'id', p_id, 'organization_id', v_org_id));
  END IF;

  RETURN TRUE;
END;
$function$
;

-- === restore_business_entity ===
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
    SELECT organization_id INTO v_target_org FROM public.client_contracts WHERE id = p_id;
  END IF;

  IF v_target_org IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT (v_target_org = ANY (public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
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
$function$
;

-- === revert_contact_to_client ===
CREATE OR REPLACE FUNCTION public.revert_contact_to_client(p_client_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client RECORD;
  v_contact_id uuid;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id, entity_id, organization_id, source_id, source_type, status
  INTO v_client
  FROM public.anew_clients
  WHERE id = p_client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  IF NOT (v_client.organization_id = ANY (public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_client.source_type <> 'contact' OR v_client.source_id IS NULL THEN
    RAISE EXCEPTION 'Client was not converted from a contact';
  END IF;

  v_contact_id := v_client.source_id;

  -- Reversion is not deletion: keep the former client out of the trash.
  UPDATE public.anew_clients
  SET status = 'inactive',
      deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_client_id;

  UPDATE public.anew_entity_roles
  SET status = 'inactive',
      deleted_at = NULL,
      deleted_by = NULL
  WHERE entity_id = v_client.entity_id
    AND organization_id = v_client.organization_id
    AND role = 'client';

  -- Restore the original contact and explicitly clear trash markers.
  UPDATE public.anew_contacts
  SET converted_to_client_id = NULL,
      converted_at = NULL,
      status = 'active',
      deleted_at = NULL,
      deleted_by = NULL
  WHERE id = v_contact_id;

  UPDATE public.anew_entity_roles
  SET status = 'active',
      previous_status = NULL,
      deleted_at = NULL,
      deleted_by = NULL
  WHERE entity_id = v_client.entity_id
    AND organization_id = v_client.organization_id
    AND role = 'contact';

  INSERT INTO public.anew_entity_history(entity_id, change_type, field_name, old_value, new_value, changed_by, metadata)
  VALUES (
    v_client.entity_id,
    'conversion_reverted',
    'contact_to_client',
    p_client_id::text,
    v_contact_id::text,
    v_actor,
    jsonb_build_object('client_id', p_client_id, 'contact_id', v_contact_id, 'organization_id', v_client.organization_id)
  );

  RETURN TRUE;
END;
$function$
;

-- === revert_contact_to_client_conversion ===
CREATE OR REPLACE FUNCTION public.revert_contact_to_client_conversion(p_client_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contact_id UUID;
BEGIN
  -- OBSOLETE: substituida por public.revert_contact_to_client.
  -- Opera sobre tabelas legadas clients/contacts que ja nao existem, pelo que
  -- nunca pode ser chamada com sucesso hoje. Guard de autenticacao adicionado
  -- apenas para nao ser um vetor anonimo mesmo estando partida.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Get the source contact
  SELECT source_contact_id INTO v_contact_id
  FROM clients
  WHERE id = p_client_id;

  IF v_contact_id IS NULL THEN
    RAISE EXCEPTION 'Client was not converted from a contact';
  END IF;

  -- Clear the conversion on the contact
  UPDATE contacts
  SET converted_to_client_id = NULL,
      converted_at = NULL,
      client_id = NULL,
      status = 'prospect' -- Reset to prospect status
  WHERE id = v_contact_id;

  -- Delete the client (or soft-delete if column exists)
  DELETE FROM clients WHERE id = p_client_id;

  RETURN TRUE;
END;
$function$
;

-- === soft_delete_business_entity ===
CREATE OR REPLACE FUNCTION public.soft_delete_business_entity(p_kind text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_actor uuid := public.resolve_business_user_id(auth.uid());
BEGIN
  IF v_auth IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public._soft_delete_business_entity_impl(p_kind, p_id, v_actor, v_auth);
END;
$function$
;

-- === soft_delete_business_entity ===
CREATE OR REPLACE FUNCTION public.soft_delete_business_entity(p_kind text, p_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_request_role text := current_setting('request.jwt.claim.role', true);
  v_effective_auth uuid;
  v_actor uuid;
BEGIN
  -- Actor resolution:
  --  1) An authenticated caller ALWAYS uses its own auth.uid(); it can never
  --     override its identity via p_actor_id.
  --  2) A service_role caller (Edge Function that already validated the human
  --     user in TypeScript, e.g. buildExecCtx) may supply p_actor_id.
  --  3) Otherwise authentication is required.
  IF v_auth IS NOT NULL THEN
    v_effective_auth := v_auth;
  ELSIF v_request_role = 'service_role' AND p_actor_id IS NOT NULL THEN
    v_effective_auth := p_actor_id;
  ELSE
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_actor := public.resolve_business_user_id(v_effective_auth);
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN public._soft_delete_business_entity_impl(p_kind, p_id, v_actor, v_effective_auth);
END;
$function$
;

-- === unlink_organization_node ===
CREATE OR REPLACE FUNCTION public.unlink_organization_node(p_child_org_id uuid, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_child_org_id IS NULL THEN
    RAISE EXCEPTION 'child_org_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = p_child_org_id) THEN
    RAISE EXCEPTION 'Organization does not exist';
  END IF;

  -- Do not trust client-supplied identity: p_created_by is intentionally ignored.
  IF NOT (p_child_org_id = ANY (public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM public.anew_hierarchy
  WHERE child_org_id = p_child_org_id;
END;
$function$
;

REVOKE ALL ON FUNCTION public.delete_organization_subtree(p_root_org_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_organization_subtree(p_root_org_id uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.move_organization_node(p_child_org_id uuid, p_new_parent_org_id uuid, p_created_by uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_organization_node(p_child_org_id uuid, p_new_parent_org_id uuid, p_created_by uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.purge_business_entity(p_kind text, p_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_business_entity(p_kind text, p_id uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.purge_entity_facet(p_kind text, p_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_entity_facet(p_kind text, p_id uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.restore_business_entity(p_kind text, p_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_business_entity(p_kind text, p_id uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.revert_contact_to_client(p_client_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revert_contact_to_client(p_client_id uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.revert_contact_to_client_conversion(p_client_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revert_contact_to_client_conversion(p_client_id uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.soft_delete_business_entity(p_kind text, p_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_business_entity(p_kind text, p_id uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.soft_delete_business_entity(p_kind text, p_id uuid, p_actor_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_business_entity(p_kind text, p_id uuid, p_actor_id uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.unlink_organization_node(p_child_org_id uuid, p_created_by uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlink_organization_node(p_child_org_id uuid, p_created_by uuid) TO authenticated, service_role;

