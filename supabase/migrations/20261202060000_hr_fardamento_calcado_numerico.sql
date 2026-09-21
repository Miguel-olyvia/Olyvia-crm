-- ==============================================================================
-- pessoas_fardamento: "blazer" passa a "calcado", com tamanho numerico; as
-- calcas (tamanho_baixo) ganham tamanhos numericos a par das letras que ja
-- tinha, nunca a substitui-las.
--
-- -- O PEDIDO -------------------------------------------------------------------
--
-- 1. tamanho_blazer -> tamanho_calcado: o item deixa de ser um blazer, passa a
--    ser troca de calcado. O dominio muda de letras (xs..xxl) para numeros de
--    sapato europeus (35..48), com 'outro' como valvula de escape, no MESMO
--    padrao ja usado nesta tabela (outro + detalhe livre).
-- 2. tamanho_baixo (calcas): ganha tamanhos numericos (34..60, so pares, o
--    padrao europeu de calcas) a par das letras xs..xxl que ja tinha -- as
--    letras NAO saem, os dois formatos coexistem como opcoes validas.
-- 3. tamanho_cima fica tal como esta -- nao foi pedido, nao se mexe.
--
-- -- O QUE ISTO TOCA, PARA ALEM DA TABELA ----------------------------------------
--
-- O nome da coluna esta escrito por extenso dentro de quatro funcoes vivas
-- (nao um triatro no corpo, valores reais gravados/lidos a cada submissao):
--   rpc_hr_convite_admissao_submeter  (20261130030000, versao vigente)
--   hr_admissao_pendencias            (20261201060000, versao vigente)
--   hr_admissao_campo_permissao       (20261129020000, nunca redefinida depois)
--   hr_admissao_campos_obrigatorios   (20261130150000, versao vigente)
-- As quatro sao recriadas aqui com a MESMA assinatura e o MESMO corpo, so com
-- tamanho_blazer trocado por tamanho_calcado -- confirmado por leitura directa
-- de cada uma antes de escrever isto, nao por suposicao (ja aconteceu nesta
-- base uma correccao escrita contra uma versao que uma migracao seguinte tinha
-- substituido).
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Nao ha reversao simples: e um rename com mudanca de dominio, sobre uma
-- tabela com dados possivelmente ja escritos. Reverter implicaria decidir o
-- que fazer aos valores numericos que ja nao cabem no dominio antigo de letras
-- -- por isso esta migracao nao e mecanicamente reversivel, so corrigivel para
-- a frente por outra migracao.
--
-- Prerequisitos:
--   20261124070000  pessoas_fardamento
--   20261130030000  rpc_hr_convite_admissao_submeter (versao vigente)
--   20261201060000  hr_admissao_pendencias (versao vigente)
--   20261129020000  hr_admissao_campo_permissao (versao vigente)
--   20261130150000  hr_admissao_campos_obrigatorios (versao vigente)
-- ==============================================================================

-- ---- Guardas -----------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pessoas_fardamento'
      AND column_name = 'tamanho_blazer'
  ) THEN
    RAISE EXCEPTION 'pessoas_fardamento.tamanho_blazer nao existe -- confirmar se esta migracao ja foi aplicada antes de reaplicar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_submeter'
  ) THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter nao existe. Aplicar 20261130030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_pendencias'
  ) THEN
    RAISE EXCEPTION 'hr_admissao_pendencias nao existe. Aplicar 20261201060000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. Renomear as colunas
-- ==============================================================================
ALTER TABLE public.pessoas_fardamento RENAME COLUMN tamanho_blazer TO tamanho_calcado;
ALTER TABLE public.pessoas_fardamento RENAME COLUMN tamanho_blazer_detalhe TO tamanho_calcado_detalhe;

