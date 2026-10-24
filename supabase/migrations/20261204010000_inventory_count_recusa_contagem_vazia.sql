-- Inventário — rpc_create_inventory_count recusa criar uma contagem VAZIA.
--
-- Problema real que isto resolve
-- ------------------------------
-- rpc_create_inventory_count insere PRIMEIRO o cabeçalho em inventory_counts e
-- só DEPOIS semeia as linhas. Quando a semeadura não produz nenhuma linha, o
-- documento fica na mesma criado — vazio e inútil — e a função devolve
-- lines_seeded = 0 sem que nada avise o utilizador.
--
-- Aconteceu em produção: o armazém "ARMAZÉM LISBOA"
-- (b637c951-b701-41a9-8e52-4b1c32a8ea12, organização
-- d6e58e5c-dcc8-4915-b674-ac5aaa384016) tem ZERO linhas em public.stocks e 100
-- produtos no catálogo. O utilizador criou quatro contagens de ROTINA seguidas,
-- todas a 0/0, sem nenhuma mensagem que explicasse que naquele armazém o que
-- fazia falta era uma CONTAGEM INICIAL (semeada do catálogo, 20261204000000).
-- As quatro contagens já foram apagadas à mão.
--
-- Alteração ÚNICA desta migration: logo a seguir ao
-- "GET DIAGNOSTICS v_lines_seeded = ROW_COUNT", se v_lines_seeded = 0 a função
-- levanta exceção (ERRCODE = 'no_data_found') com uma mensagem que diz ao
-- utilizador O QUE FAZER, diferente conforme o motivo real de não haver linhas.
-- Tudo o resto — validações de permissão, SECURITY DEFINER, search_path, os
-- dois ramos de semeadura, o jsonb devolvido — fica byte a byte igual.
--
-- Prerequisitos: 20261204000000 (versão de 4 argumentos com p_initial),
-- 20261116020000 (inventory_counts, inventory_count_lines,
-- fn_next_inventory_count_number, permissão inventory.count).
--
-- Factos confirmados AO VIVO na base antes de escrever este ficheiro
-- (só leitura: pg_get_functiondef / pg_proc):
--
--   F1. A base recriada aqui é a definição VIVA de
--       rpc_create_inventory_count, extraída com pg_get_functiondef — NÃO o
--       ficheiro de migration. Regra do projeto: nunca reconstruir a partir de
--       um ficheiro antigo, que apagaria em silêncio correções posteriores.
--       Confirmado que a versão viva coincide com a aplicada por
--       20261204000000 (nenhuma correção intermédia a preservar).
--
--   F2. Existe exatamente UM overload:
--       rpc_create_inventory_count(uuid, uuid, uuid, boolean). A assinatura
--       NÃO muda nesta migration, por isso usa-se CREATE OR REPLACE SEM DROP —
--       o ACL atual {authenticated, service_role} é preservado e não se cria
--       um segundo overload (o acidente do rpc_save_quote não se repete).
--
--   F3. public.fn_next_inventory_count_number(uuid) NÃO usa sequência: calcula
--       MAX(substring(document_number FROM 5)::integer) + 1 sobre
--       inventory_counts da organização e devolve 'INV-' || lpad(...,4,'0').
--       Isto é decisivo para a decisão D2: como não há nextval(), a exceção
--       NÃO queima número nenhum. Se um dia passar a sequência, o número
--       consumido nas chamadas recusadas fica gasto (buraco na numeração) — é
--       cosmético, mas fica registado aqui.
--
-- Decisões tomadas (documentadas para revisão)
-- --------------------------------------------
--
--   D1. A guarda vive DEPOIS da semeadura e não antes. Fazer uma contagem
--       prévia ("será que vai haver linhas?") obrigaria a duplicar as duas
--       queries de semeadura — duas fontes de verdade a divergir no primeiro
--       ajuste que alguém fizesse a uma delas. ROW_COUNT do INSERT que
--       realmente correu é, por construção, a resposta exata.
--
--   D2. A exceção aborta a função inteira e, com ela, a transação implícita da
--       chamada RPC: o INSERT do cabeçalho em inventory_counts feito acima é
--       REVERTIDO automaticamente pelo PostgreSQL. NENHUM documento fica
--       criado — era precisamente esse o defeito (4 cabeçalhos órfãos em
--       produção). Não é preciso DELETE nenhum, e fazer o rollback à mão seria
--       pior: obrigaria a apanhar a exceção e a perder o abort. Como
--       fn_next_inventory_count_number é MAX+1 e não sequência (F3), também
--       não sobra nenhum número de documento queimado.
--
--   D3. ERRCODE = 'no_data_found' (P0002), o mesmo já usado nesta função para
--       "Perfil de utilizador não encontrado". Não é um erro de validação de
--       input (o armazém e a categoria são válidos) nem uma violação de
--       regra — é mesmo ausência de dados para trabalhar.
--
--   D4. O EXISTS extra sobre stocks corre SÓ no caminho de erro, depois de já
--       se saber que não houve linhas. No caminho normal (a esmagadora
--       maioria) o custo é exatamente zero.
--
--   D5. Esse EXISTS replica o predicado do ramo de ROTINA SEM o filtro de
--       categoria — incluindo o JOIN a products e o p.is_deleted = false. É de
--       propósito: um armazém cujas únicas linhas de stocks apontam para
--       produtos apagados não tem, para efeitos de contagem, stock nenhum, e a
--       mensagem certa continua a ser "use a contagem inicial". Se o ramo de
--       rotina mudar de predicado, este EXISTS TEM de mudar com ele.
--
--   D6. No modo rotina, a combinação "sem categoria + o armazém tem stock" é
--       impossível: o EXISTS é a própria query de semeadura sem o filtro de
--       categoria, logo se ela devolve TRUE com p_category_id IS NULL então a
--       semeadura teria produzido linhas e não estaríamos aqui. A condição
--       está escrita como "p_category_id IS NOT NULL AND v_has_stock" para que,
--       num estado impossível, se caia na mensagem genérica em vez de acusar
--       uma categoria que não foi sequer indicada.
--
--   D7. As mensagens são texto corrido em português de Portugal, dirigidas ao
--       utilizador de armazém e sempre com a ação seguinte explícita (usar a
--       contagem inicial / mudar de categoria / criar produtos). Vão no
--       MESSAGE e não no HINT porque o frontend só mostra a mensagem do erro
--       devolvido pelo PostgREST.


