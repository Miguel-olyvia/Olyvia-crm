-- ============================================================
-- 20270123010000 faturar_e_validar_so_com_contrato
-- ============================================================
-- Auditoria de 19/11/2026, achado 2: a fatura e o pagamento da 1.ª prestação só com o contrato assinado.
--
-- O fluxo em vigor (16/11, 20270117960000): proposta aceite → contrato assinado no portal (na venda direta, só a proposta) → fatura e
-- pagamento validado → medidas e plano → encomenda de cliente → obra. O ecrã já o cumpre (motor.ts, registarFatura e o passo Fatura:
-- «Primeiro, o contrato assinado»), mas o servidor não:
--   - neg_registar_fatura (20270112300000, linha 76) deixa faturar com a proposta só aceite (era o fluxo de 9/11);
--   - neg_validar_pagamento (20261231999700) não vê o contrato;
--   - a verificação automática no Eticadata (fn_neg_validar_pagamento_erp, 20270115400000, cópia do neg_validar_pagamento) também não.
--
-- O que muda (só no orçamento principal, adenda_id IS NULL, e fora da venda direta):
--   1. fn_neg_contrato_principal_assinado(negócio) (nova): há um contrato principal do negócio (sem adenda, não apagado, não substituído)
--      em signed / assinado / active.
--   2. fn_neg_exigir_contrato_para_pagar(fatura) (nova): se a fatura é a da 1.ª prestação do orçamento principal, sem venda direta e ainda
--      sem pagamento validado, e o negócio não tem contrato assinado, recusa com NE014.
--   3. neg_registar_fatura: uma fatura NOVA da 1.ª prestação recusa-se sem contrato assinado (NE014). Registar outra vez a mesma fatura
--      (só atualiza o que veio do ERP) continua a passar, para não encravar as faturas já registadas no fluxo de 9/11.
--   4. neg_validar_pagamento e fn_neg_validar_pagamento_erp: logo depois de encontrar a fatura, chamam fn_neg_exigir_contrato_para_pagar.
--      Validar outra vez um pagamento já validado continua a ser idempotente. A verificação automática (neg_erp_registar_leitura) apanha o
--      erro e devolve acao 'erro' com a mensagem; a leitura fica gravada e volta a tentar na volta seguinte, depois do contrato assinado.
-- NE014 é um código novo. O ecrã mostra a mensagem do servidor tal como vem.
-- As alterações são trocas de texto sobre o pg_get_functiondef VIVO (o texto antigo tem de aparecer exatamente uma vez; senão a migration
-- pára e explica). Permissões, GRANTs, dono, SECURITY DEFINER e search_path ficam iguais.
--
-- Reversão (só como migration nova): tirar os blocos entre «-- 20270123010000 início» e «-- 20270123010000 fim» das três funções (ver o
-- fim deste ficheiro) e depois DROP FUNCTION public.fn_neg_exigir_contrato_para_pagar(uuid) e
-- public.fn_neg_contrato_principal_assinado(uuid).
-- ============================================================
SET lock_timeout = '5s';

