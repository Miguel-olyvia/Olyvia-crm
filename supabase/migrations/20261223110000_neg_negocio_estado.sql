-- ============================================================
-- 20261223110000_neg_negocio_estado
-- ============================================================
-- O que faz: funções NOVAS da página Pessoas para o estado do negócio e as
--   ligações de registos:
--     neg_ligar_registo, neg_desligar_registo, neg_perder_negocio,
--     neg_anular_perda;
--   e as auxiliares fn_neg_actor, fn_neg_exigir_config,
--   fn_neg_exigir_pessoa, fn_neg_tem_permissao_org, fn_neg_negocio_editavel
--   (usadas também pelas migrations seguintes).
--   Todas SECURITY INVOKER: a RLS existente decide quem pode. O negócio é lido
--   com FOR NO KEY UPDATE, o que aplica a política de UPDATE de negocios
--   (pessoas.edit com âmbito); invisível dá sempre 'Negócio indisponível.'.
--   Organização sem linha em negocio_workflow_config: recusa (NG008).
-- LIMITAÇÃO ASSUMIDA: o D1 (linha de configuração) e estas regras vivem só
--   nas funções; as tabelas continuam escrevíveis directamente pela API por
--   quem tem pessoas.create/edit e a permissão de cada registo. Validar por
--   trigger fica para decisão do utilizador.
-- SÓ ACRESCENTA: nenhuma tabela, trigger, política, configuração ou função
--   existente é alterada. Não bloqueia tabelas.
-- Regras de produto aplicadas aqui (a base não as valida):
--   - ligar: registo da mesma organização e pessoa do negócio, livre ou já
--     deste negócio, negócio aberto; desligar só com o negócio aberto;
--   - um levantamento ligado não se desliga (NG005);
--   - ligar exige também poder editar o registo (RLS da tabela dele).
-- ATENÇÃO: ligar OU DESLIGAR um contrato não assinado é um UPDATE em
--   client_contracts e o trigger existente set_client_contract_total_value_sem_iva
--   recalcula-lhe o valor a partir do orçamento ou da proposta aceite. Por
--   isso um contrato por assinar sem orçamento nem proposta não se liga
--   (NG014: o valor iria a NULL).
-- Registos (contratos, propostas, orçamentos) com entity_id nulo, que existem
--   na nike, dão NG004: a UI tem de explicar que esse documento não tem pessoa.
-- Erros (SQLSTATE, a UI traduz pelo código): NG001 negócio indisponível,
--   NG002 estado não permite, NG003 pessoa indisponível, NG004 registo
--   indisponível para ligar/desligar, NG005 não se desliga, NG008 organização
--   sem a página Pessoas activa, NG009 valor inválido, NG013 o negócio já tem
--   levantamento, NG014 contrato sem orçamento nem proposta.
-- PRECISA DE CÓDIGO: a UI troca os stores em memória (negociosAlterados,
--   processoNegocios, acoesRegistos) por estas RPC; esconde "desligar" nos
--   levantamentos; regenerar os tipos do Supabase.
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public, extensions;

DO $$
BEGIN
  IF to_regclass('public.negocio_workflow_config') IS NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: falta 20261223100000 (negocio_workflow_config); nada feito.';
  END IF;
END;
$$;

-- Quem executa, em anew_users.id (como fn_negocios_actor, mas INVOKER).
CREATE FUNCTION public.fn_neg_actor()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
  SELECT COALESCE(
    (SELECT au.id FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1),
    public.current_business_user_id());
$function$;

-- D1: a organização tem de ter linha de configuração (lida sob RLS:
-- sem pessoas.view na organização a resposta é a mesma). Devolve o momento.
CREATE FUNCTION public.fn_neg_exigir_config(p_organization_id uuid)
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_momento text;
BEGIN
  SELECT c.momento_ganho INTO v_momento
  FROM public.negocio_workflow_config c
  WHERE c.organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;
  RETURN v_momento;
END;
$function$;

-- Pessoa ligada à organização e visível ao chamador (lead ou cliente vivo,
-- pela RLS de anew_leads / anew_clients).
CREATE FUNCTION public.fn_neg_exigir_pessoa(p_organization_id uuid, p_entity_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
BEGIN
  IF p_organization_id IS NULL OR p_entity_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.anew_entity_org_links lk
       WHERE lk.entity_id = p_entity_id AND lk.organization_id = p_organization_id)
     OR NOT (
       EXISTS (SELECT 1 FROM public.anew_leads l
               WHERE l.organization_id = p_organization_id AND l.entity_id = p_entity_id
                 AND l.deleted_at IS NULL)
       OR EXISTS (SELECT 1 FROM public.anew_clients c
                  WHERE c.organization_id = p_organization_id AND c.entity_id = p_entity_id
                    AND c.deleted_at IS NULL)) THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;
