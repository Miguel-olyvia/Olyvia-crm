-- ============================================================
-- 20261222140000_proposals_negocio_id_terms
-- ============================================================
-- O que faz: acrescenta a proposals negocio_id (uuid) e terms (jsonb,
--   condições comerciais; CHECK NOT VALID: NULL ou objecto).
--   Chave estrangeira para negocios(id) ON DELETE SET NULL, NOT VALID, e índice
--   btree não parcial. Validação sem bloquear escritas em 20261222190000.
-- SÓ ACRESCENTA: colunas opcionais (NULL, sem default: só catálogo, a tabela
--   não é reescrita). Nenhuma função, trigger, política ou configuração
--   existente é alterada; nenhum trigger novo; nenhuma linha escrita.
-- TAMANHO (19/10, todas as organizações): cerca de 1 005 linhas, heap 1,1 MB
--   (41 MB com TOAST, que o índice não lê).
-- JANELA DE BLOQUEIO: ACCESS EXCLUSIVE em proposals e SHARE ROW EXCLUSIVE em
--   negocios, até ao COMMIT. Estimativa < 30 ms (não medida).
-- MUDELAR: página pública da proposta (leitura por token) e
--   aceitação/rejeição pelo cliente. Durante a janela esses pedidos esperam e
--   seguem. Os bloqueios são pedidos no início com NOWAIT (10 tentativas de
--   250 ms): a migration nunca fica em fila atrás de uma transacção da
--   Mudelar nem forma fila à frente das dela; se não conseguir, desiste sem
--   nada criado. Aplicar com tráfego baixo e só com autorização explícita.
-- SEM VALIDAÇÃO do registo ligado: a base só garante que o negócio existe
--   (FK). Mesma organização, mesma pessoa, estado, lixo e permissão para
--   ligar ficam a cargo do código (decisão do utilizador, 19/10).
-- AUDITORIA: os triggers de auditoria existentes (to_jsonb(NEW)) passam a
--   gravar as colunas novas (identificadores e códigos, sem dados pessoais).
--   SNAPSHOT: republish_proposal_snapshot grava row_to_json(p.*) e
--   row_to_json(q.*): negocio_id e terms passam a ir no snapshot publicado,
--   e o portal anónimo recebe o uuid do negócio quando houver ligação.
--   terms não entra no hash de "alterações por publicar".
--   O formato interno de terms (chaves, valores) NÃO é verificado pela base:
--   fica no código (CondicoesProposta tem validade e notas, que já têm
--   colunas próprias: tirá-las antes de gravar).
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
      LOCK TABLE public.proposals            IN ACCESS EXCLUSIVE MODE NOWAIT;
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
    WHERE a.attrelid = 'public.proposals'::regclass
      AND a.attname::text IN ('negocio_id', 'terms') AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: proposals já tem uma das colunas novas; nada feito.';
  END IF;
END;
$$;

ALTER TABLE public.proposals
  ADD COLUMN negocio_id uuid,
  ADD COLUMN terms jsonb,
  ADD CONSTRAINT proposals_negocio_id_fkey
    FOREIGN KEY (negocio_id) REFERENCES public.negocios(id) ON DELETE SET NULL NOT VALID,
  ADD CONSTRAINT proposals_terms_check
    CHECK (terms IS NULL OR jsonb_typeof(terms) = 'object') NOT VALID;

CREATE INDEX idx_proposals_negocio_id ON public.proposals (negocio_id);

COMMENT ON COLUMN public.proposals.negocio_id IS
  'Negócio (negocios) a que o registo pertence; opcional. A base não verifica organização, pessoa, estado nem permissão do negócio ligado (fica no código). Passa a NULL se o negócio for apagado fisicamente.';
COMMENT ON COLUMN public.proposals.terms IS
  'Condições comerciais da proposta (objecto jsonb). O formato interno é verificado pelo código, não pela base. Não entra no hash de alterações por publicar; vai no snapshot publicado.';

-- CONFERIR (md5 lidos no remoto a 19/10)
DO $$
DECLARE
  v_txt text;
