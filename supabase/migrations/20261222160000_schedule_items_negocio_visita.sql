-- ============================================================
-- 20261222160000_schedule_items_negocio_visita
-- ============================================================
-- O que faz: acrescenta a schedule_items negocio_id (uuid); visit_outcome
--   (interessado | aPensar | semInteresse | obraInviavel) e visit_kind
--   (levantamento | medicao | materiais | revisita), CHECKs NOT VALID.
--   visit_kind é separado do metadata->>'visit_type' antigo, que não se toca.
--   Chave estrangeira para negocios(id) ON DELETE SET NULL, NOT VALID, e índice
--   btree não parcial. Validação sem bloquear escritas em 20261222190000.
-- SÓ ACRESCENTA: colunas opcionais (NULL, sem default: só catálogo, a tabela
--   não é reescrita). Nenhuma função, trigger, política ou configuração
--   existente é alterada; nenhum trigger novo; nenhuma linha escrita.
-- TAMANHO (19/10, todas as organizações): cerca de 2 382 linhas, heap 1,3 MB.
-- JANELA DE BLOQUEIO: ACCESS EXCLUSIVE em schedule_items e SHARE ROW
--   EXCLUSIVE em negocios, até ao COMMIT. Estimativa < 30 ms (não medida).
-- MUDELAR: É A MAIS SENSÍVEL: calendário público e marcações do formulário
--   online. As funções do calendário só lêem a tabela; depois da janela nada
--   muda para elas. Durante a janela esses pedidos esperam e seguem. Os
--   bloqueios são pedidos no início com NOWAIT (10 tentativas de 250 ms): a
--   migration nunca fica em fila atrás de uma transacção da Mudelar nem forma
--   fila à frente das dela; se não conseguir, desiste sem nada criado.
--   Aplicar com tráfego baixo e só com autorização explícita.
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
      LOCK TABLE public.schedule_items       IN ACCESS EXCLUSIVE MODE NOWAIT;
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
    WHERE a.attrelid = 'public.schedule_items'::regclass
      AND a.attname::text IN ('negocio_id', 'visit_outcome', 'visit_kind') AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: schedule_items já tem uma das colunas novas; nada feito.';
  END IF;
END;
$$;

ALTER TABLE public.schedule_items
  ADD COLUMN negocio_id uuid,
  ADD COLUMN visit_outcome text,
  ADD COLUMN visit_kind text,
  ADD CONSTRAINT schedule_items_negocio_id_fkey
    FOREIGN KEY (negocio_id) REFERENCES public.negocios(id) ON DELETE SET NULL NOT VALID,
  ADD CONSTRAINT schedule_items_visit_outcome_check
    CHECK (visit_outcome IS NULL
           OR visit_outcome IN ('interessado', 'aPensar', 'semInteresse', 'obraInviavel')) NOT VALID,
  ADD CONSTRAINT schedule_items_visit_kind_check
    CHECK (visit_kind IS NULL
           OR visit_kind IN ('levantamento', 'medicao', 'materiais', 'revisita')) NOT VALID;

CREATE INDEX idx_schedule_items_negocio_id ON public.schedule_items (negocio_id);

COMMENT ON COLUMN public.schedule_items.negocio_id IS
  'Negócio (negocios) a que o registo pertence; opcional. A base não verifica organização, pessoa, estado nem permissão do negócio ligado (fica no código). Passa a NULL se o negócio for apagado fisicamente.';
COMMENT ON COLUMN public.schedule_items.visit_outcome IS
  'Resultado da visita: interessado | aPensar | semInteresse | obraInviavel. Opcional.';
COMMENT ON COLUMN public.schedule_items.visit_kind IS
  'Tipo de visita: levantamento | medicao | materiais | revisita. Opcional. Separado de metadata->>visit_type.';

-- CONFERIR (md5 lidos no remoto a 19/10)
DO $$
DECLARE
  v_txt text;
