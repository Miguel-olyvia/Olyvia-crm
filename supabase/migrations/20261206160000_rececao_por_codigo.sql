-- 20261206160000: receção por código no armazém (Fase 2 — fatia 1)
--
-- O armazém lê um código (código de barras, referência do fornecedor ou SKU)
-- e uma quantidade; o sistema identifica o produto, escolhe as linhas de
-- encomenda a fornecedor em aberto e dá entrada pela receção da Fase 1
-- (rpc_receive_purchase_order_lines), que continua a decidir, linha a linha,
-- o que vai para a Encomenda Cliente e o que entra em stock.
--
-- Regras (decisões D1–D3):
--   D1 POs 'pending' (ainda não confirmadas ao fornecedor) também podem ser
--      recebidas; o lookup marca-as com confirmed=false e a receção avisa.
--   D2 Ordem de enchimento das linhas em aberto do produto:
--      1.º POs de Encomenda Cliente ativa (assinada, não apagada), pela data
--          da EC — mesmo critério FIFO de fn_client_order_line_reservations:
--          COALESCE(signature_date, status_changed_at, created_at), id;
--      2.º as restantes (stock, EC inativa) por expected_delivery (sem data
--          no fim), order_date, order_number;
--      dentro da PO pela ordem de criação da linha (created_at, id).
--      Cada linha é cheia até ao seu em aberto.
--   D3 Leitura acima do total em aberto → recusada por inteiro (23514), sem
--      receção parcial.
--   Só entram linhas na mesma unidade da leitura (units_per_uom igual ao
--   fator da unidade lida); as outras ficam em avisos.
--   Em aberto = quantity − received_quantity. Uma anulação do resto
--   (20261206140000) baixa quantity para received_quantity, por isso a linha
--   deixa de estar em aberto; desfazer a anulação reabre-a. Uma PO com tudo
--   anulado fica 'cancelled' e sai pelo filtro de estado. A necessidade da EC
--   descontada das anulações (20261206150000) é tratada pela Fase 1
--   (fn_po_receipt_allocation → fn_client_order_line_reservations).
--
-- Objetos:
--   + receiving_scans (registo das leituras e idempotência; RLS só leitura)
--   + purchase_order_receipts.receiving_scan_id (+ índice parcial)
--   + fn_receiving_open_lines (interna: linhas em aberto com a ordem D2)
--   + fn_receiving_scan_replay (interna: devolve a leitura já gravada)
--   + rpc_receiving_lookup (só leitura)
--   + rpc_receive_by_code
--   Nenhuma função da Fase 1 é alterada.
--
-- Concorrência (rpc_receive_by_code), sempre por esta ordem:
--   1. pg_advisory_xact_lock(hashtextextended('receiving:<org>:<produto>', 0))
--      — serializa leituras do mesmo produto;
--   2. FOR UPDATE das POs candidatas, ORDER BY id;
--   3. advisory locks 'po_receipt_contract:<EC>' (os mesmos da Fase 1;
--      reentrantes na mesma transação), ORDER BY id da EC;
--   4. só então relê o em aberto e reparte; as chamadas à Fase 1 voltam a
--      pedir os locks 2 e 3 (já detidos) e depois trancam linhas e stocks.
--   A Fase 1 tranca PO → EC → linhas → stocks; a reversão PO → linhas →
--   movimentos → stocks; a passagem para stock POs (por id) → linhas →
--   stocks; a anulação/desfazer (20261206140000) [lock do pedido de
--   material da EC →] PO → EC → linhas. Todas respeitam a ordem global
--   PO(id) → EC → linhas → stocks, e nenhuma tranca stocks antes de terminar
--   de trancar POs e ECs — não há ciclo de espera entre elas. O em aberto só
--   é lido depois de todas as POs estarem trancadas, e a Fase 1 volta a
--   validar o saldo de cada linha com FOR UPDATE — não há sobre-receção.
--   Exceção já existente (não criada aqui): fn_client_order_request_missing
--   tranca stocks ANTES da PO pendente da EC; contra uma receção da mesma PO
--   pendente o Postgres deteta o deadlock e anula uma das transações (40P01);
--   o cliente repete com o mesmo p_request_id sem risco de receber duas vezes.
--
-- Segurança: SECURITY DEFINER, search_path public, pg_temp; organização =
-- a do armazém, tem de estar em get_user_visible_org_ids(auth.uid());
-- receção exige purchase_orders.receive + inventory.edit (como a Fase 1,
-- que volta a verificar); o lookup aceita purchase_orders.receive ou
-- purchase_orders.view. Funções e tabela novas sem acesso para PUBLIC/anon.
--
-- Reversão no fim do ficheiro.

