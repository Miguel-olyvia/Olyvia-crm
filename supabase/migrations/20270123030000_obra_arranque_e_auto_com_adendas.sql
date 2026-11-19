-- ============================================================
-- 20270123030000 obra_arranque_e_auto_com_adendas
-- ============================================================
-- Auditoria de 19/11/2026, achado 4: arrancar a obra e enviar o auto de receção, no servidor, com tudo o que o ecrã pede.
--
-- DEPENDE DE 20270122900000 (neg_parcelas_bloqueio_servidor, de 19/11/2026), que pode ainda não estar aplicada: aplicar essa primeiro.
-- Esta migration confirma-o (fn_neg_parcelas_por_pagar existe e obra_guardar_negocio tem o bloco 20270122900000) e pára se não.
--
-- O problema:
--   - Arrancar a obra (a 1.ª vez que passa a em curso): 20270122900000 só pede a parcela do arranque paga (a do meio, nos planos
--     50-25-25). Uma gravação direta arrancava sem a fase Obra, sem o plano aprovado e sem a 1.ª prestação paga.
--   - O auto de receção: fn_neg_parcelas_por_pagar(…, false) só contava as parcelas do orçamento principal. O ecrã (parcelas.ts,
--     faltaParaAuto, commit bb75cbbc) também espera pelas parcelas das adendas assinadas.
--
-- O que muda:
--   1. fn_neg_falta_para_arrancar(negócio, estado do plano gravado) (nova): o que falta para a 1.ª passagem a em curso, num negócio da
--      Emylia: a 1.ª prestação paga e validada; a fase mínima Obra (fn_neg_fase_minima >= 5; 5 = Obra desde 20261231999700, ver
--      20270116000000); e o plano aprovado JÁ GRAVADO (o que estava na base antes desta gravação: aprovado, em curso ou concluída). Nos
--      negócios do CRM devolve vazio.
--   2. obra_guardar_negocio (troca de texto guardada sobre a definição viva, a de 20270122900000): no bloco do arranque, junta
--      fn_neg_falta_para_arrancar à lista das parcelas do arranque. A mensagem é a mesma: «A obra ainda não pode arrancar: falta …» (CT002).
--      Só a 1.ª passagem (iniciada_em vazio), como antes: as obras que já arrancaram não voltam a ser vistas.
--   3. fn_neg_parcelas_por_pagar recriada (a definição inteira está em 20270122900000): sem p_so_arranque (o auto de receção) conta também
--      as parcelas (quote_prestacoes) da versão em vigor do orçamento de cada adenda assinada, com valor (total com IVA > 0). Paga = fatura
--      não anulada paga ou com o pagamento validado, como as do contrato. Com p_so_arranque fica igual.
-- Sem tabelas nem colunas novas. obra_guardar_negocio mantém permissões, GRANTs, SECURITY DEFINER e search_path (corpo vivo com a troca).
--
-- Reversão (só como migration nova): correr outra vez a definição de fn_neg_parcelas_por_pagar de 20270122900000; em obra_guardar_negocio
-- tirar o bloco entre «-- 20270123030000 início» e «-- 20270123030000 fim» e repor a linha original (ver o fim deste ficheiro); depois
-- DROP FUNCTION public.fn_neg_falta_para_arrancar(uuid, text).
-- ============================================================
SET lock_timeout = '5s';