END;
$function$;

-- Permissão pessoas.* (has_anew_permission) com uma chave de âmbito desta
-- organização (como negocios_insert). Para as escritas que a RLS da tabela
-- não prende a pessoas.* (ex.: entity_interactions só pede organização).
CREATE FUNCTION public.fn_neg_tem_permissao_org(p_organization_id uuid, p_codigo text)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
  SELECT p_organization_id IS NOT NULL
     AND public.has_anew_permission(auth.uid(), p_codigo)
     AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys(p_codigo)) AS k(scope_key)
                 WHERE starts_with(k.scope_key, p_organization_id::text || ':'));
$function$;

-- Negócio editável: FOR NO KEY UPDATE sob RLS (pessoas.edit com âmbito), fora do
-- lixo, organização com configuração, estado na lista. Devolve a linha.
CREATE FUNCTION public.fn_neg_negocio_editavel(p_negocio_id uuid, p_estados text[])
  RETURNS public.negocios
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_neg public.negocios;
BEGIN
  SELECT n.* INTO v_neg
  FROM public.negocios n
  WHERE n.id = p_negocio_id AND n.deleted_at IS NULL
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;

  PERFORM public.fn_neg_exigir_config(v_neg.organization_id);

  IF NOT (v_neg.estado = ANY (p_estados)) THEN
    RAISE EXCEPTION 'O negócio está %: esta acção não é possível.', v_neg.estado
      USING ERRCODE = 'NG002';
  END IF;
  RETURN v_neg;
END;
$function$;