BEGIN
  -- 1. colunas novas
  v_txt := (SELECT string_agg(a.attname::text || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text || ':' || a.atthasdef::text || ':' || a.atthasmissing::text, ',' ORDER BY a.attname::text COLLATE "C")
       FROM pg_attribute a
       WHERE a.attrelid = 'public.proposals'::regclass AND NOT a.attisdropped AND a.attname::text IN ('negocio_id', 'terms'));
  IF v_txt IS DISTINCT FROM 'negocio_id:uuid:false:false:false,terms:jsonb:false:false:false' THEN
    RAISE EXCEPTION 'CONFERIR (1. colunas novas): obtido %, esperado negocio_id:uuid:false:false:false,terms:jsonb:false:false:false', coalesce(v_txt, '(nulo)');
  END IF;

  -- 2. chave estrangeira
  v_txt := (SELECT string_agg(c.conname::text || ':' || tn.nspname::text || '.' || tc.relname::text || ':' || c.confdeltype::text || ':' || c.convalidated::text, ',')
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       JOIN pg_class tc ON tc.oid = c.confrelid
       JOIN pg_namespace tn ON tn.oid = tc.relnamespace
       WHERE c.conrelid = 'public.proposals'::regclass AND c.contype::text = 'f' AND a.attname::text = 'negocio_id');
  IF v_txt IS DISTINCT FROM 'proposals_negocio_id_fkey:public.negocios:n:false' THEN
    RAISE EXCEPTION 'CONFERIR (2. chave estrangeira): obtido %, esperado proposals_negocio_id_fkey:public.negocios:n:false', coalesce(v_txt, '(nulo)');
  END IF;

  -- 3. índice não parcial da chave estrangeira
  v_txt := (SELECT count(*)
       FROM pg_index i
       JOIN pg_class ic ON ic.oid = i.indexrelid
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = 'public.proposals'::regclass AND ic.relname::text = 'idx_proposals_negocio_id'
         AND i.indnatts = 1 AND a.attname::text = 'negocio_id'
         AND i.indpred IS NULL AND i.indisvalid)::text;
  IF v_txt IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'CONFERIR (3. índice não parcial da chave estrangeira): obtido %, esperado 1', coalesce(v_txt, '(nulo)');
  END IF;

  -- 4. CHECK proposals_terms_check
  v_txt := (SELECT c.convalidated::text || ':' || (pg_get_constraintdef(c.oid) LIKE '%jsonb_typeof(terms)%object%' AND pg_get_constraintdef(c.oid) LIKE '% NOT VALID')::text
       FROM pg_constraint c
       WHERE c.conrelid = 'public.proposals'::regclass AND c.conname::text = 'proposals_terms_check' AND c.contype::text = 'c');
  IF v_txt IS DISTINCT FROM 'false:true' THEN
    RAISE EXCEPTION 'CONFERIR (4. CHECK proposals_terms_check): obtido %, esperado false:true', coalesce(v_txt, '(nulo)');
  END IF;

  -- 5. número de triggers igual (nenhum novo)
  v_txt := (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid = 'public.proposals'::regclass AND NOT t.tgisinternal)::text;
  IF v_txt IS DISTINCT FROM '21' THEN
    RAISE EXCEPTION 'CONFERIR (5. número de triggers igual (nenhum novo)): obtido %, esperado 21', coalesce(v_txt, '(nulo)');
  END IF;

  -- 6. md5 triggers existentes
  v_txt := (SELECT md5(coalesce(string_agg(tg.tgname::text || '=' || pg_get_triggerdef(tg.oid) || '=' || tg.tgenabled::text, E'\n' ORDER BY tg.tgname::text COLLATE "C"), ''))
       FROM pg_trigger tg
       WHERE tg.tgrelid = 'public.proposals'::regclass AND NOT tg.tgisinternal);
  IF v_txt IS DISTINCT FROM '70c3ae20713219462cc30f628c613746' THEN
    RAISE EXCEPTION 'CONFERIR (6. md5 triggers existentes): obtido %, esperado 70c3ae20713219462cc30f628c613746', coalesce(v_txt, '(nulo)');
  END IF;

  -- 7. md5 funções dos triggers existentes
  v_txt := (SELECT md5(coalesce(string_agg(x.sig || '=' || x.h, E'\n' ORDER BY x.sig COLLATE "C"), ''))
       FROM (SELECT DISTINCT p.oid::regprocedure::text AS sig, md5(pg_get_functiondef(p.oid)) AS h
             FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
             WHERE tg.tgrelid = 'public.proposals'::regclass AND NOT tg.tgisinternal) x);
  IF v_txt IS DISTINCT FROM 'b387770304cb55dba6ad730f21da02d5' THEN
    RAISE EXCEPTION 'CONFERIR (7. md5 funções dos triggers existentes): obtido %, esperado b387770304cb55dba6ad730f21da02d5', coalesce(v_txt, '(nulo)');
  END IF;
END;
$$;

COMMIT;
