-- 20261209100000: guias do fornecedor (Fase 2 — fatia 2)
--
-- A guia de remessa do fornecedor (o CRM não emite guias; regista a que vem
-- com a mercadoria) define o ÂMBITO da receção por código: que encomendas a
-- fornecedor (POs) podem receber cada leitura. Toda a receção continua pela
-- Fase 1 (rpc_receive_purchase_order_lines), chamada por rpc_receive_by_code.
-- Anunciado / recebido / falta são calculados ao vivo a partir de
-- purchase_order_receipts (receções ativas com delivery_note_id), por isso a
-- reversão da Fase 1 (rpc_revert_purchase_order_receipt) continua intacta e
-- faz descer o recebido da guia sozinha.
--
-- Regras (decisões aprovadas em 06/10/2026):
--   1 Produto fora da guia / acima do anunciado (mas dentro da PO): aviso
--     (warnings + delivery_note_checks 'nao_consta_da_guia' /
--     'acima_do_anunciado'); a confirmação é do ecrã (dry-run → confirmar).
--   2 Guia opcional: p_delivery_note_id NULL = comportamento da fatia 1,
--     sem nenhuma diferença (provado em testes).
--   3 Guia sem POs ligadas: âmbito = POs em aberto do fornecedor da guia.
--     Guia com POs: âmbito = só essas POs.
--   4 Fechar com faltas NÃO anula o resto da PO (só fecha a guia; a PO fica
--     em aberto; anular o resto é manual, 20261206140000).
--   5 Reabrir: purchase_orders.receive + motivo obrigatório.
--   6 Linhas anunciadas: opcionais, à mão (o ecrã pode copiá-las das POs).
--   7 A receção por linha da PO (Fase 1, ecrã das POs) não escolhe guia.
--   8 A data da guia não altera purchase_orders.actual_delivery_date.
--   Prioridade dentro do âmbito: primeiro as linhas de PO indicadas nas
--   linhas da guia (purchase_order_item_id), depois a ordem D2 da fatia 1.
--   D3 continua: leitura acima do em aberto DO ÂMBITO → recusada por inteiro.
--   Guia fechada ou cancelada → leituras e lookup com guia recusados (23514).
--   Um p_request_id já gravado com outra guia (ou sem guia) → erro 23514.
--   Estado da guia por produto (unidades de stock = quantidade × fator):
--     ok / falta / excesso / nao_anunciado / nao_encomendado; sem linhas
--     anunciadas = 'recebido' (guia só com nº: âmbito + rastreio, sem
--     divergências). Divergências obrigam a nota no fecho.
--
-- Objetos:
--   + supplier_delivery_notes        (guia; id gerado pelo cliente)
--   + supplier_delivery_note_orders  (guia ↔ PO, N:M)
--   + supplier_delivery_note_lines   (linhas anunciadas, opcionais)
--   + FKs purchase_order_receipts.delivery_note_id e
--     receiving_scans.delivery_note_id (ON DELETE RESTRICT) + índices parciais
--   + fn_delivery_note_scope    (interna: POs ligadas ou NULL = fornecedor)
--   + fn_delivery_note_summary  (interna: resumo por produto + receções)
--   + rpc_delivery_note_save / _get / _close / _reopen / _cancel
--   ~ rpc_receiving_lookup e rpc_receive_by_code: DROP + CREATE (não
--     CREATE OR REPLACE — assinatura nova, evitar overload/PGRST203, ver
--     20261130060000) a partir de pg_get_functiondef VIVO, com
--     p_delivery_note_id uuid DEFAULT NULL no fim; owner/GRANTs repostos.
--   Nenhuma função da Fase 1 (receção, reversão, destino, anulação do resto)
--   nem fn_receiving_open_lines / fn_receiving_scan_replay é alterada.
--
-- Segurança: SECURITY DEFINER, search_path public, pg_temp; organização da
-- guia = a do fornecedor; tem de estar em get_user_visible_org_ids(auth.uid()).
-- Escrita (save/close/reopen/cancel): purchase_orders.receive. Leitura
-- (get e RLS SELECT): purchase_orders.view OU purchase_orders.receive.
-- Tabelas: RLS só SELECT para authenticated; escrita só pelas RPCs. Funções e
-- tabelas novas sem acesso para PUBLIC/anon; internas sem EXECUTE para
-- authenticated.
--
-- Concorrência (ordem global de locks):
--   rpc_receive_by_code com guia: guia FOR SHARE → (registo da leitura) →
--   advisory 'receiving:<org>:<produto>' → POs FOR UPDATE (id) → advisory
--   'po_receipt_contract:<EC>' → Fase 1 (linhas → stocks). A guia é sempre o
--   primeiro lock; várias leituras da mesma guia partilham-no (FOR SHARE).
--   save/close/reopen/cancel: guia FOR UPDATE e nada mais trancado antes —
--   esperam pelas leituras em curso da guia e vice-versa; não há ciclo com a
--   Fase 1, a reversão ou a anulação (nenhuma delas tranca guias). As FKs
--   novas pedem FOR KEY SHARE na guia ao gravar receções/leituras, já coberto
--   pelo FOR SHARE detido. Avisos de anunciado calculados com o advisory do
--   produto detido (leituras do mesmo produto em série).
--
-- Reversão no fim do ficheiro (comentada).

