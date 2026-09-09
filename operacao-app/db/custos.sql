-- ============================================================
--  Operações — o que se gastou mesmo
-- ============================================================
--  Correr DEPOIS de todos os outros.
--
--  A mão de obra já se calculava sozinha, das sessões de trabalho. O material
--  não: a tabela `ops_custo` existia e não havia forma de lá meter nada. Isso
--  fazia a comparação "orçamentei X, gastei quanto?" contar só metade — e uma
--  análise financeira que conta metade é pior do que não ter nenhuma, porque
--  dá confiança a um número errado.
--
--  Duas ligações ao CRM, ambas SÓ DE LEITURA:
--
--   · `catalog_items` — o mesmo catálogo que os orçamentos usam. Escolher o
--     item do catálogo em vez de escrever à mão é o que permite comparar
--     LINHA A LINHA: "orçamentaste 2 louças a 50 €, gastaste 2 a 62,50 €".
--     Com texto livre, só se comparam totais — e um total igual pode esconder
--     um material que ficou barato e outro que disparou.
--
--   · `purchase_order_items` — a compra a sério, com o preço que o
--     fornecedor cobrou. É opcional: serve para dizer "este material veio da
--     compra PO-123", e traz o preço real em vez do preço de tabela.
--
--  Escreve fora de `ops_*`? NÃO. Lê `catalog_items`, `purchase_orders` e
--  `purchase_order_items`, e não lhes toca.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. De onde veio este custo
-- ============================================================

ALTER TABLE public.ops_custo
  -- → catalog_items.id, sem FK. É o que ata o gasto ao orçamento.
  ADD COLUMN IF NOT EXISTS catalog_item_id uuid,
  -- → purchase_order_items.id, sem FK. Opcional: a compra concreta.
  ADD COLUMN IF NOT EXISTS compra_linha_id uuid,
  ADD COLUMN IF NOT EXISTS unidade text,
  ADD COLUMN IF NOT EXISTS criado_por uuid;

CREATE INDEX IF NOT EXISTS ops_custo_catalogo_idx
  ON public.ops_custo (catalog_item_id) WHERE catalog_item_id IS NOT NULL;

-- A origem ganha mais um valor. O CHECK antigo só conhecia três.
ALTER TABLE public.ops_custo DROP CONSTRAINT IF EXISTS ops_custo_origem_check;
ALTER TABLE public.ops_custo
  ADD CONSTRAINT ops_custo_origem_check
  CHECK (origem IN ('calculado','manual','inventario','catalogo','compra'));


-- ============================================================
-- 2. Preencher o catálogo no previsto que já existe
-- ============================================================
-- As obras criadas antes deste ficheiro não têm `catalog_item_id`. Vai-se
-- buscá-lo à linha de orçamento de onde vieram, que o guarda.

UPDATE public.ops_ordem_previsto p
   SET catalog_item_id = l.catalog_item_id
  FROM public.quote_lines l
 WHERE l.id = p.quote_line_id
   AND p.catalog_item_id IS NULL
   AND l.catalog_item_id IS NOT NULL;


-- ============================================================
-- 3. O catálogo, visto de Operações
-- ============================================================
-- `security_invoker` obrigatório: sem ele, a vista mostraria o catálogo de
-- todas as organizações a quem a abrisse.

CREATE OR REPLACE VIEW public.ops_v_catalogo
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.organization_id,
  COALESCE(nullif(btrim(c.item_code), ''), '—')      AS codigo,
  COALESCE(nullif(btrim(c.descricao), ''), 'Sem descrição') AS descricao,
  c.categoria,
  c.subcategoria,
  c.tipo,
  COALESCE(c.custo_material, 0)::numeric(12,2)       AS custo_material,
  COALESCE(c.custo_mao_obra, 0)::numeric(12,2)       AS custo_mao_obra,
  (COALESCE(c.custo_material, 0) + COALESCE(c.custo_mao_obra, 0))::numeric(12,2) AS custo_total
FROM public.catalog_items c
WHERE c.ativo IS NOT false;

