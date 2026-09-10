-- ==============================================================================
-- pessoas.dias_trabalho estava marcada LEGADO desde 20261120140000: a fonte
-- de verdade passou a ser pessoas_vinculos.dias_uteis, que pertence ao
-- CONTRATO e por isso e versionada no tempo. Mas os dados nunca foram
-- migrados -- ha fichas com uma preenchida e a outra vazia. Esta migracao
-- copia o que falta e so depois larga a coluna legada.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- 20261120140000 criou pessoas_vinculos.dias_uteis com o COMMENT a dizer que
-- pessoas.dias_trabalho "nao foi apagada nem migrada -- pode ter valor em
-- fichas criadas antes". Cinco dias depois, ainda e verdade: nenhuma migracao
-- entretanto copiou nada. O ecra de visao geral (PessoaVisaoGeralTab) ainda
-- lia pessoas.dias_trabalho directamente, e o ecra de contrato ja escreve so
-- em pessoas_vinculos.dias_uteis -- duas fontes, uma delas a envelhecer.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- 1. Copia-se pessoas.dias_trabalho para pessoas_vinculos.dias_uteis, mas SO
--    no vinculo EM VIGOR (estado 'activo' OU 'suspenso') de cada pessoa, e SO
--    quando esse vinculo ainda nao tem dias_uteis (nulo ou array vazio) e a
--    pessoa tem dias_trabalho preenchido. idx_pessoas_vinculos_um_em_vigor
--    (20261122100000) garante no maximo UM vinculo em vigor por pessoa --
--    nao ha ambiguidade de qual vinculo recebe a copia.
--
-- 2. ANTES de copiar, aborta-se se alguma pessoa tiver as DUAS colunas
--    preenchidas E DIFERENTES (comparando os dias como conjunto, nao como
--    ordem do array). Escolher qual das duas vale nao e decisao de uma
--    migration -- o mesmo principio de 20261122100000, que tambem abortava
--    em vez de adivinhar perante um caso ambiguo.
--
-- 3. So DEPOIS de o backfill e a guarda (b) passarem, larga-se
--    pessoas.dias_trabalho. Sem CASCADE: se algo dependesse dela para alem
--    do proprio CHECK da coluna (que cai com ela, isso e esperado), a queda
--    em cascata escondia o que se estava a perder. A pesquisa no repositorio
--    (ver abaixo) nao encontrou vistas, triggers nem politicas dependentes --
--    so o CHECK pessoas_dias_trabalho_validos, que e da propria coluna.
--
--
-- -- SITIOS CORRIGIDOS PARA DEIXAREM DE LER A COLUNA ---------------------------
--
-- - src/components/hr/PessoaVisaoGeralTab.tsx: lia pessoa.dias_trabalho para
--   o cartao "Dias de trabalho" da barra de detalhes. Passa a receber
--   `vinculos` e a ler do vinculo em vigor (mesmo criterio activo-ou-suspenso
--   do resto da aplicacao, ver usePessoa.ts:savePlaneado).
-- - src/pages/PessoaDetail.tsx: passa `vinculos={ficha.vinculos}` ao tab
--   acima.
-- - src/hooks/usePessoa.ts (COLUNAS_PESSOA) e src/hooks/usePessoas.ts
--   (COLUNAS_LISTA): deixam de pedir dias_trabalho ao Postgrest -- um select
--   por uma coluna que deixa de existir falhava a consulta inteira.
-- - src/types/hr.ts (interface Pessoa): campo removido.
-- - Testes que construiam um Pessoa de mentira com dias_trabalho: null
--   (PessoaLaboraisTab.estadoDerivado.test.tsx,
--   PessoaLaboraisTab.semEmailPessoal.test.tsx): campo removido do fixture.
--
-- Nao ha Edge Function, vista, trigger nem politica que leia ou escreva
-- pessoas.dias_trabalho -- confirmado por pesquisa no repositorio inteiro
-- antes de escrever este DROP.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem caminho de volta directo: o DROP COLUMN perde os valores. Se for preciso
-- reverter, ha que ter uma copia da coluna antes (pg_dump da tabela, ou
-- reconstruir a partir de pessoas_vinculos.dias_uteis, que a partir desta
-- migracao e um sobrescrito fiel do que la estava).
--
--
-- Prerequisitos:
--   20261120030000  pessoas (dias_trabalho)
--   20261120140000  pessoas_vinculos.dias_uteis
--   20261122100000  idx_pessoas_vinculos_um_em_vigor (activo OU suspenso)
-- ==============================================================================

