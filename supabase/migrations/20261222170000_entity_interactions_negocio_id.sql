-- ============================================================
-- 20261222170000_entity_interactions_negocio_id
-- ============================================================
-- O que faz: acrescenta a entity_interactions negocio_id (uuid): o negócio a
--   que a interacção pertence.
--   Chave estrangeira para negocios(id) ON DELETE SET NULL, NOT VALID, e índice
--   btree não parcial. Validação sem bloquear escritas em 20261222190000.
-- SÓ ACRESCENTA: colunas opcionais (NULL, sem default: só catálogo, a tabela
--   não é reescrita). Nenhuma função, trigger, política ou configuração
--   existente é alterada; nenhum trigger novo; nenhuma linha escrita.
-- TAMANHO (19/10, todas as organizações): cerca de 20 278 linhas, heap 7,2 MB
--   (a maior desta fase).
-- JANELA DE BLOQUEIO: ACCESS EXCLUSIVE em entity_interactions e SHARE ROW
--   EXCLUSIVE em negocios, até ao COMMIT. Estimativa 20 a 80 ms (o CREATE
--   INDEX lê 7,2 MB) (não medida).
-- MUDELAR: interacções criadas com as leads do formulário e nas chamadas
--   (inferido); realtime publica a tabela. Durante a janela esses pedidos
--   esperam e seguem. Os bloqueios são pedidos no início com NOWAIT (10
--   tentativas de 250 ms): a migration nunca fica em fila atrás de uma
--   transacção da Mudelar nem forma fila à frente das dela; se não conseguir,
--   desiste sem nada criado. Aplicar com tráfego baixo e só com autorização
--   explícita.
-- SEM VALIDAÇÃO do registo ligado: a base só garante que o negócio existe
--   (FK). Mesma organização, mesma pessoa, estado, lixo e permissão para
--   ligar ficam a cargo do código (decisão do utilizador, 19/10).
-- AUDITORIA: os triggers de auditoria existentes (to_jsonb(NEW)) passam a
--   gravar as colunas novas (identificadores e códigos, sem dados pessoais).
-- PRECISA DE CÓDIGO: nenhuma RPC existente escreve as colunas novas (PATCH
--   directo ou RPC nova); regenerar os tipos do Supabase no mesmo envio.
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '60s';
-- Os md5 do CONFERIR foram lidos com este search_path; o DDL é qualificado.
SET LOCAL search_path = public, extensions;

-- Bloqueios no início, por ordem fixa (negocios primeiro, a tabela depois,
-- igual em todas as migrations desta fase), com NOWAIT: nunca se entra em
-- fila. Se uma tabela estiver ocupada, o sub-bloco desfaz-se (larga o que
-- apanhou), espera 250 ms e repete, até 10 tentativas (cerca de 2,5 s);
-- depois aborta sem ter prendido ninguém e sem nada alterado.
DO $$
DECLARE
  v_tentativa int := 0;
BEGIN
  LOOP
    v_tentativa := v_tentativa + 1;
    BEGIN
      LOCK TABLE public.negocios             IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      LOCK TABLE public.entity_interactions  IN ACCESS EXCLUSIVE MODE NOWAIT;
      EXIT;
    EXCEPTION WHEN lock_not_available THEN
      IF v_tentativa >= 10 THEN
        RAISE EXCEPTION 'Tabela ocupada: voltar a tentar mais tarde (% tentativas).', v_tentativa
          USING ERRCODE = 'lock_not_available';
      END IF;
      PERFORM pg_sleep(0.25);
    END;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.entity_interactions'::regclass
      AND a.attname::text IN ('negocio_id') AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: entity_interactions já tem uma das colunas novas; nada feito.';
  END IF;
END;
$$;

ALTER TABLE public.entity_interactions
  ADD COLUMN negocio_id uuid,
  ADD CONSTRAINT entity_interactions_negocio_id_fkey
    FOREIGN KEY (negocio_id) REFERENCES public.negocios(id) ON DELETE SET NULL NOT VALID;

CREATE INDEX idx_entity_interactions_negocio_id ON public.entity_interactions (negocio_id);

COMMENT ON COLUMN public.entity_interactions.negocio_id IS
  'Negócio (negocios) a que o registo pertence; opcional. A base não verifica organização, pessoa, estado nem permissão do negócio ligado (fica no código). Passa a NULL se o negócio for apagado fisicamente.';