DO $g$ BEGIN
  IF to_regprocedure('public.fn_neg_parcelas_por_pagar(uuid,boolean)') IS NULL
     OR position('20270122900000' IN pg_get_functiondef('public.obra_guardar_negocio(uuid,uuid,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Falta a migration 20270122900000 (neg_parcelas_bloqueio_servidor): aplicá-la primeiro e depois esta (20270123030000).';
  END IF;
END $g$;

-- ---------------------------------------------------------------- 1. o que falta para arrancar (além das parcelas do arranque)
CREATE OR REPLACE FUNCTION public.fn_neg_falta_para_arrancar(p_negocio uuid, p_plano_gravado text)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- 20270123030000: a 1.ª prestação do orçamento principal paga (fatura paga ou com o pagamento validado), a fase mínima Obra (5) e o
  -- plano aprovado já gravado. Só nos negócios da Emylia.
  WITH pago AS (
    SELECT EXISTS (
      SELECT 1 FROM quotes q
      JOIN quote_prestacoes p ON p.quote_id = q.id
      JOIN faturas f ON f.quote_prestacao_id = p.id AND f.estado <> 'anulada'
      WHERE q.negocio_id = p_negocio AND q.fluxo_emylia AND q.adenda_id IS NULL AND q.deleted_at IS NULL AND q.estado = 'aceite'
        AND p.ordem = (SELECT min(p2.ordem) FROM quote_prestacoes p2 WHERE p2.quote_id = q.id)
        AND (f.estado = 'paga' OR EXISTS (SELECT 1 FROM pagamentos pg WHERE pg.fatura_id = f.id AND pg.validado_em IS NOT NULL))) AS ok
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM negocios n WHERE n.id = p_negocio AND coalesce(n.fluxo_emylia, false)) THEN '{}'::text[]
    ELSE array_remove(ARRAY[
      CASE WHEN NOT (SELECT ok FROM pago) THEN 'receber e validar o pagamento da 1.ª prestação' END,
      CASE WHEN (SELECT ok FROM pago) AND public.fn_neg_fase_minima(p_negocio) < 5 THEN 'o negócio passar à fase Obra' END,
      CASE WHEN coalesce(p_plano_gravado, '') NOT IN ('aprovado', 'em curso', 'concluída')
           THEN 'aprovar o plano da obra (e gravá-lo) antes de a arrancar' END
    ], NULL)
  END
$function$;
COMMENT ON FUNCTION public.fn_neg_falta_para_arrancar(uuid, text) IS 'Negócio da Emylia: o que falta para a obra arrancar além das parcelas do arranque: a 1.ª prestação paga, a fase Obra e o plano aprovado já gravado. Usada por obra_guardar_negocio. 20270123030000.';
REVOKE ALL ON FUNCTION public.fn_neg_falta_para_arrancar(uuid, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- 3. as parcelas por pagar, agora com as das adendas assinadas
-- A de 20270122900000, com as adendas (marcadas «20270123030000»). As regras do contrato não mudam.
CREATE OR REPLACE FUNCTION public.fn_neg_parcelas_por_pagar(p_negocio uuid, p_so_arranque boolean)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH q AS (
    SELECT id FROM quotes
    WHERE negocio_id = p_negocio AND fluxo_emylia AND adenda_id IS NULL AND deleted_at IS NULL AND estado = 'aceite'
    ORDER BY versao DESC NULLS LAST LIMIT 1
  ), p AS (
    SELECT qp.*, min(qp.ordem) OVER () AS mn, max(qp.ordem) OVER () AS mx
    FROM quote_prestacoes qp WHERE qp.quote_id = (SELECT id FROM q)
  ), x AS (
    SELECT p.ordem, f.numero,
           coalesce(f.estado = 'paga' OR EXISTS (SELECT 1 FROM pagamentos pg WHERE pg.fatura_id = f.id AND pg.validado_em IS NOT NULL), false) AS paga,
           (p.ordem <> p.mn AND p.ordem <> p.mx AND p.marco IN ('adjudicacao', 'antes')) AS arranque,
           CASE WHEN p.ordem = p.mn THEN 'a 1.ª parcela'
                WHEN p.ordem = p.mx THEN 'a parcela final'
                WHEN p.marco IN ('adjudicacao', 'antes') THEN 'a parcela do arranque'
                ELSE 'a parcela «' || lower(p.rotulo) || '»' END
             || ' (' || replace(trim_scale(round(p.pct * 100, 2))::text, '.', ',') || '%)' AS nome
    FROM p
    LEFT JOIN LATERAL (SELECT f.id, f.numero, f.estado FROM faturas f
                       WHERE f.quote_prestacao_id = p.id AND f.estado <> 'anulada'
                       ORDER BY f.emitida_em DESC LIMIT 1) f ON true
  ), ad AS (
    -- 20270123030000: as parcelas das adendas assinadas (a versão em vigor do orçamento de cada uma), só para o auto de receção
    SELECT a.numero AS adenda, qp.ordem, f.numero,
           coalesce(nullif(btrim(a.referencia), ''), 'n.º ' || a.numero) AS ref,
           coalesce(f.estado = 'paga' OR EXISTS (SELECT 1 FROM pagamentos pg WHERE pg.fatura_id = f.id AND pg.validado_em IS NOT NULL), false) AS paga
    FROM adendas a
    JOIN LATERAL (SELECT qa.id, qa.total_com_iva FROM quotes qa
                  WHERE qa.adenda_id = a.id AND qa.deleted_at IS NULL AND qa.estado <> 'substituido'
                  ORDER BY qa.versao DESC NULLS LAST LIMIT 1) qa ON true
    JOIN quote_prestacoes qp ON qp.quote_id = qa.id
    LEFT JOIN LATERAL (SELECT f.id, f.numero, f.estado FROM faturas f
                       WHERE f.quote_prestacao_id = qp.id AND f.estado <> 'anulada'
                       ORDER BY f.emitida_em DESC LIMIT 1) f ON true
    WHERE NOT p_so_arranque AND a.negocio_id = p_negocio AND a.estado = 'assinada'
      AND coalesce(a.total_com_iva, qa.total_com_iva, 0) > 0
  ), faltas AS (
    SELECT 0 AS grupo, 0 AS adenda, x.ordem,
           CASE WHEN x.numero IS NOT NULL THEN 'receber o pagamento da ' || x.numero || ' (' || x.nome || ')'
                ELSE 'faturar e receber ' || x.nome END AS texto
    FROM x WHERE NOT x.paga AND (NOT p_so_arranque OR x.arranque)
    UNION ALL
    SELECT 1, ad.adenda, ad.ordem,
           CASE WHEN ad.numero IS NOT NULL THEN 'receber o pagamento da ' || ad.numero || ' (' || ad.ordem || '.ª parcela da adenda ' || ad.ref || ')'
                ELSE 'faturar e receber a ' || ad.ordem || '.ª parcela da adenda ' || ad.ref END
    FROM ad WHERE NOT ad.paga
  )
  SELECT coalesce(array_agg(texto ORDER BY grupo, adenda, ordem), '{}') FROM faltas;
$function$;
COMMENT ON FUNCTION public.fn_neg_parcelas_por_pagar(uuid, boolean) IS 'Negócio da Emylia: as parcelas do contrato por pagar (p_so_arranque: só as do arranque; senão todas, e as das adendas assinadas, que seguram o auto de receção). 20270122900000, adendas em 20270123030000.';
REVOKE ALL ON FUNCTION public.fn_neg_parcelas_por_pagar(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- 2. obra_guardar_negocio: o arranque pede também o resto
DO $m$
DECLARE
  d text := replace(pg_get_functiondef('public.obra_guardar_negocio(uuid,uuid,jsonb)'::regprocedure), chr(13) || chr(10), chr(10));
  v_antes text := E'    v_falta := public.fn_neg_parcelas_por_pagar(p_negocio_id, true);\n';
  n int;
BEGIN
  IF position('20270123030000' IN d) > 0 THEN
    RAISE NOTICE 'obra_guardar_negocio já tem o bloco 20270123030000: nada a fazer.';
    RETURN;
  END IF;
  n := (length(d) - length(replace(d, v_antes, ''))) / length(v_antes);
  IF n <> 1 THEN
    RAISE EXCEPTION 'obra_guardar_negocio: a linha do arranque de 20270122900000 («v_falta := public.fn_neg_parcelas_por_pagar(p_negocio_id, true);») aparece % vez(es) (esperada 1). A função mudou: rever antes de aplicar 20270123030000.', n;
  END IF;
  d := replace(d, v_antes,
       E'    -- 20270123030000 início (auditoria 19/11): além das parcelas do arranque, a 1.ª prestação paga, a fase Obra e o plano aprovado\n'
    || E'    --   já gravado (o da base antes desta gravação, v_obra)\n'
    || E'    v_falta := public.fn_neg_falta_para_arrancar(p_negocio_id, CASE WHEN v_existe THEN v_obra.estado_emylia->''plano''->>''estado'' END)\n'
    || E'               || public.fn_neg_parcelas_por_pagar(p_negocio_id, true);\n'
    || E'    -- 20270123030000 fim\n');
  EXECUTE d;
END $m$;

-- ---------------------------------------------------------------- conferir
DO $c$
BEGIN
  IF position('20270123030000' IN pg_get_functiondef('public.obra_guardar_negocio(uuid,uuid,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'CONFERIR: obra_guardar_negocio ficou sem o bloco 20270123030000';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.obra_guardar_negocio(uuid,uuid,jsonb)'::regprocedure) THEN
    RAISE EXCEPTION 'CONFERIR: obra_guardar_negocio deixou de ser SECURITY DEFINER';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_neg_parcelas_por_pagar(uuid,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_neg_falta_para_arrancar(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: as funções internas ficaram abertas a authenticated';
  END IF;
END $c$;

-- Reversão do passo 2 (só se for preciso; correr numa migration nova):
-- DO $r$
-- DECLARE d text := replace(pg_get_functiondef('public.obra_guardar_negocio(uuid,uuid,jsonb)'::regprocedure), chr(13) || chr(10), chr(10));
-- BEGIN
--   d := regexp_replace(d, '    -- 20270123030000 início.*?    -- 20270123030000 fim\n',
--                       E'    v_falta := public.fn_neg_parcelas_por_pagar(p_negocio_id, true);\n');
--   EXECUTE d;
-- END $r$;
