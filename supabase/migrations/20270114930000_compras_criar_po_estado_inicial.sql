-- ============================================================
-- 20270114930000_compras_criar_po_estado_inicial
-- ============================================================
-- Falha (F5 do reteste): rpc_create_purchase_order só pedia purchase_orders.create e gravava qualquer texto como estado.
--   Pela API criava-se uma PO já «encomendada» sem purchase_orders.approve (a edição e o «Aprovar e enviar» exigem-na), ou
--   já «recebida» sem receção nenhuma — e uma PO 'received' conta como totalmente recebida na reserva da EC.
-- Decisões (D2 + revisão de segurança, MEDIUM: lista branca em vez de lista negra): uma PO nasce 'pending'; 'ordered' só com
--   purchase_orders.approve na organização da PO; tudo o resto é recusado (received, partially_received, cancelled, texto
--   livre). O estado é normalizado com lower(btrim()) e grava-se o valor normalizado ('Ordered' conta como 'ordered' e
--   pede a mesma permissão); vazio ou ausente = 'pending', como hoje.
-- Alterações (as únicas; o resto é o texto vivo):
--   1. nova variável v_status;
--   2. logo a seguir às verificações de permissão e de âmbito, antes de qualquer escrita: normalizar, recusar o que não é
--      'pending'/'ordered' (check_violation) e 'ordered' sem approve (insufficient_privilege);
--   3. o INSERT grava v_status em vez de COALESCE(nullif(status, ''), 'pending').
-- Uso normal: nada. O ecrã cria sempre pendente (PurchaseOrders.tsx envia status 'pending' numa PO nova).
-- Fica de fora (registado, não desta leva): a guarda de source_type/source_id; validar a organização do fornecedor, dos
--   produtos e dos serviços; a importação (20270114940000) e a edição (20270114950000) estão em ficheiros próprios.
--
-- Desenho: vault/ficheiros/inventario/correcao-reteste-desenho.md (fechado, com as decisões D1 a D6 do coordenador).
-- Base: RH (uetjghdkwbywbftedtth), que só tem a nike. Nada disto chega à Mudelar por esta base; na base principal só entra
--   com o ramo, e antes disso diz-se ao utilizador o que muda.
-- Partida: a definição VIVA (pg_get_functiondef, lida a 11/11), não um ficheiro. Pré-condição md5 da definição viva e do
--   ACL; no fim confere-se o md5 da definição nova, o SECURITY, o search_path e o ACL (CREATE OR REPLACE conserva o ACL).
--   O md5 esperado depois conta com os CR deste ficheiro (o corpo de uma função guarda os bytes do ficheiro): este ficheiro
--   tem de ficar em CRLF; convertido para LF, a conferência falha e a transação desfaz-se (falha segura).
-- Aplicar: SET lock_timeout de sessão antes do BEGIN e RESET no fim (o CLI pode não correr o ficheiro numa só transação).
-- Teste: supabase/tests/inventario_reteste_buracos.test.sql — correr ANTES do db push (vermelho) e DEPOIS (verde).

SET lock_timeout = '5s';

BEGIN;

