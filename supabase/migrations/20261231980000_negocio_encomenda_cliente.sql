-- Negócio: a encomenda de cliente da Emylia no 1.º pagamento validado (decisões 10 e 14). Só acrescenta; ajusta funções do CRM.
--
-- No CRM a encomenda de cliente é o contrato assinado (order_number, lista de Encomendas de cliente, reserva de stock FIFO, "Pedir o que
-- falta"). Na Emylia ela só nasce quando o 1.º pagamento é validado; depois alguém pede o que falta e emite à mão cada encomenda a
-- fornecedor (rpc_po_send_to_supplier, como sempre). Por isso:
--   1. client_contracts.ec_emitida_em/ec_emitida_por: quando a encomenda foi emitida (o 1.º pagamento validado na Emylia).
--   2. fn_ec_emitida(contrato): verdadeiro para os contratos fora do fluxo da Emylia (nada muda para eles) e, nos da Emylia, só depois
--      de emitida. As quatro funções da encomenda de cliente passam a usá-la: a reserva FIFO, a lista, a prontidão e o "Pedir o que
--      falta". O ajuste lê o texto ATUAL de cada função e só lhe junta a condição; se o ponto de encaixe não existir, a migration pára.
--   3. neg_guardar_negocio: as linhas de produto levam o produto e a quantidade real (qt), e grava a emissão no contrato assinado.

SET lock_timeout = '5s';

ALTER TABLE public.client_contracts ADD COLUMN IF NOT EXISTS ec_emitida_em timestamptz;
ALTER TABLE public.client_contracts ADD COLUMN IF NOT EXISTS ec_emitida_por text;
COMMENT ON COLUMN public.client_contracts.ec_emitida_em IS 'Emylia: quando a encomenda de cliente foi emitida (o 1.º pagamento validado). Antes disto o contrato assinado não reserva stock nem pede ao fornecedor.';

CREATE OR REPLACE FUNCTION public.fn_ec_emitida(p_contract_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM client_contracts cc JOIN negocios n ON n.id = cc.negocio_id
    WHERE cc.id = p_contract_id AND n.fluxo_emylia AND cc.ec_emitida_em IS NULL
  )
$$;
COMMENT ON FUNCTION public.fn_ec_emitida(uuid) IS 'A encomenda de cliente do contrato conta (reserva, lista, pedir o que falta): sempre fora do fluxo da Emylia; na Emylia só depois do 1.º pagamento validado.';
REVOKE ALL ON FUNCTION public.fn_ec_emitida(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ec_emitida(uuid) TO authenticated, service_role;

-- As quatro funções da encomenda de cliente: junta-se a condição ao texto atual de cada uma.
DO $do$
DECLARE
  v text; r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.fn_client_order_line_reservations(uuid,uuid[])',
     $a$      AND cc.status IN ('signed', 'assinado')$a$,
     $b$      AND cc.status IN ('signed', 'assinado')
      AND public.fn_ec_emitida(cc.id) -- Emylia (20261231980000): só depois do 1.º pagamento validado$b$),
    ('public.rpc_list_client_order_documents(uuid,text,text,integer,integer,date,date)',
     $a$      AND cc.status = ANY (v_signed_aliases)$a$,
     $b$      AND cc.status = ANY (v_signed_aliases)
      AND public.fn_ec_emitida(cc.id) -- Emylia (20261231980000): só depois do 1.º pagamento validado$b$),
    ('public.rpc_client_order_list_readiness(uuid,uuid[])',
     $a$      AND cc.status = ANY (ARRAY['signed', 'assinado'])$a$,
     $b$      AND cc.status = ANY (ARRAY['signed', 'assinado'])
      AND public.fn_ec_emitida(cc.id) -- Emylia (20261231980000): só depois do 1.º pagamento validado$b$),
    ('public.fn_client_order_request_missing(uuid,uuid,uuid[])',
     $a$  IF v_status IS NULL OR NOT (v_status = ANY (v_signed_aliases)) OR v_quote_id IS NULL THEN$a$,
     $b$  -- Emylia (20261231980000): a encomenda de cliente só existe depois do 1.º pagamento validado
  IF NOT public.fn_ec_emitida(p_contract_id) THEN
    RAISE EXCEPTION 'A encomenda de cliente deste negócio só é emitida quando o 1.º pagamento for validado.' USING ERRCODE = 'P0001';
  END IF;

  IF v_status IS NULL OR NOT (v_status = ANY (v_signed_aliases)) OR v_quote_id IS NULL THEN$b$)
  ) AS t(assinatura, de, para) LOOP
    v := pg_get_functiondef(r.assinatura::regprocedure);
    IF position('fn_ec_emitida' IN v) > 0 THEN CONTINUE; END IF;
    IF (length(v) - length(replace(v, r.de, ''))) / length(r.de) <> 1 THEN
      RAISE EXCEPTION 'A função % mudou (o ponto de encaixe não aparece uma vez só): rever a migration 20261231980000.', r.assinatura;
    END IF;
    EXECUTE replace(v, r.de, r.para);
  END LOOP;
