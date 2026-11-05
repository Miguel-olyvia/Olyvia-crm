-- =============================================================================
-- 20270108220000 — Lote B (P1.4): permissão por organização · inventário, armazéns, receção e compras
-- =============================================================================
-- Só verificação de permissão: cada has_anew_permission / has_scheduling_permission
-- (globais) passa a has_anew_permission_for_org(uid, código, organização da linha)
-- ou, quando a organização só se conhece depois, a verificação de âmbito usa
-- get_user_permission_org_ids(uid, código) em vez de get_user_visible_org_ids.
-- As verificações globais que já existiam ficam (mesmas mensagens). Nada mais muda.
-- Cada função parte de pg_get_functiondef da versão viva (05/11/2026).
-- Funções: fn_po_cancel_remainder_guard, fn_po_crm_load, inv_custos_movimentos, inv_valor_stock_armazens, rpc_adjust_stock, rpc_bulk_update_inventory_count_lines, rpc_create_inventory_count, rpc_create_purchase_order, rpc_decrement_stock, rpc_delete_purchase_order, rpc_delete_stock, rpc_delete_warehouse, rpc_delivery_note_cancel, rpc_delivery_note_close, rpc_delivery_note_get, rpc_delivery_note_reopen, rpc_delivery_note_save, rpc_finalize_inventory_count, rpc_get_product_stock_reservations, rpc_inventory_today, rpc_po_receipt_release_to_stock, rpc_preview_po_receipt, rpc_product_code_learn, rpc_product_code_remove, rpc_receive_by_code, rpc_receive_purchase_order, rpc_receive_purchase_order_lines, rpc_receiving_lookup, rpc_register_stock_entry, rpc_register_stock_loss, rpc_register_stock_transfer, rpc_resolve_inventory_count_line, rpc_restore_purchase_order, rpc_restore_stock, rpc_restore_warehouse, rpc_revert_purchase_order_receipt, rpc_update_inventory_count_line_quantity, rpc_update_purchase_order, rpc_upsert_inventory_settings
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_po_cancel_remainder_guard(p_purchase_order_id uuid)
 RETURNS purchase_orders
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
BEGIN
  IF public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.receive', v_po.organization_id)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_po.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_po.source_type = 'contract' AND v_po.source_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('po_receipt_contract:' || v_po.source_id::text, 0));
  END IF;

  RETURN v_po;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_po_crm_load(p_po_id uuid, p_permission text, p_lock boolean)
 RETURNS purchase_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_po  public.purchase_orders;
BEGIN
  IF v_uid IS NULL OR public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF p_lock THEN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id AND deleted_at IS NULL FOR UPDATE;
  ELSE
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id AND deleted_at IS NULL;
  END IF;
  IF v_po.id IS NULL OR NOT public.fn_deal_org_in_scope(v_po.organization_id) THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF NOT (public.has_anew_permission_for_org(v_uid, p_permission, v_po.organization_id) OR public.fn_neg_papel_permite(v_po.organization_id, p_permission)) THEN -- 20270101340000
    RAISE EXCEPTION 'Sem permissão para esta operação (%)', p_permission
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  RETURN v_po;
END;
$function$;

