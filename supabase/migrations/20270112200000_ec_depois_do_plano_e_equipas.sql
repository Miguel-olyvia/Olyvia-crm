-- 20270112200000 (Rúben, 9/11/2026):
--  1. «a encomenda a cliente só acontece depois do plano de obra estar aprovado»: fn_neg_emitir_ec_se_pronta só emite com o plano da obra
--     aprovado (ops_obra.estado_emylia->plano->estado); pago e com contrato, mas sem o plano aprovado, o negócio passa à Obra e a encomenda
--     espera. obra_guardar_negocio, ao gravar o plano aprovado, chama-a (emite se o pagamento já estiver validado).
--  2. as equipas de obra (neg_equipas_obra, neg_equipas_ler, neg_equipas_guardar).
-- As duas funções são as que estavam na base a 9/11, com as mudanças marcadas «20270112200000».

CREATE OR REPLACE FUNCTION public.fn_neg_emitir_ec_se_pronta(p_negocio uuid, p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_neg negocios; v_q quotes; v_c client_contracts; v_pago timestamptz; v_por text; v_autor uuid; v_nome text;
  v_nova boolean := false; v_ads jsonb := '[]'::jsonb; v_r jsonb; r record;
  v_modo text;  -- 29/10: modo de baixa de stock da organização
  v_plano_ok boolean; -- 20270112200000: o plano da obra aprovado (a encomenda de cliente só depois dele)
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_neg.anulado_em IS NOT NULL THEN
    RETURN jsonb_build_object('emitida', false, 'motivo', 'O negócio está anulado.');
  END IF;
  SELECT * INTO v_q FROM quotes WHERE negocio_id = p_negocio AND fluxo_emylia AND adenda_id IS NULL AND deleted_at IS NULL AND estado = 'aceite'
  ORDER BY versao DESC NULLS LAST LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('emitida', false, 'motivo', 'O negócio não tem orçamento aceite.');
  END IF;
  -- o pagamento validado da fatura da 1.ª prestação
  SELECT min(pg.validado_em) INTO v_pago
  FROM quote_prestacoes p
  JOIN faturas f ON f.quote_prestacao_id = p.id AND f.estado <> 'anulada'
  JOIN pagamentos pg ON pg.fatura_id = f.id AND pg.validado_em IS NOT NULL
  WHERE p.quote_id = v_q.id AND p.ordem = (SELECT min(p2.ordem) FROM quote_prestacoes p2 WHERE p2.quote_id = v_q.id);

  v_por := coalesce((SELECT coalesce(nullif(btrim(u.name), ''), u.email) FROM anew_users u WHERE u.id = p_user), 'Financeiro');
  v_autor := coalesce(p_user, v_q.created_by);
  SELECT * INTO v_c FROM client_contracts WHERE id = public.fn_neg_contrato_ec(p_negocio);

  -- 29/10: o modo de baixa de stock (sem linha = 'contract_signed', como os gatilhos do CRM). 'contract_signed': desconta da reserva
  -- FIFO e pede ao fornecedor o que falta; 'manual': nem desconta nem pede (só pela Saída para clientes); 'proposal_accepted' (antigo):
  -- só o pedido, como antes.
  SELECT s.stock_deduction_trigger INTO v_modo FROM organization_inventory_settings s WHERE s.organization_id = v_neg.organization_id;
  v_modo := coalesce(v_modo, 'contract_signed');

  -- 20270112200000 (Rúben, 9/11: «a encomenda a cliente só acontece depois do plano de obra estar aprovado»): o plano da obra do negócio
  -- aprovado pelas Operações (ou já em curso / concluído). A venda direta não tem obra: fica como estava.
  v_plano_ok := EXISTS (SELECT 1 FROM ops_obra o WHERE o.negocio_id = p_negocio
                         AND o.estado_emylia->'plano'->>'estado' IN ('aprovado', 'em curso', 'concluída'));

  IF v_pago IS NOT NULL AND v_c.id IS NULL AND v_q.venda_direta THEN
    -- venda direta: o contrato de suporte, como rpc_create_direct_sale_order (rascunho ligado ao orçamento aceite e promovido a assinado na
    -- mesma transação: os gatilhos AFTER UPDATE OF status reservam o stock e pedem ao fornecedor o que falta). Fica sem negócio (o CRM
    -- não liga contratos a um negócio que fecha na proposta nem a um negócio ganho) e já emitido (ec_emitida_em).
    -- 29/10: a baixa e o pedido ficam com esses gatilhos (respeitam o modo); não se chamam outra vez aqui.
    SELECT coalesce(nullif(btrim(e.fiscal_name), ''), e.display_name) INTO v_nome FROM anew_entities e WHERE e.id = v_neg.entity_id;
    INSERT INTO client_contracts (contract_number, entity_id, organization_id, root_organization_id, created_by, status, total_value, currency,
      start_date, notes, ec_emitida_em, ec_emitida_por)
    VALUES (NULL, v_neg.entity_id, v_neg.organization_id, coalesce(v_neg.root_organization_id, v_neg.organization_id), v_autor, 'draft',
      coalesce(v_q.total_com_iva, v_q.total, 0), 'EUR', current_date,
      'Encomenda de cliente da venda direta do negócio ' || coalesce(v_neg.numero::text, v_neg.id::text) || ' (Emylia: emitida ao validar o pagamento)',
      now(), v_por)
    RETURNING * INTO v_c;
    UPDATE client_contracts SET quote_id = v_q.id WHERE id = v_c.id;
    UPDATE client_contracts
       SET status = 'signed', signature_date = coalesce(v_q.accepted_at, now()), accepted_at = coalesce(v_q.accepted_at, now()),
           signed_by_name = coalesce(v_nome, 'Cliente'), status_changed_by = v_autor, status_changed_at = now()
     WHERE id = v_c.id
    RETURNING * INTO v_c;
    v_nova := true;
  ELSIF v_pago IS NOT NULL AND v_c.id IS NOT NULL AND v_c.ec_emitida_em IS NULL AND v_plano_ok THEN
    UPDATE client_contracts SET ec_emitida_em = now(), ec_emitida_por = v_por WHERE id = v_c.id RETURNING * INTO v_c;
    v_nova := true;
    -- 29/10: o que há em stock serve-se já (reserva FIFO, movimento 'venda'; idempotente por linha, nunca falha)
    IF v_modo = 'contract_signed' THEN
      PERFORM public.fn_contract_deduct_stock(v_c.id);
    END IF;
    -- o que falta pede-se ao fornecedor (como o gatilho do CRM faz na assinatura, aqui na emissão); nunca faz falhar a validação
    IF v_modo <> 'manual' THEN  -- 29/10
    BEGIN
      v_r := public.fn_client_order_request_missing(v_c.id, v_autor, NULL);
      INSERT INTO workflow_execution_log (source_entity, source_record_id, target_entity, target_record_id, action_type, status, execution_data)
      VALUES ('contract', v_c.id, 'purchase_order', NULL, 'negocio:ec_emitida', 'success', coalesce(v_r, '{}'::jsonb));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO workflow_execution_log (source_entity, source_record_id, target_entity, target_record_id, action_type, status, error_message, execution_data)
      VALUES ('contract', v_c.id, 'purchase_order', NULL, 'negocio:ec_emitida', 'error', SQLERRM, jsonb_build_object('sqlstate', SQLSTATE));
    END;
    END IF;
  END IF;

  -- 20270112200000: pago e com contrato, mas o plano por aprovar: o negócio passa à Obra (é lá que se aprova o plano) e a encomenda espera
  IF v_pago IS NOT NULL AND v_c.id IS NOT NULL AND v_c.ec_emitida_em IS NULL AND NOT v_plano_ok THEN
    IF coalesce(v_neg.fase, 0) < 5 THEN
      UPDATE negocios SET fase = 5 WHERE id = p_negocio;
    END IF;
    RETURN jsonb_build_object('emitida', false, 'aguarda_plano', true,
      'motivo', 'A encomenda de cliente emite-se quando o plano da obra for aprovado.');
  END IF;

  IF v_c.id IS NULL OR v_c.ec_emitida_em IS NULL THEN
    RETURN jsonb_build_object('emitida', false, 'motivo', CASE
      WHEN v_pago IS NULL THEN 'Falta a fatura registada e o pagamento validado da 1.ª prestação.'
      ELSE 'O contrato ainda não está assinado.' END);
  END IF;

  -- as adendas assinadas com a 1.ª parcela paga: a sua encomenda, depois da inicial (decisão B da Emylia)
  FOR r IN
    SELECT ca.id, a.referencia FROM adendas a JOIN client_contracts ca ON ca.adenda_id = a.id
    WHERE a.negocio_id = p_negocio AND ca.deleted_at IS NULL AND ca.replaced_by_contract_id IS NULL
      AND ca.status IN ('signed', 'assinado') AND ca.ec_emitida_em IS NULL
      AND EXISTS (SELECT 1 FROM quotes qa JOIN quote_prestacoes p ON p.quote_id = qa.id
                  JOIN faturas f ON f.quote_prestacao_id = p.id AND f.estado <> 'anulada'
                  JOIN pagamentos pg ON pg.fatura_id = f.id AND pg.validado_em IS NOT NULL
                  WHERE qa.adenda_id = a.id AND qa.deleted_at IS NULL AND p.ordem = 1)
    ORDER BY a.numero
  LOOP
    UPDATE client_contracts SET ec_emitida_em = now(), ec_emitida_por = v_por WHERE id = r.id;
    -- 29/10: a baixa da adenda, como a do contrato
    IF v_modo = 'contract_signed' THEN
      PERFORM public.fn_contract_deduct_stock(r.id);
    END IF;
    IF v_modo <> 'manual' THEN  -- 29/10
    BEGIN
      v_r := public.fn_client_order_request_missing(r.id, v_autor, NULL);
      INSERT INTO workflow_execution_log (source_entity, source_record_id, target_entity, target_record_id, action_type, status, execution_data)
      VALUES ('contract', r.id, 'purchase_order', NULL, 'negocio:ec_emitida', 'success', coalesce(v_r, '{}'::jsonb));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO workflow_execution_log (source_entity, source_record_id, target_entity, target_record_id, action_type, status, error_message, execution_data)
      VALUES ('contract', r.id, 'purchase_order', NULL, 'negocio:ec_emitida', 'error', SQLERRM, jsonb_build_object('sqlstate', SQLSTATE));
    END;
    END IF;
    v_ads := v_ads || jsonb_build_object('referencia', r.referencia, 'contract_id', r.id,
      'order_number', (SELECT order_number FROM client_contracts WHERE id = r.id));
  END LOOP;

  -- a encomenda emitida põe o negócio na Obra
  IF coalesce(v_neg.fase, 0) < 5 THEN
    UPDATE negocios SET fase = 5 WHERE id = p_negocio;
  END IF;

  RETURN jsonb_build_object('emitida', true, 'nova', v_nova, 'contract_id', v_c.id, 'order_number', v_c.order_number,
    'emitida_em', v_c.ec_emitida_em, 'adendas', v_ads);
END $function$;

CREATE OR REPLACE FUNCTION public.obra_guardar_negocio(p_org uuid, p_negocio_id uuid, p_obra jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- 20270102220000: o código antigo do papel da obra deu lugar a negocios.obra.planear (o Gestor de obra) e negocios.obra.executar (o técnico)
  v_user uuid := public.fn_cat_exigir_uma(p_org, ARRAY['pessoas.edit', 'negocios.obra.planear', 'negocios.obra.executar']);
  v_existe boolean; v_planear boolean; v_executar boolean; v_eu uuid; v_porque text; s record;
  v_neg negocios; v_obra ops_obra; v_codigo text; v_estado text; v_plano boolean; v_inicio date;
  t jsonb; v_chave text; v_nome text; v_fase uuid; v_tar uuid; v_skill uuid; v_skill_nome text; v_pessoa uuid; v_tarestado text; v_pessoas smallint;
  v_chaves text[] := '{}'; v_avisos text[] := '{}';
  v_imp_a jsonb; v_imp_d jsonb; v_auto_a jsonb; v_auto_d jsonb; -- 20270105200000
  v_so boolean; -- 20270111100000
  v_ec jsonb; -- 20270112200000
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio_id AND organization_id = p_org AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negócio não encontrado nesta organização.' USING ERRCODE = 'NE003'; END IF;
  -- 20270110400000: o âmbito de pessoas.edit sobre o negócio (dono = assigned_to/created_by; TEAM/ORG pelas chaves). Mantêm o acesso
  -- de antes: admin, quem entra sem pessoas.edit no perfil (Papel no Negócio, obra.planear/executar) ou tem um Papel no Negócio
  -- que dá pessoas.edit, e quem tem tarefas na obra deste negócio (fn_neg_no_ambito).
  IF NOT public.fn_neg_no_ambito(v_neg, 'pessoas.edit') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit): este negócio está fora do seu âmbito.' USING ERRCODE = 'CT001';
  END IF;
  IF p_obra IS NULL OR jsonb_typeof(p_obra) <> 'object' THEN RAISE EXCEPTION 'A obra tem de ser um objeto.' USING ERRCODE = 'CT002'; END IF;
  v_plano := coalesce(jsonb_typeof(p_obra->'tarefas') = 'array', false);
  v_estado := coalesce(nullif(p_obra->>'estado', ''), 'planeada');
  IF v_estado NOT IN ('planeada', 'em_curso', 'suspensa', 'concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Estado da obra inválido: %.', v_estado USING ERRCODE = 'CT002';
  END IF;
  BEGIN
    v_inicio := nullif(p_obra->>'inicio', '')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Data de início inválida: %.', p_obra->>'inicio' USING ERRCODE = 'CT002';
  END;

  SELECT * INTO v_obra FROM ops_obra WHERE negocio_id = p_negocio_id AND organization_id = p_org FOR UPDATE;
  v_existe := FOUND;
  -- 20270111100000: quem lê as obras reduzidas (sem pessoas.view, com negocios.obra.executar) só grava as obras que recebe
  -- (fn_neg_ids_do_tecnico), só como execução (nunca pelo ramo de planear: a leitura dele não tem o orçamento) e com o que a leitura
  -- tirou reposto da base antes de tudo (custos reais, a cópia da encomenda, preços dos materiais, €/h dos registos gravados).
  v_so := public.fn_neg_so_execucao(p_org, 'pessoas.view');
  IF v_so THEN
    IF NOT (p_negocio_id = ANY (public.fn_neg_ids_do_tecnico(p_org))) THEN
      RAISE EXCEPTION 'Sem permissão (pessoas.view): esta obra não tem tarefas nem visitas suas.' USING ERRCODE = 'CT001';
    END IF;
    IF v_existe AND jsonb_typeof(p_obra->'emylia') = 'object' THEN
      p_obra := jsonb_set(p_obra, '{emylia}', public.fn_obra_emylia_repor_valores(v_obra.estado_emylia, p_obra->'emylia'));
    END IF;
  END IF;
  -- 20270112150000: a leitura completa (obra_ler_negocios) tira os custos sem fn_quote_custos_pode e o €/h sem
  -- hr.pessoas.retribuicao.view: repõe-se da base o que chegou a null ou não chegou, antes das regras de execução e do €/h do servidor.
  IF NOT v_so AND v_existe AND jsonb_typeof(p_obra->'emylia') = 'object' THEN
    IF NOT public.fn_quote_custos_pode(p_org) THEN
      p_obra := jsonb_set(p_obra, '{emylia}', public.fn_obra_emylia_repor_custos(v_obra.estado_emylia, p_obra->'emylia'));
    ELSIF NOT (public.is_system_admin_user(auth.uid())
               OR public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.retribuicao.view', p_org)) THEN
      p_obra := jsonb_set(p_obra, '{emylia}', public.fn_obra_emylia_repor_tarefas(v_obra.estado_emylia, p_obra->'emylia'));
    END IF;
  END IF;
  -- 20270111200000: o €/h dos registos de horas novos é o do servidor (fn_obra_emylia_ch_servidor: a pessoa da tarefa,
  -- fn_rh_custo_hora_pessoa); os gravados ficam com o deles. Para todos os que gravam; gravar sem mudanças não muda nada.
  IF jsonb_typeof(p_obra->'emylia') = 'object' THEN
    p_obra := jsonb_set(p_obra, '{emylia}', public.fn_obra_emylia_ch_servidor(p_org, CASE WHEN v_existe THEN v_obra.id END,
                                                                               CASE WHEN v_existe THEN v_obra.estado_emylia END, p_obra->'emylia'));
  END IF;

  -- 20270102220000: sem negocios.obra.planear, compara-se a obra gravada com a nova e só passa o que é de quem executa: as tarefas
  -- atribuídas a ele (ops_obra_tarefa_rh; no estado da Emylia, tasks[i].tec), marcadas em curso ou feitas, com os registos, as
  -- fotografias, as notas e os imprevistos delas (fn_obra_execucao_permitida). Gravar sem mudanças passa sempre. O plano, o estado da
  -- obra, o cancelamento, a atribuição dos técnicos, a validação e as tarefas novas ou apagadas são do Gestor de obra.
  v_planear := public.fn_cat_pode(p_org, 'negocios.obra.planear') AND NOT v_so; -- 20270111100000
  IF NOT v_planear AND NOT v_existe THEN
    -- a obra nasce do orçamento (o plano gerado, por aprovar, sem nada feito): quem grava o negócio pode criá-la
    IF v_plano AND (v_estado <> 'planeada' OR NOT public.fn_cat_pode(p_org, 'pessoas.edit')
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_obra->'tarefas') x WHERE coalesce(nullif(x->>'estado', ''), 'por_fazer') <> 'por_fazer')) THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): só o Gestor de obra cria uma obra que já não está só planeada.' USING ERRCODE = 'CT001';
    END IF;
  ELSIF NOT v_planear THEN
    v_executar := public.fn_cat_pode(p_org, 'negocios.obra.executar');
    v_eu := CASE WHEN v_executar THEN public.fn_neg_pessoa_da_conta(p_org) END;
    IF NOT v_plano OR v_estado IS DISTINCT FROM v_obra.estado THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode mudar o estado da obra nem cancelá-la.' USING ERRCODE = 'CT001';
    END IF;
    IF (SELECT coalesce(array_agg(t.chave ORDER BY t.chave), '{}') FROM ops_obra_tarefa t WHERE t.obra_id = v_obra.id)
       IS DISTINCT FROM (SELECT coalesce(array_agg(btrim(x->>'chave') ORDER BY btrim(x->>'chave')), '{}') FROM jsonb_array_elements(p_obra->'tarefas') x) THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode juntar nem tirar tarefas do plano.' USING ERRCODE = 'CT001';
    END IF;
    FOR s IN SELECT t.chave, t.nome, t.estado, (SELECT r.pessoa_id FROM ops_obra_tarefa_rh r WHERE r.tarefa_id = t.id LIMIT 1) AS pessoa,
                    CASE WHEN coalesce(nullif(x->>'estado', ''), 'por_fazer') IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada')
                         THEN coalesce(nullif(x->>'estado', ''), 'por_fazer') ELSE 'por_fazer' END AS novo,
                    CASE WHEN coalesce(x->>'pessoa', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (x->>'pessoa')::uuid END AS nova_pessoa
             FROM ops_obra_tarefa t JOIN jsonb_array_elements(p_obra->'tarefas') x ON btrim(x->>'chave') = t.chave
             WHERE t.obra_id = v_obra.id LOOP
      IF s.nova_pessoa IS DISTINCT FROM s.pessoa THEN
        RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode mudar o técnico da tarefa %.', s.nome USING ERRCODE = 'CT001';
      END IF;
      IF s.novo IS DISTINCT FROM s.estado AND NOT (v_eu IS NOT NULL AND s.pessoa = v_eu AND s.estado <> 'validada' AND s.novo IN ('em_curso', 'feita')) THEN
        -- 20270105500000: sem negocios.obra.executar a falta é essa (não a do Gestor de obra); a regra não muda, só a mensagem
        IF NOT coalesce(v_executar, false) THEN
          RAISE EXCEPTION 'Sem permissão (negocios.obra.executar): não pode marcar a tarefa % em curso ou feita.', s.nome
            USING ERRCODE = 'CT001';
        END IF;
        RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): na tarefa % só quem a tem atribuída a marca em curso ou feita; validar e pedir correção é do Gestor de obra.', s.nome
          USING ERRCODE = 'CT001';
      END IF;
    END LOOP;
    v_porque := public.fn_obra_execucao_permitida(v_obra.estado_emylia, p_obra->'emylia', v_eu);
    IF v_porque IS NOT NULL THEN
      -- 20270105700000: sem negocios.obra.executar o que falta é ela (não planear)
      RAISE EXCEPTION 'Sem permissão (%): não pode mudar %; só regista a execução das tarefas atribuídas a si.',
        CASE WHEN v_executar THEN 'negocios.obra.planear' ELSE 'negocios.obra.executar' END, v_porque USING ERRCODE = 'CT001';
    END IF;
    -- grava só a execução: o estado da Emylia e o estado das tarefas dele; o resto da projeção (datas, nomes, técnicos) fica o da base
    UPDATE ops_obra SET estado_emylia = p_obra->'emylia', atualizada_em = now()
    WHERE id = v_obra.id AND estado_emylia IS DISTINCT FROM p_obra->'emylia';
    UPDATE ops_obra_tarefa t SET estado = x.novo, atualizada_em = now()
    FROM (SELECT btrim(y->>'chave') AS chave, CASE WHEN coalesce(nullif(y->>'estado', ''), 'por_fazer') IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada')
                         THEN coalesce(nullif(y->>'estado', ''), 'por_fazer') ELSE 'por_fazer' END AS novo FROM jsonb_array_elements(p_obra->'tarefas') y) x
    WHERE t.obra_id = v_obra.id AND t.chave = x.chave AND t.estado IS DISTINCT FROM x.novo;
    RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', '[]'::jsonb);
  END IF;

  -- 20270105200000: daqui para baixo grava quem planeia (ou quem cria a obra só planeada). Por cima disso:
  --   negocios.obra.imprevistos  mudar ou tirar um imprevisto já gravado (propor ao cliente, decidir, fechar). Registar um novo (no fim da
  --                              lista) não a pede: é da execução (fn_obra_execucao_permitida) ou do planeamento.
  --   negocios.obra.fechar       a obra passar a concluída, ou o auto de receção mudar (enviá-lo). A assinatura do auto que o cliente fez no
  --                              portal (negocio_rececao_cliente com o mesmo número) passa sem ela: é o espelho do que já está na base.
  v_imp_a := public.fn_neg_lista(CASE WHEN v_existe THEN v_obra.estado_emylia->'imprevistos' END);
  v_imp_d := public.fn_neg_lista(p_obra->'emylia'->'imprevistos');
  IF (jsonb_array_length(v_imp_d) < jsonb_array_length(v_imp_a)
      OR EXISTS (SELECT 1 FROM generate_series(0, jsonb_array_length(v_imp_a) - 1) i WHERE (v_imp_d->i) IS DISTINCT FROM (v_imp_a->i)))
     AND NOT public.fn_cat_pode(p_org, 'negocios.obra.imprevistos') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.obra.imprevistos): não pode propor nem decidir os imprevistos da obra.' USING ERRCODE = 'CT001';
  END IF;
  v_auto_a := CASE WHEN v_existe AND jsonb_typeof(v_obra.estado_emylia->'auto') = 'object' THEN v_obra.estado_emylia->'auto' END;
  v_auto_d := CASE WHEN jsonb_typeof(p_obra->'emylia'->'auto') = 'object' THEN p_obra->'emylia'->'auto' END;
  IF ((v_estado = 'concluida' AND (NOT v_existe OR v_obra.estado IS DISTINCT FROM 'concluida'))
      OR (v_auto_d IS DISTINCT FROM v_auto_a
          AND NOT (v_auto_a->>'estado' = 'por assinar' AND v_auto_d->>'estado' = 'assinado' AND v_auto_d->>'n' = v_auto_a->>'n'
                   AND (v_auto_d - ARRAY['estado', 'assinado', 'assinatura', 'reservas']) = (v_auto_a - ARRAY['estado', 'assinado', 'assinatura', 'reservas'])
                   AND EXISTS (SELECT 1 FROM negocio_rececao_cliente r WHERE r.negocio_id = p_negocio_id AND r.auto_n = v_auto_d->>'n'))))
     AND NOT public.fn_cat_pode(p_org, 'negocios.obra.fechar') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.obra.fechar): não pode encerrar a obra nem enviar o auto de receção.' USING ERRCODE = 'CT001';
  END IF;

  IF NOT v_existe THEN
    IF NOT v_plano THEN RETURN jsonb_build_object('obra_id', NULL, 'codigo', NULL, 'avisos', '[]'::jsonb); END IF;
    v_codigo := 'OB-' || coalesce(v_neg.numero::text, left(p_negocio_id::text, 8));
    IF EXISTS (SELECT 1 FROM ops_obra WHERE organization_id = p_org AND codigo = v_codigo) THEN
      v_codigo := v_codigo || '-' || left(replace(gen_random_uuid()::text, '-', ''), 4);
    END IF;
    INSERT INTO ops_obra (organization_id, codigo, negocio_id, titulo, morada, estado, data_inicio_prevista, criada_por, estado_emylia,
                          iniciada_em, concluida_em)
    VALUES (p_org, v_codigo, p_negocio_id,
            coalesce(nullif(btrim(p_obra->>'titulo'), ''), nullif(btrim(v_neg.titulo), ''), 'Obra ' || v_codigo),
            nullif(btrim(coalesce(p_obra->>'morada', '')), ''), v_estado, v_inicio, v_user, p_obra->'emylia',
            CASE WHEN v_estado IN ('em_curso', 'concluida') THEN now() END, CASE WHEN v_estado = 'concluida' THEN now() END)
    RETURNING * INTO v_obra;
  ELSE
    UPDATE ops_obra SET
      titulo = coalesce(nullif(btrim(p_obra->>'titulo'), ''), titulo),
      morada = coalesce(nullif(btrim(coalesce(p_obra->>'morada', '')), ''), morada),
      estado = CASE WHEN v_plano THEN v_estado ELSE 'cancelada' END,
      data_inicio_prevista = coalesce(v_inicio, data_inicio_prevista),
      iniciada_em = CASE WHEN v_estado IN ('em_curso', 'concluida') THEN coalesce(iniciada_em, now()) ELSE iniciada_em END,
      concluida_em = CASE WHEN v_estado = 'concluida' THEN coalesce(concluida_em, now()) ELSE concluida_em END,
      estado_emylia = p_obra->'emylia',
      atualizada_em = now()
    WHERE id = v_obra.id
    RETURNING * INTO v_obra;
  END IF;

  IF NOT v_plano THEN
    DELETE FROM ops_obra_tarefa_rh WHERE obra_id = v_obra.id;
    RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', '[]'::jsonb);
  END IF;

  -- as fases: as que o motor manda e as que as tarefas usam
  INSERT INTO ops_obra_fase (organization_id, obra_id, ordem, nome)
  SELECT p_org, v_obra.id, f.ordem, coalesce(max(f.nome), 'Fase ' || f.ordem)
  FROM (
    SELECT (x->>'ordem')::smallint AS ordem, nullif(btrim(x->>'nome'), '') AS nome
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_obra->'fases') = 'array' THEN p_obra->'fases' ELSE '[]'::jsonb END) x
    UNION ALL
    SELECT coalesce((x->>'fase')::smallint, 0), NULL FROM jsonb_array_elements(p_obra->'tarefas') x
  ) f
  GROUP BY f.ordem
  ON CONFLICT (obra_id, ordem) DO UPDATE SET nome = EXCLUDED.nome WHERE ops_obra_fase.nome IS DISTINCT FROM EXCLUDED.nome;

  FOR t IN SELECT x FROM jsonb_array_elements(p_obra->'tarefas') x LOOP
    v_chave := nullif(btrim(coalesce(t->>'chave', '')), '');
    v_nome := nullif(btrim(coalesce(t->>'nome', '')), '');
    IF v_chave IS NULL OR v_nome IS NULL THEN RAISE EXCEPTION 'Cada tarefa precisa de chave e nome.' USING ERRCODE = 'CT002'; END IF;
    IF v_chave = ANY (v_chaves) THEN RAISE EXCEPTION 'Tarefa repetida: %.', v_chave USING ERRCODE = 'CT002'; END IF;
    v_chaves := v_chaves || v_chave;

    v_skill := NULL; v_skill_nome := NULL;
    IF nullif(t->>'perfil', '') IS NOT NULL THEN
      SELECT k.id, k.nome INTO v_skill, v_skill_nome FROM ops_skill k
      WHERE k.organization_id = p_org AND (k.chave = t->>'perfil' OR k.id::text = t->>'perfil') LIMIT 1;
    END IF;
    SELECT id INTO v_fase FROM ops_obra_fase WHERE obra_id = v_obra.id AND ordem = coalesce((t->>'fase')::smallint, 0);
    v_tarestado := coalesce(nullif(t->>'estado', ''), 'por_fazer');
    IF v_tarestado NOT IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada') THEN v_tarestado := 'por_fazer'; END IF;
    v_pessoas := least(20, greatest(1, coalesce((t->>'pessoas')::int, 1)));

    v_tar := NULL;
    SELECT id INTO v_tar FROM ops_obra_tarefa WHERE obra_id = v_obra.id AND chave = v_chave;
    IF v_tar IS NULL THEN
      INSERT INTO ops_obra_tarefa (organization_id, obra_id, fase_id, ordem, nome, minutos_previstos, inicio_planeado, fim_planeado,
                                   estado, skill_id, chave, pessoas_previstas)
      VALUES (p_org, v_obra.id, v_fase, coalesce((t->>'ordem')::int, 0), v_nome, greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
              nullif(t->>'inicio', '')::date, nullif(t->>'fim', '')::date, v_tarestado, v_skill, v_chave, v_pessoas)
      RETURNING id INTO v_tar;
    ELSE
      UPDATE ops_obra_tarefa SET fase_id = v_fase, ordem = coalesce((t->>'ordem')::int, 0), nome = v_nome,
        minutos_previstos = greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
        inicio_planeado = nullif(t->>'inicio', '')::date, fim_planeado = nullif(t->>'fim', '')::date,
        estado = v_tarestado, skill_id = v_skill, pessoas_previstas = v_pessoas, atualizada_em = now()
      WHERE id = v_tar
        AND (fase_id, ordem, nome, minutos_previstos, inicio_planeado, fim_planeado, estado, skill_id, pessoas_previstas) IS DISTINCT FROM
            (v_fase, coalesce((t->>'ordem')::int, 0), v_nome, greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
             nullif(t->>'inicio', '')::date, nullif(t->>'fim', '')::date, v_tarestado, v_skill, v_pessoas);
    END IF;

    -- quem a faz: só uma pessoa do RH desta organização
    v_pessoa := NULL;
    IF coalesce(t->>'pessoa', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT p.id INTO v_pessoa FROM pessoas p WHERE p.id = (t->>'pessoa')::uuid AND p.organization_id = p_org AND p.deleted_at IS NULL;
      IF v_pessoa IS NULL THEN
        v_avisos := v_avisos || format('%s: o técnico não é uma pessoa do RH desta organização. Ficou por atribuir.', v_nome);
      ELSIF NOT public.fn_rh_pessoa_tecnico_obra(p_org, v_pessoa) THEN -- 20270110600000: cargo ou perfil
        v_avisos := v_avisos || format('%s: a pessoa atribuída não tem cargo técnico de obra no RH nem o perfil de técnico de obra.', v_nome);
      ELSIF v_skill IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fn_rh_oficios_efetivos(p_org, v_pessoa) o WHERE o.skill_id = v_skill) THEN
        v_avisos := v_avisos || format('%s: a pessoa atribuída não tem o ofício %s no RH.', v_nome, v_skill_nome);
      END IF;
    END IF;
    DELETE FROM ops_obra_tarefa_rh WHERE tarefa_id = v_tar AND pessoa_id IS DISTINCT FROM v_pessoa;
    IF v_pessoa IS NOT NULL THEN
      INSERT INTO ops_obra_tarefa_rh (organization_id, obra_id, tarefa_id, pessoa_id, atribuida_por)
      VALUES (p_org, v_obra.id, v_tar, v_pessoa, v_user)
      ON CONFLICT (tarefa_id, pessoa_id) DO NOTHING;
    END IF;
  END LOOP;

  -- o que saiu do plano sai da projeção (as fases só se nenhuma tarefa as usar)
  DELETE FROM ops_obra_tarefa WHERE obra_id = v_obra.id AND (chave IS NULL OR NOT (chave = ANY (v_chaves)));
  DELETE FROM ops_obra_fase f WHERE f.obra_id = v_obra.id AND NOT EXISTS (SELECT 1 FROM ops_obra_tarefa x WHERE x.fase_id = f.id);

  -- 20270112200000: com o plano aprovado (ou já em curso), a encomenda de cliente emite-se agora, se o pagamento já estiver validado
  -- (fn_neg_emitir_ec_se_pronta é idempotente e diz porque não emitiu). Nunca faz falhar a gravação da obra.
  IF (p_obra->'emylia'->'plano'->>'estado') IN ('aprovado', 'em curso') THEN
    BEGIN
      v_ec := public.fn_neg_emitir_ec_se_pronta(p_negocio_id, v_user);
    EXCEPTION WHEN OTHERS THEN
      v_avisos := v_avisos || format('A encomenda de cliente não foi emitida: %s', SQLERRM);
    END;
  END IF;

  RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', to_jsonb(v_avisos), 'ec', v_ec);
