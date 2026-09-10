-- ==============================================================================
-- pessoas_identificacao ganha a carta de conducao (3 colunas). Esta tabela tem
-- grants por COLUNA (o NISS) -- as colunas novas tem de ser concedidas
-- explicitamente, ou ficam invisiveis em silencio.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A carta de conducao coexiste com o cartao de cidadao na ficha -- nao e um
-- "tipo_documento" alternativo, e um documento a parte. pessoas_identificacao
-- fecha o NISS por GRANT ao nivel da COLUNA (20261120040000): um simples
-- ALTER TABLE ADD COLUMN deixaria as tres colunas novas SEM grant nenhum --
-- nao aparecem no SELECT nem aceitam INSERT/UPDATE de authenticated, sem erro
-- visivel no schema. E exactamente o erro que este ficheiro existe para nao
-- cometer.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- ADD COLUMN IF NOT EXISTS para as 3 colunas, e GRANT explicito das 3 em
-- SELECT, INSERT e UPDATE a authenticated -- as mesmas operacoes que as outras
-- colunas nao-NISS ja tem. O bloco de conferir compara, via pg_attribute.attacl
-- (NUNCA information_schema.column_privileges, que nao reflecte grants por
-- coluna correctamente), as colunas com privilegio de authenticated contra as
-- colunas da tabela, e FALHA se alguma coluna nao-sensivel ficar de fora. A
-- lista de excepcao e exactamente {niss}.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- REVOKE SELECT (carta_conducao_numero, carta_conducao_categorias, carta_conducao_validade)
--   ON public.pessoas_identificacao FROM authenticated;
-- REVOKE INSERT (carta_conducao_numero, carta_conducao_categorias, carta_conducao_validade)
--   ON public.pessoas_identificacao FROM authenticated;
-- REVOKE UPDATE (carta_conducao_numero, carta_conducao_categorias, carta_conducao_validade)
--   ON public.pessoas_identificacao FROM authenticated;
-- ALTER TABLE public.pessoas_identificacao
--   DROP COLUMN IF EXISTS carta_conducao_numero,
--   DROP COLUMN IF EXISTS carta_conducao_categorias,
--   DROP COLUMN IF EXISTS carta_conducao_validade;
--
--
-- Prerequisitos:
--   20261120040000  pessoas_identificacao (grants por coluna, niss fechado)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_niss_legivel boolean;
BEGIN
  IF to_regclass('public.pessoas_identificacao') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_identificacao nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  SELECT has_column_privilege('authenticated', 'public.pessoas_identificacao', 'niss', 'SELECT')
    INTO v_niss_legivel;

  IF v_niss_legivel THEN
    RAISE EXCEPTION 'authenticated ja consegue ler niss -- o pressuposto de grants por coluna nesta tabela mudou. Investigar antes de aplicar.';
  END IF;
END;
$guardas$;

-- ---- As colunas --------------------------------------------------------------
ALTER TABLE public.pessoas_identificacao
  ADD COLUMN IF NOT EXISTS carta_conducao_numero      text,
  ADD COLUMN IF NOT EXISTS carta_conducao_categorias  text,
  ADD COLUMN IF NOT EXISTS carta_conducao_validade    date;

COMMENT ON COLUMN public.pessoas_identificacao.carta_conducao_numero IS
'Carta de conducao -- coexiste com tipo_documento/numero_documento (o CC ou equivalente), nao os substitui.';

-- ---- Grants por coluna, explicitos: e o ponto central desta migracao -------
GRANT SELECT (carta_conducao_numero, carta_conducao_categorias, carta_conducao_validade)
  ON TABLE public.pessoas_identificacao TO authenticated;
GRANT INSERT (carta_conducao_numero, carta_conducao_categorias, carta_conducao_validade)
  ON TABLE public.pessoas_identificacao TO authenticated;
GRANT UPDATE (carta_conducao_numero, carta_conducao_categorias, carta_conducao_validade)
  ON TABLE public.pessoas_identificacao TO authenticated;

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_col        text;
  v_esperadas  text[] := ARRAY[
    'id','pessoa_id','organization_id',
    'tipo_documento','numero_documento','validade_documento',
    'nif','niss_ultimos4',
    'carta_conducao_numero','carta_conducao_categorias','carta_conducao_validade',
    'created_at','updated_at','created_by','updated_by'
  ];
  v_excepcao   text[] := ARRAY['niss'];
  v_col_real   text;
BEGIN
  -- Todas as colunas da tabela, excepto a de excepcao (niss), tem de ter
  -- SELECT concedido a authenticated. Ler por pg_attribute.attacl, nunca por
  -- information_schema.column_privileges.
  FOR v_col_real IN
    SELECT a.attname FROM pg_attribute a
    WHERE a.attrelid = 'public.pessoas_identificacao'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
  LOOP
    IF v_col_real = ANY (v_excepcao) THEN
      CONTINUE;
    END IF;

    IF NOT has_column_privilege('authenticated', 'public.pessoas_identificacao', v_col_real, 'SELECT') THEN
      RAISE EXCEPTION
        'A coluna % de pessoas_identificacao nao tem SELECT concedido a authenticated, e nao esta na lista de excepcao {niss}. Uma coluna nova ficou invisivel em silencio.',
        v_col_real;
    END IF;
  END LOOP;

  -- niss continua fechado.
  IF has_column_privilege('authenticated', 'public.pessoas_identificacao', 'niss', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated passou a conseguir ler niss. O mascaramento caiu -- nao aplicar esta migracao neste estado.';
  END IF;

  -- As 3 colunas novas, especificamente, tem de estar legiveis e escreviveis.
  FOREACH v_col IN ARRAY ARRAY['carta_conducao_numero','carta_conducao_categorias','carta_conducao_validade']
  LOOP
    IF NOT has_column_privilege('authenticated', 'public.pessoas_identificacao', v_col, 'SELECT') THEN
      RAISE EXCEPTION 'authenticated nao consegue ler %.', v_col;
    END IF;
    IF NOT has_column_privilege('authenticated', 'public.pessoas_identificacao', v_col, 'UPDATE') THEN
      RAISE EXCEPTION 'authenticated nao consegue escrever %.', v_col;
    END IF;
  END LOOP;

  RAISE NOTICE 'OK: carta de conducao adicionada, grants de coluna explicitos, niss continua fechado, nenhuma coluna nao-sensivel ficou sem grant.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. Aditiva: so ADD COLUMN e GRANT novos. Nenhum REVOKE nesta migracao, logo
--    nenhuma janela em que a tabela fique mais fechada do que hoje.
-- 2. Se um dia se adicionar OUTRA coluna a pessoas_identificacao (fora desta
--    ronda), repetir o mesmo bloco de conferir -- e a unica forma de apanhar
--    uma coluna esquecida sem grant.
-- ==============================================================================
