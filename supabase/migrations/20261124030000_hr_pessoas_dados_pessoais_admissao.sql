-- ==============================================================================
-- pessoas_dados_pessoais ganha 7 colunas aditivas para a ficha de admissao:
-- naturalidade, situacao profissional do conjuge, dependentes deficientes e
-- habilitacao academica.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A ficha de admissao pede naturalidade, se o conjuge trabalha (para o
-- escalao de IRS), quantos dependentes sao deficientes, e a habilitacao mais
-- elevada. Sao todos 1:1 com a pessoa, do mesmo escalao de sensibilidade do
-- que ja esta em pessoas_dados_pessoais (estado civil, dependentes, IRS) e
-- lidos pela mesma permissao -- nao justificam tabela propria.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS, aditivo. pessoas_dados_pessoais
-- tem grants de TABELA (nao de coluna) -- confirmado em 20261120040000 --
-- logo as colunas novas herdam SELECT/INSERT/UPDATE de authenticated sem
-- GRANT extra nenhum. Nao ha nenhuma armadilha de coluna aqui, ao contrario de
-- pessoas_identificacao.
--
-- SEM CHECK cruzado entre dependentes_deficientes e dependentes, nem entre
-- conjuge_situacao_profissional e estado_civil: um CHECK cruzado rejeitaria o
-- registo mais obvio -- um rascunho em que um e preenchido antes do outro. A
-- coerencia entre os dois impoe-se na submissao (fora desta migracao, no
-- codigo da aplicacao), nao na coluna.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Sem tabela pessoas_habilitacoes: a admissao recolhe uma habilitacao so.
-- - naturalidade_freguesia/concelho ficam aqui e nao em pessoas_moradas: sao
--   atributo de nascimento, singular, nunca usado como morada de contacto.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- ALTER TABLE public.pessoas_dados_pessoais
--   DROP COLUMN IF EXISTS naturalidade_freguesia,
--   DROP COLUMN IF EXISTS naturalidade_concelho,
--   DROP COLUMN IF EXISTS naturalidade_pais,
--   DROP COLUMN IF EXISTS conjuge_situacao_profissional,
--   DROP COLUMN IF EXISTS dependentes_deficientes,
--   DROP COLUMN IF EXISTS habilitacao_academica,
--   DROP COLUMN IF EXISTS habilitacao_data_conclusao;
--
--
-- Prerequisitos:
--   20261120040000  pessoas_dados_pessoais
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_dados_pessoais') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_dados_pessoais nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'pessoas_dados_pessoais'
      AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
  ) THEN
    RAISE EXCEPTION 'authenticated nao tem UPDATE de tabela em pessoas_dados_pessoais -- o pressuposto de grants de tabela (nao de coluna) mudou. Investigar antes de aplicar.';
  END IF;
END;
$guardas$;

-- ---- As colunas --------------------------------------------------------------
ALTER TABLE public.pessoas_dados_pessoais
  ADD COLUMN IF NOT EXISTS naturalidade_freguesia         text,
  ADD COLUMN IF NOT EXISTS naturalidade_concelho           text,
  ADD COLUMN IF NOT EXISTS naturalidade_pais                text,
  ADD COLUMN IF NOT EXISTS conjuge_situacao_profissional   text,
  ADD COLUMN IF NOT EXISTS dependentes_deficientes         smallint,
  ADD COLUMN IF NOT EXISTS habilitacao_academica           text,
  ADD COLUMN IF NOT EXISTS habilitacao_data_conclusao      date;

