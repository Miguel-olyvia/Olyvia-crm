-- ============================================================
--  Operações — do orçamento à obra, e de volta ao custo real
-- ============================================================
--  Correr DEPOIS de: schema.sql, permissoes.sql, rpcs.sql, rpcs-tarefas.sql,
--  planos.sql, correcoes-modelo.sql, medicoes.sql, despacho.sql.
--
--  A pergunta que hoje ninguém consegue responder:
--
--      "Orçamentei 800 €. Gastei quanto?"
--
--  As duas metades já existem, cada uma do seu lado, sem se falarem:
--
--   · `quote_lines` (CRM) guarda, por linha, `custo_material_unit`,
--     `custo_mao_obra_unit` e `margem_percent` — o que se previu;
--   · `ops_custo` (Operações) guarda material, mão de obra e serviços — o
--     que se gastou mesmo, com a mão de obra calculada a partir das sessões
--     de trabalho reais.
--
--  Este ficheiro liga as duas. Quando um orçamento é aceite, nasce uma ordem
--  de obra com as linhas do orçamento congeladas ao lado. No fim, uma vista
--  põe previsto e real lado a lado.
--
--  Escreve fora de `ops_*`? NÃO. Lê `quotes` e `quote_lines`, e não lhes
--  toca — nem uma linha, nem uma coluna, nem um trigger. A ligação é uma
--  coluna `orcamento_id` sem chave estrangeira, pela mesma razão de sempre:
--  o CRM apaga registos a sério, e uma FK partiria esse apagamento.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. De que orçamento veio esta ordem
-- ============================================================

ALTER TABLE public.ops_ordem
  -- Sem FK para `quotes`, de propósito. Ver a nota no cabeçalho.
  ADD COLUMN IF NOT EXISTS orcamento_id uuid;

CREATE INDEX IF NOT EXISTS ops_ordem_orcamento_idx
  ON public.ops_ordem (orcamento_id) WHERE orcamento_id IS NOT NULL;


-- ============================================================
-- 2. O que se previu, congelado
-- ============================================================
-- Uma cópia das linhas do orçamento no momento em que a obra nasceu.
--
-- Cópia, e não uma leitura ao vivo: o orçamento pode ser revisto depois de
-- a obra começar, e comparar o gasto real contra um orçamento que mudou
-- entretanto não responde a pergunta nenhuma. O que interessa é o que estava
-- em cima da mesa quando se disse "sim".

CREATE TABLE IF NOT EXISTS public.ops_ordem_previsto (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_id       uuid NOT NULL REFERENCES public.ops_ordem(id) ON DELETE CASCADE,
  -- → quote_lines.id, sem FK. Serve para rastrear, não para integridade.
  quote_line_id  uuid,
  -- → catalog_items.id, sem FK. É o que permite comparar o previsto com o
  -- gasto ITEM A ITEM, e não só em totais.
  catalog_item_id uuid,
  posicao        integer NOT NULL DEFAULT 0,
  categoria      text,
  descricao      text NOT NULL,
  unidade        text,
  quantidade     numeric(12,3) NOT NULL DEFAULT 1,
  custo_material numeric(12,2) NOT NULL DEFAULT 0,
  custo_mao_obra numeric(12,2) NOT NULL DEFAULT 0,
  total_sem_iva  numeric(12,2) NOT NULL DEFAULT 0,
  congelado_em   timestamptz NOT NULL DEFAULT now()
);

-- Para quem já tinha a tabela antes de a coluna existir.
ALTER TABLE public.ops_ordem_previsto
  ADD COLUMN IF NOT EXISTS catalog_item_id uuid;

CREATE INDEX IF NOT EXISTS ops_previsto_ordem_idx
  ON public.ops_ordem_previsto (ordem_id, posicao);


-- ============================================================
-- 3. Os orçamentos que já podem virar obra
-- ============================================================
-- `security_invoker` é obrigatório: sem ele, a vista corre com os direitos de
-- quem a criou e mostraria orçamentos de organizações que quem consulta não
-- pode ver. Com ele, a RLS do CRM aplica-se na mesma, como deve.
--
-- Mostra os aceites que ainda não têm obra. Um orçamento que já gerou obra
-- sai da lista sozinho — é a lista de "o que falta pôr a andar".

