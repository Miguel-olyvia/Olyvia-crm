-- ==============================================================================
-- Os obrigatorios da admissao passam a ser as DUAS paginas da folha de cadastro,
-- e a conta bancaria que o ecra ja pedia deixa de ser deitada fora.
--
-- POR APLICAR.
--
--
-- -- 1. O QUE MUDA NA LISTA DE OBRIGATORIOS -------------------------------------
--
-- Ate aqui a lista cobria so a primeira metade da folha de papel: dados
-- pessoais, documento e morada. Tudo o que vive na segunda pagina -- fardamento,
-- sindicalizacao, conta bancaria -- e tres campos da primeira (genero,
-- naturalidade, habilitacoes) ficavam de fora, e por isso uma ficha podia ser
-- dada por completa sem nada disso. Passam a entrar.
--
-- Entram como origem 'pessoa' (e a propria quem os preenche no convite):
--   genero, naturalidade_freguesia, naturalidade_concelho, naturalidade_pais,
--   dependentes_deficientes, habilitacao_academica, habilitacao_data_conclusao,
--   tamanho_cima, tamanho_baixo, tamanho_blazer, sindicalizado,
--   conta_numero, conta_titular, conta_banco.
--
-- Entram como CONDICIONAIS, e a condicao esta escrita por extenso (nunca por
-- regra generica):
--   conjuge_situacao_profissional -- so quando o estado civil e casado ou uniao
--                                    de facto; a quem e solteiro nao se pergunta
--                                    a profissao de um conjuge que nao existe;
--   sindicato                     -- so quando a pessoa se declarou
--                                    sindicalizada.
--   (validade_documento continua condicional, como ja era.)
--
-- NAO entram, DE PROPOSITO:
--   carta_conducao_numero, carta_conducao_categorias, carta_conducao_validade.
--   Nem toda a gente tem carta. Torna-las obrigatorias impedia essas pessoas de
--   submeter o convite -- ficavam presas num campo que nunca poderao preencher.
--   Continuam a ser capturadas e gravadas quando existem.
--
-- `sindicalizado` e um interruptor: "nao sou sindicalizado" E resposta. O que se
-- exige e que a resposta EXISTA (a linha de pessoas_sindicalizacao), nao que
-- seja verdadeira.
--
--
-- -- 2. A CONTA BANCARIA DEIXA DE SER DEITADA FORA ------------------------------
--
-- O ecra pedia IBAN, banco e titular desde o principio; a Edge Function nao os
-- reencaminhava (devolvia o aviso `conta_nao_gravada`) e o ramo do IBAN desta
-- RPC, ja escrito e funcional, era inalcancavel. Quem preenchia a conta escrevia
-- para o vazio.
--
-- As chaves `iban`, `conta_titular` e `conta_banco` passam a fazer parte do
-- contrato dos tres lados (ecra, lista branca da Edge Function, RPC), e o ramo
-- passa a correr. `conta_agencia` e `conta_swift` continuam a ser lidas pela RPC
-- e a NAO existir no formulario: nao ha campo para elas na folha de papel.
--
--
-- -- 3. O DEFEITO QUE SE CORRIGE NA MESMA PASSAGEM ------------------------------
--
-- O `vault.create_secret` do IBAN acontecia ANTES do portao de obrigatorios. Uma
-- submissao a que faltasse, por exemplo, o NISS, criava o segredo, disparava o
-- portao, e o ROLLBACK repunha a linha de pessoas_dados_bancarios -- deixando o
-- segredo orfao no Vault, sem nada que lhe apontasse. Basta insistir para ir
-- acumulando IBANs cifrados que ninguem consegue voltar a ligar a uma pessoa.
--
-- A ORDEM PASSA A SER: validar o IBAN -> PORTAO -> gravar a conta. A gravacao da
-- conta e a ULTIMA escrita da funcao, e nada pode disparar o portao depois dela.
--
-- Como o portao pergunta a FICHA o que lhe falta, e a conta ainda nao esta
-- escrita quando ele corre, o que o pedido traz de conta conta como ja escrito
-- -- e so isso: as tres unicas linhas de excepcao estao escritas por extenso na
-- propria consulta. Nenhuma dispensa o IBAN, porque sem IBAN o bloco da conta
-- nem chega a correr e o titular e o banco nao seriam gravados.
--
-- Pela mesma razao, `titular` e `banco` passam a PRESERVAR o que la esta quando
-- o pedido os traz a null (o mesmo tratamento que `morada.linha1` ja tinha):
-- sao obrigatorios, e limpa-los por omissao deixaria a ficha aquem do portao
-- que acabou de passar.
-- ==============================================================================


