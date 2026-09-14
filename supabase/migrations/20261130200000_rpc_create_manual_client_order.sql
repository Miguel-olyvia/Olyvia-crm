-- Fase "Encomendas Clientes manuais" (3/3) — criação manual de Encomenda Cliente.
--
-- Contexto
-- --------
-- Uma "Encomenda Cliente" (src/pages/ClientOrders.tsx) não tem tabela própria:
-- é derivada em tempo real de `client_contracts` com status signed/assinado,
-- cujas linhas são lidas via `client_contracts.quote_id` -> `quote_lines`
-- (ver 20261115160000_client_order_documents_read_rpcs.sql). Até aqui, a única
-- forma de existir uma Encomenda Cliente era percorrer todo o fluxo
-- Orçamento -> Proposta -> Contrato (template + assinatura).
--
-- Esta RPC permite criar uma Encomenda Cliente manualmente, criando por baixo,
-- numa só transação:
--   1. um orçamento sintético (`quotes` com is_internal = true, ver
--      20261130180000_quotes_is_internal_flag.sql) + as suas `quote_lines`;
--   2. um `client_contracts` ligado a esse orçamento pelo `quote_id` que todo
--      o resto do sistema já sabe ler.
--
-- Nada do que já existe é tocado: as RPCs de leitura de Encomendas Clientes,
-- o PDF, a checklist de saída de stock e os gatilhos de dedução de stock /
-- pedido a fornecedor continuam a funcionar exatamente como num contrato
-- assinado normal, porque o que lhes chega é, de facto, um contrato assinado
-- normal.
--
-- Porque é que o contrato é inserido como 'draft' e só depois passa a 'signed'
-- -----------------------------------------------------------------------------
-- Os gatilhos que fazem o trabalho pesado estão declarados como
-- `AFTER UPDATE OF status ON public.client_contracts` (não `AFTER INSERT`):
--   - fn_contract_stock_deduction   (20261115060000 / 20261115070000)
--   - fn_contract_supplier_request  (20261115070000)
-- Um INSERT já com status='signed' NÃO os dispara — a encomenda apareceria na
-- listagem mas nunca deduziria stock nem geraria pedidos a fornecedor, um bug
-- silencioso e difícil de detetar. Por isso o contrato é inserido em 'draft' e
-- promovido a 'signed' com um UPDATE dentro da mesma transação: é o mesmo
-- caminho de uma assinatura real, sem alterar um único gatilho.
-- (Os gatilhos declarados `AFTER INSERT OR UPDATE OF status` — converter em
-- cliente, fechar a lead — disparam de qualquer forma; a guarda de idempotência
-- deles já trata da dupla passagem.)
--
-- Nota deliberada: esta função NÃO liga `app.audit_bypass`. Consolidar a
-- auditoria numa só linha (como faz rpc_create_purchase_order) pouparia ruído,
-- mas o risco de interferir com os gatilhos de stock/fornecedor que correm
-- nesta mesma transação não compensa o ganho cosmético.

CREATE OR REPLACE FUNCTION public.rpc_create_manual_client_order(
  p_organization_id uuid,
  p_order           jsonb,
  p_items           jsonb
)
RETURNS public.client_contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor        uuid;
  v_entity_id    uuid;
  v_root_org_id  uuid;
  v_client_id    uuid;
  v_entity_name  text;
  v_quote_id     uuid;
  v_contract     public.client_contracts;
  v_item         jsonb;
  v_ordem        integer := 0;
  v_qt           numeric;
  v_preco        numeric;
  v_iva          numeric;
  v_product_id   uuid;
  v_service_id   uuid;
  v_sem_iva      numeric;
  v_total_sem    numeric := 0;
  v_total_com    numeric := 0;
  v_start_date   date;
