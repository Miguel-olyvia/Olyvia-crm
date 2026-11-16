-- ============================================================
-- 20270117960000 contrato_antes_do_pagamento_retificacao_no_financeiro
-- ============================================================
-- 16/11/2026 (aprovado pelo utilizador). O fluxo do negócio passa a ser:
--   proposta assinada → contrato gerado e assinado (ou só a proposta, na venda direta) → pagamento validado pelo Financeiro e fatura →
--   medidas e plano da obra ao mesmo tempo → se a retificação das medidas muda o valor, volta ao Financeiro: a fatura da retificação
--   (uma adenda de acerto, sem assinatura do cliente) e o pagamento validado; se baixa (raro), a nota de crédito → encomenda de cliente e obra.
-- O que muda no servidor:
--   fn_neg_medidas_e_plano_abertos: a venda direta também espera pelo pagamento validado (deixa de abrir só por estar aceite).
--   neg_guardar_negocio: sai o bloqueio do contrato antes do pagamento (20270117830000); as medidas continuam a esperar pelo pagamento.
--   fn_neg_emitir_ec_se_pronta: a encomenda de cliente (com contrato ou venda direta) espera pelo plano aprovado e pela fatura da
--     retificação paga (a adenda «Acerto das medidas e do plano da obra», 1.ª parcela com o pagamento validado). A venda direta deixa de
--     emitir logo no pagamento; enquanto espera, passa à Obra como o caminho com contrato.
-- Permissões, GRANTs, dono, SECURITY DEFINER e search_path ficam iguais. As mudanças aplicam-se sobre o pg_get_functiondef VIVO (guarda md5).
-- Reversão (só como migration nova): repor os três corpos lidos a 16/11/2026 antes desta migration.
-- ============================================================
SET lock_timeout = '5s';

DO $g$ BEGIN
  IF md5(pg_get_functiondef('public.neg_guardar_negocio(uuid,uuid,jsonb)'::regprocedure)) <> '504d7a15e70569bcfa17d8492a030399' THEN
    RAISE EXCEPTION 'neg_guardar_negocio mudou desde a leitura (16/11/2026); rever antes de aplicar';
  END IF;
  IF md5(pg_get_functiondef('public.fn_neg_emitir_ec_se_pronta(uuid,uuid)'::regprocedure)) <> '6ae564fa502e232284626654420fa6fc' THEN
    RAISE EXCEPTION 'fn_neg_emitir_ec_se_pronta mudou desde a leitura (16/11/2026); rever antes de aplicar';
  END IF;
  IF md5(pg_get_functiondef('public.fn_neg_medidas_e_plano_abertos(uuid)'::regprocedure)) <> '63de056436f0e6ccd286cbbacf7c5375' THEN
    RAISE EXCEPTION 'fn_neg_medidas_e_plano_abertos mudou desde a leitura (16/11/2026); rever antes de aplicar';
  END IF;
END $g$;