-- CONFERIR (md5 lidos no remoto a 19/10)
DO $$
DECLARE
  v_txt text;
BEGIN
  -- 1. colunas novas
  v_txt := (SELECT string_agg(a.attname::text || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text || ':' || a.atthasdef::text || ':' || a.atthasmissing::text, ',' ORDER BY a.attname::text COLLATE "C")
       FROM pg_attribute a
       WHERE a.attrelid = 'public.entity_interactions'::regclass AND NOT a.attisdropped AND a.attname::text IN ('negocio_id'));
  IF v_txt IS DISTINCT FROM 'negocio_id:uuid:false:false:false' THEN
    RAISE EXCEPTION 'CONFERIR (1. colunas novas): obtido %, esperado negocio_id:uuid:false:false:false', coalesce(v_txt, '(nulo)');
  END IF;

  -- 2. chave estrangeira
  v_txt := (SELECT string_agg(c.conname::text || ':' || tn.nspname::text || '.' || tc.relname::text || ':' || c.confdeltype::text || ':' || c.convalidated::text, ',')
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       JOIN pg_class tc ON tc.oid = c.confrelid
       JOIN pg_namespace tn ON tn.oid = tc.relnamespace
       WHERE c.conrelid = 'public.entity_interactions'::regclass AND c.contype::text = 'f' AND a.attname::text = 'negocio_id');
  IF v_txt IS DISTINCT FROM 'entity_interactions_negocio_id_fkey:public.negocios:n:false' THEN
    RAISE EXCEPTION 'CONFERIR (2. chave estrangeira): obtido %, esperado entity_interactions_negocio_id_fkey:public.negocios:n:false', coalesce(v_txt, '(nulo)');
  END IF;

  -- 3. índice não parcial da chave estrangeira
  v_txt := (SELECT count(*)
       FROM pg_index i
       JOIN pg_class ic ON ic.oid = i.indexrelid
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = 'public.entity_interactions'::regclass AND ic.relname::text = 'idx_entity_interactions_negocio_id'
         AND i.indnatts = 1 AND a.attname::text = 'negocio_id'
         AND i.indpred IS NULL AND i.indisvalid)::text;
  IF v_txt IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'CONFERIR (3. índice não parcial da chave estrangeira): obtido %, esperado 1', coalesce(v_txt, '(nulo)');
  END IF;

  -- 4. número de triggers igual (nenhum novo)
  v_txt := (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid = 'public.entity_interactions'::regclass AND NOT t.tgisinternal)::text;
  IF v_txt IS DISTINCT FROM '3' THEN
    RAISE EXCEPTION 'CONFERIR (4. número de triggers igual (nenhum novo)): obtido %, esperado 3', coalesce(v_txt, '(nulo)');
  END IF;

  -- 5. md5 triggers existentes
  v_txt := (SELECT md5(coalesce(string_agg(tg.tgname::text || '=' || pg_get_triggerdef(tg.oid) || '=' || tg.tgenabled::text, E'\n' ORDER BY tg.tgname::text COLLATE "C"), ''))
       FROM pg_trigger tg
       WHERE tg.tgrelid = 'public.entity_interactions'::regclass AND NOT tg.tgisinternal);
  IF v_txt IS DISTINCT FROM '88ce499856698c3dfca73b3e7a0c3669' THEN
    RAISE EXCEPTION 'CONFERIR (5. md5 triggers existentes): obtido %, esperado 88ce499856698c3dfca73b3e7a0c3669', coalesce(v_txt, '(nulo)');
  END IF;

  -- 6. md5 funções dos triggers existentes
  v_txt := (SELECT md5(coalesce(string_agg(x.sig || '=' || x.h, E'\n' ORDER BY x.sig COLLATE "C"), ''))
       FROM (SELECT DISTINCT p.oid::regprocedure::text AS sig, md5(pg_get_functiondef(p.oid)) AS h
             FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
             WHERE tg.tgrelid = 'public.entity_interactions'::regclass AND NOT tg.tgisinternal) x);
  IF v_txt IS DISTINCT FROM '8cf2475f12d30522abac0073fdb9014c' THEN
    RAISE EXCEPTION 'CONFERIR (6. md5 funções dos triggers existentes): obtido %, esperado 8cf2475f12d30522abac0073fdb9014c', coalesce(v_txt, '(nulo)');
  END IF;
END;
$$;

COMMIT;
