-- ============================================================
-- 20261223140000_neg_criar_ganhar
-- ============================================================
-- O que faz: funções NOVAS neg_criar_negocio e neg_ganhar_negocio, ambas
--   SECURITY INVOKER (a RLS existente decide).
--   neg_criar_negocio: cria o negócio (id gerado na UI, idempotente) e liga
--     na mesma chamada os contactos/visitas marcados e o levantamento
--     escolhido (os recusados voltam em "recusados"; ligar exige
--     pessoas.edit). NÃO mexe no status da lead (D4 à letra): devolve em
--     lead_escolhida, só como informação, a lead ABERTA a que o negócio
--     corresponde (nula se não houver). Um reenvio do mesmo id devolve o
--     negócio antes de qualquer outra verificação. Abordagem encerrada:
--     recusa (NG002) salvo p_reabrir_abordagem (limpa só closure_result e
--     deixa uma nota; exige pessoas.edit).
--   neg_ganhar_negocio: aplica a regra da organização (D2: manual sem
--     condição; proposta_aceite / contrato_assinado exigem esse documento
--     ligado ao negócio, NG006, sem ganho à mão), marca ganho e converte UMA
--     lead aberta (a indicada ou a mais recente; D4bis) pelo
--     rpc_convert_lead_to_client, só com leads.convert com âmbito sobre essa
--     lead (D5, NG007). Lead aberta = status fora de converted, rejected,
--     lost, cancelled (fn_neg_lead_aberta). Sem lead aberta (ou com a lead
--     indicada fechada) não converte: ja_cliente se a pessoa já for cliente
--     desta organização, ja_convertida se houver lead convertida, senão NG015.
--     O cliente (devolvido pelo rpc ou já existente) tem de ser desta
--     organização; um cliente reutilizado de outra organização da mesma raiz
--     aborta tudo (NG012). Devolve quantas outras leads ficam abertas.
--     Tudo numa transacção: se a conversão falhar (ex.: quota de clientes),
--     o negócio não fica ganho.
-- SÓ ACRESCENTA: nenhuma tabela, trigger, política, configuração ou função
--   existente é alterada. Não bloqueia tabelas.
-- Nike (contrato_assinado): a assinatura do contrato já converte a lead e
--   cria o cliente pelo trigger existente; aqui o ganho dá
--   conversao = 'ja_cliente'.
-- DECISÕES DE PRODUTO (documentadas, não alteradas aqui):
--   - leads.convert não tem âmbito configurável: um utilizador normal só
--     ganha negócios cujas leads são suas (criador ou comercial), excepto
--     com âmbito ORG.
--   - NG012 pode dar falso positivo: o rpc reutiliza o cliente da mesma raiz
--     noutra organização irmã (medido no remoto: 1 pessoa com clientes em
--     mais de uma organização da mesma raiz; 14 leads afectáveis), e um
--     cliente da mesma organização que o chamador não veja por âmbito de
--     clients.view também dá NG012.
-- LIMITAÇÃO ASSUMIDA: o D1 vive só nas funções (ver 20261223110000).
-- Erros novos: NG006 condição de ganho por cumprir, NG007 sem leads.convert,
--   NG012 cliente de outra organização, NG015 sem lead aberta para converter.
-- PRECISA DE CÓDIGO: a UI gera o id do negócio, troca negociosNovos.ts por
--   neg_criar_negocio e oferece "Dar como ganho" quando o resumo devolve
--   pronto_a_ganhar (D2); regenerar os tipos do Supabase.
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public, extensions;

DO $$
BEGIN
  IF to_regprocedure('public.neg_ligar_registo(uuid,text,uuid)') IS NULL
     OR to_regprocedure('public.fn_neg_mudar_abordagem(uuid,uuid,uuid,text,text,text)') IS NULL
     OR to_regprocedure('public.fn_neg_lead_aberta(text)') IS NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: faltam 20261223110000 e 20261223120000; nada feito.';
  END IF;
END;
$$;

CREATE FUNCTION public.neg_criar_negocio(
  p_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_titulo text,
  p_notas text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_registos jsonb DEFAULT '[]'::jsonb,
  p_levantamento_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_reabrir_abordagem boolean DEFAULT false)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_titulo     text := btrim(p_titulo);
  v_notas      text := NULLIF(btrim(p_notas), '');
  v_registos   jsonb := COALESCE(p_registos, '[]'::jsonb);
  v_lead       public.anew_leads;
  v_existente  public.negocios;
  v_reg        record;
  v_ligados    jsonb := '[]'::jsonb;
  v_recusados  jsonb := '[]'::jsonb;
  v_n          int;