-- ==============================================================================
-- A lista de campos obrigatorios da admissao -- a autoridade, em SQL
-- ==============================================================================
-- Espelhada em `src/lib/hr/admissaoObrigatorios.ts` (so os de origem 'pessoa')
-- e comparada com ela por `conviteAdmissaoContrato.test.ts`.
DROP FUNCTION IF EXISTS public.hr_admissao_campos_obrigatorios();

CREATE FUNCTION public.hr_admissao_campos_obrigatorios()
RETURNS TABLE (codigo text, origem text, condicional boolean)
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT *
  FROM (VALUES
    -- Pagina 1 da folha: dados pessoais
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
    -- Pagina 1 da folha: documento e identificacao
    ('nif',                           'pessoa', false),
    ('niss',                          'pessoa', false),
    ('tipo_documento',                'pessoa', false),
    ('numero_documento',              'pessoa', false),
    ('validade_documento',            'pessoa', true),
    -- Pagina 1 da folha: morada
    ('linha1',                        'pessoa', false),
    ('codigo_postal',                 'pessoa', false),
    ('localidade',                    'pessoa', false),
    -- Pagina 2 da folha: fardamento, sindicalizacao, conta bancaria
    ('tamanho_cima',                  'pessoa', false),
    ('tamanho_baixo',                 'pessoa', false),
    ('tamanho_blazer',                'pessoa', false),
    ('sindicalizado',                 'pessoa', false),
    ('sindicato',                     'pessoa', true),
    ('conta_numero',                  'pessoa', false),
    ('conta_titular',                 'pessoa', false),
    ('conta_banco',                   'pessoa', false),
    -- O que o RH preenche na retaguarda: nunca trava o convite
    ('data_admissao',                 'rh',     false)
  ) AS t(codigo, origem, condicional);
$$;

REVOKE ALL ON FUNCTION public.hr_admissao_campos_obrigatorios() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_campos_obrigatorios() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campos_obrigatorios() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campos_obrigatorios() TO service_role;

COMMENT ON FUNCTION public.hr_admissao_campos_obrigatorios() IS
'A lista dos campos sem os quais uma ficha de admissao nao fica utilizavel -- as DUAS paginas da folha de cadastro em papel. origem "pessoa" e o que o convite publico pede e o que trava a submissao; origem "rh" e o que a retaguarda preenche e nunca trava o convite. condicional=true marca os campos cuja obrigatoriedade depende de outro: validade_documento (nao se pede a um cartao de cidadao), conjuge_situacao_profissional (so a quem e casado ou vive em uniao de facto) e sindicato (so a quem se declarou sindicalizado). A carta de conducao fica DE FORA de proposito: nem toda a gente tem carta e exigi-la impedia essas pessoas de submeter. Espelhada em src/lib/hr/admissaoObrigatorios.ts e comparada com ela por teste.';


-- ==============================================================================
-- O que FALTA a ficha de uma pessoa
-- ==============================================================================
-- SECURITY DEFINER porque tem de saber se `pessoas_identificacao.niss` esta
-- preenchido, e essa coluna esta fechada a `authenticated` por grant de coluna.
-- Devolve SO codigos de campo -- nunca um valor -- por isso saber "o NISS esta
-- preenchido" nao revela o NISS, e "a conta esta preenchida" nao revela o IBAN.
--
-- As tabelas-satelite (fardamento, sindicalizacao, dados bancarios) tem chave
-- unica por (pessoa_id, organization_id) e apontam para (pessoas.id,
-- organization_id), e uma pessoa vive numa organizacao so -- por isso juntar
-- por pessoa_id da no maximo uma linha.
DROP FUNCTION IF EXISTS public.hr_admissao_pendencias(uuid);

