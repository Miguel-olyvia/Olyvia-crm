-- ============================================================
-- 20261222180000_anew_leads_closure_result
-- ============================================================
-- O que faz: acrescenta a anew_leads closure_result (text): resultado do
--   encerramento da lead, semInteresse | obraInviavel, CHECK NOT VALID. Sem
--   negocio_id, sem chave estrangeira, sem índice.
-- SÓ ACRESCENTA: colunas opcionais (NULL, sem default: só catálogo, a tabela
--   não é reescrita). Nenhuma função, trigger, política ou configuração
--   existente é alterada; nenhum trigger novo; nenhuma linha escrita.
-- TAMANHO (19/10, todas as organizações): cerca de 8 880 linhas, heap 16 MB.
-- JANELA DE BLOQUEIO: ACCESS EXCLUSIVE em anew_leads (sem chave estrangeira:
--   negocios não é bloqueada), até ao COMMIT. Estimativa < 10 ms (só
--   catálogo) (não medida).
-- MUDELAR: É A MAIS SENSÍVEL: os formulários públicos criam leads aqui;
--   realtime publica a tabela. Fica em último de propósito. Durante a janela
--   esses pedidos esperam e seguem. Os bloqueios são pedidos no início com
--   NOWAIT (10 tentativas de 250 ms): a migration nunca fica em fila atrás de
--   uma transacção da Mudelar nem forma fila à frente das dela; se não
--   conseguir, desiste sem nada criado. Aplicar com tráfego baixo e só com
--   autorização explícita.
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
      LOCK TABLE public.anew_leads           IN ACCESS EXCLUSIVE MODE NOWAIT;
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
    WHERE a.attrelid = 'public.anew_leads'::regclass
      AND a.attname::text IN ('closure_result') AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: anew_leads já tem uma das colunas novas; nada feito.';
  END IF;
END;
$$;

ALTER TABLE public.anew_leads
  ADD COLUMN closure_result text,
  ADD CONSTRAINT anew_leads_closure_result_check
    CHECK (closure_result IS NULL
           OR closure_result IN ('semInteresse', 'obraInviavel')) NOT VALID;

COMMENT ON COLUMN public.anew_leads.closure_result IS
  'Resultado do encerramento da lead: semInteresse | obraInviavel. Opcional; o motivo livre continua em lost_reason.';

-- CONFERIR (md5 lidos no remoto a 19/10)
DO $$
DECLARE
  v_txt text;
BEGIN
  -- 1. colunas novas
  v_txt := (SELECT string_agg(a.attname::text || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text || ':' || a.atthasdef::text || ':' || a.atthasmissing::text, ',' ORDER BY a.attname::text COLLATE "C")
       FROM pg_attribute a
       WHERE a.attrelid = 'public.anew_leads'::regclass AND NOT a.attisdropped AND a.attname::text IN ('closure_result'));
  IF v_txt IS DISTINCT FROM 'closure_result:text:false:false:false' THEN
    RAISE EXCEPTION 'CONFERIR (1. colunas novas): obtido %, esperado closure_result:text:false:false:false', coalesce(v_txt, '(nulo)');
  END IF;

  -- 2. CHECK anew_leads_closure_result_check
  v_txt := (SELECT c.convalidated::text || ':' || (pg_get_constraintdef(c.oid) LIKE '%''semInteresse''::text, ''obraInviavel''::text%' AND pg_get_constraintdef(c.oid) LIKE '% NOT VALID')::text
       FROM pg_constraint c
       WHERE c.conrelid = 'public.anew_leads'::regclass AND c.conname::text = 'anew_leads_closure_result_check' AND c.contype::text = 'c');
  IF v_txt IS DISTINCT FROM 'false:true' THEN
    RAISE EXCEPTION 'CONFERIR (2. CHECK anew_leads_closure_result_check): obtido %, esperado false:true', coalesce(v_txt, '(nulo)');
  END IF;

  -- 3. número de triggers igual (nenhum novo)
  v_txt := (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid = 'public.anew_leads'::regclass AND NOT t.tgisinternal)::text;
  IF v_txt IS DISTINCT FROM '13' THEN
    RAISE EXCEPTION 'CONFERIR (3. número de triggers igual (nenhum novo)): obtido %, esperado 13', coalesce(v_txt, '(nulo)');
  END IF;

  -- 4. md5 triggers existentes
  v_txt := (SELECT md5(coalesce(string_agg(tg.tgname::text || '=' || pg_get_triggerdef(tg.oid) || '=' || tg.tgenabled::text, E'\n' ORDER BY tg.tgname::text COLLATE "C"), ''))
       FROM pg_trigger tg
       WHERE tg.tgrelid = 'public.anew_leads'::regclass AND NOT tg.tgisinternal);
  IF v_txt IS DISTINCT FROM 'ff8bf3b8eb74bfdc093420c9212b8e99' THEN
    RAISE EXCEPTION 'CONFERIR (4. md5 triggers existentes): obtido %, esperado ff8bf3b8eb74bfdc093420c9212b8e99', coalesce(v_txt, '(nulo)');
  END IF;

  -- 5. md5 funções dos triggers existentes
  v_txt := (SELECT md5(coalesce(string_agg(x.sig || '=' || x.h, E'\n' ORDER BY x.sig COLLATE "C"), ''))
       FROM (SELECT DISTINCT p.oid::regprocedure::text AS sig, md5(pg_get_functiondef(p.oid)) AS h
             FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
             WHERE tg.tgrelid = 'public.anew_leads'::regclass AND NOT tg.tgisinternal) x);
  IF v_txt IS DISTINCT FROM 'ffc773126993c3cd34605b62258428d0' THEN
    RAISE EXCEPTION 'CONFERIR (5. md5 funções dos triggers existentes): obtido %, esperado ffc773126993c3cd34605b62258428d0', coalesce(v_txt, '(nulo)');
  END IF;
END;
$$;

COMMIT;
