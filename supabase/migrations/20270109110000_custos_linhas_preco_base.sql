-- ============================================================
-- 20270109110000_custos_linhas_preco_base
-- ============================================================
-- Ronda 2 de permissões (05/11/2026), custos. Acerto à 20270109100000 (ainda sem ninguém a usar a RPC): em vez do
-- preço unitário já fechado ao cêntimo (preco_un_calculado), rpc_quote_lines_custos devolve preco_base_un — o preço
-- ANTES da intermediação, custo × (1 + markup/100), em float8 com as mesmas operações do navegador
-- (quoteLinePricing.getLineUnitPrice faz (material + mão de obra) × (1 + markup/100) e só depois × (1 + int/100)).
-- Assim quem edita sem ver custos (custo de fachada = preco_base_un, markup 0) obtém o mesmo preço ao cêntimo que quem
-- os vê, também quando muda a intermediação da linha. preco_base_un = preço de venda ÷ (1 + intermediação): não revela
-- o custo. O resto da função não muda.
-- ============================================================

DO $guarda$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef('public.rpc_quote_lines_custos(uuid[])'::regprocedure)) INTO v_md5;
  IF v_md5 IS DISTINCT FROM '8916d6df0fc0685f17c30caddadf92c6' THEN
    RAISE EXCEPTION 'rpc_quote_lines_custos mudou desde a leitura (md5 %): rever antes de aplicar', v_md5;
  END IF;
END
$guarda$;

DROP FUNCTION public.rpc_quote_lines_custos(uuid[]);

CREATE FUNCTION public.rpc_quote_lines_custos(p_quote_ids uuid[])
 RETURNS TABLE(
   id uuid, quote_id uuid, pode_ver_custos boolean,
   cost_price numeric, custo_material_unit numeric, custo_mao_obra_unit numeric, margem_percent numeric,
   custo_un_exato numeric, custo_un_origem numeric, mao_obra_congelada numeric,
   preco_base_un double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- 20270109100000: as linhas dos orçamentos pedidos que a pessoa vê (o mesmo critério de quote_lines_select_policy e
  -- de system_admin_support_access); os custos só onde fn_quote_custos_pode(organização do orçamento). As outras
  -- linhas não vêm.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(cardinality(p_quote_ids), 0) > 500 THEN
    RAISE EXCEPTION 'Demasiados orçamentos num pedido (máximo 500).' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN QUERY
  WITH vq AS (
    SELECT q.id AS qid, public.fn_quote_custos_pode(q.organization_id) AS pode
    FROM public.quotes q
    WHERE q.id = ANY (p_quote_ids)
      AND (
        (q.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))
          AND public.has_anew_permission(v_uid, 'quotes.view'))
        OR (public.is_system_admin(v_uid)
          AND (public.has_active_support_access(q.organization_id) OR public.has_active_support_access(q.root_organization_id)))
      )
  )
  SELECT l.id, l.quote_id, vq.pode,
    CASE WHEN vq.pode THEN l.cost_price END,
    CASE WHEN vq.pode THEN l.custo_material_unit END,
    CASE WHEN vq.pode THEN l.custo_mao_obra_unit END,
    CASE WHEN vq.pode THEN l.margem_percent END,
    CASE WHEN vq.pode THEN l.custo_un_exato END,
    CASE WHEN vq.pode THEN l.custo_un_origem END,
    CASE WHEN vq.pode THEN l.mao_obra_congelada END,
    -- 20270109110000: getLineUnitPrice antes da intermediação, com as mesmas operações em float8 que o navegador.
    (coalesce(l.custo_material_unit, 0)::float8 + coalesce(l.custo_mao_obra_unit, 0)::float8)
      * (1::float8 + coalesce(l.margem_percent, 0)::float8 / 100::float8)
  FROM public.quote_lines l
  JOIN vq ON vq.qid = l.quote_id
  ORDER BY l.quote_id, l.ordem;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_quote_lines_custos(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_quote_lines_custos(uuid[]) TO authenticated;