CREATE OR REPLACE FUNCTION public.inv_custos_movimentos(p_ids uuid[])
 RETURNS TABLE(id uuid, unit_cost_at_time numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 20270106070000: o custo unitário de cada movimento pedido, só dos movimentos que a pessoa vê (organização visível +
  -- inventory.view, como stock_movements_select_policy) e cuja organização lhe dá products.view_cost. Os outros não vêm.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(cardinality(p_ids), 0) > 2000 THEN
    RAISE EXCEPTION 'Demasiados movimentos num pedido (máximo 2000).' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF NOT public.has_anew_permission(auth.uid(), 'inventory.view') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.id, m.unit_cost_at_time::numeric
  FROM public.stock_movements m
  WHERE m.id = ANY (p_ids)
    AND m.organization_id IN (SELECT public.get_user_permission_org_ids(auth.uid(), 'inventory.view'))
    AND public.has_anew_permission_in_org(auth.uid(), 'products.view_cost', m.organization_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.inv_valor_stock_armazens(p_org uuid)
 RETURNS TABLE(warehouse_id uuid, valor numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 20270106070000: o valor do stock (quantidade x custo médio) só com products.view_cost na organização, e com a leitura que
  -- stocks_select_policy já pede (organização visível + inventory.view).
  IF auth.uid() IS NULL OR p_org IS NULL
     OR p_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.view', p_org)
     OR NOT public.has_anew_permission_in_org(auth.uid(), 'products.view_cost', p_org) THEN
    RAISE EXCEPTION 'Sem permissão para ver o custo do stock (products.view_cost) nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT s.warehouse_id, sum(coalesce(s.quantity, 0) * coalesce(s.average_cost, 0))::numeric
  FROM public.stocks s
  WHERE s.organization_id = p_org AND s.deleted_at IS NULL
  GROUP BY s.warehouse_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_adjust_stock(p_product_id uuid, p_warehouse_id uuid, p_qty integer, p_direction text, p_reason text, p_notes text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  IF p_direction NOT IN ('positivo', 'negativo') THEN
    RAISE EXCEPTION 'Direção do ajuste tem de ser ''positivo'' ou ''negativo''' USING ERRCODE = 'check_violation';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Motivo do ajuste é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.stocks
  WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Não existe stock deste produto neste armazém' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_doc := public.fn_next_stock_document_number(v_org, 'ajuste');

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, counterparty, notes, created_by
  ) VALUES (
    v_org, p_product_id, p_warehouse_id, 'ajuste_' || p_direction, p_qty,
    v_doc, 'ajuste', p_reason, p_notes, v_actor
  )
  RETURNING balance_after INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_update_inventory_count_lines(p_inventory_count_id uuid, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor        uuid;
  v_org          uuid;
  v_status       text;
  v_warehouse_id uuid;
  v_row          jsonb;
  v_idx          integer := -1;
  v_input_index  integer;
  v_sku          text;
  v_qty_txt      text;
  v_qty          integer;
  v_matches      integer;
  v_line_id      uuid;
  v_product_id   uuid;
  v_snapshot     integer;
  v_had_resolution boolean;
  v_live_qty     integer;
  v_moved        boolean;
  v_results      jsonb := '[]'::jsonb;
  v_updated      integer := 0;
  v_failed       integer := 0;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT ic.organization_id, ic.status, ic.warehouse_id
  INTO v_org, v_status, v_warehouse_id
  FROM public.inventory_counts ic
  WHERE ic.id = p_inventory_count_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Sessão de contagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Mesma exigência de rpc_update_inventory_count_line_quantity: organização
  -- visível + inventory.count. Esta função é a versão em lote dessa; não pode
  -- abrir uma porta que a versão unitária não abre.
  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.count', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para contar inventário nesta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'em_contagem' THEN
    RAISE EXCEPTION 'A contagem já não está em curso (estado atual: %)', v_status USING ERRCODE = 'check_violation';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'p_lines deve ser um array jsonb' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- D13: travão defensivo, não regra de negócio — o cliente deve partir
  -- ficheiros grandes em lotes em vez de segurar uma transação aberta.
  IF jsonb_array_length(p_lines) > 5000 THEN
    RAISE EXCEPTION 'Demasiadas linhas numa só chamada (% linhas, máximo 5000) — divida a importação em lotes', jsonb_array_length(p_lines)
      USING ERRCODE = 'program_limit_exceeded';
  END IF;

  -- ---- Mapa SKU → linha, construído UMA vez por chamada (D16) -------------
  --
  -- A comparação upper(btrim(p.sku)) não pode usar idx_products_sku (btree
  -- simples sobre sku); resolver o SKU dentro do ciclo obrigava a varrer
  -- TODAS as linhas da contagem por cada linha do ficheiro — duas vezes, aliás
  -- (o count(*) e depois a query de campos). Numa contagem inicial de milhares
  -- de produtos isso são milhões de comparações por lote e o statement_timeout
  -- do role authenticated mata a chamada inteira. Agora é um scan só, seguido
  -- de um lookup indexado por linha de ficheiro.
  --
  -- DROP defensivo antes de criar: a tabela é ON COMMIT DROP, mas se esta
  -- função for chamada duas vezes DENTRO da mesma transação (um DO block, ou
  -- outra rotina que a chame em ciclo) a segunda chamada encontraria viva a
  -- tabela da primeira. O nome é improvável de propósito.
  --
  -- Todas as referências são qualificadas com pg_temp.: como pg_temp está
  -- listado EXPLICITAMENTE no search_path desta função (e em último lugar),
  -- um nome não qualificado resolveria primeiro em public — e nunca se há de
  -- poder criar em public uma tabela que sequestre esta.
  DROP TABLE IF EXISTS pg_temp._olyvia_bulk_icl_sku_map;

  CREATE TEMP TABLE _olyvia_bulk_icl_sku_map ON COMMIT DROP AS
  SELECT upper(btrim(p.sku))                             AS k,
         count(*)                                        AS n,
         -- ATENÇÃO: quando n > 1 estes quatro agregados podem vir de linhas
         -- DIFERENTES (são independentes entre si, não há aqui nenhum
         -- "escolher a linha X e ler os seus campos"). É inofensivo porque
         -- n > 1 é rejeitado como "SKU ambíguo" no ciclo ANTES de qualquer um
         -- deles ser lido. Se algum dia se deixar de rejeitar o caso ambíguo,
         -- isto TEM de passar a DISTINCT ON (k) com uma ordenação estável.
         min(icl.id::text)::uuid                         AS line_id,
         min(icl.product_id::text)::uuid                 AS product_id,
         min(icl.system_quantity_at_start)               AS snapshot,
         bool_or(icl.discrepancy_resolution IS NOT NULL) AS had_resolution
  FROM public.inventory_count_lines icl
  JOIN public.products p ON p.id = icl.product_id
  WHERE icl.inventory_count_id = p_inventory_count_id
    AND p.sku IS NOT NULL
    AND btrim(p.sku) <> ''
  GROUP BY 1;

  CREATE INDEX ON pg_temp._olyvia_bulk_icl_sku_map (k);
  ANALYZE pg_temp._olyvia_bulk_icl_sku_map;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_idx := v_idx + 1;

    -- Calculados FORA do bloco com EXCEPTION para que o relatório de erro
    -- consiga sempre identificar a linha, mesmo quando o próprio conteúdo é
    -- inválido.
    -- Só se aceita um input_index que seja de facto um inteiro pequeno; um
    -- valor decimal ou gigante rebentaria o cast AQUI, fora do bloco
    -- protegido, e abortaria o lote inteiro. Na dúvida usa-se a posição real
    -- no array.
    v_input_index := CASE
                       WHEN jsonb_typeof(v_row -> 'input_index') = 'number'
                            AND (v_row ->> 'input_index') ~ '^-?[0-9]{1,9}$'
                       THEN (v_row ->> 'input_index')::integer
                       ELSE v_idx
                     END;
    v_sku := NULLIF(btrim(COALESCE(v_row ->> 'sku', '')), '');

    -- Um BEGIN ... EXCEPTION por elemento cria o SAVEPOINT implícito do
    -- plpgsql: uma linha que rebente é revertida sozinha e as restantes
    -- continuam (mesmo padrão de rpc_bulk_import_products, 20260826010000).
    BEGIN
      IF v_sku IS NULL THEN
        RAISE EXCEPTION 'SKU em falta' USING ERRCODE = 'invalid_parameter_value';
      END IF;

      -- Quantidade: só inteiro não negativo. A validação é feita em texto com
      -- regex antes de qualquer cast, para que "abc", "-3", "1,5" ou um valor
      -- em falta deem a mensagem de negócio e não um erro de conversão do
      -- Postgres. Aceita "12" e "12.0" (folhas de cálculo exportam assim).
      -- O limite de 9 dígitos evita ainda o overflow de integer.
      v_qty_txt := btrim(COALESCE(v_row ->> 'counted_quantity', ''));
      IF v_qty_txt = ''
         OR v_qty_txt !~ '^[0-9]{1,9}(\.0+)?$' THEN
        RAISE EXCEPTION 'Quantidade inválida' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_qty := split_part(v_qty_txt, '.', 1)::integer;

      -- Resolve o SKU dentro DESTA contagem (nunca no catálogo inteiro): a
      -- linha tem de já existir na sessão. Comparação robusta (maiúsculas e
      -- espaços) porque o SKU vem de scanner ou de ficheiro.
      --
      -- Um único lookup indexado no mapa pré-construído acima (D16), a
      -- substituir as duas varreduras completas que aqui estavam.
      --
      -- O mapa é um retrato tirado antes do ciclo. O único campo que o ciclo
      -- pode desatualizar é had_resolution, e só quando o MESMO SKU aparece
      -- duas vezes no mesmo lote: a 2ª passagem voltaria a pôr a NULL campos
      -- que a 1ª já pôs a NULL. É idempotente, o estado final é idêntico ao
      -- da versão anterior. line_id/product_id/snapshot são imutáveis aqui.
      SELECT m.n, m.line_id, m.product_id, m.snapshot, m.had_resolution
      INTO v_matches, v_line_id, v_product_id, v_snapshot, v_had_resolution
      FROM pg_temp._olyvia_bulk_icl_sku_map m
      WHERE m.k = upper(btrim(v_sku));

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado nesta contagem' USING ERRCODE = 'no_data_found';
      ELSIF v_matches > 1 THEN
        RAISE EXCEPTION 'SKU ambíguo' USING ERRCODE = 'cardinality_violation';
      END IF;

      -- A partir daqui é réplica fiel de rpc_update_inventory_count_line_
      -- quantity (20261116020000:685-704) — D12. Não inventar lógica nova.
      SELECT quantity INTO v_live_qty
      FROM public.stocks
      WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id;

      v_moved := (COALESCE(v_live_qty, 0) IS DISTINCT FROM v_snapshot);

      -- D2: recontar uma linha já resolvida limpa a resolução anterior.
      UPDATE public.inventory_count_lines
      SET counted_quantity   = v_qty,
          counted_by         = v_actor,
          counted_at         = now(),
          -- D3: cumulativo, nunca volta a false sozinho.
          moved_during_count = moved_during_count OR v_moved,
          discrepancy_resolution = CASE WHEN v_had_resolution THEN NULL ELSE discrepancy_resolution END,
          resolution_notes       = CASE WHEN v_had_resolution THEN NULL ELSE resolution_notes END,
          stock_movement_id      = CASE WHEN v_had_resolution THEN NULL ELSE stock_movement_id END
      WHERE id = v_line_id;

      v_updated := v_updated + 1;
      v_results := v_results || jsonb_build_object(
        'input_index', v_input_index,
        'sku',         v_sku,
        'status',      'ok'
      );

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_object(
        'input_index', v_input_index,
        'sku',         v_sku,
        'status',      'error',
        'error',       SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'updated', v_updated,
    'failed',  v_failed,
    'results', v_results
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_create_inventory_count(p_organization_id uuid, p_warehouse_id uuid, p_category_id uuid DEFAULT NULL::uuid, p_initial boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor        uuid;
  v_count_id     uuid;
  v_doc          text;
  v_lines_seeded integer;
  -- Só usados no caminho de erro (D4).
  v_has_stock    boolean;
  v_msg          text;
  -- Novo: linhas de public.stocks criadas pela contagem inicial. Inicializada
  -- a 0 para que o ramo de ROTINA devolva 0 e não null (D13).
  v_stock_rows_created integer := 0;
  -- Categoria escolhida + todas as descendentes (qualquer nível, incluindo
  -- apagadas: há produtos que ainda apontam para elas).
  v_category_ids uuid[];
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT (
       public.has_anew_permission_for_org(auth.uid(), 'inventory.count', p_organization_id)
       OR public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', p_organization_id)
     ) THEN
    RAISE EXCEPTION 'Sem permissão para criar contagens de inventário nesta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_warehouse_id AND organization_id = p_organization_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.product_categories WHERE id = p_category_id
  ) THEN
    RAISE EXCEPTION 'Categoria não encontrada' USING ERRCODE = 'check_violation';
  END IF;

  IF p_category_id IS NOT NULL THEN
    WITH RECURSIVE tree AS (
      SELECT p_category_id AS id
      UNION
      SELECT c.id
      FROM public.product_categories c
      JOIN tree t ON c.parent_id = t.id
    )
    SELECT array_agg(id) INTO v_category_ids FROM tree;
  END IF;

  v_doc := public.fn_next_inventory_count_number(p_organization_id);

  INSERT INTO public.inventory_counts (
    organization_id, warehouse_id, category_id, document_number, status, started_at, created_by
  ) VALUES (
    p_organization_id, p_warehouse_id, p_category_id, v_doc, 'em_contagem', now(), v_actor
  )
  RETURNING id INTO v_count_id;

  IF COALESCE(p_initial, false) THEN
    -- 20270101240000: a contagem inicial deixa de criar linhas de stocks para todos os produtos da organização. O universo passa a
    -- ser os produtos MARCADOS neste armazém (linha de stocks não apagada, mesmo com quantidade 0 — marca-se na ficha do produto
    -- no Catálogo e custos, um a um ou em massa). stock_rows_created fica sempre 0 (chave mantida).

    -- Contagem INICIAL: o universo é o catálogo de produtos da organização,
    -- não o stock. Um produto sem linha em stocks para este armazém entra na
    -- folha com system_quantity_at_start = 0 — é exatamente o caso que a
    -- contagem inicial existe para resolver (armazém novo / artigo nunca
    -- movimentado, que a versão baseada em stocks deixava invisível).
    --
    -- Scoping por product_organizations e NÃO por products.organization_id
    -- (facto F2 de 20261204000000: essa coluna está a NULL/incoerente em
    -- produção).
    --
    -- LEFT JOIN direto a stocks, sem agregação: unique_product_warehouse
    -- garante no máximo 1 linha de stocks por (produto, armazém) — ver decisão
    -- D9 de 20261204000000. Se essa constraint algum dia cair, esta query TEM
    -- de passar a agregar (SUM(quantity) ... GROUP BY product_id) ou duplica
    -- linhas e viola inventory_count_lines_unique_product.
    --
    -- s.deleted_at IS NULL vive dentro do ON (não no WHERE) de propósito: uma
    -- linha de stocks na reciclagem tem de dar 0, não excluir o produto (D10
    -- de 20261204000000).
    --
    -- O COALESCE mantém-se mesmo depois do INSERT acima: há dois casos em que
    -- a linha existe para a constraint mas NÃO para este JOIN — reciclagem e
    -- organization_id incoerente — e aí s.quantity vem NULL na mesma (D12).
    INSERT INTO public.inventory_count_lines (
      inventory_count_id, product_id, system_quantity_at_start
    )
    SELECT v_count_id, p.id, COALESCE(s.quantity, 0)
    FROM public.products p
    JOIN public.product_organizations po
      ON po.product_id = p.id AND po.organization_id = p_organization_id
    JOIN public.stocks s  -- 20270101240000: só os marcados neste armazém (era LEFT JOIN: todo o catálogo)
      ON s.product_id = p.id
     AND s.warehouse_id = p_warehouse_id
     AND s.organization_id = p_organization_id
     AND s.deleted_at IS NULL
    WHERE p.is_deleted = false
      AND p.deleted_at IS NULL
      -- 'draft' ainda não é artigo de catálogo; 'discontinued' entra de
      -- propósito — pode continuar fisicamente em prateleira (F4 de
      -- 20261204000000).
      AND p.status <> 'draft'::public.product_status
      AND (p_category_id IS NULL OR p.category_id = ANY(v_category_ids) OR p.subcategory_id = ANY(v_category_ids));
  ELSE
    -- Contagem de ROTINA: comportamento original, inalterado — só entra o que
    -- o sistema julga ter em stocks neste armazém. Esta migration NÃO toca
    -- neste ramo, de propósito (D8).
    INSERT INTO public.inventory_count_lines (
      inventory_count_id, product_id, system_quantity_at_start
    )
    SELECT v_count_id, s.product_id, s.quantity
    FROM public.stocks s
    JOIN public.products p ON p.id = s.product_id
    WHERE s.warehouse_id = p_warehouse_id
      AND s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
      AND p.is_deleted = false
      AND (p_category_id IS NULL OR p.category_id = ANY(v_category_ids) OR p.subcategory_id = ANY(v_category_ids));
  END IF;

  GET DIAGNOSTICS v_lines_seeded = ROW_COUNT;

  -- Uma contagem sem uma única linha não serve para nada: não se conta nada,
  -- não há discrepâncias para resolver, e o documento só fica a sujar a lista.
  -- Em vez de devolver lines_seeded = 0 em silêncio (foi assim que nasceram as
  -- 4 contagens vazias em produção), recusa-se a criação e explica-se porquê.
  --
  -- ATENÇÃO ao rollback (D2): esta exceção aborta a função e a transação da
  -- chamada RPC, por isso o INSERT do cabeçalho feito acima é REVERTIDO pelo
  -- PostgreSQL. Não fica nenhum documento criado — é esse o objetivo. E como
  -- fn_next_inventory_count_number é MAX+1 e não uma sequência (F3), v_doc
  -- também não fica queimado: a próxima contagem válida recebe esse número.
  -- Desde esta migration o mesmo rollback apanha as linhas de stocks criadas
  -- acima; de resto, se o catálogo está vazio, o INSERT em stocks também não
  -- criou nada (D11).
  --
  -- O diagnóstico do motivo só corre aqui, no caminho de erro (D4).
  IF v_lines_seeded = 0 THEN
    IF COALESCE(p_initial, false) THEN
      IF p_category_id IS NOT NULL THEN
        v_msg := 'Não há produtos desta categoria marcados neste armazém, '
              || 'por isso não há nada para contar. Marque o armazém nos produtos em '
              || 'Catálogo e custos (na ficha do produto ou em massa) ou crie a contagem '
              || 'inicial sem filtro de categoria. '
              || 'Produtos apagados e em rascunho nunca entram numa contagem.';
      ELSE
        v_msg := 'Ainda não há produtos marcados neste armazém, por isso não há nada para contar. '
              || 'Marque o armazém nos produtos em Catálogo e custos (na ficha do produto '
              || 'ou em massa) antes de iniciar a contagem inicial. '
              || 'Produtos apagados e em rascunho nunca entram numa contagem.';
      END IF;
    ELSE
      -- Mesmo predicado do ramo de rotina, sem o filtro de categoria (D5).
      SELECT EXISTS (
        SELECT 1
        FROM public.stocks s
        JOIN public.products p ON p.id = s.product_id
        WHERE s.warehouse_id = p_warehouse_id
          AND s.organization_id = p_organization_id
          AND s.deleted_at IS NULL
          AND p.is_deleted = false
      ) INTO v_has_stock;

      IF p_category_id IS NOT NULL AND v_has_stock THEN
        -- O armazém tem stock, só não desta categoria (D6).
        v_msg := 'Não há produtos desta categoria com stock neste armazém. '
              || 'Escolha outra categoria ou crie a contagem sem filtro de '
              || 'categoria, para contar tudo o que o armazém tem em stock.';
      ELSE
        v_msg := 'Este armazém ainda não tem stock registado no sistema, por isso '
              || 'uma contagem de rotina não teria nada para contar. Use a '
              || '"Contagem inicial": essa carrega todos os produtos do catálogo '
              || 'e permite registar as quantidades que existem mesmo na '
              || 'prateleira, dando entrada do stock no fim.';
      END IF;
    END IF;

    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'no_data_found';
  END IF;

  RETURN jsonb_build_object(
    'id', v_count_id,
    'document_number', v_doc,
    'status', 'em_contagem',
    'lines_seeded', v_lines_seeded,
    'initial', COALESCE(p_initial, false),
    -- Novo: quantas linhas de public.stocks foram CRIADAS agora (0 na rotina e
    -- 0 numa contagem inicial de um armazém que já as tinha todas) — D13.
    'stock_rows_created', v_stock_rows_created
  );
END;
$function$;

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
    COALESCE(nullif(p_order ->> 'status', ''), 'pending'),
    COALESCE((p_order ->> 'total_value')::numeric, 0),
    nullif(p_order ->> 'notes', ''),
    p_organization_id,
    v_actor,
    v_source_type,
    v_source_id,
    nullif(p_order ->> 'supplier_notes', '')  -- F3.2 (20261211130000)
  )
  RETURNING * INTO v_order;

  -- ── INSERT items (fully-computed by the FE; persisted verbatim) ───────────
  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
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
    'purchase_order_items', jsonb_build_object('new', COALESCE(p_items, '[]'::jsonb))
  );

  -- ── Single consolidated audit row (entity_id = PO id, org direct) ─────────
  PERFORM public.fn_manual_audit_log(
    'purchase_orders', v_order.id, v_order.organization_id, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_order;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_decrement_stock(p_product_id uuid, p_warehouse_id uuid, p_qty integer, p_document_number text, p_document_type text, p_counterparty text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_sale_source_type text DEFAULT NULL::text, p_sale_source_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_org    uuid;
  v_doc    text;
  v_result integer;
  -- NOVO (20261205200000): guarda da saída ligada a Encomenda Cliente
  v_order_label  text;
  v_status       text;
  v_line_count   integer;
  v_needed       numeric;
  v_ordered      numeric;
  v_reserved     numeric;
  v_po_numbers   text;
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
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Confirma que o contrato/proposta indicado é visível pelo utilizador e
  -- pertence à mesma organização — nunca confiar num id vindo do cliente sem
  -- validar o scope (mesmo princípio de segurança usado em
  -- rpc_get_client_order_document).
  IF p_sale_source_type = 'contract' AND p_sale_source_id IS NOT NULL THEN
    -- NOVO (20261205200000): lê também o número e o estado (era só EXISTS).
    SELECT COALESCE(cc.order_number, cc.contract_number), cc.status
      INTO v_order_label, v_status
    FROM public.client_contracts cc
    WHERE cc.id = p_sale_source_id
      AND cc.organization_id = v_org
      AND cc.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Encomenda Cliente (contrato) não encontrada nesta organização' USING ERRCODE = 'no_data_found';
    END IF;

    -- NOVO (20261205200000): guarda — mesmas regras de
    -- rpc_confirm_client_order_stock_exit.
    IF v_status IS NULL OR v_status NOT IN ('signed', 'assinado') THEN
      RAISE EXCEPTION 'A encomenda % não está assinada — só é possível dar saída de stock para encomendas de cliente assinadas', v_order_label
        USING ERRCODE = 'check_violation';
    END IF;

    -- Lock por produto (mesma ordem que o confirm e
    -- fn_client_order_request_missing): serializa saídas concorrentes da
    -- mesma encomenda/produto. Dentro do confirm as linhas já estão trancadas.
    PERFORM 1
    FROM public.stocks s
    JOIN public.warehouses w ON w.id = s.warehouse_id
    WHERE s.product_id = p_product_id
      AND w.organization_id = v_org
    ORDER BY s.product_id, s.warehouse_id
    FOR UPDATE OF s;

    -- 3. Já há saída/venda ativa (não estornada) deste produto nesta encomenda.
    IF EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.sale_source_type = 'contract'
        AND sm.sale_source_id = p_sale_source_id
        AND sm.product_id = p_product_id
        AND sm.movement_type IN ('venda', 'saida')
        AND NOT EXISTS (
          SELECT 1 FROM public.stock_movements r
          WHERE r.reversal_of_movement_id = sm.id
        )
    ) THEN
      RAISE EXCEPTION 'Este produto já teve saída de stock registada na encomenda % — estorne a saída anterior antes de registar outra', v_order_label
        USING ERRCODE = 'unique_violation';
    END IF;

    SELECT count(*),
           COALESCE(SUM(r.qty_needed), 0),
           COALESCE(SUM(r.qty_ordered), 0),
           COALESCE(SUM(r.qty_reserved), 0)
      INTO v_line_count, v_needed, v_ordered, v_reserved
    FROM public.fn_client_order_line_reservations(v_org, ARRAY[p_product_id]) r
    WHERE r.contract_id = p_sale_source_id;

    -- 1. O produto tem de estar numa linha da encomenda.
    IF v_line_count = 0 THEN
      RAISE EXCEPTION 'Este produto não faz parte da encomenda %', v_order_label
        USING ERRCODE = 'check_violation';
    END IF;

    -- 4. Coberto por PO ligada ao contrato (recebida ou a caminho) — mesmo
    -- universo de POs que fn_client_order_line_reservations conta.
    IF v_ordered > 0 THEN
      SELECT string_agg(DISTINCT COALESCE(po.order_number, po.id::text), ', ')
        INTO v_po_numbers
      FROM public.purchase_orders po
      JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
      WHERE po.source_type = 'contract'
        AND po.source_id = p_sale_source_id
        AND po.status IS DISTINCT FROM 'cancelled'
        AND po.deleted_at IS NULL
        AND poi.product_id = p_product_id;
    END IF;

    IF v_needed > 0 AND v_ordered >= v_needed THEN
      RAISE EXCEPTION 'Este produto da encomenda % já está coberto pela encomenda a fornecedor % (recebida ou a caminho) — não é possível dar também saída de stock',
        v_order_label, COALESCE(v_po_numbers, '—')
        USING ERRCODE = 'check_violation';
    END IF;

    -- 2. Só se consome o stock reservado para esta encomenda.
    IF p_qty > v_reserved THEN
      IF v_ordered > 0 THEN
        RAISE EXCEPTION 'Só pode dar saída de % unidade(s) deste produto na encomenda % — o restante já está encomendado ao fornecedor (%) ou reservado para encomendas assinadas antes desta',
          trim_scale(GREATEST(v_reserved, 0)), v_order_label, COALESCE(v_po_numbers, '—')
          USING ERRCODE = 'check_violation';
      ELSIF v_reserved <= 0 THEN
        RAISE EXCEPTION 'Não há stock livre para a encomenda %: o stock existente deste produto está reservado para encomendas assinadas antes desta. Peça a quantidade em falta ao fornecedor.',
          v_order_label
          USING ERRCODE = 'check_violation';
      ELSE
        RAISE EXCEPTION 'Só pode dar saída de % unidade(s) deste produto na encomenda % — o restante stock está reservado para encomendas assinadas antes desta. Peça a diferença ao fornecedor.',
          trim_scale(v_reserved), v_order_label
          USING ERRCODE = 'check_violation';
      END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_purchase_order(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_before public.purchase_orders;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.purchase_orders WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.delete', v_before.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para eliminar encomendas' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Encomenda já está eliminada' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.purchase_orders
  SET    deleted_at = now(), deleted_by = v_actor, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'purchase_orders', p_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now())),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', to_jsonb(v_actor))
    ),
    'web_app', p_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_stock(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_before public.stocks;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.stocks WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.delete', v_before.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para eliminar stocks' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Stock já está eliminado' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.stocks
  SET    deleted_at = now(), deleted_by = v_actor, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'stocks', p_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now())),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', to_jsonb(v_actor))
    ),
    'web_app', p_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_warehouse(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_before public.warehouses;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.warehouses WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission_for_org(auth.uid(), 'warehouses.delete', v_before.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para eliminar armazéns' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Armazém já está eliminado' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.warehouses
  SET    deleted_at = now(), deleted_by = v_actor, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'warehouses', p_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now())),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', to_jsonb(v_actor))
    ),
    'web_app', p_id
  );
