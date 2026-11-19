-- Ponto 2 (19/11/2026): os bloqueios das parcelas do contrato também no servidor.
-- Até aqui só o ecrã (src/emylia/parcelas.ts, commit 22e1fb4a) impedia arrancar a obra sem a parcela do arranque paga e enviar o auto
-- de receção sem as parcelas todas pagas; obra_guardar_negocio aceitava ambos.
-- obra_guardar_negocio e neg_vista_cliente_guardar recriadas a partir da definição viva do ramo RH
-- (md5 2ee287cdf2a4d6fec321b17407eb0fee e 483efb49d855a59f15269c1a3d04e320). Sem tabelas nem colunas novas.

-- As parcelas do contrato por pagar. Mesmas regras de src/emylia/parcelas.ts: a 1.ª é a do início; a última (havendo mais de uma) é
-- a do fim; uma do meio com o marco 'adjudicacao'/'antes' é a do arranque. Paga = fatura não anulada com o pagamento validado (como
-- fn_neg_emitir_ec_se_pronta). p_so_arranque: só as do arranque (seguram «Arrancar a obra»); senão todas (seguram o auto de receção).
CREATE OR REPLACE FUNCTION public.fn_neg_parcelas_por_pagar(p_negocio uuid, p_so_arranque boolean)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH q AS (
    SELECT id FROM quotes
    WHERE negocio_id = p_negocio AND fluxo_emylia AND adenda_id IS NULL AND deleted_at IS NULL AND estado = 'aceite'
    ORDER BY versao DESC NULLS LAST LIMIT 1
  ), p AS (
    SELECT qp.*, min(qp.ordem) OVER () AS mn, max(qp.ordem) OVER () AS mx
    FROM quote_prestacoes qp WHERE qp.quote_id = (SELECT id FROM q)
  ), x AS (
    SELECT p.ordem, f.numero,
           coalesce(f.estado = 'paga' OR EXISTS (SELECT 1 FROM pagamentos pg WHERE pg.fatura_id = f.id AND pg.validado_em IS NOT NULL), false) AS paga,
           (p.ordem <> p.mn AND p.ordem <> p.mx AND p.marco IN ('adjudicacao', 'antes')) AS arranque,
           CASE WHEN p.ordem = p.mn THEN 'a 1.ª parcela'
                WHEN p.ordem = p.mx THEN 'a parcela final'
                WHEN p.marco IN ('adjudicacao', 'antes') THEN 'a parcela do arranque'
                ELSE 'a parcela «' || lower(p.rotulo) || '»' END
             || ' (' || replace(trim_scale(round(p.pct * 100, 2))::text, '.', ',') || '%)' AS nome
    FROM p
    LEFT JOIN LATERAL (SELECT f.id, f.numero, f.estado FROM faturas f
                       WHERE f.quote_prestacao_id = p.id AND f.estado <> 'anulada'
                       ORDER BY f.emitida_em DESC LIMIT 1) f ON true
  )
  SELECT coalesce(array_agg(CASE WHEN x.numero IS NOT NULL THEN 'receber o pagamento da ' || x.numero || ' (' || x.nome || ')'
                                 ELSE 'faturar e receber ' || x.nome END ORDER BY x.ordem), '{}')
  FROM x WHERE NOT x.paga AND (NOT p_so_arranque OR x.arranque);
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_parcelas_por_pagar(uuid, boolean) FROM PUBLIC, anon, authenticated;

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
  v_falta text[]; -- 20270122900000
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

  -- 20270117830000 (12/11, Rúben: «a validação do plano da obra só vem depois do Financeiro»; a mesma regra do ecrã,
  --   medidasEPlanoAbertos): o plano só passa a aprovado (ou em curso, ou concluída) com o pagamento da 1.ª prestação validado, a
  --   encomenda emitida ou uma venda direta aceite. Gerar e gravar o plano por aprovar continua antes do pagamento. Lê o estado já
  --   reposto acima (o que fica gravado) e vem antes de qualquer escrita; um plano que já estava aprovado não se volta a verificar.
  IF (p_obra->'emylia'->'plano'->>'estado') IN ('aprovado', 'em curso', 'concluída')
     AND coalesce(CASE WHEN v_existe THEN v_obra.estado_emylia->'plano'->>'estado' END, '') NOT IN ('aprovado', 'em curso', 'concluída')
     AND NOT public.fn_neg_medidas_e_plano_abertos(p_negocio_id) THEN
    RAISE EXCEPTION 'O plano da obra só se aprova depois de o Financeiro validar o pagamento.' USING ERRCODE = 'NE013';
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

  -- 20270122900000 (19/11, Rúben): as parcelas do contrato seguram a obra também no servidor (o ecrã já o fazia: parcelas.ts).
  --   Arrancar a obra (a 1.ª vez que passa a em curso): com a parcela do arranque paga e validada.
  --   O auto de receção novo (enviá-lo ao cliente): com todas as parcelas pagas e validadas.
  IF v_estado IN ('em_curso', 'concluida') AND (NOT v_existe OR v_obra.iniciada_em IS NULL) THEN
    v_falta := public.fn_neg_parcelas_por_pagar(p_negocio_id, true);
    IF cardinality(v_falta) > 0 THEN
      RAISE EXCEPTION 'A obra ainda não pode arrancar: falta %.', array_to_string(v_falta, ', ') USING ERRCODE = 'CT002';
    END IF;
  END IF;
  IF v_auto_d IS NOT NULL AND (v_auto_a IS NULL OR (v_auto_d->>'n') IS DISTINCT FROM (v_auto_a->>'n')) THEN
    v_falta := public.fn_neg_parcelas_por_pagar(p_negocio_id, false);
    IF cardinality(v_falta) > 0 THEN
      RAISE EXCEPTION 'Ainda não há auto de receção: primeiro a fatura final paga. Falta %.', array_to_string(v_falta, ', ') USING ERRCODE = 'CT002';
    END IF;
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