SET lock_timeout = '5s';

-- ── 1. Guia ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_delivery_notes (
  id               uuid PRIMARY KEY,  -- gerado pelo cliente (idempotência)
  organization_id  uuid NOT NULL REFERENCES public.anew_organizations(id),
  supplier_id      uuid NOT NULL REFERENCES public.suppliers(id),
  note_number      text NOT NULL CHECK (btrim(note_number) <> '' AND char_length(note_number) <= 100),
  document_date    date,
  notes            text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  closed_at        timestamptz,
  closed_by        uuid,
  close_notes      text CHECK (close_notes IS NULL OR char_length(close_notes) <= 2000),
  close_summary    jsonb,
  cancelled_at     timestamptz,
  cancelled_by     uuid,
  cancel_reason    text CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 1000),
  -- Fechos, reaberturas e cancelamento (append-only; o motivo da reabertura
  -- e o fecho anterior ficam aqui).
  history          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(history) = 'array'),
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_delivery_notes_closed_chk
    CHECK (status <> 'closed' OR closed_at IS NOT NULL),
  CONSTRAINT supplier_delivery_notes_cancelled_chk
    CHECK (status <> 'cancelled' OR (cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL))
);

COMMENT ON TABLE public.supplier_delivery_notes IS
  'Guias de remessa do fornecedor registadas na receção (âmbito das leituras por código). Anunciado/recebido calculados ao vivo. Só escrito por RPCs.';

-- Nº da guia único por fornecedor (sem maiúsculas/espaços), exceto canceladas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_delivery_notes_number
  ON public.supplier_delivery_notes (organization_id, supplier_id, lower(btrim(note_number)))
  WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS idx_supplier_delivery_notes_org_status
  ON public.supplier_delivery_notes (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_delivery_notes_supplier
  ON public.supplier_delivery_notes (supplier_id);

-- ── 2. Guia ↔ PO (N:M) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_delivery_note_orders (
  delivery_note_id  uuid NOT NULL REFERENCES public.supplier_delivery_notes(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  organization_id   uuid NOT NULL REFERENCES public.anew_organizations(id),
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (delivery_note_id, purchase_order_id)
);

COMMENT ON TABLE public.supplier_delivery_note_orders IS
  'POs abrangidas por uma guia do fornecedor (sem linhas = todas as POs do fornecedor). Só escrito por RPCs.';

CREATE INDEX IF NOT EXISTS idx_supplier_delivery_note_orders_po
  ON public.supplier_delivery_note_orders (purchase_order_id);

-- ── 3. Linhas anunciadas (opcionais) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_delivery_note_lines (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id       uuid NOT NULL REFERENCES public.supplier_delivery_notes(id) ON DELETE CASCADE,
  organization_id        uuid NOT NULL REFERENCES public.anew_organizations(id),
  position               integer NOT NULL DEFAULT 0,
  product_id             uuid NOT NULL REFERENCES public.products(id),
  uom_id                 uuid REFERENCES public.uom(id),
  units_per_uom          integer NOT NULL DEFAULT 1 CHECK (units_per_uom >= 1),
  quantity               numeric NOT NULL CHECK (quantity > 0),  -- na unidade da linha
  purchase_order_item_id uuid REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  description            text CHECK (description IS NULL OR char_length(description) <= 500),
  created_by             uuid,
  created_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.supplier_delivery_note_lines IS
  'Linhas anunciadas na guia do fornecedor (produto, unidade, quantidade; linha da PO opcional = prioridade na receção). Só escrito por RPCs.';

CREATE INDEX IF NOT EXISTS idx_supplier_delivery_note_lines_note
  ON public.supplier_delivery_note_lines (delivery_note_id, position);
CREATE INDEX IF NOT EXISTS idx_supplier_delivery_note_lines_poi
  ON public.supplier_delivery_note_lines (purchase_order_item_id) WHERE purchase_order_item_id IS NOT NULL;

-- ── 4. RLS e privilégios (só leitura para authenticated) ───────────────────
ALTER TABLE public.supplier_delivery_notes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_delivery_note_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_delivery_note_lines  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.supplier_delivery_notes       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.supplier_delivery_note_orders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.supplier_delivery_note_lines  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.supplier_delivery_notes       TO authenticated;
GRANT SELECT ON TABLE public.supplier_delivery_note_orders TO authenticated;
GRANT SELECT ON TABLE public.supplier_delivery_note_lines  TO authenticated;
GRANT ALL ON TABLE public.supplier_delivery_notes       TO service_role;
GRANT ALL ON TABLE public.supplier_delivery_note_orders TO service_role;
GRANT ALL ON TABLE public.supplier_delivery_note_lines  TO service_role;

DROP POLICY IF EXISTS supplier_delivery_notes_select ON public.supplier_delivery_notes;
CREATE POLICY supplier_delivery_notes_select ON public.supplier_delivery_notes
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
         AND (public.has_anew_permission((SELECT auth.uid()), 'purchase_orders.view')
              OR public.has_anew_permission((SELECT auth.uid()), 'purchase_orders.receive')));

DROP POLICY IF EXISTS supplier_delivery_note_orders_select ON public.supplier_delivery_note_orders;
CREATE POLICY supplier_delivery_note_orders_select ON public.supplier_delivery_note_orders
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
         AND (public.has_anew_permission((SELECT auth.uid()), 'purchase_orders.view')
              OR public.has_anew_permission((SELECT auth.uid()), 'purchase_orders.receive')));

DROP POLICY IF EXISTS supplier_delivery_note_lines_select ON public.supplier_delivery_note_lines;
CREATE POLICY supplier_delivery_note_lines_select ON public.supplier_delivery_note_lines
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
         AND (public.has_anew_permission((SELECT auth.uid()), 'purchase_orders.view')
              OR public.has_anew_permission((SELECT auth.uid()), 'purchase_orders.receive')));

