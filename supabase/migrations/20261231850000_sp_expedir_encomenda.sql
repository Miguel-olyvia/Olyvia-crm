-- ============================================================
-- 20261231850000_sp_expedir_encomenda  (base RH)
-- ============================================================
-- Portal do Fornecedor — "expedir a encomenda com a guia de remessa".
--
-- O fornecedor, no portal, regista a guia de remessa de uma encomenda
-- publicada e confirmada (nº da guia, data, linhas e quantidades, transportador
-- e notas) e, opcionalmente, anexa o ficheiro da guia (PDF/foto). A equipa vê
-- a guia na Receção como qualquer outra (supplier_delivery_notes) e dá entrada
-- por ela com rpc_receive_by_code(..., p_delivery_note_id).
--
-- Sem tabelas nem colunas novas:
--   • a guia vai para supplier_delivery_notes (+ _orders + _lines);
--   • origem portal, utilizador do portal, transportador e anexos ficam no
--     `history` jsonb: 1.º elemento {action:'shipped', origin:'supplier_portal',
--     ...}; cada anexo acrescenta {action:'attachment', ...} — o último conta;
--   • created_by fica NULL (não há anew_users por trás do fornecedor).
--
-- RLS intacta: o fornecedor continua sem acesso direto às tabelas. Tudo passa
-- por RPCs SECURITY DEFINER com fn_sp_actor() + fn_sp_po_publication(po, user).
--
-- Validado contra a BD viva da RH (27/10/2026):
--   • fn_sp_actor() → supplier_portal_users; fn_sp_po_publication(po, user)
--     → supplier_po_publications (exclui withdrawn e PO pending/apagada);
--   • supplier_po_publications.status ∈ sent|viewed|confirmed|withdrawn;
--     revision integer >= 1;
--   • supplier_delivery_notes: id SEM default (usa-se o p_request_id),
--     status ∈ open|closed|cancelled, note_number 1..100 (btrim <> ''),
--     notes <= 2000, history array; índice único
--     (organization_id, supplier_id, lower(btrim(note_number))) WHERE
--     status <> 'cancelled' (uq_supplier_delivery_notes_number);
--   • supplier_delivery_note_lines: product_id NOT NULL, quantity > 0,
--     units_per_uom >= 1, description <= 500; created_by sem FK;
--   • sem gatilhos nas três tabelas de guias (nada rebenta com created_by NULL
--     nem com auth.uid() de fornecedor);
--   • purchase_orders.status sem CHECK; valores usados pelo sistema:
--     pending|ordered|partially_received|received|cancelled.
--
-- Unidades: purchase_order_items.received_quantity está na MESMA unidade da
-- linha (quantity): fn_receiving_open_lines faz quantity - received_quantity e
-- rpc_receive_by_code multiplica por units_per_uom para unidades de stock. As
-- linhas da guia do portal gravam a unidade da linha da PO (uom_id,
-- units_per_uom = poi.units_per_uom), por isso quantity da guia = unidades da
-- linha. A equipa pode editar a guia no CRM noutra embalagem da mesma base
-- (rpc_delivery_note_save): fn_sp_po_shipped converte sempre por
-- quantity * units_per_uom / poi.units_per_uom.
--
-- NÃO se usa fn_uom_units_per aqui: tem um controlo de visibilidade por
-- auth.uid() (get_user_visible_org_ids) que recusa unidades da organização a
-- um utilizador do portal (auth.uid() continua a ser o do fornecedor dentro de
-- SECURITY DEFINER). O fator é o instantâneo já gravado na linha da PO
-- (fn_line_units_per_uom_snapshot).
--
-- Ordem de locks (igual ao CRM, rpc_po_send_to_supplier/fn_po_crm_load e
-- rpc_receive_by_code): PO FOR UPDATE → publicação FOR UPDATE.
-- ============================================================