END;
$function$;

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
  IF NOT public.has_anew_permission_for_org(auth.uid(), 'receiving.manage_delivery_notes', v_note.organization_id) THEN  -- NOVO (20261210130000)
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
  IF NOT public.has_anew_permission_for_org(auth.uid(), 'receiving.manage_delivery_notes', v_note.organization_id) THEN  -- NOVO (20261210130000)
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

  IF NOT (public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.view', v_note.organization_id)
          OR public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.receive', v_note.organization_id)) THEN
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
  IF NOT public.has_anew_permission_for_org(auth.uid(), 'receiving.manage_delivery_notes', v_note.organization_id) THEN  -- NOVO (20261210130000)
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
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'receiving.manage_delivery_notes', v_org) THEN  -- NOVO (20261210130000)
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

CREATE OR REPLACE FUNCTION public.rpc_finalize_inventory_count(p_inventory_count_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor        uuid;
  v_org          uuid;
  v_status       text;
  v_warehouse_id uuid;
  v_document_number text;
  v_unresolved   integer;
  v_uncounted    integer;
  v_counted      integer;
  v_total        integer;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT organization_id, status, warehouse_id, document_number
  INTO v_org, v_status, v_warehouse_id, v_document_number
  FROM public.inventory_counts
  WHERE id = p_inventory_count_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Sessão de contagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para finalizar contagens de inventário nesta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'em_contagem' THEN
    RAISE EXCEPTION 'Esta sessão de contagem já não está em curso (estado atual: %)', v_status USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_unresolved
  FROM public.inventory_count_lines
  WHERE inventory_count_id = p_inventory_count_id
    AND counted_quantity IS NOT NULL
    AND counted_quantity <> system_quantity_at_start
    AND discrepancy_resolution IS NULL;

  IF v_unresolved > 0 THEN
    RAISE EXCEPTION 'Existem % linha(s) com diferença por resolver antes de finalizar a contagem %', v_unresolved, v_document_number
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) FILTER (WHERE counted_quantity IS NULL),
         count(*) FILTER (WHERE counted_quantity IS NOT NULL),
         count(*)
  INTO v_uncounted, v_counted, v_total
  FROM public.inventory_count_lines
  WHERE inventory_count_id = p_inventory_count_id;

  -- Fecha o gap da Fase 4: stocks.last_counted passa a ser escrito para todos
  -- os pares (product_id, warehouse_id) contados nesta sessão.
  UPDATE public.stocks
  SET last_counted = now()
  WHERE warehouse_id = v_warehouse_id
    AND product_id IN (
      SELECT product_id FROM public.inventory_count_lines
      WHERE inventory_count_id = p_inventory_count_id
        AND counted_quantity IS NOT NULL
    );

  UPDATE public.inventory_counts
  SET status = 'finalizada',
      finalized_at = now(),
      finalized_by = v_actor
  WHERE id = p_inventory_count_id;

  RETURN jsonb_build_object(
    'id', p_inventory_count_id,
    'document_number', v_document_number,
    'status', 'finalizada',
    'lines_total', v_total,
    'lines_counted', v_counted,
    'lines_uncounted', v_uncounted
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_get_product_stock_reservations(p_organization_id uuid, p_product_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(product_id uuid, qty_reserved numeric, qty_missing numeric, orders_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Utilizador não autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.view', p_organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para ver reservas de stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    r.product_id,
    SUM(COALESCE(r.qty_reserved, 0))::numeric,
    SUM(COALESCE(r.qty_missing, 0))::numeric,
    (COUNT(DISTINCT r.contract_id) FILTER (
       WHERE COALESCE(r.qty_reserved, 0) > 0 OR COALESCE(r.qty_missing, 0) > 0
    ))::integer
  FROM public.fn_client_order_line_reservations(p_organization_id, p_product_ids) r
  WHERE r.product_id IS NOT NULL
  GROUP BY r.product_id
  HAVING SUM(COALESCE(r.qty_reserved, 0)) > 0
      OR SUM(COALESCE(r.qty_missing, 0)) > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_inventory_today(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_can_po       boolean;
  v_can_rec      boolean;
  v_can_sup      boolean;
  v_can_pricing  boolean;
  v_can_ec       boolean;
  v_can_inv      boolean;
  v_can_cost     boolean;
  v_purchases    jsonb;
  v_suppliers    jsonb;
  v_client_ord   jsonb;
  v_stock        jsonb;
  v_counts       jsonb;
  v_settings     jsonb;
  v_reserved     numeric;
  v_open_dn      integer;
  v_div_dn       integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Utilizador não autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(v_uid)) THEN
    RAISE EXCEPTION 'Sem permissão para ver o inventário desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_can_po  := COALESCE(public.has_anew_permission_for_org(v_uid, 'purchase_orders.view', p_organization_id), false);
  -- Guias do fornecedor: mesma regra da RLS de supplier_delivery_notes.
  v_can_rec := v_can_po OR COALESCE(public.has_anew_permission_for_org(v_uid, 'purchase_orders.receive', p_organization_id), false);
  v_can_sup := COALESCE(public.has_anew_permission_for_org(v_uid, 'suppliers.view', p_organization_id), false);
  v_can_ec  := COALESCE(public.has_anew_permission_for_org(v_uid, 'client_orders.view', p_organization_id), false);
  v_can_inv := COALESCE(public.has_anew_permission_for_org(v_uid, 'inventory.view', p_organization_id), false);

  -- Sem nenhuma permissão: tudo a null.
  IF NOT (v_can_po OR v_can_rec OR v_can_sup OR v_can_ec OR v_can_inv) THEN
    RETURN jsonb_build_object(
      'purchases', NULL, 'suppliers', NULL, 'client_orders', NULL,
      'stock', NULL, 'counts', NULL, 'settings', NULL
    );
  END IF;

  v_can_cost    := COALESCE(public.has_anew_permission_for_org(v_uid, 'products.view_cost', p_organization_id), false);
  v_can_pricing := v_can_cost OR COALESCE(public.has_anew_permission_for_org(v_uid, 'suppliers.view_pricing', p_organization_id), false);

  -- ── 1. Compras (purchase_orders.view; guias: .view OU .receive) ────────────
  IF v_can_po THEN
    SELECT jsonb_build_object(
             'pending_approval', count(*) FILTER (WHERE po.status = 'pending'),
             'late',             count(*) FILTER (WHERE po.status IN ('ordered', 'partially_received')
                                                    AND po.expected_delivery < current_date),
             'portal_unseen',    count(*) FILTER (WHERE po.status IN ('ordered', 'partially_received')
                                                    AND pub.status = 'sent'),
             'portal_confirmed', count(*) FILTER (WHERE po.status IN ('ordered', 'partially_received')
                                                    AND pub.status = 'confirmed')
           )
      INTO v_purchases
      FROM public.purchase_orders po
      LEFT JOIN public.supplier_po_publications pub ON pub.purchase_order_id = po.id
     WHERE po.organization_id = p_organization_id
       AND po.deleted_at IS NULL;
  ELSIF v_can_rec THEN
    -- Só purchase_orders.receive: campos de POs a null, guias abaixo.
    v_purchases := jsonb_build_object(
      'pending_approval', NULL, 'late', NULL,
      'portal_unseen',    NULL, 'portal_confirmed', NULL
    );
  END IF;

  IF v_can_rec THEN
    -- Guias do fornecedor em aberto e, dessas, as com divergências ao vivo.
    WITH dn AS (
      SELECT n.id
        FROM public.supplier_delivery_notes n
       WHERE n.organization_id = p_organization_id
         AND n.status = 'open'
    ), ann AS (
      SELECT l.delivery_note_id AS note_id, l.product_id,
             sum(l.quantity * l.units_per_uom) AS units
        FROM public.supplier_delivery_note_lines l
        JOIN dn ON dn.id = l.delivery_note_id
       GROUP BY 1, 2
    ), rcv AS (
      SELECT pr.delivery_note_id AS note_id,
             COALESCE(pr.product_id, poi.product_id) AS product_id,
             sum(pr.quantity * pr.units_per_uom) AS units
        FROM public.purchase_order_receipts pr
        JOIN dn ON dn.id = pr.delivery_note_id
        LEFT JOIN public.purchase_order_items poi ON poi.id = pr.purchase_order_item_id
       WHERE pr.kind = 'receipt'
         AND pr.reverted_at IS NULL
       GROUP BY 1, 2
    )
    SELECT (SELECT count(*) FROM dn)::int,
           (SELECT count(DISTINCT COALESCE(a.note_id, r.note_id))
              FROM ann a
              FULL JOIN rcv r ON r.note_id = a.note_id AND r.product_id = a.product_id
             WHERE COALESCE(a.note_id, r.note_id) IN (SELECT note_id FROM ann)  -- só guias com linhas
               AND COALESCE(a.units, 0) <> COALESCE(r.units, 0))::int
      INTO v_open_dn, v_div_dn;

    v_purchases := v_purchases || jsonb_build_object(
      'open_delivery_notes',             v_open_dn,
      'delivery_notes_with_divergences', v_div_dn
    );
  END IF;

  -- ── 2. Fornecedores (suppliers.view) ───────────────────────────────────────
  IF v_can_sup THEN
    v_suppliers := jsonb_build_object(
      -- Pedidos de preço por decidir (fornecedor não apagado). Só com
      -- permissão de preços, como a RLS da tabela.
      'price_changes_pending',
        CASE WHEN v_can_pricing THEN (
          SELECT count(*)::int
            FROM public.supplier_price_change_requests pcr
            JOIN public.suppliers s ON s.id = pcr.supplier_id AND s.deleted_at IS NULL
           WHERE pcr.organization_id = p_organization_id
             AND pcr.status = 'pending'
        ) END,
      -- Fornecedores com ligação ativa ao portal cujo owner ainda não
      -- confirmou os dados (supplier_portal_users.profile_confirmed_at).
      'awaiting_profile', (
        SELECT count(DISTINCT l.supplier_id)::int
          FROM public.supplier_account_links l
          JOIN public.supplier_accounts a ON a.id = l.supplier_account_id AND a.status = 'active'
          JOIN public.suppliers s ON s.id = l.supplier_id AND s.deleted_at IS NULL
         WHERE l.organization_id = p_organization_id
           AND l.status = 'active'
           AND NOT EXISTS (
             SELECT 1 FROM public.supplier_portal_users u
              WHERE u.supplier_account_id = l.supplier_account_id
                AND u.role = 'owner'
                AND u.status = 'active'
                AND u.profile_confirmed_at IS NOT NULL
           )
      ),
      -- Fila "por ligar" do catálogo do fornecedor: mesma regra de
      -- rpc_supplier_catalog_list(p_filter => 'unlinked') (definição de
      -- 20261211150000), somada por todos os fornecedores da organização.
      -- Como lá (fn_sp_crm_supplier_org), exige perfil do CRM; senão null.
      'catalog_unlinked',
        CASE WHEN public.current_business_user_id() IS NOT NULL THEN (
          SELECT count(*)::int
            FROM public.suppliers s
            JOIN public.supplier_account_links l
              ON l.supplier_id = s.id AND l.status = 'active'
            JOIN public.supplier_catalog_items ci
              ON ci.supplier_account_id = l.supplier_account_id AND ci.is_active
           WHERE s.organization_id = p_organization_id
             AND s.deleted_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM public.item_suppliers isup
                              WHERE isup.supplier_id = s.id
                                AND isup.catalog_item_id = ci.id
                                AND isup.deleted_at IS NULL)
             AND NOT EXISTS (SELECT 1 FROM public.supplier_catalog_dismissals d
                              WHERE d.link_id = l.id
                                AND d.catalog_item_id = ci.id)
        ) END
    );
  END IF;

  -- ── 3. Encomendas de Cliente + unidades reservadas (uma só passagem) ───────
  IF v_can_ec OR v_can_inv THEN
    -- r é MATERIALIZED: a função corre uma só vez e o mesmo resultado serve
    -- reserved_units (bloco stock, via v_reserved) e o bloco client_orders.
    WITH r AS MATERIALIZED (
      SELECT * FROM public.fn_client_order_line_reservations(p_organization_id, NULL)
    ), per_contract AS (
      -- Linha concluída = 'stock'/'received' na lista; o resto (awaiting,
      -- partial, no_supplier) deixa a EC em aberto.
      SELECT r.contract_id,
             bool_or(COALESCE(r.qty_reserved, 0) > 0) AS has_ready,
             -- Em falta, nada pedido e produto sem fornecedor preferido:
             -- critério v_has_pref de rpc_get_client_order_document
             -- (20261206150000).
             bool_or(COALESCE(r.qty_missing, 0) > 0
                     AND COALESCE(r.qty_ordered, 0) = 0
                     AND NOT EXISTS (
                       SELECT 1
                         FROM public.item_suppliers isup
                        WHERE isup.product_id = r.product_id
                          AND isup.is_preferred = true
                          AND isup.deleted_at IS NULL
                          AND isup.is_active = true
                          AND isup.organization_id = p_organization_id
                     )) AS has_missing
        FROM r
       WHERE NOT (
               r.is_served
               OR (COALESCE(r.qty_reserved, 0) = 0
                   AND COALESCE(r.qty_served, 0) = 0
                   AND COALESCE(r.qty_missing, 0) = 0
                   AND COALESCE(r.qty_ordered, 0) > 0
                   AND COALESCE(r.qty_received, 0) >= r.qty_ordered)
             )
       GROUP BY r.contract_id
    ), open_ec AS (
      SELECT pc.has_ready, pc.has_missing,
             CASE
               WHEN EXISTS (SELECT 1 FROM public.direct_sales d WHERE d.client_contract_id = cc.id) THEN 'direct_sale'
               WHEN COALESCE(cc.is_manual_order, false) THEN 'manual'
               ELSE 'contract'
             END AS origin
        FROM per_contract pc
        JOIN public.client_contracts cc ON cc.id = pc.contract_id
    )
    SELECT
      (SELECT COALESCE(sum(COALESCE(r.qty_reserved, 0)), 0) FROM r WHERE r.product_id IS NOT NULL),
      (SELECT jsonb_build_object(
                'open',                       count(*),
                'ready_to_ship',              count(*) FILTER (WHERE e.has_ready),
                'without_preferred_supplier', count(*) FILTER (WHERE e.has_missing),
                'by_origin', jsonb_build_object(
                  'contract',    count(*) FILTER (WHERE e.origin = 'contract'),
                  'direct_sale', count(*) FILTER (WHERE e.origin = 'direct_sale'),
                  'manual',      count(*) FILTER (WHERE e.origin = 'manual')
                )
              )
         FROM open_ec e)
      INTO v_reserved, v_client_ord;

    IF NOT v_can_ec THEN
      v_client_ord := NULL;
    END IF;
  END IF;

  -- ── 4. Stock, contagens e definições (inventory.view) ──────────────────────
  IF v_can_inv THEN
    -- Mesmas linhas que a lista de Existências por omissão (Stocks.tsx):
    -- stocks não apagados da organização com produto existente
    -- (products!inner); o armazém é LEFT na lista, sem filtro de
    -- is_active/deleted_at, por isso aqui também não se filtra.
    -- reorder_point / maximum_quantity são NOT NULL DEFAULT 0: 0 = não
    -- definido. Estado como getStockStatusCode: low primeiro, depois
    -- overstock (quantity >= maximum_quantity).
    SELECT jsonb_build_object(
             'below_reorder_point', count(*) FILTER (WHERE s.reorder_point > 0 AND s.quantity <= s.reorder_point),
             'overstock',           count(*) FILTER (WHERE s.maximum_quantity > 0 AND s.quantity >= s.maximum_quantity
                                                       AND NOT (s.reorder_point > 0 AND s.quantity <= s.reorder_point)),
             'reserved_units',      COALESCE(v_reserved, 0),
             'value',               CASE WHEN v_can_cost THEN
                                      round(COALESCE(sum(s.quantity * s.average_cost)
                                                       FILTER (WHERE s.quantity > 0 AND s.average_cost IS NOT NULL), 0), 2)
                                    END
           )
      INTO v_stock
      FROM public.stocks s
      JOIN public.products p ON p.id = s.product_id
     WHERE s.organization_id = p_organization_id
       AND s.deleted_at IS NULL;

    -- Contagens em curso; parada = sem atividade (cabeçalho ou linhas) há
    -- mais de 7 dias.
    SELECT jsonb_build_object(
             'in_progress', count(*),
             'stalled',     count(*) FILTER (WHERE GREATEST(c.started_at, c.updated_at, la.last_at) < now() - interval '7 days')
           )
      INTO v_counts
      FROM public.inventory_counts c
      LEFT JOIN LATERAL (
        SELECT max(GREATEST(l.updated_at, l.counted_at)) AS last_at
          FROM public.inventory_count_lines l
         WHERE l.inventory_count_id = c.id
      ) la ON true
     WHERE c.organization_id = p_organization_id
       AND c.status = 'em_contagem';

    -- Sem linha de definições vale 'contract_signed' (como os gatilhos de stock).
    v_settings := jsonb_build_object(
      'stock_deduction_trigger',
      COALESCE(
        (SELECT ois.stock_deduction_trigger
           FROM public.organization_inventory_settings ois
          WHERE ois.organization_id = p_organization_id),
        'contract_signed'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'purchases',     v_purchases,
    'suppliers',     v_suppliers,
    'client_orders', v_client_ord,
    'stock',         v_stock,
    'counts',        v_counts,
    'settings',      v_settings
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_po_receipt_release_to_stock(p_item_ids uuid[], p_warehouse_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor            uuid;
  v_org              uuid;
  v_org_count        integer;
  v_po               record;
  v_item             record;
  v_cc               record;
  v_units            integer;
  v_pending          numeric;
  v_mov_units        numeric;
  v_unit_cost        numeric;
  v_item_supplier_id uuid;
  v_movement_id      uuid;
  v_balance          integer;
  v_reason           text := nullif(btrim(COALESCE(p_reason, '')), '');
  v_lines_out        jsonb := '[]'::jsonb;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_item_ids IS NULL OR cardinality(p_item_ids) = 0 THEN
    RAISE EXCEPTION 'Escolhe pelo menos uma linha para passar para stock' USING ERRCODE = 'check_violation';
  END IF;
  IF array_position(p_item_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'A lista de linhas tem valores vazios' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_item_ids) AS t(x)) <> cardinality(p_item_ids) THEN
    RAISE EXCEPTION 'A lista de linhas tem linhas repetidas' USING ERRCODE = 'check_violation';
  END IF;

  -- Todas as linhas da mesma organização.
  SELECT min(po.organization_id::text)::uuid, count(DISTINCT po.organization_id)
  INTO v_org, v_org_count
  FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
  WHERE poi.id = ANY (p_item_ids);

  IF v_org IS NULL OR (SELECT count(*) FROM public.purchase_order_items WHERE id = ANY (p_item_ids)) <> cardinality(p_item_ids) THEN
    RAISE EXCEPTION 'Linha de encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_org_count <> 1 THEN
    RAISE EXCEPTION 'As linhas têm de ser todas da mesma organização' USING ERRCODE = 'check_violation';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.receive', v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_warehouse_id AND organization_id = v_org AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  -- Trancar as POs (mesma ordem sempre) — serializa com receções/reversões.
  PERFORM 1
  FROM public.purchase_orders po
  WHERE po.id IN (SELECT purchase_order_id FROM public.purchase_order_items WHERE id = ANY (p_item_ids))
  ORDER BY po.id
  FOR UPDATE;

  FOR v_item IN
    SELECT poi.id, poi.purchase_order_id, poi.product_id, poi.item_type, poi.description,
           poi.quantity, poi.received_quantity, poi.received_to_stock_units, poi.unit_price,
           poi.uom_id, COALESCE(poi.units_per_uom, 1) AS units_per_uom
    FROM public.purchase_order_items poi
    WHERE poi.id = ANY (p_item_ids)
    ORDER BY poi.id
    FOR UPDATE
  LOOP
    SELECT id, organization_id, order_number, status, source_type, source_id, supplier_id, deleted_at
    INTO v_po
    FROM public.purchase_orders WHERE id = v_item.purchase_order_id;

    IF v_po.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'A encomenda % foi apagada', v_po.order_number USING ERRCODE = 'check_violation';
    END IF;
    IF v_item.item_type <> 'product' THEN
      RAISE EXCEPTION 'A linha "%" não é um produto', v_item.description USING ERRCODE = 'check_violation';
    END IF;
    IF v_po.source_type IS DISTINCT FROM 'contract' THEN
      RAISE EXCEPTION 'A linha "%" é de uma encomenda de stock — o recebido já está em stock', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT cc.id, COALESCE(cc.order_number, cc.contract_number) AS num,
           (cc.deleted_at IS NULL AND cc.status IN ('signed', 'assinado')) AS active
    INTO v_cc
    FROM public.client_contracts cc
    WHERE cc.id = v_po.source_id AND cc.organization_id = v_po.organization_id;

    IF FOUND AND v_cc.active THEN
      RAISE EXCEPTION 'A encomenda cliente % da linha "%" está ativa — o recebido pertence-lhe e não pode passar para stock',
        v_cc.num, v_item.description USING ERRCODE = 'check_violation';
    END IF;

    v_units   := v_item.units_per_uom;
    v_pending := v_item.received_quantity * v_units - v_item.received_to_stock_units;

    IF v_pending <= 0 THEN
      RAISE EXCEPTION 'A linha "%" não tem quantidade recebida por passar para stock', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_pending <> floor(v_pending) OR v_pending > 2147483647 THEN
      RAISE EXCEPTION 'A linha "%" tem uma quantidade por passar para stock inválida (%)', v_item.description, v_pending
        USING ERRCODE = 'check_violation';
    END IF;

    -- As entradas por estornar da linha têm de bater com o que já está
    -- marcado como stock; senão (p.ex. entrada antiga de PO-2026-0010) a
    -- passagem duplicaria stock.
    SELECT COALESCE(sum(m.quantity), 0) INTO v_mov_units
    FROM public.stock_movements m
    WHERE m.reference_id = v_item.id
      AND m.organization_id = v_po.organization_id
      AND m.product_id = v_item.product_id
      AND m.document_type = 'compra'
      AND m.movement_type = 'entrada'
      AND NOT EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.reversal_of_movement_id = m.id);

    IF v_mov_units <> v_item.received_to_stock_units THEN
      RAISE EXCEPTION 'Não é possível passar "%" para stock automaticamente: as entradas de stock da linha (% un.) não batem com o registado (% un.)',
        v_item.description, v_mov_units, v_item.received_to_stock_units
        USING ERRCODE = 'check_violation';
    END IF;

    v_unit_cost := CASE WHEN v_units = 1 THEN v_item.unit_price
                        ELSE round(v_item.unit_price / v_units, 6) END;

    SELECT id INTO v_item_supplier_id
    FROM public.item_suppliers
    WHERE product_id = v_item.product_id
      AND supplier_id = v_po.supplier_id
      AND deleted_at IS NULL
    ORDER BY (uom_id IS NOT DISTINCT FROM v_item.uom_id) DESC, is_preferred DESC
    LIMIT 1;

    INSERT INTO public.stock_movements (
      organization_id, product_id, warehouse_id, movement_type, quantity,
      document_number, document_type, item_supplier_id, unit_cost_at_time,
      reference_id, notes, created_by
    ) VALUES (
      v_po.organization_id, v_item.product_id, p_warehouse_id, 'entrada', v_pending::integer,
      v_po.order_number, 'compra', v_item_supplier_id, v_unit_cost,
      v_item.id,
      format('Passagem para stock de %s: %s unidades recebidas para a encomenda cliente %s (inativa)%s',
             v_po.order_number, v_pending, COALESCE(v_cc.num, '?'),
             CASE WHEN v_reason IS NOT NULL THEN format(' (motivo: %s)', v_reason) ELSE '' END),
      v_actor
    )
    RETURNING id, balance_after INTO v_movement_id, v_balance;

    UPDATE public.purchase_order_items
    SET received_to_stock_units = received_to_stock_units + v_pending
    WHERE id = v_item.id;

    INSERT INTO public.purchase_order_receipts (
      organization_id, purchase_order_id, purchase_order_item_id, product_id, kind,
      warehouse_id, quantity, units_per_uom, units_to_order, units_to_stock,
      contract_id, allocation_reason, stock_movement_id, notes, received_by
    ) VALUES (
      v_po.organization_id, v_po.id, v_item.id, v_item.product_id, 'release_to_stock',
      p_warehouse_id, 0, v_units, 0, v_pending,
      v_po.source_id, 'client_order_inactive', v_movement_id, v_reason, v_actor
    );

    v_lines_out := v_lines_out || jsonb_build_object(
      'purchase_order_item_id', v_item.id,
      'purchase_order_id',      v_po.id,
      'order_number',           v_po.order_number,
      'product_id',             v_item.product_id,
      'units_to_stock',         v_pending,
      'qty_to_stock',           round(v_pending / v_units, 4),
      'contract_id',            v_po.source_id,
      'contract_order_number',  v_cc.num,
      'balance_after',          v_balance
    );
  END LOOP;

  RETURN jsonb_build_object('warehouse_id', p_warehouse_id, 'lines', v_lines_out);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_preview_po_receipt(p_purchase_order_id uuid, p_lines jsonb DEFAULT NULL::jsonb, p_warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org     uuid;
  v_wh      uuid := p_warehouse_id;
  v_lines   jsonb := p_lines;
  v_result  jsonb;
BEGIN
  SELECT organization_id INTO v_org
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.receive', v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_wh IS NULL THEN
    SELECT id INTO v_wh
    FROM public.warehouses
    WHERE organization_id = v_org AND deleted_at IS NULL
    ORDER BY created_at, id
    LIMIT 1;
  END IF;

  IF v_lines IS NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'purchase_order_item_id', id,
             'quantity', (quantity - received_quantity)
           )), '[]'::jsonb)
    INTO v_lines
    FROM public.purchase_order_items
    WHERE purchase_order_id = p_purchase_order_id
      AND item_type = 'product'
      AND quantity > received_quantity;
  END IF;

  BEGIN
    v_result := public.rpc_receive_purchase_order_lines(p_purchase_order_id, v_wh, v_lines, NULL);
    RAISE EXCEPTION USING ERRCODE = 'OLPV1', MESSAGE = 'preview_rollback';
  EXCEPTION WHEN SQLSTATE 'OLPV1' THEN
    NULL;  -- tudo o que a receção escreveu foi desfeito com a subtransação
  END;

  RETURN jsonb_build_object(
    'preview',              true,
    'order_number',         v_result -> 'order_number',
    'status',               v_result -> 'status',
    'stock_skipped',        v_result -> 'stock_skipped',
    'units_to_order_total', v_result -> 'units_to_order_total',
    'units_to_stock_total', v_result -> 'units_to_stock_total',
    'lines', COALESCE((
      SELECT jsonb_agg(l.value - 'balance_after' ORDER BY l.ord)
      FROM jsonb_array_elements(v_result -> 'lines') WITH ORDINALITY AS l(value, ord)
    ), '[]'::jsonb)
  );
END;
$function$;

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

  v_can_edit := public.has_anew_permission_for_org(v_uid, 'products.edit', v_org);
  v_can_wh   := public.has_anew_permission_for_org(v_uid, 'receiving.learn_codes', v_org);  -- NOVO (20261210130000)
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

  v_can_edit := public.has_anew_permission_for_org(v_uid, 'products.edit', v_row.organization_id);
  v_can_wh   := public.has_anew_permission_for_org(v_uid, 'receiving.learn_codes', v_row.organization_id);  -- NOVO (20261210130000)
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
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'receiving.receive', v_org)  -- NOVO (20261210130000)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.receive', v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org) THEN
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

