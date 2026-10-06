-- ==============================================================================
-- Admissao: cada campo passa a ter UMA de TRES posicoes (convite, ficha,
-- opcional), e a admissao ganha cinco campos do RH. Lote A, migration 2 de 3.
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO NO MESMO COMMIT: o hook
-- src/hooks/useConfiguracaoObrigatoriosAdmissao.ts e o ecra
-- src/pages/ConfiguracaoAdmissao.tsx (e src/lib/hr/errosAdmissao.ts).
-- Mas e tolerante ao ecra ANTIGO durante o intervalo entre o db push e o
-- deploy: o validador de campos_override continua a aceitar valores boolean
-- (false = opcional, true = convite), e rpc_hr_admissao_campos_obrigatorios_org
-- continua a devolver as colunas que o ecra antigo le (codigo, origem,
-- condicional, obrigatorio), mais as novas.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Hoje cada campo de admissao e obrigatorio ou facultativo, e so isso. Falta
-- distinguir QUEM o preenche: a pessoa no convite, ou o RH na ficha depois de a
-- pessoa entrar. E o RH nao tem hoje forma de dizer que a ficha so esta
-- completa quando tem cargo, tipo de contrato, subsidio de alimentacao e
-- duodecimos.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- 1. campos_override passa a ser {"<codigo>": "convite"|"ficha"|"opcional"}.
--    Ausente = "convite" (omissao de sempre). So chaves de origem 'pessoa'; os
--    campos de origem 'rh' sao FIXOS e nunca configuraveis.
--    - convite : a pessoa preenche no convite; a submissao trava sem ele.
--    - ficha   : o RH preenche na ficha; nunca trava o convite, mas e
--                pendencia ate estar preenchido.
--    - opcional: nunca e pendencia.
-- 2. hr_admissao_campos_obrigatorios(): origem 'rh' passa a ser a lista fixa
--    data_admissao, cargo, tipo_contrato, subsidio_alimentacao, duodecimos.
--    Os 28 de origem 'pessoa' ficam como estavam.
-- 3. hr_admissao_campos_obrigatorios_org(uuid) e a sua wrapper
--    rpc_hr_admissao_campos_obrigatorios_org(uuid) passam a devolver tambem
--    posicao e configuravel (DROP + CREATE: muda o retorno).
-- 4. NOVA rpc_hr_admissao_posicoes_campos(uuid): para o formulario interno de
--    criar/editar pessoa saber o que e obrigatorio (convite) e o que fica
--    pendencia (ficha). Gate: hr.pessoas.create OU hr.pessoas.edit.
-- 5. hr_admissao_pendencias(uuid): devolve tambem a posicao, le cargo, tipo de
--    contrato (vinculo nao apagado, activo ou futuro) e retribuicao aberta, e
--    ignora os campos opcionais.
-- 6. rpc_hr_convite_admissao_estado(text): campos_obrigatorios passa a levar so
--    os de origem 'pessoa' e posicao 'convite'.
-- 7. pessoas_retribuicoes.duodecimos_pct passa a ter DEFAULT 50. Linhas
--    existentes com NULL ficam NULL (sao pendencia). NOTA: o ecra
--    (usePessoaRetribuicao, PessoaFormDialog/usePessoas) envia duodecimos_pct
--    explicito (null) e por isso o DEFAULT nao actua ai; o formulario tem de
--    propor 50 (lote B).
-- 8. NOVAS rpc_hr_admissao_configuracao_ler(uuid) e
--    rpc_hr_admissao_definir_posicao(uuid, text, text): a leitura e a escrita da
--    configuracao para o ecra /rh/admissao/configuracao (hook
--    useConfiguracaoObrigatoriosAdmissao). A leitura tem gate baixo (gerir OU
--    criar OU ver pessoas); a escrita so com hr.admissao.obrigatorios.gerir e
--    valida na base a posicao e se o codigo e configuravel.
--
--
-- -- O QUE O CARGO CONTA --------------------------------------------------------
--
-- DECISAO FECHADA: o campo 'cargo' conta como preenchido SO por
-- pessoas.cargo_id (o modelo novo, 20261202070000). O texto livre pessoas.cargo
-- e legado e NAO conta. CONSEQUENCIA, a ler com atencao antes do push: 20261202070000
-- deixou cargo_id NULL para toda a gente, sem backfill. Logo, a partir do push,
-- TODAS as fichas de TODAS as organizacoes sem cargo_id (a Mudelar incluida)
-- passam a ter a pendencia 'cargo', e a Edge criar-acesso-pessoa recusa a
-- PRIMEIRA criacao de acesso (409 ficha_incompleta) a quem tiver pendencias.
-- E a intencao (a guarda de credenciais), mas trava a criacao de acessos de
-- fichas antigas ate o RH escolher o cargo na ficha. Ver ANTES DO db push.
--
--
-- -- DADOS EXISTENTES ----------------------------------------------------------
--
-- Os mapas de campos_override ja gravados sao convertidos no proprio UPDATE
-- desta migration: false -> "opcional"; true -> chave removida (e a omissao);
-- strings validas ficam; qualquer chave que nao seja de origem 'pessoa'
-- (incluindo data_admissao) e removida. A conversao corre sobre as linhas de
-- TODAS as organizacoes, mas SO toca nas que tem um valor legado (boolean ou
-- chave de origem rh); as outras nao sao escritas. Os dois triggers de
-- auditoria (updated_by forcado a auth.uid(), que numa migration e NULL, e
-- updated_at) ficam DESLIGADOS so durante o UPDATE, para a autoria e a data
-- da ultima decisao de quem configurou ficarem exactamente como estavam. O
-- conferir emite um NOTICE com o numero de linhas convertidas. Para a Mudelar,
-- unica producao real: a configuracao dela so e reescrita se tiver valores
-- boolean, e o significado nao muda (false -> opcional, true -> convite).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao: repor as versoes
-- de 20261202060000 (hr_admissao_pendencias, hr_admissao_campo_permissao,
-- hr_admissao_campos_obrigatorios), de 20261201050000
-- (hr_admissao_campos_obrigatorios_org, hr_admissao_campos_override_validos,
-- rpc_hr_convite_admissao_estado) e de 20261201130000
-- (rpc_hr_admissao_campos_obrigatorios_org), e largar
-- rpc_hr_admissao_posicoes_campos.
--
--
-- Prerequisitos:
--   20261201050000  organization_admissao_settings, _org, estado
--   20261201130000  rpc_hr_admissao_campos_obrigatorios_org
--   20261202060000  hr_admissao_pendencias, hr_admissao_campo_permissao,
--                   hr_admissao_campos_obrigatorios (versoes vigentes)
--   20261202070000  pessoas.cargo_id
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.organization_admissao_settings') IS NULL THEN
    RAISE EXCEPTION 'organization_admissao_settings nao existe. Aplicar 20261201050000 primeiro.';
  END IF;
  IF to_regprocedure('public.hr_admissao_pendencias(uuid)') IS NULL THEN
    RAISE EXCEPTION 'hr_admissao_pendencias(uuid) nao existe. Aplicar 20261202060000 primeiro.';
  END IF;
  IF to_regprocedure('public.hr_admissao_campos_obrigatorios_org(uuid)') IS NULL THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios_org(uuid) nao existe. Aplicar 20261201050000 primeiro.';
  END IF;
  IF to_regprocedure('public.rpc_hr_convite_admissao_estado(text)') IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_estado(text) nao existe. Aplicar 20261201050000 primeiro.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name = 'cargo_id'
  ) THEN
    RAISE EXCEPTION 'pessoas.cargo_id nao existe. Aplicar 20261202070000 primeiro.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_retribuicoes' AND column_name = 'duodecimos_pct'
  ) THEN
    RAISE EXCEPTION 'pessoas_retribuicoes.duodecimos_pct nao existe. Aplicar 20261124090000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. hr_admissao_campos_obrigatorios: a lista fixa de origem 'rh' cresce
