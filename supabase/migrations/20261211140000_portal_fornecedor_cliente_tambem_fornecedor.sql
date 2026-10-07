-- ============================================================
-- 20261211140000_portal_fornecedor_cliente_tambem_fornecedor
-- ============================================================
-- Portal do Fornecedor, F3.1 — "um cliente pode ser fornecedor também;
-- utilizador do sistema não".
--
-- Antes: o convite recusava (email_not_allowed) qualquer email que já fosse
-- utilizador interno OU cliente do portal, e o gatilho
-- trg_anew_users_00_block_supplier_accounts impedia que uma conta de
-- fornecedor ganhasse anew_users (logo, também de ser convidada como cliente).
--
-- Regra nova — invariante "uma conta Auth com supplier_portal_users nunca tem
-- uma membership ATIVA não-cliente (role_is_client IS NOT TRUE)":
--
--   Convite (rpc_supplier_portal_invite_prepare) — conta Auth existente:
--     (i)   interna → email_not_allowed. Interna = tem anew_users e:
--           alguma membership ativa não-cliente (inclui system_admin, que é
--           um papel), OU zero memberships ativas (registo próprio / CRM em
--           onboarding — pode criar a 1.ª organização), OU anew_users
--           inativo/apagado. Também recusado: anew_users com o mesmo email
--           ligado a OUTRA conta Auth (ou a nenhuma).
--     (ii)  só-cliente → ACEITE, account_kind = 'client_existing'. Exige
--           anew_users ativo, ≥ 1 membership ativa e TODAS cliente, linha em
--           client_portal_users (a empresa deu-lhe acesso ao portal do
--           cliente) e email confirmado. A password NUNCA é mexida.
--           O utilizador do portal nasce com password_changed_at = now() e
--           first_login = false (já tem password própria, a do portal do
--           cliente → sp_whoami.first_login = false, sem modal de 1.º acesso).
--     (iii) sem anew_users → regras F3.1 inalteradas (client_portal_users sem
--           perfil recusado; conta ainda não ligada só com
--           app_metadata.supplier_portal = true e sem last_sign_in_at).
--           account_kind = 'supplier'.
--   A RPC devolve também may_set_temp_password: o servidor só pode pôr uma
--   password temporária numa conta 'supplier' cujo utilizador do portal foi
--   criado NESTA chamada, com a marca app_metadata.supplier_portal e que
--   nunca iniciou sessão.
--
--   Reenviar (rpc_supplier_portal_resend_prepare): devolve account_kind e
--   may_set_temp_password = conta 'supplier' + app_metadata.supplier_portal +
--   password_changed_at IS NULL (ainda não definiu a password). Contas
--   'client_existing' nunca.
--
--   Ordem inversa (fornecedor existente convidado depois como cliente pelo
--   create-client-portal-access, que cria anew_users + membership client):
--   PERMITIDO. trg_anew_users_00_block_supplier_accounts deixa de recusar
--   anew_users para contas de fornecedor; passa a recusar só se a linha
--   anew_users já tiver memberships internas ativas (anew_memberships não tem
--   FK: há memberships órfãs na BD, e um UPDATE de auth_user_id podia
--   "transplantar" um perfil interno para a conta do fornecedor).
--
--   Novos gatilhos que fecham a invariante pelos outros dois lados:
--     • trg_anew_memberships_00_block_supplier_internal (anew_memberships,
--       BEFORE INSERT/UPDATE OF status, role_id, user_id, só status active):
--       recusa membership não-cliente para conta com supplier_portal_users
--       (qualquer estado). Calcula "cliente" a partir de anew_roles (não
--       depende da ordem do gatilho que preenche role_is_client).
--     • trg_supplier_portal_users_00_block_internal (supplier_portal_users,
--       BEFORE INSERT/UPDATE OF auth_user_id): recusa se a conta tiver
--       membership interna ativa (email_not_allowed).
--   Os três tomam pg_advisory_xact_lock('sp_internal:<auth uid>') antes de
--   verificar — duas transações concorrentes (convite + membership interna)
--   não passam as duas.
--
--   sp_whoami: acrescenta also_client (membership cliente ativa) no ramo
--   is_supplier = true. Nenhum campo removido. fn_sp_actor,
--   sp_mark_password_changed e sp_my_companies não dependem de anew_users —
--   inalterados.
--
-- Base: definições VIVAS (pg_get_functiondef em 07/10/2026, depois de
-- 20261211120000). Assinaturas, SECURITY DEFINER, search_path e ACL
-- inalterados nas funções substituídas.
--
-- Rollback: reaplicar as definições de rpc_supplier_portal_invite_prepare de
-- 20261211120000, de rpc_supplier_portal_resend_prepare / sp_whoami /
-- fn_anew_users_block_supplier_accounts de 20261211110000, e
--   DROP TRIGGER trg_anew_memberships_00_block_supplier_internal ON public.anew_memberships;
--   DROP TRIGGER trg_supplier_portal_users_00_block_internal ON public.supplier_portal_users;
--   DROP FUNCTION public.fn_anew_memberships_block_supplier_internal();
--   DROP FUNCTION public.fn_supplier_portal_users_block_internal();
-- (só depois de confirmar que nenhuma conta de fornecedor tem anew_users).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Convite
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_supplier_portal_invite_prepare(p_caller_auth_uid uuid, p_organization_id uuid, p_supplier_id uuid, p_email text, p_name text DEFAULT NULL::text, p_check_only boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller   uuid;
  v_email    text := lower(btrim(COALESCE(p_email, '')));
  v_name     text := NULLIF(left(btrim(regexp_replace(COALESCE(p_name, ''), '[\x01-\x1F\x7F]', '', 'g')), 200), '');
  s          record;
  v_key      text;
  v_auth     uuid;
  v_anew     public.anew_users;
  v_kind     text;
  a          public.supplier_accounts;
  l          public.supplier_account_links;
  pu         public.supplier_portal_users;
  v_new_user boolean := false;
  v_may_temp boolean := false;
  v_org_name text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Só disponível para o servidor' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  SELECT u.id INTO v_caller FROM public.anew_users u
  WHERE u.auth_user_id = p_caller_auth_uid AND u.status = 'active' AND u.deleted_at IS NULL;
  IF v_caller IS NULL
     OR p_organization_id IS NULL
     OR p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(p_caller_auth_uid))
     OR NOT public.has_anew_permission(p_caller_auth_uid, 'suppliers.portal_manage') THEN
    RAISE EXCEPTION 'Sem permissão para gerir o acesso dos fornecedores ao portal'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  SELECT id, name, tax_id, vat_number, organization_id, primary_contact_name INTO s
  FROM public.suppliers
  WHERE id = p_supplier_id AND organization_id = p_organization_id AND deleted_at IS NULL
  FOR UPDATE;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  v_key := public.fn_nif_key(COALESCE(NULLIF(btrim(s.tax_id), ''), NULLIF(btrim(s.vat_number), '')));
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'O NIF do fornecedor é inválido ou está vazio. Para fornecedores estrangeiros use o prefixo do país (ex.: ESB12345678).'
      USING ERRCODE = 'check_violation', HINT = 'invalid_nif';
  END IF;

  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(v_email) > 320 THEN
    RAISE EXCEPTION 'Email inválido' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  SELECT id INTO v_auth FROM auth.users WHERE lower(email) = v_email ORDER BY created_at LIMIT 1;

  -- Perfil do CRM/portal do cliente com este email que não é desta conta Auth
  -- (ou não tem conta) → recusado.
  IF EXISTS (SELECT 1 FROM public.anew_users
             WHERE lower(email) = v_email AND auth_user_id IS DISTINCT FROM v_auth) THEN
    RAISE EXCEPTION 'Este email não pode ser usado no portal do fornecedor. Indique outro email.'
      USING ERRCODE = 'check_violation', HINT = 'email_not_allowed';
  END IF;

  IF v_auth IS NOT NULL THEN
    SELECT * INTO v_anew FROM public.anew_users WHERE auth_user_id = v_auth;
    IF v_anew.id IS NOT NULL THEN
      -- (i) interna → recusada. (ii) só-cliente → aceite ('client_existing').
      -- Só-cliente: perfil ativo, ≥ 1 membership ativa e todas de cliente,
      -- acesso dado ao portal do cliente, email confirmado. Zero memberships
      -- ativas = registo próprio / onboarding do CRM → interna.
      IF v_anew.status <> 'active' OR v_anew.deleted_at IS NOT NULL
         OR EXISTS (SELECT 1 FROM public.anew_memberships m
                    WHERE m.user_id = v_anew.id AND m.status = 'active' AND m.role_is_client IS NOT TRUE)
         OR NOT EXISTS (SELECT 1 FROM public.anew_memberships m
                        WHERE m.user_id = v_anew.id AND m.status = 'active' AND m.role_is_client IS TRUE)
         OR NOT EXISTS (SELECT 1 FROM public.client_portal_users c WHERE c.auth_user_id = v_auth)
         OR NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = v_auth AND au.email_confirmed_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Este email não pode ser usado no portal do fornecedor. Indique outro email.'
          USING ERRCODE = 'check_violation', HINT = 'email_not_allowed';
      END IF;
      v_kind := 'client_existing';
    ELSE
      -- (iii) sem perfil: acesso ao portal do cliente sem perfil é um estado
      -- inválido (legado) → recusado, como antes.
      IF EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = v_auth) THEN
        RAISE EXCEPTION 'Este email não pode ser usado no portal do fornecedor. Indique outro email.'
          USING ERRCODE = 'check_violation', HINT = 'email_not_allowed';
      END IF;
      v_kind := 'supplier';
    END IF;

    -- Já é utilizador do portal de OUTRO fornecedor (ou suspenso) → recusado.
    IF EXISTS (SELECT 1 FROM public.supplier_portal_users x
               JOIN public.supplier_accounts xa ON xa.id = x.supplier_account_id
               WHERE x.auth_user_id = v_auth AND (xa.nif_key <> v_key OR x.status <> 'active')) THEN
      RAISE EXCEPTION 'Este email não pode ser usado no portal do fornecedor. Indique outro email.'
        USING ERRCODE = 'check_violation', HINT = 'email_not_allowed';
    END IF;
  END IF;

  -- F3.1 (convite seguro): uma conta Auth SEM perfil que ainda NÃO é
  -- utilizador do portal só é aproveitada se foi criada pelo servidor para o
  -- portal do fornecedor (app_metadata.supplier_portal = true — o utilizador
  -- não altera app_metadata) e nunca iniciou sessão. Fecha o caso de uma
  -- conta registada por terceiros com o mesmo email (e
  -- user_metadata.admin_created='true', que faz handle_new_user saltá-la)
  -- ser ligada ao fornecedor. Contas já ligadas (têm supplier_portal_users)
  -- não passam por aqui — podem já ter iniciado sessão com a password
  -- temporária. Contas 'client_existing' foram verificadas acima.
  IF v_kind = 'supplier'
     AND NOT EXISTS (SELECT 1 FROM public.supplier_portal_users x WHERE x.auth_user_id = v_auth)
     AND EXISTS (SELECT 1 FROM auth.users au
                 WHERE au.id = v_auth
                   AND (au.raw_app_meta_data->>'supplier_portal' IS DISTINCT FROM 'true'
                        OR au.last_sign_in_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Este email não pode ser usado no portal do fornecedor. Indique outro email.'
      USING ERRCODE = 'check_violation', HINT = 'email_not_allowed';
  END IF;

  IF EXISTS (SELECT 1 FROM public.supplier_accounts WHERE nif_key = v_key AND status <> 'active') THEN
    RAISE EXCEPTION 'Não foi possível enviar o convite para este fornecedor. Contacte o suporte.'
      USING ERRCODE = 'check_violation', HINT = 'account_unavailable';
  END IF;

  -- Já ligado a outra conta (NIF mudou fora do gatilho)? Pede para desligar.
  IF EXISTS (SELECT 1 FROM public.supplier_account_links sl JOIN public.supplier_accounts sa ON sa.id = sl.supplier_account_id
             WHERE sl.supplier_id = s.id AND sl.status = 'active' AND sa.nif_key <> v_key) THEN
    RAISE EXCEPTION 'Este fornecedor está ligado ao portal com outro NIF. Desligue o portal e volte a convidar.'
      USING ERRCODE = 'check_violation', HINT = 'conflict';
  END IF;

  IF COALESCE(p_check_only, false) THEN
    RETURN jsonb_build_object('ok', true, 'auth_user_exists', v_auth IS NOT NULL, 'account_kind', v_kind);
  END IF;

  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'A conta de acesso ainda não existe' USING ERRCODE = 'no_data_found', HINT = 'auth_user_missing';
  END IF;

  PERFORM set_config('app.audit_user_id', v_caller::text, true);
  PERFORM set_config('app.audit_source', 'supplier_portal_invite', true);
  PERFORM pg_advisory_xact_lock(hashtextextended('supplier_account:' || v_key, 0));

  -- Conta
  INSERT INTO public.supplier_accounts (nif_key, display_name, created_by_org_id)
  VALUES (v_key, left(btrim(s.name), 200), p_organization_id)
  ON CONFLICT (nif_key) DO NOTHING;
  SELECT * INTO a FROM public.supplier_accounts WHERE nif_key = v_key FOR UPDATE;

  -- Ligação
  SELECT * INTO l FROM public.supplier_account_links
  WHERE supplier_id = s.id AND supplier_account_id = a.id FOR UPDATE;
  IF l.id IS NULL THEN
    INSERT INTO public.supplier_account_links (supplier_account_id, organization_id, supplier_id, invited_by)
    VALUES (a.id, p_organization_id, s.id, v_caller)
    RETURNING * INTO l;
  ELSIF l.status <> 'active' THEN
    UPDATE public.supplier_account_links
       SET status = 'active', revoked_at = NULL, revoked_by = NULL, invited_by = v_caller,
           organization_id = p_organization_id, updated_at = now()
     WHERE id = l.id
    RETURNING * INTO l;
  END IF;

  -- Utilizador do portal
  SELECT * INTO pu FROM public.supplier_portal_users WHERE auth_user_id = v_auth FOR UPDATE;
  IF pu.id IS NULL THEN
    -- Cliente existente: já tem password própria (a do portal do cliente)
    -- → marcada como definida (sem modal de 1.º acesso no portal do
    -- fornecedor).
    -- O gatilho trg_supplier_portal_users_00_block_internal volta a verificar
    -- (sob lock) que a conta não é interna.
    INSERT INTO public.supplier_portal_users (supplier_account_id, auth_user_id, email, name, role, created_by_org_id, invited_by,
                                              first_login, password_changed_at)
    VALUES (a.id, v_auth, v_email, COALESCE(v_name, NULLIF(btrim(s.primary_contact_name), ''), left(btrim(s.name), 200)),
            CASE WHEN EXISTS (SELECT 1 FROM public.supplier_portal_users
                              WHERE supplier_account_id = a.id AND role = 'owner' AND status = 'active')
                 THEN 'member' ELSE 'owner' END,
            p_organization_id, v_caller,
            v_kind IS DISTINCT FROM 'client_existing',
            CASE WHEN v_kind = 'client_existing' THEN now() END)
    RETURNING * INTO pu;
    v_new_user := true;
  END IF;

  -- Password temporária só numa conta de fornecedor criada para o convite,
  -- ligada agora, que nunca iniciou sessão.
  v_may_temp := v_new_user AND v_kind = 'supplier'
                AND EXISTS (SELECT 1 FROM auth.users au
                            WHERE au.id = v_auth
                              AND au.raw_app_meta_data->>'supplier_portal' = 'true'
                              AND au.last_sign_in_at IS NULL);

  -- Acesso desta empresa
  INSERT INTO public.supplier_portal_user_access AS x (portal_user_id, link_id, organization_id, granted_by)
  VALUES (pu.id, l.id, p_organization_id, v_caller)
  ON CONFLICT (portal_user_id, link_id) DO UPDATE
    SET revoked_at = NULL, revoked_by = NULL, granted_by = EXCLUDED.granted_by, granted_at = now(),
        organization_id = EXCLUDED.organization_id
    WHERE x.revoked_at IS NOT NULL;

  SELECT name INTO v_org_name FROM public.anew_organizations WHERE id = p_organization_id;

  RETURN jsonb_build_object(
    'ok', true,
    'portal_user_id', pu.id,
    'link_id', l.id,
    'auth_user_id', v_auth,
    'email', pu.email,
    'user_name', pu.name,
    'is_new_user', v_new_user,
    'password_set', pu.password_changed_at IS NOT NULL,
    'account_kind', v_kind,
    'may_set_temp_password', v_may_temp,
    'organization_name', v_org_name,
    'supplier_name', s.name
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_supplier_portal_invite_prepare(uuid, uuid, uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_portal_invite_prepare(uuid, uuid, uuid, text, text, boolean) TO service_role;

-- ------------------------------------------------------------
-- 2. Reenviar
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_supplier_portal_resend_prepare(p_caller_auth_uid uuid, p_organization_id uuid, p_supplier_id uuid, p_portal_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller   uuid;
  r          record;
  v_org_name text;
  v_kind     text;
  v_may_temp boolean;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Só disponível para o servidor' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  SELECT u.id INTO v_caller FROM public.anew_users u
  WHERE u.auth_user_id = p_caller_auth_uid AND u.status = 'active' AND u.deleted_at IS NULL;
  IF v_caller IS NULL
     OR p_organization_id IS NULL
     OR p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(p_caller_auth_uid))
     OR NOT public.has_anew_permission(p_caller_auth_uid, 'suppliers.portal_manage') THEN
    RAISE EXCEPTION 'Sem permissão para gerir o acesso dos fornecedores ao portal'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  SELECT pu.id, pu.email, pu.name, pu.auth_user_id, pu.password_changed_at, s.name AS supplier_name
  INTO r
  FROM public.supplier_portal_user_access x
  JOIN public.supplier_account_links l ON l.id = x.link_id
  JOIN public.supplier_portal_users pu ON pu.id = x.portal_user_id
  JOIN public.supplier_accounts a ON a.id = l.supplier_account_id
  JOIN public.suppliers s ON s.id = l.supplier_id
  WHERE l.supplier_id = p_supplier_id AND l.organization_id = p_organization_id
    AND l.status = 'active' AND x.revoked_at IS NULL AND x.portal_user_id = p_portal_user_id
    AND pu.status = 'active' AND a.status = 'active' AND s.deleted_at IS NULL;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Utilizador do portal não encontrado neste fornecedor' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  -- Conta que também é cliente (tem perfil): a password é a do portal do
  -- cliente — nunca reposta daqui.
  v_kind := CASE WHEN EXISTS (SELECT 1 FROM public.anew_users WHERE auth_user_id = r.auth_user_id)
                 THEN 'client_existing' ELSE 'supplier' END;
  -- Nova password temporária só se ainda não definiu a sua e a conta foi
  -- criada pelo convite do portal do fornecedor.
  v_may_temp := v_kind = 'supplier' AND r.password_changed_at IS NULL
                AND EXISTS (SELECT 1 FROM auth.users au
                            WHERE au.id = r.auth_user_id
                              AND au.raw_app_meta_data->>'supplier_portal' = 'true');

  SELECT name INTO v_org_name FROM public.anew_organizations WHERE id = p_organization_id;

  RETURN jsonb_build_object(
    'ok', true,
    'portal_user_id', r.id,
    'auth_user_id', r.auth_user_id,
    'email', r.email,
    'user_name', r.name,
    'password_set', r.password_changed_at IS NOT NULL,
    'account_kind', v_kind,
    'may_set_temp_password', v_may_temp,
    'organization_name', v_org_name,
    'supplier_name', r.supplier_name
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_supplier_portal_resend_prepare(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_portal_resend_prepare(uuid, uuid, uuid, uuid) TO service_role;

-- ------------------------------------------------------------
-- 3. sp_whoami: + also_client
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 4. anew_users: conta de fornecedor pode ter perfil (cliente), mas não
--    receber um perfil que já tenha memberships internas ativas.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_anew_users_block_supplier_accounts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.auth_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id) THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('sp_internal:' || NEW.auth_user_id::text, 0));
    IF EXISTS (SELECT 1 FROM public.supplier_portal_users s WHERE s.auth_user_id = NEW.auth_user_id)
       AND EXISTS (SELECT 1 FROM public.anew_memberships m
                   WHERE m.user_id = NEW.id AND m.status = 'active' AND m.role_is_client IS NOT TRUE) THEN
      RAISE EXCEPTION 'Esta conta é do portal do fornecedor e não pode ser usada no CRM'
        USING ERRCODE = 'check_violation', HINT = 'supplier_account';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------
-- 5. anew_memberships: conta de fornecedor não ganha membership interna.
-- ------------------------------------------------------------
CREATE FUNCTION public.fn_anew_memberships_block_supplier_internal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_auth uuid;
BEGIN
  -- Cliente: permitido. Calculado aqui (não depende da ordem do gatilho que
  -- preenche role_is_client). Papel inexistente/NULL conta como interno.
  IF COALESCE((SELECT r.code = 'client' FROM public.anew_roles r WHERE r.id = NEW.role_id), false) THEN
    RETURN NEW;
  END IF;
  SELECT u.auth_user_id INTO v_auth FROM public.anew_users u WHERE u.id = NEW.user_id;
  IF v_auth IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sp_internal:' || v_auth::text, 0));
  IF EXISTS (SELECT 1 FROM public.supplier_portal_users s WHERE s.auth_user_id = v_auth) THEN
    RAISE EXCEPTION 'Esta conta é do portal do fornecedor e não pode ser usada no CRM'
      USING ERRCODE = 'check_violation', HINT = 'supplier_account';
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_anew_memberships_block_supplier_internal() IS
  'Portal do Fornecedor: uma conta Auth com supplier_portal_users não pode ter membership ativa não-cliente (pode ser cliente).';
REVOKE ALL ON FUNCTION public.fn_anew_memberships_block_supplier_internal() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_anew_memberships_00_block_supplier_internal
  BEFORE INSERT OR UPDATE OF status, role_id, user_id ON public.anew_memberships
  FOR EACH ROW WHEN (NEW.status = 'active')
  EXECUTE FUNCTION public.fn_anew_memberships_block_supplier_internal();

-- ------------------------------------------------------------
-- 6. supplier_portal_users: conta interna não pode ser utilizador do portal.
-- ------------------------------------------------------------
CREATE FUNCTION public.fn_supplier_portal_users_block_internal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.auth_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id) THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('sp_internal:' || NEW.auth_user_id::text, 0));
    IF EXISTS (SELECT 1 FROM public.anew_users u
               JOIN public.anew_memberships m ON m.user_id = u.id
               WHERE u.auth_user_id = NEW.auth_user_id AND m.status = 'active' AND m.role_is_client IS NOT TRUE) THEN
      RAISE EXCEPTION 'Este email não pode ser usado no portal do fornecedor. Indique outro email.'
        USING ERRCODE = 'check_violation', HINT = 'email_not_allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_supplier_portal_users_block_internal() IS
  'Portal do Fornecedor: recusa utilizador do portal para conta Auth com membership ativa não-cliente.';
REVOKE ALL ON FUNCTION public.fn_supplier_portal_users_block_internal() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_supplier_portal_users_00_block_internal
  BEFORE INSERT OR UPDATE OF auth_user_id ON public.supplier_portal_users
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_supplier_portal_users_block_internal();
