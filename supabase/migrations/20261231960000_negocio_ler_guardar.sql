-- Negócio (Fase 2.2): ler e gravar o Negócio da Emylia nas tabelas do CRM (decisão 13). Só acrescenta.
--   neg_ler_negocios(org)              as linhas de todos os negócios da organização (o ecrã monta o Negocio: src/emylia/real/negocioReal.ts)
--   neg_guardar_negocio(org, id, json) grava as partes da Emylia num negócio que JÁ EXISTE (criado pelo caminho do CRM: Nova lead,
--                                      neg_criar_negocio). Orçamento em quotes (uma linha por versão) e filhas; proposta em proposals
--                                      (uma por negócio); contrato em client_contracts (uma linha por versão, substituídas com
--                                      replaced_by_contract_id); respostas, medidas, produtos, histórico e faturas nas tabelas novas.
-- Os gatilhos do CRM fazem o resto: numeração, valor da proposta, ganho com o contrato assinado (prova P4), perda na recusa.
-- O jsonb é só o transporte. As faturas, os pagamentos e os recibos nunca se apagam (são documentos legais).
-- Erros: CT001 sem permissão (fn_cat_exigir); NE003 negócio não encontrado nesta organização.

SET lock_timeout = '5s';

ALTER TABLE public.negocio_medidas ADD COLUMN IF NOT EXISTS visitas smallint[] NOT NULL DEFAULT '{}';
ALTER TABLE public.negocio_servicos ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.negocio_medidas.visitas IS 'Os números das visitas do negócio (1, 2…). A visita vai para a agenda (schedule_items.visita_numero) quando tem data.';

