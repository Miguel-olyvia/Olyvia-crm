-- ============================================================
-- 20270123040000 fatura_sem_valor_recusada
-- ============================================================
-- Auditoria de 19/11/2026, achado 5: não se regista uma fatura de 0 €.
--
-- O problema: em neg_registar_fatura (20270112300000) o valor da fatura é o do ERP (p_erp.total / p_erp.valor) ou, sem ele, a
-- percentagem da prestação sobre a base coalesce(total_com_iva, total, 0) do orçamento (na adenda, coalesce(adendas.total_com_iva,
-- quotes.total_com_iva, 0)). Sem leitura do ERP e com o orçamento sem total, a fatura ficava com 0 €; e o ERP que diz 0 também passava
-- (a guarda só recusava valores negativos). Uma fatura de 0 € depois valida um pagamento de 0 € e deixa a parcela «paga».
--
-- O que muda (troca de texto guardada sobre o pg_get_functiondef VIVO de neg_registar_fatura): logo a seguir à guarda do valor negativo,
-- uma fatura NOVA com o valor a faturar 0 ou menos recusa-se com NE006 e uma mensagem clara. Registar outra vez uma fatura que já está
-- na base (só atualiza o que veio do ERP) continua a passar, para não encravar as que já existem.
-- Permissões, GRANTs, dono, SECURITY DEFINER e search_path ficam iguais.
--
-- Reversão (só como migration nova): tirar o bloco entre «-- 20270123040000 início» e «-- 20270123040000 fim» (ver o fim deste ficheiro).
-- ============================================================
SET lock_timeout = '5s';

DO $m$
DECLARE
  d text := replace(pg_get_functiondef('public.neg_registar_fatura(uuid,uuid,text,text,jsonb)'::regprocedure), chr(13) || chr(10), chr(10));
  v_antes text := E'  IF v_tot IS NULL OR v_tot < 0 THEN RAISE EXCEPTION ''Valor da fatura inválido.'' USING ERRCODE = ''NE006''; END IF;\n';
  n int;
BEGIN
  IF position('20270123040000' IN d) > 0 THEN
    RAISE NOTICE 'neg_registar_fatura já tem o bloco 20270123040000: nada a fazer.';
    RETURN;
  END IF;
  n := (length(d) - length(replace(d, v_antes, ''))) / length(v_antes);
  IF n <> 1 THEN
    RAISE EXCEPTION 'neg_registar_fatura: a guarda do valor («IF v_tot IS NULL OR v_tot < 0 THEN …») aparece % vez(es) (esperada 1). A função mudou desde 20270112300000: rever antes de aplicar 20270123040000.', n;
  END IF;
  d := replace(d, v_antes,
       v_antes
    || E'  -- 20270123040000 início (auditoria 19/11): uma fatura nova nunca fica com 0 € (sem o total do orçamento nem o do ERP)\n'
    || E'  IF v_f.id IS NULL AND v_tot <= 0 THEN\n'
    || E'    RAISE EXCEPTION ''O valor a faturar dá 0 €: a fatura % não se regista assim. Leia a fatura no Eticadata (o total vem de lá) ou confirme o total do orçamento, e registe-a outra vez.'', v_numero\n'
    || E'      USING ERRCODE = ''NE006'';\n'
    || E'  END IF;\n'
    || E'  -- 20270123040000 fim\n');
  EXECUTE d;
END $m$;

DO $c$
BEGIN
  IF position('20270123040000' IN pg_get_functiondef('public.neg_registar_fatura(uuid,uuid,text,text,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'CONFERIR: neg_registar_fatura ficou sem o bloco 20270123040000';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.neg_registar_fatura(uuid,uuid,text,text,jsonb)'::regprocedure)
     OR NOT has_function_privilege('authenticated', 'public.neg_registar_fatura(uuid,uuid,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.neg_registar_fatura(uuid,uuid,text,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: neg_registar_fatura mudou de SECURITY DEFINER ou de permissões';
  END IF;
END $c$;

-- Reversão (só se for preciso; correr numa migration nova):
-- DO $r$
-- DECLARE d text := replace(pg_get_functiondef('public.neg_registar_fatura(uuid,uuid,text,text,jsonb)'::regprocedure), chr(13) || chr(10), chr(10));
-- BEGIN
--   d := regexp_replace(d, '  -- 20270123040000 início.*?  -- 20270123040000 fim\n', '');
--   EXECUTE d;
-- END $r$;
