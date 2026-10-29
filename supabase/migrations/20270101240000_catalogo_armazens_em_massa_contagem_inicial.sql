-- Catálogo ↔ Inventário: os produtos do Catálogo gerem sempre stock; armazéns em massa; contagem inicial pelos produtos marcados.
-- Base RH (uetjghdkwbywbftedtth). Sem tabelas nem colunas novas.
--
-- Decisão do utilizador: manages_stock é SEMPRE true nos produtos do Catálogo (sem interruptor). Sem stock → disponível 0 → a quantidade
-- toda vai ao pedido automático ao fornecedor (fn_client_order_request_missing, o mesmo caminho e o mesmo resultado que hoje); com stock →
-- reserva FIFO, saída de stock com movimento (rpc_confirm_client_order_stock_exit / fn_contract_stock_deduction) e a falta ao fornecedor.
-- Os armazéns marcados só dizem onde o produto está/pode estar (contagens, mínimos/máximos); já não ligam/desligam manages_stock.
--
-- 1. rpc_create_inventory_count (sobre a versão viva), só o ramo INICIAL: deixa de criar linhas de stocks para todos os produtos da
--    organização; o universo passa a ser os produtos marcados no armazém (linha de stocks não apagada, mesmo a 0) que estão em
--    product_organizations — mantém o filtro de categoria, a exclusão de rascunhos e o erro explicativo quando fica vazia (mensagem
--    nova: marcar o armazém nos produtos em Catálogo e custos, um a um ou em massa). O ramo de rotina não muda. As chaves do
--    retorno ficam; stock_rows_created passa a ser sempre 0.
-- 2. NOVA fn_cat_armazem_bloqueios(org, armazém, produtos[]) (interna, por conjuntos): o motivo de cada produto que não pode ser
--    desligado do armazém — quantidade ≠ 0, contagem aberta nesse armazém, reservas/faltas de EC abertas, linhas de PO por receber.
--    cat_definir_armazem_produto passa a usá-la (mesmas regras e mensagens; contrato igual) e deixa de mexer em manages_stock
--    (gere_stock no retorno = o valor atual).
-- 3. NOVA cat_definir_armazem_produtos(produtos[], armazém, ativo) → { ok, alterados, gere_stock_ligados, gere_stock_desligados,
--    recusados: [{ product_id, nome, motivo }] } — as mesmas regras por produto, por conjuntos (sem ciclo por linha): um produto
--    bloqueado vai para «recusados» e os outros seguem. Ligar: cria a linha a 0 ou reativa a da reciclagem; desligar: reciclagem.
--    Não mexe em manages_stock (gere_stock_ligados/gere_stock_desligados ficam no contrato, sempre 0). Até 5000 por chamada. inventory.edit.
-- 4. cat_guardar_produto (sobre a versão viva) cria com manages_stock = true; rpc_catalog_link (sobre a versão viva) põe manages_stock =
--    true quando o produto entra no Catálogo (tipo_catalogo passa de NULL a 'produto').
-- 5. Dados: manages_stock = true em todos os produtos não apagados com tipo_catalogo 'produto'/'consumivel'.
-- Guarda: só substitui as funções se forem exatamente as medidas a 29/10/2026 na base RH (md5 de pg_get_functiondef).

SET lock_timeout = '5s';

DO $guarda$
DECLARE v_h text;
BEGIN
  SELECT md5(pg_get_functiondef('public.rpc_create_inventory_count(uuid,uuid,uuid,boolean)'::regprocedure)) INTO v_h;
  IF v_h <> 'd5d2b7310f21f536011f56f9cd934405' THEN
    RAISE EXCEPTION 'Guarda: rpc_create_inventory_count no remoto mudou (md5 %): rever antes de aplicar.', v_h;
  END IF;
  SELECT md5(pg_get_functiondef('public.cat_definir_armazem_produto(uuid,uuid,boolean,numeric,numeric,numeric,text)'::regprocedure)) INTO v_h;
  IF v_h <> 'b7649204c3c36175cddb91e9ac35c58d' THEN
    RAISE EXCEPTION 'Guarda: cat_definir_armazem_produto no remoto mudou (md5 %): rever antes de aplicar.', v_h;
  END IF;
  SELECT md5(pg_get_functiondef('public.cat_guardar_produto(uuid,uuid,text,text,text,text,uuid,numeric,date,numeric,uuid,numeric,numeric,numeric,text)'::regprocedure)) INTO v_h;
  IF v_h <> '48768da38c4fa62c544c189a2cf86985' THEN
    RAISE EXCEPTION 'Guarda: cat_guardar_produto no remoto mudou (md5 %): rever antes de aplicar.', v_h;
  END IF;
  SELECT md5(pg_get_functiondef('public.rpc_catalog_link(uuid,uuid,uuid,uuid,boolean)'::regprocedure)) INTO v_h;
  IF v_h <> '4af124592d74df310a01dc0c28d1c4ba' THEN
    RAISE EXCEPTION 'Guarda: rpc_catalog_link no remoto mudou (md5 %): rever antes de aplicar.', v_h;
  END IF;
  IF to_regprocedure('public.cat_definir_armazem_produtos(uuid[],uuid,boolean)') IS NOT NULL
     OR to_regprocedure('public.fn_cat_armazem_bloqueios(uuid,uuid,uuid[])') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: as funções novas já existem no remoto: rever antes de aplicar.';
  END IF;
