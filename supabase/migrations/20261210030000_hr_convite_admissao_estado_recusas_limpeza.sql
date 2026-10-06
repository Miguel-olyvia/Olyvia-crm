-- ==============================================================================
-- Convite de admissao: registo do envio e das recusas, heranca do rascunho,
-- codigos de erro estaveis e limpeza dos rascunhos abandonados. Lote A,
-- migration 3 de 3.
--
-- POR APLICAR.
--
-- PRECISA das Edge Functions convite-admissao e criar-acesso-pessoa novas,
-- publicadas LOGO A SEGUIR ao push. A ordem inversa (Edge nova com base antiga)
-- so degrada o registo de envio/recusa, que e melhor-esforco. A ordem certa
-- (base nova, Edge antiga) tambem nao parte nada: a Edge antiga le o texto do
-- erro e os codigos novos mantem o mesmo texto; so o formato legado
-- 'admissao_incompleta: a, b' deixa de ser lancado (a Edge nova le o DETAIL).
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- 1. pessoas_convites_admissao ganha: email_enviado, email_enviado_em,
--    email_erro, ultima_recusa_codigo, ultima_recusa_em, ultima_recusa_campos,
--    ultima_recusa_conflitos. SELECT por coluna a authenticated em todas
--    MENOS ultima_recusa_conflitos (so a le a RPC SECURITY DEFINER dos
--    conflitos, que tem o gate de identificacao), alem de token_hash e
--    rascunho.
-- 2. rpc_hr_convite_admissao_criar: o novo convite HERDA o rascunho do anterior
--    quando o email e o mesmo (mover, nao copiar). Se o email mudou, o rascunho
--    antigo e descartado: nao vai parar a outra caixa de correio. Um convite
--    expirado ainda conta ate 7 dias depois de expirar. A RPC deixa de ser
--    chamavel por authenticated: ver a secao seguinte.
-- 3. NOVA rpc_hr_convite_admissao_registar_envio (so service_role): devolve
--    boolean (false = nenhum convite com esse id).
-- 4. NOVA rpc_hr_convite_admissao_registar_recusa (so service_role): guarda a
--    ultima recusa da submissao; nos duplicados guarda so os pessoa_id da
--    MESMA organizacao, nunca valores de NIF ou NISS, e CONTA a recusa em
--    attempts (tecto de 10: trava quem usa o convite para testar NIF/NISS).
--    Devolve boolean (false = ignorada: codigo fora da lista ou convite
--    inexistente, usado ou revogado).
-- 5. NOVA rpc_hr_convite_admissao_resumo(pessoa) e rpc_hr_convite_admissao_
--    conflitos(pessoa), para o RH ver o estado do convite e que ficha ja tem o
--    NIF/NISS. Nunca devolvem token, rascunho, IP nem user-agent. O conflitos
--    (nomes, inclusive de fichas apagadas) e a recusa por NIF/NISS duplicado
--    do resumo so aparecem a quem tem tambem hr.pessoas.identificacao.view.
--
--
-- -- INTERFACE PARA A EDGE FUNCTION convite-admissao (accao criar) --------------
--
-- rpc_hr_convite_admissao_criar passou a SO service_role (REVOKE a
-- authenticated e anon) e mudou de assinatura. Antes recebia o p_token_hash
-- escolhido pelo chamador; com a heranca do rascunho isso deixava quem tem
-- so hr.pessoas.convite.enviar ler o rascunho de outra pessoa (NIF, NISS,
-- IBAN, morada) abrindo /admissao/<token inventado por ele>.
--
--   rpc_hr_convite_admissao_criar(
--     p_pessoa_id uuid, p_token_hash text, p_valid_until timestamptz,
--     p_email text, p_actor uuid)
--   RETURNS TABLE (convite_id uuid, rascunho_herdado boolean)
--
-- A Edge Function passa a: (1) validar o JWT com auth.getUser; (2) verificar
-- hr.pessoas.convite.enviar na organizacao da pessoa com
-- has_anew_permission_in_org; (3) gerar o codigo e o hash, como ja faz; (4)
-- chamar a RPC com o cliente de CHAVE DE SERVICO, passando em p_actor o id de
-- auth.users do utilizador autenticado (e o que o auditor e created_by usam;
-- a base volta a verificar a permissao de p_actor, e null ou sem permissao da
-- 42501). A resposta e um array de UMA linha: convite_id e rascunho_herdado.
-- Quando rascunho_herdado = true, a Edge NAO devolve o link ao RH se o email
-- falhar (o link abriria o rascunho de outra pessoa na UI do RH): nao mostra
-- o link. Salta registar_envio se convite_id vier nulo.
-- 6. rpc_hr_convite_admissao_submeter: codigos de erro com SQLSTATE proprio
--    (classe HRA), NIF/NISS validados pelo digito de controlo, motivo exacto
--    quando o convite nao se consome, duplicados com os pessoa_id no DETAIL,
--    e o portao so trava pelos campos de posicao convite.
-- 7. hr_convites_admissao_limpar() e tarefa pg_cron diaria que apaga o rascunho
--    dos convites abandonados ha mais de 7 dias.
--
--
-- -- CODIGOS DE ERRO (contrato unico SQL + Edge + TypeScript) -------------------
--
-- A MESSAGE da excepcao e EXACTAMENTE o codigo, sem sufixo.
--   HRA01 convite_invalido    HRA02 convite_ja_usado   HRA03 convite_revogado
--   HRA04 convite_expirado    HRA05 convite_bloqueado  HRA10 pedido_invalido
--   HRA11 nif_invalido        HRA12 niss_invalido      HRA13 nif_ja_existe
--   HRA14 niss_ja_existe      HRA15 pais_invalido      HRA16 iban_invalido
--   HRA17 admissao_incompleta (DETAIL = codigos de campo separados por virgula)
--   HRA30 pessoa_nao_encontrada
-- Recusa de permissao: 'insufficient_privilege', ERRCODE 42501.
-- nif_ja_existe / niss_ja_existe levam no DETAIL os pessoa_id em conflito: so a
-- Edge Function o le, NUNCA sai para o publico.
--
--
-- -- TUDO OU NADA --------------------------------------------------------------
--
-- A submissao corre numa unica transaccao do PostgREST: qualquer RAISE desfaz o
-- used_at, as escritas e o segredo criado no Vault (o Vault e uma tabela e
-- entra no mesmo rollback).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao: repor
-- rpc_hr_convite_admissao_submeter de 20261202080000 e
-- rpc_hr_convite_admissao_criar de 20261124130000 (4 argumentos, com GRANT a
-- authenticated; largar antes a de 5 argumentos); largar as quatro RPCs novas
-- e hr_convites_admissao_limpar(); cron.unschedule('hr-convites-admissao-
-- limpar'); as colunas novas podem ficar.
--
--
-- TAMANHO: ficheiro com mais de 800 linhas, mantido assim de proposito
-- (decisao: nao dividir as migrations do lote A).
--
--
-- Prerequisitos:
--   20261124120000  pessoas_convites_admissao
--   20261202080000  rpc_hr_convite_admissao_submeter (versao vigente)
--   20261210010000  hr_nif_valido, hr_niss_valido
--   20261210020000  hr_admissao_pendencias com a coluna posicao
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_convites_admissao') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_convites_admissao nao existe. Aplicar 20261124120000 primeiro.';
  END IF;
  IF to_regprocedure('public.hr_nif_valido(text)') IS NULL
     OR to_regprocedure('public.hr_niss_valido(text)') IS NULL THEN
    RAISE EXCEPTION 'hr_nif_valido / hr_niss_valido nao existem. Aplicar 20261210010000 primeiro.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_pendencias'
       AND pg_get_function_result(p.oid) LIKE '%posicao%'
  ) THEN
    RAISE EXCEPTION 'hr_admissao_pendencias nao devolve a posicao. Aplicar 20261210020000 primeiro.';
  END IF;
  IF to_regprocedure('public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)') IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter nao existe. Aplicar 20261202080000 primeiro.';
  END IF;
  IF to_regprocedure('public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text)') IS NULL
     AND to_regprocedure('public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_criar nao existe. Aplicar 20261124130000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. Colunas novas
-- ==============================================================================
ALTER TABLE public.pessoas_convites_admissao
  ADD COLUMN IF NOT EXISTS email_enviado           boolean,
  ADD COLUMN IF NOT EXISTS email_enviado_em        timestamptz,
  ADD COLUMN IF NOT EXISTS email_erro              text,
  ADD COLUMN IF NOT EXISTS ultima_recusa_codigo    text,
  ADD COLUMN IF NOT EXISTS ultima_recusa_em        timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_recusa_campos    text[],
  ADD COLUMN IF NOT EXISTS ultima_recusa_conflitos jsonb;

DO $chk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_convites_admissao_email_erro_tamanho'
       AND conrelid = 'public.pessoas_convites_admissao'::regclass
  ) THEN
    ALTER TABLE public.pessoas_convites_admissao
      ADD CONSTRAINT pessoas_convites_admissao_email_erro_tamanho
      CHECK (email_erro IS NULL OR length(email_erro) <= 500);
  END IF;