-- Uma lista do JSON que pode vir ausente ou a null: lista vazia.
CREATE OR REPLACE FUNCTION public.fn_neg_lista(j jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(j) = 'array' THEN j ELSE '[]'::jsonb END
$$;

-- ------------------------------------------------------------------ ler
CREATE OR REPLACE FUNCTION public.neg_ler_negocios(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
  SELECT coalesce(jsonb_agg(x.j ORDER BY x.numero), '[]') INTO r FROM (
    SELECT n.numero, jsonb_build_object(
      'negocio', jsonb_build_object('id', n.id, 'entity_id', n.entity_id, 'numero', n.numero, 'titulo', n.titulo, 'telefone', coalesce(e.phone, ''),
        'fase', coalesce(n.fase, 0), 'linha', coalesce(n.linha, 'geral'), 'linha_por_definir', n.linha_por_definir, 'servico_pedido', coalesce(n.servico_pedido, ''),
        'morada_obra', coalesce(n.morada_obra, ''), 'origem', coalesce(n.origem, ''), 'pedido_em', n.pedido_em, 'dono_papel', coalesce(n.dono_papel, 'comercial'),
        'estado', CASE WHEN n.estado = 'perdido' THEN 'perdido' ELSE 'aberto' END, 'estado_crm', n.estado, 'motivo_perda', n.motivo_perda,
        'anulado_em', n.anulado_em, 'anulado_por', n.anulado_por, 'anulado_motivo', n.anulado_motivo, 'anulado_origem', n.anulado_origem,
        'fatura_numero', n.fatura_numero, 'fatura_em', n.fatura_em, 'fatura_paga', n.fatura_paga, 'recibo_numero', n.recibo_numero, 'recibo_em', n.recibo_em,
        'fluxo_emylia', n.fluxo_emylia),
      'respostas', coalesce((SELECT jsonb_agg(jsonb_build_object('campo_chave', r.campo_chave, 'valor', r.valor, 'sugerido', r.sugerido) ORDER BY r.campo_chave)
                    FROM negocio_respostas r WHERE r.negocio_id = n.id AND r.divisao = ''), '[]'),
      'visitas', to_jsonb(coalesce(m.visitas, '{}')),
      'medidas', jsonb_build_object('pav', coalesce(m.pav, 0), 'par', coalesce(m.par, 0), 'pts', coalesce(m.pts, 0), 'pcs', coalesce(m.pcs, 0),
        'ptf', CASE WHEN m.ptf > 0 OR m.ptq > 0 THEN m.ptf END, 'ptq', CASE WHEN m.ptf > 0 OR m.ptq > 0 THEN m.ptq END,
        'necessidades', to_jsonb(coalesce(m.necessidades, '{}')), 'slot', coalesce(m.slot, ''), 'fotos_total', coalesce(m.fotos_total, 0),
        'fotos_exterior', NULLIF(m.fotos_exterior, 0), 'fotos_interior', NULLIF(m.fotos_interior, 0), 'fotos_area', NULLIF(m.fotos_area, 0), 'fechada', coalesce(m.fechada, false)),
      'servicos', coalesce((SELECT jsonb_agg(jsonb_build_object('servico', s.servico_id, 'inclusao', s.inclusao, 'quantidade', s.quantidade, 'mantem', s.mantem,
                    'cliente_compra', s.cliente_compra, 'ordem', s.ordem) ORDER BY s.ordem) FROM negocio_servicos s WHERE s.negocio_id = n.id), '[]'),
      'produtos', (SELECT jsonb_agg(jsonb_build_object('ordem', p.ordem, 'produto', p.produto_id, 'nome', p.nome, 'unidade', p.unidade, 'custo_un', p.custo_un,
                    'pvp_un', p.pvp_un, 'categoria', p.categoria_id, 'quantidade', p.quantidade, 'cliente_fornece', p.cliente_fornece, 'servico', p.servico_id,
                    'fator', p.fator, 'sem_instalacao', p.sem_instalacao) ORDER BY p.ordem) FROM negocio_produtos p WHERE p.negocio_id = n.id),
      'partes_fora', (SELECT jsonb_agg(pf.parte ORDER BY pf.parte) FROM negocio_partes_fora pf WHERE pf.negocio_id = n.id),
      'orcamentos', coalesce((SELECT jsonb_agg(public.fn_neg_ler_orcamento(q.id) ORDER BY q.versao) FROM quotes q
                    WHERE q.negocio_id = n.id AND q.fluxo_emylia AND q.deleted_at IS NULL), '[]'),
      'contratos', coalesce((SELECT jsonb_agg(public.fn_neg_ler_contrato(c.id) ORDER BY c.versao) FROM client_contracts c
                    WHERE c.negocio_id = n.id AND c.versao IS NOT NULL AND c.deleted_at IS NULL), '[]'),
      'faturas', (SELECT jsonb_agg(jsonb_build_object('chave', f.chave, 'numero', f.numero, 'emitida_em', f.emitida_em, 'total', f.total,
                    'prestacao_ordem', qp.ordem, 'pdf_caminho', f.pdf_caminho,
                    'pagamento', (SELECT jsonb_build_object('validado_em', pg.validado_em, 'conta_destino', coalesce(pg.conta_destino, ''), 'referencia', coalesce(pg.referencia, ''))
                                  FROM pagamentos pg WHERE pg.fatura_id = f.id ORDER BY pg.comunicado_em LIMIT 1),
                    'recibo', (SELECT rc.numero FROM recibos rc JOIN pagamentos pg ON pg.id = rc.pagamento_id WHERE pg.fatura_id = f.id LIMIT 1))
                    ORDER BY f.emitida_em, f.numero)
                    FROM faturas f LEFT JOIN quote_prestacoes qp ON qp.id = f.quote_prestacao_id WHERE f.negocio_id = n.id AND f.chave IS NOT NULL),
      'historico', coalesce((SELECT jsonb_agg(jsonb_build_object('ordem', h.ordem, 'texto', h.texto, 'tipo', h.tipo, 'ocorrido_em', h.ocorrido_em) ORDER BY h.ordem)
                    FROM negocio_historico h WHERE h.negocio_id = n.id), '[]')
    ) j
    FROM negocios n
    LEFT JOIN anew_entities e ON e.id = n.entity_id
    LEFT JOIN negocio_medidas m ON m.negocio_id = n.id
    WHERE n.organization_id = p_org AND n.deleted_at IS NULL AND n.numero IS NOT NULL
  ) x;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fn_neg_ler_orcamento(p_quote uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'versao', q.versao, 'estado', q.estado, 'modelo', q.modelo_base, 'desconto', coalesce(q.desconto_fracao, 0), 'venda_direta', q.venda_direta,
    'inicio_obra', q.inicio_obra, 'equipa', q.equipa, 'verificado', q.verificado_em IS NOT NULL, 'aprovacao', q.aprovacao,
    'motivos_versao', to_jsonb(coalesce(q.motivos_versao, '{}')), 'nota_versao', q.nota_versao, 'onde_refeita', q.onde_refeita,
    'pedido_cliente', CASE WHEN q.pedido_cliente_em IS NOT NULL OR q.pedido_cliente_motivos IS NOT NULL THEN
      jsonb_build_object('motivos', to_jsonb(coalesce(q.pedido_cliente_motivos, '{}')), 'nota', q.pedido_cliente_nota, 'em', q.pedido_cliente_em) END,
    'recusa', CASE WHEN q.recusada_em IS NOT NULL OR q.recusa_motivos IS NOT NULL THEN
      jsonb_build_object('motivos', to_jsonb(coalesce(q.recusa_motivos, '{}')), 'nota', q.recusa_nota, 'em', q.recusada_em) END,
    'enviado_em', q.enviado_em, 'aceite_em', q.accepted_at, 'substituido_em', q.substituido_em, 'aceite_antes_em', q.aceite_antes_em,
    'preco_final', q.preco_final, 'total_com_iva', q.total_com_iva, 'prestacoes_por_fases', q.prestacoes_por_fases, 'sem_demolicao', q.sem_demolicao,
    'linhas', (SELECT jsonb_agg(jsonb_build_object(
        'ordem', l.ordem, 'tipo', l.tipo_emylia, 'servico', l.service_id, 'descricao', l.descricao_snapshot, 'unidade', l.unidade,
        'quantidade', coalesce(l.quantidade_exata, l.qt), 'preco_un', coalesce(l.preco_un_exato, l.retail_price_unit, 0),
        'parte_iva', CASE WHEN l.tipo_emylia = 'servico' THEN 'mao_obra' ELSE 'materiais' END,
        'taxa_iva', CASE WHEN l.iva_explicita THEN l.iva_percent END, 'fornecedor', l.fornecedor,
        'qtd_origem', l.qtd_origem, 'preco_un_origem', l.preco_un_origem, 'custo_un_origem', l.custo_un_origem,
        'custo', jsonb_build_object('custo_un', coalesce(l.custo_un_exato, l.cost_price, 0), 'manual', l.custo_manual, 'congelado', coalesce(c.congelado, false),
          'horas_un', coalesce(c.horas_un, 0), 'mao_obra_un', coalesce(c.mao_obra_un, 0), 'equipamentos_un', coalesce(c.equipamentos_un, 0),
          'consumiveis_un', coalesce(c.consumiveis_un, 0), 'estrutura_hora', coalesce(c.estrutura_hora, 0), 'estrutura_un', coalesce(c.estrutura_un, 0),
          'ajuste_un', coalesce(c.ajuste_un, 0), 'congelado_em', c.congelado_em,
          'oficios', coalesce((SELECT jsonb_agg(jsonb_build_object('perfil_chave', o.perfil_chave, 'nome', o.nome, 'horas_un', o.horas_un, 'custo_hora', o.custo_hora,
                     'tecnicos', o.tecnicos) ORDER BY o.ordem) FROM quote_line_oficios o WHERE o.quote_line_id = l.id), '[]')),
        'zonas', (SELECT jsonb_agg(jsonb_build_object('zona', z.nome, 'quantidade', lz.quantidade, 'valor', lz.valor) ORDER BY lz.ordem)
                  FROM quote_line_zonas lz JOIN quote_zonas z ON z.id = lz.zona_id WHERE lz.quote_line_id = l.id)
      ) ORDER BY l.ordem) FROM quote_lines l LEFT JOIN quote_line_custos c ON c.quote_line_id = l.id WHERE l.quote_id = q.id),
    'zonas', (SELECT jsonb_agg(z.nome ORDER BY z.ordem) FROM quote_zonas z WHERE z.quote_id = q.id),
    'prazo', coalesce((SELECT jsonb_agg(jsonb_build_object('tarefa', p.tarefa, 'dias', p.dias) ORDER BY p.tarefa) FROM quote_prazo p WHERE p.quote_id = q.id), '[]'),
    'prestacoes', coalesce((SELECT jsonb_agg(jsonb_build_object('ordem', p.ordem, 'rotulo', p.rotulo, 'pct', p.pct, 'marco', p.marco, 'fase', p.fase) ORDER BY p.ordem)
                  FROM quote_prestacoes p WHERE p.quote_id = q.id), '[]'),
    'avisos', coalesce((SELECT jsonb_agg(a.chave ORDER BY a.chave) FROM quote_avisos_vistos a WHERE a.quote_id = q.id), '[]'),
    'precos_manuais', (SELECT jsonb_agg(jsonb_build_object('descricao', p.descricao, 'preco', p.preco) ORDER BY p.descricao) FROM quote_precos_manuais p WHERE p.quote_id = q.id),
    'produtos', (SELECT jsonb_agg(jsonb_build_object('ordem', p.ordem, 'produto', p.produto_id, 'nome', p.nome, 'unidade', p.unidade, 'custo_un', p.custo_un,
                  'pvp_un', p.pvp_un, 'categoria', p.categoria_id, 'quantidade', p.quantidade, 'cliente_fornece', p.cliente_fornece, 'servico', p.servico_id,
                  'fator', p.fator, 'sem_instalacao', p.sem_instalacao) ORDER BY p.ordem) FROM quote_versao_produtos p WHERE p.quote_id = q.id),
    'partes_fora', (SELECT jsonb_agg(p.parte ORDER BY p.parte) FROM quote_versao_partes p WHERE p.quote_id = q.id)
  ) FROM quotes q WHERE q.id = p_quote
$$;

CREATE OR REPLACE FUNCTION public.fn_neg_ler_contrato(p_contract uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'versao', c.versao,
    'estado', CASE WHEN c.replaced_by_contract_id IS NOT NULL THEN 'substituido' WHEN c.status IN ('signed','assinado','active') THEN 'assinado'
                   WHEN c.status = 'pending_signature' THEN 'enviado' WHEN c.status = 'changes_requested' THEN 'alteracoes_pedidas' ELSE 'rascunho' END,
    'substituido_em', CASE WHEN c.replaced_by_contract_id IS NOT NULL THEN c.cancelled_at END,
    'revisto_por', c.revisto_por, 'revisto_em', c.revisto_em, 'assinado_em', c.signature_date,
    'pedidos', coalesce((SELECT jsonb_agg(jsonb_build_object('clausula', p.clausula, 'nota', p.nota, 'pedido_em', p.pedido_em) ORDER BY p.ordem)
                FROM client_contract_pedidos p WHERE p.contract_id = c.id), '[]'),
    'clausulas', coalesce((SELECT jsonb_agg(jsonb_build_object('titulo', k.titulo, 'texto', k.texto) ORDER BY k.titulo) FROM client_contract_clausulas k
                WHERE k.contract_id = c.id), '[]'),
    'assinatura', CASE WHEN c.signature_method IS NOT NULL THEN jsonb_build_object('metodo', c.signature_method, 'nome', c.signed_by_name,
                'identificador', c.signature_reference, 'telefone_mascarado', c.signature_phone_masked, 'assinado_em', c.signature_date) END
  ) FROM client_contracts c WHERE c.id = p_contract
$$;

-- ------------------------------------------------------------------ gravar
CREATE OR REPLACE FUNCTION public.neg_guardar_negocio(p_org uuid, p_negocio_id uuid, p_linhas jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'pessoas.edit');
  v_neg negocios; b jsonb := p_linhas->'negocio'; e jsonb; o jsonb; l jsonb; k jsonb;
  v_q uuid; v_l uuid; v_z uuid; v_prop uuid; v_atual uuid; v_aceite uuid; v_c uuid; v_c_ant uuid; v_f uuid; v_pg uuid;
  i int; v_iva numeric; v_tot numeric; v_estado text; v_status text; v_ids uuid[] := '{}';
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
        iva_percent, iva_explicita, total_sem_iva, total_com_iva, total_com_desconto, ordem, service_id, unidade, section_name, tipo_emylia, custo_manual, fornecedor,
        qtd_origem, preco_un_origem, custo_un_origem, custo_mao_obra_unit, custo_material_unit, margem_percent)
      VALUES (v_q, CASE WHEN l->>'tipo' = 'servico' THEN 'Serviços' ELSE 'Materiais' END,
        coalesce((SELECT s.name FROM services s WHERE s.id = (l->>'servico')::uuid), l->>'descricao', ''),
        round((l->>'quantidade')::numeric, 2), (l->>'quantidade')::numeric, round((l->>'preco_un')::numeric, 2), (l->>'preco_un')::numeric,
        (l->'custo'->>'custo_un')::numeric, (l->'custo'->>'custo_un')::numeric, v_iva, l->>'taxa_iva' IS NOT NULL,
        v_tot, round(v_tot * (1 + v_iva / 100), 2), v_tot, (l->>'ordem')::int, (l->>'servico')::uuid, l->>'unidade',
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

  RETURN jsonb_build_object('negocio_id', p_negocio_id, 'proposta_id', v_prop, 'orcamento_atual_id', v_atual);
END $$;

REVOKE ALL ON FUNCTION public.neg_ler_negocios(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_ler_negocios(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.neg_guardar_negocio(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_guardar_negocio(uuid, uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_ler_orcamento(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_neg_ler_contrato(uuid) FROM PUBLIC, anon, authenticated;

RESET lock_timeout;