-- ---- Guardas ----------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name = 'dias_trabalho'
  ) THEN
    RAISE EXCEPTION
      'public.pessoas.dias_trabalho nao existe. Ja foi largada por outra migracao, ou 20261120030000 nao foi aplicada -- investigar antes de aplicar esta.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos' AND column_name = 'dias_uteis'
  ) THEN
    RAISE EXCEPTION
      'public.pessoas_vinculos.dias_uteis nao existe -- 20261120140000 tem de ir a frente na fila.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'idx_pessoas_vinculos_um_em_vigor'
  ) THEN
    RAISE EXCEPTION
      'idx_pessoas_vinculos_um_em_vigor nao existe -- 20261122100000 tem de ir a frente na fila. Sem ele nao ha garantia de UM SO vinculo em vigor por pessoa, e o backfill desta migracao assume isso.';
  END IF;
END;
$guardas$;

-- ---- Guarda (b): abortar perante conflito real -----------------------------
-- Preenchidas as DUAS e DIFERENTES (como conjunto, nao como ordem do array):
-- nao se escolhe por uma migration qual das duas vale.
DO $abortar_se_conflito$
DECLARE
  v_conflitos integer;
  v_ids       text;
BEGIN
  WITH conflito AS (
    SELECT p.id AS pessoa_id
    FROM public.pessoas p
    JOIN public.pessoas_vinculos v
      ON v.pessoa_id = p.id
     AND v.organization_id = p.organization_id
     AND v.deleted_at IS NULL
     AND v.estado IN ('activo', 'suspenso')
    WHERE p.deleted_at IS NULL
      AND p.dias_trabalho IS NOT NULL AND cardinality(p.dias_trabalho) > 0
      AND v.dias_uteis     IS NOT NULL AND cardinality(v.dias_uteis)     > 0
      AND (SELECT array_agg(d ORDER BY d) FROM unnest(p.dias_trabalho) d)
          IS DISTINCT FROM
          (SELECT array_agg(d ORDER BY d) FROM unnest(v.dias_uteis) d)
  )
  SELECT count(*), (SELECT string_agg(pessoa_id::text, ', ') FROM (SELECT pessoa_id FROM conflito LIMIT 20) sub)
    INTO v_conflitos, v_ids
  FROM conflito;

  IF v_conflitos > 0 THEN
    RAISE EXCEPTION
      'Backfill abortado: % pessoa(s) com pessoas.dias_trabalho E pessoas_vinculos.dias_uteis (do vinculo em vigor) preenchidos e DIFERENTES. Escolher qual vale nao e decisao de uma migration -- resolver a mao, pessoa a pessoa, ou escrever uma migracao de dados a parte revista por alguem. IDs (ate 20): %',
      v_conflitos, v_ids;
  END IF;

  RAISE NOTICE 'Guarda passada: nenhuma pessoa tem dias_trabalho e dias_uteis preenchidos e diferentes.';
END;
$abortar_se_conflito$;

-- ---- (a) Backfill: copia-se so onde falta -----------------------------------
DO $backfill$
DECLARE
  v_copiados bigint;
