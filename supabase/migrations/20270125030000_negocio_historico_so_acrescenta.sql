-- ============================================================
-- 20270125030000 negocio_historico_so_acrescenta
-- ============================================================
-- Auditoria de 19/11/2026 (Lote 3, dados, achado 2, segunda parte): o histórico do negócio era reescrito em cada gravação.
--
-- O problema: neg_guardar_negocio apagava o histórico todo e voltava a escrevê-lo com o que o ecrã mandava (o texto, o tipo e a data
-- vêm do JSON). Um separador antigo apagava as entradas feitas entretanto por outros (e as que o servidor escreve: «Visita marcada…»,
-- «Responsável: …»), e um ecrã podia mudar ou tirar entradas antigas.
--
-- O que muda:
--   1. fn_neg_historico_momento(data) (nova, interna): o mês, o dia, a hora e o minuto em Lisboa, sem o ano (o ecrã relê as datas como
--      «dd/mm hh:mm», como em fn_neg_historico_chave de 20270105100000).
--   2. fn_neg_historico_acrescentar(org, negócio, histórico) (nova, interna): do JSON entram só as entradas que a base ainda não tem; as
--      que lá estão nunca se apagam nem mudam. «Já tem»: o mesmo texto com a data a menos de 90 minutos (a hora do ecrã e a do servidor
--      podem diferir na hora de verão), contando as repetidas (duas «Chamada sem resposta» na mesma hora são duas). Sem data no JSON,
--      conta só o texto. As novas ficam à frente das outras (ordem abaixo da menor, como neg_guardar_visita já faz), pela ordem do JSON.
--      A data das novas continua a ser a do ecrã (sem ela, agora); o autor continua a ser o do gatilho de 20270105100000.
--   3. neg_guardar_negocio: UMA troca de texto guardada sobre o pg_get_functiondef VIVO (o texto antigo tem de aparecer exatamente uma
--      vez; senão a migration pára e explica): o «DELETE FROM negocio_historico … INSERT … do JSON» passa a
--      «PERFORM fn_neg_historico_acrescentar(…)». O resto fica byte a byte; assinatura, GRANT, dono, SECURITY DEFINER e search_path iguais.
--      Partiu da definição de 20270117830000 (corpo inteiro) com a troca de 20270117960000; não depende de 20270125020000 (pode aplicar-se
--      antes ou depois dela, ou não se aplicar).
-- O ecrã não precisa de mudar para isto funcionar (manda o histórico como antes). Para a data não mudar ao passar a meia-noite com o
-- separador aberto, o ecrã novo grava «hoje hh:mm» já como «dd/mm hh:mm» (sincronizarNegocios.ts, fixarDatasDoHistorico).
-- Riscos aceites: uma entrada tirada de propósito no ecrã já não sai da base; uma entrada nova com o mesmo texto de outra feita noutro
-- separador menos de 90 minutos antes não entra (com 20270125020000 esse separador recebe o conflito antes de gravar).
--
-- Reversão (só como migration nova): repor em neg_guardar_negocio o DELETE + INSERT (ver o fim deste ficheiro) e depois
-- DROP FUNCTION public.fn_neg_historico_acrescentar(uuid, uuid, jsonb), public.fn_neg_historico_momento(timestamptz).
-- ============================================================
SET lock_timeout = '5s';