END $do$;

CREATE OR REPLACE FUNCTION public.neg_guardar_negocio(p_org uuid, p_negocio_id uuid, p_linhas jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'pessoas.edit');
  v_neg negocios; b jsonb := p_linhas->'negocio'; e jsonb; o jsonb; l jsonb; k jsonb;
  v_q uuid; v_l uuid; v_z uuid; v_prop uuid; v_atual uuid; v_aceite uuid; v_c uuid; v_c_ant uuid; v_f uuid; v_pg uuid;
  i int; v_iva numeric; v_tot numeric; v_estado text; v_status text; v_ids uuid[] := '{}'; v_avisos text[] := '{}';
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio_id AND organization_id = p_org AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negócio não encontrado nesta organização.' USING ERRCODE = 'NE003'; END IF;

  -- o negócio (o título só muda num negócio aberto: o CRM protege o dos fechados)
  UPDATE negocios SET fase = (b->>'fase')::smallint, linha = b->>'linha', linha_por_definir = coalesce((b->>'linha_por_definir')::boolean, false),
    servico_pedido = b->>'servico_pedido', morada_obra = b->>'morada_obra', origem = b->>'origem', pedido_em = (b->>'pedido_em')::timestamptz,
    dono_papel = b->>'dono_papel', anulado_em = (b->>'anulado_em')::timestamptz, anulado_por = b->>'anulado_por', anulado_motivo = b->>'anulado_motivo',
    anulado_origem = b->>'anulado_origem', fatura_numero = b->>'fatura_numero', fatura_em = (b->>'fatura_em')::timestamptz,
    fatura_paga = coalesce((b->>'fatura_paga')::boolean, false), recibo_numero = b->>'recibo_numero', recibo_em = (b->>'recibo_em')::timestamptz,
    fluxo_emylia = true,
    titulo = CASE WHEN v_neg.estado = 'aberto' AND coalesce(b->>'titulo', '') <> '' THEN b->>'titulo' ELSE titulo END
  WHERE id = p_negocio_id;

  -- respostas, medidas, serviços e produtos da visita, partes tiradas, histórico (substituem-se)
  DELETE FROM negocio_respostas WHERE negocio_id = p_negocio_id;
  INSERT INTO negocio_respostas (organization_id, negocio_id, campo_chave, valor, sugerido, atualizado_por)
  SELECT p_org, p_negocio_id, x->>'campo_chave', coalesce(x->>'valor', ''), coalesce((x->>'sugerido')::boolean, false), v_user
  FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'respostas')) x;
  e := p_linhas->'medidas';
  INSERT INTO negocio_medidas AS m (organization_id, negocio_id, pav, par, ptf, ptq, pts, pcs, necessidades, slot, fotos_total, fotos_exterior, fotos_interior, fotos_area, fechada, visitas)
  VALUES (p_org, p_negocio_id, coalesce((e->>'pav')::numeric, 0), coalesce((e->>'par')::numeric, 0), coalesce((e->>'ptf')::numeric, 0), coalesce((e->>'ptq')::numeric, 0),
    coalesce((e->>'pts')::numeric, 0), coalesce((e->>'pcs')::numeric, 0), ARRAY(SELECT jsonb_array_elements_text(public.fn_neg_lista(e->'necessidades'))), e->>'slot',
    coalesce((e->>'fotos_total')::smallint, 0), coalesce((e->>'fotos_exterior')::smallint, 0), coalesce((e->>'fotos_interior')::smallint, 0),
    coalesce((e->>'fotos_area')::smallint, 0), coalesce((e->>'fechada')::boolean, false),
    ARRAY(SELECT jsonb_array_elements_text(public.fn_neg_lista(p_linhas->'visitas'))::smallint))
  ON CONFLICT (negocio_id) DO UPDATE SET pav = EXCLUDED.pav, par = EXCLUDED.par, ptf = EXCLUDED.ptf, ptq = EXCLUDED.ptq, pts = EXCLUDED.pts, pcs = EXCLUDED.pcs,
    necessidades = EXCLUDED.necessidades, slot = EXCLUDED.slot, fotos_total = EXCLUDED.fotos_total, fotos_exterior = EXCLUDED.fotos_exterior,
    fotos_interior = EXCLUDED.fotos_interior, fotos_area = EXCLUDED.fotos_area, fechada = EXCLUDED.fechada, visitas = EXCLUDED.visitas;
  DELETE FROM negocio_servicos WHERE negocio_id = p_negocio_id;
  INSERT INTO negocio_servicos (organization_id, negocio_id, servico_id, inclusao, quantidade, mantem, cliente_compra, ordem)
  SELECT p_org, p_negocio_id, (x->>'servico')::uuid, x->>'inclusao', (x->>'quantidade')::numeric, (x->>'mantem')::boolean, x->>'cliente_compra', coalesce((x->>'ordem')::int, 0)
  FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'servicos')) x;
  DELETE FROM negocio_produtos WHERE negocio_id = p_negocio_id;
  INSERT INTO negocio_produtos (organization_id, negocio_id, produto_id, quantidade, cliente_fornece, servico_id, sem_instalacao, ordem, nome, unidade, custo_un, pvp_un, categoria_id, fator)
  SELECT p_org, p_negocio_id, (x->>'produto')::uuid, (x->>'quantidade')::numeric, coalesce((x->>'cliente_fornece')::boolean, false), (x->>'servico')::uuid,
    coalesce((x->>'sem_instalacao')::boolean, false), (x->>'ordem')::int, x->>'nome', x->>'unidade', (x->>'custo_un')::numeric, (x->>'pvp_un')::numeric,
    (x->>'categoria')::uuid, (x->>'fator')::numeric
  FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'produtos')) x;
  DELETE FROM negocio_partes_fora WHERE negocio_id = p_negocio_id;
  INSERT INTO negocio_partes_fora (organization_id, negocio_id, parte)
  SELECT DISTINCT p_org, p_negocio_id, x FROM jsonb_array_elements_text(public.fn_neg_lista(p_linhas->'partes_fora')) x;
  DELETE FROM negocio_historico WHERE negocio_id = p_negocio_id;
  INSERT INTO negocio_historico (organization_id, negocio_id, ordem, ocorrido_em, texto, tipo, autor)
  SELECT p_org, p_negocio_id, (x->>'ordem')::int, coalesce((x->>'ocorrido_em')::timestamptz, now()), x->>'texto', x->>'tipo', NULL
  FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'historico')) x;

  -- orçamentos (quotes), uma linha por versão
  FOR o IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'orcamentos')) ORDER BY (value->>'versao')::int LOOP
    SELECT id INTO v_q FROM quotes WHERE negocio_id = p_negocio_id AND fluxo_emylia AND deleted_at IS NULL AND versao = (o->>'versao')::smallint;
    IF v_q IS NULL THEN
      INSERT INTO quotes (organization_id, root_organization_id, entity_id, negocio_id, created_by, title, modelo_base, versao, fluxo_emylia, estado)
      VALUES (p_org, v_neg.root_organization_id, v_neg.entity_id, p_negocio_id, v_user, 'Proposta ' || v_neg.numero || ' · versão ' || (o->>'versao'),
        coalesce(o->>'modelo', ''), (o->>'versao')::smallint, true, 'rascunho')
      RETURNING id INTO v_q;
    END IF;
    v_estado := o->>'estado';
    UPDATE quotes SET modelo_base = coalesce(o->>'modelo', ''), estado = v_estado, desconto_fracao = (o->>'desconto')::numeric,
      desconto_global_percent = round(coalesce((o->>'desconto')::numeric, 0) * 100, 2), venda_direta = coalesce((o->>'venda_direta')::boolean, false),
      inicio_obra = (o->>'inicio_obra')::date, equipa = (o->>'equipa')::smallint,
      verificado_em = CASE WHEN coalesce((o->>'verificado')::boolean, false) THEN coalesce(verificado_em, now()) END,
      aprovacao = o->>'aprovacao', motivos_versao = ARRAY(SELECT jsonb_array_elements_text(public.fn_neg_lista(o->'motivos_versao'))), nota_versao = o->>'nota_versao',
      onde_refeita = o->>'onde_refeita',
      pedido_cliente_motivos = CASE WHEN o->'pedido_cliente' IS NOT NULL AND jsonb_typeof(o->'pedido_cliente') = 'object' THEN ARRAY(SELECT jsonb_array_elements_text(o->'pedido_cliente'->'motivos')) END,
      pedido_cliente_nota = o->'pedido_cliente'->>'nota', pedido_cliente_em = (o->'pedido_cliente'->>'em')::timestamptz,
      recusa_motivos = CASE WHEN o->'recusa' IS NOT NULL AND jsonb_typeof(o->'recusa') = 'object' THEN ARRAY(SELECT jsonb_array_elements_text(o->'recusa'->'motivos')) END,
      recusa_nota = o->'recusa'->>'nota', recusada_em = (o->'recusa'->>'em')::timestamptz,
      enviado_em = (o->>'enviado_em')::timestamptz, accepted_at = (o->>'aceite_em')::timestamptz, substituido_em = (o->>'substituido_em')::timestamptz,
      aceite_antes_em = (o->>'aceite_antes_em')::timestamptz, preco_final = (o->>'preco_final')::numeric, total_com_iva = (o->>'total_com_iva')::numeric,
      subtotal = coalesce((o->>'preco_final')::numeric, subtotal), total = coalesce((o->>'total_com_iva')::numeric, total),
      prestacoes_por_fases = coalesce((o->>'prestacoes_por_fases')::boolean, false), sem_demolicao = coalesce((o->>'sem_demolicao')::boolean, false), updated_at = now()
    WHERE id = v_q;
    IF v_estado <> 'substituido' THEN v_atual := v_q; END IF;
    IF v_estado = 'aceite' THEN v_aceite := v_q; END IF;

    -- linhas (substituem-se; as filhas vão com elas) e zonas
    DELETE FROM quote_lines WHERE quote_id = v_q;
    DELETE FROM quote_zonas WHERE quote_id = v_q;
    i := 0;
    FOR k IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(o->'zonas')) LOOP
      i := i + 1;
      INSERT INTO quote_zonas (organization_id, quote_id, ordem, nome) VALUES (p_org, v_q, i, k #>> '{}');
    END LOOP;
    -- as zonas que as linhas usam e não estão na lista (as versões anteriores não guardam a lista): criam-se pela ordem em que aparecem
    INSERT INTO quote_zonas (organization_id, quote_id, ordem, nome)
    SELECT p_org, v_q, (SELECT coalesce(max(ordem), 0) FROM quote_zonas WHERE quote_id = v_q) + row_number() OVER (ORDER BY min(x.pos)), x.nome
    FROM (SELECT z.v->>'zona' AS nome, ln.n * 1000 + z.n AS pos
          FROM jsonb_array_elements(public.fn_neg_lista(o->'linhas')) WITH ORDINALITY ln(v, n),
               jsonb_array_elements(public.fn_neg_lista(ln.v->'zonas')) WITH ORDINALITY z(v, n)) x
    WHERE NOT EXISTS (SELECT 1 FROM quote_zonas q2 WHERE q2.quote_id = v_q AND lower(btrim(q2.nome)) = lower(btrim(x.nome)))
    GROUP BY x.nome;
    FOR l IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(o->'linhas')) LOOP
      v_iva := coalesce((l->>'taxa_iva')::numeric, CASE WHEN l->>'parte_iva' = 'mao_obra' THEN 6 ELSE 23 END);
      v_tot := round((l->>'quantidade')::numeric * (l->>'preco_un')::numeric, 2);
      INSERT INTO quote_lines (quote_id, categoria, descricao_snapshot, qt, quantidade_exata, retail_price_unit, preco_un_exato, cost_price, custo_un_exato,
        iva_percent, iva_explicita, total_sem_iva, total_com_iva, total_com_desconto, ordem, service_id, product_id, unidade, section_name, tipo_emylia, custo_manual, fornecedor,
        qtd_origem, preco_un_origem, custo_un_origem, custo_mao_obra_unit, custo_material_unit, margem_percent)
      VALUES (v_q, CASE WHEN l->>'tipo' = 'servico' THEN 'Serviços' ELSE 'Materiais' END,
        coalesce((SELECT s.name FROM services s WHERE s.id = (l->>'servico')::uuid), l->>'descricao', ''),
        -- uma linha de produto guarda o total (quantidade 1); qt e o preço unitário do CRM ficam com a quantidade real do produto, para a
        -- reserva e o pedido ao fornecedor da encomenda de cliente o verem (20261231980000)
        CASE WHEN l->>'tipo' = 'produto' AND l->>'qtd_origem' IS NOT NULL THEN round((l->>'qtd_origem')::numeric, 2) ELSE round((l->>'quantidade')::numeric, 2) END,
        (l->>'quantidade')::numeric,
        CASE WHEN l->>'tipo' = 'produto' AND l->>'preco_un_origem' IS NOT NULL THEN round((l->>'preco_un_origem')::numeric, 2) ELSE round((l->>'preco_un')::numeric, 2) END,
        (l->>'preco_un')::numeric,
        (l->'custo'->>'custo_un')::numeric, (l->'custo'->>'custo_un')::numeric, v_iva, l->>'taxa_iva' IS NOT NULL,
        v_tot, round(v_tot * (1 + v_iva / 100), 2), v_tot, (l->>'ordem')::int, (l->>'servico')::uuid, (l->>'produto')::uuid, l->>'unidade',
        coalesce(l->'zonas'->0->>'zona', 'Geral'), l->>'tipo', coalesce((l->'custo'->>'manual')::boolean, false), l->>'fornecedor',
        (l->>'qtd_origem')::numeric, (l->>'preco_un_origem')::numeric, (l->>'custo_un_origem')::numeric,
        CASE WHEN l->>'tipo' = 'servico' THEN round((l->'custo'->>'custo_un')::numeric, 2) ELSE 0 END,
        CASE WHEN l->>'tipo' = 'servico' THEN 0 ELSE round((l->'custo'->>'custo_un')::numeric, 2) END, 0)
      RETURNING id INTO v_l;
      k := l->'custo';
      INSERT INTO quote_line_custos (organization_id, quote_line_id, congelado, congelado_em, horas_un, mao_obra_un, equipamentos_un, consumiveis_un, estrutura_hora, estrutura_un, ajuste_un)
      VALUES (p_org, v_l, coalesce((k->>'congelado')::boolean, false), (k->>'congelado_em')::timestamptz, coalesce((k->>'horas_un')::numeric, 0),
        coalesce((k->>'mao_obra_un')::numeric, 0), coalesce((k->>'equipamentos_un')::numeric, 0), coalesce((k->>'consumiveis_un')::numeric, 0),
        coalesce((k->>'estrutura_hora')::numeric, 0), coalesce((k->>'estrutura_un')::numeric, 0), coalesce((k->>'ajuste_un')::numeric, 0));
      INSERT INTO quote_line_oficios (organization_id, quote_line_id, ordem, perfil_chave, nome, horas_un, custo_hora, tecnicos)
      SELECT p_org, v_l, (x.n - 1)::smallint, x.v->>'perfil_chave', x.v->>'nome', (x.v->>'horas_un')::numeric, (x.v->>'custo_hora')::numeric,
        CASE WHEN jsonb_typeof(x.v->'tecnicos') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(x.v->'tecnicos')) END
      FROM jsonb_array_elements(public.fn_neg_lista(k->'oficios')) WITH ORDINALITY x(v, n);
      INSERT INTO quote_line_zonas (organization_id, quote_line_id, zona_id, ordem, quantidade, valor)
      SELECT p_org, v_l, z.id, (x.n - 1)::smallint, (x.v->>'quantidade')::numeric, (x.v->>'valor')::numeric
      FROM jsonb_array_elements(public.fn_neg_lista(l->'zonas')) WITH ORDINALITY x(v, n)
      JOIN quote_zonas z ON z.quote_id = v_q AND lower(btrim(z.nome)) = lower(btrim(x.v->>'zona'));
    END LOOP;
    -- uma linha com zonas cujo nome não está na lista de zonas do orçamento: a zona cria-se (a Emylia deixa)
    -- (não acontece nos dados da Emylia: as zonas das linhas vêm da lista; fica a nota)

    DELETE FROM quote_prazo WHERE quote_id = v_q;
    INSERT INTO quote_prazo (organization_id, quote_id, tarefa, dias)
    SELECT p_org, v_q, x->>'tarefa', (x->>'dias')::numeric FROM jsonb_array_elements(public.fn_neg_lista(o->'prazo')) x;
    -- prestações: as faturas apontam para elas, por isso atualizam-se pela ordem em vez de se apagarem
    INSERT INTO quote_prestacoes AS qp (organization_id, quote_id, ordem, rotulo, pct, marco, fase)
    SELECT p_org, v_q, (x->>'ordem')::smallint, x->>'rotulo', (x->>'pct')::numeric, x->>'marco', (x->>'fase')::smallint
    FROM jsonb_array_elements(public.fn_neg_lista(o->'prestacoes')) x
    ON CONFLICT (quote_id, ordem) DO UPDATE SET rotulo = EXCLUDED.rotulo, pct = EXCLUDED.pct, marco = EXCLUDED.marco, fase = EXCLUDED.fase;
    DELETE FROM quote_prestacoes p WHERE p.quote_id = v_q
      AND p.ordem > jsonb_array_length(public.fn_neg_lista(o->'prestacoes'))
      AND NOT EXISTS (SELECT 1 FROM faturas f WHERE f.quote_prestacao_id = p.id);
    DELETE FROM quote_avisos_vistos WHERE quote_id = v_q;
    INSERT INTO quote_avisos_vistos (organization_id, quote_id, chave) SELECT DISTINCT p_org, v_q, x FROM jsonb_array_elements_text(public.fn_neg_lista(o->'avisos')) x;
    DELETE FROM quote_precos_manuais WHERE quote_id = v_q;
    INSERT INTO quote_precos_manuais (organization_id, quote_id, descricao, preco)
    SELECT p_org, v_q, x->>'descricao', (x->>'preco')::numeric FROM jsonb_array_elements(public.fn_neg_lista(o->'precos_manuais')) x;
    DELETE FROM quote_versao_produtos WHERE quote_id = v_q;
    INSERT INTO quote_versao_produtos (organization_id, quote_id, ordem, produto_id, nome, unidade, custo_un, pvp_un, categoria_id, quantidade, cliente_fornece, servico_id, fator, sem_instalacao)
    SELECT p_org, v_q, (x->>'ordem')::int, (x->>'produto')::uuid, x->>'nome', x->>'unidade', (x->>'custo_un')::numeric, (x->>'pvp_un')::numeric,
      (x->>'categoria')::uuid, (x->>'quantidade')::numeric, coalesce((x->>'cliente_fornece')::boolean, false), (x->>'servico')::uuid, (x->>'fator')::numeric,
      coalesce((x->>'sem_instalacao')::boolean, false)
    FROM jsonb_array_elements(public.fn_neg_lista(o->'produtos')) x;
    DELETE FROM quote_versao_partes WHERE quote_id = v_q;
    INSERT INTO quote_versao_partes (organization_id, quote_id, parte)
    SELECT DISTINCT p_org, v_q, x FROM jsonb_array_elements_text(public.fn_neg_lista(o->'partes_fora')) x;
  END LOOP;

  -- a proposta (uma por negócio): nasce no primeiro envio; a versão atual liga-se a ela, as anteriores desligam-se
  SELECT id INTO v_prop FROM proposals WHERE negocio_id = p_negocio_id AND coalesce(is_deleted, false) = false ORDER BY created_at LIMIT 1;
  IF v_prop IS NULL AND EXISTS (SELECT 1 FROM quotes WHERE negocio_id = p_negocio_id AND fluxo_emylia AND deleted_at IS NULL AND enviado_em IS NOT NULL) THEN
    INSERT INTO proposals (organization_id, root_organization_id, entity_id, negocio_id, created_by, title, value, status)
    VALUES (p_org, v_neg.root_organization_id, v_neg.entity_id, p_negocio_id, v_user, 'Proposta ' || v_neg.numero, 0, 'draft')
    RETURNING id INTO v_prop;
  END IF;
  IF v_prop IS NOT NULL THEN
    UPDATE quotes SET proposal_id = CASE WHEN id = v_atual THEN v_prop END
    WHERE negocio_id = p_negocio_id AND fluxo_emylia AND deleted_at IS NULL AND proposal_id IS DISTINCT FROM CASE WHEN id = v_atual THEN v_prop END;
    SELECT CASE q.estado WHEN 'aceite' THEN 'accepted' WHEN 'recusado' THEN 'rejected' WHEN 'enviado' THEN 'sent' ELSE 'draft' END INTO v_status
    FROM quotes q WHERE q.id = v_atual;
    UPDATE proposals p SET status = v_status, sent_at = coalesce(q.enviado_em, p.sent_at), accepted_at = q.accepted_at, rejected_at = q.recusada_em,
      rejection_notes = q.recusa_nota, value = coalesce(q.preco_final, p.value), value_sem_iva = coalesce(q.preco_final, p.value_sem_iva), updated_at = now()
    FROM quotes q WHERE p.id = v_prop AND q.id = v_atual AND p.status IS DISTINCT FROM v_status;
  END IF;

  -- contratos (client_contracts), uma linha por versão; a anterior fica substituída pela seguinte
  v_c_ant := NULL;
  FOR o IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'contratos')) ORDER BY (value->>'versao')::int LOOP
    SELECT id INTO v_c FROM client_contracts WHERE negocio_id = p_negocio_id AND versao = (o->>'versao')::smallint AND deleted_at IS NULL;
    IF v_c IS NULL THEN
      INSERT INTO client_contracts (organization_id, root_organization_id, entity_id, negocio_id, created_by, status, versao, quote_id, proposal_id, replaces_contract_id)
      VALUES (p_org, v_neg.root_organization_id, v_neg.entity_id, p_negocio_id, v_user, 'draft', (o->>'versao')::smallint, coalesce(v_aceite, v_atual), v_prop, v_c_ant)
      RETURNING id INTO v_c;
    END IF;
    IF v_c_ant IS NOT NULL THEN
      UPDATE client_contracts SET replaced_by_contract_id = v_c, status = 'cancelled', cancelled_at = coalesce(cancelled_at, (o->>'substituido_em')::timestamptz, now())
      WHERE id = v_c_ant AND replaced_by_contract_id IS DISTINCT FROM v_c;
    END IF;
    v_status := CASE o->>'estado' WHEN 'assinado' THEN 'signed' WHEN 'enviado' THEN 'pending_signature' WHEN 'alteracoes_pedidas' THEN 'changes_requested'
                  WHEN 'substituido' THEN 'cancelled' ELSE 'draft' END;
    e := o->'assinatura';
    UPDATE client_contracts SET revisto_por = o->>'revisto_por', revisto_em = (o->>'revisto_em')::timestamptz,
      signature_method = CASE WHEN jsonb_typeof(e) = 'object' THEN e->>'metodo' END,
      signature_reference = CASE WHEN jsonb_typeof(e) = 'object' THEN e->>'identificador' END,
      signature_phone_masked = CASE WHEN jsonb_typeof(e) = 'object' THEN e->>'telefone_mascarado' END,
      signed_by_name = CASE WHEN jsonb_typeof(e) = 'object' THEN e->>'nome' ELSE signed_by_name END,
      signature_date = coalesce((o->>'assinado_em')::timestamptz, CASE WHEN jsonb_typeof(e) = 'object' THEN (e->>'assinado_em')::timestamptz END),
      quote_id = coalesce(quote_id, v_aceite, v_atual), proposal_id = coalesce(proposal_id, v_prop), updated_at = now()
    WHERE id = v_c;
    -- o estado à parte, para os gatilhos do CRM verem a passagem (assinado: ganho com a prova P4, no fim da transação)
    UPDATE client_contracts SET status = v_status, status_changed_by = v_user, status_changed_at = now()
    -- a versão substituída só muda de estado quando se liga à seguinte (no mesmo UPDATE): cancelada sem substituta seria perda
    WHERE id = v_c AND status IS DISTINCT FROM v_status AND replaced_by_contract_id IS NULL AND o->>'estado' <> 'substituido';
    DELETE FROM client_contract_pedidos WHERE contract_id = v_c;
    INSERT INTO client_contract_pedidos (organization_id, contract_id, ordem, clausula, nota, pedido_em)
    SELECT p_org, v_c, (x.n - 1)::smallint, x.v->>'clausula', x.v->>'nota', coalesce((x.v->>'pedido_em')::timestamptz, now())
    FROM jsonb_array_elements(public.fn_neg_lista(o->'pedidos')) WITH ORDINALITY x(v, n);
    DELETE FROM client_contract_clausulas WHERE contract_id = v_c;
    INSERT INTO client_contract_clausulas (organization_id, contract_id, titulo, texto)
    SELECT p_org, v_c, x->>'titulo', x->>'texto' FROM jsonb_array_elements(public.fn_neg_lista(o->'clausulas')) x;
    v_c_ant := v_c;
  END LOOP;

  -- a encomenda de cliente da Emylia: emitida no 1.º pagamento validado (decisão 10), no contrato assinado em vigor (20261231980000)
  IF jsonb_typeof(p_linhas->'ec') = 'object' THEN
    UPDATE client_contracts SET ec_emitida_em = coalesce((p_linhas->'ec'->>'emitida_em')::timestamptz, now()), ec_emitida_por = p_linhas->'ec'->>'por'
    WHERE negocio_id = p_negocio_id AND deleted_at IS NULL AND replaced_by_contract_id IS NULL AND status IN ('signed', 'assinado') AND ec_emitida_em IS NULL;
  END IF;

  -- faturas por prestação (do orçamento aceite), com o pagamento e o recibo; nunca se apagam
  FOR o IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'faturas')) LOOP
    v_tot := (o->>'total')::numeric;
    SELECT id INTO v_f FROM faturas WHERE negocio_id = p_negocio_id AND chave = o->>'chave';
    IF v_f IS NULL THEN
      -- a fatura certificada é do ERP: aqui o total; a parte do IVA reparte-se pela do orçamento aceite (a exata vem do Eticadata)
      SELECT CASE WHEN q.total_com_iva > 0 THEN round(v_tot * (1 - q.preco_final / q.total_com_iva), 2) ELSE 0 END INTO v_iva
      FROM quotes q WHERE q.id = coalesce(v_aceite, v_atual);
      INSERT INTO faturas (organization_id, negocio_id, quote_prestacao_id, numero, emitida_em, emitida_por, base_mao_obra, base_materiais, iva, total, pdf_caminho, chave)
      VALUES (p_org, p_negocio_id,
        (SELECT p.id FROM quote_prestacoes p WHERE p.quote_id = coalesce(v_aceite, v_atual) AND p.ordem = (o->>'prestacao_ordem')::smallint),
        o->>'numero', coalesce((o->>'emitida_em')::timestamptz, now()), v_user, 0, v_tot - coalesce(v_iva, 0), coalesce(v_iva, 0), v_tot, o->>'pdf_caminho', o->>'chave')
      RETURNING id INTO v_f;
    ELSE
      UPDATE faturas SET pdf_caminho = coalesce(o->>'pdf_caminho', pdf_caminho) WHERE id = v_f;
    END IF;
    IF jsonb_typeof(o->'pagamento') = 'object' THEN
      SELECT id INTO v_pg FROM pagamentos WHERE fatura_id = v_f ORDER BY comunicado_em LIMIT 1;
      IF v_pg IS NULL THEN
        INSERT INTO pagamentos (organization_id, fatura_id, metodo, valor, conta_destino, referencia, comunicado_em, validado_em, validado_por)
        VALUES (p_org, v_f, 'transferencia', v_tot, o->'pagamento'->>'conta_destino', o->'pagamento'->>'referencia',
          coalesce((o->'pagamento'->>'validado_em')::timestamptz, now()), coalesce((o->'pagamento'->>'validado_em')::timestamptz, now()), v_user)
        RETURNING id INTO v_pg;
        UPDATE faturas SET estado = 'paga' WHERE id = v_f;
      END IF;
      IF coalesce(o->>'recibo', '') <> '' AND NOT EXISTS (SELECT 1 FROM recibos WHERE pagamento_id = v_pg) THEN
        INSERT INTO recibos (organization_id, pagamento_id, numero) VALUES (p_org, v_pg, o->>'recibo');
      END IF;
    END IF;
  END LOOP;

  -- as visitas com dia e hora vão para a agenda do CRM (20261231970000)
  v_avisos := public.fn_neg_sincronizar_visitas(p_org, p_negocio_id, p_linhas->'respostas', p_linhas->'visitas');

  RETURN jsonb_build_object('negocio_id', p_negocio_id, 'proposta_id', v_prop, 'orcamento_atual_id', v_atual, 'avisos', to_jsonb(v_avisos));
END $$;

RESET lock_timeout;
