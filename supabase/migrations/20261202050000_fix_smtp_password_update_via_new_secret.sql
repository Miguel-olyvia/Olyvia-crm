-- Trocar a password SMTP de uma configuracao ja existente (organizacao ou
-- pessoal) nunca funcionava de facto: `vault.update_secret(id_existente,
-- password_nova)` grava, o "Guardar" confirma sucesso, `updated_at` muda --
-- mas `vault.decrypted_secrets` continua a devolver NULL para esse `id`
-- depois disso. Confirmado ao vivo com dados reais: em TODO o historico de
-- `email_logs` da organizacao nike, nenhum envio jamais usou
-- smtp_source='organization' com sucesso -- so 'user', e sempre com um
-- segredo criado de novo (vault.create_secret na criacao da linha), nunca
-- com um segredo que passou por vault.update_secret.
--
-- CORRECCAO: ao trocar a password de uma linha ja existente, deixar de
-- chamar vault.update_secret no segredo antigo -- passa a CRIAR um segredo
-- novo (vault.create_secret) e a linha passa a apontar para esse novo id.
-- O segredo antigo fica orfao no Vault (inofensivo, ilegivel sem
-- service_role) -- o mesmo padrao ja aceite noutro sitio deste projecto
-- para dados bancarios (ver 20261201090000, limpeza de orfaos "hr_conta:"/
-- "hr_iban:"; os orfaos org_smtp:/user_smtp: nao entram nesse filtro e
-- ficam por limpar, tal como ja ficavam antes desta correcao).
--
-- Do ponto de vista de quem usa o ecra, continua a ser uma EDICAO normal:
-- a linha (id, nome, host, etc.) e sempre actualizada por UPDATE, exactamente
-- como antes -- so o mecanismo interno da password muda.

DO $guardas$
BEGIN
  IF to_regprocedure('public.rpc_upsert_org_smtp_settings(uuid,uuid,text,text,integer,text,text,boolean,text,text,text,integer,boolean)') IS NULL THEN
    RAISE EXCEPTION 'rpc_upsert_org_smtp_settings nao existe com a assinatura esperada -- confirmar 20261110750000 antes de aplicar.';
  END IF;
  IF to_regprocedure('public.rpc_upsert_user_smtp_settings(uuid,uuid,text,text,integer,text,text,boolean,text,text,text,text,integer,boolean)') IS NULL THEN
    RAISE EXCEPTION 'rpc_upsert_user_smtp_settings nao existe com a assinatura esperada -- confirmar 20261110750000 antes de aplicar.';
  END IF;
END;
$guardas$;