END $guarda$;

-- ─── 2. fn_cat_armazem_bloqueios ──────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cat_armazem_bloqueios(p_org uuid, p_warehouse_id uuid, p_product_ids uuid[])
 RETURNS TABLE(product_id uuid, motivo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH ids AS (SELECT DISTINCT x AS id FROM unnest(p_product_ids) x WHERE x IS NOT NULL),
  wh AS (SELECT w.name FROM warehouses w WHERE w.id = p_warehouse_id),
  b AS (
    SELECT s.product_id AS pid, 1 AS ord,
           format('Não é possível desligar: o armazém %s ainda tem %s unidade(s) deste produto. Transfira ou acerte o stock primeiro.',
                  (SELECT name FROM wh), s.quantity) AS m
    FROM stocks s JOIN ids ON ids.id = s.product_id
    WHERE s.warehouse_id = p_warehouse_id AND s.deleted_at IS NULL AND s.quantity <> 0
    UNION ALL
    SELECT DISTINCT l.product_id, 2,
           format('Não é possível desligar: há uma contagem de inventário aberta com este produto no armazém %s.', (SELECT name FROM wh))
    FROM inventory_count_lines l JOIN inventory_counts c ON c.id = l.inventory_count_id JOIN ids ON ids.id = l.product_id
    WHERE c.warehouse_id = p_warehouse_id AND c.status = 'em_contagem'
    UNION ALL
    SELECT DISTINCT r.product_id, 3, 'Não é possível desligar: há encomendas de cliente em aberto com este produto (reservas ou faltas).'
    FROM public.fn_client_order_line_reservations(p_org, ARRAY(SELECT id FROM ids)) r
    WHERE coalesce(r.qty_reserved, 0) > 0 OR coalesce(r.qty_missing, 0) > 0
    UNION ALL
    SELECT i.product_id, 4,
           format('Não é possível desligar: há %s linha(s) de encomenda a fornecedor deste produto por receber.', count(*))
    FROM purchase_order_items i JOIN purchase_orders o ON o.id = i.purchase_order_id JOIN ids ON ids.id = i.product_id
    WHERE o.organization_id = p_org AND o.deleted_at IS NULL AND o.status NOT IN ('received', 'cancelled')
      AND coalesce(i.received_to_stock_units, 0) < i.quantity * coalesce(i.units_per_uom, 1)
    GROUP BY i.product_id
  )
  SELECT DISTINCT ON (b.pid) b.pid, b.m FROM b ORDER BY b.pid, b.ord
$function$;

REVOKE ALL ON FUNCTION public.fn_cat_armazem_bloqueios(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cat_armazem_bloqueios(uuid, uuid, uuid[]) TO service_role;
COMMENT ON FUNCTION public.fn_cat_armazem_bloqueios(uuid, uuid, uuid[]) IS 'Catálogo/Inventário (interna): motivo por produto para não o desligar de um armazém (quantidade, contagem aberta, reservas/faltas de EC, PO por receber).';

-- ─── 2b. cat_definir_armazem_produto: as regras passam para fn_cat_armazem_bloqueios (resto igual à versão viva) ───────────────────────
CREATE OR REPLACE FUNCTION public.cat_definir_armazem_produto(p_product_id uuid, p_warehouse_id uuid, p_ativo boolean, p_minimo numeric DEFAULT NULL::numeric, p_maximo numeric DEFAULT NULL::numeric, p_ponto_encomenda numeric DEFAULT NULL::numeric, p_localizacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prod   record;
  v_wh     warehouses;
  v_user   uuid;
  s        stocks;
  v_motivo text;
  v_n      integer;
  v_loc    text := nullif(btrim(coalesce(p_localizacao, '')), '');
BEGIN
  SELECT id, organization_id, manages_stock, name INTO v_prod FROM products
  WHERE id = p_product_id AND NOT is_deleted AND deleted_at IS NULL;
  IF v_prod.id IS NULL THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  v_user := public.fn_cat_exigir(v_prod.organization_id, 'inventory.edit');
  IF v_user IS NULL THEN RAISE EXCEPTION 'Perfil de utilizador não encontrado.' USING ERRCODE = 'CT001'; END IF;
  IF p_ativo IS NULL THEN RAISE EXCEPTION 'Indique se o armazém fica ativo.' USING ERRCODE = 'CT002'; END IF;
  SELECT * INTO v_wh FROM warehouses WHERE id = p_warehouse_id AND organization_id = v_prod.organization_id AND deleted_at IS NULL;
  IF v_wh.id IS NULL THEN RAISE EXCEPTION 'Armazém não encontrado nesta organização.' USING ERRCODE = 'CT003'; END IF;
  -- stocks guarda inteiros ≥ 0
  IF (p_minimo IS NOT NULL AND (p_minimo < 0 OR p_minimo <> trunc(p_minimo) OR p_minimo > 2147483647))
     OR (p_maximo IS NOT NULL AND (p_maximo < 0 OR p_maximo <> trunc(p_maximo) OR p_maximo > 2147483647))
     OR (p_ponto_encomenda IS NOT NULL AND (p_ponto_encomenda < 0 OR p_ponto_encomenda <> trunc(p_ponto_encomenda) OR p_ponto_encomenda > 2147483647)) THEN
    RAISE EXCEPTION 'Mínimo, máximo e ponto de encomenda são números inteiros, 0 ou mais.' USING ERRCODE = 'CT002';
  END IF;
  IF v_loc IS NOT NULL AND char_length(v_loc) > 200 THEN
    RAISE EXCEPTION 'Localização demasiado longa (máx. 200 caracteres).' USING ERRCODE = 'CT002';
  END IF;

  -- a mesma ordem de bloqueio dos movimentos (produto, depois a linha de stocks)
  PERFORM 1 FROM products WHERE id = p_product_id FOR NO KEY UPDATE;
  SELECT * INTO s FROM stocks WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id FOR UPDATE;
  PERFORM set_config('app.audit_source', 'catalogo', true);

  IF p_ativo THEN
    IF NOT v_wh.is_active AND (s.id IS NULL OR s.deleted_at IS NOT NULL) THEN
      RAISE EXCEPTION 'O armazém % está inativo: ative-o no Inventário antes de lhe ligar produtos.', v_wh.name USING ERRCODE = 'CT002';
    END IF;
    IF s.id IS NULL THEN
      INSERT INTO stocks (organization_id, product_id, warehouse_id, quantity, minimum_quantity, maximum_quantity, reorder_point,
                          location, created_by)
      VALUES (v_wh.organization_id, p_product_id, p_warehouse_id, 0, coalesce(p_minimo, 0)::integer, coalesce(p_maximo, 0)::integer,
              coalesce(p_ponto_encomenda, 0)::integer, v_loc, v_user);
      v_motivo := 'Armazém ligado ao produto.';
    ELSE
      UPDATE stocks SET
        deleted_at = NULL, deleted_by = NULL,
        minimum_quantity = coalesce(p_minimo::integer, minimum_quantity),
        maximum_quantity = coalesce(p_maximo::integer, maximum_quantity),
        reorder_point = coalesce(p_ponto_encomenda::integer, reorder_point),
        location = CASE WHEN p_localizacao IS NULL THEN location ELSE v_loc END,
        updated_at = now()
      WHERE id = s.id;
      v_motivo := CASE WHEN s.deleted_at IS NOT NULL THEN 'Armazém voltou a ficar ligado ao produto.' ELSE 'Dados do armazém atualizados.' END;
    END IF;
    -- 20270101240000: os armazéns só dizem onde o produto está/pode estar; manages_stock não muda aqui
    RETURN jsonb_build_object('ok', true, 'motivo', v_motivo, 'gere_stock', v_prod.manages_stock);
  END IF;

  -- ── desligar ──
  IF s.id IS NULL OR s.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'motivo', 'O armazém já não estava ligado ao produto.', 'gere_stock', v_prod.manages_stock);
  END IF;
  -- 20270101240000: as regras de bloqueio vivem em fn_cat_armazem_bloqueios (partilhadas com cat_definir_armazem_produtos);
  -- as mensagens são as mesmas de antes.
  SELECT b.motivo INTO v_motivo FROM public.fn_cat_armazem_bloqueios(v_prod.organization_id, p_warehouse_id, ARRAY[p_product_id]) b LIMIT 1;
  IF v_motivo IS NOT NULL THEN RAISE EXCEPTION '%', v_motivo USING ERRCODE = 'CT002'; END IF;

  UPDATE stocks SET deleted_at = now(), deleted_by = v_user, updated_at = now() WHERE id = s.id;
  v_motivo := 'Armazém desligado do produto.';
  RETURN jsonb_build_object('ok', true, 'motivo', v_motivo, 'gere_stock', v_prod.manages_stock);
END $function$;

-- ─── 1. rpc_create_inventory_count: contagem inicial pelos produtos marcados no armazém (resto igual à versão viva) ──────────────────
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
       public.has_anew_permission(auth.uid(), 'inventory.count')
       OR public.has_anew_permission(auth.uid(), 'inventory.edit')
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

-- ─── 4a. cat_guardar_produto: cria com manages_stock = true (resto igual à versão viva) ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_guardar_produto(p_org uuid, p_id uuid, p_tipo text, p_nome text, p_sku text, p_unidade text, p_categoria_id uuid, p_custo numeric, p_custo_data date, p_pvp numeric, p_servico_id uuid, p_fator_servico numeric, p_entulho_m3 numeric DEFAULT NULL::numeric, p_entulho_kg numeric DEFAULT NULL::numeric, p_descricao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := public.fn_cat_exigir(p_org, 'products.edit'); v_id uuid; v_atual numeric;
  v_agora timestamptz := clock_timestamp();
BEGIN
  IF p_tipo NOT IN ('produto','consumivel') THEN RAISE EXCEPTION 'Tipo inválido.' USING ERRCODE = 'CT002'; END IF;
  IF length(btrim(coalesce(p_nome, ''))) = 0 THEN RAISE EXCEPTION 'O nome é obrigatório.' USING ERRCODE = 'CT002'; END IF;
  IF p_servico_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM services WHERE id = p_servico_id AND organization_id = p_org AND NOT is_deleted) THEN
    RAISE EXCEPTION 'Serviço desconhecido nesta organização.' USING ERRCODE = 'CT002';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO products (organization_id, sku, name, status, is_active, is_sellable, is_purchasable, has_variants, is_deleted, manages_stock,
      created_by, tipo_catalogo, unidade, catalogo_categoria_id, servico_id, fator_servico, entulho_m3, entulho_kg, short_description)
    VALUES (p_org, coalesce(nullif(btrim(p_sku), ''), 'CAT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
      -- 20270101240000: manages_stock = true (os produtos do Catálogo gerem sempre stock: sem stock, tudo vai ao fornecedor)
      btrim(p_nome), 'active', true, p_tipo = 'produto', true, false, false, true,
      v_user, p_tipo, p_unidade, p_categoria_id, p_servico_id, coalesce(p_fator_servico, 1), p_entulho_m3, p_entulho_kg, p_descricao)
    RETURNING id INTO v_id;
  ELSE
    UPDATE products SET name = btrim(p_nome), sku = coalesce(nullif(btrim(p_sku), ''), sku), tipo_catalogo = p_tipo, unidade = p_unidade,
      catalogo_categoria_id = p_categoria_id, servico_id = p_servico_id, fator_servico = coalesce(p_fator_servico, 1),
      entulho_m3 = p_entulho_m3, entulho_kg = p_entulho_kg, short_description = p_descricao, is_sellable = p_tipo = 'produto', updated_at = now()
    WHERE id = p_id AND organization_id = p_org AND NOT is_deleted RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  END IF;
  -- 20270101230000: o produto do Catálogo pertence à organização em product_organizations (é por aí que o Inventário o vê:
  -- contagem inicial, listagens). Idempotente: na criação e em cada gravação.
  INSERT INTO product_organizations (product_id, organization_id, created_by)
  VALUES (v_id, p_org, v_user)
  ON CONFLICT (product_id, organization_id) DO NOTHING;
  IF p_custo IS NOT NULL THEN
    SELECT coalesce(preco_exato, price) INTO v_atual FROM product_prices WHERE product_id = v_id AND price_type = 'purchase' ORDER BY valid_from DESC NULLS LAST, created_at DESC LIMIT 1;
    IF v_atual IS DISTINCT FROM round(p_custo, 6) THEN
      INSERT INTO product_prices (product_id, currency, price, preco_exato, valid_from, created_by, price_type)
      VALUES (v_id, 'EUR', round(p_custo, 2), round(p_custo, 6),
        greatest(CASE WHEN p_custo_data IS NULL OR p_custo_data >= current_date THEN v_agora
                      ELSE p_custo_data::timestamp + (v_agora - date_trunc('day', v_agora)) END,
                 public.fn_cat_depois_do_ultimo_preco(v_id)),
        v_user, 'purchase');
    END IF;
  END IF;
  IF p_pvp IS NOT NULL THEN
    SELECT price INTO v_atual FROM product_prices WHERE product_id = v_id AND price_type = 'retail' ORDER BY valid_from DESC NULLS LAST, created_at DESC LIMIT 1;
    IF v_atual IS DISTINCT FROM round(p_pvp, 2) THEN
      INSERT INTO product_prices (product_id, currency, price, valid_from, created_by, price_type)
      VALUES (v_id, 'EUR', round(p_pvp, 2), greatest(v_agora, public.fn_cat_depois_do_ultimo_preco(v_id)), v_user, 'retail');
    END IF;
  END IF;
  RETURN v_id;
END $function$;

-- ─── 4b. rpc_catalog_link: ao entrar no Catálogo passa a gerir stock (resto igual à versão viva) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_catalog_link(p_supplier_id uuid, p_catalog_item_id uuid, p_product_id uuid, p_uom_id uuid DEFAULT NULL::uuid, p_apply_catalog_price boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org      uuid := public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  v_actor    uuid := public.current_business_user_id();
  l          public.supplier_account_links;
  ci         public.supplier_catalog_items;
  p          record;
  isup       public.item_suppliers;
  v_other    record;
  v_created  boolean := false;
  v_warn     jsonb := '[]'::jsonb;
  v_codes    jsonb := '[]'::jsonb;
  v_price    boolean := COALESCE(p_apply_catalog_price, true);
  v_pref     boolean;
  v_code_id  uuid;
  v_old_price numeric;
  v_old_ccy  text;
  v_price_upd boolean := false;
  v_cost     jsonb;
  v_link_factor integer;   -- fn_uom_units_per(p_uom_id, produto)
  v_pack     numeric;      -- units_per_pack do artigo quando a ligação é à unidade
  v_link_price numeric;    -- preço do catálogo a gravar na ligação (÷N nas embalagens)
  v_use_price boolean;     -- usar mesmo o preço (pedido, com preço e conversível)
BEGIN
  IF NOT public.has_anew_permission(auth.uid(), 'products.edit') THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (products.edit)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  SELECT * INTO l FROM public.supplier_account_links WHERE supplier_id = p_supplier_id AND status = 'active';
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'Este fornecedor não está ligado ao portal' USING ERRCODE = 'no_data_found', HINT = 'not_linked';
  END IF;
  SELECT * INTO ci FROM public.supplier_catalog_items WHERE id = p_catalog_item_id AND supplier_account_id = l.supplier_account_id;
  IF ci.id IS NULL THEN
    RAISE EXCEPTION 'Artigo do catálogo não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  SELECT id, name, sku, barcode INTO p FROM public.products
  WHERE id = p_product_id AND organization_id = v_org AND deleted_at IS NULL AND NOT is_deleted
  FOR NO KEY UPDATE;
  IF p.id IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  -- F3.4b: usar o preço do catálogo muda preços (ligação e custo do produto):
  -- a mesma permissão de aceitar um pedido de alteração de preço.
  IF v_price AND ci.base_price IS NOT NULL
     AND NOT public.has_anew_permission(auth.uid(), 'products.manage_prices') THEN
    RAISE EXCEPTION 'Sem permissão para alterar preços: liga sem usar o preço do catálogo'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_price_permission';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('catalog_link:' || p_supplier_id::text, 0));
  PERFORM set_config('app.audit_source', 'supplier_catalog', true);

  -- 20270101210000: ligado a um artigo do portal, o produto entra no Catálogo (/catalogo-custos lista tipo_catalogo não nulo).
  -- Só preenche o que está vazio: nunca muda tipo_catalogo/unidade já escolhidos. Qualquer erro mais abaixo desfaz isto também.
  UPDATE public.products
     SET tipo_catalogo = COALESCE(tipo_catalogo, 'produto'),
         -- 20270101240000: ao entrar no Catálogo passa a gerir stock (como todos os produtos do Catálogo)
         manages_stock = CASE WHEN tipo_catalogo IS NULL THEN true ELSE manages_stock END,
         unidade = COALESCE(unidade, public.fn_cat_unidade_do_artigo(ci.unit_label, ci.units_per_pack))
   WHERE id = p.id AND (tipo_catalogo IS NULL OR unidade IS NULL);

  -- Artigo em embalagem de N ligado à unidade do produto: o preço do catálogo é
  -- da embalagem; a ligação guarda o preço por unidade (÷ N, como
  -- fn_price_change_cost_plan). N não inteiro → não se grava preço.
  BEGIN
    v_link_factor := public.fn_uom_units_per(p_uom_id, p.id);
  EXCEPTION WHEN OTHERS THEN
    v_link_factor := NULL;
  END;
  v_pack := CASE WHEN v_link_factor = 1 AND ci.units_per_pack > 1 THEN ci.units_per_pack END;
  v_link_price := CASE
                    WHEN ci.base_price IS NULL THEN NULL
                    WHEN v_pack IS NULL THEN ci.base_price
                    WHEN v_pack = trunc(v_pack) AND v_pack <= 2147483647 THEN round(ci.base_price / v_pack, 2)
                    ELSE NULL
                  END;
  v_use_price := v_price AND v_link_price IS NOT NULL;

  -- Este artigo já está ligado?
  SELECT * INTO isup FROM public.item_suppliers
  WHERE supplier_id = p_supplier_id AND catalog_item_id = ci.id AND deleted_at IS NULL;
  IF isup.id IS NOT NULL THEN
    IF isup.product_id = p.id THEN
      RETURN jsonb_build_object('item_supplier_id', isup.id, 'created', false, 'already_linked', true,
                                'codes', '[]'::jsonb, 'warnings', '[]'::jsonb,
                                'item_supplier_price_updated', false, 'product_cost_updated', false,
                                'product_cost_reason', 'already_linked', 'product_cost_message', NULL);
    END IF;
    SELECT name, sku INTO v_other FROM public.products WHERE id = isup.product_id;
    RAISE EXCEPTION 'A referência «%» já está ligada ao produto «%» (%)', ci.supplier_ref, v_other.name, v_other.sku
      USING ERRCODE = 'unique_violation', HINT = 'conflict';
  END IF;

  -- A referência já aponta para outro produto em product_codes?
  SELECT pr.name, pr.sku INTO v_other
  FROM public.product_codes pc JOIN public.products pr ON pr.id = pc.product_id
  WHERE pc.organization_id = v_org AND pc.supplier_id = p_supplier_id AND pc.kind = 'supplier_ref'
    AND pc.deleted_at IS NULL AND pc.code_key = ci.ref_key AND pc.product_id <> p.id
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'A referência «%» já está associada ao produto «%» (%) nos códigos do fornecedor', ci.supplier_ref, v_other.name, v_other.sku
      USING ERRCODE = 'unique_violation', HINT = 'conflict';
  END IF;

  -- Linha existente (produto, fornecedor, unidade)?
  SELECT * INTO isup FROM public.item_suppliers
  WHERE product_id = p.id AND supplier_id = p_supplier_id AND deleted_at IS NULL
    AND COALESCE(uom_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_uom_id, '00000000-0000-0000-0000-000000000000'::uuid)
  FOR UPDATE;

  IF isup.id IS NOT NULL THEN
    IF isup.catalog_item_id IS NOT NULL THEN
      SELECT supplier_ref INTO v_other FROM public.supplier_catalog_items WHERE id = isup.catalog_item_id;
      RAISE EXCEPTION 'Este produto já está ligado a outra referência do catálogo («%»)', v_other.supplier_ref
        USING ERRCODE = 'unique_violation', HINT = 'conflict';
    END IF;
    IF isup.supplier_sku IS NOT NULL AND public.fn_product_code_key(isup.supplier_sku) IS DISTINCT FROM ci.ref_key THEN
      v_warn := v_warn || jsonb_build_array(format('Referência do fornecedor alterada de «%s» para «%s»', isup.supplier_sku, ci.supplier_ref));
    END IF;
    v_old_price := isup.purchase_price;
    v_old_ccy := isup.currency;
    UPDATE public.item_suppliers SET
      catalog_item_id = ci.id,
      supplier_sku = ci.supplier_ref,
      purchase_price = CASE WHEN v_use_price THEN v_link_price ELSE purchase_price END,
      currency = CASE WHEN v_use_price THEN ci.currency ELSE currency END,
      preco_data = CASE WHEN v_use_price THEN current_date ELSE preco_data END,
      moq = COALESCE(moq, ci.moq),
      lead_time_days = COALESCE(lead_time_days, ci.lead_time_days),
      updated_at = now()
    WHERE id = isup.id
    RETURNING * INTO isup;
    v_price_upd := v_use_price
                   AND (isup.purchase_price IS DISTINCT FROM v_old_price OR isup.currency IS DISTINCT FROM v_old_ccy);
  ELSE
    v_pref := NOT EXISTS (SELECT 1 FROM public.item_suppliers WHERE product_id = p.id AND deleted_at IS NULL);
    INSERT INTO public.item_suppliers (
      organization_id, item_type, product_id, supplier_id, uom_id, supplier_sku, purchase_price,
      currency, moq, lead_time_days, is_preferred, is_active, created_by, catalog_item_id, preco_data
    ) VALUES (
      v_org, 'product', p.id, p_supplier_id, p_uom_id, ci.supplier_ref,
      CASE WHEN v_use_price THEN v_link_price END, ci.currency, ci.moq, ci.lead_time_days,
      v_pref, true, v_actor, ci.id, CASE WHEN v_use_price THEN current_date END
    ) RETURNING * INTO isup;
    v_created := true;
    v_price_upd := v_use_price;
  END IF;

  -- F3.4b: com o preço do catálogo, o custo do produto segue a mesma regra
  -- de aceitar um preço (ligação preferencial, empresa principal, unidade).
  -- Embalagem: passa-se o preço do catálogo e o plano divide por N (o custo
  -- fica = preço por unidade gravado na ligação). N não inteiro: o plano
  -- devolve 'pack_not_integer' e o custo não muda.
  IF v_price AND ci.base_price IS NOT NULL THEN
    v_cost := public.fn_apply_product_cost_from_supplier(
                isup.id, v_org,
                CASE WHEN v_pack IS NOT NULL THEN ci.base_price ELSE isup.purchase_price END,
                CASE WHEN v_pack IS NOT NULL THEN ci.currency ELSE isup.currency END,
                v_actor);
  ELSE
    v_cost := jsonb_build_object(
      'product_cost_updated', false, 'product_cost_rows', 0,
      'product_cost_reason', CASE WHEN v_price THEN 'no_catalog_price' ELSE 'catalog_price_not_used' END,
      'product_cost_message', CASE WHEN v_price THEN 'O artigo não tem preço no catálogo: preços não mudaram'
                                   ELSE 'Preço do catálogo não usado: preços não mudaram' END,
      'new_unit_cost', NULL, 'units_per_purchase_uom', NULL);
  END IF;

  -- product_codes: referência do fornecedor
  IF NOT EXISTS (SELECT 1 FROM public.product_codes
                 WHERE organization_id = v_org AND supplier_id = p_supplier_id AND kind = 'supplier_ref'
                   AND deleted_at IS NULL AND code_key = ci.ref_key) THEN
    v_code_id := gen_random_uuid();
    INSERT INTO public.product_codes (id, organization_id, code, kind, product_id, uom_id, supplier_id, source, context, created_by)
    VALUES (v_code_id, v_org, ci.supplier_ref, 'supplier_ref', p.id, p_uom_id, p_supplier_id, 'catalog',
            jsonb_build_object('catalog_item_id', ci.id, 'link_id', l.id), v_actor);
    v_codes := v_codes || jsonb_build_array(jsonb_build_object('id', v_code_id, 'kind', 'supplier_ref', 'code', ci.supplier_ref));
  END IF;

  -- product_codes: código de barras do artigo, se faltar no produto e estiver livre
  IF ci.barcode_key IS NOT NULL
     AND public.fn_product_code_key(p.barcode) IS DISTINCT FROM ci.barcode_key
     AND NOT EXISTS (SELECT 1 FROM public.product_codes
                     WHERE organization_id = v_org AND kind = 'barcode' AND deleted_at IS NULL
                       AND code_key = ci.barcode_key AND product_id = p.id) THEN
    SELECT pr.name, pr.sku INTO v_other
    FROM public.products pr
    WHERE pr.organization_id = v_org AND pr.id <> p.id AND pr.deleted_at IS NULL AND NOT pr.is_deleted
      AND public.fn_product_code_key(pr.barcode) = ci.barcode_key
    UNION ALL
    SELECT pr.name, pr.sku
    FROM public.product_codes pc JOIN public.products pr ON pr.id = pc.product_id
    WHERE pc.organization_id = v_org AND pc.kind = 'barcode' AND pc.deleted_at IS NULL
      AND pc.code_key = ci.barcode_key AND pc.product_id <> p.id
    LIMIT 1;
    IF FOUND THEN
      v_warn := v_warn || jsonb_build_array(format('O código de barras %s já está no produto «%s» (%s); não foi associado', ci.barcode, v_other.name, v_other.sku));
    ELSE
      v_code_id := gen_random_uuid();
      INSERT INTO public.product_codes (id, organization_id, code, kind, product_id, uom_id, supplier_id, source, context, created_by)
      VALUES (v_code_id, v_org, ci.barcode, 'barcode', p.id, p_uom_id, p_supplier_id, 'catalog',
              jsonb_build_object('catalog_item_id', ci.id, 'link_id', l.id), v_actor);
      v_codes := v_codes || jsonb_build_array(jsonb_build_object('id', v_code_id, 'kind', 'barcode', 'code', ci.barcode));
    END IF;
  END IF;

  -- Ligado deixa de estar "dispensado".
  DELETE FROM public.supplier_catalog_dismissals WHERE link_id = l.id AND catalog_item_id = ci.id;

  RETURN jsonb_build_object(
    'item_supplier_id', isup.id,
    'created', v_created,
    'already_linked', false,
    'is_preferred', isup.is_preferred,
    'codes', v_codes,
    'warnings', v_warn,
    'item_supplier_price_updated', v_price_upd
  ) || v_cost;
END;
$function$;

-- ─── 3. cat_definir_armazem_produtos (em massa) ───────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_definir_armazem_produtos(p_product_ids uuid[], p_warehouse_id uuid, p_ativo boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_wh    warehouses;
  v_user  uuid;
  v_ids   uuid[];
  v_ok    uuid[];
  v_cand  uuid[];
  v_bloq  uuid[];
  v_rec   jsonb := '[]'::jsonb;
  v_alt   integer := 0;
  v_lig   integer := 0;
  v_desl  integer := 0;
  v_n     integer;
BEGIN
  IF p_ativo IS NULL THEN RAISE EXCEPTION 'Indique se o armazém fica ativo.' USING ERRCODE = 'CT002'; END IF;
  IF p_product_ids IS NULL OR cardinality(p_product_ids) = 0 THEN RAISE EXCEPTION 'Indique os produtos.' USING ERRCODE = 'CT002'; END IF;
  IF cardinality(p_product_ids) > 5000 THEN
    RAISE EXCEPTION 'Demasiados produtos de uma vez (máximo 5000).' USING ERRCODE = 'CT002';
  END IF;
  SELECT * INTO v_wh FROM warehouses WHERE id = p_warehouse_id AND deleted_at IS NULL;
  -- sem armazém → organização nula → CT001 (não diz se o id existe)
  v_user := public.fn_cat_exigir(v_wh.organization_id, 'inventory.edit');
  IF v_user IS NULL THEN RAISE EXCEPTION 'Perfil de utilizador não encontrado.' USING ERRCODE = 'CT001'; END IF;
  IF p_ativo AND NOT v_wh.is_active THEN
    RAISE EXCEPTION 'O armazém % está inativo: ative-o no Inventário antes de lhe ligar produtos.', v_wh.name USING ERRCODE = 'CT002';
  END IF;

  v_ids := ARRAY(SELECT DISTINCT x FROM unnest(p_product_ids) x WHERE x IS NOT NULL);
  -- produtos válidos da organização do armazém, trancados por ordem (como cat_definir_armazem_produto: produto, depois stocks)
  PERFORM 1 FROM products WHERE id = ANY (v_ids) AND organization_id = v_wh.organization_id AND NOT is_deleted AND deleted_at IS NULL
  ORDER BY id FOR NO KEY UPDATE;
  v_ok := ARRAY(SELECT id FROM products WHERE id = ANY (v_ids) AND organization_id = v_wh.organization_id AND NOT is_deleted AND deleted_at IS NULL);
  SELECT coalesce(jsonb_agg(jsonb_build_object('product_id', x, 'nome', NULL, 'motivo', 'Produto não encontrado nesta organização.')), '[]'::jsonb)
  INTO v_rec FROM unnest(v_ids) x WHERE x <> ALL (v_ok);
  PERFORM 1 FROM stocks WHERE product_id = ANY (v_ok) AND warehouse_id = p_warehouse_id ORDER BY product_id FOR UPDATE;
  PERFORM set_config('app.audit_source', 'catalogo', true);

  IF p_ativo THEN
    UPDATE stocks SET deleted_at = NULL, deleted_by = NULL, updated_at = now()
    WHERE product_id = ANY (v_ok) AND warehouse_id = p_warehouse_id AND deleted_at IS NOT NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_alt := v_alt + v_n;
    INSERT INTO stocks (organization_id, product_id, warehouse_id, quantity, created_by)
    SELECT v_wh.organization_id, x, p_warehouse_id, 0, v_user FROM unnest(v_ok) x
    ON CONFLICT (product_id, warehouse_id) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_alt := v_alt + v_n;
  ELSE
    v_cand := ARRAY(SELECT product_id FROM stocks WHERE product_id = ANY (v_ok) AND warehouse_id = p_warehouse_id AND deleted_at IS NULL);
    IF cardinality(v_cand) > 0 THEN
      SELECT coalesce(array_agg(b.product_id), ARRAY[]::uuid[]),
             v_rec || coalesce(jsonb_agg(jsonb_build_object('product_id', b.product_id, 'nome', p.name, 'motivo', b.motivo) ORDER BY p.name), '[]'::jsonb)
      INTO v_bloq, v_rec
      FROM public.fn_cat_armazem_bloqueios(v_wh.organization_id, p_warehouse_id, v_cand) b JOIN products p ON p.id = b.product_id;
      v_cand := ARRAY(SELECT x FROM unnest(v_cand) x WHERE x <> ALL (v_bloq));
      UPDATE stocks SET deleted_at = now(), deleted_by = v_user, updated_at = now()
      WHERE product_id = ANY (v_cand) AND warehouse_id = p_warehouse_id AND deleted_at IS NULL;
      GET DIAGNOSTICS v_alt = ROW_COUNT;
    END IF;
  END IF;

  -- os armazéns já não mexem em manages_stock: as duas chaves ficam no contrato, sempre 0
  RETURN jsonb_build_object('ok', true, 'alterados', v_alt, 'gere_stock_ligados', v_lig, 'gere_stock_desligados', v_desl,
                            'recusados', v_rec);
END $function$;

REVOKE ALL ON FUNCTION public.cat_definir_armazem_produtos(uuid[], uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_definir_armazem_produtos(uuid[], uuid, boolean) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_definir_armazem_produtos(uuid[], uuid, boolean) IS 'Catálogo: liga/desliga um armazém a muitos produtos de uma vez (regras de cat_definir_armazem_produto; os bloqueados vão para recusados). Não mexe em manages_stock. Máx. 5000. inventory.edit.';

-- ─── 5. Dados: todos os produtos do Catálogo gerem stock ─────────────────────────────────────────────────────────────────────────────
DO $dados$
DECLARE v_n integer;
BEGIN
  PERFORM set_config('app.audit_source', 'system', true);
  UPDATE public.products p SET manages_stock = true, updated_at = now()
  WHERE p.tipo_catalogo IN ('produto', 'consumivel') AND NOT p.manages_stock AND NOT p.is_deleted AND p.deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Produtos do Catálogo que passaram a gerir stock: %', v_n;
END $dados$;

-- ─── Conferir ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $conferir$
DECLARE v_def text := pg_get_functiondef('public.rpc_create_inventory_count(uuid,uuid,uuid,boolean)'::regprocedure);
BEGIN
  IF position('INSERT INTO public.stocks' IN v_def) > 0 OR position('LEFT JOIN public.stocks s' IN v_def) > 0
     OR position('Catálogo e custos' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Conferir: a contagem inicial ainda cria stocks ou usa o catálogo inteiro.';
  END IF;
  IF position('fn_cat_armazem_bloqueios' IN pg_get_functiondef(
       'public.cat_definir_armazem_produto(uuid,uuid,boolean,numeric,numeric,numeric,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Conferir: cat_definir_armazem_produto não usa fn_cat_armazem_bloqueios.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.products p WHERE p.tipo_catalogo IN ('produto', 'consumivel') AND NOT p.manages_stock
             AND NOT p.is_deleted AND p.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Conferir: há produtos do Catálogo que não gerem stock.';
  END IF;
  IF position('p_tipo = ''produto'', true, false, false, true,' IN pg_get_functiondef(
       'public.cat_guardar_produto(uuid,uuid,text,text,text,text,uuid,numeric,date,numeric,uuid,numeric,numeric,numeric,text)'::regprocedure)) = 0
     OR position('manages_stock = CASE WHEN tipo_catalogo IS NULL THEN true' IN pg_get_functiondef(
       'public.rpc_catalog_link(uuid,uuid,uuid,uuid,boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Conferir: cat_guardar_produto / rpc_catalog_link não põem manages_stock = true.';
  END IF;
  IF position('UPDATE products SET manages_stock' IN pg_get_functiondef('public.cat_definir_armazem_produtos(uuid[],uuid,boolean)'::regprocedure)) > 0
     OR position('UPDATE products p SET manages_stock' IN pg_get_functiondef('public.cat_definir_armazem_produtos(uuid[],uuid,boolean)'::regprocedure)) > 0
     OR position('UPDATE products SET manages_stock' IN pg_get_functiondef(
       'public.cat_definir_armazem_produto(uuid,uuid,boolean,numeric,numeric,numeric,text)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'Conferir: os armazéns ainda mexem em manages_stock.';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_cat_armazem_bloqueios(uuid,uuid,uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.cat_definir_armazem_produtos(uuid[],uuid,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.cat_definir_armazem_produtos(uuid[],uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: grants.';
  END IF;
END $conferir$;