END;
$chk$;

COMMENT ON COLUMN public.pessoas_convites_admissao.email_enviado IS
'NULL = ainda nao se tentou enviar; true = o email saiu; false = o envio falhou (ver email_erro). Registado pela Edge Function, melhor-esforco.';
COMMENT ON COLUMN public.pessoas_convites_admissao.email_erro IS
'Motivo curto da falha de envio (ate 500 caracteres). Nunca contem o link nem o codigo do convite.';
COMMENT ON COLUMN public.pessoas_convites_admissao.ultima_recusa_codigo IS
'Codigo da ultima recusa da submissao (nif_invalido, nif_ja_existe, admissao_incompleta, ...). Nao conta como abertura falhada.';
COMMENT ON COLUMN public.pessoas_convites_admissao.ultima_recusa_conflitos IS
'Array de {pessoa_id, campo} das fichas da MESMA organizacao que ja tem o NIF ou NISS submetido. Nunca guarda valores de NIF ou NISS.';

-- Grants por coluna: tudo menos token_hash, rascunho e ultima_recusa_conflitos
-- (esta so a le a RPC SECURITY DEFINER dos conflitos, com o gate de
-- identificacao: guarda ids de fichas em que o NIF/NISS coincidiu).
GRANT SELECT (
  email_enviado, email_enviado_em, email_erro,
  ultima_recusa_codigo, ultima_recusa_em, ultima_recusa_campos
) ON TABLE public.pessoas_convites_admissao TO authenticated;

-- ==============================================================================
-- 2. rpc_hr_convite_admissao_criar: heranca do rascunho
--    ASSINATURA NOVA (p_actor) e retorno novo (convite_id, rascunho_herdado), so
--    service_role. Antes: revogava o vivo e inseria. Agora:
--    le o rascunho, revoga, move o rascunho (anteriores ficam sem ele) e
--    insere o novo com o rascunho herdado.
-- ==============================================================================
-- SO service_role e com p_actor. A de 4 argumentos (com GRANT a authenticated)
-- e largada: deixa-la ao lado era deixar a porta aberta e dar ao PostgREST uma
-- sobrecarga ambigua.
DROP FUNCTION IF EXISTS public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text);

CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_criar(
  p_pessoa_id   uuid,
  p_token_hash  text,
  p_valid_until timestamptz,
  p_email       text,
  p_actor       uuid
)
RETURNS TABLE (convite_id uuid, rascunho_herdado boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_heranca constant interval := interval '7 days';
  v_org       uuid;
  v_anew      uuid;
  v_id        uuid;
  v_antigo    record;
  v_rascunho  jsonb;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pessoas p
  WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'pessoa_nao_encontrada' USING ERRCODE = 'HRA30';
  END IF;

  -- A Edge Function ja verificou a permissao (e a unica que chama esta RPC, com
  -- a chave de servico); a base verifica-a outra vez sobre o p_actor.
  IF p_actor IS NULL
     OR NOT public.has_anew_permission_in_org(p_actor, 'hr.pessoas.convite.enviar', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  IF p_valid_until <= now() THEN
    RAISE EXCEPTION 'validade_invalida' USING ERRCODE = '22023';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = p_actor LIMIT 1;

  -- HERANCA DO RASCUNHO. O convite mais recente desta pessoa que ainda tem
  -- rascunho e nunca foi usado (vivo, revogado, ou expirado ainda nao
  -- limpo). So passa para o novo se o email de destino for o mesmo e se nao
  -- passaram mais de 7 dias sobre o fim de vida desse convite; com outro email
  -- o rascunho descarta-se, para nao ir parar a outra caixa de correio.
  SELECT c.rascunho, c.email_destino,
         least(coalesce(c.revoked_at, 'infinity'::timestamptz), c.valid_until) AS fim_de_vida
    INTO v_antigo
    FROM public.pessoas_convites_admissao c
   WHERE c.pessoa_id = p_pessoa_id
     AND c.organization_id = v_org
     AND c.used_at IS NULL
     AND c.rascunho IS NOT NULL
   ORDER BY c.created_at DESC
   LIMIT 1;

  IF v_antigo.rascunho IS NOT NULL
     AND lower(v_antigo.email_destino) = lower(p_email)
     AND v_antigo.fim_de_vida >= now() - c_heranca THEN
    v_rascunho := v_antigo.rascunho;
  END IF;

  -- So pode haver um convite vivo por pessoa (o indice unico parcial da
  -- tabela ja o garante); revogar explicitamente o anterior torna a intencao
  -- clara em vez de depender so do indice para rejeitar o INSERT.
  UPDATE public.pessoas_convites_admissao
     SET revoked_at = now()
   WHERE pessoa_id = p_pessoa_id
     AND organization_id = v_org
     AND used_at IS NULL
     AND revoked_at IS NULL;

  -- Mover, nao copiar: nenhum convite anterior nao usado fica com rascunho.
  UPDATE public.pessoas_convites_admissao
     SET rascunho = NULL
   WHERE pessoa_id = p_pessoa_id
     AND organization_id = v_org
     AND used_at IS NULL
     AND rascunho IS NOT NULL;

  INSERT INTO public.pessoas_convites_admissao
    (pessoa_id, organization_id, token_hash, email_destino, valid_until, created_by, rascunho)
  VALUES
    (p_pessoa_id, v_org, p_token_hash, p_email, p_valid_until, v_anew, v_rascunho)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, (v_rascunho IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid) IS
'Cria um convite de admissao. SO service_role: chamada pela Edge Function convite-admissao, que valida o JWT, verifica hr.pessoas.convite.enviar e passa em p_actor o id de auth.users do utilizador (a base volta a verificar a permissao de p_actor: null ou sem permissao da insufficient_privilege 42501). Revoga o convite vivo anterior e insere o novo. Desde 20261210030000 o novo convite HERDA o rascunho do anterior (move, nao copia) quando o email de destino e o mesmo e o anterior nao acabou ha mais de 7 dias; com outro email o rascunho antigo e descartado. Devolve uma linha (convite_id, rascunho_herdado): com rascunho_herdado a Edge nao deve mostrar o link ao RH. Erros: pessoa_nao_encontrada (HRA30), insufficient_privilege (42501), validade_invalida (22023). p_token_hash e o SHA-256 do codigo gerado fora da base; o codigo em claro nunca chega aqui. Fechada a authenticated porque, com a heranca, o hash escolhido pelo chamador dava acesso ao rascunho de outra pessoa.';

-- ==============================================================================
-- 3. rpc_hr_convite_admissao_registar_envio
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_registar_envio(
  p_convite_id uuid,
  p_enviado    boolean,
  p_erro       text
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.pessoas_convites_admissao
     SET email_enviado    = p_enviado,
         email_enviado_em = CASE WHEN p_enviado THEN now() END,
         email_erro       = CASE WHEN p_enviado THEN NULL ELSE left(p_erro, 500) END
   WHERE id = p_convite_id;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_registar_envio(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_registar_envio(uuid, boolean, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_registar_envio(uuid, boolean, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_registar_envio(uuid, boolean, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_registar_envio(uuid, boolean, text) IS
'Regista se o email do convite saiu (true) ou falhou (false, com o motivo cortado a 500 caracteres). Devolve true se gravou e false se nao havia convite com esse id (a Edge Function nao deve ignorar o false). SO service_role: chamada pela Edge Function convite-admissao, melhor-esforco.';

-- ==============================================================================
-- 4. rpc_hr_convite_admissao_registar_recusa
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_registar_recusa(
  p_token_hash          text,
  p_codigo              text,
  p_campos              text[],
  p_conflito_pessoa_ids uuid[]
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_tecto   constant integer := 10;
  c_codigos constant text[] := ARRAY[
    'nif_invalido', 'niss_invalido', 'nif_ja_existe', 'niss_ja_existe',
    'pais_invalido', 'iban_invalido', 'admissao_incompleta',
    'assinatura_obrigatoria', 'pedido_invalido'
  ];
  v_convite   record;
  v_campos    text[];
  v_conflitos jsonb;
BEGIN
  IF p_codigo IS NULL OR NOT (p_codigo = ANY (c_codigos)) THEN
    RETURN false;
  END IF;

  SELECT c.id, c.organization_id INTO v_convite
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash
     AND c.used_at IS NULL
     AND c.revoked_at IS NULL;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT array_agg(x.campo)
    INTO v_campos
    FROM (
      SELECT DISTINCT u.campo
        FROM unnest(coalesce(p_campos, ARRAY[]::text[])) AS u(campo)
       WHERE u.campo ~ '^[a-z0-9_]{1,64}$'
       LIMIT 60
    ) x;

  -- So os pessoa_id que pertencem a MESMA organizacao do convite; ids
  -- estranhos caem. Nunca valores de NIF ou NISS.
  IF p_codigo IN ('nif_ja_existe', 'niss_ja_existe') THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'pessoa_id', p.id,
             'campo', CASE WHEN p_codigo = 'nif_ja_existe' THEN 'nif' ELSE 'niss' END
           )), '[]'::jsonb)
      INTO v_conflitos
      FROM public.pessoas p
     WHERE p.id = ANY (coalesce(p_conflito_pessoa_ids, ARRAY[]::uuid[]))
       AND p.organization_id = v_convite.organization_id;
  ELSE
    v_conflitos := NULL;
  END IF;

  -- Os duplicados (NIF/NISS ja existe) CONTAM em attempts, com o mesmo tecto
  -- das aberturas falhadas: a submissao devolve ao titular do token se um
  -- numero ja pertence a outra ficha, e sem contador quem tem um convite
  -- valido podia testar numeros a vontade (so o limite por IP o travava). As
  -- outras recusas nao contam.
  UPDATE public.pessoas_convites_admissao
     SET ultima_recusa_codigo    = p_codigo,
         ultima_recusa_em        = now(),
         ultima_recusa_campos    = v_campos,
         ultima_recusa_conflitos = v_conflitos,
         attempts = CASE WHEN p_codigo IN ('nif_ja_existe', 'niss_ja_existe')
                         THEN least(attempts + 1, c_tecto)
                         ELSE attempts END
   WHERE id = v_convite.id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_registar_recusa(text, text, text[], uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_registar_recusa(text, text, text[], uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_registar_recusa(text, text, text[], uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_registar_recusa(text, text, text[], uuid[]) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_registar_recusa(text, text, text[], uuid[]) IS
'Guarda a ultima recusa da submissao no convite (codigo, momento, campos em falta, e nos duplicados as fichas em conflito da MESMA organizacao). So aceita os codigos de recusa de submissao; so actua num convite por usar e nao revogado. Devolve true se registou e false se ignorou (codigo fora da lista ou convite inexistente, usado ou revogado). nif_ja_existe e niss_ja_existe contam em attempts (tecto 10); as outras recusas nao. SO service_role: chamada pela Edge Function convite-admissao, melhor-esforco.';

-- ==============================================================================
-- 5. rpc_hr_convite_admissao_resumo: o estado do convite, para o RH
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_resumo(p_pessoa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_tecto constant integer := 10;
  v_org  uuid;
  v_c    record;
  v_estado text;
  v_ident  boolean;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pessoas p
  WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'pessoa_nao_encontrada' USING ERRCODE = 'HRA30';
  END IF;

  IF NOT public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.view', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- Revelar que o NIF/NISS coincide com o de outra ficha e dado de
  -- identificacao: so com hr.pessoas.identificacao.view.
  v_ident := public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.identificacao.view', v_org);

  SELECT c.id, c.email_destino, c.created_at, c.valid_until, c.used_at, c.revoked_at,
         c.attempts, c.email_enviado, c.email_enviado_em, c.email_erro,
         c.assinatura_nome, (c.rascunho IS NOT NULL) AS tem_rascunho,
         c.ultima_recusa_codigo, c.ultima_recusa_em, c.ultima_recusa_campos,
         (coalesce(jsonb_array_length(c.ultima_recusa_conflitos), 0) > 0) AS tem_conflitos
    INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.pessoa_id = p_pessoa_id
     AND c.organization_id = v_org
   ORDER BY c.created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('existe', false);
  END IF;

  v_estado := CASE
    WHEN v_c.used_at IS NOT NULL    THEN 'usado'
    WHEN v_c.revoked_at IS NOT NULL THEN 'revogado'
    WHEN v_c.attempts >= c_tecto    THEN 'bloqueado'
    WHEN v_c.valid_until <= now()   THEN 'expirado'
    ELSE 'pendente'
  END;

  -- NUNCA token_hash, rascunho (so se existe), assinatura_ip nem user_agent.
  RETURN jsonb_build_object(
    'existe',             true,
    'convite_id',         v_c.id,
    'estado',             v_estado,
    'email_destino',      v_c.email_destino,
    'criado_em',          v_c.created_at,
    'valid_until',        v_c.valid_until,
    'email_enviado',      v_c.email_enviado,
    'email_enviado_em',   v_c.email_enviado_em,
    'email_erro',         v_c.email_erro,
    'aberturas_falhadas', v_c.attempts,
    'usado_em',           v_c.used_at,
    'assinatura_nome',    v_c.assinatura_nome,
    'tem_rascunho',       v_c.tem_rascunho,
    'ultima_recusa',      CASE
                            WHEN v_c.ultima_recusa_codigo IS NULL THEN NULL
                            ELSE jsonb_build_object(
                                   'codigo', CASE
                                               WHEN NOT v_ident
                                                AND v_c.ultima_recusa_codigo IN ('nif_ja_existe', 'niss_ja_existe')
                                               THEN NULL
                                               ELSE v_c.ultima_recusa_codigo
                                             END,
                                   'em',     v_c.ultima_recusa_em,
                                   'campos', to_jsonb(CASE
                                               WHEN v_ident
                                               THEN coalesce(v_c.ultima_recusa_campos, ARRAY[]::text[])
                                               ELSE ARRAY(
                                                      SELECT u.campo
                                                        FROM unnest(coalesce(v_c.ultima_recusa_campos, ARRAY[]::text[])) AS u(campo)
                                                       WHERE u.campo NOT IN ('nif', 'niss'))
                                             END))
                          END,
    'tem_conflitos',      (v_ident AND v_c.tem_conflitos)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_resumo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_resumo(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_resumo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_resumo(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_resumo(uuid) IS
'O convite mais recente da pessoa, para o RH: estado (usado, revogado, bloqueado, expirado, pendente), envio do email, aberturas falhadas, ultima recusa e se tem rascunho (nunca o conteudo). Gate: hr.pessoas.view na organizacao da ficha (42501); ficha inexistente ou apagada -> pessoa_nao_encontrada (HRA30). Sem hr.pessoas.identificacao.view: ultima_recusa.codigo vem null nas recusas por NIF/NISS duplicado, ultima_recusa.campos omite nif e niss, e tem_conflitos e sempre false. Nunca devolve token_hash, rascunho, IP nem user-agent. Nome distinto de rpc_hr_convite_admissao_estado de proposito, para nao haver sobrecarga no PostgREST.';

-- ==============================================================================
-- 6. rpc_hr_convite_admissao_conflitos: que ficha ja tem o NIF/NISS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_conflitos(p_pessoa_id uuid)
RETURNS TABLE (pessoa_id uuid, nome_completo text, campo text, estado text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pessoas p
  WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'pessoa_nao_encontrada' USING ERRCODE = 'HRA30';
  END IF;

  IF NOT public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.view', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- Os nomes (inclusive de fichas apagadas) de quem partilha NIF/NISS sao
  -- dado de identificacao: sem hr.pessoas.identificacao.view a lista vem vazia.
  IF NOT public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.identificacao.view', v_org) THEN
    RETURN;
  END IF;

  -- O convite mais recente por usar; so as fichas da organizacao da ficha
  -- (ids estranhos caem no JOIN).
  RETURN QUERY
  SELECT pc.id,
         pc.nome_completo,
         (e.item ->> 'campo'),
         CASE WHEN pc.deleted_at IS NULL THEN 'activa' ELSE 'apagada' END
    FROM (
      SELECT cc.ultima_recusa_conflitos AS conflitos
        FROM public.pessoas_convites_admissao cc
       WHERE cc.pessoa_id = p_pessoa_id
         AND cc.organization_id = v_org
         AND cc.used_at IS NULL
       ORDER BY cc.created_at DESC
       LIMIT 1
    ) u
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(u.conflitos, '[]'::jsonb)) AS e(item)
    JOIN public.pessoas pc
      ON pc.id = (e.item ->> 'pessoa_id')::uuid
     AND pc.organization_id = v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_conflitos(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_conflitos(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_conflitos(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_conflitos(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_conflitos(uuid) IS
'As fichas que ja tinham o NIF ou NISS que a ultima submissao recusada tentou usar: pessoa_id, nome, campo (nif ou niss) e estado (activa ou apagada). Le o convite mais recente por usar da pessoa. Gate: hr.pessoas.view (42501) e, para ver alguma linha, tambem hr.pessoas.identificacao.view (sem ela a lista vem vazia, nao ha erro). Nunca devolve valores de NIF ou NISS.';

-- ==============================================================================
-- 7. rpc_hr_convite_admissao_submeter
--    MESMA assinatura e retorno. Corpo de 20261202080000 com estas mudancas e
--    mais nenhuma: codigos com SQLSTATE HRA*, motivo exacto quando o convite
--    nao se consome, validacao do NIF/NISS pelo digito de controlo logo a
--    seguir ao consumo, duplicados com os pessoa_id no DETAIL, portao so pelos
--    campos de posicao convite.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_submeter(
  p_token_hash      text,
  p_dados           jsonb,
  p_assinatura_nome text,
  p_ip              inet,
  p_user_agent      text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_tecto constant integer := 10;
  v_pessoa_id  uuid;
  v_org        uuid;
  v_nif        text;
  v_niss       text;
  v_linha1     text;
  v_pais       text;
  v_principal  boolean;
  v_conta_num  text;
  v_conta_tit  text;
  v_conta_bco  text;
  v_conta_lin  record;
  v_secret_id  uuid;
  v_faltam     text[];
  v_lido       record;
  v_dup_nome1     text;
  v_dup_apelido   text;
  v_dup_nascim    date;
  v_dup_nif       text;
  v_dup_niss      text;
  v_dup_tipo      text;
  v_dup_numero    text;
  v_dup_email     text;
  v_ids_nif       text;
  v_ids_niss      text;
BEGIN
  IF jsonb_typeof(p_dados) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pessoas_convites_admissao
     WHERE token_hash = p_token_hash AND attempts >= c_tecto
  ) THEN
    RAISE EXCEPTION 'convite_bloqueado' USING ERRCODE = 'HRA05';
  END IF;

  UPDATE public.pessoas_convites_admissao
     SET used_at = now(),
         assinatura_nome = p_assinatura_nome,
         assinatura_ip = p_ip,
         assinatura_user_agent = p_user_agent,
         rascunho = NULL,
         -- Convite consumido: a ultima recusa (campos e fichas em conflito)
         -- deixa de fazer falta e nao fica guardada.
         ultima_recusa_codigo = NULL,
         ultima_recusa_em = NULL,
         ultima_recusa_campos = NULL,
         ultima_recusa_conflitos = NULL
   WHERE token_hash = p_token_hash
     AND used_at IS NULL
     AND revoked_at IS NULL
     AND valid_until > now()
  RETURNING pessoa_id, organization_id INTO v_pessoa_id, v_org;

  IF NOT FOUND THEN
    -- Dar o motivo exacto em vez de um convite_invalido para tudo.
    SELECT c.used_at, c.revoked_at, c.valid_until INTO v_lido
      FROM public.pessoas_convites_admissao c
     WHERE c.token_hash = p_token_hash;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'convite_invalido' USING ERRCODE = 'HRA01';
    ELSIF v_lido.used_at IS NOT NULL THEN
      RAISE EXCEPTION 'convite_ja_usado' USING ERRCODE = 'HRA02';
    ELSIF v_lido.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'convite_revogado' USING ERRCODE = 'HRA03';
    ELSIF v_lido.valid_until <= now() THEN
      RAISE EXCEPTION 'convite_expirado' USING ERRCODE = 'HRA04';
    END IF;
    RAISE EXCEPTION 'convite_invalido' USING ERRCODE = 'HRA01';
  END IF;

  -- NIF e NISS pelo digito de controlo, ANTES dos duplicados e de qualquer
  -- escrita. Substitui a antiga regex de formato.
  v_nif  := public.hr_json_texto(p_dados, 'nif');
  v_niss := public.hr_json_texto(p_dados, 'niss');

  IF v_nif IS NOT NULL AND NOT public.hr_nif_valido(v_nif) THEN
    RAISE EXCEPTION 'nif_invalido' USING ERRCODE = 'HRA11';
  END IF;
  IF v_niss IS NOT NULL AND NOT public.hr_niss_valido(v_niss) THEN
    RAISE EXCEPTION 'niss_invalido' USING ERRCODE = 'HRA12';
  END IF;

  SELECT
    p.primeiro_nome,
    p.apelido,
    coalesce(public.hr_json_texto(p_dados, 'email_pessoal'), p.email_pessoal),
    coalesce(public.hr_json_texto(p_dados, 'nif'), i.nif),
    coalesce(public.hr_json_texto(p_dados, 'niss'), i.niss),
    coalesce(public.hr_json_texto(p_dados, 'tipo_documento'), i.tipo_documento),
    coalesce(public.hr_json_texto(p_dados, 'numero_documento'), i.numero_documento),
    coalesce(public.hr_json_texto(p_dados, 'data_nascimento')::date, dp.data_nascimento)
    INTO v_dup_nome1, v_dup_apelido, v_dup_email, v_dup_nif, v_dup_niss,
         v_dup_tipo, v_dup_numero, v_dup_nascim
  FROM public.pessoas p
  LEFT JOIN public.pessoas_identificacao i ON i.pessoa_id = p.id
  LEFT JOIN public.pessoas_dados_pessoais dp ON dp.pessoa_id = p.id
  WHERE p.id = v_pessoa_id;

  -- Os pessoa_id em conflito ficam no DETAIL: so a Edge Function o le e NUNCA
  -- sai para o publico.
  SELECT
    string_agg(DISTINCT cand.pessoa_id::text, ',') FILTER (WHERE cand.campo_coincidente = 'nif'),
    string_agg(DISTINCT cand.pessoa_id::text, ',') FILTER (WHERE cand.campo_coincidente = 'niss')
    INTO v_ids_nif, v_ids_niss
  FROM public.hr_pessoa_duplicados_candidatos(
    v_org, v_dup_nif, v_dup_niss, v_dup_email, v_dup_tipo, v_dup_numero,
    v_dup_nome1, v_dup_apelido, v_dup_nascim, v_pessoa_id
  ) AS cand
  WHERE cand.forca = 'travao';

  IF v_ids_nif IS NOT NULL THEN
    RAISE EXCEPTION 'nif_ja_existe' USING ERRCODE = 'HRA13', DETAIL = v_ids_nif;
  END IF;
  IF v_ids_niss IS NOT NULL THEN
    RAISE EXCEPTION 'niss_ja_existe' USING ERRCODE = 'HRA14', DETAIL = v_ids_niss;
  END IF;

  PERFORM set_config('hr.origem_escrita', 'convite', true);

  IF p_dados ? 'email_pessoal' THEN
    UPDATE public.pessoas
       SET email_pessoal = public.hr_json_texto(p_dados, 'email_pessoal')
     WHERE id = v_pessoa_id;
  END IF;

  IF p_dados ?| ARRAY[
       'data_nascimento','genero','nacionalidade','telefone_pessoal','estado_civil',
       'dependentes','naturalidade_freguesia','naturalidade_concelho','naturalidade_pais',
       'conjuge_situacao_profissional','dependentes_deficientes',
       'habilitacao_academica','habilitacao_data_conclusao'
     ] THEN
    INSERT INTO public.pessoas_dados_pessoais (
      pessoa_id, organization_id,
      data_nascimento, genero, nacionalidade, estado_civil, dependentes,
      telefone_pessoal, naturalidade_freguesia, naturalidade_concelho, naturalidade_pais,
      conjuge_situacao_profissional, dependentes_deficientes,
      habilitacao_academica, habilitacao_data_conclusao
    ) VALUES (
      v_pessoa_id, v_org,
      public.hr_json_texto(p_dados, 'data_nascimento')::date,
      public.hr_json_texto(p_dados, 'genero'),
      upper(public.hr_json_texto(p_dados, 'nacionalidade')),
      public.hr_json_texto(p_dados, 'estado_civil'),
      public.hr_json_texto(p_dados, 'dependentes')::smallint,
      public.hr_json_texto(p_dados, 'telefone_pessoal'),
      public.hr_json_texto(p_dados, 'naturalidade_freguesia'),
      public.hr_json_texto(p_dados, 'naturalidade_concelho'),
      upper(public.hr_json_texto(p_dados, 'naturalidade_pais')),
      public.hr_json_texto(p_dados, 'conjuge_situacao_profissional'),
      public.hr_json_texto(p_dados, 'dependentes_deficientes')::smallint,
      public.hr_json_texto(p_dados, 'habilitacao_academica'),
      public.hr_json_texto(p_dados, 'habilitacao_data_conclusao')::date
    )
    ON CONFLICT (pessoa_id) DO UPDATE SET
      data_nascimento = CASE WHEN p_dados ? 'data_nascimento'
        THEN EXCLUDED.data_nascimento ELSE pessoas_dados_pessoais.data_nascimento END,
      genero = CASE WHEN p_dados ? 'genero'
        THEN EXCLUDED.genero ELSE pessoas_dados_pessoais.genero END,
      nacionalidade = CASE WHEN p_dados ? 'nacionalidade'
        THEN EXCLUDED.nacionalidade ELSE pessoas_dados_pessoais.nacionalidade END,
      estado_civil = CASE WHEN p_dados ? 'estado_civil'
        THEN EXCLUDED.estado_civil ELSE pessoas_dados_pessoais.estado_civil END,
      dependentes = CASE WHEN p_dados ? 'dependentes'
        THEN EXCLUDED.dependentes ELSE pessoas_dados_pessoais.dependentes END,
      telefone_pessoal = CASE WHEN p_dados ? 'telefone_pessoal'
        THEN EXCLUDED.telefone_pessoal ELSE pessoas_dados_pessoais.telefone_pessoal END,
      naturalidade_freguesia = CASE WHEN p_dados ? 'naturalidade_freguesia'
        THEN EXCLUDED.naturalidade_freguesia ELSE pessoas_dados_pessoais.naturalidade_freguesia END,
      naturalidade_concelho = CASE WHEN p_dados ? 'naturalidade_concelho'
        THEN EXCLUDED.naturalidade_concelho ELSE pessoas_dados_pessoais.naturalidade_concelho END,
      naturalidade_pais = CASE WHEN p_dados ? 'naturalidade_pais'
        THEN EXCLUDED.naturalidade_pais ELSE pessoas_dados_pessoais.naturalidade_pais END,
      conjuge_situacao_profissional = CASE WHEN p_dados ? 'conjuge_situacao_profissional'
        THEN EXCLUDED.conjuge_situacao_profissional ELSE pessoas_dados_pessoais.conjuge_situacao_profissional END,
      dependentes_deficientes = CASE WHEN p_dados ? 'dependentes_deficientes'
        THEN EXCLUDED.dependentes_deficientes ELSE pessoas_dados_pessoais.dependentes_deficientes END,
      habilitacao_academica = CASE WHEN p_dados ? 'habilitacao_academica'
        THEN EXCLUDED.habilitacao_academica ELSE pessoas_dados_pessoais.habilitacao_academica END,
      habilitacao_data_conclusao = CASE WHEN p_dados ? 'habilitacao_data_conclusao'
        THEN EXCLUDED.habilitacao_data_conclusao ELSE pessoas_dados_pessoais.habilitacao_data_conclusao END,
      updated_at = now();
  END IF;

  IF p_dados ?| ARRAY[
       'tipo_documento','numero_documento','validade_documento','nif','niss',
       'carta_conducao_numero','carta_conducao_categorias','carta_conducao_validade'
     ] THEN
    INSERT INTO public.pessoas_identificacao (
      pessoa_id, organization_id,
      tipo_documento, numero_documento, validade_documento, nif, niss,
      carta_conducao_numero, carta_conducao_categorias, carta_conducao_validade
    ) VALUES (
      v_pessoa_id, v_org,
      public.hr_json_texto(p_dados, 'tipo_documento'),
      public.hr_json_texto(p_dados, 'numero_documento'),
      public.hr_json_texto(p_dados, 'validade_documento')::date,
      public.hr_json_texto(p_dados, 'nif'),
      v_niss,
      public.hr_json_texto(p_dados, 'carta_conducao_numero'),
      public.hr_json_texto(p_dados, 'carta_conducao_categorias'),
      public.hr_json_texto(p_dados, 'carta_conducao_validade')::date
    )
    ON CONFLICT (pessoa_id) DO UPDATE SET
      tipo_documento = CASE WHEN p_dados ? 'tipo_documento'
        THEN EXCLUDED.tipo_documento ELSE pessoas_identificacao.tipo_documento END,
      numero_documento = CASE WHEN p_dados ? 'numero_documento'
        THEN EXCLUDED.numero_documento ELSE pessoas_identificacao.numero_documento END,
      validade_documento = CASE WHEN p_dados ? 'validade_documento'
        THEN EXCLUDED.validade_documento ELSE pessoas_identificacao.validade_documento END,
      nif = CASE WHEN p_dados ? 'nif'
        THEN EXCLUDED.nif ELSE pessoas_identificacao.nif END,
      niss = CASE WHEN p_dados ? 'niss'
        THEN EXCLUDED.niss ELSE pessoas_identificacao.niss END,
      carta_conducao_numero = CASE WHEN p_dados ? 'carta_conducao_numero'
        THEN EXCLUDED.carta_conducao_numero ELSE pessoas_identificacao.carta_conducao_numero END,
      carta_conducao_categorias = CASE WHEN p_dados ? 'carta_conducao_categorias'
        THEN EXCLUDED.carta_conducao_categorias ELSE pessoas_identificacao.carta_conducao_categorias END,
      carta_conducao_validade = CASE WHEN p_dados ? 'carta_conducao_validade'
        THEN EXCLUDED.carta_conducao_validade ELSE pessoas_identificacao.carta_conducao_validade END,
      updated_at = now();
  END IF;

  IF v_niss IS NOT NULL THEN
    PERFORM public.hr_registar_acesso_sensivel(v_pessoa_id, v_org, 'niss', 'alterar');
  END IF;

  v_linha1 := public.hr_json_texto(p_dados, 'morada_linha1');
  v_pais   := upper(public.hr_json_texto(p_dados, 'morada_pais'));

  IF v_pais IS NOT NULL AND v_pais !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'pais_invalido' USING ERRCODE = 'HRA15';
  END IF;

  IF p_dados ?| ARRAY[
       'morada_linha1','morada_linha2','morada_codigo_postal',
       'morada_localidade','morada_distrito','morada_pais'
     ] THEN
    UPDATE public.pessoas_moradas
       SET linha1 = CASE WHEN v_linha1 IS NOT NULL THEN v_linha1 ELSE pessoas_moradas.linha1 END,
           linha2 = CASE WHEN p_dados ? 'morada_linha2'
             THEN public.hr_json_texto(p_dados, 'morada_linha2') ELSE pessoas_moradas.linha2 END,
           codigo_postal = CASE WHEN p_dados ? 'morada_codigo_postal'
             THEN public.hr_json_texto(p_dados, 'morada_codigo_postal') ELSE pessoas_moradas.codigo_postal END,
           localidade = CASE WHEN p_dados ? 'morada_localidade'
             THEN public.hr_json_texto(p_dados, 'morada_localidade') ELSE pessoas_moradas.localidade END,
           distrito = CASE WHEN p_dados ? 'morada_distrito'
             THEN public.hr_json_texto(p_dados, 'morada_distrito') ELSE pessoas_moradas.distrito END,
           pais = CASE WHEN v_pais IS NOT NULL THEN v_pais ELSE pessoas_moradas.pais END,
           updated_at = now()
     WHERE pessoa_id = v_pessoa_id AND organization_id = v_org AND tipo = 'residencia';

    IF NOT FOUND AND v_linha1 IS NOT NULL THEN
      SELECT NOT EXISTS (
        SELECT 1 FROM public.pessoas_moradas
         WHERE pessoa_id = v_pessoa_id AND is_principal
      ) INTO v_principal;

      INSERT INTO public.pessoas_moradas (
        pessoa_id, organization_id, tipo, linha1, linha2,
        codigo_postal, localidade, distrito, pais, is_principal
      ) VALUES (
        v_pessoa_id, v_org, 'residencia',
        v_linha1,
        public.hr_json_texto(p_dados, 'morada_linha2'),
        public.hr_json_texto(p_dados, 'morada_codigo_postal'),
        public.hr_json_texto(p_dados, 'morada_localidade'),
        public.hr_json_texto(p_dados, 'morada_distrito'),
        coalesce(v_pais, 'PT'),
        v_principal
      );
    END IF;
  END IF;

  -- ---- pessoas_fardamento --------------------------------------------------
  IF p_dados ?| ARRAY[
       'tamanho_cima','tamanho_cima_detalhe','tamanho_baixo','tamanho_baixo_detalhe',
       'tamanho_calcado','tamanho_calcado_detalhe'
     ] THEN
    INSERT INTO public.pessoas_fardamento (
      pessoa_id, organization_id,
      tamanho_cima, tamanho_cima_detalhe, tamanho_baixo, tamanho_baixo_detalhe,
      tamanho_calcado, tamanho_calcado_detalhe
    ) VALUES (
      v_pessoa_id, v_org,
      public.hr_json_texto(p_dados, 'tamanho_cima'),
      public.hr_json_texto(p_dados, 'tamanho_cima_detalhe'),
      public.hr_json_texto(p_dados, 'tamanho_baixo'),
      public.hr_json_texto(p_dados, 'tamanho_baixo_detalhe'),
      public.hr_json_texto(p_dados, 'tamanho_calcado'),
      public.hr_json_texto(p_dados, 'tamanho_calcado_detalhe')
    )
    ON CONFLICT (pessoa_id, organization_id) DO UPDATE SET
      tamanho_cima = CASE WHEN p_dados ? 'tamanho_cima'
        THEN EXCLUDED.tamanho_cima ELSE pessoas_fardamento.tamanho_cima END,
      tamanho_cima_detalhe = CASE WHEN p_dados ? 'tamanho_cima_detalhe'
        THEN EXCLUDED.tamanho_cima_detalhe ELSE pessoas_fardamento.tamanho_cima_detalhe END,
      tamanho_baixo = CASE WHEN p_dados ? 'tamanho_baixo'
        THEN EXCLUDED.tamanho_baixo ELSE pessoas_fardamento.tamanho_baixo END,
      tamanho_baixo_detalhe = CASE WHEN p_dados ? 'tamanho_baixo_detalhe'
        THEN EXCLUDED.tamanho_baixo_detalhe ELSE pessoas_fardamento.tamanho_baixo_detalhe END,
      tamanho_calcado = CASE WHEN p_dados ? 'tamanho_calcado'
        THEN EXCLUDED.tamanho_calcado ELSE pessoas_fardamento.tamanho_calcado END,
      tamanho_calcado_detalhe = CASE WHEN p_dados ? 'tamanho_calcado_detalhe'
        THEN EXCLUDED.tamanho_calcado_detalhe ELSE pessoas_fardamento.tamanho_calcado_detalhe END,
      updated_at = now();
  END IF;

  -- Filiacao sindical deixou de se escrever por aqui (20261202080000).

  v_conta_num := public.hr_json_texto(p_dados, 'iban');
  v_conta_tit := public.hr_json_texto(p_dados, 'conta_titular');
  v_conta_bco := public.hr_json_texto(p_dados, 'conta_banco');

  IF v_conta_num IS NOT NULL THEN
    v_conta_num := upper(regexp_replace(v_conta_num, '[[:space:]]', '', 'g'));

    IF NOT public.hr_iban_valido(v_conta_num) THEN
      RAISE EXCEPTION 'iban_invalido' USING ERRCODE = 'HRA16';
    END IF;
  END IF;

  -- O portao: so trava o que a PESSOA tem de preencher no convite (origem
  -- pessoa, posicao convite). Os de posicao ficha NUNCA travam o convite.
  SELECT array_agg(pend.codigo ORDER BY pend.codigo)
    INTO v_faltam
    FROM public.hr_admissao_pendencias(v_pessoa_id) AS pend
   WHERE pend.origem = 'pessoa'
     AND pend.posicao = 'convite'
     AND NOT (pend.codigo = 'conta_numero'  AND v_conta_num IS NOT NULL)
     AND NOT (pend.codigo = 'conta_titular' AND v_conta_num IS NOT NULL AND v_conta_tit IS NOT NULL)
     AND NOT (pend.codigo = 'conta_banco'   AND v_conta_num IS NOT NULL AND v_conta_bco IS NOT NULL);

  IF v_faltam IS NOT NULL AND array_length(v_faltam, 1) > 0 THEN
    RAISE EXCEPTION 'admissao_incompleta' USING ERRCODE = 'HRA17', DETAIL = array_to_string(v_faltam, ',');
  END IF;

  IF v_conta_num IS NOT NULL THEN
    SELECT b.id, b.conta_secret_id INTO v_conta_lin
    FROM public.pessoas_dados_bancarios b
    WHERE b.pessoa_id = v_pessoa_id;

    IF v_conta_lin.id IS NOT NULL AND v_conta_lin.conta_secret_id IS NOT NULL THEN
      PERFORM vault.update_secret(v_conta_lin.conta_secret_id, v_conta_num);
      v_secret_id := v_conta_lin.conta_secret_id;
    ELSE
      v_secret_id := vault.create_secret(
        v_conta_num,
        'hr_conta:' || v_pessoa_id::text || ':' || gen_random_uuid()::text,
        'Conta bancaria de RH da pessoa ' || v_pessoa_id::text || ' (via convite de admissao)'
      );
    END IF;

    INSERT INTO public.pessoas_dados_bancarios (
      pessoa_id, organization_id, titular, banco, agencia, formato_conta,
      conta_secret_id, conta_ultimos4, conta_pais, swift, is_principal
    ) VALUES (
      v_pessoa_id, v_org,
      v_conta_tit,
      v_conta_bco,
      public.hr_json_texto(p_dados, 'conta_agencia'),
      'iban',
      v_secret_id, right(v_conta_num, 4), left(v_conta_num, 2),
      public.hr_json_texto(p_dados, 'conta_swift'), true
    )
    ON CONFLICT (pessoa_id) DO UPDATE SET
      titular = CASE WHEN v_conta_tit IS NOT NULL
        THEN EXCLUDED.titular ELSE pessoas_dados_bancarios.titular END,
      banco = CASE WHEN v_conta_bco IS NOT NULL
        THEN EXCLUDED.banco ELSE pessoas_dados_bancarios.banco END,
      agencia = CASE WHEN p_dados ? 'conta_agencia'
        THEN EXCLUDED.agencia ELSE pessoas_dados_bancarios.agencia END,
      formato_conta = EXCLUDED.formato_conta,
      conta_secret_id = EXCLUDED.conta_secret_id,
      conta_ultimos4 = EXCLUDED.conta_ultimos4,
      conta_pais = EXCLUDED.conta_pais,
      swift = CASE WHEN p_dados ? 'conta_swift'
        THEN EXCLUDED.swift ELSE pessoas_dados_bancarios.swift END,
      updated_at = now();

    PERFORM public.hr_registar_acesso_sensivel(v_pessoa_id, v_org, 'conta_bancaria', 'alterar');
  END IF;

  RETURN v_pessoa_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text) IS
'Submissao final do convite de admissao. SO service_role. Corpo de 20261202080000 com: codigos de erro com SQLSTATE proprio HRA* (a MESSAGE e o codigo); motivo exacto quando o convite nao se consome (convite_invalido, _ja_usado, _revogado, _expirado); NIF e NISS validados pelo digito de controlo logo a seguir ao consumo; duplicados com os pessoa_id no DETAIL (so a Edge Function o le); portao so pelos campos de origem pessoa e posicao convite, com os codigos em falta no DETAIL de admissao_incompleta. Tudo ou nada: qualquer RAISE desfaz o consumo do convite, as escritas e o segredo criado no Vault. Ver 20261210030000.';

-- ==============================================================================
-- 8. Limpeza dos rascunhos abandonados (RGPD): tarefa pg_cron SQL-only
--    Porque pg_cron e nao limpeza oportunista: uma limpeza que so corresse
--    quando alguem abre um convite deixaria para sempre os rascunhos dos
--    convites abandonados, que sao precisamente os que o RGPD manda apagar.
--    O projecto ja usa este padrao (purge_old_account_changes).
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_convites_admissao_limpar()
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_carencia constant interval := interval '7 days';
  v_n integer;
BEGIN
  -- Rascunho de um convite nunca usado, expirado ou revogado ha mais de 7
  -- dias. Ate la fica, para o reenvio o poder herdar.
  UPDATE public.pessoas_convites_admissao
     SET rascunho = NULL
   WHERE used_at IS NULL
     AND rascunho IS NOT NULL
     AND (valid_until < now() - c_carencia
          OR (revoked_at IS NOT NULL AND revoked_at < now() - c_carencia));

  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- RGPD: o registo da ultima recusa (campos em falta e ids das fichas em
  -- conflito) tambem nao fica para sempre: apaga-se quando o convite foi
  -- usado, ou expirou ou foi revogado ha mais de 7 dias.
  UPDATE public.pessoas_convites_admissao
     SET ultima_recusa_campos    = NULL,
         ultima_recusa_conflitos = NULL
   WHERE (ultima_recusa_campos IS NOT NULL OR ultima_recusa_conflitos IS NOT NULL)
     AND (used_at IS NOT NULL
          OR valid_until < now() - c_carencia
          OR (revoked_at IS NOT NULL AND revoked_at < now() - c_carencia));

  -- GANCHO: o lote dos anexos acrescenta aqui a remocao dos ficheiros
  -- carregados para estes convites.

  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_convites_admissao_limpar() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_convites_admissao_limpar() FROM anon;
REVOKE ALL ON FUNCTION public.hr_convites_admissao_limpar() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_convites_admissao_limpar() TO service_role;

COMMENT ON FUNCTION public.hr_convites_admissao_limpar() IS
'Apaga o rascunho dos convites de admissao nunca usados que expiraram ou foram revogados ha mais de 7 dias, e o registo da ultima recusa (campos e fichas em conflito) dos convites usados ou expirados/revogados ha mais de 7 dias. Devolve o numero de convites com rascunho limpos. Corre todos os dias as 03:40 por pg_cron (job hr-convites-admissao-limpar). SO service_role.';

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('hr-convites-admissao-limpar')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hr-convites-admissao-limpar');

    PERFORM cron.schedule(
      'hr-convites-admissao-limpar',
      '40 3 * * *',
      $job$SELECT public.hr_convites_admissao_limpar()$job$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Nao se engole em silencio: o NOTICE explica, e o CONFERIR FALHA a migration
  -- se o pg_cron existe e o job nao ficou agendado.
  RAISE NOTICE 'pg_cron: nao foi possivel agendar hr-convites-admissao-limpar (%).', SQLERRM;
END;
$cron$;

-- ==============================================================================
-- Conferir
-- ==============================================================================
DO $conferir$
DECLARE
  v_col     text;
  v_excepcao text[] := ARRAY['token_hash', 'rascunho', 'ultima_recusa_conflitos'];
  v_corpo   text;
  v_cron    boolean;
BEGIN
  -- 1. A regra da tabela: tudo menos token_hash, rascunho e
  --    ultima_recusa_conflitos tem SELECT para authenticated; essas tres
  --    continuam fechadas. Uma coluna nova sem
  --    grant ficaria invisivel em silencio.
  FOR v_col IN
    SELECT a.attname FROM pg_attribute a
     WHERE a.attrelid = 'public.pessoas_convites_admissao'::regclass
       AND a.attnum > 0 AND NOT a.attisdropped
  LOOP
    IF v_col = ANY (v_excepcao) THEN
      IF has_column_privilege('authenticated', 'public.pessoas_convites_admissao', v_col, 'SELECT') THEN
        RAISE EXCEPTION 'authenticated consegue ler %, que devia estar excluida por grant de coluna.', v_col;
      END IF;
    ELSIF NOT has_column_privilege('authenticated', 'public.pessoas_convites_admissao', v_col, 'SELECT') THEN
      RAISE EXCEPTION 'A coluna % de pessoas_convites_admissao nao tem SELECT para authenticated e nao esta em {token_hash, rascunho, ultima_recusa_conflitos}.', v_col;
    END IF;
  END LOOP;

  IF has_table_privilege('authenticated', 'public.pessoas_convites_admissao', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pessoas_convites_admissao', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.pessoas_convites_admissao', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated tem escrita de tabela em pessoas_convites_admissao.';
  END IF;

  -- 2. Privilegios: so service_role.
  IF has_function_privilege('authenticated', 'public.rpc_hr_convite_admissao_registar_envio(uuid, boolean, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_convite_admissao_registar_envio(uuid, boolean, text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.rpc_hr_convite_admissao_registar_envio(uuid, boolean, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'registar_envio tem de ser so service_role.';
  END IF;
  IF has_function_privilege('authenticated', 'public.rpc_hr_convite_admissao_registar_recusa(text, text, text[], uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_convite_admissao_registar_recusa(text, text, text[], uuid[])', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.rpc_hr_convite_admissao_registar_recusa(text, text, text[], uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'registar_recusa tem de ser so service_role.';
  END IF;
  IF has_function_privilege('authenticated', 'public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'submeter tem de ser so service_role.';
  END IF;
  IF has_function_privilege('authenticated', 'public.rpc_hr_convite_admissao_estado(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_convite_admissao_estado(text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.rpc_hr_convite_admissao_estado(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'estado tem de ser so service_role.';
  END IF;
  IF has_function_privilege('authenticated', 'public.hr_convites_admissao_limpar()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.hr_convites_admissao_limpar()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.hr_convites_admissao_limpar()', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_convites_admissao_limpar tem de ser so service_role.';
  END IF;
  IF has_function_privilege('authenticated', 'public.hr_admissao_campos_obrigatorios_org(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.hr_admissao_campos_obrigatorios_org(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios_org tem de ser so service_role.';
  END IF;

  -- criar: so service_role, e a de 4 argumentos (aberta a authenticated) ja nao existe.
  IF to_regprocedure('public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text)') IS NOT NULL THEN
    RAISE EXCEPTION 'criar: a versao de 4 argumentos (aberta a authenticated) ainda existe.';
  END IF;
  IF has_function_privilege('authenticated', 'public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'criar tem de ser so service_role (authenticated pode herdar o rascunho de outra pessoa).';
  END IF;

  -- authenticated + service_role, nunca anon.
  IF NOT has_function_privilege('authenticated', 'public.rpc_hr_convite_admissao_resumo(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.rpc_hr_convite_admissao_resumo(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_convite_admissao_resumo(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'resumo: privilegios errados.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rpc_hr_convite_admissao_conflitos(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.rpc_hr_convite_admissao_conflitos(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_convite_admissao_conflitos(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'conflitos: privilegios errados.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rpc_hr_admissao_campos_obrigatorios_org(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.rpc_hr_admissao_campos_obrigatorios_org(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_admissao_campos_obrigatorios_org(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_hr_admissao_campos_obrigatorios_org (wrapper): privilegios errados.';
  END IF;

  -- 3. O corpo de submeter.
  SELECT pg_get_functiondef('public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)'::regprocedure)
    INTO v_corpo;

  IF v_corpo NOT LIKE '%HRA17%' OR v_corpo NOT LIKE '%hr_nif_valido%'
     OR v_corpo NOT LIKE '%posicao = ''convite''%' THEN
    RAISE EXCEPTION 'submeter nao tem HRA17, hr_nif_valido e o filtro posicao = convite.';
  END IF;
  IF v_corpo LIKE '%admissao_incompleta: %%' THEN
    RAISE EXCEPTION 'submeter ainda lanca o formato legado admissao_incompleta: lista.';
  END IF;
  -- A lista branca de 20261127030000: o convite nao toca nestas areas.
  IF v_corpo ILIKE '%retribuic%' OR v_corpo ILIKE '%vinculo%' OR v_corpo ILIKE '%membership%'
     OR v_corpo ILIKE '%permission%' OR v_corpo ILIKE '%pessoas_contas%' THEN
    RAISE EXCEPTION 'submeter referencia uma area fora da lista branca do convite.';
  END IF;

  -- 4. criar herda o rascunho e verifica a permissao do p_actor.
  SELECT pg_get_functiondef('public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid)'::regprocedure)
    INTO v_corpo;
  IF v_corpo NOT LIKE '%rascunho%' THEN
    RAISE EXCEPTION 'criar nao trata o rascunho.';
  END IF;
  IF v_corpo NOT LIKE '%p_actor%' OR v_corpo NOT LIKE '%hr.pessoas.convite.enviar%'
     OR v_corpo LIKE '%auth.uid()%' THEN
    RAISE EXCEPTION 'criar tem de verificar hr.pessoas.convite.enviar sobre p_actor e nao usar auth.uid().';
  END IF;

  -- 4b. resumo e conflitos exigem a permissao de identificacao.
  SELECT pg_get_functiondef('public.rpc_hr_convite_admissao_resumo(uuid)'::regprocedure) INTO v_corpo;
  IF v_corpo NOT LIKE '%hr.pessoas.identificacao.view%' THEN
    RAISE EXCEPTION 'resumo nao tem o gate hr.pessoas.identificacao.view.';
  END IF;
  SELECT pg_get_functiondef('public.rpc_hr_convite_admissao_conflitos(uuid)'::regprocedure) INTO v_corpo;
  IF v_corpo NOT LIKE '%hr.pessoas.identificacao.view%' THEN
    RAISE EXCEPTION 'conflitos nao tem o gate hr.pessoas.identificacao.view.';
  END IF;

  -- 4c. A limpeza apaga tambem o registo da ultima recusa.
  SELECT pg_get_functiondef('public.hr_convites_admissao_limpar()'::regprocedure) INTO v_corpo;
  IF v_corpo NOT LIKE '%ultima_recusa_conflitos%' THEN
    RAISE EXCEPTION 'hr_convites_admissao_limpar nao apaga ultima_recusa_conflitos.';
  END IF;

  -- 4d. submeter EXECUTADA com um token inexistente: tem de dar HRA01. Prova
  --     que o corpo corre (o plpgsql so valida o resto ao executar).
  BEGIN
    PERFORM public.rpc_hr_convite_admissao_submeter(
      'conferir-token-inexistente', '{}'::jsonb, NULL, NULL, NULL);
    RAISE EXCEPTION 'submeter aceitou um token inexistente.';
  EXCEPTION
    WHEN SQLSTATE 'HRA01' THEN
      NULL; -- esperado: convite_invalido
  END;

  -- 5. A tarefa de limpeza. Com pg_cron instalado, o job TEM de existir; sem
  --    pg_cron o job nao foi agendado: fica como pendencia (ver ANTES DO db push).
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hr-convites-admissao-limpar') INTO v_cron;
    IF NOT v_cron THEN
      RAISE EXCEPTION 'pg_cron existe mas o job hr-convites-admissao-limpar nao ficou agendado: os rascunhos abandonados nunca seriam apagados (RGPD).';
    END IF;
  ELSE
    RAISE NOTICE 'PENDENCIA: pg_cron nao esta instalado, o job hr-convites-admissao-limpar NAO foi agendado. Registar em POR FAZER e agendar quando houver pg_cron: os rascunhos abandonados nao sao apagados ate la.';
  END IF;

  RAISE NOTICE 'OK: colunas novas com grants por coluna, privilegios das funcoes, submeter com codigos HRA*, criar so service_role com heranca do rascunho, resumo e conflitos com o gate de identificacao, submeter executada (HRA01) e limpeza diaria confirmados.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. PRECISA das Edge Functions convite-admissao e criar-acesso-pessoa novas,
--    publicadas logo a seguir (ver o cabecalho).
-- 2. NAO fazer push a partir de um worktree que nao esteja reconciliado com o
--    remoto: foi medido (so leitura) que ha muitas migrations so locais (a base
--    de RH 20261120010000 a 20261201290000 e 20261202080000) e centenas so no
--    remoto (20261203010000 a 20261207022300). Reconciliar com o ramo que as
--    tem e voltar a listar `supabase migration list --linked`. Confirmar com
--    pg_get_functiondef no remoto que o corpo VIGENTE de
--    rpc_hr_convite_admissao_submeter, rpc_hr_convite_admissao_estado,
--    hr_admissao_pendencias e rpc_hr_convite_admissao_criar e a base destas
--    migrations (podem ter versoes mais recentes vindas de outros ramos).
--    Listar o que esta pendente imediatamente antes do push. Esta migration
--    depende das duas anteriores.
-- 3. O codigo da aplicacao (hook, ecra de configuracao, errosAdmissao.ts)
--    e a Edge Function convite-admissao (chama criar com a chave de servico e
--    p_actor; ver o cabecalho) entram no mesmo commit das migrations. SEM a
--    Edge nova, o envio de convites para de funcionar no instante do push (a
--    RPC de 4 argumentos deixa de existir).
-- 4. pg_cron: verificar por leitura, antes do push, se esta instalado no
--    remoto e como purge_old_account_changes foi agendado. Sem pg_cron o
--    conferir so avisa (NOTICE) e a limpeza dos rascunhos fica POR AGENDAR,
--    pendencia a registar. Com pg_cron e sem job, a migration FALHA.
-- 5. Ficheiro com mais de 800 linhas, mantido assim de proposito (decisao:
--    nao dividir as migrations do lote A).
-- ==============================================================================
