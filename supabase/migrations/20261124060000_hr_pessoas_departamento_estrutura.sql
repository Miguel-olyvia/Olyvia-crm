-- ==============================================================================
-- pessoas ganha "departamento" e "estrutura", texto livre, ao lado de cargo e
-- local_trabalho.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A ficha de admissao pede departamento e estrutura/equipa. pessoas ja tem
-- cargo e local_trabalho como texto livre, sem catalogo -- confirmado nesta
-- sessao: pessoas nao tem nenhuma tabela de organograma.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Duas colunas texto livre, mesmo escalao de cargo e local_trabalho, mesmas
-- permissoes hr.pessoas.laborais.view/edit (as que ja governam cargo e
-- local_trabalho), grants de tabela -- pessoas ja tem SELECT/INSERT/UPDATE de
-- tabela para authenticated, sem grants por coluna.
--
-- DELIBERADAMENTE NAO uma entidade de organograma com hierarquia. Inventar
-- aqui uma tabela de departamentos seria construir um modulo de estrutura
-- organizacional a pretexto de dois campos de um formulario de admissao --
-- fica registado como divida consciente, nao como esquecimento.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- ALTER TABLE public.pessoas
--   DROP COLUMN IF EXISTS departamento,
--   DROP COLUMN IF EXISTS estrutura;
--
--
-- Prerequisitos:
--   20261120030000  pessoas
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas nao existe. Aplicar 20261120030000 primeiro.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pessoas'
      AND column_name IN ('departamento','estrutura')
  ) THEN
    RAISE NOTICE 'Uma das colunas ja existe -- ADD COLUMN IF NOT EXISTS torna isto idempotente.';
  END IF;
END;
$guardas$;

-- ---- As colunas --------------------------------------------------------------
ALTER TABLE public.pessoas
  ADD COLUMN IF NOT EXISTS departamento text,
  ADD COLUMN IF NOT EXISTS estrutura    text;

COMMENT ON COLUMN public.pessoas.departamento IS
'Texto livre, sem catalogo -- mesmo tratamento que cargo e local_trabalho. Nao ha tabela de organograma nesta ronda; se vier a existir, e decisao de produto propria, nao um efeito colateral da ficha de admissao.';
COMMENT ON COLUMN public.pessoas.estrutura IS
'Texto livre, sem catalogo -- equipa/estrutura a que a pessoa pertence. Mesma decisao de departamento: nao e entidade, e campo.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name = 'departamento'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name = 'estrutura'
  ) THEN
    RAISE EXCEPTION 'departamento e/ou estrutura nao ficaram criadas em pessoas.';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.pessoas', 'departamento', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.pessoas', 'estrutura', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated nao consegue escrever departamento/estrutura -- os grants de tabela de pessoas deixaram de cobrir as colunas novas.';
  END IF;

  RAISE NOTICE 'OK: pessoas.departamento e pessoas.estrutura criadas, texto livre, legiveis e escreviveis por authenticated via grant de tabela.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- Aditiva pura: so ADD COLUMN IF NOT EXISTS. Nenhuma tabela ou politica
-- existente e reescrita -- sem janela de estado defeituoso na base partilhada.
-- ==============================================================================