-- ── 5. FKs nas colunas já existentes ───────────────────────────────────────
-- Hoje todas a NULL (verificado antes de aplicar). RESTRICT: uma guia com
-- receções/leituras não se apaga (cancela-se, e só sem receções ativas).
ALTER TABLE public.purchase_order_receipts
  DROP CONSTRAINT IF EXISTS purchase_order_receipts_delivery_note_id_fkey;
ALTER TABLE public.purchase_order_receipts
  ADD CONSTRAINT purchase_order_receipts_delivery_note_id_fkey
  FOREIGN KEY (delivery_note_id) REFERENCES public.supplier_delivery_notes(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_purchase_order_receipts_delivery_note
  ON public.purchase_order_receipts (delivery_note_id) WHERE delivery_note_id IS NOT NULL;

ALTER TABLE public.receiving_scans
  DROP CONSTRAINT IF EXISTS receiving_scans_delivery_note_id_fkey;
ALTER TABLE public.receiving_scans
  ADD CONSTRAINT receiving_scans_delivery_note_id_fkey
  FOREIGN KEY (delivery_note_id) REFERENCES public.supplier_delivery_notes(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_receiving_scans_delivery_note
  ON public.receiving_scans (delivery_note_id) WHERE delivery_note_id IS NOT NULL;

-- ── 6. Âmbito da guia (interna) ────────────────────────────────────────────
-- POs ligadas à guia, ou NULL se não tiver nenhuma (âmbito = todas as POs do
-- fornecedor da guia, que fn_receiving_open_lines já filtra).
CREATE OR REPLACE FUNCTION public.fn_delivery_note_scope(p_delivery_note_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT array_agg(o.purchase_order_id ORDER BY o.purchase_order_id)
  FROM public.supplier_delivery_note_orders o
  WHERE o.delivery_note_id = p_delivery_note_id;
$function$;

REVOKE ALL ON FUNCTION public.fn_delivery_note_scope(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_delivery_note_scope(uuid) TO service_role;

-- ── 7. Resumo da guia (interna) ────────────────────────────────────────────
-- Por produto, em unidades de stock: anunciado (linhas da guia) vs recebido
-- (receções ativas com esta guia: kind='receipt', não revertidas). Lista das
-- receções (também as revertidas, marcadas). Sem verificação de permissões
-- (chamada só por RPCs que já verificaram).
CREATE OR REPLACE FUNCTION public.fn_delivery_note_summary(p_delivery_note_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_note      public.supplier_delivery_notes%ROWTYPE;
  v_scope     uuid[];
  v_has_lines boolean;
  v_products  jsonb;
  v_receipts  jsonb;
BEGIN
  SELECT * INTO v_note FROM public.supplier_delivery_notes WHERE id = p_delivery_note_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_scope := public.fn_delivery_note_scope(p_delivery_note_id);
  v_has_lines := EXISTS (SELECT 1 FROM public.supplier_delivery_note_lines WHERE delivery_note_id = p_delivery_note_id);

  WITH ann AS (
    SELECT l.product_id, sum(l.quantity * l.units_per_uom) AS units
    FROM public.supplier_delivery_note_lines l
    WHERE l.delivery_note_id = p_delivery_note_id
    GROUP BY l.product_id
  ), rcv AS (
    SELECT COALESCE(pr.product_id, poi.product_id) AS product_id,
           sum(pr.quantity * pr.units_per_uom) AS units
    FROM public.purchase_order_receipts pr
    LEFT JOIN public.purchase_order_items poi ON poi.id = pr.purchase_order_item_id
    WHERE pr.delivery_note_id = p_delivery_note_id
      AND pr.kind = 'receipt'
      AND pr.reverted_at IS NULL
    GROUP BY 1
  ), ordered AS (
    -- Produtos com alguma linha nas POs do âmbito (qualquer estado).
    SELECT DISTINCT poi.product_id
    FROM public.purchase_order_items poi
    JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
    WHERE po.organization_id = v_note.organization_id
      AND po.deleted_at IS NULL
      AND poi.item_type = 'product'
      AND poi.product_id IS NOT NULL
      AND (CASE WHEN v_scope IS NULL THEN po.supplier_id = v_note.supplier_id
                ELSE po.id = ANY (v_scope) END)
  ), x AS (
    SELECT COALESCE(a.product_id, r.product_id) AS product_id,
           COALESCE(a.units, 0) AS announced,
           COALESCE(r.units, 0) AS received,
           (o.product_id IS NOT NULL) AS on_order
    FROM ann a
    FULL JOIN rcv r ON r.product_id = a.product_id
    LEFT JOIN ordered o ON o.product_id = COALESCE(a.product_id, r.product_id)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'product_id',       x.product_id,
           'name',             p.name,
           'sku',              p.sku,
           'announced_units',  trim_scale(x.announced),
           'received_units',   trim_scale(x.received),
           'missing_units',    trim_scale(GREATEST(0, x.announced - x.received)),
           'excess_units',     trim_scale(CASE WHEN x.announced > 0 THEN GREATEST(0, x.received - x.announced) ELSE 0 END),
           'on_order',         x.on_order,
           'status',           s.status,
           'divergent',        (v_has_lines AND s.status <> 'ok')
         ) ORDER BY p.name, x.product_id), '[]'::jsonb)
  INTO v_products
  FROM x
  LEFT JOIN public.products p ON p.id = x.product_id
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN NOT v_has_lines                                  THEN 'recebido'
      WHEN x.announced = 0                                  THEN 'nao_anunciado'
      WHEN x.received = 0 AND NOT x.on_order                THEN 'nao_encomendado'
      WHEN x.received < x.announced                         THEN 'falta'
      WHEN x.received > x.announced                         THEN 'excesso'
      ELSE 'ok'
    END AS status
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id',                     pr.id,
           'purchase_order_id',      pr.purchase_order_id,
           'order_number',           po.order_number,
           'purchase_order_item_id', pr.purchase_order_item_id,
           'product_id',             COALESCE(pr.product_id, poi.product_id),
           'product_name',           p.name,
           'quantity',               pr.quantity,
           'units_per_uom',          pr.units_per_uom,
           'units',                  pr.quantity * pr.units_per_uom,
           'units_to_order',         pr.units_to_order,
           'units_to_stock',         pr.units_to_stock,
           'contract_id',            pr.contract_id,
           'warehouse_id',           pr.warehouse_id,
           'receiving_scan_id',      pr.receiving_scan_id,
           'received_at',            pr.received_at,
           'received_by',            pr.received_by,
           'reverted',               pr.reverted_at IS NOT NULL,
           'reverted_at',            pr.reverted_at,
           'revert_reason',          pr.revert_reason
         ) ORDER BY pr.received_at, pr.id), '[]'::jsonb)
  INTO v_receipts
  FROM public.purchase_order_receipts pr
  JOIN public.purchase_orders po ON po.id = pr.purchase_order_id
  LEFT JOIN public.purchase_order_items poi ON poi.id = pr.purchase_order_item_id
  LEFT JOIN public.products p ON p.id = COALESCE(pr.product_id, poi.product_id)
  WHERE pr.delivery_note_id = p_delivery_note_id
    AND pr.kind = 'receipt';

  RETURN jsonb_build_object(
    'has_lines',       v_has_lines,
    'products',        v_products,
    'receipts',        v_receipts,
    'totals', jsonb_build_object(
      'announced_units',   (SELECT COALESCE(sum((e ->> 'announced_units')::numeric), 0) FROM jsonb_array_elements(v_products) e),
      'received_units',    (SELECT COALESCE(sum((e ->> 'received_units')::numeric), 0) FROM jsonb_array_elements(v_products) e),
      'missing_units',     (SELECT COALESCE(sum((e ->> 'missing_units')::numeric), 0) FROM jsonb_array_elements(v_products) e),
      'excess_units',      (SELECT COALESCE(sum((e ->> 'excess_units')::numeric), 0) FROM jsonb_array_elements(v_products) e),
      'products',          jsonb_array_length(v_products),
      'divergences',       (SELECT count(*) FROM jsonb_array_elements(v_products) e WHERE (e ->> 'divergent')::boolean),
      'active_receipts',   (SELECT count(*) FROM jsonb_array_elements(v_receipts) e WHERE NOT (e ->> 'reverted')::boolean),
      'reverted_receipts', (SELECT count(*) FROM jsonb_array_elements(v_receipts) e WHERE (e ->> 'reverted')::boolean)
    ),
    'has_divergences', EXISTS (SELECT 1 FROM jsonb_array_elements(v_products) e WHERE (e ->> 'divergent')::boolean)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_delivery_note_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_delivery_note_summary(uuid) TO service_role;

-- ── 8. Consultar uma guia ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_delivery_note_get(p_delivery_note_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_note    public.supplier_delivery_notes%ROWTYPE;
  v_summary jsonb;
BEGIN
  SELECT * INTO v_note FROM public.supplier_delivery_notes WHERE id = p_delivery_note_id;
  IF NOT FOUND
     OR v_note.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Guia do fornecedor não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (public.has_anew_permission(auth.uid(), 'purchase_orders.view')
          OR public.has_anew_permission(auth.uid(), 'purchase_orders.receive')) THEN
    RAISE EXCEPTION 'Sem permissão para consultar guias desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_summary := public.fn_delivery_note_summary(p_delivery_note_id);

  RETURN jsonb_build_object(
    'id',              v_note.id,
    'organization_id', v_note.organization_id,
    'supplier_id',     v_note.supplier_id,
    'supplier_name',   (SELECT name FROM public.suppliers WHERE id = v_note.supplier_id),
    'note_number',     v_note.note_number,
    'document_date',   v_note.document_date,
    'notes',           v_note.notes,
    'status',          v_note.status,
    'created_by',      v_note.created_by,
    'created_at',      v_note.created_at,
    'updated_at',      v_note.updated_at,
    'closed_at',       v_note.closed_at,
    'closed_by',       v_note.closed_by,
    'close_notes',     v_note.close_notes,
    'close_summary',   v_note.close_summary,
    'cancelled_at',    v_note.cancelled_at,
    'cancelled_by',    v_note.cancelled_by,
    'cancel_reason',   v_note.cancel_reason,
    'history',         v_note.history,
    'purchase_orders', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'purchase_order_id', po.id,
               'order_number',      po.order_number,
               'status',            po.status,
               'deleted',           po.deleted_at IS NOT NULL,
               'expected_delivery', po.expected_delivery,
               'source_type',       po.source_type,
               'source_id',         po.source_id
             ) ORDER BY po.order_number, po.id), '[]'::jsonb)
      FROM public.supplier_delivery_note_orders o
      JOIN public.purchase_orders po ON po.id = o.purchase_order_id
      WHERE o.delivery_note_id = p_delivery_note_id),
    'lines', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id',                     l.id,
               'position',               l.position,
               'product_id',             l.product_id,
               'product_name',           p.name,
               'sku',                    p.sku,
               'uom_id',                 l.uom_id,
               'uom_code',               (SELECT code FROM public.uom WHERE id = COALESCE(l.uom_id, p.uom_id)),
               'units_per_uom',          l.units_per_uom,
               'quantity',               l.quantity,
               'units',                  l.quantity * l.units_per_uom,
               'purchase_order_item_id', l.purchase_order_item_id,
               'order_number',           po.order_number,
               'description',            l.description
             ) ORDER BY l.position, l.id), '[]'::jsonb)
      FROM public.supplier_delivery_note_lines l
      LEFT JOIN public.products p ON p.id = l.product_id
      LEFT JOIN public.purchase_order_items poi ON poi.id = l.purchase_order_item_id
      LEFT JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
      WHERE l.delivery_note_id = p_delivery_note_id),
    'summary',         v_summary,
    -- Fechada e o recebido mudou depois (p.ex. reversão de uma receção).
    'changed_since_close', (v_note.status = 'closed'
                            AND (v_note.close_summary -> 'products') IS DISTINCT FROM (v_summary -> 'products'))
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_delivery_note_get(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delivery_note_get(uuid) TO authenticated, service_role;

-- ── 9. Criar / editar uma guia ─────────────────────────────────────────────
-- p_delivery_note_id gerado pelo cliente. Criar de novo com os mesmos dados
-- devolve a guia (saved=false). Editar exige p_expected_updated_at = o
-- updated_at lido (concorrência otimista; 40001 se mudou entretanto) e guia
-- aberta. O fornecedor não muda. p_purchase_order_ids / p_lines NULL = não
-- mexer; array (mesmo vazio) = substituir.
-- p_lines: [{product_id, uom_id?, quantity, purchase_order_item_id?, description?}]
-- Nº repetido (mesmo fornecedor, guia não cancelada) → 23505 com o id da
-- guia existente em DETAIL.
CREATE OR REPLACE FUNCTION public.rpc_delivery_note_save(p_delivery_note_id uuid, p_supplier_id uuid, p_note_number text, p_document_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text, p_purchase_order_ids uuid[] DEFAULT NULL::uuid[], p_lines jsonb DEFAULT NULL::jsonb, p_expected_updated_at timestamptz DEFAULT NULL::timestamptz)
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
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive') THEN
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
        IF v_poi.units_per_uom <> v_factor THEN
          RAISE EXCEPTION 'Linha % da guia: a linha "%" (%) está noutra unidade', v_ord, v_poi.description, v_poi.order_number
            USING ERRCODE = 'check_violation';
        END IF;
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

REVOKE ALL ON FUNCTION public.rpc_delivery_note_save(uuid, uuid, text, date, text, uuid[], jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delivery_note_save(uuid, uuid, text, date, text, uuid[], jsonb, timestamptz) TO authenticated, service_role;

-- ── 10. Fechar / reabrir / cancelar ────────────────────────────────────────
-- Fechar: só a guia (a PO fica como está — D4). Nota obrigatória se houver
-- divergências. Guarda o resumo do momento (close_summary). Repetir o fecho
-- de uma guia já fechada devolve-a (changed=false).
CREATE OR REPLACE FUNCTION public.rpc_delivery_note_close(p_delivery_note_id uuid, p_notes text DEFAULT NULL::text, p_expected_updated_at timestamptz DEFAULT NULL::timestamptz)
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
  IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive') THEN
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

REVOKE ALL ON FUNCTION public.rpc_delivery_note_close(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delivery_note_close(uuid, text, timestamptz) TO authenticated, service_role;

-- Reabrir: guia fechada → aberta, com motivo. O fecho anterior fica no
-- histórico. Repetir numa guia já aberta devolve-a (changed=false).
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
  IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive') THEN
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

REVOKE ALL ON FUNCTION public.rpc_delivery_note_reopen(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delivery_note_reopen(uuid, text) TO authenticated, service_role;

-- Cancelar (guia registada por engano): só sem receções ativas (reverte-as
-- primeiro pela Fase 1). Liberta o nº. Repetir devolve-a (changed=false).
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
  IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive') THEN
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

REVOKE ALL ON FUNCTION public.rpc_delivery_note_cancel(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delivery_note_cancel(uuid, text) TO authenticated, service_role;

-- ── 11. rpc_receiving_lookup + p_delivery_note_id ──────────────────────────
-- Definição viva de 09/10 (= 20261206160000) com as alterações marcadas
-- "NOVO (guia)". Com p_delivery_note_id NULL o resultado é idêntico.
DROP FUNCTION public.rpc_receiving_lookup(uuid, text, uuid);

CREATE FUNCTION public.rpc_receiving_lookup(p_warehouse_id uuid, p_code text, p_supplier_id uuid DEFAULT NULL::uuid, p_delivery_note_id uuid DEFAULT NULL::uuid)
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
    ) || v_note_info;  -- NOVO (guia): '{}' sem guia
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
           -- NOVO (guia): linha indicada na guia (só com guia)
           ) || CASE WHEN p_delivery_note_id IS NOT NULL
                     THEN jsonb_build_object('in_delivery_note', COALESCE(o.purchase_order_item_id = ANY (v_note_poi), false))
                     ELSE '{}'::jsonb END
           ORDER BY (o.units_per_uom = v_factor) DESC, o.prio, o.allocation_rank), '[]'::jsonb),
           count(*) FILTER (WHERE o.units_per_uom <> v_factor)
    INTO v_lines, v_other
    FROM (
      -- NOVO (guia): prio 0 = linha indicada na guia (sem guia é sempre 1);
      -- só POs do âmbito da guia.
      SELECT ol.*, pr.prio,
             row_number() OVER (PARTITION BY (ol.units_per_uom = v_factor) ORDER BY pr.prio, ol.allocation_rank) AS r
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
    ) || CASE WHEN p_delivery_note_id IS NOT NULL  -- NOVO (guia)
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
  ) || v_note_info;  -- NOVO (guia): '{}' sem guia
