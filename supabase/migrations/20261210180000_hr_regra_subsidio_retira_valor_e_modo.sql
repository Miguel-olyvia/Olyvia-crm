-- ==============================================================================
-- hr_regras_subsidio_alimentacao -- retira as colunas valor_diario e modo.
--
-- POR APLICAR. O CODIGO QUE DEPENDE JA ESTA NO COMMIT cdd01aac.
-- NAO PRECISA DE CODIGO NOVO. (Mesmo assim, o codigo tem de estar publicado ANTES do push: um
-- build antigo que ainda pedisse estas colunas passaria a falhar em todas as
-- leituras e gravacoes desta tabela.)
--
--
-- -- A DECISAO -----------------------------------------------------------------
--
-- O valor e o modo (cartao/dinheiro) do subsidio de alimentacao sao SO POR
-- PESSOA (pessoas_retribuicoes.subsidio_alimentacao e _modo). A unica regra da
-- organizacao e hr_regras_subsidio_alimentacao.minutos_minimos_dia. A migration
-- 20261210170000 marcou valor_diario e modo como obsoletos (so COMMENT) e o
-- hook, o ecra, os tipos e o calculo ja so usam minutos_minimos_dia. Como nao
-- sao usadas, RETIRAM-SE (decisao do Miguel).
--
--
-- -- O QUE ESTA MIGRATION FAZ --------------------------------------------------
--
-- 1. Guardas (abortam com mensagem clara, antes de mexer em nada):
--    - a tabela tem de existir; as duas colunas existem ou ja foram as duas
--      retiradas (nesse caso RAISE NOTICE e salta as guardas seguintes: a
--      migration e idempotente); so uma das duas = aborta;
--    - nenhuma funcao do schema public refere a tabela junto com valor_diario
--      ou modo (pg_proc.prosrc);
--    - nenhuma vista, vista materializada, politica, regra, trigger, indice ou
--      FK de outra tabela depende das colunas (pg_depend, pg_views,
--      pg_matviews, pg_policies);
--    - as unicas constraints que tocam as colunas sao CHECKs que dependem SO
--      delas (as duas actuais): nenhuma constraint com mais colunas, PK,
--      UNIQUE ou FK fica desfeita em silencio.
-- 2. ALTER TABLE ... DROP COLUMN valor_diario, DROP COLUMN modo (sem CASCADE:
--    se aparecer uma dependencia que as guardas nao viram, o DROP falha). Os
--    CHECKs hr_regras_subsidio_alimentacao_valor_nao_negativo e
--    hr_regras_subsidio_alimentacao_modo_valido caem com as colunas, e os
--    COMMENT das colunas tambem.
-- 3. COMMENT ON TABLE: a tabela guarda so o tempo minimo por dia.
-- 4. Conferir, a terminar sempre em HR900 (tudo o que o teste cria desfaz-se):
--    colunas finais, ausencia das retiradas, constraints que ficam, grants
--    (authenticated = INSERT,SELECT,UPDATE; anon = nada), RLS e as 4
--    politicas intactas, e um upsert so com organization_id e
--    minutos_minimos_dia, numa organizacao fabricada. O upsert corre com o
--    papel da migration (sem RLS); o que as politicas deixam passar a cada
--    utilizador e verificado pelo catalogo, nao ao vivo.
--
--
-- -- ORDEM COM A MIGRATION DO SEED ---------------------------------------------
--
-- A migration 20261210090000 (seed, ja aplicada) inseria valor_diario e modo.
-- Corre ANTES desta, que vem depois: numa base reconstruida do zero as colunas
-- existem quando o seed corre e so depois sao retiradas, por isso nada parte.
-- (Se o seed for reescrito para nao as usar, esta migration continua valida.)
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- NAO E REVERSIVEL sem refazer as colunas: os valores que la estavam perdem-se
-- (eram valores por omissao ja ignorados pelo codigo). Sem ficheiro de reversao
-- nesta pasta, de proposito. Refazer as colunas seria um ALTER TABLE ADD COLUMN
-- novo, com os defaults (valor_diario numeric(10,2) NOT NULL DEFAULT 0, modo text
-- NOT NULL DEFAULT 'dinheiro') e os CHECKs de 20261201200000.
--
-- Prerequisitos:
--   20261201200000  hr_regras_subsidio_alimentacao
--   20261210170000  marca as colunas como obsoletas
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_tabela  oid;
  v_attnums smallint[];
  v_n       integer;
  v_lista   text;
