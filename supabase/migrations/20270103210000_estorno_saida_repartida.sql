-- ============================================================
-- 20270103210000_estorno_saida_repartida
-- ============================================================
-- O que faz: rpc_revert_client_order_stock_exit passa a estornar a saída
--   INTEIRA: o movimento pedido e as outras parcelas da mesma saída (mesmo
--   contrato, produto e document_number, tipo 'saida', ainda não estornadas),
--   criadas por rpc_confirm_client_order_stock_exit_split. Uma saída simples
--   não tem parcelas irmãs (document_number próprio) e fica igual. Idempotente:
--   tudo estornado → o mesmo erro de antes; estorno antigo parcial → estorna
--   o que falta. Permissões e verificações iguais; mesmo contrato de entrada;
--   devolve também 'reversed' (lista das parcelas estornadas).
-- Base: pg_get_functiondef vivo da BD RH. Sem estrutura nova; CREATE OR
--   REPLACE mantém o ACL (authenticated, service_role).
-- Reversão (só como migration nova): repor a versão anterior (histórico).
-- ============================================================
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.rpc_revert_client_order_stock_exit(p_contract_id uuid, p_movement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org             uuid;
  v_contract_number text;
  v_order_number    text;
  v_actor           uuid;
  v_mov             public.stock_movements;
  v_balance_after   integer;
  -- NOVO (20261204620000)
  v_sale_number     text;
  v_is_direct_sale  boolean;
  -- NOVO (20261204630000)
  v_notes           text;
  v_result          jsonb;
  -- NOVO (saída repartida)
  v_part            record;
  v_reversed        jsonb := '[]'::jsonb;
  v_self_reversed   boolean;
BEGIN
  IF p_contract_id IS NULL OR p_movement_id IS NULL THEN
    RAISE EXCEPTION 'contract_id e movement_id são obrigatórios' USING ERRCODE = 'check_violation';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT cc.organization_id, cc.contract_number, cc.order_number
  INTO v_org, v_contract_number, v_order_number
  FROM public.client_contracts cc
  WHERE cc.id = p_contract_id
    AND cc.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- Mesmas verificações de âmbito e permissão da confirmação.
  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para ver esta encomenda de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'inventory.edit')
     OR NOT public.has_anew_permission(auth.uid(), 'client_orders.view')  -- NOVO (20261205000000): era client_contracts.view
     OR NOT public.has_anew_permission(auth.uid(), 'client_orders.confirm_stock_exit') THEN
    RAISE EXCEPTION 'Sem permissão para estornar saída de stock desta encomenda' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Trancar o movimento original serializa estornos concorrentes do mesmo
  -- movimento: o segundo espera e depois vê o estorno do primeiro.
  SELECT sm.* INTO v_mov
  FROM public.stock_movements sm
  WHERE sm.id = p_movement_id
  FOR UPDATE;

  IF v_mov.id IS NULL THEN
    RAISE EXCEPTION 'Movimento de stock não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_mov.movement_type IS DISTINCT FROM 'saida'
     OR v_mov.sale_source_type IS DISTINCT FROM 'contract'
     OR v_mov.sale_source_id IS DISTINCT FROM p_contract_id THEN
    RAISE EXCEPTION 'Este movimento não é uma saída confirmada desta encomenda' USING ERRCODE = 'check_violation';
  END IF;

  IF v_mov.organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'Movimento de stock de outra organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- NOVO (saída repartida): uma saída confirmada pode ter várias parcelas
  -- (rpc_confirm_client_order_stock_exit_split: um movimento 'saida' por
  -- armazém, mesmo document_number, contrato e produto). Estorna-se a saída
  -- inteira: este movimento e as parcelas irmãs ainda não estornadas. Só há
  -- uma saída ativa por (encomenda, produto) — as confirmações recusam outra
  -- —, por isso as irmãs não estornadas são sempre da mesma saída. Trancadas
  -- por id (ordem fixa). Já estornado este movimento e todas as irmãs → o
  -- mesmo erro de antes; se faltar alguma irmã (estorno antigo parcial),
  -- estorna-se o que falta.
  v_self_reversed := EXISTS (
    SELECT 1 FROM public.stock_movements r
    WHERE r.reversal_of_movement_id = v_mov.id
  );

  PERFORM 1
  FROM public.stock_movements sm
  WHERE sm.organization_id = v_org
    AND sm.sale_source_type = 'contract'
    AND sm.sale_source_id = p_contract_id
    AND sm.product_id = v_mov.product_id
    AND sm.movement_type = 'saida'
    AND v_mov.document_number IS NOT NULL
    AND sm.document_number = v_mov.document_number
    AND sm.id <> v_mov.id
  ORDER BY sm.id
  FOR UPDATE;

  IF v_self_reversed AND NOT EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.organization_id = v_org
      AND sm.sale_source_type = 'contract'
      AND sm.sale_source_id = p_contract_id
      AND sm.product_id = v_mov.product_id
      AND sm.movement_type = 'saida'
      AND v_mov.document_number IS NOT NULL
      AND sm.document_number = v_mov.document_number
      AND sm.id <> v_mov.id
      AND NOT EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.reversal_of_movement_id = sm.id)
  ) THEN
    RAISE EXCEPTION 'Esta saída de stock já foi estornada' USING ERRCODE = 'unique_violation';
  END IF;

  -- NOVO (20261204620000): venda direta mostra o VD-… nas notas; os outros
  -- casos ficam exatamente como antes. Só texto.
  SELECT ds.sale_number
    INTO v_sale_number
  FROM public.direct_sales ds
  WHERE ds.client_contract_id = p_contract_id
  ORDER BY ds.created_at DESC
  LIMIT 1;
  v_is_direct_sale := FOUND;

  v_notes := CASE
    WHEN v_is_direct_sale THEN
      format('Estorno da saída confirmada — venda direta %s',
             COALESCE(v_sale_number, v_order_number, v_contract_number))
    ELSE
      format('Estorno da saída confirmada — Encomenda %s', COALESCE(v_order_number, v_contract_number))
  END;  -- NOVO (20261204620000)

  -- NOVO (20261204630000): a inserção do 'estorno_venda' passa para o helper
  -- (mesmas colunas e valores). O movimento já está trancado acima, por isso
  -- 'skipped' não é possível aqui — se acontecer, mesmo erro de antes.
  IF NOT v_self_reversed THEN
    v_result := public.fn_client_order_reverse_stock_movement(v_mov.id, v_actor, v_notes);

    IF COALESCE(v_result ->> 'status', '') <> 'reversed' THEN
      RAISE EXCEPTION 'Esta saída de stock já foi estornada' USING ERRCODE = 'unique_violation';
    END IF;

    v_balance_after := (v_result ->> 'balance_after')::integer;
    v_reversed := v_reversed || jsonb_build_object(
      'movement_id', v_mov.id, 'warehouse_id', v_mov.warehouse_id, 'quantity', v_mov.quantity,
      'reversal_movement_id', v_result ->> 'reversal_movement_id', 'balance_after', v_balance_after);
  END IF;

  -- NOVO (saída repartida): as outras parcelas da mesma saída.
  FOR v_part IN
    SELECT sm.id, sm.warehouse_id, sm.quantity
    FROM public.stock_movements sm
    WHERE sm.organization_id = v_org
      AND sm.sale_source_type = 'contract'
      AND sm.sale_source_id = p_contract_id
      AND sm.product_id = v_mov.product_id
      AND sm.movement_type = 'saida'
      AND v_mov.document_number IS NOT NULL
      AND sm.document_number = v_mov.document_number
      AND sm.id <> v_mov.id
      AND NOT EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.reversal_of_movement_id = sm.id)
    ORDER BY sm.id
  LOOP
    v_result := public.fn_client_order_reverse_stock_movement(v_part.id, v_actor, v_notes);
    IF COALESCE(v_result ->> 'status', '') = 'reversed' THEN
      v_reversed := v_reversed || jsonb_build_object(
        'movement_id', v_part.id, 'warehouse_id', v_part.warehouse_id, 'quantity', v_part.quantity,
        'reversal_movement_id', v_result ->> 'reversal_movement_id',
        'balance_after', (v_result ->> 'balance_after')::integer);
      IF v_balance_after IS NULL THEN
        v_balance_after := (v_result ->> 'balance_after')::integer;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success',       true,
    'balance_after', v_balance_after,          -- saldo do armazém do movimento pedido (ou da 1.ª parcela)
    'reversed',      v_reversed                -- NOVO (saída repartida): parcelas estornadas
  );
END;
$function$
;