END;
$function$;

ALTER FUNCTION public.rpc_receiving_lookup(uuid, text, uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_receiving_lookup(uuid, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_receiving_lookup(uuid, text, uuid, uuid) TO authenticated, service_role;

-- ── 12. rpc_receive_by_code + p_delivery_note_id ───────────────────────────
-- Definição viva de 09/10 (= 20261206160000) com as alterações marcadas
-- "NOVO (guia)". Com p_delivery_note_id NULL o comportamento é idêntico.
DROP FUNCTION public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean);

CREATE FUNCTION public.rpc_receive_by_code(p_request_id uuid, p_warehouse_id uuid, p_product_id uuid, p_quantity numeric, p_uom_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_purchase_order_item_id uuid DEFAULT NULL::uuid, p_code text DEFAULT NULL::text, p_dry_run boolean DEFAULT false, p_delivery_note_id uuid DEFAULT NULL::uuid)
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
    -- NOVO (guia): o identificador gravado com outra guia (ou sem guia) é erro.
    IF (SELECT s.delivery_note_id FROM public.receiving_scans s WHERE s.id = p_request_id) IS DISTINCT FROM p_delivery_note_id THEN
      RAISE EXCEPTION 'O identificador do pedido de receção já foi usado noutra leitura (outra guia)'
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
    -- NOVO (guia): a linha forçada tem de estar no âmbito da guia.
    IF v_scope IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.purchase_order_items poi
      WHERE poi.id = p_purchase_order_item_id AND poi.purchase_order_id = ANY (v_scope)
    ) THEN
      RAISE EXCEPTION 'A linha "%" (%) não está nas encomendas da guia %', v_forced.description, v_forced.order_number, v_note_number
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
  WHERE o.units_per_uom <> v_factor
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
            ELSE '{}'::jsonb END;

  IF NOT v_dry THEN
    UPDATE public.receiving_scans SET result = v_result WHERE id = p_request_id;
  END IF;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- REVERSÃO (não executar com a migration). Correr numa transação única