DO $g$ BEGIN
  IF to_regprocedure('public.neg_guardar_negocio(uuid,uuid,jsonb)') IS NULL OR to_regprocedure('public.fn_neg_lista(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Faltam neg_guardar_negocio ou fn_neg_lista: rever antes de aplicar 20270125030000.';
  END IF;
  IF to_regclass('public.negocio_historico') IS NULL THEN
    RAISE EXCEPTION 'Falta a tabela negocio_historico: rever antes de aplicar 20270125030000.';
  END IF;
END $g$;

-- ---------------------------------------------------------------- 1. o momento sem o ano (hora de Lisboa)
CREATE OR REPLACE FUNCTION public.fn_neg_historico_momento(p_em timestamptz)
 RETURNS timestamp
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- 20270125030000: o ano fixo (2000, bissexto) porque o ecrã relê as datas sem ano
  SELECT CASE WHEN p_em IS NULL THEN NULL ELSE
    make_timestamp(2000, extract(month FROM l)::int, extract(day FROM l)::int, extract(hour FROM l)::int, extract(minute FROM l)::int, 0) END
  FROM (SELECT p_em AT TIME ZONE 'Europe/Lisbon' AS l) x
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_historico_momento(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_historico_momento(timestamptz) TO service_role;

-- ---------------------------------------------------------------- 2. acrescentar ao histórico (interna)
CREATE OR REPLACE FUNCTION public.fn_neg_historico_acrescentar(p_org uuid, p_negocio_id uuid, p_historico jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_min integer; v_n integer;
BEGIN
  SELECT coalesce(min(h.ordem), 0) INTO v_min FROM negocio_historico h WHERE h.negocio_id = p_negocio_id;
  WITH j AS (
    SELECT x.n, x.v->>'texto' AS texto, x.v->>'tipo' AS tipo, nullif(x.v->>'ocorrido_em', '')::timestamptz AS em,
           coalesce((x.v->>'ordem')::int, x.n::int) AS ordem_json
    FROM jsonb_array_elements(public.fn_neg_lista(p_historico)) WITH ORDINALITY x(v, n)
    WHERE x.v->>'texto' IS NOT NULL
  ), jm AS (
    SELECT j.*, public.fn_neg_historico_momento(j.em) AS m FROM j
  ), b AS (
    SELECT h.texto, public.fn_neg_historico_momento(h.ocorrido_em) AS m FROM negocio_historico h WHERE h.negocio_id = p_negocio_id
  ), novas AS (
    SELECT jm.* FROM jm
    WHERE CASE
      -- sem data: entram as que passam das que a base já tem com o mesmo texto
      WHEN jm.m IS NULL THEN
        (SELECT count(*) FROM jm j2 WHERE j2.m IS NULL AND j2.texto = jm.texto AND j2.n <= jm.n)
          > (SELECT count(*) FROM b WHERE b.texto = jm.texto)
      -- com data: nas que têm o mesmo texto a menos de 90 minutos, entram as mais recentes que a base ainda não tem
      ELSE
        (SELECT count(*) FROM jm j2 WHERE j2.m IS NOT NULL AND j2.texto = jm.texto AND abs(extract(epoch FROM j2.m - jm.m)) <= 5400
            AND (j2.m > jm.m OR (j2.m = jm.m AND j2.n <= jm.n)))
          <= (SELECT count(*) FROM jm j2 WHERE j2.m IS NOT NULL AND j2.texto = jm.texto AND abs(extract(epoch FROM j2.m - jm.m)) <= 5400)
           - (SELECT count(*) FROM b WHERE b.texto = jm.texto AND b.m IS NOT NULL AND abs(extract(epoch FROM b.m - jm.m)) <= 5400)
    END
  )
  INSERT INTO negocio_historico (organization_id, negocio_id, ordem, ocorrido_em, texto, tipo, autor)
  SELECT p_org, p_negocio_id, v_min - (count(*) OVER ())::int + (row_number() OVER (ORDER BY novas.ordem_json, novas.n))::int - 1,
         coalesce(novas.em, now()), novas.texto, novas.tipo, NULL
  FROM novas;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_historico_acrescentar(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_historico_acrescentar(uuid, uuid, jsonb) TO service_role;
COMMENT ON FUNCTION public.fn_neg_historico_acrescentar(uuid, uuid, jsonb) IS 'Negócio: junta ao histórico só as entradas do JSON que a base ainda não tem; as que lá estão não se apagam nem mudam. Chamada por neg_guardar_negocio. 20270125030000.';

-- ---------------------------------------------------------------- uma substituição exata (o texto antigo tem de aparecer uma só vez)
CREATE OR REPLACE FUNCTION pg_temp.trocar(p_def text, p_antes text, p_depois text, p_onde text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  IF (length(p_def) - length(replace(p_def, p_antes, ''))) / greatest(length(p_antes), 1) <> 1 THEN
    RAISE EXCEPTION 'Troca %: o texto antigo não aparece exatamente uma vez na definição viva de neg_guardar_negocio; a função mudou desde 20270117960000. Rever antes de aplicar 20270125030000.', p_onde;
  END IF;
  RETURN replace(p_def, p_antes, p_depois);
END $f$;

-- ---------------------------------------------------------------- 3. neg_guardar_negocio
DO $m$
DECLARE
  d text := replace(pg_get_functiondef('public.neg_guardar_negocio(uuid,uuid,jsonb)'::regprocedure), chr(13) || chr(10), chr(10));
  v_antes text := E'  DELETE FROM negocio_historico WHERE negocio_id = p_negocio_id;\n'
               || E'  INSERT INTO negocio_historico (organization_id, negocio_id, ordem, ocorrido_em, texto, tipo, autor)\n'
               || E'  SELECT p_org, p_negocio_id, (x->>''ordem'')::int, coalesce((x->>''ocorrido_em'')::timestamptz, now()), x->>''texto'', x->>''tipo'', NULL\n'
               || E'  FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->''historico'')) x;\n';
BEGIN
  IF position('20270125030000' IN d) > 0 THEN
    RAISE NOTICE 'neg_guardar_negocio já tem o bloco 20270125030000: nada a fazer.';
    RETURN;
  END IF;
  d := pg_temp.trocar(d, v_antes,
       E'  -- 20270125030000 início (auditoria 19/11): o histórico só cresce. O que já está na base não se apaga nem muda; do JSON entram só\n'
    || E'  --   as entradas que a base ainda não tem, à frente das outras (fn_neg_historico_acrescentar).\n'
    || E'  PERFORM public.fn_neg_historico_acrescentar(p_org, p_negocio_id, public.fn_neg_lista(p_linhas->''historico''));\n'
    || E'  -- 20270125030000 fim\n', 'histórico');
  EXECUTE d;
END $m$;

-- ---------------------------------------------------------------- conferir
DO $c$
DECLARE v_def text := pg_get_functiondef('public.neg_guardar_negocio(uuid,uuid,jsonb)'::regprocedure);
BEGIN
  IF position('fn_neg_historico_acrescentar(p_org, p_negocio_id' IN v_def) = 0 THEN
    RAISE EXCEPTION 'CONFERIR: neg_guardar_negocio ficou sem o bloco 20270125030000';
  END IF;
  IF position('DELETE FROM negocio_historico' IN v_def) > 0 THEN
    RAISE EXCEPTION 'CONFERIR: neg_guardar_negocio ainda apaga o histórico';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.neg_guardar_negocio(uuid,uuid,jsonb)'::regprocedure) THEN
    RAISE EXCEPTION 'CONFERIR: neg_guardar_negocio deixou de ser SECURITY DEFINER';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.neg_guardar_negocio(uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.neg_guardar_negocio(uuid,uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: os privilégios de neg_guardar_negocio mudaram';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_neg_historico_acrescentar(uuid,uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: fn_neg_historico_acrescentar ficou aberta a authenticated';
  END IF;
END $c$;

-- Reversão (só se for preciso; correr numa migration nova):
-- DO $r$
-- DECLARE d text := replace(pg_get_functiondef('public.neg_guardar_negocio(uuid,uuid,jsonb)'::regprocedure), chr(13) || chr(10), chr(10));
-- BEGIN
--   d := regexp_replace(d, '  -- 20270125030000 início.*?  -- 20270125030000 fim\n',
--          E'  DELETE FROM negocio_historico WHERE negocio_id = p_negocio_id;\n'
--       || E'  INSERT INTO negocio_historico (organization_id, negocio_id, ordem, ocorrido_em, texto, tipo, autor)\n'
--       || E'  SELECT p_org, p_negocio_id, (x->>''ordem'')::int, coalesce((x->>''ocorrido_em'')::timestamptz, now()), x->>''texto'', x->>''tipo'', NULL\n'
--       || E'  FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->''historico'')) x;\n');
--   EXECUTE d;
-- END $r$;
-- DROP FUNCTION public.fn_neg_historico_acrescentar(uuid, uuid, jsonb); DROP FUNCTION public.fn_neg_historico_momento(timestamptz);
