-- 20270112800000 (Rúben, 10/11/2026: «o contrato fica depois do plano da obra ser aprovado e antes do pagamento»). A ordem passa a ser:
--   proposta aceite → o supervisor retifica as medidas → as Operações aprovam o plano → contrato assinado → Financeiro (fatura e
--   pagamento) → encomenda de cliente → obra.
-- Só muda fn_neg_fase_minima (a de 20270112700000): a proposta aceite com as medidas e o plano já não é Financeiro (4) sozinha; é o contrato
-- assinado que a passa (como antes de 9/11). Ficam no Financeiro, como estavam: a venda direta aceite e o negócio que já tem fatura (o
-- fluxo de 9/11). O pagamento validado e a encomenda emitida continuam a ser Obra (5).

CREATE OR REPLACE FUNCTION public.fn_neg_fase_minima(p_negocio uuid)
 RETURNS smallint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20270112300000 (Rúben, 9/11, o fluxo novo): o pagamento validado da 1.ª prestação já é Obra (5); a encomenda emitida também (5)
  -- 20270112800000 (Rúben, 10/11, «o contrato depois do plano e antes do pagamento»): é o contrato assinado que passa a Financeiro (4);
  -- a proposta aceite só o é sozinha na venda direta ou com a fatura já registada
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM client_contracts c WHERE c.id = public.fn_neg_contrato_ec(p_negocio) AND c.ec_emitida_em IS NOT NULL) THEN 5
    WHEN EXISTS (SELECT 1 FROM quotes q
                 JOIN quote_prestacoes p ON p.quote_id = q.id
                 JOIN faturas f ON f.quote_prestacao_id = p.id AND f.estado <> 'anulada'
                 JOIN pagamentos pg ON pg.fatura_id = f.id AND pg.validado_em IS NOT NULL
                 WHERE q.negocio_id = p_negocio AND q.fluxo_emylia AND q.adenda_id IS NULL AND q.deleted_at IS NULL AND q.estado = 'aceite'
                   AND p.ordem = (SELECT min(p2.ordem) FROM quote_prestacoes p2 WHERE p2.quote_id = q.id)) THEN 5
    WHEN public.fn_neg_contrato_ec(p_negocio) IS NOT NULL THEN 4
    WHEN EXISTS (SELECT 1 FROM quotes q WHERE q.negocio_id = p_negocio AND q.fluxo_emylia AND q.adenda_id IS NULL
                 AND q.deleted_at IS NULL AND q.estado = 'aceite')
     AND (
       EXISTS (SELECT 1 FROM quotes q WHERE q.negocio_id = p_negocio AND q.fluxo_emylia AND q.adenda_id IS NULL
               AND q.deleted_at IS NULL AND q.estado = 'aceite' AND q.venda_direta)
       OR EXISTS (SELECT 1 FROM faturas f WHERE f.negocio_id = p_negocio AND f.estado <> 'anulada')
     ) THEN 4
    ELSE 0
  END::smallint
$function$;

COMMENT ON FUNCTION public.fn_neg_fase_minima(uuid) IS 'Negócio da Emylia: 5 com a encomenda de cliente emitida ou o pagamento da 1.ª prestação validado; 4 com o contrato assinado, a venda direta aceite ou a fatura registada; senão 0 (a proposta aceite fica no Negócio: medidas, plano e contrato). A fase do negócio nunca fica abaixo disto (neg_guardar_negocio, neg_ler_negocios). 20270112800000.';
REVOKE ALL ON FUNCTION public.fn_neg_fase_minima(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_fase_minima(uuid) TO service_role;
