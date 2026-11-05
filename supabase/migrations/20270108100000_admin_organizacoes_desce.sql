-- ============================================================
-- 20270108100000_admin_organizacoes_desce
-- ============================================================
-- Auditoria de permissões 05/11/2026, grupo D, R1 (P1.1) e P2 «o administrador de uma filha não edita a própria organização».
-- Regra (Lote D, 20270106340000): a administração DESCE na hierarquia - a permissão tem de estar na organização-alvo ou numa ACIMA
--   dela (has_anew_permission_in_org_or_ancestor; o administrador de sistema passa). Estas funções ainda usavam has_anew_permission
--   (a permissão em QUALQUER organização) + «organização visível» (que inclui as de cima e as associadas).
-- O que muda
--   - delete_organization_subtree / restore_organization_subtree: organizations.delete na raiz ou acima, e deixam de ser
--     executáveis diretamente por authenticated/anon (o ecrã usa rpc_delete_organization / rpc_restore_organization, que já
--     verificavam a organização e escrevem a auditoria; chamadas diretas contornavam as duas coisas).
--   - purge_entity_facet (apagar definitivo no Lixo): organizations.delete na organização da lead/contacto/cliente ou acima.
--   - rpc_update_organization: organizations.edit nesta organização ou acima. E só desliga/volta a ligar a hierarquia quando a mãe
--     muda (antes fazia-o sempre e desligar pede edit na mãe, por isso o administrador de uma filha não gravava a própria).
--   - set_organization_work_scope: organizations.edit nesta organização ou acima.
-- Quem tinha a permissão na organização (ou acima) faz exatamente o mesmo. CREATE OR REPLACE a partir do texto vivo
--   (pg_get_functiondef na base RH a 5/11/2026, guardas md5).
-- Reversão (só como migration nova): repor as 5 funções com o texto de 5/11/2026 e
--   GRANT EXECUTE ON FUNCTION public.delete_organization_subtree(uuid), public.restore_organization_subtree(uuid) TO authenticated.
-- ============================================================
SET lock_timeout = '5s';

DO $g$
BEGIN
  IF md5(pg_get_functiondef('public.delete_organization_subtree(uuid)'::regprocedure)) <> '8b7abdda36f98db06604fd1a554c1be2'
     OR md5(pg_get_functiondef('public.restore_organization_subtree(uuid)'::regprocedure)) <> '4c0860c26c4c9b7a6813e6a09d99684e'
     OR md5(pg_get_functiondef('public.purge_entity_facet(text,uuid)'::regprocedure)) <> '9acf1cbc2c83c615bf0d69162eed33f9'
     OR md5(pg_get_functiondef('public.rpc_update_organization(uuid,text,text,text,text,text,text,boolean,uuid,text,text,text,jsonb,text,text,text[])'::regprocedure)) <> '187fc4c51e3009d7dd995ef9d2738c07'
     OR md5(pg_get_functiondef('public.set_organization_work_scope(uuid,boolean)'::regprocedure)) <> '7f5a511ab158053c9d75947a527ce69d' THEN
    RAISE EXCEPTION 'GUARDA: uma das funções mudou desde a leitura (5/11/2026)';
  END IF;
