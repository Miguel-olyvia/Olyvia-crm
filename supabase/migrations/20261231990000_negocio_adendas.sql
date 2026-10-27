-- Negócio: as adendas da Emylia (trabalhos a mais depois do contrato) nas tabelas do CRM. Só acrescenta; ajusta duas funções.
--
-- Uma adenda nasce depois do contrato assinado, com o negócio já ganho. No CRM, um orçamento ou um contrato ligado (negocio_id) a um
-- negócio ganho é recusado (fn_neg_validar_documento) e decide o negócio (fn_neg_decidir_negocio). A adenda não decide nada: por isso
-- liga-se ao negócio pela tabela adendas (20261231940000), e as versões e o contrato dela ligam-se à adenda (adenda_id), sem negocio_id.
--   adendas                     o cabeçalho: número, estado, motivo, datas, origem (um imprevisto da obra), totais.
--   quotes (adenda_id)          uma linha por versão da proposta da adenda (a atual e as substituídas a pedido do cliente).
--   quote_lines                 as linhas: o serviço do Catálogo ou a linha livre (chave_emylia), o perfil, o custo congelado no envio.
--   quote_line_materiais        nova: os materiais escolhidos numa linha livre.
--   quote_prestacoes            as parcelas da adenda são as do contrato: copiam-se do orçamento aceite.
--   client_contracts (adenda_id) o contrato da adenda, uma linha por versão (como o do negócio).
--   faturas/pagamentos/recibos  uma fatura por parcela (quote_prestacao_id), com o pagamento e o recibo.
--   fatura_avisos_cliente       nova: o que o cliente disse no portal ao pagar (método, comprovativo…), campo a campo.
-- fn_ec_emitida passa a ver o negócio de um contrato de adenda: a encomenda da adenda só conta depois da 1.ª parcela paga.
-- neg_ler_negocios lê as adendas (e deixa as faturas delas fora das do negócio); neg_guardar_negocio grava-as. O ajuste lê o texto
-- ATUAL de cada função e só lhe junta o que falta; se o ponto de encaixe não existir, a migration pára.

SET lock_timeout = '5s';

