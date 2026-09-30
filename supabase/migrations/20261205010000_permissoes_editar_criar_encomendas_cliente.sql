-- ============================================================
-- 20261205010000_permissoes_editar_criar_encomendas_cliente
-- ============================================================
-- Permissões próprias para editar e criar Encomendas Clientes, em vez de
-- pedir emprestadas client_contracts.edit / client_contracts.create.
--
-- Estado encontrado antes (lido ao vivo com pg_get_functiondef /
-- pg_policies / pg_proc.proacl, 30/09/2026):
--
--   • rpc_update_client_order_header (morada de entrega e notas nas
--     encomendas com origem — contrato real ou venda direta) exigia
--     client_contracts.edit.
--   • rpc_get_manual_client_order_edit e rpc_update_manual_client_order
--     (editar as linhas de uma encomenda manual) exigiam client_contracts.edit.
--   • rpc_create_manual_client_order exigia client_contracts.create.
--   • rpc_add_entity_delivery_address (morada de entrega nova a partir da
--     encomenda) só verifica fn_entity_delivery_address_access(…, 'add'), cuja
--     Via 2 exigia client_contracts.edit. Não tem mais nenhuma verificação
--     client_contracts.*.
--   • As policies de anew_entity_addresses / anew_addresses não referem
--     client_contracts.* nem client_orders.*; a escrita da morada passa só pela
--     RPC (SECURITY DEFINER, owner postgres, sem FORCE ROW LEVEL SECURITY).
--   • Nenhum gatilho de client_contracts, quotes, quote_lines,
--     anew_entity_addresses, anew_addresses, purchase_orders ou
--     purchase_order_items verifica permissões (has_anew_permission), nem as
--     funções auxiliares chamadas (fn_deal_org_in_scope,
--     fn_client_order_product_locked, fn_client_order_request_missing,
--     fn_client_order_line_reservations, current_business_user_id,
--     set_audit_context): quem só tem as permissões novas não é bloqueado mais
--     à frente.
--
-- Esta migration:
--   A. client_orders.edit e client_orders.create no catálogo.
--   B. Atribuição: client_orders.edit a System/Super Admin, a todos os papéis
--      com client_contracts.edit e ao Warehouse Manager (BMClean);
--      client_orders.create a System/Super Admin e a todos os papéis com
--      client_contracts.create (o Warehouse Manager não — atribui-se à mão
--      se for preciso). Ninguém perde acesso com a troca.
--   C. rpc_update_client_order_header, rpc_get_manual_client_order_edit e
--      rpc_update_manual_client_order passam a client_orders.edit;
--      rpc_create_manual_client_order passa a client_orders.create;
--      fn_entity_delivery_address_access, Via 2 'add', passa a
--      client_orders.edit OU client_orders.create.
--
-- Corpos das funções: cópia exata de pg_get_functiondef (30/09/2026). Só
-- mudam as linhas de verificação de permissão (e os comentários que as
-- descrevem), assinaladas "NOVO (20261205010000)". Mantêm-se todas as outras
-- verificações (âmbito da organização, cliente da organização, só manuais
-- verdadeiras, estado 'signed', linhas trancadas, reserva/pedido a
-- fornecedor, contrato sintético draft -> signed na mesma transação).
-- CREATE OR REPLACE mantém owner (postgres), SECURITY DEFINER, search_path e
-- ACL; os REVOKE/GRANT abaixo de cada função repetem a ACL viva, confirmada
-- em pg_proc.proacl. Nenhuma das funções tem overloads.
--
-- Papéis: anew_role_permissions.role_id não tem FK para anew_roles e há
-- linhas órfãs (role_id inexistente); todas as atribuições por cópia juntam
-- anew_roles com deleted_at IS NULL para não criar mais órfãs.
--
-- Prerequisites: 20261205000000_permissoes_encomendas_cliente_e_venda_direta.sql