-- ============================================================
-- rpc_create_inventory_count — recusa criar contagens vazias.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_create_inventory_count(
    p_organization_id uuid,
    p_warehouse_id    uuid,
    p_category_id     uuid DEFAULT NULL,
    p_initial         boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor        uuid;
  v_count_id     uuid;
  v_doc          text;
  v_lines_seeded integer;
  -- Novos, só usados no caminho de erro (D4).
  v_has_stock    boolean;
  v_msg          text;
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

  v_doc := public.fn_next_inventory_count_number(p_organization_id);

  INSERT INTO public.inventory_counts (
    organization_id, warehouse_id, category_id, document_number, status, started_at, created_by
  ) VALUES (
    p_organization_id, p_warehouse_id, p_category_id, v_doc, 'em_contagem', now(), v_actor
  )
  RETURNING id INTO v_count_id;

  IF COALESCE(p_initial, false) THEN
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
    -- linha de stocks na reciclagem tem de dar 0, não excluir o produto (D10).
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
      -- propósito — pode continuar fisicamente em prateleira (F4).
      AND p.status <> 'draft'::public.product_status
      AND (p_category_id IS NULL OR p.category_id = p_category_id);
  ELSE
    -- Contagem de ROTINA: comportamento original, inalterado — só entra o que
    -- o sistema julga ter em stocks neste armazém.
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
      AND (p_category_id IS NULL OR p.category_id = p_category_id);
  END IF;

  GET DIAGNOSTICS v_lines_seeded = ROW_COUNT;

  -- ---- ÚNICA alteração face à versão anterior desta função ----------------
  --
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
    'initial', COALESCE(p_initial, false)
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_create_inventory_count IS
  'Cria uma sessão de contagem física (inventory_counts, status=em_contagem) e '
  'semeia inventory_count_lines, em dois modos: '
  'p_initial=false (default, comportamento histórico) semeia a partir do saldo '
  'ATUAL de stocks (não histórico) para o armazém indicado — só entra o que o '
  'sistema julga ter; '
  'p_initial=true (contagem inicial) semeia a partir do CATÁLOGO de produtos da '
  'organização (via product_organizations, porque products.organization_id não '
  'é fiável), com LEFT JOIN a stocks: um produto sem stock neste armazém entra '
  'com system_quantity_at_start=0. Exclui produtos apagados e em rascunho '
  '(status=draft); inclui descontinuados, que podem continuar em prateleira. '
  'Em ambos os modos p_category_id filtra por products.category_id e '
  'system_quantity_at_start fica congelado no momento desta chamada. Exige '
  'inventory.count OU inventory.edit. '
  'Desde 20261204010000: se a semeadura não produzir NENHUMA linha, a função '
  'levanta no_data_found com a explicação e a ação recomendada (usar a contagem '
  'inicial quando o armazém não tem stock registado, mudar/limpar a categoria, '
  'ou criar produtos no catálogo) em vez de devolver lines_seeded=0. Como a '
  'exceção aborta a transação, o cabeçalho já inserido é revertido e NÃO fica '
  'nenhuma contagem vazia criada; o número de documento também não se perde, '
  'porque fn_next_inventory_count_number é MAX+1 e não uma sequência.';

REVOKE ALL ON FUNCTION public.rpc_create_inventory_count(uuid, uuid, uuid, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.rpc_create_inventory_count(uuid, uuid, uuid, boolean) TO authenticated;

-- ============================================================
-- Notas de verificação (para revisão humana, não executadas)
-- ============================================================
--
-- 1. Continua a existir exatamente UM overload, com o ACL intacto
--    (authenticated + service_role):
--      SELECT oid::regprocedure, proacl FROM pg_proc
--       WHERE proname = 'rpc_create_inventory_count';
--
-- 2. Caso que motivou a migration — armazém "ARMAZÉM LISBOA"
--    (b637c951-b701-41a9-8e52-4b1c32a8ea12, org
--    d6e58e5c-dcc8-4915-b674-ac5aaa384016), 0 linhas em stocks:
--      a) p_initial => false  → erro no_data_found a mandar usar a contagem
--         inicial, e SELECT count(*) FROM inventory_counts WHERE warehouse_id =
--         '...' NÃO aumenta (o cabeçalho é revertido).
--      b) p_initial => true   → cria normalmente, ~100 linhas a 0.
--
-- 3. O número de documento não se perde: depois de uma chamada recusada, a
--    contagem válida seguinte recebe exatamente o mesmo INV-NNNN que a
--    recusada teria recebido (fn_next_inventory_count_number é MAX+1).
--
-- 4. Regressão: num armazém COM stock, p_initial => false continua a criar a
--    contagem com o mesmo número de linhas de antes desta migration. O caminho
--    novo só é tocado quando v_lines_seeded = 0 — o EXISTS extra nem chega a
--    ser avaliado.
--
-- 5. Rotina com categoria sem stock, num armazém que TEM stock de outras
--    categorias → mensagem da categoria (não a da contagem inicial).
--
-- 6. Inicial com uma categoria vazia / organização sem produtos → as duas
--    mensagens do modo inicial, e igualmente sem documento criado.