BEGIN
  -- ── Ator de negócio (== created_by no frontend) ──────────────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Autorização: mesma permissão de criar um contrato, porque é
  --    literalmente isso que esta função cria ────────────────────────────────
  IF NOT public.has_anew_permission(auth.uid(), 'client_contracts.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar encomendas de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_organization_id IS NULL OR NOT public.fn_deal_org_in_scope(p_organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Cliente (entidade) ───────────────────────────────────────────────────
  v_entity_id := nullif(p_order ->> 'entity_id', '')::uuid;
  IF v_entity_id IS NULL THEN
    RAISE EXCEPTION 'É obrigatório indicar o cliente da encomenda' USING ERRCODE = 'check_violation';
  END IF;

  -- `anew_entities` é agnóstica à organização (id, type, display_name, ...):
  -- quem carrega o âmbito organizacional é a ficha de cliente `anew_clients`.
  -- Exigir essa ficha é também a validação de âmbito: uma Encomenda Cliente só
  -- pode existir para um cliente real desta organização.
  SELECT c.id, c.root_organization_id
    INTO v_client_id, v_root_org_id
    FROM public.anew_clients c
   WHERE c.entity_id = v_entity_id
     AND c.organization_id = p_organization_id
     AND c.deleted_at IS NULL
   LIMIT 1;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado nesta organização' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT e.display_name INTO v_entity_name
    FROM public.anew_entities e
   WHERE e.id = v_entity_id;

  -- ── Linhas ───────────────────────────────────────────────────────────────
  IF p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A encomenda tem de ter pelo menos uma linha' USING ERRCODE = 'check_violation';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
    v_service_id := nullif(v_item ->> 'service_id', '')::uuid;

    IF (v_product_id IS NULL) = (v_service_id IS NULL) THEN
      RAISE EXCEPTION 'Cada linha tem de ter exatamente um produto ou um serviço' USING ERRCODE = 'check_violation';
    END IF;

    v_qt := COALESCE((v_item ->> 'qt')::numeric, 0);
    IF v_qt IS NULL OR v_qt <= 0 THEN
      RAISE EXCEPTION 'A quantidade de cada linha tem de ser maior que zero' USING ERRCODE = 'check_violation';
    END IF;

    IF v_product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products p WHERE p.id = v_product_id
    ) THEN
      RAISE EXCEPTION 'Produto não encontrado: %', v_product_id USING ERRCODE = 'no_data_found';
    END IF;

    IF v_service_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.services s WHERE s.id = v_service_id
    ) THEN
      RAISE EXCEPTION 'Serviço não encontrado: %', v_service_id USING ERRCODE = 'no_data_found';
    END IF;

    v_preco   := COALESCE((v_item ->> 'preco_unit')::numeric, 0);
    v_iva     := COALESCE((v_item ->> 'iva_percent')::numeric, 23);
    v_sem_iva := round(v_qt * v_preco, 2);

    v_total_sem := v_total_sem + v_sem_iva;
    v_total_com := v_total_com + round(v_sem_iva * (1 + v_iva / 100), 2);
  END LOOP;

  -- ── 1. Orçamento sintético (nunca aparece em Quotes.tsx / Proposals.tsx) ──
  INSERT INTO public.quotes (
    entity_id, cliente_id, organization_id, root_organization_id,
    created_by, estado, is_internal, moeda,
    subtotal, total, iva_rate, accepted_at,
    title, obra_notas
  )
  VALUES (
    v_entity_id, v_client_id, p_organization_id, v_root_org_id,
    v_actor, 'aceite', true, 'EUR',
    v_total_sem, v_total_com, 23, now(),
    'Encomenda manual — ' || COALESCE(v_entity_name, 'cliente'),
    nullif(p_order ->> 'notes', '')
  )
  RETURNING id INTO v_quote_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
    v_service_id := nullif(v_item ->> 'service_id', '')::uuid;
    v_qt         := COALESCE((v_item ->> 'qt')::numeric, 0);
    v_preco      := COALESCE((v_item ->> 'preco_unit')::numeric, 0);
    v_iva        := COALESCE((v_item ->> 'iva_percent')::numeric, 23);
    v_sem_iva    := round(v_qt * v_preco, 2);
    v_ordem      := v_ordem + 1;

    INSERT INTO public.quote_lines (
      quote_id, categoria, descricao_snapshot,
      qt, product_id, service_id,
      custo_material_unit, margem_percent, iva_percent,
      total_sem_iva, total_com_iva, total_com_desconto,
      ordem, section_name
    )
    VALUES (
      v_quote_id,
      COALESCE(nullif(v_item ->> 'categoria', ''), 'Geral'),
      COALESCE(nullif(v_item ->> 'descricao', ''), 'Item'),
      v_qt, v_product_id, v_service_id,
      v_preco, 0, v_iva,
      v_sem_iva, round(v_sem_iva * (1 + v_iva / 100), 2), v_sem_iva,
      v_ordem, 'Geral'
    );
  END LOOP;

  -- ── 2. Contrato em rascunho (contract_number é gerado pelo trigger
  --       trigger_set_client_contract_number, BEFORE INSERT) ────────────────
  v_start_date := COALESCE(nullif(p_order ->> 'start_date', '')::date, current_date);

  -- contract_number fica NULL de propósito: o trigger set_client_contract_number
  -- só gera o número quando o valor vem NULL (um '' passaria incólume e a
  -- encomenda ficaria sem número).
  INSERT INTO public.client_contracts (
    contract_number, client_id, entity_id, quote_id,
    organization_id, root_organization_id, created_by,
    status, total_value, currency, start_date, notes
  )
  VALUES (
    NULL, v_client_id, v_entity_id, v_quote_id,
    p_organization_id, v_root_org_id, v_actor,
    'draft', v_total_com, 'EUR', v_start_date,
    nullif(p_order ->> 'notes', '')
  )
  RETURNING * INTO v_contract;

  -- ── 3. Promover a assinado: é este UPDATE que dispara a dedução de stock e
  --       os pedidos a fornecedor (AFTER UPDATE OF status) ──────────────────
  UPDATE public.client_contracts
     SET status          = 'signed',
         signature_date  = now(),
         accepted_at     = now(),
         signed_by_name  = COALESCE(v_entity_name, 'Encomenda manual'),
         status_changed_by = v_actor,
         status_changed_at = now()
   WHERE id = v_contract.id
  RETURNING * INTO v_contract;

  RETURN v_contract;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_manual_client_order(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_manual_client_order(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_manual_client_order(uuid, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.rpc_create_manual_client_order(uuid, jsonb, jsonb) IS
  'Cria uma Encomenda Cliente manualmente: orçamento sintético (quotes.is_internal = true) + quote_lines + client_contracts promovido a signed na mesma transação, reaproveitando os gatilhos de dedução de stock e pedido a fornecedor. Ponto único de entrada — quando existir o fluxo de venda direta (proposta aceite gera fatura sem contrato), é aqui que a implementação muda, sem tocar no frontend.';
