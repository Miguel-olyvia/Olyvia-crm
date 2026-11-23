-- 20270126270000 — a obra só arranca com a encomenda de cliente emitida (teste de ponta a ponta de 23/11, erro 3).
-- Antes: fn_neg_falta_para_arrancar (chamada por obra_guardar_negocio na 1.ª passagem a em curso, com fn_neg_parcelas_por_pagar) só
-- verificava o pagamento da 1.ª prestação, a fase Obra e o plano aprovado gravado: com o plano aprovado sem as medidas aceites, a obra
-- arrancava sem medidas e sem a encomenda de cliente (EC).
-- Agora: com o pagamento validado, falta também «a encomenda de cliente emitida» enquanto a EC do contrato principal não estiver emitida
-- (fn_neg_contrato_ec: o contrato assinado, ou o contrato de suporte da venda direta). A mensagem segue o estilo das outras condições
-- («A obra ainda não pode arrancar: falta …»). A EC das adendas não entra (tem o seu pagamento; não segura a obra principal). O ecrã
-- (src/emylia/preparacaoObra.ts: faltaParaArrancar) já não deixava arrancar sem a EC; o servidor passa a dizer o mesmo.
-- Não muda: a assinatura, SECURITY INVOKER, search_path, grants e dono; as outras condições e a sua ordem; obra_guardar_negocio.
-- Parte da versão viva (pg_get_functiondef na base RH a 23/11/2026, md5 366ff2aff911292b8b9f2c298fe9979b).

DO $guarda$
BEGIN
  IF md5(pg_get_functiondef('public.fn_neg_falta_para_arrancar(uuid,text)'::regprocedure)) <> '366ff2aff911292b8b9f2c298fe9979b' THEN
    RAISE EXCEPTION 'fn_neg_falta_para_arrancar mudou desde a leitura (md5 diferente): rever antes de aplicar.';
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public.fn_neg_falta_para_arrancar(p_negocio uuid, p_plano_gravado text)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- 20270123030000: a 1.ª prestação do orçamento principal paga (fatura paga ou com o pagamento validado), a fase mínima Obra (5) e o
  -- plano aprovado já gravado. Só nos negócios da Emylia.
  -- 20270126270000: e, com o pagamento, a encomenda de cliente do contrato principal emitida (fn_neg_contrato_ec: o contrato assinado ou,
  --   na venda direta, o contrato de suporte). A das adendas (emitida com o pagamento de cada adenda) não segura o arranque.
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
      CASE WHEN (SELECT ok FROM pago) AND NOT EXISTS (SELECT 1 FROM client_contracts c
                                                      WHERE c.id = public.fn_neg_contrato_ec(p_negocio) AND c.ec_emitida_em IS NOT NULL)
           THEN 'a encomenda de cliente emitida (sai sozinha com as medidas aceites no local, o plano aprovado e o contrato assinado)' END,
      CASE WHEN coalesce(p_plano_gravado, '') NOT IN ('aprovado', 'em curso', 'concluída')
           THEN 'aprovar o plano da obra (e gravá-lo) antes de a arrancar' END
    ], NULL)
  END
$function$
;

ALTER FUNCTION public.fn_neg_falta_para_arrancar(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_neg_falta_para_arrancar(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_falta_para_arrancar(uuid, text) TO service_role;