CREATE OR REPLACE FUNCTION public.neg_vista_cliente_guardar(p_org uuid, p_negocio_id uuid, p_vista jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_marca text;
  v_n     integer;
  v_velha jsonb;
BEGIN
  -- 20270111100000: a vista do cliente é publicada por quem lê o negócio inteiro; com a leitura reduzida (sem pessoas.view, com
  -- negocios.obra.executar) a vista sairia sem a proposta, o contrato e os pagamentos
  IF p_org IS NOT NULL AND public.fn_neg_so_execucao(p_org, 'pessoas.view') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view): a vista do cliente é publicada por quem vê o negócio inteiro.' USING ERRCODE = 'CT001';
  END IF;
  IF p_org IS NULL OR p_negocio_id IS NULL
     OR NOT (public.fn_cat_pode(p_org, 'pessoas.edit') OR public.fn_cat_pode(p_org, 'negocios.obra.planear') OR public.fn_cat_pode(p_org, 'negocios.obra.executar')) THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit ou negocios.obra).' USING ERRCODE = 'CT001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.negocios n WHERE n.id = p_negocio_id AND n.organization_id = p_org AND n.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit ou negocios.obra).' USING ERRCODE = 'CT001';
  END IF;
  -- 20270112210000: só num negócio do seu âmbito (só-executar: as obras onde trabalha; senão o âmbito de pessoas.edit)
  IF NOT public.fn_neg_negocio_no_ambito(p_org, p_negocio_id, 'pessoas.edit') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit ou negocios.obra): este negócio está fora do seu âmbito.' USING ERRCODE = 'CT001';
  END IF;
  IF p_vista IS NULL OR jsonb_typeof(p_vista) IS DISTINCT FROM 'object' OR jsonb_typeof(p_vista -> 'd') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Dados inválidos: a vista do cliente tem de ter o negócio (d).' USING ERRCODE = 'NE006';
  END IF;
  -- sem o estado dos materiais (quem gravou não tinha as encomendas carregadas): fica o da vista gravada, se for a mesma encomenda
  IF NOT (p_vista ? 'ec') THEN
    SELECT x.vista INTO v_velha FROM public.negocio_vista_cliente x WHERE x.negocio_id = p_negocio_id AND x.organization_id = p_org;
    IF v_velha ? 'ec' AND (v_velha #>> '{d,obra,ec,ref}') IS NOT NULL AND (v_velha #>> '{d,obra,ec,ref}') = (p_vista #>> '{d,obra,ec,ref}') THEN
      p_vista := p_vista || jsonb_build_object('ec', v_velha -> 'ec');
    END IF;
  END IF;
  -- 20270122900000: o auto de receção que o cliente vê é o da obra gravada (obra_guardar_negocio só o deixa emitir com as parcelas
  -- pagas), nunca o que veio na vista: um auto recusado pela obra não chega ao portal por aqui.
  IF jsonb_typeof(p_vista #> '{d,obra}') = 'object' THEN
    p_vista := jsonb_set(p_vista, '{d,obra}', ((p_vista #> '{d,obra}') - 'auto')
      || coalesce((SELECT jsonb_build_object('auto', o.estado_emylia->'auto') FROM public.ops_obra o
                   WHERE o.negocio_id = p_negocio_id AND o.organization_id = p_org AND jsonb_typeof(o.estado_emylia->'auto') = 'object'
                   LIMIT 1), '{}'::jsonb));
  END IF;
  IF octet_length(p_vista::text) > 6 * 1024 * 1024 THEN
    RAISE EXCEPTION 'Dados inválidos: a vista do cliente passa de 6 MB.' USING ERRCODE = 'NE006';
  END IF;
  v_marca := md5(p_vista::text);
  INSERT INTO public.negocio_vista_cliente AS x (negocio_id, organization_id, vista, marca, atualizada_em, atualizada_por)
  VALUES (p_negocio_id, p_org, p_vista, v_marca, now(), public.current_business_user_id())
  ON CONFLICT (negocio_id) DO UPDATE
     SET vista = EXCLUDED.vista, marca = EXCLUDED.marca, atualizada_em = now(), atualizada_por = EXCLUDED.atualizada_por
   WHERE x.marca IS DISTINCT FROM EXCLUDED.marca AND x.organization_id = EXCLUDED.organization_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('gravada', v_n > 0, 'marca', v_marca);
END;
$function$;
