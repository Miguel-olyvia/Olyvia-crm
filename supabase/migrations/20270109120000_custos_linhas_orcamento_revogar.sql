-- ============================================================
-- 20270109120000_custos_linhas_orcamento_revogar
-- ============================================================
-- Ronda 2 de permissões (05/11/2026), custos — fecho do P1 (A/P7). MUDANÇA DE FUNCIONAMENTO APROVADA.
-- As colunas de custo de quote_lines deixam de se ler com SELECT direto (bastava quotes.view): `authenticated` fica
-- com SELECT só nas outras colunas. Os custos leem-se por rpc_quote_lines_custos (20270109100000/20270109110000), que
-- os devolve só a quem tem quotes.view_costs ou quotes.manage na organização (Papel no Negócio, admin de sistema).
-- Mesmo padrão de stocks/stock_movements (20270106070000).
--
-- Colunas de custo: cost_price, custo_material_unit, custo_mao_obra_unit, margem_percent, custo_un_exato,
-- custo_un_origem, mao_obra_congelada.
--
-- Escritas: INSERT/UPDATE/DELETE continuam com os mesmos grants (o navegador não escreve em quote_lines diretamente;
-- rpc_save_quote, rpc_duplicate_quote_insert, neg_* e as edge functions com service role são SECURITY DEFINER / não
-- passam por `authenticated`). Os leitores do navegador e das edge functions com o JWT de quem chama já escolhem só as
-- colunas sem custo (QUOTE_LINE_COLUNAS_SEM_CUSTO); a vista ops_v_orcamento lê o custo por fn_quote_custo_previsto.
-- ============================================================

DO $guarda$
DECLARE
  v_md5 text;
  v_acl text;
BEGIN
  -- as colunas de quote_lines são as que se leram (46; se apareceu uma nova, decidir se é de custo antes de aplicar)
  SELECT md5(string_agg(attname, ',' ORDER BY attnum)) INTO v_md5
  FROM pg_attribute WHERE attrelid = 'public.quote_lines'::regclass AND attnum > 0 AND NOT attisdropped;
  IF v_md5 IS DISTINCT FROM 'eda3129a18aa3ee551a9dbff38fcc157' THEN
    RAISE EXCEPTION 'as colunas de quote_lines mudaram (md5 %): rever antes de aplicar', v_md5;
  END IF;
  SELECT relacl::text INTO v_acl FROM pg_class WHERE oid = 'public.quote_lines'::regclass;
  IF v_acl IS DISTINCT FROM '{postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}' THEN
    RAISE EXCEPTION 'os grants de quote_lines mudaram (%): rever antes de aplicar', v_acl;
  END IF;
  -- a vista já não lê o custo diretamente
  IF pg_get_viewdef('public.ops_v_orcamento'::regclass) NOT LIKE '%fn_quote_custo_previsto%' THEN
    RAISE EXCEPTION 'ops_v_orcamento ainda lê o custo de quote_lines: aplicar 20270109100000 primeiro';
  END IF;
  IF to_regprocedure('public.rpc_quote_lines_custos(uuid[])') IS NULL THEN
    RAISE EXCEPTION 'falta rpc_quote_lines_custos: aplicar 20270109100000/20270109110000 primeiro';
  END IF;
END
$guarda$;

REVOKE SELECT ON public.quote_lines FROM authenticated;
GRANT SELECT (
  id, quote_id, catalog_item_id, categoria, descricao_snapshot, qt, iva_percent, int_percent, total_sem_iva,
  total_com_iva, total_com_desconto, ordem, created_at, product_id, service_id, selected_attributes, discount_percent,
  section_name, item_description, unidade, bundle_id, item_supplier_id, retail_price_unit, visible_to_client,
  source_deal_need_item_id, source_deal_need_id, uom_id, units_per_uom, tipo_emylia, quantidade_exata, preco_un_exato,
  iva_explicita, custo_manual, fornecedor, qtd_origem, preco_un_origem, chave_emylia, perfil_nome, perfil_chave
) ON public.quote_lines TO authenticated;