DO $g$ BEGIN
  IF position('20270112300000' IN pg_get_functiondef('public.neg_registar_fatura(uuid,uuid,text,text,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'neg_registar_fatura não é a de 20270112300000: rever antes de aplicar 20270123010000.';
  END IF;
  IF to_regprocedure('public.fn_neg_validar_pagamento_erp(uuid,uuid,uuid,text,numeric,date,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Falta fn_neg_validar_pagamento_erp (20270115400000): aplicar essa migration antes de 20270123010000.';
  END IF;
END $g$;

-- ---------------------------------------------------------------- 1. o contrato principal assinado
CREATE OR REPLACE FUNCTION public.fn_neg_contrato_principal_assinado(p_negocio uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20270123010000: o contrato do orçamento principal (sem adenda), em vigor e assinado pelo cliente
  SELECT EXISTS (SELECT 1 FROM client_contracts c
                 WHERE c.negocio_id = p_negocio AND c.adenda_id IS NULL AND c.deleted_at IS NULL AND c.replaced_by_contract_id IS NULL
                   AND c.status IN ('signed', 'assinado', 'active'))
$function$;
COMMENT ON FUNCTION public.fn_neg_contrato_principal_assinado(uuid) IS 'Negócio da Emylia: tem o contrato principal (sem adenda, em vigor) assinado pelo cliente? 20270123010000.';
REVOKE ALL ON FUNCTION public.fn_neg_contrato_principal_assinado(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_contrato_principal_assinado(uuid) TO service_role;

-- ---------------------------------------------------------------- 2. o pagamento da 1.ª prestação só com o contrato
CREATE OR REPLACE FUNCTION public.fn_neg_exigir_contrato_para_pagar(p_fatura uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v record;
BEGIN
  SELECT f.negocio_id, q.adenda_id, coalesce(q.venda_direta, false) AS venda_direta, p.ordem,
         (SELECT min(p2.ordem) FROM quote_prestacoes p2 WHERE p2.quote_id = q.id) AS primeira
    INTO v
  FROM faturas f
  JOIN quote_prestacoes p ON p.id = f.quote_prestacao_id
  JOIN quotes q ON q.id = p.quote_id
  WHERE f.id = p_fatura;
  -- só a fatura da 1.ª prestação do orçamento principal, fora da venda direta
  IF NOT FOUND OR v.adenda_id IS NOT NULL OR v.venda_direta OR v.ordem IS DISTINCT FROM v.primeira THEN
    RETURN;
  END IF;
  -- já validado: validar outra vez continua a ser idempotente
  IF EXISTS (SELECT 1 FROM pagamentos pg WHERE pg.fatura_id = p_fatura AND pg.validado_em IS NOT NULL) THEN
    RETURN;
  END IF;
  IF NOT public.fn_neg_contrato_principal_assinado(v.negocio_id) THEN
    RAISE EXCEPTION 'Falta o contrato assinado pelo cliente: o pagamento da 1.ª prestação só se valida depois de o cliente assinar o contrato no portal.'
      USING ERRCODE = 'NE014';
  END IF;
END $function$;
COMMENT ON FUNCTION public.fn_neg_exigir_contrato_para_pagar(uuid) IS 'Negócio da Emylia: recusa (NE014) validar o pagamento da 1.ª prestação do orçamento principal sem o contrato assinado (fora da venda direta). Chamada por neg_validar_pagamento e fn_neg_validar_pagamento_erp. 20270123010000.';
REVOKE ALL ON FUNCTION public.fn_neg_exigir_contrato_para_pagar(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_exigir_contrato_para_pagar(uuid) TO service_role;

-- ---------------------------------------------------------------- uma substituição exata (o texto antigo tem de aparecer uma só vez)
CREATE OR REPLACE FUNCTION pg_temp.trocar(p_def text, p_antes text, p_depois text, p_onde text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  IF (length(p_def) - length(replace(p_def, p_antes, ''))) / greatest(length(p_antes), 1) <> 1 THEN
    RAISE EXCEPTION 'Troca %: o texto antigo não aparece exatamente uma vez na definição viva; a função mudou. Rever antes de aplicar 20270123010000.', p_onde;
  END IF;
  RETURN replace(p_def, p_antes, p_depois);
END $f$;

-- ---------------------------------------------------------------- 3. neg_registar_fatura
DO $m$
DECLARE
  d text := replace(pg_get_functiondef('public.neg_registar_fatura(uuid,uuid,text,text,jsonb)'::regprocedure), chr(13) || chr(10), chr(10));
  v_antes text := E'  -- o valor: o do ERP; senão a percentagem da prestação';
BEGIN
  IF position('20270123010000' IN d) > 0 THEN
    RAISE NOTICE 'neg_registar_fatura já tem o bloco 20270123010000: nada a fazer.';
    RETURN;
  END IF;
  d := pg_temp.trocar(d, v_antes,
       E'  -- 20270123010000 início (auditoria 19/11): com contrato, a fatura da 1.ª prestação só depois de o cliente o assinar (o fluxo de\n'
    || E'  --   16/11; a venda direta fica só com a proposta). Registar outra vez a mesma fatura (o ERP) continua a passar.\n'
    || E'  IF v_f.id IS NULL AND v_primeira AND NOT coalesce(v_q.venda_direta, false) AND NOT public.fn_neg_contrato_principal_assinado(p_negocio) THEN\n'
    || E'    RAISE EXCEPTION ''Falta o contrato assinado pelo cliente: a fatura da 1.ª prestação só se regista depois de o cliente assinar o contrato no portal.''\n'
    || E'      USING ERRCODE = ''NE014'';\n'
    || E'  END IF;\n'
    || E'  -- 20270123010000 fim\n\n'
    || v_antes, 'neg_registar_fatura');
  EXECUTE d;
END $m$;

-- ---------------------------------------------------------------- 4. neg_validar_pagamento e a cópia da verificação no ERP
DO $m$
DECLARE
  r record; d text;
  v_antes text := E'RAISE EXCEPTION ''Registe primeiro a fatura: sem a fatura do Eticadata não se valida o pagamento.'' USING ERRCODE = ''NE010'';\n  END IF;\n';
BEGIN
  FOR r IN SELECT x FROM unnest(ARRAY['public.neg_validar_pagamento(uuid,uuid,text,numeric,date,text,text,text)',
                                      'public.fn_neg_validar_pagamento_erp(uuid,uuid,uuid,text,numeric,date,text,text,text)']) AS t(x) LOOP
    d := replace(pg_get_functiondef(r.x::regprocedure), chr(13) || chr(10), chr(10));
    IF position('20270123010000' IN d) > 0 THEN
      RAISE NOTICE '% já tem o bloco 20270123010000: nada a fazer.', r.x;
      CONTINUE;
    END IF;
    d := pg_temp.trocar(d, v_antes,
         v_antes
      || E'  -- 20270123010000 início (auditoria 19/11): o pagamento da 1.ª prestação só com o contrato assinado (fora da venda direta)\n'
      || E'  PERFORM public.fn_neg_exigir_contrato_para_pagar(v_f.id);\n'
      || E'  -- 20270123010000 fim\n', r.x);
    EXECUTE d;
  END LOOP;
END $m$;

-- ---------------------------------------------------------------- conferir
DO $c$
DECLARE r record;
BEGIN
  FOR r IN SELECT x FROM unnest(ARRAY['public.neg_registar_fatura(uuid,uuid,text,text,jsonb)',
                                      'public.neg_validar_pagamento(uuid,uuid,text,numeric,date,text,text,text)',
                                      'public.fn_neg_validar_pagamento_erp(uuid,uuid,uuid,text,numeric,date,text,text,text)']) AS t(x) LOOP
    IF position('20270123010000' IN pg_get_functiondef(r.x::regprocedure)) = 0 THEN
      RAISE EXCEPTION 'CONFERIR: % ficou sem o bloco 20270123010000', r.x;
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = r.x::regprocedure) THEN
      RAISE EXCEPTION 'CONFERIR: % deixou de ser SECURITY DEFINER', r.x;
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated', 'public.fn_neg_validar_pagamento_erp(uuid,uuid,uuid,text,numeric,date,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: fn_neg_validar_pagamento_erp ficou aberta a authenticated';
  END IF;
END $c$;

-- Reversão (só se for preciso; correr numa migration nova):
-- DO $r$
-- DECLARE r record; d text;
-- BEGIN
--   FOR r IN SELECT x FROM unnest(ARRAY['public.neg_registar_fatura(uuid,uuid,text,text,jsonb)',
--                                       'public.neg_validar_pagamento(uuid,uuid,text,numeric,date,text,text,text)',
--                                       'public.fn_neg_validar_pagamento_erp(uuid,uuid,uuid,text,numeric,date,text,text,text)']) AS t(x) LOOP
--     d := replace(pg_get_functiondef(r.x::regprocedure), chr(13) || chr(10), chr(10));
--     d := regexp_replace(d, '  -- 20270123010000 início.*?  -- 20270123010000 fim\n\n?', '');
--     EXECUTE d;
--   END LOOP;
-- END $r$;