CREATE OR REPLACE FUNCTION public.rpc_receive_purchase_order(p_purchase_order_id uuid, p_warehouse_id uuid, p_actual_delivery_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_has_product_lines boolean;
  v_lines             jsonb;
  v_actor             uuid;
  v_org               uuid;
  v_status            text;
  v_order_number      text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.purchase_order_items
    WHERE purchase_order_id = p_purchase_order_id AND item_type = 'product'
  ) INTO v_has_product_lines;

  IF NOT v_has_product_lines THEN
    -- Edge case documentado desde 20261114040000: encomenda só com linhas de
    -- serviço (sem stock físico) não tem p_lines possível para construir
    -- (rpc_receive_purchase_order_lines exige não-vazio). Replica o
    -- comportamento do RPC original (20261113280000): marca a encomenda como
    -- recebida diretamente, sem stock_movements nenhum, com os mesmos checks
    -- de status/permissão/organização/armazém. É sempre receção TOTAL, por
    -- isso grava actual_delivery_date aqui também (20261130010000).
    v_actor := public.current_business_user_id();
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
    END IF;

    SELECT organization_id, status, order_number
    INTO v_org, v_status, v_order_number
    FROM public.purchase_orders
    WHERE id = p_purchase_order_id AND deleted_at IS NULL
    FOR UPDATE;

    IF v_org IS NULL THEN
      RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_status = 'received' THEN
      RAISE EXCEPTION 'Esta encomenda já foi marcada como recebida' USING ERRCODE = 'check_violation';
    END IF;
    IF v_status = 'cancelled' THEN
      RAISE EXCEPTION 'Não é possível receber uma encomenda cancelada' USING ERRCODE = 'check_violation';
    END IF;

    IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
       OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.receive', v_org)
       OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org) THEN
      RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.warehouses
      WHERE id = p_warehouse_id AND organization_id = v_org AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.purchase_orders
    SET status = 'received',
        updated_at = now(),
        actual_delivery_date = COALESCE(p_actual_delivery_date, current_date)
    WHERE id = p_purchase_order_id;

    RETURN jsonb_build_object(
      'order_number', v_order_number,
      'warehouse_id', p_warehouse_id,
      'status',       'received',
      'lines',        '[]'::jsonb
    );
  END IF;

  -- Caminho normal: monta p_lines com todas as linhas de produto ainda por
  -- receber, na quantidade remanescente — e delega, incluindo
  -- p_actual_delivery_date. Linhas já totalmente recebidas (quantity <=
  -- received_quantity) ficam de fora.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'purchase_order_item_id', id,
           'quantity', (quantity - received_quantity)
         )), '[]'::jsonb)
  INTO v_lines
  FROM public.purchase_order_items
  WHERE purchase_order_id = p_purchase_order_id
    AND item_type = 'product'
    AND quantity > received_quantity;

  RETURN public.rpc_receive_purchase_order_lines(p_purchase_order_id, p_warehouse_id, v_lines, p_actual_delivery_date);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_receive_purchase_order_lines(p_purchase_order_id uuid, p_warehouse_id uuid, p_lines jsonb, p_actual_delivery_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor            uuid;
  v_po               public.purchase_orders%ROWTYPE;
  v_line_input       jsonb;
  v_line_id          uuid;
  v_qty_requested    numeric;
  v_qty_int          integer;
  v_item             record;
  v_item_supplier_id uuid;
  v_remaining        numeric;
  v_balance          integer;
  v_received_total   numeric;
  v_lines_out        jsonb := '[]'::jsonb;
  v_sum_quantity     numeric;
  v_sum_received     numeric;
  v_new_status       text;
  v_skip_stock       boolean;
  -- NOVO (20261204203500): embalagens — fator congelado na linha.
  v_units            integer;
  v_stock_qty        bigint;
  v_unit_cost        numeric;
  -- NOVO (20261206130000): destino por linha (EC / stock).
  v_alloc            record;
  v_to_order         bigint;
  v_to_stock         bigint;
  v_movement_id      uuid;
  v_sum_to_order     bigint := 0;
  v_sum_to_stock     bigint := 0;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_po.status = 'received' THEN
    RAISE EXCEPTION 'Esta encomenda já foi marcada como recebida' USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'Não é possível receber uma encomenda cancelada' USING ERRCODE = 'check_violation';
  END IF;

  IF v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.receive', v_po.organization_id)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_po.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_warehouse_id AND organization_id = v_po.organization_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Linhas de receção não podem estar vazias' USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (20261206130000): o destino passa a ser decidido por linha
  -- (fn_po_receipt_allocation). PO ligada a uma Encomenda Cliente ativa: a
  -- parte que a EC ainda precisa vai para a EC (sem stock geral, como desde
  -- 20261115210000); o excedente, ou tudo se a EC estiver cancelada/apagada/
  -- não assinada, entra em stock. PO de stock: tudo para stock, como antes.
  -- v_skip_stock (stock_skipped no resultado) = nada entrou em stock numa PO
  -- de contrato; é calculado no fim.
  v_skip_stock := false;

  -- Serializa receções de POs diferentes da mesma EC (cada uma lê a
  -- necessidade em aberto da EC antes de escrever).
  IF v_po.source_type = 'contract' AND v_po.source_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('po_receipt_contract:' || v_po.source_id::text, 0));
  END IF;

  FOR v_line_input IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_id       := nullif(v_line_input ->> 'purchase_order_item_id', '')::uuid;
    v_qty_requested := nullif(v_line_input ->> 'quantity', '')::numeric;

    IF v_line_id IS NULL THEN
      RAISE EXCEPTION 'purchase_order_item_id em falta numa linha de receção' USING ERRCODE = 'check_violation';
    END IF;

    SELECT id, product_id, item_type, quantity, unit_price, received_quantity, description,
           uom_id, units_per_uom, supplier_sku
    INTO v_item
    FROM public.purchase_order_items
    WHERE id = v_line_id AND purchase_order_id = p_purchase_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linha de encomenda % não encontrada nesta encomenda', v_line_id
        USING ERRCODE = 'no_data_found';
    END IF;

    IF v_item.item_type <> 'product' THEN
      RAISE EXCEPTION 'A linha "%" não é um produto — serviços não têm stock físico e não podem ser recebidos', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_qty_requested IS NULL OR v_qty_requested <= 0 THEN
      RAISE EXCEPTION 'A quantidade a receber na linha "%" tem de ser positiva', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_qty_requested <> floor(v_qty_requested) THEN
      RAISE EXCEPTION 'A linha "%" tem uma quantidade não inteira (%) — o stock só regista unidades inteiras. Corrige a linha antes de receber.', v_item.description, v_qty_requested
        USING ERRCODE = 'check_violation';
    END IF;

    v_remaining := v_item.quantity - v_item.received_quantity;
    IF v_qty_requested > v_remaining THEN
      RAISE EXCEPTION 'A quantidade a receber (%) na linha "%" excede o saldo por receber desta linha (% de % por receber; já recebido % de %)',
        v_qty_requested, v_item.description, v_remaining, v_item.quantity, v_item.received_quantity, v_item.quantity
        USING ERRCODE = 'check_violation';
    END IF;

    v_qty_int := v_qty_requested::integer;
    v_balance := NULL;

    -- NOVO (20261204203500): a linha está na unidade de compra (ex. PK100);
    -- o stock entra na unidade do produto. received_quantity continua na
    -- unidade da linha. Custo por unidade de stock = preço da linha / fator.
    -- Com fator 1 tudo fica exatamente como antes.
    v_units     := COALESCE(v_item.units_per_uom, 1);
    v_stock_qty := v_qty_int::bigint * v_units;
    IF v_stock_qty > 2147483647 THEN
      RAISE EXCEPTION 'A linha "%" excede o limite de stock (% unidades)', v_item.description, v_stock_qty
        USING ERRCODE = 'numeric_value_out_of_range';
    END IF;
    v_unit_cost := CASE WHEN v_units = 1 THEN v_item.unit_price
                        ELSE round(v_item.unit_price / v_units, 6) END;

    -- NOVO (20261206130000): repartição EC / stock em unidades de stock.
    SELECT * INTO v_alloc
    FROM public.fn_po_receipt_allocation(v_item.id, v_stock_qty);
    v_to_order := v_alloc.units_to_order::bigint;
    v_to_stock := v_stock_qty - v_to_order;
    v_movement_id := NULL;

    IF v_to_stock <= 0 THEN
      -- Sem movimento de entrada — tudo vai para a Encomenda Cliente, não
      -- passa pelo stock geral. balance_after fica NULL no output
      -- (informativo, não há stock_movements gerado para esta linha).
      NULL;
    ELSE
      SELECT id INTO v_item_supplier_id
      FROM public.item_suppliers
      WHERE product_id = v_item.product_id
        AND supplier_id = v_po.supplier_id
        AND deleted_at IS NULL
      -- NOVO (20261204203500): primeiro a ligação na MESMA unidade da linha.
      ORDER BY (uom_id IS NOT DISTINCT FROM v_item.uom_id) DESC, is_preferred DESC
      LIMIT 1;

      INSERT INTO public.stock_movements (
        organization_id, product_id, warehouse_id, movement_type, quantity,
        document_number, document_type, item_supplier_id, unit_cost_at_time,
        reference_id, notes, created_by
      ) VALUES (
        v_po.organization_id, v_item.product_id, p_warehouse_id, 'entrada', v_to_stock::integer,
        v_po.order_number, 'compra', v_item_supplier_id, v_unit_cost,
        v_item.id,
        CASE
          -- Tudo para stock: texto exatamente como antes.
          WHEN v_to_order = 0 AND v_alloc.allocation_reason = 'stock_order' AND v_units = 1 THEN
            format('Receção de %s: %s unidades agora nesta linha (total recebido %s de %s)',
                   v_po.order_number, v_qty_int, v_item.received_quantity + v_qty_requested, v_item.quantity)
          WHEN v_to_order = 0 AND v_alloc.allocation_reason = 'stock_order' THEN
            format('Receção de %s: %s × %s un. (%s unidades de stock) agora nesta linha (total recebido %s de %s)',
                   v_po.order_number, v_qty_int, v_units, v_stock_qty, v_item.received_quantity + v_qty_requested, v_item.quantity)
          -- NOVO (20261206130000): PO de Encomenda Cliente.
          WHEN v_to_order = 0 THEN
            format('Receção de %s: %s unidades de stock agora nesta linha (total recebido %s de %s) — %s',
                   v_po.order_number, v_to_stock, v_item.received_quantity + v_qty_requested, v_item.quantity,
                   CASE WHEN v_alloc.allocation_reason = 'client_order_inactive'
                        THEN format('encomenda cliente %s inativa, entra em stock', COALESCE(v_alloc.contract_order_number, '?'))
                        ELSE format('necessidade da encomenda cliente %s já coberta, entra em stock', COALESCE(v_alloc.contract_order_number, '?'))
                   END)
          ELSE
            format('Receção de %s: %s unidades de stock recebidas nesta linha, %s para a encomenda cliente %s e %s para stock (total recebido %s de %s)',
                   v_po.order_number, v_stock_qty, v_to_order, COALESCE(v_alloc.contract_order_number, '?'), v_to_stock,
                   v_item.received_quantity + v_qty_requested, v_item.quantity)
        END,
        v_actor
      )
      RETURNING id, balance_after INTO v_movement_id, v_balance;
    END IF;

    UPDATE public.purchase_order_items
    SET received_quantity       = received_quantity + v_qty_requested,
        received_to_stock_units = received_to_stock_units + v_to_stock  -- NOVO (20261206130000)
    WHERE id = v_item.id
    RETURNING received_quantity INTO v_received_total;

    -- NOVO (20261206130000): histórico da receção.
    INSERT INTO public.purchase_order_receipts (
      organization_id, purchase_order_id, purchase_order_item_id, product_id, kind,
      warehouse_id, quantity, units_per_uom, units_to_order, units_to_stock,
      contract_id, allocation_reason, stock_movement_id, received_by
    ) VALUES (
      v_po.organization_id, p_purchase_order_id, v_item.id, v_item.product_id, 'receipt',
      p_warehouse_id, v_qty_requested, v_units, v_to_order, v_to_stock,
      CASE WHEN v_po.source_type = 'contract' THEN v_alloc.contract_id END,
      v_alloc.allocation_reason, v_movement_id, v_actor
    );

    v_sum_to_order := v_sum_to_order + v_to_order;
    v_sum_to_stock := v_sum_to_stock + v_to_stock;

    v_lines_out := v_lines_out || jsonb_build_object(
      'product_id',               v_item.product_id,
      'quantity_received_now',    v_qty_int,
      'received_quantity_total',  v_received_total,
      'remaining',                v_item.quantity - v_received_total,
      'balance_after',            v_balance,
      'stock_updated',            (v_to_stock > 0),
      -- NOVO (20261204203500): chaves acrescentadas; as anteriores não mudam.
      'units_per_uom',            v_units,
      'stock_quantity_now',       CASE WHEN v_to_stock > 0 THEN v_to_stock END,
      -- NOVO (20261206130000): destino da receção. qty_* na unidade da linha
      -- (pode ser fracionária numa embalagem repartida); units_* em unidades
      -- de stock.
      'purchase_order_item_id',   v_item.id,
      'qty_to_order',             round(v_to_order::numeric / v_units, 4),
      'qty_to_stock',             round(v_to_stock::numeric / v_units, 4),
      'units_to_order',           v_to_order,
      'units_to_stock',           v_to_stock,
      'contract_id',              v_alloc.contract_id,
      'contract_order_number',    v_alloc.contract_order_number,
      'contract_active',          v_alloc.contract_active,
      'allocation_reason',        v_alloc.allocation_reason,
      'destination',              CASE WHEN v_to_order > 0 AND v_to_stock > 0 THEN 'split'
                                       WHEN v_to_order > 0 THEN 'client_order'
                                       ELSE 'stock' END
    );
  END LOOP;

  -- NOVO (20261206130000): stock_skipped = PO de contrato em que nada entrou
  -- em stock nesta receção (tudo foi para a EC). PO de stock: false.
  v_skip_stock := (v_po.source_type = 'contract' AND v_sum_to_stock = 0);

  SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(received_quantity), 0)
  INTO v_sum_quantity, v_sum_received
  FROM public.purchase_order_items
  WHERE purchase_order_id = p_purchase_order_id AND item_type = 'product';

  IF v_sum_quantity > 0 AND v_sum_received >= v_sum_quantity THEN
    v_new_status := 'received';
  ELSIF v_sum_received > 0 THEN
    v_new_status := 'partially_received';
  ELSE
    v_new_status := v_po.status;
  END IF;

  -- NOVO (20261130010000): actual_delivery_date só é gravada quando a
  -- encomenda fica TOTALMENTE recebida — numa receção parcial ainda não há
  -- "data de entrega" da encomenda como um todo.
  IF v_new_status = 'received' THEN
    UPDATE public.purchase_orders
    SET status = v_new_status,
        updated_at = now(),
        actual_delivery_date = COALESCE(p_actual_delivery_date, current_date)
    WHERE id = p_purchase_order_id;
  ELSE
    UPDATE public.purchase_orders
    SET status = v_new_status, updated_at = now()
    WHERE id = p_purchase_order_id;
  END IF;

  RETURN jsonb_build_object(
    'order_number',   v_po.order_number,
    'warehouse_id',   p_warehouse_id,
    'status',         v_new_status,
    'lines',          v_lines_out,
    'stock_skipped',  v_skip_stock,
    -- NOVO (20261206130000)
    'units_to_order_total', v_sum_to_order,
    'units_to_stock_total', v_sum_to_stock
  );