-- (BEGIN; … COMMIT;). Repõe as duas RPCs da fatia 1 EXATAMENTE como estavam
-- vivas antes desta migration (pg_get_functiondef de 09/10/2026, iguais a
-- 20261206160000) e apaga os objetos novos. As receções feitas com guia
-- ficam como receções normais (movimentos, received_quantity,
-- purchase_order_receipts); delivery_note_id é posto a NULL (as colunas já
-- existiam antes desta migration, sem FK) e perdem-se as guias.
--
-- SET lock_timeout = '5s';
-- DROP FUNCTION public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean, uuid);
-- DROP FUNCTION public.rpc_receiving_lookup(uuid, text, uuid, uuid);
--
-- CREATE OR REPLACE FUNCTION public.rpc_receiving_lookup(p_warehouse_id uuid, p_code text, p_supplier_id uuid DEFAULT NULL::uuid)
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
--   v_lc := lower(v_code);
--
--   -- Correspondências (produto, unidade, nível) num jsonb — sem tabelas
--   -- temporárias (função STABLE).
--   SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', mm.product_id, 'uom_id', mm.uom_id,
--                                                'matched_by', mm.matched_by, 'lvl', mm.lvl)), '[]'::jsonb)
--   INTO v_matches
--   FROM (
--   -- 1 código de barras
--   SELECT p.id AS product_id, NULL::uuid AS uom_id, 'barcode'::text AS matched_by, 1 AS lvl
--   FROM public.products p
--   WHERE p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
--     AND lower(btrim(p.barcode)) = v_lc
--   UNION
--   -- 2a referência do fornecedor nas linhas em aberto
--   SELECT poi.product_id, poi.uom_id, 'supplier_sku', 2
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
--   SELECT i.product_id, i.uom_id, 'supplier_sku', 2
--   FROM public.item_suppliers i
--   JOIN public.products p ON p.id = i.product_id
--   WHERE i.organization_id = v_org AND i.deleted_at IS NULL AND i.product_id IS NOT NULL
--     AND (p_supplier_id IS NULL OR i.supplier_id = p_supplier_id)
--     AND p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
--     AND lower(btrim(i.supplier_sku)) = v_lc
--   UNION
--   -- 3 SKU do produto
--   SELECT p.id, NULL::uuid, 'sku', 3
--   FROM public.products p
--   WHERE p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
--     AND lower(btrim(p.sku)) = v_lc
--   UNION
--   -- 4 SKU gravado nas linhas das POs da organização
--   SELECT poi.product_id, NULL::uuid, 'po_line_sku', 4
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
--     );
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
--            p.name, p.sku, p.barcode
--     FROM jsonb_to_recordset(v_matches) AS m(product_id uuid, uom_id uuid, matched_by text, lvl integer)
--     JOIN public.products p ON p.id = m.product_id
--     WHERE m.lvl = v_level
--     ORDER BY m.product_id, COALESCE(m.uom_id, p.uom_id), p.name
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
--              'allocation_rank',        CASE WHEN o.units_per_uom = v_factor THEN o.r END
--            ) ORDER BY (o.units_per_uom = v_factor) DESC, o.allocation_rank), '[]'::jsonb),
--            count(*) FILTER (WHERE o.units_per_uom <> v_factor)
--     INTO v_lines, v_other
--     FROM (
--       SELECT ol.*, row_number() OVER (PARTITION BY (ol.units_per_uom = v_factor) ORDER BY ol.allocation_rank) AS r
--       FROM public.fn_receiving_open_lines(v_org, ARRAY[v_cand.product_id], p_supplier_id) ol
--     ) o;
--
--     IF jsonb_array_length(v_lines) = 0 THEN
--       v_warnings := v_warnings || to_jsonb(format('«%s» não tem encomendas a fornecedor em aberto%s', v_cand.name,
--                       CASE WHEN p_supplier_id IS NOT NULL THEN ' deste fornecedor' ELSE '' END));
--     ELSIF v_other > 0 THEN
--       v_warnings := v_warnings || to_jsonb(format('«%s»: %s linha(s) em aberto noutra unidade — não entram numa leitura nesta unidade', v_cand.name, v_other));
--     END IF;
--
--     v_candidates := v_candidates || jsonb_build_object(
--       'product_id',    v_cand.product_id,
--       'name',          v_cand.name,
--       'sku',           v_cand.sku,
--       'barcode',       v_cand.barcode,
--       'matched_by',    v_cand.matched_by,
--       'uom_id',        v_cand.uom_id,
--       'uom_code',      (SELECT code FROM public.uom WHERE id = v_cand.uom_id),
--       'units_per_uom', v_factor,
--       'open_lines',    v_lines
--     );
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
--   );
-- END;
-- $function$;
--
-- REVOKE ALL ON FUNCTION public.rpc_receiving_lookup(uuid, text, uuid) FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.rpc_receiving_lookup(uuid, text, uuid) TO authenticated, service_role;
--
-- CREATE OR REPLACE FUNCTION public.rpc_receive_by_code(p_request_id uuid, p_warehouse_id uuid, p_product_id uuid, p_quantity numeric, p_uom_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_purchase_order_item_id uuid DEFAULT NULL::uuid, p_code text DEFAULT NULL::text, p_dry_run boolean DEFAULT false)
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
--     v_matched_by := CASE
--       WHEN lower(btrim(v_product.barcode)) = v_lc THEN 'barcode'
--       WHEN EXISTS (SELECT 1 FROM public.purchase_order_items poi
--                    JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
--                    WHERE po.organization_id = v_org AND poi.product_id = p_product_id
--                      AND lower(btrim(poi.supplier_sku)) = v_lc)
--         OR EXISTS (SELECT 1 FROM public.item_suppliers i
--                    WHERE i.organization_id = v_org AND i.product_id = p_product_id
--                      AND i.deleted_at IS NULL AND lower(btrim(i.supplier_sku)) = v_lc) THEN 'supplier_sku'
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
--     IF v_forced.units_per_uom <> v_factor THEN
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
--       product_id, uom_id, quantity, units, result, created_by
--     ) VALUES (
--       p_request_id, v_org, p_warehouse_id, p_supplier_id, v_code, v_matched_by,
--       p_product_id, p_uom_id, p_quantity, v_units, '{}'::jsonb, v_actor
--     )
--     ON CONFLICT (id) DO NOTHING;
--
--     IF NOT FOUND THEN
--       v_replay := public.fn_receiving_scan_replay(p_request_id, v_org, v_actor, p_warehouse_id, p_product_id, p_quantity, p_uom_id);
--       IF v_replay IS NULL THEN
--         RAISE EXCEPTION 'Pedido de receção em conflito — tenta de novo' USING ERRCODE = 'serialization_failure';
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
--               WHERE o.units_per_uom = v_factor
--                 AND (p_purchase_order_item_id IS NULL OR o.purchase_order_item_id = p_purchase_order_item_id))
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
--     --    cada linha recebe, enchendo pela ordem D2.
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
--         SELECT o.*, row_number() OVER (ORDER BY o.allocation_rank) AS rn
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
--         USING ERRCODE = 'check_violation';
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
--         SET receiving_scan_id = p_request_id
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
--   WHERE o.units_per_uom <> v_factor;
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
--   );
--
--   IF NOT v_dry THEN
--     UPDATE public.receiving_scans SET result = v_result WHERE id = p_request_id;
--   END IF;
--
--   RETURN v_result;
-- END;
-- $function$;
--
-- REVOKE ALL ON FUNCTION public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean) FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.rpc_receive_by_code(uuid, uuid, uuid, numeric, uuid, uuid, uuid, text, boolean) TO authenticated, service_role;
--
-- DROP FUNCTION public.rpc_delivery_note_cancel(uuid, text);
-- DROP FUNCTION public.rpc_delivery_note_reopen(uuid, text);
-- DROP FUNCTION public.rpc_delivery_note_close(uuid, text, timestamptz);
-- DROP FUNCTION public.rpc_delivery_note_save(uuid, uuid, text, date, text, uuid[], jsonb, timestamptz);
-- DROP FUNCTION public.rpc_delivery_note_get(uuid);
-- DROP FUNCTION public.fn_delivery_note_summary(uuid);
-- DROP FUNCTION public.fn_delivery_note_scope(uuid);
--
-- ALTER TABLE public.purchase_order_receipts DROP CONSTRAINT purchase_order_receipts_delivery_note_id_fkey;
-- ALTER TABLE public.receiving_scans DROP CONSTRAINT receiving_scans_delivery_note_id_fkey;
-- DROP INDEX public.idx_purchase_order_receipts_delivery_note;
-- DROP INDEX public.idx_receiving_scans_delivery_note;
-- UPDATE public.purchase_order_receipts SET delivery_note_id = NULL WHERE delivery_note_id IS NOT NULL;
-- UPDATE public.receiving_scans SET delivery_note_id = NULL WHERE delivery_note_id IS NOT NULL;
-- DROP TABLE public.supplier_delivery_note_lines;
-- DROP TABLE public.supplier_delivery_note_orders;
-- DROP TABLE public.supplier_delivery_notes;
-- NOTIFY pgrst, 'reload schema';
-- ---------------------------------------------------------------------------
