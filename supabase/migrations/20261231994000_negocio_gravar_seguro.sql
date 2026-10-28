-- Negócio (Fase 0): a gravação do Negócio da Emylia deixa de assinar, de desfazer o que o cliente decidiu no portal e de estragar os
-- negócios do CRM. Não acrescenta tabelas nem colunas; reescreve cinco funções a partir do texto vivo (o da 20261231990000) e junta uma.
--
--   1. As decisões do cliente só as escreve o portal (servidor). neg_guardar_negocio e fn_neg_guardar_adendas:
--      quotes            um orçamento aceite ou recusado não muda de estado (só passa a substituído, quando há versão nova); o JSON não o
--                        dá como aceite nem recusado (fica o da base e junta-se um aviso); accepted_at, recusada_em e recusa_* deixam de
--                        se escrever (ficam os da base).
--      proposals         o estado só se sincroniza de rascunho/enviada para rascunho/enviada; accepted_at, rejected_at e
--                        rejection_notes deixam de se escrever.
--      client_contracts  deixam de se escrever signature_*, signed_by_name e signature_date; o estado vindo do JSON só pode ser draft,
--                        pending_signature, changes_requested ou cancelled por substituição; um contrato signed, rejected ou
--                        cancelled não se mexe (nem passa a substituído); "assinado" no JSON é ignorado, com aviso.
--      (ec_emitida_em, faturas, pagamentos, recibos e anulado_* ficam para a fase 2.)
--   2. Os negócios do CRM. fn_neg_docs_crm(negócio): tem orçamentos que não são da Emylia, contratos do CRM (sem versão nem adenda) ou
--      vendas diretas ligadas a um contrato dele. neg_guardar_negocio recusa-os (NE005) se o negócio não for da Emylia, e deixa de pôr
--      fluxo_emylia = true sem condições (com fluxo_emylia, fn_ec_emitida deixava de reservar o stock das encomendas do CRM).
--      neg_ler_negocios devolve docs_crm, para o ecrã os abrir só de leitura.
--   3. O orçamento aceite não se reescreve: um quote aceite, ligado a um contrato assinado ou com a encomenda emitida, ou com linhas
--      usadas por uma encomenda a fornecedor (purchase_order_items) ou por uma tarefa da obra (ops_obra_tarefa), fica com as linhas e as
--      zonas que tem (os ids não mudam); se o JSON divergir, junta-se um aviso.
--   4. fn_neg_guardar_adendas passa a devolver os avisos (text[]); neg_guardar_negocio junta-os aos seus e aos da agenda.
--   5. Leitura: fn_neg_ler_contrato devolve o id e a assinatura do portal (signature_image, sem método: "portal_sms");
--      fn_neg_ler_orcamento devolve "recusado" para os orçamentos que o portal deu como "rejeitado" (ou "rejected").
--
-- Cada função parte do texto vivo depois da 20261231990000. A migration pára se alguma delas tiver mudado entretanto (md5 do texto).

SET lock_timeout = '5s';

DO $do$
DECLARE
  v text; r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.neg_guardar_negocio(uuid,uuid,jsonb)', '16b550897d0dab0ce3923eec0226fec5'),
    ('public.fn_neg_guardar_adendas(uuid,uuid,jsonb,uuid)', '693c3579bf63af4131f2c104df80558d'),
    ('public.fn_neg_ler_contrato(uuid)', '700093dfbbe0f2de0639eda4e6764047'),
    ('public.fn_neg_ler_orcamento(uuid)', 'c5bb7b0627acf80ebd90647f2338a09f'),
    ('public.neg_ler_negocios(uuid)', '63be57fbd162e3c3d6b830021cd6de3e')
  ) AS t(assinatura, md5) LOOP
    v := pg_get_functiondef(r.assinatura::regprocedure);
    IF position('20261231994000' IN v) = 0 AND md5(v) <> r.md5 THEN
      RAISE EXCEPTION 'A função % mudou depois da 20261231990000: rever a migration 20261231994000 contra o texto vivo.', r.assinatura;
    END IF;
  END LOOP;
END $do$;