-- ─── Pré-condição: a definição viva é a que foi lida (md5) e o ACL é o de hoje ──────────────────────────────────────────
DO $pre$
DECLARE
  v_oid oid := to_regprocedure('public.rpc_create_purchase_order(uuid,jsonb,jsonb)');
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION '20270114930000: a função public.rpc_create_purchase_order(uuid,jsonb,jsonb) não existe';
  END IF;
  IF md5(pg_get_functiondef(v_oid)) IS DISTINCT FROM 'cedc307a3f4452e1e9ac35608140da4c' THEN
    RAISE EXCEPTION '20270114930000: a definição viva de rpc_create_purchase_order mudou desde que foi lida (md5 %); reler antes de aplicar',
      md5(pg_get_functiondef(v_oid));
  END IF;
  IF (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION '20270114930000: o ACL de rpc_create_purchase_order mudou desde que foi lido';
  END IF;
END $pre$;

-- ─── A função (texto vivo + a alteração descrita no cabeçalho) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_create_purchase_order(p_organization_id uuid, p_order jsonb, p_items jsonb)
 RETURNS purchase_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor       uuid;
  v_order       public.purchase_orders;
  v_item        jsonb;
  v_diff        jsonb;
  v_new         jsonb;
  v_source_type text;
  v_source_id   uuid;
  -- 20270112852000: sem products.view_cost, os preços vêm do fornecedor (fn_po_linhas_precos_guardados).
  v_items       jsonb := p_items;
  v_ver_custo   boolean := true;
  v_status      text;  -- 20270114930000 (F5)
BEGIN
  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId / created_by in the FE) ─────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with purchase_orders_insert RLS ─────────────────
  -- Predicate (2): the create permission (checked first — fail before any write).
  IF NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.create', p_organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para criar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Predicate (1): the target org must be in the caller's visible-org scope.
  IF p_organization_id IS NULL OR NOT public.fn_deal_org_in_scope(p_organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270114930000 (F5): uma PO nasce pendente; 'ordered' só com a permissão de aprovar; o recebido só nasce de uma
  -- receção. Lista branca, com o estado normalizado (é o valor normalizado que se grava).
  v_status := COALESCE(nullif(lower(btrim(p_order ->> 'status')), ''), 'pending');
  IF v_status NOT IN ('pending', 'ordered') THEN
    RAISE EXCEPTION 'Uma encomenda nasce pendente (estado pedido: %). Para encomendar use «Aprovar e enviar»; a mercadoria regista-se na Receção.', p_order ->> 'status'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_status = 'ordered'
     AND NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.approve', p_organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para aprovar encomendas: crie-a pendente e use «Aprovar e enviar»'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Ligação opcional a uma Encomenda Cliente (novo, 20261115200000) ───────
  v_source_type := nullif(p_order ->> 'source_type', '');
  v_source_id   := nullif(p_order ->> 'source_id', '')::uuid;
  IF v_source_type IS NOT NULL THEN
    IF v_source_type NOT IN ('contract', 'proposal') THEN
      RAISE EXCEPTION 'source_type inválido: %', v_source_type USING ERRCODE = 'check_violation';
    END IF;
    IF v_source_id IS NULL THEN
      RAISE EXCEPTION 'source_id é obrigatório quando source_type é indicado' USING ERRCODE = 'check_violation';
    END IF;
    IF v_source_type = 'contract' AND NOT EXISTS (
      SELECT 1 FROM public.client_contracts
      WHERE id = v_source_id AND organization_id = p_organization_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Encomenda Cliente (contrato) não encontrada nesta organização' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  -- ── INSERT the order (identical column set to handleSubmit, order_number ''
  --    so trigger_set_po_number auto-generates it) ───────────────────────────
  -- 20270112852000: quem não tem products.view_cost não vê (nem envia) preços: as linhas levam o preço do fornecedor.
  v_ver_custo := p_organization_id IN (SELECT public.get_user_permission_org_ids(auth.uid(), 'products.view_cost'));
  IF NOT v_ver_custo THEN
    v_items := public.fn_po_linhas_precos_guardados(NULL, p_organization_id, nullif(p_order ->> 'supplier_id', '')::uuid, p_items);
  END IF;

  INSERT INTO public.purchase_orders (
    order_number, supplier_id, order_date, expected_delivery, status,
    total_value, notes, organization_id, created_by, source_type, source_id,
    supplier_notes  -- F3.2 (20261211130000)
  )
  VALUES (
    '',
    nullif(p_order ->> 'supplier_id', '')::uuid,
    (p_order ->> 'order_date')::date,
    nullif(p_order ->> 'expected_delivery', '')::date,
    v_status,  -- 20270114930000 (F5)
    CASE WHEN v_ver_custo THEN COALESCE((p_order ->> 'total_value')::numeric, 0)
         ELSE (SELECT COALESCE(sum((x ->> 'total_price')::numeric), 0)
                 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_items) = 'array' THEN v_items ELSE '[]'::jsonb END) x) END,
    nullif(p_order ->> 'notes', ''),
    p_organization_id,
    v_actor,
    v_source_type,
    v_source_id,
    nullif(p_order ->> 'supplier_notes', '')  -- F3.2 (20261211130000)
  )
  RETURNING * INTO v_order;

  -- ── INSERT items (fully-computed by the FE; persisted verbatim) ───────────
  IF v_items IS NOT NULL AND jsonb_typeof(v_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
      INSERT INTO public.purchase_order_items (
        purchase_order_id, item_type, product_id, service_id, description, sku,
        quantity, unit_price, vat_rate, vat_amount, total_price,
        selected_attributes, notes,
        uom_id, supplier_sku  -- NOVO (20261204204500); units_per_uom pelo gatilho
      )
      VALUES (
        v_order.id,
        v_item ->> 'item_type',
        nullif(v_item ->> 'product_id', '')::uuid,
        nullif(v_item ->> 'service_id', '')::uuid,
        v_item ->> 'description',
        nullif(v_item ->> 'sku', ''),
        (v_item ->> 'quantity')::numeric,
        (v_item ->> 'unit_price')::numeric,
        (v_item ->> 'vat_rate')::numeric,
        (v_item ->> 'vat_amount')::numeric,
        (v_item ->> 'total_price')::numeric,
        COALESCE(v_item -> 'selected_attributes', '{}'::jsonb),
        nullif(v_item ->> 'notes', ''),
        nullif(v_item ->> 'uom_id', '')::uuid,
        -- Snapshot da referência do fornecedor: a enviada, senão a da ligação
        -- item_suppliers deste fornecedor na mesma unidade.
        COALESCE(
          nullif(btrim(v_item ->> 'supplier_sku'), ''),
          (SELECT isup.supplier_sku
             FROM public.item_suppliers isup
            WHERE isup.product_id = nullif(v_item ->> 'product_id', '')::uuid
              AND isup.supplier_id = v_order.supplier_id
              AND isup.uom_id IS NOT DISTINCT FROM nullif(v_item ->> 'uom_id', '')::uuid
              AND isup.deleted_at IS NULL
            LIMIT 1)
        )
      );
    END LOOP;
  END IF;

  -- ── Build combined diff: full snapshot of the created PO + item set ───────
  v_new := to_jsonb(v_order);
  v_diff := jsonb_build_object(
    'purchase_orders', jsonb_build_object(
      'order_number',      jsonb_build_object('old', NULL, 'new', v_new -> 'order_number'),
      'supplier_id',       jsonb_build_object('old', NULL, 'new', v_new -> 'supplier_id'),
      'order_date',        jsonb_build_object('old', NULL, 'new', v_new -> 'order_date'),
      'expected_delivery', jsonb_build_object('old', NULL, 'new', v_new -> 'expected_delivery'),
      'status',            jsonb_build_object('old', NULL, 'new', v_new -> 'status'),
      'total_value',       jsonb_build_object('old', NULL, 'new', v_new -> 'total_value'),
      'notes',             jsonb_build_object('old', NULL, 'new', v_new -> 'notes'),
      'supplier_notes',    jsonb_build_object('old', NULL, 'new', v_new -> 'supplier_notes'),  -- F3.2
      'organization_id',   jsonb_build_object('old', NULL, 'new', v_new -> 'organization_id'),
      'source_type',       jsonb_build_object('old', NULL, 'new', v_new -> 'source_type'),
      'source_id',         jsonb_build_object('old', NULL, 'new', v_new -> 'source_id')
    ),
    'purchase_order_items', jsonb_build_object('new', COALESCE(v_items, '[]'::jsonb))
  );

  -- ── Single consolidated audit row (entity_id = PO id, org direct) ─────────
  PERFORM public.fn_manual_audit_log(
    'purchase_orders', v_order.id, v_order.organization_id, 'INSERT', v_diff, 'web_app'
  );

  -- 20270112852000: o valor só a quem tem products.view_cost.
  IF NOT v_ver_custo THEN
    v_order.total_value := NULL;
  END IF;
  RETURN v_order;
END;
$function$;

-- ─── Conferir: corpo novo (md5 com os CR deste ficheiro), DEFINER/INVOKER, search_path e ACL mantidos ───────────────────
DO $chk$
DECLARE
  v_oid oid := to_regprocedure('public.rpc_create_purchase_order(uuid,jsonb,jsonb)');
BEGIN
  IF md5(pg_get_functiondef(v_oid)) IS DISTINCT FROM 'a1e00ec3aaf8e0462371f4cf1edad341' THEN
    RAISE EXCEPTION '20270114930000: a definição nova de rpc_create_purchase_order não é a esperada (md5 %); o ficheiro tem de estar em CRLF',
      md5(pg_get_functiondef(v_oid));
  END IF;
  IF (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM true
     OR (SELECT array_to_string(p.proconfig, ',')::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM 'search_path=public, pg_temp'
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION '20270114930000: rpc_create_purchase_order perdeu o SECURITY, o search_path ou o ACL';
  END IF;
END $chk$;

COMMIT;

RESET lock_timeout;
