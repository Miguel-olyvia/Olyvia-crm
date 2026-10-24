-- Fase 5.4C do inventário — "Contagem inicial" (semear do catálogo em vez do
-- stock) + importação em massa de quantidades contadas por SKU.
--
-- Problema real que isto resolve
-- ------------------------------
-- rpc_create_inventory_count (20261116020000, secção 7) semeia as linhas da
-- sessão a partir de public.stocks. Isso é o correto para a contagem de
-- rotina — só se conta o que o sistema julga ter — mas torna impossível a
-- PRIMEIRA contagem de um armazém: se ainda não existe linha em stocks para
-- um produto (armazém acabado de abrir, ou artigo nunca movimentado), esse
-- produto simplesmente não aparece na folha de contagem e o operador não tem
-- como registar as unidades que tem fisicamente na prateleira.
--
-- Esta migration faz três coisas:
--
--   1. rpc_create_inventory_count ganha o parâmetro p_initial (default false).
--      Com p_initial = true a sessão é semeada a partir do CATÁLOGO DE
--      PRODUTOS da organização (todos os artigos), com o saldo de stocks
--      apanhado por LEFT JOIN quando existe e 0 quando não existe. Com
--      p_initial = false o comportamento é EXATAMENTE o de hoje, byte a byte.
--
--   2. rpc_bulk_update_inventory_count_lines — grava N quantidades contadas
--      numa só chamada, identificadas por SKU (é o que vem de um scanner ou
--      de um ficheiro CSV/Excel de contagem, não o uuid da linha). Tolerante
--      a erro por linha (SAVEPOINT implícito por elemento, mesmo padrão de
--      rpc_bulk_import_products, 20260826010000): uma linha inválida não
--      arrasta as outras.
--
--   3. rpc_resolve_inventory_count_line passa a CRIAR a linha de stocks em
--      falta (quantidade 0) em vez de rebentar com "Não existe stock deste
--      produto neste armazém". Sem este passo o ponto 1 é inútil: a contagem
--      inicial semeia precisamente os produtos SEM linha em stocks, e a
--      resolução 'ajustado' dessas linhas era impossível — ver secção 3.
--
-- Nada de RLS, tabelas, colunas ou permissões novas — as duas RPCs usam as
-- permissões que já existem (inventory.count / inventory.edit) e continuam a
-- ser SECURITY DEFINER com search_path fixo.
--
-- Prerequisitos: 20261116020000 (inventory_counts, inventory_count_lines,
-- rpc_create_inventory_count, rpc_update_inventory_count_line_quantity,
-- permissão inventory.count), 20260615130000 (products,
-- product_organizations, stocks, warehouses, has_anew_permission,
-- get_user_visible_org_ids, current_business_user_id).
--
-- Factos confirmados AO VIVO na base antes de escrever este ficheiro
-- (só leitura, pg_constraint / pg_indexes / pg_get_functiondef):
--
--   F1. A definição viva de rpc_create_inventory_count(uuid,uuid,uuid) é
--       idêntica à de 20261116020000:547-620 — nenhuma correção posterior a
--       preservar. É essa a base recriada aqui. Existe exatamente 1 overload.
--
--   F2. products.organization_id está a NULL/incoerente em produção e NÃO
--       serve para scoping por organização. A ligação real produto↔organização
--       é a tabela public.product_organizations (product_id, organization_id)
--       — é essa que o modo inicial usa.
--
--   F3. products.is_deleted e products.deleted_at estão 100% coerentes entre
--       si; o modo inicial filtra pelos dois (cinto e suspensórios).
--
--   F4. products.status é o enum public.product_status com os valores
--       active | discontinued | draft. O modo inicial exclui 'draft' (ainda
--       não é artigo de catálogo) e INCLUI 'discontinued' (um artigo
--       descontinuado pode perfeitamente continuar fisicamente em prateleira
--       e é precisamente isso que uma contagem inicial tem de apanhar).
--
--   F5. A definição viva de rpc_resolve_inventory_count_line(uuid,text,text)
--       foi extraída com pg_get_functiondef ANTES de escrever a secção 3 —
--       não foi reconstruída a partir de 20261116020000. Existe exatamente 1
--       overload. A única diferença da versão recriada aqui face à viva é o
--       bloco de criação da linha de stocks em falta; TUDO o resto (ordem das
--       validações, mensagens, ramos recontagem_pedida / aceite_sem_ajuste /
--       ajustado, jsonb devolvido) é byte a byte igual.
--
--   F6. Colunas NOT NULL de public.stocks SEM default (information_schema.
--       columns): product_id, warehouse_id, created_by, organization_id. São
--       exatamente as quatro que o INSERT da secção 3 preenche. As restantes
--       NOT NULL têm default (id=gen_random_uuid(), quantity=0,
--       minimum_quantity=0, maximum_quantity=0, reorder_point=0,
--       created_at=now(), updated_at=now()); location, last_counted,
--       deleted_at, deleted_by e average_cost são nullable.
--
--   F7. Triggers não internos de public.stocks: trg_audit_stocks (AFTER
--       INSERT/UPDATE/DELETE → fn_generic_entity_audit) e
--       update_stocks_updated_at (BEFORE UPDATE → update_updated_at_column).
--       Nenhum interfere com o INSERT da secção 3: o de updated_at só corre em
--       UPDATE, e o de auditoria tem "EXCEPTION WHEN OTHERS" no topo e à volta
--       do próprio INSERT no log — por construção nunca pode bloquear a DML
--       de origem. Não há trigger BEFORE INSERT em stocks nem CHECK constraint
--       nenhuma (só 3 FK, a PK e unique_product_warehouse).
--
--   F8. fn_stock_movements_apply (BEFORE INSERT em stock_movements) já sabe
--       lidar com a ausência de linha em stocks: faz INSERT ... ON CONFLICT
--       (product_id, warehouse_id) DO UPDATE. O movimento de ajuste em si
--       nunca foi o problema — o problema era só a guarda explícita da RPC,
--       que abortava antes de lá chegar (ver secção 3). Como 'ajuste_positivo'
--       é incremento, também não bate na rejeição de saldo insuficiente.
--
-- Decisões tomadas (documentadas para revisão)
-- --------------------------------------------
--
--   D9. O LEFT JOIN a stocks no modo inicial NÃO precisa de agregação. A
--       preocupação seria um produto ter mais do que uma linha de stocks para
--       o mesmo armazém: o LEFT JOIN duplicaria a linha e rebentaria o UNIQUE
--       inventory_count_lines_unique_product (inventory_count_id, product_id).
--       Verificado na base viva: public.stocks tem a constraint
--       "unique_product_warehouse" UNIQUE (product_id, warehouse_id) — índice
--       ÚNICO TOTAL, não parcial (não tem cláusula WHERE), logo vale também
--       para linhas com deleted_at IS NOT NULL. Não pode existir mais do que
--       uma linha de stocks por par (produto, armazém), com ou sem os filtros
--       extra de organização/soft-delete, portanto o LEFT JOIN direto produz
--       no máximo 1 linha por produto. Pela mesma razão product_organizations
--       tem UNIQUE (product_id, organization_id) — o JOIN a essa tabela também
--       não multiplica linhas. Agregar com SUM()/GROUP BY seria código morto a
--       esconder o dia em que essa unicidade desaparecesse; fica o JOIN direto
--       e este comentário. Se algum dia a constraint unique_product_warehouse
--       for removida (ex: stock por lote/localização), ESTA query tem de
--       passar a agregar.
--
--   D10. O modo inicial ignora deliberadamente o filtro de stocks
--        "s.deleted_at IS NULL" como critério de INCLUSÃO — ele está lá só no
--        LEFT JOIN, para que uma linha de stocks na reciclagem conte como
--        "sem saldo" (0) em vez de trazer uma quantidade que já foi apagada.
--        O universo de linhas é o catálogo, não o stock.
--
--   D11. rpc_bulk_update_inventory_count_lines exige SÓ inventory.count —
--        exatamente a mesma exigência de rpc_update_inventory_count_line_
--        quantity, de que esta função é a versão em lote. Não resolve
--        discrepâncias nem finaliza nada (isso continua a exigir
--        inventory.edit), por isso não faria sentido pedir mais.
--
--   D12. A lógica de escrita por linha é uma réplica fiel de
--        rpc_update_inventory_count_line_quantity (20261116020000:636-714),
--        incluindo as decisões D2 (recontar limpa a resolução anterior) e D3
--        (moved_during_count é cumulativo). Nada de lógica nova: se aquela
--        função mudar, esta tem de mudar com ela.
--
--   D13. Limite defensivo de 5000 linhas por chamada. Não é um limite de
--        negócio — é para que um payload absurdo (ou um bug do cliente em
--        loop) não segure uma transação aberta durante minutos. O frontend
--        deve partir ficheiros maiores em lotes.
--
--   D14. Na secção 3, a linha de stocks em falta é CRIADA com quantity = 0 em
--        vez de se tratar simplesmente NULL como 0. As duas abordagens dariam
--        o mesmo v_diff, mas criar a linha é o que deixa o sistema coerente
--        depois da contagem: (a) o SELECT ... FOR UPDATE volta a ter uma linha
--        real para bloquear, serializando ajustes concorrentes sobre o mesmo
--        par produto/armazém como em qualquer outro movimento; (b)
--        rpc_finalize_inventory_count escreve stocks.last_counted com um
--        UPDATE — sem linha, a marca de "contado em" perdia-se em silêncio
--        justamente nos produtos da contagem inicial; (c) se a diferença for
--        0 (contou 0 num produto sem stock) não se gera movimento nenhum, mas
--        a linha de stocks fica a existir com saldo 0, que é a verdade.
--
--   D15. Na secção 3 o INSERT novo NÃO filtra por organization_id nem por
--        deleted_at ao decidir se a linha existe — usa o mesmo predicado
--        (product_id, warehouse_id) da leitura que já lá estava, que é também
--        o da constraint unique_product_warehouse. Se existir uma linha
--        "na reciclagem" (deleted_at IS NOT NULL), o comportamento é o de
--        hoje: lê-se o saldo dessa linha e não se cria nada. Alterar isso
--        seria mudar semântica não pedida, e o ON CONFLICT DO NOTHING garante
--        que nunca se viola a unicidade.
--
--   D16. A resolução de SKU de rpc_bulk_update_inventory_count_lines passou de
--        duas varreduras completas da contagem POR LINHA DE FICHEIRO para UM
--        mapa construído uma única vez por chamada (secção 2). upper(btrim())
--        não usa idx_products_sku (btree simples sobre sku, sem índice
--        funcional equivalente — confirmado em pg_indexes), por isso cada
--        lookup era um scan de todas as linhas da sessão: numa contagem
--        inicial de milhares de produtos × 200 linhas por lote dava milhões de
--        comparações e o lote morria no statement_timeout do role
--        authenticated. O contrato de entrada/saída não muda nada.


