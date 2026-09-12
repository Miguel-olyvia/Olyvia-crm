-- ==============================================================================
-- O TRAVAO: dois indices unicos parciais impedem, ao nivel da base, duas
-- fichas com o MESMO NIF ou o MESMO NISS na MESMA organizacao.
--
-- ****************************************************************************
-- POR APLICAR -- E NAO SE APLICA SEM VERIFICAR PRIMEIRO SE HA DUPLICADOS VIVOS.
-- O bloco de guardas desta migracao aborta se encontrar algum: o censo de
-- 20261130010000 diz onde procurar, mas E ESTA MIGRACAO, no momento em que
-- correr, que decide -- nunca se fia no censo antigo, que pode estar
-- desactualizado.
-- ****************************************************************************
--
--
-- -- A EMENDA AO DESENHO: SEM COLUNA NOVA, SEM TRIGGER -------------------------
--
-- A primeira versao deste travao previa excluir fichas apagadas do indice
-- (com uma coluna `pessoa_activa` ou um trigger que a mantivesse). NAO SE FEZ
-- ASSIM. Os dois indices cobrem TODAS as fichas, incluindo as apagadas
-- (deleted_at preenchido) -- exactamente como o censo ja contou.
--
-- Razao: se ja existe uma ficha apagada com aquele NIF, o correcto e
-- REACTIVAR essa ficha, nao criar outra. Excluir as apagadas do indice abria
-- esse buraco -- duas fichas para a mesma pessoa, uma activa e outra
-- arquivada -- e obrigava mais tarde a remendar o ecra para o fechar por
-- fora. A coluna denormalizada que a primeira versao propunha trazia ainda o
-- risco de dessincronizar em silencio (um UPDATE a deleted_at que se
-- esquecesse de actualizar pessoa_activa deixava o indice a proteger um
-- estado que ja nao era verdade). Um indice parcial simples, sobre a coluna
-- que ja existe (nif, niss), sem estado derivado a manter, evita as duas
-- coisas.
--
--
-- -- SEM CONCURRENTLY, DE PROPOSITO --------------------------------------------
--
-- `CREATE INDEX CONCURRENTLY` corre fora de transaccao: se falhar a meio (por
-- exemplo, por um duplicado que apareceu entre a guarda e a criacao), deixa
-- um indice INVALID para tras -- que NAO TRAVA NADA e nao avisa ninguem. Um
-- travao que pode ficar invisivelmente desligado e pior do que nao ter
-- travao. Os dois indices desta migracao criam-se dentro da transaccao da
-- migracao, com o preco normal de um lock de escrita breve sobre
-- pessoas_identificacao enquanto se constroem.
--
--
-- -- O BLOCO DE CONFERIR ---------------------------------------------------
--
-- Verifica que os dois indices existem, sao UNICOS e VALIDOS (indisunique e
-- indisvalid), e que tem a clausula parcial (indpred nao vazio) -- um indice
-- unico SEM o WHERE nif/niss IS NOT NULL proibiria a segunda ficha SEM NIF
-- (ou sem NISS) da organizacao, porque NULL deixaria de ser tratado como
-- "sem valor, sem conflito".
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_pessoas_identificacao_nif_org;
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_pessoas_identificacao_niss_org;
-- (CONCURRENTLY aqui e seguro: um DROP nunca deixa o indice em estado
-- ambiguo da forma que um CREATE deixa.)
--
--
-- Prerequisitos:
--   20261120040000  pessoas_identificacao
--   20261130010000  censo (informativo -- esta migracao NAO depende dele para decidir)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_dup_nif   record;
  v_dup_niss  record;
  v_n_nif     integer := 0;
  v_n_niss    integer := 0;
  v_orgs_nif  text;
  v_orgs_niss text;