--    MESMA assinatura. O formato de linha ('codigo', 'origem', bool) tem de se
--    manter EXACTAMENTE: conviteAdmissaoContrato.test.ts le-o por regex.
--    Espelhada em src/lib/hr/admissaoObrigatorios.ts (so os de origem 'pessoa').
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
'Os campos da admissao. Origem pessoa: 28 campos que a pessoa preenche no convite (configuraveis por organizacao entre convite, ficha e opcional). Origem rh: 5 campos FIXOS (data_admissao, cargo, tipo_contrato, subsidio_alimentacao, duodecimos) que o RH preenche na ficha e que nunca sao configuraveis. Desde 20261210020000. Espelhada em src/lib/hr/admissaoObrigatorios.ts (so os de origem pessoa).';

-- ==============================================================================
-- 2. hr_admissao_campo_permissao: os campos novos tambem tem permissao
--    Sem isto, o JOIN em hr_admissao_pendencias deita fora os codigos novos em
--    silencio. MESMO retorno; so acrescenta 4 linhas.
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
    ('conta_banco',                   'pessoas_dados_bancarios',  'hr.pessoas.bancarios.view')
  ) AS t(codigo, tabela, permissao);
$$;

REVOKE ALL ON FUNCTION public.hr_admissao_campo_permissao() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_campo_permissao() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campo_permissao() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campo_permissao() TO service_role;

COMMENT ON FUNCTION public.hr_admissao_campo_permissao() IS
'Para cada campo de admissao, a tabela que o guarda e a permissao precisa para saber se esta preenchido. Desde 20261210020000 inclui os campos de origem rh: cargo (hr.pessoas.view), tipo_contrato (hr.pessoas.vinculos.view), subsidio_alimentacao e duodecimos (hr.pessoas.retribuicao.view). Sem uma linha aqui, hr_admissao_pendencias deita o codigo fora em silencio.';

-- ==============================================================================
-- 3. campos_override: de boolean para tres posicoes
--    Ordem: (a) largar o CHECK; (b) converter os dados; (c) novo validador;
--    (d) voltar a por o CHECK com o mesmo nome.
-- ==============================================================================
ALTER TABLE public.organization_admissao_settings
  DROP CONSTRAINT IF EXISTS organization_admissao_settings_override_valido;

-- (b) false -> "opcional"; true -> chave removida (omissao); strings validas
--     ficam; fora da origem 'pessoa' (inclui data_admissao) -> removida.
ALTER TABLE public.organization_admissao_settings
  DISABLE TRIGGER trg_organization_admissao_settings_updated_by;
ALTER TABLE public.organization_admissao_settings
  DISABLE TRIGGER trg_organization_admissao_settings_updated_at;

DO $converter$
DECLARE
  v_convertidas integer;