-- ============================================================
-- 1. rpc_create_inventory_count — ganha p_initial (contagem inicial semeada
--    do catálogo). Tudo o resto fica exatamente como estava.
-- ============================================================

-- O DROP é OBRIGATÓRIO e tem de ficar nesta mesma migration: CREATE OR REPLACE
-- não substitui uma função quando a lista de parâmetros muda — criaria um
-- SEGUNDO overload rpc_create_inventory_count(uuid,uuid,uuid) a conviver com o
-- de 4 argumentos. O PostgREST passaria a ter de adivinhar qual chamar e
-- chamadas antigas continuariam a correr a versão sem p_initial. Já aconteceu
-- neste projeto com rpc_save_quote; não se repete.
DROP FUNCTION IF EXISTS public.rpc_create_inventory_count(uuid, uuid, uuid);

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
    -- (facto F2 do cabeçalho: essa coluna está a NULL/incoerente em produção).
    --
    -- LEFT JOIN direto a stocks, sem agregação: unique_product_warehouse
    -- garante no máximo 1 linha de stocks por (produto, armazém) — ver decisão
    -- D9 no cabeçalho. Se essa constraint algum dia cair, esta query TEM de
    -- passar a agregar (SUM(quantity) ... GROUP BY product_id) ou duplica
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
  'inventory.count OU inventory.edit.';

