-- ============================================================
-- Repor 5 linhas perdidas no orçamento Q-2026-0431, ao valor máximo
-- que o orçamento já teve
-- ============================================================
-- Pedido do utilizador: o orçamento Q-2026-0431 (Anabela Correia, Mudelar)
-- tinha chegado a 20.947,93 € (confirmado em auditoria, 22/09 17:43:56),
-- mas a gravação seguinte (22/09 18:16:59, que também mudou o estado de
-- rascunho para enviado e editou os termos de pagamento) perdeu 5 linhas,
-- caindo para 16.390,68 €.
--
-- As 5 linhas em falta foram recuperadas de uma cópia exacta do orçamento
-- nesse preciso momento (o "published_snapshot" gravado quando a proposta
-- ligada foi publicada, 22/09 17:44:25 — entity_audit_log, tabela
-- proposals, changed_fields->'published_snapshot'->'new'->'business'->
-- 'quotes', a entrada cujo quote.id bate com este orçamento).
--
-- Linhas repostas (ids originais preservados):
--   - Materiais Instalação de Ar Condicionado    (1.129,41 €)
--   - Mão de Obra Instalação de Ar Condicionado    (728,00 €)
--   - Mão de Obra Instalação de 2 Estrutura em Pladur (1.071,43 €)
--   - Materias em Pladur para Estrutura            (250,00 €)
--   - Material Elétrico                            (550,00 €)
--
-- Os totais do orçamento (subtotal, total_fees, total) são repostos aos
-- valores exactos gravados nessa mesma gravação de 17:43:56 (confirmados
-- em auditoria), não recalculados — evita qualquer diferença de
-- arredondamento em relação ao que realmente existiu.
-- ============================================================

DO $$
DECLARE
  v_quote_id CONSTANT uuid := '850cb479-9843-41af-9e2b-5e1fc5992e5c';
  v_existing_count int;
BEGIN
  -- Confirmação de que as 5 linhas ainda não existem (idempotência —
  -- corre sem duplicar se, por algum motivo, esta migração for reaplicada).
  SELECT count(*) INTO v_existing_count
  FROM public.quote_lines
  WHERE id IN (
    'e788887e-6588-4742-9185-7060d97cc080',
    'b09df5fb-39d0-4479-b79b-d87970dc5daf',
    'c9578de1-e32e-4dd0-8080-390b205dfc37',
    '32e59aac-bb55-4e7a-bd30-78eefcc24575',
    'f9a5edc3-4575-4d0b-b606-3e02394e628f'
  );

  IF v_existing_count > 0 THEN
    RAISE NOTICE 'CONFERIR: % das 5 linhas já existem — migração não reaplicada.', v_existing_count;
    RETURN;
  END IF;

  INSERT INTO public.quote_lines (
    id, qt, ordem, unidade, quote_id, bundle_id, categoria, cost_price,
    created_at, product_id, service_id, int_percent, iva_percent,
    section_name, total_com_iva, total_sem_iva, margem_percent,
    catalog_item_id, discount_percent, item_description, item_supplier_id,
    retail_price_unit, visible_to_client, descricao_snapshot,
    total_com_desconto, custo_mao_obra_unit, custo_material_unit,
    selected_attributes, source_deal_need_id, source_deal_need_item_id
  ) VALUES
  ('e788887e-6588-4742-9185-7060d97cc080', 1.00, 8, NULL, v_quote_id, NULL,
   'SUBCONTRATO', 0, '2026-09-22T17:43:56.382572+00:00', NULL,
   'd1fa0517-1274-4326-b990-1bb9b33f2a22', 0.00, 23.00, 'Geral',
   1389.17, 1129.41, 30.00, NULL, 0,
   'Trabalho especializado AVAC 2 Técnicos - 8 horas cada Prop N/Ref 149 BM24',
   NULL, 1129.41, true, 'Materiais Instalação de Ar Condicionado',
   1389.17, 0.00, 0.00, '{}'::jsonb, NULL, NULL),
  ('b09df5fb-39d0-4479-b79b-d87970dc5daf', 1.00, 9, NULL, v_quote_id, NULL,
   'SUBCONTRATO', 0, '2026-09-22T17:43:56.382572+00:00', NULL,
   '5bd41625-7c7b-4b7a-8265-4c4e73c11698', 0.00, 6.00, 'Geral',
   771.68, 728.00, 30.00, NULL, 0,
   'TUBO COBRE C/ISOL. 1/4 (ROLO 50 mts)0.7mm TUBO COBRE C/ISOL. 3/8 (ROLO 50 mts)0.7mm CABO ELECTRICO FLEXIVEL PRETO 4 x 1.5 (100mts) Prop N/Ref 149 BM24',
   NULL, 728.00, true, 'Mão de Obra Instalação de Ar Condicionado',
   771.68, 0.00, 0.00, '{}'::jsonb, NULL, NULL),
  ('c9578de1-e32e-4dd0-8080-390b205dfc37', 1.00, 11, NULL, v_quote_id, NULL,
   'Estrutura em Pladur (zona da Lareira e hall)', 0, '2026-09-22T17:43:56.382572+00:00', NULL,
   NULL, 0.00, 6.00, 'Estrutura em Pladur (zona da Lareira e hall)',
   1135.72, 1071.43, 0.00, NULL, 0,
   'Montagem de estante em pladur zona da lareira e hall

',
   NULL, 1071.43, true, 'Mão de Obra Instalação de 2 Estrutura em Pladur',
   1135.72, 0.00, 0.00, '{}'::jsonb, NULL, NULL),
  ('32e59aac-bb55-4e7a-bd30-78eefcc24575', 1.00, 12, NULL, v_quote_id, NULL,
   'Estrutura em Pladur (zona da Lareira e hall)', 0, '2026-09-22T17:43:56.382572+00:00', NULL,
   NULL, 0.00, 23.00, 'Estrutura em Pladur (zona da Lareira e hall)',
   307.50, 250.00, 0.00, NULL, 0,
   'Placas de pladur
Perfis metálicos
Parafuso
Buchas
Tinta e acabamentos',
   NULL, 250.00, true, 'Materias em Pladur para Estrutura',
   307.50, 0.00, 0.00, '{}'::jsonb, NULL, NULL),
  ('f9a5edc3-4575-4d0b-b606-3e02394e628f', 1.00, 13, NULL, v_quote_id, NULL,
   'Material Eletrico', 0, '2026-09-22T17:43:56.382572+00:00', NULL,
   NULL, 0.00, 23.00, 'Material Eletrico',
   676.50, 550.00, 0.00, NULL, 0,
   '1 Caixa Base com porta ATI Rack 400x750 P125
14 Tomada 230V
5 Tomada TV passagem
2 Tomada TV terminal
5 União TV
6 Interruptor Duplo
9 Interruptor Simples
19 Espelho simples
6 Espelho duplo
3 Espelho triplo
14 Centro de Tomada
7 Centro TV
9 Teclas Simples
8 Teclas duplas
10 Caixa de Aparelhagem funda
Fio XV três cores (preto/azul/terra) 100m de cada cor
',
   NULL, 550.00, true, 'Material Elétrico',
   676.50, 0.00, 0.00, '{}'::jsonb, NULL, NULL);

  UPDATE public.quotes
  SET subtotal = 17382.99,
      total_fees = 1289.82,
      total = 20947.93
  WHERE id = v_quote_id;

  RAISE NOTICE 'Repostas 5 linhas e totais do orçamento Q-2026-0431 (total: 20947.93).';
END;
$$;
