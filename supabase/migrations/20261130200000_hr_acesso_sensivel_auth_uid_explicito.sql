-- ==============================================================================
-- hr_registar_acesso_sensivel(..., p_auth_uid uuid) -- overload que aceita a
-- identidade de quem revelou, quando quem chama e a propria Edge Function
-- por service_role (hr-documento-ficheiro-url)
-- ==============================================================================
--
-- O DEFEITO QUE ISTO CORRIGE
-- ---------------------------
-- hr_registar_acesso_sensivel(4 args), de 20261120040000, resolve o actor com
-- `auth.uid()` DENTRO da propria funcao. Isso e correcto quando quem chama e
-- uma RPC SECURITY DEFINER invocada na sessao do proprio utilizador (o caso
-- de rpc_hr_documento_ver_conteudo: EXECUTE so a authenticated, auth.uid() e
-- a pessoa real). Mas hr-documento-ficheiro-url fala com a base pelo cliente
-- service_role (e a UNICA forma de emitir um URL assinado para hr-documentos,
-- ver 20261130055000) -- e dentro de uma sessao service_role, auth.uid() e
-- SEMPRE NULL. A funcao de 4 args nao rebenta (grava origem=service_role de
-- proposito, para nao bloquear a operacao que esta a auditar), mas o registo
-- fica sem QUEM revelou: cada "Abrir ficheiro" grava QUE documento foi visto
-- e nunca por quem. E a auditoria e metade da justificacao da RESTRICTIVE de
-- SELECT em 20261130055000 -- uma auditoria que nao identifica ninguem nao
-- cumpre essa promessa.
--
-- A CORRECCAO: MESMO PADRAO DE p_auth_uid QUE rpc_hr_documento_anexar_ficheiro
-- JA USA (20261130065000)
-- ------------------------------------------------------------------------------
-- Um overload de 5 argumentos, com p_auth_uid uuid DEFAULT NULL. Chamadores
-- existentes (todos os RPCs SECURITY DEFINER do modulo, na sessao do proprio
-- utilizador) continuam a resolver com os 4 argumentos originais -- essa
-- funcao NAO e tocada aqui, e o defeito conhecido e ja documentado em
-- rpc_hr_documento_anexar_ficheiro (chamada por validate-upload) fica
-- deliberadamente fora do ambito desta migracao: nao e desta ronda.
--
-- So o overload de 5 args verifica p_auth_uid, e so o aceita vindo de
-- service_role -- o mesmo guard de rpc_hr_documento_anexar_ficheiro: sem ele,
-- um caminho futuro que desse EXECUTE a authenticated deixaria qualquer
-- utilizador atribuir a auditoria a outra pessoa. EXECUTE do overload novo
-- fica, tal como o original, so a service_role.
--
-- Nao ha reversao automatica: um DROP FUNCTION haveria de escolher entre os
-- dois overloads (4 e 5 args) e o db push aplicaria o ficheiro de qualquer
-- forma. A mao, se necessario:
--   DROP FUNCTION IF EXISTS public.hr_registar_acesso_sensivel(uuid, uuid, text, text, uuid);
--
-- Prerequisitos:
--   20261120040000  hr_registar_acesso_sensivel (4 args), pessoas_acessos_sensiveis
--   20261130065000  padrao p_auth_uid + guard de service_role (rpc_hr_documento_anexar_ficheiro)
-- ==============================================================================

DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_acessos_sensiveis') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_acessos_sensiveis nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_registar_acesso_sensivel' AND p.pronargs = 4
  ) THEN
    RAISE EXCEPTION 'public.hr_registar_acesso_sensivel(uuid,uuid,text,text) nao existe. Aplicar 20261120040000 primeiro.';
  END IF;
END;
$guardas$;

