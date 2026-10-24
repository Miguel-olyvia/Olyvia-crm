-- ==============================================================================
-- pessoas_retribuicoes ganha duodecimos_pct: 0, 50 ou 100 -- nao um booleano.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A lei portuguesa permite duodecimos a 50% ou a 100%. Um booleano obrigaria
-- o processamento salarial a adivinhar qual, e a resposta "sim" ficaria
-- ambigua no dia em que alguem escolhesse metade.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS duodecimos_pct smallint, CHECK IN
-- (0, 50, 100) ou NULL. pessoas_retribuicoes tem grants de TABELA -- confirmado
-- em 20261120060000 -- a coluna herda SELECT/INSERT/UPDATE sem GRANT extra.
--
-- O QUE NAO GANHA COLUNA: ticket refeicao sim/nao ja e
-- subsidio_alimentacao_modo = ''cartao'' (confirmado em 20261120060000, linha
-- 351). Isencao de horario fica em pessoas_vinculos (regime de tempo de
-- trabalho, nao dinheiro).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- ALTER TABLE public.pessoas_retribuicoes DROP COLUMN IF EXISTS duodecimos_pct;
--
--
-- Prerequisitos:
--   20261120060000  pessoas_retribuicoes
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_retribuicoes') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_retribuicoes nao existe. Aplicar 20261120060000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pessoas_retribuicoes' AND column_name = 'subsidio_alimentacao_modo'
  ) THEN
    RAISE EXCEPTION 'pessoas_retribuicoes.subsidio_alimentacao_modo nao existe -- o pressuposto de que o ticket-refeicao ja tem campo proprio mudou. Investigar antes de aplicar.';
  END IF;
END;
$guardas$;

-- ---- A coluna ------------------------------------------------------------
ALTER TABLE public.pessoas_retribuicoes
  ADD COLUMN IF NOT EXISTS duodecimos_pct smallint;

DO $checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pessoas_retribuicoes_duodecimos_validos'
      AND conrelid = 'public.pessoas_retribuicoes'::regclass
  ) THEN
    ALTER TABLE public.pessoas_retribuicoes
      ADD CONSTRAINT pessoas_retribuicoes_duodecimos_validos
      CHECK (duodecimos_pct IS NULL OR duodecimos_pct IN (0, 50, 100));
  END IF;
END;
$checks$;

COMMENT ON COLUMN public.pessoas_retribuicoes.duodecimos_pct IS
'0, 50 ou 100 -- a lei portuguesa admite duodecimos a metade ou a totalidade. NAO e booleano: um sim/nao obrigaria o processamento salarial a adivinhar a percentagem.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pessoas_retribuicoes' AND column_name = 'duodecimos_pct'
  ) THEN
    RAISE EXCEPTION 'duodecimos_pct nao foi criada.';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.pessoas_retribuicoes', 'duodecimos_pct', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated nao consegue escrever duodecimos_pct -- os grants de tabela deixaram de cobrir a coluna nova.';
  END IF;

  RAISE NOTICE 'OK: pessoas_retribuicoes.duodecimos_pct criada, restrita a 0/50/100, legivel e escrevivel por authenticated via grant de tabela.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- Aditiva pura: so ADD COLUMN IF NOT EXISTS e um ADD CONSTRAINT condicional.
-- Nenhuma tabela ou politica existente e reescrita -- sem janela de estado
-- defeituoso na base partilhada.
-- ==============================================================================