SET lock_timeout = '5s';

-- ── 1. Registo das leituras ────────────────────────────────────────────────
-- Uma linha por leitura recebida (não por dry-run). id = p_request_id gerado
-- pelo cliente: repetir o pedido (rede instável, duplo toque) devolve o
-- resultado gravado em vez de receber duas vezes. Só escrita pelas RPCs.
CREATE TABLE IF NOT EXISTS public.receiving_scans (
  id               uuid PRIMARY KEY,
  organization_id  uuid NOT NULL REFERENCES public.anew_organizations(id),
  warehouse_id     uuid REFERENCES public.warehouses(id),
  supplier_id      uuid REFERENCES public.suppliers(id),
  delivery_note_id uuid,  -- guia de remessa (fatia 2); sem FK por agora
  code             text,
  matched_by       text CHECK (matched_by IS NULL OR matched_by IN ('barcode', 'supplier_sku', 'sku', 'po_line_sku')),
  product_id       uuid,
  uom_id           uuid,
  quantity         numeric CHECK (quantity > 0),  -- na unidade lida
  units            numeric CHECK (units > 0),     -- unidades de stock
  result           jsonb NOT NULL,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.receiving_scans IS
  'Leituras de receção por código no armazém (uma por pedido; id = identificador do pedido do cliente, para idempotência). Só escrito por RPCs.';

CREATE INDEX IF NOT EXISTS idx_receiving_scans_org_created
  ON public.receiving_scans (organization_id, created_at DESC);

ALTER TABLE public.receiving_scans ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.receiving_scans FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.receiving_scans TO authenticated;
GRANT ALL ON TABLE public.receiving_scans TO service_role;

DROP POLICY IF EXISTS receiving_scans_select ON public.receiving_scans;
CREATE POLICY receiving_scans_select ON public.receiving_scans
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())));

-- ── 2. Ligação receção → leitura ───────────────────────────────────────────
ALTER TABLE public.purchase_order_receipts
  ADD COLUMN IF NOT EXISTS receiving_scan_id uuid
  REFERENCES public.receiving_scans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_order_receipts_scan
  ON public.purchase_order_receipts (receiving_scan_id) WHERE receiving_scan_id IS NOT NULL;