-- ─── 1. Quantidade já expedida pelo portal numa linha da PO ────────────────
-- Em unidades da linha da PO. Guias do portal não canceladas:
--   • abertas → o anunciado;
--   • fechadas → o recebido por essa guia nessa linha, no máximo o anunciado
--     (uma guia fechada com falta não bloqueia a expedição do resto).
CREATE OR REPLACE FUNCTION public.fn_sp_po_shipped(p_poi uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(trim_scale(sum(
           CASE WHEN x.status = 'closed' THEN LEAST(x.announced_units, x.received_units)
                ELSE x.announced_units END
         ) / GREATEST(COALESCE(max(poi.units_per_uom), 1), 1)), 0)
  FROM public.purchase_order_items poi
  JOIN LATERAL (
    SELECT n.id, n.status,
           sum(l.quantity * l.units_per_uom) AS announced_units,
           COALESCE((SELECT sum(pr.quantity * pr.units_per_uom)
                     FROM public.purchase_order_receipts pr
                     WHERE pr.delivery_note_id = n.id
                       AND pr.purchase_order_item_id = poi.id
                       AND pr.kind = 'receipt'
                       AND pr.reverted_at IS NULL), 0) AS received_units
    FROM public.supplier_delivery_note_lines l
    JOIN public.supplier_delivery_notes n ON n.id = l.delivery_note_id
    WHERE l.purchase_order_item_id = poi.id
      AND n.status <> 'cancelled'
      AND n.history @> '[{"origin":"supplier_portal"}]'::jsonb
    GROUP BY n.id, n.status
  ) x ON true
  WHERE poi.id = p_poi;
$function$;

REVOKE ALL ON FUNCTION public.fn_sp_po_shipped(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sp_po_shipped(uuid) TO service_role;


-- ─── 2. Expedir (registar a guia de remessa) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.sp_ship_order(
  p_request_id  uuid,
  p_po_id       uuid,
  p_revision    integer,
  p_note_number text,
  p_ship_date   date,
  p_lines       jsonb,
  p_carrier     text DEFAULT NULL::text,
  p_notes       text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u          public.supplier_portal_users := public.fn_sp_actor();
  v_pub      public.supplier_po_publications;
  v_po       public.purchase_orders;
  v_note     public.supplier_delivery_notes;
  v_number   text := btrim(COALESCE(p_note_number, ''));
  v_carrier  text := NULLIF(btrim(regexp_replace(COALESCE(p_carrier, ''), '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), '');
  v_notes    text := NULLIF(btrim(regexp_replace(COALESCE(p_notes, ''), '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), '');
  v_today    date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_el       jsonb;
  v_ord      bigint;
  v_poi_id   uuid;
  v_qty      numeric;
  v_poi      record;
  v_shipped  numeric;
  v_open     numeric;
  v_seen     uuid[] := ARRAY[]::uuid[];
  v_lines    jsonb := '[]'::jsonb;
  v_pos      integer := 0;
  v_constr   text;
BEGIN
  IF p_request_id IS NULL OR p_po_id IS NULL THEN
    RAISE EXCEPTION 'Pedido inválido (identificador em falta)' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  -- Acesso antes de qualquer lock (um fornecedor sem acesso não tranca nada).
  v_pub := public.fn_sp_po_publication(p_po_id, u.id);
  IF v_pub.purchase_order_id IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  -- Locks pela ordem do CRM: PO → publicação; depois volta a verificar o acesso.
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  PERFORM 1 FROM public.supplier_po_publications WHERE purchase_order_id = p_po_id FOR UPDATE;
  v_pub := public.fn_sp_po_publication(p_po_id, u.id);
  IF v_pub.purchase_order_id IS NULL OR v_po.id IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  -- Idempotência: p_request_id é o id da guia. Repetição do mesmo pedido →
  -- devolve o que foi gravado (mesmo que a revisão tenha mudado entretanto).
  SELECT * INTO v_note FROM public.supplier_delivery_notes WHERE id = p_request_id;
  IF FOUND THEN
    IF v_note.organization_id IS DISTINCT FROM v_po.organization_id
       OR v_note.supplier_id IS DISTINCT FROM v_po.supplier_id
       OR NOT (v_note.history @> jsonb_build_array(jsonb_build_object(
                 'action', 'shipped', 'origin', 'supplier_portal', 'purchase_order_id', p_po_id))) THEN
      RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found', HINT = 'not_found';
    END IF;
    RETURN jsonb_build_object(
      'delivery_note_id', v_note.id,
      'organization_id',  v_note.organization_id,
      'note_number',      v_note.note_number,
      'already_shipped',  true,
      'lines', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                         'purchase_order_item_id', l.purchase_order_item_id,
                         'quantity', trim_scale(l.quantity * l.units_per_uom / GREATEST(COALESCE(poi.units_per_uom, 1), 1)))
                       ORDER BY l.position, l.id), '[]'::jsonb)
                FROM public.supplier_delivery_note_lines l
                LEFT JOIN public.purchase_order_items poi ON poi.id = l.purchase_order_item_id
                WHERE l.delivery_note_id = v_note.id));
  END IF;

  IF p_revision IS DISTINCT FROM v_pub.revision THEN
    RAISE EXCEPTION 'A empresa atualizou esta encomenda: recarregue a página para ver a versão nova'
      USING ERRCODE = 'check_violation', HINT = 'stale_revision';
  END IF;
  IF v_pub.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Confirme a encomenda antes de a expedir'
      USING ERRCODE = 'check_violation', HINT = 'not_confirmed';
  END IF;
  IF v_po.status NOT IN ('ordered', 'partially_received') THEN
    RAISE EXCEPTION 'Esta encomenda já está fechada (%): não é possível expedi-la', v_po.status
      USING ERRCODE = 'check_violation', HINT = 'order_closed';
  END IF;

  -- Cabeçalho da guia.
  IF v_number = '' THEN
    RAISE EXCEPTION 'Indique o número da guia de remessa' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF char_length(v_number) > 100 THEN
    RAISE EXCEPTION 'Número da guia demasiado longo (máx. 100 caracteres)' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF v_number ~ '[\x01-\x1F\x7F]' THEN
    RAISE EXCEPTION 'O número da guia tem caracteres inválidos' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF p_ship_date IS NULL THEN
    RAISE EXCEPTION 'Indique a data da guia' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF p_ship_date < v_po.order_date OR p_ship_date > v_today + 60 THEN
    RAISE EXCEPTION 'Data da guia inválida (entre a data da encomenda, %, e daqui a 60 dias)', to_char(v_po.order_date, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF char_length(v_carrier) > 200 THEN
    RAISE EXCEPTION 'Transportador demasiado longo (máx. 200 caracteres)' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF char_length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'Notas demasiado longas (máx. 2000 caracteres)' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  -- Nº repetido no mesmo fornecedor/organização (guias não canceladas, incluindo
  -- as registadas pela equipa no CRM).
  IF EXISTS (SELECT 1 FROM public.supplier_delivery_notes n
             WHERE n.organization_id = v_po.organization_id AND n.supplier_id = v_po.supplier_id
               AND lower(btrim(n.note_number)) = lower(v_number) AND n.status <> 'cancelled') THEN
    RAISE EXCEPTION 'Já existe uma guia com o número % para esta empresa', v_number
      USING ERRCODE = 'unique_violation', HINT = 'duplicate_note';
  END IF;

  -- Linhas.
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Indique as linhas a expedir' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF jsonb_array_length(p_lines) > 500 THEN
    RAISE EXCEPTION 'Demasiadas linhas numa guia (máx. 500)' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  FOR v_el, v_ord IN SELECT e, o FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(e, o) LOOP
    IF jsonb_typeof(v_el) <> 'object' THEN
      RAISE EXCEPTION 'Linha % inválida', v_ord USING ERRCODE = 'check_violation', HINT = 'validation';
    END IF;
    BEGIN
      v_poi_id := NULLIF(v_el ->> 'purchase_order_item_id', '')::uuid;
      v_qty    := (v_el ->> 'quantity')::numeric;
    EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Linha % com dados inválidos', v_ord USING ERRCODE = 'check_violation', HINT = 'validation';
    END;
    IF v_poi_id IS NULL OR v_qty IS NULL OR v_qty < 0 OR v_qty > 1000000000 THEN
      RAISE EXCEPTION 'Linha % com dados inválidos', v_ord USING ERRCODE = 'check_violation', HINT = 'validation';
    END IF;
    IF v_poi_id = ANY (v_seen) THEN
      RAISE EXCEPTION 'Linha % repetida na guia', v_ord USING ERRCODE = 'check_violation', HINT = 'validation';
    END IF;
    v_seen := v_seen || v_poi_id;

    SELECT poi.id, poi.product_id, poi.item_type, poi.quantity, poi.received_quantity, poi.uom_id,
           GREATEST(COALESCE(poi.units_per_uom, 1), 1) AS units_per_uom, poi.description,
           p.uom_id AS product_uom_id
    INTO v_poi
    FROM public.purchase_order_items poi
    LEFT JOIN public.products p ON p.id = poi.product_id
    WHERE poi.id = v_poi_id AND poi.purchase_order_id = p_po_id;
    IF NOT FOUND OR v_poi.item_type <> 'product' OR v_poi.product_id IS NULL THEN
      RAISE EXCEPTION 'Linha % não pertence a esta encomenda', v_ord USING ERRCODE = 'check_violation', HINT = 'validation';
    END IF;

    CONTINUE WHEN v_qty = 0;  -- quantidade 0 = linha não expedida nesta guia

    v_shipped := public.fn_sp_po_shipped(v_poi.id);
    v_open    := v_poi.quantity - GREATEST(v_poi.received_quantity, v_shipped);
    IF v_qty > v_open THEN
      RAISE EXCEPTION '«%»: só faltam % para expedir (indicou %)',
        left(v_poi.description, 120), trim_scale(GREATEST(v_open, 0)), trim_scale(v_qty)
        USING ERRCODE = 'check_violation', HINT = 'validation';
    END IF;

    v_pos := v_pos + 1;
    v_lines := v_lines || jsonb_build_object(
      'position', v_pos,
      'product_id', v_poi.product_id,
      -- Mesma normalização do CRM: unidade igual à do produto → NULL.
      'uom_id', CASE WHEN v_poi.uom_id IS NOT DISTINCT FROM v_poi.product_uom_id THEN NULL ELSE v_poi.uom_id END,
      'units_per_uom', v_poi.units_per_uom,
      'quantity', v_qty,
      'purchase_order_item_id', v_poi.id,
      'description', left(v_poi.description, 500),
      'to_ship_after', trim_scale(v_open - v_qty));
  END LOOP;

  IF v_pos = 0 THEN
    RAISE EXCEPTION 'Indique pelo menos uma linha com quantidade' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  BEGIN
    INSERT INTO public.supplier_delivery_notes (
      id, organization_id, supplier_id, note_number, document_date, notes, status, history,
      created_by, created_at, updated_at
    ) VALUES (
      p_request_id, v_po.organization_id, v_po.supplier_id, v_number, p_ship_date, v_notes, 'open',
      jsonb_build_array(jsonb_build_object(
        'action',            'shipped',
        'origin',            'supplier_portal',
        'at',                now(),
        'by_portal_user',    u.id,
        'by_name',           COALESCE(NULLIF(btrim(u.name), ''), u.email),
        'carrier',           v_carrier,
        'purchase_order_id', p_po_id,
        'revision',          v_pub.revision)),
      NULL, now(), clock_timestamp()
    );
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constr = CONSTRAINT_NAME;
    IF v_constr = 'supplier_delivery_notes_pkey' THEN
      -- Mesmo id gravado por outra sessão entre o SELECT e o INSERT (não devia
      -- acontecer com os locks acima): o cliente repete e cai na idempotência.
      RAISE EXCEPTION 'Pedido em conflito: tente de novo' USING ERRCODE = 'serialization_failure', HINT = 'conflict';
    END IF;
    RAISE EXCEPTION 'Já existe uma guia com o número % para esta empresa', v_number
      USING ERRCODE = 'unique_violation', HINT = 'duplicate_note';
  END;

  INSERT INTO public.supplier_delivery_note_orders (delivery_note_id, purchase_order_id, organization_id, created_by)
  VALUES (p_request_id, p_po_id, v_po.organization_id, NULL);

  INSERT INTO public.supplier_delivery_note_lines (
    delivery_note_id, organization_id, position, product_id, uom_id, units_per_uom, quantity,
    purchase_order_item_id, description, created_by
  )
  SELECT p_request_id, v_po.organization_id, l.position, l.product_id, l.uom_id, l.units_per_uom, l.quantity,
         l.purchase_order_item_id, l.description, NULL
  FROM jsonb_to_recordset(v_lines) AS l(position integer, product_id uuid, uom_id uuid, units_per_uom integer,
                                        quantity numeric, purchase_order_item_id uuid, description text);

  PERFORM public.fn_manual_audit_log('purchase_orders', p_po_id, v_po.organization_id, 'UPDATE',
    jsonb_build_object('supplier_shipment', jsonb_build_object(
      'old', NULL,
      'new', jsonb_build_object('delivery_note_id', p_request_id, 'note_number', v_number,
                                'ship_date', p_ship_date, 'lines', v_pos, 'carrier', v_carrier,
                                'revision', v_pub.revision, 'by_portal_user', u.id))), 'supplier_portal');

  RETURN jsonb_build_object(
    'delivery_note_id', p_request_id,
    'organization_id',  v_po.organization_id,
    'note_number',      v_number,
    'already_shipped',  false,
    'lines', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                       'purchase_order_item_id', x ->> 'purchase_order_item_id',
                       'quantity',               (x ->> 'quantity')::numeric,
                       'to_ship',                (x ->> 'to_ship_after')::numeric)
                     ORDER BY (x ->> 'position')::integer), '[]'::jsonb)
              FROM jsonb_array_elements(v_lines) x));
END;
$function$;

REVOKE ALL ON FUNCTION public.sp_ship_order(uuid, uuid, integer, text, date, jsonb, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sp_ship_order(uuid, uuid, integer, text, date, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sp_ship_order(uuid, uuid, integer, text, date, jsonb, text, text) TO service_role;


-- ─── 3. Expedições de uma encomenda (vista do fornecedor) ──────────────────
-- lines: linhas de produto da PO com o expedido e o que falta expedir.
-- shipments: guias do portal desta PO (inclui canceladas, com o estado).
CREATE OR REPLACE FUNCTION public.sp_order_shipments(p_po_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u     public.supplier_portal_users := public.fn_sp_actor();
  v_pub public.supplier_po_publications;
  v_po  public.purchase_orders;
BEGIN
  v_pub := public.fn_sp_po_publication(p_po_id, u.id);
  IF v_pub.purchase_order_id IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;

  RETURN jsonb_build_object(
    'lines', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id',      s.id,
               'shipped', s.shipped,
               'to_ship', trim_scale(GREATEST(s.quantity - GREATEST(s.received_quantity, s.shipped), 0)))
             ORDER BY s.created_at, s.id), '[]'::jsonb)
      FROM (
        SELECT poi.id, poi.quantity, poi.received_quantity, poi.created_at,
               public.fn_sp_po_shipped(poi.id) AS shipped
        FROM public.purchase_order_items poi
        WHERE poi.purchase_order_id = p_po_id AND poi.item_type = 'product'
      ) s),
    'shipments', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id',          n.id,
               'note_number', n.note_number,
               'date',        n.document_date,
               'status',      n.status,
               'carrier',     sh.e ->> 'carrier',
               'has_file',    att.e IS NOT NULL,
               'file',        CASE WHEN att.e IS NULL THEN NULL ELSE jsonb_build_object(
                                'path', att.e ->> 'path', 'name', att.e ->> 'name',
                                'mime', att.e ->> 'mime', 'size', (att.e ->> 'size')::bigint) END,
               'lines', (
                 SELECT COALESCE(jsonb_agg(jsonb_build_object(
                          'purchase_order_item_id', l.purchase_order_item_id,
                          'quantity', trim_scale(l.quantity * l.units_per_uom / GREATEST(COALESCE(poi.units_per_uom, 1), 1)))
                        ORDER BY l.position, l.id), '[]'::jsonb)
                 FROM public.supplier_delivery_note_lines l
                 JOIN public.purchase_order_items poi ON poi.id = l.purchase_order_item_id
                 WHERE l.delivery_note_id = n.id AND poi.purchase_order_id = p_po_id))
             ORDER BY n.created_at DESC, n.id), '[]'::jsonb)
      FROM public.supplier_delivery_note_orders o
      JOIN public.supplier_delivery_notes n ON n.id = o.delivery_note_id
      CROSS JOIN LATERAL (
        SELECT e FROM jsonb_array_elements(n.history) WITH ORDINALITY h(e, i)
        WHERE e ->> 'action' = 'shipped' AND e ->> 'origin' = 'supplier_portal'
        ORDER BY i LIMIT 1) sh
      LEFT JOIN LATERAL (
        SELECT e FROM jsonb_array_elements(n.history) WITH ORDINALITY h(e, i)
        WHERE e ->> 'action' = 'attachment'
        ORDER BY i DESC LIMIT 1) att ON true
      WHERE o.purchase_order_id = p_po_id
        AND n.organization_id = v_po.organization_id
        AND n.supplier_id = v_po.supplier_id
        AND n.history @> '[{"origin":"supplier_portal"}]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.sp_order_shipments(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sp_order_shipments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sp_order_shipments(uuid) TO service_role;