ALTER TABLE public.adendas ADD COLUMN IF NOT EXISTS referencia text;
ALTER TABLE public.adendas ADD COLUMN IF NOT EXISTS vista boolean NOT NULL DEFAULT false;
ALTER TABLE public.adendas ADD COLUMN IF NOT EXISTS origem_texto text;
ALTER TABLE public.adendas ADD COLUMN IF NOT EXISTS origem_onde text;
ALTER TABLE public.adendas ADD COLUMN IF NOT EXISTS origem_foto text;
COMMENT ON COLUMN public.adendas.referencia IS 'Emylia: o número da adenda como o cliente o vê ("AD 2026/<negócio>-<n>").';
COMMENT ON COLUMN public.adendas.vista IS 'Emylia: o comercial já viu a recusa do cliente (sai do Hoje dele).';

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS adenda_id uuid REFERENCES public.adendas(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS quotes_adenda_versao ON public.quotes (adenda_id, versao) WHERE adenda_id IS NOT NULL AND deleted_at IS NULL;
COMMENT ON COLUMN public.quotes.adenda_id IS 'Emylia: uma versão da proposta de uma adenda (sem negocio_id: a adenda não decide o negócio).';
ALTER TABLE public.client_contracts ADD COLUMN IF NOT EXISTS adenda_id uuid REFERENCES public.adendas(id);
CREATE INDEX IF NOT EXISTS client_contracts_adenda ON public.client_contracts (adenda_id) WHERE adenda_id IS NOT NULL;
COMMENT ON COLUMN public.client_contracts.adenda_id IS 'Emylia: o contrato de uma adenda (uma linha por versão).';

ALTER TABLE public.quote_lines ADD COLUMN IF NOT EXISTS chave_emylia text;
ALTER TABLE public.quote_lines ADD COLUMN IF NOT EXISTS perfil_nome text;
ALTER TABLE public.quote_lines ADD COLUMN IF NOT EXISTS perfil_chave text;
ALTER TABLE public.quote_lines ADD COLUMN IF NOT EXISTS mao_obra_congelada numeric(14,4);
COMMENT ON COLUMN public.quote_lines.chave_emylia IS 'Emylia (adendas): o serviço pela chave da Emylia ou o id da linha livre.';
COMMENT ON COLUMN public.quote_lines.mao_obra_congelada IS 'Emylia (adendas): a mão de obra por unidade congelada no envio (o previsto da obra).';

CREATE TABLE IF NOT EXISTS public.quote_line_materiais (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  quote_line_id   uuid NOT NULL REFERENCES public.quote_lines(id) ON DELETE CASCADE,
  ordem           smallint NOT NULL,
  nome            text NOT NULL,
  quantidade      numeric(12,3) NOT NULL,
  unidade         text NOT NULL,
  preco           numeric(14,4),
  fornecedor      text,
  UNIQUE (quote_line_id, ordem)
);
COMMENT ON TABLE public.quote_line_materiais IS 'Emylia (adendas): os materiais escolhidos à mão numa linha livre (de um imprevisto), com o preço ao cliente.';

CREATE TABLE IF NOT EXISTS public.fatura_avisos_cliente (
  organization_id uuid NOT NULL,
  fatura_id       uuid NOT NULL REFERENCES public.faturas(id) ON DELETE CASCADE,
  campo           text NOT NULL,
  valor           text NOT NULL,
  PRIMARY KEY (fatura_id, campo)
);
COMMENT ON TABLE public.fatura_avisos_cliente IS 'Emylia: o que o cliente disse no portal ao pagar uma fatura (método, comprovativo, IBAN do débito…), campo a campo.';

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quote_line_materiais','fatura_avisos_cliente'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_ler') THEN
      EXECUTE format($p$CREATE POLICY %I ON public.%I AS PERMISSIVE FOR SELECT TO authenticated
        USING (public.is_system_admin_user((SELECT auth.uid())) OR public.has_anew_permission_in_org((SELECT auth.uid()), 'pessoas.view', organization_id))$p$,
        t || '_ler', t);
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $do$;

-- a encomenda de cliente de um contrato de adenda é do negócio da adenda
CREATE OR REPLACE FUNCTION public.fn_ec_emitida(p_contract_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM client_contracts cc
    LEFT JOIN adendas ad ON ad.id = cc.adenda_id
    JOIN negocios n ON n.id = coalesce(cc.negocio_id, ad.negocio_id)
    WHERE cc.id = p_contract_id AND n.fluxo_emylia AND cc.ec_emitida_em IS NULL
  )
$$;

