-- ==============================================================================
-- Admissao: o BIC (codigo SWIFT) passa a ser um campo da conta bancaria, com
-- formato validado, configuravel como o IBAN, e que se grava mesmo sem IBAN.
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO NO MESMO DEPLOY. Esta migration e o codigo novo (src/ e
-- Edge Function convite-admissao) entram no MESMO deploy: com a migration
-- sozinha o portao de submeter passa a pedir conta_bic a um ecra que ainda nao
-- o mostra, e sem a lista branca nova da Edge Function (conta_swift) o BIC
-- nunca chega a RPC. Fazer `supabase functions deploy convite-admissao` no mesmo
-- momento do db push.
--
--
-- -- O QUE JA EXISTIA ----------------------------------------------------------
--
-- O BIC ja tem coluna: pessoas_dados_bancarios.swift (text, nullable, em claro,
-- criada em 20261120070000). NAO se cria coluna nem se renomeia: o nome do campo
-- no produto e BIC, na base continua swift. O CHECK antigo
-- pessoas_dados_bancarios_swift_formato so pedia 8 ou 11 alfanumericos (aceitava
-- ABCD1234, que NAO e um BIC). O BIC identifica o banco e nao a conta: nao se
-- cifra, nao se mascara e nao tem auditoria de acesso.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- 1. hr_bic_valido(text): 4 letras do banco, 2 do pais, 2 alfanumericos da
--    localidade e 3 opcionais da agencia (8 ou 11 caracteres). Maiusculas e sem
--    espacos; NULL devolve falso (quem chama trata a ausencia).
-- 2. O CHECK novo pessoas_dados_bancarios_swift_bic_formato substitui o antigo.
--    Entra NOT VALID e so se valida se nao houver linhas legadas que o violem;
--    com legado, as escritas NOVAS ja ficam validadas (o NOTICE diz quantas
--    linhas ficaram por validar, nunca os valores).
-- 3. conta_bic entra na lista de campos de origem pessoa (29 + 5 de origem rh),
--    e por isso e configuravel entre convite, ficha e opcional como o IBAN. Posicao
--    por omissao: convite.
-- 4. conta_bic tem permissao hr.pessoas.bancarios.view e le-se da coluna swift
--    nas pendencias.
-- 5. rpc_hr_convite_admissao_submeter valida o BIC (bic_invalido, SQLSTATE HRA18)
--    mesmo sem IBAN e grava-o mesmo sem IBAN (so o BIC, sem segredo no Vault).
-- 6. rpc_hr_convite_admissao_registar_recusa aceita bic_invalido.
-- 7. rpc_hr_definir_conta normaliza e valida o BIC (bic_invalido).
-- 8. NOVA rpc_hr_definir_bic(uuid, text): corrige so o BIC na ficha, sem repor o
--    IBAN. Gate hr.pessoas.bancarios.edit.
--
--
-- -- A LER COM ATENCAO ANTES DO PUSH -------------------------------------------
--
-- a) A CRIACAO DE ACESSO FICA TRAVADA para as fichas sem BIC ate ele ser
--    preenchido. Decisao do produto (o BIC e tratado como o IBAN): conta_bic nasce
--    com posicao por omissao 'convite' em TODAS as organizacoes, a Mudelar
--    incluida. A partir do push, TODA a ficha sem BIC passa a ter a pendencia
--    conta_bic e a Edge criar-acesso-pessoa recusa (409 ficha_incompleta) a
--    criacao de acesso a quem tiver pendencias de posicao convite ou ficha: o RH
--    carrega em criar acesso e recebe o 409 ate o BIC estar na ficha (rpc_hr_definir_bic
--    ou o convite). O convite novo tambem passa a exigi-lo. E o mesmo efeito que o
--    cargo teve em 20261210020000. Quem quiser o BIC como opcional ou so da ficha
--    configura-o no ecra de configuracao da admissao, organizacao a organizacao,
--    DEPOIS do push; esta migration nao toca na configuracao de nenhuma
--    organizacao (e nao se escreve a mao na da Mudelar).
-- b) O BIC nao se pre-preenche a partir do IBAN (nao ha fonte autoritativa).
-- c) Linhas legadas com um swift que o novo CHECK recusa (por exemplo
--    ABCD1234): mesmo com o CHECK NOT VALID, o Postgres avalia o CHECK em TODA
--    a escrita a essa linha, mesmo que o swift nao mude. Por isso: a submissao do
--    convite (ramo do IBAN) passa um swift legado invalido a NULL quando a pessoa
--    nao da BIC (em vez de rebentar com 23514), rpc_hr_definir_conta e
--    rpc_hr_definir_bic reescrevem o swift, e NAO ha mais nenhum caminho que
--    escreva em pessoas_dados_bancarios (confirmado por pesquisa nas migrations).
--    O numero de linhas legadas NAO foi medido no remoto: ler antes do push (so
--    contagem agregada, sem valores) e, se for alto, decidir uma migration de
--    dados a parte.
-- d) O BIC em branco na submissao do convite NUNCA apaga o BIC que o RH ja
--    gravou na ficha (nos dois ramos, com e sem IBAN). Para limpar um BIC usa-se
--    rpc_hr_definir_bic com vazio.
--
-- INTERFACE NOVA: rpc_hr_definir_bic devolve boolean (e nao void): true se
-- escreveu (criou ou alterou a linha), false se nao havia nada a alterar (BIC
-- vazio e a pessoa sem dados bancarios); o ecra pode distinguir os dois. Codigos
-- de erro novos: nenhum.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito (uma reversao na pasta e
-- aplicada pelo db push). A mao: repor as versoes de 20261210020000
-- (hr_admissao_campos_obrigatorios, hr_admissao_campo_permissao,
-- hr_admissao_pendencias), de 20261210030000 (rpc_hr_convite_admissao_submeter,
-- rpc_hr_convite_admissao_registar_recusa) e de 20261125030000
-- (rpc_hr_definir_conta); largar rpc_hr_definir_bic e hr_bic_valido, e repor o
-- CHECK pessoas_dados_bancarios_swift_formato.
--
--
-- Prerequisitos:
--   20261120070000  pessoas_dados_bancarios.swift, hr_iban_valido
--   20261125030000  rpc_hr_definir_conta com 7 argumentos
--   20261210020000  hr_admissao_campos_obrigatorios, _campo_permissao, _pendencias
--   20261210030000  rpc_hr_convite_admissao_submeter (HRA17),
--                   rpc_hr_convite_admissao_registar_recusa
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
-- Conta-se o NUMERO de argumentos (pronargs); nao se compara a lista por texto.
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_dados_bancarios'
       AND column_name = 'swift'
  ) THEN
    RAISE EXCEPTION 'pessoas_dados_bancarios.swift nao existe. Aplicar 20261120070000 primeiro.';
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_definir_conta';
  IF v_n <> 1 OR NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_definir_conta' AND p.pronargs = 7
  ) THEN
    RAISE EXCEPTION 'rpc_hr_definir_conta devia existir UMA vez, com 7 argumentos (20261125030000); ha % com esse nome.', v_n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_submeter'
       AND p.pronargs = 5 AND p.prosrc LIKE '%HRA17%'
  ) THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter (5 argumentos, com HRA17) nao existe. Aplicar 20261210030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_pendencias'
       AND p.pronargs = 1 AND pg_get_function_result(p.oid) LIKE '%posicao%'
  ) THEN
    RAISE EXCEPTION 'hr_admissao_pendencias(uuid) nao devolve a coluna posicao. Aplicar 20261210020000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_registar_recusa'
       AND p.pronargs = 4
  ) THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_registar_recusa (4 argumentos) nao existe. Aplicar 20261210030000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. hr_bic_valido: a forma de um BIC