DO $checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pessoas_dados_pessoais_naturalidade_pais_iso'
      AND conrelid = 'public.pessoas_dados_pessoais'::regclass
  ) THEN
    ALTER TABLE public.pessoas_dados_pessoais
      ADD CONSTRAINT pessoas_dados_pessoais_naturalidade_pais_iso
      CHECK (naturalidade_pais IS NULL OR naturalidade_pais ~ '^[A-Z]{2}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pessoas_dados_pessoais_conjuge_situacao_valida'
      AND conrelid = 'public.pessoas_dados_pessoais'::regclass
  ) THEN
    ALTER TABLE public.pessoas_dados_pessoais
      ADD CONSTRAINT pessoas_dados_pessoais_conjuge_situacao_valida
      CHECK (conjuge_situacao_profissional IS NULL OR conjuge_situacao_profissional IN ('trabalhador','nao_trabalhador'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pessoas_dados_pessoais_dependentes_deficientes_validos'
      AND conrelid = 'public.pessoas_dados_pessoais'::regclass
  ) THEN
    ALTER TABLE public.pessoas_dados_pessoais
      ADD CONSTRAINT pessoas_dados_pessoais_dependentes_deficientes_validos
      CHECK (dependentes_deficientes IS NULL OR (dependentes_deficientes >= 0 AND dependentes_deficientes <= 30));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pessoas_dados_pessoais_habilitacao_valida'
      AND conrelid = 'public.pessoas_dados_pessoais'::regclass
  ) THEN
    ALTER TABLE public.pessoas_dados_pessoais
      ADD CONSTRAINT pessoas_dados_pessoais_habilitacao_valida
      CHECK (habilitacao_academica IS NULL OR habilitacao_academica IN (
        'sem_escolaridade','1_ciclo','2_ciclo','3_ciclo','secundario',
        'pos_secundario','licenciatura','mestrado','doutoramento','outro'
      ));
  END IF;
END;
$checks$;

COMMENT ON COLUMN public.pessoas_dados_pessoais.naturalidade_pais IS 'ISO 3166-1 alpha-2, em maiusculas. Local de nascimento -- distinto de nacionalidade.';
COMMENT ON COLUMN public.pessoas_dados_pessoais.conjuge_situacao_profissional IS 'Se o conjuge/unido de facto trabalha -- muda a tabela de retencao de IRS. Sem CHECK cruzado com estado_civil: um rascunho pode ter isto preenchido antes daquele.';
COMMENT ON COLUMN public.pessoas_dados_pessoais.dependentes_deficientes IS 'Quantos dos dependentes sao deficientes. Sem CHECK cruzado com dependentes: um rascunho pode preencher este campo primeiro.';
COMMENT ON COLUMN public.pessoas_dados_pessoais.habilitacao_academica IS 'A habilitacao mais elevada, uma so. Sem tabela pessoas_habilitacoes: e generalidade especulativa para o que a admissao pede hoje.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_colunas integer;
BEGIN
  SELECT count(*) INTO v_colunas
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'pessoas_dados_pessoais'
    AND column_name IN (
      'naturalidade_freguesia','naturalidade_concelho','naturalidade_pais',
      'conjuge_situacao_profissional','dependentes_deficientes',
      'habilitacao_academica','habilitacao_data_conclusao'
    );

  IF v_colunas <> 7 THEN
    RAISE EXCEPTION 'Esperavam-se 7 colunas novas em pessoas_dados_pessoais, encontraram-se %.', v_colunas;
  END IF;

  -- pessoas_dados_pessoais tem grants de TABELA -- as colunas novas tem de
  -- estar legiveis e escreviveis por authenticated sem GRANT extra.
  IF NOT has_column_privilege('authenticated', 'public.pessoas_dados_pessoais', 'habilitacao_academica', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated nao consegue ler habilitacao_academica -- os grants de tabela deixaram de cobrir a coluna nova.';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.pessoas_dados_pessoais', 'habilitacao_academica', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated nao consegue escrever habilitacao_academica -- os grants de tabela deixaram de cobrir a coluna nova.';
  END IF;

  RAISE NOTICE 'OK: 7 colunas novas em pessoas_dados_pessoais, legiveis e escreviveis por authenticated via grant de tabela.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- Aditiva pura: so ADD COLUMN IF NOT EXISTS e ADD CONSTRAINT condicionais.
-- Nenhuma tabela ou politica existente e reescrita -- sem janela de estado
-- defeituoso na base partilhada.
-- ==============================================================================