REVOKE ALL ON FUNCTION public.rpc_create_inventory_count FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.rpc_create_inventory_count TO authenticated;

-- ============================================================
-- 2. rpc_bulk_update_inventory_count_lines — grava N quantidades contadas por
--    SKU numa só chamada, tolerante a erro por linha. Exige só inventory.count
--    (mesma exigência de rpc_update_inventory_count_line_quantity, D11).
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_bulk_update_inventory_count_lines(
    p_inventory_count_id uuid,
    p_lines              jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.count') THEN
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
$$;

COMMENT ON FUNCTION public.rpc_bulk_update_inventory_count_lines IS
  'Versão em lote de rpc_update_inventory_count_line_quantity: grava N '
  'quantidades contadas numa sessão de contagem, identificadas por SKU '
  '(comparação insensível a maiúsculas e a espaços) em vez do uuid da linha — '
  'é o que vem de um scanner ou de um ficheiro de contagem. p_lines é um array '
  'jsonb de {"sku","counted_quantity","input_index"}. Devolve '
  '{"updated","failed","results"[]} com UMA entrada por linha de entrada '
  '(status ok|error, com a mensagem em error), nunca só as falhadas. Erros de '
  'validação (SKU em falta, quantidade inválida, produto não encontrado nesta '
  'contagem, SKU ambíguo) são isolados por linha via SAVEPOINT implícito — não '
  'abortam o resto do lote. A sessão tem de estar em_contagem e a escrita por '
  'linha é idêntica à da versão unitária (counted_quantity/counted_by/'
  'counted_at, moved_during_count cumulativo face ao saldo ao vivo, limpeza de '
  'resolução anterior). Máximo 5000 linhas por chamada. Exige só '
  'inventory.count — resolver/finalizar continua a exigir inventory.edit.';

REVOKE ALL ON FUNCTION public.rpc_bulk_update_inventory_count_lines(uuid, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.rpc_bulk_update_inventory_count_lines(uuid, jsonb) TO authenticated;

-- ============================================================
-- 3. rpc_resolve_inventory_count_line — cria a linha de stocks em falta em vez
--    de rebentar. SEM ISTO A SECÇÃO 1 NÃO SERVE PARA NADA.
-- ============================================================
--
-- O beco sem saída que isto desfaz
-- --------------------------------
-- A contagem inicial (secção 1) semeia de propósito produtos que NÃO têm linha
-- em public.stocks para este armazém, com system_quantity_at_start = 0. O
-- operador conta 50 unidades → counted_quantity (50) <> snapshot (0) → a linha
-- exige resolução. Mas a versão viva de rpc_resolve_inventory_count_line fazia:
--
--     SELECT quantity INTO v_live_qty FROM public.stocks
--      WHERE product_id = ... AND warehouse_id = ... FOR UPDATE;
--     IF v_live_qty IS NULL THEN
--       RAISE EXCEPTION 'Não existe stock deste produto neste armazém';
--     END IF;
--
-- ...e é precisamente esse o caso. A resolução 'ajustado' rebentava sempre. E
-- como rpc_finalize_inventory_count recusa finalizar enquanto houver linhas com
-- counted_quantity <> system_quantity_at_start AND discrepancy_resolution IS
-- NULL, a sessão inteira ficava presa: não se podia ajustar nem fechar. Restava
-- 'aceite_sem_ajuste' — que resolve a linha mas NÃO cria o stock, ou seja, a
-- contagem inicial não conseguia dar entrada de stock nenhum. A feature era
-- inútil como estava.
--
-- A correção é mínima e cirúrgica: quando não existe linha de stocks, cria-se
-- uma a zero e relê-se. A partir daí tudo segue o caminho normal — v_diff = 50,
-- movimento 'ajuste_positivo' de 50, e fn_stock_movements_apply põe o saldo a
-- 50 (F8). A exceção original mantém-se como rede de segurança: só dispara se
-- depois do INSERT + releitura ainda não houver linha (cenário que só é
-- possível sob isolamento REPEATABLE READ/SERIALIZABLE, e aí é mesmo para
-- falhar alto em vez de ajustar contra um saldo imaginado).
--
-- Base: definição VIVA extraída com pg_get_functiondef (F5), não o ficheiro de
-- migration antigo — regra do projeto, para não apagar em silêncio correções
-- posteriores. Tudo o resto fica byte a byte igual.
--
-- CREATE OR REPLACE sem DROP: a assinatura (uuid, text, text) não muda, logo o
-- ACL atual é preservado e não se cria overload nenhum. O REVOKE/GRANT abaixo é
-- redundante de propósito — deixa explícito no ficheiro quem pode executar.

CREATE OR REPLACE FUNCTION public.rpc_resolve_inventory_count_line(
    p_line_id    uuid,
    p_resolution text,
    p_notes      text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
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
$$;

COMMENT ON FUNCTION public.rpc_resolve_inventory_count_line(uuid, text, text) IS
  'Resolve uma linha com diferença: ajustado (gera stock_movement de ajuste a '
  'partir do saldo AO VIVO, reference_id=linha da contagem, mesma numeração '
  'NE-A-NNNN de rpc_adjust_stock), aceite_sem_ajuste (resolution_notes '
  'obrigatório no servidor) ou recontagem_pedida (reset completo da linha). '
  'Exige inventory.edit — separado de inventory.count '
  '(rpc_update_inventory_count_line_quantity), que só regista a quantidade '
  'contada. Desde 20261204000000: se não existir linha em public.stocks para o '
  'par (produto, armazém), ajustado CRIA-A a zero (INSERT ... ON CONFLICT '
  '(product_id, warehouse_id) DO NOTHING) e ajusta a partir daí, em vez de '
  'rebentar com "Não existe stock deste produto neste armazém" — é o caso '
  'normal da contagem INICIAL de um armazém novo, em que os produtos são '
  'semeados do catálogo e ainda não têm saldo. A exceção só se mantém se, '
  'mesmo depois disso, continuar a não haver linha.';

REVOKE ALL ON FUNCTION public.rpc_resolve_inventory_count_line(uuid, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.rpc_resolve_inventory_count_line(uuid, text, text) TO authenticated;

-- ============================================================
-- Notas de verificação (para revisão humana, não executadas)
-- ============================================================
--
-- 1. Depois desta migration existe exatamente UM overload de
--    rpc_create_inventory_count (4 argumentos):
--      SELECT oid::regprocedure FROM pg_proc
--       WHERE proname = 'rpc_create_inventory_count';
--
-- 2. rpc_create_inventory_count(..., p_initial => false) semeia o mesmo número
--    de linhas que antes desta migration para o mesmo armazém/categoria
--    (comportamento histórico intacto).
--
-- 3. rpc_create_inventory_count(..., p_initial => true) num armazém vazio
--    semeia 1 linha por produto do catálogo da organização (status <> draft,
--    não apagado), todas com system_quantity_at_start = 0, e nunca viola
--    inventory_count_lines_unique_product.
--
-- 4. rpc_bulk_update_inventory_count_lines com um lote misto (1 SKU válido,
--    1 inexistente, 1 com quantidade negativa) devolve updated=1, failed=2 e
--    3 entradas em results; a linha válida fica de facto gravada.
--
-- 5. A mesma chamada numa contagem já finalizada é rejeitada por inteiro
--    (check_violation) antes de gravar seja o que for.
--
-- 6. Fluxo completo da contagem inicial, ponta a ponta, num armazém sem UMA
--    ÚNICA linha em stocks (era isto que estava partido):
--      a) rpc_create_inventory_count(..., p_initial => true)
--      b) rpc_bulk_update_inventory_count_lines com counted_quantity = 50
--         para um SKU cujo system_quantity_at_start é 0
--      c) rpc_resolve_inventory_count_line(<linha>, 'ajustado')
--         → devolve adjusted_quantity=50, balance_after=50, stock_movement_id
--           não nulo, e passa a existir 1 linha em public.stocks com
--           quantity=50 (antes desta migration: no_data_found)
--      d) rpc_finalize_inventory_count → status finalizada, e a linha de
--         stocks criada em (c) fica com last_counted preenchido.
--
-- 7. rpc_resolve_inventory_count_line continua a ter exatamente UM overload
--    (uuid, text, text) e a manter o ACL (authenticated + service_role):
--      SELECT oid::regprocedure, proacl FROM pg_proc
--       WHERE proname = 'rpc_resolve_inventory_count_line';
--
-- 8. Regressão da secção 3: com linha de stocks já existente, 'ajustado',
--    'aceite_sem_ajuste' e 'recontagem_pedida' comportam-se exatamente como
--    antes — o ramo novo só é tocado quando v_live_qty IS NULL.
--
-- 9. Desempenho da secção 2: um lote de 200 SKUs numa contagem com vários
--    milhares de linhas tem de correr em segundos, não bater no
--    statement_timeout. O plano do lookup no ciclo deve ser um Index Scan
--    sobre o índice de pg_temp._olyvia_bulk_icl_sku_map (k), e o scan de
--    inventory_count_lines deve aparecer UMA só vez em toda a chamada.
--
-- 10. Duas chamadas a rpc_bulk_update_inventory_count_lines dentro da MESMA
--     transação (DO $$ BEGIN PERFORM ...; PERFORM ...; END $$) não podem
--     falhar com "relation _olyvia_bulk_icl_sku_map already exists" — é para
--     isso que serve o DROP TABLE IF EXISTS no início.