-- ------------------------------------------------------------------ ler
CREATE OR REPLACE FUNCTION public.fn_neg_ler_adendas(p_negocio uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'numero', a.numero, 'referencia', a.referencia, 'estado', a.estado, 'motivo', a.motivo, 'criada_em', a.criada_em, 'enviada_em', a.enviada_em,
    'aceite_em', a.aceite_em, 'assinada_em', a.assinada_em, 'recusada_em', a.recusada_em, 'recusa', a.recusa_motivo, 'vista', a.vista,
    'total', a.total, 'total_com_iva', a.total_com_iva,
    'origem', CASE WHEN a.imprevisto_ref IS NOT NULL THEN
      jsonb_build_object('imprevisto', a.imprevisto_ref, 'texto', coalesce(a.origem_texto, ''), 'onde', coalesce(a.origem_onde, ''), 'foto', a.origem_foto) END,
    'versoes', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'versao', q.versao, 'estado', q.estado, 'desconto', coalesce(q.desconto_fracao, 0), 'verificado', q.verificado_em IS NOT NULL, 'aprovacao', q.aprovacao,
        'motivos', to_jsonb(coalesce(q.motivos_versao, '{}')), 'nota', q.nota_versao,
        'pedido_cliente', CASE WHEN q.pedido_cliente_em IS NOT NULL OR q.pedido_cliente_motivos IS NOT NULL THEN
          jsonb_build_object('motivos', to_jsonb(coalesce(q.pedido_cliente_motivos, '{}')), 'nota', q.pedido_cliente_nota, 'em', q.pedido_cliente_em) END,
        'enviado_em', q.enviado_em, 'aceite_em', q.accepted_at, 'substituido_em', q.substituido_em, 'total', q.preco_final, 'total_com_iva', q.total_com_iva,
        'linhas', coalesce((SELECT jsonb_agg(jsonb_build_object(
            'ordem', l.ordem, 'servico', l.service_id, 'chave', l.chave_emylia, 'livre', l.tipo_emylia = 'livre', 'descricao', l.descricao_snapshot,
            'unidade', coalesce(l.unidade, ''), 'quantidade', coalesce(l.quantidade_exata, l.qt), 'preco_un', coalesce(l.preco_un_exato, l.retail_price_unit, 0),
            'horas_un', coalesce(c.horas_un, 0), 'perfil', coalesce(l.perfil_nome, ''), 'perfil_chave', l.perfil_chave,
            'custo_un', CASE WHEN c.congelado THEN l.custo_un_exato END, 'mao_obra_un', l.mao_obra_congelada,
            'materiais', (SELECT jsonb_agg(jsonb_build_object('nome', m.nome, 'quantidade', m.quantidade, 'unidade', m.unidade, 'preco', m.preco,
                           'fornecedor', m.fornecedor) ORDER BY m.ordem) FROM quote_line_materiais m WHERE m.quote_line_id = l.id)
          ) ORDER BY l.ordem) FROM quote_lines l LEFT JOIN quote_line_custos c ON c.quote_line_id = l.id WHERE l.quote_id = q.id), '[]')
      ) ORDER BY q.versao) FROM quotes q WHERE q.adenda_id = a.id AND q.deleted_at IS NULL), '[]'),
    'contratos', coalesce((SELECT jsonb_agg(public.fn_neg_ler_contrato(c.id) ORDER BY c.versao) FROM client_contracts c
                  WHERE c.adenda_id = a.id AND c.versao IS NOT NULL AND c.deleted_at IS NULL), '[]'),
    'faturas', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'chave', f.chave, 'numero', f.numero, 'emitida_em', f.emitida_em, 'total', f.total, 'parcela', qp.ordem, 'rotulo', qp.rotulo, 'pct', qp.pct,
        'recibo', (SELECT jsonb_build_object('numero', rc.numero, 'em', rc.emitido_em) FROM recibos rc JOIN pagamentos pg ON pg.id = rc.pagamento_id
                   WHERE pg.fatura_id = f.id LIMIT 1),
        'aviso', coalesce((SELECT jsonb_agg(jsonb_build_object('campo', v.campo, 'valor', v.valor) ORDER BY v.campo) FROM fatura_avisos_cliente v
                   WHERE v.fatura_id = f.id), '[]')
      ) ORDER BY qp.ordem, f.emitida_em) FROM faturas f JOIN quote_prestacoes qp ON qp.id = f.quote_prestacao_id JOIN quotes q ON q.id = qp.quote_id
      WHERE q.adenda_id = a.id AND f.chave IS NOT NULL), '[]')
  ) ORDER BY a.numero), '[]') FROM adendas a WHERE a.negocio_id = p_negocio
