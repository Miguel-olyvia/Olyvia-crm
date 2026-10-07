-- ============================================================
-- 20261210130000_permissoes_rececao_armazem
-- ============================================================
-- Receção no armazém (/receiving, Fase 2 fatias 1–3) com permissões
-- próprias, numa categoria nova 'receiving' do ecrã de perfis.
--
-- Estado encontrado (pg_get_functiondef / pg_policies ao vivo, 07/10/2026):
--   • entrar/consultar (rpc_receiving_lookup): purchase_orders.receive OU
--     purchase_orders.view;
--   • receber por leitura (rpc_receive_by_code; can_receive do lookup):
--     purchase_orders.receive E inventory.edit — e rpc_receive_by_code chama
--     por dentro rpc_receive_purchase_order_lines (receção por linha da
--     Fase 1), que volta a exigir as mesmas duas;
--   • guias (rpc_delivery_note_save/close/reopen/cancel):
--     purchase_orders.receive; ler a guia (rpc_delivery_note_get e RLS de
--     supplier_delivery_notes/_lines/_orders): purchase_orders.view OU
--     .receive;
--   • associar/remover códigos (rpc_product_code_learn/remove):
--     products.edit OU (purchase_orders.receive E inventory.edit);
--   • comprovativo de receção: PDF gerado no browser a partir de
--     rpc_delivery_note_get + leituras diretas (suppliers, anew_users) — não
--     há função própria no servidor.
--
-- Permissões novas (categoria 'receiving', sem âmbito):
--   receiving.view                     Aceder à receção no armazém
--   receiving.receive                  Receber mercadoria por leitura
--   receiving.manage_delivery_notes    Gerir guias do fornecedor
--   receiving.learn_codes              Associar códigos a produtos
--   receiving.download_proof           Descarregar comprovativo de receção
--
-- Regra (nunca alarga o que hoje é permitido):
--   • Onde a receção lê ou mexe em dados do módulo Encomendas/Inventário, a
--     permissão nova SOMA-SE às de hoje:
--       lookup:       receiving.view E (purchase_orders.view OU .receive)
--       receber:      receiving.receive E purchase_orders.receive E inventory.edit
--                     (rpc_receive_by_code e can_receive do lookup)
--     A receção por linha na ficha da encomenda (rpc_receive_purchase_order_lines,
--     rpc_receive_purchase_order, rpc_preview_po_receipt…) NÃO muda.
--   • Onde a receção só mexe em dados próprios, a permissão nova SUBSTITUI:
--       guias:        receiving.manage_delivery_notes
--                     (o retorno passa por rpc_delivery_note_get, que continua
--                      a exigir purchase_orders.view OU .receive)
--       códigos:      products.edit OU receiving.learn_codes
--   • receiving.download_proof só pode ser aplicada no frontend (o PDF usa os
--     mesmos dados que a ficha da guia mostra).
--   • rpc_delivery_note_get, fn_delivery_note_scope e as políticas RLS
--     (supplier_delivery_notes/_lines/_orders, product_codes, receiving_scans)
--     ficam iguais.
--
-- Sementeira (papéis com deleted_at IS NULL — há 1 linha órfã com
-- purchase_orders.receive, que fica de fora):
--   A. equivalência — quem hoje tem purchase_orders.receive (128 papéis):
--        receiving.view, .receive, .manage_delivery_notes, .download_proof;
--      quem tem purchase_orders.receive E inventory.edit (127 papéis):
--        receiving.learn_codes.
--      Com isto, cada verificação nova dá exatamente o resultado de hoje.
--   B. quem hoje só tem purchase_orders.view (sem .receive) entra no ecrã em
--      modo consulta (59 papéis, 24 utilizadores ativos): recebe
--      receiving.view e receiving.download_proof para NÃO perder acesso.
--      DECISÃO PENDENTE do utilizador — apagar o bloco B corta-lhes a entrada.
--
-- Corpos das funções: cópia exata de pg_get_functiondef (07/10/2026); só
-- mudam as linhas de verificação de permissão, assinaladas
-- "NOVO (20261210130000)". Assinaturas iguais (sem DROP, sem overloads);
-- CREATE OR REPLACE mantém owner, SECURITY DEFINER, search_path e ACL; os
-- REVOKE/GRANT repetem a ACL viva (postgres, authenticated, service_role).
--
-- Prerequisites: 20261209100000_guias_do_fornecedor.sql
--                20261210100000_aprender_codigos.sql
--                20261210110000_aprender_codigos_barcode_principal.sql

-- ============================================================
-- 1. Catálogo
-- ============================================================

INSERT INTO public.anew_permissions (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('receiving.view',
   'Aceder à receção no armazém',
   'Permite abrir o ecrã Receção no armazém e consultar o que um código lido identifica (produto e linhas de encomenda em aberto). Os dados vêm das encomendas de compra: exige também Ver encomendas de compra (purchase_orders.view) ou Receber encomendas de compra (purchase_orders.receive).',
   'receiving', NULL, 0, false, 'organization', false),
  ('receiving.receive',
   'Receber mercadoria por leitura',
   'Permite dar entrada de mercadoria no ecrã de receção, por leitura de códigos, contra as encomendas de compra em aberto — gera as entradas de stock (ou a reserva para a encomenda de cliente) no armazém escolhido. Exige também purchase_orders.receive e inventory.edit (a receção usa por dentro a receção por linha das encomendas). Não altera a receção por linha na ficha da encomenda, que continua a exigir só purchase_orders.receive e inventory.edit.',
   'receiving', NULL, 1, true, 'organization', false),
  ('receiving.manage_delivery_notes',
   'Gerir guias do fornecedor',
   'Permite registar, editar, fechar, reabrir e cancelar guias do fornecedor na receção no armazém. Consultar as guias continua a exigir Ver encomendas de compra (purchase_orders.view) ou Receber encomendas de compra (purchase_orders.receive).',
   'receiving', NULL, 2, false, 'organization', false),
  ('receiving.learn_codes',
   'Associar códigos a produtos',
   'Permite, na receção, associar um código lido que não foi reconhecido (código de barras ou referência do fornecedor) a um produto, e remover nas primeiras 24 h os códigos que o próprio associou. Quem tem Editar produtos (products.edit) já o pode fazer sem esta permissão.',
   'receiving', NULL, 3, false, 'organization', false),
  ('receiving.download_proof',
   'Descarregar comprovativo de receção',
   'Permite descarregar o comprovativo de receção (PDF) de uma guia do fornecedor. Controlado no ecrã: o PDF usa os mesmos dados que a ficha da guia mostra.',
   'receiving', NULL, 4, false, 'organization', false)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 2. Atribuição
-- ============================================================
-- DISABLE TRIGGER USER: trg_protect_system_role_perms recusa escritas em
-- papéis is_system (System Admin, Super Admin) fora de service_role; o
-- gatilho de auditoria fica também desligado, como em 20261205000000 e
-- 20261205060000. Junta anew_roles (deleted_at IS NULL) para não criar
-- linhas órfãs.

ALTER TABLE public.anew_role_permissions DISABLE TRIGGER USER;

-- A.1 Quem hoje recebe (purchase_orders.receive): entrar, receber por
-- leitura (que continua a exigir também purchase_orders.receive +
-- inventory.edit), gerir guias e descarregar o comprovativo.
INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT ro.id, c.code, NULL::uuid
FROM public.anew_roles ro
CROSS JOIN (VALUES ('receiving.view'), ('receiving.receive'),
                   ('receiving.manage_delivery_notes'), ('receiving.download_proof')) AS c(code)
WHERE ro.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.anew_role_permissions rp
    WHERE rp.role_id = ro.id AND rp.permission_code = 'purchase_orders.receive'
  )
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- A.2 Quem hoje associa códigos na receção (purchase_orders.receive E
-- inventory.edit). products.edit continua a bastar por si.
INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT ro.id, 'receiving.learn_codes', NULL::uuid
FROM public.anew_roles ro
WHERE ro.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.anew_role_permissions rp
    WHERE rp.role_id = ro.id AND rp.permission_code = 'purchase_orders.receive'
  )
  AND EXISTS (
    SELECT 1 FROM public.anew_role_permissions rp
    WHERE rp.role_id = ro.id AND rp.permission_code = 'inventory.edit'
  )
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- B. DECISÃO PENDENTE — quem hoje só consulta (purchase_orders.view sem
-- .receive) entra no ecrã em modo consulta e pode descarregar o PDF de uma
-- guia. Mantido para ninguém perder acesso; apagar este INSERT (e o bloco B
-- do CONFERIR) corta-lhes a entrada na receção.
INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT ro.id, c.code, NULL::uuid
FROM public.anew_roles ro
CROSS JOIN (VALUES ('receiving.view'), ('receiving.download_proof')) AS c(code)
WHERE ro.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.anew_role_permissions rp
    WHERE rp.role_id = ro.id AND rp.permission_code = 'purchase_orders.view'
  )
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER USER;