CREATE FUNCTION public.hr_registar_acesso_sensivel(
  p_pessoa_id       uuid,
  p_organization_id uuid,
  p_campo           text,
  p_accao           text,
  p_auth_uid        uuid
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth          uuid;
  v_anew          uuid;
  v_request_role  text := current_setting('request.jwt.claims', true)::jsonb->>'role';
BEGIN
  -- p_auth_uid so pode vir de service_role -- exactamente o guard de
  -- rpc_hr_documento_anexar_ficheiro (20261130065000). Sem isto, um GRANT
  -- futuro a authenticated deixaria qualquer chamador atribuir o registo de
  -- auditoria a identidade de outra pessoa.
  IF p_auth_uid IS NOT NULL AND v_request_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'p_auth_uid so pode ser fornecido por service_role.'
      USING ERRCODE = 'HR911';
  END IF;

  v_auth := coalesce(p_auth_uid, auth.uid());

  IF v_auth IS NOT NULL THEN
    SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;
  END IF;

  INSERT INTO public.pessoas_acessos_sensiveis
    (pessoa_id, organization_id, anew_user_id, auth_user_id, origem, campo, accao)
  VALUES
    (p_pessoa_id, p_organization_id, v_anew, v_auth,
     CASE WHEN v_auth IS NULL THEN 'service_role' ELSE 'utilizador' END,
     p_campo, p_accao);
END;
$$;

REVOKE ALL ON FUNCTION public.hr_registar_acesso_sensivel(uuid, uuid, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_registar_acesso_sensivel(uuid, uuid, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hr_registar_acesso_sensivel(uuid, uuid, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_registar_acesso_sensivel(uuid, uuid, text, text, uuid) TO service_role;

COMMENT ON FUNCTION public.hr_registar_acesso_sensivel(uuid, uuid, text, text, uuid) IS
'Overload de 5 args de hr_registar_acesso_sensivel, para chamadores que falam com a base por service_role e por isso nao tem auth.uid() proprio (hr-documento-ficheiro-url). p_auth_uid e a identidade REAL de quem pediu o acesso, resolvida pelo chamador a partir do JWT do pedido -- so service_role pode preenche-lo (mesmo guard de rpc_hr_documento_anexar_ficheiro em 20261130065000); qualquer outro valor nao-nulo e rejeitado. O overload original de 4 args (20261120040000) nao e alterado e continua a ser o caminho das RPCs SECURITY DEFINER que correm na sessao do proprio utilizador.';

-- ==============================================================================
-- Bloco de conferir -- EXERCITA o guard e o overload com dados proprios
-- (organizacao e pessoa fabricadas aqui, nenhuma FK a nike ou a qualquer
-- organizacao pre-existente), dentro de UM bloco aninhado com EXCEPTION que
-- TERMINA sempre a levantar uma excepcao propria (SQLSTATE HR910, nunca
-- P0001) -- a subtransacao implicita do bloco aninhado desfaz sozinha a
-- organizacao, a pessoa e as linhas de auditoria de teste, com sucesso ou
-- falha, tal como no bloco de conferir de 20261130180000. Um WHEN OTHERS
-- generico nunca engole o SQLSTATE/SQLERRM originais -- so HR910 (o proprio
-- sinal de sucesso) e apanhado em silencio.
-- ==============================================================================
DO $conferir$
BEGIN
  DECLARE
    v_org_teste       uuid;
    v_pessoa_teste    uuid;
    v_guard_disparou  boolean := false;
    v_linha_gravada   record;
  BEGIN
    INSERT INTO public.anew_organizations (name)
    VALUES ('Teste migracao 20261130200000 (descartavel)')
    RETURNING id INTO v_org_teste;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_teste, 'Teste Migracao', 'Auditoria 20261130200000')
    RETURNING id INTO v_pessoa_teste;

    -- 1) Sem p_auth_uid (NULL): tem de continuar a funcionar como o overload
    --    de 4 args -- grava origem=service_role quando nao ha auth.uid() de
    --    sessao (este bloco nao corre autenticado).
    PERFORM public.hr_registar_acesso_sensivel(v_pessoa_teste, v_org_teste, 'documento', 'revelar', NULL::uuid);

    SELECT * INTO v_linha_gravada
      FROM public.pessoas_acessos_sensiveis
     WHERE pessoa_id = v_pessoa_teste AND organization_id = v_org_teste
     ORDER BY created_at DESC
     LIMIT 1;

    IF v_linha_gravada.id IS NULL THEN
      RAISE EXCEPTION 'hr_registar_acesso_sensivel(...,NULL) nao gravou linha nenhuma.'
        USING ERRCODE = 'HR912';
    END IF;

    IF v_linha_gravada.origem IS DISTINCT FROM 'service_role' OR v_linha_gravada.auth_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'Com p_auth_uid NULL, esperava-se origem=service_role e auth_user_id NULL; veio origem=% auth_user_id=%.',
        v_linha_gravada.origem, v_linha_gravada.auth_user_id
        USING ERRCODE = 'HR913';
    END IF;

    -- 2) Com p_auth_uid preenchido, fora de uma sessao service_role (este
    --    bloco corre com o papel do dono da migracao, nao service_role): o
    --    guard TEM de disparar. E o cenario exacto que o revisor apanhou --
    --    se este RAISE nao acontecer, o guard nao protege nada.
    BEGIN
      PERFORM public.hr_registar_acesso_sensivel(
        v_pessoa_teste, v_org_teste, 'documento', 'revelar', gen_random_uuid()
      );
    EXCEPTION
      WHEN SQLSTATE 'HR911' THEN
        v_guard_disparou := true;
    END;

    IF NOT v_guard_disparou THEN
      RAISE EXCEPTION 'hr_registar_acesso_sensivel(...,p_auth_uid) NAO rejeitou um chamador que nao e service_role -- o guard de identidade nao esta a funcionar.'
        USING ERRCODE = 'HR914';
    END IF;

    -- Todas as assercoes passaram: forcar o desfazer da organizacao, pessoa
    -- e linhas de auditoria de teste, com um SQLSTATE proprio (HR900, o
    -- mesmo marcador de sucesso convencionado em 20261130180000) que nao
    -- colide com nenhum RAISE EXCEPTION real do projecto.
    RAISE EXCEPTION 'teste_acesso_sensivel_20261130200000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: todas as assercoes passaram, dados de teste desfeitos pela subtransacao implicita
    WHEN OTHERS THEN
      RAISE EXCEPTION
        'Um dos testes ao vivo desta migracao (guard de p_auth_uid em hr_registar_acesso_sensivel) falhou -- SQLSTATE %: %',
        SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'OK: hr_registar_acesso_sensivel(5 args) grava origem=service_role/auth_user_id=NULL quando p_auth_uid e NULL, e rejeita p_auth_uid preenchido fora de service_role -- testado ao vivo, com organizacao e pessoa proprias, desfeitas pela subtransacao.';
END;
$conferir$;