REVOKE ALL ON public.ops_v_catalogo FROM PUBLIC, anon;
GRANT SELECT ON public.ops_v_catalogo TO authenticated, service_role;


-- ============================================================
-- 4. As compras, vistas de Operações
-- ============================================================
-- Uma linha de compra é "comprámos 2 louças a 62,50 € ao fornecedor X". A
-- compra NÃO sabe para que obra é — não tem cliente, nem local, nem trabalho
-- associado. Por isso não se atribui sozinha: alguém escolhe a linha ao
-- lançar o custo, e é essa pessoa que sabe onde o material foi parar.

CREATE OR REPLACE VIEW public.ops_v_compra_linha
WITH (security_invoker = true) AS
SELECT
  i.id,
  p.organization_id,
  p.id                                              AS compra_id,
  COALESCE(nullif(btrim(p.order_number), ''), '—')  AS numero,
  p.order_date                                      AS data,
  p.status                                          AS estado,
  i.description                                     AS descricao,
  i.sku,
  i.item_type                                       AS tipo,
  COALESCE(i.quantity, 1)::numeric(12,3)            AS quantidade,
  COALESCE(i.unit_price, 0)::numeric(12,2)          AS preco_unit,
  COALESCE(i.total_price, 0)::numeric(12,2)         AS total,
  -- Quanto desta linha já foi lançado em ordens de trabalho. Sem isto, o
  -- mesmo material entrava em duas obras e o custo aparecia a dobrar.
  COALESCE((
    SELECT sum(c.quantidade) FROM public.ops_custo c WHERE c.compra_linha_id = i.id
  ), 0)::numeric(12,3)                              AS ja_atribuido
FROM public.purchase_order_items i
JOIN public.purchase_orders p ON p.id = i.purchase_order_id;

REVOKE ALL ON public.ops_v_compra_linha FROM PUBLIC, anon;
GRANT SELECT ON public.ops_v_compra_linha TO authenticated, service_role;