-- ------------------------------------------------------------------ o negócio tem documentos do CRM
CREATE OR REPLACE FUNCTION public.fn_neg_docs_crm(p_negocio uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  -- orçamentos fora do fluxo da Emylia, contratos do CRM (os da Emylia têm versão ou adenda) e vendas diretas num contrato do negócio
  SELECT EXISTS (SELECT 1 FROM quotes q WHERE q.negocio_id = p_negocio AND q.fluxo_emylia IS NOT TRUE AND q.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM client_contracts c WHERE c.negocio_id = p_negocio AND c.versao IS NULL AND c.adenda_id IS NULL AND c.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM direct_sales d JOIN client_contracts c ON c.id = d.client_contract_id
                 WHERE c.negocio_id = p_negocio AND d.deleted_at IS NULL AND c.deleted_at IS NULL)
$$;
COMMENT ON FUNCTION public.fn_neg_docs_crm(uuid) IS 'Negócio: tem orçamentos, contratos ou vendas diretas do CRM (abre-se em Contratos/Propostas, não no ecrã da Emylia).';
REVOKE ALL ON FUNCTION public.fn_neg_docs_crm(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_docs_crm(uuid) TO service_role;

-- ------------------------------------------------------------------ ler
CREATE OR REPLACE FUNCTION public.fn_neg_ler_contrato(p_contract uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20261231994000: o id do contrato e a assinatura do portal (signature_image, sem método: a prova é o código por SMS do portal)
  SELECT jsonb_build_object(
    'id', c.id,
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
                'identificador', c.signature_reference, 'telefone_mascarado', c.signature_phone_masked, 'assinado_em', c.signature_date)
                WHEN c.signature_image IS NOT NULL THEN jsonb_build_object('metodo', 'portal_sms', 'nome', c.signed_by_name,
                'identificador', NULL, 'telefone_mascarado', c.signature_phone_masked, 'assinado_em', c.signature_date) END
  ) FROM client_contracts c WHERE c.id = p_contract
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_ler_contrato(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_ler_contrato(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_neg_ler_orcamento(p_quote uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20261231994000: o portal recusa com "rejeitado"; a Emylia chama-lhe "recusado"
  SELECT jsonb_build_object(
    'versao', q.versao, 'estado', CASE WHEN q.estado IN ('rejeitado', 'rejected') THEN 'recusado' ELSE q.estado END, 'modelo', q.modelo_base,
    'desconto', coalesce(q.desconto_fracao, 0), 'venda_direta', q.venda_direta,
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
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_ler_orcamento(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_ler_orcamento(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.neg_ler_negocios(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        'fluxo_emylia', n.fluxo_emylia,
        -- tem documentos do CRM: o ecrã da Emylia abre-o só de leitura (20261231994000)
        'docs_crm', public.fn_neg_docs_crm(n.id)),
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
                    FROM faturas f LEFT JOIN quote_prestacoes qp ON qp.id = f.quote_prestacao_id WHERE f.negocio_id = n.id AND f.chave IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM quotes qa WHERE qa.id = qp.quote_id AND qa.adenda_id IS NOT NULL)),
      -- as adendas (20261231990000)
      'adendas', public.fn_neg_ler_adendas(n.id),
      'historico', coalesce((SELECT jsonb_agg(jsonb_build_object('ordem', h.ordem, 'texto', h.texto, 'tipo', h.tipo, 'ocorrido_em', h.ocorrido_em) ORDER BY h.ordem)
                    FROM negocio_historico h WHERE h.negocio_id = n.id), '[]')
    ) j
    FROM negocios n
    LEFT JOIN anew_entities e ON e.id = n.entity_id
    LEFT JOIN negocio_medidas m ON m.negocio_id = n.id
    WHERE n.organization_id = p_org AND n.deleted_at IS NULL AND n.numero IS NOT NULL
  ) x;
  RETURN r;
END $function$;
REVOKE ALL ON FUNCTION public.neg_ler_negocios(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_ler_negocios(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------ gravar as adendas (passa a devolver os avisos)
DROP FUNCTION IF EXISTS public.fn_neg_guardar_adendas(uuid, uuid, jsonb, uuid);
CREATE FUNCTION public.fn_neg_guardar_adendas(p_org uuid, p_negocio_id uuid, p_adendas jsonb, p_user uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_neg negocios; a jsonb; o jsonb; l jsonb; e jsonb;
  v_ad uuid; v_q uuid; v_atual uuid; v_base uuid; v_l uuid; v_c uuid; v_c_ant uuid; v_f uuid; v_pg uuid; v_pr uuid;
  v_iva numeric; v_tot numeric; v_base_mo numeric; v_status text; v_pago timestamptz;
  v_estado text; v_q_base text; v_c_base text; v_fixo boolean; v_avisos text[] := '{}';
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio_id AND organization_id = p_org;
  -- as parcelas das adendas são as do contrato: as do orçamento aceite em vigor
  SELECT id INTO v_base FROM quotes WHERE negocio_id = p_negocio_id AND fluxo_emylia AND deleted_at IS NULL AND estado = 'aceite' ORDER BY versao DESC LIMIT 1;

  FOR a IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(p_adendas)) ORDER BY (value->>'numero')::int LOOP
    INSERT INTO adendas AS x (organization_id, negocio_id, numero, referencia, estado, motivo, imprevisto_ref, origem_texto, origem_onde, origem_foto,
      criada_em, enviada_em, aceite_em, assinada_em, recusada_em, recusa_motivo, anulada_em, total, total_com_iva, vista)
    VALUES (p_org, p_negocio_id, (a->>'numero')::smallint, a->>'referencia', a->>'estado', coalesce(a->>'motivo', ''),
      a->'origem'->>'imprevisto', a->'origem'->>'texto', a->'origem'->>'onde', a->'origem'->>'foto',
      coalesce((a->>'criada_em')::timestamptz, now()), (a->>'enviada_em')::timestamptz, (a->>'aceite_em')::timestamptz, (a->>'assinada_em')::timestamptz,
      (a->>'recusada_em')::timestamptz, a->>'recusa', CASE WHEN a->>'estado' = 'anulada' THEN now() END,
      (a->>'total')::numeric, (a->>'total_com_iva')::numeric, coalesce((a->>'vista')::boolean, false))
    ON CONFLICT (negocio_id, numero) DO UPDATE SET referencia = EXCLUDED.referencia, estado = EXCLUDED.estado, motivo = EXCLUDED.motivo,
      imprevisto_ref = EXCLUDED.imprevisto_ref, origem_texto = EXCLUDED.origem_texto, origem_onde = EXCLUDED.origem_onde, origem_foto = EXCLUDED.origem_foto,
      criada_em = EXCLUDED.criada_em, enviada_em = EXCLUDED.enviada_em, aceite_em = EXCLUDED.aceite_em, assinada_em = EXCLUDED.assinada_em,
      recusada_em = EXCLUDED.recusada_em, recusa_motivo = EXCLUDED.recusa_motivo,
      anulada_em = CASE WHEN EXCLUDED.estado = 'anulada' THEN coalesce(x.anulada_em, now()) END,
      total = EXCLUDED.total, total_com_iva = EXCLUDED.total_com_iva, vista = EXCLUDED.vista
    RETURNING id INTO v_ad;

    -- as versões da proposta da adenda (quotes), a atual é a última
    v_atual := NULL;
    FOR o IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(a->'versoes')) ORDER BY (value->>'versao')::int LOOP
      SELECT id INTO v_q FROM quotes WHERE adenda_id = v_ad AND versao = (o->>'versao')::smallint AND deleted_at IS NULL;
      IF v_q IS NULL THEN
        INSERT INTO quotes (organization_id, root_organization_id, entity_id, created_by, title, modelo_base, versao, fluxo_emylia, estado, adenda_id)
        VALUES (p_org, v_neg.root_organization_id, v_neg.entity_id, p_user,
          'Adenda ' || coalesce(a->>'referencia', v_neg.numero || '-' || (a->>'numero')) || ' · versão ' || (o->>'versao'), 'adenda',
          (o->>'versao')::smallint, true, 'rascunho', v_ad)
        RETURNING id INTO v_q;
      END IF;
      -- a decisão do cliente (aceite, recusado) só a escreve o portal; a versão decidida só passa a substituída (20261231994000)
      SELECT estado INTO v_q_base FROM quotes WHERE id = v_q;
      v_estado := o->>'estado';
      IF v_q_base IN ('aceite', 'rejeitado', 'recusado') THEN
        IF v_estado IS DISTINCT FROM 'substituido' THEN v_estado := v_q_base; END IF;
      ELSIF v_estado IN ('aceite', 'recusado', 'rejeitado') THEN
        v_avisos := v_avisos || format('Adenda %s, versão %s: a decisão do cliente só se regista no portal (ficou %s).',
          coalesce(a->>'referencia', a->>'numero'), o->>'versao', coalesce(v_q_base, 'rascunho'));
        v_estado := coalesce(v_q_base, 'rascunho');
      END IF;
      UPDATE quotes SET estado = v_estado, desconto_fracao = (o->>'desconto')::numeric,
        desconto_global_percent = round(coalesce((o->>'desconto')::numeric, 0) * 100, 2),
        verificado_em = CASE WHEN coalesce((o->>'verificado')::boolean, false) THEN coalesce(verificado_em, now()) END, aprovacao = o->>'aprovacao',
        motivos_versao = ARRAY(SELECT jsonb_array_elements_text(public.fn_neg_lista(o->'motivos'))), nota_versao = o->>'nota',
        pedido_cliente_motivos = CASE WHEN jsonb_typeof(o->'pedido_cliente') = 'object' THEN ARRAY(SELECT jsonb_array_elements_text(public.fn_neg_lista(o->'pedido_cliente'->'motivos'))) END,
        pedido_cliente_nota = o->'pedido_cliente'->>'nota', pedido_cliente_em = (o->'pedido_cliente'->>'em')::timestamptz,
        enviado_em = (o->>'enviado_em')::timestamptz, substituido_em = (o->>'substituido_em')::timestamptz,
        preco_final = (o->>'total')::numeric, total_com_iva = (o->>'total_com_iva')::numeric
      WHERE id = v_q;

      -- as linhas de uma versão aceite, assinada, com encomenda emitida ou já usadas (encomenda a fornecedor, tarefa da obra) não se
      -- apagam nem se reescrevem: os ids ficam (20261231994000)
      v_fixo := v_q_base = 'aceite'
        OR EXISTS (SELECT 1 FROM client_contracts c WHERE c.quote_id = v_q AND c.deleted_at IS NULL
                   AND (c.status IN ('signed', 'assinado', 'active') OR c.ec_emitida_em IS NOT NULL))
        OR EXISTS (SELECT 1 FROM quote_lines ql JOIN purchase_order_items pi ON pi.quote_line_id = ql.id WHERE ql.quote_id = v_q)
        OR EXISTS (SELECT 1 FROM quote_lines ql JOIN ops_obra_tarefa t ON t.orcamento_linha_id = ql.id WHERE ql.quote_id = v_q);
      IF v_fixo THEN
        IF (SELECT count(*) FROM quote_lines WHERE quote_id = v_q) <> jsonb_array_length(public.fn_neg_lista(o->'linhas'))
           OR (SELECT coalesce(sum(total_sem_iva), 0) FROM quote_lines WHERE quote_id = v_q)
              <> (SELECT coalesce(sum(round((x->>'quantidade')::numeric * (x->>'preco_un')::numeric, 2)), 0) FROM jsonb_array_elements(public.fn_neg_lista(o->'linhas')) x) THEN
          v_avisos := v_avisos || format('Adenda %s, versão %s: já está aceite ou em curso, as linhas ficaram como estavam.',
            coalesce(a->>'referencia', a->>'numero'), o->>'versao');
        END IF;
      ELSE
      DELETE FROM quote_lines WHERE quote_id = v_q;
      FOR l IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(o->'linhas')) LOOP
        -- a mão de obra a 6% (os materiais das linhas livres, a 23%, contam nos totais da adenda)
        v_iva := 6;
        v_tot := round((l->>'quantidade')::numeric * (l->>'preco_un')::numeric, 2);
        INSERT INTO quote_lines (quote_id, categoria, descricao_snapshot, qt, quantidade_exata, retail_price_unit, preco_un_exato, cost_price, custo_un_exato,
          iva_percent, iva_explicita, total_sem_iva, total_com_iva, total_com_desconto, ordem, service_id, unidade, section_name, tipo_emylia, custo_manual,
          custo_mao_obra_unit, custo_material_unit, margem_percent, chave_emylia, perfil_nome, perfil_chave, mao_obra_congelada)
        VALUES (v_q, 'Serviços', coalesce(l->>'descricao', ''), round((l->>'quantidade')::numeric, 2), (l->>'quantidade')::numeric,
          round((l->>'preco_un')::numeric, 2), (l->>'preco_un')::numeric, round(coalesce((l->>'custo_un')::numeric, 0), 2), (l->>'custo_un')::numeric,
          v_iva, false, v_tot, round(v_tot * (1 + v_iva / 100), 2), v_tot, (l->>'ordem')::int,
          CASE WHEN coalesce((l->>'livre')::boolean, false) THEN NULL ELSE (l->>'servico')::uuid END, l->>'unidade', 'Adenda',
          CASE WHEN coalesce((l->>'livre')::boolean, false) THEN 'livre' ELSE 'servico' END, false,
          round(coalesce((l->>'custo_un')::numeric, 0), 2), 0, 0, l->>'chave', l->>'perfil', l->>'perfil_chave', (l->>'mao_obra_un')::numeric)
        RETURNING id INTO v_l;
        INSERT INTO quote_line_custos (organization_id, quote_line_id, congelado, horas_un, mao_obra_un)
        VALUES (p_org, v_l, l->>'custo_un' IS NOT NULL, coalesce((l->>'horas_un')::numeric, 0), coalesce((l->>'mao_obra_un')::numeric, 0));
        INSERT INTO quote_line_materiais (organization_id, quote_line_id, ordem, nome, quantidade, unidade, preco, fornecedor)
        SELECT p_org, v_l, (x.n - 1)::smallint, x.v->>'nome', (x.v->>'quantidade')::numeric, coalesce(x.v->>'unidade', ''), (x.v->>'preco')::numeric, x.v->>'fornecedor'
        FROM jsonb_array_elements(public.fn_neg_lista(l->'materiais')) WITH ORDINALITY x(v, n);
      END LOOP;
      END IF;
      v_atual := v_q;
    END LOOP;

    -- as parcelas (as do contrato), na versão atual
    IF v_atual IS NOT NULL AND NOT EXISTS (SELECT 1 FROM quote_prestacoes WHERE quote_id = v_atual) THEN
      IF v_base IS NOT NULL AND EXISTS (SELECT 1 FROM quote_prestacoes WHERE quote_id = v_base) THEN
        INSERT INTO quote_prestacoes (organization_id, quote_id, ordem, rotulo, pct, marco, fase)
        SELECT p_org, v_atual, ordem, rotulo, pct, marco, fase FROM quote_prestacoes WHERE quote_id = v_base;
      ELSE
        INSERT INTO quote_prestacoes (organization_id, quote_id, ordem, rotulo, pct, marco, fase) VALUES (p_org, v_atual, 1, 'Única', 1, 'adjudicacao', NULL);
      END IF;
    END IF;

    -- o contrato da adenda (client_contracts), uma linha por versão; a anterior fica substituída pela seguinte
    v_c_ant := NULL;
    FOR o IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(a->'contratos')) ORDER BY (value->>'versao')::int LOOP
      SELECT id, status INTO v_c, v_c_base FROM client_contracts WHERE adenda_id = v_ad AND versao = (o->>'versao')::smallint AND deleted_at IS NULL;
      IF v_c IS NULL THEN
        -- depois de uma versão assinada no portal não nasce outra: escondia a assinada (20261231994000)
        IF v_c_ant IS NOT NULL AND EXISTS (SELECT 1 FROM client_contracts WHERE id = v_c_ant AND status IN ('signed', 'assinado', 'active')) THEN
          v_avisos := v_avisos || format('Adenda %s: o contrato já está assinado no portal; a versão %s não foi criada.',
            coalesce(a->>'referencia', a->>'numero'), o->>'versao');
          EXIT;
        END IF;
        INSERT INTO client_contracts (organization_id, root_organization_id, entity_id, created_by, status, versao, quote_id, replaces_contract_id, adenda_id)
        VALUES (p_org, v_neg.root_organization_id, v_neg.entity_id, p_user, 'draft', (o->>'versao')::smallint, v_atual, v_c_ant, v_ad)
        RETURNING id, status INTO v_c, v_c_base;
      END IF;
      IF v_c_ant IS NOT NULL THEN
        UPDATE client_contracts SET replaced_by_contract_id = v_c, status = 'cancelled', cancelled_at = coalesce(cancelled_at, (o->>'substituido_em')::timestamptz, now())
        WHERE id = v_c_ant AND replaced_by_contract_id IS DISTINCT FROM v_c AND status NOT IN ('signed', 'assinado', 'active', 'rejected', 'cancelled');
      END IF;
      -- um contrato assinado, recusado ou cancelado não se mexe; a assinatura (signature_*, signed_by_name, signature_date) e o estado
      -- assinado só os escreve o portal (20261231994000)
      IF v_c_base IN ('signed', 'assinado', 'active', 'rejected', 'cancelled') THEN
        v_c_ant := v_c;
        CONTINUE;
      END IF;
      IF o->>'estado' = 'assinado' THEN v_avisos := v_avisos || 'A assinatura só se faz no portal do cliente.'::text; END IF;
      v_status := CASE o->>'estado' WHEN 'enviado' THEN 'pending_signature' WHEN 'alteracoes_pedidas' THEN 'changes_requested'
                    WHEN 'substituido' THEN 'cancelled' WHEN 'assinado' THEN v_c_base ELSE 'draft' END;
      UPDATE client_contracts SET revisto_por = o->>'revisto_por', revisto_em = (o->>'revisto_em')::timestamptz,
        quote_id = coalesce(v_atual, quote_id), updated_at = now()
      WHERE id = v_c;
      UPDATE client_contracts SET status = v_status, status_changed_by = p_user, status_changed_at = now()
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

    -- as faturas, uma por parcela, com o pagamento e o recibo; nunca se apagam
    v_pago := NULL;
    FOR o IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(a->'faturas')) LOOP
      v_tot := (o->>'total')::numeric;
      SELECT id INTO v_f FROM faturas WHERE negocio_id = p_negocio_id AND chave = o->>'chave';
      IF v_f IS NULL THEN
        SELECT p.id INTO v_pr FROM quote_prestacoes p WHERE p.quote_id = v_atual AND p.ordem = (o->>'parcela')::smallint;
        IF v_pr IS NULL THEN
          RAISE EXCEPTION 'A adenda % não tem a parcela % do contrato.', a->>'referencia', o->>'parcela' USING ERRCODE = 'NE004';
        END IF;
        -- a fatura certificada é do ERP: aqui o total; o IVA reparte-se pelo da adenda (a exata vem do Eticadata)
        v_iva := CASE WHEN (a->>'total_com_iva')::numeric > 0 THEN round(v_tot * (1 - (a->>'total')::numeric / (a->>'total_com_iva')::numeric), 2) ELSE 0 END;
        v_base_mo := CASE WHEN (a->>'total')::numeric > 0 THEN round((v_tot - v_iva) * least(1, coalesce((a->>'mao_obra')::numeric, (a->>'total')::numeric) / (a->>'total')::numeric), 2)
                          ELSE v_tot - v_iva END;
        INSERT INTO faturas (organization_id, negocio_id, quote_prestacao_id, numero, emitida_em, emitida_por, base_mao_obra, base_materiais, iva, total, chave)
        VALUES (p_org, p_negocio_id, v_pr, o->>'numero', coalesce((o->>'emitida_em')::timestamptz, now()), p_user, v_base_mo, v_tot - v_iva - v_base_mo, v_iva, v_tot, o->>'chave')
        RETURNING id INTO v_f;
      END IF;
      DELETE FROM fatura_avisos_cliente WHERE fatura_id = v_f;
      INSERT INTO fatura_avisos_cliente (organization_id, fatura_id, campo, valor)
      SELECT DISTINCT ON (x->>'campo') p_org, v_f, x->>'campo', coalesce(x->>'valor', '') FROM jsonb_array_elements(public.fn_neg_lista(o->'aviso')) x;
      IF jsonb_typeof(o->'recibo') = 'object' THEN
        SELECT id INTO v_pg FROM pagamentos WHERE fatura_id = v_f ORDER BY comunicado_em LIMIT 1;
        IF v_pg IS NULL THEN
          INSERT INTO pagamentos (organization_id, fatura_id, metodo, valor, referencia, comunicado_em, validado_em, validado_por)
          VALUES (p_org, v_f,
            CASE WHEN lower(coalesce((SELECT valor FROM fatura_avisos_cliente WHERE fatura_id = v_f AND campo = 'metodo'), '')) LIKE 'd%bito%' THEN 'debito_direto'
                 WHEN lower(coalesce((SELECT valor FROM fatura_avisos_cliente WHERE fatura_id = v_f AND campo = 'metodo'), '')) LIKE 'multibanco%' THEN 'multibanco'
                 ELSE 'transferencia' END,
            v_tot, (SELECT valor FROM fatura_avisos_cliente WHERE fatura_id = v_f AND campo = 'comprovativo'),
            coalesce((o->'recibo'->>'em')::timestamptz, now()), coalesce((o->'recibo'->>'em')::timestamptz, now()), p_user)
          RETURNING id INTO v_pg;
          UPDATE faturas SET estado = 'paga' WHERE id = v_f;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM recibos WHERE pagamento_id = v_pg) THEN
          INSERT INTO recibos (organization_id, pagamento_id, numero, emitido_em) VALUES (p_org, v_pg, o->'recibo'->>'numero', coalesce((o->'recibo'->>'em')::timestamptz, now()));
        END IF;
        IF (o->>'parcela')::int = 1 THEN v_pago := coalesce((o->'recibo'->>'em')::timestamptz, now()); END IF;
      END IF;
    END LOOP;

    -- a encomenda dos materiais da adenda: com a 1.ª parcela paga, a seguir à encomenda de cliente do negócio (decisão B da Emylia)
    IF v_pago IS NOT NULL AND EXISTS (SELECT 1 FROM client_contracts WHERE negocio_id = p_negocio_id AND ec_emitida_em IS NOT NULL AND deleted_at IS NULL) THEN
      UPDATE client_contracts SET ec_emitida_em = v_pago, ec_emitida_por = 'Financeiro'
      WHERE adenda_id = v_ad AND replaced_by_contract_id IS NULL AND status IN ('signed', 'assinado') AND ec_emitida_em IS NULL AND deleted_at IS NULL;
    END IF;
  END LOOP;
  RETURN v_avisos;
END $function$;
REVOKE ALL ON FUNCTION public.fn_neg_guardar_adendas(uuid, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_guardar_adendas(uuid, uuid, jsonb, uuid) TO service_role;

-- ------------------------------------------------------------------ gravar o negócio
CREATE OR REPLACE FUNCTION public.neg_guardar_negocio(p_org uuid, p_negocio_id uuid, p_linhas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'pessoas.edit');
  v_neg negocios; b jsonb := p_linhas->'negocio'; e jsonb; o jsonb; l jsonb; k jsonb;
  v_q uuid; v_l uuid; v_z uuid; v_prop uuid; v_atual uuid; v_aceite uuid; v_c uuid; v_c_ant uuid; v_f uuid; v_pg uuid;
  i int; v_iva numeric; v_tot numeric; v_estado text; v_status text; v_ids uuid[] := '{}'; v_avisos text[] := '{}';
  v_docs_crm boolean; v_q_base text; v_c_base text; v_fixo boolean;
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio_id AND organization_id = p_org AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negócio não encontrado nesta organização.' USING ERRCODE = 'NE003'; END IF;

  -- um negócio do CRM (orçamentos, contratos ou vendas diretas do CRM) não se grava por aqui: abre-se em Contratos/Propostas; e o
  -- negócio só passa ao fluxo da Emylia se não tiver documentos do CRM (com fluxo_emylia a encomenda do CRM deixava de reservar) (20261231994000)
  v_docs_crm := public.fn_neg_docs_crm(p_negocio_id);
  IF NOT coalesce(v_neg.fluxo_emylia, false) AND v_docs_crm THEN
    RAISE EXCEPTION 'Este negócio é do CRM: abra-o em Contratos/Propostas.' USING ERRCODE = 'NE005';
  END IF;

  -- o negócio (o título só muda num negócio aberto: o CRM protege o dos fechados)
  UPDATE negocios SET fase = (b->>'fase')::smallint, linha = b->>'linha', linha_por_definir = coalesce((b->>'linha_por_definir')::boolean, false),
    servico_pedido = b->>'servico_pedido', morada_obra = b->>'morada_obra', origem = b->>'origem', pedido_em = (b->>'pedido_em')::timestamptz,
    dono_papel = b->>'dono_papel', anulado_em = (b->>'anulado_em')::timestamptz, anulado_por = b->>'anulado_por', anulado_motivo = b->>'anulado_motivo',
    anulado_origem = b->>'anulado_origem', fatura_numero = b->>'fatura_numero', fatura_em = (b->>'fatura_em')::timestamptz,
    fatura_paga = coalesce((b->>'fatura_paga')::boolean, false), recibo_numero = b->>'recibo_numero', recibo_em = (b->>'recibo_em')::timestamptz,
    fluxo_emylia = coalesce(v_neg.fluxo_emylia, false) OR NOT v_docs_crm,
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
    -- a decisão do cliente (aceite, recusado) só a escreve o portal: a versão decidida fica como está (só passa a substituída, quando
    -- há versão nova); o JSON não a dá como aceite nem recusada; accepted_at, recusada_em e recusa_* ficam os da base (20261231994000)
    SELECT estado INTO v_q_base FROM quotes WHERE id = v_q;
    v_estado := o->>'estado';
    IF v_q_base IN ('aceite', 'rejeitado', 'recusado') THEN
      IF v_estado IS DISTINCT FROM 'substituido' THEN v_estado := v_q_base; END IF;
    ELSIF v_estado IN ('aceite', 'recusado', 'rejeitado') THEN
      v_avisos := v_avisos || format('Orçamento versão %s: a decisão do cliente só se regista no portal (ficou %s).', o->>'versao', coalesce(v_q_base, 'rascunho'));
      v_estado := coalesce(v_q_base, 'rascunho');
    END IF;
    UPDATE quotes SET modelo_base = coalesce(o->>'modelo', ''), estado = v_estado, desconto_fracao = (o->>'desconto')::numeric,
      desconto_global_percent = round(coalesce((o->>'desconto')::numeric, 0) * 100, 2), venda_direta = coalesce((o->>'venda_direta')::boolean, false),
      inicio_obra = (o->>'inicio_obra')::date, equipa = (o->>'equipa')::smallint,
      verificado_em = CASE WHEN coalesce((o->>'verificado')::boolean, false) THEN coalesce(verificado_em, now()) END,
      aprovacao = o->>'aprovacao', motivos_versao = ARRAY(SELECT jsonb_array_elements_text(public.fn_neg_lista(o->'motivos_versao'))), nota_versao = o->>'nota_versao',
      onde_refeita = o->>'onde_refeita',
      pedido_cliente_motivos = CASE WHEN o->'pedido_cliente' IS NOT NULL AND jsonb_typeof(o->'pedido_cliente') = 'object' THEN ARRAY(SELECT jsonb_array_elements_text(o->'pedido_cliente'->'motivos')) END,
      pedido_cliente_nota = o->'pedido_cliente'->>'nota', pedido_cliente_em = (o->'pedido_cliente'->>'em')::timestamptz,
      enviado_em = (o->>'enviado_em')::timestamptz, substituido_em = (o->>'substituido_em')::timestamptz,
      aceite_antes_em = (o->>'aceite_antes_em')::timestamptz, preco_final = (o->>'preco_final')::numeric, total_com_iva = (o->>'total_com_iva')::numeric,
      subtotal = coalesce((o->>'preco_final')::numeric, subtotal), total = coalesce((o->>'total_com_iva')::numeric, total),
      prestacoes_por_fases = coalesce((o->>'prestacoes_por_fases')::boolean, false), sem_demolicao = coalesce((o->>'sem_demolicao')::boolean, false), updated_at = now()
    WHERE id = v_q;
    IF v_estado <> 'substituido' THEN v_atual := v_q; END IF;
    IF v_estado = 'aceite' THEN v_aceite := v_q; END IF;

    -- as linhas de uma versão aceite, assinada, com a encomenda emitida ou já usadas (encomenda a fornecedor, tarefa da obra) não se
    -- apagam nem se reescrevem: os ids ficam; se o JSON divergir, avisa-se (20261231994000)
    v_fixo := v_q_base = 'aceite'
      OR EXISTS (SELECT 1 FROM client_contracts c WHERE c.quote_id = v_q AND c.deleted_at IS NULL
                 AND (c.status IN ('signed', 'assinado', 'active') OR c.ec_emitida_em IS NOT NULL))
      OR EXISTS (SELECT 1 FROM quote_lines ql JOIN purchase_order_items pi ON pi.quote_line_id = ql.id WHERE ql.quote_id = v_q)
      OR EXISTS (SELECT 1 FROM quote_lines ql JOIN ops_obra_tarefa t ON t.orcamento_linha_id = ql.id WHERE ql.quote_id = v_q);
    IF v_fixo THEN
      IF (SELECT count(*) FROM quote_lines WHERE quote_id = v_q) <> jsonb_array_length(public.fn_neg_lista(o->'linhas'))
         OR (SELECT coalesce(sum(total_sem_iva), 0) FROM quote_lines WHERE quote_id = v_q)
            <> (SELECT coalesce(sum(round((x->>'quantidade')::numeric * (x->>'preco_un')::numeric, 2)), 0) FROM jsonb_array_elements(public.fn_neg_lista(o->'linhas')) x) THEN
        v_avisos := v_avisos || format('Orçamento versão %s: já está aceite ou em curso, as linhas ficaram como estavam.', o->>'versao');
      END IF;
    ELSE
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
    END IF;

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
    -- o estado só se sincroniza entre rascunho e enviada; aceite e recusada são do portal (e accepted_at, rejected_at e rejection_notes
    -- também) (20261231994000)
    SELECT CASE q.estado WHEN 'enviado' THEN 'sent' WHEN 'rascunho' THEN 'draft' END INTO v_status
    FROM quotes q WHERE q.id = v_atual;
    UPDATE proposals p SET status = v_status, sent_at = coalesce(q.enviado_em, p.sent_at),
      value = coalesce(q.preco_final, p.value), value_sem_iva = coalesce(q.preco_final, p.value_sem_iva), updated_at = now()
    FROM quotes q WHERE p.id = v_prop AND q.id = v_atual AND v_status IS NOT NULL AND p.status IN ('draft', 'sent', 'viewed')
      AND p.status IS DISTINCT FROM v_status;
  END IF;

  -- contratos (client_contracts), uma linha por versão; a anterior fica substituída pela seguinte
  v_c_ant := NULL;
  FOR o IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'contratos')) ORDER BY (value->>'versao')::int LOOP
    SELECT id, status INTO v_c, v_c_base FROM client_contracts WHERE negocio_id = p_negocio_id AND versao = (o->>'versao')::smallint AND deleted_at IS NULL;
    IF v_c IS NULL THEN
      -- depois de uma versão assinada no portal não nasce outra: escondia a assinada (20261231994000)
      IF v_c_ant IS NOT NULL AND EXISTS (SELECT 1 FROM client_contracts WHERE id = v_c_ant AND status IN ('signed', 'assinado', 'active')) THEN
        v_avisos := v_avisos || format('O contrato já está assinado no portal: a versão %s não foi criada.', o->>'versao');
        EXIT;
      END IF;
      INSERT INTO client_contracts (organization_id, root_organization_id, entity_id, negocio_id, created_by, status, versao, quote_id, proposal_id, replaces_contract_id)
      VALUES (p_org, v_neg.root_organization_id, v_neg.entity_id, p_negocio_id, v_user, 'draft', (o->>'versao')::smallint, coalesce(v_aceite, v_atual), v_prop, v_c_ant)
      RETURNING id, status INTO v_c, v_c_base;
    END IF;
    IF v_c_ant IS NOT NULL THEN
      UPDATE client_contracts SET replaced_by_contract_id = v_c, status = 'cancelled', cancelled_at = coalesce(cancelled_at, (o->>'substituido_em')::timestamptz, now())
      WHERE id = v_c_ant AND replaced_by_contract_id IS DISTINCT FROM v_c AND status NOT IN ('signed', 'assinado', 'active', 'rejected', 'cancelled');
    END IF;
    -- um contrato assinado, recusado ou cancelado não se mexe; a assinatura (signature_*, signed_by_name, signature_date) e o estado
    -- assinado só os escreve o portal: "assinado" no JSON ignora-se, com aviso (20261231994000)
    IF v_c_base IN ('signed', 'assinado', 'active', 'rejected', 'cancelled') THEN
      v_c_ant := v_c;
      CONTINUE;
    END IF;
    IF o->>'estado' = 'assinado' THEN v_avisos := v_avisos || 'A assinatura só se faz no portal do cliente.'::text; END IF;
    v_status := CASE o->>'estado' WHEN 'enviado' THEN 'pending_signature' WHEN 'alteracoes_pedidas' THEN 'changes_requested'
                  WHEN 'substituido' THEN 'cancelled' WHEN 'assinado' THEN v_c_base ELSE 'draft' END;
    UPDATE client_contracts SET revisto_por = o->>'revisto_por', revisto_em = (o->>'revisto_em')::timestamptz,
      quote_id = coalesce(quote_id, v_aceite, v_atual), proposal_id = coalesce(proposal_id, v_prop), updated_at = now()
    WHERE id = v_c;
    -- o estado à parte, para os gatilhos do CRM verem a passagem
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

  -- as adendas (20261231990000); os avisos delas juntam-se aos do negócio (20261231994000)
  v_avisos := v_avisos || public.fn_neg_guardar_adendas(p_org, p_negocio_id, p_linhas->'adendas', v_user);

  -- as visitas com dia e hora vão para a agenda do CRM (20261231970000)
  v_avisos := v_avisos || public.fn_neg_sincronizar_visitas(p_org, p_negocio_id, p_linhas->'respostas', p_linhas->'visitas');

  RETURN jsonb_build_object('negocio_id', p_negocio_id, 'proposta_id', v_prop, 'orcamento_atual_id', v_atual, 'avisos', to_jsonb(v_avisos));
END $function$;
REVOKE ALL ON FUNCTION public.neg_guardar_negocio(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_guardar_negocio(uuid, uuid, jsonb) TO authenticated, service_role;

RESET lock_timeout;
