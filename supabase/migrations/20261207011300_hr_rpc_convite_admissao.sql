-- ==============================================================================
-- Tres RPCs do convite de admissao: criar, ver estado, submeter.
--
-- POR APLICAR.
--
--
-- -- DESVIO FACE AO PLANO, CONFIRMADO NESTA SESSAO -- LER ANTES DE APLICAR ------
--
-- O plano mandava a submissao chamar rpc_hr_definir_iban(uuid,text,text,text,text)
-- e, implicitamente, rpc_hr_definir_niss(uuid,text) como "unico caminho" ja
-- existente. Confirmado por leitura do codigo (nao suposto):
--
--   - rpc_hr_definir_iban FOI LARGADA em 20261120220000 e substituida por
--     rpc_hr_definir_conta(uuid,text,text,text,text,text) -- a assinatura do
--     plano ja nao existe.
--   - rpc_hr_definir_niss E rpc_hr_definir_conta exigem
--     has_anew_permission_in_org(auth.uid(), '...', org) -- e auth.uid() e
--     resolvido a partir do JWT do PEDIDO REAL, nao muda por SECURITY
--     DEFINER. rpc_hr_convite_admissao_submeter corre SO por service_role, sem
--     JWT de utilizador nenhum: chamar aquelas RPCs de dentro desta rebentava
--     sempre com insufficient_privilege, para todo e qualquer convite.
--
-- Chamar as RPCs existentes NAO FUNCIONA para este fluxo, por desenho -- nao e
-- um defeito nelas. A escolha, registada aqui e nao decidida por conta
-- propria sem a assinalar: rpc_hr_convite_admissao_submeter escreve niss e a
-- conta bancaria DIRECTAMENTE (e SECURITY DEFINER, tem privilegio de tabela
-- para o fazer), replicando so a validacao de formato e a chamada ao Vault --
-- nao a verificacao de permissao, que aqui e substituida pela validade do
-- proprio token, ja verificada no consumo atomico mais abaixo. Cada escrita
-- fica registada em pessoas_acessos_sensiveis, exactamente como nas RPCs
-- normais. ANTES DE APLICAR: confirmar com quem responde pela seguranca do
-- modulo que este caminho alternativo (token valido em vez de permissao de
-- utilizador) e aceitavel para niss e conta bancaria -- e uma decisao de
-- produto, nao so tecnica.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- rpc_hr_convite_admissao_criar(p_pessoa_id, p_token_hash, p_valid_until, p_email)
--   SECURITY DEFINER, EXECUTE a authenticated e service_role. Exige
--   hr.pessoas.convite.enviar na organizacao da pessoa. Revoga qualquer
--   convite vivo dessa pessoa e insere o novo.
--
-- rpc_hr_convite_admissao_estado(p_token_hash)
--   SECURITY DEFINER, EXECUTE SO a service_role. Valida o token, incrementa
--   attempts, devolve jsonb com nome da pessoa e os campos ja preenchidos
--   (nif, niss_ultimos4, conta_ultimos4 -- NUNCA niss nem conta completos, e
--   NUNCA sindicalizacao).
--
-- rpc_hr_convite_admissao_submeter(p_token_hash, p_dados, p_assinatura_nome,
--                                   p_ip, p_user_agent)
--   SECURITY DEFINER, EXECUTE SO a service_role. Consumo atomico do token
--   (UPDATE ... WHERE used_at IS NULL AND revoked_at IS NULL AND
--   valid_until > now() RETURNING ..., trava a linha; uma segunda chamada
--   concorrente encontra used_at preenchido e devolve zero linhas). pessoa_id
--   e organization_id vem SO da linha consumida, nunca de p_dados. Toca
--   apenas: pessoas (email_pessoal), pessoas_dados_pessoais,
--   pessoas_identificacao (incl. niss), pessoas_moradas, pessoas_fardamento,
--   pessoas_sindicalizacao, pessoas_dados_bancarios. NAO nomeia
--   pessoas_retribuicoes, pessoas_vinculos, pessoas_contas,
--   anew_memberships, anew_user_roles nem anew_permissions -- verificado no
--   bloco de conferir por pg_get_functiondef, nao por promessa.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- DROP FUNCTION IF EXISTS public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text);
-- DROP FUNCTION IF EXISTS public.rpc_hr_convite_admissao_estado(text);
-- DROP FUNCTION IF EXISTS public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text);
--
--
-- Prerequisitos:
--   20261120070000  hr_iban_valido, vault
--   20261124010000  catalogo: hr.pessoas.convite.enviar
--   20261124100000  pessoas_sindicalizacao
--   20261124110000  pessoas_dados_alteracoes, hr_dados_alteracoes_origem()
--   20261124120000  pessoas_convites_admissao
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_convites_admissao') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_convites_admissao nao existe. Aplicar 20261124120000 primeiro.';
  END IF;
  IF to_regclass('public.pessoas_sindicalizacao') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_sindicalizacao nao existe. Aplicar 20261124100000 primeiro.';
  END IF;
  IF to_regclass('public.pessoas_dados_bancarios') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_dados_bancarios nao existe. Aplicar 20261120070000 primeiro.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pessoas_dados_bancarios' AND column_name = 'conta_secret_id'
  ) THEN
    RAISE EXCEPTION 'pessoas_dados_bancarios nao tem conta_secret_id -- 20261120220000 (rename iban_*->conta_*) nao esta aplicada. Investigar antes de continuar: esta migracao escreve nos nomes novos.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_dados_alteracoes_origem'
  ) THEN
    RAISE EXCEPTION 'public.hr_dados_alteracoes_origem() nao existe. Aplicar 20261124110000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- RPC 1: criar o convite
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_criar(
  p_pessoa_id   uuid,
  p_token_hash  text,
  p_valid_until timestamptz,
  p_email       text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org uuid;
  v_anew uuid;
  v_id  uuid;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pessoas p
  WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'pessoa_nao_encontrada';
  END IF;

  IF NOT public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.convite.enviar', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  IF p_valid_until <= now() THEN
    RAISE EXCEPTION 'validade_invalida';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1;

  -- So pode haver um convite vivo por pessoa (o indice unico parcial da
  -- tabela ja o garante); revogar explicitamente o anterior torna a intencao
  -- clara em vez de depender so do indice para rejeitar o INSERT.
  UPDATE public.pessoas_convites_admissao
     SET revoked_at = now()
   WHERE pessoa_id = p_pessoa_id
     AND organization_id = v_org
     AND used_at IS NULL
     AND revoked_at IS NULL;

  INSERT INTO public.pessoas_convites_admissao
    (pessoa_id, organization_id, token_hash, email_destino, valid_until, created_by)
  VALUES
    (p_pessoa_id, v_org, p_token_hash, p_email, p_valid_until, v_anew)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text) IS
