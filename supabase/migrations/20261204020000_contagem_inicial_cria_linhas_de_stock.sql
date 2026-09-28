-- Inventário — a CONTAGEM INICIAL passa a criar as linhas de public.stocks em
-- falta (a zero) para os produtos que semeia.
--
-- Problema real que isto resolve
-- ------------------------------
-- Uma empresa que entra no sistema mete o catálogo todo de uma vez — 3000
-- produtos não é exagero nenhum. Hoje, nenhum desses produtos tem linha em
-- public.stocks para o armazém, e não há forma de as criar senão à mão, uma a
-- uma. Isso é trabalho impossível e, pior, é trabalho ERRADO: a lista de stock
-- de um armazém é, no essencial, a lista de produtos do catálogo — o que a
-- distingue é o histórico de movimentos. O stock deve NASCER da leitura do
-- catálogo, com saldo 0, e as quantidades entram depois, pela contagem.
--
-- A contagem inicial (20261204000000) já semeia as LINHAS DA CONTAGEM a partir
-- do catálogo, mas as linhas de stocks só nascem uma a uma, quando alguém
-- resolve uma discrepância como 'ajustado' (secção 3 dessa mesma migration).
-- Quem não conta um produto, ou quem conta e a diferença dá 0, nunca gera
-- linha de stocks nenhuma.
--
-- Foi exatamente isso que se viu em produção: a contagem INV-0002 do armazém
-- "ARMAZÉM LISBOA" (b637c951-b701-41a9-8e52-4b1c32a8ea12, organização
-- d6e58e5c-dcc8-4915-b674-ac5aaa384016) foi finalizada sem nada contado. O
-- armazém ficou com ZERO linhas em stocks, e todas as contagens de ROTINA
-- seguintes davam 0/0 — porque a rotina semeia de stocks e stocks estava
-- vazio. A contagem inicial tinha sido feita e, mesmo assim, o armazém
-- continuava a não existir para o sistema.
--
-- Alteração ÚNICA desta migration: no ramo p_initial = true, e SÓ nesse, antes
-- de semear inventory_count_lines, cria-se em public.stocks a linha em falta,
-- com quantity = 0, para EXATAMENTE os mesmos produtos que vão ser semeados.
-- O número de linhas criadas volta no jsonb como 'stock_rows_created'.
-- Tudo o resto — validações de permissão, SECURITY DEFINER, search_path, o
-- ramo de ROTINA, a semeadura das linhas da contagem, a guarda que recusa
-- contagens vazias, REVOKE/GRANT — fica byte a byte igual.
--
-- Prerequisitos: 20261204010000 (guarda das contagens vazias),
-- 20261204000000 (versão de 4 argumentos com p_initial),
-- 20261116020000 (inventory_counts, inventory_count_lines,
-- fn_next_inventory_count_number, permissão inventory.count).
--
-- Factos confirmados AO VIVO na base antes de escrever este ficheiro
-- (só leitura: pg_get_functiondef / information_schema.columns /
-- pg_constraint / pg_trigger / pg_class), a continuar a numeração de
-- 20261204010000:
--
--   F4. A base recriada aqui é a definição VIVA de
--       rpc_create_inventory_count, extraída com pg_get_functiondef — NÃO um
--       ficheiro de migration. Regra do projeto: nunca reconstruir a partir de
--       um ficheiro antigo, que apagaria em silêncio correções posteriores.
--       Confirmado que a versão viva é, caracter a caracter, a aplicada por
--       20261204010000: tem os dois ramos de semeadura (rotina/inicial) E a
--       guarda que recusa a contagem que ficaria com 0 linhas. As duas coisas
--       mantêm-se intactas aqui. Continua a existir exatamente 1 overload,
--       (uuid, uuid, uuid, boolean), por isso CREATE OR REPLACE SEM DROP — o
--       ACL é preservado e não se cria um segundo overload.
--
--   F5. Colunas NOT NULL de public.stocks SEM default
--       (information_schema.columns): product_id, warehouse_id, created_by,
--       organization_id. São exatamente as quatro que o INSERT novo preenche.
--       As restantes NOT NULL têm default: id = gen_random_uuid(),
--       quantity = 0, minimum_quantity = 0, maximum_quantity = 0,
--       reorder_point = 0, created_at = now(), updated_at = now(). São
--       nullable: location, last_counted, deleted_at, deleted_by,
--       average_cost. O INSERT não precisa de mais nada.
--
--   F6. public.stocks tem a constraint unique_product_warehouse UNIQUE
--       (product_id, warehouse_id) — índice único TOTAL, sem cláusula WHERE,
--       logo vale também para linhas com deleted_at IS NOT NULL. É o alvo
--       correto (e o único possível) do ON CONFLICT.
--
--   F7. Triggers não internos de public.stocks: trg_audit_stocks (AFTER
--       INSERT/UPDATE/DELETE FOR EACH ROW → fn_generic_entity_audit) e
--       update_stocks_updated_at (BEFORE UPDATE FOR EACH ROW → irrelevante num
--       INSERT). Não há BEFORE INSERT nem CHECK constraint nenhuma (só 3 FK, a
--       PK e unique_product_warehouse). O de auditoria tem EXCEPTION WHEN
--       OTHERS à volta do próprio INSERT no log — por construção não pode
--       fazer falhar a DML de origem.
--
--   F8. Os alertas de stock baixo só disparam com reorder_point > 0; o código
--       trata reorder_point = 0 como "nunca configurado". As linhas criadas
--       aqui nascem com o default 0, portanto NÃO há risco de enxurrada de
--       notificações ao criar 3000 linhas de uma vez.
--
--   F9. public.stocks tem RLS ativa mas NÃO forçada (relrowsecurity = true,
--       relforcerowsecurity = false) e o dono da tabela é postgres, o mesmo
--       dono desta função. Como a função é SECURITY DEFINER, o INSERT corre
--       como postgres e não é filtrado por RLS — as validações de organização
--       e de permissão que já estão no topo da função continuam a ser a única
--       (e a verdadeira) barreira de acesso.
--
--  F10. Volume real hoje em produção, com o predicado exato usado abaixo e sem
--       filtro de categoria: a maior organização tem 2216 produtos de
--       catálogo; as outras três têm 100, 46 e 31. A ordem de grandeza dos
--       3000 do enunciado é, portanto, realista a curto prazo — ver D14.
--
-- Decisões tomadas (documentadas para revisão), a continuar a numeração de
-- 20261204010000
-- --------------------------------------------------------------------------
--
--   D8. As linhas de stocks só nascem no ramo p_initial = true. No ramo de
--       ROTINA seria errado: a rotina existe para contar o que o sistema julga
--       ter, e criar linhas a 0 mudava-lhe o universo em silêncio (e faria a
--       guarda de 20261204010000 deixar de recusar o caso que a motivou —
--       armazém sem stock nenhum — porque passaria a haver sempre linhas).
--       No ramo de rotina esta migration não toca em absolutamente nada.
--
--   D9. O predicado do INSERT em stocks é uma CÓPIA EXATA do WHERE do SELECT
--       que semeia as linhas da contagem no ramo inicial:
--           JOIN product_organizations (scoping por organização — F2 de
--             20261204000000: products.organization_id não é fiável)
--           p.is_deleted = false
--           p.deleted_at IS NULL
--           p.status <> 'draft'::public.product_status
--           (p_category_id IS NULL OR p.category_id = p_category_id)
--       Isto NÃO é acidental e não pode divergir: se o INSERT apanhasse menos
--       produtos do que a semeadura, a contagem ficava com linhas sem stock
--       correspondente — exatamente o defeito que esta migration corrige. Se
--       um dia o predicado da semeadura mudar, ESTE tem de mudar com ele, na
--       mesma migration. O INSERT não leva o LEFT JOIN a stocks porque não
--       precisa do saldo; o ON CONFLICT trata das linhas que já existem.
--
--  D10. ON CONFLICT (product_id, warehouse_id) DO NOTHING, nunca DO UPDATE. O
--       objetivo é criar o que falta, jamais mexer no que existe: uma linha com
--       saldo real não pode ser posta a 0 por se ter criado uma contagem, e uma
--       linha na reciclagem (deleted_at IS NOT NULL) não é ressuscitada — é o
--       mesmo critério de D15 de 20261204000000, que decide a existência só por
--       (product_id, warehouse_id), o par da constraint (F6).
--
--  D11. O INSERT corre ANTES da semeadura de inventory_count_lines. É preciso
--       que corra antes para que o GET DIAGNOSTICS de v_lines_seeded, que está
--       fora do IF, continue a ler o ROW_COUNT do INSERT das LINHAS e não o
--       deste — a guarda das contagens vazias depende disso e não podia mudar.
--       Se a guarda disparar mesmo assim (catálogo vazio ⇒ o INSERT em stocks
--       também não criou nada), a exceção aborta a transação e reverte tudo:
--       não fica cabeçalho, não ficam linhas, não ficam linhas de stocks.
--
--  D12. O COALESCE(s.quantity, 0) da semeadura FICA COMO ESTÁ, e o LEFT JOIN
--       também. É verdade que, para a esmagadora maioria dos produtos, o LEFT
--       JOIN passa agora a encontrar sempre linha (a recém-criada, a 0) e o
--       resultado é idêntico ao de hoje — 0 tanto pelo COALESCE como pela
--       linha nova. Mas há dois casos em que o ON CONFLICT não cria nada E o
--       LEFT JOIN continua a não encontrar linha, porque o JOIN filtra por
--       s.organization_id e s.deleted_at IS NULL e a constraint não:
--         (a) linha de stocks na reciclagem (deleted_at IS NOT NULL);
--         (b) linha de stocks com outro organization_id para o mesmo par
--             produto/armazém (incoerência de dados).
--       Nesses dois casos s.quantity vem NULL e é o COALESCE que salva o
--       NOT NULL de system_quantity_at_start. Simplificar seria trocar um
--       COALESCE grátis por uma exceção em produção: não se simplifica.
--
--  D13. v_stock_rows_created é lido com GET DIAGNOSTICS IMEDIATAMENTE a seguir
--       ao INSERT em stocks — se ficasse para depois, o INSERT das linhas da
--       contagem já teria sobreposto o ROW_COUNT. A variável é declarada
--       inicializada a 0 para que o ramo de ROTINA devolva
--       'stock_rows_created': 0 em vez de null, e o valor é sempre "linhas
--       CRIADAS", não "linhas existentes": num armazém já em uso, uma contagem
--       inicial devolve 0 e isso é o correto.
--
--  D14. Volume: numa organização de 3000 produtos isto insere até 3000 linhas
--       em stocks mais outros tantos registos de auditoria (F7), na mesma
--       transação que já insere 3000 linhas de inventory_count_lines. NÃO se
--       implementa lote nem limite nesta migration — é uma decisão que precisa
--       de aprovação, e partir isto em lotes obrigaria a abdicar da
--       atomicidade (ver o relatório). A grandeza atual é 2216 linhas no pior
--       caso (F10), o que um INSERT ... SELECT resolve muito abaixo do
--       statement_timeout; o risco real só aparece na ordem das dezenas de
--       milhar.
--
--  D15. As linhas nascem a quantity = 0 e não com a quantidade contada. A
--       contagem inicial é criada ANTES de se contar seja o que for — não há
--       quantidade nenhuma para escrever neste momento. As quantidades
--       continuam a entrar pelo caminho de sempre: resolução da discrepância
--       como 'ajustado' (que gera o movimento de stock e o histórico) e
--       finalização da contagem. Esta migration cria a prateleira vazia; quem
--       lá põe as unidades continua a ser a contagem, com rasto.