-- ============================================================
-- A. Catálogo: client_orders.edit e client_orders.create
-- ============================================================
-- display_order ao vivo: 0 view, 1 confirm_stock_exit, 2 delete -> 3 e 4.

INSERT INTO public.anew_permissions (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES (
  'client_orders.edit',
  'Editar encomendas de cliente',
  'Permite, numa Encomenda Cliente (de contrato, manual ou de venda direta), alterar a morada de entrega, acrescentar moradas de entrega novas ao cliente a partir da encomenda e escrever notas. Nas encomendas manuais permite também alterar as linhas (acrescentar, mudar ou remover produtos e serviços), exceto as que já saíram de stock ou têm pedido a fornecedor. Não dá acesso aos contratos. Exige client_orders.view para abrir a página.',
  'client_orders',
  NULL,
  3,
  false,
  'organization',
  true
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.anew_permissions (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES (
  'client_orders.create',
  'Criar encomendas de cliente',
  'Permite criar Encomendas Clientes manuais (sem documento de origem) para um cliente da organização e acrescentar moradas de entrega novas ao cliente durante a criação. A encomenda fica logo ativa: a reserva/saída de stock e os pedidos a fornecedor seguem as definições de inventário da organização. Não dá acesso aos contratos. Exige client_orders.view para abrir a página.',
  'client_orders',
  NULL,
  4,
  false,
  'organization',
  true
)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- B. Atribuição
-- ============================================================
-- DISABLE TRIGGER USER: trg_protect_system_role_perms recusa escritas em
-- papéis is_system (System Admin, Super Admin) fora de service_role; o
-- gatilho de auditoria fica também desligado, como em 20261205000000.

ALTER TABLE public.anew_role_permissions DISABLE TRIGGER USER;

-- System Admin e Super Admin (o frontend não faz bypass; ver 20261130110000).
INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT r.role_id, c.code, NULL::uuid
FROM (VALUES
  ('03a43423-9b3c-4640-9dbe-31687f829869'::uuid), -- System Admin
  ('e91ef94e-a5e6-415c-9985-0c2b7594720b'::uuid)  -- Super Admin
) AS r(role_id)
CROSS JOIN (VALUES ('client_orders.edit'), ('client_orders.create')) AS c(code)
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- Quem hoje edita encomendas (client_contracts.edit) continua a editá-las.
INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT DISTINCT rp.role_id, 'client_orders.edit', NULL::uuid
FROM public.anew_role_permissions rp
JOIN public.anew_roles ro ON ro.id = rp.role_id AND ro.deleted_at IS NULL
WHERE rp.permission_code = 'client_contracts.edit'
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- Quem hoje cria encomendas manuais (client_contracts.create) continua a criá-las.
INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT DISTINCT rp.role_id, 'client_orders.create', NULL::uuid
FROM public.anew_role_permissions rp
JOIN public.anew_roles ro ON ro.id = rp.role_id AND ro.deleted_at IS NULL
WHERE rp.permission_code = 'client_contracts.create'
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- Warehouse Manager (BMClean): passa a poder mudar morada/notas e linhas das
-- encomendas sem ter client_contracts.edit. client_orders.create não é
-- atribuída (decisão do utilizador; atribui-se à mão se for preciso).
-- Referido por id; se não existir, não faz nada.
INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT ro.id, 'client_orders.edit', NULL::uuid
FROM public.anew_roles ro
WHERE ro.id = '74d22b45-ed63-4f00-a7cc-27ba963b0b6e'::uuid
  AND ro.deleted_at IS NULL
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER USER;

-- ============================================================
-- C.1 rpc_update_client_order_header
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_update_client_order_header(p_contract_id uuid, p_delivery_address text, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_contract public.client_contracts;
  v_address  text;
  v_notes    text;
  v_actor    uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_contract_id IS NULL THEN
    RAISE EXCEPTION 'contract_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (20261205010000): permissão própria client_orders.edit em vez de
  -- client_contracts.edit.
  IF NOT public.has_anew_permission(auth.uid(), 'client_orders.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar encomendas de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_address := nullif(btrim(p_delivery_address), '');
  -- Notas: conteúdo guardado tal como enviado; só vazio/espaços => NULL.
  v_notes := CASE WHEN nullif(btrim(p_notes), '') IS NULL THEN NULL ELSE p_notes END;

  IF length(v_address) > 500 THEN
    RAISE EXCEPTION 'A morada de entrega não pode ter mais de 500 caracteres' USING ERRCODE = 'check_violation';
  END IF;

  IF length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'As notas não podem ter mais de 2000 caracteres' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_contract
    FROM public.client_contracts cc
   WHERE cc.id = p_contract_id
     AND cc.deleted_at IS NULL
   FOR UPDATE;

  IF v_contract.id IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.fn_deal_org_in_scope(v_contract.organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Manual verdadeira = is_manual_order sem venda direta (a mesma condição que
  -- rpc_update_manual_client_order aceita): essa tem edição própria.
  IF COALESCE(v_contract.is_manual_order, false)
     AND NOT EXISTS (SELECT 1 FROM public.direct_sales ds WHERE ds.client_contract_id = p_contract_id) THEN
    RAISE EXCEPTION 'Use a edição completa da encomenda' USING ERRCODE = 'check_violation';
  END IF;

  IF v_contract.status IS DISTINCT FROM 'signed' THEN
    RAISE EXCEPTION 'Só é possível editar encomendas ativas (assinadas)' USING ERRCODE = 'check_violation';
  END IF;

  -- Só escreve se algo mudou (evita auditoria vazia e o recálculo de etapa das
  -- leads que fn_mark_lead_pipeline_dirty faz em qualquer UPDATE).
  IF v_contract.delivery_address IS DISTINCT FROM v_address
     OR v_contract.notes IS DISTINCT FROM v_notes THEN
    v_actor := public.current_business_user_id();
    IF v_actor IS NOT NULL THEN
      PERFORM public.set_audit_context(v_actor, 'crm');
    END IF;

    UPDATE public.client_contracts
       SET delivery_address = v_address,
           notes            = v_notes
     WHERE id = p_contract_id
    RETURNING * INTO v_contract;
  END IF;

  RETURN jsonb_build_object(
    'success',          true,
    'contract_id',      v_contract.id,
    'delivery_address', v_contract.delivery_address,
    'notes',            v_contract.notes
  );
END;
$function$;

-- ACL mantida: EXECUTE postgres/authenticated/service_role (confirmado ao vivo).
REVOKE ALL ON FUNCTION public.rpc_update_client_order_header(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_update_client_order_header(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_client_order_header(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_client_order_header(uuid, text, text) TO service_role;

-- ============================================================
-- C.2 rpc_get_manual_client_order_edit
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_get_manual_client_order_edit(p_contract_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_contract public.client_contracts;
  v_lines    jsonb;
BEGIN
  IF p_contract_id IS NULL THEN
    RAISE EXCEPTION 'contract_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (20261205010000): permissão própria client_orders.edit em vez de
  -- client_contracts.edit.
  IF NOT public.has_anew_permission(auth.uid(), 'client_orders.edit') THEN
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

-- ACL mantida: EXECUTE postgres/authenticated/service_role (confirmado ao vivo).
REVOKE ALL ON FUNCTION public.rpc_get_manual_client_order_edit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_manual_client_order_edit(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_manual_client_order_edit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_manual_client_order_edit(uuid) TO service_role;

-- ============================================================
-- C.3 rpc_update_manual_client_order
-- ============================================================

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
  -- NOVO (20261204310000)
  v_request_ids  uuid[] := ARRAY[]::uuid[];
  v_new_line_id  uuid;
  v_actor        uuid;
  v_trigger_mode text;
  v_request      jsonb;
BEGIN
  IF p_contract_id IS NULL THEN
    RAISE EXCEPTION 'contract_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Autorização: permissão de edição de encomendas de cliente ───────────
  -- NOVO (20261205010000): client_orders.edit em vez de client_contracts.edit.
  IF NOT public.has_anew_permission(auth.uid(), 'client_orders.edit') THEN
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

        -- NOVO (20261204310000): linha de produto que pode passar a precisar
        -- de mais material (v_line ainda tem os valores antigos).
        IF v_product_id IS NOT NULL
           AND (
                v_line.product_id IS DISTINCT FROM v_product_id
             OR v_line.uom_id     IS DISTINCT FROM v_uom_id
             OR v_qt > COALESCE(v_line.qt, 0)
           ) THEN
          v_request_ids := v_request_ids || v_line.id;
        END IF;
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
      )
      RETURNING id INTO v_new_line_id;

      -- NOVO (20261204310000)
      IF v_product_id IS NOT NULL THEN
        v_request_ids := v_request_ids || v_new_line_id;
      END IF;
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

  -- ── NOVO (20261204310000): pedir ao fornecedor só o que falta ────────────
  IF cardinality(v_request_ids) > 0 THEN
    SELECT ois.stock_deduction_trigger INTO v_trigger_mode
      FROM public.organization_inventory_settings ois
     WHERE ois.organization_id = v_contract.organization_id;
    v_trigger_mode := COALESCE(v_trigger_mode, 'contract_signed');

    IF v_trigger_mode = 'contract_signed' THEN
      BEGIN
        v_actor := COALESCE(
          public.current_business_user_id(),
          (SELECT q.created_by FROM public.quotes q WHERE q.id = v_quote_id)
        );
        IF v_actor IS NOT NULL THEN
          v_request := public.fn_client_order_request_missing(p_contract_id, v_actor, v_request_ids);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_request := jsonb_build_object('success', false);
        BEGIN
          INSERT INTO public.workflow_execution_log (
            source_entity, source_record_id, target_entity, target_record_id,
            action_type, status, error_message
          ) VALUES (
            'contract', p_contract_id, 'purchase_order', NULL,
            'rpc:update_manual_client_order_po_request', 'error', SQLERRM
          );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success',      true,
    'contract_id',  v_contract.id,
    'order_number', v_contract.order_number,
    'total_value',  v_contract.total_value,
    -- NOVO (20261204310000)
    'supplier_request', v_request
  );
END;
$function$;

-- ACL mantida: EXECUTE postgres/authenticated/service_role (confirmado ao vivo).
REVOKE ALL ON FUNCTION public.rpc_update_manual_client_order(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_update_manual_client_order(uuid, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_manual_client_order(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_manual_client_order(uuid, jsonb, text) TO service_role;

-- ============================================================
-- C.4 rpc_create_manual_client_order
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_create_manual_client_order(p_organization_id uuid, p_order jsonb, p_items jsonb)
 RETURNS client_contracts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_prod_uom     text;  -- NOVO (20261204290000)
BEGIN
  -- ── Ator de negócio (== created_by no frontend) ──────────────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Autorização: permissão de criar encomendas de cliente ────────────────
  -- NOVO (20261205010000): client_orders.create em vez de
  -- client_contracts.create. O contrato sintético continua a ser criado aqui
  -- (draft -> signed na mesma transação); quem o pode fazer é que muda.
  IF NOT public.has_anew_permission(auth.uid(), 'client_orders.create') THEN
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

    -- NOVO (20261204290000): unidade contável (embalagem escolhida, ou
    -- unidade base do produto un/EA/PCS/BOX/PKG) => quantidade inteira.
    v_prod_uom := NULL;
    IF v_product_id IS NOT NULL THEN
      SELECT lower(u.code) INTO v_prod_uom
        FROM public.products p
        LEFT JOIN public.uom u ON u.id = p.uom_id
       WHERE p.id = v_product_id;
    END IF;

    IF (nullif(v_item ->> 'uom_id', '') IS NOT NULL
        OR v_prod_uom IN ('un', 'ea', 'pcs', 'box', 'pkg'))
       AND v_qt <> trunc(v_qt) THEN
      RAISE EXCEPTION 'A quantidade da linha "%" tem de ser um número inteiro (unidade contável)',
        COALESCE(nullif(v_item ->> 'descricao', ''), 'Item') USING ERRCODE = 'check_violation';
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
    title, obra_notas,
    obra_endereco  -- NOVO (20261204280000)
  )
  VALUES (
    v_entity_id, v_client_id, p_organization_id, v_root_org_id,
    v_actor, 'aceite', true, 'EUR',
    v_total_sem, v_total_com, 23, now(),
    'Encomenda manual — ' || COALESCE(v_entity_name, 'cliente'),
    nullif(p_order ->> 'notes', ''),
    nullif(btrim(p_order ->> 'delivery_address'), '')
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
      ordem, section_name,
      uom_id  -- NOVO (20261204204500)
    )
    VALUES (
      v_quote_id,
      COALESCE(nullif(v_item ->> 'categoria', ''), 'Geral'),
      COALESCE(nullif(v_item ->> 'descricao', ''), 'Item'),
      v_qt, v_product_id, v_service_id,
      v_preco, 0, v_iva,
      v_sem_iva, round(v_sem_iva * (1 + v_iva / 100), 2), v_sem_iva,
      v_ordem, 'Geral',
      nullif(v_item ->> 'uom_id', '')::uuid
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
    status, total_value, currency, start_date, notes,
    is_manual_order
  )
  VALUES (
    NULL, v_client_id, v_entity_id, v_quote_id,
    p_organization_id, v_root_org_id, v_actor,
    'draft', v_total_com, 'EUR', v_start_date,
    nullif(p_order ->> 'notes', ''),
    true
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
$function$;

-- ACL: ao vivo EXECUTE postgres/anon/authenticated/service_role. CREATE OR
-- REPLACE mantém-na tal como está (anon falha logo em
-- current_business_user_id); não se mexe aqui — fica para uma migration de
-- endurecimento própria.
GRANT EXECUTE ON FUNCTION public.rpc_create_manual_client_order(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_manual_client_order(uuid, jsonb, jsonb) TO service_role;

-- ============================================================
-- C.5 fn_entity_delivery_address_access — Via 2 ('add')
-- ============================================================
-- Só o ramo 'add' da Via 2 muda; 'view' continua com client_orders.view e a
-- Via 1 (ficha de contacto + system_admin_pii_default_deny) fica igual. A
-- verificação de que o cliente é da organização (anew_clients +
-- fn_deal_org_in_scope) mantém-se. rpc_add_entity_delivery_address não muda:
-- a única verificação de permissão que faz é esta função, com 'add'.

CREATE OR REPLACE FUNCTION public.fn_entity_delivery_address_access(p_entity_id uuid, p_mode text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_original boolean := true;
BEGIN
  IF p_entity_id IS NULL OR v_uid IS NULL OR p_mode NOT IN ('view', 'edit', 'add') THEN
    RETURN false;
  END IF;

  -- ── Via 1: regra original (ficha de contacto) ─────────────────────────────
  IF p_mode = 'view' THEN
    IF NOT public.is_entity_contact_in_owner_scope(
             p_entity_id,
             public.crm_scope_keys('leads.view'),
             public.crm_scope_keys('clients.view')) THEN
      v_original := false;
    END IF;
  ELSE
    -- 'edit' e 'add'
    IF NOT public.is_entity_contact_in_owner_scope(
             p_entity_id,
             public.crm_scope_keys('leads.edit'),
             public.crm_scope_keys('clients.edit')) THEN
      v_original := false;
    END IF;
  END IF;

  -- system_admin_pii_default_deny (RESTRICTIVE)
  IF v_original AND public.is_system_admin(v_uid) THEN
    IF NOT (
      EXISTS (
        SELECT 1
        FROM public.anew_entity_roles er
        WHERE er.entity_id = p_entity_id
          AND er.deleted_at IS NULL
          AND er.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))
      )
      OR EXISTS (
        SELECT 1
        FROM public.anew_entity_roles er
        WHERE er.entity_id = p_entity_id
          AND er.deleted_at IS NULL
          AND public.has_active_support_access(er.organization_id)
      )
    ) THEN
      v_original := false;
    END IF;
  END IF;

  IF v_original THEN
    RETURN true;
  END IF;

  -- 'edit' (usado pelo remover) não tem segunda via.
  IF p_mode = 'edit' THEN
    RETURN false;
  END IF;

  -- ── Via 2: encomendas de cliente da organização ──────────────────────────
  IF p_mode = 'view' THEN
    -- NOVO (20261205000000): client_orders.view em vez de inventory.view +
    -- client_contracts.view.
    IF NOT public.has_anew_permission(v_uid, 'client_orders.view') THEN
      RETURN false;
    END IF;
  ELSE
    -- 'add'
    -- NOVO (20261205010000): client_orders.edit (morada nova ao editar a
    -- encomenda) ou client_orders.create (ao criar uma encomenda manual), em
    -- vez de client_contracts.edit.
    IF NOT (public.has_anew_permission(v_uid, 'client_orders.edit')
            OR public.has_anew_permission(v_uid, 'client_orders.create')) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.anew_clients c
    WHERE c.entity_id = p_entity_id
      AND c.deleted_at IS NULL
      AND public.fn_deal_org_in_scope(c.organization_id)
  );
END;
$function$;

-- ACL mantida: EXECUTE só postgres/service_role (confirmado ao vivo).
REVOKE ALL ON FUNCTION public.fn_entity_delivery_address_access(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_entity_delivery_address_access(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.fn_entity_delivery_address_access(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_entity_delivery_address_access(uuid, text) TO service_role;

-- ============================================================
-- CONFERIR
-- ============================================================
DO $$
DECLARE
  v_missing        text;
  v_count          int;
  v_trigger_status text;
  v_fn             text;
  v_src            text;
BEGIN
  SELECT string_agg(c.code, ', ') INTO v_missing
  FROM (VALUES ('client_orders.edit'), ('client_orders.create')) AS c(code)
  WHERE NOT EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = c.code);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: permissões em falta no catálogo: %', v_missing;
  END IF;

  -- System Admin e Super Admin com as duas permissões novas.
  SELECT count(*) INTO v_count
  FROM (VALUES
    ('03a43423-9b3c-4640-9dbe-31687f829869'::uuid),
    ('e91ef94e-a5e6-415c-9985-0c2b7594720b'::uuid)
  ) AS r(role_id)
  CROSS JOIN (VALUES ('client_orders.edit'), ('client_orders.create')) AS c(code)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.anew_role_permissions rp
    WHERE rp.role_id = r.role_id AND rp.permission_code = c.code
  );
  IF v_count > 0 THEN
    RAISE EXCEPTION 'CONFERIR: % atribuição(ões) em falta nos papéis de sistema', v_count;
  END IF;

  -- Ninguém que editava (client_contracts.edit) fica sem client_orders.edit.
  SELECT count(*) INTO v_count
  FROM public.anew_role_permissions e
  JOIN public.anew_roles ro ON ro.id = e.role_id AND ro.deleted_at IS NULL
  WHERE e.permission_code = 'client_contracts.edit'
    AND NOT EXISTS (
      SELECT 1 FROM public.anew_role_permissions rp
      WHERE rp.role_id = e.role_id AND rp.permission_code = 'client_orders.edit'
    );
  IF v_count > 0 THEN
    RAISE EXCEPTION 'CONFERIR: % papel(eis) perderiam a edição de encomendas', v_count;
  END IF;

  -- Ninguém que criava (client_contracts.create) fica sem client_orders.create.
  SELECT count(*) INTO v_count
  FROM public.anew_role_permissions e
  JOIN public.anew_roles ro ON ro.id = e.role_id AND ro.deleted_at IS NULL
  WHERE e.permission_code = 'client_contracts.create'
    AND NOT EXISTS (
      SELECT 1 FROM public.anew_role_permissions rp
      WHERE rp.role_id = e.role_id AND rp.permission_code = 'client_orders.create'
    );
  IF v_count > 0 THEN
    RAISE EXCEPTION 'CONFERIR: % papel(eis) perderiam a criação de encomendas manuais', v_count;
  END IF;

  -- Warehouse Manager com client_orders.edit (se o papel existir).
  IF EXISTS (SELECT 1 FROM public.anew_roles WHERE id = '74d22b45-ed63-4f00-a7cc-27ba963b0b6e'::uuid AND deleted_at IS NULL)
     AND NOT EXISTS (
       SELECT 1 FROM public.anew_role_permissions
       WHERE role_id = '74d22b45-ed63-4f00-a7cc-27ba963b0b6e'::uuid AND permission_code = 'client_orders.edit'
     ) THEN
    RAISE EXCEPTION 'CONFERIR: Warehouse Manager sem client_orders.edit';
  END IF;

  -- Gatilhos de anew_role_permissions de volta ativos.
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

  -- Funções de edição: client_orders.edit e já não client_contracts.edit.
  FOREACH v_fn IN ARRAY ARRAY[
    'public.rpc_update_client_order_header(uuid, text, text)',
    'public.rpc_get_manual_client_order_edit(uuid)',
    'public.rpc_update_manual_client_order(uuid, jsonb, text)',
    'public.fn_entity_delivery_address_access(uuid, text)'
  ] LOOP
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_fn::regprocedure;
    IF v_src LIKE '%has_anew_permission(%''client_contracts.edit'')%' THEN
      RAISE EXCEPTION 'CONFERIR: % ainda verifica client_contracts.edit', v_fn;
    END IF;
    IF v_src NOT LIKE '%''client_orders.edit''%' THEN
      RAISE EXCEPTION 'CONFERIR: % não verifica client_orders.edit', v_fn;
    END IF;
  END LOOP;

  -- Via 2: 'view' continua em client_orders.view; 'add' aceita também create.
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.fn_entity_delivery_address_access(uuid, text)'::regprocedure;
  IF v_src NOT LIKE '%''client_orders.view''%' OR v_src NOT LIKE '%''client_orders.create''%' THEN
    RAISE EXCEPTION 'CONFERIR: fn_entity_delivery_address_access sem client_orders.view/create';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.rpc_create_manual_client_order(uuid, jsonb, jsonb)'::regprocedure;
  IF v_src LIKE '%has_anew_permission(%''client_contracts.create'')%' THEN
    RAISE EXCEPTION 'CONFERIR: rpc_create_manual_client_order ainda verifica client_contracts.create';
  END IF;
  IF v_src NOT LIKE '%''client_orders.create''%' THEN
    RAISE EXCEPTION 'CONFERIR: rpc_create_manual_client_order não verifica client_orders.create';
  END IF;

  -- ACL: anon sem EXECUTE nas RPCs de edição; fn_entity_delivery_address_access
  -- continua fechada a authenticated.
  IF has_function_privilege('anon', 'public.rpc_update_client_order_header(uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_update_manual_client_order(uuid, jsonb, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_get_manual_client_order_edit(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: anon tem EXECUTE numa RPC de edição desta migration';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_entity_delivery_address_access(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: authenticated passou a ter EXECUTE em fn_entity_delivery_address_access';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rpc_create_manual_client_order(uuid, jsonb, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: authenticated sem EXECUTE em rpc_create_manual_client_order';
  END IF;
END;
$$;
