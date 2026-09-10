-- ==============================================================================
-- pessoas_acessos_sensiveis.campo passa a aceitar 'documento'.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- 20261123030000 audita a leitura do CORPO de um documento (via
-- rpc_hr_documento_ver_conteudo) escrevendo em pessoas_acessos_sensiveis com
-- campo='documento'. O CHECK pessoas_acessos_sensiveis_campo_valido, criado em
-- 20261120040000, so aceita ('niss','iban','incapacidade','retribuicao') --
-- sem esta migracao, o primeiro INSERT da RPC falhava a constraint e a leitura
-- do conteudo rebentava para toda a gente.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- DROP + ADD CONSTRAINT (nome real confirmado por pg_constraint na guarda, nao
-- suposto): o CHECK passa a aceitar tambem 'documento'. Nada mais muda nesta
-- tabela -- continua append-only, com as quatro operacoes fechadas a
-- authenticated (so RPCs SECURITY DEFINER escrevem).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao (so depois de
-- confirmar que ja nao ha linhas campo='documento'):
--   ALTER TABLE public.pessoas_acessos_sensiveis
--     DROP CONSTRAINT pessoas_acessos_sensiveis_campo_valido;
--   ALTER TABLE public.pessoas_acessos_sensiveis
--     ADD CONSTRAINT pessoas_acessos_sensiveis_campo_valido
--     CHECK (campo IN ('niss','iban','incapacidade','retribuicao'));
--
--
-- Prerequisitos:
--   20261120040000  pessoas_acessos_sensiveis
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_nome_constraint text;
  v_definicao       text;
BEGIN
  IF to_regclass('public.pessoas_acessos_sensiveis') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_acessos_sensiveis nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  SELECT c.conname, pg_get_constraintdef(c.oid) INTO v_nome_constraint, v_definicao
    FROM pg_constraint c
   WHERE c.conrelid = 'public.pessoas_acessos_sensiveis'::regclass
     AND pg_get_constraintdef(c.oid) LIKE '%campo%IN%'
     AND contype = 'c'
   LIMIT 1;

  IF v_nome_constraint IS NULL THEN
    RAISE EXCEPTION 'Nao se encontrou o CHECK de campo em pessoas_acessos_sensiveis. Investigar antes de aplicar -- nao assumir o nome.';
  END IF;

  IF v_nome_constraint <> 'pessoas_acessos_sensiveis_campo_valido' THEN
    RAISE EXCEPTION
      'O CHECK de campo chama-se "%", nao "pessoas_acessos_sensiveis_campo_valido" como esperado. Actualizar esta migracao com o nome real antes de aplicar.',
      v_nome_constraint;
  END IF;

  IF v_definicao LIKE '%documento%' THEN
    RAISE NOTICE 'O CHECK ja aceita "documento" -- esta migracao e idempotente e nao muda nada.';
  END IF;
END;
$guardas$;

-- ---- A alteracao ------------------------------------------------------------
DO $altera$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.pessoas_acessos_sensiveis'::regclass
       AND c.conname = 'pessoas_acessos_sensiveis_campo_valido'
       AND pg_get_constraintdef(c.oid) LIKE '%documento%'
  ) THEN
    ALTER TABLE public.pessoas_acessos_sensiveis
      DROP CONSTRAINT pessoas_acessos_sensiveis_campo_valido;

    ALTER TABLE public.pessoas_acessos_sensiveis
      ADD CONSTRAINT pessoas_acessos_sensiveis_campo_valido
      CHECK (campo IN ('niss','iban','incapacidade','retribuicao','documento'));
  END IF;
END;
$altera$;

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_definicao text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_definicao
    FROM pg_constraint c
   WHERE c.conrelid = 'public.pessoas_acessos_sensiveis'::regclass
     AND c.conname = 'pessoas_acessos_sensiveis_campo_valido';

  IF v_definicao IS NULL OR v_definicao NOT LIKE '%documento%' THEN
    RAISE EXCEPTION 'pessoas_acessos_sensiveis_campo_valido nao aceita "documento" apos a migracao: %', coalesce(v_definicao, '(constraint nao encontrada)');
  END IF;

  IF v_definicao NOT LIKE '%niss%' OR v_definicao NOT LIKE '%retribuicao%' THEN
    RAISE EXCEPTION 'pessoas_acessos_sensiveis_campo_valido perdeu um dos valores antigos: %', v_definicao;
  END IF;

  RAISE NOTICE 'Guardas passadas: pessoas_acessos_sensiveis aceita campo=documento, sem perder os valores anteriores.';
END;
$conferir$;