BEGIN
  UPDATE public.pessoas_vinculos v
     SET dias_uteis = p.dias_trabalho,
         updated_at = now()
    FROM public.pessoas p
   WHERE v.pessoa_id = p.id
     AND v.organization_id = p.organization_id
     AND v.deleted_at IS NULL
     AND v.estado IN ('activo', 'suspenso')
     AND p.deleted_at IS NULL
     AND (v.dias_uteis IS NULL OR cardinality(v.dias_uteis) = 0)
     AND p.dias_trabalho IS NOT NULL AND cardinality(p.dias_trabalho) > 0;

  GET DIAGNOSTICS v_copiados = ROW_COUNT;
  RAISE NOTICE 'Backfill: % vinculo(s) em vigor receberam dias_uteis copiado de pessoas.dias_trabalho.', v_copiados;
END;
$backfill$;

-- ---- Conferir antes do DROP --------------------------------------------------
DO $conferir_antes$
DECLARE
  v_por_migrar integer;
BEGIN
  -- Depois do backfill, nao deve sobrar nenhuma pessoa com vinculo em vigor
  -- sem dias_uteis e com dias_trabalho preenchido -- ou o backfill falhou
  -- silenciosamente nalgum caso que as guardas nao previam.
  SELECT count(*) INTO v_por_migrar
    FROM public.pessoas p
    JOIN public.pessoas_vinculos v
      ON v.pessoa_id = p.id
     AND v.organization_id = p.organization_id
     AND v.deleted_at IS NULL
     AND v.estado IN ('activo', 'suspenso')
   WHERE p.deleted_at IS NULL
     AND (v.dias_uteis IS NULL OR cardinality(v.dias_uteis) = 0)
     AND p.dias_trabalho IS NOT NULL AND cardinality(p.dias_trabalho) > 0;

  IF v_por_migrar > 0 THEN
    RAISE EXCEPTION
      'Depois do backfill, ainda ha % vinculo(s) em vigor sem dias_uteis com pessoas.dias_trabalho preenchido. Nao continuar para o DROP -- investigar antes.',
      v_por_migrar;
  END IF;
END;
$conferir_antes$;

-- ---- (c) So agora se larga a coluna legada -----------------------------------
-- Sem CASCADE: a pesquisa no repositorio (migrations, src, Edge Functions,
-- vistas, triggers, politicas) nao encontrou nada dependente para alem do
-- CHECK da propria coluna, que cai com ela por ser dela.
ALTER TABLE public.pessoas DROP COLUMN dias_trabalho;

-- ---- Conferir depois do DROP --------------------------------------------------
DO $conferir_depois$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name = 'dias_trabalho'
  ) THEN
    RAISE EXCEPTION 'pessoas.dias_trabalho ainda existe depois do DROP COLUMN.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_dias_trabalho_validos' AND conrelid = 'public.pessoas'::regclass
  ) THEN
    RAISE EXCEPTION 'pessoas_dias_trabalho_validos ainda existe -- devia ter caido com a coluna.';
  END IF;

  RAISE NOTICE 'OK: dias_trabalho migrado para o vinculo em vigor onde faltava, e a coluna legada foi largada.';
END;
$conferir_depois$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. Mexe num campo lido por PessoaVisaoGeralTab.tsx. A alteracao de src TEM
--    de ir no mesmo commit que esta migracao -- caso contrario o ecra de
--    visao geral fica a pedir uma coluna que ja nao existe.
--
-- 2. A guarda (b) pode abortar com os dados actuais se alguma ficha tiver as
--    duas colunas preenchidas e diferentes. Se abortar, NAO se enfraquece a
--    guarda para passar -- resolve-se a mao ou escreve-se a parte.
--
-- 3. Correr os testes ANTES do push, contra o remoto ainda por corrigir.
--
-- 4. Nao ha janela em que a base fique defeituosa: o backfill so PREENCHE
--    onde estava vazio, e o DROP so acontece depois de as duas guardas
--    (conflito e "ainda falta migrar") passarem.
-- ==============================================================================
