-- 12/11/2026 (Rúben: «o que falta para validar automaticamente a fatura se foi paga, segundo o número que pomos na Olyvia»).
-- Até aqui a Olyvia só lia o Eticadata no browser: de minuto a minuto, e só com o negócio aberto por quem tem a permissão do Financeiro.
-- Sem ninguém na página, a fatura paga ficava por validar. Agora o servidor verifica sozinho, de 10 em 10 minutos:
--
--   pg_cron → fn_erp_verificar_agendado() → Edge Function erp-verificar-pagamentos → ponte do Eticadata (só leitura) → SQL Server do ERP
--
-- Para cada fatura por pagar, a função lê o estado no ERP e chama neg_erp_registar_leitura. Paga no ERP, valida-se o pagamento pela
-- mesma regra do botão (o recibo é o do ERP; com a 1.ª prestação, o negócio passa a Obra e, com o plano aprovado, sai a encomenda).
-- As regras do browser mantêm-se: com o NIF do ERP diferente do NIF de faturação do negócio, não se valida sozinha (fica no histórico).
--
--   1. fn_neg_validar_pagamento_erp(p_user, …): o neg_validar_pagamento, tirado do texto vivo, sem a permissão de quem pede (o servidor
--      não tem sessão). Só o service_role a corre. Se o neg_validar_pagamento mudar, volta a correr-se este passo (a migration pára se o
--      texto já não tiver a linha da permissão).
--   2. neg_erp_por_verificar(orgs, limite): as faturas por pagar dos negócios da Emylia, as lidas há mais tempo primeiro.
--   3. neg_erp_registar_leitura(fatura, leitura do ERP): grava a leitura e, paga, valida o pagamento.
--   4. fn_erp_verificar_segredo_confere(token): a Edge Function confere o token do pg_cron com o do Vault (o token nunca sai da base).
--   5. fn_erp_verificar_agendado(): o que o pg_cron corre; sem nada por verificar não chama a função.
--   6. O segredo 'erp_verificar_segredo' no Vault (gerado aqui, se faltar) e o agendamento. O endereço das funções
--      ('erp_funcoes_url' no Vault) é de cada projeto: cria-se à parte (ver supabase/functions/erp-verificar-pagamentos/README.md).

SET lock_timeout = '5s';

-- ------------------------------------------------------------------ 1. validar o pagamento sem sessão
DO $do$
DECLARE
  v text; n text;
BEGIN
  v := pg_get_functiondef('public.neg_validar_pagamento(uuid,uuid,text,numeric,date,text,text,text)'::regprocedure);
  n := replace(v, $q$v_user uuid := public.fn_cat_exigir(p_org, 'negocios.validar_pagamento');$q$, 'v_user uuid := p_user;');
  IF n = v THEN
    RAISE EXCEPTION 'neg_validar_pagamento mudou (sem a linha da permissão): rever a migration 20270115400000.';
  END IF;
  v := n;
  n := regexp_replace(v, 'FUNCTION public\.neg_validar_pagamento\(', 'FUNCTION public.fn_neg_validar_pagamento_erp(p_user uuid, ');
  IF n = v THEN
    RAISE EXCEPTION 'Não encontrei o cabeçalho de neg_validar_pagamento: rever a migration 20270115400000.';
  END IF;
  EXECUTE n;