CREATE OR REPLACE FUNCTION public.rpc_upsert_org_smtp_settings(
  p_id uuid,
  p_organization_id uuid,
  p_name text,
  p_smtp_host text,
  p_smtp_port integer,
  p_smtp_username text,
  p_smtp_password text,
  p_smtp_secure boolean,
  p_encryption text,
  p_from_email text,
  p_from_name text,
  p_daily_limit integer,
  p_is_default boolean
) RETURNS public.organization_smtp_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid;
  v_row public.organization_smtp_settings;
  v_secret_id uuid;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
     OR NOT public.has_anew_permission(auth.uid(), 'settings.update') THEN
    RAISE EXCEPTION 'Sem permissão para gerir SMTP desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_id IS NULL THEN
    IF p_smtp_password IS NULL OR p_smtp_password = '' THEN
      RAISE EXCEPTION 'Password é obrigatória para criar uma configuração SMTP' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_secret_id := vault.create_secret(p_smtp_password, 'org_smtp:new:' || gen_random_uuid()::text);

    INSERT INTO public.organization_smtp_settings
      (organization_id, name, smtp_host, smtp_port, smtp_username, smtp_password_secret_id,
       smtp_secure, encryption, from_email, from_name, daily_limit, is_default, created_by)
    VALUES
      (p_organization_id, p_name, p_smtp_host, p_smtp_port, p_smtp_username, v_secret_id,
       p_smtp_secure, p_encryption, p_from_email, p_from_name, p_daily_limit, p_is_default, v_actor)
    RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_row
    FROM public.organization_smtp_settings
    WHERE id = p_id AND organization_id = p_organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Configuração SMTP não encontrada nesta organização' USING ERRCODE = 'no_data_found';
    END IF;

    -- Trocar a password: CRIAR um segredo novo, nunca actualizar o antigo no
    -- lugar -- vault.update_secret confirmou-se avariado (ver cabecalho).
    -- O segredo antigo fica orfao, sem se apagar (nao existe
    -- vault.delete_secret nesta instalacao, ver 20261201090000).
    IF p_smtp_password IS NOT NULL AND p_smtp_password <> '' THEN
      v_secret_id := vault.create_secret(p_smtp_password, 'org_smtp:' || v_row.id::text || ':' || extract(epoch FROM now())::bigint::text);
    ELSE
      v_secret_id := v_row.smtp_password_secret_id;
    END IF;

    UPDATE public.organization_smtp_settings SET
      name = p_name,
      smtp_host = p_smtp_host,
      smtp_port = p_smtp_port,
      smtp_username = p_smtp_username,
      smtp_password_secret_id = v_secret_id,
      smtp_secure = p_smtp_secure,
      encryption = p_encryption,
      from_email = p_from_email,
      from_name = p_from_name,
      daily_limit = p_daily_limit,
      is_default = p_is_default,
      updated_at = now()
    WHERE id = p_id
    RETURNING * INTO v_row;
  END IF;

  IF p_is_default THEN
    UPDATE public.organization_smtp_settings
    SET is_default = false
    WHERE organization_id = p_organization_id AND id <> v_row.id;
  END IF;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_upsert_user_smtp_settings(
  p_id uuid,
  p_organization_id uuid,
  p_name text,
  p_smtp_host text,
  p_smtp_port integer,
  p_smtp_username text,
  p_smtp_password text,
  p_smtp_secure boolean,
  p_encryption text,
  p_from_email text,
  p_from_name text,
  p_reply_to text,
  p_daily_limit integer,
  p_is_default boolean
) RETURNS public.user_smtp_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row public.user_smtp_settings;
  v_secret_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_id IS NULL THEN
    IF p_smtp_password IS NULL OR p_smtp_password = '' THEN
      RAISE EXCEPTION 'Password é obrigatória para criar uma configuração SMTP' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_secret_id := vault.create_secret(p_smtp_password, 'user_smtp:new:' || gen_random_uuid()::text);

    INSERT INTO public.user_smtp_settings
      (user_id, organization_id, name, smtp_host, smtp_port, smtp_username, smtp_password_secret_id,
       smtp_secure, encryption, from_email, from_name, reply_to, daily_limit, is_default, is_active)
    VALUES
      (auth.uid(), p_organization_id, p_name, p_smtp_host, p_smtp_port, p_smtp_username, v_secret_id,
       p_smtp_secure, p_encryption, p_from_email, p_from_name, p_reply_to, p_daily_limit, p_is_default, true)
    RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_row
    FROM public.user_smtp_settings
    WHERE id = p_id AND user_id = auth.uid();

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Configuração SMTP não encontrada' USING ERRCODE = 'no_data_found';
    END IF;

    IF p_smtp_password IS NOT NULL AND p_smtp_password <> '' THEN
      v_secret_id := vault.create_secret(p_smtp_password, 'user_smtp:' || v_row.id::text || ':' || extract(epoch FROM now())::bigint::text);
    ELSE
      v_secret_id := v_row.smtp_password_secret_id;
    END IF;

    UPDATE public.user_smtp_settings SET
      name = p_name,
      smtp_host = p_smtp_host,
      smtp_port = p_smtp_port,
      smtp_username = p_smtp_username,
      smtp_password_secret_id = v_secret_id,
      smtp_secure = p_smtp_secure,
      encryption = p_encryption,
      from_email = p_from_email,
      from_name = p_from_name,
      reply_to = p_reply_to,
      daily_limit = p_daily_limit,
      is_default = p_is_default,
      updated_at = now()
    WHERE id = p_id
    RETURNING * INTO v_row;
  END IF;

  IF p_is_default THEN
    UPDATE public.user_smtp_settings
    SET is_default = false
    WHERE user_id = auth.uid() AND id <> v_row.id;
  END IF;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_upsert_org_smtp_settings(uuid,uuid,text,text,integer,text,text,boolean,text,text,text,integer,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_upsert_org_smtp_settings(uuid,uuid,text,text,integer,text,text,boolean,text,text,text,integer,boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_org_smtp_settings(uuid,uuid,text,text,integer,text,text,boolean,text,text,text,integer,boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_upsert_user_smtp_settings(uuid,uuid,text,text,integer,text,text,boolean,text,text,text,text,integer,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_upsert_user_smtp_settings(uuid,uuid,text,text,integer,text,text,boolean,text,text,text,text,integer,boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_user_smtp_settings(uuid,uuid,text,text,integer,text,text,boolean,text,text,text,text,integer,boolean) TO authenticated;

DO $conferir$
BEGIN
  IF has_function_privilege('anon', 'public.rpc_upsert_org_smtp_settings(uuid,uuid,text,text,integer,text,text,boolean,text,text,text,integer,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_upsert_org_smtp_settings nao devia estar executavel por anon.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rpc_upsert_org_smtp_settings(uuid,uuid,text,text,integer,text,text,boolean,text,text,text,integer,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_upsert_org_smtp_settings devia continuar executavel por authenticated.';
  END IF;
  IF has_function_privilege('anon', 'public.rpc_upsert_user_smtp_settings(uuid,uuid,text,text,integer,text,text,boolean,text,text,text,text,integer,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_upsert_user_smtp_settings nao devia estar executavel por anon.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rpc_upsert_user_smtp_settings(uuid,uuid,text,text,integer,text,text,boolean,text,text,text,text,integer,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_upsert_user_smtp_settings devia continuar executavel por authenticated.';
  END IF;

  RAISE NOTICE 'Conferido: as duas RPCs de SMTP passam a criar um segredo novo ao trocar a password, em vez de actualizar o existente -- privilegios inalterados (so authenticated, nunca anon).';
END;
$conferir$;