-- Dados ja escritos no dominio antigo (letras, de quando isto era tamanho de
-- blazer) nao cabem no novo dominio numerico -- nunca se perdem: passam para
-- 'outro', com o valor antigo preservado em detalhe. Confirmado ao vivo: o
-- primeiro db push desta migracao falhou exactamente aqui (23514), a provar
-- que ha dados reais neste caso, nao so uma hipotese.
UPDATE public.pessoas_fardamento
   SET tamanho_calcado_detalhe = coalesce(tamanho_calcado_detalhe, tamanho_calcado),
       tamanho_calcado = 'outro'
 WHERE tamanho_calcado IS NOT NULL
   AND tamanho_calcado NOT IN (
     '35','36','37','38','39','40','41','42','43','44','45','46','47','48','outro'
   );

-- ==============================================================================
-- 2. Novos dominios (CHECK)
-- ==============================================================================
ALTER TABLE public.pessoas_fardamento
  DROP CONSTRAINT IF EXISTS pessoas_fardamento_tamanho_blazer_valido;

ALTER TABLE public.pessoas_fardamento
  ADD CONSTRAINT pessoas_fardamento_tamanho_calcado_valido
  CHECK (tamanho_calcado IS NULL OR tamanho_calcado IN (
    '35','36','37','38','39','40','41','42','43','44','45','46','47','48','outro'
  ));

ALTER TABLE public.pessoas_fardamento
  DROP CONSTRAINT IF EXISTS pessoas_fardamento_tamanho_baixo_valido;

ALTER TABLE public.pessoas_fardamento
  ADD CONSTRAINT pessoas_fardamento_tamanho_baixo_valido
  CHECK (tamanho_baixo IS NULL OR tamanho_baixo IN (
    'xs','s','m','l','xl','xxl',
    '34','36','38','40','42','44','46','48','50','52','54','56','58','60',
    'outro'
  ));

COMMENT ON COLUMN public.pessoas_fardamento.tamanho_calcado IS
'Tamanho de calcado, numero europeu (35 a 48) ou ''outro'' com o detalhe em tamanho_calcado_detalhe. Ate 20261202060000 este campo era "tamanho_blazer" (letras xs..xxl) -- renomeado e mudou de dominio, nao so de nome.';
COMMENT ON COLUMN public.pessoas_fardamento.tamanho_calcado_detalhe IS
'Texto livre, mostrado pela interface so quando tamanho_calcado = ''outro''. Sem CHECK cruzado, mesmo padrao dos outros campos desta tabela.';
COMMENT ON COLUMN public.pessoas_fardamento.tamanho_baixo IS
'Tamanho das calcas -- letra (xs..xxl) OU numero europeu (34 a 60, pares) OU ''outro'' com detalhe. Os dois formatos coexistem de proposito: nao se obriga ninguem a converter, escolhe-se o que a pessoa souber dizer.';

-- ==============================================================================
-- 3. rpc_hr_convite_admissao_submeter -- MESMA assinatura, MESMO corpo da
--    versao vigente (20261130030000), so tamanho_blazer -> tamanho_calcado.
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

  IF EXISTS (
    SELECT 1 FROM public.pessoas_convites_admissao
     WHERE token_hash = p_token_hash AND attempts >= c_tecto
  ) THEN
    RAISE EXCEPTION 'convite_bloqueado';
  END IF;

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

  IF coalesce(v_tem_nif_dup, false) THEN
    RAISE EXCEPTION 'nif_ja_existe';
  END IF;
  IF coalesce(v_tem_niss_dup, false) THEN
    RAISE EXCEPTION 'niss_ja_existe';
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
    RAISE EXCEPTION 'pais_invalido';
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

  v_conta_num := public.hr_json_texto(p_dados, 'iban');
  v_conta_tit := public.hr_json_texto(p_dados, 'conta_titular');
  v_conta_bco := public.hr_json_texto(p_dados, 'conta_banco');

  IF v_conta_num IS NOT NULL THEN
    v_conta_num := upper(regexp_replace(v_conta_num, '[[:space:]]', '', 'g'));

    IF NOT public.hr_iban_valido(v_conta_num) THEN
      RAISE EXCEPTION 'iban_invalido';
    END IF;
  END IF;

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

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text) IS
'Submissao final do convite de admissao. SO service_role. MESMO corpo da versao vigente (20261130030000), so com tamanho_blazer renomeado para tamanho_calcado (20261202060000). Ver o comentario da versao anterior desta funcao para o resto do comportamento.';