-- ── 3. Linhas em aberto (interna) ──────────────────────────────────────────
-- Linhas de produto em aberto das POs da organização, com a ordem D2
-- (allocation_rank por produto). Usada pelo lookup e pela receção para que
-- a ordem mostrada seja a ordem aplicada. Sem EXECUTE para authenticated.
CREATE OR REPLACE FUNCTION public.fn_receiving_open_lines(p_organization_id uuid, p_product_ids uuid[], p_supplier_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(purchase_order_id uuid, order_number text, po_status text, confirmed boolean, supplier_id uuid, supplier_name text, expected_delivery date, order_date date, purchase_order_item_id uuid, product_id uuid, description text, quantity numeric, received_quantity numeric, open_quantity numeric, uom_id uuid, units_per_uom integer, supplier_sku text, sku text, contract_id uuid, contract_order_number text, contract_active boolean, contract_sort_ts timestamptz, allocation_rank bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    x.po_id, x.order_number, x.status, x.status <> 'pending', x.supplier_id, x.supplier_name,
    x.expected_delivery, x.order_date, x.poi_id, x.product_id, x.description, x.quantity,
    x.received_quantity, x.quantity - x.received_quantity, x.uom_id, x.units_per_uom,
    x.supplier_sku, x.sku, x.contract_id, x.contract_order_number, x.contract_active,
    x.contract_sort_ts,
    row_number() OVER (
      PARTITION BY x.product_id
      ORDER BY x.contract_active DESC,
               CASE WHEN x.contract_active THEN x.contract_sort_ts END NULLS LAST,
               CASE WHEN x.contract_active THEN x.contract_id END NULLS LAST,
               x.expected_delivery NULLS LAST,
               x.order_date,
               x.order_number,
               x.poi_created_at,
               x.poi_id
    )
  FROM (
    SELECT
      po.id                AS po_id,
      po.order_number,
      po.status,
      po.supplier_id,
      s.name               AS supplier_name,
      po.expected_delivery,
      po.order_date,
      poi.id               AS poi_id,
      poi.product_id,
      poi.description,
      poi.quantity,
      poi.received_quantity,
      poi.uom_id,
      COALESCE(poi.units_per_uom, 1) AS units_per_uom,
      poi.supplier_sku,
      poi.sku,
      poi.created_at       AS poi_created_at,
      CASE WHEN po.source_type = 'contract' THEN po.source_id END AS contract_id,
      CASE WHEN po.source_type = 'contract' THEN COALESCE(cc.order_number, cc.contract_number) END AS contract_order_number,
      -- Mesma definição de EC ativa de fn_po_receipt_allocation.
      COALESCE(po.source_type = 'contract' AND cc.id IS NOT NULL
               AND cc.deleted_at IS NULL AND cc.status IN ('signed', 'assinado'), false) AS contract_active,
      COALESCE(cc.signature_date, cc.status_changed_at, cc.created_at) AS contract_sort_ts
    FROM public.purchase_orders po
    JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
    LEFT JOIN public.suppliers s ON s.id = po.supplier_id
    LEFT JOIN public.client_contracts cc
      ON po.source_type = 'contract'
     AND cc.id = po.source_id
     AND cc.organization_id = po.organization_id
    WHERE po.organization_id = p_organization_id
      AND po.deleted_at IS NULL
      AND po.status IN ('pending', 'ordered', 'partially_received')
      AND poi.item_type = 'product'
      AND poi.product_id = ANY (p_product_ids)
      AND poi.quantity > poi.received_quantity
      AND (p_supplier_id IS NULL OR po.supplier_id = p_supplier_id)
  ) x;
$function$;

REVOKE ALL ON FUNCTION public.fn_receiving_open_lines(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_receiving_open_lines(uuid, uuid[], uuid) TO service_role;

-- ── 4. Repetição de um pedido (interna) ────────────────────────────────────
-- Devolve o resultado gravado de p_request_id (com replayed=true), ou NULL
-- se não existir. Só o próprio utilizador, na mesma organização, e com os
-- mesmos dados de leitura — um identificador reutilizado para outra leitura
-- é erro do cliente e não pode devolver a receção de outra leitura.
CREATE OR REPLACE FUNCTION public.fn_receiving_scan_replay(p_request_id uuid, p_organization_id uuid, p_actor uuid, p_warehouse_id uuid, p_product_id uuid, p_quantity numeric, p_uom_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_scan public.receiving_scans%ROWTYPE;
BEGIN
  SELECT * INTO v_scan FROM public.receiving_scans WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_scan.organization_id IS DISTINCT FROM p_organization_id
     OR v_scan.created_by IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'Este pedido de receção pertence a outro utilizador ou organização'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_scan.warehouse_id IS DISTINCT FROM p_warehouse_id
     OR v_scan.product_id IS DISTINCT FROM p_product_id
     OR v_scan.quantity IS DISTINCT FROM p_quantity
     OR v_scan.uom_id IS DISTINCT FROM p_uom_id THEN
    RAISE EXCEPTION 'O identificador do pedido de receção já foi usado noutra leitura (outro produto, quantidade, unidade ou armazém)'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN v_scan.result || jsonb_build_object('replayed', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_receiving_scan_replay(uuid, uuid, uuid, uuid, uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_receiving_scan_replay(uuid, uuid, uuid, uuid, uuid, numeric, uuid) TO service_role;

-- ── 5. Identificar um código (só leitura) ──────────────────────────────────
-- Código: trim, sem distinção de maiúsculas, só correspondências exatas,
-- dentro da organização do armazém. Por ordem de prioridade (vence o
-- primeiro nível com resultados; os outros só geram aviso):
--   1 products.barcode
--   2 referência do fornecedor: purchase_order_items.supplier_sku das linhas
--     em aberto e item_suppliers.supplier_sku (do fornecedor, se indicado);
--     a unidade da linha/ligação é a unidade lida
--   3 products.sku
--   4 purchase_order_items.sku (SKU copiado para a linha da PO)
-- Candidato = (produto, unidade lida). 0 candidatos → found=false.
CREATE OR REPLACE FUNCTION public.rpc_receiving_lookup(p_warehouse_id uuid, p_code text, p_supplier_id uuid DEFAULT NULL::uuid)
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
BEGIN
  SELECT organization_id INTO v_org
  FROM public.warehouses
  WHERE id = p_warehouse_id AND deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT (public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
             OR public.has_anew_permission(auth.uid(), 'purchase_orders.view')) THEN
    RAISE EXCEPTION 'Sem permissão para consultar encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_can_receive := public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
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

  v_lc := lower(v_code);

  -- Correspondências (produto, unidade, nível) num jsonb — sem tabelas
  -- temporárias (função STABLE).
  SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', mm.product_id, 'uom_id', mm.uom_id,
                                               'matched_by', mm.matched_by, 'lvl', mm.lvl)), '[]'::jsonb)
  INTO v_matches
  FROM (
  -- 1 código de barras
  SELECT p.id AS product_id, NULL::uuid AS uom_id, 'barcode'::text AS matched_by, 1 AS lvl
  FROM public.products p
  WHERE p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND lower(btrim(p.barcode)) = v_lc
  UNION
  -- 2a referência do fornecedor nas linhas em aberto
  SELECT poi.product_id, poi.uom_id, 'supplier_sku', 2
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
  SELECT i.product_id, i.uom_id, 'supplier_sku', 2
  FROM public.item_suppliers i
  JOIN public.products p ON p.id = i.product_id
  WHERE i.organization_id = v_org AND i.deleted_at IS NULL AND i.product_id IS NOT NULL
    AND (p_supplier_id IS NULL OR i.supplier_id = p_supplier_id)
    AND p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND lower(btrim(i.supplier_sku)) = v_lc
  UNION
  -- 3 SKU do produto
  SELECT p.id, NULL::uuid, 'sku', 3
  FROM public.products p
  WHERE p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND lower(btrim(p.sku)) = v_lc
  UNION
  -- 4 SKU gravado nas linhas das POs da organização
  SELECT poi.product_id, NULL::uuid, 'po_line_sku', 4
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
    );
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
           p.name, p.sku, p.barcode
    FROM jsonb_to_recordset(v_matches) AS m(product_id uuid, uom_id uuid, matched_by text, lvl integer)
    JOIN public.products p ON p.id = m.product_id
    WHERE m.lvl = v_level
    ORDER BY m.product_id, COALESCE(m.uom_id, p.uom_id), p.name
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
             'allocation_rank',        CASE WHEN o.units_per_uom = v_factor THEN o.r END
           ) ORDER BY (o.units_per_uom = v_factor) DESC, o.allocation_rank), '[]'::jsonb),
           count(*) FILTER (WHERE o.units_per_uom <> v_factor)
    INTO v_lines, v_other
    FROM (
      SELECT ol.*, row_number() OVER (PARTITION BY (ol.units_per_uom = v_factor) ORDER BY ol.allocation_rank) AS r
      FROM public.fn_receiving_open_lines(v_org, ARRAY[v_cand.product_id], p_supplier_id) ol
    ) o;

    IF jsonb_array_length(v_lines) = 0 THEN
      v_warnings := v_warnings || to_jsonb(format('«%s» não tem encomendas a fornecedor em aberto%s', v_cand.name,
                      CASE WHEN p_supplier_id IS NOT NULL THEN ' deste fornecedor' ELSE '' END));
    ELSIF v_other > 0 THEN
      v_warnings := v_warnings || to_jsonb(format('«%s»: %s linha(s) em aberto noutra unidade — não entram numa leitura nesta unidade', v_cand.name, v_other));
    END IF;

    v_candidates := v_candidates || jsonb_build_object(
      'product_id',    v_cand.product_id,
      'name',          v_cand.name,
      'sku',           v_cand.sku,
      'barcode',       v_cand.barcode,
      'matched_by',    v_cand.matched_by,
      'uom_id',        v_cand.uom_id,
      'uom_code',      (SELECT code FROM public.uom WHERE id = v_cand.uom_id),
      'units_per_uom', v_factor,
      'open_lines',    v_lines
    );
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
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_receiving_lookup(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_receiving_lookup(uuid, text, uuid) TO authenticated, service_role;

-- ── 6. Receber por código ──────────────────────────────────────────────────
-- p_quantity na unidade lida (p_uom_id NULL = unidade do produto, fator 1).
-- p_purchase_order_item_id força uma linha. p_dry_run: corre tudo numa
-- subtransação e desfá-la (mesmo truque de rpc_preview_po_receipt) — o
-- resultado é, por construção, o da receção real no mesmo momento.
-- Os erros da Fase 1 propagam tal como vêm.
CREATE OR REPLACE FUNCTION public.rpc_receive_by_code(p_request_id uuid, p_warehouse_id uuid, p_product_id uuid, p_quantity numeric, p_uom_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_purchase_order_item_id uuid DEFAULT NULL::uuid, p_code text DEFAULT NULL::text, p_dry_run boolean DEFAULT false)
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
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Pedido já processado → devolve o resultado gravado.
  v_replay := public.fn_receiving_scan_replay(p_request_id, v_org, v_actor, p_warehouse_id, p_product_id, p_quantity, p_uom_id);
  IF v_replay IS NOT NULL THEN
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
    v_matched_by := CASE
      WHEN lower(btrim(v_product.barcode)) = v_lc THEN 'barcode'
      WHEN EXISTS (SELECT 1 FROM public.purchase_order_items poi
                   JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
                   WHERE po.organization_id = v_org AND poi.product_id = p_product_id
                     AND lower(btrim(poi.supplier_sku)) = v_lc)
        OR EXISTS (SELECT 1 FROM public.item_suppliers i
                   WHERE i.organization_id = v_org AND i.product_id = p_product_id
                     AND i.deleted_at IS NULL AND lower(btrim(i.supplier_sku)) = v_lc) THEN 'supplier_sku'
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
    IF v_forced.units_per_uom <> v_factor THEN
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
      product_id, uom_id, quantity, units, result, created_by
    ) VALUES (
      p_request_id, v_org, p_warehouse_id, p_supplier_id, v_code, v_matched_by,
      p_product_id, p_uom_id, p_quantity, v_units, '{}'::jsonb, v_actor
    )
    ON CONFLICT (id) DO NOTHING;

    IF NOT FOUND THEN
      v_replay := public.fn_receiving_scan_replay(p_request_id, v_org, v_actor, p_warehouse_id, p_product_id, p_quantity, p_uom_id);
      IF v_replay IS NULL THEN
        RAISE EXCEPTION 'Pedido de receção em conflito — tenta de novo' USING ERRCODE = 'serialization_failure';
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
              WHERE o.units_per_uom = v_factor
                AND (p_purchase_order_item_id IS NULL OR o.purchase_order_item_id = p_purchase_order_item_id))
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
    --    cada linha recebe, enchendo pela ordem D2.
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
        SELECT o.*, row_number() OVER (ORDER BY o.allocation_rank) AS rn
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
        USING ERRCODE = 'check_violation';
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
        SET receiving_scan_id = p_request_id
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
  WHERE o.units_per_uom <> v_factor;
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
  );

  IF NOT v_dry THEN
    UPDATE public.receiving_scans SET result = v_result WHERE id = p_request_id;
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- REVERSÃO (não executar com a migration). Nenhuma função da Fase 1 mudou.
--   DROP FUNCTION public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean);
--   DROP FUNCTION public.rpc_receiving_lookup(uuid, text, uuid);
--   DROP FUNCTION public.fn_receiving_scan_replay(uuid, uuid, uuid, uuid, uuid, numeric, uuid);
--   DROP FUNCTION public.fn_receiving_open_lines(uuid, uuid[], uuid);
--   DROP INDEX public.idx_purchase_order_receipts_scan;
--   ALTER TABLE public.purchase_order_receipts DROP COLUMN receiving_scan_id;
--   DROP TABLE public.receiving_scans;
-- As receções feitas por código ficam como receções normais (movimentos,
-- received_quantity, purchase_order_receipts); só se perde a ligação à
-- leitura e o registo das leituras.
-- ---------------------------------------------------------------------------
