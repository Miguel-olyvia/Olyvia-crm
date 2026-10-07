-- ============================================================
-- 20261211120000_portal_fornecedor_f31_convite_seguro
-- ============================================================
-- Portal do Fornecedor, F3.1 — correção de segurança do convite (revisão de
-- create-supplier-portal-access, ponto 3 [MEDIUM]).
--
-- Problema: um terceiro podia registar-se antes do convite com o email do
-- fornecedor e user_metadata.admin_created='true' (handle_new_user salta-a,
-- fica sem anew_users). O convite encontrava essa conta pelo email e ligava-a
-- ao fornecedor — o terceiro entrava no portal com a password que já sabia.
--
-- Correção: rpc_supplier_portal_invite_prepare recusa (email_not_allowed, a
-- mesma resposta dos restantes emails não permitidos) uma conta Auth ainda
-- sem supplier_portal_users se raw_app_meta_data->>'supplier_portal' não for
-- 'true' OU se já tiver iniciado sessão (last_sign_in_at). A edge function
-- passa a criar a conta com app_metadata { supplier_portal: true } ANTES de
-- chamar a RPC (password aleatória do GoTrue, nunca usada) → passa.
-- Contas já ligadas (têm supplier_portal_users) não são afetadas.
--
-- Base: definição VIVA (pg_get_functiondef em 07/10/2026), não o ficheiro de
-- 20261211110000. Assinatura, SECURITY DEFINER, search_path e ACL inalterados.
-- rpc_supplier_portal_resend_prepare não muda: só trabalha com utilizadores do
-- portal já existentes.
--
-- Rollback: reaplicar a definição de rpc_supplier_portal_invite_prepare de
-- 20261211110000 (sem o bloco "F3.1 (convite seguro)").
-- ============================================================

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
  a          public.supplier_accounts;
  l          public.supplier_account_links;
  pu         public.supplier_portal_users;
  v_new_user boolean := false;
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

  -- Email que é (ou foi) do CRM ou do portal do cliente, ou de outro fornecedor → recusado.
  SELECT id INTO v_auth FROM auth.users WHERE lower(email) = v_email ORDER BY created_at LIMIT 1;
  IF EXISTS (SELECT 1 FROM public.anew_users WHERE lower(email) = v_email)
     OR (v_auth IS NOT NULL AND (
           EXISTS (SELECT 1 FROM public.anew_users WHERE auth_user_id = v_auth)
        OR EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = v_auth)
        OR EXISTS (SELECT 1 FROM public.supplier_portal_users x
                   JOIN public.supplier_accounts xa ON xa.id = x.supplier_account_id
                   WHERE x.auth_user_id = v_auth AND (xa.nif_key <> v_key OR x.status <> 'active'))
     )) THEN
    RAISE EXCEPTION 'Este email não pode ser usado no portal do fornecedor. Indique outro email.'
      USING ERRCODE = 'check_violation', HINT = 'email_not_allowed';
  END IF;

  -- F3.1 (convite seguro): uma conta Auth que ainda NÃO é utilizador do portal
  -- só é aproveitada se foi criada pelo servidor para o portal do fornecedor
  -- (app_metadata.supplier_portal = true — o utilizador não altera
  -- app_metadata) e nunca iniciou sessão. Fecha o caso de uma conta registada
  -- por terceiros com o mesmo email (e user_metadata.admin_created='true',
  -- que faz handle_new_user saltá-la) ser ligada ao fornecedor.
  -- Nota: não se usa encrypted_password — auth.admin.createUser sem password
  -- grava sempre uma password aleatória (GoTrue), por isso nunca está vazia.
  -- Contas já ligadas (têm supplier_portal_users) não passam por aqui.
  IF v_auth IS NOT NULL
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
    RETURN jsonb_build_object('ok', true, 'auth_user_exists', v_auth IS NOT NULL);
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
    INSERT INTO public.supplier_portal_users (supplier_account_id, auth_user_id, email, name, role, created_by_org_id, invited_by)
    VALUES (a.id, v_auth, v_email, COALESCE(v_name, NULLIF(btrim(s.primary_contact_name), ''), left(btrim(s.name), 200)),
            CASE WHEN EXISTS (SELECT 1 FROM public.supplier_portal_users
                              WHERE supplier_account_id = a.id AND role = 'owner' AND status = 'active')
                 THEN 'member' ELSE 'owner' END,
            p_organization_id, v_caller)
    RETURNING * INTO pu;
    v_new_user := true;
  END IF;

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
    'organization_name', v_org_name,
    'supplier_name', s.name
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_supplier_portal_invite_prepare(uuid, uuid, uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_portal_invite_prepare(uuid, uuid, uuid, text, text, boolean) TO service_role;