BEGIN
  UPDATE public.organization_admissao_settings s
     SET campos_override = n.novo
    FROM (
      SELECT s2.organization_id,
             coalesce((
               SELECT jsonb_object_agg(
                        e.key,
                        CASE WHEN jsonb_typeof(e.value) = 'boolean'
                             THEN to_jsonb('opcional'::text)
                             ELSE e.value
                        END)
                 FROM jsonb_each(s2.campos_override) AS e(key, value)
                WHERE e.key IN (
                        SELECT c.codigo FROM public.hr_admissao_campos_obrigatorios() c
                         WHERE c.origem = 'pessoa')
                  AND NOT (jsonb_typeof(e.value) = 'boolean' AND e.value = 'true'::jsonb)
                  AND (jsonb_typeof(e.value) = 'boolean'
                       OR (jsonb_typeof(e.value) = 'string'
                           AND (e.value #>> '{}') IN ('convite', 'ficha', 'opcional')))
             ), '{}'::jsonb) AS novo
        FROM public.organization_admissao_settings s2
       WHERE jsonb_typeof(s2.campos_override) = 'object'
         AND s2.campos_override <> '{}'::jsonb
    ) n
   WHERE n.organization_id = s.organization_id
     AND n.novo IS DISTINCT FROM s.campos_override;

  GET DIAGNOSTICS v_convertidas = ROW_COUNT;
  RAISE NOTICE 'campos_override: % linha(s) convertida(s) para as tres posicoes (updated_by e updated_at preservados).', v_convertidas;
END;
$converter$;

ALTER TABLE public.organization_admissao_settings
  ENABLE TRIGGER trg_organization_admissao_settings_updated_by;
ALTER TABLE public.organization_admissao_settings
  ENABLE TRIGGER trg_organization_admissao_settings_updated_at;

-- (c) O validador. TOLERANCIA TRANSITORIA: aceita tambem boolean, para o ecra
--     antigo nao falhar entre o db push e o deploy (false = opcional,
--     true = convite). Quando o ecra novo estiver em producao pode retirar-se.
CREATE OR REPLACE FUNCTION public.hr_admissao_campos_override_validos(p_override jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT jsonb_typeof(p_override) = 'object'
     AND NOT EXISTS (
       SELECT 1
       FROM jsonb_each(p_override) AS chave(codigo, valor)
       WHERE NOT EXISTS (
               SELECT 1 FROM public.hr_admissao_campos_obrigatorios() c
                WHERE c.codigo = chave.codigo AND c.origem = 'pessoa'
             )
          OR NOT (
               jsonb_typeof(chave.valor) = 'boolean'
               OR (jsonb_typeof(chave.valor) = 'string'
                   AND (chave.valor #>> '{}') IN ('convite', 'ficha', 'opcional'))
             )
     );
$$;

REVOKE ALL ON FUNCTION public.hr_admissao_campos_override_validos(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_campos_override_validos(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campos_override_validos(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campos_override_validos(jsonb) TO service_role;

COMMENT ON FUNCTION public.hr_admissao_campos_override_validos(jsonb) IS
'Valida campos_override de organization_admissao_settings: objecto jsonb; cada chave tem de ser um codigo de origem pessoa de hr_admissao_campos_obrigatorios() (os de origem rh sao fixos); cada valor e "convite", "ficha" ou "opcional". Aceita tambem boolean por tolerancia transitoria ao ecra antigo (false = opcional, true = convite). Usada num CHECK -- por isso IMMUTABLE.';

-- (d)
ALTER TABLE public.organization_admissao_settings
  ADD CONSTRAINT organization_admissao_settings_override_valido
  CHECK (public.hr_admissao_campos_override_validos(campos_override));

COMMENT ON TABLE public.organization_admissao_settings IS
'Por organizacao, em que posicao fica cada campo de origem pessoa da admissao. campos_override e um mapa {"<codigo>": "convite"|"ficha"|"opcional"}: ausente = convite (a pessoa preenche no convite e a submissao trava sem ele); ficha = o RH preenche na ficha, nunca trava o convite mas e pendencia; opcional = nunca e pendencia. So chaves de origem pessoa: os campos de origem rh sao fixos. Gate: hr.admissao.obrigatorios.gerir.';
COMMENT ON COLUMN public.organization_admissao_settings.campos_override IS
'Mapa {"<codigo>": "convite"|"ficha"|"opcional"}. Chaves fora da origem pessoa de hr_admissao_campos_obrigatorios() ou valores invalidos sao rejeitados por hr_admissao_campos_override_validos() via CHECK. Tolera boolean transitoriamente (false = opcional, true = convite) por causa do ecra antigo.';

-- ==============================================================================
-- 4. hr_admissao_campos_obrigatorios_org: passa a devolver a posicao
--    Muda o retorno -> DROP + CREATE. SO service_role (sem gate proprio).
-- ==============================================================================
DROP FUNCTION IF EXISTS public.hr_admissao_campos_obrigatorios_org(uuid);

CREATE FUNCTION public.hr_admissao_campos_obrigatorios_org(p_organization_id uuid)
RETURNS TABLE (
  codigo        text,
  origem        text,
  condicional   boolean,
  posicao       text,
  obrigatorio   boolean,
  configuravel  boolean
)
LANGUAGE sql STABLE PARALLEL SAFE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT c.codigo,
         c.origem,
         c.condicional,
         x.posicao,
         (x.posicao <> 'opcional') AS obrigatorio,
         (c.origem = 'pessoa')     AS configuravel
  FROM public.hr_admissao_campos_obrigatorios() c
  LEFT JOIN public.organization_admissao_settings s
         ON s.organization_id = p_organization_id
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN c.origem = 'rh' THEN 'ficha'
      ELSE CASE jsonb_typeof(s.campos_override -> c.codigo)
        WHEN 'string' THEN
          CASE WHEN (s.campos_override ->> c.codigo) IN ('ficha', 'opcional')
               THEN s.campos_override ->> c.codigo
               ELSE 'convite'
          END
        WHEN 'boolean' THEN
          CASE WHEN (s.campos_override ->> c.codigo) = 'false'
               THEN 'opcional'
               ELSE 'convite'
          END
        ELSE 'convite'
      END
    END AS posicao
  ) x;
$$;

REVOKE ALL ON FUNCTION public.hr_admissao_campos_obrigatorios_org(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_campos_obrigatorios_org(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hr_admissao_campos_obrigatorios_org(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campos_obrigatorios_org(uuid) TO service_role;

COMMENT ON FUNCTION public.hr_admissao_campos_obrigatorios_org(uuid) IS
'hr_admissao_campos_obrigatorios() cruzada com o override desta organizacao: devolve a posicao de cada campo (convite, ficha ou opcional), obrigatorio (= posicao <> opcional) e configuravel (= origem pessoa). Os de origem rh estao sempre em ficha. Aceita boolean legado no override (false = opcional, true = convite). SECURITY DEFINER e SO service_role, DE PROPOSITO (ver 20261201050000): sem gate proprio, um GRANT a authenticated deixava qualquer utilizador ler a configuracao de outra organizacao. As chamadoras internas sao SECURITY DEFINER e usam o EXECUTE implicito do dono. Desde 20261210020000.';

-- ==============================================================================
-- 5. rpc_hr_admissao_campos_obrigatorios_org: a wrapper com gate, novo retorno
-- ==============================================================================
DROP FUNCTION IF EXISTS public.rpc_hr_admissao_campos_obrigatorios_org(uuid);

CREATE FUNCTION public.rpc_hr_admissao_campos_obrigatorios_org(p_organization_id uuid)
RETURNS TABLE (
  codigo        text,
  origem        text,
  condicional   boolean,
  posicao       text,
  obrigatorio   boolean,
  configuravel  boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.admissao.obrigatorios.gerir', p_organization_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.codigo, c.origem, c.condicional, c.posicao, c.obrigatorio, c.configuravel
  FROM public.hr_admissao_campos_obrigatorios_org(p_organization_id) c;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_admissao_campos_obrigatorios_org(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_admissao_campos_obrigatorios_org(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_admissao_campos_obrigatorios_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_admissao_campos_obrigatorios_org(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_admissao_campos_obrigatorios_org(uuid) IS
'Wrapper de hr_admissao_campos_obrigatorios_org(uuid) chamavel por authenticated, com o gate proprio hr.admissao.obrigatorios.gerir na organizacao (42501 se faltar). Usada pelo ecra /rh/admissao/configuracao. Desde 20261210020000 devolve tambem posicao e configuravel.';

-- ==============================================================================
-- 6. NOVA rpc_hr_admissao_posicoes_campos: o gate baixo, para o formulario
--    interno de criar/editar pessoa saber o que e obrigatorio e o que e ficha
-- ==============================================================================
DROP FUNCTION IF EXISTS public.rpc_hr_admissao_posicoes_campos(uuid);

CREATE FUNCTION public.rpc_hr_admissao_posicoes_campos(p_organization_id uuid)
RETURNS TABLE (
  codigo        text,
  origem        text,
  condicional   boolean,
  posicao       text,
  configuravel  boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT (
    public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.create', p_organization_id)
    OR public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.edit', p_organization_id)
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.codigo, c.origem, c.condicional, c.posicao, c.configuravel
  FROM public.hr_admissao_campos_obrigatorios_org(p_organization_id) c;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_admissao_posicoes_campos(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_admissao_posicoes_campos(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_admissao_posicoes_campos(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_admissao_posicoes_campos(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_admissao_posicoes_campos(uuid) IS
'A posicao de cada campo de admissao (convite, ficha, opcional) na organizacao, para o formulario interno de criar/editar pessoa saber o que e obrigatorio e o que fica pendencia. Gate baixo: hr.pessoas.create OU hr.pessoas.edit na organizacao (42501 se nenhuma). Nao devolve a coluna obrigatorio nem expoe o conteudo do override. Criada em 20261210020000.';

-- ==============================================================================
-- 6b. rpc_hr_admissao_configuracao_ler: a configuracao para o ecra do RH
--     Forma ESPERADA PELO HOOK (src/hooks/useConfiguracaoObrigatoriosAdmissao.ts):
--     (codigo, origem, condicional, posicao, configuravel). Os campos de
--     origem rh vem com posicao 'rh' e configuravel = false.
-- ==============================================================================
DROP FUNCTION IF EXISTS public.rpc_hr_admissao_configuracao_ler(uuid);

CREATE FUNCTION public.rpc_hr_admissao_configuracao_ler(p_organization_id uuid)
RETURNS TABLE (
  codigo        text,
  origem        text,
  condicional   boolean,
  posicao       text,
  configuravel  boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT (
    public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.admissao.obrigatorios.gerir', p_organization_id)
    OR public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.create', p_organization_id)
    OR public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view', p_organization_id)
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.codigo,
         c.origem,
         c.condicional,
         CASE WHEN c.origem = 'rh' THEN 'rh' ELSE c.posicao END,
         c.configuravel
  FROM public.hr_admissao_campos_obrigatorios_org(p_organization_id) c;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_admissao_configuracao_ler(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_admissao_configuracao_ler(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_admissao_configuracao_ler(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_admissao_configuracao_ler(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_admissao_configuracao_ler(uuid) IS
'A configuracao de admissao da organizacao: para cada campo, codigo, origem (pessoa ou rh), condicional, posicao (convite, ficha ou opcional; sempre rh nos campos de origem rh) e configuravel. Gate baixo: hr.admissao.obrigatorios.gerir OU hr.pessoas.create OU hr.pessoas.view na organizacao (42501 se nenhuma), para o formulario de criar pessoa a ler sem poder altera-la. Usada pelo hook useConfiguracaoObrigatoriosAdmissao. Criada em 20261210020000.';

-- ==============================================================================
-- 6c. rpc_hr_admissao_definir_posicao: a escrita, validada na base
--     Erros: insufficient_privilege (42501), posicao_invalida (22023),
--     codigo_nao_configuravel (22023). Escreve SEMPRE o valor explicito; o
--     trigger de auditoria poe updated_by = auth.uid().
-- ==============================================================================
DROP FUNCTION IF EXISTS public.rpc_hr_admissao_definir_posicao(uuid, text, text);

CREATE FUNCTION public.rpc_hr_admissao_definir_posicao(
  p_organization_id uuid,
  p_codigo          text,
  p_posicao         text
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.admissao.obrigatorios.gerir', p_organization_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  IF p_posicao IS NULL OR p_posicao NOT IN ('convite', 'ficha', 'opcional') THEN
    RAISE EXCEPTION 'posicao_invalida' USING ERRCODE = '22023';
  END IF;

  IF p_codigo IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.hr_admissao_campos_obrigatorios() c
     WHERE c.codigo = p_codigo AND c.origem = 'pessoa'
  ) THEN
    RAISE EXCEPTION 'codigo_nao_configuravel' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.organization_admissao_settings AS s
    (organization_id, campos_override, updated_by)
  VALUES
    (p_organization_id, jsonb_build_object(p_codigo, p_posicao), auth.uid())
  ON CONFLICT (organization_id) DO UPDATE
     SET campos_override = s.campos_override || jsonb_build_object(p_codigo, p_posicao),
         updated_by      = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_admissao_definir_posicao(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_admissao_definir_posicao(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_admissao_definir_posicao(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_admissao_definir_posicao(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_admissao_definir_posicao(uuid, text, text) IS
'Define a posicao (convite, ficha ou opcional) de UM campo de origem pessoa na organizacao. So com hr.admissao.obrigatorios.gerir (42501). Erros: posicao_invalida e codigo_nao_configuravel (ambos 22023; os campos de origem rh sao fixos). Escreve em organization_admissao_settings; updated_by fica auth.uid() (trigger de auditoria). Usada pelo hook useConfiguracaoObrigatoriosAdmissao. Criada em 20261210020000.';

-- ==============================================================================
-- 7. hr_admissao_pendencias: devolve a posicao, le cargo/contrato/retribuicao
--    Muda o retorno -> DROP + CREATE. Corpo = o de 20261202060000, com:
--    (a) quatro colunas novas no estado; (b) filtro por posicao em vez de
--    obrigatorio; (c) o SELECT devolve tambem a posicao.
-- ==============================================================================
DROP FUNCTION IF EXISTS public.hr_admissao_pendencias(uuid);

CREATE FUNCTION public.hr_admissao_pendencias(p_pessoa_id uuid)
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
'O que a ficha desta pessoa AINDA NAO tem, entre os campos de admissao cuja posicao e convite ou ficha (um campo opcional nunca e pendencia). Devolve codigo, origem e posicao -- nunca valores. Desde 20261210020000: le tambem cargo, tipo de contrato (vinculo nao apagado, activo ou futuro) e a retribuicao em aberto (subsidio de alimentacao e duodecimos; subsidio 0 conta como preenchido). Mantem o gate (recusa a quem nao pode ver a ficha; a propria pessoa ve o que e seu), a permissao por codigo, as excepcoes validade_documento, conjuge e NIF-ou-NISS, e o ramo de servico (auth.uid() NULL devolve tudo, o que sustenta o portao da submissao e a guarda de criar-acesso-pessoa).';

-- ==============================================================================
-- 8. rpc_hr_convite_admissao_estado: so os de posicao convite vao ao ecra publico
--    MESMA assinatura, MESMO corpo de 20261201050000 com UMA mudanca:
--    campos_obrigatorios = origem pessoa E posicao convite.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_estado(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_tecto  constant integer := 10;
  v_convite record;
  v_pessoa  record;
  v_ident   record;
  v_conta   record;
  v_motivo  text;
BEGIN
  SELECT * INTO v_convite
  FROM public.pessoas_convites_admissao
  WHERE token_hash = p_token_hash;

  IF v_convite.id IS NULL THEN
    RETURN jsonb_build_object('erro', 'convite_invalido');
  END IF;

  IF v_convite.used_at IS NOT NULL THEN
    v_motivo := 'convite_ja_usado';
  ELSIF v_convite.revoked_at IS NOT NULL THEN
    v_motivo := 'convite_revogado';
  ELSIF v_convite.valid_until <= now() THEN
    v_motivo := 'convite_expirado';
  ELSIF v_convite.attempts >= c_tecto THEN
    v_motivo := 'convite_bloqueado';
  END IF;

  IF v_motivo IS NOT NULL THEN
    IF v_convite.attempts < c_tecto THEN
      UPDATE public.pessoas_convites_admissao
         SET attempts = attempts + 1
       WHERE id = v_convite.id;
    END IF;
    RETURN jsonb_build_object('erro', v_motivo);
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
    'valid_until', v_convite.valid_until,
    -- Os campos que a PESSOA tem de preencher neste convite: origem 'pessoa'
    -- e posicao 'convite'. Os de posicao 'ficha' ficam para o RH e os de
    -- origem 'rh' nunca se pedem aqui. O ecra deixa de depender SO da lista
    -- estatica em src/lib/hr/admissaoObrigatorios.ts, que continua a ser o
    -- fallback SO quando a chave faltar (convite antigo); um array vazio e
    -- uma decisao valida (todos os campos em ficha ou opcional).
    -- coalesce: sem nenhum campo na posicao convite a chave e um array VAZIO,
    -- nunca null (null faz o ecra cair na lista estatica dos 28 e travar).
    'campos_obrigatorios', (
      SELECT coalesce(
               jsonb_agg(jsonb_build_object('codigo', o.codigo, 'condicional', o.condicional)),
               '[]'::jsonb)
      FROM public.hr_admissao_campos_obrigatorios_org(v_convite.organization_id) o
      WHERE o.origem = 'pessoa' AND o.posicao = 'convite'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_estado(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_estado(text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_estado(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_estado(text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_estado(text) IS
'Le o estado de um convite pelo hash do token. SO service_role -- o codigo em claro so a Edge Function o ve, e e la que fica o limite por IP. DEVOLVE o motivo em jsonb ({"erro": ...}) em vez de o lancar: com RAISE, a transaccao abortava e levava consigo o proprio incremento de attempts. Conta SO as aberturas falhadas, com tecto de 10. Nunca devolve niss, a conta bancaria completa nem a resposta de sindicalizacao. Devolve campos_obrigatorios: so os de origem pessoa E posicao convite desta organizacao (desde 20261210020000; antes: todos os obrigatorios de origem pessoa).';

-- ==============================================================================
-- 9. Duodecimos: o valor por omissao e 50
--    Linhas existentes com NULL ficam NULL (sao pendencia).
-- ==============================================================================
ALTER TABLE public.pessoas_retribuicoes
  ALTER COLUMN duodecimos_pct SET DEFAULT 50;

-- ==============================================================================
-- Conferir
-- ==============================================================================
DO $conferir$
DECLARE
  c_org_nike constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_n          integer;
  v_pessoa     integer;
  v_rh         integer;
  v_convite    integer;
  v_ficha      integer;
  v_obrig      integer;
  v_validos    boolean;
  v_posicao    text;
  v_obrigatorio boolean;
  v_src        text;
  v_codigos_rh text[];
  v_pessoa_id  uuid;
  v_arr        jsonb;
  v_hash       text;
  v_estado     jsonb;
BEGIN
  -- 1. Contagens: 28 de origem pessoa, 5 de origem rh, os cinco certos.
  SELECT count(*) FILTER (WHERE origem = 'pessoa'),
         count(*) FILTER (WHERE origem = 'rh')
    INTO v_pessoa, v_rh
    FROM public.hr_admissao_campos_obrigatorios();
  IF v_pessoa <> 28 OR v_rh <> 5 THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios() tem % de origem pessoa e % de origem rh; esperavam-se 28 e 5.', v_pessoa, v_rh;
  END IF;

  SELECT array_agg(codigo ORDER BY codigo) INTO v_codigos_rh
    FROM public.hr_admissao_campos_obrigatorios() WHERE origem = 'rh';
  IF v_codigos_rh IS DISTINCT FROM ARRAY['cargo','data_admissao','duodecimos','subsidio_alimentacao','tipo_contrato'] THEN
    RAISE EXCEPTION 'Os campos de origem rh nao sao os cinco esperados: %', v_codigos_rh;
  END IF;

  -- Todo o campo tem permissao associada (senao o JOIN das pendencias
  -- deitava-o fora em silencio).
  SELECT count(*) INTO v_n
    FROM public.hr_admissao_campos_obrigatorios() c
   WHERE NOT EXISTS (SELECT 1 FROM public.hr_admissao_campo_permissao() cp WHERE cp.codigo = c.codigo);
  IF v_n <> 0 THEN
    RAISE EXCEPTION '% campo(s) de admissao sem permissao em hr_admissao_campo_permissao().', v_n;
  END IF;

  -- 2. O validador.
  IF NOT public.hr_admissao_campos_override_validos('{"niss": "ficha"}'::jsonb) THEN
    RAISE EXCEPTION 'O validador devia aceitar {"niss":"ficha"}.';
  END IF;
  IF NOT public.hr_admissao_campos_override_validos('{"niss": false}'::jsonb) THEN
    RAISE EXCEPTION 'O validador devia aceitar {"niss":false} (tolerancia transitoria).';
  END IF;
  IF NOT public.hr_admissao_campos_override_validos('{}'::jsonb) THEN
    RAISE EXCEPTION 'O validador devia aceitar o objecto vazio.';
  END IF;
  IF public.hr_admissao_campos_override_validos('{"niss": "x"}'::jsonb) THEN
    RAISE EXCEPTION 'O validador aceitou {"niss":"x"}.';
  END IF;
  IF public.hr_admissao_campos_override_validos('{"data_admissao": "opcional"}'::jsonb) THEN
    RAISE EXCEPTION 'O validador aceitou data_admissao, que e de origem rh.';
  END IF;
  IF public.hr_admissao_campos_override_validos('{"sindicato": "opcional"}'::jsonb) THEN
    RAISE EXCEPTION 'O validador aceitou sindicato, que nao esta na lista.';
  END IF;

  -- Nenhuma linha de settings ficou invalida (le so a coluna do mapa).
  SELECT coalesce(bool_and(public.hr_admissao_campos_override_validos(s.campos_override)), true)
    INTO v_validos
    FROM public.organization_admissao_settings s;
  IF NOT v_validos THEN
    RAISE EXCEPTION 'Ficou pelo menos uma linha de organization_admissao_settings com campos_override invalido.';
  END IF;

  -- 3. _org para uma organizacao inexistente: 33 linhas, 28 convite, 5 ficha,
  --    todas obrigatorias.
  SELECT count(*),
         count(*) FILTER (WHERE posicao = 'convite' AND origem = 'pessoa'),
         count(*) FILTER (WHERE posicao = 'ficha'   AND origem = 'rh'),
         count(*) FILTER (WHERE obrigatorio)
    INTO v_n, v_convite, v_ficha, v_obrig
    FROM public.hr_admissao_campos_obrigatorios_org('00000000-0000-0000-0000-000000000000'::uuid);
  IF v_n <> 33 OR v_convite <> 28 OR v_ficha <> 5 OR v_obrig <> 33 THEN
    RAISE EXCEPTION '_org devolve % linhas (% convite, % ficha, % obrigatorias); esperavam-se 33 (28, 5, 33).',
      v_n, v_convite, v_ficha, v_obrig;
  END IF;

  -- 4. Override de teste NA ORGANIZACAO NIKE, sempre desfeito (excepcao
  --    sentinela devolve a transaccao interna).
  IF EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = c_org_nike) THEN
    BEGIN
      INSERT INTO public.organization_admissao_settings (organization_id, campos_override)
      VALUES (c_org_nike, '{"niss": "ficha", "nif": false, "genero": "opcional"}'::jsonb)
      ON CONFLICT (organization_id) DO UPDATE SET campos_override = EXCLUDED.campos_override;

      SELECT c.posicao, c.obrigatorio INTO v_posicao, v_obrigatorio
        FROM public.hr_admissao_campos_obrigatorios_org(c_org_nike) c WHERE c.codigo = 'niss';
      IF v_posicao IS DISTINCT FROM 'ficha' OR v_obrigatorio IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'niss=ficha devia dar posicao ficha e obrigatorio true; deu % / %.', v_posicao, v_obrigatorio;
      END IF;

      SELECT c.posicao, c.obrigatorio INTO v_posicao, v_obrigatorio
        FROM public.hr_admissao_campos_obrigatorios_org(c_org_nike) c WHERE c.codigo = 'nif';
      IF v_posicao IS DISTINCT FROM 'opcional' OR v_obrigatorio IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'nif=false (legado) devia dar posicao opcional e obrigatorio false; deu % / %.', v_posicao, v_obrigatorio;
      END IF;

      SELECT c.posicao INTO v_posicao
        FROM public.hr_admissao_campos_obrigatorios_org(c_org_nike) c WHERE c.codigo = 'genero';
      IF v_posicao IS DISTINCT FROM 'opcional' THEN
        RAISE EXCEPTION 'genero=opcional devia dar posicao opcional; deu %.', v_posicao;
      END IF;

      SELECT c.posicao INTO v_posicao
        FROM public.hr_admissao_campos_obrigatorios_org(c_org_nike) c WHERE c.codigo = 'telefone_pessoal';
      IF v_posicao IS DISTINCT FROM 'convite' THEN
        RAISE EXCEPTION 'um campo sem override devia estar em convite; deu %.', v_posicao;
      END IF;

      SELECT c.posicao INTO v_posicao
        FROM public.hr_admissao_campos_obrigatorios_org(c_org_nike) c WHERE c.codigo = 'cargo';
      IF v_posicao IS DISTINCT FROM 'ficha' THEN
        RAISE EXCEPTION 'cargo (origem rh) devia estar sempre em ficha; deu %.', v_posicao;
      END IF;

      -- O CHECK rejeita um campo de origem rh.
      BEGIN
        UPDATE public.organization_admissao_settings
           SET campos_override = '{"data_admissao": "opcional"}'::jsonb
         WHERE organization_id = c_org_nike;
        RAISE EXCEPTION 'O CHECK devia ter rejeitado data_admissao.';
      EXCEPTION
        WHEN check_violation THEN
          NULL; -- esperado
      END;

      -- Todos os campos em ficha: a lista do convite fica VAZIA e a chave tem
      -- de ser um array vazio, nunca null.
      INSERT INTO public.organization_admissao_settings (organization_id, campos_override)
      VALUES (c_org_nike,
              (SELECT jsonb_object_agg(c.codigo, 'ficha')
                 FROM public.hr_admissao_campos_obrigatorios() c WHERE c.origem = 'pessoa'))
      ON CONFLICT (organization_id) DO UPDATE SET campos_override = EXCLUDED.campos_override;

      SELECT coalesce(jsonb_agg(jsonb_build_object('codigo', o.codigo)), '[]'::jsonb)
        INTO v_arr
        FROM public.hr_admissao_campos_obrigatorios_org(c_org_nike) o
       WHERE o.origem = 'pessoa' AND o.posicao = 'convite';
      IF jsonb_typeof(v_arr) IS DISTINCT FROM 'array' OR jsonb_array_length(v_arr) <> 0 THEN
        RAISE EXCEPTION 'Com os 28 campos em ficha a lista do convite devia ser um array vazio; deu %.', v_arr;
      END IF;

      -- E, se a nike tiver um convite vivo, a propria RPC publica.
      SELECT cv.token_hash INTO v_hash
        FROM public.pessoas_convites_admissao cv
       WHERE cv.organization_id = c_org_nike
         AND cv.used_at IS NULL AND cv.revoked_at IS NULL
         AND cv.valid_until > now() AND cv.attempts < 10
       LIMIT 1;
      IF v_hash IS NOT NULL THEN
        v_estado := public.rpc_hr_convite_admissao_estado(v_hash);
        IF jsonb_typeof(v_estado -> 'campos_obrigatorios') IS DISTINCT FROM 'array'
           OR jsonb_array_length(v_estado -> 'campos_obrigatorios') <> 0 THEN
          RAISE EXCEPTION 'rpc_hr_convite_admissao_estado devia devolver campos_obrigatorios como array vazio; deu %.',
            v_estado -> 'campos_obrigatorios';
        END IF;
      END IF;

      RAISE EXCEPTION 'conferir_rollback';
    EXCEPTION
      WHEN raise_exception THEN
        IF SQLERRM <> 'conferir_rollback' THEN
          RAISE;
        END IF;
    END;
  END IF;

  -- 5. Privilegios.
  IF has_function_privilege('authenticated', 'public.hr_admissao_campos_obrigatorios_org(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.hr_admissao_campos_obrigatorios_org(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios_org ficou executavel por authenticated ou anon.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.hr_admissao_campos_obrigatorios_org(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios_org deixou de ser executavel por service_role.';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.rpc_hr_admissao_campos_obrigatorios_org(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.rpc_hr_admissao_campos_obrigatorios_org(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_admissao_campos_obrigatorios_org(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_hr_admissao_campos_obrigatorios_org: privilegios errados.';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.rpc_hr_admissao_posicoes_campos(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.rpc_hr_admissao_posicoes_campos(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_admissao_posicoes_campos(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_hr_admissao_posicoes_campos: privilegios errados.';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.rpc_hr_admissao_configuracao_ler(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.rpc_hr_admissao_configuracao_ler(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_admissao_configuracao_ler(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_hr_admissao_configuracao_ler: privilegios errados.';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.rpc_hr_admissao_definir_posicao(uuid, text, text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.rpc_hr_admissao_definir_posicao(uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_admissao_definir_posicao(uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_hr_admissao_definir_posicao: privilegios errados.';
  END IF;

  -- Os gates e os erros das duas RPCs novas (a leitura e a escrita nao se
  -- chamam daqui: sem utilizador autenticado so se pode ler o corpo).
  SELECT pg_get_functiondef('public.rpc_hr_admissao_configuracao_ler(uuid)'::regprocedure) INTO v_src;
  IF v_src NOT LIKE '%hr.admissao.obrigatorios.gerir%' OR v_src NOT LIKE '%hr.pessoas.create%'
     OR v_src NOT LIKE '%hr.pessoas.view%' OR v_src NOT LIKE '%42501%' THEN
    RAISE EXCEPTION 'rpc_hr_admissao_configuracao_ler perdeu o gate (gerir, create ou view).';
  END IF;
  SELECT pg_get_functiondef('public.rpc_hr_admissao_definir_posicao(uuid, text, text)'::regprocedure) INTO v_src;
  IF v_src NOT LIKE '%hr.admissao.obrigatorios.gerir%' OR v_src NOT LIKE '%posicao_invalida%'
     OR v_src NOT LIKE '%codigo_nao_configuravel%' OR v_src NOT LIKE '%42501%' THEN
    RAISE EXCEPTION 'rpc_hr_admissao_definir_posicao perdeu o gate ou um dos erros (posicao_invalida, codigo_nao_configuravel).';
  END IF;

  -- A conversao nao deixou os triggers de auditoria desligados.
  SELECT count(*) INTO v_n
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.organization_admissao_settings'::regclass
     AND t.tgname IN ('trg_organization_admissao_settings_updated_at',
                      'trg_organization_admissao_settings_updated_by')
     AND t.tgenabled = 'O';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Os triggers de auditoria de organization_admissao_settings nao estao os dois activos (% de 2).', v_n;
  END IF;

  -- hr_admissao_pendencias EXECUTADA (como servico: auth.uid() NULL) contra uma
  -- pessoa da nike. O plpgsql so valida as colunas dos LATERAL novos ao correr;
  -- um erro aqui partia o portao do convite, o ecra e a guarda do criar-acesso.
  SELECT p.id INTO v_pessoa_id
    FROM public.pessoas p
   WHERE p.organization_id = c_org_nike AND p.deleted_at IS NULL
   ORDER BY p.id
   LIMIT 1;
  IF v_pessoa_id IS NOT NULL THEN
    SELECT count(pend.posicao) INTO v_n FROM public.hr_admissao_pendencias(v_pessoa_id) AS pend;
  ELSE
    RAISE NOTICE 'A nike nao tem nenhuma pessoa: hr_admissao_pendencias nao foi executada no conferir.';
  END IF;

  -- Informativo: quantas fichas da nike ficam com a pendencia cargo (cargo_id NULL).
  SELECT count(*) INTO v_n
    FROM public.pessoas p
   WHERE p.organization_id = c_org_nike AND p.deleted_at IS NULL AND p.cargo_id IS NULL;
  RAISE NOTICE 'Na nike, % ficha(s) sem cargo_id ficam com a pendencia cargo (o texto livre pessoas.cargo nao conta).', v_n;

  IF NOT has_function_privilege('authenticated', 'public.hr_admissao_pendencias(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.hr_admissao_pendencias(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.hr_admissao_pendencias(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_admissao_pendencias: privilegios errados.';
  END IF;

  IF has_function_privilege('authenticated', 'public.rpc_hr_convite_admissao_estado(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_convite_admissao_estado(text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.rpc_hr_convite_admissao_estado(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_estado deixou de ser so service_role.';
  END IF;

  -- 6. Pendencias: SECURITY DEFINER com search_path fixo, e o filtro novo.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_pendencias'
       AND p.prosecdef AND p.proconfig @> ARRAY['search_path=public, pg_temp']
  ) THEN
    RAISE EXCEPTION 'hr_admissao_pendencias perdeu SECURITY DEFINER ou o search_path fixo.';
  END IF;
  SELECT pg_get_functiondef('public.hr_admissao_pendencias(uuid)'::regprocedure) INTO v_src;
  IF v_src NOT LIKE '%posicao IN%' OR v_src LIKE '%c.obrigatorio%' THEN
    RAISE EXCEPTION 'hr_admissao_pendencias nao filtra por posicao (ou ainda filtra por obrigatorio).';
  END IF;
  IF v_src NOT LIKE '%v_servico%' OR v_src NOT LIKE '%insufficient_privilege%' THEN
    RAISE EXCEPTION 'hr_admissao_pendencias perdeu o ramo de servico ou a recusa por permissao.';
  END IF;

  -- 7. O estado do convite so leva os de posicao convite.
  SELECT pg_get_functiondef('public.rpc_hr_convite_admissao_estado(text)'::regprocedure) INTO v_src;
  IF v_src NOT LIKE '%posicao = ''convite''%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_estado nao filtra por posicao = convite.';
  END IF;
  IF v_src NOT ILIKE '%coalesce(%jsonb_agg(%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_estado nao faz coalesce do campos_obrigatorios (array vazio em vez de null).';
  END IF;
  IF v_src NOT LIKE '%niss_ultimos4%' OR v_src LIKE '%v_ident.niss,%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_estado deixou de mascarar o niss.';
  END IF;

  -- 8. Duodecimos com DEFAULT 50.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_retribuicoes'
       AND column_name = 'duodecimos_pct' AND column_default = '50'
  ) THEN
    RAISE EXCEPTION 'pessoas_retribuicoes.duodecimos_pct nao ficou com DEFAULT 50.';
  END IF;

  RAISE NOTICE 'OK: 28 campos de origem pessoa e 5 de origem rh; validador, conversao dos dados, posicoes por organizacao, leitura e escrita da configuracao, pendencias (executada), estado do convite (array vazio), privilegios e DEFAULT 50 de duodecimos confirmados.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. PRECISA de codigo novo no mesmo commit (hook e ecra de configuracao); o
--    ecra antigo continua a funcionar entre o push e o deploy porque o
--    validador tolera boolean e as colunas antigas continuam a ser devolvidas.
-- 2. NAO fazer push a partir de um worktree que nao esteja reconciliado com o
--    remoto. Foi medido (so leitura, `migration list --linked`) que ha MUITAS
--    migrations so locais (a base de RH 20261120010000 a 20261201290000 e
--    20261202080000, entre outras) e centenas so no remoto sem ficheiro aqui
--    (20261203010000 a 20261207022300). Primeiro reconciliar com o ramo que
--    tem as do remoto e voltar a listar. Depois confirmar, com
--    pg_get_functiondef no remoto, que o corpo VIGENTE de
--    hr_admissao_pendencias, rpc_hr_convite_admissao_estado e (na 030)
--    rpc_hr_convite_admissao_submeter e _criar e o que estas migrations tomam
--    como base: podem existir versoes mais recentes vindas de outros ramos.
--    Listar o que esta pendente imediatamente antes do push.
-- 3. A partir do push, uma ficha SEM cargo_id, tipo de contrato, subsidio de
--    alimentacao ou duodecimos passa a aparecer com pendencias (origem rh),
--    em TODAS as organizacoes, a Mudelar incluida. E o objectivo -- mas e
--    visivel de imediato em todas as fichas E, como a Edge criar-acesso-pessoa
--    recusa a PRIMEIRA criacao de acesso a quem tiver pendencias, o RH deixa
--    de poder dar acesso a fichas antigas (cargo so em texto livre) ate
--    escolher o cargo. Pedir autorizacao antes de publicar para a Mudelar.
-- 4. Os mapas de campos_override ja gravados sao convertidos aqui (false ->
--    opcional); a conversao corre sobre todas as organizacoes mas so toca nas
--    linhas com valor legado, e preserva updated_by e updated_at. O NOTICE do
--    conferir diz quantas linhas. Contar ANTES, so por leitura na nike.
-- 5. Ficheiro com mais de 800 linhas, mantido assim de proposito (decisao:
--    nao dividir as migrations do lote A).
-- ==============================================================================
