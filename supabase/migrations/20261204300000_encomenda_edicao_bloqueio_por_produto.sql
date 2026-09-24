-- ============================================================================
-- Encomendas de Cliente (manuais) — edição: bloqueio por produto
-- ----------------------------------------------------------------------------
-- Parte da definição VIVA de public.rpc_update_manual_client_order
-- (pg_get_functiondef, criada em 20261204290000). Só muda:
--
--  1. [HIGH] Linhas novas (quote_line_id null) com um produto trancado no
--     contrato — saída de stock sem estorno ou item em pedido a fornecedor não
--     cancelado, i.e. fn_client_order_product_locked(contrato, NULL, produto) —
--     são recusadas. O mesmo para linhas existentes não trancadas cujo
--     product_id muda para um produto trancado. As quantidades servidas são
--     agregadas por produto, por isso uma linha nova do mesmo produto passaria
--     a contar como já servida. Validação antes de qualquer escrita.
--  2. [LOW] A validação de quantidade inteira (unidade contável) só corre para
--     linhas novas ou alteradas; linhas enviadas sem alterações (ex.: já
--     servidas, com decimais antigos) não impedem editar o resto.
--
-- Permissões, SECURITY DEFINER, search_path e GRANTs mantêm-se (CREATE OR
-- REPLACE com a mesma assinatura preserva os privilégios).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_update_manual_client_order(p_contract_id uuid, p_items jsonb, p_delivery_address text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_contract     public.client_contracts;
  v_quote_id     uuid;
  v_item         jsonb;
  v_line         public.quote_lines;
  v_line_id      uuid;
  v_seen_ids     uuid[] := ARRAY[]::uuid[];
  v_product_id   uuid;
  v_service_id   uuid;
  v_uom_id       uuid;
  v_qt           numeric;
  v_preco        numeric;
  v_iva          numeric;
  v_sem_iva      numeric;
  v_descricao    text;
  v_categoria    text;
  v_prod_uom     text;
  v_ordem        integer;
  v_total_sem    numeric;
  v_total_com    numeric;
  v_total_fees   numeric;
  v_changed      boolean;
BEGIN
  IF p_contract_id IS NULL THEN
    RAISE EXCEPTION 'contract_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Autorização: permissão de edição de contratos ───────────────────────
  IF NOT public.has_anew_permission(auth.uid(), 'client_contracts.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar encomendas de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_contract
    FROM public.client_contracts cc
   WHERE cc.id = p_contract_id
     AND cc.deleted_at IS NULL
   FOR UPDATE;

  IF v_contract.id IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Mesmo âmbito de rpc_create_manual_client_order.
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

  v_quote_id := v_contract.quote_id;
  IF v_quote_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.quotes q
     WHERE q.id = v_quote_id AND q.is_internal = true
  ) THEN
    RAISE EXCEPTION 'Encomenda manual sem orçamento interno associado' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM 1 FROM public.quotes q WHERE q.id = v_quote_id FOR UPDATE;

  -- ── Validação das linhas (antes de qualquer escrita) ────────────────────
  IF p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A encomenda tem de ter pelo menos uma linha' USING ERRCODE = 'check_violation';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_line_id    := nullif(v_item ->> 'quote_line_id', '')::uuid;
    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
    v_service_id := nullif(v_item ->> 'service_id', '')::uuid;
    v_uom_id     := nullif(v_item ->> 'uom_id', '')::uuid;

    IF v_line_id IS NOT NULL THEN
      IF v_line_id = ANY (v_seen_ids) THEN
        RAISE EXCEPTION 'A mesma linha aparece repetida na encomenda' USING ERRCODE = 'check_violation';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.quote_lines ql
         WHERE ql.id = v_line_id AND ql.quote_id = v_quote_id
      ) THEN
        RAISE EXCEPTION 'Linha não pertence a esta encomenda: %', v_line_id USING ERRCODE = 'no_data_found';
      END IF;
      v_seen_ids := v_seen_ids || v_line_id;
    END IF;

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

    -- NOVO (20261204300000): linha existente enviada sem alterações? Mesma
    -- comparação (e mesmos valores por omissão) do ciclo de escrita abaixo.
    v_changed := true;
    IF v_line_id IS NOT NULL THEN
      SELECT * INTO v_line FROM public.quote_lines WHERE id = v_line_id;
      v_changed :=
           v_line.product_id          IS DISTINCT FROM v_product_id
        OR v_line.service_id          IS DISTINCT FROM v_service_id
        OR v_line.qt                  IS DISTINCT FROM v_qt
        OR v_line.custo_material_unit IS DISTINCT FROM COALESCE((v_item ->> 'preco_unit')::numeric, 0)
        OR v_line.iva_percent         IS DISTINCT FROM COALESCE((v_item ->> 'iva_percent')::numeric, 23)
        OR v_line.uom_id              IS DISTINCT FROM v_uom_id
        OR v_line.descricao_snapshot  IS DISTINCT FROM COALESCE(nullif(v_item ->> 'descricao', ''), 'Item')
        OR v_line.categoria           IS DISTINCT FROM COALESCE(nullif(v_item ->> 'categoria', ''), 'Geral');
    END IF;

    -- NOVO (20261204300000): produto trancado no contrato (saída de stock sem
    -- estorno ou pedido a fornecedor não cancelado) não pode ganhar quantidade
    -- por uma linha nova, nem por uma linha não trancada que mude para ele.
    IF v_product_id IS NOT NULL
       AND (
             v_line_id IS NULL
             OR (
                  v_line.product_id IS DISTINCT FROM v_product_id
                  AND NOT public.fn_client_order_product_locked(p_contract_id, v_line.id, v_line.product_id)
                )
           )
       AND public.fn_client_order_product_locked(p_contract_id, NULL, v_product_id) THEN
      RAISE EXCEPTION 'O produto % já foi servido ou pedido a fornecedor nesta encomenda — reverta a saída antes de acrescentar quantidade',
        COALESCE(
          nullif(v_item ->> 'descricao', ''),
          (SELECT p.name FROM public.products p WHERE p.id = v_product_id),
          v_product_id::text
        ) USING ERRCODE = 'check_violation';
    END IF;

    -- Unidade contável (embalagem escolhida, ou unidade base do produto
    -- un/EA/PCS/BOX/PKG) => quantidade inteira.
    v_prod_uom := NULL;
    IF v_product_id IS NOT NULL THEN
      SELECT lower(u.code) INTO v_prod_uom
        FROM public.products p
        LEFT JOIN public.uom u ON u.id = p.uom_id
       WHERE p.id = v_product_id;
    END IF;

    -- ALTERADO (20261204300000): só para linhas novas ou alteradas — decimais
    -- antigos em linhas enviadas sem alterações (ex.: já servidas) não
    -- impedem editar o resto da encomenda.
    IF v_changed
       AND (v_uom_id IS NOT NULL OR v_prod_uom IN ('un', 'ea', 'pcs', 'box', 'pkg'))
       AND v_qt <> trunc(v_qt) THEN
      RAISE EXCEPTION 'A quantidade da linha "%" tem de ser um número inteiro (unidade contável)',
        COALESCE(nullif(v_item ->> 'descricao', ''), 'Item') USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  -- ── Remover linhas ausentes de p_items (nunca as trancadas) ─────────────
  FOR v_line IN
    SELECT * FROM public.quote_lines ql
     WHERE ql.quote_id = v_quote_id
       AND NOT (ql.id = ANY (v_seen_ids))
  LOOP
    IF public.fn_client_order_product_locked(p_contract_id, v_line.id, v_line.product_id) THEN
      RAISE EXCEPTION 'A linha "%" não pode ser removida: já saiu de stock ou tem pedido a fornecedor.',
        v_line.descricao_snapshot USING ERRCODE = 'check_violation';
    END IF;
    DELETE FROM public.quote_lines WHERE id = v_line.id;
  END LOOP;

  -- ── Atualizar existentes / inserir novas ────────────────────────────────
  SELECT COALESCE(MAX(ql.ordem), 0) INTO v_ordem
    FROM public.quote_lines ql WHERE ql.quote_id = v_quote_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_line_id    := nullif(v_item ->> 'quote_line_id', '')::uuid;
    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
    v_service_id := nullif(v_item ->> 'service_id', '')::uuid;
    v_uom_id     := nullif(v_item ->> 'uom_id', '')::uuid;
    v_qt         := COALESCE((v_item ->> 'qt')::numeric, 0);
    v_preco      := COALESCE((v_item ->> 'preco_unit')::numeric, 0);
    v_iva        := COALESCE((v_item ->> 'iva_percent')::numeric, 23);
    v_sem_iva    := round(v_qt * v_preco, 2);
    v_descricao  := COALESCE(nullif(v_item ->> 'descricao', ''), 'Item');
    v_categoria  := COALESCE(nullif(v_item ->> 'categoria', ''), 'Geral');

    IF v_line_id IS NOT NULL THEN
      SELECT * INTO v_line FROM public.quote_lines WHERE id = v_line_id FOR UPDATE;

      IF v_line.product_id         IS DISTINCT FROM v_product_id
         OR v_line.service_id      IS DISTINCT FROM v_service_id
         OR v_line.qt              IS DISTINCT FROM v_qt
         OR v_line.custo_material_unit IS DISTINCT FROM v_preco
         OR v_line.iva_percent     IS DISTINCT FROM v_iva
         OR v_line.uom_id          IS DISTINCT FROM v_uom_id
         OR v_line.descricao_snapshot IS DISTINCT FROM v_descricao
         OR v_line.categoria       IS DISTINCT FROM v_categoria THEN

        IF public.fn_client_order_product_locked(p_contract_id, v_line.id, v_line.product_id) THEN
          RAISE EXCEPTION 'A linha "%" não pode ser alterada: já saiu de stock ou tem pedido a fornecedor.',
            v_line.descricao_snapshot USING ERRCODE = 'check_violation';
        END IF;

        UPDATE public.quote_lines
           SET product_id          = v_product_id,
               service_id          = v_service_id,
               qt                  = v_qt,
               custo_material_unit = v_preco,
               iva_percent         = v_iva,
               descricao_snapshot  = v_descricao,
               categoria           = v_categoria,
               total_sem_iva       = v_sem_iva,
               total_com_iva       = round(v_sem_iva * (1 + v_iva / 100), 2),
               total_com_desconto  = v_sem_iva,
               uom_id              = v_uom_id,
               -- fn_line_units_per_uom_snapshot repõe unidade/fator quando
               -- há embalagem; sem embalagem a unidade antiga não fica.
               unidade             = CASE WHEN v_uom_id IS DISTINCT FROM v_line.uom_id
                                          THEN NULL ELSE v_line.unidade END
         WHERE id = v_line.id;
      END IF;
    ELSE
      v_ordem := v_ordem + 1;

      INSERT INTO public.quote_lines (
        quote_id, categoria, descricao_snapshot,
        qt, product_id, service_id,
        custo_material_unit, margem_percent, iva_percent,
        total_sem_iva, total_com_iva, total_com_desconto,
        ordem, section_name,
        uom_id
      )
      VALUES (
        v_quote_id,
        v_categoria,
        v_descricao,
        v_qt, v_product_id, v_service_id,
        v_preco, 0, v_iva,
        v_sem_iva, round(v_sem_iva * (1 + v_iva / 100), 2), v_sem_iva,
        v_ordem, 'Geral',
        v_uom_id
      );
    END IF;
  END LOOP;

  -- ── Totais (mesmas fórmulas da criação: soma das linhas arredondadas) ────
  SELECT COALESCE(SUM(ql.total_sem_iva), 0), COALESCE(SUM(ql.total_com_iva), 0)
    INTO v_total_sem, v_total_com
    FROM public.quote_lines ql
   WHERE ql.quote_id = v_quote_id;

  UPDATE public.quotes
     SET subtotal      = v_total_sem,
         total         = v_total_com,
         obra_endereco = nullif(btrim(p_delivery_address), '')
   WHERE id = v_quote_id
  RETURNING COALESCE(total_fees, 0) INTO v_total_fees;

  -- set_client_contract_total_value_sem_iva não recalcula depois de assinado
  -- (valor congelado): os dois valores são escritos aqui explicitamente.
  UPDATE public.client_contracts
     SET total_value         = v_total_com,
         total_value_sem_iva = v_total_sem + v_total_fees
   WHERE id = p_contract_id
  RETURNING * INTO v_contract;

  RETURN jsonb_build_object(
    'success',      true,
    'contract_id',  v_contract.id,
    'order_number', v_contract.order_number,
    'total_value',  v_contract.total_value
  );
END;
$function$
;

COMMIT;