CREATE FUNCTION public.hr_admissao_pendencias(p_pessoa_id uuid)
RETURNS TABLE (codigo text, origem text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
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
      nullif(btrim(coalesce(f.tamanho_blazer, '')), '')      AS tamanho_blazer,
      -- Um interruptor respondido a "nao" esta respondido: o que se exige e que
      -- a resposta exista, nao que seja verdadeira.
      s.sindicalizado::text                                  AS sindicalizado,
      nullif(btrim(coalesce(s.sindicato, '')), '')           AS sindicato,
      -- A conta: o segredo do Vault e a prova de que ha numero. Nunca se le o
      -- numero, nem os ultimos quatro caracteres.
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
  CROSS JOIN public.hr_admissao_campos_obrigatorios() c
  WHERE (to_jsonb(e) ->> c.codigo) IS NULL
    -- As condicionalidades, escritas por extenso em vez de inventadas por regra
    -- generica. Em todas elas, o campo de que dependem ainda por preencher NAO
    -- arrasta a pendencia consigo: essa ja aparece, e so uma, no proprio campo.
    AND (c.codigo <> 'validade_documento'
         OR (e.tipo_documento IS NOT NULL AND e.tipo_documento <> 'cartao_cidadao'))
    AND (c.codigo <> 'conjuge_situacao_profissional'
         OR e.estado_civil IN ('casado', 'uniao_de_facto'))
    AND (c.codigo <> 'sindicato'
         OR e.sindicalizado = 'true')
  ORDER BY c.codigo;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_admissao_pendencias(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_pendencias(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hr_admissao_pendencias(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_admissao_pendencias(uuid) TO service_role;

COMMENT ON FUNCTION public.hr_admissao_pendencias(uuid) IS
'Os campos obrigatorios de admissao que a ficha desta pessoa AINDA NAO tem, pelas duas paginas da folha de cadastro. SECURITY DEFINER porque precisa de saber se pessoas_identificacao.niss e pessoas_dados_bancarios.conta_secret_id estao preenchidos, e essas colunas estao fechadas a authenticated -- devolve SO codigos, nunca valores, por isso nao revela nem o NISS nem o IBAN. So service_role: hoje o unico chamador e rpc_hr_convite_admissao_submeter. Expor isto a authenticated exigiria filtrar por permissao de leitura de cada tabela de origem, tal como a politica de pessoas_dados_alteracoes faz.';


-- ==============================================================================
-- RPC: submeter -- portao ANTES da conta, para o Vault nao ficar com orfaos
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
'Submissao final do convite de admissao. SO service_role. Consome o token atomicamente. pessoa_id e organization_id vem SO da linha do convite, nunca de p_dados. p_dados e PLANO, com prefixo de tabela so em morada_* -- a mesma forma que a Edge Function e o ecra usam, amarrada por teste. Cada ON CONFLICT distingue "a chave nem veio" de "veio a null": sem isso, uma submissao apagava a ficha inteira, NISS incluido. Chama hr_admissao_pendencias e RAISE se faltar campo de origem "pessoa" -- valida o RESULTADO e nao o pedido, para o token nao se gastar numa submissao vazia. A conta bancaria e a ULTIMA escrita, depois do portao: o vault.create_secret antes dele deixava segredos orfaos no Vault sempre que o portao disparava. Escreve em pessoas (so email_pessoal), pessoas_dados_pessoais, pessoas_identificacao (incl. niss), pessoas_moradas, pessoas_fardamento, pessoas_sindicalizacao e pessoas_dados_bancarios (IBAN, agora alcancavel).';


-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_corpo   text;
  v_chave   text;
  v_faltam  text[];
  -- As 39 chaves do contrato, por ordem alfabetica. A MESMA lista que
  -- src/lib/hr/conviteAdmissaoPayload.ts e a lista branca da Edge Function.
  v_chaves  text[] := ARRAY[
    'carta_conducao_categorias','carta_conducao_numero','carta_conducao_validade',
    'conjuge_situacao_profissional','conta_banco','conta_titular','data_nascimento',
    'dependentes','dependentes_deficientes','email_pessoal','estado_civil','genero',
    'habilitacao_academica','habilitacao_data_conclusao','iban','morada_codigo_postal',
    'morada_distrito','morada_linha1','morada_linha2','morada_localidade',
    'morada_pais','nacionalidade','naturalidade_concelho','naturalidade_freguesia',
    'naturalidade_pais','nif','niss','numero_documento','sindicalizado','sindicato',
    'tamanho_baixo','tamanho_baixo_detalhe','tamanho_blazer','tamanho_blazer_detalhe',
    'tamanho_cima','tamanho_cima_detalhe','telefone_pessoal','tipo_documento',
    'validade_documento'
  ];
BEGIN
  -- 1. As funcoes existem, com a aridade certa (pronargs, nunca texto).
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_campos_obrigatorios' AND p.pronargs = 0
  ) THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios() nao ficou criada.';
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_pendencias') <> 1 THEN
    RAISE EXCEPTION 'hr_admissao_pendencias nao esta exactamente uma vez -- duas aridades tornam a chamada ambigua.';
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_submeter') <> 1 THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter ficou com mais do que uma aridade.';
  END IF;

  -- 2. A lista de obrigatorios: 31 campos, 30 de origem "pessoa", 3 condicionais.
  IF (SELECT count(*) FROM public.hr_admissao_campos_obrigatorios()) <> 31 THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios() nao devolve 31 campos.';
  END IF;
  IF (SELECT count(*) FROM public.hr_admissao_campos_obrigatorios() WHERE origem = 'pessoa') <> 30 THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios() nao tem 30 campos de origem "pessoa".';
  END IF;
  IF (SELECT count(*) FROM public.hr_admissao_campos_obrigatorios() WHERE condicional) <> 3 THEN
    RAISE EXCEPTION 'Os condicionais deixaram de ser tres (validade_documento, conjuge_situacao_profissional, sindicato).';
  END IF;

  -- 3. A carta de conducao NAO pode ser obrigatoria: nem toda a gente tem carta.
  IF EXISTS (
    SELECT 1 FROM public.hr_admissao_campos_obrigatorios() WHERE codigo LIKE 'carta_conducao%'
  ) THEN
    RAISE EXCEPTION 'A carta de conducao entrou nos obrigatorios -- impediria de submeter quem nao tem carta.';
  END IF;

  -- 4. Nenhum acesso indevido: as funcoes sem sessao continuam so a
  --    service_role, e a de pendencias tambem (diz se o NISS e o IBAN existem).
  IF has_function_privilege('authenticated', 'public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter deixou de ser so service_role.';
  END IF;
  IF has_function_privilege('authenticated', 'public.hr_admissao_pendencias(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.hr_admissao_pendencias(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_admissao_pendencias tem de ser so service_role: diz se o NISS e a conta estao preenchidos.';
  END IF;

  SELECT pg_get_functiondef(
    'public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)'::regprocedure
  ) INTO v_corpo;

  -- 5. A promessa da lista branca, herdada de 20261124130000.
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
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter referencia permission -- a validade aqui e a do token.';
  END IF;
  IF v_corpo ILIKE '%pessoas_contas%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter referencia pessoas_contas -- o convite nao liga contas de utilizador.';
  END IF;

  -- 6. O CONTRATO: a RPC tem de LER todas as chaves do contrato. E a guarda
  --    que impede o desalinhamento de voltar -- do lado da base. Do lado do
  --    codigo, conviteAdmissaoContrato.test.ts faz a comparacao inversa.
  v_faltam := ARRAY[]::text[];
  FOREACH v_chave IN ARRAY v_chaves
  LOOP
    IF v_corpo NOT LIKE '%''' || v_chave || '''%' THEN
      v_faltam := v_faltam || v_chave;
    END IF;
  END LOOP;

  IF array_length(v_faltam, 1) > 0 THEN
    RAISE EXCEPTION
      'rpc_hr_convite_admissao_submeter nao le estas chaves do contrato: %. Foi exactamente este desalinhamento que apagava fichas inteiras.',
      array_to_string(v_faltam, ', ');
  END IF;

  -- 7. Nenhum ON CONFLICT pode ter voltado a ser incondicional nas colunas de
  --    negocio. O NISS e o caso-teste: era ele que se perdia.
  IF v_corpo NOT LIKE '%niss = CASE WHEN p_dados ? ''niss''%' THEN
    RAISE EXCEPTION 'O UPDATE do niss voltou a ser incondicional -- apagaria o NISS que o RH ja tinha posto.';
  END IF;

  -- 8. O portao tem de estar la -- e ANTES da gravacao da conta. Esta e a
  --    ordem que impede segredos orfaos no Vault quando o portao dispara.
  IF v_corpo NOT LIKE '%hr_admissao_pendencias%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter nao chama hr_admissao_pendencias -- ficou sem portao de obrigatorios.';
  END IF;
  IF strpos(v_corpo, 'hr_admissao_pendencias') > strpos(v_corpo, 'vault.create_secret') THEN
    RAISE EXCEPTION 'A gravacao da conta voltou a acontecer ANTES do portao -- um portao que dispare deixa o segredo orfao no Vault.';
  END IF;

  -- 9. A morada tem de CALCULAR is_principal, nunca fixa-lo em true.
  IF v_corpo NOT LIKE '%SELECT NOT EXISTS (%' THEN
    RAISE EXCEPTION 'A morada deixou de calcular is_principal -- fixa-lo em true rebenta quando a pessoa ja tem outra morada principal.';
  END IF;

  RAISE NOTICE 'OK: % chaves de contrato alinhadas, 30 obrigatorios de origem pessoa (3 condicionais), conta gravada depois do portao.',
    array_length(v_chaves, 1);
END;
$conferir$;


-- ==============================================================================
-- ANTES DO db push
--
-- 1. Esta migracao PRESSUPOE 20261127030000 aplicada (esta). Substitui o corpo
--    de _submeter com a MESMA aridade -- por isso CREATE OR REPLACE, sem risco
--    de duas candidatas -- e recria as duas funcoes de obrigatorios com
--    DROP+CREATE, reaplicando REVOKE, GRANT e COMMENT.
-- 2. A Edge Function `convite-admissao` TEM de ser publicada na mesma leva: e
--    ela que passa a reencaminhar `iban`, `conta_titular` e `conta_banco`. Com
--    a RPC nova e a Edge Function velha, nenhuma submissao passa -- a conta
--    nunca chega e o portao exige-a.
-- 3. Fichas ja existentes sem conta, fardamento ou sindicalizacao passam a
--    contar como incompletas em hr_admissao_pendencias. Isso nao quebra nada
--    hoje (a unica chamadora e a submissao do convite), mas e o numero a olhar
--    antes de ligar esta lista a qualquer ecra de retaguarda.
-- ==============================================================================
