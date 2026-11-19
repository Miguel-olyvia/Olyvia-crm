-- ============================================================
-- 20270123020000 erp_valida_so_com_nif_e_valor
-- ============================================================
-- Auditoria de 19/11/2026, achado 3: a verificação automática no Eticadata só valida sozinha com o NIF e o valor certos.
--
-- O problema: neg_erp_registar_leitura (20270115400000, linhas 92-129) dava a fatura como paga quando o ERP dizia «paga», comparando só
-- o NIF, e só quando os dois NIF existiam: sem NIF no negócio (ou sem NIF na leitura do ERP) validava na mesma; e nunca via o valor. Um
-- número de fatura trocado (outra fatura do mesmo cliente, ou de um cliente sem NIF) validava o pagamento errado, com o recibo e, na
-- 1.ª prestação, a passagem à Obra.
--
-- O que muda (trocas de texto guardadas sobre o pg_get_functiondef VIVO de neg_erp_registar_leitura):
--   1. Sem o NIF de faturação no negócio (negocio_respostas.nif_fat vazio): não valida sozinha. Fica no histórico do negócio, uma vez
--      (quando o valor pago no ERP muda): «paga no Eticadata, mas o negócio não tem o NIF de faturação; valide à mão». Devolve
--      acao 'sem_nif'.
--   2. Com NIF no negócio: o NIF do ERP tem de ser o mesmo; a leitura sem NIF já não passa (devolve 'nif_diferente', como antes, com
--      «sem NIF» na mensagem).
--   3. O total do ERP (p_erp.total) tem de bater com o valor da fatura registada (faturas.total), com a tolerância de 0,02 €. Sem total
--      na leitura, ou com a fatura registada a 0 €, também não. Fica no histórico, uma vez, e devolve acao 'valor_diferente'.
--   A validação à mão (neg_validar_pagamento, botão do Financeiro) não muda.
-- Os valores novos de acao ('sem_nif', 'valor_diferente') contam como «erros» no resumo da Edge Function erp-verificar-pagamentos
-- (_shared/erpVerificar.ts só conhece validada / por_pagar / nao_existe / nif_diferente / ignorada). É só a contagem no registo da
-- função; a regra é a da base.
-- Permissões, GRANTs (só service_role), dono, SECURITY DEFINER e search_path ficam iguais.
--
-- Reversão (só como migration nova): repor as três linhas trocadas e tirar o bloco entre «-- 20270123020000 início» e
-- «-- 20270123020000 fim» (ver o fim deste ficheiro).
-- ============================================================
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION pg_temp.trocar(p_def text, p_antes text, p_depois text, p_onde text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  IF (length(p_def) - length(replace(p_def, p_antes, ''))) / greatest(length(p_antes), 1) <> 1 THEN
    RAISE EXCEPTION 'Troca %: o texto antigo não aparece exatamente uma vez na definição viva de neg_erp_registar_leitura; a função mudou desde 20270115400000. Rever antes de aplicar 20270123020000.', p_onde;
  END IF;
  RETURN replace(p_def, p_antes, p_depois);
END $f$;

DO $m$
DECLARE
  d text := replace(pg_get_functiondef('public.neg_erp_registar_leitura(uuid,jsonb)'::regprocedure), chr(13) || chr(10), chr(10));
  v_recibo text := E'  -- o recibo é o do ERP (o último).';
BEGIN
  IF position('20270123020000' IN d) > 0 THEN
    RAISE NOTICE 'neg_erp_registar_leitura já tem as mudanças 20270123020000: nada a fazer.';
    RETURN;
  END IF;

  -- a variável do total do ERP
  d := pg_temp.trocar(d, 'v_res jsonb; v_texto text;',
                         'v_res jsonb; v_texto text; v_total_erp numeric; -- 20270123020000', 'declare');

  -- com NIF no negócio, o do ERP tem de ser o mesmo (a leitura sem NIF já não passa)
  d := pg_temp.trocar(d, E'IF v_nif_neg <> '''' AND v_nif_erp <> '''' AND v_nif_neg <> v_nif_erp THEN',
                         E'IF v_nif_neg <> '''' AND v_nif_neg <> v_nif_erp THEN -- 20270123020000: a leitura sem NIF também não passa', 'nif');
  d := pg_temp.trocar(d, 'v_f.numero, v_nif_erp, v_nif_neg);',
                         E'v_f.numero, coalesce(nullif(v_nif_erp, ''''), ''sem NIF''), v_nif_neg); -- 20270123020000', 'mensagem do nif');

  -- sem NIF no negócio, ou com o total diferente: fica para a validação à mão
  d := pg_temp.trocar(d, v_recibo,
       E'  -- 20270123020000 início (auditoria 19/11): sem o NIF de faturação no negócio não há com que comparar: não se valida sozinha.\n'
    || E'  IF v_nif_neg = '''' THEN\n'
    || E'    IF v_antes IS DISTINCT FROM v_pago THEN\n'
    || E'      PERFORM public.fn_neg_erp_historico(v_f.organization_id, v_neg,\n'
    || E'        format(''%s: paga no Eticadata, mas o negócio não tem o NIF de faturação. Confirme a fatura e valide o pagamento à mão.'', v_f.numero), ''w'');\n'
    || E'    END IF;\n'
    || E'    RETURN jsonb_build_object(''acao'', ''sem_nif'');\n'
    || E'  END IF;\n'
    || E'  -- o total do ERP tem de bater com o valor da fatura registada (tolerância de 0,02 €)\n'
    || E'  v_total_erp := CASE WHEN jsonb_typeof(p_erp->''total'') = ''number'' THEN (p_erp->>''total'')::numeric\n'
    || E'                      WHEN btrim(coalesce(p_erp->>''total'', '''')) ~ ''^-?[0-9]+([.,][0-9]+)?$'' THEN replace(btrim(p_erp->>''total''), '','', ''.'')::numeric END;\n'
    || E'  IF v_total_erp IS NULL OR coalesce(v_f.total, 0) <= 0 OR abs(v_total_erp - v_f.total) > 0.02 THEN\n'
    || E'    IF v_antes IS DISTINCT FROM v_pago THEN\n'
    || E'      PERFORM public.fn_neg_erp_historico(v_f.organization_id, v_neg,\n'
    || E'        format(''%s: paga no Eticadata, mas o total do ERP (%s) não bate com o valor da fatura na Olyvia (%s). Confirme o número da fatura e valide o pagamento à mão.'',\n'
    || E'          v_f.numero, coalesce(replace(round(v_total_erp, 2)::text, ''.'', '','') || '' €'', ''sem total''),\n'
    || E'          coalesce(replace(round(v_f.total, 2)::text, ''.'', '','') || '' €'', ''sem valor'')), ''w'');\n'
    || E'    END IF;\n'
    || E'    RETURN jsonb_build_object(''acao'', ''valor_diferente'', ''total_erp'', v_total_erp, ''total'', v_f.total);\n'
    || E'  END IF;\n'
    || E'  -- 20270123020000 fim\n\n'
    || v_recibo, 'bloco do valor');

  EXECUTE d;
END $m$;

-- ---------------------------------------------------------------- conferir
DO $c$
DECLARE d text := pg_get_functiondef('public.neg_erp_registar_leitura(uuid,jsonb)'::regprocedure);
BEGIN
  IF position('20270123020000 início' IN d) = 0 OR position('v_total_erp numeric' IN d) = 0 THEN
    RAISE EXCEPTION 'CONFERIR: neg_erp_registar_leitura ficou sem as mudanças 20270123020000';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.neg_erp_registar_leitura(uuid,jsonb)'::regprocedure) THEN
    RAISE EXCEPTION 'CONFERIR: neg_erp_registar_leitura deixou de ser SECURITY DEFINER';
  END IF;
  IF has_function_privilege('authenticated', 'public.neg_erp_registar_leitura(uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.neg_erp_registar_leitura(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: neg_erp_registar_leitura ficou aberta a authenticated ou anon';
  END IF;
END $c$;

-- Reversão (só se for preciso; correr numa migration nova):
-- DO $r$
-- DECLARE d text := replace(pg_get_functiondef('public.neg_erp_registar_leitura(uuid,jsonb)'::regprocedure), chr(13) || chr(10), chr(10));
-- BEGIN
--   d := regexp_replace(d, '  -- 20270123020000 início.*?  -- 20270123020000 fim\n\n', '');
--   d := replace(d, 'v_res jsonb; v_texto text; v_total_erp numeric; -- 20270123020000', 'v_res jsonb; v_texto text;');
--   d := replace(d, 'IF v_nif_neg <> '''' AND v_nif_neg <> v_nif_erp THEN -- 20270123020000: a leitura sem NIF também não passa',
--                   'IF v_nif_neg <> '''' AND v_nif_erp <> '''' AND v_nif_neg <> v_nif_erp THEN');
--   d := replace(d, 'v_f.numero, coalesce(nullif(v_nif_erp, ''''), ''sem NIF''), v_nif_neg); -- 20270123020000', 'v_f.numero, v_nif_erp, v_nif_neg);');
--   EXECUTE d;
-- END $r$;
