-- ============================================================
-- 20261211160000_portal_fornecedor_dados_primeiro_acesso
-- ============================================================
-- Portal do Fornecedor — confirmação dos dados no primeiro acesso.
--
-- Depois de definir a password, o fornecedor (role owner) confirma/edita os
-- seus dados, pré-preenchidos com a ficha suppliers do CRM. Ao gravar,
-- atualiza TODAS as fichas suppliers ligadas a ele (links ativos a que o
-- utilizador tem acesso) e avisa no sino do CRM cada empresa cuja ficha mudou.
--
--   1. Colunas novas:
--        supplier_portal_users.profile_confirmed_at   (NULL = por confirmar)
--        supplier_account_links.supplier_data_updated_at
--          (o CRM mostra "Dados atualizados pelo fornecedor em …"; leitura
--           direta coberta pela política supplier_account_links_select_crm)
--   2. sp_whoami: + profile_confirmed (= profile_confirmed_at IS NOT NULL OR
--      role <> 'owner'; members não editam e nunca ficam bloqueados).
--      CREATE OR REPLACE a partir da definição VIVA (pg_get_functiondef a
--      08/10/2026, igual à de 20261211140000) — só acrescenta a chave.
--   3. sp_get_my_supplier_data(): dados da ficha ligada com updated_at mais
--      recente + empresas + can_edit + confirmed_at.
--   4. sp_update_my_supplier_data(p_data jsonb): só owner; campos aceites
--      name, contact_person, email, phone, phone_country_code, address, city,
--      postal_code, country, website (outras chaves ignoradas, tax_id
--      incluído — o NIF é a chave da conta e está protegido por
--      trg_suppliers_portal_nif_guard). O frontend envia só as chaves
--      alteradas: chave ausente = campo inalterado; string vazia = NULL;
--      p_data = '{}' só confirma (updated_count 0). name só é obrigatório se
--      a chave vier (vazio/null → erro validation).
--      Código postal validado por ficha, só se a chave vier: país efetivo =
--      country enviado ou, se a chave não vier, o country de cada ficha; se o
--      país efetivo for Portugal (ou vazio) exige 0000-000 (aceita 0000000).
--      Postais antigos do CRM nunca são validados.
--      Indicativo: aceita +NNN, NNN e 00NNN (normaliza para +NNN).
--      Só faz UPDATE / aviso nas fichas onde algum campo muda (IS DISTINCT
--      FROM). profile_confirmed_at = now() se ainda NULL, mesmo sem mudanças.
--
-- Auditoria: trg_audit_suppliers (fn_generic_entity_audit) regista as
-- alterações com app.audit_source = 'supplier_portal' (valor já usado). O
-- ator fica o que fn_generic_entity_audit resolve (current_business_user_id:
-- NULL para fornecedor puro, como nas tabelas do portal).
--
-- Sino: type 'supplier_data_updated', kind 'notification', entity
-- ('supplier', supplier_id), dedup por notifications_dedup (um aviso por
-- pessoa e ficha, atualizado a cada gravação). Destinatários: membros ativos
-- não-cliente da empresa da ligação com suppliers.edit. Falha no aviso não
-- impede a gravação (RAISE NOTICE).
--
-- Erros: mensagens em PT; HINT estável (validation, not_owner,
-- no_supplier_access).
--
-- Prerequisites: 20261211110000_portal_fornecedor_f31_contas_catalogo.sql
--                20261211140000_portal_fornecedor_cliente_tambem_fornecedor.sql
-- ============================================================


-- ============================================================
-- 1. Colunas
-- ============================================================
ALTER TABLE public.supplier_portal_users
  ADD COLUMN IF NOT EXISTS profile_confirmed_at timestamptz NULL;
COMMENT ON COLUMN public.supplier_portal_users.profile_confirmed_at IS
  'Portal do fornecedor: quando o utilizador (owner) confirmou os dados da empresa no primeiro acesso. NULL = por confirmar.';

ALTER TABLE public.supplier_account_links
  ADD COLUMN IF NOT EXISTS supplier_data_updated_at timestamptz NULL;
COMMENT ON COLUMN public.supplier_account_links.supplier_data_updated_at IS
  'Portal do fornecedor: última vez que o fornecedor alterou, no portal, os dados desta ficha suppliers.';


