-- ============================================================
-- 20261204900000_eliminar_encomenda_cliente
-- ============================================================
-- Eliminar uma Encomenda de Cliente (manual ou de venda direta) com
-- devolução de stock, cancelamento dos pedidos a fornecedor pendentes e
-- cancelamento da venda direta ligada — e fecho da falha de segurança que
-- deixava eliminar contratos (incluindo assinados e encomendas com stock
-- saído) sem nenhuma permissão de eliminação.
--
-- Estado encontrado antes (lido ao vivo com pg_get_functiondef, 29/09/2026):
--
--   • _soft_delete_business_entity_impl, ramo p_kind='contract': só
--     verificava get_user_visible_org_ids. Qualquer membro da organização
--     (mesmo sem client_contracts.delete) podia, chamando a RPC
--     soft_delete_business_entity diretamente, pôr deleted_at num contrato
--     assinado ou numa encomenda manual — sem estornar stock, sem cancelar
--     POs, e a reserva/encomendas deixavam de a ver. 29 contratos reais
--     assinados já estão apagados assim em produção (não tratado aqui).
--   • restore_business_entity: idem, só visibilidade da organização.
--   • rpc_create_direct_sale_order: a idempotência devolvia o contrato ligado
--     mesmo que estivesse apagado/anulado. Como authenticated pode passar uma
--     VD de 'cancelada' para 'rascunho' (o gatilho de guarda só protege
--     transições de/para 'aceite') e voltar a confirmá-la, a VD ficava
--     'aceite' (com proforma nova) a apontar para uma encomenda morta.
--
-- Esta migration:
--   1. Nova permissão client_orders.delete (perigosa, supports_scope como
--      client_contracts.delete) + sincronização de System Admin e Super
--      Admin (padrão 20261201080000). Não é atribuída a mais nenhum papel.
--   2. Nova RPC rpc_delete_client_order(p_contract_id, p_reason).
--   3. rpc_create_direct_sale_order: recusa quando a encomenda ligada está
--      apagada ou anulada (nunca a recria nem a devolve como válida).
--      rpc_confirm_direct_sale NÃO muda: já recusa 'cancelada'/'rejeitada' e
--      os caminhos que chamam rpc_create_direct_sale_order passam a falhar
--      com a mensagem nova.
--   4. _soft_delete_business_entity_impl e restore_business_entity: só os
--      ramos de contrato mudam (deal/quote/proposal ficam iguais).
--
-- Colunas/valores reais confirmados ao vivo:
--   client_contracts: status ('draft','pending_signature','signed',
--     'cancelled'; 'assinado' não existe), is_manual_order NOT NULL,
--     order_number, cancelled_at, cancelled_by, cancellation_reason,
--     status_changed_by, status_changed_at, deleted_at, deleted_by (sem FK).
--   purchase_orders.status: pending, ordered, partially_received, received
--     (+ 'cancelled' escrito pelo gatilho); source_type CHECK
--     ('contract','proposal').
--   direct_sales.status CHECK inclui 'cancelada'; invoice_status
--     ('pendente','emitida'); não há cancelled_at/cancellation_reason.
--   portal_document_type: proposal, quote, contract, direct_sale.
--
-- Prerequisites: 20261201080000_permissao_eliminar_propostas_enviadas.sql
--                20261204630000_stock_desconto_respeita_reserva_e_estorno_saidas.sql
--                20261204800000_endurecer_permissoes_venda_direta_stock.sql

-- ============================================================
-- 1. Catálogo: client_orders.delete
-- ============================================================

