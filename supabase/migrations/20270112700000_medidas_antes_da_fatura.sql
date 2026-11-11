-- 20270112700000 (Rúben, 10/11/2026: «medidas antes da fatura»). A ordem do negócio à obra passa a ser:
--   proposta aceite → o supervisor retifica as medidas → as Operações aprovam o plano → Financeiro (fatura e pagamento) → contrato →
--   encomenda de cliente → obra.
-- Só muda fn_neg_fase_minima: a proposta aceite já não é Financeiro (4) sozinha; fica no Negócio (3) até as medidas estarem aceites
-- (negocio_respostas.retif_aceite) e o plano aprovado (ops_obra.estado_emylia->plano->estado). Ficam no Financeiro, como estavam:
-- a venda direta aceite (não tem obra a medir), o contrato assinado (negócios antigos) e o negócio que já tem fatura (o do fluxo de 9/11).
-- O pagamento validado e a encomenda emitida continuam a ser Obra (5).
-- É a função que estava na base a 10/11 (20270112300000), com as mudanças marcadas «20270112700000».

CREATE OR REPLACE FUNCTION public.fn_neg_fase_minima(p_negocio uuid)
 RETURNS smallint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20270112300000 (Rúben, 9/11, o fluxo novo): o pagamento validado da 1.ª prestação já é Obra (5), mesmo sem contrato (assina-se lá);
  -- a encomenda emitida também (5)
  -- 20270112700000 (Rúben, 10/11, «medidas antes da fatura»): a proposta aceite só é Financeiro (4) com as medidas aceites e o plano aprovado
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
       -- 20270112700000: a venda direta aceite (sem obra a medir)
       EXISTS (SELECT 1 FROM quotes q WHERE q.negocio_id = p_negocio AND q.fluxo_emylia AND q.adenda_id IS NULL
               AND q.deleted_at IS NULL AND q.estado = 'aceite' AND q.venda_direta)
       -- 20270112700000: já faturado (o fluxo de 9/11): fica no Financeiro
       OR EXISTS (SELECT 1 FROM faturas f WHERE f.negocio_id = p_negocio AND f.estado <> 'anulada')
       -- 20270112700000: as medidas aceites e o plano aprovado
       OR (EXISTS (SELECT 1 FROM negocio_respostas r WHERE r.negocio_id = p_negocio AND r.campo_chave = 'retif_aceite'
                   AND coalesce(r.valor, '') <> '' AND NOT coalesce(r.sugerido, false))
           AND EXISTS (SELECT 1 FROM ops_obra o WHERE o.negocio_id = p_negocio
                       AND o.estado_emylia->'plano'->>'estado' IN ('aprovado', 'em curso', 'concluída')))
     ) THEN 4
    ELSE 0
  END::smallint
$function$;

COMMENT ON FUNCTION public.fn_neg_fase_minima(uuid) IS 'Negócio da Emylia: 5 com a encomenda de cliente emitida ou o pagamento da 1.ª prestação validado; 4 com o contrato assinado, a venda direta aceite, a fatura registada, ou a proposta aceite com as medidas aceites e o plano aprovado; senão 0. A fase do negócio nunca fica abaixo disto (neg_guardar_negocio, neg_ler_negocios). 20270112700000.';
REVOKE ALL ON FUNCTION public.fn_neg_fase_minima(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_fase_minima(uuid) TO service_role;