-- ============================================================
-- rpc_create_inventory_count — a contagem inicial cria as linhas de stocks
-- em falta, a zero, para os produtos que semeia.
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
  -- Só usados no caminho de erro (D4).
  v_has_stock    boolean;
  v_msg          text;
  -- Novo: linhas de public.stocks criadas pela contagem inicial. Inicializada
  -- a 0 para que o ramo de ROTINA devolva 0 e não null (D13).
  v_stock_rows_created integer := 0;
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
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
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
      AND (p_category_id IS NULL OR p.category_id = p_category_id);
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
      AND (p_category_id IS NULL OR p.category_id = p_category_id);
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
  'porque fn_next_inventory_count_number é MAX+1 e não uma sequência. '
  'Desde 20261204020000: no modo p_initial=true (e SÓ nesse) a função cria '
  'primeiro, em public.stocks, as linhas em falta a quantity=0 para exatamente '
  'os mesmos produtos que vai semear (mesmo predicado; ON CONFLICT '
  '(product_id, warehouse_id) DO NOTHING, nunca DO UPDATE — não mexe em linhas '
  'existentes nem ressuscita linhas apagadas). É assim que o stock de um '
  'armazém novo nasce da leitura do catálogo em vez de ser criado à mão produto '
  'a produto, e é o que impede um armazém de ficar com 0 linhas em stocks '
  'depois de uma contagem inicial finalizada sem nada contado. As linhas nascem '
  'com reorder_point=0, que o sistema de alertas trata como "nunca '
  'configurado", por isso não geram notificações. O jsonb devolvido ganha a '
  'chave stock_rows_created com o número de linhas de stocks criadas nesta '
  'chamada (0 no modo rotina).';

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
--    d6e58e5c-dcc8-4915-b674-ac5aaa384016), hoje com 0 linhas em stocks e 100
--    produtos de catálogo:
--      a) p_initial => true  → devolve lines_seeded = 100 e
--         stock_rows_created = 100, e
--           SELECT count(*) FROM public.stocks
--            WHERE warehouse_id = 'b637c951-...'
--         passa de 0 para 100, todas com quantity = 0 e reorder_point = 0.
--      b) repetir a) logo a seguir → lines_seeded = 100 e
--         stock_rows_created = 0 (já existiam todas), sem alterar nenhuma
--         quantidade das linhas que lá estão.
--      c) só depois de a), p_initial => false passa a criar contagem de rotina
--         com 100 linhas, em vez de dar o erro no_data_found. É esta a
--         mudança de comportamento visível ao utilizador.
--
-- 3. As duas queries do ramo inicial têm de continuar a devolver o MESMO
--    conjunto de produtos (D9). Verificação direta, para uma org/armazém:
--      SELECT count(*) FROM public.products p
--        JOIN public.product_organizations po
--          ON po.product_id = p.id AND po.organization_id = '<org>'
--       WHERE p.is_deleted = false AND p.deleted_at IS NULL
--         AND p.status <> 'draft'::public.product_status;
--    tem de bater certo com lines_seeded de uma contagem inicial sem
--    categoria.
--
-- 4. Regressão do ramo de ROTINA: num armazém COM stock, p_initial => false
--    continua a criar exatamente as mesmas linhas de antes desta migration, e
--    NÃO cria nenhuma linha de stocks (stock_rows_created = 0).
--
-- 5. Regressão da guarda de 20261204010000: numa organização sem produtos de
--    catálogo, p_initial => true continua a levantar no_data_found e, além do
--    cabeçalho, também não deixa linhas de stocks (não chegou a criar
--    nenhuma).
--
-- 6. Uma linha de stocks preexistente com saldo real NÃO é alterada por uma
--    contagem inicial: ON CONFLICT ... DO NOTHING (D10). Confirmar com
--    SELECT quantity, updated_at antes e depois — updated_at nem sequer muda,
--    porque update_stocks_updated_at só corre em UPDATE (F7).