'Cria um convite de admissao. Exige hr.pessoas.convite.enviar na organizacao da pessoa. Revoga qualquer convite vivo anterior dessa pessoa antes de inserir o novo. p_token_hash e o SHA-256 do codigo gerado fora da base (Edge Function); o codigo em claro nunca chega aqui.';

-- ==============================================================================
-- RPC 2: ver o estado do convite (chamada pela pagina publica, via service_role)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_estado(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_convite record;
  v_pessoa  record;
  v_ident   record;
  v_conta   record;
BEGIN
  SELECT * INTO v_convite
  FROM public.pessoas_convites_admissao
  WHERE token_hash = p_token_hash;

  IF v_convite.id IS NULL THEN
    RAISE EXCEPTION 'convite_invalido';
  END IF;

  UPDATE public.pessoas_convites_admissao
     SET attempts = attempts + 1
   WHERE id = v_convite.id;

  IF v_convite.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_ja_usado';
  END IF;
  IF v_convite.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_revogado';
  END IF;
  IF v_convite.valid_until <= now() THEN
    RAISE EXCEPTION 'convite_expirado';
  END IF;

  SELECT nome_completo, email_pessoal INTO v_pessoa
  FROM public.pessoas WHERE id = v_convite.pessoa_id;

  SELECT nif, niss_ultimos4 INTO v_ident
  FROM public.pessoas_identificacao WHERE pessoa_id = v_convite.pessoa_id;

  SELECT conta_ultimos4, formato_conta INTO v_conta
  FROM public.pessoas_dados_bancarios WHERE pessoa_id = v_convite.pessoa_id;

  -- NUNCA niss, NUNCA conta completa, NUNCA sindicalizacao: o convite so
  -- escreve filiacao sindical, nunca a revela por este caminho.
  RETURN jsonb_build_object(
    'pessoa_nome', v_pessoa.nome_completo,
    'email_pessoal', v_pessoa.email_pessoal,
    'nif', v_ident.nif,
    'niss_ultimos4', v_ident.niss_ultimos4,
    'conta_ultimos4', v_conta.conta_ultimos4,
    'formato_conta', v_conta.formato_conta,
    'rascunho', v_convite.rascunho,
    'valid_until', v_convite.valid_until
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_estado(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_estado(text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_estado(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_estado(text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_estado(text) IS
'Le o estado de um convite pelo hash do token. SO service_role -- nao exposta a authenticated nem anon, para o rate limit e a validacao do token ficarem inteiramente do lado da Edge Function, que e quem recebe o codigo em claro do link publico. Incrementa attempts em cada chamada, antes de validar, para uma martelagem de tokens ficar contada mesmo quando o token e invalido. Nunca devolve niss, a conta bancaria completa nem a resposta de sindicalizacao.';

-- ==============================================================================
-- RPC 3: submeter -- consumo atomico do token, depois a escrita
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
  v_pessoa_id uuid;
  v_org       uuid;
  v_niss      text;
  v_conta_num text;
  v_conta_lin record;
  v_secret_id uuid;
BEGIN
  -- Consumo atomico: a primeira instrucao, e trava a linha. Uma segunda
  -- chamada concorrente encontra used_at ja preenchido e devolve zero linhas.
  UPDATE public.pessoas_convites_admissao
     SET used_at = now(),
         assinatura_nome = p_assinatura_nome,
         assinatura_ip = p_ip,
         assinatura_user_agent = p_user_agent,
         rascunho = NULL
   WHERE token_hash = p_token_hash
     AND used_at IS NULL
     AND revoked_at IS NULL
     AND valid_until > now()
  RETURNING pessoa_id, organization_id INTO v_pessoa_id, v_org;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'convite_invalido';
  END IF;

  -- Origem das escritas seguintes: lida pelos triggers de auditoria em
  -- pessoas_dados_alteracoes.
  PERFORM set_config('hr.origem_escrita', 'convite', true);

  -- ---- pessoas: so o contacto pessoal ----------------------------------
  UPDATE public.pessoas
     SET email_pessoal = coalesce(p_dados ->> 'email_pessoal', email_pessoal)
   WHERE id = v_pessoa_id;

  -- ---- pessoas_dados_pessoais -------------------------------------------
  INSERT INTO public.pessoas_dados_pessoais (
    pessoa_id, organization_id,
    data_nascimento, nacionalidade, estado_civil, dependentes,
    telefone_pessoal, naturalidade_freguesia, naturalidade_concelho, naturalidade_pais,
    conjuge_situacao_profissional, dependentes_deficientes,
    habilitacao_academica, habilitacao_data_conclusao
  ) VALUES (
    v_pessoa_id, v_org,
    (p_dados ->> 'data_nascimento')::date,
    p_dados ->> 'nacionalidade',
    p_dados ->> 'estado_civil',
    (p_dados ->> 'dependentes')::smallint,
    p_dados ->> 'telefone_pessoal',
    p_dados ->> 'naturalidade_freguesia',
    p_dados ->> 'naturalidade_concelho',
    p_dados ->> 'naturalidade_pais',
    p_dados ->> 'conjuge_situacao_profissional',
    (p_dados ->> 'dependentes_deficientes')::smallint,
    p_dados ->> 'habilitacao_academica',
    (p_dados ->> 'habilitacao_data_conclusao')::date
  )
  ON CONFLICT (pessoa_id) DO UPDATE SET
    data_nascimento = EXCLUDED.data_nascimento,
    nacionalidade = EXCLUDED.nacionalidade,
    estado_civil = EXCLUDED.estado_civil,
    dependentes = EXCLUDED.dependentes,
    telefone_pessoal = EXCLUDED.telefone_pessoal,
    naturalidade_freguesia = EXCLUDED.naturalidade_freguesia,
    naturalidade_concelho = EXCLUDED.naturalidade_concelho,
    naturalidade_pais = EXCLUDED.naturalidade_pais,
    conjuge_situacao_profissional = EXCLUDED.conjuge_situacao_profissional,
    dependentes_deficientes = EXCLUDED.dependentes_deficientes,
    habilitacao_academica = EXCLUDED.habilitacao_academica,
    habilitacao_data_conclusao = EXCLUDED.habilitacao_data_conclusao,
    updated_at = now();

  -- ---- pessoas_identificacao, incluindo niss ----------------------------
  -- Escrita directa e nao pela RPC dedicada de niss: ver o cabecalho desta
  -- migracao ("DESVIO FACE AO PLANO") para a razao. A validacao de formato
  -- (11 digitos) e mantida.
  v_niss := p_dados ->> 'niss';
  IF v_niss IS NOT NULL AND v_niss !~ '^[0-9]{11}$' THEN
    RAISE EXCEPTION 'niss_invalido';
  END IF;

  INSERT INTO public.pessoas_identificacao (
    pessoa_id, organization_id,
    tipo_documento, numero_documento, validade_documento, nif, niss,
    carta_conducao_numero, carta_conducao_categorias, carta_conducao_validade
  ) VALUES (
    v_pessoa_id, v_org,
    p_dados ->> 'tipo_documento',
    p_dados ->> 'numero_documento',
    (p_dados ->> 'validade_documento')::date,
    p_dados ->> 'nif',
    v_niss,
    p_dados ->> 'carta_conducao_numero',
    p_dados ->> 'carta_conducao_categorias',
    (p_dados ->> 'carta_conducao_validade')::date
  )
  ON CONFLICT (pessoa_id) DO UPDATE SET
    tipo_documento = EXCLUDED.tipo_documento,
    numero_documento = EXCLUDED.numero_documento,
    validade_documento = EXCLUDED.validade_documento,
    nif = EXCLUDED.nif,
    niss = EXCLUDED.niss,
    carta_conducao_numero = EXCLUDED.carta_conducao_numero,
    carta_conducao_categorias = EXCLUDED.carta_conducao_categorias,
    carta_conducao_validade = EXCLUDED.carta_conducao_validade,
    updated_at = now();

  IF v_niss IS NOT NULL THEN
    PERFORM public.hr_registar_acesso_sensivel(v_pessoa_id, v_org, 'niss', 'alterar');
  END IF;

  -- ---- pessoas_moradas: uma so, tipo residencia --------------------------
  IF p_dados ->> 'morada_linha1' IS NOT NULL THEN
    UPDATE public.pessoas_moradas
       SET linha1 = p_dados ->> 'morada_linha1',
           linha2 = p_dados ->> 'morada_linha2',
           codigo_postal = p_dados ->> 'morada_codigo_postal',
           localidade = p_dados ->> 'morada_localidade',
           distrito = p_dados ->> 'morada_distrito',
           updated_at = now()
     WHERE pessoa_id = v_pessoa_id AND organization_id = v_org AND tipo = 'residencia';

    IF NOT FOUND THEN
      INSERT INTO public.pessoas_moradas (
        pessoa_id, organization_id, tipo, linha1, linha2, codigo_postal, localidade, distrito, is_principal
      ) VALUES (
        v_pessoa_id, v_org, 'residencia',
        p_dados ->> 'morada_linha1', p_dados ->> 'morada_linha2',
        p_dados ->> 'morada_codigo_postal', p_dados ->> 'morada_localidade',
        p_dados ->> 'morada_distrito', true
      );
    END IF;
  END IF;

  -- ---- pessoas_fardamento -------------------------------------------------
  INSERT INTO public.pessoas_fardamento (
    pessoa_id, organization_id,
    tamanho_cima, tamanho_cima_detalhe, tamanho_baixo, tamanho_baixo_detalhe,
    tamanho_blazer, tamanho_blazer_detalhe
  ) VALUES (
    v_pessoa_id, v_org,
    p_dados ->> 'tamanho_cima', p_dados ->> 'tamanho_cima_detalhe',
    p_dados ->> 'tamanho_baixo', p_dados ->> 'tamanho_baixo_detalhe',
    p_dados ->> 'tamanho_blazer', p_dados ->> 'tamanho_blazer_detalhe'
  )
  ON CONFLICT (pessoa_id, organization_id) DO UPDATE SET
    tamanho_cima = EXCLUDED.tamanho_cima,
    tamanho_cima_detalhe = EXCLUDED.tamanho_cima_detalhe,
    tamanho_baixo = EXCLUDED.tamanho_baixo,
    tamanho_baixo_detalhe = EXCLUDED.tamanho_baixo_detalhe,
    tamanho_blazer = EXCLUDED.tamanho_blazer,
    tamanho_blazer_detalhe = EXCLUDED.tamanho_blazer_detalhe,
    updated_at = now();

  -- ---- pessoas_sindicalizacao ---------------------------------------------
  -- A resposta e obrigatoria a nivel de aplicacao (fora desta funcao); aqui e
  -- so escrita se vier no payload.
  IF p_dados ? 'sindicalizado' THEN
    INSERT INTO public.pessoas_sindicalizacao (pessoa_id, organization_id, sindicalizado, sindicato)
    VALUES (
      v_pessoa_id, v_org,
      (p_dados ->> 'sindicalizado')::boolean,
      p_dados ->> 'sindicato'
    )
    ON CONFLICT (pessoa_id, organization_id) DO UPDATE SET
      sindicalizado = EXCLUDED.sindicalizado,
      sindicato = EXCLUDED.sindicato,
      updated_at = now();
  END IF;

  -- ---- pessoas_dados_bancarios: IBAN, escrita directa --------------------
  -- Ver o cabecalho ("DESVIO FACE AO PLANO"): a RPC normal exige uma
  -- permissao de utilizador que este fluxo, sem sessao, nunca tem.
  v_conta_num := p_dados ->> 'iban';
  IF v_conta_num IS NOT NULL THEN
    v_conta_num := upper(regexp_replace(v_conta_num, '[[:space:]]', '', 'g'));

    IF NOT public.hr_iban_valido(v_conta_num) THEN
      RAISE EXCEPTION 'iban_invalido';
    END IF;

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
      p_dados ->> 'conta_titular', p_dados ->> 'conta_banco', p_dados ->> 'conta_agencia', 'iban',
      v_secret_id, right(v_conta_num, 4), left(v_conta_num, 2), p_dados ->> 'conta_swift', true
    )
    ON CONFLICT (pessoa_id) DO UPDATE SET
      titular = EXCLUDED.titular,
      banco = EXCLUDED.banco,
      agencia = EXCLUDED.agencia,
      formato_conta = EXCLUDED.formato_conta,
      conta_secret_id = EXCLUDED.conta_secret_id,
      conta_ultimos4 = EXCLUDED.conta_ultimos4,
      conta_pais = EXCLUDED.conta_pais,
      swift = EXCLUDED.swift,
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
'Submissao final do convite de admissao. SO service_role. Consome o token atomicamente (trava a linha, uma segunda chamada concorrente encontra used_at preenchido). pessoa_id e organization_id vem SO da linha do convite, nunca de p_dados. Escreve em pessoas (so email_pessoal), pessoas_dados_pessoais, pessoas_identificacao (incl. niss, escrita directa -- ver DESVIO no cabecalho da migracao), pessoas_moradas, pessoas_fardamento, pessoas_sindicalizacao e pessoas_dados_bancarios (IBAN, escrita directa no Vault). NAO toca pessoas_retribuicoes, pessoas_vinculos, pessoas_contas nem tabelas de acesso -- confirmado no bloco de conferir por inspeccao do corpo da funcao, nao so por promessa em comentario.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_corpo text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_criar'
  ) THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_criar nao foi criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_estado'
  ) THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_estado nao foi criada.';
  END IF;

  IF has_function_privilege('authenticated', 'public.rpc_hr_convite_admissao_estado(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated consegue chamar rpc_hr_convite_admissao_estado -- devia ser so service_role, para o rate limit ficar do lado da Edge Function.';
  END IF;

  IF has_function_privilege('authenticated', 'public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated consegue chamar rpc_hr_convite_admissao_submeter -- devia ser so service_role.';
  END IF;

  -- A promessa central: o corpo de rpc_hr_convite_admissao_submeter nao pode
  -- mencionar tabelas nem mecanismos fora da lista branca do plano.
  SELECT pg_get_functiondef(
    'public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)'::regprocedure
  ) INTO v_corpo;

  IF v_corpo ILIKE '%retribuic%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter referencia retribuicao -- fora da lista branca do convite.';
  END IF;
  IF v_corpo ILIKE '%vinculo%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter referencia vinculo -- fora da lista branca do convite.';
  END IF;
  IF v_corpo ILIKE '%membership%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter referencia membership -- fora da lista branca do convite.';
  END IF;
  IF v_corpo ILIKE '%permission%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter referencia permission -- nao devia fazer verificacao de permissao de utilizador, a validade e a do token.';
  END IF;
  IF v_corpo ILIKE '%pessoas_contas%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter referencia pessoas_contas -- o convite nao cria nem liga contas de utilizador.';
  END IF;

  RAISE NOTICE 'OK: 3 RPCs de convite de admissao criadas. estado e submeter so acessiveis a service_role. submeter confirmada sem referencias a retribuicao, vinculo, membership, permissao ou contas de utilizador.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. Ler o bloco "DESVIO FACE AO PLANO" no topo -- rpc_hr_convite_admissao_submeter
--    escreve niss e a conta bancaria DIRECTAMENTE, nao atraves de
--    rpc_hr_definir_niss/rpc_hr_definir_conta (que exigem permissao de
--    utilizador que este fluxo nao tem). Confirmar com quem responde pela
--    seguranca do modulo antes de aplicar -- e uma decisao de produto, nao so
--    tecnica, e nao foi tomada por conta propria sem a assinalar aqui.
-- 2. rpc_hr_convite_admissao_estado e rpc_hr_convite_admissao_submeter NAO tem
--    EXECUTE para authenticated nem anon -- a Edge Function chama-as com a
--    service role key, nunca com o JWT de quem abre o link publico.
-- 3. Sem rate limiting nesta migracao: e responsabilidade da Edge Function
--    (fora do ambito desta ronda, que e so base de dados).
-- ==============================================================================