-- ============================================================
-- 2. sp_whoami: + profile_confirmed
--    (definição viva de 08/10/2026; só acrescenta profile_confirmed)
-- ============================================================
CREATE OR REPLACE FUNCTION public.sp_whoami()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  u        public.supplier_portal_users;
  a        public.supplier_accounts;
  v_active boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('is_supplier', false);
  END IF;
  SELECT * INTO u FROM public.supplier_portal_users WHERE auth_user_id = v_uid;
  IF u.id IS NULL THEN
    RETURN jsonb_build_object('is_supplier', false);
  END IF;
  SELECT * INTO a FROM public.supplier_accounts WHERE id = u.supplier_account_id;

  v_active := u.status = 'active' AND a.status = 'active' AND EXISTS (
    SELECT 1
    FROM public.supplier_portal_user_access x
    JOIN public.supplier_account_links l ON l.id = x.link_id
    JOIN public.suppliers s ON s.id = l.supplier_id
    WHERE x.portal_user_id = u.id AND x.revoked_at IS NULL AND l.status = 'active' AND s.deleted_at IS NULL
  );

  IF v_active AND (u.last_login_at IS NULL OR u.last_login_at < now() - interval '10 minutes') THEN
    UPDATE public.supplier_portal_users SET last_login_at = now() WHERE id = u.id;
  END IF;

  RETURN jsonb_build_object(
    'is_supplier', true,
    'active', v_active,
    'first_login', u.password_changed_at IS NULL,
    -- Dados da empresa confirmados no primeiro acesso (members nunca bloqueados).
    'profile_confirmed', (u.profile_confirmed_at IS NOT NULL OR u.role <> 'owner'),
    'can_manage_catalog', v_active AND u.role = 'owner',
    -- Também cliente do portal do cliente (membership cliente ativa).
    'also_client', EXISTS (
      SELECT 1 FROM public.anew_users au
      JOIN public.anew_memberships m ON m.user_id = au.id AND m.status = 'active' AND m.role_is_client IS TRUE
      WHERE au.auth_user_id = v_uid AND au.status = 'active' AND au.deleted_at IS NULL),
    'user', jsonb_build_object('id', u.id, 'email', u.email, 'name', u.name, 'role', u.role,
                               'password_changed_at', u.password_changed_at),
    'account', CASE WHEN v_active THEN jsonb_build_object('id', a.id, 'display_name', a.display_name, 'nif_key', a.nif_key) END
  );
END;
$function$;


-- ============================================================
-- 3. sp_get_my_supplier_data
-- ============================================================
CREATE OR REPLACE FUNCTION public.sp_get_my_supplier_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u           public.supplier_portal_users := public.fn_sp_actor();
  s           public.suppliers;
  v_companies jsonb;
BEGIN
  SELECT sp.* INTO s
  FROM public.supplier_portal_user_access x
  JOIN public.supplier_account_links l ON l.id = x.link_id
  JOIN public.suppliers sp ON sp.id = l.supplier_id
  WHERE x.portal_user_id = u.id AND x.revoked_at IS NULL
    AND l.status = 'active' AND sp.deleted_at IS NULL
  ORDER BY sp.updated_at DESC NULLS LAST, sp.id
  LIMIT 1;

  IF s.id IS NULL THEN
    RAISE EXCEPTION 'Sem acesso ao portal do fornecedor'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_supplier_access';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('organization_id', c.id, 'name', c.name) ORDER BY c.name), '[]'::jsonb)
  INTO v_companies
  FROM (
    SELECT DISTINCT o.id, o.name
    FROM public.supplier_portal_user_access x
    JOIN public.supplier_account_links l ON l.id = x.link_id
    JOIN public.suppliers sp ON sp.id = l.supplier_id
    JOIN public.anew_organizations o ON o.id = l.organization_id
    WHERE x.portal_user_id = u.id AND x.revoked_at IS NULL
      AND l.status = 'active' AND sp.deleted_at IS NULL
  ) c;

  RETURN jsonb_build_object(
    'can_edit', u.role = 'owner',
    'confirmed_at', u.profile_confirmed_at,
    'data', jsonb_build_object(
      'name', s.name,
      'contact_person', s.contact_person,
      'email', s.email,
      'phone', s.phone,
      'phone_country_code', s.phone_country_code,
      -- Só leitura no portal; recurso a vat_number quando tax_id está vazio.
      'tax_id', COALESCE(NULLIF(btrim(s.tax_id), ''), NULLIF(btrim(s.vat_number), '')),
      'address', s.address,
      'city', s.city,
      'postal_code', s.postal_code,
      'country', s.country,
      'website', s.website
    ),
    'companies', v_companies
  );