INSERT INTO public.anew_permissions (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES (
  'client_orders.delete',
  'Eliminar encomendas de cliente',
  'Permite eliminar Encomendas Clientes manuais ou geradas por venda direta (rpc_delete_client_order): a encomenda é anulada, o stock que já saiu é devolvido, os pedidos a fornecedor pendentes são cancelados, a venda direta ligada fica cancelada e a encomenda vai para o Lixo. Recusa se houver pedidos a fornecedor já encomendados/recebidos ou fatura emitida.',
  'client_orders',
  NULL,
  2,
  true,
  'organization',
  true
)
ON CONFLICT (code) DO NOTHING;

-- System Admin e Super Admin (o frontend não faz bypass; ver 20261130110000).
ALTER TABLE public.anew_role_permissions DISABLE TRIGGER USER;

INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT r.role_id, 'client_orders.delete', NULL::uuid
FROM (VALUES
  ('03a43423-9b3c-4640-9dbe-31687f829869'::uuid), -- System Admin
  ('e91ef94e-a5e6-415c-9985-0c2b7594720b'::uuid)  -- Super Admin
) AS r(role_id)
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER USER;

-- ============================================================
-- 2. rpc_delete_client_order
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_delete_client_order(p_contract_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid              uuid := auth.uid();
  v_actor            uuid;
  v_contract         public.client_contracts;
  v_reason           text;
  v_full_access      boolean := false;
  v_blocking_pos     text;
  v_invoiced_sales   text;
  v_movs_before      integer := 0;
  v_pending_before   integer := 0;
  v_movs_left        integer := 0;
  v_pos_left         text;
  v_ds_cancelled     integer := 0;
  v_entity_id        uuid;
  v_err              text;
BEGIN
  -- ── Autenticação e permissão ─────────────────────────────────────────────
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_contract_id IS NULL THEN
    RAISE EXCEPTION 'É obrigatório indicar a encomenda' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.has_anew_permission(v_uid, 'client_orders.delete') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar encomendas de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Indique o motivo da eliminação (pelo menos 3 caracteres)' USING ERRCODE = 'check_violation';
  END IF;
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION 'O motivo não pode ter mais de 500 caracteres' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Leitura com lock (serializa duas eliminações da mesma encomenda) ─────
  SELECT * INTO v_contract
    FROM public.client_contracts cc
   WHERE cc.id = p_contract_id
     AND cc.deleted_at IS NULL
   FOR UPDATE;

  IF v_contract.id IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Mesmo helper de âmbito de organização que rpc_update_client_order_header.
  IF NOT public.fn_deal_org_in_scope(v_contract.organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Âmbito por registo (client_orders.delete tem supports_scope) ─────────
  -- Acesso total: super admin na organização ou num antepassado (o mesmo que
  -- resolve_lead_access_context e o frontend tratam como ORG), ou system
  -- admin que seja membro direto da organização ou tenha sessão de suporte
  -- ativa nela (padrão de 20261204800000 / system_admin_pii_default_deny).
  -- Restantes: chaves de âmbito da própria permissão (ORG / TEAM / OWNED),
  -- casadas com created_by ou assigned_to, como a RLS client_contracts_delete.
  v_full_access :=
    (public.is_system_admin(v_uid)
       AND (v_contract.organization_id IN (SELECT public.get_user_crm_org_ids(v_uid))
            OR public.has_active_support_access(v_contract.organization_id)))
    OR EXISTS (
      WITH RECURSIVE chain AS (
        SELECT v_contract.organization_id AS org_id
        UNION
        SELECT h.parent_org_id
          FROM public.anew_hierarchy h
          JOIN chain c ON c.org_id = h.child_org_id
         WHERE h.parent_org_id IS NOT NULL
      )
      SELECT 1
        FROM public.anew_memberships m
        JOIN public.anew_users u ON u.id = m.user_id
        JOIN public.anew_roles r ON r.id = m.role_id
       WHERE u.auth_user_id = v_uid
         AND m.status = 'active'
         AND r.code = 'super_admin'
         AND m.organization_id IN (SELECT org_id FROM chain)
    );

  IF NOT v_full_access AND NOT EXISTS (
    SELECT 1
      FROM unnest(public.crm_scope_keys('client_orders.delete')) AS k(scope_key)
     WHERE k.scope_key = v_contract.organization_id::text || ':*'
        OR k.scope_key = v_contract.organization_id::text || ':' || v_contract.created_by::text
        OR k.scope_key = v_contract.organization_id::text || ':' || v_contract.assigned_to::text
  ) THEN
    RAISE EXCEPTION 'Sem permissão para eliminar esta encomenda (fora do seu âmbito)' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Origem e estado ──────────────────────────────────────────────────────
  IF NOT COALESCE(v_contract.is_manual_order, false) THEN
    RAISE EXCEPTION 'Encomendas de contrato são anuladas no módulo Contratos' USING ERRCODE = 'check_violation';
  END IF;

  IF v_contract.status = 'cancelled' THEN
    RAISE EXCEPTION 'Esta encomenda já está anulada' USING ERRCODE = 'check_violation';
  END IF;

  IF v_contract.status IS DISTINCT FROM 'signed' THEN
    RAISE EXCEPTION 'Só é possível eliminar encomendas ativas (estado atual: %)', v_contract.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Pedidos a fornecedor já em curso ─────────────────────────────────────
  -- O gatilho de anulação só cancela os 'pending'; os restantes ficariam
  -- órfãos. Recusa-se antes de mexer em nada.
  SELECT string_agg(po.order_number, ', ' ORDER BY po.order_number)
    INTO v_blocking_pos
    FROM public.purchase_orders po
   WHERE po.source_type = 'contract'
     AND po.source_id = p_contract_id
     AND po.deleted_at IS NULL
     AND po.status IN ('ordered', 'partially_received', 'received');

  IF v_blocking_pos IS NOT NULL THEN
    RAISE EXCEPTION 'Não é possível eliminar: esta encomenda já tem pedidos a fornecedor encomendados ou recebidos (%). Trate-os primeiro em Encomendas a Fornecedor.', v_blocking_pos
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Venda direta ligada ──────────────────────────────────────────────────
  PERFORM 1
    FROM public.direct_sales ds
   WHERE ds.client_contract_id = p_contract_id
     AND ds.deleted_at IS NULL
   FOR UPDATE;

  SELECT string_agg(COALESCE(ds.sale_number, ds.id::text), ', ' ORDER BY ds.sale_number)
    INTO v_invoiced_sales
    FROM public.direct_sales ds
   WHERE ds.client_contract_id = p_contract_id
     AND ds.deleted_at IS NULL
     AND ds.invoice_status = 'emitida';

  IF v_invoiced_sales IS NOT NULL THEN
    RAISE EXCEPTION 'A venda direta % já tem fatura registada; a encomenda não pode ser eliminada', v_invoiced_sales
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Contagens antes (para o retorno e para a verificação) ────────────────
  SELECT count(*) INTO v_movs_before
    FROM public.stock_movements sm
   WHERE sm.sale_source_type = 'contract'
     AND sm.sale_source_id = p_contract_id
     AND sm.movement_type IN ('venda', 'saida')
     AND NOT EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.reversal_of_movement_id = sm.id);

  SELECT count(*) INTO v_pending_before
    FROM public.purchase_orders po
   WHERE po.source_type = 'contract'
     AND po.source_id = p_contract_id
     AND po.status = 'pending';

  -- ── Anulação (mesmas colunas de cancel_and_replace_contract) ─────────────
  -- Este UPDATE OF status dispara trg_contract_cancelled_stock_reversal e
  -- trg_contract_cancelled_supplier_request_reversal.
  PERFORM public.set_audit_context(v_actor, 'crm');

  UPDATE public.client_contracts
     SET status              = 'cancelled',
         cancelled_at        = now(),
         cancelled_by        = v_actor,
         cancellation_reason = v_reason,
         status_changed_by   = v_actor,
         status_changed_at   = now()
   WHERE id = p_contract_id;

  -- ── Verificação: os gatilhos são best-effort, aqui não pode ser ──────────
  SELECT count(*) INTO v_movs_left
    FROM public.stock_movements sm
   WHERE sm.sale_source_type = 'contract'
     AND sm.sale_source_id = p_contract_id
     AND sm.movement_type IN ('venda', 'saida')
     AND NOT EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.reversal_of_movement_id = sm.id);

  IF v_movs_left > 0 THEN
    -- O registo de erro do gatilho é revertido com esta exceção: copia-se a
    -- causa para a mensagem (executed_at = now() = esta transação).
    SELECT l.error_message INTO v_err
      FROM public.workflow_execution_log l
     WHERE l.source_entity = 'contract'
       AND l.source_record_id = p_contract_id
       AND l.status = 'error'
       AND l.action_type IN ('trigger:contract_stock_reversal_line_error', 'trigger:contract_stock_reversal')
       AND l.executed_at = now()
     LIMIT 1;
    RAISE EXCEPTION 'Não foi possível devolver o stock de % movimento(s) desta encomenda; a encomenda não foi eliminada%',
      v_movs_left, COALESCE(' (' || v_err || ')', '')
      USING ERRCODE = 'internal_error';
  END IF;

  SELECT string_agg(po.order_number, ', ' ORDER BY po.order_number)
    INTO v_pos_left
    FROM public.purchase_orders po
   WHERE po.source_type = 'contract'
     AND po.source_id = p_contract_id
     AND po.status = 'pending';

  IF v_pos_left IS NOT NULL THEN
    RAISE EXCEPTION 'Não foi possível cancelar os pedidos a fornecedor pendentes (%); a encomenda não foi eliminada', v_pos_left
      USING ERRCODE = 'internal_error';
  END IF;

  -- ── Venda direta: cancelada, ligação mantida (histórico) ─────────────────
  -- Corre como postgres: o gatilho trg_direct_sales_00_guard_system_columns
  -- só trava authenticated/anon (saída de 'aceite').
  UPDATE public.direct_sales
     SET status = 'cancelada'
   WHERE client_contract_id = p_contract_id
     AND deleted_at IS NULL
     AND status IS DISTINCT FROM 'cancelada';
  GET DIAGNOSTICS v_ds_cancelled = ROW_COUNT;

  INSERT INTO public.client_contract_events (
    contract_id, event_type, description, new_values, created_by
  ) VALUES (
    p_contract_id, 'contract_cancelled', v_reason,
    jsonb_build_object(
      'source',                'rpc_delete_client_order',
      'reversed_movements',    v_movs_before,
      'cancelled_pos',         v_pending_before,
      'direct_sale_cancelled', v_ds_cancelled > 0
    ),
    v_actor
  );

  -- ── Soft delete (o que _soft_delete_business_entity_impl faz a contratos)
  UPDATE public.client_contracts
     SET deleted_at = now(),
         deleted_by = v_actor
   WHERE id = p_contract_id
     AND deleted_at IS NULL
  RETURNING entity_id INTO v_entity_id;

  IF v_entity_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.anew_entity_history(entity_id, change_type, field_name, old_value, new_value, changed_by, metadata)
      VALUES (v_entity_id, 'deleted', 'contract', NULL, p_contract_id::text, v_actor,
              jsonb_build_object('kind', 'contract', 'id', p_contract_id,
                                 'organization_id', v_contract.organization_id,
                                 'source', 'rpc_delete_client_order',
                                 'reason', v_reason));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- Retirar do portal do cliente na mesma transação (20261201070000).
  UPDATE public.client_portal_documents
     SET is_visible = false,
         revoked_at = now(),
         revoked_by = v_actor
   WHERE document_type = 'contract'::public.portal_document_type
     AND document_id = p_contract_id
     AND is_visible = true;

  RETURN jsonb_build_object(
    'success',               true,
    'contract_id',           p_contract_id,
    'order_number',          COALESCE(v_contract.order_number, v_contract.contract_number),
    'reversed_movements',    v_movs_before,
    'cancelled_pos',         v_pending_before,
    'direct_sale_cancelled', v_ds_cancelled > 0
  );
END;
$function$;

ALTER FUNCTION public.rpc_delete_client_order(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_delete_client_order(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_delete_client_order(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_client_order(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delete_client_order(uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_delete_client_order(uuid, text) IS
  'Elimina uma Encomenda Cliente manual ou de venda direta: anula (estorno de stock e cancelamento de POs pendentes pelos gatilhos, verificados), cancela a VD ligada e faz soft delete. Exige client_orders.delete com âmbito. 20261204900000.';

-- ============================================================
-- 3. rpc_create_direct_sale_order — não reutilizar encomenda morta
--    Corpo idêntico à versão viva (pg_get_functiondef 29/09/2026), exceto o
--    bloco assinalado "NOVO (20261204900000)".
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_create_direct_sale_order(p_direct_sale_id uuid)
 RETURNS client_contracts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sale         public.direct_sales;
  v_contract     public.client_contracts;
  v_client_id    uuid;
  v_root_org_id  uuid;
  v_entity_name  text;
  v_quote_id     uuid;
  v_line_count   integer;
BEGIN
  IF p_direct_sale_id IS NULL THEN
    RAISE EXCEPTION 'É obrigatório indicar a venda direta' USING ERRCODE = 'check_violation';
  END IF;

  -- FOR UPDATE serializa aceitações concorrentes da mesma venda: sem isto,
  -- dois pedidos simultâneos passariam os dois pela guarda de idempotência
  -- abaixo e criariam duas encomendas (com dedução de stock a dobrar).
  SELECT * INTO v_sale
    FROM public.direct_sales
   WHERE id = p_direct_sale_id
     AND deleted_at IS NULL
     FOR UPDATE;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'Venda direta não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Idempotência ─────────────────────────────────────────────────────────
  -- Reaceitação não cria uma segunda encomenda, pela mesma razão por que não
  -- gera um segundo número de proforma: um documento emitido não se duplica.
  IF v_sale.client_contract_id IS NOT NULL THEN
    SELECT * INTO v_contract
      FROM public.client_contracts
     WHERE id = v_sale.client_contract_id;

    IF v_contract.id IS NOT NULL THEN
      -- NOVO (20261204900000): encomenda eliminada/anulada (rpc_delete_client_order
      -- mantém a ligação por histórico). Nunca a recria nem a devolve como
      -- válida — uma VD cancelada que volte a rascunho não pode ser
      -- reconfirmada contra ela.
      IF v_contract.deleted_at IS NOT NULL OR v_contract.status IN ('cancelled', 'rejected') THEN
        RAISE EXCEPTION 'A encomenda de cliente % desta venda direta foi anulada ou eliminada; crie uma nova venda direta',
          COALESCE(v_contract.order_number, v_contract.contract_number, v_contract.id::text)
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN v_contract;
    END IF;
    -- Ponteiro pendurado (contrato apagado à mão): cai para a criação normal.
  END IF;

  IF v_sale.status IS DISTINCT FROM 'aceite' THEN
    RAISE EXCEPTION 'A encomenda só é criada depois de a venda direta ser aceite (estado actual: %)', v_sale.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_sale.created_by IS NULL THEN
    RAISE EXCEPTION 'Venda direta sem autor; não é possível atribuir a encomenda' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Cliente ──────────────────────────────────────────────────────────────
  -- Exigir a ficha em anew_clients é também a validação de âmbito: a
  -- encomenda só pode existir para um cliente real desta organização.
  -- Mesma regra de rpc_create_manual_client_order.
  IF v_sale.entity_id IS NULL THEN
    RAISE EXCEPTION 'Venda direta sem cliente associado' USING ERRCODE = 'check_violation';
  END IF;

  SELECT c.id, c.root_organization_id
    INTO v_client_id, v_root_org_id
    FROM public.anew_clients c
   WHERE c.entity_id = v_sale.entity_id
     AND c.organization_id = v_sale.organization_id
     AND c.deleted_at IS NULL
   LIMIT 1;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado nesta organização' USING ERRCODE = 'no_data_found';
  END IF;

  v_root_org_id := COALESCE(v_sale.root_organization_id, v_root_org_id, v_sale.organization_id);

  SELECT e.display_name INTO v_entity_name
    FROM public.anew_entities e
   WHERE e.id = v_sale.entity_id;

  SELECT count(*) INTO v_line_count
    FROM public.direct_sale_lines l
   WHERE l.direct_sale_id = v_sale.id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'A venda direta não tem linhas' USING ERRCODE = 'check_violation';
  END IF;

  -- Dentro da função de propósito: set_audit_context usa set_config(..., true),
  -- ou seja é LOCAL à transação. Chamada antes, de fora, não chegaria aqui.
  PERFORM public.set_audit_context(v_sale.created_by, 'portal_direct_sale');

  -- ── 1. Orçamento sintético (is_internal: nunca aparece em Quotes.tsx) ─────
  INSERT INTO public.quotes (
    entity_id, cliente_id, organization_id, root_organization_id,
    created_by, assigned_to, estado, is_internal, moeda,
    subtotal, total, iva_rate, accepted_at,
    title, obra_notas
  )
  VALUES (
    v_sale.entity_id, v_client_id, v_sale.organization_id, v_root_org_id,
    v_sale.created_by, COALESCE(v_sale.assigned_to, v_sale.created_by),
    'aceite', true, COALESCE(v_sale.currency, 'EUR'),
    COALESCE(v_sale.subtotal, 0), COALESCE(v_sale.total, 0),
    COALESCE(v_sale.iva_rate, 23), COALESCE(v_sale.accepted_at, now()),
    'Venda Direta — ' || COALESCE(v_sale.sale_number, v_sale.id::text),
    v_sale.notes
  )
  RETURNING id INTO v_quote_id;

  -- ── 2. Linhas, incluindo as internas (ver cabeçalho) ─────────────────────
  INSERT INTO public.quote_lines (
    quote_id, categoria, descricao_snapshot,
    qt, unidade, product_id, service_id,
    cost_price, custo_material_unit, retail_price_unit,
    margem_percent, iva_percent, discount_percent,
    total_sem_iva, total_com_iva, total_com_desconto,
    ordem, section_name, visible_to_client,
    uom_id  -- NOVO (20261204204500)
  )
  SELECT
    v_quote_id, 'Geral', l.descricao_snapshot,
    COALESCE(l.qt, 0), l.unidade, l.product_id, l.service_id,
    COALESCE(l.cost_price, 0), COALESCE(l.cost_price, 0), l.retail_price_unit,
    COALESCE(l.margem_percent, 0), COALESCE(l.iva_percent, 23), COALESCE(l.discount_percent, 0),
    COALESCE(l.total_sem_iva, 0), COALESCE(l.total_com_iva, 0), COALESCE(l.total_com_desconto, 0),
    COALESCE(l.ordem, 0), 'Geral', l.visible_to_client,
    l.uom_id
  FROM public.direct_sale_lines l
  WHERE l.direct_sale_id = v_sale.id
  ORDER BY COALESCE(l.ordem, 0), l.created_at;

  -- ── 3. Contrato em rascunho ──────────────────────────────────────────────
  -- contract_number fica NULL de propósito: trigger_set_client_contract_number
  -- (BEFORE INSERT) só gera o número quando o valor vem NULL — um '' passaria
  -- incólume e a encomenda ficaria sem número.
  INSERT INTO public.client_contracts (
    contract_number, client_id, entity_id, quote_id,
    organization_id, root_organization_id, created_by,
    status, total_value, currency, start_date, notes,
    is_manual_order
  )
  VALUES (
    NULL, v_client_id, v_sale.entity_id, v_quote_id,
    v_sale.organization_id, v_root_org_id, v_sale.created_by,
    'draft', COALESCE(v_sale.total, 0), COALESCE(v_sale.currency, 'EUR'),
    COALESCE(v_sale.accepted_at::date, current_date),
    'Gerada automaticamente a partir da venda direta ' || COALESCE(v_sale.sale_number, v_sale.id::text),
    true
  )
  RETURNING * INTO v_contract;

  -- ── 4. Ligação de volta (a coluna estava reservada desde 20261130230000) ──
  -- NOVO (20261204620000): feita ANTES de promover a assinado, para que os
  -- gatilhos AFTER UPDATE OF status (fn_contract_stock_deduction,
  -- fn_client_order_request_missing) já reconheçam a venda direta e escrevam
  -- o VD-… no movimento de stock e nas notas da encomenda a fornecedor. Só
  -- muda o momento da escrita, na mesma transação; o valor é o mesmo.
  UPDATE public.direct_sales
     SET client_contract_id = v_contract.id
   WHERE id = v_sale.id;

  -- ── 5. Promover a assinado: é ESTE UPDATE que dispara stock e fornecedor ──
  UPDATE public.client_contracts
     SET status            = 'signed',
         signature_date    = COALESCE(v_sale.accepted_at, now()),
         accepted_at       = COALESCE(v_sale.accepted_at, now()),
         signed_by_name    = COALESCE(v_entity_name, 'Cliente'),
         status_changed_by = v_sale.created_by,
         status_changed_at = now()
   WHERE id = v_contract.id
  RETURNING * INTO v_contract;

  RETURN v_contract;
END;
$function$;

-- ACL mantida: EXECUTE só postgres/service_role (confirmado ao vivo).
REVOKE ALL ON FUNCTION public.rpc_create_direct_sale_order(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_create_direct_sale_order(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_create_direct_sale_order(uuid) FROM authenticated;

-- ============================================================
-- 4a. _soft_delete_business_entity_impl — ramo de contrato
--     Corpo idêntico à versão viva (20261201080000), exceto os blocos
--     assinalados "NOVO (20261204900000)". deal/quote/proposal inalterados.
-- ============================================================

CREATE OR REPLACE FUNCTION public._soft_delete_business_entity_impl(p_kind text, p_id uuid, p_actor uuid, p_auth_uid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid; v_org_id uuid;
  v_target_org uuid;
  v_proposal_status text;
  -- NOVO (20261204900000)
  v_contract_status     text;
  v_contract_manual     boolean;
  v_contract_created_by uuid;
  v_contract_assigned   uuid;
  v_full_access         boolean;
BEGIN
  IF p_kind NOT IN ('deal','quote','proposal','contract') THEN
    RAISE EXCEPTION 'Invalid kind: %', p_kind;
  END IF;

  IF p_kind = 'deal' THEN
    SELECT organization_id INTO v_target_org FROM public.deals WHERE id = p_id;
  ELSIF p_kind = 'quote' THEN
    SELECT organization_id INTO v_target_org FROM public.quotes WHERE id = p_id;
  ELSIF p_kind = 'proposal' THEN
    SELECT organization_id, status INTO v_target_org, v_proposal_status FROM public.proposals WHERE id = p_id;
  ELSE
    -- NOVO (20261204900000): também estado, origem e dono.
    SELECT organization_id, status, is_manual_order, created_by, assigned_to
      INTO v_target_org, v_contract_status, v_contract_manual, v_contract_created_by, v_contract_assigned
      FROM public.client_contracts WHERE id = p_id;
  END IF;

  IF v_target_org IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT (v_target_org IN (SELECT public.get_user_visible_org_ids(p_auth_uid))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Eliminar uma proposta exige 'proposals.delete'; eliminar uma que já
  -- saiu de rascunho exige adicionalmente 'proposals.delete_sent'. Fecha
  -- o caminho da RPC directa, da eliminação em massa e da ferramenta
  -- cancel_proposal do assistente de IA (que só verificava
  -- 'proposals.edit').
  IF p_kind = 'proposal' THEN
    IF NOT public.has_anew_permission(p_auth_uid, 'proposals.delete') THEN
      RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_proposal_status IS DISTINCT FROM 'draft'
       AND NOT public.has_anew_permission(p_auth_uid, 'proposals.delete_sent') THEN
      RAISE EXCEPTION 'Sem permissao para eliminar propostas ja enviadas' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- NOVO (20261204900000): contratos exigem client_contracts.delete com
  -- âmbito, nunca assinados, e nunca encomendas de cliente (essas têm de
  -- passar por rpc_delete_client_order, que estorna stock e cancela POs).
  IF p_kind = 'contract' THEN
    IF NOT public.has_anew_permission(p_auth_uid, 'client_contracts.delete') THEN
      RAISE EXCEPTION 'Sem permissao para eliminar contratos' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF COALESCE(v_contract_manual, false) THEN
      RAISE EXCEPTION 'Encomendas de cliente eliminam-se em Encomendas Clientes (rpc_delete_client_order), que devolve o stock e cancela os pedidos a fornecedor'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_contract_status IN ('signed', 'active', 'assinado') THEN
      RAISE EXCEPTION 'Contratos assinados têm de ser anulados antes de eliminar' USING ERRCODE = 'check_violation';
    END IF;

    -- Âmbito: system admin mantém o comportamento anterior (organização
    -- visível chega); super admin na organização ou num antepassado = ORG
    -- (como resolve_lead_access_context e o frontend). Restantes: chaves de
    -- client_contracts.delete casadas com created_by/assigned_to, como a RLS
    -- client_contracts_delete. crm_scope_keys usa auth.uid(): um chamador
    -- service_role a agir por outro utilizador não tem chaves e é recusado.
    v_full_access :=
      public.is_system_admin(p_auth_uid)
      OR EXISTS (
        WITH RECURSIVE chain AS (
          SELECT v_target_org AS org_id
          UNION
          SELECT h.parent_org_id
            FROM public.anew_hierarchy h
            JOIN chain c ON c.org_id = h.child_org_id
           WHERE h.parent_org_id IS NOT NULL
        )
        SELECT 1
          FROM public.anew_memberships m
          JOIN public.anew_users u ON u.id = m.user_id
          JOIN public.anew_roles r ON r.id = m.role_id
         WHERE u.auth_user_id = p_auth_uid
           AND m.status = 'active'
           AND r.code = 'super_admin'
           AND m.organization_id IN (SELECT org_id FROM chain)
      );

    IF NOT v_full_access AND (
         p_auth_uid IS DISTINCT FROM auth.uid()
         OR NOT EXISTS (
           SELECT 1
             FROM unnest(public.crm_scope_keys('client_contracts.delete')) AS k(scope_key)
            WHERE k.scope_key = v_target_org::text || ':*'
               OR k.scope_key = v_target_org::text || ':' || v_contract_created_by::text
               OR k.scope_key = v_target_org::text || ':' || v_contract_assigned::text
         )
       ) THEN
      RAISE EXCEPTION 'Sem permissao para eliminar este contrato (fora do seu ambito)' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF p_kind = 'deal' THEN
    UPDATE public.deals SET deleted_at=now(), deleted_by=p_actor
      WHERE id=p_id AND deleted_at IS NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSIF p_kind = 'quote' THEN
    UPDATE public.quotes SET deleted_at=now(), deleted_by=p_actor
      WHERE id=p_id AND deleted_at IS NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSIF p_kind = 'proposal' THEN
    UPDATE public.proposals SET deleted_at=now(), deleted_by=p_actor, is_deleted=true
      WHERE id=p_id AND deleted_at IS NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSE
    UPDATE public.client_contracts SET deleted_at=now(), deleted_by=p_actor
      WHERE id=p_id AND deleted_at IS NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  END IF;

  IF v_entity_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.anew_entity_history(entity_id, change_type, field_name, old_value, new_value, changed_by, metadata)
      VALUES (v_entity_id, 'deleted', p_kind, NULL, p_id::text, p_actor,
              jsonb_build_object('kind', p_kind, 'id', p_id, 'organization_id', v_org_id));
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Retirar do portal do cliente na mesma transação (20261201070000).
    -- 'deal' não tem portal_document_type e fica de fora deste bloco.
    IF p_kind IN ('quote', 'proposal', 'contract') THEN
      UPDATE public.client_portal_documents
      SET is_visible = false,
          revoked_at = now(),
          revoked_by = p_actor
      WHERE document_type = p_kind::public.portal_document_type
        AND document_id = p_id
        AND is_visible = true;
    END IF;
  END IF;
  RETURN TRUE;
END;
$function$;

-- ACL mantida: EXECUTE só postgres/service_role (confirmado ao vivo).
REVOKE ALL ON FUNCTION public._soft_delete_business_entity_impl(text, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._soft_delete_business_entity_impl(text, uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public._soft_delete_business_entity_impl(text, uuid, uuid, uuid) FROM authenticated;

-- ============================================================
-- 4b. restore_business_entity — ramo de contrato
--     Corpo idêntico à versão viva, exceto os blocos "NOVO (20261204900000)".
-- ============================================================

CREATE OR REPLACE FUNCTION public.restore_business_entity(p_kind text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid;
  v_org_id uuid;
  v_actor uuid := auth.uid();
  v_target_org uuid;
  -- NOVO (20261204900000)
  v_contract_manual boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kind NOT IN ('deal','quote','proposal','contract') THEN
    RAISE EXCEPTION 'Invalid kind: %', p_kind;
  END IF;

  -- Determine organization of the target row BEFORE acting.
  IF p_kind = 'deal' THEN
    SELECT organization_id INTO v_target_org FROM public.deals WHERE id = p_id;
  ELSIF p_kind = 'quote' THEN
    SELECT organization_id INTO v_target_org FROM public.quotes WHERE id = p_id;
  ELSIF p_kind = 'proposal' THEN
    SELECT organization_id INTO v_target_org FROM public.proposals WHERE id = p_id;
  ELSE
    SELECT organization_id, is_manual_order INTO v_target_org, v_contract_manual
      FROM public.client_contracts WHERE id = p_id;
  END IF;

  IF v_target_org IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT (v_target_org IN (SELECT public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- NOVO (20261204900000): restaurar é o inverso de eliminar e exige a mesma
  -- permissão. Encomendas de cliente (manuais / venda direta) exigem
  -- client_orders.delete; contratos reais client_contracts.delete. Uma
  -- encomenda restaurada continua 'cancelled' (sem efeitos em stock) e a VD
  -- continua 'cancelada' — só volta a aparecer.
  IF p_kind = 'contract' THEN
    IF COALESCE(v_contract_manual, false) THEN
      IF NOT public.has_anew_permission(v_actor, 'client_orders.delete') THEN
        RAISE EXCEPTION 'Sem permissao para restaurar encomendas de cliente' USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSIF NOT public.has_anew_permission(v_actor, 'client_contracts.delete') THEN
      RAISE EXCEPTION 'Sem permissao para restaurar contratos' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF p_kind = 'deal' THEN
    UPDATE public.deals SET deleted_at = NULL, deleted_by = NULL
      WHERE id = p_id AND deleted_at IS NOT NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSIF p_kind = 'quote' THEN
    UPDATE public.quotes SET deleted_at = NULL, deleted_by = NULL
      WHERE id = p_id AND deleted_at IS NOT NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSIF p_kind = 'proposal' THEN
    UPDATE public.proposals SET deleted_at = NULL, deleted_by = NULL, is_deleted = false
      WHERE id = p_id AND deleted_at IS NOT NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSE
    UPDATE public.client_contracts SET deleted_at = NULL, deleted_by = NULL
      WHERE id = p_id AND deleted_at IS NOT NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  END IF;

  IF v_entity_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.anew_entity_history(entity_id, change_type, field_name, old_value, new_value, changed_by, metadata)
      VALUES (v_entity_id, 'restored', p_kind, p_id::text, NULL, v_actor,
              jsonb_build_object('kind', p_kind, 'id', p_id, 'organization_id', v_org_id));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN TRUE;
END;
$function$;

-- ACL mantida: EXECUTE postgres/authenticated/service_role (confirmado ao vivo).
REVOKE ALL ON FUNCTION public.restore_business_entity(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_business_entity(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.restore_business_entity(text, uuid) TO authenticated;

-- ============================================================
-- CONFERIR
-- ============================================================
DO $$
DECLARE
  v_missing_admins int;
  v_trigger_status text;
  v_other_roles    int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'client_orders.delete') THEN
    RAISE EXCEPTION 'CONFERIR: client_orders.delete nao ficou no catalogo';
  END IF;

  SELECT count(*) INTO v_missing_admins
  FROM (VALUES
    ('03a43423-9b3c-4640-9dbe-31687f829869'::uuid),
    ('e91ef94e-a5e6-415c-9985-0c2b7594720b'::uuid)
  ) AS r(role_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.anew_role_permissions rp
    WHERE rp.role_id = r.role_id AND rp.permission_code = 'client_orders.delete'
  );
  IF v_missing_admins > 0 THEN
    RAISE EXCEPTION 'CONFERIR: % papel(eis) de sistema continuam sem client_orders.delete', v_missing_admins;
  END IF;

  SELECT count(*) INTO v_other_roles
  FROM public.anew_role_permissions rp
  WHERE rp.permission_code = 'client_orders.delete'
    AND rp.role_id NOT IN ('03a43423-9b3c-4640-9dbe-31687f829869', 'e91ef94e-a5e6-415c-9985-0c2b7594720b');
  IF v_other_roles > 0 THEN
    RAISE EXCEPTION 'CONFERIR: client_orders.delete atribuida a % papel(eis) normais', v_other_roles;
  END IF;

  SELECT tgenabled::text INTO v_trigger_status FROM pg_trigger
  WHERE tgrelid = 'public.anew_role_permissions'::regclass AND tgname = 'trg_protect_system_role_perms';
  IF v_trigger_status IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION 'CONFERIR: trg_protect_system_role_perms nao ficou ativo (tgenabled=%)', v_trigger_status;
  END IF;

  SELECT tgenabled::text INTO v_trigger_status FROM pg_trigger
  WHERE tgrelid = 'public.anew_role_permissions'::regclass AND tgname = 'trg_audit_anew_role_permissions';
  IF v_trigger_status IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION 'CONFERIR: trg_audit_anew_role_permissions nao ficou ativo (tgenabled=%)', v_trigger_status;
  END IF;

  IF has_function_privilege('anon', 'public.rpc_delete_client_order(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: anon tem EXECUTE em rpc_delete_client_order';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rpc_delete_client_order(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: authenticated sem EXECUTE em rpc_delete_client_order';
  END IF;
  IF has_function_privilege('authenticated', 'public._soft_delete_business_entity_impl(text, uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: authenticated tem EXECUTE em _soft_delete_business_entity_impl';
  END IF;
  IF has_function_privilege('authenticated', 'public.rpc_create_direct_sale_order(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: authenticated tem EXECUTE em rpc_create_direct_sale_order';
  END IF;
END;
$$;