END $g$;

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

  IF NOT (p_root_org_id IN (SELECT public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(v_actor, 'organizations.delete') THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270108100000: organizations.delete nesta organização ou acima (a administração desce, não sobe). Antes bastava a permissão
  --   em qualquer organização e esta ser visível (as de cima também são).
  IF NOT public.has_anew_permission_in_org_or_ancestor(v_actor, 'organizations.delete', p_root_org_id) THEN
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

  UPDATE public.anew_organizations
  SET deleted_at = now(), updated_at = now()
  WHERE id = ANY(v_ids)
    AND deleted_at IS NULL;

  RETURN v_ids;
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_organization_subtree(p_root_org_id uuid)
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

  IF NOT (p_root_org_id IN (SELECT public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(v_actor, 'organizations.delete') THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270108100000: organizations.delete nesta organização ou acima (a administração desce, não sobe). Antes bastava a permissão
  --   em qualquer organização e esta ser visível (as de cima também são).
  IF NOT public.has_anew_permission_in_org_or_ancestor(v_actor, 'organizations.delete', p_root_org_id) THEN
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

  UPDATE public.anew_organizations
  SET deleted_at = NULL, updated_at = now()
  WHERE id = ANY(v_ids)
    AND deleted_at IS NOT NULL;

  RETURN v_ids;
END;
$function$;

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

  IF NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(v_actor, 'organizations.delete') THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270108100000: organizations.delete nesta organização ou acima (a administração desce, não sobe). Antes bastava a permissão
  --   em qualquer organização e esta ser visível (as de cima também são).
  IF NOT public.has_anew_permission_in_org_or_ancestor(v_actor, 'organizations.delete', v_org_id) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kind = 'lead' THEN
    DELETE FROM public.anew_leads WHERE id = p_id;
  ELSIF p_kind = 'contact' THEN
    DELETE FROM public.anew_contacts WHERE id = p_id;
  ELSE
    UPDATE public.anew_leads SET converted_to_client_id = NULL WHERE converted_to_client_id = p_id;
    -- Os contactos marcados com este cliente nao podem ficar a apontar para um
    -- cliente que deixa de existir (a coluna nao tem FK).
    UPDATE public.anew_contacts
    SET converted_to_client_id = NULL,
        converted_at           = NULL
    WHERE converted_to_client_id = p_id
      AND organization_id = v_org_id;
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
$function$;

CREATE OR REPLACE FUNCTION public.rpc_update_organization(p_id uuid, p_name text, p_type text, p_description text, p_status text, p_sector text, p_phone text, p_is_fiscal boolean, p_parent_id uuid, p_nif text, p_commercial_name text, p_country_code text, p_addresses jsonb, p_nif_encrypted text DEFAULT NULL::text, p_nif_hash text DEFAULT NULL::text, p_nif_tokens text[] DEFAULT NULL::text[])
 RETURNS anew_organizations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor           uuid;
  v_before          public.anew_organizations;
  v_org             public.anew_organizations;
  v_entity_id       uuid;
  v_nif             text := nullif(btrim(coalesce(p_nif, '')), '');
  v_country         text := coalesce(nullif(btrim(coalesce(p_country_code, '')), ''), 'PT');
  v_has_fiscal      boolean;
  v_fiscal_entity_id uuid;
  v_matched_entity  uuid;
  v_addr            jsonb;
  v_sector          text;
  v_match_fe_id     uuid;
  v_match_fe_count  bigint;
  v_match_link_count bigint;

  v_old_fiscal      jsonb;
  v_new_fiscal      jsonb;
  v_old_addresses   jsonb;
  v_new_addresses   jsonb;
  v_old_parent      uuid;
  v_new_parent      uuid;

  v_org_diff        jsonb;
  v_diff            jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load current row (before-image + guards) ─────────────────────────────
  SELECT * INTO v_before FROM public.anew_organizations WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organização não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with authenticated_update_anew_organizations RLS ─
  IF NOT public.has_anew_permission(auth.uid(), 'organizations.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar organizações' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (p_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 20270108100000: organizations.edit nesta organização ou acima (o administrador de uma filha já não edita a mãe nem uma
  --   organização sem ligação).
  IF NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'organizations.edit', p_id) THEN
    RAISE EXCEPTION 'Sem permissão para editar esta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_has_fiscal := COALESCE(p_is_fiscal, false) AND v_nif IS NOT NULL;

  -- ── ensureOrgEntity: backfill entity when the org has none ───────────────
  v_entity_id := v_before.entity_id;
  IF v_entity_id IS NULL THEN
    -- Same two-query resolution as findEntityByFiscalIdentity (see rpc_create_organization
    -- for the full rationale). handleUpdate passes nif to ensureOrgEntity as
    -- `formData.isFiscal && formData.nif?.trim() ? formData.nif : null` (Organizations.tsx
    -- line ~450), i.e. a NIF match is only attempted when isFiscal is true AND a NIF is
    -- present — exactly the hasFiscalData gate used in create. We therefore key off
    -- v_has_fiscal (p_is_fiscal AND v_nif IS NOT NULL), matching the FE precisely.
    --
    -- SECURITY FIX (20261111030000): this match used to be a plaintext
    -- `WHERE fe.nif = v_nif`. It now keys off nif_hash — the same hash the
    -- nif-write-proxy Edge Function already computes and sends as p_nif_hash
    -- for every real caller. When p_nif_hash is not supplied, this match is
    -- skipped entirely (treated as "no match", never a plaintext fallback).
    v_matched_entity := NULL;
    IF v_has_fiscal AND p_nif_hash IS NOT NULL THEN
      -- Step 1: exactly one fiscal_entities row for this (nif_hash, country)?
      SELECT count(*) INTO v_match_fe_count
      FROM (
        SELECT fe.id
        FROM public.fiscal_entities fe
        WHERE fe.nif_hash = p_nif_hash AND fe.country_code = v_country
        LIMIT 2
      ) s;

      IF v_match_fe_count = 1 THEN
        SELECT fe.id INTO v_match_fe_id
        FROM public.fiscal_entities fe
        WHERE fe.nif_hash = p_nif_hash AND fe.country_code = v_country
        LIMIT 1;

        -- Step 2: does that single fiscal_entity have exactly one link total?
        SELECT count(*) INTO v_match_link_count
        FROM (
          SELECT l.entity_id
          FROM public.anew_entity_fiscal_entities l
          WHERE l.fiscal_entity_id = v_match_fe_id
          LIMIT 2
        ) s;

        IF v_match_link_count = 1 THEN
          SELECT l.entity_id INTO v_matched_entity
          FROM public.anew_entity_fiscal_entities l
          WHERE l.fiscal_entity_id = v_match_fe_id
          LIMIT 1;
        END IF;
      END IF;
    END IF;

    IF v_matched_entity IS NOT NULL THEN
      v_entity_id := v_matched_entity;
    ELSE
      v_entity_id := gen_random_uuid();
      INSERT INTO public.anew_entities (id, display_name, type, status, created_by)
      VALUES (v_entity_id, p_name, 'organization', 'active', v_actor);
    END IF;

    UPDATE public.anew_organizations SET entity_id = v_entity_id, updated_at = now() WHERE id = p_id;
  END IF;

  -- ── Snapshot old fiscal / addresses / parent for the diff ────────────────
  -- SECURITY FIX (20261111030000): this snapshot used to embed the plaintext
  -- `nif` in the audit-diff payload (fed to fn_manual_audit_log below). It now
  -- carries nif_hash instead — plaintext NIF must never reach the audit log.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'fiscal_entity_id', efe.fiscal_entity_id, 'is_primary', efe.is_primary,
           'nif_hash', fe.nif_hash, 'country_code', fe.country_code, 'commercial_name', fe.commercial_name)), '[]'::jsonb)
  INTO v_old_fiscal
  FROM public.anew_entity_fiscal_entities efe
  LEFT JOIN public.fiscal_entities fe ON fe.id = efe.fiscal_entity_id
  WHERE efe.entity_id = v_entity_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'address_id', oa.address_id, 'is_fiscal', oa.is_fiscal,
           'street', a.street, 'number', a.number, 'postal_code', a.postal_code,
           'city', a.city, 'country', a.country) ORDER BY oa.address_id), '[]'::jsonb)
  INTO v_old_addresses
  FROM public.anew_org_addresses oa
  LEFT JOIN public.anew_addresses a ON a.id = oa.address_id
  WHERE oa.org_id = p_id AND oa.valid_to IS NULL;

  SELECT parent_org_id INTO v_old_parent
  FROM public.anew_hierarchy WHERE child_org_id = p_id LIMIT 1;

  -- ── UPDATE the organization (identical column set to the FE update) ──────
  v_sector := CASE WHEN p_parent_id IS NULL THEN nullif(p_sector, '') ELSE NULL END;

  UPDATE public.anew_organizations
  SET name        = p_name,
      type        = p_type,
      description = nullif(p_description, ''),
      status      = p_status,
      sector      = v_sector,
      phone       = nullif(btrim(coalesce(p_phone, '')), ''),
      is_fiscal   = COALESCE(p_is_fiscal, false),
      updated_at  = now()
  WHERE id = p_id
  RETURNING * INTO v_org;

  -- ── Fiscal: upsert when isFiscal && nif; explicit isFiscal=false clears it;
  -- isFiscal=true but nif not supplied (or blank) is a no-op that preserves
  -- the existing fiscal link instead of deleting it (20261103040000).
  --
  -- SECURITY FIX (20261111030000): the reuse-match below used to be a
  -- plaintext `WHERE nif = v_nif`. It now keys off p_nif_hash — the hash the
  -- nif-write-proxy Edge Function already computes for every real caller.
  -- When p_nif_hash is not supplied, the match is skipped entirely (treated
  -- as "no existing row"), never falling back to a plaintext comparison. The
  -- INSERT/UPDATE branches below are unchanged: they still dual-write the
  -- plaintext `nif` column exactly as before.
  IF v_has_fiscal THEN
    IF p_nif_hash IS NOT NULL THEN
      SELECT count(*) INTO v_match_fe_count
      FROM (
        SELECT fe.id
        FROM public.fiscal_entities fe
        WHERE fe.nif_hash = p_nif_hash AND fe.country_code = v_country
        LIMIT 2
      ) s;
    ELSE
      v_match_fe_count := 0;
    END IF;

    IF v_match_fe_count > 1 THEN
      RAISE EXCEPTION 'Fiscal entity match is ambiguous' USING ERRCODE = 'cardinality_violation';
    END IF;

    IF v_match_fe_count = 1 THEN
      SELECT id INTO v_fiscal_entity_id
      FROM public.fiscal_entities
      WHERE nif_hash = p_nif_hash AND country_code = v_country
      LIMIT 1;
    ELSE
      v_fiscal_entity_id := NULL;
    END IF;

    IF v_fiscal_entity_id IS NULL THEN
      -- New fiscal_entities row: no prior nif_encrypted/nif_hash value to protect,
      -- so write the provided values directly (NULL when the caller omits them —
      -- identical to today's behaviour for legacy callers).
      INSERT INTO public.fiscal_entities (nif, commercial_name, country_code, created_by, nif_encrypted, nif_hash)
      VALUES (v_nif, nullif(p_commercial_name, ''), v_country, v_actor, p_nif_encrypted, p_nif_hash)
      RETURNING id INTO v_fiscal_entity_id;

      IF p_nif_tokens IS NOT NULL THEN
        INSERT INTO public.fiscal_entity_nif_tokens (fiscal_entity_id, token_hash)
        SELECT v_fiscal_entity_id, t
        FROM unnest(p_nif_tokens) AS t
        WHERE t IS NOT NULL
        ON CONFLICT DO NOTHING;
      END IF;
    ELSE
      -- Existing fiscal_entities row reused (matched by nif_hash/country_code):
      -- COALESCE preserves any already-populated encrypted value when the caller
      -- does not pass the new parameters (full retrocompatibility).
      UPDATE public.fiscal_entities
      SET commercial_name = nullif(p_commercial_name, ''),
          updated_at = now(),
          nif_encrypted = COALESCE(p_nif_encrypted, nif_encrypted),
          nif_hash = COALESCE(p_nif_hash, nif_hash)
      WHERE id = v_fiscal_entity_id;

      IF p_nif_tokens IS NOT NULL THEN
        DELETE FROM public.fiscal_entity_nif_tokens WHERE fiscal_entity_id = v_fiscal_entity_id;
        INSERT INTO public.fiscal_entity_nif_tokens (fiscal_entity_id, token_hash)
        SELECT v_fiscal_entity_id, t
        FROM unnest(p_nif_tokens) AS t
        WHERE t IS NOT NULL
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    DELETE FROM public.anew_entity_fiscal_entities WHERE entity_id = v_entity_id;
    INSERT INTO public.anew_entity_fiscal_entities (entity_id, fiscal_entity_id, is_primary, created_by)
    VALUES (v_entity_id, v_fiscal_entity_id, true, v_actor);
  ELSIF NOT COALESCE(p_is_fiscal, false) THEN
    -- Explicit signal: the org is no longer marked fiscal at all — clear the
    -- fiscal links on the org's entity (unchanged from prior behavior).
    DELETE FROM public.anew_entity_fiscal_entities WHERE entity_id = v_entity_id;
  END IF;
  -- ELSE (p_is_fiscal = true but v_nif is NULL/blank): no-op — the caller still
  -- wants the org treated as fiscal but didn't (re)send the NIF, so the
  -- existing fiscal link is preserved rather than silently deleted.

  -- ── Hierarchy: unlink current parent, then move under the chosen parent ──
  -- 20270108100000: só se desliga/volta a ligar quando a mãe muda. Antes fazia-se sempre, e desligar pede organizations.edit na
  --   mãe: o administrador de uma filha não conseguia gravar a própria organização. Mudar de mãe continua a passar pelo
  --   unlink/move, com as verificações deles.
  IF NOT (p_parent_id IS NOT NULL
          AND ARRAY(SELECT DISTINCT h.parent_org_id FROM public.anew_hierarchy h WHERE h.child_org_id = p_id) = ARRAY[p_parent_id])
     AND NOT (p_parent_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM public.anew_hierarchy h WHERE h.child_org_id = p_id)) THEN
    PERFORM public.unlink_organization_node(p_id, v_actor);
    IF p_parent_id IS NOT NULL THEN
      PERFORM public.move_organization_node(p_id, p_parent_id, v_actor);
    END IF;
  END IF;

  -- ── Addresses: delete all current links, then re-assign (matches the FE) ─
  DELETE FROM public.anew_org_addresses WHERE org_id = p_id;

  IF p_addresses IS NOT NULL AND jsonb_typeof(p_addresses) = 'array' THEN
    FOR v_addr IN SELECT * FROM jsonb_array_elements(p_addresses)
    LOOP
      CONTINUE WHEN NULLIF(v_addr ->> 'street', '') IS NULL
                 OR NULLIF(v_addr ->> 'number', '') IS NULL
                 OR NULLIF(v_addr ->> 'city', '') IS NULL
                 OR NULLIF(v_addr ->> 'postal_code', '') IS NULL;
      PERFORM public.assign_address_to_org(
        p_id,
        v_addr ->> 'street',
        v_addr ->> 'number',
        NULLIF(v_addr ->> 'floor', ''),
        NULLIF(v_addr ->> 'unit', ''),
        v_addr ->> 'postal_code',
        v_addr ->> 'city',
        NULLIF(v_addr ->> 'district', ''),
        COALESCE(NULLIF(v_addr ->> 'country', ''), 'PT'),
        NULLIF(v_addr ->> 'extra', ''),
        COALESCE((v_addr ->> 'is_fiscal')::boolean, false),
        v_actor,
        NULL,
        NULL
      );
    END LOOP;
  END IF;

  -- ── Snapshot new fiscal / addresses / parent ─────────────────────────────
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'fiscal_entity_id', efe.fiscal_entity_id, 'is_primary', efe.is_primary,
           'nif_hash', fe.nif_hash, 'country_code', fe.country_code, 'commercial_name', fe.commercial_name)), '[]'::jsonb)
  INTO v_new_fiscal
  FROM public.anew_entity_fiscal_entities efe
  LEFT JOIN public.fiscal_entities fe ON fe.id = efe.fiscal_entity_id
  WHERE efe.entity_id = v_entity_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'address_id', oa.address_id, 'is_fiscal', oa.is_fiscal,
           'street', a.street, 'number', a.number, 'postal_code', a.postal_code,
           'city', a.city, 'country', a.country) ORDER BY oa.address_id), '[]'::jsonb)
  INTO v_new_addresses
  FROM public.anew_org_addresses oa
  LEFT JOIN public.anew_addresses a ON a.id = oa.address_id
  WHERE oa.org_id = p_id AND oa.valid_to IS NULL;

  SELECT parent_org_id INTO v_new_parent
  FROM public.anew_hierarchy WHERE child_org_id = p_id LIMIT 1;

  -- ── Build the combined diff across every touched table ───────────────────
  v_diff := '{}'::jsonb;

  -- anew_organizations field-level diff (same noise exclusions as the trigger)
  v_org_diff := '{}'::jsonb;
  IF v_before.name IS DISTINCT FROM v_org.name THEN
    v_org_diff := v_org_diff || jsonb_build_object('name',
      jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_org.name)));
  END IF;
  IF v_before.type IS DISTINCT FROM v_org.type THEN
    v_org_diff := v_org_diff || jsonb_build_object('type',
      jsonb_build_object('old', to_jsonb(v_before.type), 'new', to_jsonb(v_org.type)));
  END IF;
  IF v_before.description IS DISTINCT FROM v_org.description THEN
    v_org_diff := v_org_diff || jsonb_build_object('description',
      jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_org.description)));
  END IF;
  IF v_before.status IS DISTINCT FROM v_org.status THEN
    v_org_diff := v_org_diff || jsonb_build_object('status',
      jsonb_build_object('old', to_jsonb(v_before.status), 'new', to_jsonb(v_org.status)));
  END IF;
  IF v_before.sector IS DISTINCT FROM v_org.sector THEN
    v_org_diff := v_org_diff || jsonb_build_object('sector',
      jsonb_build_object('old', to_jsonb(v_before.sector), 'new', to_jsonb(v_org.sector)));
  END IF;
  IF v_before.phone IS DISTINCT FROM v_org.phone THEN
    v_org_diff := v_org_diff || jsonb_build_object('phone',
      jsonb_build_object('old', to_jsonb(v_before.phone), 'new', to_jsonb(v_org.phone)));
  END IF;
  IF v_before.is_fiscal IS DISTINCT FROM v_org.is_fiscal THEN
    v_org_diff := v_org_diff || jsonb_build_object('is_fiscal',
      jsonb_build_object('old', to_jsonb(v_before.is_fiscal), 'new', to_jsonb(v_org.is_fiscal)));
  END IF;
  IF v_before.entity_id IS DISTINCT FROM v_org.entity_id THEN
    v_org_diff := v_org_diff || jsonb_build_object('entity_id',
      jsonb_build_object('old', to_jsonb(v_before.entity_id), 'new', to_jsonb(v_org.entity_id)));
  END IF;
  IF v_org_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_organizations', v_org_diff);
  END IF;

  IF v_old_parent IS DISTINCT FROM v_new_parent THEN
    v_diff := v_diff || jsonb_build_object('anew_hierarchy', jsonb_build_object(
      'parent_org_id', jsonb_build_object('old', to_jsonb(v_old_parent), 'new', to_jsonb(v_new_parent))));
  END IF;

  IF v_old_fiscal IS DISTINCT FROM v_new_fiscal THEN
    v_diff := v_diff || jsonb_build_object('anew_entity_fiscal_entities',
      jsonb_build_object('old', v_old_fiscal, 'new', v_new_fiscal));
  END IF;

  IF v_old_addresses IS DISTINCT FROM v_new_addresses THEN
    v_diff := v_diff || jsonb_build_object('anew_org_addresses',
      jsonb_build_object('old', v_old_addresses, 'new', v_new_addresses));
  END IF;

  -- ── Emit a single consolidated audit row (only when something changed) ────
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'anew_organizations', p_id, p_id, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_org;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_organization_work_scope(organization_id uuid, is_work_org boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_auth_uid     uuid := auth.uid();
  v_org          public.anew_organizations;
  v_crm_count    bigint;
  v_dependents   bigint;
BEGIN
  IF organization_id IS NULL OR is_work_org IS NULL THEN
    RAISE EXCEPTION 'invalid request' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_auth_uid IS NULL THEN
    -- No SQLSTATE reliably maps to HTTP 401 via PostgREST's default error-code
    -- table once a request has reached this function (the JWT already passed
    -- PostgREST's own auth layer to get here) — 'insufficient_privilege' (403)
    -- is the closest fit and matches the existing convention in
    -- supabase/functions/_shared/auth.ts (missing anew_users profile -> 403).
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_org FROM public.anew_organizations o WHERE o.id = organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- 'organizations.manage' is not a seeded permission code (confirmed dead by
  -- 20260905010000_fix_organizations_manage_permission_mismatch.sql, which hit
  -- the exact same bug for the org create/update/delete RPCs). Use the real
  -- seeded code, 'organizations.edit', consistent with that fix.
  IF NOT (
    public.has_anew_permission(v_auth_uid, 'organizations.edit')
    AND organization_id = ANY(ARRAY(SELECT o FROM public.get_user_visible_org_ids(v_auth_uid) AS o))
    -- 20270108100000: organizations.edit nesta organização ou acima.
    AND public.has_anew_permission_in_org_or_ancestor(v_auth_uid, 'organizations.edit', set_organization_work_scope.organization_id)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Idempotent: no-op success if nothing actually changes.
  IF v_org.is_work_org = is_work_org THEN
    RETURN jsonb_build_object('success', true, 'organization_id', organization_id, 'is_work_org', is_work_org);
  END IF;

  -- Demoting an active work_org that already has CRM records is blocked — those
  -- records would be left pointing at an organization_id contract 4 will reject.
  IF v_org.is_work_org = true AND is_work_org = false THEN
    SELECT
      (SELECT count(*) FROM public.anew_leads WHERE anew_leads.organization_id = v_org.id) +
      (SELECT count(*) FROM public.anew_contacts WHERE anew_contacts.organization_id = v_org.id) +
      (SELECT count(*) FROM public.anew_clients WHERE anew_clients.organization_id = v_org.id) +
      (SELECT count(*) FROM public.quotes WHERE quotes.organization_id = v_org.id) +
      (SELECT count(*) FROM public.deals WHERE deals.organization_id = v_org.id) +
      (SELECT count(*) FROM public.proposals WHERE proposals.organization_id = v_org.id) +
      (SELECT count(*) FROM public.client_contracts WHERE client_contracts.organization_id = v_org.id)
    INTO v_crm_count;

    IF v_crm_count > 0 THEN
      RAISE EXCEPTION 'organization has CRM records' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  -- Promoting an internal structure to work_org, or demoting one with no CRM
  -- records, can never orphan a descendant internal structure's members: any
  -- internal structure that currently resolves its work_org ancestor through
  -- this org must still have SOME active work_org ancestor after the change.
  -- Only relevant on demotion (promotion can only add a new valid ancestor).
  IF v_org.is_work_org = true AND is_work_org = false THEN
    SELECT count(*) INTO v_dependents
    FROM public.anew_hierarchy h
    JOIN public.anew_organizations child ON child.id = h.child_org_id
    WHERE h.parent_org_id = v_org.id
      AND lower(h.relationship_type) IN ('parent_of', 'parent_child')
      AND child.is_work_org = false
      AND NOT EXISTS (
        -- The walk must pass THROUGH v_org.id (it's a real, unchanged hierarchy
        -- edge) — only the final match excludes v_org.id itself, since it is
        -- about to lose is_work_org and must not count as the surviving
        -- ancestor. Excluding the edge to v_org entirely (as an earlier draft
        -- did) would wrongly treat "child's only parent is v_org" as having no
        -- alternate path, even when v_org itself has a valid active work_org
        -- ancestor above it that the child would still reach after demotion.
        WITH RECURSIVE walk AS (
          SELECT h2.parent_org_id AS current_org_id, 0 AS depth, ARRAY[child.id, h2.parent_org_id] AS path
          FROM public.anew_hierarchy h2
          WHERE h2.child_org_id = child.id
            AND lower(h2.relationship_type) IN ('parent_of', 'parent_child')
          UNION ALL
          SELECT h3.parent_org_id, w.depth + 1, w.path || h3.parent_org_id
          FROM walk w
          JOIN public.anew_hierarchy h3 ON h3.child_org_id = w.current_org_id
          WHERE lower(h3.relationship_type) IN ('parent_of', 'parent_child')
            AND w.depth < 20
            AND NOT (h3.parent_org_id = ANY(w.path))
        )
        SELECT 1 FROM walk w
        JOIN public.anew_organizations wo ON wo.id = w.current_org_id
        WHERE wo.is_work_org = true AND wo.status = 'active' AND wo.id <> v_org.id
      );

    IF v_dependents > 0 THEN
      RAISE EXCEPTION 'no active work_org ancestor' USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
  END IF;

  UPDATE public.anew_organizations o
  SET is_work_org = set_organization_work_scope.is_work_org
  WHERE o.id = organization_id;

  RETURN jsonb_build_object('success', true, 'organization_id', organization_id, 'is_work_org', is_work_org);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.delete_organization_subtree(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_organization_subtree(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_organization_subtree(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_organization_subtree(uuid) TO service_role;