BEGIN
  IF p_id IS NULL OR v_titulo IS NULL OR v_titulo = '' OR char_length(v_titulo) > 200
     OR char_length(v_notas) > 5000 THEN
    RAISE EXCEPTION 'Valor inválido: identificador, título (1 a 200) ou notas (até 5000).' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_typeof(v_registos) <> 'array' THEN
    RAISE EXCEPTION 'Valor inválido: registos.' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_array_length(v_registos) > 100 OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_registos) AS e(valor)
       WHERE jsonb_typeof(e.valor) <> 'object'
          OR (e.valor ->> 'tipo') IS NULL OR (e.valor ->> 'tipo') NOT IN ('contacto', 'visita')
          OR (e.valor ->> 'id') IS NULL
          OR (e.valor ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION 'Valor inválido: registos (até 100, tipo contacto ou visita, id uuid).' USING ERRCODE = 'NG009';
  END IF;

  PERFORM public.fn_neg_exigir_config(p_organization_id);
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);

  -- Reenvio do mesmo id: devolve-o como está, antes de qualquer outra regra.
  SELECT n.* INTO v_existente FROM public.negocios n WHERE n.id = p_id;
  IF FOUND THEN
    IF v_existente.organization_id <> p_organization_id OR v_existente.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
    END IF;
    RETURN jsonb_build_object('negocio_id', p_id, 'mudou', false, 'ligados', '[]'::jsonb,
                              'recusados', '[]'::jsonb, 'lead_escolhida', NULL);
  END IF;

  -- A lead aberta a que o negócio corresponde (só informação; não se altera).
  SELECT * INTO v_lead FROM public.fn_neg_escolher_lead(p_organization_id, p_entity_id, p_lead_id, 'aberta');
  IF v_lead.id IS NOT NULL AND v_lead.closure_result IS NOT NULL
     AND NOT COALESCE(p_reabrir_abordagem, false) THEN
    RAISE EXCEPTION 'A abordagem desta pessoa está encerrada.' USING ERRCODE = 'NG002';
  END IF;

  -- Criar (RLS negocios_insert: pessoas.create na organização, pessoa ligada,
  -- comercial membro activo). Corrida com outro reenvio: devolve-o como está.
  INSERT INTO public.negocios (id, organization_id, entity_id, titulo, notas, assigned_to)
  VALUES (p_id, p_organization_id, p_entity_id, v_titulo, v_notas, p_assigned_to)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    SELECT n.* INTO v_existente FROM public.negocios n WHERE n.id = p_id;
    IF NOT FOUND OR v_existente.organization_id <> p_organization_id
       OR v_existente.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
    END IF;
    RETURN jsonb_build_object('negocio_id', p_id, 'mudou', false, 'ligados', '[]'::jsonb,
                              'recusados', '[]'::jsonb, 'lead_escolhida', NULL);
  END IF;

  -- Ligações (exigem pessoas.edit: NG001 aborta tudo; NG004 vai para recusados).
  FOR v_reg IN
    SELECT e.valor ->> 'tipo' AS tipo, (e.valor ->> 'id')::uuid AS id
    FROM jsonb_array_elements(v_registos) AS e(valor)
    UNION ALL
    SELECT 'levantamento', p_levantamento_id WHERE p_levantamento_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM public.neg_ligar_registo(p_id, v_reg.tipo, v_reg.id);
      v_ligados := v_ligados || jsonb_build_object('tipo', v_reg.tipo, 'id', v_reg.id);
    EXCEPTION WHEN SQLSTATE 'NG004' THEN
      v_recusados := v_recusados || jsonb_build_object('tipo', v_reg.tipo, 'id', v_reg.id);
    END;
  END LOOP;

  IF v_lead.id IS NOT NULL AND v_lead.closure_result IS NOT NULL THEN
    PERFORM public.fn_neg_mudar_abordagem(
      p_organization_id, p_entity_id, v_lead.id, NULL, NULL, 'Reaberta ao criar um negócio');
  END IF;

  RETURN jsonb_build_object('negocio_id', p_id, 'mudou', true, 'ligados', v_ligados,
                            'recusados', v_recusados,
                            'lead_escolhida', CASE WHEN public.fn_neg_lead_aberta(v_lead.status::text)
                                                   THEN v_lead.id END);