-- ============================================================
-- 3. rpc_receiving_lookup — entrar exige também receiving.view; can_receive exige também receiving.receive
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_receiving_lookup(p_warehouse_id uuid, p_code text, p_supplier_id uuid DEFAULT NULL::uuid, p_delivery_note_id uuid DEFAULT NULL::uuid, p_unit_conversion boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org         uuid;
  v_code        text := btrim(COALESCE(p_code, ''));
  v_lc          text;
  v_can_receive boolean;
  v_level       integer;
  v_cand        record;
  v_factor      integer;
  v_lines       jsonb;
  v_candidates  jsonb := '[]'::jsonb;
  v_warnings    jsonb := '[]'::jsonb;
  v_other       integer;
  v_other_txt   text;
  v_matches     jsonb;
  -- NOVO (guia)
  v_note_org       uuid;
  v_note_supplier  uuid;
  v_note_number    text;
  v_note_status    text;
  v_scope          uuid[];
  v_note_poi       uuid[];
  v_note_has_lines boolean := false;
  v_ann            numeric;
  v_rcv            numeric;
  v_note_info      jsonb := '{}'::jsonb;
  -- NOVO (códigos)
  v_key            text;
  v_conv           boolean := COALESCE(p_unit_conversion, false);
BEGIN
  SELECT organization_id INTO v_org
  FROM public.warehouses
  WHERE id = p_warehouse_id AND deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'receiving.view')  -- NOVO (20261210130000)
     OR NOT (public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
             OR public.has_anew_permission(auth.uid(), 'purchase_orders.view')) THEN
    RAISE EXCEPTION 'Sem permissão para consultar encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_can_receive := public.has_anew_permission(auth.uid(), 'receiving.receive')  -- NOVO (20261210130000)
               AND public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
               AND public.has_anew_permission(auth.uid(), 'inventory.edit');

  IF v_code = '' THEN
    RAISE EXCEPTION 'Indica o código lido' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_code) > 200 THEN
    RAISE EXCEPTION 'Código lido demasiado longo' USING ERRCODE = 'check_violation';
  END IF;

  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE id = p_supplier_id AND organization_id = v_org AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Fornecedor inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (guia): a guia fixa o fornecedor e o âmbito (POs da guia, ou todas
  -- as do fornecedor se não tiver POs).
  IF p_delivery_note_id IS NOT NULL THEN
    SELECT organization_id, supplier_id, note_number, status
    INTO v_note_org, v_note_supplier, v_note_number, v_note_status
    FROM public.supplier_delivery_notes
    WHERE id = p_delivery_note_id;
    IF v_note_org IS NULL OR v_note_org <> v_org THEN
      RAISE EXCEPTION 'Guia do fornecedor não encontrada nesta organização' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_note_status <> 'open' THEN
      RAISE EXCEPTION 'A guia % está % — reabre-a para receber', v_note_number,
        CASE v_note_status WHEN 'closed' THEN 'fechada' ELSE 'cancelada' END
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_supplier_id IS NOT NULL AND p_supplier_id <> v_note_supplier THEN
      RAISE EXCEPTION 'A guia % é de outro fornecedor', v_note_number USING ERRCODE = 'check_violation';
    END IF;
    p_supplier_id := v_note_supplier;
    v_scope := public.fn_delivery_note_scope(p_delivery_note_id);
    SELECT array_agg(DISTINCT l.purchase_order_item_id) FILTER (WHERE l.purchase_order_item_id IS NOT NULL),
           count(*) > 0
    INTO v_note_poi, v_note_has_lines
    FROM public.supplier_delivery_note_lines l
    WHERE l.delivery_note_id = p_delivery_note_id;
    v_note_info := jsonb_build_object('delivery_note', jsonb_build_object(
      'id', p_delivery_note_id, 'note_number', v_note_number, 'status', v_note_status,
      'supplier_id', v_note_supplier, 'purchase_order_ids', to_jsonb(v_scope), 'has_lines', v_note_has_lines));
  END IF;

  v_lc := lower(v_code);
  v_key := public.fn_product_code_key(v_code);  -- NOVO (códigos)

  -- Correspondências (produto, unidade, nível) num jsonb — sem tabelas
  -- temporárias (função STABLE).
  SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', mm.product_id, 'uom_id', mm.uom_id,
                                               'matched_by', mm.matched_by, 'lvl', mm.lvl,
                                               'code_id', mm.code_id)), '[]'::jsonb)  -- NOVO (códigos): code_id
  INTO v_matches
  FROM (
  -- 1 código de barras
  SELECT p.id AS product_id, NULL::uuid AS uom_id, 'barcode'::text AS matched_by, 1 AS lvl, NULL::uuid AS code_id
  FROM public.products p
  WHERE p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND public.fn_product_code_key(p.barcode) = v_key  -- NOVO (códigos): chave normalizada (GTIN)
  UNION
  -- 1b NOVO (códigos): código de barras aprendido (unidade do código)
  SELECT pc.product_id, pc.uom_id, 'barcode', 1, pc.id
  FROM public.product_codes pc
  JOIN public.products p ON p.id = pc.product_id
  WHERE pc.organization_id = v_org AND pc.kind = 'barcode' AND pc.deleted_at IS NULL
    AND pc.code_key = v_key
    AND p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
  UNION
  -- 2a referência do fornecedor nas linhas em aberto
  SELECT poi.product_id, poi.uom_id, 'supplier_sku', 2, NULL::uuid
  FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
  JOIN public.products p ON p.id = poi.product_id
  WHERE po.organization_id = v_org AND po.deleted_at IS NULL
    AND po.status IN ('pending', 'ordered', 'partially_received')
    AND poi.item_type = 'product' AND poi.quantity > poi.received_quantity
    AND (p_supplier_id IS NULL OR po.supplier_id = p_supplier_id)
    AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND lower(btrim(poi.supplier_sku)) = v_lc
  UNION
  -- 2b referência do fornecedor na ficha do produto (item_suppliers)
  SELECT i.product_id, i.uom_id, 'supplier_sku', 2, NULL::uuid
  FROM public.item_suppliers i
  JOIN public.products p ON p.id = i.product_id
  WHERE i.organization_id = v_org AND i.deleted_at IS NULL AND i.product_id IS NOT NULL
    AND (p_supplier_id IS NULL OR i.supplier_id = p_supplier_id)
    AND p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND lower(btrim(i.supplier_sku)) = v_lc
  UNION
  -- 2c NOVO (códigos): referência do fornecedor aprendida (filtrada pelo
  -- fornecedor quando há; unidade do código)
  SELECT pc.product_id, pc.uom_id, 'supplier_sku', 2, pc.id
  FROM public.product_codes pc
  JOIN public.products p ON p.id = pc.product_id
  WHERE pc.organization_id = v_org AND pc.kind = 'supplier_ref' AND pc.deleted_at IS NULL
    AND pc.code_key = v_key
    AND (p_supplier_id IS NULL OR pc.supplier_id = p_supplier_id)
    AND p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
  UNION
  -- 3 SKU do produto
  SELECT p.id, NULL::uuid, 'sku', 3, NULL::uuid
  FROM public.products p
  WHERE p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND lower(btrim(p.sku)) = v_lc
  UNION
  -- 4 SKU gravado nas linhas das POs da organização
  SELECT poi.product_id, NULL::uuid, 'po_line_sku', 4, NULL::uuid
  FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
  JOIN public.products p ON p.id = poi.product_id
  WHERE po.organization_id = v_org AND po.deleted_at IS NULL
    AND poi.item_type = 'product'
    AND (p_supplier_id IS NULL OR po.supplier_id = p_supplier_id)
    AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND lower(btrim(poi.sku)) = v_lc
  ) mm;

  SELECT min(m.lvl) INTO v_level
  FROM jsonb_to_recordset(v_matches) AS m(product_id uuid, uom_id uuid, matched_by text, lvl integer);

  IF v_level IS NULL THEN
    RETURN jsonb_build_object(
      'found', false, 'code', v_code, 'organization_id', v_org,
      'warehouse_id', p_warehouse_id, 'supplier_id', p_supplier_id,
      'can_receive', v_can_receive, 'candidates', '[]'::jsonb,
      'warnings', jsonb_build_array(format('Código «%s» não encontrado nesta organização', v_code))
    ) || v_note_info  -- NOVO (guia): '{}' sem guia
     || CASE WHEN v_conv THEN jsonb_build_object('unit_conversion', true) ELSE '{}'::jsonb END;  -- NOVO (códigos)
  END IF;

  -- Níveis inferiores com outros produtos: só aviso.
  SELECT count(DISTINCT m.product_id),
         string_agg(DISTINCT format('%s (%s)', p.name, m.matched_by), ', ')
  INTO v_other, v_other_txt
  FROM jsonb_to_recordset(v_matches) AS m(product_id uuid, uom_id uuid, matched_by text, lvl integer)
  JOIN public.products p ON p.id = m.product_id
  WHERE m.lvl > v_level
    AND m.product_id NOT IN (
      SELECT m2.product_id
      FROM jsonb_to_recordset(v_matches) AS m2(product_id uuid, uom_id uuid, matched_by text, lvl integer)
      WHERE m2.lvl = v_level);
  IF v_other > 0 THEN
    v_warnings := v_warnings || to_jsonb(format('O código também corresponde a: %s', v_other_txt));
  END IF;

  FOR v_cand IN
    SELECT DISTINCT ON (m.product_id, COALESCE(m.uom_id, p.uom_id))
           m.product_id, m.matched_by,
           -- unidade lida: a da ligação/linha; senão a do produto
           CASE WHEN m.uom_id IS NULL OR m.uom_id IS NOT DISTINCT FROM p.uom_id THEN p.uom_id ELSE m.uom_id END AS uom_id,
           (m.uom_id IS NOT NULL AND m.uom_id IS DISTINCT FROM p.uom_id) AS is_pack,
           p.name, p.sku, p.barcode, m.code_id  -- NOVO (códigos)
    FROM jsonb_to_recordset(v_matches) AS m(product_id uuid, uom_id uuid, matched_by text, lvl integer, code_id uuid)
    JOIN public.products p ON p.id = m.product_id
    WHERE m.lvl = v_level
    ORDER BY m.product_id, COALESCE(m.uom_id, p.uom_id), p.name, m.code_id NULLS FIRST  -- NOVO (códigos)
  LOOP
    v_factor := 1;
    IF v_cand.is_pack THEN
      BEGIN
        v_factor := public.fn_uom_units_per(v_cand.uom_id, v_cand.product_id);
      EXCEPTION WHEN OTHERS THEN
        v_warnings := v_warnings || to_jsonb(format('«%s»: a unidade da referência do fornecedor não é compatível com a do produto (%s)', v_cand.name, SQLERRM));
        CONTINUE;
      END;
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'purchase_order_id',      o.purchase_order_id,
             'order_number',           o.order_number,
             'po_status',              o.po_status,
             'confirmed',              o.confirmed,
             'supplier_id',            o.supplier_id,
             'supplier_name',          o.supplier_name,
             'expected_delivery',      o.expected_delivery,
             'purchase_order_item_id', o.purchase_order_item_id,
             'description',            o.description,
             'quantity',               o.quantity,
             'received_quantity',      o.received_quantity,
             'open_quantity',          o.open_quantity,
             'uom_id',                 o.uom_id,
             'units_per_uom',          o.units_per_uom,
             'same_unit',              (o.units_per_uom = v_factor),
             'contract_id',            o.contract_id,
             'contract_order_number',  o.contract_order_number,
             'contract_active',        o.contract_active,
             -- Posição na ordem de enchimento (só linhas da mesma unidade).
             -- NOVO (códigos): com conversão todas as linhas entram na ordem.
             'allocation_rank',        CASE WHEN v_conv OR o.units_per_uom = v_factor THEN o.r END
           -- NOVO (guia): linha indicada na guia (só com guia)
           ) || CASE WHEN p_delivery_note_id IS NOT NULL
                     THEN jsonb_build_object('in_delivery_note', COALESCE(o.purchase_order_item_id = ANY (v_note_poi), false))
                     ELSE '{}'::jsonb END
           -- NOVO (códigos): em aberto em unidades de stock (só com conversão)
           || CASE WHEN v_conv THEN jsonb_build_object('open_units', o.open_quantity * o.units_per_uom)
                   ELSE '{}'::jsonb END
           ORDER BY (v_conv OR o.units_per_uom = v_factor) DESC, o.prio, o.allocation_rank), '[]'::jsonb),
           count(*) FILTER (WHERE NOT v_conv AND o.units_per_uom <> v_factor)
    INTO v_lines, v_other
    FROM (
      -- NOVO (guia): prio 0 = linha indicada na guia (sem guia é sempre 1);
      -- só POs do âmbito da guia.
      SELECT ol.*, pr.prio,
             row_number() OVER (PARTITION BY (v_conv OR ol.units_per_uom = v_factor) ORDER BY pr.prio, ol.allocation_rank) AS r
      FROM public.fn_receiving_open_lines(v_org, ARRAY[v_cand.product_id], p_supplier_id) ol
      CROSS JOIN LATERAL (SELECT CASE WHEN ol.purchase_order_item_id = ANY (v_note_poi) THEN 0 ELSE 1 END AS prio) pr
      WHERE v_scope IS NULL OR ol.purchase_order_id = ANY (v_scope)
    ) o;

    IF jsonb_array_length(v_lines) = 0 THEN
      v_warnings := v_warnings || to_jsonb(format('«%s» não tem encomendas a fornecedor em aberto%s', v_cand.name,
                      CASE WHEN p_supplier_id IS NOT NULL THEN ' deste fornecedor' ELSE '' END)
                      -- NOVO (guia)
                      || CASE WHEN v_scope IS NOT NULL THEN format(' nas encomendas da guia %s', v_note_number) ELSE '' END);
    ELSIF v_other > 0 THEN
      v_warnings := v_warnings || to_jsonb(format('«%s»: %s linha(s) em aberto noutra unidade — não entram numa leitura nesta unidade', v_cand.name, v_other));
    END IF;

    -- NOVO (guia): anunciado / recebido pela guia (unidades de stock).
    IF p_delivery_note_id IS NOT NULL THEN
      SELECT COALESCE(sum(l.quantity * l.units_per_uom), 0) INTO v_ann
      FROM public.supplier_delivery_note_lines l
      WHERE l.delivery_note_id = p_delivery_note_id AND l.product_id = v_cand.product_id;
      SELECT COALESCE(sum(pr.quantity * pr.units_per_uom), 0) INTO v_rcv
      FROM public.purchase_order_receipts pr
      WHERE pr.delivery_note_id = p_delivery_note_id AND pr.product_id = v_cand.product_id
        AND pr.kind = 'receipt' AND pr.reverted_at IS NULL;
      IF v_note_has_lines AND v_ann = 0 THEN
        v_warnings := v_warnings || to_jsonb(format('«%s» não consta da guia %s', v_cand.name, v_note_number));
      END IF;
    END IF;

    v_candidates := v_candidates || (jsonb_build_object(
      'product_id',    v_cand.product_id,
      'name',          v_cand.name,
      'sku',           v_cand.sku,
      'barcode',       v_cand.barcode,
      'matched_by',    v_cand.matched_by,
      'uom_id',        v_cand.uom_id,
      'uom_code',      (SELECT code FROM public.uom WHERE id = v_cand.uom_id),
      'units_per_uom', v_factor,
      'open_lines',    v_lines
    ) || CASE WHEN v_cand.code_id IS NOT NULL  -- NOVO (códigos)
              THEN jsonb_build_object('learned_code_id', v_cand.code_id) ELSE '{}'::jsonb END
      || CASE WHEN p_delivery_note_id IS NOT NULL  -- NOVO (guia)
              THEN jsonb_build_object('delivery_note', jsonb_build_object(
                     'announced', v_ann > 0, 'announced_units', trim_scale(v_ann), 'received_units', trim_scale(v_rcv)))
              ELSE '{}'::jsonb END);
  END LOOP;

  RETURN jsonb_build_object(
    'found',           jsonb_array_length(v_candidates) > 0,
    'code',            v_code,
    'organization_id', v_org,
    'warehouse_id',    p_warehouse_id,
    'supplier_id',     p_supplier_id,
    'can_receive',     v_can_receive,
    'candidates',      v_candidates,
    'warnings',        v_warnings
  ) || v_note_info  -- NOVO (guia): '{}' sem guia
     || CASE WHEN v_conv THEN jsonb_build_object('unit_conversion', true) ELSE '{}'::jsonb END;  -- NOVO (códigos)
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_receiving_lookup(uuid, text, uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_receiving_lookup(uuid, text, uuid, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_receiving_lookup(uuid, text, uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_receiving_lookup(uuid, text, uuid, uuid, boolean) TO service_role;

-- ============================================================
-- 4. rpc_receive_by_code — exige também receiving.receive
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_receive_by_code(p_request_id uuid, p_warehouse_id uuid, p_product_id uuid, p_quantity numeric, p_uom_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_purchase_order_item_id uuid DEFAULT NULL::uuid, p_code text DEFAULT NULL::text, p_dry_run boolean DEFAULT false, p_delivery_note_id uuid DEFAULT NULL::uuid, p_unit_conversion boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor       uuid;
  v_org         uuid;
  v_dry         boolean := COALESCE(p_dry_run, false);
  v_code        text := nullif(btrim(COALESCE(p_code, '')), '');
  v_lc          text;
  v_product     record;
  v_factor      integer;
  v_uom_code    text;
  v_units       numeric;
  v_matched_by  text;
  v_replay      jsonb;
  v_forced      record;
  v_locked      uuid[];
  v_cid         uuid;
  v_open_total  numeric;
  v_open_list   text;
  v_plan        jsonb;
  v_po          record;
  v_r           jsonb;
  v_allocs      jsonb := '[]'::jsonb;
  v_warnings    jsonb := '[]'::jsonb;
  v_to_order    numeric := 0;
  v_to_stock    numeric := 0;
  v_other       integer;
  v_result      jsonb;
  -- NOVO (guia)
  v_note_org       uuid;
  v_note_supplier  uuid;
  v_note_number    text;
  v_note_status    text;
  v_scope          uuid[];
  v_note_poi       uuid[];
  v_note_has_lines boolean := false;
  v_ann            numeric;
  v_rcv            numeric;
  v_checks         jsonb := '[]'::jsonb;
  -- NOVO (códigos)
  v_key            text;
  v_conv           boolean := COALESCE(p_unit_conversion, false);
  v_base_code      text;
  v_line           record;
  v_rest           numeric;
  v_take           numeric;
  v_open_units     numeric;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Identificador do pedido de receção em falta' USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.warehouses
  WHERE id = p_warehouse_id AND deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'receiving.receive')  -- NOVO (20261210130000)
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Pedido já processado → devolve o resultado gravado.
  v_replay := public.fn_receiving_scan_replay(p_request_id, v_org, v_actor, p_warehouse_id, p_product_id, p_quantity, p_uom_id);
  IF v_replay IS NOT NULL THEN
    -- NOVO (guia): o identificador gravado com outra guia (ou sem guia) é erro.
    IF (SELECT s.delivery_note_id FROM public.receiving_scans s WHERE s.id = p_request_id) IS DISTINCT FROM p_delivery_note_id THEN
      RAISE EXCEPTION 'O identificador do pedido de receção já foi usado noutra leitura (outra guia)'
        USING ERRCODE = 'check_violation';
    END IF;
    -- NOVO (códigos): gravado com outra opção de conversão de unidades → erro.
    IF COALESCE((v_replay ->> 'unit_conversion')::boolean, false) IS DISTINCT FROM v_conv THEN
      RAISE EXCEPTION 'O identificador do pedido de receção já foi usado noutra leitura (outra opção de conversão de unidades)'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN v_replay;
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'A quantidade lida tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;
  IF p_quantity <> floor(p_quantity) THEN
    RAISE EXCEPTION 'A quantidade lida tem de ser um número inteiro (%)', p_quantity USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, name, sku, barcode, uom_id INTO v_product
  FROM public.products
  WHERE id = p_product_id AND organization_id = v_org AND deleted_at IS NULL AND NOT is_deleted;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE id = p_supplier_id AND organization_id = v_org AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Fornecedor inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (guia): 1.º lock da ordem global — a guia FOR SHARE (várias leituras
  -- da mesma guia em paralelo; fechar/editar/cancelar esperam). Fixa o
  -- fornecedor e o âmbito.
  IF p_delivery_note_id IS NOT NULL THEN
    SELECT organization_id, supplier_id, note_number, status
    INTO v_note_org, v_note_supplier, v_note_number, v_note_status
    FROM public.supplier_delivery_notes
    WHERE id = p_delivery_note_id
    FOR SHARE;
    IF v_note_org IS NULL OR v_note_org <> v_org THEN
      RAISE EXCEPTION 'Guia do fornecedor não encontrada nesta organização' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_note_status <> 'open' THEN
      RAISE EXCEPTION 'A guia % está % — reabre-a para receber', v_note_number,
        CASE v_note_status WHEN 'closed' THEN 'fechada' ELSE 'cancelada' END
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_supplier_id IS NOT NULL AND p_supplier_id <> v_note_supplier THEN
      RAISE EXCEPTION 'A guia % é de outro fornecedor', v_note_number USING ERRCODE = 'check_violation';
    END IF;
    p_supplier_id := v_note_supplier;
    v_scope := public.fn_delivery_note_scope(p_delivery_note_id);
    SELECT array_agg(DISTINCT l.purchase_order_item_id) FILTER (WHERE l.purchase_order_item_id IS NOT NULL),
           count(*) > 0
    INTO v_note_poi, v_note_has_lines
    FROM public.supplier_delivery_note_lines l
    WHERE l.delivery_note_id = p_delivery_note_id;
  END IF;

  -- Fator da unidade lida (erro claro se a unidade não for do produto).
  v_factor   := public.fn_uom_units_per(p_uom_id, p_product_id);
  v_uom_code := COALESCE((SELECT code FROM public.uom WHERE id = COALESCE(p_uom_id, v_product.uom_id)), 'un.');
  v_units    := p_quantity * v_factor;
  IF v_units > 2147483647 THEN
    RAISE EXCEPTION 'A leitura excede o limite de stock (% unidades)', v_units USING ERRCODE = 'numeric_value_out_of_range';
  END IF;

  -- Como o código lido corresponde a este produto (só registo/aviso).
  IF v_code IS NOT NULL THEN
    v_lc := lower(v_code);
    v_key := public.fn_product_code_key(v_code);  -- NOVO (códigos)
    v_matched_by := CASE
      -- NOVO (códigos): chave normalizada + códigos aprendidos
      WHEN public.fn_product_code_key(v_product.barcode) = v_key
        OR EXISTS (SELECT 1 FROM public.product_codes pc
                   WHERE pc.product_id = p_product_id AND pc.organization_id = v_org
                     AND pc.kind = 'barcode' AND pc.deleted_at IS NULL AND pc.code_key = v_key) THEN 'barcode'
      WHEN EXISTS (SELECT 1 FROM public.purchase_order_items poi
                   JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
                   WHERE po.organization_id = v_org AND poi.product_id = p_product_id
                     AND lower(btrim(poi.supplier_sku)) = v_lc)
        OR EXISTS (SELECT 1 FROM public.item_suppliers i
                   WHERE i.organization_id = v_org AND i.product_id = p_product_id
                     AND i.deleted_at IS NULL AND lower(btrim(i.supplier_sku)) = v_lc)
        OR EXISTS (SELECT 1 FROM public.product_codes pc  -- NOVO (códigos)
                   WHERE pc.product_id = p_product_id AND pc.organization_id = v_org
                     AND pc.kind = 'supplier_ref' AND pc.deleted_at IS NULL AND pc.code_key = v_key) THEN 'supplier_sku'
      WHEN lower(btrim(v_product.sku)) = v_lc THEN 'sku'
      WHEN EXISTS (SELECT 1 FROM public.purchase_order_items poi
                   JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
                   WHERE po.organization_id = v_org AND poi.product_id = p_product_id
                     AND lower(btrim(poi.sku)) = v_lc) THEN 'po_line_sku'
    END;
    IF v_matched_by IS NULL THEN
      v_warnings := v_warnings || to_jsonb(format('O código «%s» não corresponde a «%s»', v_code, v_product.name));
    END IF;
  END IF;

  -- Linha forçada: validações com mensagens claras.
  IF p_purchase_order_item_id IS NOT NULL THEN
    SELECT poi.id, poi.product_id, poi.item_type, poi.quantity, poi.received_quantity,
           COALESCE(poi.units_per_uom, 1) AS units_per_uom, poi.description,
           po.status, po.supplier_id, po.order_number
    INTO v_forced
    FROM public.purchase_order_items poi
    JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
    WHERE poi.id = p_purchase_order_item_id AND po.organization_id = v_org AND po.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linha de encomenda não encontrada' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_forced.item_type <> 'product' OR v_forced.product_id IS DISTINCT FROM p_product_id THEN
      RAISE EXCEPTION 'A linha "%" (%) não é do produto lido', v_forced.description, v_forced.order_number
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_supplier_id IS NOT NULL AND v_forced.supplier_id IS DISTINCT FROM p_supplier_id THEN
      RAISE EXCEPTION 'A linha "%" (%) é de outro fornecedor', v_forced.description, v_forced.order_number
        USING ERRCODE = 'check_violation';
    END IF;
    -- NOVO (guia): a linha forçada tem de estar no âmbito da guia.
    IF v_scope IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.purchase_order_items poi
      WHERE poi.id = p_purchase_order_item_id AND poi.purchase_order_id = ANY (v_scope)
    ) THEN
      RAISE EXCEPTION 'A linha "%" (%) não está nas encomendas da guia %', v_forced.description, v_forced.order_number, v_note_number
        USING ERRCODE = 'check_violation';
    END IF;
    -- NOVO (códigos): com conversão a linha pode estar noutra unidade (a
    -- divisibilidade é verificada no plano).
    IF NOT v_conv AND v_forced.units_per_uom <> v_factor THEN
      RAISE EXCEPTION 'A linha "%" (%) está noutra unidade (% un. por unidade; a leitura tem %)', v_forced.description, v_forced.order_number, v_forced.units_per_uom, v_factor
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_forced.status NOT IN ('pending', 'ordered', 'partially_received') OR v_forced.quantity <= v_forced.received_quantity THEN
      RAISE EXCEPTION 'A linha "%" (%) não está em aberto', v_forced.description, v_forced.order_number
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Reserva do identificador (fica com o resultado no fim). Um pedido igual
  -- em paralelo espera aqui pelo primeiro e, quando este confirma, devolve o
  -- resultado gravado. Em dry-run nada é gravado.
  IF NOT v_dry THEN
    INSERT INTO public.receiving_scans (
      id, organization_id, warehouse_id, supplier_id, code, matched_by,
      product_id, uom_id, quantity, units, result, created_by,
      delivery_note_id  -- NOVO (guia)
    ) VALUES (
      p_request_id, v_org, p_warehouse_id, p_supplier_id, v_code, v_matched_by,
      p_product_id, p_uom_id, p_quantity, v_units, '{}'::jsonb, v_actor,
      p_delivery_note_id
    )
    ON CONFLICT (id) DO NOTHING;

    IF NOT FOUND THEN
      v_replay := public.fn_receiving_scan_replay(p_request_id, v_org, v_actor, p_warehouse_id, p_product_id, p_quantity, p_uom_id);
      IF v_replay IS NULL THEN
        RAISE EXCEPTION 'Pedido de receção em conflito — tenta de novo' USING ERRCODE = 'serialization_failure';
      END IF;
      -- NOVO (guia)
      IF (SELECT s.delivery_note_id FROM public.receiving_scans s WHERE s.id = p_request_id) IS DISTINCT FROM p_delivery_note_id THEN
        RAISE EXCEPTION 'O identificador do pedido de receção já foi usado noutra leitura (outra guia)'
          USING ERRCODE = 'check_violation';
      END IF;
      -- NOVO (códigos)
      IF COALESCE((v_replay ->> 'unit_conversion')::boolean, false) IS DISTINCT FROM v_conv THEN
        RAISE EXCEPTION 'O identificador do pedido de receção já foi usado noutra leitura (outra opção de conversão de unidades)'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN v_replay;
    END IF;
  END IF;

  -- 1. Serializa leituras do mesmo produto.
  PERFORM pg_advisory_xact_lock(hashtextextended('receiving:' || v_org::text || ':' || p_product_id::text, 0));

  BEGIN
    -- 2. Tranca as POs candidatas (ordem fixa por id).
    SELECT COALESCE(array_agg(t.id ORDER BY t.id), ARRAY[]::uuid[]) INTO v_locked
    FROM (
      SELECT po.id
      FROM public.purchase_orders po
      WHERE po.id IN (
              SELECT o.purchase_order_id
              FROM public.fn_receiving_open_lines(v_org, ARRAY[p_product_id], p_supplier_id) o
              WHERE (v_conv OR o.units_per_uom = v_factor)  -- NOVO (códigos)
                AND (p_purchase_order_item_id IS NULL OR o.purchase_order_item_id = p_purchase_order_item_id)
                AND (v_scope IS NULL OR o.purchase_order_id = ANY (v_scope)))  -- NOVO (guia)
        AND po.deleted_at IS NULL
        AND po.status IN ('pending', 'ordered', 'partially_received')
      ORDER BY po.id
      FOR UPDATE
    ) t;

    -- 3. Locks das Encomendas Cliente (os da Fase 1), ordem fixa.
    FOR v_cid IN
      SELECT DISTINCT po.source_id
      FROM public.purchase_orders po
      WHERE po.id = ANY (v_locked) AND po.source_type = 'contract' AND po.source_id IS NOT NULL
      ORDER BY po.source_id
    LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended('po_receipt_contract:' || v_cid::text, 0));
    END LOOP;

    -- 4. Em aberto relido com tudo trancado (só POs trancadas). take = o que
    --    cada linha recebe, enchendo pela ordem D2 (NOVO (guia): primeiro as
    --    linhas indicadas na guia; sem guia a ordem é a mesma).
    IF NOT v_conv THEN  -- caminho da fatia 2 (sem conversão), intacto
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'rn', a.rn, 'purchase_order_id', a.purchase_order_id, 'order_number', a.order_number,
             'po_status', a.po_status, 'purchase_order_item_id', a.purchase_order_item_id,
             'open_quantity', a.open_quantity, 'take', a.take) ORDER BY a.rn), '[]'::jsonb),
           COALESCE(SUM(a.open_quantity), 0),
           string_agg(DISTINCT a.order_number, ', ')
    INTO v_plan, v_open_total, v_open_list
    FROM (
      SELECT c.rn, c.purchase_order_id, c.order_number, c.po_status, c.purchase_order_item_id, c.open_quantity,
             LEAST(c.open_quantity,
                   GREATEST(0, p_quantity - COALESCE(SUM(c.open_quantity) OVER (
                     ORDER BY c.rn ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0))) AS take
      FROM (
        SELECT o.*, row_number() OVER (
                 ORDER BY CASE WHEN o.purchase_order_item_id = ANY (v_note_poi) THEN 0 ELSE 1 END,  -- NOVO (guia)
                          o.allocation_rank) AS rn
        FROM public.fn_receiving_open_lines(v_org, ARRAY[p_product_id], p_supplier_id) o
        WHERE o.purchase_order_id = ANY (v_locked)
          AND o.units_per_uom = v_factor
          AND (p_purchase_order_item_id IS NULL OR o.purchase_order_item_id = p_purchase_order_item_id)
      ) c
    ) a;

    -- D3: acima do em aberto → recusa tudo.
    IF v_open_total < p_quantity THEN
      RAISE EXCEPTION '%', format('Leste %s %s; em aberto %s %s%s', p_quantity, v_uom_code, v_open_total, v_uom_code,
        CASE WHEN v_open_list IS NOT NULL THEN format(' (%s)', v_open_list)
             WHEN p_purchase_order_item_id IS NOT NULL THEN ' (a linha indicada já não está em aberto)'
             ELSE format(' — sem encomendas a fornecedor em aberto para «%s»%s', v_product.name,
                         CASE WHEN p_supplier_id IS NOT NULL THEN ' deste fornecedor nesta unidade' ELSE ' nesta unidade' END)
        END)
        -- NOVO (guia): âmbito da guia na mensagem ('' sem guia)
        || CASE WHEN p_delivery_note_id IS NOT NULL
                THEN format(' — âmbito da guia %s%s', v_note_number,
                            CASE WHEN v_scope IS NOT NULL THEN format(' (%s encomenda(s) da guia)', cardinality(v_scope))
                                 ELSE ' (encomendas do fornecedor)' END)
                ELSE '' END
        USING ERRCODE = 'check_violation';
    END IF;

    ELSE
      -- NOVO (códigos): conversão caixa↔unidades. Linhas elegíveis = todas as
      -- linhas em aberto trancadas (os fatores das linhas são todos sobre a
      -- unidade de stock do produto — mesma base); ordem = linhas da guia →
      -- D2, sem preferir a unidade lida. Cada linha só leva unidades inteiras
      -- suas: take = LEAST(em aberto, floor(resto / fator)). Resto ≠ 0 →
      -- recusa tudo (mensagens em unidades de stock).
      v_rest := v_units;
      v_open_units := 0;
      v_plan := '[]'::jsonb;
      v_base_code := COALESCE((SELECT code FROM public.uom WHERE id = v_product.uom_id), 'un.');
      FOR v_line IN
        SELECT o.*, row_number() OVER (
                 ORDER BY CASE WHEN o.purchase_order_item_id = ANY (v_note_poi) THEN 0 ELSE 1 END,
                          o.allocation_rank) AS rn
        FROM public.fn_receiving_open_lines(v_org, ARRAY[p_product_id], p_supplier_id) o
        WHERE o.purchase_order_id = ANY (v_locked)
          AND o.units_per_uom >= 1
          AND (p_purchase_order_item_id IS NULL OR o.purchase_order_item_id = p_purchase_order_item_id)
        ORDER BY rn
      LOOP
        v_take := LEAST(v_line.open_quantity, floor(v_rest / v_line.units_per_uom));
        v_rest := v_rest - v_take * v_line.units_per_uom;
        v_open_units := v_open_units + v_line.open_quantity * v_line.units_per_uom;
        v_plan := v_plan || jsonb_build_object(
          'rn', v_line.rn, 'purchase_order_id', v_line.purchase_order_id, 'order_number', v_line.order_number,
          'po_status', v_line.po_status, 'purchase_order_item_id', v_line.purchase_order_item_id,
          'open_quantity', v_line.open_quantity, 'take', v_take);
      END LOOP;
      SELECT string_agg(DISTINCT x ->> 'order_number', ', ') INTO v_open_list
      FROM jsonb_array_elements(v_plan) x;

      IF v_rest <> 0 THEN
        RAISE EXCEPTION '%', CASE
          WHEN v_open_units < v_units THEN
            format('Leste %s %s (%s %s); em aberto %s %s%s', p_quantity, v_uom_code, trim_scale(v_units), v_base_code,
                   trim_scale(v_open_units), v_base_code,
                   CASE WHEN v_open_list IS NOT NULL THEN format(' (%s)', v_open_list)
                        WHEN p_purchase_order_item_id IS NOT NULL THEN ' (a linha indicada já não está em aberto)'
                        ELSE format(' — sem encomendas a fornecedor em aberto para «%s»%s', v_product.name,
                                    CASE WHEN p_supplier_id IS NOT NULL THEN ' deste fornecedor' ELSE '' END)
                   END)
          ELSE
            format('Leste %s %s (%s %s); as linhas em aberto (%s) só recebem unidades inteiras da sua embalagem — ficam %s %s por distribuir',
                   p_quantity, v_uom_code, trim_scale(v_units), v_base_code, v_open_list, trim_scale(v_rest), v_base_code)
          END
          || CASE WHEN p_delivery_note_id IS NOT NULL
                  THEN format(' — âmbito da guia %s%s', v_note_number,
                              CASE WHEN v_scope IS NOT NULL THEN format(' (%s encomenda(s) da guia)', cardinality(v_scope))
                                   ELSE ' (encomendas do fornecedor)' END)
                  ELSE '' END
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- NOVO (guia): avisos de anunciado (decisão 1: aviso + confirmação no
    -- ecrã). Com o lock do produto detido, o recebido pela guia é estável.
    IF p_delivery_note_id IS NOT NULL AND v_note_has_lines THEN
      SELECT COALESCE(sum(l.quantity * l.units_per_uom), 0) INTO v_ann
      FROM public.supplier_delivery_note_lines l
      WHERE l.delivery_note_id = p_delivery_note_id AND l.product_id = p_product_id;
      IF v_ann = 0 THEN
        v_checks   := v_checks || to_jsonb('nao_consta_da_guia'::text);
        v_warnings := v_warnings || to_jsonb(format('«%s» não consta da guia %s', v_product.name, v_note_number));
      ELSE
        SELECT COALESCE(sum(pr.quantity * pr.units_per_uom), 0) INTO v_rcv
        FROM public.purchase_order_receipts pr
        WHERE pr.delivery_note_id = p_delivery_note_id AND pr.product_id = p_product_id
          AND pr.kind = 'receipt' AND pr.reverted_at IS NULL;
        IF v_rcv + v_units > v_ann THEN
          v_checks   := v_checks || to_jsonb('acima_do_anunciado'::text);
          v_warnings := v_warnings || to_jsonb(format('«%s»: com esta leitura ficam %s un. recebidas pela guia %s; anunciadas %s un.',
                          v_product.name, trim_scale(v_rcv + v_units), v_note_number, trim_scale(v_ann)));
        END IF;
      END IF;
    END IF;

    -- 5. Receção pela Fase 1, uma chamada por PO, pela ordem D2 (os locks já
    --    estão todos detidos, a ordem das chamadas não cria esperas novas).
    FOR v_po IN
      SELECT l.purchase_order_id, min(l.order_number) AS order_number,
             bool_or(l.po_status = 'pending') AS pending,
             jsonb_agg(jsonb_build_object('purchase_order_item_id', l.purchase_order_item_id, 'quantity', l.take) ORDER BY l.rn) AS lines,
             array_agg(l.purchase_order_item_id ORDER BY l.rn) AS ids
      FROM jsonb_to_recordset(v_plan) AS l(rn bigint, purchase_order_id uuid, order_number text, po_status text,
                                           purchase_order_item_id uuid, open_quantity numeric, take numeric)
      WHERE l.take > 0
      GROUP BY l.purchase_order_id
      ORDER BY min(l.rn)
    LOOP
      v_r := public.rpc_receive_purchase_order_lines(v_po.purchase_order_id, p_warehouse_id, v_po.lines, NULL);

      IF NOT v_dry THEN
        -- Liga as linhas de histórico acabadas de gravar pela Fase 1 a esta
        -- leitura (received_at = now() = início da transação; received_by =
        -- current_business_user_id(), como a Fase 1 grava).
        UPDATE public.purchase_order_receipts
        SET receiving_scan_id = p_request_id,
            delivery_note_id  = p_delivery_note_id  -- NOVO (guia); NULL sem guia (já era NULL)
        WHERE purchase_order_id = v_po.purchase_order_id
          AND purchase_order_item_id = ANY (v_po.ids)
          AND kind = 'receipt'
          AND receiving_scan_id IS NULL
          AND received_at = now()
          AND received_by = v_actor;
      END IF;

      IF v_po.pending THEN
        v_warnings := v_warnings || to_jsonb(format('%s ainda está pendente (não confirmada ao fornecedor)', v_po.order_number));
      END IF;

      v_allocs := v_allocs || jsonb_build_object(
        'purchase_order_id',    v_po.purchase_order_id,
        'order_number',         v_r -> 'order_number',
        'status',               v_r -> 'status',
        'stock_skipped',        v_r -> 'stock_skipped',
        'units_to_order_total', v_r -> 'units_to_order_total',
        'units_to_stock_total', v_r -> 'units_to_stock_total',
        'lines',                v_r -> 'lines'
      );
      v_to_order := v_to_order + COALESCE((v_r ->> 'units_to_order_total')::numeric, 0);
      v_to_stock := v_to_stock + COALESCE((v_r ->> 'units_to_stock_total')::numeric, 0);
    END LOOP;

    IF v_dry THEN
      RAISE EXCEPTION USING ERRCODE = 'OLPV2', MESSAGE = 'receive_by_code_dry_run_rollback';
    END IF;
  EXCEPTION WHEN SQLSTATE 'OLPV2' THEN
    NULL;  -- dry-run: tudo o que a receção escreveu foi desfeito com a subtransação
  END;

  SELECT count(*) INTO v_other
  FROM public.fn_receiving_open_lines(v_org, ARRAY[p_product_id], p_supplier_id) o
  WHERE NOT v_conv AND o.units_per_uom <> v_factor  -- NOVO (códigos): com conversão nenhuma fica de fora
    AND (v_scope IS NULL OR o.purchase_order_id = ANY (v_scope));  -- NOVO (guia)
  IF v_other > 0 THEN
    v_warnings := v_warnings || to_jsonb(format('%s linha(s) em aberto de «%s» noutra unidade não entraram nesta leitura', v_other, v_product.name));
  END IF;

  v_result := jsonb_build_object(
    'request_id',           p_request_id,
    'replayed',             false,
    'dry_run',              v_dry,
    'product_id',           p_product_id,
    'warehouse_id',         p_warehouse_id,
    'supplier_id',          p_supplier_id,
    'uom_id',               p_uom_id,
    'uom_code',             v_uom_code,
    'units_per_uom',        v_factor,
    'quantity',             p_quantity,
    'units',                v_units,
    'matched_by',           v_matched_by,
    'allocations',          v_allocs,
    'units_to_order_total', v_to_order,
    'units_to_stock_total', v_to_stock,
    'warnings',             v_warnings
  ) || CASE WHEN p_delivery_note_id IS NOT NULL  -- NOVO (guia): '{}' sem guia
            THEN jsonb_build_object('delivery_note_id', p_delivery_note_id,
                                    'delivery_note_number', v_note_number,
                                    'delivery_note_checks', v_checks)
            ELSE '{}'::jsonb END
    || CASE WHEN v_conv THEN jsonb_build_object('unit_conversion', true) ELSE '{}'::jsonb END;  -- NOVO (códigos)

  IF NOT v_dry THEN
    UPDATE public.receiving_scans SET result = v_result WHERE id = p_request_id;
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean, uuid, boolean) TO service_role;

