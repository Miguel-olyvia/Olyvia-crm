-- ==============================================================================
-- pessoas_vinculos ganha 5 colunas aditivas para a ficha de admissao:
-- categoria_profissional, renovavel, isencao_horario, formacao_inicio/fim.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- categoria_profissional (do IRCT, ex. "Tecnico de Manutencao de 2.a") NAO E
-- categoria_funcao (de 20261123040000: geral/tecnica_confianca/
-- direcao_quadro_superior, que determina a DURACAO do periodo experimental).
-- Colapsar as duas seria repetir, com nomes parecidos, um erro ja visto nesta
-- obra -- por isso o COMMENT abaixo e obrigatorio e nao decorativo.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS, aditivo. pessoas_vinculos tem
-- grants de TABELA (nao de coluna) -- confirmado em 20261120060000 -- logo as
-- colunas novas herdam SELECT/INSERT/UPDATE de authenticated sem GRANT extra.
--
-- O QUE NAO GANHA COLUNA, e porque:
--   - duracao do contrato: ja e data_fim - data_inicio.
--   - termo certo/incerto: ja e tipo_contrato. part-time/full-time: ja e
--     regime. horario/horas/dias: ja sao horas_semanais, horas_frequencia,
--     dias_uteis. data de admissao: pessoas.data_admissao. empresa/grupo:
--     decisao do utilizador, a entidade legal e sempre a organizacao activa.
--
-- Esta migracao NAO acrescenta trigger a pessoas_vinculos_alteracoes: essa
-- tabela audita por LISTA EXPLICITA de campos (hr_vinculos_registar_alteracao,
-- 20261123050000) -- as 5 colunas novas so entram no historico se essa lista
-- for actualizada numa migracao PROPRIA, depois de confirmar que nenhuma e
-- monetaria (a garantia central daquela tabela). Fica registado como pendente,
-- fora do ambito desta migracao aditiva.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- ALTER TABLE public.pessoas_vinculos
--   DROP COLUMN IF EXISTS categoria_profissional,
--   DROP COLUMN IF EXISTS renovavel,
--   DROP COLUMN IF EXISTS isencao_horario,
--   DROP COLUMN IF EXISTS formacao_inicio,
--   DROP COLUMN IF EXISTS formacao_fim;
--
--
-- Prerequisitos:
--   20261120060000  pessoas_vinculos
--   20261123040000  categoria_funcao (para o COMMENT distinguir das duas)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_vinculos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_vinculos nao existe. Aplicar 20261120060000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos' AND column_name = 'categoria_funcao'
  ) THEN
    RAISE EXCEPTION 'pessoas_vinculos.categoria_funcao nao existe. Aplicar 20261123040000 primeiro -- a distincao entre categoria_funcao e categoria_profissional e o ponto central desta migracao.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos'
      AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
  ) THEN
    RAISE EXCEPTION 'authenticated nao tem UPDATE de tabela em pessoas_vinculos -- o pressuposto de grants de tabela mudou. Investigar antes de aplicar.';
  END IF;
END;
$guardas$;

-- ---- As colunas --------------------------------------------------------------
ALTER TABLE public.pessoas_vinculos
  ADD COLUMN IF NOT EXISTS categoria_profissional text,
  ADD COLUMN IF NOT EXISTS renovavel              boolean,
  ADD COLUMN IF NOT EXISTS isencao_horario        boolean,
  ADD COLUMN IF NOT EXISTS formacao_inicio        date,
  ADD COLUMN IF NOT EXISTS formacao_fim           date;

DO $checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pessoas_vinculos_formacao_fim_apos_inicio'
      AND conrelid = 'public.pessoas_vinculos'::regclass
  ) THEN
    ALTER TABLE public.pessoas_vinculos
      ADD CONSTRAINT pessoas_vinculos_formacao_fim_apos_inicio
      CHECK (formacao_fim IS NULL OR formacao_inicio IS NULL OR formacao_fim >= formacao_inicio);
  END IF;
END;
$checks$;

COMMENT ON COLUMN public.pessoas_vinculos.categoria_profissional IS
'A categoria do IRCT (ex. "Tecnico de Manutencao de 2.a"), texto livre. NAO E categoria_funcao (coluna irma, de 20261123040000): categoria_funcao e um de tres baldes legais -- geral, tecnica_confianca, direcao_quadro_superior -- que determina a DURACAO do periodo experimental. As duas nao se colapsam.';
COMMENT ON COLUMN public.pessoas_vinculos.renovavel IS 'NULL = por decidir. Se o contrato a termo e renovavel.';
COMMENT ON COLUMN public.pessoas_vinculos.isencao_horario IS 'Regime de tempo de trabalho -- nao e retribuicao. O eventual suplemento monetario de isencao fica fora desta ronda, em pessoas_retribuicoes se vier a existir.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_colunas integer;
BEGIN
  SELECT count(*) INTO v_colunas
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos'
    AND column_name IN ('categoria_profissional','renovavel','isencao_horario','formacao_inicio','formacao_fim');

  IF v_colunas <> 5 THEN
    RAISE EXCEPTION 'Esperavam-se 5 colunas novas em pessoas_vinculos, encontraram-se %.', v_colunas;
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.pessoas_vinculos', 'categoria_profissional', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated nao consegue escrever categoria_profissional -- os grants de tabela deixaram de cobrir a coluna nova.';
  END IF;

  -- A garantia central de pessoas_vinculos_alteracoes (20261123050000) e que
  -- nenhuma coluna monetaria alguma vez entre nela. Confirmar aqui que esta
  -- migracao nao a violou por acidente, tocando na definicao da funcao.
  IF to_regprocedure('public.hr_vinculos_registar_alteracao()') IS NOT NULL THEN
    IF pg_get_functiondef('public.hr_vinculos_registar_alteracao()'::regprocedure) ILIKE '%categoria_profissional%'
       OR pg_get_functiondef('public.hr_vinculos_registar_alteracao()'::regprocedure) ILIKE '%renovavel%'
       OR pg_get_functiondef('public.hr_vinculos_registar_alteracao()'::regprocedure) ILIKE '%isencao_horario%'
       OR pg_get_functiondef('public.hr_vinculos_registar_alteracao()'::regprocedure) ILIKE '%formacao_%' THEN
      RAISE EXCEPTION 'hr_vinculos_registar_alteracao() ja referencia uma das colunas novas -- nao devia, esta migracao nao a tocou. Investigar.';
    END IF;
  END IF;

  RAISE NOTICE 'OK: 5 colunas novas em pessoas_vinculos, legiveis e escreviveis por authenticated via grant de tabela. Nao entram (ainda) no historico de pessoas_vinculos_alteracoes.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- Aditiva pura: so ADD COLUMN IF NOT EXISTS e um ADD CONSTRAINT condicional.
-- Nenhuma tabela ou politica existente e reescrita -- sem janela de estado
-- defeituoso na base partilhada.
-- ==============================================================================
