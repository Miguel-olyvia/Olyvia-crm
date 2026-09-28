-- Contagem por categoria passa a apanhar os produtos das subcategorias.
--
-- Problema: rpc_create_inventory_count filtrava só por
-- products.category_id = p_category_id. Ficavam de fora os produtos de uma
-- subcategoria da categoria escolhida e os que só têm subcategory_id.
--
-- Correção: o conjunto passa a ser a categoria escolhida + todas as
-- descendentes (parent_id, recursivo), e o produto entra se category_id OU
-- subcategory_id estiver nesse conjunto. Mesmo critério nos 3 pontos (criação
-- de stocks da contagem inicial, linhas da inicial e linhas da rotina) — os
-- dois da inicial têm de continuar idênticos (D9). Mesmo critério do filtro
-- de categoria no frontend (useProductCategories).
--
-- Resto do corpo = definição ao vivo (pg_get_functiondef em 2026-09-28).
-- Assinatura inalterada: CREATE OR REPLACE mantém os grants existentes.

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
    -- ---- ÚNICA alteração face à versão anterior desta função --------------
    --
    -- A lista de stock de um armazém é, no essencial, a lista de produtos do
    -- catálogo — o que a distingue é o histórico de movimentos. Por isso o
    -- stock NASCE aqui, da leitura do catálogo, com saldo 0; as quantidades
    -- entram depois, pela contagem (D15). Sem isto, uma empresa nova tinha de
    -- criar 3000 linhas de stocks à mão, e um armazém cuja contagem inicial
    -- fosse finalizada sem nada contado ficava com ZERO linhas em stocks — e
    -- todas as contagens de rotina seguintes davam 0/0 (caso INV-0002 /
    -- ARMAZÉM LISBOA, no cabeçalho).
    --
    -- O predicado abaixo é CÓPIA EXATA do WHERE da semeadura que se segue
    -- (D9): se divergirem, a contagem fica com linhas sem stock correspondente.
    -- Mexer num obriga a mexer no outro, na mesma migration.
    --
    -- ON CONFLICT sobre unique_product_warehouse (F6), DO NOTHING e nunca DO
    -- UPDATE: cria-se o que falta, não se toca no que existe nem se ressuscita
    -- linha na reciclagem (D10). As quatro colunas NOT NULL sem default estão
    -- todas preenchidas (F5) e reorder_point fica no default 0, que o sistema
    -- de alertas lê como "nunca configurado" — não há notificações em massa
    -- (F8).
    INSERT INTO public.stocks (
      organization_id, product_id, warehouse_id, quantity, created_by
    )
    SELECT p_organization_id, p.id, p_warehouse_id, 0, v_actor
    FROM public.products p
    JOIN public.product_organizations po
      ON po.product_id = p.id AND po.organization_id = p_organization_id
    WHERE p.is_deleted = false
      AND p.deleted_at IS NULL
      AND p.status <> 'draft'::public.product_status
      AND (p_category_id IS NULL OR p.category_id = ANY(v_category_ids) OR p.subcategory_id = ANY(v_category_ids))
    ON CONFLICT (product_id, warehouse_id) DO NOTHING;

    -- Tem de ser JÁ: o INSERT seguinte sobrepõe o ROW_COUNT (D13).
    GET DIAGNOSTICS v_stock_rows_created = ROW_COUNT;

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
    LEFT JOIN public.stocks s
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
        v_msg := 'Não há produtos desta categoria no catálogo desta organização, '
              || 'por isso não há nada para contar. Escolha outra categoria ou '
              || 'crie a contagem inicial sem filtro de categoria. '
              || 'Produtos apagados e em rascunho nunca entram numa contagem.';
      ELSE
        v_msg := 'O catálogo desta organização não tem produtos para contar. '
              || 'Crie ou importe produtos antes de iniciar a contagem inicial. '
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