BEGIN
  -- 1. colunas novas
  v_txt := (SELECT string_agg(a.attname::text || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text || ':' || a.atthasdef::text || ':' || a.atthasmissing::text, ',' ORDER BY a.attname::text COLLATE "C")
       FROM pg_attribute a
       WHERE a.attrelid = 'public.schedule_items'::regclass AND NOT a.attisdropped AND a.attname::text IN ('negocio_id', 'visit_outcome', 'visit_kind'));
  IF v_txt IS DISTINCT FROM 'negocio_id:uuid:false:false:false,visit_kind:text:false:false:false,visit_outcome:text:false:false:false' THEN
    RAISE EXCEPTION 'CONFERIR (1. colunas novas): obtido %, esperado negocio_id:uuid:false:false:false,visit_kind:text:false:false:false,visit_outcome:text:false:false:false', coalesce(v_txt, '(nulo)');
  END IF;

  -- 2. chave estrangeira
  v_txt := (SELECT string_agg(c.conname::text || ':' || tn.nspname::text || '.' || tc.relname::text || ':' || c.confdeltype::text || ':' || c.convalidated::text, ',')
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       JOIN pg_class tc ON tc.oid = c.confrelid
       JOIN pg_namespace tn ON tn.oid = tc.relnamespace
       WHERE c.conrelid = 'public.schedule_items'::regclass AND c.contype::text = 'f' AND a.attname::text = 'negocio_id');
  IF v_txt IS DISTINCT FROM 'schedule_items_negocio_id_fkey:public.negocios:n:false' THEN
    RAISE EXCEPTION 'CONFERIR (2. chave estrangeira): obtido %, esperado schedule_items_negocio_id_fkey:public.negocios:n:false', coalesce(v_txt, '(nulo)');
  END IF;

  -- 3. índice não parcial da chave estrangeira
  v_txt := (SELECT count(*)
       FROM pg_index i
       JOIN pg_class ic ON ic.oid = i.indexrelid
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = 'public.schedule_items'::regclass AND ic.relname::text = 'idx_schedule_items_negocio_id'
         AND i.indnatts = 1 AND a.attname::text = 'negocio_id'
         AND i.indpred IS NULL AND i.indisvalid)::text;
  IF v_txt IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'CONFERIR (3. índice não parcial da chave estrangeira): obtido %, esperado 1', coalesce(v_txt, '(nulo)');
  END IF;

  -- 4. CHECK schedule_items_visit_outcome_check
  v_txt := (SELECT c.convalidated::text || ':' || (pg_get_constraintdef(c.oid) LIKE '%''interessado''::text, ''aPensar''::text, ''semInteresse''::text, ''obraInviavel''::text%' AND pg_get_constraintdef(c.oid) LIKE '% NOT VALID')::text
       FROM pg_constraint c
       WHERE c.conrelid = 'public.schedule_items'::regclass AND c.conname::text = 'schedule_items_visit_outcome_check' AND c.contype::text = 'c');
  IF v_txt IS DISTINCT FROM 'false:true' THEN
    RAISE EXCEPTION 'CONFERIR (4. CHECK schedule_items_visit_outcome_check): obtido %, esperado false:true', coalesce(v_txt, '(nulo)');
  END IF;

  -- 5. CHECK schedule_items_visit_kind_check
  v_txt := (SELECT c.convalidated::text || ':' || (pg_get_constraintdef(c.oid) LIKE '%''levantamento''::text, ''medicao''::text, ''materiais''::text, ''revisita''::text%' AND pg_get_constraintdef(c.oid) LIKE '% NOT VALID')::text
       FROM pg_constraint c
       WHERE c.conrelid = 'public.schedule_items'::regclass AND c.conname::text = 'schedule_items_visit_kind_check' AND c.contype::text = 'c');
  IF v_txt IS DISTINCT FROM 'false:true' THEN
    RAISE EXCEPTION 'CONFERIR (5. CHECK schedule_items_visit_kind_check): obtido %, esperado false:true', coalesce(v_txt, '(nulo)');
  END IF;

  -- 6. número de triggers igual (nenhum novo)
  v_txt := (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid = 'public.schedule_items'::regclass AND NOT t.tgisinternal)::text;
  IF v_txt IS DISTINCT FROM '6' THEN
    RAISE EXCEPTION 'CONFERIR (6. número de triggers igual (nenhum novo)): obtido %, esperado 6', coalesce(v_txt, '(nulo)');
  END IF;

  -- 7. md5 triggers existentes
  v_txt := (SELECT md5(coalesce(string_agg(tg.tgname::text || '=' || pg_get_triggerdef(tg.oid) || '=' || tg.tgenabled::text, E'\n' ORDER BY tg.tgname::text COLLATE "C"), ''))
       FROM pg_trigger tg
       WHERE tg.tgrelid = 'public.schedule_items'::regclass AND NOT tg.tgisinternal);
  IF v_txt IS DISTINCT FROM '2514c42643705dc1b6ea7f5cc4645f2b' THEN
    RAISE EXCEPTION 'CONFERIR (7. md5 triggers existentes): obtido %, esperado 2514c42643705dc1b6ea7f5cc4645f2b', coalesce(v_txt, '(nulo)');
  END IF;

  -- 8. md5 funções dos triggers existentes
  v_txt := (SELECT md5(coalesce(string_agg(x.sig || '=' || x.h, E'\n' ORDER BY x.sig COLLATE "C"), ''))
       FROM (SELECT DISTINCT p.oid::regprocedure::text AS sig, md5(pg_get_functiondef(p.oid)) AS h
             FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
             WHERE tg.tgrelid = 'public.schedule_items'::regclass AND NOT tg.tgisinternal) x);
  IF v_txt IS DISTINCT FROM '3634be700a42ae23b8764d38f98bc124' THEN
    RAISE EXCEPTION 'CONFERIR (8. md5 funções dos triggers existentes): obtido %, esperado 3634be700a42ae23b8764d38f98bc124', coalesce(v_txt, '(nulo)');
  END IF;
END;
$$;

COMMIT;