END;
$function$;

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
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'receiving.view', v_org)  -- NOVO (20261210130000)
     OR NOT (public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.receive', v_org)
             OR public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.view', v_org)) THEN
    RAISE EXCEPTION 'Sem permissão para consultar encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_can_receive := public.has_anew_permission_for_org(auth.uid(), 'receiving.receive', v_org)  -- NOVO (20261210130000)
               AND public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.receive', v_org)
               AND public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org);

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

CREATE OR REPLACE FUNCTION public.rpc_register_stock_entry(p_product_id uuid, p_warehouse_id uuid, p_qty integer, p_item_supplier_id uuid, p_unit_cost numeric DEFAULT NULL::numeric, p_counterparty text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_org    uuid;
  v_price  numeric;
  v_sku    text;
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

  SELECT organization_id INTO v_org
  FROM public.warehouses
  WHERE id = p_warehouse_id AND deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT purchase_price, supplier_sku INTO v_price, v_sku
  FROM public.item_suppliers
  WHERE id = p_item_supplier_id
    AND product_id = p_product_id
    AND organization_id = v_org
    AND is_active = true
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fornecedor inválido, inativo, ou não associado a este produto' USING ERRCODE = 'check_violation';
  END IF;

  v_doc := public.fn_next_stock_document_number(v_org, 'compra');

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, item_supplier_id, unit_cost_at_time,
    supplier_sku_at_time, counterparty, notes, created_by
  ) VALUES (
    v_org, p_product_id, p_warehouse_id, 'entrada', p_qty,
    v_doc, 'compra', p_item_supplier_id, COALESCE(p_unit_cost, v_price),
    v_sku, p_counterparty, p_notes, v_actor
  )
  RETURNING balance_after INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_register_stock_loss(p_product_id uuid, p_warehouse_id uuid, p_qty integer, p_reason text, p_notes text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Motivo da quebra é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.stocks
  WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Não existe stock deste produto neste armazém' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_doc := public.fn_next_stock_document_number(v_org, 'ajuste');

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, counterparty, notes, created_by
  ) VALUES (
    v_org, p_product_id, p_warehouse_id, 'quebra', p_qty,
    v_doc, 'ajuste', p_reason, p_notes, v_actor
  )
  RETURNING balance_after INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_register_stock_transfer(p_product_id uuid, p_from_warehouse_id uuid, p_to_warehouse_id uuid, p_qty integer, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor       uuid;
  v_org         uuid;
  v_source_cost numeric(12,4);
  v_group       uuid;
  v_doc         text;
  v_from_balance integer;
  v_to_balance   integer;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;

  IF p_from_warehouse_id = p_to_warehouse_id THEN
    RAISE EXCEPTION 'Armazém de origem e destino têm de ser diferentes' USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id, average_cost INTO v_org, v_source_cost
  FROM public.stocks
  WHERE product_id = p_product_id AND warehouse_id = p_from_warehouse_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Não existe stock deste produto no armazém de origem' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- O armazém de destino tem de pertencer à mesma organização.
  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_to_warehouse_id AND organization_id = v_org AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Armazém de destino inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  v_group := gen_random_uuid();
  v_doc := public.fn_next_stock_document_number(v_org, 'transferencia');

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, transfer_group_id, notes, created_by
  ) VALUES (
    v_org, p_product_id, p_from_warehouse_id, 'transferencia_saida', p_qty,
    v_doc, 'transferencia', v_group, p_notes, v_actor
  )
  RETURNING balance_after INTO v_from_balance;

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, transfer_group_id, unit_cost_at_time, notes, created_by
  ) VALUES (
    v_org, p_product_id, p_to_warehouse_id, 'transferencia_entrada', p_qty,
    v_doc, 'transferencia', v_group, v_source_cost, p_notes, v_actor
  )
  RETURNING balance_after INTO v_to_balance;

  RETURN jsonb_build_object(
    'document_number', v_doc,
    'transfer_group_id', v_group,
    'from_balance', v_from_balance,
    'to_balance', v_to_balance
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_resolve_inventory_count_line(p_line_id uuid, p_resolution text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor          uuid;
  v_org            uuid;
  v_status         text;
  v_document_number text;
  v_product_id     uuid;
  v_warehouse_id   uuid;
  v_counted_qty    integer;
  v_live_qty       integer;
  v_diff           integer;
  v_direction      text;
  v_doc            text;
  v_movement_id    uuid;
  v_balance        integer;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_resolution NOT IN ('ajustado', 'aceite_sem_ajuste', 'recontagem_pedida') THEN
    RAISE EXCEPTION 'Resolução desconhecida: %', p_resolution USING ERRCODE = 'check_violation';
  END IF;

  SELECT ic.organization_id, ic.status, ic.document_number, ic.warehouse_id,
         icl.product_id, icl.counted_quantity
  INTO v_org, v_status, v_document_number, v_warehouse_id, v_product_id, v_counted_qty
  FROM public.inventory_count_lines icl
  JOIN public.inventory_counts ic ON ic.id = icl.inventory_count_id
  WHERE icl.id = p_line_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Linha de contagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para resolver discrepâncias de inventário nesta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'em_contagem' THEN
    RAISE EXCEPTION 'Esta sessão de contagem já não está em curso (estado atual: %)', v_status USING ERRCODE = 'check_violation';
  END IF;

  IF p_resolution = 'recontagem_pedida' THEN
    -- D4: reset completo da linha ao estado "nunca contada".
    UPDATE public.inventory_count_lines
    SET counted_quantity       = NULL,
        counted_by             = NULL,
        counted_at             = NULL,
        discrepancy_resolution = NULL,
        resolution_notes       = NULL,
        stock_movement_id      = NULL,
        moved_during_count     = false
    WHERE id = p_line_id;

    RETURN jsonb_build_object('id', p_line_id, 'discrepancy_resolution', NULL, 'reset', true);
  END IF;

  IF v_counted_qty IS NULL THEN
    RAISE EXCEPTION 'Não é possível resolver uma linha que ainda não foi contada' USING ERRCODE = 'check_violation';
  END IF;

  IF p_resolution = 'aceite_sem_ajuste' THEN
    IF p_notes IS NULL OR btrim(p_notes) = '' THEN
      RAISE EXCEPTION 'Motivo é obrigatório para aceitar a diferença sem ajuste' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.inventory_count_lines
    SET discrepancy_resolution = 'aceite_sem_ajuste',
        resolution_notes       = p_notes,
        stock_movement_id      = NULL
    WHERE id = p_line_id;

    RETURN jsonb_build_object('id', p_line_id, 'discrepancy_resolution', 'aceite_sem_ajuste', 'stock_movement_id', NULL);
  END IF;

  -- p_resolution = 'ajustado' — lê o saldo AO VIVO (não o snapshot), gera o
  -- movimento de ajuste reaproveitando fn_next_stock_document_number (mesma
  -- numeração NE-A-NNNN de rpc_adjust_stock, decisão D5).
  SELECT quantity INTO v_live_qty
  FROM public.stocks
  WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id
  FOR UPDATE;

  IF v_live_qty IS NULL THEN
    -- ÚNICA alteração face à versão anterior desta função.
    --
    -- PORQUÊ: este é o caso normal da CONTAGEM INICIAL de um armazém novo (ou
    -- de um artigo nunca movimentado) — o produto existe no catálogo, está
    -- fisicamente na prateleira, mas nunca teve linha em public.stocks. Antes
    -- disto a função rebentava aqui e a contagem ficava impossível de ajustar
    -- E impossível de finalizar (ver explicação no cabeçalho da secção 3).
    --
    -- Criar a linha a ZERO, e não tratar simplesmente NULL como 0 (D14): dá um
    -- registo real para o FOR UPDATE bloquear e para o last_counted da
    -- finalização escrever.
    --
    -- ON CONFLICT sobre unique_product_warehouse UNIQUE (product_id,
    -- warehouse_id): outra transação pode ter criado a linha entretanto (ex:
    -- uma venda, ou a resolução de outra sessão de contagem). DO NOTHING em
    -- vez de DO UPDATE porque a quantidade dessa linha é a verdade — nunca a
    -- queremos esmagar com 0.
    --
    -- Colunas: organization_id, product_id, warehouse_id e created_by são as
    -- ÚNICAS NOT NULL sem default em public.stocks (F6). quantity tem default
    -- 0 mas vai explícito, para o leitor não ter de o ir confirmar.
    INSERT INTO public.stocks (
      organization_id, product_id, warehouse_id, quantity, created_by
    ) VALUES (
      v_org, v_product_id, v_warehouse_id, 0, v_actor
    )
    ON CONFLICT (product_id, warehouse_id) DO NOTHING;

    -- Relê já com a linha criada (ou com a que a outra transação criou), e
    -- volta a tomar o lock — o FOR UPDATE de cima não travou nada, porque não
    -- havia linha para travar.
    SELECT quantity INTO v_live_qty
    FROM public.stocks
    WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id
    FOR UPDATE;

    IF v_live_qty IS NULL THEN
      -- Rede de segurança: a exceção original, intacta. Chegar aqui significa
      -- que nem o nosso INSERT nem o de outrem produziram linha visível — na
      -- prática só sob REPEATABLE READ/SERIALIZABLE. Falhar é o correto.
      RAISE EXCEPTION 'Não existe stock deste produto neste armazém' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  v_diff := v_counted_qty - v_live_qty;

  IF v_diff = 0 THEN
    -- O saldo ao vivo já coincide com a contagem (ex: outro movimento entretanto
    -- corrigiu a diferença) — nada a ajustar, mas a linha fica resolvida.
    UPDATE public.inventory_count_lines
    SET discrepancy_resolution = 'ajustado',
        resolution_notes       = p_notes,
        stock_movement_id      = NULL
    WHERE id = p_line_id;

    RETURN jsonb_build_object('id', p_line_id, 'discrepancy_resolution', 'ajustado', 'stock_movement_id', NULL, 'adjusted_quantity', 0);
  END IF;

  v_direction := CASE WHEN v_diff > 0 THEN 'positivo' ELSE 'negativo' END;
  v_doc := public.fn_next_stock_document_number(v_org, 'ajuste');

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, counterparty, reference_id, notes, created_by
  ) VALUES (
    v_org, v_product_id, v_warehouse_id, 'ajuste_' || v_direction, abs(v_diff),
    v_doc, 'ajuste', 'Contagem física ' || v_document_number, p_line_id, p_notes, v_actor
  )
  RETURNING id, balance_after INTO v_movement_id, v_balance;

  UPDATE public.inventory_count_lines
  SET discrepancy_resolution = 'ajustado',
      resolution_notes       = p_notes,
      stock_movement_id      = v_movement_id
  WHERE id = p_line_id;

  RETURN jsonb_build_object(
    'id', p_line_id,
    'discrepancy_resolution', 'ajustado',
    'stock_movement_id', v_movement_id,
    'adjusted_quantity', abs(v_diff),
    'balance_after', v_balance
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_restore_purchase_order(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_before public.purchase_orders;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.purchase_orders WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.delete', v_before.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para restaurar encomendas' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Encomenda já está ativa' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.purchase_orders
  SET    deleted_at = NULL, deleted_by = NULL, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'purchase_orders', p_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', NULL)
    ),
    'web_app', p_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_restore_stock(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_before public.stocks;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.stocks WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.delete', v_before.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para restaurar stocks' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Stock já está ativo' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.stocks
  SET    deleted_at = NULL, deleted_by = NULL, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'stocks', p_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', NULL)
    ),
    'web_app', p_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_restore_warehouse(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_before public.warehouses;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.warehouses WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission_for_org(auth.uid(), 'warehouses.delete', v_before.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para restaurar armazéns' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Armazém já está ativo' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.warehouses
  SET    deleted_at = NULL, deleted_by = NULL, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'warehouses', p_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', NULL)
    ),
    'web_app', p_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_revert_purchase_order_receipt(p_purchase_order_id uuid, p_item_ids uuid[], p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor          uuid;
  v_po             public.purchase_orders%ROWTYPE;
  v_reason         text;
  v_skip_stock     boolean;
  v_item_id        uuid;
  v_item           record;
  v_line_mov_ids   uuid[];
  v_line_mov_units bigint;
  v_line_expected  numeric;
  v_all_mov_ids    uuid[] := ARRAY[]::uuid[];
  v_lines_out      jsonb := '[]'::jsonb;
  v_audit_lines    jsonb := '[]'::jsonb;
  v_grp            record;
  v_stock_qty      integer;
  v_stock_cost     numeric;
  v_new_cost       numeric;
  v_mov            public.stock_movements%ROWTYPE;
  v_sum_quantity   numeric;
  v_sum_received   numeric;
  v_new_status     text;
  v_prev_bypass    text;
  v_diff           jsonb;
  -- NOVO (20261206130000)
  v_line_legacy    boolean;
  v_rev_mov_id     uuid;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- Trancar a encomenda serializa com receções e reversões concorrentes
  -- (rpc_receive_purchase_order_lines tranca-a da mesma forma).
  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_po.status NOT IN ('received', 'partially_received') THEN
    RAISE EXCEPTION 'Só é possível reverter a receção de encomendas recebidas ou parcialmente recebidas (estado atual: %)', v_po.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.revert_receipt', v_po.organization_id)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_po.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para reverter receções desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Indica o motivo da reversão (pelo menos 3 caracteres)' USING ERRCODE = 'check_violation';
  END IF;

  IF p_item_ids IS NULL OR cardinality(p_item_ids) = 0 THEN
    RAISE EXCEPTION 'Escolhe pelo menos uma linha para reverter' USING ERRCODE = 'check_violation';
  END IF;
  IF array_position(p_item_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'A lista de linhas tem valores vazios' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_item_ids) AS t(x)) <> cardinality(p_item_ids) THEN
    RAISE EXCEPTION 'A lista de linhas tem linhas repetidas' USING ERRCODE = 'check_violation';
  END IF;

  v_skip_stock := (v_po.source_type = 'contract');

  -- ── 1. Validar e trancar as linhas e as entradas de stock de cada uma ──
  FOREACH v_item_id IN ARRAY p_item_ids
  LOOP
    SELECT id, product_id, item_type, quantity, received_quantity, description,
           COALESCE(units_per_uom, 1) AS units_per_uom,
           received_to_stock_units  -- NOVO (20261206130000)
    INTO v_item
    FROM public.purchase_order_items
    WHERE id = v_item_id AND purchase_order_id = p_purchase_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linha de encomenda % não encontrada nesta encomenda', v_item_id
        USING ERRCODE = 'no_data_found';
    END IF;

    IF v_item.item_type <> 'product' THEN
      RAISE EXCEPTION 'A linha "%" não é um produto — serviços não têm receção de stock a reverter', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_item.received_quantity IS NULL OR v_item.received_quantity <= 0 THEN
      RAISE EXCEPTION 'A linha "%" não tem quantidade recebida para reverter', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    -- Entradas da receção desta linha ainda sem estorno. O filtro por
    -- organização e produto usa idx_stock_movements_product (não há índice
    -- em reference_id).
    SELECT COALESCE(array_agg(t.id ORDER BY t.id), ARRAY[]::uuid[]),
           COALESCE(sum(t.quantity), 0)
    INTO v_line_mov_ids, v_line_mov_units
    FROM (
      SELECT m.id, m.quantity
      FROM public.stock_movements m
      WHERE m.reference_id = v_item.id
        AND m.organization_id = v_po.organization_id
        AND m.product_id = v_item.product_id
        AND m.document_type = 'compra'
        AND m.movement_type = 'entrada'
        AND NOT EXISTS (
          SELECT 1 FROM public.stock_movements r
          WHERE r.reversal_of_movement_id = m.id
        )
      ORDER BY m.id
      FOR UPDATE OF m
    ) t;

    -- NOVO (20261206130000): as entradas por estornar têm de explicar a
    -- parte da linha que foi para stock (received_to_stock_units); a parte
    -- entregue à Encomenda Cliente não tem movimento e só repõe contadores.
    -- PO de stock: received_to_stock_units = recebido × fator (backfill),
    -- exatamente a verificação anterior. PO de contrato sem entradas: 0.
    -- Legado (receção anterior a esta migração, sem linhas em
    -- purchase_order_receipts) com entradas = recebido × fator, como antes
    -- (PO-2026-0010): continua a reverter-se.
    v_line_expected := v_item.received_to_stock_units;
    v_line_legacy := NOT EXISTS (
        SELECT 1 FROM public.purchase_order_receipts pr
        WHERE pr.purchase_order_item_id = v_item.id
      )
      AND v_line_mov_units = v_item.received_quantity * v_item.units_per_uom;

    IF v_line_mov_units <> v_line_expected AND NOT v_line_legacy THEN
      RAISE EXCEPTION 'Não é possível reverter "%" automaticamente: a linha tem % recebidas (% unidades de stock deram entrada em stock), mas as entradas de stock por estornar somam % unidades',
        v_item.description, v_item.received_quantity, v_line_expected, v_line_mov_units
        USING ERRCODE = 'check_violation';
    END IF;

    v_all_mov_ids := v_all_mov_ids || v_line_mov_ids;

    v_lines_out := v_lines_out || jsonb_build_object(
      'purchase_order_item_id', v_item.id,
      'description',            v_item.description,
      'quantity_reverted',      v_item.received_quantity,
      'stock_reverted',         cardinality(v_line_mov_ids) > 0,
      'movements_reverted',     cardinality(v_line_mov_ids),
      -- NOVO (20261206130000)
      'units_reverted_from_stock',        v_line_mov_units,
      'units_reverted_from_client_order', GREATEST(0, v_item.received_quantity * v_item.units_per_uom - v_line_mov_units)
    );
  END LOOP;

  -- ── 2. Stock suficiente e custo médio, por produto/armazém ──
  -- Tudo verificado antes do primeiro estorno. Ordem fixa para trancar
  -- stocks sempre pela mesma sequência.
  FOR v_grp IN
    SELECT m.product_id,
           m.warehouse_id,
           sum(m.quantity)::bigint                        AS qty,
           bool_or(m.unit_cost_at_time IS NULL)           AS any_cost_null,
           sum(m.unit_cost_at_time * m.quantity)          AS cost_total,
           string_agg(DISTINCT poi.description, '", "')   AS descriptions,
           w.name                                         AS warehouse_name
    FROM public.stock_movements m
    JOIN public.purchase_order_items poi ON poi.id = m.reference_id
    LEFT JOIN public.warehouses w ON w.id = m.warehouse_id
    WHERE m.id = ANY (v_all_mov_ids)
    GROUP BY m.product_id, m.warehouse_id, w.name
    ORDER BY m.product_id, m.warehouse_id
  LOOP
    v_stock_qty  := NULL;
    v_stock_cost := NULL;

    SELECT s.quantity, s.average_cost
    INTO v_stock_qty, v_stock_cost
    FROM public.stocks s
    WHERE s.product_id = v_grp.product_id
      AND s.warehouse_id = v_grp.warehouse_id
    FOR UPDATE;

    IF COALESCE(v_stock_qty, 0) < v_grp.qty THEN
      RAISE EXCEPTION 'Não é possível reverter "%": o armazém % tem % unidades e a receção deu entrada de % (já saiu stock)',
        v_grp.descriptions, COALESCE(v_grp.warehouse_name, v_grp.warehouse_id::text),
        COALESCE(v_stock_qty, 0), v_grp.qty
        USING ERRCODE = 'check_violation';
    END IF;

    -- Repor o custo médio antes dos estornos: o apply lê average_cost desta
    -- linha e volta a gravá-lo tal como está.
    IF v_stock_qty - v_grp.qty > 0
       AND v_stock_cost IS NOT NULL
       AND NOT v_grp.any_cost_null THEN
      v_new_cost := round(
        ((v_stock_cost * v_stock_qty) - v_grp.cost_total) / (v_stock_qty - v_grp.qty),
        4
      );
      IF v_new_cost >= 0 AND v_new_cost IS DISTINCT FROM v_stock_cost THEN
        UPDATE public.stocks
        SET average_cost = v_new_cost,
            updated_at   = now()
        WHERE product_id = v_grp.product_id
          AND warehouse_id = v_grp.warehouse_id;
      END IF;
    END IF;
  END LOOP;

  -- ── 3. Estornos ──
  FOR v_mov IN
    SELECT m.*
    FROM public.stock_movements m
    WHERE m.id = ANY (v_all_mov_ids)
    ORDER BY m.product_id, m.warehouse_id, m.created_at, m.id
  LOOP
    INSERT INTO public.stock_movements (
      organization_id, product_id, warehouse_id, movement_type, quantity,
      document_number, document_type, item_supplier_id, unit_cost_at_time,
      supplier_sku_at_time, reference_id, reversal_of_movement_id, notes, created_by
    ) VALUES (
      v_mov.organization_id, v_mov.product_id, v_mov.warehouse_id, 'ajuste_negativo', v_mov.quantity,
      v_mov.document_number, 'compra', v_mov.item_supplier_id, v_mov.unit_cost_at_time,
      v_mov.supplier_sku_at_time, v_mov.reference_id, v_mov.id,
      format('Estorno da receção de %s: %s unidades (motivo: %s)', v_po.order_number, v_mov.quantity, v_reason),
      v_actor
    )
    RETURNING id INTO v_rev_mov_id;  -- NOVO (20261206130000)

    UPDATE public.purchase_order_receipts
    SET revert_movement_id = v_rev_mov_id
    WHERE stock_movement_id = v_mov.id
      AND purchase_order_item_id = v_mov.reference_id;
  END LOOP;

  -- NOVO (20261206130000): receções destas linhas ficam marcadas como
  -- revertidas (o histórico não se apaga).
  UPDATE public.purchase_order_receipts
  SET reverted_at   = now(),
      reverted_by   = v_actor,
      revert_reason = v_reason
  WHERE purchase_order_item_id = ANY (p_item_ids)
    AND purchase_order_id = p_purchase_order_id
    AND reverted_at IS NULL;

  -- ── 4. Linhas e estado da encomenda ──
  -- A encomenda e as linhas ficam numa única linha de auditoria (abaixo);
  -- o bypass só cobre estes dois UPDATE e é reposto a seguir.
  v_prev_bypass := current_setting('app.audit_bypass', true);
  PERFORM set_config('app.audit_bypass', 'on', true);

  UPDATE public.purchase_order_items
  SET received_quantity       = 0,
      received_to_stock_units = 0  -- NOVO (20261206130000)
  WHERE id = ANY (p_item_ids)
    AND purchase_order_id = p_purchase_order_id;

  SELECT COALESCE(sum(quantity), 0), COALESCE(sum(received_quantity), 0)
  INTO v_sum_quantity, v_sum_received
  FROM public.purchase_order_items
  WHERE purchase_order_id = p_purchase_order_id AND item_type = 'product';

  IF v_sum_received > 0 THEN
    v_new_status := 'partially_received';
  ELSE
    -- Último estado anterior à receção. Gatilho genérico: status em
    -- changed_fields (UPDATE) ou full_record (INSERT), record_id = PO;
    -- rpc_update_purchase_order: changed_fields.purchase_orders.status,
    -- entity_id = PO e record_id NULL. Dentro da mesma linha, 'new' é
    -- posterior a 'old'.
    SELECT v.val
    INTO v_new_status
    FROM public.entity_audit_log a
    CROSS JOIN LATERAL (VALUES
      (1, a.full_record ->> 'status'),
      (2, a.changed_fields #>> '{status,old}'),
      (3, a.changed_fields #>> '{status,new}'),
      (2, a.changed_fields #>> '{purchase_orders,status,old}'),
      (3, a.changed_fields #>> '{purchase_orders,status,new}')
    ) AS v(ord, val)
    WHERE a.table_name = 'purchase_orders'
      AND (a.record_id = p_purchase_order_id OR a.entity_id = p_purchase_order_id)
      AND v.val IN ('pending', 'ordered')
    ORDER BY a.created_at DESC, v.ord DESC
    LIMIT 1;

    v_new_status := COALESCE(v_new_status, 'ordered');
  END IF;

  UPDATE public.purchase_orders
  SET status               = v_new_status,
      actual_delivery_date = NULL,
      updated_at           = now()
  WHERE id = p_purchase_order_id;

  PERFORM set_config('app.audit_bypass', COALESCE(v_prev_bypass, ''), true);

  SELECT COALESCE(jsonb_agg(
           (l.value - 'quantity_reverted')
           || jsonb_build_object(
                'received_quantity', jsonb_build_object('old', l.value -> 'quantity_reverted', 'new', 0)
              )
         ), '[]'::jsonb)
  INTO v_audit_lines
  FROM jsonb_array_elements(v_lines_out) AS l(value);

  v_diff := jsonb_build_object(
    'status', jsonb_build_object('old', v_po.status, 'new', v_new_status),
    'receipt_reversal', jsonb_build_object(
      'reason',               v_reason,
      'lines',                v_audit_lines,
      'reversal_of_movement_ids', to_jsonb(v_all_mov_ids)
    )
  );
  IF v_po.actual_delivery_date IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object(
      'actual_delivery_date', jsonb_build_object('old', v_po.actual_delivery_date, 'new', NULL)
    );
  END IF;

  PERFORM public.fn_manual_audit_log(
    'purchase_orders', p_purchase_order_id, v_po.organization_id, 'UPDATE', v_diff, 'web_app', p_purchase_order_id
  );

  RETURN jsonb_build_object(
    'order_number', v_po.order_number,
    'status',       v_new_status,
    'lines',        v_lines_out
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_update_inventory_count_line_quantity(p_line_id uuid, p_counted_quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor      uuid;
  v_org        uuid;
  v_status     text;
  v_product_id uuid;
  v_warehouse_id uuid;
  v_snapshot   integer;
  v_live_qty   integer;
  v_had_resolution boolean;
  v_moved      boolean;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_counted_quantity IS NULL OR p_counted_quantity < 0 THEN
    RAISE EXCEPTION 'Quantidade contada tem de ser um número não negativo' USING ERRCODE = 'check_violation';
  END IF;

  SELECT ic.organization_id, ic.status, ic.warehouse_id,
         icl.product_id, icl.system_quantity_at_start,
         (icl.discrepancy_resolution IS NOT NULL)
  INTO v_org, v_status, v_warehouse_id, v_product_id, v_snapshot, v_had_resolution
  FROM public.inventory_count_lines icl
  JOIN public.inventory_counts ic ON ic.id = icl.inventory_count_id
  WHERE icl.id = p_line_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Linha de contagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.count', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para contar inventário nesta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'em_contagem' THEN
    RAISE EXCEPTION 'Esta sessão de contagem já não está em curso (estado atual: %)', v_status USING ERRCODE = 'check_violation';
  END IF;

  SELECT quantity INTO v_live_qty
  FROM public.stocks
  WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id;

  v_moved := (COALESCE(v_live_qty, 0) IS DISTINCT FROM v_snapshot);

  -- D2: recontar uma linha já resolvida limpa a resolução anterior — evita
  -- que rpc_finalize_inventory_count aceite uma resolução desatualizada face
  -- ao novo valor contado.
  UPDATE public.inventory_count_lines
  SET counted_quantity   = p_counted_quantity,
      counted_by         = v_actor,
      counted_at         = now(),
      -- D3: cumulativo, nunca volta a false sozinho.
      moved_during_count = moved_during_count OR v_moved,
      discrepancy_resolution = CASE WHEN v_had_resolution THEN NULL ELSE discrepancy_resolution END,
      resolution_notes        = CASE WHEN v_had_resolution THEN NULL ELSE resolution_notes END,
      stock_movement_id       = CASE WHEN v_had_resolution THEN NULL ELSE stock_movement_id END
  WHERE id = p_line_id
  RETURNING moved_during_count INTO v_moved;

  RETURN jsonb_build_object(
    'id', p_line_id,
    'counted_quantity', p_counted_quantity,
    'system_quantity_at_start', v_snapshot,
    'moved_during_count', v_moved,
    'resolution_cleared', v_had_resolution
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_update_purchase_order(p_purchase_order_id uuid, p_order jsonb, p_items jsonb)
 RETURNS purchase_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor      uuid;
  v_before     public.purchase_orders;
  v_order      public.purchase_orders;
  v_item       jsonb;
  v_diff       jsonb := '{}'::jsonb;
  v_po_diff    jsonb := '{}'::jsonb;
  v_old_json   jsonb;
  v_new_json   jsonb;
  v_key        text;
  v_new_status text;
  v_editable_cols text[] := ARRAY[
    'supplier_id','order_date','expected_delivery','status','total_value','notes',
    'supplier_notes'  -- F3.2 (20261211130000)
  ];
  -- F3.2 (20261211130000)
  v_pub        public.supplier_po_publications;
  v_published  boolean := false;
  v_opt_keys   text[];
  v_drop_keys  text[];
  v_sent_sig   text[];
  v_cur_sig    text[];
  v_pub_msg    text;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with purchase_orders_update RLS ──────────────────
  -- Predicate (2): the edit permission (checked first — fail before any read/write).
  IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Load the before-image (for the diff + org-scope guard) ────────────────
  -- F3.2 (20261211130000): FOR UPDATE — serializa com rpc_po_send_to_supplier.
  SELECT * INTO v_before FROM public.purchase_orders WHERE id = p_purchase_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Predicate (1): the existing row's org must be in the caller's visible-org scope.
  IF NOT public.fn_deal_org_in_scope(v_before.organization_id)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.edit', v_before.organization_id) THEN
    RAISE EXCEPTION 'Encomenda fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── NOVO (20261114040000): impede editar (DELETE+INSERT de itens) uma
  --    encomenda com progresso de receção — apagaria received_quantity sem
  --    deixar rasto. Isto bloqueia também, de facto, status='cancelled'
  --    (a chamada inteira falha antes de qualquer escrita): não se cancela
  --    uma encomenda já parcial/totalmente recebida, o caminho correto é
  --    rpc_register_supplier_return.
  IF EXISTS (
    SELECT 1 FROM public.purchase_order_items
    WHERE purchase_order_id = p_purchase_order_id AND received_quantity > 0
  ) THEN
    RAISE EXCEPTION 'Esta encomenda já tem linhas recebidas (parcial ou totalmente) — não é possível editá-la nem cancelá-la. Para devolver mercadoria já recebida, usa rpc_register_supplier_return.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── NOVO (20261113290000): exige purchase_orders.approve ADICIONALMENTE a
  --    .edit, só quando esta chamada está mesmo a transitar o status para
  --    'ordered' (não em updates que já estavam em 'ordered' e mantêm o
  --    estado, nem em updates que mudam outros campos sem tocar no status).
  v_new_status := COALESCE(nullif(p_order ->> 'status', ''), 'pending');
  IF v_new_status = 'ordered' AND v_before.status IS DISTINCT FROM 'ordered' THEN
    IF NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.approve', v_before.organization_id) THEN
      RAISE EXCEPTION 'Sem permissão para aprovar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── F3.2 (20261211130000): encomenda publicada no portal do fornecedor ───
  SELECT * INTO v_pub FROM public.supplier_po_publications
  WHERE purchase_order_id = p_purchase_order_id AND status <> 'withdrawn';
  v_published := FOUND;
  IF v_published THEN
    v_pub_msg := CASE WHEN v_pub.status = 'confirmed'
      THEN 'O fornecedor já confirmou esta encomenda no portal: as linhas, o fornecedor, a data da encomenda e o estado já não podem ser alterados (pode mudar as notas e a entrega prevista; para reduzir quantidades use "Anular resto").'
      ELSE 'Esta encomenda está no portal do fornecedor: para alterar linhas, fornecedor, data da encomenda ou estado, retire-a primeiro do portal (pode mudar as notas e a entrega prevista).' END;

    IF nullif(p_order ->> 'supplier_id', '')::uuid IS DISTINCT FROM v_before.supplier_id
       OR (p_order ->> 'order_date')::date IS DISTINCT FROM v_before.order_date
       OR v_new_status IS DISTINCT FROM v_before.status THEN
      RAISE EXCEPTION '%', v_pub_msg USING ERRCODE = 'check_violation', HINT = 'po_published';
    END IF;

    IF p_items IS NOT NULL THEN
      IF jsonb_typeof(p_items) <> 'array' THEN
        RAISE EXCEPTION '%', v_pub_msg USING ERRCODE = 'check_violation', HINT = 'po_published';
      END IF;
      -- Chaves opcionais que não vêm em nenhuma linha enviada ficam de fora.
      v_opt_keys := ARRAY['sku', 'uom_id', 'supplier_sku', 'notes', 'selected_attributes', 'description', 'vat_rate'];
      SELECT COALESCE(array_agg(k), ARRAY[]::text[]) INTO v_drop_keys
      FROM unnest(v_opt_keys) k
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) e WHERE jsonb_typeof(e) = 'object' AND e ? k);

      SELECT COALESCE(array_agg(s ORDER BY s), ARRAY[]::text[]) INTO v_sent_sig
      FROM (
        SELECT (jsonb_build_object(
                  'item_type', e ->> 'item_type',
                  'product_id', nullif(e ->> 'product_id', '')::uuid,
                  'service_id', nullif(e ->> 'service_id', '')::uuid,
                  'description', e ->> 'description',
                  'sku', nullif(e ->> 'sku', ''),
                  'quantity', trim_scale((e ->> 'quantity')::numeric),
                  'unit_price', trim_scale((e ->> 'unit_price')::numeric),
                  'vat_rate', trim_scale((e ->> 'vat_rate')::numeric),
                  'uom_id', nullif(e ->> 'uom_id', '')::uuid,
                  'supplier_sku', nullif(btrim(e ->> 'supplier_sku'), ''),
                  'notes', nullif(e ->> 'notes', ''),
                  'selected_attributes', COALESCE(nullif(nullif(e -> 'selected_attributes', 'null'::jsonb), '{}'::jsonb), '{}'::jsonb)
                ) - v_drop_keys)::text AS s
        FROM jsonb_array_elements(p_items) e
      ) z;

      SELECT COALESCE(array_agg(s ORDER BY s), ARRAY[]::text[]) INTO v_cur_sig
      FROM (
        SELECT (jsonb_build_object(
                  'item_type', i.item_type,
                  'product_id', i.product_id,
                  'service_id', i.service_id,
                  'description', i.description,
                  'sku', nullif(i.sku, ''),
                  'quantity', trim_scale(i.quantity),
                  'unit_price', trim_scale(i.unit_price),
                  'vat_rate', trim_scale(i.vat_rate),
                  'uom_id', i.uom_id,
                  'supplier_sku', nullif(btrim(i.supplier_sku), ''),
                  'notes', nullif(i.notes, ''),
                  'selected_attributes', COALESCE(nullif(nullif(i.selected_attributes, 'null'::jsonb), '{}'::jsonb), '{}'::jsonb)
                ) - v_drop_keys)::text AS s
        FROM public.purchase_order_items i
        WHERE i.purchase_order_id = p_purchase_order_id
      ) z;

      IF v_sent_sig IS DISTINCT FROM v_cur_sig THEN
        RAISE EXCEPTION '%', v_pub_msg USING ERRCODE = 'check_violation', HINT = 'po_published';
      END IF;
    END IF;
  END IF;

  -- ── UPDATE the order (identical column set to the FE update) ──────────────
  UPDATE public.purchase_orders
  SET supplier_id       = nullif(p_order ->> 'supplier_id', '')::uuid,
      order_date        = (p_order ->> 'order_date')::date,
      expected_delivery = nullif(p_order ->> 'expected_delivery', '')::date,
      status            = v_new_status,
      -- F3.2: publicada → as linhas não mudam, o total também não.
      total_value       = CASE WHEN v_published THEN total_value
                               ELSE COALESCE((p_order ->> 'total_value')::numeric, 0) END,
      notes             = nullif(p_order ->> 'notes', ''),
      -- F3.2 (20261211130000): só muda se a chave vier no pedido.
      supplier_notes    = CASE WHEN p_order ? 'supplier_notes'
                               THEN nullif(p_order ->> 'supplier_notes', '')
                               ELSE supplier_notes END
  WHERE id = p_purchase_order_id
  RETURNING * INTO v_order;

  -- ── Rewrite items: delete-all then re-insert (matches the FE) ─────────────
  -- F3.2 (20261211130000): não com publicação ativa (linhas já verificadas
  -- iguais acima; os ids mantêm-se).
  IF NOT v_published THEN
  DELETE FROM public.purchase_order_items WHERE purchase_order_id = p_purchase_order_id;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.purchase_order_items (
        purchase_order_id, item_type, product_id, service_id, description, sku,
        quantity, unit_price, vat_rate, vat_amount, total_price,
        selected_attributes, notes,
        uom_id, supplier_sku  -- NOVO (20261204204500); units_per_uom pelo gatilho
      )
      VALUES (
        p_purchase_order_id,
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
  END IF;  -- F3.2: NOT v_published

  -- ── Build the combined diff across both tables ────────────────────────────
  v_old_json := to_jsonb(v_before);
  v_new_json := to_jsonb(v_order);
  FOREACH v_key IN ARRAY v_editable_cols LOOP
    IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
      v_po_diff := v_po_diff || jsonb_build_object(
        v_key, jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
      );
    END IF;
  END LOOP;

  -- ── Emit the single consolidated UPDATE audit row only when the PO itself
  --    actually changed — same pattern as rpc_update_deal (20260730010000), which
  --    skips the write when its diff is '{}'. This avoids an "empty" UPDATE row
  --    (no real change in purchase_orders) every time the user re-submits the form
  --    without editing any field. When there IS a real PO change we also attach the
  --    resulting item set so the single row reflects the full save. ───────────
  IF v_po_diff <> '{}'::jsonb THEN
    v_diff := v_diff
      || jsonb_build_object('purchase_orders', v_po_diff)
      || jsonb_build_object(
           'purchase_order_items', jsonb_build_object('new', COALESCE(p_items, '[]'::jsonb))
         );

    PERFORM public.fn_manual_audit_log(
      'purchase_orders', p_purchase_order_id, v_order.organization_id, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_order;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_upsert_inventory_settings(p_organization_id uuid, p_stock_deduction_trigger text, p_default_warehouse_id uuid)
 RETURNS organization_inventory_settings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid;
  v_row   public.organization_inventory_settings;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', p_organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para editar definições de inventário desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 29/10: 'manual' (só pela Saída para clientes) também é válido; NULL recusa-se
  IF p_stock_deduction_trigger IS NULL OR p_stock_deduction_trigger NOT IN ('contract_signed', 'proposal_accepted', 'manual') THEN
    RAISE EXCEPTION 'stock_deduction_trigger inválido: %', p_stock_deduction_trigger USING ERRCODE = 'check_violation';
  END IF;

  IF p_default_warehouse_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_default_warehouse_id
      AND organization_id = p_organization_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.organization_inventory_settings (
    organization_id, stock_deduction_trigger, default_warehouse_id, created_by
  ) VALUES (
    p_organization_id, p_stock_deduction_trigger, p_default_warehouse_id, v_actor
  )
  ON CONFLICT (organization_id) DO UPDATE
    SET stock_deduction_trigger = EXCLUDED.stock_deduction_trigger,
        default_warehouse_id    = EXCLUDED.default_warehouse_id,
        updated_at              = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;