$$;
REVOKE ALL ON FUNCTION public.fn_neg_ler_adendas(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_ler_adendas(uuid) TO service_role;

-- ------------------------------------------------------------------ gravar
CREATE OR REPLACE FUNCTION public.fn_neg_guardar_adendas(p_org uuid, p_negocio_id uuid, p_adendas jsonb, p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_neg negocios; a jsonb; o jsonb; l jsonb; e jsonb;
  v_ad uuid; v_q uuid; v_atual uuid; v_base uuid; v_l uuid; v_c uuid; v_c_ant uuid; v_f uuid; v_pg uuid; v_pr uuid;
  v_iva numeric; v_tot numeric; v_base_mo numeric; v_status text; v_pago timestamptz;
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
      UPDATE quotes SET estado = o->>'estado', desconto_fracao = (o->>'desconto')::numeric,
        desconto_global_percent = round(coalesce((o->>'desconto')::numeric, 0) * 100, 2),
        verificado_em = CASE WHEN coalesce((o->>'verificado')::boolean, false) THEN coalesce(verificado_em, now()) END, aprovacao = o->>'aprovacao',
        motivos_versao = ARRAY(SELECT jsonb_array_elements_text(public.fn_neg_lista(o->'motivos'))), nota_versao = o->>'nota',
        pedido_cliente_motivos = CASE WHEN jsonb_typeof(o->'pedido_cliente') = 'object' THEN ARRAY(SELECT jsonb_array_elements_text(public.fn_neg_lista(o->'pedido_cliente'->'motivos'))) END,
        pedido_cliente_nota = o->'pedido_cliente'->>'nota', pedido_cliente_em = (o->'pedido_cliente'->>'em')::timestamptz,
        enviado_em = (o->>'enviado_em')::timestamptz, accepted_at = (o->>'aceite_em')::timestamptz, substituido_em = (o->>'substituido_em')::timestamptz,
        preco_final = (o->>'total')::numeric, total_com_iva = (o->>'total_com_iva')::numeric
      WHERE id = v_q;

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
      SELECT id INTO v_c FROM client_contracts WHERE adenda_id = v_ad AND versao = (o->>'versao')::smallint AND deleted_at IS NULL;
      IF v_c IS NULL THEN
        INSERT INTO client_contracts (organization_id, root_organization_id, entity_id, created_by, status, versao, quote_id, replaces_contract_id, adenda_id)
        VALUES (p_org, v_neg.root_organization_id, v_neg.entity_id, p_user, 'draft', (o->>'versao')::smallint, v_atual, v_c_ant, v_ad)
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
END $$;
REVOKE ALL ON FUNCTION public.fn_neg_guardar_adendas(uuid, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_guardar_adendas(uuid, uuid, jsonb, uuid) TO service_role;

-- neg_ler_negocios e neg_guardar_negocio: junta-se o que falta ao texto atual de cada uma
DO $do$
DECLARE
  v text; r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.neg_ler_negocios(uuid)',
     $a$FROM faturas f LEFT JOIN quote_prestacoes qp ON qp.id = f.quote_prestacao_id WHERE f.negocio_id = n.id AND f.chave IS NOT NULL),$a$,
     $b$FROM faturas f LEFT JOIN quote_prestacoes qp ON qp.id = f.quote_prestacao_id WHERE f.negocio_id = n.id AND f.chave IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM quotes qa WHERE qa.id = qp.quote_id AND qa.adenda_id IS NOT NULL)),
      -- as adendas (20261231990000)
      'adendas', public.fn_neg_ler_adendas(n.id),$b$),
    ('public.neg_guardar_negocio(uuid,uuid,jsonb)',
     $a$  -- as visitas com dia e hora vão para a agenda do CRM (20261231970000)$a$,
     $b$  -- as adendas (20261231990000)
  PERFORM public.fn_neg_guardar_adendas(p_org, p_negocio_id, p_linhas->'adendas', v_user);

  -- as visitas com dia e hora vão para a agenda do CRM (20261231970000)$b$)
  ) AS t(assinatura, de, para) LOOP
    v := pg_get_functiondef(r.assinatura::regprocedure);
    IF position('20261231990000' IN v) > 0 THEN CONTINUE; END IF;
    IF (length(v) - length(replace(v, r.de, ''))) / length(r.de) <> 1 THEN
      RAISE EXCEPTION 'A função % mudou (o ponto de encaixe não aparece uma vez só): rever a migration 20261231990000.', r.assinatura;
    END IF;
    EXECUTE replace(v, r.de, r.para);
  END LOOP;
END $do$;

RESET lock_timeout;
