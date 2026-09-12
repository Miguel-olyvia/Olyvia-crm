-- ==============================================================================
-- O convite de admissao passa a recusar NIF ou NISS que ja pertencam a OUTRA
-- ficha da mesma organizacao -- ANTES de escrever nada.
--
-- POR APLICAR.
--
--
-- -- PORQUE ANTES DE QUALQUER ESCRITA -----------------------------------------
--
-- `rpc_hr_convite_admissao_submeter` consome o token (primeira instrucao,
-- atomica) e so depois escreve nas tabelas de dados. A verificacao de
-- duplicados entra logo a seguir ao consumo do token -- a UNICA escrita que
-- tem de acontecer antes dela, porque e ela que decide se o token ainda esta
-- valido -- e ANTES de `set_config('hr.origem_escrita', ...)` e de qualquer
-- INSERT/UPDATE em pessoas_dados_pessoais, pessoas_identificacao, etc. Se
-- travar, o RAISE reverte a transaccao inteira, incluindo o consumo do
-- token: a pessoa pode voltar a tentar com o mesmo link.
--
-- Chama-se `hr_pessoa_duplicados_candidatos` (migracao anterior) com
-- `auth.uid()` NULL -- esta funcao corre inteira do lado de service_role,
-- sem sessao de utilizador -- por isso o gate de permissao dessa funcao se
-- salta sozinho (o mesmo ramo de service_role que ja existe em
-- hr_admissao_pendencias) e ela devolve TODOS os candidatos da organizacao.
--
-- Os valores a verificar sao os EFECTIVOS: o que o pedido traz, coalescido
-- com o que a ficha ja tinha (para o caso de o RH ja ter posto o NIF antes
-- do convite, e a pessoa nao o reenviar). O nome (primeiro_nome/apelido) nao
-- vem no pedido -- e sempre o da propria ficha, posto quando o RH a criou.
--
--
-- -- O QUE BLOQUEIA E O QUE NAO ------------------------------------------------
--
-- SO os candidatos com forca='travao' (nif, niss) apontando para uma pessoa
-- DIFERENTE da do proprio convite -- `hr_pessoa_duplicados_candidatos` ja
-- exclui p_excluir_pessoa_id, por isso qualquer linha devolvida e sempre de
-- OUTRA ficha. Sinais (email, documento, nome) nao bloqueiam a submissao do
-- convite: quem preenche o convite nao tem interface para os resolver, e
-- travar por um sinal fraco deixava a admissao presa sem caminho.
--
-- O ERRO E ESTAVEL E NAO REVELA NADA: 'nif_ja_existe' / 'niss_ja_existe'. SEM
-- nome, SEM pessoa_id, SEM o valor. RAZAO CRITICA: se fosse o indice unico a
-- disparar (migracao seguinte, ainda por aplicar), a mensagem de erro do
-- Postgres incluiria o valor duplicado -- e quem so tem um token de convite
-- passaria a poder usar a submissao como verificador de NIF/NISS por
-- adivinhacao, um valor de cada vez. Este portao existe TAMBEM para nunca se
-- chegar a essa mensagem.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. Reverter e voltar a
-- aplicar o corpo de `rpc_hr_convite_admissao_submeter` de 20261128010000
-- (CREATE OR REPLACE, mesma aridade) -- NAO copiar o ficheiro de reversao
-- para a pasta de migrations, aplicar so a mao.
--
--
-- Prerequisitos:
--   20261128010000  rpc_hr_convite_admissao_submeter (versao anterior)
--   20261130020000  hr_pessoa_duplicados_candidatos
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_duplicados_candidatos';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos nao existe (ou tem mais que uma aridade). Aplicar 20261130020000 primeiro.';
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_submeter';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Esperava exactamente 1 rpc_hr_convite_admissao_submeter, encontrei %.', v_n;
  END IF;

  RAISE NOTICE 'Guardas passadas.';
END;
$guardas$;

-- ==============================================================================
-- rpc_hr_convite_admissao_submeter -- MESMA aridade, portao de duplicados novo
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
  -- Duplicados: valores EFECTIVOS (pedido, coalescido com o que a ficha ja
  -- tem) usados so para a verificacao -- nada disto se escreve aqui.
  v_dup_nome1     text;
  v_dup_apelido   text;
  v_dup_nascim    date;
  v_dup_nif       text;
  v_dup_niss      text;
  v_dup_tipo      text;
  v_dup_numero    text;
  v_dup_email     text;
  v_tem_nif_dup   boolean;
  v_tem_niss_dup  boolean;
