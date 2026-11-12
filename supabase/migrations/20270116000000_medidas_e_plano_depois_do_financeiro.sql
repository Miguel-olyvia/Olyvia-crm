-- 20270116000000 (Rúben, 12/11/2026: «a validação das medidas das obras e a validação do plano da obra só vêm depois do Financeiro»).
-- A ordem passa a ser:
--   proposta aceite → Financeiro (fatura e pagamento validado) → Obra: o supervisor retifica as medidas e as Operações aprovam o plano
--   (ao mesmo tempo) → contrato assinado → encomenda de cliente → obra. Se as medidas ou o plano mudarem o valor, uma adenda depois do
--   contrato (é só do ecrã: a adenda é a de sempre).
-- O que muda na base: só fn_neg_fase_minima (a de 20270112800000). A proposta aceite volta a ser Financeiro (4) sozinha, como em
-- 20270112300000; o pagamento validado e a encomenda emitida continuam a ser Obra (5).
-- O que já está na base e serve a ordem nova (não muda; a guarda de baixo confirma que está lá):
--   - neg_registar_fatura fatura-se com a proposta aceite, sem contrato (20270112300000);
--   - neg_validar_pagamento (e a cópia da verificação no Eticadata, fn_neg_validar_pagamento_erp, 20270115400000) chama
--     fn_neg_emitir_ec_se_pronta: pago e sem contrato (ou sem o plano aprovado), o negócio passa à Obra e a encomenda espera (20270112300000);
--   - obra_guardar_negocio, ao gravar o plano aprovado, e o gatilho trg_negocios_40_contrato_emite_ec, ao assinar o contrato, emitem a
--     encomenda de cliente quando o pagamento, o plano aprovado e o contrato assinado estiverem todos (20270112200000, 20270112300000).
-- Os negócios na fase Negócio com a proposta aceite (do fluxo de 10/11) passam a Financeiro na próxima leitura (neg_ler_negocios aplica a
-- fase mínima). A consulta no fim mostra quais são; não muda nada.

DO $guarda$
BEGIN
  IF position('20270112300000' IN pg_get_functiondef('public.fn_neg_emitir_ec_se_pronta(uuid,uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'fn_neg_emitir_ec_se_pronta não é a de 20270112300000 (pago e sem contrato passa à Obra): rever antes de correr 20270116000000.';
  END IF;
  IF position('20270112300000' IN pg_get_functiondef('public.neg_registar_fatura(uuid,uuid,text,text,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'neg_registar_fatura não é a de 20270112300000 (fatura sem contrato): rever antes de correr 20270116000000.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_negocios_40_contrato_emite_ec' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Falta o gatilho trg_negocios_40_contrato_emite_ec (20270112300000): rever antes de correr 20270116000000.';
  END IF;
END
$guarda$;

CREATE OR REPLACE FUNCTION public.fn_neg_fase_minima(p_negocio uuid)
 RETURNS smallint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20270116000000 (Rúben, 12/11: «a validação das medidas e do plano da obra só vêm depois do Financeiro»): a proposta aceite já é
  -- Financeiro (4); o pagamento validado da 1.ª prestação já é Obra (5), sem contrato (assina-se lá, depois das medidas e do plano);
  -- a encomenda emitida também (5). É a regra de 20270112300000 (9/11), que a 20270112700000 e a 20270112800000 tinham mudado.
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM client_contracts c WHERE c.id = public.fn_neg_contrato_ec(p_negocio) AND c.ec_emitida_em IS NOT NULL) THEN 5
    WHEN EXISTS (SELECT 1 FROM quotes q
                 JOIN quote_prestacoes p ON p.quote_id = q.id
                 JOIN faturas f ON f.quote_prestacao_id = p.id AND f.estado <> 'anulada'
                 JOIN pagamentos pg ON pg.fatura_id = f.id AND pg.validado_em IS NOT NULL
                 WHERE q.negocio_id = p_negocio AND q.fluxo_emylia AND q.adenda_id IS NULL AND q.deleted_at IS NULL AND q.estado = 'aceite'
                   AND p.ordem = (SELECT min(p2.ordem) FROM quote_prestacoes p2 WHERE p2.quote_id = q.id)) THEN 5
    WHEN public.fn_neg_contrato_ec(p_negocio) IS NOT NULL
      OR EXISTS (SELECT 1 FROM quotes q WHERE q.negocio_id = p_negocio AND q.fluxo_emylia AND q.adenda_id IS NULL
                 AND q.deleted_at IS NULL AND q.estado = 'aceite') THEN 4
    ELSE 0
  END::smallint
$function$;

COMMENT ON FUNCTION public.fn_neg_fase_minima(uuid) IS 'Negócio da Emylia: 5 com a encomenda de cliente emitida ou o pagamento da 1.ª prestação validado; 4 com a proposta aceite (ou o contrato assinado); senão 0. As medidas, o plano e o contrato fazem-se na Obra, depois do pagamento. A fase do negócio nunca fica abaixo disto (neg_guardar_negocio, neg_ler_negocios). 20270116000000.';
REVOKE ALL ON FUNCTION public.fn_neg_fase_minima(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_fase_minima(uuid) TO service_role;

-- Só para ver (não muda nada): os negócios que estão no Negócio (3) com a proposta aceite e que passam a Financeiro (4) na próxima leitura.
SELECT n.titulo, n.fase AS fase_agora, public.fn_neg_fase_minima(n.id) AS fase_minima_nova
FROM negocios n
WHERE coalesce(n.fase, 0) = 3 AND public.fn_neg_fase_minima(n.id) > 3
ORDER BY n.titulo;