-- ============================================================
-- 5. rpc_delivery_note_save — receiving.manage_delivery_notes em vez de purchase_orders.receive
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_delivery_note_save(p_delivery_note_id uuid, p_supplier_id uuid, p_note_number text, p_document_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text, p_purchase_order_ids uuid[] DEFAULT NULL::uuid[], p_lines jsonb DEFAULT NULL::jsonb, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor      uuid;
  v_org        uuid;
  v_number     text := btrim(COALESCE(p_note_number, ''));
  v_notes      text := nullif(btrim(COALESCE(p_notes, '')), '');
  v_cur        public.supplier_delivery_notes%ROWTYPE;
  v_exists     boolean;
  v_cur_pos    uuid[];
  v_new_pos    uuid[];
  v_final_pos  uuid[];
  v_po         record;
  v_el         jsonb;
  v_ord        bigint;
  v_prod       record;
  v_poi        record;
  v_uom        uuid;
  v_factor     integer;
  v_qty        numeric;
  v_poi_id     uuid;
  v_desc       text;
  v_lines      jsonb := '[]'::jsonb;
  v_cur_lines  jsonb;
  v_dup        uuid;
  v_removed    text;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_delivery_note_id IS NULL THEN
    RAISE EXCEPTION 'Identificador da guia em falta' USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.suppliers
  WHERE id = p_supplier_id AND deleted_at IS NULL;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'receiving.manage_delivery_notes') THEN  -- NOVO (20261210130000)
    RAISE EXCEPTION 'Sem permissão para registar guias desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_number = '' THEN
    RAISE EXCEPTION 'Indica o número da guia' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_number) > 100 THEN
    RAISE EXCEPTION 'Número da guia demasiado longo' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'Notas da guia demasiado longas' USING ERRCODE = 'check_violation';
  END IF;

  -- Guia existente: trancada até ao fim (espera pelas leituras em curso).
  SELECT * INTO v_cur FROM public.supplier_delivery_notes WHERE id = p_delivery_note_id FOR UPDATE;
  v_exists := FOUND;

  IF v_exists THEN
    IF v_cur.organization_id IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'Esta guia pertence a outra organização' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_cur.supplier_id IS DISTINCT FROM p_supplier_id THEN
      RAISE EXCEPTION 'A guia % é de outro fornecedor (o fornecedor de uma guia não muda)', v_cur.note_number
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(array_agg(purchase_order_id ORDER BY purchase_order_id), ARRAY[]::uuid[]) INTO v_cur_pos
    FROM public.supplier_delivery_note_orders WHERE delivery_note_id = p_delivery_note_id;
  ELSE
    v_cur_pos := ARRAY[]::uuid[];
  END IF;

  -- POs pedidas: mesma organização e fornecedor; as que entram de novo não
  -- podem estar apagadas nem canceladas.
  IF p_purchase_order_ids IS NOT NULL THEN
    IF cardinality(p_purchase_order_ids) > 100 THEN
      RAISE EXCEPTION 'Demasiadas encomendas numa guia (máximo 100)' USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), ARRAY[]::uuid[]) INTO v_new_pos
    FROM unnest(p_purchase_order_ids) x WHERE x IS NOT NULL;

    FOR v_po IN
      SELECT x AS id, po.organization_id, po.supplier_id, po.order_number, po.status, po.deleted_at
      FROM unnest(v_new_pos) x
      LEFT JOIN public.purchase_orders po ON po.id = x
    LOOP
      IF v_po.organization_id IS DISTINCT FROM v_org THEN
        RAISE EXCEPTION 'Encomenda a fornecedor não encontrada nesta organização' USING ERRCODE = 'no_data_found';
      END IF;
      IF v_po.supplier_id IS DISTINCT FROM p_supplier_id THEN
        RAISE EXCEPTION '% é de outro fornecedor', v_po.order_number USING ERRCODE = 'check_violation';
      END IF;
      IF NOT (v_po.id = ANY (v_cur_pos)) AND (v_po.deleted_at IS NOT NULL OR v_po.status = 'cancelled') THEN
        RAISE EXCEPTION '% está apagada ou cancelada', v_po.order_number USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
    v_final_pos := v_new_pos;
  ELSE
    v_final_pos := v_cur_pos;
  END IF;

  -- Linhas anunciadas: normalizadas para comparar e gravar.
  IF p_lines IS NOT NULL THEN
    IF jsonb_typeof(p_lines) <> 'array' THEN
      RAISE EXCEPTION 'As linhas da guia têm de ser uma lista' USING ERRCODE = 'check_violation';
    END IF;
    IF jsonb_array_length(p_lines) > 500 THEN
      RAISE EXCEPTION 'Demasiadas linhas numa guia (máximo 500)' USING ERRCODE = 'check_violation';
    END IF;

    FOR v_el, v_ord IN SELECT e, o FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(e, o) LOOP
      IF jsonb_typeof(v_el) <> 'object' THEN
        RAISE EXCEPTION 'Linha % da guia inválida', v_ord USING ERRCODE = 'check_violation';
      END IF;
      BEGIN
        v_qty    := (v_el ->> 'quantity')::numeric;
        v_uom    := nullif(v_el ->> 'uom_id', '')::uuid;
        v_poi_id := nullif(v_el ->> 'purchase_order_item_id', '')::uuid;
        SELECT id, name, uom_id INTO v_prod
        FROM public.products
        WHERE id = nullif(v_el ->> 'product_id', '')::uuid
          AND organization_id = v_org AND deleted_at IS NULL AND NOT is_deleted;
      EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value THEN
        RAISE EXCEPTION 'Linha % da guia com dados inválidos', v_ord USING ERRCODE = 'check_violation';
      END;
      IF v_prod.id IS NULL THEN
        RAISE EXCEPTION 'Linha % da guia: produto inválido para esta organização', v_ord USING ERRCODE = 'check_violation';
      END IF;
      IF v_qty IS NULL OR v_qty <= 0 OR v_qty > 1000000000 THEN
        RAISE EXCEPTION 'Linha % da guia: a quantidade tem de ser positiva', v_ord USING ERRCODE = 'check_violation';
      END IF;
      v_desc := nullif(btrim(COALESCE(v_el ->> 'description', '')), '');
      IF char_length(v_desc) > 500 THEN
        RAISE EXCEPTION 'Linha % da guia: descrição demasiado longa', v_ord USING ERRCODE = 'check_violation';
      END IF;

      -- Unidade da linha: a do produto se não indicada ou igual.
      IF v_uom IS NOT DISTINCT FROM v_prod.uom_id THEN
        v_uom := NULL;
      END IF;
      v_factor := public.fn_uom_units_per(v_uom, v_prod.id);

      IF v_poi_id IS NOT NULL THEN
        SELECT poi.id, poi.product_id, poi.item_type, COALESCE(poi.units_per_uom, 1) AS units_per_uom,
               poi.description, po.id AS po_id, po.supplier_id, po.order_number, po.organization_id
        INTO v_poi
        FROM public.purchase_order_items poi
        JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
        WHERE poi.id = v_poi_id AND po.deleted_at IS NULL;
        IF NOT FOUND OR v_poi.organization_id IS DISTINCT FROM v_org THEN
          RAISE EXCEPTION 'Linha % da guia: linha de encomenda não encontrada', v_ord USING ERRCODE = 'no_data_found';
        END IF;
        IF v_poi.supplier_id IS DISTINCT FROM p_supplier_id THEN
          RAISE EXCEPTION 'Linha % da guia: a linha "%" (%) é de outro fornecedor', v_ord, v_poi.description, v_poi.order_number
            USING ERRCODE = 'check_violation';
        END IF;
        IF v_poi.item_type <> 'product' OR v_poi.product_id IS DISTINCT FROM v_prod.id THEN
          RAISE EXCEPTION 'Linha % da guia: a linha "%" (%) não é deste produto', v_ord, v_poi.description, v_poi.order_number
            USING ERRCODE = 'check_violation';
        END IF;
        -- NOVO (códigos, decisão 7): a linha da guia pode estar noutra unidade
        -- da mesma base que a linha da PO (os dois fatores são sobre a unidade
        -- de stock do produto; fn_uom_units_per já recusou unidades de outra base).
        IF cardinality(v_final_pos) > 0 AND NOT (v_poi.po_id = ANY (v_final_pos)) THEN
          RAISE EXCEPTION 'Linha % da guia: % não está nas encomendas da guia', v_ord, v_poi.order_number
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;

      v_lines := v_lines || jsonb_build_object(
        'position', v_ord::integer, 'product_id', v_prod.id, 'uom_id', v_uom, 'units_per_uom', v_factor,
        'quantity', v_qty, 'purchase_order_item_id', v_poi_id, 'description', v_desc);
    END LOOP;
  END IF;

  IF v_exists THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'position', l.position, 'product_id', l.product_id, 'uom_id', l.uom_id, 'units_per_uom', l.units_per_uom,
             'quantity', l.quantity, 'purchase_order_item_id', l.purchase_order_item_id, 'description', l.description)
             ORDER BY l.position, l.id), '[]'::jsonb)
    INTO v_cur_lines
    FROM public.supplier_delivery_note_lines l WHERE l.delivery_note_id = p_delivery_note_id;

    -- Pedido igual ao gravado (repetição da criação ou edição sem mudanças).
    IF v_cur.note_number = v_number
       AND v_cur.document_date IS NOT DISTINCT FROM p_document_date
       AND v_cur.notes IS NOT DISTINCT FROM v_notes
       AND v_final_pos = v_cur_pos
       AND (p_lines IS NULL OR v_lines = v_cur_lines) THEN
      RETURN public.rpc_delivery_note_get(p_delivery_note_id) || jsonb_build_object('saved', false);
    END IF;

    IF p_expected_updated_at IS NULL OR p_expected_updated_at IS DISTINCT FROM v_cur.updated_at THEN
      RAISE EXCEPTION 'A guia % foi alterada entretanto — abre-a de novo antes de editar', v_cur.note_number
        USING ERRCODE = 'serialization_failure';
    END IF;
    IF v_cur.status <> 'open' THEN
      RAISE EXCEPTION 'A guia % está %; só uma guia aberta pode ser editada', v_cur.note_number,
        CASE v_cur.status WHEN 'closed' THEN 'fechada' ELSE 'cancelada' END
        USING ERRCODE = 'check_violation';
    END IF;

    -- Não retirar POs que já têm receções ativas por esta guia.
    SELECT string_agg(DISTINCT po.order_number, ', ') INTO v_removed
    FROM public.purchase_order_receipts pr
    JOIN public.purchase_orders po ON po.id = pr.purchase_order_id
    WHERE pr.delivery_note_id = p_delivery_note_id
      AND pr.kind = 'receipt' AND pr.reverted_at IS NULL
      AND pr.purchase_order_id = ANY (v_cur_pos)
      AND NOT (pr.purchase_order_id = ANY (v_final_pos));
    IF v_removed IS NOT NULL THEN
      RAISE EXCEPTION 'Não podes retirar % da guia: já tem receções por esta guia', v_removed
        USING ERRCODE = 'check_violation';
    END IF;
    -- Guia que passa a ter POs: as receções ativas têm de caber nelas.
    IF cardinality(v_final_pos) > 0 THEN
      SELECT string_agg(DISTINCT po.order_number, ', ') INTO v_removed
      FROM public.purchase_order_receipts pr
      JOIN public.purchase_orders po ON po.id = pr.purchase_order_id
      WHERE pr.delivery_note_id = p_delivery_note_id
        AND pr.kind = 'receipt' AND pr.reverted_at IS NULL
        AND NOT (pr.purchase_order_id = ANY (v_final_pos));
      IF v_removed IS NOT NULL THEN
        RAISE EXCEPTION 'A guia já tem receções em % — essas encomendas têm de ficar na guia', v_removed
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  -- Nº repetido no mesmo fornecedor (guias não canceladas).
  SELECT id INTO v_dup
  FROM public.supplier_delivery_notes
  WHERE organization_id = v_org AND supplier_id = p_supplier_id
    AND lower(btrim(note_number)) = lower(v_number)
    AND status <> 'cancelled' AND id <> p_delivery_note_id
  LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe a guia % deste fornecedor', v_number
      USING ERRCODE = 'unique_violation', DETAIL = v_dup::text,
            HINT = 'Abre a guia existente (id em DETAIL).';
  END IF;

  BEGIN
    IF v_exists THEN
      UPDATE public.supplier_delivery_notes
      SET note_number   = v_number,
          document_date = p_document_date,
          notes         = v_notes,
          updated_at    = clock_timestamp()
      WHERE id = p_delivery_note_id;
    ELSE
      INSERT INTO public.supplier_delivery_notes (
        id, organization_id, supplier_id, note_number, document_date, notes, created_by, created_at, updated_at
      ) VALUES (
        p_delivery_note_id, v_org, p_supplier_id, v_number, p_document_date, v_notes, v_actor, now(), clock_timestamp()
      )
      ON CONFLICT (id) DO NOTHING;
      IF NOT FOUND THEN
        -- Mesmo id criado em paralelo: o cliente repete e cai na comparação.
        RAISE EXCEPTION 'Guia em conflito — tenta de novo' USING ERRCODE = 'serialization_failure';
      END IF;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_dup
    FROM public.supplier_delivery_notes
    WHERE organization_id = v_org AND supplier_id = p_supplier_id
      AND lower(btrim(note_number)) = lower(v_number)
      AND status <> 'cancelled' AND id <> p_delivery_note_id
    LIMIT 1;
    RAISE EXCEPTION 'Já existe a guia % deste fornecedor', v_number
      USING ERRCODE = 'unique_violation', DETAIL = COALESCE(v_dup::text, ''),
            HINT = 'Abre a guia existente (id em DETAIL).';
  END;

  IF v_final_pos IS DISTINCT FROM v_cur_pos THEN
    DELETE FROM public.supplier_delivery_note_orders
    WHERE delivery_note_id = p_delivery_note_id AND NOT (purchase_order_id = ANY (v_final_pos));
    INSERT INTO public.supplier_delivery_note_orders (delivery_note_id, purchase_order_id, organization_id, created_by)
    SELECT p_delivery_note_id, x, v_org, v_actor
    FROM unnest(v_final_pos) x
    WHERE NOT (x = ANY (v_cur_pos));
  END IF;

  IF p_lines IS NOT NULL AND (NOT v_exists OR v_lines IS DISTINCT FROM v_cur_lines) THEN
    DELETE FROM public.supplier_delivery_note_lines WHERE delivery_note_id = p_delivery_note_id;
    INSERT INTO public.supplier_delivery_note_lines (
      delivery_note_id, organization_id, position, product_id, uom_id, units_per_uom, quantity,
      purchase_order_item_id, description, created_by
    )
    SELECT p_delivery_note_id, v_org, l.position, l.product_id, l.uom_id, l.units_per_uom, l.quantity,
           l.purchase_order_item_id, l.description, v_actor
    FROM jsonb_to_recordset(v_lines) AS l(position integer, product_id uuid, uom_id uuid, units_per_uom integer,
                                          quantity numeric, purchase_order_item_id uuid, description text);
  END IF;

  RETURN public.rpc_delivery_note_get(p_delivery_note_id) || jsonb_build_object('saved', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_delivery_note_save(uuid, uuid, text, date, text, uuid[], jsonb, timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_delivery_note_save(uuid, uuid, text, date, text, uuid[], jsonb, timestamp with time zone) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_delivery_note_save(uuid, uuid, text, date, text, uuid[], jsonb, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delivery_note_save(uuid, uuid, text, date, text, uuid[], jsonb, timestamp with time zone) TO service_role;

-- ============================================================
-- 6. rpc_delivery_note_close — idem
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_delivery_note_close(p_delivery_note_id uuid, p_notes text DEFAULT NULL::text, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor   uuid;
  v_note    public.supplier_delivery_notes%ROWTYPE;
  v_notes   text := nullif(btrim(COALESCE(p_notes, '')), '');
  v_summary jsonb;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_note FROM public.supplier_delivery_notes WHERE id = p_delivery_note_id FOR UPDATE;
  IF NOT FOUND
     OR v_note.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Guia do fornecedor não encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.has_anew_permission(auth.uid(), 'receiving.manage_delivery_notes') THEN  -- NOVO (20261210130000)
    RAISE EXCEPTION 'Sem permissão para fechar guias desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_note.status = 'closed' THEN
    RETURN public.rpc_delivery_note_get(p_delivery_note_id) || jsonb_build_object('changed', false);
  END IF;
  IF v_note.status = 'cancelled' THEN
    RAISE EXCEPTION 'A guia % está cancelada', v_note.note_number USING ERRCODE = 'check_violation';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND p_expected_updated_at IS DISTINCT FROM v_note.updated_at THEN
    RAISE EXCEPTION 'A guia % foi alterada entretanto — abre-a de novo antes de fechar', v_note.note_number
      USING ERRCODE = 'serialization_failure';
  END IF;
  IF char_length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'Nota de fecho demasiado longa' USING ERRCODE = 'check_violation';
  END IF;

  v_summary := public.fn_delivery_note_summary(p_delivery_note_id);
  IF (v_summary ->> 'has_divergences')::boolean AND v_notes IS NULL THEN
    RAISE EXCEPTION 'A guia % tem divergências (% produto(s)) — indica uma nota para fechar',
      v_note.note_number, v_summary -> 'totals' ->> 'divergences'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.supplier_delivery_notes
  SET status        = 'closed',
      closed_at     = now(),
      closed_by     = v_actor,
      close_notes   = v_notes,
      close_summary = v_summary,
      history       = history || jsonb_build_array(jsonb_build_object(
                        'action', 'close', 'at', now(), 'by', v_actor, 'notes', v_notes,
                        'divergences', v_summary -> 'totals' -> 'divergences')),
      updated_at    = clock_timestamp()
  WHERE id = p_delivery_note_id;

  RETURN public.rpc_delivery_note_get(p_delivery_note_id) || jsonb_build_object('changed', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_delivery_note_close(uuid, text, timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_delivery_note_close(uuid, text, timestamp with time zone) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_delivery_note_close(uuid, text, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delivery_note_close(uuid, text, timestamp with time zone) TO service_role;

-- ============================================================
-- 7. rpc_delivery_note_reopen — idem
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_delivery_note_reopen(p_delivery_note_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_note   public.supplier_delivery_notes%ROWTYPE;
  v_reason text := nullif(btrim(COALESCE(p_reason, '')), '');
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_note FROM public.supplier_delivery_notes WHERE id = p_delivery_note_id FOR UPDATE;
  IF NOT FOUND
     OR v_note.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Guia do fornecedor não encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.has_anew_permission(auth.uid(), 'receiving.manage_delivery_notes') THEN  -- NOVO (20261210130000)
    RAISE EXCEPTION 'Sem permissão para reabrir guias desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_note.status = 'open' THEN
    RETURN public.rpc_delivery_note_get(p_delivery_note_id) || jsonb_build_object('changed', false);
  END IF;
  IF v_note.status = 'cancelled' THEN
    RAISE EXCEPTION 'A guia % está cancelada', v_note.note_number USING ERRCODE = 'check_violation';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Indica o motivo para reabrir a guia' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'Motivo demasiado longo' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.supplier_delivery_notes
  SET status        = 'open',
      history       = history || jsonb_build_array(jsonb_build_object(
                        'action', 'reopen', 'at', now(), 'by', v_actor, 'reason', v_reason,
                        'previous_close', jsonb_build_object(
                          'closed_at', closed_at, 'closed_by', closed_by,
                          'close_notes', close_notes, 'close_summary', close_summary))),
      closed_at     = NULL,
      closed_by     = NULL,
      close_notes   = NULL,
      close_summary = NULL,
      updated_at    = clock_timestamp()
  WHERE id = p_delivery_note_id;

  RETURN public.rpc_delivery_note_get(p_delivery_note_id) || jsonb_build_object('changed', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_delivery_note_reopen(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_delivery_note_reopen(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_delivery_note_reopen(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delivery_note_reopen(uuid, text) TO service_role;

-- ============================================================
-- 8. rpc_delivery_note_cancel — idem
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_delivery_note_cancel(p_delivery_note_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_note   public.supplier_delivery_notes%ROWTYPE;
  v_reason text := nullif(btrim(COALESCE(p_reason, '')), '');
  v_active integer;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_note FROM public.supplier_delivery_notes WHERE id = p_delivery_note_id FOR UPDATE;
  IF NOT FOUND
     OR v_note.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Guia do fornecedor não encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.has_anew_permission(auth.uid(), 'receiving.manage_delivery_notes') THEN  -- NOVO (20261210130000)
    RAISE EXCEPTION 'Sem permissão para cancelar guias desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_note.status = 'cancelled' THEN
    RETURN public.rpc_delivery_note_get(p_delivery_note_id) || jsonb_build_object('changed', false);
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Indica o motivo para cancelar a guia' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'Motivo demasiado longo' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_active
  FROM public.purchase_order_receipts
  WHERE delivery_note_id = p_delivery_note_id AND kind = 'receipt' AND reverted_at IS NULL;
  IF v_active > 0 THEN
    RAISE EXCEPTION 'A guia % tem % receção(ões) ativa(s) — reverte-as primeiro na encomenda', v_note.note_number, v_active
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.supplier_delivery_notes
  SET status        = 'cancelled',
      cancelled_at  = now(),
      cancelled_by  = v_actor,
      cancel_reason = v_reason,
      history       = history || jsonb_build_array(jsonb_build_object(
                        'action', 'cancel', 'at', now(), 'by', v_actor, 'reason', v_reason, 'previous_status', status)),
      updated_at    = clock_timestamp()
  WHERE id = p_delivery_note_id;

  RETURN public.rpc_delivery_note_get(p_delivery_note_id) || jsonb_build_object('changed', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_delivery_note_cancel(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_delivery_note_cancel(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_delivery_note_cancel(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delivery_note_cancel(uuid, text) TO service_role;

-- ============================================================
-- 9. rpc_product_code_learn — products.edit OU receiving.learn_codes
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_product_code_learn(p_id uuid, p_warehouse_id uuid, p_code text, p_kind text, p_product_id uuid, p_uom_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_set_product_uom boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_actor     uuid;
  v_org       uuid;
  v_code      text := btrim(COALESCE(p_code, ''));
  v_kind      text := lower(btrim(COALESCE(p_kind, '')));
  v_key       text;
  v_source    text;
  v_can_edit  boolean;
  v_can_wh    boolean;
  v_prod      record;
  v_uom       uuid;
  v_req_uom   uuid;
  v_factor    integer;
  v_un        uuid;
  v_conf      text;
  v_row       public.product_codes%ROWTYPE;
  v_other     record;
  v_already   text;
  v_existing  uuid;
  v_annulled  jsonb := '[]'::jsonb;
  v_warnings  jsonb := '[]'::jsonb;
  v_uom_set   boolean := false;
  v_prev_src  text;
  v_cn        text;
  v_txt       text;
  v_main_set  boolean := false;  -- products.barcode gravado nesta chamada
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Identificador da associação em falta' USING ERRCODE = 'check_violation';
  END IF;
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'Indica o produto' USING ERRCODE = 'check_violation';
  END IF;

  IF p_warehouse_id IS NOT NULL THEN
    SELECT organization_id INTO v_org FROM public.warehouses WHERE id = p_warehouse_id AND deleted_at IS NULL;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
    END IF;
    v_source := 'receiving';
  ELSE
    SELECT organization_id INTO v_org FROM public.products WHERE id = p_product_id;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'no_data_found';
    END IF;
    v_source := 'product_form';
  END IF;

  v_can_edit := public.has_anew_permission(v_uid, 'products.edit');
  v_can_wh   := public.has_anew_permission(v_uid, 'receiving.learn_codes');  -- NOVO (20261210130000)
  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(v_uid)) OR NOT (v_can_edit OR v_can_wh) THEN
    RAISE EXCEPTION 'Sem permissão para associar códigos a produtos desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Produto (trancado se a unidade do produto pode mudar ou, num código de
  -- barras, se o código principal pode ser preenchido — mesma ordem que a
  -- edição do produto: linha do produto antes do advisory da chave).
  IF COALESCE(p_set_product_uom, false) OR v_kind = 'barcode' THEN
    SELECT id, name, sku, barcode, uom_id, organization_id, deleted_at, is_deleted INTO v_prod
    FROM public.products WHERE id = p_product_id FOR NO KEY UPDATE;
  ELSE
    SELECT id, name, sku, barcode, uom_id, organization_id, deleted_at, is_deleted INTO v_prod
    FROM public.products WHERE id = p_product_id;
  END IF;
  IF v_prod.id IS NULL OR v_prod.organization_id IS DISTINCT FROM v_org
     OR v_prod.deleted_at IS NOT NULL OR v_prod.is_deleted THEN
    RAISE EXCEPTION 'Produto inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  -- Pedido já processado → devolve o gravado (tem de ser igual).
  SELECT * INTO v_row FROM public.product_codes WHERE id = p_id;
  IF FOUND THEN
    v_req_uom := CASE WHEN p_uom_id IS NOT DISTINCT FROM v_prod.uom_id THEN NULL ELSE p_uom_id END;
    IF v_row.organization_id IS DISTINCT FROM v_org OR v_row.created_by IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'Esta associação pertence a outro utilizador ou organização' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_row.product_id IS DISTINCT FROM p_product_id OR v_row.kind IS DISTINCT FROM v_kind
       OR v_row.code_key IS DISTINCT FROM public.fn_product_code_key(v_code)
       OR v_row.supplier_id IS DISTINCT FROM p_supplier_id OR v_row.uom_id IS DISTINCT FROM v_req_uom THEN
      RAISE EXCEPTION 'O identificador da associação já foi usado noutra associação (outro código, produto, unidade ou fornecedor)'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN public.fn_product_code_json(p_id)
      || jsonb_build_object('replayed', true, 'learned', v_row.deleted_at IS NULL, 'already', NULL,
                            'product_uom_set', COALESCE((v_row.context ->> 'product_uom_set')::boolean, false),
                            'annulled', COALESCE(v_row.context -> 'annulled', '[]'::jsonb), 'warnings', '[]'::jsonb,
                            'main_barcode_set', false);
  END IF;

  IF v_code = '' THEN
    RAISE EXCEPTION 'Indica o código lido' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_code) > 200 THEN
    RAISE EXCEPTION 'Código demasiado longo' USING ERRCODE = 'check_violation';
  END IF;
  IF v_kind NOT IN ('barcode', 'supplier_ref') THEN
    RAISE EXCEPTION 'Tipo de código inválido (barcode ou supplier_ref)' USING ERRCODE = 'check_violation';
  END IF;
  v_key := public.fn_product_code_key(v_code);

  IF v_kind = 'supplier_ref' AND p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Indica o fornecedor da referência' USING ERRCODE = 'check_violation';
  END IF;
  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers WHERE id = p_supplier_id AND organization_id = v_org AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Fornecedor inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  v_prev_src := current_setting('app.audit_source', true);
  IF v_source = 'receiving' THEN
    PERFORM set_config('app.audit_source', 'receiving', true);
  END IF;

  -- Produto sem unidade: definir 'un' (opcional, sem conflitos).
  IF v_prod.uom_id IS NULL AND COALESCE(p_set_product_uom, false) THEN
    IF NOT v_can_edit THEN
      RAISE EXCEPTION 'Definir a unidade do produto exige permissão para editar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT id INTO v_un FROM public.uom
    WHERE organization_id IS NULL AND base_uom_id IS NULL AND lower(btrim(code)) = 'un'
    ORDER BY id LIMIT 1;
    IF v_un IS NULL THEN
      RAISE EXCEPTION 'Unidade "un" não encontrada' USING ERRCODE = 'no_data_found';
    END IF;
    SELECT string_agg(format('%s %s', z.n, z.t), ', ' ORDER BY z.t) INTO v_conf
    FROM (
      SELECT 'linha(s) de encomenda a fornecedor' AS t, count(*) AS n FROM public.purchase_order_items WHERE product_id = p_product_id AND uom_id IS NOT NULL AND uom_id <> v_un
      UNION ALL SELECT 'linha(s) de orçamento', count(*) FROM public.quote_lines WHERE product_id = p_product_id AND uom_id IS NOT NULL AND uom_id <> v_un
      UNION ALL SELECT 'linha(s) de venda direta', count(*) FROM public.direct_sale_lines WHERE product_id = p_product_id AND uom_id IS NOT NULL AND uom_id <> v_un
      UNION ALL SELECT 'ligação(ões) a fornecedores', count(*) FROM public.item_suppliers WHERE product_id = p_product_id AND deleted_at IS NULL AND uom_id IS NOT NULL AND uom_id <> v_un
      UNION ALL SELECT 'material(is) de serviços', count(*) FROM public.service_materials WHERE product_id = p_product_id AND uom_id IS NOT NULL AND uom_id <> v_un
      UNION ALL SELECT 'linha(s) de guias', count(*) FROM public.supplier_delivery_note_lines WHERE product_id = p_product_id AND uom_id IS NOT NULL AND uom_id <> v_un
      UNION ALL SELECT 'código(s) aprendido(s)', count(*) FROM public.product_codes WHERE product_id = p_product_id AND deleted_at IS NULL AND uom_id IS NOT NULL AND uom_id <> v_un
    ) z
    WHERE z.n > 0;
    IF v_conf IS NOT NULL THEN
      RAISE EXCEPTION 'Não é possível definir a unidade "un" em «%»: já há % noutra unidade', v_prod.name, v_conf
        USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.products SET uom_id = v_un WHERE id = p_product_id;
    v_prod.uom_id := v_un;
    v_uom_set := true;
  END IF;

  -- Unidade do código: NULL = a do produto.
  v_uom := CASE WHEN p_uom_id IS NOT DISTINCT FROM v_prod.uom_id THEN NULL ELSE p_uom_id END;
  IF v_uom IS NOT NULL AND v_prod.uom_id IS NULL
     AND EXISTS (SELECT 1 FROM public.uom WHERE id = v_uom AND base_uom_id IS NULL) THEN
    RAISE EXCEPTION 'O produto «%» não tem unidade definida — associa o código sem unidade ou define a unidade do produto', v_prod.name
      USING ERRCODE = 'check_violation';
  END IF;
  v_factor := public.fn_uom_units_per(v_uom, p_product_id);  -- erro claro se incompatível

  -- Conflitos (com o lock da chave detido).
  IF v_kind = 'barcode' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('product_code:' || v_org::text || ':' || v_key, 0));

    IF public.fn_product_code_key(v_prod.barcode) = v_key THEN
      IF v_uom IS NOT NULL THEN
        RAISE EXCEPTION 'O código «%» já é o código de barras principal de «%» (na unidade do produto)', v_code, v_prod.name
          USING ERRCODE = 'unique_violation', DETAIL = p_product_id::text;
      END IF;
      v_already := 'product_barcode';
    END IF;

    SELECT p.id, p.name, p.sku INTO v_other
    FROM public.products p
    WHERE p.organization_id = v_org AND p.id <> p_product_id
      AND p.deleted_at IS NULL AND NOT p.is_deleted
      AND public.fn_product_code_key(p.barcode) = v_key
    ORDER BY p.id LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'O código «%» já é o código de barras do produto «%» (%)', v_code, v_other.name, v_other.sku
        USING ERRCODE = 'unique_violation', DETAIL = v_other.id::text;
    END IF;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended('product_code:' || v_org::text || ':' || p_supplier_id::text || ':' || v_key, 0));

    -- Referência na ficha do produto (item_suppliers) do mesmo fornecedor.
    FOR v_other IN
      SELECT i.product_id, p.name, p.sku,
             CASE WHEN i.uom_id IS NOT DISTINCT FROM p.uom_id THEN NULL ELSE i.uom_id END AS uom_id
      FROM public.item_suppliers i
      JOIN public.products p ON p.id = i.product_id
      WHERE i.organization_id = v_org AND i.supplier_id = p_supplier_id AND i.deleted_at IS NULL
        AND i.product_id IS NOT NULL AND p.deleted_at IS NULL AND NOT p.is_deleted
        AND public.fn_product_code_key(i.supplier_sku) = v_key
      ORDER BY (i.product_id = p_product_id) DESC, i.id
    LOOP
      IF v_other.product_id <> p_product_id THEN
        RAISE EXCEPTION 'A referência «%» deste fornecedor já está na ficha do produto «%» (%)', v_code, v_other.name, v_other.sku
          USING ERRCODE = 'unique_violation', DETAIL = v_other.product_id::text;
      ELSIF v_other.uom_id IS DISTINCT FROM v_uom THEN
        RAISE EXCEPTION 'A referência «%» deste fornecedor já está na ficha de «%» noutra unidade', v_code, v_prod.name
          USING ERRCODE = 'unique_violation', DETAIL = p_product_id::text;
      ELSE
        v_already := 'item_supplier';
      END IF;
    END LOOP;
  END IF;

  -- Códigos aprendidos ativos com a mesma chave (no máximo um: índices únicos).
  FOR v_other IN
    SELECT pc.id, pc.product_id, pc.uom_id, p.name, p.sku,
           (p.deleted_at IS NULL AND NOT p.is_deleted) AS active
    FROM public.product_codes pc
    JOIN public.products p ON p.id = pc.product_id
    WHERE pc.organization_id = v_org AND pc.kind = v_kind AND pc.deleted_at IS NULL AND pc.code_key = v_key
      AND (v_kind = 'barcode' OR pc.supplier_id = p_supplier_id)
    FOR UPDATE OF pc
  LOOP
    IF v_other.product_id = p_product_id THEN
      IF v_other.uom_id IS DISTINCT FROM v_uom THEN
        RAISE EXCEPTION 'O código «%» já está associado a «%» noutra unidade', v_code, v_prod.name
          USING ERRCODE = 'unique_violation', DETAIL = p_product_id::text;
      END IF;
      v_already := 'product_code';
      v_existing := v_other.id;
    ELSIF v_other.active THEN
      RAISE EXCEPTION 'O código «%» já está associado ao produto «%» (%)', v_code, v_other.name, v_other.sku
        USING ERRCODE = 'unique_violation', DETAIL = v_other.product_id::text;
    ELSE
      -- Produto apagado não bloqueia: o código antigo é anulado.
      UPDATE public.product_codes
      SET deleted_at = now(), deleted_by = v_actor,
          delete_reason = left(format('Produto «%s» apagado — código associado a «%s»', v_other.name, v_prod.name), 1000)
      WHERE id = v_other.id;
      v_annulled := v_annulled || to_jsonb(v_other.id);
    END IF;
  END LOOP;

  -- Avisos: o código também é o SKU de outro produto (a leitura passa a
  -- encontrar este primeiro — nível 1/2 antes do SKU).
  SELECT string_agg(DISTINCT format('«%s» (%s)', p.name, p.sku), ', ') INTO v_txt
  FROM public.products p
  WHERE p.organization_id = v_org AND p.id <> p_product_id AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND lower(btrim(p.sku)) = lower(v_code);
  IF v_txt IS NOT NULL THEN
    v_warnings := v_warnings || to_jsonb(format('O código «%s» também é o SKU de %s — a leitura passa a encontrar «%s» primeiro', v_code, v_txt, v_prod.name));
  END IF;

  IF v_already IS NOT NULL THEN
    PERFORM set_config('app.audit_source', COALESCE(v_prev_src, ''), true);
    RETURN COALESCE(public.fn_product_code_json(v_existing),
                    jsonb_build_object('id', NULL, 'code', v_code, 'code_key', v_key, 'kind', v_kind,
                                       'product_id', p_product_id, 'product_name', v_prod.name, 'sku', v_prod.sku,
                                       'uom_id', COALESCE(v_uom, v_prod.uom_id),
                                       'uom_code', (SELECT code FROM public.uom WHERE id = COALESCE(v_uom, v_prod.uom_id)),
                                       'is_pack', v_uom IS NOT NULL, 'units_per_uom', v_factor,
                                       'supplier_id', p_supplier_id))
      || jsonb_build_object('replayed', false, 'learned', false, 'already', v_already,
                            'product_uom_set', v_uom_set, 'annulled', v_annulled, 'warnings', v_warnings,
                            'main_barcode_set', false);
  END IF;

  BEGIN
    INSERT INTO public.product_codes (
      id, organization_id, code, kind, product_id, uom_id, supplier_id, source, context, created_by
    ) VALUES (
      p_id, v_org, v_code, v_kind, p_product_id, v_uom, p_supplier_id, v_source,
      jsonb_strip_nulls(jsonb_build_object(
        'warehouse_id', p_warehouse_id,
        'product_uom_set', CASE WHEN v_uom_set THEN true END,
        'annulled', CASE WHEN jsonb_array_length(v_annulled) > 0 THEN v_annulled END)),
      v_actor
    )
    ON CONFLICT (id) DO NOTHING;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Associação em conflito — tenta de novo' USING ERRCODE = 'serialization_failure';
    END IF;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_cn = CONSTRAINT_NAME;
    IF COALESCE(v_cn, '') = '' THEN
      RAISE;  -- mensagem do gatilho (já com o nome do produto)
    END IF;
    RAISE EXCEPTION 'O código «%» acabou de ser associado a outro produto — lê de novo', v_code
      USING ERRCODE = 'unique_violation';
  END;

  -- Código de barras da unidade do produto num produto sem código principal:
  -- passa também a ser o products.barcode (a linha em product_codes fica).
  -- Códigos de embalagem (v_uom não nulo) nunca: o principal é o da unidade.
  -- Depois do INSERT, com o advisory da chave e a linha do produto detidos;
  -- auditado (fn_generic_entity_audit) com a mesma origem do código.
  IF v_kind = 'barcode' AND v_uom IS NULL AND public.fn_product_code_key(v_prod.barcode) IS NULL THEN
    UPDATE public.products SET barcode = v_code
    WHERE id = p_product_id AND public.fn_product_code_key(barcode) IS NULL;
    v_main_set := FOUND;
  END IF;

  PERFORM set_config('app.audit_source', COALESCE(v_prev_src, ''), true);

  RETURN public.fn_product_code_json(p_id)
    || jsonb_build_object('replayed', false, 'learned', true, 'already', NULL,
                          'product_uom_set', v_uom_set, 'annulled', v_annulled, 'warnings', v_warnings,
                          'main_barcode_set', v_main_set);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_product_code_learn(uuid, uuid, text, text, uuid, uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_product_code_learn(uuid, uuid, text, text, uuid, uuid, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_product_code_learn(uuid, uuid, text, text, uuid, uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_product_code_learn(uuid, uuid, text, text, uuid, uuid, uuid, boolean) TO service_role;

-- ============================================================
-- 10. rpc_product_code_remove — products.edit OU (receiving.learn_codes, autor, 24 h)
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_product_code_remove(p_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_actor    uuid;
  v_reason   text := btrim(COALESCE(p_reason, ''));
  v_row      public.product_codes%ROWTYPE;
  v_can_edit boolean;
  v_can_wh   boolean;
  v_already  boolean := false;
  v_scans    integer;
  v_main_cleared boolean := false;  -- products.barcode limpo nesta chamada
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_row FROM public.product_codes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Código não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_can_edit := public.has_anew_permission(v_uid, 'products.edit');
  v_can_wh   := public.has_anew_permission(v_uid, 'receiving.learn_codes');  -- NOVO (20261210130000)
  IF v_row.organization_id NOT IN (SELECT public.get_user_visible_org_ids(v_uid))
     OR NOT (v_can_edit
             OR (v_can_wh AND v_row.created_by = v_actor AND v_row.created_at > now() - interval '24 hours')) THEN
    RAISE EXCEPTION 'Só quem associou o código (nas primeiras 24 h) ou quem edita produtos o pode remover'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_reason = '' THEN
    RAISE EXCEPTION 'Indica o motivo' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'Motivo demasiado longo' USING ERRCODE = 'check_violation';
  END IF;

  IF v_row.deleted_at IS NOT NULL THEN
    v_already := true;
  ELSE
    UPDATE public.product_codes
    SET deleted_at = now(), deleted_by = v_actor, delete_reason = v_reason
    WHERE id = p_id;
    -- O código removido era também o código principal (mesma chave): limpa-o.
    IF v_row.kind = 'barcode' THEN
      UPDATE public.products SET barcode = NULL
      WHERE id = v_row.product_id AND public.fn_product_code_key(barcode) = v_row.code_key;
      v_main_cleared := FOUND;
    END IF;
  END IF;

  SELECT count(*) INTO v_scans
  FROM public.receiving_scans s
  WHERE s.organization_id = v_row.organization_id
    AND s.product_id = v_row.product_id
    AND s.created_at >= v_row.created_at
    AND public.fn_product_code_key(s.code) = v_row.code_key;

  RETURN public.fn_product_code_json(p_id)
    || jsonb_build_object('removed', NOT v_already, 'already_removed', v_already, 'scans_using_code', v_scans,
                          'main_barcode_cleared', v_main_cleared);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_product_code_remove(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_product_code_remove(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_product_code_remove(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_product_code_remove(uuid, text) TO service_role;

-- ============================================================
-- 11. CONFERIR
-- ============================================================
DO $$
DECLARE
  v_missing        text;
  v_count          int;
  v_trigger_status text;
  v_fn             text;
BEGIN
  SELECT string_agg(c.code, ', ') INTO v_missing
  FROM (VALUES ('receiving.view'), ('receiving.receive'), ('receiving.manage_delivery_notes'),
               ('receiving.learn_codes'), ('receiving.download_proof')) AS c(code)
  WHERE NOT EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = c.code AND p.category = 'receiving');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: permissões em falta no catálogo: %', v_missing;
  END IF;

  -- A. Quem tem purchase_orders.receive tem as quatro.
  SELECT count(*) INTO v_count
  FROM public.anew_roles ro
  CROSS JOIN (VALUES ('receiving.view'), ('receiving.receive'),
                     ('receiving.manage_delivery_notes'), ('receiving.download_proof')) AS c(code)
  WHERE ro.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM public.anew_role_permissions rp
                WHERE rp.role_id = ro.id AND rp.permission_code = 'purchase_orders.receive')
    AND NOT EXISTS (SELECT 1 FROM public.anew_role_permissions rp
                    WHERE rp.role_id = ro.id AND rp.permission_code = c.code);
  IF v_count > 0 THEN
    RAISE EXCEPTION 'CONFERIR: % atribuição(ões) em falta a quem tem purchase_orders.receive', v_count;
  END IF;

  -- A. Quem tem purchase_orders.receive E inventory.edit tem learn_codes.
  SELECT count(*) INTO v_count
  FROM public.anew_roles ro
  WHERE ro.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM public.anew_role_permissions rp
                WHERE rp.role_id = ro.id AND rp.permission_code = 'purchase_orders.receive')
    AND EXISTS (SELECT 1 FROM public.anew_role_permissions rp
                WHERE rp.role_id = ro.id AND rp.permission_code = 'inventory.edit')
    AND NOT EXISTS (SELECT 1 FROM public.anew_role_permissions rp
                    WHERE rp.role_id = ro.id AND rp.permission_code = 'receiving.learn_codes');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'CONFERIR: % papel(eis) perderiam associar códigos na receção', v_count;
  END IF;

  -- B. Quem tem purchase_orders.view entra no ecrã (apagar com o bloco B).
  SELECT count(*) INTO v_count
  FROM public.anew_roles ro
  WHERE ro.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM public.anew_role_permissions rp
                WHERE rp.role_id = ro.id AND rp.permission_code = 'purchase_orders.view')
    AND NOT EXISTS (SELECT 1 FROM public.anew_role_permissions rp
                    WHERE rp.role_id = ro.id AND rp.permission_code = 'receiving.view');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'CONFERIR: % papel(eis) com purchase_orders.view perderiam a entrada na receção', v_count;
  END IF;

  -- Ninguém recebe permissões novas sem ter já a base de hoje.
  SELECT count(*) INTO v_count
  FROM public.anew_role_permissions n
  JOIN public.anew_roles ro ON ro.id = n.role_id AND ro.deleted_at IS NULL
  WHERE n.permission_code LIKE 'receiving.%'
    AND NOT EXISTS (SELECT 1 FROM public.anew_role_permissions rp
                    WHERE rp.role_id = n.role_id
                      AND rp.permission_code IN ('purchase_orders.receive', 'purchase_orders.view'));
  IF v_count > 0 THEN
    RAISE EXCEPTION 'CONFERIR: % atribuição(ões) receiving.* sem base purchase_orders.view/.receive', v_count;
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

  -- As funções usam as permissões novas.
  FOREACH v_fn IN ARRAY ARRAY[
    'public.rpc_delivery_note_save(uuid, uuid, text, date, text, uuid[], jsonb, timestamp with time zone)',
    'public.rpc_delivery_note_close(uuid, text, timestamp with time zone)',
    'public.rpc_delivery_note_reopen(uuid, text)',
    'public.rpc_delivery_note_cancel(uuid, text)'
  ] LOOP
    IF (SELECT prosrc FROM pg_proc WHERE oid = v_fn::regprocedure) LIKE '%''purchase_orders.receive''%'
       OR (SELECT prosrc FROM pg_proc WHERE oid = v_fn::regprocedure) NOT LIKE '%''receiving.manage_delivery_notes''%' THEN
      RAISE EXCEPTION 'CONFERIR: % sem receiving.manage_delivery_notes', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.rpc_product_code_learn(uuid, uuid, text, text, uuid, uuid, uuid, boolean)',
    'public.rpc_product_code_remove(uuid, text)'
  ] LOOP
    IF (SELECT prosrc FROM pg_proc WHERE oid = v_fn::regprocedure) LIKE '%''purchase_orders.receive''%'
       OR (SELECT prosrc FROM pg_proc WHERE oid = v_fn::regprocedure) NOT LIKE '%''receiving.learn_codes''%' THEN
      RAISE EXCEPTION 'CONFERIR: % sem receiving.learn_codes', v_fn;
    END IF;
  END LOOP;
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean, uuid, boolean)'::regprocedure) NOT LIKE '%''receiving.receive''%'
     OR (SELECT prosrc FROM pg_proc WHERE oid = 'public.rpc_receiving_lookup(uuid, text, uuid, uuid, boolean)'::regprocedure) NOT LIKE '%''receiving.view''%'
     OR (SELECT prosrc FROM pg_proc WHERE oid = 'public.rpc_receiving_lookup(uuid, text, uuid, uuid, boolean)'::regprocedure) NOT LIKE '%''receiving.receive''%' THEN
    RAISE EXCEPTION 'CONFERIR: rpc_receive_by_code/rpc_receiving_lookup sem as permissões novas';
  END IF;
END
$$;

-- ============================================================
-- REVERSÃO (não executar; corpos vivos de 07/10/2026 antes desta migration)
-- ============================================================
-- CREATE OR REPLACE FUNCTION public.rpc_receiving_lookup(p_warehouse_id uuid, p_code text, p_supplier_id uuid DEFAULT NULL::uuid, p_delivery_note_id uuid DEFAULT NULL::uuid, p_unit_conversion boolean DEFAULT false)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_org         uuid;
--   v_code        text := btrim(COALESCE(p_code, ''));
--   v_lc          text;
--   v_can_receive boolean;
--   v_level       integer;
--   v_cand        record;
--   v_factor      integer;
--   v_lines       jsonb;
--   v_candidates  jsonb := '[]'::jsonb;
--   v_warnings    jsonb := '[]'::jsonb;
--   v_other       integer;
--   v_other_txt   text;
--   v_matches     jsonb;
--   -- NOVO (guia)
--   v_note_org       uuid;
--   v_note_supplier  uuid;
--   v_note_number    text;
--   v_note_status    text;
--   v_scope          uuid[];
--   v_note_poi       uuid[];
--   v_note_has_lines boolean := false;
--   v_ann            numeric;
--   v_rcv            numeric;
--   v_note_info      jsonb := '{}'::jsonb;
--   -- NOVO (códigos)
--   v_key            text;
--   v_conv           boolean := COALESCE(p_unit_conversion, false);
-- BEGIN
--   SELECT organization_id INTO v_org
--   FROM public.warehouses
--   WHERE id = p_warehouse_id AND deleted_at IS NULL;
--
--   IF v_org IS NULL THEN
--     RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
--      OR NOT (public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
--              OR public.has_anew_permission(auth.uid(), 'purchase_orders.view')) THEN
--     RAISE EXCEPTION 'Sem permissão para consultar encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   v_can_receive := public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
--                AND public.has_anew_permission(auth.uid(), 'inventory.edit');
--
--   IF v_code = '' THEN
--     RAISE EXCEPTION 'Indica o código lido' USING ERRCODE = 'check_violation';
--   END IF;
--   IF char_length(v_code) > 200 THEN
--     RAISE EXCEPTION 'Código lido demasiado longo' USING ERRCODE = 'check_violation';
--   END IF;
--
--   IF p_supplier_id IS NOT NULL AND NOT EXISTS (
--     SELECT 1 FROM public.suppliers
--     WHERE id = p_supplier_id AND organization_id = v_org AND deleted_at IS NULL
--   ) THEN
--     RAISE EXCEPTION 'Fornecedor inválido para esta organização' USING ERRCODE = 'check_violation';
--   END IF;
--
--   -- NOVO (guia): a guia fixa o fornecedor e o âmbito (POs da guia, ou todas
--   -- as do fornecedor se não tiver POs).
--   IF p_delivery_note_id IS NOT NULL THEN
--     SELECT organization_id, supplier_id, note_number, status
--     INTO v_note_org, v_note_supplier, v_note_number, v_note_status
--     FROM public.supplier_delivery_notes
--     WHERE id = p_delivery_note_id;
--     IF v_note_org IS NULL OR v_note_org <> v_org THEN
--       RAISE EXCEPTION 'Guia do fornecedor não encontrada nesta organização' USING ERRCODE = 'no_data_found';
--     END IF;
--     IF v_note_status <> 'open' THEN
--       RAISE EXCEPTION 'A guia % está % — reabre-a para receber', v_note_number,
--         CASE v_note_status WHEN 'closed' THEN 'fechada' ELSE 'cancelada' END
--         USING ERRCODE = 'check_violation';
--     END IF;
--     IF p_supplier_id IS NOT NULL AND p_supplier_id <> v_note_supplier THEN
--       RAISE EXCEPTION 'A guia % é de outro fornecedor', v_note_number USING ERRCODE = 'check_violation';
--     END IF;
--     p_supplier_id := v_note_supplier;
--     v_scope := public.fn_delivery_note_scope(p_delivery_note_id);
--     SELECT array_agg(DISTINCT l.purchase_order_item_id) FILTER (WHERE l.purchase_order_item_id IS NOT NULL),
--            count(*) > 0
--     INTO v_note_poi, v_note_has_lines
--     FROM public.supplier_delivery_note_lines l
--     WHERE l.delivery_note_id = p_delivery_note_id;
--     v_note_info := jsonb_build_object('delivery_note', jsonb_build_object(
--       'id', p_delivery_note_id, 'note_number', v_note_number, 'status', v_note_status,
--       'supplier_id', v_note_supplier, 'purchase_order_ids', to_jsonb(v_scope), 'has_lines', v_note_has_lines));
--   END IF;
--
--   v_lc := lower(v_code);
--   v_key := public.fn_product_code_key(v_code);  -- NOVO (códigos)
--
--   -- Correspondências (produto, unidade, nível) num jsonb — sem tabelas
--   -- temporárias (função STABLE).
--   SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', mm.product_id, 'uom_id', mm.uom_id,
--                                                'matched_by', mm.matched_by, 'lvl', mm.lvl,
--                                                'code_id', mm.code_id)), '[]'::jsonb)  -- NOVO (códigos): code_id
--   INTO v_matches
--   FROM (
--   -- 1 código de barras
--   SELECT p.id AS product_id, NULL::uuid AS uom_id, 'barcode'::text AS matched_by, 1 AS lvl, NULL::uuid AS code_id
--   FROM public.products p
--   WHERE p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
--     AND public.fn_product_code_key(p.barcode) = v_key  -- NOVO (códigos): chave normalizada (GTIN)
--   UNION
--   -- 1b NOVO (códigos): código de barras aprendido (unidade do código)
--   SELECT pc.product_id, pc.uom_id, 'barcode', 1, pc.id
--   FROM public.product_codes pc
--   JOIN public.products p ON p.id = pc.product_id
--   WHERE pc.organization_id = v_org AND pc.kind = 'barcode' AND pc.deleted_at IS NULL
--     AND pc.code_key = v_key
--     AND p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
--   UNION
--   -- 2a referência do fornecedor nas linhas em aberto
--   SELECT poi.product_id, poi.uom_id, 'supplier_sku', 2, NULL::uuid
--   FROM public.purchase_order_items poi
--   JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
--   JOIN public.products p ON p.id = poi.product_id
--   WHERE po.organization_id = v_org AND po.deleted_at IS NULL
--     AND po.status IN ('pending', 'ordered', 'partially_received')
--     AND poi.item_type = 'product' AND poi.quantity > poi.received_quantity
--     AND (p_supplier_id IS NULL OR po.supplier_id = p_supplier_id)
--     AND p.deleted_at IS NULL AND NOT p.is_deleted
--     AND lower(btrim(poi.supplier_sku)) = v_lc
--   UNION
--   -- 2b referência do fornecedor na ficha do produto (item_suppliers)
--   SELECT i.product_id, i.uom_id, 'supplier_sku', 2, NULL::uuid
--   FROM public.item_suppliers i
--   JOIN public.products p ON p.id = i.product_id
--   WHERE i.organization_id = v_org AND i.deleted_at IS NULL AND i.product_id IS NOT NULL
--     AND (p_supplier_id IS NULL OR i.supplier_id = p_supplier_id)
--     AND p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
--     AND lower(btrim(i.supplier_sku)) = v_lc
--   UNION
--   -- 2c NOVO (códigos): referência do fornecedor aprendida (filtrada pelo
--   -- fornecedor quando há; unidade do código)
--   SELECT pc.product_id, pc.uom_id, 'supplier_sku', 2, pc.id
--   FROM public.product_codes pc
--   JOIN public.products p ON p.id = pc.product_id
--   WHERE pc.organization_id = v_org AND pc.kind = 'supplier_ref' AND pc.deleted_at IS NULL
--     AND pc.code_key = v_key
--     AND (p_supplier_id IS NULL OR pc.supplier_id = p_supplier_id)
--     AND p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
--   UNION
--   -- 3 SKU do produto
--   SELECT p.id, NULL::uuid, 'sku', 3, NULL::uuid
--   FROM public.products p
--   WHERE p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
--     AND lower(btrim(p.sku)) = v_lc
--   UNION
--   -- 4 SKU gravado nas linhas das POs da organização
--   SELECT poi.product_id, NULL::uuid, 'po_line_sku', 4, NULL::uuid
--   FROM public.purchase_order_items poi
--   JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
--   JOIN public.products p ON p.id = poi.product_id
--   WHERE po.organization_id = v_org AND po.deleted_at IS NULL
--     AND poi.item_type = 'product'
--     AND (p_supplier_id IS NULL OR po.supplier_id = p_supplier_id)
--     AND p.deleted_at IS NULL AND NOT p.is_deleted
--     AND lower(btrim(poi.sku)) = v_lc
--   ) mm;
--
--   SELECT min(m.lvl) INTO v_level
--   FROM jsonb_to_recordset(v_matches) AS m(product_id uuid, uom_id uuid, matched_by text, lvl integer);
--
--   IF v_level IS NULL THEN
--     RETURN jsonb_build_object(
--       'found', false, 'code', v_code, 'organization_id', v_org,
--       'warehouse_id', p_warehouse_id, 'supplier_id', p_supplier_id,
--       'can_receive', v_can_receive, 'candidates', '[]'::jsonb,
--       'warnings', jsonb_build_array(format('Código «%s» não encontrado nesta organização', v_code))
--     ) || v_note_info  -- NOVO (guia): '{}' sem guia
--      || CASE WHEN v_conv THEN jsonb_build_object('unit_conversion', true) ELSE '{}'::jsonb END;  -- NOVO (códigos)
--   END IF;
--
--   -- Níveis inferiores com outros produtos: só aviso.
--   SELECT count(DISTINCT m.product_id),
--          string_agg(DISTINCT format('%s (%s)', p.name, m.matched_by), ', ')
--   INTO v_other, v_other_txt
--   FROM jsonb_to_recordset(v_matches) AS m(product_id uuid, uom_id uuid, matched_by text, lvl integer)
--   JOIN public.products p ON p.id = m.product_id
--   WHERE m.lvl > v_level
--     AND m.product_id NOT IN (
--       SELECT m2.product_id
--       FROM jsonb_to_recordset(v_matches) AS m2(product_id uuid, uom_id uuid, matched_by text, lvl integer)
--       WHERE m2.lvl = v_level);
--   IF v_other > 0 THEN
--     v_warnings := v_warnings || to_jsonb(format('O código também corresponde a: %s', v_other_txt));
--   END IF;
--
--   FOR v_cand IN
--     SELECT DISTINCT ON (m.product_id, COALESCE(m.uom_id, p.uom_id))
--            m.product_id, m.matched_by,
--            -- unidade lida: a da ligação/linha; senão a do produto
--            CASE WHEN m.uom_id IS NULL OR m.uom_id IS NOT DISTINCT FROM p.uom_id THEN p.uom_id ELSE m.uom_id END AS uom_id,
--            (m.uom_id IS NOT NULL AND m.uom_id IS DISTINCT FROM p.uom_id) AS is_pack,
--            p.name, p.sku, p.barcode, m.code_id  -- NOVO (códigos)
--     FROM jsonb_to_recordset(v_matches) AS m(product_id uuid, uom_id uuid, matched_by text, lvl integer, code_id uuid)
--     JOIN public.products p ON p.id = m.product_id
--     WHERE m.lvl = v_level
--     ORDER BY m.product_id, COALESCE(m.uom_id, p.uom_id), p.name, m.code_id NULLS FIRST  -- NOVO (códigos)
--   LOOP
--     v_factor := 1;
--     IF v_cand.is_pack THEN
--       BEGIN
--         v_factor := public.fn_uom_units_per(v_cand.uom_id, v_cand.product_id);
--       EXCEPTION WHEN OTHERS THEN
--         v_warnings := v_warnings || to_jsonb(format('«%s»: a unidade da referência do fornecedor não é compatível com a do produto (%s)', v_cand.name, SQLERRM));
--         CONTINUE;
--       END;
--     END IF;
--
--     SELECT COALESCE(jsonb_agg(jsonb_build_object(
--              'purchase_order_id',      o.purchase_order_id,
--              'order_number',           o.order_number,
--              'po_status',              o.po_status,
--              'confirmed',              o.confirmed,
--              'supplier_id',            o.supplier_id,
--              'supplier_name',          o.supplier_name,
--              'expected_delivery',      o.expected_delivery,
--              'purchase_order_item_id', o.purchase_order_item_id,
--              'description',            o.description,
--              'quantity',               o.quantity,
--              'received_quantity',      o.received_quantity,
--              'open_quantity',          o.open_quantity,
--              'uom_id',                 o.uom_id,
--              'units_per_uom',          o.units_per_uom,
--              'same_unit',              (o.units_per_uom = v_factor),
--              'contract_id',            o.contract_id,
--              'contract_order_number',  o.contract_order_number,
--              'contract_active',        o.contract_active,
--              -- Posição na ordem de enchimento (só linhas da mesma unidade).
--              -- NOVO (códigos): com conversão todas as linhas entram na ordem.
--              'allocation_rank',        CASE WHEN v_conv OR o.units_per_uom = v_factor THEN o.r END
--            -- NOVO (guia): linha indicada na guia (só com guia)
--            ) || CASE WHEN p_delivery_note_id IS NOT NULL
--                      THEN jsonb_build_object('in_delivery_note', COALESCE(o.purchase_order_item_id = ANY (v_note_poi), false))
--                      ELSE '{}'::jsonb END
--            -- NOVO (códigos): em aberto em unidades de stock (só com conversão)
--            || CASE WHEN v_conv THEN jsonb_build_object('open_units', o.open_quantity * o.units_per_uom)
--                    ELSE '{}'::jsonb END
--            ORDER BY (v_conv OR o.units_per_uom = v_factor) DESC, o.prio, o.allocation_rank), '[]'::jsonb),
--            count(*) FILTER (WHERE NOT v_conv AND o.units_per_uom <> v_factor)
--     INTO v_lines, v_other
--     FROM (
--       -- NOVO (guia): prio 0 = linha indicada na guia (sem guia é sempre 1);
--       -- só POs do âmbito da guia.
--       SELECT ol.*, pr.prio,
--              row_number() OVER (PARTITION BY (v_conv OR ol.units_per_uom = v_factor) ORDER BY pr.prio, ol.allocation_rank) AS r
--       FROM public.fn_receiving_open_lines(v_org, ARRAY[v_cand.product_id], p_supplier_id) ol
--       CROSS JOIN LATERAL (SELECT CASE WHEN ol.purchase_order_item_id = ANY (v_note_poi) THEN 0 ELSE 1 END AS prio) pr
--       WHERE v_scope IS NULL OR ol.purchase_order_id = ANY (v_scope)
--     ) o;
--
--     IF jsonb_array_length(v_lines) = 0 THEN
--       v_warnings := v_warnings || to_jsonb(format('«%s» não tem encomendas a fornecedor em aberto%s', v_cand.name,
--                       CASE WHEN p_supplier_id IS NOT NULL THEN ' deste fornecedor' ELSE '' END)
--                       -- NOVO (guia)
--                       || CASE WHEN v_scope IS NOT NULL THEN format(' nas encomendas da guia %s', v_note_number) ELSE '' END);
--     ELSIF v_other > 0 THEN
--       v_warnings := v_warnings || to_jsonb(format('«%s»: %s linha(s) em aberto noutra unidade — não entram numa leitura nesta unidade', v_cand.name, v_other));
--     END IF;
--
--     -- NOVO (guia): anunciado / recebido pela guia (unidades de stock).
--     IF p_delivery_note_id IS NOT NULL THEN
--       SELECT COALESCE(sum(l.quantity * l.units_per_uom), 0) INTO v_ann
--       FROM public.supplier_delivery_note_lines l
--       WHERE l.delivery_note_id = p_delivery_note_id AND l.product_id = v_cand.product_id;
--       SELECT COALESCE(sum(pr.quantity * pr.units_per_uom), 0) INTO v_rcv
--       FROM public.purchase_order_receipts pr
--       WHERE pr.delivery_note_id = p_delivery_note_id AND pr.product_id = v_cand.product_id
--         AND pr.kind = 'receipt' AND pr.reverted_at IS NULL;
--       IF v_note_has_lines AND v_ann = 0 THEN
--         v_warnings := v_warnings || to_jsonb(format('«%s» não consta da guia %s', v_cand.name, v_note_number));
--       END IF;
--     END IF;
--
--     v_candidates := v_candidates || (jsonb_build_object(
--       'product_id',    v_cand.product_id,
--       'name',          v_cand.name,
--       'sku',           v_cand.sku,
--       'barcode',       v_cand.barcode,
--       'matched_by',    v_cand.matched_by,
--       'uom_id',        v_cand.uom_id,
--       'uom_code',      (SELECT code FROM public.uom WHERE id = v_cand.uom_id),
--       'units_per_uom', v_factor,
--       'open_lines',    v_lines
--     ) || CASE WHEN v_cand.code_id IS NOT NULL  -- NOVO (códigos)
--               THEN jsonb_build_object('learned_code_id', v_cand.code_id) ELSE '{}'::jsonb END
--       || CASE WHEN p_delivery_note_id IS NOT NULL  -- NOVO (guia)
--               THEN jsonb_build_object('delivery_note', jsonb_build_object(
--                      'announced', v_ann > 0, 'announced_units', trim_scale(v_ann), 'received_units', trim_scale(v_rcv)))
--               ELSE '{}'::jsonb END);
--   END LOOP;
--
--   RETURN jsonb_build_object(
--     'found',           jsonb_array_length(v_candidates) > 0,
--     'code',            v_code,
--     'organization_id', v_org,
--     'warehouse_id',    p_warehouse_id,
--     'supplier_id',     p_supplier_id,
--     'can_receive',     v_can_receive,
--     'candidates',      v_candidates,
--     'warnings',        v_warnings
--   ) || v_note_info  -- NOVO (guia): '{}' sem guia
--      || CASE WHEN v_conv THEN jsonb_build_object('unit_conversion', true) ELSE '{}'::jsonb END;  -- NOVO (códigos)
-- END;
-- $function$;
-- CREATE OR REPLACE FUNCTION public.rpc_receive_by_code(p_request_id uuid, p_warehouse_id uuid, p_product_id uuid, p_quantity numeric, p_uom_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_purchase_order_item_id uuid DEFAULT NULL::uuid, p_code text DEFAULT NULL::text, p_dry_run boolean DEFAULT false, p_delivery_note_id uuid DEFAULT NULL::uuid, p_unit_conversion boolean DEFAULT false)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_actor       uuid;
--   v_org         uuid;
--   v_dry         boolean := COALESCE(p_dry_run, false);
--   v_code        text := nullif(btrim(COALESCE(p_code, '')), '');
--   v_lc          text;
--   v_product     record;
--   v_factor      integer;
--   v_uom_code    text;
--   v_units       numeric;
--   v_matched_by  text;
--   v_replay      jsonb;
--   v_forced      record;
--   v_locked      uuid[];
--   v_cid         uuid;
--   v_open_total  numeric;
--   v_open_list   text;
--   v_plan        jsonb;
--   v_po          record;
--   v_r           jsonb;
--   v_allocs      jsonb := '[]'::jsonb;
--   v_warnings    jsonb := '[]'::jsonb;
--   v_to_order    numeric := 0;
--   v_to_stock    numeric := 0;
--   v_other       integer;
--   v_result      jsonb;
--   -- NOVO (guia)
--   v_note_org       uuid;
--   v_note_supplier  uuid;
--   v_note_number    text;
--   v_note_status    text;
--   v_scope          uuid[];
--   v_note_poi       uuid[];
--   v_note_has_lines boolean := false;
--   v_ann            numeric;
--   v_rcv            numeric;
--   v_checks         jsonb := '[]'::jsonb;
--   -- NOVO (códigos)
--   v_key            text;
--   v_conv           boolean := COALESCE(p_unit_conversion, false);
--   v_base_code      text;
--   v_line           record;
--   v_rest           numeric;
--   v_take           numeric;
--   v_open_units     numeric;
-- BEGIN
--   v_actor := public.current_business_user_id();
--   IF v_actor IS NULL THEN
--     RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   IF p_request_id IS NULL THEN
--     RAISE EXCEPTION 'Identificador do pedido de receção em falta' USING ERRCODE = 'check_violation';
--   END IF;
--
--   SELECT organization_id INTO v_org
--   FROM public.warehouses
--   WHERE id = p_warehouse_id AND deleted_at IS NULL;
--
--   IF v_org IS NULL THEN
--     RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
--      OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
--      OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
--     RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   -- Pedido já processado → devolve o resultado gravado.
--   v_replay := public.fn_receiving_scan_replay(p_request_id, v_org, v_actor, p_warehouse_id, p_product_id, p_quantity, p_uom_id);
--   IF v_replay IS NOT NULL THEN
--     -- NOVO (guia): o identificador gravado com outra guia (ou sem guia) é erro.
--     IF (SELECT s.delivery_note_id FROM public.receiving_scans s WHERE s.id = p_request_id) IS DISTINCT FROM p_delivery_note_id THEN
--       RAISE EXCEPTION 'O identificador do pedido de receção já foi usado noutra leitura (outra guia)'
--         USING ERRCODE = 'check_violation';
--     END IF;
--     -- NOVO (códigos): gravado com outra opção de conversão de unidades → erro.
--     IF COALESCE((v_replay ->> 'unit_conversion')::boolean, false) IS DISTINCT FROM v_conv THEN
--       RAISE EXCEPTION 'O identificador do pedido de receção já foi usado noutra leitura (outra opção de conversão de unidades)'
--         USING ERRCODE = 'check_violation';
--     END IF;
--     RETURN v_replay;
--   END IF;
--
--   IF p_quantity IS NULL OR p_quantity <= 0 THEN
--     RAISE EXCEPTION 'A quantidade lida tem de ser positiva' USING ERRCODE = 'check_violation';
--   END IF;
--   IF p_quantity <> floor(p_quantity) THEN
--     RAISE EXCEPTION 'A quantidade lida tem de ser um número inteiro (%)', p_quantity USING ERRCODE = 'check_violation';
--   END IF;
--
--   SELECT id, name, sku, barcode, uom_id INTO v_product
--   FROM public.products
--   WHERE id = p_product_id AND organization_id = v_org AND deleted_at IS NULL AND NOT is_deleted;
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Produto inválido para esta organização' USING ERRCODE = 'check_violation';
--   END IF;
--
--   IF p_supplier_id IS NOT NULL AND NOT EXISTS (
--     SELECT 1 FROM public.suppliers
--     WHERE id = p_supplier_id AND organization_id = v_org AND deleted_at IS NULL
--   ) THEN
--     RAISE EXCEPTION 'Fornecedor inválido para esta organização' USING ERRCODE = 'check_violation';
--   END IF;
--
--   -- NOVO (guia): 1.º lock da ordem global — a guia FOR SHARE (várias leituras
--   -- da mesma guia em paralelo; fechar/editar/cancelar esperam). Fixa o
--   -- fornecedor e o âmbito.
--   IF p_delivery_note_id IS NOT NULL THEN
--     SELECT organization_id, supplier_id, note_number, status
--     INTO v_note_org, v_note_supplier, v_note_number, v_note_status
--     FROM public.supplier_delivery_notes
--     WHERE id = p_delivery_note_id
--     FOR SHARE;
--     IF v_note_org IS NULL OR v_note_org <> v_org THEN
--       RAISE EXCEPTION 'Guia do fornecedor não encontrada nesta organização' USING ERRCODE = 'no_data_found';
--     END IF;
--     IF v_note_status <> 'open' THEN
--       RAISE EXCEPTION 'A guia % está % — reabre-a para receber', v_note_number,
--         CASE v_note_status WHEN 'closed' THEN 'fechada' ELSE 'cancelada' END
--         USING ERRCODE = 'check_violation';
--     END IF;
--     IF p_supplier_id IS NOT NULL AND p_supplier_id <> v_note_supplier THEN
--       RAISE EXCEPTION 'A guia % é de outro fornecedor', v_note_number USING ERRCODE = 'check_violation';
--     END IF;
--     p_supplier_id := v_note_supplier;
--     v_scope := public.fn_delivery_note_scope(p_delivery_note_id);
--     SELECT array_agg(DISTINCT l.purchase_order_item_id) FILTER (WHERE l.purchase_order_item_id IS NOT NULL),
--            count(*) > 0
--     INTO v_note_poi, v_note_has_lines
--     FROM public.supplier_delivery_note_lines l
--     WHERE l.delivery_note_id = p_delivery_note_id;
--   END IF;
--
--   -- Fator da unidade lida (erro claro se a unidade não for do produto).
--   v_factor   := public.fn_uom_units_per(p_uom_id, p_product_id);
--   v_uom_code := COALESCE((SELECT code FROM public.uom WHERE id = COALESCE(p_uom_id, v_product.uom_id)), 'un.');
--   v_units    := p_quantity * v_factor;
--   IF v_units > 2147483647 THEN
--     RAISE EXCEPTION 'A leitura excede o limite de stock (% unidades)', v_units USING ERRCODE = 'numeric_value_out_of_range';
--   END IF;
--
--   -- Como o código lido corresponde a este produto (só registo/aviso).
--   IF v_code IS NOT NULL THEN
--     v_lc := lower(v_code);
--     v_key := public.fn_product_code_key(v_code);  -- NOVO (códigos)
--     v_matched_by := CASE
--       -- NOVO (códigos): chave normalizada + códigos aprendidos
--       WHEN public.fn_product_code_key(v_product.barcode) = v_key
--         OR EXISTS (SELECT 1 FROM public.product_codes pc
--                    WHERE pc.product_id = p_product_id AND pc.organization_id = v_org
--                      AND pc.kind = 'barcode' AND pc.deleted_at IS NULL AND pc.code_key = v_key) THEN 'barcode'
--       WHEN EXISTS (SELECT 1 FROM public.purchase_order_items poi
--                    JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
--                    WHERE po.organization_id = v_org AND poi.product_id = p_product_id
--                      AND lower(btrim(poi.supplier_sku)) = v_lc)
--         OR EXISTS (SELECT 1 FROM public.item_suppliers i
--                    WHERE i.organization_id = v_org AND i.product_id = p_product_id
--                      AND i.deleted_at IS NULL AND lower(btrim(i.supplier_sku)) = v_lc)
--         OR EXISTS (SELECT 1 FROM public.product_codes pc  -- NOVO (códigos)
--                    WHERE pc.product_id = p_product_id AND pc.organization_id = v_org
--                      AND pc.kind = 'supplier_ref' AND pc.deleted_at IS NULL AND pc.code_key = v_key) THEN 'supplier_sku'
--       WHEN lower(btrim(v_product.sku)) = v_lc THEN 'sku'
--       WHEN EXISTS (SELECT 1 FROM public.purchase_order_items poi
--                    JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
--                    WHERE po.organization_id = v_org AND poi.product_id = p_product_id
--                      AND lower(btrim(poi.sku)) = v_lc) THEN 'po_line_sku'
--     END;
--     IF v_matched_by IS NULL THEN
--       v_warnings := v_warnings || to_jsonb(format('O código «%s» não corresponde a «%s»', v_code, v_product.name));
--     END IF;
--   END IF;
--
--   -- Linha forçada: validações com mensagens claras.
--   IF p_purchase_order_item_id IS NOT NULL THEN
--     SELECT poi.id, poi.product_id, poi.item_type, poi.quantity, poi.received_quantity,
--            COALESCE(poi.units_per_uom, 1) AS units_per_uom, poi.description,
--            po.status, po.supplier_id, po.order_number
--     INTO v_forced
--     FROM public.purchase_order_items poi
--     JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
--     WHERE poi.id = p_purchase_order_item_id AND po.organization_id = v_org AND po.deleted_at IS NULL;
--
--     IF NOT FOUND THEN
--       RAISE EXCEPTION 'Linha de encomenda não encontrada' USING ERRCODE = 'no_data_found';
--     END IF;
--     IF v_forced.item_type <> 'product' OR v_forced.product_id IS DISTINCT FROM p_product_id THEN
--       RAISE EXCEPTION 'A linha "%" (%) não é do produto lido', v_forced.description, v_forced.order_number
--         USING ERRCODE = 'check_violation';
--     END IF;
--     IF p_supplier_id IS NOT NULL AND v_forced.supplier_id IS DISTINCT FROM p_supplier_id THEN
--       RAISE EXCEPTION 'A linha "%" (%) é de outro fornecedor', v_forced.description, v_forced.order_number
--         USING ERRCODE = 'check_violation';
--     END IF;
--     -- NOVO (guia): a linha forçada tem de estar no âmbito da guia.
--     IF v_scope IS NOT NULL AND NOT EXISTS (
--       SELECT 1 FROM public.purchase_order_items poi
--       WHERE poi.id = p_purchase_order_item_id AND poi.purchase_order_id = ANY (v_scope)
--     ) THEN
--       RAISE EXCEPTION 'A linha "%" (%) não está nas encomendas da guia %', v_forced.description, v_forced.order_number, v_note_number
--         USING ERRCODE = 'check_violation';
--     END IF;
--     -- NOVO (códigos): com conversão a linha pode estar noutra unidade (a
--     -- divisibilidade é verificada no plano).
--     IF NOT v_conv AND v_forced.units_per_uom <> v_factor THEN
--       RAISE EXCEPTION 'A linha "%" (%) está noutra unidade (% un. por unidade; a leitura tem %)', v_forced.description, v_forced.order_number, v_forced.units_per_uom, v_factor
--         USING ERRCODE = 'check_violation';
--     END IF;
--     IF v_forced.status NOT IN ('pending', 'ordered', 'partially_received') OR v_forced.quantity <= v_forced.received_quantity THEN
--       RAISE EXCEPTION 'A linha "%" (%) não está em aberto', v_forced.description, v_forced.order_number
--         USING ERRCODE = 'check_violation';
--     END IF;
--   END IF;
--
--   -- Reserva do identificador (fica com o resultado no fim). Um pedido igual
--   -- em paralelo espera aqui pelo primeiro e, quando este confirma, devolve o
--   -- resultado gravado. Em dry-run nada é gravado.
--   IF NOT v_dry THEN
--     INSERT INTO public.receiving_scans (
--       id, organization_id, warehouse_id, supplier_id, code, matched_by,
--       product_id, uom_id, quantity, units, result, created_by,
--       delivery_note_id  -- NOVO (guia)
--     ) VALUES (
--       p_request_id, v_org, p_warehouse_id, p_supplier_id, v_code, v_matched_by,
--       p_product_id, p_uom_id, p_quantity, v_units, '{}'::jsonb, v_actor,
--       p_delivery_note_id
--     )
--     ON CONFLICT (id) DO NOTHING;
--
--     IF NOT FOUND THEN
--       v_replay := public.fn_receiving_scan_replay(p_request_id, v_org, v_actor, p_warehouse_id, p_product_id, p_quantity, p_uom_id);
--       IF v_replay IS NULL THEN
--         RAISE EXCEPTION 'Pedido de receção em conflito — tenta de novo' USING ERRCODE = 'serialization_failure';
--       END IF;
--       -- NOVO (guia)
--       IF (SELECT s.delivery_note_id FROM public.receiving_scans s WHERE s.id = p_request_id) IS DISTINCT FROM p_delivery_note_id THEN
--         RAISE EXCEPTION 'O identificador do pedido de receção já foi usado noutra leitura (outra guia)'
--           USING ERRCODE = 'check_violation';
--       END IF;
--       -- NOVO (códigos)
--       IF COALESCE((v_replay ->> 'unit_conversion')::boolean, false) IS DISTINCT FROM v_conv THEN
--         RAISE EXCEPTION 'O identificador do pedido de receção já foi usado noutra leitura (outra opção de conversão de unidades)'
--           USING ERRCODE = 'check_violation';
--       END IF;
--       RETURN v_replay;
--     END IF;
--   END IF;
--
--   -- 1. Serializa leituras do mesmo produto.
--   PERFORM pg_advisory_xact_lock(hashtextextended('receiving:' || v_org::text || ':' || p_product_id::text, 0));
--
--   BEGIN
--     -- 2. Tranca as POs candidatas (ordem fixa por id).
--     SELECT COALESCE(array_agg(t.id ORDER BY t.id), ARRAY[]::uuid[]) INTO v_locked
--     FROM (
--       SELECT po.id
--       FROM public.purchase_orders po
--       WHERE po.id IN (
--               SELECT o.purchase_order_id
--               FROM public.fn_receiving_open_lines(v_org, ARRAY[p_product_id], p_supplier_id) o
--               WHERE (v_conv OR o.units_per_uom = v_factor)  -- NOVO (códigos)
--                 AND (p_purchase_order_item_id IS NULL OR o.purchase_order_item_id = p_purchase_order_item_id)
--                 AND (v_scope IS NULL OR o.purchase_order_id = ANY (v_scope)))  -- NOVO (guia)
--         AND po.deleted_at IS NULL
--         AND po.status IN ('pending', 'ordered', 'partially_received')
--       ORDER BY po.id
--       FOR UPDATE
--     ) t;
--
--     -- 3. Locks das Encomendas Cliente (os da Fase 1), ordem fixa.
--     FOR v_cid IN
--       SELECT DISTINCT po.source_id
--       FROM public.purchase_orders po
--       WHERE po.id = ANY (v_locked) AND po.source_type = 'contract' AND po.source_id IS NOT NULL
--       ORDER BY po.source_id
--     LOOP
--       PERFORM pg_advisory_xact_lock(hashtextextended('po_receipt_contract:' || v_cid::text, 0));
--     END LOOP;
--
--     -- 4. Em aberto relido com tudo trancado (só POs trancadas). take = o que
--     --    cada linha recebe, enchendo pela ordem D2 (NOVO (guia): primeiro as
--     --    linhas indicadas na guia; sem guia a ordem é a mesma).
--     IF NOT v_conv THEN  -- caminho da fatia 2 (sem conversão), intacto
--     SELECT COALESCE(jsonb_agg(jsonb_build_object(
--              'rn', a.rn, 'purchase_order_id', a.purchase_order_id, 'order_number', a.order_number,
--              'po_status', a.po_status, 'purchase_order_item_id', a.purchase_order_item_id,
--              'open_quantity', a.open_quantity, 'take', a.take) ORDER BY a.rn), '[]'::jsonb),
--            COALESCE(SUM(a.open_quantity), 0),
--            string_agg(DISTINCT a.order_number, ', ')
--     INTO v_plan, v_open_total, v_open_list
--     FROM (
--       SELECT c.rn, c.purchase_order_id, c.order_number, c.po_status, c.purchase_order_item_id, c.open_quantity,
--              LEAST(c.open_quantity,
--                    GREATEST(0, p_quantity - COALESCE(SUM(c.open_quantity) OVER (
--                      ORDER BY c.rn ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0))) AS take
--       FROM (
--         SELECT o.*, row_number() OVER (
--                  ORDER BY CASE WHEN o.purchase_order_item_id = ANY (v_note_poi) THEN 0 ELSE 1 END,  -- NOVO (guia)
--                           o.allocation_rank) AS rn
--         FROM public.fn_receiving_open_lines(v_org, ARRAY[p_product_id], p_supplier_id) o
--         WHERE o.purchase_order_id = ANY (v_locked)
--           AND o.units_per_uom = v_factor
--           AND (p_purchase_order_item_id IS NULL OR o.purchase_order_item_id = p_purchase_order_item_id)
--       ) c
--     ) a;
--
--     -- D3: acima do em aberto → recusa tudo.
--     IF v_open_total < p_quantity THEN
--       RAISE EXCEPTION '%', format('Leste %s %s; em aberto %s %s%s', p_quantity, v_uom_code, v_open_total, v_uom_code,
--         CASE WHEN v_open_list IS NOT NULL THEN format(' (%s)', v_open_list)
--              WHEN p_purchase_order_item_id IS NOT NULL THEN ' (a linha indicada já não está em aberto)'
--              ELSE format(' — sem encomendas a fornecedor em aberto para «%s»%s', v_product.name,
--                          CASE WHEN p_supplier_id IS NOT NULL THEN ' deste fornecedor nesta unidade' ELSE ' nesta unidade' END)
--         END)
--         -- NOVO (guia): âmbito da guia na mensagem ('' sem guia)
--         || CASE WHEN p_delivery_note_id IS NOT NULL
--                 THEN format(' — âmbito da guia %s%s', v_note_number,
--                             CASE WHEN v_scope IS NOT NULL THEN format(' (%s encomenda(s) da guia)', cardinality(v_scope))
--                                  ELSE ' (encomendas do fornecedor)' END)
--                 ELSE '' END
--         USING ERRCODE = 'check_violation';
--     END IF;
--
--     ELSE
--       -- NOVO (códigos): conversão caixa↔unidades. Linhas elegíveis = todas as
--       -- linhas em aberto trancadas (os fatores das linhas são todos sobre a
--       -- unidade de stock do produto — mesma base); ordem = linhas da guia →
--       -- D2, sem preferir a unidade lida. Cada linha só leva unidades inteiras
--       -- suas: take = LEAST(em aberto, floor(resto / fator)). Resto ≠ 0 →
--       -- recusa tudo (mensagens em unidades de stock).
--       v_rest := v_units;
--       v_open_units := 0;
--       v_plan := '[]'::jsonb;
--       v_base_code := COALESCE((SELECT code FROM public.uom WHERE id = v_product.uom_id), 'un.');
--       FOR v_line IN
--         SELECT o.*, row_number() OVER (
--                  ORDER BY CASE WHEN o.purchase_order_item_id = ANY (v_note_poi) THEN 0 ELSE 1 END,
--                           o.allocation_rank) AS rn
--         FROM public.fn_receiving_open_lines(v_org, ARRAY[p_product_id], p_supplier_id) o
--         WHERE o.purchase_order_id = ANY (v_locked)
--           AND o.units_per_uom >= 1
--           AND (p_purchase_order_item_id IS NULL OR o.purchase_order_item_id = p_purchase_order_item_id)
--         ORDER BY rn
--       LOOP
--         v_take := LEAST(v_line.open_quantity, floor(v_rest / v_line.units_per_uom));
--         v_rest := v_rest - v_take * v_line.units_per_uom;
--         v_open_units := v_open_units + v_line.open_quantity * v_line.units_per_uom;
--         v_plan := v_plan || jsonb_build_object(
--           'rn', v_line.rn, 'purchase_order_id', v_line.purchase_order_id, 'order_number', v_line.order_number,
--           'po_status', v_line.po_status, 'purchase_order_item_id', v_line.purchase_order_item_id,
--           'open_quantity', v_line.open_quantity, 'take', v_take);
--       END LOOP;
--       SELECT string_agg(DISTINCT x ->> 'order_number', ', ') INTO v_open_list
--       FROM jsonb_array_elements(v_plan) x;
--
--       IF v_rest <> 0 THEN
--         RAISE EXCEPTION '%', CASE
--           WHEN v_open_units < v_units THEN
--             format('Leste %s %s (%s %s); em aberto %s %s%s', p_quantity, v_uom_code, trim_scale(v_units), v_base_code,
--                    trim_scale(v_open_units), v_base_code,
--                    CASE WHEN v_open_list IS NOT NULL THEN format(' (%s)', v_open_list)
--                         WHEN p_purchase_order_item_id IS NOT NULL THEN ' (a linha indicada já não está em aberto)'
--                         ELSE format(' — sem encomendas a fornecedor em aberto para «%s»%s', v_product.name,
--                                     CASE WHEN p_supplier_id IS NOT NULL THEN ' deste fornecedor' ELSE '' END)
--                    END)
--           ELSE
--             format('Leste %s %s (%s %s); as linhas em aberto (%s) só recebem unidades inteiras da sua embalagem — ficam %s %s por distribuir',
--                    p_quantity, v_uom_code, trim_scale(v_units), v_base_code, v_open_list, trim_scale(v_rest), v_base_code)
--           END
--           || CASE WHEN p_delivery_note_id IS NOT NULL
--                   THEN format(' — âmbito da guia %s%s', v_note_number,
--                               CASE WHEN v_scope IS NOT NULL THEN format(' (%s encomenda(s) da guia)', cardinality(v_scope))
--                                    ELSE ' (encomendas do fornecedor)' END)
--                   ELSE '' END
--           USING ERRCODE = 'check_violation';
--       END IF;
--     END IF;
--
--     -- NOVO (guia): avisos de anunciado (decisão 1: aviso + confirmação no
--     -- ecrã). Com o lock do produto detido, o recebido pela guia é estável.
--     IF p_delivery_note_id IS NOT NULL AND v_note_has_lines THEN
--       SELECT COALESCE(sum(l.quantity * l.units_per_uom), 0) INTO v_ann
--       FROM public.supplier_delivery_note_lines l
--       WHERE l.delivery_note_id = p_delivery_note_id AND l.product_id = p_product_id;
--       IF v_ann = 0 THEN
--         v_checks   := v_checks || to_jsonb('nao_consta_da_guia'::text);
--         v_warnings := v_warnings || to_jsonb(format('«%s» não consta da guia %s', v_product.name, v_note_number));
--       ELSE
--         SELECT COALESCE(sum(pr.quantity * pr.units_per_uom), 0) INTO v_rcv
--         FROM public.purchase_order_receipts pr
--         WHERE pr.delivery_note_id = p_delivery_note_id AND pr.product_id = p_product_id
--           AND pr.kind = 'receipt' AND pr.reverted_at IS NULL;
--         IF v_rcv + v_units > v_ann THEN
--           v_checks   := v_checks || to_jsonb('acima_do_anunciado'::text);
--           v_warnings := v_warnings || to_jsonb(format('«%s»: com esta leitura ficam %s un. recebidas pela guia %s; anunciadas %s un.',
--                           v_product.name, trim_scale(v_rcv + v_units), v_note_number, trim_scale(v_ann)));
--         END IF;
--       END IF;
--     END IF;
--
--     -- 5. Receção pela Fase 1, uma chamada por PO, pela ordem D2 (os locks já
--     --    estão todos detidos, a ordem das chamadas não cria esperas novas).
--     FOR v_po IN
--       SELECT l.purchase_order_id, min(l.order_number) AS order_number,
--              bool_or(l.po_status = 'pending') AS pending,
--              jsonb_agg(jsonb_build_object('purchase_order_item_id', l.purchase_order_item_id, 'quantity', l.take) ORDER BY l.rn) AS lines,
--              array_agg(l.purchase_order_item_id ORDER BY l.rn) AS ids
--       FROM jsonb_to_recordset(v_plan) AS l(rn bigint, purchase_order_id uuid, order_number text, po_status text,
--                                            purchase_order_item_id uuid, open_quantity numeric, take numeric)
--       WHERE l.take > 0
--       GROUP BY l.purchase_order_id
--       ORDER BY min(l.rn)
--     LOOP
--       v_r := public.rpc_receive_purchase_order_lines(v_po.purchase_order_id, p_warehouse_id, v_po.lines, NULL);
--
--       IF NOT v_dry THEN
--         -- Liga as linhas de histórico acabadas de gravar pela Fase 1 a esta
--         -- leitura (received_at = now() = início da transação; received_by =
--         -- current_business_user_id(), como a Fase 1 grava).
--         UPDATE public.purchase_order_receipts
--         SET receiving_scan_id = p_request_id,
--             delivery_note_id  = p_delivery_note_id  -- NOVO (guia); NULL sem guia (já era NULL)
--         WHERE purchase_order_id = v_po.purchase_order_id
--           AND purchase_order_item_id = ANY (v_po.ids)
--           AND kind = 'receipt'
--           AND receiving_scan_id IS NULL
--           AND received_at = now()
--           AND received_by = v_actor;
--       END IF;
--
--       IF v_po.pending THEN
--         v_warnings := v_warnings || to_jsonb(format('%s ainda está pendente (não confirmada ao fornecedor)', v_po.order_number));
--       END IF;
--
--       v_allocs := v_allocs || jsonb_build_object(
--         'purchase_order_id',    v_po.purchase_order_id,
--         'order_number',         v_r -> 'order_number',
--         'status',               v_r -> 'status',
--         'stock_skipped',        v_r -> 'stock_skipped',
--         'units_to_order_total', v_r -> 'units_to_order_total',
--         'units_to_stock_total', v_r -> 'units_to_stock_total',
--         'lines',                v_r -> 'lines'
--       );
--       v_to_order := v_to_order + COALESCE((v_r ->> 'units_to_order_total')::numeric, 0);
--       v_to_stock := v_to_stock + COALESCE((v_r ->> 'units_to_stock_total')::numeric, 0);
--     END LOOP;
--
--     IF v_dry THEN
--       RAISE EXCEPTION USING ERRCODE = 'OLPV2', MESSAGE = 'receive_by_code_dry_run_rollback';
--     END IF;
--   EXCEPTION WHEN SQLSTATE 'OLPV2' THEN
--     NULL;  -- dry-run: tudo o que a receção escreveu foi desfeito com a subtransação
--   END;
--
--   SELECT count(*) INTO v_other
--   FROM public.fn_receiving_open_lines(v_org, ARRAY[p_product_id], p_supplier_id) o
--   WHERE NOT v_conv AND o.units_per_uom <> v_factor  -- NOVO (códigos): com conversão nenhuma fica de fora
--     AND (v_scope IS NULL OR o.purchase_order_id = ANY (v_scope));  -- NOVO (guia)
--   IF v_other > 0 THEN
--     v_warnings := v_warnings || to_jsonb(format('%s linha(s) em aberto de «%s» noutra unidade não entraram nesta leitura', v_other, v_product.name));
--   END IF;
--
--   v_result := jsonb_build_object(
--     'request_id',           p_request_id,
--     'replayed',             false,
--     'dry_run',              v_dry,
--     'product_id',           p_product_id,
--     'warehouse_id',         p_warehouse_id,
--     'supplier_id',          p_supplier_id,
--     'uom_id',               p_uom_id,
--     'uom_code',             v_uom_code,
--     'units_per_uom',        v_factor,
--     'quantity',             p_quantity,
--     'units',                v_units,
--     'matched_by',           v_matched_by,
--     'allocations',          v_allocs,
--     'units_to_order_total', v_to_order,
--     'units_to_stock_total', v_to_stock,
--     'warnings',             v_warnings
--   ) || CASE WHEN p_delivery_note_id IS NOT NULL  -- NOVO (guia): '{}' sem guia
--             THEN jsonb_build_object('delivery_note_id', p_delivery_note_id,
--                                     'delivery_note_number', v_note_number,
--                                     'delivery_note_checks', v_checks)
--             ELSE '{}'::jsonb END
--     || CASE WHEN v_conv THEN jsonb_build_object('unit_conversion', true) ELSE '{}'::jsonb END;  -- NOVO (códigos)
--
--   IF NOT v_dry THEN
--     UPDATE public.receiving_scans SET result = v_result WHERE id = p_request_id;
--   END IF;
--
--   RETURN v_result;
-- END;
-- $function$;
-- CREATE OR REPLACE FUNCTION public.rpc_delivery_note_save(p_delivery_note_id uuid, p_supplier_id uuid, p_note_number text, p_document_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text, p_purchase_order_ids uuid[] DEFAULT NULL::uuid[], p_lines jsonb DEFAULT NULL::jsonb, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_actor      uuid;
--   v_org        uuid;
--   v_number     text := btrim(COALESCE(p_note_number, ''));
--   v_notes      text := nullif(btrim(COALESCE(p_notes, '')), '');
--   v_cur        public.supplier_delivery_notes%ROWTYPE;
--   v_exists     boolean;
--   v_cur_pos    uuid[];
--   v_new_pos    uuid[];
--   v_final_pos  uuid[];
--   v_po         record;
--   v_el         jsonb;
--   v_ord        bigint;
--   v_prod       record;
--   v_poi        record;
--   v_uom        uuid;
--   v_factor     integer;
--   v_qty        numeric;
--   v_poi_id     uuid;
--   v_desc       text;
--   v_lines      jsonb := '[]'::jsonb;
--   v_cur_lines  jsonb;
--   v_dup        uuid;
--   v_removed    text;
-- BEGIN
--   v_actor := public.current_business_user_id();
--   IF v_actor IS NULL THEN
--     RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   IF p_delivery_note_id IS NULL THEN
--     RAISE EXCEPTION 'Identificador da guia em falta' USING ERRCODE = 'check_violation';
--   END IF;
--
--   SELECT organization_id INTO v_org
--   FROM public.suppliers
--   WHERE id = p_supplier_id AND deleted_at IS NULL;
--   IF v_org IS NULL THEN
--     RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
--      OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive') THEN
--     RAISE EXCEPTION 'Sem permissão para registar guias desta organização' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   IF v_number = '' THEN
--     RAISE EXCEPTION 'Indica o número da guia' USING ERRCODE = 'check_violation';
--   END IF;
--   IF char_length(v_number) > 100 THEN
--     RAISE EXCEPTION 'Número da guia demasiado longo' USING ERRCODE = 'check_violation';
--   END IF;
--   IF char_length(v_notes) > 2000 THEN
--     RAISE EXCEPTION 'Notas da guia demasiado longas' USING ERRCODE = 'check_violation';
--   END IF;
--
--   -- Guia existente: trancada até ao fim (espera pelas leituras em curso).
--   SELECT * INTO v_cur FROM public.supplier_delivery_notes WHERE id = p_delivery_note_id FOR UPDATE;
--   v_exists := FOUND;
--
--   IF v_exists THEN
--     IF v_cur.organization_id IS DISTINCT FROM v_org THEN
--       RAISE EXCEPTION 'Esta guia pertence a outra organização' USING ERRCODE = 'insufficient_privilege';
--     END IF;
--     IF v_cur.supplier_id IS DISTINCT FROM p_supplier_id THEN
--       RAISE EXCEPTION 'A guia % é de outro fornecedor (o fornecedor de uma guia não muda)', v_cur.note_number
--         USING ERRCODE = 'check_violation';
--     END IF;
--     SELECT COALESCE(array_agg(purchase_order_id ORDER BY purchase_order_id), ARRAY[]::uuid[]) INTO v_cur_pos
--     FROM public.supplier_delivery_note_orders WHERE delivery_note_id = p_delivery_note_id;
--   ELSE
--     v_cur_pos := ARRAY[]::uuid[];
--   END IF;
--
--   -- POs pedidas: mesma organização e fornecedor; as que entram de novo não
--   -- podem estar apagadas nem canceladas.
--   IF p_purchase_order_ids IS NOT NULL THEN
--     IF cardinality(p_purchase_order_ids) > 100 THEN
--       RAISE EXCEPTION 'Demasiadas encomendas numa guia (máximo 100)' USING ERRCODE = 'check_violation';
--     END IF;
--     SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), ARRAY[]::uuid[]) INTO v_new_pos
--     FROM unnest(p_purchase_order_ids) x WHERE x IS NOT NULL;
--
--     FOR v_po IN
--       SELECT x AS id, po.organization_id, po.supplier_id, po.order_number, po.status, po.deleted_at
--       FROM unnest(v_new_pos) x
--       LEFT JOIN public.purchase_orders po ON po.id = x
--     LOOP
--       IF v_po.organization_id IS DISTINCT FROM v_org THEN
--         RAISE EXCEPTION 'Encomenda a fornecedor não encontrada nesta organização' USING ERRCODE = 'no_data_found';
--       END IF;
--       IF v_po.supplier_id IS DISTINCT FROM p_supplier_id THEN
--         RAISE EXCEPTION '% é de outro fornecedor', v_po.order_number USING ERRCODE = 'check_violation';
--       END IF;
--       IF NOT (v_po.id = ANY (v_cur_pos)) AND (v_po.deleted_at IS NOT NULL OR v_po.status = 'cancelled') THEN
--         RAISE EXCEPTION '% está apagada ou cancelada', v_po.order_number USING ERRCODE = 'check_violation';
--       END IF;
--     END LOOP;
--     v_final_pos := v_new_pos;
--   ELSE
--     v_final_pos := v_cur_pos;
--   END IF;
--
--   -- Linhas anunciadas: normalizadas para comparar e gravar.
--   IF p_lines IS NOT NULL THEN
--     IF jsonb_typeof(p_lines) <> 'array' THEN
--       RAISE EXCEPTION 'As linhas da guia têm de ser uma lista' USING ERRCODE = 'check_violation';
--     END IF;
--     IF jsonb_array_length(p_lines) > 500 THEN
--       RAISE EXCEPTION 'Demasiadas linhas numa guia (máximo 500)' USING ERRCODE = 'check_violation';
--     END IF;
--
--     FOR v_el, v_ord IN SELECT e, o FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(e, o) LOOP
--       IF jsonb_typeof(v_el) <> 'object' THEN
--         RAISE EXCEPTION 'Linha % da guia inválida', v_ord USING ERRCODE = 'check_violation';
--       END IF;
--       BEGIN
--         v_qty    := (v_el ->> 'quantity')::numeric;
--         v_uom    := nullif(v_el ->> 'uom_id', '')::uuid;
--         v_poi_id := nullif(v_el ->> 'purchase_order_item_id', '')::uuid;
--         SELECT id, name, uom_id INTO v_prod
--         FROM public.products
--         WHERE id = nullif(v_el ->> 'product_id', '')::uuid
--           AND organization_id = v_org AND deleted_at IS NULL AND NOT is_deleted;
--       EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value THEN
--         RAISE EXCEPTION 'Linha % da guia com dados inválidos', v_ord USING ERRCODE = 'check_violation';
--       END;
--       IF v_prod.id IS NULL THEN
--         RAISE EXCEPTION 'Linha % da guia: produto inválido para esta organização', v_ord USING ERRCODE = 'check_violation';
--       END IF;
--       IF v_qty IS NULL OR v_qty <= 0 OR v_qty > 1000000000 THEN
--         RAISE EXCEPTION 'Linha % da guia: a quantidade tem de ser positiva', v_ord USING ERRCODE = 'check_violation';
--       END IF;
--       v_desc := nullif(btrim(COALESCE(v_el ->> 'description', '')), '');
--       IF char_length(v_desc) > 500 THEN
--         RAISE EXCEPTION 'Linha % da guia: descrição demasiado longa', v_ord USING ERRCODE = 'check_violation';
--       END IF;
--
--       -- Unidade da linha: a do produto se não indicada ou igual.
--       IF v_uom IS NOT DISTINCT FROM v_prod.uom_id THEN
--         v_uom := NULL;
--       END IF;
--       v_factor := public.fn_uom_units_per(v_uom, v_prod.id);
--
--       IF v_poi_id IS NOT NULL THEN
--         SELECT poi.id, poi.product_id, poi.item_type, COALESCE(poi.units_per_uom, 1) AS units_per_uom,
--                poi.description, po.id AS po_id, po.supplier_id, po.order_number, po.organization_id
--         INTO v_poi
--         FROM public.purchase_order_items poi
--         JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
--         WHERE poi.id = v_poi_id AND po.deleted_at IS NULL;
--         IF NOT FOUND OR v_poi.organization_id IS DISTINCT FROM v_org THEN
--           RAISE EXCEPTION 'Linha % da guia: linha de encomenda não encontrada', v_ord USING ERRCODE = 'no_data_found';
--         END IF;
--         IF v_poi.supplier_id IS DISTINCT FROM p_supplier_id THEN
--           RAISE EXCEPTION 'Linha % da guia: a linha "%" (%) é de outro fornecedor', v_ord, v_poi.description, v_poi.order_number
--             USING ERRCODE = 'check_violation';
--         END IF;
--         IF v_poi.item_type <> 'product' OR v_poi.product_id IS DISTINCT FROM v_prod.id THEN
--           RAISE EXCEPTION 'Linha % da guia: a linha "%" (%) não é deste produto', v_ord, v_poi.description, v_poi.order_number
--             USING ERRCODE = 'check_violation';
--         END IF;
--         -- NOVO (códigos, decisão 7): a linha da guia pode estar noutra unidade
--         -- da mesma base que a linha da PO (os dois fatores são sobre a unidade
--         -- de stock do produto; fn_uom_units_per já recusou unidades de outra base).
--         IF cardinality(v_final_pos) > 0 AND NOT (v_poi.po_id = ANY (v_final_pos)) THEN
--           RAISE EXCEPTION 'Linha % da guia: % não está nas encomendas da guia', v_ord, v_poi.order_number
--             USING ERRCODE = 'check_violation';
--         END IF;
--       END IF;
--
--       v_lines := v_lines || jsonb_build_object(
--         'position', v_ord::integer, 'product_id', v_prod.id, 'uom_id', v_uom, 'units_per_uom', v_factor,
--         'quantity', v_qty, 'purchase_order_item_id', v_poi_id, 'description', v_desc);
--     END LOOP;
--   END IF;
--
--   IF v_exists THEN
--     SELECT COALESCE(jsonb_agg(jsonb_build_object(
--              'position', l.position, 'product_id', l.product_id, 'uom_id', l.uom_id, 'units_per_uom', l.units_per_uom,
--              'quantity', l.quantity, 'purchase_order_item_id', l.purchase_order_item_id, 'description', l.description)
--              ORDER BY l.position, l.id), '[]'::jsonb)
--     INTO v_cur_lines
--     FROM public.supplier_delivery_note_lines l WHERE l.delivery_note_id = p_delivery_note_id;
--
--     -- Pedido igual ao gravado (repetição da criação ou edição sem mudanças).
--     IF v_cur.note_number = v_number
--        AND v_cur.document_date IS NOT DISTINCT FROM p_document_date
--        AND v_cur.notes IS NOT DISTINCT FROM v_notes
--        AND v_final_pos = v_cur_pos
--        AND (p_lines IS NULL OR v_lines = v_cur_lines) THEN
--       RETURN public.rpc_delivery_note_get(p_delivery_note_id) || jsonb_build_object('saved', false);
--     END IF;
--
--     IF p_expected_updated_at IS NULL OR p_expected_updated_at IS DISTINCT FROM v_cur.updated_at THEN
--       RAISE EXCEPTION 'A guia % foi alterada entretanto — abre-a de novo antes de editar', v_cur.note_number
--         USING ERRCODE = 'serialization_failure';
--     END IF;
--     IF v_cur.status <> 'open' THEN
--       RAISE EXCEPTION 'A guia % está %; só uma guia aberta pode ser editada', v_cur.note_number,
--         CASE v_cur.status WHEN 'closed' THEN 'fechada' ELSE 'cancelada' END
--         USING ERRCODE = 'check_violation';
--     END IF;
--
--     -- Não retirar POs que já têm receções ativas por esta guia.
--     SELECT string_agg(DISTINCT po.order_number, ', ') INTO v_removed
--     FROM public.purchase_order_receipts pr
--     JOIN public.purchase_orders po ON po.id = pr.purchase_order_id
--     WHERE pr.delivery_note_id = p_delivery_note_id
--       AND pr.kind = 'receipt' AND pr.reverted_at IS NULL
--       AND pr.purchase_order_id = ANY (v_cur_pos)
--       AND NOT (pr.purchase_order_id = ANY (v_final_pos));
--     IF v_removed IS NOT NULL THEN
--       RAISE EXCEPTION 'Não podes retirar % da guia: já tem receções por esta guia', v_removed
--         USING ERRCODE = 'check_violation';
--     END IF;
--     -- Guia que passa a ter POs: as receções ativas têm de caber nelas.
--     IF cardinality(v_final_pos) > 0 THEN
--       SELECT string_agg(DISTINCT po.order_number, ', ') INTO v_removed
--       FROM public.purchase_order_receipts pr
--       JOIN public.purchase_orders po ON po.id = pr.purchase_order_id
--       WHERE pr.delivery_note_id = p_delivery_note_id
--         AND pr.kind = 'receipt' AND pr.reverted_at IS NULL
--         AND NOT (pr.purchase_order_id = ANY (v_final_pos));
--       IF v_removed IS NOT NULL THEN
--         RAISE EXCEPTION 'A guia já tem receções em % — essas encomendas têm de ficar na guia', v_removed
--           USING ERRCODE = 'check_violation';
--       END IF;
--     END IF;
--   END IF;
--
--   -- Nº repetido no mesmo fornecedor (guias não canceladas).
--   SELECT id INTO v_dup
--   FROM public.supplier_delivery_notes
--   WHERE organization_id = v_org AND supplier_id = p_supplier_id
--     AND lower(btrim(note_number)) = lower(v_number)
--     AND status <> 'cancelled' AND id <> p_delivery_note_id
--   LIMIT 1;
--   IF v_dup IS NOT NULL THEN
--     RAISE EXCEPTION 'Já existe a guia % deste fornecedor', v_number
--       USING ERRCODE = 'unique_violation', DETAIL = v_dup::text,
--             HINT = 'Abre a guia existente (id em DETAIL).';
--   END IF;
--
--   BEGIN
--     IF v_exists THEN
--       UPDATE public.supplier_delivery_notes
--       SET note_number   = v_number,
--           document_date = p_document_date,
--           notes         = v_notes,
--           updated_at    = clock_timestamp()
--       WHERE id = p_delivery_note_id;
--     ELSE
--       INSERT INTO public.supplier_delivery_notes (
--         id, organization_id, supplier_id, note_number, document_date, notes, created_by, created_at, updated_at
--       ) VALUES (
--         p_delivery_note_id, v_org, p_supplier_id, v_number, p_document_date, v_notes, v_actor, now(), clock_timestamp()
--       )
--       ON CONFLICT (id) DO NOTHING;
--       IF NOT FOUND THEN
--         -- Mesmo id criado em paralelo: o cliente repete e cai na comparação.
--         RAISE EXCEPTION 'Guia em conflito — tenta de novo' USING ERRCODE = 'serialization_failure';
--       END IF;
--     END IF;
--   EXCEPTION WHEN unique_violation THEN
--     SELECT id INTO v_dup
--     FROM public.supplier_delivery_notes
--     WHERE organization_id = v_org AND supplier_id = p_supplier_id
--       AND lower(btrim(note_number)) = lower(v_number)
--       AND status <> 'cancelled' AND id <> p_delivery_note_id
--     LIMIT 1;
--     RAISE EXCEPTION 'Já existe a guia % deste fornecedor', v_number
--       USING ERRCODE = 'unique_violation', DETAIL = COALESCE(v_dup::text, ''),
--             HINT = 'Abre a guia existente (id em DETAIL).';
--   END;
--
--   IF v_final_pos IS DISTINCT FROM v_cur_pos THEN
--     DELETE FROM public.supplier_delivery_note_orders
--     WHERE delivery_note_id = p_delivery_note_id AND NOT (purchase_order_id = ANY (v_final_pos));
--     INSERT INTO public.supplier_delivery_note_orders (delivery_note_id, purchase_order_id, organization_id, created_by)
--     SELECT p_delivery_note_id, x, v_org, v_actor
--     FROM unnest(v_final_pos) x
--     WHERE NOT (x = ANY (v_cur_pos));
--   END IF;
--
--   IF p_lines IS NOT NULL AND (NOT v_exists OR v_lines IS DISTINCT FROM v_cur_lines) THEN
--     DELETE FROM public.supplier_delivery_note_lines WHERE delivery_note_id = p_delivery_note_id;
--     INSERT INTO public.supplier_delivery_note_lines (
--       delivery_note_id, organization_id, position, product_id, uom_id, units_per_uom, quantity,
--       purchase_order_item_id, description, created_by
--     )
--     SELECT p_delivery_note_id, v_org, l.position, l.product_id, l.uom_id, l.units_per_uom, l.quantity,
--            l.purchase_order_item_id, l.description, v_actor
--     FROM jsonb_to_recordset(v_lines) AS l(position integer, product_id uuid, uom_id uuid, units_per_uom integer,
--                                           quantity numeric, purchase_order_item_id uuid, description text);
--   END IF;
--
--   RETURN public.rpc_delivery_note_get(p_delivery_note_id) || jsonb_build_object('saved', true);
-- END;
-- $function$;
-- CREATE OR REPLACE FUNCTION public.rpc_delivery_note_close(p_delivery_note_id uuid, p_notes text DEFAULT NULL::text, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_actor   uuid;
--   v_note    public.supplier_delivery_notes%ROWTYPE;
--   v_notes   text := nullif(btrim(COALESCE(p_notes, '')), '');
--   v_summary jsonb;
-- BEGIN
--   v_actor := public.current_business_user_id();
--   IF v_actor IS NULL THEN
--     RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   SELECT * INTO v_note FROM public.supplier_delivery_notes WHERE id = p_delivery_note_id FOR UPDATE;
--   IF NOT FOUND
--      OR v_note.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
--     RAISE EXCEPTION 'Guia do fornecedor não encontrada' USING ERRCODE = 'no_data_found';
--   END IF;
--   IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive') THEN
--     RAISE EXCEPTION 'Sem permissão para fechar guias desta organização' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   IF v_note.status = 'closed' THEN
--     RETURN public.rpc_delivery_note_get(p_delivery_note_id) || jsonb_build_object('changed', false);
--   END IF;
--   IF v_note.status = 'cancelled' THEN
--     RAISE EXCEPTION 'A guia % está cancelada', v_note.note_number USING ERRCODE = 'check_violation';
--   END IF;
--   IF p_expected_updated_at IS NOT NULL AND p_expected_updated_at IS DISTINCT FROM v_note.updated_at THEN
--     RAISE EXCEPTION 'A guia % foi alterada entretanto — abre-a de novo antes de fechar', v_note.note_number
--       USING ERRCODE = 'serialization_failure';
--   END IF;
--   IF char_length(v_notes) > 2000 THEN
--     RAISE EXCEPTION 'Nota de fecho demasiado longa' USING ERRCODE = 'check_violation';
--   END IF;
--
--   v_summary := public.fn_delivery_note_summary(p_delivery_note_id);
--   IF (v_summary ->> 'has_divergences')::boolean AND v_notes IS NULL THEN
--     RAISE EXCEPTION 'A guia % tem divergências (% produto(s)) — indica uma nota para fechar',
--       v_note.note_number, v_summary -> 'totals' ->> 'divergences'
--       USING ERRCODE = 'check_violation';
--   END IF;
--
--   UPDATE public.supplier_delivery_notes
--   SET status        = 'closed',
--       closed_at     = now(),
--       closed_by     = v_actor,
--       close_notes   = v_notes,
--       close_summary = v_summary,
--       history       = history || jsonb_build_array(jsonb_build_object(
--                         'action', 'close', 'at', now(), 'by', v_actor, 'notes', v_notes,
--                         'divergences', v_summary -> 'totals' -> 'divergences')),
--       updated_at    = clock_timestamp()
--   WHERE id = p_delivery_note_id;
--
--   RETURN public.rpc_delivery_note_get(p_delivery_note_id) || jsonb_build_object('changed', true);
-- END;
-- $function$;
-- CREATE OR REPLACE FUNCTION public.rpc_delivery_note_reopen(p_delivery_note_id uuid, p_reason text)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_actor  uuid;
--   v_note   public.supplier_delivery_notes%ROWTYPE;
--   v_reason text := nullif(btrim(COALESCE(p_reason, '')), '');
-- BEGIN
--   v_actor := public.current_business_user_id();
--   IF v_actor IS NULL THEN
--     RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   SELECT * INTO v_note FROM public.supplier_delivery_notes WHERE id = p_delivery_note_id FOR UPDATE;
--   IF NOT FOUND
--      OR v_note.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
--     RAISE EXCEPTION 'Guia do fornecedor não encontrada' USING ERRCODE = 'no_data_found';
--   END IF;
--   IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive') THEN
--     RAISE EXCEPTION 'Sem permissão para reabrir guias desta organização' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   IF v_note.status = 'open' THEN
--     RETURN public.rpc_delivery_note_get(p_delivery_note_id) || jsonb_build_object('changed', false);
--   END IF;
--   IF v_note.status = 'cancelled' THEN
--     RAISE EXCEPTION 'A guia % está cancelada', v_note.note_number USING ERRCODE = 'check_violation';
--   END IF;
--   IF v_reason IS NULL THEN
--     RAISE EXCEPTION 'Indica o motivo para reabrir a guia' USING ERRCODE = 'check_violation';
--   END IF;
--   IF char_length(v_reason) > 1000 THEN
--     RAISE EXCEPTION 'Motivo demasiado longo' USING ERRCODE = 'check_violation';
--   END IF;
--
--   UPDATE public.supplier_delivery_notes
--   SET status        = 'open',
--       history       = history || jsonb_build_array(jsonb_build_object(
--                         'action', 'reopen', 'at', now(), 'by', v_actor, 'reason', v_reason,
--                         'previous_close', jsonb_build_object(
--                           'closed_at', closed_at, 'closed_by', closed_by,
--                           'close_notes', close_notes, 'close_summary', close_summary))),
--       closed_at     = NULL,
--       closed_by     = NULL,
--       close_notes   = NULL,
--       close_summary = NULL,
--       updated_at    = clock_timestamp()
--   WHERE id = p_delivery_note_id;
--
--   RETURN public.rpc_delivery_note_get(p_delivery_note_id) || jsonb_build_object('changed', true);
-- END;
-- $function$;
-- CREATE OR REPLACE FUNCTION public.rpc_delivery_note_cancel(p_delivery_note_id uuid, p_reason text)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_actor  uuid;
--   v_note   public.supplier_delivery_notes%ROWTYPE;
--   v_reason text := nullif(btrim(COALESCE(p_reason, '')), '');
--   v_active integer;
-- BEGIN
--   v_actor := public.current_business_user_id();
--   IF v_actor IS NULL THEN
--     RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   SELECT * INTO v_note FROM public.supplier_delivery_notes WHERE id = p_delivery_note_id FOR UPDATE;
--   IF NOT FOUND
--      OR v_note.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
--     RAISE EXCEPTION 'Guia do fornecedor não encontrada' USING ERRCODE = 'no_data_found';
--   END IF;
--   IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive') THEN
--     RAISE EXCEPTION 'Sem permissão para cancelar guias desta organização' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   IF v_note.status = 'cancelled' THEN
--     RETURN public.rpc_delivery_note_get(p_delivery_note_id) || jsonb_build_object('changed', false);
--   END IF;
--   IF v_reason IS NULL THEN
--     RAISE EXCEPTION 'Indica o motivo para cancelar a guia' USING ERRCODE = 'check_violation';
--   END IF;
--   IF char_length(v_reason) > 1000 THEN
--     RAISE EXCEPTION 'Motivo demasiado longo' USING ERRCODE = 'check_violation';
--   END IF;
--
--   SELECT count(*) INTO v_active
--   FROM public.purchase_order_receipts
--   WHERE delivery_note_id = p_delivery_note_id AND kind = 'receipt' AND reverted_at IS NULL;
--   IF v_active > 0 THEN
--     RAISE EXCEPTION 'A guia % tem % receção(ões) ativa(s) — reverte-as primeiro na encomenda', v_note.note_number, v_active
--       USING ERRCODE = 'check_violation';
--   END IF;
--
--   UPDATE public.supplier_delivery_notes
--   SET status        = 'cancelled',
--       cancelled_at  = now(),
--       cancelled_by  = v_actor,
--       cancel_reason = v_reason,
--       history       = history || jsonb_build_array(jsonb_build_object(
--                         'action', 'cancel', 'at', now(), 'by', v_actor, 'reason', v_reason, 'previous_status', status)),
--       updated_at    = clock_timestamp()
--   WHERE id = p_delivery_note_id;
--
--   RETURN public.rpc_delivery_note_get(p_delivery_note_id) || jsonb_build_object('changed', true);
-- END;
-- $function$;
-- CREATE OR REPLACE FUNCTION public.rpc_product_code_learn(p_id uuid, p_warehouse_id uuid, p_code text, p_kind text, p_product_id uuid, p_uom_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_set_product_uom boolean DEFAULT false)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_uid       uuid := auth.uid();
--   v_actor     uuid;
--   v_org       uuid;
--   v_code      text := btrim(COALESCE(p_code, ''));
--   v_kind      text := lower(btrim(COALESCE(p_kind, '')));
--   v_key       text;
--   v_source    text;
--   v_can_edit  boolean;
--   v_can_wh    boolean;
--   v_prod      record;
--   v_uom       uuid;
--   v_req_uom   uuid;
--   v_factor    integer;
--   v_un        uuid;
--   v_conf      text;
--   v_row       public.product_codes%ROWTYPE;
--   v_other     record;
--   v_already   text;
--   v_existing  uuid;
--   v_annulled  jsonb := '[]'::jsonb;
--   v_warnings  jsonb := '[]'::jsonb;
--   v_uom_set   boolean := false;
--   v_prev_src  text;
--   v_cn        text;
--   v_txt       text;
--   v_main_set  boolean := false;  -- products.barcode gravado nesta chamada
-- BEGIN
--   v_actor := public.current_business_user_id();
--   IF v_actor IS NULL THEN
--     RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--   IF p_id IS NULL THEN
--     RAISE EXCEPTION 'Identificador da associação em falta' USING ERRCODE = 'check_violation';
--   END IF;
--   IF p_product_id IS NULL THEN
--     RAISE EXCEPTION 'Indica o produto' USING ERRCODE = 'check_violation';
--   END IF;
--
--   IF p_warehouse_id IS NOT NULL THEN
--     SELECT organization_id INTO v_org FROM public.warehouses WHERE id = p_warehouse_id AND deleted_at IS NULL;
--     IF v_org IS NULL THEN
--       RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
--     END IF;
--     v_source := 'receiving';
--   ELSE
--     SELECT organization_id INTO v_org FROM public.products WHERE id = p_product_id;
--     IF v_org IS NULL THEN
--       RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'no_data_found';
--     END IF;
--     v_source := 'product_form';
--   END IF;
--
--   v_can_edit := public.has_anew_permission(v_uid, 'products.edit');
--   v_can_wh   := public.has_anew_permission(v_uid, 'purchase_orders.receive')
--             AND public.has_anew_permission(v_uid, 'inventory.edit');
--   IF v_org NOT IN (SELECT public.get_user_visible_org_ids(v_uid)) OR NOT (v_can_edit OR v_can_wh) THEN
--     RAISE EXCEPTION 'Sem permissão para associar códigos a produtos desta organização' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   -- Produto (trancado se a unidade do produto pode mudar ou, num código de
--   -- barras, se o código principal pode ser preenchido — mesma ordem que a
--   -- edição do produto: linha do produto antes do advisory da chave).
--   IF COALESCE(p_set_product_uom, false) OR v_kind = 'barcode' THEN
--     SELECT id, name, sku, barcode, uom_id, organization_id, deleted_at, is_deleted INTO v_prod
--     FROM public.products WHERE id = p_product_id FOR NO KEY UPDATE;
--   ELSE
--     SELECT id, name, sku, barcode, uom_id, organization_id, deleted_at, is_deleted INTO v_prod
--     FROM public.products WHERE id = p_product_id;
--   END IF;
--   IF v_prod.id IS NULL OR v_prod.organization_id IS DISTINCT FROM v_org
--      OR v_prod.deleted_at IS NOT NULL OR v_prod.is_deleted THEN
--     RAISE EXCEPTION 'Produto inválido para esta organização' USING ERRCODE = 'check_violation';
--   END IF;
--
--   -- Pedido já processado → devolve o gravado (tem de ser igual).
--   SELECT * INTO v_row FROM public.product_codes WHERE id = p_id;
--   IF FOUND THEN
--     v_req_uom := CASE WHEN p_uom_id IS NOT DISTINCT FROM v_prod.uom_id THEN NULL ELSE p_uom_id END;
--     IF v_row.organization_id IS DISTINCT FROM v_org OR v_row.created_by IS DISTINCT FROM v_actor THEN
--       RAISE EXCEPTION 'Esta associação pertence a outro utilizador ou organização' USING ERRCODE = 'insufficient_privilege';
--     END IF;
--     IF v_row.product_id IS DISTINCT FROM p_product_id OR v_row.kind IS DISTINCT FROM v_kind
--        OR v_row.code_key IS DISTINCT FROM public.fn_product_code_key(v_code)
--        OR v_row.supplier_id IS DISTINCT FROM p_supplier_id OR v_row.uom_id IS DISTINCT FROM v_req_uom THEN
--       RAISE EXCEPTION 'O identificador da associação já foi usado noutra associação (outro código, produto, unidade ou fornecedor)'
--         USING ERRCODE = 'check_violation';
--     END IF;
--     RETURN public.fn_product_code_json(p_id)
--       || jsonb_build_object('replayed', true, 'learned', v_row.deleted_at IS NULL, 'already', NULL,
--                             'product_uom_set', COALESCE((v_row.context ->> 'product_uom_set')::boolean, false),
--                             'annulled', COALESCE(v_row.context -> 'annulled', '[]'::jsonb), 'warnings', '[]'::jsonb,
--                             'main_barcode_set', false);
--   END IF;
--
--   IF v_code = '' THEN
--     RAISE EXCEPTION 'Indica o código lido' USING ERRCODE = 'check_violation';
--   END IF;
--   IF char_length(v_code) > 200 THEN
--     RAISE EXCEPTION 'Código demasiado longo' USING ERRCODE = 'check_violation';
--   END IF;
--   IF v_kind NOT IN ('barcode', 'supplier_ref') THEN
--     RAISE EXCEPTION 'Tipo de código inválido (barcode ou supplier_ref)' USING ERRCODE = 'check_violation';
--   END IF;
--   v_key := public.fn_product_code_key(v_code);
--
--   IF v_kind = 'supplier_ref' AND p_supplier_id IS NULL THEN
--     RAISE EXCEPTION 'Indica o fornecedor da referência' USING ERRCODE = 'check_violation';
--   END IF;
--   IF p_supplier_id IS NOT NULL AND NOT EXISTS (
--     SELECT 1 FROM public.suppliers WHERE id = p_supplier_id AND organization_id = v_org AND deleted_at IS NULL
--   ) THEN
--     RAISE EXCEPTION 'Fornecedor inválido para esta organização' USING ERRCODE = 'check_violation';
--   END IF;
--
--   v_prev_src := current_setting('app.audit_source', true);
--   IF v_source = 'receiving' THEN
--     PERFORM set_config('app.audit_source', 'receiving', true);
--   END IF;
--
--   -- Produto sem unidade: definir 'un' (opcional, sem conflitos).
--   IF v_prod.uom_id IS NULL AND COALESCE(p_set_product_uom, false) THEN
--     IF NOT v_can_edit THEN
--       RAISE EXCEPTION 'Definir a unidade do produto exige permissão para editar produtos' USING ERRCODE = 'insufficient_privilege';
--     END IF;
--     SELECT id INTO v_un FROM public.uom
--     WHERE organization_id IS NULL AND base_uom_id IS NULL AND lower(btrim(code)) = 'un'
--     ORDER BY id LIMIT 1;
--     IF v_un IS NULL THEN
--       RAISE EXCEPTION 'Unidade "un" não encontrada' USING ERRCODE = 'no_data_found';
--     END IF;
--     SELECT string_agg(format('%s %s', z.n, z.t), ', ' ORDER BY z.t) INTO v_conf
--     FROM (
--       SELECT 'linha(s) de encomenda a fornecedor' AS t, count(*) AS n FROM public.purchase_order_items WHERE product_id = p_product_id AND uom_id IS NOT NULL AND uom_id <> v_un
--       UNION ALL SELECT 'linha(s) de orçamento', count(*) FROM public.quote_lines WHERE product_id = p_product_id AND uom_id IS NOT NULL AND uom_id <> v_un
--       UNION ALL SELECT 'linha(s) de venda direta', count(*) FROM public.direct_sale_lines WHERE product_id = p_product_id AND uom_id IS NOT NULL AND uom_id <> v_un
--       UNION ALL SELECT 'ligação(ões) a fornecedores', count(*) FROM public.item_suppliers WHERE product_id = p_product_id AND deleted_at IS NULL AND uom_id IS NOT NULL AND uom_id <> v_un
--       UNION ALL SELECT 'material(is) de serviços', count(*) FROM public.service_materials WHERE product_id = p_product_id AND uom_id IS NOT NULL AND uom_id <> v_un
--       UNION ALL SELECT 'linha(s) de guias', count(*) FROM public.supplier_delivery_note_lines WHERE product_id = p_product_id AND uom_id IS NOT NULL AND uom_id <> v_un
--       UNION ALL SELECT 'código(s) aprendido(s)', count(*) FROM public.product_codes WHERE product_id = p_product_id AND deleted_at IS NULL AND uom_id IS NOT NULL AND uom_id <> v_un
--     ) z
--     WHERE z.n > 0;
--     IF v_conf IS NOT NULL THEN
--       RAISE EXCEPTION 'Não é possível definir a unidade "un" em «%»: já há % noutra unidade', v_prod.name, v_conf
--         USING ERRCODE = 'check_violation';
--     END IF;
--     UPDATE public.products SET uom_id = v_un WHERE id = p_product_id;
--     v_prod.uom_id := v_un;
--     v_uom_set := true;
--   END IF;
--
--   -- Unidade do código: NULL = a do produto.
--   v_uom := CASE WHEN p_uom_id IS NOT DISTINCT FROM v_prod.uom_id THEN NULL ELSE p_uom_id END;
--   IF v_uom IS NOT NULL AND v_prod.uom_id IS NULL
--      AND EXISTS (SELECT 1 FROM public.uom WHERE id = v_uom AND base_uom_id IS NULL) THEN
--     RAISE EXCEPTION 'O produto «%» não tem unidade definida — associa o código sem unidade ou define a unidade do produto', v_prod.name
--       USING ERRCODE = 'check_violation';
--   END IF;
--   v_factor := public.fn_uom_units_per(v_uom, p_product_id);  -- erro claro se incompatível
--
--   -- Conflitos (com o lock da chave detido).
--   IF v_kind = 'barcode' THEN
--     PERFORM pg_advisory_xact_lock(hashtextextended('product_code:' || v_org::text || ':' || v_key, 0));
--
--     IF public.fn_product_code_key(v_prod.barcode) = v_key THEN
--       IF v_uom IS NOT NULL THEN
--         RAISE EXCEPTION 'O código «%» já é o código de barras principal de «%» (na unidade do produto)', v_code, v_prod.name
--           USING ERRCODE = 'unique_violation', DETAIL = p_product_id::text;
--       END IF;
--       v_already := 'product_barcode';
--     END IF;
--
--     SELECT p.id, p.name, p.sku INTO v_other
--     FROM public.products p
--     WHERE p.organization_id = v_org AND p.id <> p_product_id
--       AND p.deleted_at IS NULL AND NOT p.is_deleted
--       AND public.fn_product_code_key(p.barcode) = v_key
--     ORDER BY p.id LIMIT 1;
--     IF FOUND THEN
--       RAISE EXCEPTION 'O código «%» já é o código de barras do produto «%» (%)', v_code, v_other.name, v_other.sku
--         USING ERRCODE = 'unique_violation', DETAIL = v_other.id::text;
--     END IF;
--   ELSE
--     PERFORM pg_advisory_xact_lock(hashtextextended('product_code:' || v_org::text || ':' || p_supplier_id::text || ':' || v_key, 0));
--
--     -- Referência na ficha do produto (item_suppliers) do mesmo fornecedor.
--     FOR v_other IN
--       SELECT i.product_id, p.name, p.sku,
--              CASE WHEN i.uom_id IS NOT DISTINCT FROM p.uom_id THEN NULL ELSE i.uom_id END AS uom_id
--       FROM public.item_suppliers i
--       JOIN public.products p ON p.id = i.product_id
--       WHERE i.organization_id = v_org AND i.supplier_id = p_supplier_id AND i.deleted_at IS NULL
--         AND i.product_id IS NOT NULL AND p.deleted_at IS NULL AND NOT p.is_deleted
--         AND public.fn_product_code_key(i.supplier_sku) = v_key
--       ORDER BY (i.product_id = p_product_id) DESC, i.id
--     LOOP
--       IF v_other.product_id <> p_product_id THEN
--         RAISE EXCEPTION 'A referência «%» deste fornecedor já está na ficha do produto «%» (%)', v_code, v_other.name, v_other.sku
--           USING ERRCODE = 'unique_violation', DETAIL = v_other.product_id::text;
--       ELSIF v_other.uom_id IS DISTINCT FROM v_uom THEN
--         RAISE EXCEPTION 'A referência «%» deste fornecedor já está na ficha de «%» noutra unidade', v_code, v_prod.name
--           USING ERRCODE = 'unique_violation', DETAIL = p_product_id::text;
--       ELSE
--         v_already := 'item_supplier';
--       END IF;
--     END LOOP;
--   END IF;
--
--   -- Códigos aprendidos ativos com a mesma chave (no máximo um: índices únicos).
--   FOR v_other IN
--     SELECT pc.id, pc.product_id, pc.uom_id, p.name, p.sku,
--            (p.deleted_at IS NULL AND NOT p.is_deleted) AS active
--     FROM public.product_codes pc
--     JOIN public.products p ON p.id = pc.product_id
--     WHERE pc.organization_id = v_org AND pc.kind = v_kind AND pc.deleted_at IS NULL AND pc.code_key = v_key
--       AND (v_kind = 'barcode' OR pc.supplier_id = p_supplier_id)
--     FOR UPDATE OF pc
--   LOOP
--     IF v_other.product_id = p_product_id THEN
--       IF v_other.uom_id IS DISTINCT FROM v_uom THEN
--         RAISE EXCEPTION 'O código «%» já está associado a «%» noutra unidade', v_code, v_prod.name
--           USING ERRCODE = 'unique_violation', DETAIL = p_product_id::text;
--       END IF;
--       v_already := 'product_code';
--       v_existing := v_other.id;
--     ELSIF v_other.active THEN
--       RAISE EXCEPTION 'O código «%» já está associado ao produto «%» (%)', v_code, v_other.name, v_other.sku
--         USING ERRCODE = 'unique_violation', DETAIL = v_other.product_id::text;
--     ELSE
--       -- Produto apagado não bloqueia: o código antigo é anulado.
--       UPDATE public.product_codes
--       SET deleted_at = now(), deleted_by = v_actor,
--           delete_reason = left(format('Produto «%s» apagado — código associado a «%s»', v_other.name, v_prod.name), 1000)
--       WHERE id = v_other.id;
--       v_annulled := v_annulled || to_jsonb(v_other.id);
--     END IF;
--   END LOOP;
--
--   -- Avisos: o código também é o SKU de outro produto (a leitura passa a
--   -- encontrar este primeiro — nível 1/2 antes do SKU).
--   SELECT string_agg(DISTINCT format('«%s» (%s)', p.name, p.sku), ', ') INTO v_txt
--   FROM public.products p
--   WHERE p.organization_id = v_org AND p.id <> p_product_id AND p.deleted_at IS NULL AND NOT p.is_deleted
--     AND lower(btrim(p.sku)) = lower(v_code);
--   IF v_txt IS NOT NULL THEN
--     v_warnings := v_warnings || to_jsonb(format('O código «%s» também é o SKU de %s — a leitura passa a encontrar «%s» primeiro', v_code, v_txt, v_prod.name));
--   END IF;
--
--   IF v_already IS NOT NULL THEN
--     PERFORM set_config('app.audit_source', COALESCE(v_prev_src, ''), true);
--     RETURN COALESCE(public.fn_product_code_json(v_existing),
--                     jsonb_build_object('id', NULL, 'code', v_code, 'code_key', v_key, 'kind', v_kind,
--                                        'product_id', p_product_id, 'product_name', v_prod.name, 'sku', v_prod.sku,
--                                        'uom_id', COALESCE(v_uom, v_prod.uom_id),
--                                        'uom_code', (SELECT code FROM public.uom WHERE id = COALESCE(v_uom, v_prod.uom_id)),
--                                        'is_pack', v_uom IS NOT NULL, 'units_per_uom', v_factor,
--                                        'supplier_id', p_supplier_id))
--       || jsonb_build_object('replayed', false, 'learned', false, 'already', v_already,
--                             'product_uom_set', v_uom_set, 'annulled', v_annulled, 'warnings', v_warnings,
--                             'main_barcode_set', false);
--   END IF;
--
--   BEGIN
--     INSERT INTO public.product_codes (
--       id, organization_id, code, kind, product_id, uom_id, supplier_id, source, context, created_by
--     ) VALUES (
--       p_id, v_org, v_code, v_kind, p_product_id, v_uom, p_supplier_id, v_source,
--       jsonb_strip_nulls(jsonb_build_object(
--         'warehouse_id', p_warehouse_id,
--         'product_uom_set', CASE WHEN v_uom_set THEN true END,
--         'annulled', CASE WHEN jsonb_array_length(v_annulled) > 0 THEN v_annulled END)),
--       v_actor
--     )
--     ON CONFLICT (id) DO NOTHING;
--     IF NOT FOUND THEN
--       RAISE EXCEPTION 'Associação em conflito — tenta de novo' USING ERRCODE = 'serialization_failure';
--     END IF;
--   EXCEPTION WHEN unique_violation THEN
--     GET STACKED DIAGNOSTICS v_cn = CONSTRAINT_NAME;
--     IF COALESCE(v_cn, '') = '' THEN
--       RAISE;  -- mensagem do gatilho (já com o nome do produto)
--     END IF;
--     RAISE EXCEPTION 'O código «%» acabou de ser associado a outro produto — lê de novo', v_code
--       USING ERRCODE = 'unique_violation';
--   END;
--
--   -- Código de barras da unidade do produto num produto sem código principal:
--   -- passa também a ser o products.barcode (a linha em product_codes fica).
--   -- Códigos de embalagem (v_uom não nulo) nunca: o principal é o da unidade.
--   -- Depois do INSERT, com o advisory da chave e a linha do produto detidos;
--   -- auditado (fn_generic_entity_audit) com a mesma origem do código.
--   IF v_kind = 'barcode' AND v_uom IS NULL AND public.fn_product_code_key(v_prod.barcode) IS NULL THEN
--     UPDATE public.products SET barcode = v_code
--     WHERE id = p_product_id AND public.fn_product_code_key(barcode) IS NULL;
--     v_main_set := FOUND;
--   END IF;
--
--   PERFORM set_config('app.audit_source', COALESCE(v_prev_src, ''), true);
--
--   RETURN public.fn_product_code_json(p_id)
--     || jsonb_build_object('replayed', false, 'learned', true, 'already', NULL,
--                           'product_uom_set', v_uom_set, 'annulled', v_annulled, 'warnings', v_warnings,
--                           'main_barcode_set', v_main_set);
-- END;
-- $function$;
-- CREATE OR REPLACE FUNCTION public.rpc_product_code_remove(p_id uuid, p_reason text)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_uid      uuid := auth.uid();
--   v_actor    uuid;
--   v_reason   text := btrim(COALESCE(p_reason, ''));
--   v_row      public.product_codes%ROWTYPE;
--   v_can_edit boolean;
--   v_can_wh   boolean;
--   v_already  boolean := false;
--   v_scans    integer;
--   v_main_cleared boolean := false;  -- products.barcode limpo nesta chamada
-- BEGIN
--   v_actor := public.current_business_user_id();
--   IF v_actor IS NULL THEN
--     RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   SELECT * INTO v_row FROM public.product_codes WHERE id = p_id FOR UPDATE;
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Código não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   v_can_edit := public.has_anew_permission(v_uid, 'products.edit');
--   v_can_wh   := public.has_anew_permission(v_uid, 'purchase_orders.receive')
--             AND public.has_anew_permission(v_uid, 'inventory.edit');
--   IF v_row.organization_id NOT IN (SELECT public.get_user_visible_org_ids(v_uid))
--      OR NOT (v_can_edit
--              OR (v_can_wh AND v_row.created_by = v_actor AND v_row.created_at > now() - interval '24 hours')) THEN
--     RAISE EXCEPTION 'Só quem associou o código (nas primeiras 24 h) ou quem edita produtos o pode remover'
--       USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   IF v_reason = '' THEN
--     RAISE EXCEPTION 'Indica o motivo' USING ERRCODE = 'check_violation';
--   END IF;
--   IF char_length(v_reason) > 1000 THEN
--     RAISE EXCEPTION 'Motivo demasiado longo' USING ERRCODE = 'check_violation';
--   END IF;
--
--   IF v_row.deleted_at IS NOT NULL THEN
--     v_already := true;
--   ELSE
--     UPDATE public.product_codes
--     SET deleted_at = now(), deleted_by = v_actor, delete_reason = v_reason
--     WHERE id = p_id;
--     -- O código removido era também o código principal (mesma chave): limpa-o.
--     IF v_row.kind = 'barcode' THEN
--       UPDATE public.products SET barcode = NULL
--       WHERE id = v_row.product_id AND public.fn_product_code_key(barcode) = v_row.code_key;
--       v_main_cleared := FOUND;
--     END IF;
--   END IF;
--
--   SELECT count(*) INTO v_scans
--   FROM public.receiving_scans s
--   WHERE s.organization_id = v_row.organization_id
--     AND s.product_id = v_row.product_id
--     AND s.created_at >= v_row.created_at
--     AND public.fn_product_code_key(s.code) = v_row.code_key;
--
--   RETURN public.fn_product_code_json(p_id)
--     || jsonb_build_object('removed', NOT v_already, 'already_removed', v_already, 'scans_using_code', v_scans,
--                           'main_barcode_cleared', v_main_cleared);
-- END;
-- $function$;
-- DELETE FROM public.anew_role_permissions WHERE permission_code LIKE 'receiving.%';  -- com DISABLE/ENABLE TRIGGER USER
-- DELETE FROM public.anew_permissions WHERE category = 'receiving';
