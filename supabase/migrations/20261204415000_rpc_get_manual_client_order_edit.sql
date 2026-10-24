-- ============================================================================
-- rpc_get_manual_client_order_edit
--
-- O diálogo de edição da encomenda manual lia client_contracts e quote_lines
-- diretamente. A RLS de client_contracts exige ser membro direto da
-- organização, por isso um system admin que vê a organização pela hierarquia
-- recebia 0 linhas (toast "Cannot coerce the result to a single JSON object"),
-- apesar de rpc_get_client_order_document e rpc_update_manual_client_order o
-- deixarem ver e gravar.
--
-- Esta RPC devolve os dados de pré-preenchimento com EXATAMENTE as mesmas
-- verificações de rpc_update_manual_client_order (versão ao vivo):
--   * permissão client_contracts.edit;
--   * contrato existe e não está apagado;
--   * organização no âmbito (fn_deal_org_in_scope);
--   * manual e não é venda direta;
--   * estado signed;
--   * orçamento interno associado.
-- Não é mais permissiva do que a gravação.
--
-- Devolve {quote_id, entity_id, lines}, com a linha inteira de quote_lines
-- (serve a branch com packs e o main).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_get_manual_client_order_edit(p_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_contract public.client_contracts;
  v_lines    jsonb;
BEGIN
  IF p_contract_id IS NULL THEN
    RAISE EXCEPTION 'contract_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'client_contracts.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar encomendas de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_contract
    FROM public.client_contracts cc
   WHERE cc.id = p_contract_id
     AND cc.deleted_at IS NULL;

  IF v_contract.id IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.fn_deal_org_in_scope(v_contract.organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT COALESCE(v_contract.is_manual_order, false)
     OR EXISTS (SELECT 1 FROM public.direct_sales ds WHERE ds.client_contract_id = p_contract_id) THEN
    RAISE EXCEPTION 'Só as encomendas manuais podem ser editadas' USING ERRCODE = 'check_violation';
  END IF;

  IF v_contract.status IS DISTINCT FROM 'signed' THEN
    RAISE EXCEPTION 'Só é possível editar encomendas ativas (assinadas)' USING ERRCODE = 'check_violation';
  END IF;

  IF v_contract.quote_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.quotes q
     WHERE q.id = v_contract.quote_id AND q.is_internal = true
  ) THEN
    RAISE EXCEPTION 'Encomenda manual sem orçamento interno associado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(ql) ORDER BY ql.ordem), '[]'::jsonb)
    INTO v_lines
    FROM public.quote_lines ql
   WHERE ql.quote_id = v_contract.quote_id;

  RETURN jsonb_build_object(
    'quote_id',  v_contract.quote_id,
    'entity_id', v_contract.entity_id,
    'lines',     v_lines
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_get_manual_client_order_edit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_manual_client_order_edit(uuid) TO authenticated;