BEGIN
  v_tabela := to_regclass('public.hr_regras_subsidio_alimentacao');
  IF v_tabela IS NULL THEN
    RAISE EXCEPTION 'public.hr_regras_subsidio_alimentacao nao existe. Aplicar 20261201200000 primeiro.';
  END IF;

  SELECT count(*), array_agg(attnum)
    INTO v_n, v_attnums
    FROM pg_attribute
   WHERE attrelid = v_tabela
     AND attname IN ('valor_diario', 'modo')
     AND NOT attisdropped;

  IF v_n = 0 THEN
    RAISE NOTICE 'valor_diario e modo ja foram retiradas de hr_regras_subsidio_alimentacao: nada a retirar, so se confere o estado final.';
    RETURN;
  END IF;

  IF v_n <> 2 THEN
    RAISE EXCEPTION 'hr_regras_subsidio_alimentacao so tem uma das colunas valor_diario/modo (tem %, esperavam-se 2 ou 0): o schema mudou. Investigar antes de aplicar.', v_n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = v_tabela AND attname = 'minutos_minimos_dia' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'hr_regras_subsidio_alimentacao.minutos_minimos_dia nao existe: retirar as outras colunas deixaria a tabela sem regra nenhuma. Investigar antes de aplicar.';
  END IF;

  -- 1. Funcoes do schema public que refiram a tabela junto com as colunas.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
    INTO v_lista
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc ILIKE '%hr_regras_subsidio_alimentacao%'
     AND (p.prosrc ~* 'valor_diario' OR p.prosrc ~* '\mmodo\M');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'Funcoes que referem hr_regras_subsidio_alimentacao junto com valor_diario ou modo: %. Corrigir as funcoes antes de retirar as colunas.', v_lista;
  END IF;

  -- 2. Qualquer objecto ligado as colunas, excepto o DEFAULT e as constraints
  --    (as constraints tem a guarda propria, mais abaixo).
  SELECT string_agg(DISTINCT pg_describe_object(d.classid, d.objid, d.objsubid), '; ')
    INTO v_lista
    FROM pg_depend d
   WHERE d.refclassid = 'pg_class'::regclass
     AND d.refobjid = v_tabela
     AND d.refobjsubid = ANY (v_attnums)
     AND d.classid NOT IN ('pg_attrdef'::regclass, 'pg_constraint'::regclass);
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'Ha objectos que dependem de valor_diario ou modo: %. Resolver antes de retirar as colunas.', v_lista;
  END IF;

  -- 3. Vistas, vistas materializadas e politicas (texto), de qualquer tabela.
  SELECT string_agg(schemaname || '.' || viewname, ', ')
    INTO v_lista
    FROM pg_views
   WHERE definition ILIKE '%hr_regras_subsidio_alimentacao%'
     AND (definition ~* 'valor_diario' OR definition ~* '\mmodo\M');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'Vistas que referem as colunas a retirar: %.', v_lista;
  END IF;

  SELECT string_agg(schemaname || '.' || matviewname, ', ')
    INTO v_lista
    FROM pg_matviews
   WHERE definition ILIKE '%hr_regras_subsidio_alimentacao%'
     AND (definition ~* 'valor_diario' OR definition ~* '\mmodo\M');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'Vistas materializadas que referem as colunas a retirar: %.', v_lista;
  END IF;

  SELECT string_agg(schemaname || '.' || tablename || ' / ' || policyname, ', ')
    INTO v_lista
    FROM pg_policies
   WHERE (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~* 'valor_diario'
      OR (
        (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~* '\mmodo\M'
        AND (
          (schemaname = 'public' AND tablename = 'hr_regras_subsidio_alimentacao')
          OR (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ILIKE '%hr_regras_subsidio_alimentacao%'
        )
      );
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'Politicas que referem as colunas a retirar: %.', v_lista;
  END IF;

  -- 4. Constraints: so CHECKs que dependam SO destas duas colunas podem cair.
  SELECT string_agg(conname || ' (' || contype::text || ')', ', ' ORDER BY conname)
    INTO v_lista
    FROM pg_constraint
   WHERE conrelid = v_tabela
     AND conkey && v_attnums
     AND NOT (contype = 'c' AND conkey <@ v_attnums);
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'Constraints que tocam valor_diario/modo e ficariam desfeitas ou alteradas em silencio (nao sao CHECKs so destas colunas): %.', v_lista;
  END IF;

  SELECT string_agg(conname || ' em ' || conrelid::regclass::text, ', ' ORDER BY conname)
    INTO v_lista
    FROM pg_constraint
   WHERE confrelid = v_tabela
     AND confkey && v_attnums;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'FKs de outras tabelas que apontam para valor_diario/modo: %.', v_lista;
  END IF;

  SELECT string_agg(conname, ', ' ORDER BY conname)
    INTO v_lista
    FROM pg_constraint
   WHERE conrelid = v_tabela
     AND conkey && v_attnums;
  RAISE NOTICE 'Caem com as colunas (CHECKs so destas colunas): %.', coalesce(v_lista, '(nenhuma)');
END;
$guardas$;

-- ==============================================================================
-- 1. Retirar as colunas
-- ==============================================================================
ALTER TABLE public.hr_regras_subsidio_alimentacao
  DROP COLUMN IF EXISTS valor_diario,
  DROP COLUMN IF EXISTS modo;

-- ==============================================================================
-- 2. O comentario da tabela
-- ==============================================================================
COMMENT ON TABLE public.hr_regras_subsidio_alimentacao IS
'Regra do subsidio de alimentacao da organizacao, uma linha por organizacao (UNIQUE em organization_id). Guarda so o tempo minimo por dia: minutos_minimos_dia, quantos minutos trabalhados num dia dao direito ao subsidio desse dia. O valor e o modo (dinheiro/cartao) do subsidio sao por pessoa (pessoas_retribuicoes.subsidio_alimentacao e subsidio_alimentacao_modo).';

-- ==============================================================================
-- Conferir. Bloco aninhado que TERMINA sempre em HR900: o que o teste fabrica
-- (organizacao e linhas) desfaz-se com o rollback do sub-bloco. Qualquer falha
-- propaga com o seu proprio codigo.
-- ==============================================================================
DO $conferir$
DECLARE
  v_colunas     text;
  v_privilegios text;
  v_n           integer;
  v_comentario  text;
  v_org         uuid;
  v_minutos     integer;
BEGIN
  BEGIN
    -- 1. As colunas finais, exactamente.
    SELECT string_agg(column_name, ',' ORDER BY column_name)
      INTO v_colunas
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'hr_regras_subsidio_alimentacao';
    IF v_colunas IS DISTINCT FROM 'created_at,created_by,id,minutos_minimos_dia,organization_id,updated_at,updated_by' THEN
      RAISE EXCEPTION 'hr_regras_subsidio_alimentacao ficou com as colunas "%", esperava-se created_at, created_by, id, minutos_minimos_dia, organization_id, updated_at, updated_by.', coalesce(v_colunas, '(nenhuma)')
        USING ERRCODE = 'HR901';
    END IF;

    -- 2. Nenhuma das retiradas, nem constraint que a mencione.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'hr_regras_subsidio_alimentacao'
         AND column_name IN ('valor_diario', 'modo')
    ) THEN
      RAISE EXCEPTION 'valor_diario ou modo ainda existem em hr_regras_subsidio_alimentacao.'
        USING ERRCODE = 'HR902';
    END IF;

    SELECT count(*) INTO v_n
      FROM pg_constraint
     WHERE conrelid = 'public.hr_regras_subsidio_alimentacao'::regclass
       AND conname IN (
         'hr_regras_subsidio_alimentacao_pkey',
         'hr_regras_subsidio_alimentacao_org_key',
         'hr_regras_subsidio_alimentacao_org_fkey',
         'hr_regras_subsidio_alimentacao_created_by_fkey',
         'hr_regras_subsidio_alimentacao_updated_by_fkey',
         'hr_regras_subsidio_alimentacao_minutos_positivos'
       );
    IF v_n <> 6 THEN
      RAISE EXCEPTION 'Das 6 constraints que deviam ficar (pkey, org_key, 3 FKs, minutos_positivos) ficaram %.', v_n
        USING ERRCODE = 'HR903';
    END IF;

    SELECT count(*) INTO v_n
      FROM pg_constraint
     WHERE conrelid = 'public.hr_regras_subsidio_alimentacao'::regclass;
    IF v_n <> 6 THEN
      RAISE EXCEPTION 'hr_regras_subsidio_alimentacao tem % constraints, esperavam-se exactamente 6.', v_n
        USING ERRCODE = 'HR903';
    END IF;

    -- 3. Grants: o direito de tabela mantem-se, e nada a anon.
    SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) INTO v_privilegios
      FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'hr_regras_subsidio_alimentacao'
       AND grantee = 'authenticated';
    IF v_privilegios IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN
      RAISE EXCEPTION 'hr_regras_subsidio_alimentacao: authenticated tem "%", esperava-se exactamente INSERT,SELECT,UPDATE.', coalesce(v_privilegios, '(nenhum)')
        USING ERRCODE = 'HR904';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
       WHERE table_schema = 'public' AND table_name = 'hr_regras_subsidio_alimentacao' AND grantee = 'anon'
    ) THEN
      RAISE EXCEPTION 'hr_regras_subsidio_alimentacao ficou com grant a anon.'
        USING ERRCODE = 'HR904';
    END IF;

    IF NOT (
      has_column_privilege('authenticated', 'public.hr_regras_subsidio_alimentacao', 'minutos_minimos_dia', 'INSERT')
      AND has_column_privilege('authenticated', 'public.hr_regras_subsidio_alimentacao', 'minutos_minimos_dia', 'UPDATE')
      AND has_column_privilege('authenticated', 'public.hr_regras_subsidio_alimentacao', 'minutos_minimos_dia', 'SELECT')
    ) THEN
      RAISE EXCEPTION 'authenticated perdeu SELECT/INSERT/UPDATE sobre minutos_minimos_dia.'
        USING ERRCODE = 'HR904';
    END IF;

    -- 4. RLS e as quatro politicas, pelos nomes.
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hr_regras_subsidio_alimentacao'::regclass) THEN
      RAISE EXCEPTION 'RLS nao esta activa em hr_regras_subsidio_alimentacao.'
        USING ERRCODE = 'HR905';
    END IF;

    SELECT count(*) INTO v_n FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'hr_regras_subsidio_alimentacao'
       AND policyname IN (
         'hr_regras_subsidio_alimentacao_select',
         'hr_regras_subsidio_alimentacao_insert',
         'hr_regras_subsidio_alimentacao_update',
         'hr_regras_subsidio_alimentacao_block_delete'
       );
    IF v_n <> 4 THEN
      RAISE EXCEPTION 'Das 4 politicas de hr_regras_subsidio_alimentacao encontraram-se % pelo nome.', v_n
        USING ERRCODE = 'HR905';
    END IF;

    SELECT count(*) INTO v_n FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'hr_regras_subsidio_alimentacao';
    IF v_n <> 4 THEN
      RAISE EXCEPTION 'hr_regras_subsidio_alimentacao ficou com % politicas, esperavam-se 4.', v_n
        USING ERRCODE = 'HR905';
    END IF;

    -- 5. O comentario da tabela.
    SELECT obj_description('public.hr_regras_subsidio_alimentacao'::regclass, 'pg_class')
      INTO v_comentario;
    IF v_comentario IS NULL OR v_comentario NOT LIKE '%Guarda so o tempo minimo por dia%' THEN
      RAISE EXCEPTION 'O comentario da tabela devia dizer que guarda so o tempo minimo por dia; e: %.', coalesce(v_comentario, 'NULL')
        USING ERRCODE = 'HR906';
    END IF;

    -- 6. Teste fabricado: o upsert do hook (so organization_id e
    --    minutos_minimos_dia) continua a funcionar, e o CHECK que fica rejeita 0.
    INSERT INTO public.anew_organizations (name)
    VALUES ('Teste migracao 20261210180000 (descartavel)')
    RETURNING id INTO v_org;

    INSERT INTO public.hr_regras_subsidio_alimentacao (organization_id, minutos_minimos_dia)
    VALUES (v_org, 45)
    ON CONFLICT (organization_id) DO UPDATE SET minutos_minimos_dia = EXCLUDED.minutos_minimos_dia;

    INSERT INTO public.hr_regras_subsidio_alimentacao (organization_id, minutos_minimos_dia)
    VALUES (v_org, 90)
    ON CONFLICT (organization_id) DO UPDATE SET minutos_minimos_dia = EXCLUDED.minutos_minimos_dia;

    SELECT count(*), max(minutos_minimos_dia)
      INTO v_n, v_minutos
      FROM public.hr_regras_subsidio_alimentacao
     WHERE organization_id = v_org;
    IF v_n <> 1 OR v_minutos IS DISTINCT FROM 90 THEN
      RAISE EXCEPTION 'O upsert so com organization_id e minutos_minimos_dia devia deixar 1 linha com 90 minutos; ficaram % linha(s), minutos %.', v_n, coalesce(v_minutos::text, 'NULL')
        USING ERRCODE = 'HR907';
    END IF;

    BEGIN
      UPDATE public.hr_regras_subsidio_alimentacao
         SET minutos_minimos_dia = 0
       WHERE organization_id = v_org;
      RAISE EXCEPTION 'O CHECK minutos_positivos devia ter rejeitado 0 minutos.'
        USING ERRCODE = 'HR908';
    EXCEPTION
      WHEN check_violation THEN
        NULL; -- esperado
    END;

    RAISE EXCEPTION 'sentinela: conferencia concluida' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL;
  END;
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. Correr `supabase migration list --linked` e listar o que esta pendente:
--    o push aplica TUDO o que estiver na pasta, por ordem.
-- 2. Confirmar que o commit cdd01aac (o codigo que ja nao usa as colunas) esta
--    publicado: um build antigo que pedisse valor_diario/modo falharia.
-- 3. Irreversivel sem refazer as colunas (ver o cabecalho).
-- ==============================================================================