--    Nao normaliza: recebe maiusculas e sem espacos (quem chama normaliza).
--    NULL devolve falso. Espelhada em src/lib/hr/conta.ts (bicValido); se
--    divergirem, manda a base.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_bic_valido(p_bic text)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT p_bic IS NOT NULL
     AND p_bic ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$';
$$;

REVOKE ALL ON FUNCTION public.hr_bic_valido(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_bic_valido(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_bic_valido(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_bic_valido(text) TO service_role;

COMMENT ON FUNCTION public.hr_bic_valido(text) IS
'Verdadeiro se o texto tem a forma de um BIC (codigo SWIFT): 4 letras do banco, 2 do pais, 2 alfanumericos da localidade e, opcionalmente, 3 da agencia (8 ou 11 caracteres). Nao normaliza: espera maiusculas e sem espacos. NULL devolve falso (quem chama trata a ausencia). Desde 20261210040000. Espelhada em src/lib/hr/conta.ts (bicValido).';

-- ==============================================================================
-- 2. O CHECK do formato do BIC
--    Entra NOT VALID e so se valida se nao houver legado que o viole. A base
--    remota nao se consulta fora do push: a contagem so se ve no NOTICE.
-- ==============================================================================
ALTER TABLE public.pessoas_dados_bancarios
  DROP CONSTRAINT IF EXISTS pessoas_dados_bancarios_swift_bic_formato;

ALTER TABLE public.pessoas_dados_bancarios
  ADD CONSTRAINT pessoas_dados_bancarios_swift_bic_formato
    CHECK (swift IS NULL OR public.hr_bic_valido(swift))
    NOT VALID;

ALTER TABLE public.pessoas_dados_bancarios
  DROP CONSTRAINT IF EXISTS pessoas_dados_bancarios_swift_formato;

DO $validar$
DECLARE
  v_legado integer;
BEGIN
  SELECT count(*) INTO v_legado
    FROM public.pessoas_dados_bancarios b
   WHERE b.swift IS NOT NULL
     AND NOT public.hr_bic_valido(b.swift);

  IF v_legado = 0 THEN
    ALTER TABLE public.pessoas_dados_bancarios
      VALIDATE CONSTRAINT pessoas_dados_bancarios_swift_bic_formato;
    RAISE NOTICE 'swift: nenhuma linha viola o formato do BIC; constraint validada.';
  ELSE
    RAISE NOTICE 'swift: % linha(s) legadas violam o formato do BIC; a constraint fica NOT VALID (as escritas novas ja ficam validadas). Os valores nao se mostram.', v_legado;
  END IF;
END;
$validar$;

-- ==============================================================================
-- 3. hr_admissao_campos_obrigatorios: conta_bic, a seguir a conta_banco
--    MESMA assinatura; corpo de 20261210020000 (sec. 1) com UMA linha nova. O
--    formato de linha ('codigo', 'origem', bool) tem de se manter EXACTAMENTE:
--    conviteAdmissaoContrato.test.ts le-o por regex.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_admissao_campos_obrigatorios()
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
    ('conta_bic',                     'pessoa', false),
    ('data_admissao',                 'rh',     false),
    ('cargo',                         'rh',     false),
    ('tipo_contrato',                 'rh',     false),
    ('subsidio_alimentacao',          'rh',     false),
    ('duodecimos',                    'rh',     false)
    -- GANCHO: o campo tipo_horario (origem rh) entra aqui no lote dos horarios.
  ) AS t(codigo, origem, condicional);
$$;

REVOKE ALL ON FUNCTION public.hr_admissao_campos_obrigatorios() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_campos_obrigatorios() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campos_obrigatorios() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campos_obrigatorios() TO service_role;

COMMENT ON FUNCTION public.hr_admissao_campos_obrigatorios() IS
'Os campos da admissao. Origem pessoa: 29 campos que a pessoa preenche no convite (configuraveis por organizacao entre convite, ficha e opcional; desde 20261210040000 inclui conta_bic, o BIC da conta bancaria). Origem rh: 5 campos FIXOS (data_admissao, cargo, tipo_contrato, subsidio_alimentacao, duodecimos) que o RH preenche na ficha e que nunca sao configuraveis. Espelhada em src/lib/hr/admissaoObrigatorios.ts (so os de origem pessoa).';

-- ==============================================================================
-- 4. hr_admissao_campo_permissao: conta_bic tem permissao
--    Sem uma linha aqui o JOIN de hr_admissao_pendencias deita o campo fora em
--    silencio. Corpo de 20261210020000 (sec. 2) com UMA linha nova.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_admissao_campo_permissao()
RETURNS TABLE (codigo text, tabela text, permissao text)
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT *
  FROM (VALUES
    ('email_pessoal',                 'pessoas',                  'hr.pessoas.view'),
    ('data_admissao',                 'pessoas',                  'hr.pessoas.view'),
    ('cargo',                         'pessoas',                  'hr.pessoas.view'),
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
    ('tipo_contrato',                 'pessoas_vinculos',         'hr.pessoas.vinculos.view'),
    ('subsidio_alimentacao',          'pessoas_retribuicoes',     'hr.pessoas.retribuicao.view'),
    ('duodecimos',                    'pessoas_retribuicoes',     'hr.pessoas.retribuicao.view'),
    ('sindicalizado',                 'pessoas_sindicalizacao',   'hr.pessoas.sindicalizacao.view'),
    ('sindicato',                     'pessoas_sindicalizacao',   'hr.pessoas.sindicalizacao.view'),
    ('conta_numero',                  'pessoas_dados_bancarios',  'hr.pessoas.bancarios.view'),
    ('conta_titular',                 'pessoas_dados_bancarios',  'hr.pessoas.bancarios.view'),
    ('conta_banco',                   'pessoas_dados_bancarios',  'hr.pessoas.bancarios.view'),
    ('conta_bic',                     'pessoas_dados_bancarios',  'hr.pessoas.bancarios.view')
  ) AS t(codigo, tabela, permissao);
$$;

REVOKE ALL ON FUNCTION public.hr_admissao_campo_permissao() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_campo_permissao() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campo_permissao() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campo_permissao() TO service_role;

COMMENT ON FUNCTION public.hr_admissao_campo_permissao() IS
'Para cada campo de admissao, a tabela que o guarda e a permissao precisa para saber se esta preenchido. Inclui os campos de origem rh: cargo (hr.pessoas.view), tipo_contrato (hr.pessoas.vinculos.view), subsidio_alimentacao e duodecimos (hr.pessoas.retribuicao.view); e, desde 20261210040000, conta_bic (hr.pessoas.bancarios.view). Sem uma linha aqui, hr_admissao_pendencias deita o codigo fora em silencio.';

-- ==============================================================================
-- 5. hr_admissao_pendencias: le o BIC da coluna swift
--    MESMO RETURNS TABLE (por isso CREATE OR REPLACE, sem largar). Corpo de
--    20261210020000 (sec. 7) com UMA linha nova no CTE estado. Sem condicao
--    especial no WHERE final: o BIC e pendencia como qualquer outro campo.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_admissao_pendencias(p_pessoa_id uuid)
RETURNS TABLE (codigo text, origem text, posicao text)
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
      p.cargo_id::text                                       AS cargo,
      vin.tipo_contrato                                      AS tipo_contrato,
      ret.subsidio_alimentacao                               AS subsidio_alimentacao,
      ret.duodecimos                                         AS duodecimos,
      -- GANCHO: o campo tipo_horario entra aqui no lote dos horarios.
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
      nullif(btrim(coalesce(b.banco, '')), '')               AS conta_banco,
      nullif(btrim(coalesce(b.swift, '')), '')               AS conta_bic
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
    -- Conta como tipo de contrato um vinculo nao apagado, activo ou futuro
    -- (o activo primeiro). Um contrato so terminado nao conta.
    LEFT JOIN LATERAL (
      SELECT vv.tipo_contrato
      FROM public.pessoas_vinculos vv
      WHERE vv.pessoa_id = p.id
        AND vv.deleted_at IS NULL
        AND vv.estado IN ('activo', 'futuro')
      ORDER BY (vv.estado = 'activo') DESC, vv.data_inicio DESC
      LIMIT 1
    ) vin ON true
    -- A retribuicao em aberto. Subsidio 0 conta como preenchido (so NULL e
    -- pendencia); sem retribuicao aberta, ambos sao pendencia.
    LEFT JOIN LATERAL (
      SELECT rr.subsidio_alimentacao::text AS subsidio_alimentacao,
             rr.duodecimos_pct::text       AS duodecimos
      FROM public.pessoas_retribuicoes rr
      WHERE rr.pessoa_id = p.id
        AND rr.valido_ate IS NULL
        AND rr.deleted_at IS NULL
      LIMIT 1
    ) ret ON true
    WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL
  )
  SELECT c.codigo, c.origem, c.posicao
  FROM estado e
  CROSS JOIN public.hr_admissao_campos_obrigatorios_org(v_org) c
  JOIN public.hr_admissao_campo_permissao() cp ON cp.codigo = c.codigo
  WHERE (to_jsonb(e) ->> c.codigo) IS NULL
    AND c.posicao IN ('convite', 'ficha')
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
'O que a ficha desta pessoa AINDA NAO tem, entre os campos de admissao cuja posicao e convite ou ficha (um campo opcional nunca e pendencia). Devolve codigo, origem e posicao -- nunca valores. Le tambem cargo, tipo de contrato (vinculo nao apagado, activo ou futuro), a retribuicao em aberto (subsidio de alimentacao e duodecimos; subsidio 0 conta como preenchido) e, desde 20261210040000, o BIC (coluna swift de pessoas_dados_bancarios, codigo conta_bic). Mantem o gate (recusa a quem nao pode ver a ficha; a propria pessoa ve o que e seu), a permissao por codigo, as excepcoes validade_documento, conjuge e NIF-ou-NISS, e o ramo de servico (auth.uid() NULL devolve tudo, o que sustenta o portao da submissao e a guarda de criar-acesso-pessoa).';

-- ==============================================================================
-- 6. rpc_hr_convite_admissao_registar_recusa: bic_invalido e codigo de recusa
--    Corpo de 20261210030000 (sec. 4) com UMA mudanca: 'bic_invalido' na lista
--    c_codigos. Sem ele a recusa devolvia false em silencio e nao ficava
--    registada para o RH.
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
    'pais_invalido', 'iban_invalido', 'bic_invalido', 'admissao_incompleta',
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
'Guarda a ultima recusa da submissao no convite (codigo, momento, campos em falta, e nos duplicados as fichas em conflito da MESMA organizacao). So aceita os 10 codigos de recusa de submissao (desde 20261210040000 inclui bic_invalido); so actua num convite por usar e nao revogado. Devolve true se registou e false se ignorou (codigo fora da lista ou convite inexistente, usado ou revogado). nif_ja_existe e niss_ja_existe contam em attempts (tecto 10); as outras recusas nao. SO service_role: chamada pela Edge Function convite-admissao, melhor-esforco.';

-- ==============================================================================
-- 7. rpc_hr_convite_admissao_submeter: valida e grava o BIC
--    Corpo de 20261210030000 (sec. 7) COPIADO. Linhas acrescentadas (e mais
--    nenhuma): v_conta_bic no DECLARE; a normalizacao; a validacao HRA18 a
--    seguir ao bloco do IBAN e antes do portao; a dispensa de conta_bic no
--    portao; o BIC normalizado no INSERT do ramo do IBAN; e o ramo novo que
--    grava so o BIC quando nao ha IBAN. NAO toca no UPDATE de consumo do
--    convite nem no RETURN: quem redefinir submeter depois parte desta versao.
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
  v_conta_bic  text;
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
  -- O BIC (coluna swift) viaja como conta_swift. Maiusculas e sem espacos, como o IBAN.
  v_conta_bic := nullif(upper(regexp_replace(coalesce(public.hr_json_texto(p_dados, 'conta_swift'), ''), '[[:space:]]', '', 'g')), '');

  IF v_conta_num IS NOT NULL THEN
    v_conta_num := upper(regexp_replace(v_conta_num, '[[:space:]]', '', 'g'));

    IF NOT public.hr_iban_valido(v_conta_num) THEN
      RAISE EXCEPTION 'iban_invalido' USING ERRCODE = 'HRA16';
    END IF;
  END IF;

  -- O BIC valida-se mesmo sem IBAN: a pessoa pode dar um e deixar o outro para a ficha.
  IF v_conta_bic IS NOT NULL AND NOT public.hr_bic_valido(v_conta_bic) THEN
    RAISE EXCEPTION 'bic_invalido' USING ERRCODE = 'HRA18';
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
     AND NOT (pend.codigo = 'conta_banco'   AND v_conta_num IS NOT NULL AND v_conta_bco IS NOT NULL)
     AND NOT (pend.codigo = 'conta_bic'     AND v_conta_bic IS NOT NULL);

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
      v_conta_bic, true
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
      -- Um BIC dado grava-se; um BIC em branco NUNCA apaga o que ja esta na ficha
      -- (igual ao ramo so-BIC, que so corre com BIC preenchido); e um swift legado
      -- que nao e um BIC (o CHECK antigo aceitava ABCD1234) passa a NULL em vez de
      -- fazer este UPDATE falhar com 23514 contra o CHECK NOT VALID.
      swift = CASE
        WHEN v_conta_bic IS NOT NULL THEN EXCLUDED.swift
        WHEN public.hr_bic_valido(pessoas_dados_bancarios.swift) THEN pessoas_dados_bancarios.swift
        ELSE NULL END,
      updated_at = now();

    PERFORM public.hr_registar_acesso_sensivel(v_pessoa_id, v_org, 'conta_bancaria', 'alterar');
  END IF;

  -- So o BIC, sem IBAN. O BIC identifica o banco e nao a conta: nao e sensivel,
  -- por isso nao leva segredo no Vault nem auditoria de acesso. conta_secret_id e
  -- conta_ultimos4 ficam NULL (o CHECK de segredo e mascara aceita os dois a NULL) e
  -- a pendencia conta_numero continua.
  IF v_conta_num IS NULL AND v_conta_bic IS NOT NULL THEN
    INSERT INTO public.pessoas_dados_bancarios (
      pessoa_id, organization_id, swift, is_principal
    ) VALUES (
      v_pessoa_id, v_org, v_conta_bic, true
    )
    ON CONFLICT (pessoa_id) DO UPDATE SET
      swift = EXCLUDED.swift,
      updated_at = now();
  END IF;

  RETURN v_pessoa_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text) IS