CREATE OR REPLACE VIEW public.ops_v_orcamento
WITH (security_invoker = true) AS
SELECT
  q.id,
  q.organization_id,
  q.cliente_id,
  COALESCE(q.quote_number, '—')                       AS numero,
  COALESCE(nullif(btrim(q.title), ''), 'Sem título')  AS titulo,
  q.obra_endereco,
  q.estado,
  q.accepted_at,
  q.total,
  q.moeda,
  -- O custo previsto, somado das linhas. É contra isto que o real se compara.
  COALESCE((
    SELECT sum((COALESCE(l.custo_material_unit,0) + COALESCE(l.custo_mao_obra_unit,0))
               * COALESCE(l.qt,1))
      FROM public.quote_lines l WHERE l.quote_id = q.id
  ), 0)::numeric(12,2)                                AS custo_previsto,
  (SELECT count(*) FROM public.quote_lines l WHERE l.quote_id = q.id)::integer AS linhas,
  EXISTS (SELECT 1 FROM public.ops_ordem o WHERE o.orcamento_id = q.id)        AS tem_obra
FROM public.quotes q
WHERE q.deleted_at IS NULL
  AND q.estado IN ('aceite','finalizado');

REVOKE ALL ON public.ops_v_orcamento FROM PUBLIC, anon;
GRANT SELECT ON public.ops_v_orcamento TO authenticated, service_role;


-- ============================================================
-- 4. Previsto contra real
-- ============================================================
-- Uma linha por ordem, com os dois números lado a lado e o desvio.
--
-- O desvio é `real - previsto`: positivo quer dizer que se gastou mais do que
-- se previu. Sem previsto (uma corretiva que não veio de orçamento nenhum),
-- fica nulo em vez de zero — "não havia orçamento" não é o mesmo que
-- "orçamento de zero euros".

CREATE OR REPLACE VIEW public.ops_v_ordem_custo
WITH (security_invoker = true) AS
SELECT
  o.id                       AS ordem_id,
  o.organization_id,
  o.codigo,
  o.titulo,
  o.estado,
  o.orcamento_id,
  p.previsto,
  r.real_material,
  r.real_mao_obra,
  r.real_outros,
  COALESCE(r.real_total, 0)::numeric(12,2) AS real_total,
  CASE WHEN p.previsto IS NULL THEN NULL
       ELSE (COALESCE(r.real_total, 0) - p.previsto)::numeric(12,2)
  END                        AS desvio,
  CASE WHEN p.previsto IS NULL OR p.previsto = 0 THEN NULL
       ELSE round((COALESCE(r.real_total, 0) - p.previsto) / p.previsto * 100, 1)
  END                        AS desvio_percent
FROM public.ops_ordem o
LEFT JOIN LATERAL (
  SELECT sum(x.total_sem_iva)::numeric(12,2) AS previsto
    FROM public.ops_ordem_previsto x WHERE x.ordem_id = o.id
) p ON true
LEFT JOIN LATERAL (
  SELECT
    sum(c.total) FILTER (WHERE c.tipo = 'material')::numeric(12,2) AS real_material,
    sum(c.total) FILTER (WHERE c.tipo = 'mao_obra')::numeric(12,2) AS real_mao_obra,
    sum(c.total) FILTER (WHERE c.tipo NOT IN ('material','mao_obra'))::numeric(12,2) AS real_outros,
    sum(c.total)::numeric(12,2) AS real_total
    FROM public.ops_custo c WHERE c.ordem_id = o.id
) r ON true;

REVOKE ALL ON public.ops_v_ordem_custo FROM PUBLIC, anon;
GRANT SELECT ON public.ops_v_ordem_custo TO authenticated, service_role;


-- ============================================================
-- 5. Pôr um orçamento a andar
-- ============================================================