END $function$;


-- ------------------------------------------------------------------ as equipas de obra (Rúben, 9/11)
-- «temos de ter técnicos isolados e técnicos associados a equipas (ou vem toda a equipa, ou não vem nenhum membro), e ter uma área onde
-- podemos gerir isto». Uma equipa é um nome e as pessoas do RH (técnicos de obra) que vão sempre juntas. Quem não está em nenhuma é isolado.
-- O plano da obra (src/emylia/preparacaoObra.ts) escolhe a equipa inteira para as tarefas dos ofícios dela, ou nenhum membro.
CREATE TABLE IF NOT EXISTS public.neg_equipas_obra (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  nome            text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 80),
  membros         uuid[] NOT NULL DEFAULT '{}',
  ativa           boolean NOT NULL DEFAULT true,
  criada_em       timestamptz NOT NULL DEFAULT now(),
  atualizada_em   timestamptz NOT NULL DEFAULT now(),
  atualizada_por  uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  UNIQUE (organization_id, nome)
);
COMMENT ON TABLE public.neg_equipas_obra IS 'Equipas de obra: técnicos do RH que vão sempre juntos (20270112200000). Escreve-a só neg_equipas_guardar.';
CREATE INDEX IF NOT EXISTS neg_equipas_obra_org ON public.neg_equipas_obra (organization_id);