BEGIN
  IF to_regclass('public.pessoas_identificacao') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_identificacao nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  -- A contagem e feita AGORA, contra o estado real -- nunca contra o censo
  -- gravado por 20261130010000, que pode estar desactualizado. Cobre TODAS
  -- as fichas, incluindo as apagadas: e o mesmo criterio do indice que se
  -- segue.
  SELECT count(*) INTO v_n_nif
    FROM (
      SELECT organization_id, nif
        FROM public.pessoas_identificacao
       WHERE nif IS NOT NULL
       GROUP BY organization_id, nif
      HAVING count(*) > 1
    ) d;

  SELECT count(*) INTO v_n_niss
    FROM (
      SELECT organization_id, niss
        FROM public.pessoas_identificacao
       WHERE niss IS NOT NULL
       GROUP BY organization_id, niss
      HAVING count(*) > 1
    ) d;

  IF v_n_nif > 0 OR v_n_niss > 0 THEN
    SELECT string_agg(DISTINCT organization_id::text, ', ') INTO v_orgs_nif
      FROM (
        SELECT organization_id, nif FROM public.pessoas_identificacao
         WHERE nif IS NOT NULL GROUP BY organization_id, nif HAVING count(*) > 1
      ) d;
    SELECT string_agg(DISTINCT organization_id::text, ', ') INTO v_orgs_niss
      FROM (
        SELECT organization_id, niss FROM public.pessoas_identificacao
         WHERE niss IS NOT NULL GROUP BY organization_id, niss HAVING count(*) > 1
      ) d;

    RAISE EXCEPTION
      'Ha % grupo(s) de NIF duplicado (organizacoes: %) e % grupo(s) de NISS duplicado (organizacoes: %) -- nunca o valor. Resolver (fundir ou reactivar a ficha certa) antes de aplicar este travao.',
      v_n_nif, coalesce(v_orgs_nif, '-'), v_n_niss, coalesce(v_orgs_niss, '-');
  END IF;

  RAISE NOTICE 'Guardas passadas: nenhum NIF nem NISS duplicado vivo na base neste momento.';
END;
$guardas$;

-- ==============================================================================
-- Os dois indices -- cobrem TODAS as fichas, incluindo as apagadas
-- ==============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_identificacao_nif_org
  ON public.pessoas_identificacao (organization_id, nif)
  WHERE nif IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_identificacao_niss_org
  ON public.pessoas_identificacao (organization_id, niss)
  WHERE niss IS NOT NULL;

COMMENT ON INDEX public.idx_pessoas_identificacao_nif_org IS
'Um NIF, uma ficha, por organizacao -- inclui fichas apagadas de proposito: se ja existe uma com aquele NIF, o caminho e reactiva-la, nao criar outra. Parcial (WHERE nif IS NOT NULL) para nao proibir varias fichas sem NIF na mesma organizacao.';
COMMENT ON INDEX public.idx_pessoas_identificacao_niss_org IS
'Um NISS, uma ficha, por organizacao -- inclui fichas apagadas de proposito: se ja existe uma com aquele NISS, o caminho e reactiva-la, nao criar outra. Parcial (WHERE niss IS NOT NULL) para nao proibir varias fichas sem NISS na mesma organizacao.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_nif_ok  boolean;
  v_niss_ok boolean;
BEGIN
  SELECT ic.indisunique AND ic.indisvalid AND ic.indpred IS NOT NULL
    INTO v_nif_ok
    FROM pg_index ic
    JOIN pg_class c ON c.oid = ic.indexrelid
   WHERE c.relname = 'idx_pessoas_identificacao_nif_org';

  IF NOT coalesce(v_nif_ok, false) THEN
    RAISE EXCEPTION 'idx_pessoas_identificacao_nif_org nao ficou UNICO, VALIDO e PARCIAL como esperado.';
  END IF;

  SELECT ic.indisunique AND ic.indisvalid AND ic.indpred IS NOT NULL
    INTO v_niss_ok
    FROM pg_index ic
    JOIN pg_class c ON c.oid = ic.indexrelid
   WHERE c.relname = 'idx_pessoas_identificacao_niss_org';

  IF NOT coalesce(v_niss_ok, false) THEN
    RAISE EXCEPTION 'idx_pessoas_identificacao_niss_org nao ficou UNICO, VALIDO e PARCIAL como esperado.';
  END IF;

  RAISE NOTICE 'OK: os dois indices unicos parciais existem, sao unicos, validos, e tem clausula parcial -- NIF e NISS unicos por organizacao, incluindo fichas apagadas.';
END;
$conferir$;