CREATE OR REPLACE FUNCTION public.ops_obra_de_orcamento_impl(
  p_orcamento_id   uuid,
  p_local_id       uuid        DEFAULT NULL,
  p_checklist_id   uuid        DEFAULT NULL,
  p_agendada_para  timestamptz DEFAULT NULL,
  p_responsavel_id uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user     uuid;
  v_funcao   text;
  v_q        record;
  v_codigo   text;
  v_id       uuid;
  v_alvo     uuid;
  v_versao   integer;
  v_linhas   integer := 0;
  v_previsto numeric(12,2) := 0;
BEGIN
  SELECT q.id, q.organization_id, q.cliente_id, q.quote_number, q.title,
         q.obra_endereco, q.obra_notas, q.estado, q.total
    INTO v_q
    FROM public.quotes q
   WHERE q.id = p_orcamento_id AND q.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orçamento não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_q.estado NOT IN ('aceite','finalizado') THEN
    RAISE EXCEPTION 'Só se põe a andar um orçamento aceite (este está "%").', v_q.estado;
  END IF;

  IF v_q.cliente_id IS NULL THEN
    RAISE EXCEPTION 'Esse orçamento não tem cliente. Sem cliente não há obra a quem entregar.';
  END IF;

  -- Um orçamento gera UMA obra. Carregar duas vezes no botão não abre duas.
  IF EXISTS (SELECT 1 FROM public.ops_ordem WHERE orcamento_id = p_orcamento_id) THEN
    RAISE EXCEPTION 'Esse orçamento já tem obra: %.',
      (SELECT codigo FROM public.ops_ordem WHERE orcamento_id = p_orcamento_id LIMIT 1);
  END IF;

  SELECT z.utilizador_id, z.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_q.organization_id) z;

  IF NOT (
    public.is_system_admin_user(auth.uid())
    OR public.has_anew_permission(auth.uid(), 'operations.orders.create')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para criar ordens.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_local_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_local
     WHERE id = p_local_id AND organization_id = v_q.organization_id) THEN
    RAISE EXCEPTION 'Esse local não é desta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_codigo := public.ops_proximo_codigo_interno(v_q.organization_id, 'OT');

  INSERT INTO public.ops_ordem (
    organization_id, codigo, origem, estado, prioridade,
    cliente_id, local_id, titulo, descricao,
    agendada_para, responsavel_id, orcamento_id, criada_por
  ) VALUES (
    v_q.organization_id, v_codigo, 'obra',
    CASE WHEN v_funcao = 'tecnico' THEN 'por_aprovar' ELSE 'agendada' END,
    'normal',
    v_q.cliente_id, p_local_id,
    COALESCE(nullif(btrim(v_q.title), ''), 'Obra ' || COALESCE(v_q.quote_number, '')),
    -- A morada da obra e as notas vêm no corpo, não numa coluna nova: quem
    -- chega ao local precisa de as ler, não de as filtrar.
    nullif(btrim(concat_ws(E'\n',
      CASE WHEN v_q.quote_number IS NOT NULL THEN 'Orçamento ' || v_q.quote_number END,
      nullif(btrim(coalesce(v_q.obra_endereco, '')), ''),
      nullif(btrim(coalesce(v_q.obra_notas, '')), '')
    )), ''),
    p_agendada_para, p_responsavel_id, p_orcamento_id, v_user
  ) RETURNING id INTO v_id;

  -- As linhas do orçamento, congeladas. `qt` e os custos unitários vêm como
  -- estão no CRM; o total recalcula-se aqui em vez de se copiar, porque
  -- `total_sem_iva` lá inclui margem e desconto, e o que se quer comparar
  -- com o gasto real é o CUSTO, não o preço de venda.
  -- `catalog_item_id` viaja com a linha: é o que permite comparar o previsto
  -- com o gasto ITEM A ITEM, e não só em totais. Sem ele, um total igual
  -- esconderia um material que ficou barato e outro que disparou.
  INSERT INTO public.ops_ordem_previsto (
    ordem_id, quote_line_id, catalog_item_id, posicao, categoria, descricao,
    unidade, quantidade, custo_material, custo_mao_obra, total_sem_iva)
  SELECT
    v_id, l.id, l.catalog_item_id, COALESCE(l.ordem, 0), l.categoria,
    COALESCE(nullif(btrim(l.item_description), ''),
             nullif(btrim(l.descricao_snapshot), ''),
             'Linha sem descrição'),
    l.unidade,
    COALESCE(l.qt, 1),
    COALESCE(l.custo_material_unit, 0),
    COALESCE(l.custo_mao_obra_unit, 0),
    ((COALESCE(l.custo_material_unit, 0) + COALESCE(l.custo_mao_obra_unit, 0))
     * COALESCE(l.qt, 1))::numeric(12,2)
    FROM public.quote_lines l
   WHERE l.quote_id = p_orcamento_id
   ORDER BY COALESCE(l.ordem, 0);

  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  SELECT COALESCE(sum(total_sem_iva), 0) INTO v_previsto
    FROM public.ops_ordem_previsto WHERE ordem_id = v_id;

  -- Alvo e checklist, como em qualquer ordem.
  IF p_local_id IS NOT NULL OR p_checklist_id IS NOT NULL THEN
    SELECT versao INTO v_versao FROM public.ops_checklist WHERE id = p_checklist_id;

    INSERT INTO public.ops_ordem_alvo
      (ordem_id, local_id, checklist_id, checklist_versao, posicao)
    VALUES (v_id, p_local_id, p_checklist_id, v_versao, 0)
    RETURNING id INTO v_alvo;

    IF p_checklist_id IS NOT NULL THEN
      INSERT INTO public.ops_ordem_tarefa (
        ordem_id, ordem_alvo_id, checklist_tarefa_id, posicao, codigo, nome,
        tipo, skill_id, privada, obrigatoria, tempo_estimado)
      SELECT v_id, v_alvo, ct.id, ct.posicao, ct.codigo, ct.nome, ct.tipo,
             ct.skill_id, ct.privada, ct.obrigatoria, ct.tempo_estimado
        FROM public.ops_checklist_tarefa ct
       WHERE ct.checklist_id = p_checklist_id
       ORDER BY ct.posicao;

      INSERT INTO public.ops_ordem_tarefa_medicao (
        ordem_tarefa_id, medicao_def_id, nome, tipo, unidade, limite_min, limite_max)
      SELECT ot.id, md.id, md.nome, md.tipo, md.unidade, md.limite_min, md.limite_max
        FROM public.ops_ordem_tarefa ot
        JOIN public.ops_checklist_tarefa_medicao ctm
          ON ctm.checklist_tarefa_id = ot.checklist_tarefa_id
        JOIN public.ops_medicao_def md ON md.id = ctm.medicao_def_id
       WHERE ot.ordem_id = v_id
      ON CONFLICT (ordem_tarefa_id, medicao_def_id) DO NOTHING;
    END IF;
  END IF;

  IF p_responsavel_id IS NOT NULL THEN
    INSERT INTO public.ops_ordem_pessoa (ordem_id, utilizador_id, papel)
    VALUES (v_id, p_responsavel_id, 'responsavel')
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_q.organization_id, 'ordem', v_id, 'criada_de_orcamento',
     'Orçamento ' || COALESCE(v_q.quote_number, '—'), v_user, NULL,
     jsonb_build_object('codigo', v_codigo, 'orcamento_id', p_orcamento_id,
                        'linhas', v_linhas, 'custo_previsto', v_previsto));

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'codigo', v_codigo,
    'linhas', v_linhas,
    'custo_previsto', v_previsto
  );
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_de_orcamento_impl(uuid, uuid, uuid, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_ops_obra_de_orcamento(
  p_orcamento_id   uuid,
  p_local_id       uuid        DEFAULT NULL,
  p_checklist_id   uuid        DEFAULT NULL,
  p_agendada_para  timestamptz DEFAULT NULL,
  p_responsavel_id uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('ops.medicao', 'autorizada', true);
  r := public.ops_obra_de_orcamento_impl(
         p_orcamento_id, p_local_id, p_checklist_id, p_agendada_para, p_responsavel_id);
  PERFORM set_config('ops.medicao', '', true);
  RETURN r;
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_de_orcamento(uuid, uuid, uuid, timestamptz, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_de_orcamento(uuid, uuid, uuid, timestamptz, uuid)
  TO authenticated, service_role;


-- ============================================================
-- 6. RLS na tabela nova
-- ============================================================
-- Ver o previsto é ver custos. Quem não tem `operations.costs.view` vê a obra
-- e não vê os números — que é o que se quer para um técnico no local.

ALTER TABLE public.ops_ordem_previsto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_ordem_previsto_select ON public.ops_ordem_previsto;
CREATE POLICY ops_ordem_previsto_select ON public.ops_ordem_previsto
  FOR SELECT TO authenticated USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR public.has_anew_permission((SELECT auth.uid()), 'operations.costs.view')
  );

-- Uma política por comando, e NÃO `FOR ALL`.
--
-- `FOR ALL` parece o atalho óbvio, e é uma armadilha: a sua cláusula USING
-- também se aplica ao SELECT, e as políticas somam-se com OR. Uma política de
-- escrita `FOR ALL` baseada em `orders.edit` dava, sem se dar por isso, acesso
-- de LEITURA aos custos a toda a gente que pode editar ordens — anulando a
-- restrição acima. Foi um teste que apanhou isto, não uma revisão.
DROP POLICY IF EXISTS ops_ordem_previsto_write ON public.ops_ordem_previsto;
DROP POLICY IF EXISTS ops_ordem_previsto_insert ON public.ops_ordem_previsto;
DROP POLICY IF EXISTS ops_ordem_previsto_update ON public.ops_ordem_previsto;
DROP POLICY IF EXISTS ops_ordem_previsto_delete ON public.ops_ordem_previsto;

CREATE POLICY ops_ordem_previsto_insert ON public.ops_ordem_previsto
  FOR INSERT TO authenticated WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR public.has_anew_permission((SELECT auth.uid()), 'operations.orders.edit')
  );

CREATE POLICY ops_ordem_previsto_update ON public.ops_ordem_previsto
  FOR UPDATE TO authenticated USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR public.has_anew_permission((SELECT auth.uid()), 'operations.orders.edit')
  ) WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR public.has_anew_permission((SELECT auth.uid()), 'operations.orders.edit')
  );