-- ==============================================================================
-- 4. hr_admissao_pendencias -- MESMA assinatura, MESMO corpo da versao vigente
--    (20261201060000), so tamanho_blazer -> tamanho_calcado.
-- ==============================================================================
DROP FUNCTION IF EXISTS public.hr_admissao_pendencias(uuid);

CREATE FUNCTION public.hr_admissao_pendencias(p_pessoa_id uuid)
RETURNS TABLE (codigo text, origem text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_org        uuid;
  v_servico    boolean := (v_uid IS NULL);
  v_propria    boolean := false;
  v_ficha      boolean := false;
  v_permitidas text[]  := ARRAY[]::text[];
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pessoas p
  WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RETURN;
  END IF;

  IF NOT v_servico THEN
    v_ficha := public.has_anew_permission_in_org(v_uid, 'hr.pessoas.view', v_org);

    v_propria := public.has_anew_permission_in_org(v_uid, 'hr.pessoas.view.own', v_org)
                 AND public.hr_pessoa_do_utilizador(v_uid, v_org) = p_pessoa_id;

    IF NOT (v_ficha OR v_propria) THEN
      RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;

    SELECT coalesce(array_agg(d.permissao), ARRAY[]::text[])
      INTO v_permitidas
      FROM (SELECT DISTINCT cp.permissao FROM public.hr_admissao_campo_permissao() cp) d
     WHERE public.has_anew_permission_in_org(v_uid, d.permissao, v_org);
  END IF;

  RETURN QUERY
  WITH estado AS (
    SELECT
      nullif(btrim(coalesce(p.email_pessoal, '')), '')       AS email_pessoal,
      p.data_admissao::text                                  AS data_admissao,
      dp.data_nascimento::text                               AS data_nascimento,
      nullif(btrim(coalesce(dp.genero, '')), '')             AS genero,
      nullif(btrim(coalesce(dp.nacionalidade, '')), '')      AS nacionalidade,
      nullif(btrim(coalesce(dp.telefone_pessoal, '')), '')   AS telefone_pessoal,
      nullif(btrim(coalesce(dp.estado_civil, '')), '')       AS estado_civil,
      dp.dependentes::text                                   AS dependentes,
      dp.dependentes_deficientes::text                       AS dependentes_deficientes,
      nullif(btrim(coalesce(dp.conjuge_situacao_profissional, '')), '')
                                                             AS conjuge_situacao_profissional,
      nullif(btrim(coalesce(dp.naturalidade_freguesia, '')), '')
                                                             AS naturalidade_freguesia,
      nullif(btrim(coalesce(dp.naturalidade_concelho, '')), '')
                                                             AS naturalidade_concelho,
      nullif(btrim(coalesce(dp.naturalidade_pais, '')), '')  AS naturalidade_pais,
      nullif(btrim(coalesce(dp.habilitacao_academica, '')), '')
                                                             AS habilitacao_academica,
      dp.habilitacao_data_conclusao::text                    AS habilitacao_data_conclusao,
      nullif(btrim(coalesce(i.nif, '')), '')                 AS nif,
      nullif(btrim(coalesce(i.niss, '')), '')                AS niss,
      nullif(btrim(coalesce(i.tipo_documento, '')), '')      AS tipo_documento,
      nullif(btrim(coalesce(i.numero_documento, '')), '')    AS numero_documento,
      i.validade_documento::text                             AS validade_documento,
      nullif(btrim(coalesce(m.linha1, '')), '')              AS linha1,
      nullif(btrim(coalesce(m.codigo_postal, '')), '')       AS codigo_postal,
      nullif(btrim(coalesce(m.localidade, '')), '')          AS localidade,
      nullif(btrim(coalesce(f.tamanho_cima, '')), '')        AS tamanho_cima,
      nullif(btrim(coalesce(f.tamanho_baixo, '')), '')       AS tamanho_baixo,
      nullif(btrim(coalesce(f.tamanho_calcado, '')), '')     AS tamanho_calcado,
      s.sindicalizado::text                                  AS sindicalizado,
      nullif(btrim(coalesce(s.sindicato, '')), '')           AS sindicato,
      b.conta_secret_id::text                                AS conta_numero,
      nullif(btrim(coalesce(b.titular, '')), '')             AS conta_titular,
      nullif(btrim(coalesce(b.banco, '')), '')               AS conta_banco
    FROM public.pessoas p
    LEFT JOIN public.pessoas_dados_pessoais  dp ON dp.pessoa_id = p.id
    LEFT JOIN public.pessoas_identificacao    i ON i.pessoa_id  = p.id
    LEFT JOIN public.pessoas_fardamento       f ON f.pessoa_id  = p.id
    LEFT JOIN public.pessoas_sindicalizacao   s ON s.pessoa_id  = p.id
    LEFT JOIN public.pessoas_dados_bancarios  b ON b.pessoa_id  = p.id
    LEFT JOIN LATERAL (
      SELECT mm.linha1, mm.codigo_postal, mm.localidade
      FROM public.pessoas_moradas mm
      WHERE mm.pessoa_id = p.id AND mm.tipo = 'residencia'
      ORDER BY mm.is_principal DESC, mm.created_at
      LIMIT 1
    ) m ON true
    WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL
  )
  SELECT c.codigo, c.origem
  FROM estado e
  CROSS JOIN public.hr_admissao_campos_obrigatorios_org(v_org) c
  JOIN public.hr_admissao_campo_permissao() cp ON cp.codigo = c.codigo
  WHERE (to_jsonb(e) ->> c.codigo) IS NULL
    AND c.obrigatorio
    AND (v_servico OR v_propria OR cp.permissao = ANY (v_permitidas))
    AND (c.codigo <> 'validade_documento'
         OR (e.tipo_documento IS NOT NULL AND e.tipo_documento <> 'cartao_cidadao'))
    AND (c.codigo <> 'conjuge_situacao_profissional'
         OR e.estado_civil IN ('casado', 'uniao_de_facto'))
    AND (c.codigo <> 'sindicato'
         OR e.sindicalizado = 'true')
    AND (c.codigo <> 'nif'
         OR e.niss IS NULL)
    AND (c.codigo <> 'niss'
         OR e.nif IS NULL)
  ORDER BY c.codigo;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_admissao_pendencias(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_pendencias(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_admissao_pendencias(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_admissao_pendencias(uuid) TO service_role;

COMMENT ON FUNCTION public.hr_admissao_pendencias(uuid) IS
'MESMO comportamento da versao vigente (20261201060000: excepcao NIF OU NISS, override por organizacao, recusa a quem nao pode ver a ficha), so com tamanho_blazer renomeado para tamanho_calcado (20261202060000).';

-- ==============================================================================
-- 5. hr_admissao_campo_permissao -- MESMA assinatura, MESMO corpo da versao
--    vigente (20261129020000, nunca redefinida depois), so tamanho_blazer ->
--    tamanho_calcado.
-- ==============================================================================
DROP FUNCTION IF EXISTS public.hr_admissao_campo_permissao();

CREATE FUNCTION public.hr_admissao_campo_permissao()
RETURNS TABLE (codigo text, tabela text, permissao text)
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT *
  FROM (VALUES
    ('email_pessoal',                 'pessoas',                  'hr.pessoas.view'),
    ('data_admissao',                 'pessoas',                  'hr.pessoas.view'),
    ('data_nascimento',               'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('genero',                        'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('nacionalidade',                 'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('telefone_pessoal',              'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('estado_civil',                  'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('dependentes',                   'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('dependentes_deficientes',       'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('conjuge_situacao_profissional', 'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('naturalidade_freguesia',        'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('naturalidade_concelho',         'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('naturalidade_pais',             'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('habilitacao_academica',         'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('habilitacao_data_conclusao',    'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('nif',                           'pessoas_identificacao',    'hr.pessoas.identificacao.view'),
    ('niss',                          'pessoas_identificacao',    'hr.pessoas.identificacao.view'),
    ('tipo_documento',                'pessoas_identificacao',    'hr.pessoas.identificacao.view'),
    ('numero_documento',              'pessoas_identificacao',    'hr.pessoas.identificacao.view'),
    ('validade_documento',            'pessoas_identificacao',    'hr.pessoas.identificacao.view'),
    ('linha1',                        'pessoas_moradas',          'hr.pessoas.morada.view'),
    ('codigo_postal',                 'pessoas_moradas',          'hr.pessoas.morada.view'),
    ('localidade',                    'pessoas_moradas',          'hr.pessoas.morada.view'),
    ('tamanho_cima',                  'pessoas_fardamento',       'hr.pessoas.laborais.view'),
    ('tamanho_baixo',                 'pessoas_fardamento',       'hr.pessoas.laborais.view'),
    ('tamanho_calcado',               'pessoas_fardamento',       'hr.pessoas.laborais.view'),
    ('sindicalizado',                 'pessoas_sindicalizacao',   'hr.pessoas.sindicalizacao.view'),
    ('sindicato',                     'pessoas_sindicalizacao',   'hr.pessoas.sindicalizacao.view'),
    ('conta_numero',                  'pessoas_dados_bancarios',  'hr.pessoas.bancarios.view'),
    ('conta_titular',                 'pessoas_dados_bancarios',  'hr.pessoas.bancarios.view'),
    ('conta_banco',                   'pessoas_dados_bancarios',  'hr.pessoas.bancarios.view')
  ) AS t(codigo, tabela, permissao);
$$;

REVOKE ALL ON FUNCTION public.hr_admissao_campo_permissao() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_campo_permissao() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campo_permissao() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campo_permissao() TO service_role;

COMMENT ON FUNCTION public.hr_admissao_campo_permissao() IS
'MESMO conteudo da versao vigente (20261129020000), so tamanho_blazer renomeado para tamanho_calcado (20261202060000).';

-- ==============================================================================
-- 6. hr_admissao_campos_obrigatorios -- MESMA assinatura, MESMO corpo da
--    versao vigente (20261130150000), so tamanho_blazer -> tamanho_calcado.
--    Espelhada em src/lib/hr/admissaoObrigatorios.ts -- actualizada junto.
-- ==============================================================================
DROP FUNCTION IF EXISTS public.hr_admissao_campos_obrigatorios();

CREATE FUNCTION public.hr_admissao_campos_obrigatorios()
RETURNS TABLE (codigo text, origem text, condicional boolean)
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT *
  FROM (VALUES
    ('data_nascimento',               'pessoa', false),
    ('genero',                        'pessoa', false),
    ('nacionalidade',                 'pessoa', false),
    ('telefone_pessoal',              'pessoa', false),
    ('email_pessoal',                 'pessoa', false),
    ('estado_civil',                  'pessoa', false),
    ('dependentes',                   'pessoa', false),
    ('dependentes_deficientes',       'pessoa', false),
    ('conjuge_situacao_profissional', 'pessoa', true),
    ('naturalidade_freguesia',        'pessoa', false),
    ('naturalidade_concelho',         'pessoa', false),
    ('naturalidade_pais',             'pessoa', false),
    ('habilitacao_academica',         'pessoa', false),
    ('habilitacao_data_conclusao',    'pessoa', false),
    ('nif',                           'pessoa', false),
    ('niss',                          'pessoa', false),
    ('tipo_documento',                'pessoa', false),
    ('numero_documento',              'pessoa', false),
    ('validade_documento',            'pessoa', true),
    ('linha1',                        'pessoa', false),
    ('codigo_postal',                 'pessoa', false),
    ('localidade',                    'pessoa', false),
    ('tamanho_cima',                  'pessoa', false),
    ('tamanho_baixo',                 'pessoa', false),
    ('tamanho_calcado',               'pessoa', false),
    ('conta_numero',                  'pessoa', false),
    ('conta_titular',                 'pessoa', false),
    ('conta_banco',                   'pessoa', false),
    ('data_admissao',                 'rh',     false)
  ) AS t(codigo, origem, condicional);
$$;

REVOKE ALL ON FUNCTION public.hr_admissao_campos_obrigatorios() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_campos_obrigatorios() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campos_obrigatorios() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campos_obrigatorios() TO service_role;

COMMENT ON FUNCTION public.hr_admissao_campos_obrigatorios() IS
'MESMO conteudo da versao vigente (20261130150000), so tamanho_blazer renomeado para tamanho_calcado (20261202060000). Espelhada em src/lib/hr/admissaoObrigatorios.ts.';

-- ==============================================================================
-- Conferir
-- ==============================================================================
DO $conferir$
DECLARE
  v_check_calcado text;
  v_check_baixo   text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pessoas_fardamento'
      AND column_name = 'tamanho_blazer'
  ) THEN
    RAISE EXCEPTION 'pessoas_fardamento.tamanho_blazer ainda existe -- o rename falhou.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pessoas_fardamento'
      AND column_name = 'tamanho_calcado'
  ) THEN
    RAISE EXCEPTION 'pessoas_fardamento.tamanho_calcado nao existe -- o rename falhou.';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_check_calcado
  FROM pg_constraint
  WHERE conname = 'pessoas_fardamento_tamanho_calcado_valido'
    AND conrelid = 'public.pessoas_fardamento'::regclass;

  IF v_check_calcado IS NULL OR v_check_calcado NOT LIKE '%35%' OR v_check_calcado LIKE '%xs%' THEN
    RAISE EXCEPTION 'CHECK de tamanho_calcado nao ficou com o dominio numerico esperado: %', v_check_calcado;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_check_baixo
  FROM pg_constraint
  WHERE conname = 'pessoas_fardamento_tamanho_baixo_valido'
    AND conrelid = 'public.pessoas_fardamento'::regclass;

  IF v_check_baixo IS NULL OR v_check_baixo NOT LIKE '%xs%' OR v_check_baixo NOT LIKE '%34%' THEN
    RAISE EXCEPTION 'CHECK de tamanho_baixo nao ficou com letras E numeros: %', v_check_baixo;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_submeter'
      AND pg_get_functiondef(p.oid) LIKE '%tamanho_calcado%'
  ) THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter nao ficou a referenciar tamanho_calcado.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_submeter'
      AND pg_get_functiondef(p.oid) LIKE '%tamanho_blazer%'
  ) THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter ainda referencia tamanho_blazer.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM (SELECT codigo FROM public.hr_admissao_campos_obrigatorios()) c
    WHERE c.codigo = 'tamanho_calcado'
  ) THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios() nao lista tamanho_calcado.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (SELECT codigo FROM public.hr_admissao_campos_obrigatorios()) c
    WHERE c.codigo = 'tamanho_blazer'
  ) THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios() ainda lista tamanho_blazer.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM (SELECT codigo FROM public.hr_admissao_campo_permissao()) c
    WHERE c.codigo = 'tamanho_calcado'
  ) THEN
    RAISE EXCEPTION 'hr_admissao_campo_permissao() nao lista tamanho_calcado.';
  END IF;

  RAISE NOTICE 'OK: pessoas_fardamento.tamanho_calcado (numerico) e tamanho_baixo (letras+numeros) confirmados; as quatro funcoes vivas actualizadas coerentemente.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- Recria 4 funcoes vivas com o MESMO comportamento da versao vigente de cada
-- uma, so trocando o nome da coluna -- confirmado por leitura directa de cada
-- versao antes de escrever esta migracao. Sem janela de estado defeituoso: a
-- transaccao da migracao renomeia a coluna e recria as 4 funcoes junto, nunca
-- uma sem a outra.
-- ==============================================================================