-- ============================================================
-- 5. Lançar um custo
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_ops_lancar_custo(
  p_ordem_id        uuid,
  p_tipo            text,
  p_descricao       text,
  p_quantidade      numeric DEFAULT 1,
  p_valor_unit      numeric DEFAULT 0,
  p_unidade         text    DEFAULT NULL,
  p_catalog_item_id uuid    DEFAULT NULL,
  p_compra_linha_id uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user   uuid;
  v_funcao text;
  v_o      record;
  v_desc   text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_qt     numeric(12,3) := COALESCE(p_quantidade, 1);
  v_unit   numeric(12,2) := COALESCE(p_valor_unit, 0);
  v_origem text := 'manual';
  v_id     uuid;
  v_livre  numeric(12,3);
BEGIN
  SELECT * INTO v_o FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_o.organization_id) q;

  -- Lançar custos é mexer em dinheiro. Executar uma ordem não chega.
  IF NOT (
    public.is_system_admin_user(auth.uid())
    OR public.has_anew_permission(auth.uid(), 'operations.costs.view')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para mexer em custos.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_o.estado IN ('confirmada','cancelada') THEN
    RAISE EXCEPTION 'Não se lançam custos numa ordem % — o processo está encerrado.',
      replace(v_o.estado, '_', ' ');
  END IF;

  -- A mão de obra é calculada das sessões de trabalho. Lançá-la à mão daria
  -- dois números a dizer a mesma coisa, e o recálculo apagaria um deles.
  IF p_tipo = 'mao_obra' THEN
    RAISE EXCEPTION
      'A mão de obra sai das sessões de trabalho e do custo/hora de cada pessoa. Não se lança à mão.';
  END IF;

  IF p_tipo NOT IN ('material','servico','outro') THEN
    RAISE EXCEPTION 'Tipo de custo inválido: %. Vale material, servico ou outro.', p_tipo;
  END IF;

  IF v_qt <= 0 THEN
    RAISE EXCEPTION 'A quantidade tem de ser maior do que zero.';
  END IF;

  -- ── veio do catálogo ─────────────────────────────────────────────────
  IF p_catalog_item_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.catalog_items
       WHERE id = p_catalog_item_id AND organization_id = v_o.organization_id) THEN
      RAISE EXCEPTION 'Esse item de catálogo não é desta organização.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_origem := 'catalogo';

    -- Sem descrição escrita, herda-se a do catálogo; sem preço, o de tabela.
    IF v_desc IS NULL THEN
      SELECT nullif(btrim(descricao), '') INTO v_desc
        FROM public.catalog_items WHERE id = p_catalog_item_id;
    END IF;

    IF p_valor_unit IS NULL THEN
      SELECT COALESCE(custo_material, 0) + COALESCE(custo_mao_obra, 0) INTO v_unit
        FROM public.catalog_items WHERE id = p_catalog_item_id;
    END IF;
  END IF;

  -- ── veio de uma compra ───────────────────────────────────────────────
  IF p_compra_linha_id IS NOT NULL THEN
    SELECT (l.quantidade - l.ja_atribuido) INTO v_livre
      FROM public.ops_v_compra_linha l
     WHERE l.id = p_compra_linha_id AND l.organization_id = v_o.organization_id;

    IF v_livre IS NULL THEN
      RAISE EXCEPTION 'Essa linha de compra não existe nesta organização.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- O mesmo material em duas obras faria o custo aparecer a dobrar, e
    -- ninguém daria por isso a olhar para uma delas.
    IF v_qt > v_livre THEN
      RAISE EXCEPTION
        'Dessa compra só sobram % por atribuir, e estás a lançar %.', v_livre, v_qt;
    END IF;

    v_origem := 'compra';

    IF v_desc IS NULL THEN
      SELECT descricao INTO v_desc FROM public.ops_v_compra_linha WHERE id = p_compra_linha_id;
    END IF;

    -- O preço da compra ganha ao de tabela: é o que se pagou mesmo.
    IF p_valor_unit IS NULL THEN
      SELECT preco_unit INTO v_unit FROM public.ops_v_compra_linha WHERE id = p_compra_linha_id;
    END IF;
  END IF;

  IF v_desc IS NULL THEN
    RAISE EXCEPTION 'Um custo precisa de uma descrição. É o que aparece no mapa de custos.';
  END IF;

  INSERT INTO public.ops_custo (
    ordem_id, tipo, descricao, quantidade, valor_unit, total, unidade,
    origem, catalog_item_id, compra_linha_id, criado_por)
  VALUES (
    p_ordem_id, p_tipo, v_desc, v_qt, v_unit, (v_qt * v_unit)::numeric(12,2),
    nullif(btrim(coalesce(p_unidade, '')), ''),
    v_origem, p_catalog_item_id, p_compra_linha_id, v_user)
  RETURNING id INTO v_id;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', p_ordem_id, 'custo_lancado', v_desc, v_user, NULL,
     jsonb_build_object('custo_id', v_id, 'tipo', p_tipo, 'origem', v_origem,
                        'total', (v_qt * v_unit)));

  RETURN jsonb_build_object(
    'ok', true, 'id', v_id, 'total', (v_qt * v_unit)::numeric(12,2), 'origem', v_origem);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_lancar_custo(uuid, text, text, numeric, numeric, text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_lancar_custo(uuid, text, text, numeric, numeric, text, uuid, uuid)
  TO authenticated, service_role;


-- ============================================================
-- 6. Apagar um custo
-- ============================================================
-- A mão de obra calculada não se apaga por aqui: voltaria no recálculo
-- seguinte, e quem a apagou ficaria a pensar que tinha resolvido alguma coisa.

CREATE OR REPLACE FUNCTION public.rpc_ops_remover_custo(p_custo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user   uuid;
  v_funcao text;
  v_c      record;
  v_o      record;
BEGIN
  SELECT * INTO v_c FROM public.ops_custo WHERE id = p_custo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Custo não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_o FROM public.ops_ordem WHERE id = v_c.ordem_id;
  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_o.organization_id) q;

  IF NOT (
    public.is_system_admin_user(auth.uid())
    OR public.has_anew_permission(auth.uid(), 'operations.costs.view')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para mexer em custos.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_c.origem = 'calculado' THEN
    RAISE EXCEPTION
      'Esse custo é calculado das sessões de trabalho. Para o mudar, corrige as sessões ou o custo/hora da pessoa.';
  END IF;

  DELETE FROM public.ops_custo WHERE id = p_custo_id;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', v_c.ordem_id, 'custo_removido', v_c.descricao, v_user,
     jsonb_build_object('total', v_c.total, 'tipo', v_c.tipo), NULL);

  RETURN jsonb_build_object('ok', true);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_remover_custo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_remover_custo(uuid) TO authenticated, service_role;


-- ============================================================
-- 7. Previsto contra real, LINHA A LINHA
-- ============================================================
-- Um total igual pode esconder um material que ficou barato e outro que
-- disparou. Emparelhar por item de catálogo é o que mostra qual foi qual.
--
-- Um FULL JOIN, de propósito: interessa tanto o que se orçamentou e não se
-- gastou (trabalho por fazer, ou material que sobrou) como o que se gastou
-- sem estar orçamentado — que é onde as obras costumam derrapar.

CREATE OR REPLACE VIEW public.ops_v_custo_por_item
WITH (security_invoker = true) AS
SELECT
  COALESCE(p.ordem_id, r.ordem_id)                       AS ordem_id,
  COALESCE(p.catalog_item_id, r.catalog_item_id)         AS catalog_item_id,
  COALESCE(p.descricao, r.descricao)                     AS descricao,
  p.quantidade                                           AS qt_prevista,
  p.total                                                AS previsto,
  r.quantidade                                           AS qt_real,
  r.total                                                AS real,
  CASE
    WHEN p.total IS NULL THEN 'nao_orcamentado'
    WHEN r.total IS NULL THEN 'nao_gasto'
    ELSE 'ambos'
  END                                                    AS situacao,
  (COALESCE(r.total, 0) - COALESCE(p.total, 0))::numeric(12,2) AS desvio
FROM (
  SELECT ordem_id, catalog_item_id,
         min(descricao)            AS descricao,
         sum(quantidade)           AS quantidade,
         sum(total_sem_iva)::numeric(12,2) AS total
    FROM public.ops_ordem_previsto
   WHERE catalog_item_id IS NOT NULL
   GROUP BY ordem_id, catalog_item_id
) p
FULL JOIN (
  SELECT ordem_id, catalog_item_id,
         min(descricao)     AS descricao,
         sum(quantidade)    AS quantidade,
         sum(total)::numeric(12,2) AS total
    FROM public.ops_custo
   WHERE catalog_item_id IS NOT NULL
   GROUP BY ordem_id, catalog_item_id
) r ON r.ordem_id = p.ordem_id AND r.catalog_item_id = p.catalog_item_id;

REVOKE ALL ON public.ops_v_custo_por_item FROM PUBLIC, anon;
GRANT SELECT ON public.ops_v_custo_por_item TO authenticated, service_role;

COMMIT;


-- ============================================================
-- Verificação
-- ============================================================
DO $v$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname IN ('rpc_ops_lancar_custo','rpc_ops_remover_custo');
  IF n <> 2 THEN
    RAISE EXCEPTION 'Faltam funções de custo: esperava 2, encontrei %.', n;
  END IF;

  SELECT count(*) INTO n FROM pg_class c
   WHERE c.relname IN ('ops_v_catalogo','ops_v_compra_linha','ops_v_custo_por_item')
     AND c.relnamespace = 'public'::regnamespace
     AND 'security_invoker=true' = ANY (c.reloptions);
  IF n <> 3 THEN
    RAISE EXCEPTION 'Uma das vistas novas ficou sem security_invoker — contornaria a RLS do CRM.';
  END IF;

  RAISE NOTICE 'Custos prontos. O material já se lança, e a comparação passa a ser linha a linha.';
END
$v$;