BEGIN
  IF jsonb_typeof(p_dados) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'pedido_invalido';
  END IF;

  -- Um convite ja bloqueado por tentativas falhadas nao se submete.
  IF EXISTS (
    SELECT 1 FROM public.pessoas_convites_admissao
     WHERE token_hash = p_token_hash AND attempts >= c_tecto
  ) THEN
    RAISE EXCEPTION 'convite_bloqueado';
  END IF;

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

  -- ---- O PORTAO DE DUPLICADOS: ANTES de qualquer escrita de dados --------
  -- Os valores EFECTIVOS: o que o pedido traz agora, coalescido com o que a
  -- ficha ja tinha (o RH pode ja ter posto o NIF antes de mandar o convite).
  -- O nome nao vem no pedido -- e sempre o que ja esta em pessoas.
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

  SELECT
    bool_or(cand.campo_coincidente = 'nif'),
    bool_or(cand.campo_coincidente = 'niss')
    INTO v_tem_nif_dup, v_tem_niss_dup
  FROM public.hr_pessoa_duplicados_candidatos(
    v_org, v_dup_nif, v_dup_niss, v_dup_email, v_dup_tipo, v_dup_numero,
    v_dup_nome1, v_dup_apelido, v_dup_nascim, v_pessoa_id
  ) AS cand
  WHERE cand.forca = 'travao';

  -- Erro ESTAVEL, sem nome, sem pessoa_id, sem valor: quem preenche o convite
  -- nao tem direito a saber quem e o colega, e a mensagem nao pode servir de
  -- verificador de NIF/NISS por adivinhacao.
  IF coalesce(v_tem_nif_dup, false) THEN
    RAISE EXCEPTION 'nif_ja_existe';
  END IF;
  IF coalesce(v_tem_niss_dup, false) THEN
    RAISE EXCEPTION 'niss_ja_existe';
  END IF;

  -- Origem das escritas seguintes: lida pelos triggers de auditoria em
  -- pessoas_dados_alteracoes.
  PERFORM set_config('hr.origem_escrita', 'convite', true);

  -- ---- pessoas: so o contacto pessoal ----------------------------------
  IF p_dados ? 'email_pessoal' THEN
    UPDATE public.pessoas
       SET email_pessoal = public.hr_json_texto(p_dados, 'email_pessoal')
     WHERE id = v_pessoa_id;
  END IF;

  -- ---- pessoas_dados_pessoais -------------------------------------------
  -- O `CASE WHEN p_dados ? <chave>` de cada linha e o que distingue "a chave
  -- nem veio" (preservar) de "veio a null" (limpar de proposito). Foi a sua
  -- ausencia que fez uma submissao apagar a ficha inteira.
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

  -- ---- pessoas_identificacao, incluindo niss ----------------------------
  -- Escrita directa e nao pela RPC dedicada de niss: ver o cabecalho de
  -- 20261124130000 ("DESVIO FACE AO PLANO"). A validacao de formato mantem-se.
  v_niss := public.hr_json_texto(p_dados, 'niss');
  IF v_niss IS NOT NULL AND v_niss !~ '^[0-9]{11}$' THEN
    RAISE EXCEPTION 'niss_invalido';
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
      -- O NISS e o caso que mais custou: com o UPDATE incondicional, uma
      -- submissao que nao o trouxesse apagava o que o RH ja tinha posto.
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

  -- ---- pessoas_moradas: a de residencia ----------------------------------
  v_linha1 := public.hr_json_texto(p_dados, 'morada_linha1');
  v_pais   := upper(public.hr_json_texto(p_dados, 'morada_pais'));

  IF v_pais IS NOT NULL AND v_pais !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'pais_invalido';
  END IF;

  IF p_dados ?| ARRAY[
       'morada_linha1','morada_linha2','morada_codigo_postal',
       'morada_localidade','morada_distrito','morada_pais'
     ] THEN
    UPDATE public.pessoas_moradas
       -- linha1 e NOT NULL e tem CHECK de nao-vazia: so se substitui por um
       -- valor real, nunca se limpa por este caminho. O portao de obrigatorios
       -- la em baixo e que garante que ela existe.
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
      -- is_principal CALCULADO, nunca fixo em true: uma pessoa que ja tenha
      -- uma morada principal de outro tipo (fiscal, correspondencia) fazia a
      -- submissao rebentar com a violacao de idx_pessoas_moradas_principal em
      -- bruto -- um indice unico parcial nao e uma mensagem de erro.
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

  -- ---- pessoas_fardamento -------------------------------------------------
  IF p_dados ?| ARRAY[
       'tamanho_cima','tamanho_cima_detalhe','tamanho_baixo','tamanho_baixo_detalhe',
       'tamanho_blazer','tamanho_blazer_detalhe'
     ] THEN
    INSERT INTO public.pessoas_fardamento (
      pessoa_id, organization_id,
      tamanho_cima, tamanho_cima_detalhe, tamanho_baixo, tamanho_baixo_detalhe,
      tamanho_blazer, tamanho_blazer_detalhe
    ) VALUES (
      v_pessoa_id, v_org,
      public.hr_json_texto(p_dados, 'tamanho_cima'),
      public.hr_json_texto(p_dados, 'tamanho_cima_detalhe'),
      public.hr_json_texto(p_dados, 'tamanho_baixo'),
      public.hr_json_texto(p_dados, 'tamanho_baixo_detalhe'),
      public.hr_json_texto(p_dados, 'tamanho_blazer'),
      public.hr_json_texto(p_dados, 'tamanho_blazer_detalhe')
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
      tamanho_blazer = CASE WHEN p_dados ? 'tamanho_blazer'
        THEN EXCLUDED.tamanho_blazer ELSE pessoas_fardamento.tamanho_blazer END,
      tamanho_blazer_detalhe = CASE WHEN p_dados ? 'tamanho_blazer_detalhe'
        THEN EXCLUDED.tamanho_blazer_detalhe ELSE pessoas_fardamento.tamanho_blazer_detalhe END,
      updated_at = now();
  END IF;

  -- ---- pessoas_sindicalizacao ---------------------------------------------
  IF p_dados ? 'sindicalizado' THEN
    INSERT INTO public.pessoas_sindicalizacao (pessoa_id, organization_id, sindicalizado, sindicato)
    VALUES (
      v_pessoa_id, v_org,
      coalesce((p_dados ->> 'sindicalizado')::boolean, false),
      public.hr_json_texto(p_dados, 'sindicato')
    )
    ON CONFLICT (pessoa_id, organization_id) DO UPDATE SET
      sindicalizado = EXCLUDED.sindicalizado,
      sindicato = CASE WHEN p_dados ? 'sindicato'
        THEN EXCLUDED.sindicato ELSE pessoas_sindicalizacao.sindicato END,
      updated_at = now();
  END IF;

  -- ---- A conta bancaria: VALIDA-SE aqui, GRAVA-SE depois do portao --------
  -- A validacao fica antes do portao porque nao escreve nada; a gravacao fica
  -- DEPOIS dele porque um segredo criado no Vault e depois revertido fica la
  -- orfao, sem nada que lhe aponte. (O bloco de conferir desta migracao mede
  -- esta ordem pela posicao das duas coisas no corpo da funcao -- por isso o
  -- nome da chamada ao Vault nao se escreve em comentario nenhum acima dela.)
  v_conta_num := public.hr_json_texto(p_dados, 'iban');
  v_conta_tit := public.hr_json_texto(p_dados, 'conta_titular');
  v_conta_bco := public.hr_json_texto(p_dados, 'conta_banco');

  IF v_conta_num IS NOT NULL THEN
    v_conta_num := upper(regexp_replace(v_conta_num, '[[:space:]]', '', 'g'));

    IF NOT public.hr_iban_valido(v_conta_num) THEN
      RAISE EXCEPTION 'iban_invalido';
    END IF;
  END IF;

  -- ---- O PORTAO: valida-se o RESULTADO, nao o pedido ----------------------
  -- Depois de escrever tudo, e ainda dentro da transaccao, pergunta-se a ficha
  -- o que lhe falta. Se faltar alguma coisa de origem 'pessoa', o RAISE reverte
  -- a transaccao inteira: a ficha fica como estava e o token NAO fica gasto.
  --
  -- Perguntar a ficha, e nao ao pedido, e o que faz a coisa certa quando o RH
  -- ja tinha posto o NISS e a pessoa nao o reenvia.
  --
  -- A UNICA excepcao e a conta, que ainda nao esta escrita quando isto corre:
  -- o que o pedido traz de conta conta como ja escrito. As tres linhas estao
  -- por extenso, e nenhuma dispensa o IBAN -- sem ele o bloco da conta nem
  -- corre, e o titular e o banco nao chegariam a ser gravados.
  SELECT array_agg(pend.codigo ORDER BY pend.codigo)
    INTO v_faltam
    FROM public.hr_admissao_pendencias(v_pessoa_id) AS pend
   WHERE pend.origem = 'pessoa'
     AND NOT (pend.codigo = 'conta_numero'  AND v_conta_num IS NOT NULL)
     AND NOT (pend.codigo = 'conta_titular' AND v_conta_num IS NOT NULL AND v_conta_tit IS NOT NULL)
     AND NOT (pend.codigo = 'conta_banco'   AND v_conta_num IS NOT NULL AND v_conta_bco IS NOT NULL);

  IF v_faltam IS NOT NULL AND array_length(v_faltam, 1) > 0 THEN
    RAISE EXCEPTION 'admissao_incompleta: %', array_to_string(v_faltam, ', ');
  END IF;

  -- ---- pessoas_dados_bancarios: a ULTIMA escrita da funcao ----------------
  -- Depois do portao, de proposito. Nada abaixo daqui volta a perguntar a
  -- ficha o que lhe falta, e por isso nenhum segredo do Vault fica orfao.
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
      -- titular e banco sao OBRIGATORIOS: ao contrario das outras colunas, nao
      -- se limpam por omissao. Limpa-los deixaria a ficha aquem do portao que
      -- acabou de passar. E o mesmo tratamento que morada.linha1 ja tinha.
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

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text) IS
'Submissao final do convite de admissao. SO service_role. Consome o token atomicamente. pessoa_id e organization_id vem SO da linha do convite, nunca de p_dados. Logo a seguir ao consumo do token, ANTES de qualquer outra escrita, chama hr_pessoa_duplicados_candidatos com os valores EFECTIVOS (pedido coalescido com o que a ficha ja tinha) e recusa com nif_ja_existe / niss_ja_existe se um travao (nif ou niss) apontar para OUTRA ficha da organizacao -- sem nome, sem pessoa_id, sem valor: quem preenche o convite nao pode usar a submissao como oraculo de NIF/NISS de terceiros. p_dados e PLANO, com prefixo de tabela so em morada_* -- a mesma forma que a Edge Function e o ecra usam, amarrada por teste. Cada ON CONFLICT distingue "a chave nem veio" de "veio a null": sem isso, uma submissao apagava a ficha inteira, NISS incluido. Chama hr_admissao_pendencias e RAISE se faltar campo de origem "pessoa" -- valida o RESULTADO e nao o pedido, para o token nao se gastar numa submissao vazia. A conta bancaria e a ULTIMA escrita, depois do portao: o vault.create_secret antes dele deixava segredos orfaos no Vault sempre que o portao disparava. Escreve em pessoas (so email_pessoal), pessoas_dados_pessoais, pessoas_identificacao (incl. niss), pessoas_moradas, pessoas_fardamento, pessoas_sindicalizacao e pessoas_dados_bancarios (IBAN, agora alcancavel).';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_src text;
  v_n   integer;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_submeter';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter ficou com % aridades.', v_n;
  END IF;

  IF has_function_privilege('authenticated', 'public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter deixou de ser so service_role.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter deixou de ser executavel por service_role.';
  END IF;

  SELECT pg_get_functiondef('public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)'::regprocedure) INTO v_src;

  IF v_src NOT LIKE '%hr_pessoa_duplicados_candidatos%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter ficou sem a chamada a hr_pessoa_duplicados_candidatos -- o portao de duplicados desapareceu.';
  END IF;
  IF v_src NOT LIKE '%nif_ja_existe%' OR v_src NOT LIKE '%niss_ja_existe%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter ficou sem os erros estaveis nif_ja_existe/niss_ja_existe.';
  END IF;

  -- O portao de duplicados tem de ficar ANTES do set_config que assinala o
  -- inicio das escritas de dados: senao a "escrita antes da verificacao" que
  -- este ficheiro promete no cabecalho deixa de ser verdade.
  IF position('hr_pessoa_duplicados_candidatos' in v_src) > position('hr.origem_escrita' in v_src) THEN
    RAISE EXCEPTION 'A verificacao de duplicados deixou de vir ANTES de set_config(''hr.origem_escrita'', ...) -- deixaria de estar antes das escritas de dados.';
  END IF;

  -- O erro nao pode concatenar nome, pessoa_id nem valor: exige-se a
  -- instrucao EXACTA "RAISE EXCEPTION 'nif_ja_existe';" (idem niss), literal
  -- sozinha entre aspas e ';', sem nada colado a seguir com '||'.
  --
  -- NAO usar 'LIKE ''%nif_ja_existe''''%||%''' (versao anterior desta guarda):
  -- com '%' de cada lado, o LIKE casa um '||' em QUALQUER ponto posterior de
  -- todo o corpo da funcao devolvido por pg_get_functiondef, nao so junto ao
  -- RAISE -- e esta funcao usa '||' legitimamente mais abaixo (a mensagem de
  -- admissao_incompleta, e as concatenacoes do Vault em hr_conta:/... e
  -- 'Conta bancaria de RH da pessoa ' || ...), o que fazia a guarda disparar
  -- sempre, mesmo com o RAISE literal correcto.
  --
  -- pg_get_functiondef devolve o prosrc tal como foi escrito (corpo PL/pgSQL
  -- e texto armazenado, nao reformatado), por isso a substring exacta abaixo
  -- casa com o corpo desta migracao carácter a carácter.
  IF v_src NOT LIKE '%RAISE EXCEPTION ''nif_ja_existe'';%' THEN
    RAISE EXCEPTION 'nif_ja_existe deixou de ser "RAISE EXCEPTION ''nif_ja_existe'';" literal -- parece estar a concatenar informacao que identifica a outra ficha.';
  END IF;
  IF v_src NOT LIKE '%RAISE EXCEPTION ''niss_ja_existe'';%' THEN
    RAISE EXCEPTION 'niss_ja_existe deixou de ser "RAISE EXCEPTION ''niss_ja_existe'';" literal -- parece estar a concatenar informacao que identifica a outra ficha.';
  END IF;

  -- ---- A rede do Vault, reposta -------------------------------------------
  -- Estas duas guardas existiam em 20261128010000 e PERDERAM-SE aqui: esta
  -- migracao reescreve a funcao inteira, e quem reescreve leva consigo o que
  -- nao copiar. O corpo continua na ordem certa, mas sem isto nada a garante
  -- -- e o defeito que elas impedem ja aconteceu: o vault.create_secret antes
  -- do portao deixava um segredo sem dono no cofre a CADA ficha incompleta,
  -- porque a transaccao reverte a linha da tabela e o Vault e outro schema,
  -- que nao reverte com ela.
  --
  -- Foi um revisor independente que deu por isso, ao reparar que o comentario
  -- do corpo PROMETE uma verificacao que este bloco nao estava a fazer.
  IF v_src NOT LIKE '%hr_admissao_pendencias%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter nao chama hr_admissao_pendencias -- ficou sem portao de obrigatorios.';
  END IF;
  IF strpos(v_src, 'hr_admissao_pendencias') > strpos(v_src, 'vault.create_secret') THEN
    RAISE EXCEPTION 'A gravacao da conta voltou a acontecer ANTES do portao -- um portao que dispare deixa o segredo orfao no Vault.';
  END IF;

  -- O ramo continua SECURITY DEFINER com search_path fixo (nao mudou, mas
  -- confirma-se: um CREATE OR REPLACE mal escrito podia largar a clausula).
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_submeter'
       AND p.prosecdef
       AND p.proconfig @> ARRAY['search_path=public, pg_temp']
  ) THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter perdeu SECURITY DEFINER ou o search_path fixo.';
  END IF;

  RAISE NOTICE 'OK: rpc_hr_convite_admissao_submeter passou a recusar nif_ja_existe/niss_ja_existe ANTES de qualquer escrita, com erro estavel e sem revelar a outra ficha.';
END;
$conferir$;