-- ─── 4. Anexo da guia (ficheiro) ────────────────────────────────────────────
-- Chamado pela Edge Function validate-upload com o JWT do utilizador do
-- portal (fn_sp_actor() exige auth.uid() do fornecedor):
--   • p_dry_run = true ANTES de promover o ficheiro (quarentena → documents):
--     valida guia/PO/caminho/nome; mime e tamanho opcionais;
--   • p_dry_run = false DEPOIS de promover: o objeto tem de existir em
--     storage 'documents' (só a Edge escreve lá — política
--     block_direct_client_insert_documents); o tamanho gravado é o do objeto.
-- Só guias de origem supplier_portal, de uma PO publicada ao fornecedor atual,
-- não canceladas. Substituir = acrescentar novo anexo; o último conta.
CREATE OR REPLACE FUNCTION public.sp_attach_delivery_note_file(
  p_note_id uuid,
  p_path    text,
  p_name    text,
  p_mime    text,
  p_size    bigint,
  p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u        public.supplier_portal_users := public.fn_sp_actor();
  v_note   public.supplier_delivery_notes;
  v_po_id  uuid;
  v_po     public.purchase_orders;
  v_pub    public.supplier_po_publications;
  v_prefix text;
  v_leaf   text;
  v_name   text := btrim(COALESCE(p_name, ''));
  v_mime   text := lower(btrim(COALESCE(p_mime, '')));
  v_size   bigint := p_size;
  v_objsz  text;
  v_last   jsonb;
  v_entry  jsonb;
BEGIN
  IF p_note_id IS NULL THEN
    RAISE EXCEPTION 'Guia não encontrada' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  -- Guia do portal → PO do 1.º evento 'shipped' → acesso do fornecedor atual.
  SELECT * INTO v_note FROM public.supplier_delivery_notes WHERE id = p_note_id;
  IF FOUND THEN
    SELECT NULLIF(e ->> 'purchase_order_id', '')::uuid INTO v_po_id
    FROM jsonb_array_elements(v_note.history) WITH ORDINALITY h(e, i)
    WHERE e ->> 'action' = 'shipped' AND e ->> 'origin' = 'supplier_portal'
    ORDER BY i LIMIT 1;
  END IF;
  IF v_po_id IS NOT NULL THEN
    v_pub := public.fn_sp_po_publication(v_po_id, u.id);
  END IF;
  IF v_pub.purchase_order_id IS NULL THEN
    RAISE EXCEPTION 'Guia não encontrada' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_po_id;
  IF v_po.organization_id IS DISTINCT FROM v_note.organization_id
     OR v_po.supplier_id IS DISTINCT FROM v_note.supplier_id
     OR NOT EXISTS (SELECT 1 FROM public.supplier_delivery_note_orders o
                    WHERE o.delivery_note_id = p_note_id AND o.purchase_order_id = v_po_id) THEN
    RAISE EXCEPTION 'Guia não encontrada' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  -- Lock da guia (espera por leituras da Receção em curso, que a tomam FOR SHARE).
  IF NOT p_dry_run THEN
    SELECT * INTO v_note FROM public.supplier_delivery_notes WHERE id = p_note_id FOR UPDATE;
  END IF;
  IF v_note.status = 'cancelled' THEN
    RAISE EXCEPTION 'Esta guia foi cancelada pela empresa: não é possível anexar ficheiros'
      USING ERRCODE = 'check_violation', HINT = 'order_closed';
  END IF;

  -- Caminho: {org_id}/supplier-delivery-notes/{note_id}/{ficheiro}
  v_prefix := v_note.organization_id::text || '/supplier-delivery-notes/' || p_note_id::text || '/';
  IF p_path IS NULL OR left(p_path, char_length(v_prefix)) <> v_prefix THEN
    RAISE EXCEPTION 'Caminho do ficheiro inválido para esta guia' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  v_leaf := substr(p_path, char_length(v_prefix) + 1);
  IF v_leaf !~ '^[A-Za-z0-9_-][A-Za-z0-9._-]{0,199}$' THEN
    RAISE EXCEPTION 'Caminho do ficheiro inválido para esta guia' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  IF v_name = '' OR char_length(v_name) > 255 OR v_name ~ '[\x01-\x1F\x7F/\\]' THEN
    RAISE EXCEPTION 'Nome do ficheiro inválido' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  IF NOT p_dry_run OR v_mime <> '' THEN
    IF v_mime NOT IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') THEN
      RAISE EXCEPTION 'Tipo de ficheiro não permitido (só PDF, JPEG, PNG ou WEBP)'
        USING ERRCODE = 'check_violation', HINT = 'validation';
    END IF;
  END IF;

  IF NOT p_dry_run THEN
    -- O objeto tem de estar já no bucket final (promovido pela Edge).
    SELECT o.metadata ->> 'size' INTO v_objsz
    FROM storage.objects o
    WHERE o.bucket_id = 'documents' AND o.name = p_path;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ficheiro não encontrado: carregue-o de novo' USING ERRCODE = 'no_data_found', HINT = 'validation';
    END IF;
    IF v_objsz ~ '^[0-9]{1,18}$' THEN
      v_size := v_objsz::bigint;
    END IF;
  END IF;

  IF (NOT p_dry_run OR v_size IS NOT NULL) AND (v_size IS NULL OR v_size <= 0 OR v_size > 10485760) THEN
    RAISE EXCEPTION 'O ficheiro tem de ter até 10 MB' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  IF p_dry_run THEN
    RETURN jsonb_build_object('delivery_note_id', p_note_id, 'organization_id', v_note.organization_id,
                              'dry_run', true, 'ok', true);
  END IF;

  -- Repetição do mesmo anexo (mesmo caminho do último) → nada a fazer.
  SELECT e INTO v_last
  FROM jsonb_array_elements(v_note.history) WITH ORDINALITY h(e, i)
  WHERE e ->> 'action' = 'attachment'
  ORDER BY i DESC LIMIT 1;
  IF v_last IS NOT NULL AND v_last ->> 'path' = p_path THEN
    RETURN jsonb_build_object('delivery_note_id', p_note_id, 'organization_id', v_note.organization_id,
                              'dry_run', false, 'ok', true, 'already_attached', true, 'replaced', false,
                              'file', jsonb_build_object('path', v_last ->> 'path', 'name', v_last ->> 'name',
                                                         'mime', v_last ->> 'mime', 'size', (v_last ->> 'size')::bigint));
  END IF;

  v_entry := jsonb_build_object(
    'action', 'attachment', 'path', p_path, 'name', v_name, 'mime', v_mime, 'size', v_size,
    'at', now(), 'by_portal_user', u.id);

  UPDATE public.supplier_delivery_notes
     SET history    = history || jsonb_build_array(v_entry),
         updated_at = clock_timestamp()
   WHERE id = p_note_id;

  PERFORM public.fn_manual_audit_log('purchase_orders', v_po_id, v_po.organization_id, 'UPDATE',
    jsonb_build_object('supplier_shipment_file', jsonb_build_object(
      'old', CASE WHEN v_last IS NULL THEN NULL ELSE jsonb_build_object('path', v_last ->> 'path') END,
      'new', jsonb_build_object('delivery_note_id', p_note_id, 'path', p_path, 'name', v_name,
                                'mime', v_mime, 'size', v_size, 'by_portal_user', u.id))), 'supplier_portal');

  RETURN jsonb_build_object('delivery_note_id', p_note_id, 'organization_id', v_note.organization_id,
                            'dry_run', false, 'ok', true, 'already_attached', false, 'replaced', v_last IS NOT NULL,
                            'file', jsonb_build_object('path', p_path, 'name', v_name, 'mime', v_mime, 'size', v_size));
END;
$function$;

REVOKE ALL ON FUNCTION public.sp_attach_delivery_note_file(uuid, text, text, text, bigint, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sp_attach_delivery_note_file(uuid, text, text, text, bigint, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sp_attach_delivery_note_file(uuid, text, text, text, bigint, boolean) TO service_role;


-- ─── 5. Conferir ────────────────────────────────────────────────────────────
DO $conferir$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.sp_ship_order(uuid, uuid, integer, text, date, jsonb, text, text)',
    'public.sp_order_shipments(uuid)',
    'public.sp_attach_delivery_note_file(uuid, text, text, text, bigint, boolean)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon não pode executar %', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated devia poder executar %', v_fn;
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn::regprocedure) THEN
      RAISE EXCEPTION '% devia ser SECURITY DEFINER', v_fn;
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated', 'public.fn_sp_po_shipped(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_sp_po_shipped(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_sp_po_shipped é interna: não pode ser executável por anon/authenticated';
  END IF;
END
$conferir$;