END $do$;
COMMENT ON FUNCTION public.fn_neg_validar_pagamento_erp(uuid, uuid, uuid, text, numeric, date, text, text, text) IS 'Negócio da Emylia: o neg_validar_pagamento sem a permissão de quem pede, para a verificação automática no Eticadata (p_user pode ser NULL). Só o service_role. Copiado do texto vivo em 20270115400000.';
REVOKE ALL ON FUNCTION public.fn_neg_validar_pagamento_erp(uuid, uuid, uuid, text, numeric, date, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_validar_pagamento_erp(uuid, uuid, uuid, text, numeric, date, text, text, text) TO service_role;

-- ------------------------------------------------------------------ 2. as faturas por verificar
CREATE OR REPLACE FUNCTION public.neg_erp_por_verificar(p_orgs uuid[] DEFAULT NULL, p_limite integer DEFAULT 60)
RETURNS TABLE (fatura_id uuid, organization_id uuid, negocio_id uuid, numero text, lida_em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT f.id, f.organization_id, f.negocio_id, f.numero, f.erp_lida_em
  FROM faturas f
  JOIN negocios n ON n.id = f.negocio_id AND n.organization_id = f.organization_id
  WHERE f.estado IN ('emitida', 'parcial')
    AND n.fluxo_emylia AND n.anulado_em IS NULL AND n.deleted_at IS NULL
    AND (p_orgs IS NULL OR f.organization_id = ANY (p_orgs))
    AND NOT EXISTS (SELECT 1 FROM pagamentos pg WHERE pg.fatura_id = f.id AND pg.validado_em IS NOT NULL)
  ORDER BY f.erp_lida_em NULLS FIRST, f.emitida_em
  LIMIT greatest(1, least(coalesce(p_limite, 60), 500))
$$;
COMMENT ON FUNCTION public.neg_erp_por_verificar(uuid[], integer) IS 'Verificação automática no Eticadata: as faturas por pagar dos negócios da Emylia (sem pagamento validado), as lidas há mais tempo primeiro. Só o service_role. 20270115400000.';
REVOKE ALL ON FUNCTION public.neg_erp_por_verificar(uuid[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.neg_erp_por_verificar(uuid[], integer) TO service_role;

-- ------------------------------------------------------------------ 3. gravar a leitura e, paga, validar
-- p_erp é a resposta da ponte: { encontrada, numero, nif, total, pago, emFalta, estado, vencimento, atcud, recibos: [{ n, data, valor, meio }] }.
-- Devolve { acao: 'validada' | 'por_pagar' | 'nao_existe' | 'nif_diferente' | 'ignorada' | 'erro', … }.
CREATE OR REPLACE FUNCTION public.neg_erp_registar_leitura(p_fatura uuid, p_erp jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_f faturas; v_neg uuid; v_estado text := p_erp->>'estado'; v_pago numeric; v_antes numeric;
  v_nif_neg text; v_nif_erp text; v_rc jsonb; v_rc_n text; v_rc_ref text; v_rc_data date; v_res jsonb; v_texto text;
BEGIN
  IF p_erp IS NULL OR jsonb_typeof(p_erp) <> 'object' THEN
    RETURN jsonb_build_object('acao', 'ignorada', 'motivo', 'sem leitura');
  END IF;

  -- o negócio primeiro e a fatura depois, pela ordem do neg_validar_pagamento (não se encravam um ao outro)
  SELECT f.negocio_id INTO v_neg FROM faturas f WHERE f.id = p_fatura;
  IF NOT FOUND THEN RETURN jsonb_build_object('acao', 'ignorada', 'motivo', 'a fatura não existe'); END IF;
  PERFORM 1 FROM negocios WHERE id = v_neg FOR UPDATE;
  SELECT * INTO v_f FROM faturas WHERE id = p_fatura FOR UPDATE;
  IF v_f.estado IN ('paga', 'anulada')
     OR EXISTS (SELECT 1 FROM pagamentos pg WHERE pg.fatura_id = v_f.id AND pg.validado_em IS NOT NULL) THEN
    RETURN jsonb_build_object('acao', 'ignorada', 'motivo', 'já validada');
  END IF;

  IF p_erp->'encontrada' IS DISTINCT FROM 'true'::jsonb THEN
    -- não está no ERP (ou noutra base): conta como lida, para não passar à frente das outras em cada volta
    UPDATE faturas SET erp_lida_em = now() WHERE id = v_f.id;
    RETURN jsonb_build_object('acao', 'nao_existe');
  END IF;

  v_pago := CASE WHEN jsonb_typeof(p_erp->'pago') = 'number' THEN (p_erp->>'pago')::numeric END;
  v_antes := v_f.erp_pago;
  UPDATE faturas SET
    erp_pago = coalesce(v_pago, erp_pago),
    erp_lida_em = now(),
    atcud = coalesce(atcud, nullif(btrim(p_erp->>'atcud'), '')),
    nif_cliente = coalesce(nif_cliente, nullif(btrim(p_erp->>'nif'), '')),
    vencimento = coalesce(vencimento, CASE WHEN p_erp->>'vencimento' ~ '^\d{4}-\d{2}-\d{2}' THEN left(p_erp->>'vencimento', 10)::date END)
  WHERE id = v_f.id;

  IF v_estado IS DISTINCT FROM 'paga' THEN
    RETURN jsonb_build_object('acao', 'por_pagar', 'estado', v_estado);
  END IF;

  -- 23/10 (a regra do browser): paga, mas com outro NIF, não se valida sozinha. Fica no histórico uma vez (quando o valor pago muda).
  SELECT r.valor INTO v_nif_neg FROM negocio_respostas r WHERE r.negocio_id = v_neg AND r.campo_chave = 'nif_fat' AND r.divisao = '';
  v_nif_neg := regexp_replace(coalesce(v_nif_neg, ''), '\D', '', 'g');
  v_nif_erp := regexp_replace(coalesce(p_erp->>'nif', ''), '\D', '', 'g');
  IF v_nif_neg <> '' AND v_nif_erp <> '' AND v_nif_neg <> v_nif_erp THEN
    IF v_antes IS DISTINCT FROM v_pago THEN
      v_texto := format('%s: paga no Eticadata, mas com outro NIF (ERP %s, negócio %s). Confirme o número da fatura e valide à mão.',
        v_f.numero, v_nif_erp, v_nif_neg);
      PERFORM public.fn_neg_erp_historico(v_f.organization_id, v_neg, v_texto, 'w');
    END IF;
    RETURN jsonb_build_object('acao', 'nif_diferente');
  END IF;

  -- o recibo é o do ERP (o último). Se esse REC já está registado (um recibo que paga duas faturas), a base numera este.
  v_rc := p_erp->'recibos'->-1;
  v_rc_n := nullif(btrim(coalesce(v_rc->>'n', '')), '');
  v_rc_ref := CASE WHEN v_rc_n IS NOT NULL THEN v_rc_n || coalesce(' · ' || nullif(btrim(v_rc->>'meio'), ''), '') END;
  v_rc_data := CASE WHEN v_rc->>'data' ~ '^\d{4}-\d{2}-\d{2}' THEN left(v_rc->>'data', 10)::date END;
  IF v_rc_n IS NOT NULL AND EXISTS (SELECT 1 FROM recibos WHERE organization_id = v_f.organization_id AND numero = v_rc_n) THEN
    v_rc_n := NULL;
  END IF;

  BEGIN
    v_res := public.fn_neg_validar_pagamento_erp(NULL, v_f.organization_id, v_neg, v_f.numero,
      CASE WHEN v_pago > 0 THEN v_pago END, v_rc_data, v_rc_ref, v_rc_n, NULL);
  EXCEPTION WHEN OTHERS THEN
    -- a leitura fica gravada; o pagamento tenta-se outra vez na volta seguinte
    RETURN jsonb_build_object('acao', 'erro', 'msg', SQLERRM);
  END;

  -- a fatura do negócio (1.ª prestação): os dados do pagamento no passo Pagamento, como o browser faz (pagoNoErp)
  IF coalesce((v_res->>'primeira')::boolean, false) THEN
    INSERT INTO negocio_respostas AS r (organization_id, negocio_id, campo_chave, divisao, valor)
    SELECT v_f.organization_id, v_neg, k, '', val
    FROM (VALUES
      ('valor_recebido', CASE WHEN v_pago > 0 THEN trim_scale(v_pago)::text END),
      ('data_pag', v_rc_data::text),
      ('comprovativo', v_rc_ref)
    ) AS t(k, val)
    WHERE val IS NOT NULL
    ON CONFLICT (negocio_id, campo_chave, divisao) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now(), atualizado_por = NULL;
  END IF;

  PERFORM public.fn_neg_erp_historico(v_f.organization_id, v_neg,
    format('Pagamento confirmado no Eticadata · %s paga%s (verificação automática)', v_f.numero,
      CASE WHEN v_res->>'recibo' IS NOT NULL THEN ' com o ' || (v_res->>'recibo') ELSE '' END), 'a');

  RETURN jsonb_build_object('acao', 'validada', 'recibo', v_res->>'recibo', 'primeira', v_res->'primeira', 'ec', v_res->'ec');
END $$;
COMMENT ON FUNCTION public.neg_erp_registar_leitura(uuid, jsonb) IS 'Verificação automática no Eticadata: grava a leitura do ERP na fatura e, paga (e com o NIF do negócio), valida o pagamento com o recibo do ERP. Só o service_role. 20270115400000.';
REVOKE ALL ON FUNCTION public.neg_erp_registar_leitura(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.neg_erp_registar_leitura(uuid, jsonb) TO service_role;

-- O histórico do negócio vai do mais recente (ordem 0) para o mais antigo, como o browser o grava (log: unshift): o novo entra à
-- cabeça e os outros descem um. Em dois passos, para o UNIQUE (negocio_id, ordem) não tropeçar a meio.
CREATE OR REPLACE FUNCTION public.fn_neg_erp_historico(p_org uuid, p_negocio uuid, p_texto text, p_tipo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE negocio_historico SET ordem = -ordem - 2 WHERE negocio_id = p_negocio;
  UPDATE negocio_historico SET ordem = -ordem - 1 WHERE negocio_id = p_negocio;
  INSERT INTO negocio_historico (organization_id, negocio_id, ordem, texto, tipo) VALUES (p_org, p_negocio, 0, p_texto, p_tipo);
END $$;
REVOKE ALL ON FUNCTION public.fn_neg_erp_historico(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_erp_historico(uuid, uuid, text, text) TO service_role;

-- ------------------------------------------------------------------ 4. o token do pg_cron
CREATE OR REPLACE FUNCTION public.fn_erp_verificar_segredo_confere(p_token text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'vault' AS $$
  SELECT coalesce(length(p_token) >= 32 AND p_token = (
    SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = 'erp_verificar_segredo' LIMIT 1), false)
$$;
REVOKE ALL ON FUNCTION public.fn_erp_verificar_segredo_confere(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_erp_verificar_segredo_confere(text) TO service_role;

-- ------------------------------------------------------------------ 5. o que o pg_cron corre
CREATE OR REPLACE FUNCTION public.fn_erp_verificar_agendado()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'vault' AS $$
DECLARE
  v_url text; v_chave text;
BEGIN
  -- nada por pagar: não acorda a função nem a ponte
  IF NOT EXISTS (SELECT 1 FROM public.neg_erp_por_verificar(NULL, 1)) THEN RETURN; END IF;
  SELECT s.decrypted_secret INTO v_url FROM vault.decrypted_secrets s WHERE s.name = 'erp_funcoes_url' LIMIT 1;
  SELECT s.decrypted_secret INTO v_chave FROM vault.decrypted_secrets s WHERE s.name = 'erp_verificar_segredo' LIMIT 1;
  IF v_url IS NULL OR v_chave IS NULL THEN
    RAISE WARNING 'fn_erp_verificar_agendado: falta % no Vault; a verificação no Eticadata não correu.',
      CASE WHEN v_url IS NULL THEN 'erp_funcoes_url' ELSE 'erp_verificar_segredo' END;
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := rtrim(v_url, '/') || '/erp-verificar-pagamentos',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_chave, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
END $$;
REVOKE ALL ON FUNCTION public.fn_erp_verificar_agendado() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------ 6. o segredo e o agendamento (de 10 em 10 minutos)
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'erp_verificar_segredo') THEN
    PERFORM vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'erp_verificar_segredo',
      'O token com que o pg_cron chama a Edge Function erp-verificar-pagamentos (20270115400000).');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Não foi possível criar o segredo erp_verificar_segredo no Vault: %', SQLERRM;
END $do$;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.unschedule('erp-verificar-pagamentos') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'erp-verificar-pagamentos');
    PERFORM cron.schedule('erp-verificar-pagamentos', '*/10 * * * *', $cron$SELECT public.fn_erp_verificar_agendado()$cron$);
  ELSE
    RAISE WARNING 'Sem pg_cron ou pg_net: a verificação no Eticadata não ficou agendada (ligar as extensões e correr este passo outra vez).';
  END IF;
END $do$;
