-- ==============================================================================
-- pessoas_vinculos ganha categoria_funcao e periodo_experimental_origem.
-- Duas colunas ADITIVAS, sem CHECK sobre a duracao do periodo experimental.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A duracao legal do periodo experimental depende da categoria da funcao
-- (geral / tecnica-de-confianca / direccao e quadros superiores) e do tipo de
-- contrato. pessoas.cargo e texto livre (nao ha catalogo de funcoes com
-- categoria legal) -- derivar a duracao dessa cadeia seria inventar direito.
-- Por isso a categoria e um campo EXPLICITO, escolhido por quem cria o
-- contrato, e a tabela de duracoes vive em codigo
-- (src/lib/hr/periodoExperimental.ts), nao na base: e lei, muda por diploma,
-- tem teste unitario e revisao em PR -- nao configuracao de organizacao.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
--   categoria_funcao             'geral' | 'tecnica_confianca' |
--                                 'direcao_quadro_superior', nullable
--   periodo_experimental_origem  'sugerido' | 'manual', nullable
--
-- SEM CHECK sobre periodo_experimental_dias ou periodo_experimental_ate: a lei
-- permite reducao por IRCT ou acordo escrito, e EXCLUSAO quando a pessoa ja
-- exerceu a mesma funcao para o mesmo empregador. Um CHECK sobre o valor
-- rejeitaria contratos legitimos -- o erro ja registado neste repositorio de
-- um CHECK cruzado que recusava o registo mais obvio. O intervalo 0..1095 de
-- pessoas_vinculos_periodo_experimental_dias_valido (20261120140000) continua
-- a ser a unica validacao, e nao se toca nele.
--
-- periodo_experimental_origem distingue o que veio por omissao (a UI
-- preencheu com a sugestao da tabela legal) do que foi escolhido a mao --
-- para que um dia se possa perguntar "quantos contratos desviaram da
-- sugestao" sem isso significar "quantos estao errados".
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nenhuma constraint cruzando categoria_funcao com periodo_experimental_*.
-- - Nenhum backfill: fichas existentes ficam com as duas colunas NULL.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   ALTER TABLE public.pessoas_vinculos
--     DROP COLUMN IF EXISTS categoria_funcao,
--     DROP COLUMN IF EXISTS periodo_experimental_origem;
--
--
-- Prerequisitos:
--   20261120060000  pessoas_vinculos
--   20261120140000  pessoas_vinculos_periodo_experimental_dias_valido (0..1095)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_priv_tabela text;
  v_priv_coluna integer;
BEGIN
  IF to_regclass('public.pessoas_vinculos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_vinculos nao existe. Aplicar 20261120060000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pessoas_vinculos_periodo_experimental_dias_valido'
      AND conrelid = 'public.pessoas_vinculos'::regclass
  ) THEN
    RAISE EXCEPTION 'pessoas_vinculos_periodo_experimental_dias_valido nao existe. Aplicar 20261120140000 primeiro.';
  END IF;

  -- Confirmar que pessoas_vinculos NAO tem grants por coluna hoje (so de
  -- tabela), antes de assumir que as colunas novas herdam o mesmo regime.
  SELECT count(*) INTO v_priv_coluna
    FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.pessoas_vinculos')
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.attacl IS NOT NULL;

  IF v_priv_coluna <> 0 THEN
    RAISE EXCEPTION
      'pessoas_vinculos tem % privilegio(s) de COLUNA. Esta migracao assume grants so de TABELA -- investigar antes de acrescentar colunas, e acrescentar as duas novas ao GRANT de coluna se for o caso.',
      v_priv_coluna;
  END IF;

  SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) INTO v_priv_tabela
    FROM information_schema.table_privileges
   WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos'
     AND grantee = 'authenticated';

  IF v_priv_tabela IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN
    RAISE EXCEPTION
      'pessoas_vinculos: privilegios de TABELA para authenticated sao "%", esperava-se INSERT,SELECT,UPDATE (20261120060000). Investigar antes de acrescentar colunas.',
      coalesce(v_priv_tabela, '(nenhum)');
  END IF;
END;
$guardas$;

-- ---- As duas colunas --------------------------------------------------------
ALTER TABLE public.pessoas_vinculos
  ADD COLUMN IF NOT EXISTS categoria_funcao text,
  ADD COLUMN IF NOT EXISTS periodo_experimental_origem text;

DO $checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_categoria_funcao_valida'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    ALTER TABLE public.pessoas_vinculos
      ADD CONSTRAINT pessoas_vinculos_categoria_funcao_valida CHECK (
        categoria_funcao IS NULL
        OR categoria_funcao IN ('geral','tecnica_confianca','direcao_quadro_superior')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_periodo_experimental_origem_valida'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    ALTER TABLE public.pessoas_vinculos
      ADD CONSTRAINT pessoas_vinculos_periodo_experimental_origem_valida CHECK (
        periodo_experimental_origem IS NULL
        OR periodo_experimental_origem IN ('sugerido','manual')
      );
  END IF;
END;
$checks$;

COMMENT ON COLUMN public.pessoas_vinculos.categoria_funcao IS
'Categoria legal da funcao para efeitos de duracao do periodo experimental: geral, tecnica_confianca ou direcao_quadro_superior. Escolhida por quem cria o contrato -- NAO derivada de pessoas.cargo, que e texto livre sem categoria legal. A duracao correspondente vive em codigo (src/lib/hr/periodoExperimental.ts), nao aqui: e lei, nao configuracao.';
COMMENT ON COLUMN public.pessoas_vinculos.periodo_experimental_origem IS
'Distingue se periodo_experimental_dias/periodo_experimental_ate vieram da SUGESTAO legal (''sugerido'') ou foram alterados a mao (''manual''). Sem CHECK que valide o VALOR contra a sugestao: a lei permite reducao por IRCT/acordo e exclusao por funcao ja exercida, e um contrato legitimo pode divergir da sugestao em qualquer sentido.';

-- ---- Conferir ---------------------------------------------------------------
DO $conferir$
DECLARE
  v_colunas integer;
BEGIN
  SELECT count(*) INTO v_colunas
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos'
     AND column_name IN ('categoria_funcao','periodo_experimental_origem');

  IF v_colunas <> 2 THEN
    RAISE EXCEPTION 'pessoas_vinculos deveria ter ganho 2 colunas novas, ganhou %.', v_colunas;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_periodo_experimental_dias_valido'
       AND conrelid = 'public.pessoas_vinculos'::regclass
  ) THEN
    RAISE EXCEPTION 'pessoas_vinculos_periodo_experimental_dias_valido desapareceu -- esta migracao nao lhe devia ter tocado.';
  END IF;

  RAISE NOTICE 'Guardas passadas: pessoas_vinculos ganhou categoria_funcao e periodo_experimental_origem, sem CHECK sobre a duracao.';
END;
$conferir$;