CREATE POLICY ops_ordem_previsto_delete ON public.ops_ordem_previsto
  FOR DELETE TO authenticated USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR public.has_anew_permission((SELECT auth.uid()), 'operations.orders.edit')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ops_ordem_previsto TO authenticated;
GRANT ALL ON public.ops_ordem_previsto TO service_role;
REVOKE ALL ON public.ops_ordem_previsto FROM anon;

COMMIT;


-- ============================================================
-- Verificação
-- ============================================================
DO $v$
DECLARE n integer;
BEGIN
  IF to_regclass('public.ops_ordem_previsto') IS NULL THEN
    RAISE EXCEPTION 'A tabela do previsto não ficou criada.';
  END IF;

  SELECT count(*) INTO n FROM pg_views
   WHERE schemaname = 'public' AND viewname IN ('ops_v_orcamento','ops_v_ordem_custo');
  IF n <> 2 THEN
    RAISE EXCEPTION 'Faltam vistas: esperava 2, encontrei %.', n;
  END IF;

  -- Sem `security_invoker` uma vista contorna a RLS do CRM. Não é um detalhe.
  SELECT count(*) INTO n FROM pg_class c
   WHERE c.relname IN ('ops_v_orcamento','ops_v_ordem_custo')
     AND c.relnamespace = 'public'::regnamespace
     AND 'security_invoker=true' = ANY (c.reloptions);
  IF n <> 2 THEN
    RAISE EXCEPTION 'Uma vista ficou sem security_invoker — contornaria a RLS do CRM.';
  END IF;

  RAISE NOTICE 'Orçamentos ligados. Já se responde a "orçamentei X, gastei quanto?".';
END
$v$;