END;
$function$;
COMMENT ON FUNCTION public.sp_get_my_supplier_data() IS
  'Portal do fornecedor: dados da empresa (ficha suppliers ligada mais recente), empresas ligadas, can_edit (owner) e confirmed_at.';


-- ============================================================
-- 4. sp_update_my_supplier_data
-- ============================================================
CREATE OR REPLACE FUNCTION public.sp_update_my_supplier_data(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u          public.supplier_portal_users := public.fn_sp_actor();
  v_fields   text[] := ARRAY['name', 'contact_person', 'email', 'phone', 'phone_country_code',
                             'address', 'city', 'postal_code', 'country', 'website'];
  v_labels   jsonb := jsonb_build_object(
                'name', 'Nome', 'contact_person', 'Pessoa de contacto', 'email', 'Email',
                'phone', 'Telefone', 'phone_country_code', 'Indicativo', 'address', 'Morada',
                'city', 'Localidade', 'postal_code', 'Código postal', 'country', 'País',
                'website', 'Website');
  v_maxlen   jsonb := jsonb_build_object(
                'name', 200, 'contact_person', 200, 'email', 255, 'phone', 20,
                'phone_country_code', 10, 'address', 255, 'city', 100, 'postal_code', 20,
                'country', 100, 'website', 255);
  v_clean    jsonb := '{}'::jsonb;
  k          text;
  v          text;
  v_type     text;
  v_pc_pt    text;     -- postal enviado normalizado 0000-000 (NULL = não é PT válido)
  v_eff_ctry text;     -- país efetivo da ficha (enviado ou o da ficha)
  v_row      jsonb;    -- v_clean com o postal normalizado para esta ficha
  r          record;
  v_changed  text[];
  v_count    integer := 0;
  v_conf     timestamptz;
BEGIN
  IF u.role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Só o responsável da conta pode alterar os dados da empresa'
      USING ERRCODE = 'insufficient_privilege', HINT = 'not_owner';
  END IF;

  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RAISE EXCEPTION 'Dados inválidos' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;

  -- 4.1 Limpar: só os campos aceites; trim (inclui tabs/quebras); '' → NULL.
  FOREACH k IN ARRAY v_fields LOOP
    CONTINUE WHEN NOT (p_data ? k);
    v_type := jsonb_typeof(p_data -> k);
    IF v_type NOT IN ('string', 'number', 'null') THEN
      RAISE EXCEPTION 'O campo «%» tem um valor inválido.', v_labels ->> k
        USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
    END IF;
    v := NULLIF(regexp_replace(p_data ->> k, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
    v_clean := v_clean || jsonb_build_object(k, v);
  END LOOP;

  -- 4.2 Validar (só as chaves enviadas).
  IF v_clean ? 'name' AND (v_clean ->> 'name') IS NULL THEN
    RAISE EXCEPTION 'O campo «Nome» é obrigatório.'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;

  v := v_clean ->> 'email';
  IF v IS NOT NULL AND v !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'O campo «Email» tem um formato inválido.'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;

  v := v_clean ->> 'phone';
  IF v IS NOT NULL AND v !~ '^[0-9 ()+./-]+$' THEN
    RAISE EXCEPTION 'O campo «Telefone» só pode ter números, espaços e os sinais + ( ) - . /'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;

  v := v_clean ->> 'phone_country_code';
  IF v IS NOT NULL THEN
    v := regexp_replace(v, '[[:space:]]', '', 'g');
    -- 00NNN (valores antigos do CRM) → +NNN; antes do caso só-dígitos ('0044').
    IF v ~ '^00[0-9]{1,4}$' THEN
      v := '+' || substr(v, 3);
    ELSIF v ~ '^[0-9]{1,4}$' THEN
      v := '+' || v;
    END IF;
    IF v !~ '^\+[0-9]{1,4}$' THEN
      RAISE EXCEPTION 'O campo «Indicativo» deve ter o formato +351.'
        USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
    END IF;
    v_clean := v_clean || jsonb_build_object('phone_country_code', v);
  END IF;

  v := v_clean ->> 'website';
  IF v IS NOT NULL THEN
    IF v !~* '^https?://' THEN
      v := 'https://' || v;
    END IF;
    IF v !~* '^https?://[^[:space:]/?#@]+\.[^[:space:]/?#@]+([/?#][^[:space:]]*)?$' THEN
      RAISE EXCEPTION 'O campo «Website» tem um formato inválido.'
        USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
    END IF;
    v_clean := v_clean || jsonb_build_object('website', v);
  END IF;

  -- Código postal: só a forma normalizada PT aqui; a validação é por ficha
  -- (4.3), contra o país efetivo de cada uma.
  v := v_clean ->> 'postal_code';
  IF v IS NOT NULL THEN
    v_pc_pt := regexp_replace(v, '[[:space:]]', '', 'g');
    IF v_pc_pt ~ '^[0-9]{7}$' THEN
      v_pc_pt := substr(v_pc_pt, 1, 4) || '-' || substr(v_pc_pt, 5, 3);
    END IF;
    IF v_pc_pt !~ '^[0-9]{4}-[0-9]{3}$' THEN
      v_pc_pt := NULL;
    END IF;
  END IF;

  -- Tamanhos máximos (alinhados com o zod de src/pages/Suppliers.tsx).
  FOREACH k IN ARRAY v_fields LOOP
    v := v_clean ->> k;
    IF v IS NOT NULL AND char_length(v) > (v_maxlen ->> k)::integer THEN
      RAISE EXCEPTION 'O campo «%» deve ter no máximo % caracteres.', v_labels ->> k, v_maxlen ->> k
        USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
    END IF;
  END LOOP;

  -- 4.3 Gravar em todas as fichas ligadas (uma gravação de cada vez por conta).
  PERFORM pg_advisory_xact_lock(hashtextextended('sp_supplier_data:' || u.supplier_account_id::text, 0));
  PERFORM set_config('app.audit_source', 'supplier_portal', true);

  FOR r IN
    SELECT sp.id AS supplier_id, to_jsonb(sp) AS sj, l.id AS link_id, l.organization_id
    FROM public.supplier_portal_user_access x
    JOIN public.supplier_account_links l ON l.id = x.link_id
    JOIN public.suppliers sp ON sp.id = l.supplier_id
    WHERE x.portal_user_id = u.id AND x.revoked_at IS NULL
      AND l.status = 'active' AND sp.deleted_at IS NULL
    ORDER BY sp.id
    FOR UPDATE OF sp
  LOOP
    -- Código postal por ficha (só se a chave vier e não for vazia): país
    -- efetivo = o enviado ou, sem a chave country, o desta ficha. PT ou vazio
    -- → tem de ser 0000-000 (grava-se normalizado). Erro = rollback de tudo.
    v_row := v_clean;
    IF (v_clean ->> 'postal_code') IS NOT NULL THEN
      v_eff_ctry := CASE WHEN v_clean ? 'country' THEN v_clean ->> 'country' ELSE r.sj ->> 'country' END;
      IF NULLIF(btrim(v_eff_ctry), '') IS NULL
         OR lower(btrim(v_eff_ctry)) IN ('portugal', 'pt', 'prt') THEN
        IF v_pc_pt IS NULL THEN
          RAISE EXCEPTION 'O campo «Código postal» deve ter o formato 0000-000.'
            USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
        END IF;
        v_row := v_row || jsonb_build_object('postal_code', v_pc_pt);
      END IF;
    END IF;

    v_changed := ARRAY[]::text[];
    FOREACH k IN ARRAY v_fields LOOP
      IF v_row ? k AND (r.sj ->> k) IS DISTINCT FROM (v_row ->> k) THEN
        v_changed := v_changed || k;
      END IF;
    END LOOP;
    CONTINUE WHEN cardinality(v_changed) = 0;

    -- tax_id / vat_number / organization_id nunca no SET
    -- (trg_suppliers_portal_nif_guard não dispara).
    UPDATE public.suppliers s SET
      name               = CASE WHEN v_row ? 'name'               THEN v_row ->> 'name'               ELSE s.name END,
      contact_person     = CASE WHEN v_row ? 'contact_person'     THEN v_row ->> 'contact_person'     ELSE s.contact_person END,
      email              = CASE WHEN v_row ? 'email'              THEN v_row ->> 'email'              ELSE s.email END,
      phone              = CASE WHEN v_row ? 'phone'              THEN v_row ->> 'phone'              ELSE s.phone END,
      phone_country_code = CASE WHEN v_row ? 'phone_country_code' THEN v_row ->> 'phone_country_code' ELSE s.phone_country_code END,
      address            = CASE WHEN v_row ? 'address'            THEN v_row ->> 'address'            ELSE s.address END,
      city               = CASE WHEN v_row ? 'city'               THEN v_row ->> 'city'               ELSE s.city END,
      postal_code        = CASE WHEN v_row ? 'postal_code'        THEN v_row ->> 'postal_code'        ELSE s.postal_code END,
      country            = CASE WHEN v_row ? 'country'            THEN v_row ->> 'country'            ELSE s.country END,
      website            = CASE WHEN v_row ? 'website'            THEN v_row ->> 'website'            ELSE s.website END
    WHERE s.id = r.supplier_id;

    UPDATE public.supplier_account_links
       SET supplier_data_updated_at = now()
     WHERE id = r.link_id;

    v_count := v_count + 1;

    -- Sino do CRM: um aviso por pessoa e ficha (atualizado a cada gravação).
    BEGIN
      INSERT INTO public.notifications
        (user_id, organization_id, kind, type, title, message, link, entity_type, entity_id, priority, data)
      SELECT au.auth_user_id, r.organization_id, 'notification', 'supplier_data_updated',
             'Dados do fornecedor atualizados',
             format('O fornecedor %s atualizou os seus dados no portal (%s).',
                    COALESCE(v_row ->> 'name', r.sj ->> 'name'),
                    (SELECT string_agg(lower(v_labels ->> c), ', ') FROM unnest(v_changed) AS c)),
             '/suppliers?open=' || r.supplier_id::text || '&tab=portal',
             'supplier', r.supplier_id, 'low',
             jsonb_build_object('modulo', 'compras', 'supplier_id', r.supplier_id,
                                'changed_fields', to_jsonb(v_changed),
                                'portal_user_id', u.id)
      FROM (
        SELECT DISTINCT au0.auth_user_id
        FROM public.anew_memberships m
        JOIN public.anew_users au0 ON au0.id = m.user_id
        WHERE m.organization_id = r.organization_id
          AND m.status = 'active' AND m.role_is_client IS NOT TRUE
          AND au0.deleted_at IS NULL AND au0.auth_user_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.anew_role_permissions rp
                      WHERE rp.role_id = m.role_id AND rp.permission_code = 'suppliers.edit')
      ) au
      ON CONFLICT (type, entity_id, user_id) WHERE is_resolved = false DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        title = EXCLUDED.title,
        message = EXCLUDED.message,
        link = EXCLUDED.link,
        data = EXCLUDED.data,
        priority = EXCLUDED.priority,
        is_read = false,
        read_at = NULL,
        is_dismissed = false,
        created_at = now();
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Aviso de dados do fornecedor atualizados não enviado: %', SQLERRM;
    END;
  END LOOP;

  -- 4.4 Confirmar (mesmo sem mudanças); mantém a 1.ª data de confirmação.
  UPDATE public.supplier_portal_users
     SET profile_confirmed_at = now(), updated_at = now()
   WHERE id = u.id AND profile_confirmed_at IS NULL;
  SELECT profile_confirmed_at INTO v_conf FROM public.supplier_portal_users WHERE id = u.id;

  RETURN jsonb_build_object('ok', true, 'updated_count', v_count, 'confirmed_at', v_conf);
END;
$function$;
COMMENT ON FUNCTION public.sp_update_my_supplier_data(jsonb) IS
  'Portal do fornecedor: o owner confirma/edita os dados da empresa; atualiza todas as fichas suppliers ligadas (links ativos com acesso), marca supplier_data_updated_at, avisa no sino do CRM e marca profile_confirmed_at.';


-- ============================================================
-- 5. Grants
-- ============================================================
REVOKE ALL ON FUNCTION public.sp_whoami() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sp_get_my_supplier_data() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sp_update_my_supplier_data(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_whoami() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sp_get_my_supplier_data() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sp_update_my_supplier_data(jsonb) TO authenticated, service_role;