ALTER TABLE public.neg_equipas_obra ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.neg_equipas_obra FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.neg_equipas_obra TO authenticated;
GRANT ALL ON public.neg_equipas_obra TO service_role;
DROP POLICY IF EXISTS neg_equipas_obra_select ON public.neg_equipas_obra;
CREATE POLICY neg_equipas_obra_select ON public.neg_equipas_obra AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.fn_cat_pode(organization_id, 'pessoas.view'));
DROP POLICY IF EXISTS neg_equipas_obra_no_insert ON public.neg_equipas_obra;
CREATE POLICY neg_equipas_obra_no_insert ON public.neg_equipas_obra AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS neg_equipas_obra_no_update ON public.neg_equipas_obra;
CREATE POLICY neg_equipas_obra_no_update ON public.neg_equipas_obra AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS neg_equipas_obra_no_delete ON public.neg_equipas_obra;
CREATE POLICY neg_equipas_obra_no_delete ON public.neg_equipas_obra AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- ler: quem vê os negócios
CREATE OR REPLACE FUNCTION public.neg_equipas_ler(p_org uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'membros', to_jsonb(e.membros), 'ativa', e.ativa) ORDER BY e.nome)
    FROM public.neg_equipas_obra e WHERE e.organization_id = p_org), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.neg_equipas_ler(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_equipas_ler(uuid) TO authenticated, service_role;

-- gravar (a lista inteira): quem planeia as obras (negocios.obra.planear) ou edita as pessoas. Os membros têm de ser pessoas do RH desta
-- organização; uma pessoa só pode estar numa equipa ativa.
CREATE OR REPLACE FUNCTION public.neg_equipas_guardar(p_org uuid, p_equipas jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid; e jsonb; v_ids uuid[] := '{}'; v_id uuid; v_membros uuid[]; v_todos uuid[] := '{}';
BEGIN
  IF p_org IS NULL OR p_equipas IS NULL OR jsonb_typeof(p_equipas) <> 'array' OR jsonb_array_length(p_equipas) > 200 THEN
    RAISE EXCEPTION 'Equipas inválidas.' USING ERRCODE = 'NG009';
  END IF;
  v_user := public.fn_cat_exigir_uma(p_org, ARRAY['negocios.obra.planear', 'pessoas.edit']);
  FOR e IN SELECT x FROM jsonb_array_elements(p_equipas) x LOOP
    IF length(btrim(coalesce(e->>'nome', ''))) = 0 THEN RAISE EXCEPTION 'Cada equipa precisa de nome.' USING ERRCODE = 'NG009'; END IF;
    SELECT coalesce(array_agg(DISTINCT p.id), '{}') INTO v_membros
      FROM jsonb_array_elements_text(coalesce(e->'membros', '[]'::jsonb)) m
      JOIN public.pessoas p ON p.id::text = m AND p.organization_id = p_org AND p.deleted_at IS NULL;
    IF coalesce((e->>'ativa')::boolean, true) THEN
      IF v_todos && v_membros THEN RAISE EXCEPTION 'Uma pessoa só pode estar numa equipa (%).', e->>'nome' USING ERRCODE = 'NG009'; END IF;
      v_todos := v_todos || v_membros;
    END IF;
    v_id := CASE WHEN coalesce(e->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (e->>'id')::uuid END;
    INSERT INTO public.neg_equipas_obra AS q (id, organization_id, nome, membros, ativa, atualizada_em, atualizada_por)
    VALUES (coalesce(v_id, gen_random_uuid()), p_org, btrim(e->>'nome'), v_membros, coalesce((e->>'ativa')::boolean, true), now(), v_user)
    ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, membros = EXCLUDED.membros, ativa = EXCLUDED.ativa, atualizada_em = now(), atualizada_por = v_user
      WHERE q.organization_id = p_org
    RETURNING q.id INTO v_id;
    v_ids := v_ids || v_id;
  END LOOP;
  DELETE FROM public.neg_equipas_obra WHERE organization_id = p_org AND NOT (id = ANY (v_ids));
  RETURN public.neg_equipas_ler(p_org);
END $$;
REVOKE ALL ON FUNCTION public.neg_equipas_guardar(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_equipas_guardar(uuid, jsonb) TO authenticated, service_role;