END;
$function$;

CREATE FUNCTION public.neg_ganhar_negocio(
  p_negocio_id uuid,
  p_lead_id uuid DEFAULT NULL,
  p_client_data jsonb DEFAULT '{}'::jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_neg        public.negocios;
  v_momento    text;
  v_mudou      boolean := false;
  v_lead       public.anew_leads;
  v_client_id  uuid;
  v_client_org uuid;
  v_conversao  text;
  v_outras     int;
BEGIN
  IF p_client_data IS NOT NULL AND jsonb_typeof(p_client_data) <> 'object' THEN
    RAISE EXCEPTION 'Valor inválido: dados do cliente.' USING ERRCODE = 'NG009';
  END IF;

  -- 1. Negócio editável, aberto ou já ganho (perdido: reabrir primeiro).
  SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto', 'ganho']);
  v_momento := public.fn_neg_exigir_config(v_neg.organization_id);

  IF v_neg.estado = 'aberto' THEN
    -- 2. Regra da organização (leituras sob RLS).
    IF v_momento = 'proposta_aceite' AND NOT EXISTS (
         SELECT 1 FROM public.proposals pr
         WHERE pr.negocio_id = v_neg.id AND pr.status = 'accepted'
           AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE) THEN
      RAISE EXCEPTION 'O ganho desta organização exige proposta aceite ligada ao negócio.' USING ERRCODE = 'NG006';
    END IF;
    IF v_momento = 'contrato_assinado' AND NOT EXISTS (
         SELECT 1 FROM public.client_contracts cc
         WHERE cc.negocio_id = v_neg.id AND cc.status IN ('signed', 'assinado')
           AND cc.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'O ganho desta organização exige contrato assinado ligado ao negócio.' USING ERRCODE = 'NG006';
    END IF;

    -- 3. Ganho antes da conversão (escrita própria antes do bypass de auditoria).
    UPDATE public.negocios n SET estado = 'ganho' WHERE n.id = v_neg.id;
    v_mudou := true;
  END IF;

  -- 4. Conversão de UMA lead aberta, serializada por pessoa.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'neg_pessoa:' || v_neg.organization_id::text || ':' || v_neg.entity_id::text, 0));

  SELECT * INTO v_lead FROM public.fn_neg_escolher_lead(
    v_neg.organization_id, v_neg.entity_id, p_lead_id, 'aberta');

  IF v_lead.id IS NOT NULL
     AND (v_lead.status = 'converted' OR v_lead.converted_to_client_id IS NOT NULL) THEN
    -- Lead indicada já convertida: não se chama o rpc.
    v_conversao := 'ja_convertida';
    v_client_id := v_lead.converted_to_client_id;

  ELSIF v_lead.id IS NOT NULL AND public.fn_neg_lead_aberta(v_lead.status::text) THEN
    -- D5: leads.convert com âmbito sobre esta lead (como as políticas).
    IF NOT (public.has_anew_permission(auth.uid(), 'leads.convert')
            AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('leads.convert')) AS k(scope_key)
                        WHERE k.scope_key = v_lead.organization_id::text || ':*'
                           OR k.scope_key = v_lead.organization_id::text || ':' || v_lead.assigned_to::text
                           OR k.scope_key = v_lead.organization_id::text || ':' || v_lead.created_by::text)) THEN
      RAISE EXCEPTION 'Sem permissão para converter a lead.' USING ERRCODE = 'NG007';
    END IF;

    SELECT c.id, c.organization_id INTO v_client_id, v_client_org
    FROM public.rpc_convert_lead_to_client(
      v_lead.id, COALESCE(p_client_data, '{}'::jsonb), NULL::uuid, NULL::uuid, NULL::uuid) AS c;
    IF v_client_org IS DISTINCT FROM v_neg.organization_id THEN
      RAISE EXCEPTION 'A conversão desta lead não é possível nesta organização.' USING ERRCODE = 'NG012';
    END IF;
    v_conversao := 'feita';
    v_mudou := true;

  ELSE
    -- Sem lead aberta, ou a indicada está fechada (rejeitada, perdida,
    -- cancelada): não converte; só se a pessoa já for cliente desta organização.
    SELECT c.id INTO v_client_id
    FROM public.anew_clients c
    WHERE c.organization_id = v_neg.organization_id AND c.entity_id = v_neg.entity_id
      AND c.deleted_at IS NULL
    ORDER BY c.created_at ASC
    LIMIT 1;
    IF v_client_id IS NOT NULL THEN
      v_conversao := 'ja_cliente';
    ELSE
      SELECT l.* INTO v_lead
      FROM public.anew_leads l
      WHERE l.organization_id = v_neg.organization_id AND l.entity_id = v_neg.entity_id
        AND l.deleted_at IS NULL AND l.converted_to_client_id IS NOT NULL
      ORDER BY l.converted_at DESC NULLS LAST, l.created_at DESC
      LIMIT 1;
      IF v_lead.id IS NULL THEN
        RAISE EXCEPTION 'A pessoa não tem lead aberta para converter.' USING ERRCODE = 'NG015';
      END IF;
      v_conversao := 'ja_convertida';
      v_client_id := v_lead.converted_to_client_id;
    END IF;
  END IF;

  -- Cliente já existente tem de ser desta organização (lido sob RLS).
  IF v_conversao = 'ja_convertida' THEN
    SELECT c.organization_id INTO v_client_org
    FROM public.anew_clients c
    WHERE c.id = v_client_id;
    IF v_client_org IS DISTINCT FROM v_neg.organization_id THEN
      RAISE EXCEPTION 'A conversão desta lead não é possível nesta organização.' USING ERRCODE = 'NG012';
    END IF;
  END IF;

  SELECT count(*)::int INTO v_outras
  FROM public.anew_leads l
  WHERE l.organization_id = v_neg.organization_id AND l.entity_id = v_neg.entity_id
    AND l.deleted_at IS NULL
    AND l.id IS DISTINCT FROM v_lead.id
    AND public.fn_neg_lead_aberta(l.status::text);

  -- 5. O rpc de conversão deixa a auditoria genérica desligada até ao fim da transacção.
  PERFORM set_config('app.audit_bypass', 'off', true);

  RETURN jsonb_build_object('mudou', v_mudou, 'estado', 'ganho', 'conversao', v_conversao,
                            'lead_id', v_lead.id, 'client_id', v_client_id,
                            'outras_leads_abertas', v_outras);
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_criar_negocio(uuid, uuid, uuid, text, text, uuid, jsonb, uuid, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.neg_ganhar_negocio(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_criar_negocio(uuid, uuid, uuid, text, text, uuid, jsonb, uuid, uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_ganhar_negocio(uuid, uuid, jsonb) TO authenticated, service_role;

-- CONFERIR
DO $$
DECLARE
  v_txt text;
BEGIN
  -- 1. funções novas: assinatura, INVOKER, search_path fixo, sem anon, com authenticated
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.neg_criar_negocio(uuid,uuid,uuid,text,text,uuid,jsonb,uuid,uuid,boolean)'),
              ('public.neg_ganhar_negocio(uuid,uuid,jsonb)')
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

  -- 2. funções existentes chamadas, iguais (md5 lidos a 19/10)
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.rpc_convert_lead_to_client(uuid,jsonb,uuid,uuid,uuid)', 'c03719b805fbdcda023efb53e7f2c8e8'),
              ('public.crm_scope_keys(text)',                                 '6abb12e1d7a3db943630e8f8d7e15ca8'),
              ('public.has_anew_permission(uuid,text)',                       '8f69ed134c7d20e080d8c5a4161a3151')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (2. funções existentes mudaram): %', v_txt;
  END IF;

  -- 3. a permissão leads.convert existe; tabelas usadas existem
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = 'leads.convert') THEN
    RAISE EXCEPTION 'CONFERIR (3. falta a permissão leads.convert)';
  END IF;
  v_txt := (SELECT string_agg(t, ',') FROM unnest(ARRAY[
              'negocios', 'negocio_workflow_config', 'proposals', 'client_contracts',
              'anew_leads', 'anew_clients']) AS t
            WHERE to_regclass('public.' || t) IS NULL);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (3. tabelas em falta): %', v_txt;
  END IF;
END;
$$;

COMMIT;