-- Liga um registo a um negócio aberto. O WHERE (re-avaliado depois do
-- bloqueio da linha) garante mesma organização e pessoa e "só um negócio por
-- registo"; zero linhas = NG004.
CREATE FUNCTION public.neg_ligar_registo(p_negocio_id uuid, p_tipo text, p_registo_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_neg    public.negocios;
  v_existe boolean;
  v_atual  uuid;
  v_n      int;
  v_sem_base boolean;
BEGIN
  IF p_registo_id IS NULL OR p_tipo IS NULL
     OR p_tipo NOT IN ('contacto', 'visita', 'levantamento', 'orcamento', 'proposta', 'contrato') THEN
    RAISE EXCEPTION 'Valor inválido: tipo ou registo.' USING ERRCODE = 'NG009';
  END IF;

  SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto']);

  IF p_tipo = 'contacto' THEN
    SELECT true, i.negocio_id INTO v_existe, v_atual
    FROM public.entity_interactions i
    WHERE i.id = p_registo_id AND i.organization_id = v_neg.organization_id
      AND i.entity_id = v_neg.entity_id;
    IF v_existe AND v_atual IS NOT DISTINCT FROM v_neg.id THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    UPDATE public.entity_interactions i SET negocio_id = v_neg.id
    WHERE i.id = p_registo_id AND i.organization_id = v_neg.organization_id
      AND i.entity_id = v_neg.entity_id AND i.negocio_id IS NULL;

  ELSIF p_tipo = 'visita' THEN
    SELECT true, s.negocio_id INTO v_existe, v_atual
    FROM public.schedule_items s
    WHERE s.id = p_registo_id AND s.organization_id = v_neg.organization_id
      AND s.time_off_type IS NULL AND s.vacation_id IS NULL
      AND (EXISTS (SELECT 1 FROM public.anew_leads l WHERE l.id = s.lead_id AND l.entity_id = v_neg.entity_id)
           OR EXISTS (SELECT 1 FROM public.anew_clients c WHERE c.id = s.client_id AND c.entity_id = v_neg.entity_id));
    IF v_existe AND v_atual IS NOT DISTINCT FROM v_neg.id THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    UPDATE public.schedule_items s SET negocio_id = v_neg.id
    WHERE s.id = p_registo_id AND s.organization_id = v_neg.organization_id
      AND s.time_off_type IS NULL AND s.vacation_id IS NULL AND s.negocio_id IS NULL
      AND (EXISTS (SELECT 1 FROM public.anew_leads l WHERE l.id = s.lead_id AND l.entity_id = v_neg.entity_id)
           OR EXISTS (SELECT 1 FROM public.anew_clients c WHERE c.id = s.client_id AND c.entity_id = v_neg.entity_id));

  ELSIF p_tipo = 'levantamento' THEN
    -- O trigger do levantamento valida o resto (um por negócio, permissão).
    SELECT true, lv.negocio_id INTO v_existe, v_atual
    FROM public.levantamentos lv
    WHERE lv.id = p_registo_id AND lv.organization_id = v_neg.organization_id
      AND lv.entity_id = v_neg.entity_id AND lv.deleted_at IS NULL;
    IF v_existe AND v_atual IS NOT DISTINCT FROM v_neg.id THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    IF EXISTS (SELECT 1 FROM public.levantamentos o
               WHERE o.negocio_id = v_neg.id AND o.id <> p_registo_id) THEN
      RAISE EXCEPTION 'Este negócio já tem um levantamento ligado.' USING ERRCODE = 'NG013';
    END IF;
    UPDATE public.levantamentos lv SET negocio_id = v_neg.id
    WHERE lv.id = p_registo_id AND lv.organization_id = v_neg.organization_id
      AND lv.entity_id = v_neg.entity_id AND lv.deleted_at IS NULL AND lv.negocio_id IS NULL;

  ELSIF p_tipo = 'orcamento' THEN
    SELECT true, q.negocio_id INTO v_existe, v_atual
    FROM public.quotes q
    WHERE q.id = p_registo_id AND q.organization_id = v_neg.organization_id
      AND q.entity_id = v_neg.entity_id AND q.deleted_at IS NULL;
    IF v_existe AND v_atual IS NOT DISTINCT FROM v_neg.id THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    UPDATE public.quotes q SET negocio_id = v_neg.id
    WHERE q.id = p_registo_id AND q.organization_id = v_neg.organization_id
      AND q.entity_id = v_neg.entity_id AND q.deleted_at IS NULL AND q.negocio_id IS NULL;

  ELSIF p_tipo = 'proposta' THEN
    SELECT true, pr.negocio_id INTO v_existe, v_atual
    FROM public.proposals pr
    WHERE pr.id = p_registo_id AND pr.organization_id = v_neg.organization_id
      AND pr.entity_id = v_neg.entity_id AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE;
    IF v_existe AND v_atual IS NOT DISTINCT FROM v_neg.id THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    UPDATE public.proposals pr SET negocio_id = v_neg.id
    WHERE pr.id = p_registo_id AND pr.organization_id = v_neg.organization_id
      AND pr.entity_id = v_neg.entity_id AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE
      AND pr.negocio_id IS NULL;

  ELSE -- contrato
    SELECT true, cc.negocio_id,
           (cc.status NOT IN ('signed', 'assinado') AND cc.quote_id IS NULL AND cc.proposal_id IS NULL)
      INTO v_existe, v_atual, v_sem_base
    FROM public.client_contracts cc
    WHERE cc.id = p_registo_id AND cc.organization_id = v_neg.organization_id
      AND cc.entity_id = v_neg.entity_id AND cc.deleted_at IS NULL;
    IF v_existe AND v_atual IS NOT DISTINCT FROM v_neg.id THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    -- Contrato por assinar sem orçamento nem proposta: o trigger existente
    -- set_client_contract_total_value_sem_iva poria o valor a NULL.
    IF v_existe AND v_sem_base THEN
      RAISE EXCEPTION 'Este contrato não tem orçamento nem proposta: não se liga antes de ser assinado.'
        USING ERRCODE = 'NG014';
    END IF;
    UPDATE public.client_contracts cc SET negocio_id = v_neg.id
    WHERE cc.id = p_registo_id AND cc.organization_id = v_neg.organization_id
      AND cc.entity_id = v_neg.entity_id AND cc.deleted_at IS NULL AND cc.negocio_id IS NULL;
  END IF;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Registo indisponível para ligar.' USING ERRCODE = 'NG004';
  END IF;
  RETURN jsonb_build_object('mudou', true);
END;
$function$;

-- Desliga um registo de um negócio aberto. Levantamentos: NG005.
CREATE FUNCTION public.neg_desligar_registo(p_negocio_id uuid, p_tipo text, p_registo_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_neg    public.negocios;
  v_existe boolean;
  v_atual  uuid;
  v_n      int;
BEGIN
  IF p_registo_id IS NULL OR p_tipo IS NULL
     OR p_tipo NOT IN ('contacto', 'visita', 'levantamento', 'orcamento', 'proposta', 'contrato') THEN
    RAISE EXCEPTION 'Valor inválido: tipo ou registo.' USING ERRCODE = 'NG009';
  END IF;

  SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto']);

  IF p_tipo = 'levantamento' THEN
    RAISE EXCEPTION 'Este registo não se desliga.' USING ERRCODE = 'NG005';
  END IF;

  IF p_tipo = 'contacto' THEN
    SELECT true, i.negocio_id INTO v_existe, v_atual
    FROM public.entity_interactions i
    WHERE i.id = p_registo_id AND i.organization_id = v_neg.organization_id
      AND i.entity_id = v_neg.entity_id;
    IF v_existe AND v_atual IS NULL THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    UPDATE public.entity_interactions i SET negocio_id = NULL
    WHERE i.id = p_registo_id AND i.organization_id = v_neg.organization_id
      AND i.entity_id = v_neg.entity_id AND i.negocio_id = v_neg.id;

  ELSIF p_tipo = 'visita' THEN
    SELECT true, s.negocio_id INTO v_existe, v_atual
    FROM public.schedule_items s
    WHERE s.id = p_registo_id AND s.organization_id = v_neg.organization_id;
    IF v_existe AND v_atual IS NULL THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    UPDATE public.schedule_items s SET negocio_id = NULL
    WHERE s.id = p_registo_id AND s.organization_id = v_neg.organization_id
      AND s.negocio_id = v_neg.id;

  ELSIF p_tipo = 'orcamento' THEN
    SELECT true, q.negocio_id INTO v_existe, v_atual
    FROM public.quotes q
    WHERE q.id = p_registo_id AND q.organization_id = v_neg.organization_id
      AND q.entity_id = v_neg.entity_id;
    IF v_existe AND v_atual IS NULL THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    UPDATE public.quotes q SET negocio_id = NULL
    WHERE q.id = p_registo_id AND q.organization_id = v_neg.organization_id
      AND q.entity_id = v_neg.entity_id AND q.negocio_id = v_neg.id;

  ELSIF p_tipo = 'proposta' THEN
    SELECT true, pr.negocio_id INTO v_existe, v_atual
    FROM public.proposals pr
    WHERE pr.id = p_registo_id AND pr.organization_id = v_neg.organization_id
      AND pr.entity_id = v_neg.entity_id;
    IF v_existe AND v_atual IS NULL THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    UPDATE public.proposals pr SET negocio_id = NULL
    WHERE pr.id = p_registo_id AND pr.organization_id = v_neg.organization_id
      AND pr.entity_id = v_neg.entity_id AND pr.negocio_id = v_neg.id;

  ELSE -- contrato
    SELECT true, cc.negocio_id INTO v_existe, v_atual
    FROM public.client_contracts cc
    WHERE cc.id = p_registo_id AND cc.organization_id = v_neg.organization_id
      AND cc.entity_id = v_neg.entity_id;
    IF v_existe AND v_atual IS NULL THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    UPDATE public.client_contracts cc SET negocio_id = NULL
    WHERE cc.id = p_registo_id AND cc.organization_id = v_neg.organization_id
      AND cc.entity_id = v_neg.entity_id AND cc.negocio_id = v_neg.id;
  END IF;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Registo indisponível para desligar.' USING ERRCODE = 'NG004';
  END IF;
  RETURN jsonb_build_object('mudou', true);
END;
$function$;

-- Perder (ou corrigir a fase/motivo de uma perda). Ganho não se perde.
CREATE FUNCTION public.neg_perder_negocio(p_negocio_id uuid, p_fase text, p_motivo text)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_neg    public.negocios;
  v_motivo text := btrim(p_motivo);
BEGIN
  IF p_fase IS NULL OR p_fase NOT IN
     ('lead', 'contacto', 'visita', 'levantamento', 'orcamento', 'proposta', 'contrato') THEN
    RAISE EXCEPTION 'Valor inválido: fase da perda.' USING ERRCODE = 'NG009';
  END IF;
  IF v_motivo IS NULL OR v_motivo = '' OR char_length(v_motivo) > 1000 THEN
    RAISE EXCEPTION 'Valor inválido: motivo da perda (1 a 1000 caracteres).' USING ERRCODE = 'NG009';
  END IF;

  SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto', 'perdido']);

  IF v_neg.estado = 'perdido' AND v_neg.fase_perda = p_fase AND v_neg.motivo_perda = v_motivo THEN
    RETURN jsonb_build_object('mudou', false, 'estado', 'perdido');
  END IF;

  UPDATE public.negocios n
  SET estado = 'perdido', fase_perda = p_fase, motivo_perda = v_motivo
  WHERE n.id = v_neg.id;

  RETURN jsonb_build_object('mudou', true, 'estado', 'perdido');
END;
$function$;

-- Anular a perda (reabrir). A razão vai para o evento 'reabriu' pela
-- variável local app.negocio_motivo_reabertura (lida e limpa pelo trigger
-- fn_negocios_registar_evento).
CREATE FUNCTION public.neg_anular_perda(p_negocio_id uuid, p_motivo_reabertura text)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_neg    public.negocios;
  v_motivo text := btrim(p_motivo_reabertura);
BEGIN
  IF v_motivo IS NULL OR v_motivo = '' OR char_length(v_motivo) > 1000 THEN
    RAISE EXCEPTION 'Valor inválido: razão da reabertura (1 a 1000 caracteres).' USING ERRCODE = 'NG009';
  END IF;

  SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto', 'perdido']);

  IF v_neg.estado = 'aberto' THEN
    RETURN jsonb_build_object('mudou', false, 'estado', 'aberto');
  END IF;

  PERFORM set_config('app.negocio_motivo_reabertura', v_motivo, true);
  UPDATE public.negocios n
  SET estado = 'aberto', fase_perda = NULL, motivo_perda = NULL
  WHERE n.id = v_neg.id;
  PERFORM set_config('app.negocio_motivo_reabertura', '', true);

  RETURN jsonb_build_object('mudou', true, 'estado', 'aberto');
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_actor()                               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_neg_exigir_config(uuid)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_neg_exigir_pessoa(uuid, uuid)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_neg_negocio_editavel(uuid, text[])        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_neg_tem_permissao_org(uuid, text)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.neg_ligar_registo(uuid, text, uuid)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.neg_desligar_registo(uuid, text, uuid)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.neg_perder_negocio(uuid, text, text)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.neg_anular_perda(uuid, text)                 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_actor()                            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_exigir_config(uuid)                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_exigir_pessoa(uuid, uuid)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_negocio_editavel(uuid, text[])     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_tem_permissao_org(uuid, text)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_ligar_registo(uuid, text, uuid)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_desligar_registo(uuid, text, uuid)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_perder_negocio(uuid, text, text)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_anular_perda(uuid, text)              TO authenticated, service_role;

-- CONFERIR
DO $$
DECLARE
  v_txt text;
BEGIN
  -- 1. funções novas: assinatura, INVOKER, search_path fixo, sem anon, com authenticated
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_neg_actor()'),
              ('public.fn_neg_exigir_config(uuid)'),
              ('public.fn_neg_exigir_pessoa(uuid,uuid)'),
              ('public.fn_neg_negocio_editavel(uuid,text[])'),
              ('public.fn_neg_tem_permissao_org(uuid,text)'),
              ('public.neg_ligar_registo(uuid,text,uuid)'),
              ('public.neg_desligar_registo(uuid,text,uuid)'),
              ('public.neg_perder_negocio(uuid,text,text)'),
              ('public.neg_anular_perda(uuid,text)')
            ) AS e(sig)
            LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.sig)
            WHERE p.oid IS NULL
               OR p.prosecdef
               OR array_to_string(p.proconfig, ',') IS DISTINCT FROM 'search_path=public, pg_temp'
               OR has_function_privilege('anon', p.oid, 'EXECUTE')
               OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (1. funções novas): falha em %', v_txt;
  END IF;

  -- 2. funções existentes de que dependem, iguais (md5 lidos a 19/10)
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.current_business_user_id()',     '7e60101f074e4ff526559140be6618bb'),
              ('public.fn_negocios_actor()',            '26296535afef27c393ab0c932995e3cb'),
              ('public.crm_scope_keys(text)',           '6abb12e1d7a3db943630e8f8d7e15ca8'),
              ('public.has_anew_permission(uuid,text)', '8f69ed134c7d20e080d8c5a4161a3151')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (2. funções existentes mudaram): %', v_txt;
  END IF;

  -- 2b. tabelas usadas existem
  v_txt := (SELECT string_agg(t, ',') FROM unnest(ARRAY[
              'negocios', 'negocio_workflow_config', 'entity_interactions', 'schedule_items',
              'levantamentos', 'quotes', 'proposals', 'client_contracts', 'anew_leads',
              'anew_clients', 'anew_entity_org_links', 'anew_users']) AS t
            WHERE to_regclass('public.' || t) IS NULL);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (2b. tabelas em falta): %', v_txt;
  END IF;

  -- 3. o trigger de eventos continua a ler app.negocio_motivo_reabertura
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                 WHERE p.oid = to_regprocedure('public.fn_negocios_registar_evento()')
                   AND p.prosrc LIKE '%app.negocio_motivo_reabertura%') THEN
    RAISE EXCEPTION 'CONFERIR (3. fn_negocios_registar_evento não lê app.negocio_motivo_reabertura)';
  END IF;
END;
$$;

COMMIT;