-- ---------------------------------------------------------------- medidas e plano: só depois do pagamento, também na venda direta
CREATE OR REPLACE FUNCTION public.fn_neg_medidas_e_plano_abertos(p_negocio uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20270117830000: o mesmo que medidasEPlanoAbertos no ecrã (d.fin.pago || d.obra.ec)
  -- 20270117960000: a venda direta aceite já não abre sozinha: também espera pelo pagamento validado
  SELECT public.fn_neg_fase_minima(p_negocio) >= 5
$function$;

-- ---------------------------------------------------------------- uma substituição exata (o texto antigo tem de aparecer uma só vez)
CREATE OR REPLACE FUNCTION pg_temp.trocar(p_def text, p_antes text, p_depois text, p_onde text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  IF (length(p_def) - length(replace(p_def, p_antes, ''))) / greatest(length(p_antes), 1) <> 1 THEN
    RAISE EXCEPTION 'Troca % : o texto antigo não aparece exatamente uma vez', p_onde;
  END IF;
  RETURN replace(p_def, p_antes, p_depois);
END $f$;

-- ---------------------------------------------------------------- neg_guardar_negocio: o contrato já não espera pelo pagamento
DO $m$
DECLARE d text := replace(pg_get_functiondef('public.neg_guardar_negocio(uuid,uuid,jsonb)'::regprocedure), chr(13) || chr(10), chr(10)); i int; j int;
BEGIN
  i := strpos(d, E'  IF NOT v_abertos\n     AND (SELECT jsonb_object_agg(c.key, c.value) FROM jsonb_each(v_depois->''contrato'') c WHERE c.key LIKE ''v%'')');
  IF i = 0 THEN RAISE EXCEPTION 'neg_guardar_negocio: bloco do contrato não encontrado'; END IF;
  j := strpos(substr(d, i), E'NE013'';\n  END IF;\n');
  IF j = 0 OR j > 600 THEN RAISE EXCEPTION 'neg_guardar_negocio: fim do bloco do contrato não encontrado'; END IF;
  d := substr(d, 1, i - 1)
       || E'  -- 20270117960000: o contrato principal gera-se e assina-se ANTES do pagamento (o fluxo de 16/11); o bloqueio de 20270117830000 saiu.\n'
       || substr(d, i + j - 1 + length(E'NE013'';\n  END IF;\n'));
  EXECUTE d;
END $m$;

-- ---------------------------------------------------------------- a encomenda de cliente: plano aprovado e retificação paga
DO $m$
DECLARE d text := replace(pg_get_functiondef('public.fn_neg_emitir_ec_se_pronta(uuid,uuid)'::regprocedure), chr(13) || chr(10), chr(10)); i int; j int;
BEGIN
  d := pg_temp.trocar(d, 'v_plano_ok boolean;',
    E'v_plano_ok boolean;\n  v_retif_ok boolean; -- 20270117960000: a fatura da retificação (a adenda do acerto) paga, ou não há retificação a cobrar\n  v_vd boolean;', 'declare');

  -- depois de v_plano_ok := EXISTS (...);
  i := strpos(d, 'v_plano_ok := EXISTS (');
  IF i = 0 THEN RAISE EXCEPTION 'fn_neg_emitir_ec_se_pronta: v_plano_ok não encontrado'; END IF;
  j := strpos(substr(d, i), E');\n');
  d := substr(d, 1, i + j + 1)
    || E'  -- 20270117960000 (16/11): a retificação das medidas que muda o valor volta ao Financeiro numa adenda de acerto (sem assinatura do\n'
    || E'  --   cliente); a encomenda de cliente espera pela 1.ª parcela dela paga e validada. As anuladas e as recusadas não contam.\n'
    || E'  v_retif_ok := NOT EXISTS (\n'
    || E'    SELECT 1 FROM adendas a\n'
    || E'    WHERE a.negocio_id = p_negocio AND a.motivo = ''Acerto das medidas e do plano da obra'' AND a.estado NOT IN (''anulada'', ''recusada'')\n'
    || E'      AND NOT EXISTS (SELECT 1 FROM quotes qa JOIN quote_prestacoes p ON p.quote_id = qa.id\n'
    || E'                      JOIN faturas f ON f.quote_prestacao_id = p.id AND f.estado <> ''anulada''\n'
    || E'                      JOIN pagamentos pg ON pg.fatura_id = f.id AND pg.validado_em IS NOT NULL\n'
    || E'                      WHERE qa.adenda_id = a.id AND qa.deleted_at IS NULL AND p.ordem = 1));\n'
    || E'  v_vd := coalesce(v_q.venda_direta, false);\n'
    || substr(d, i + j + 2);

  -- a venda direta: também com o plano aprovado e a retificação paga (já não no pagamento)
  d := pg_temp.trocar(d, 'IF v_pago IS NOT NULL AND v_c.id IS NULL AND v_q.venda_direta THEN',
    'IF v_pago IS NOT NULL AND v_c.id IS NULL AND v_q.venda_direta AND v_plano_ok AND v_retif_ok THEN -- 20270117960000', 'venda direta');
  -- com contrato: também a retificação paga
  d := pg_temp.trocar(d, 'ELSIF v_pago IS NOT NULL AND v_c.id IS NOT NULL AND v_c.ec_emitida_em IS NULL AND v_plano_ok THEN',
    'ELSIF v_pago IS NOT NULL AND v_c.id IS NOT NULL AND v_c.ec_emitida_em IS NULL AND v_plano_ok AND v_retif_ok THEN -- 20270117960000', 'contrato');
  -- pago e à espera (do plano, da retificação ou do contrato): passa à Obra; agora também a venda direta
  d := pg_temp.trocar(d, 'IF v_pago IS NOT NULL AND NOT coalesce(v_q.venda_direta, false) AND (v_c.id IS NULL OR (v_c.ec_emitida_em IS NULL AND NOT v_plano_ok)) THEN',
    'IF v_pago IS NOT NULL AND (v_c.id IS NULL OR (v_c.ec_emitida_em IS NULL AND (NOT v_plano_ok OR NOT v_retif_ok))) THEN -- 20270117960000', 'aguarda');
  d := pg_temp.trocar(d, '''motivo'', CASE WHEN v_c.id IS NULL THEN ''A encomenda de cliente emite-se com o plano aprovado e o contrato assinado.''',
    E'''motivo'', CASE WHEN v_plano_ok AND NOT v_retif_ok THEN ''A encomenda de cliente emite-se quando a fatura da retificação for paga.''\n'
    || E'                     WHEN v_vd THEN ''A encomenda de cliente emite-se com o plano aprovado.''\n'
    || E'                     WHEN v_c.id IS NULL THEN ''A encomenda de cliente emite-se com o plano aprovado e o contrato assinado.''', 'motivo');
  EXECUTE d;
END $m$;
