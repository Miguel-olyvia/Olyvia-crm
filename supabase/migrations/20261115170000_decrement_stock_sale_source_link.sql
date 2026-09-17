-- ============================================================
-- Pedido do utilizador (2026-08-31, plano-fornecedores-multi-stock-execucao.md
-- secção Fase 5.0F/registo manual de movimentos): quando um profissional
-- regista manualmente uma SAÍDA de stock em Stocks.tsx (via
-- StockMovementDialog, rpc_decrement_stock) para satisfazer uma Encomenda
-- Cliente concreta, tem de dar para ligar esse movimento a essa Encomenda
-- Cliente (client_contracts), para servir de prova rastreável — mesmo
-- espírito de sale_source_type/sale_source_id já usados pela dedução
-- automática de stock (Fase 5.0A/5.0B, fn_contract_stock_deduction), mas
-- aqui é um campo OPCIONAL escolhido manualmente pelo utilizador, não gerado
-- por trigger. Não substitui nem interage com a dedução automática (mantida
-- inalterada, confirmado com o utilizador) — é um mecanismo à parte para
-- saídas registadas manualmente.
--
-- rpc_decrement_stock ganha 2 parâmetros novos, opcionais, no fim:
-- p_sale_source_type ('contract'|'proposal'|NULL) e p_sale_source_id (uuid).
-- Reaproveita as colunas já existentes stock_movements.sale_source_type/
-- sale_source_id (20261115040000) — sem coluna nova.
--
-- IMPORTANTE (bug já documentado neste projeto, Fase 5.0B): CREATE OR REPLACE
-- FUNCTION com um parâmetro novo no fim NÃO substitui a função existente —
-- cria uma 2ª sobrecarga (overload) com assinatura diferente, deixando a
-- antiga por trás a aceitar chamadas antigas silenciosamente. Por isso o
-- DROP FUNCTION explícito da assinatura antiga abaixo, antes do CREATE.
-- ============================================================

DROP FUNCTION IF EXISTS public.rpc_decrement_stock(uuid, uuid, integer, text, text, text, text);

CREATE OR REPLACE FUNCTION public.rpc_decrement_stock(
    p_product_id        uuid,
    p_warehouse_id      uuid,
    p_qty               integer,
    p_document_number   text,
    p_document_type     text,
    p_counterparty      text DEFAULT NULL,
    p_notes             text DEFAULT NULL,
    p_sale_source_type  text DEFAULT NULL,
    p_sale_source_id    uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_org    uuid;
  v_doc    text;
  v_result integer;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;

  IF p_sale_source_type IS NOT NULL AND p_sale_source_type NOT IN ('contract', 'proposal') THEN
    RAISE EXCEPTION 'sale_source_type inválido: %', p_sale_source_type USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.stocks
  WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Não existe stock deste produto neste armazém' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Confirma que o contrato/proposta indicado é visível pelo utilizador e
  -- pertence à mesma organização — nunca confiar num id vindo do cliente sem
  -- validar o scope (mesmo princípio de segurança usado em
  -- rpc_get_client_order_document).
  IF p_sale_source_type = 'contract' AND p_sale_source_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.client_contracts
      WHERE id = p_sale_source_id
        AND organization_id = v_org
        AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Encomenda Cliente (contrato) não encontrada nesta organização' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  v_doc := COALESCE(p_document_number, public.fn_next_stock_document_number(v_org, p_document_type));

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, counterparty, notes, created_by,
    sale_source_type, sale_source_id
  ) VALUES (
    v_org, p_product_id, p_warehouse_id, 'saida', p_qty,
    v_doc, p_document_type, p_counterparty, p_notes, v_actor,
    p_sale_source_type, p_sale_source_id
  )
  RETURNING balance_after INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.rpc_decrement_stock(uuid, uuid, integer, text, text, text, text, text, uuid) IS
  'Saída de stock (ledger). p_sale_source_type/p_sale_source_id (opcionais) '
  'ligam manualmente o movimento a uma Encomenda Cliente (client_contracts) '
  'como prova/rastreabilidade — usado pelo registo manual em '
  'StockMovementDialog.tsx (Fase 5.0F). Independente da dedução automática '
  'de stock (Fase 5.0B), que continua a inserir diretamente via '
  'fn_contract_stock_deduction(), não por este RPC.';

REVOKE ALL ON FUNCTION public.rpc_decrement_stock(uuid, uuid, integer, text, text, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_decrement_stock(uuid, uuid, integer, text, text, text, text, text, uuid) TO authenticated;