'Submissao final do convite de admissao. SO service_role. Corpo de 20261202080000 com: codigos de erro com SQLSTATE proprio HRA* (a MESSAGE e o codigo); motivo exacto quando o convite nao se consome (convite_invalido, _ja_usado, _revogado, _expirado); NIF e NISS validados pelo digito de controlo logo a seguir ao consumo; duplicados com os pessoa_id no DETAIL (so a Edge Function o le); portao so pelos campos de origem pessoa e posicao convite, com os codigos em falta no DETAIL de admissao_incompleta (ver 20261210030000). Desde 20261210040000 valida o BIC (conta_swift) com bic_invalido, SQLSTATE HRA18, e grava-o mesmo sem IBAN; um BIC em branco nunca apaga o da ficha (nos dois ramos) e, no ramo do IBAN, um swift legado que nao e um BIC passa a NULL (senao o UPDATE falhava contra o CHECK NOT VALID). Tudo ou nada: qualquer RAISE desfaz o consumo do convite, as escritas e o segredo criado no Vault.';

-- ==============================================================================
-- 8. rpc_hr_definir_conta: normaliza e valida o BIC
--    MESMA assinatura de 7 argumentos (CREATE OR REPLACE, NUNCA DROP + CREATE:
--    duas candidatas ja pararam o PostgREST). Corpo de 20261125030000.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_definir_conta(
  p_pessoa_id uuid,
  p_formato   text,
  p_conta     text,
  p_titular   text DEFAULT NULL,
  p_banco     text DEFAULT NULL,
  p_agencia   text DEFAULT NULL,
  p_swift     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org       uuid;
  v_conta     text;
  v_formato   text;
  v_pais      text;
  v_linha     record;
  v_secret_id uuid;
  v_anew      uuid;
  v_swift     text;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pessoas p
  WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'pessoa_nao_encontrada';
  END IF;

  IF NOT public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.bancarios.edit', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  v_formato := coalesce(p_formato, 'iban');

  IF v_formato NOT IN ('iban','conta_mais_sort_code','conta_mais_routing',
                       'clabe','banco_mais_conta','outro') THEN
    RAISE EXCEPTION 'formato_invalido';
  END IF;

  -- Normalizacao unica para todos os formatos: maiusculas, sem espacos.
  v_conta := upper(regexp_replace(coalesce(p_conta, ''), '[[:space:]]', '', 'g'));

  IF v_formato = 'iban' THEN
    -- O ramo do IBAN NAO foi tocado por esta migracao: continua o mod-97
    -- completo, pela mesma funcao de 20261120070000.
    IF NOT public.hr_iban_valido(v_conta) THEN
      RAISE EXCEPTION 'iban_invalido';
    END IF;
    v_pais := left(v_conta, 2);
  ELSE
    IF v_conta !~ '^[0-9A-Z]{4,34}$' THEN
      RAISE EXCEPTION 'conta_invalida';
    END IF;
    v_pais := NULL;
  END IF;

  -- O BIC: maiusculas e sem espacos; vazio e ausencia (limpa). Valida-se aqui, com
  -- uma mensagem simples (sem ERRCODE), como o iban_invalido desta funcao.
  v_swift := nullif(upper(regexp_replace(coalesce(p_swift, ''), '[[:space:]]', '', 'g')), '');
  IF v_swift IS NOT NULL AND NOT public.hr_bic_valido(v_swift) THEN
    RAISE EXCEPTION 'bic_invalido';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1;

  SELECT b.id, b.conta_secret_id INTO v_linha
  FROM public.pessoas_dados_bancarios b
  WHERE b.pessoa_id = p_pessoa_id;

  IF v_linha.id IS NOT NULL AND v_linha.conta_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_linha.conta_secret_id, v_conta);
    v_secret_id := v_linha.conta_secret_id;
  ELSE
    v_secret_id := vault.create_secret(
      v_conta,
      'hr_conta:' || p_pessoa_id::text || ':' || gen_random_uuid()::text,
      'Conta bancaria de RH da pessoa ' || p_pessoa_id::text || ' (formato ' || v_formato || ')'
    );
  END IF;

  INSERT INTO public.pessoas_dados_bancarios
    (pessoa_id, organization_id, titular, banco, agencia, formato_conta,
     conta_secret_id, conta_ultimos4, conta_pais, swift,
     is_principal, created_by, updated_by)
  VALUES
    (p_pessoa_id, v_org, p_titular, p_banco, p_agencia, v_formato,
     v_secret_id, right(v_conta, 4), v_pais, v_swift,
     true, v_anew, v_anew)
  ON CONFLICT (pessoa_id) DO UPDATE SET
    titular         = EXCLUDED.titular,
    banco           = EXCLUDED.banco,
    agencia         = EXCLUDED.agencia,
    formato_conta   = EXCLUDED.formato_conta,
    conta_secret_id = EXCLUDED.conta_secret_id,
    conta_ultimos4  = EXCLUDED.conta_ultimos4,
    conta_pais      = EXCLUDED.conta_pais,
    swift           = EXCLUDED.swift,
    updated_by      = EXCLUDED.updated_by,
    updated_at      = now();

  PERFORM public.hr_registar_acesso_sensivel(p_pessoa_id, v_org, 'conta_bancaria', 'alterar');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_definir_conta(uuid, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_definir_conta(uuid, text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_definir_conta(uuid, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_definir_conta(uuid, text, text, text, text, text, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_definir_conta(uuid, text, text, text, text, text, text) IS
'Unico caminho para escrever a conta bancaria de RH, em qualquer dos seis formatos. Exige hr.pessoas.bancarios.edit na organizacao da pessoa. Valida conforme o formato: mod-97 completo por hr_iban_valido quando formato = ''iban'', e ^[0-9A-Z]{4,34}$ nos restantes. Guarda o numero cifrado no Vault e grava na linha apenas a referencia, os ultimos quatro caracteres, o formato, a agencia (em claro) e -- so no caso IBAN -- o pais. Desde 20261210040000 normaliza o BIC (p_swift: maiusculas, sem espacos; vazio limpa) e valida-o com hr_bic_valido (bic_invalido). Registra em pessoas_acessos_sensiveis com campo = ''conta_bancaria''. Mantem a assinatura de 7 argumentos de 20261125030000 (duas candidatas deixam o PostgREST sem saber qual escolher).';

-- ==============================================================================
-- 9. rpc_hr_definir_bic: corrigir so o BIC, sem repor o IBAN
--     rpc_hr_definir_conta exige a conta; por ela, corrigir um BIC obrigava a
--     reescrever o IBAN. O BIC identifica o banco e nao a conta: nao e
--     sensivel, nao vai ao Vault e nao tem auditoria de acesso. Cria a linha se
--     nao existir (conta_secret_id e conta_ultimos4 ficam NULL, o que o CHECK
--     de segredo e mascara aceita). BIC vazio limpa a coluna e nunca cria linha.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_definir_bic(
  p_pessoa_id uuid,
  p_bic       text
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org   uuid;
  v_bic   text;
  v_anew  uuid;
  v_n     integer;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pessoas p
  WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'pessoa_nao_encontrada';
  END IF;

  IF NOT public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.bancarios.edit', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  v_bic := nullif(upper(regexp_replace(coalesce(p_bic, ''), '[[:space:]]', '', 'g')), '');

  IF v_bic IS NOT NULL AND NOT public.hr_bic_valido(v_bic) THEN
    RAISE EXCEPTION 'bic_invalido';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1;

  IF v_bic IS NULL THEN
    UPDATE public.pessoas_dados_bancarios
       SET swift      = NULL,
           updated_by = v_anew,
           updated_at = now()
     WHERE pessoa_id = p_pessoa_id AND organization_id = v_org;
    -- Sem linha de dados bancarios nao ha nada a limpar: devolve false, para o
    -- ecra nao dizer "guardado" quando nada foi gravado.
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n > 0;
  END IF;

  INSERT INTO public.pessoas_dados_bancarios
    (pessoa_id, organization_id, swift, is_principal, created_by, updated_by)
  VALUES
    (p_pessoa_id, v_org, v_bic, true, v_anew, v_anew)
  ON CONFLICT (pessoa_id) DO UPDATE SET
    swift      = EXCLUDED.swift,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_definir_bic(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_definir_bic(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_definir_bic(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_definir_bic(uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_definir_bic(uuid, text) IS
'Corrige so o BIC (coluna swift) da conta bancaria da pessoa, sem tocar no IBAN. Exige hr.pessoas.bancarios.edit na organizacao da pessoa. Normaliza (maiusculas, sem espacos) e valida com hr_bic_valido (bic_invalido); vazio limpa o BIC e nunca cria linha. Cria a linha de dados bancarios se nao existir, sem segredo no Vault. Devolve boolean: true se escreveu, false se nao havia nada a alterar (BIC vazio e sem linha de dados bancarios). Sem auditoria de acesso: o BIC identifica o banco, nao a conta (fica updated_by e updated_at). Desde 20261210040000.';

-- ==============================================================================
-- Conferir: nao escreve dados (por isso sem sentinela). Falha o push se algo
-- estiver diferente do esperado.
-- ==============================================================================
DO $conferir$
DECLARE
  v_invalido text;
  v_pessoa   integer;
  v_rh       integer;
  v_n        integer;
  v_convite  integer;
  v_ficha    integer;
  v_cond     boolean;
  v_papel    text;
  v_corpo    text;
BEGIN
  -- 1. hr_bic_valido, executada.
  IF NOT public.hr_bic_valido('CGDIPTPL') THEN
    RAISE EXCEPTION 'hr_bic_valido devia aceitar CGDIPTPL (8 caracteres).';
  END IF;
  IF NOT public.hr_bic_valido('CGDIPTPLXXX') THEN
    RAISE EXCEPTION 'hr_bic_valido devia aceitar CGDIPTPLXXX (11 caracteres).';
  END IF;
  FOREACH v_invalido IN ARRAY ARRAY[
    'CGDIPTP',        -- 7 caracteres
    'CGDIPTPLXX',     -- 10 caracteres
    'CGDIPTPLXXXX',   -- 12 caracteres
    'cgdiptpl',       -- minusculas
    'CGDI1TPL',       -- digito nas posicoes 5-6
    'ABCD1234',       -- o que o CHECK antigo aceitava
    ''                -- vazio
  ] LOOP
    IF public.hr_bic_valido(v_invalido) THEN
      RAISE EXCEPTION 'hr_bic_valido aceitou [%], que nao e um BIC.', v_invalido;
    END IF;
  END LOOP;
  IF public.hr_bic_valido(NULL::text) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'hr_bic_valido(NULL) devia devolver falso.';
  END IF;

  -- 2. A lista: 29 de origem pessoa e 5 de origem rh (codigos distintos).
  SELECT count(DISTINCT codigo) FILTER (WHERE origem = 'pessoa'),
         count(DISTINCT codigo) FILTER (WHERE origem = 'rh')
    INTO v_pessoa, v_rh
    FROM public.hr_admissao_campos_obrigatorios();
  IF v_pessoa <> 29 OR v_rh <> 5 THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios() tem % de origem pessoa e % de origem rh; esperavam-se 29 e 5.', v_pessoa, v_rh;
  END IF;

  SELECT c.condicional INTO v_cond
    FROM public.hr_admissao_campos_obrigatorios() c
   WHERE c.codigo = 'conta_bic' AND c.origem = 'pessoa';
  IF v_cond IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'conta_bic devia existir com origem pessoa e condicional falso.';
  END IF;

  SELECT count(DISTINCT c.codigo) INTO v_n
    FROM public.hr_admissao_campos_obrigatorios() c
   WHERE NOT EXISTS (SELECT 1 FROM public.hr_admissao_campo_permissao() cp WHERE cp.codigo = c.codigo);
  IF v_n <> 0 THEN
    RAISE EXCEPTION '% campo(s) de admissao sem permissao em hr_admissao_campo_permissao().', v_n;
  END IF;

  -- 3. _org para uma organizacao inexistente: 34 linhas, 29 convite, 5 ficha.
  SELECT count(DISTINCT codigo),
         count(DISTINCT codigo) FILTER (WHERE posicao = 'convite' AND origem = 'pessoa'),
         count(DISTINCT codigo) FILTER (WHERE posicao = 'ficha'   AND origem = 'rh')
    INTO v_n, v_convite, v_ficha
    FROM public.hr_admissao_campos_obrigatorios_org('00000000-0000-0000-0000-000000000000'::uuid);
  IF v_n <> 34 OR v_convite <> 29 OR v_ficha <> 5 THEN
    RAISE EXCEPTION '_org devolve % codigos (% convite, % ficha); esperavam-se 34 (29, 5).', v_n, v_convite, v_ficha;
  END IF;

  -- 4. O override aceita e recusa conta_bic (so leitura: nao grava nada).
  IF NOT public.hr_admissao_campos_override_validos('{"conta_bic": "ficha"}'::jsonb) THEN
    RAISE EXCEPTION 'O validador devia aceitar {"conta_bic":"ficha"}.';
  END IF;
  IF public.hr_admissao_campos_override_validos('{"conta_bic": "x"}'::jsonb) THEN
    RAISE EXCEPTION 'O validador aceitou {"conta_bic":"x"}.';
  END IF;

  -- 5. As funcoes e a constraint.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'rpc_hr_definir_conta';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Existem % funcoes rpc_hr_definir_conta e devia existir 1.', v_n;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname = 'rpc_hr_definir_conta' AND p.pronargs = 7
  ) THEN
    RAISE EXCEPTION 'rpc_hr_definir_conta deixou de ter 7 argumentos.';
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'rpc_hr_definir_bic' AND p.pronargs = 2;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'rpc_hr_definir_bic(uuid, text) devia existir uma vez; ha %.', v_n;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname = 'rpc_hr_definir_bic' AND p.pronargs = 2
       AND pg_get_function_result(p.oid) = 'boolean'
  ) THEN
    RAISE EXCEPTION 'rpc_hr_definir_bic devia devolver boolean (true se escreveu, false se nao havia nada a alterar).';
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_constraint k
   WHERE k.conrelid = to_regclass('public.pessoas_dados_bancarios')
     AND k.conname = 'pessoas_dados_bancarios_swift_bic_formato';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'A constraint pessoas_dados_bancarios_swift_bic_formato devia existir.';
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_constraint k
   WHERE k.conrelid = to_regclass('public.pessoas_dados_bancarios')
     AND k.conname = 'pessoas_dados_bancarios_swift_formato';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'A constraint antiga pessoas_dados_bancarios_swift_formato devia ter sido largada.';
  END IF;

  -- 6. Privilegios.
  IF has_function_privilege('anon', 'public.hr_bic_valido(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.hr_bic_valido(text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.hr_bic_valido(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_bic_valido: privilegios errados.';
  END IF;

  FOREACH v_papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_function_privilege(v_papel, 'public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)', 'EXECUTE') THEN
      RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter ficou executavel por %.', v_papel;
    END IF;
    IF has_function_privilege(v_papel, 'public.rpc_hr_convite_admissao_registar_recusa(text, text, text[], uuid[])', 'EXECUTE') THEN
      RAISE EXCEPTION 'rpc_hr_convite_admissao_registar_recusa ficou executavel por %.', v_papel;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role', 'public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.rpc_hr_convite_admissao_registar_recusa(text, text, text[], uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'submeter ou registar_recusa deixaram de ser executaveis por service_role.';
  END IF;

  IF has_function_privilege('anon', 'public.rpc_hr_definir_conta(uuid, text, text, text, text, text, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.rpc_hr_definir_conta(uuid, text, text, text, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_hr_definir_conta: privilegios errados.';
  END IF;
  IF has_function_privilege('anon', 'public.rpc_hr_definir_bic(uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.rpc_hr_definir_bic(uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.rpc_hr_definir_bic(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_hr_definir_bic: privilegios errados.';
  END IF;

  -- 7. Os corpos nao perderam nada e levam o BIC.
  SELECT p.prosrc INTO v_corpo
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_submeter' AND p.pronargs = 5;
  IF v_corpo NOT LIKE '%HRA18%' OR v_corpo NOT LIKE '%hr_bic_valido%' OR v_corpo NOT LIKE '%HRA17%' THEN
    RAISE EXCEPTION 'O corpo de rpc_hr_convite_admissao_submeter nao tem HRA18, hr_bic_valido e HRA17.';
  END IF;
  IF v_corpo NOT LIKE '%hr_bic_valido(pessoas_dados_bancarios.swift)%' THEN
    RAISE EXCEPTION 'O corpo de rpc_hr_convite_admissao_submeter perdeu o tratamento do swift legado invalido.';
  END IF;

  SELECT p.prosrc INTO v_corpo
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_registar_recusa' AND p.pronargs = 4;
  IF v_corpo NOT LIKE '%bic_invalido%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_registar_recusa nao aceita bic_invalido.';
  END IF;

  -- 8. Executadas: submeter com um token inexistente tem de devolver HRA01 (prova
  --    que corre, nao so que foi escrita), e as pendencias de uma pessoa
  --    inexistente nao rebentam. Nenhuma das duas escreve.
  BEGIN
    PERFORM public.rpc_hr_convite_admissao_submeter(
      'conferir-bic-token-inexistente', '{}'::jsonb, NULL::text, NULL::inet, NULL::text);
    RAISE EXCEPTION 'submeter devia ter recusado um token inexistente.';
  EXCEPTION
    WHEN SQLSTATE 'HRA01' THEN
      NULL; -- esperado
  END;

  PERFORM 1 FROM public.hr_admissao_pendencias('00000000-0000-0000-0000-000000000000'::uuid);

  RAISE NOTICE 'OK: hr_bic_valido, 29 campos de origem pessoa (conta_bic incluido) e 5 de origem rh, constraint swift_bic_formato, submeter e registar_recusa com bic_invalido, rpc_hr_definir_conta (7 argumentos) e rpc_hr_definir_bic.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. Esta migration e o codigo novo (src/ e Edge Function convite-admissao)
--    entram no MESMO deploy. Deploy da Edge Function no mesmo momento do push.
--
-- 2. Listar o pendente imediatamente antes do push (supabase migration list
--    --linked): o push aplica TUDO o que estiver na pasta, por ordem. Os anexos
--    (20261210050000 e seguintes) redefinem rpc_hr_convite_admissao_submeter A
--    PARTIR desta versao.
--
-- 3. Correr os testes ANTES do push, contra o remoto ainda por corrigir: com a
--    sessao de um utilizador real da nike, numa pessoa de TESTE da nike
--    (organization_id b6ffce4f-f630-4933-833a-008649757a33), rpc_hr_definir_conta
--    com um IBAN valido e p_swift = ABCD1234 ACEITA e grava (o CHECK antigo so
--    olha para alfanumerico) -- e o vermelho; limpar depois com p_swift nulo.
--    Depois do push NAO se volta atras para demonstrar o vermelho.
--
-- 4. Efeito em todas as organizacoes: ver "A LER COM ATENCAO" no cabecalho
--    (pendencia conta_bic em toda a ficha sem BIC, e criar-acesso-pessoa: a
--    criacao de acesso fica TRAVADA para fichas sem BIC ate ele ser preenchido).
--    Dizer ao utilizador o que muda para a Mudelar e esperar autorizacao.
--
-- 5. Ler antes do push (so leitura, so contagem agregada, sem valores): quantas
--    linhas de pessoas_dados_bancarios tem swift preenchido que hr_bic_valido
--    recusa (o CHECK fica NOT VALID se houver alguma; ver "A LER COM ATENCAO", c).
-- ==============================================================================
