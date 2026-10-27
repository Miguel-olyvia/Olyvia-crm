-- Catálogo e custos (Fase 1 da migração da Emylia para a Olyvia; plano em Olyvia2.0 docs/14-plano-migracao-olyvia.md).
--
-- Só acrescenta: colunas novas em tabelas que já existem, 5 tabelas novas, políticas de leitura e as funções de escrita cat_*.
-- Nada se apaga, renomeia ou altera. Sem JSON a guardar estado: cada coisa tem coluna própria.
--
-- O que se reaproveita (e porquê):
--   services            os serviços do Catálogo (decisão 1): o orçamento, as encomendas e as Operações já apontam para aqui.
--   service_categories  a árvore do Catálogo (ofício › sub, dois níveis): os serviços já têm service_category_id e
--                       service_subcategory_id; os produtos ganham catalogo_categoria_id para a mesma árvore.
--   service_prices      o preço de tabela e o histórico do preço (uma linha 'retail' por mudança, com valid_from e nota).
--   ops_skill           os perfis de mão de obra (ofícios); ganha o salário de referência para quando não há técnicos.
--   ops_utilizador_skill + ops_utilizador_perfil.custo_hora   os técnicos de cada perfil e o custo/hora de cada um.
--   ops_obra_servico_tarefa   os passos de mão de obra da receita (perfil, minutos fixos e por unidade, fase, medida);
--                             é a mesma tabela que as Operações usam para planear a obra.
--   service_materials   os consumíveis da receita (produto, quantidade); ganha "opcional".
--   products            produtos e consumíveis (tipo_catalogo); custo à mão e PVP em product_prices.
--   item_suppliers      a ligação ao artigo do fornecedor (catalog_item_id); ganha a data do preço.
--   bundles + bundle_components   os pacotes; ganham a regra de quantidade por medida.
--
-- Tabelas novas (não há equivalente na base):
--   cat_parametros, cat_margem_linha, cat_estrutura   os parâmetros de custo da organização, a margem mínima por linha
--                                                     e os custos de estrutura (renda, viaturas…).
--   cat_equipamentos, cat_servico_equipamentos        os equipamentos (custo/hora pela compra, vida e uso) e o uso na receita.

SET lock_timeout = '5s';

-- ------------------------------------------------------------------ vocabulário partilhado
-- As medidas de onde vem a quantidade são as mesmas das Operações (ops_obra_servico_tarefa_medida_chk).
CREATE OR REPLACE FUNCTION public.cat_medida_valida(m text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT m IS NULL OR m = ANY (ARRAY['qt','fixo','m2_pavimento','m2_parede','m2_total','pontos_agua','pontos_eletricos',
    'pecas_sanitarias','acessorios','modulos','eletrodomesticos','ml_bancada'])
$$;

-- ------------------------------------------------------------------ 1. Parâmetros da organização
CREATE TABLE IF NOT EXISTS public.cat_parametros (
  organization_id uuid PRIMARY KEY REFERENCES public.anew_organizations(id),
  meses numeric(4,1) NOT NULL DEFAULT 14 CHECK (meses BETWEEN 12 AND 16),
  tsu numeric(5,2) NOT NULL DEFAULT 23.75 CHECK (tsu BETWEEN 0 AND 100),
  seguros_ano numeric(10,2) NOT NULL DEFAULT 0 CHECK (seguros_ano >= 0),
  horas_ano numeric(6,1) NOT NULL DEFAULT 1345 CHECK (horas_ano > 0),
  horas_mes numeric(8,1) NOT NULL DEFAULT 0 CHECK (horas_mes >= 0),
  meses_desatualizado integer NOT NULL DEFAULT 6 CHECK (meses_desatualizado BETWEEN 1 AND 60),
  margem_minima numeric(5,2) NOT NULL DEFAULT 28 CHECK (margem_minima BETWEEN 0 AND 99),
  margem_alvo numeric(5,2) NOT NULL DEFAULT 35 CHECK (margem_alvo BETWEEN 0 AND 99),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES public.anew_users(id) ON DELETE SET NULL
);
COMMENT ON TABLE public.cat_parametros IS 'Catálogo e custos: os parâmetros de custo da organização (meses de salário, TSU, seguros, horas produtivas, margens). Uma linha por organização.';

CREATE TABLE IF NOT EXISTS public.cat_margem_linha (
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id),
  linha text NOT NULL CHECK (linha IN ('wc','coz','geral')),
  margem_minima numeric(5,2) NOT NULL CHECK (margem_minima BETWEEN 0 AND 99),
  PRIMARY KEY (organization_id, linha)
);
COMMENT ON TABLE public.cat_margem_linha IS 'Catálogo e custos: a margem mínima por linha de serviço (casa de banho, cozinha, geral). A que falta usa cat_parametros.margem_minima.';

CREATE TABLE IF NOT EXISTS public.cat_estrutura (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id),
  nome text NOT NULL CHECK (length(btrim(nome)) > 0),
  categoria text NOT NULL CHECK (categoria IN ('Renda','Viaturas','Seguros','Pessoal não operacional','Licenças e software','Energia e água','Outro')),
  mensal numeric(12,2) NOT NULL CHECK (mensal >= 0),
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  apagado_em timestamptz
);
CREATE INDEX IF NOT EXISTS cat_estrutura_org_idx ON public.cat_estrutura (organization_id) WHERE apagado_em IS NULL;
COMMENT ON TABLE public.cat_estrutura IS 'Catálogo e custos: os custos de estrutura mensais. €/h de estrutura = soma dos ativos ÷ cat_parametros.horas_mes.';

-- ------------------------------------------------------------------ 2. Equipamentos
CREATE TABLE IF NOT EXISTS public.cat_equipamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id),
  nome text NOT NULL CHECK (length(btrim(nome)) > 0),
  compra numeric(12,2) NOT NULL CHECK (compra >= 0),
  vida_anos numeric(5,2) NOT NULL CHECK (vida_anos > 0),
  residual numeric(12,2) NOT NULL DEFAULT 0 CHECK (residual >= 0),
  manutencao_ano numeric(12,2) NOT NULL DEFAULT 0 CHECK (manutencao_ano >= 0),
  uso_ano_horas numeric(8,1) NOT NULL CHECK (uso_ano_horas > 0),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  apagado_em timestamptz,
  UNIQUE (id, organization_id)
);
CREATE INDEX IF NOT EXISTS cat_equipamentos_org_idx ON public.cat_equipamentos (organization_id) WHERE apagado_em IS NULL;
COMMENT ON TABLE public.cat_equipamentos IS 'Catálogo e custos: os equipamentos. €/h = ((compra − residual) ÷ vida + manutenção/ano) ÷ uso/ano.';

CREATE TABLE IF NOT EXISTS public.cat_servico_equipamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  equipamento_id uuid NOT NULL,
  horas numeric(10,3) NOT NULL CHECK (horas > 0),
  ordem integer NOT NULL DEFAULT 0,
  FOREIGN KEY (equipamento_id, organization_id) REFERENCES public.cat_equipamentos(id, organization_id)
);
CREATE INDEX IF NOT EXISTS cat_servico_equipamentos_servico_idx ON public.cat_servico_equipamentos (service_id);
COMMENT ON TABLE public.cat_servico_equipamentos IS 'Catálogo e custos: as horas de cada equipamento na receita de um serviço (por unidade).';

-- ------------------------------------------------------------------ 3. Colunas novas nas tabelas que já existem
-- Perfis de mão de obra
ALTER TABLE public.ops_skill ADD COLUMN IF NOT EXISTS salario_referencia numeric(12,2) CHECK (salario_referencia IS NULL OR salario_referencia >= 0);
COMMENT ON COLUMN public.ops_skill.salario_referencia IS 'Salário mensal de referência do perfil. Só conta para o €/h quando o perfil não tem técnicos com custo/hora.';

-- Serviços
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS unidade text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS linhas text[] NOT NULL DEFAULT '{}'::text[] CHECK (linhas <@ ARRAY['wc','coz','geral']::text[]);
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS medida text CHECK (public.cat_medida_valida(medida));
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS modo_preco text NOT NULL DEFAULT 'tabela' CHECK (modo_preco IN ('tabela','margem'));
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS margem numeric(5,2) CHECK (margem IS NULL OR margem BETWEEN 0 AND 99);
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS justificacao_preco text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS receita_origem text NOT NULL DEFAULT 'editada' CHECK (receita_origem IN ('catalogo','estimada','editada'));
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS fases smallint[] NOT NULL DEFAULT '{}'::smallint[] CHECK (fases <@ ARRAY[1,2,3,4]::smallint[]);
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS icone text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS exige_produto_categoria_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS exige_produto_medida text CHECK (public.cat_medida_valida(exige_produto_medida));
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS exige_produto_fator numeric(10,4) CHECK (exige_produto_fator IS NULL OR exige_produto_fator > 0);
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS exige_produto_arredondar boolean NOT NULL DEFAULT false;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS pergunta_manter text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS entulho_modo text CHECK (entulho_modo IS NULL OR entulho_modo IN ('nao','artigo','produto','m3'));
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS entulho_m3 numeric(10,4) CHECK (entulho_m3 IS NULL OR entulho_m3 >= 0);
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS entulho_kg numeric(10,2) CHECK (entulho_kg IS NULL OR entulho_kg >= 0);
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS no_catalogo boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.services.no_catalogo IS 'O serviço é do Catálogo e custos (Emylia). Os serviços antigos ficam com false até à limpeza.';
COMMENT ON COLUMN public.services.medida IS 'De onde vem a quantidade na visita (o vocabulário das Operações); null = o comercial escreve.';
COMMENT ON COLUMN public.services.modo_preco IS 'tabela = preço de tabela (service_prices retail); margem = custo ÷ (1 − margem).';
CREATE INDEX IF NOT EXISTS services_catalogo_idx ON public.services (organization_id) WHERE no_catalogo AND NOT is_deleted;

ALTER TABLE public.service_prices ADD COLUMN IF NOT EXISTS nota text;

-- Consumíveis da receita
ALTER TABLE public.service_materials ADD COLUMN IF NOT EXISTS opcional boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.service_materials.opcional IS 'Consumível opcional: não entra no custo por omissão; o técnico ou o comercial liga-o.';

-- Produtos e consumíveis
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tipo_catalogo text CHECK (tipo_catalogo IS NULL OR tipo_catalogo IN ('produto','consumivel'));
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS catalogo_categoria_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unidade text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS servico_id uuid REFERENCES public.services(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS fator_servico numeric(10,4) NOT NULL DEFAULT 1 CHECK (fator_servico > 0);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS entulho_m3 numeric(10,4) CHECK (entulho_m3 IS NULL OR entulho_m3 >= 0);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS entulho_kg numeric(10,2) CHECK (entulho_kg IS NULL OR entulho_kg >= 0);
COMMENT ON COLUMN public.products.tipo_catalogo IS 'Catálogo e custos: produto (vende-se ao cliente) ou consumível (gasta-se na receita). Null = produto antigo, fora do Catálogo.';
COMMENT ON COLUMN public.products.servico_id IS 'O serviço que o produto traz quando se escolhe na visita (ex.: a sanita traz a instalação). Null = só se vende.';
CREATE INDEX IF NOT EXISTS products_catalogo_idx ON public.products (organization_id, tipo_catalogo) WHERE tipo_catalogo IS NOT NULL AND NOT is_deleted;

-- Ligação ao artigo do fornecedor
ALTER TABLE public.item_suppliers ADD COLUMN IF NOT EXISTS preco_data date;
COMMENT ON COLUMN public.item_suppliers.preco_data IS 'A data do preço de compra: alimenta o "preço desatualizado".';

-- Pacotes
ALTER TABLE public.bundles ADD COLUMN IF NOT EXISTS catalogo_categoria_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL;
ALTER TABLE public.bundles ADD COLUMN IF NOT EXISTS linha text CHECK (linha IS NULL OR linha IN ('wc','coz','geral'));
ALTER TABLE public.bundles ADD COLUMN IF NOT EXISTS margem_materiais numeric(5,2) CHECK (margem_materiais IS NULL OR margem_materiais BETWEEN 0 AND 99);
ALTER TABLE public.bundles ADD COLUMN IF NOT EXISTS ex_m2_pavimento numeric(10,2);
ALTER TABLE public.bundles ADD COLUMN IF NOT EXISTS ex_m2_parede numeric(10,2);
ALTER TABLE public.bundles ADD COLUMN IF NOT EXISTS ex_pontos_agua numeric(10,2);
ALTER TABLE public.bundles ADD COLUMN IF NOT EXISTS ex_pecas_sanitarias numeric(10,2);
ALTER TABLE public.bundle_components ADD COLUMN IF NOT EXISTS regra text NOT NULL DEFAULT 'fixo' CHECK (regra IN ('fixo','medida'));
ALTER TABLE public.bundle_components ADD COLUMN IF NOT EXISTS regra_medida text CHECK (public.cat_medida_valida(regra_medida));
ALTER TABLE public.bundle_components ADD COLUMN IF NOT EXISTS regra_fator numeric(10,4) CHECK (regra_fator IS NULL OR regra_fator > 0);
ALTER TABLE public.bundle_components ADD COLUMN IF NOT EXISTS regra_arredondar boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.bundle_components.regra IS 'fixo = quantity; medida = medida da visita × regra_fator (arredondada para cima se regra_arredondar).';

-- ------------------------------------------------------------------ 4. Leitura: o estado da ligação de cada produto ao fornecedor
CREATE OR REPLACE VIEW public.cat_v_produto_fornecedor WITH (security_invoker = true) AS
SELECT p.id AS product_id, p.organization_id,
  s.id AS item_supplier_id, s.supplier_id, s.supplier_sku, s.purchase_price, s.preco_data, s.catalog_item_id,
  CASE WHEN s.catalog_item_id IS NOT NULL THEN 'ligado'
       WHEN s.id IS NOT NULL THEN 'fornecedor_sem_artigo'
       ELSE 'por_ligar' END AS ligacao
FROM public.products p
LEFT JOIN LATERAL (
  SELECT i.* FROM public.item_suppliers i
  WHERE i.product_id = p.id AND i.is_active AND i.deleted_at IS NULL
  ORDER BY i.is_preferred DESC, i.updated_at DESC LIMIT 1
) s ON true
WHERE p.tipo_catalogo IS NOT NULL AND NOT p.is_deleted;
COMMENT ON VIEW public.cat_v_produto_fornecedor IS 'Catálogo e custos: o fornecedor preferido de cada produto e o estado da ligação (ligado ao artigo do portal do fornecedor, fornecedor sem artigo, por ligar). Por ligar não entra em encomendas.';

-- ------------------------------------------------------------------ 5. Segurança (RLS): ler com services.view na organização; escrever só pelas funções cat_*
ALTER TABLE public.cat_parametros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cat_margem_linha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cat_estrutura ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cat_equipamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cat_servico_equipamentos ENABLE ROW LEVEL SECURITY;

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cat_parametros','cat_margem_linha','cat_estrutura','cat_equipamentos','cat_servico_equipamentos'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_ler') THEN
      EXECUTE format($p$CREATE POLICY %I ON public.%I AS PERMISSIVE FOR SELECT TO authenticated
        USING (public.is_system_admin_user((SELECT auth.uid())) OR public.has_anew_permission_in_org((SELECT auth.uid()), 'services.view', organization_id))$p$,
        t || '_ler', t);
    END IF;
  END LOOP;
END $do$;
REVOKE ALL ON public.cat_parametros, public.cat_margem_linha, public.cat_estrutura, public.cat_equipamentos, public.cat_servico_equipamentos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cat_parametros, public.cat_margem_linha, public.cat_estrutura, public.cat_equipamentos, public.cat_servico_equipamentos TO authenticated;
GRANT ALL ON public.cat_parametros, public.cat_margem_linha, public.cat_estrutura, public.cat_equipamentos, public.cat_servico_equipamentos TO service_role;
REVOKE ALL ON public.cat_v_produto_fornecedor FROM PUBLIC, anon;
GRANT SELECT ON public.cat_v_produto_fornecedor TO authenticated, service_role;

-- ------------------------------------------------------------------ 6. Escritas
-- Erros: CT001 sem permissão; CT002 dados inválidos; CT003 não encontrado nesta organização.
CREATE OR REPLACE FUNCTION public.fn_cat_exigir(p_org uuid, p_perm text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := public.current_business_user_id();
BEGIN
  IF p_org IS NULL OR NOT (public.is_system_admin_user(auth.uid()) OR public.has_anew_permission_in_org(auth.uid(), p_perm, p_org)) THEN
    RAISE EXCEPTION 'Sem permissão (%).', p_perm USING ERRCODE = 'CT001';
  END IF;
  RETURN v_user;
END $$;
REVOKE ALL ON FUNCTION public.fn_cat_exigir(uuid, text) FROM PUBLIC, anon, authenticated;

-- Parâmetros e margens por linha
CREATE OR REPLACE FUNCTION public.cat_guardar_parametros(
  p_org uuid, p_meses numeric, p_tsu numeric, p_seguros_ano numeric, p_horas_ano numeric, p_horas_mes numeric,
  p_meses_desatualizado integer, p_margem_minima numeric, p_margem_alvo numeric,
  p_margem_wc numeric DEFAULT NULL, p_margem_coz numeric DEFAULT NULL, p_margem_geral numeric DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := public.fn_cat_exigir(p_org, 'services.manage_prices');
BEGIN
  INSERT INTO cat_parametros AS c (organization_id, meses, tsu, seguros_ano, horas_ano, horas_mes, meses_desatualizado, margem_minima, margem_alvo, atualizado_por)
  VALUES (p_org, p_meses, p_tsu, p_seguros_ano, p_horas_ano, p_horas_mes, p_meses_desatualizado, p_margem_minima, p_margem_alvo, v_user)
  ON CONFLICT (organization_id) DO UPDATE SET meses = EXCLUDED.meses, tsu = EXCLUDED.tsu, seguros_ano = EXCLUDED.seguros_ano,
    horas_ano = EXCLUDED.horas_ano, horas_mes = EXCLUDED.horas_mes, meses_desatualizado = EXCLUDED.meses_desatualizado,
    margem_minima = EXCLUDED.margem_minima, margem_alvo = EXCLUDED.margem_alvo, atualizado_em = now(), atualizado_por = v_user;
  DELETE FROM cat_margem_linha WHERE organization_id = p_org;
  INSERT INTO cat_margem_linha (organization_id, linha, margem_minima)
  SELECT p_org, l, m FROM (VALUES ('wc', p_margem_wc), ('coz', p_margem_coz), ('geral', p_margem_geral)) v(l, m) WHERE m IS NOT NULL;
END $$;

-- Custos de estrutura (p_id null = novo; p_apagar = tira da conta)
CREATE OR REPLACE FUNCTION public.cat_guardar_estrutura(p_org uuid, p_id uuid, p_nome text, p_categoria text, p_mensal numeric, p_ativo boolean, p_apagar boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'services.manage_prices');
  IF p_id IS NULL THEN
    INSERT INTO cat_estrutura (organization_id, nome, categoria, mensal, ativo, ordem)
    VALUES (p_org, btrim(p_nome), p_categoria, p_mensal, coalesce(p_ativo, true),
            coalesce((SELECT max(ordem) + 1 FROM cat_estrutura WHERE organization_id = p_org), 0))
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  UPDATE cat_estrutura SET nome = btrim(p_nome), categoria = p_categoria, mensal = p_mensal, ativo = coalesce(p_ativo, ativo),
    apagado_em = CASE WHEN p_apagar THEN now() ELSE NULL END
  WHERE id = p_id AND organization_id = p_org RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Custo de estrutura não encontrado.' USING ERRCODE = 'CT003'; END IF;
  RETURN v_id;
END $$;

-- Equipamentos
CREATE OR REPLACE FUNCTION public.cat_guardar_equipamento(p_org uuid, p_id uuid, p_nome text, p_compra numeric, p_vida_anos numeric,
  p_residual numeric, p_manutencao_ano numeric, p_uso_ano_horas numeric, p_apagar boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'services.edit');
  IF p_id IS NULL THEN
    INSERT INTO cat_equipamentos (organization_id, nome, compra, vida_anos, residual, manutencao_ano, uso_ano_horas)
    VALUES (p_org, btrim(p_nome), p_compra, p_vida_anos, coalesce(p_residual, 0), coalesce(p_manutencao_ano, 0), p_uso_ano_horas)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  UPDATE cat_equipamentos SET nome = btrim(p_nome), compra = p_compra, vida_anos = p_vida_anos, residual = coalesce(p_residual, 0),
    manutencao_ano = coalesce(p_manutencao_ano, 0), uso_ano_horas = p_uso_ano_horas,
    apagado_em = CASE WHEN p_apagar THEN now() ELSE NULL END, ativo = NOT coalesce(p_apagar, false)
  WHERE id = p_id AND organization_id = p_org RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Equipamento não encontrado.' USING ERRCODE = 'CT003'; END IF;
  RETURN v_id;
END $$;

-- Perfis de mão de obra (ops_skill)
CREATE OR REPLACE FUNCTION public.cat_guardar_perfil(p_org uuid, p_id uuid, p_nome text, p_salario_referencia numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'services.edit');
  IF p_id IS NULL THEN
    INSERT INTO ops_skill (organization_id, nome, ativo, salario_referencia) VALUES (p_org, btrim(p_nome), true, p_salario_referencia)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  UPDATE ops_skill SET nome = btrim(p_nome), salario_referencia = p_salario_referencia WHERE id = p_id AND organization_id = p_org RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Perfil não encontrado.' USING ERRCODE = 'CT003'; END IF;
  RETURN v_id;
END $$;

-- Árvore do Catálogo (service_categories, dois níveis)
CREATE OR REPLACE FUNCTION public.cat_guardar_categoria(p_org uuid, p_id uuid, p_nome text, p_pai uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := public.fn_cat_exigir(p_org, 'services.edit'); v_id uuid; v_slug text;
BEGIN
  IF length(btrim(coalesce(p_nome, ''))) = 0 THEN RAISE EXCEPTION 'O nome é obrigatório.' USING ERRCODE = 'CT002'; END IF;
  IF p_pai IS NOT NULL AND NOT EXISTS (SELECT 1 FROM service_categories WHERE id = p_pai AND organization_id = p_org AND parent_id IS NULL AND NOT is_deleted) THEN
    RAISE EXCEPTION 'O pai tem de ser um ofício desta organização (a árvore só tem dois níveis).' USING ERRCODE = 'CT002';
  END IF;
  IF EXISTS (SELECT 1 FROM service_categories WHERE organization_id = p_org AND NOT is_deleted AND lower(name) = lower(btrim(p_nome))
             AND parent_id IS NOT DISTINCT FROM p_pai AND id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'Já existe "%" neste ramo.', btrim(p_nome) USING ERRCODE = 'CT002';
  END IF;
  IF p_id IS NULL THEN
    v_slug := 'cat-' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO service_categories (organization_id, parent_id, name, slug, is_active, created_by, sort_order)
    VALUES (p_org, p_pai, btrim(p_nome), v_slug, true, v_user,
            coalesce((SELECT max(sort_order) + 1 FROM service_categories WHERE organization_id = p_org AND parent_id IS NOT DISTINCT FROM p_pai), 0))
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  UPDATE service_categories SET name = btrim(p_nome), updated_at = now() WHERE id = p_id AND organization_id = p_org RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Ramo não encontrado.' USING ERRCODE = 'CT003'; END IF;
  RETURN v_id;
END $$;

-- Um serviço do Catálogo com a receita inteira (mão de obra, equipamentos, consumíveis) e o preço.
-- p_mo:      [{"nome":..,"perfil_id":..,"minutos_fixos":..,"minutos_por_unidade":..,"fase":..}]   (vai para ops_obra_servico_tarefa)
-- p_equip:   [{"equipamento_id":..,"horas":..}]
-- p_cons:    [{"product_id":..,"quantidade":..,"opcional":..}]
-- Os parâmetros jsonb são só a forma de mandar listas; cada elemento fica numa linha da sua tabela.
CREATE OR REPLACE FUNCTION public.cat_guardar_servico(
  p_org uuid, p_id uuid, p_nome text, p_sku text, p_unidade text, p_categoria_id uuid, p_subcategoria_id uuid,
  p_linhas text[], p_medida text, p_modo_preco text, p_preco_tabela numeric, p_margem numeric, p_justificacao text,
  p_fases smallint[], p_mo jsonb, p_equip jsonb, p_cons jsonb, p_nota_preco text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := public.fn_cat_exigir(p_org, 'services.edit'); v_id uuid; v_preco_atual numeric; e jsonb; i integer := 0;
BEGIN
  IF length(btrim(coalesce(p_nome, ''))) = 0 THEN RAISE EXCEPTION 'O nome é obrigatório.' USING ERRCODE = 'CT002'; END IF;
  IF p_modo_preco = 'tabela' AND coalesce(p_preco_tabela, 0) <= 0 THEN RAISE EXCEPTION 'O preço de tabela tem de ser maior que zero.' USING ERRCODE = 'CT002'; END IF;
  IF p_modo_preco = 'margem' AND p_margem IS NULL THEN RAISE EXCEPTION 'Falta a margem.' USING ERRCODE = 'CT002'; END IF;
  IF jsonb_array_length(coalesce(p_mo, '[]')) = 0 THEN RAISE EXCEPTION 'A receita precisa de pelo menos um passo de mão de obra.' USING ERRCODE = 'CT002'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO services (organization_id, name, slug, sku, service_category_id, service_subcategory_id, service_type, created_by, is_active,
      unidade, linhas, medida, modo_preco, margem, justificacao_preco, fases, receita_origem, no_catalogo)
    VALUES (p_org, btrim(p_nome), 'svc-' || replace(gen_random_uuid()::text, '-', ''),
      coalesce(nullif(btrim(p_sku), ''), 'SVC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
      p_categoria_id, p_subcategoria_id, 'sale', v_user, true,
      p_unidade, coalesce(p_linhas, '{}'), p_medida, p_modo_preco, p_margem, p_justificacao, coalesce(p_fases, '{}'), 'editada', true)
    RETURNING id INTO v_id;
  ELSE
    UPDATE services SET name = btrim(p_nome), sku = coalesce(nullif(btrim(p_sku), ''), sku), service_category_id = p_categoria_id,
      service_subcategory_id = p_subcategoria_id, unidade = p_unidade, linhas = coalesce(p_linhas, '{}'), medida = p_medida,
      modo_preco = p_modo_preco, margem = p_margem, justificacao_preco = p_justificacao, fases = coalesce(p_fases, '{}'),
      receita_origem = 'editada', no_catalogo = true, updated_at = now()
    WHERE id = p_id AND organization_id = p_org AND NOT is_deleted RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Serviço não encontrado.' USING ERRCODE = 'CT003'; END IF;
  END IF;

  -- mão de obra: os passos da receita (as Operações planeiam a obra com estes mesmos passos)
  DELETE FROM ops_obra_servico_tarefa WHERE organization_id = p_org AND servico_id = v_id;
  FOR e IN SELECT * FROM jsonb_array_elements(p_mo) LOOP
    i := i + 1;
    IF (e->>'perfil_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ops_skill WHERE id = (e->>'perfil_id')::uuid AND organization_id = p_org) THEN
      RAISE EXCEPTION 'Perfil desconhecido nesta organização.' USING ERRCODE = 'CT002';
    END IF;
    IF coalesce((e->>'minutos_fixos')::integer, 0) <= 0 AND coalesce((e->>'minutos_por_unidade')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Cada passo de mão de obra precisa de minutos (fixos ou por unidade).' USING ERRCODE = 'CT002';
    END IF;
    INSERT INTO ops_obra_servico_tarefa (organization_id, servico_id, ordem, nome, fase, minutos_fixos, minutos_por_unidade, pessoas, skill_id, origem, medida, atualizado_por)
    VALUES (p_org, v_id, i, btrim(e->>'nome'), coalesce((e->>'fase')::smallint, 1),
      coalesce((e->>'minutos_fixos')::integer, 0), coalesce((e->>'minutos_por_unidade')::numeric, 0), 1,
      (e->>'perfil_id')::uuid, 'manual', coalesce(p_medida, 'qt'), v_user);
  END LOOP;

  -- equipamentos
  DELETE FROM cat_servico_equipamentos WHERE service_id = v_id;
  i := 0;
  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(p_equip, '[]')) LOOP
    i := i + 1;
    INSERT INTO cat_servico_equipamentos (organization_id, service_id, equipamento_id, horas, ordem)
    VALUES (p_org, v_id, (e->>'equipamento_id')::uuid, (e->>'horas')::numeric, i);
  END LOOP;

  -- consumíveis (a tabela antiga não deixa apagar: marca-se como apagado)
  UPDATE service_materials SET deleted_at = now(), deleted_by = v_user WHERE service_id = v_id AND deleted_at IS NULL;
  i := 0;
  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(p_cons, '[]')) LOOP
    i := i + 1;
    IF NOT EXISTS (SELECT 1 FROM products WHERE id = (e->>'product_id')::uuid AND organization_id = p_org AND tipo_catalogo IS NOT NULL) THEN
      RAISE EXCEPTION 'Consumível desconhecido nesta organização.' USING ERRCODE = 'CT002';
    END IF;
    INSERT INTO service_materials (organization_id, service_id, product_id, quantity, opcional, sort_order, created_by)
    VALUES (p_org, v_id, (e->>'product_id')::uuid, (e->>'quantidade')::numeric, coalesce((e->>'opcional')::boolean, false), i, v_user);
  END LOOP;

  -- preço de tabela: uma linha nova só quando muda (é o histórico)
  IF p_modo_preco = 'tabela' THEN
    SELECT price INTO v_preco_atual FROM service_prices WHERE service_id = v_id AND price_type = 'retail' ORDER BY valid_from DESC NULLS LAST, created_at DESC LIMIT 1;
    IF v_preco_atual IS DISTINCT FROM round(p_preco_tabela, 2) THEN
      INSERT INTO service_prices (service_id, price_type, price, currency, valid_from, created_by, nota)
      VALUES (v_id, 'retail', round(p_preco_tabela, 2), 'EUR', current_date, v_user, p_nota_preco);
    END IF;
  END IF;
  RETURN v_id;
END $$;

-- Um produto ou consumível do Catálogo. O custo à mão (sem fornecedor ligado) e o PVP vão para product_prices.
CREATE OR REPLACE FUNCTION public.cat_guardar_produto(
  p_org uuid, p_id uuid, p_tipo text, p_nome text, p_sku text, p_unidade text, p_categoria_id uuid,
  p_custo numeric, p_custo_data date, p_pvp numeric, p_servico_id uuid, p_fator_servico numeric,
  p_entulho_m3 numeric DEFAULT NULL, p_entulho_kg numeric DEFAULT NULL, p_descricao text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := public.fn_cat_exigir(p_org, 'products.edit'); v_id uuid; v_atual numeric;
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
      btrim(p_nome), 'active', true, p_tipo = 'produto', true, false, false, false,
      v_user, p_tipo, p_unidade, p_categoria_id, p_servico_id, coalesce(p_fator_servico, 1), p_entulho_m3, p_entulho_kg, p_descricao)
    RETURNING id INTO v_id;
  ELSE
    UPDATE products SET name = btrim(p_nome), sku = coalesce(nullif(btrim(p_sku), ''), sku), tipo_catalogo = p_tipo, unidade = p_unidade,
      catalogo_categoria_id = p_categoria_id, servico_id = p_servico_id, fator_servico = coalesce(p_fator_servico, 1),
      entulho_m3 = p_entulho_m3, entulho_kg = p_entulho_kg, short_description = p_descricao, is_sellable = p_tipo = 'produto', updated_at = now()
    WHERE id = p_id AND organization_id = p_org AND NOT is_deleted RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  END IF;
  IF p_custo IS NOT NULL THEN
    SELECT price INTO v_atual FROM product_prices WHERE product_id = v_id AND price_type = 'purchase' ORDER BY valid_from DESC NULLS LAST, created_at DESC LIMIT 1;
    IF v_atual IS DISTINCT FROM round(p_custo, 2) THEN
      INSERT INTO product_prices (product_id, currency, price, valid_from, created_by, price_type)
      VALUES (v_id, 'EUR', round(p_custo, 2), coalesce(p_custo_data, current_date), v_user, 'purchase');
    END IF;
  END IF;
  IF p_pvp IS NOT NULL THEN
    SELECT price INTO v_atual FROM product_prices WHERE product_id = v_id AND price_type = 'retail' ORDER BY valid_from DESC NULLS LAST, created_at DESC LIMIT 1;
    IF v_atual IS DISTINCT FROM round(p_pvp, 2) THEN
      INSERT INTO product_prices (product_id, currency, price, valid_from, created_by, price_type)
      VALUES (v_id, 'EUR', round(p_pvp, 2), current_date, v_user, 'retail');
    END IF;
  END IF;
  RETURN v_id;
END $$;

-- Ligar um produto do Catálogo ao artigo de um fornecedor (o que ele carrega no portal). O custo passa a vir de lá.
CREATE OR REPLACE FUNCTION public.cat_ligar_produto_artigo(p_org uuid, p_product_id uuid, p_supplier_id uuid, p_catalog_item_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := public.fn_cat_exigir(p_org, 'products.edit'); v_id uuid; a record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id AND organization_id = p_org AND NOT is_deleted) THEN
    RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM suppliers WHERE id = p_supplier_id AND organization_id = p_org AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Fornecedor não encontrado.' USING ERRCODE = 'CT003';
  END IF;
  SELECT * INTO a FROM supplier_catalog_items WHERE id = p_catalog_item_id AND is_active;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Artigo do fornecedor não encontrado.' USING ERRCODE = 'CT003'; END IF;
  -- o artigo tem de ser deste fornecedor (a conta do portal ligada a este fornecedor da organização)
  IF NOT EXISTS (SELECT 1 FROM supplier_account_links l WHERE l.supplier_account_id = a.supplier_account_id AND l.supplier_id = p_supplier_id
                 AND l.organization_id = p_org AND l.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'O artigo não é deste fornecedor.' USING ERRCODE = 'CT002';
  END IF;
  UPDATE item_suppliers SET is_preferred = false, updated_at = now()
  WHERE product_id = p_product_id AND organization_id = p_org AND is_preferred AND deleted_at IS NULL;
  SELECT id INTO v_id FROM item_suppliers WHERE product_id = p_product_id AND supplier_id = p_supplier_id AND organization_id = p_org AND deleted_at IS NULL LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO item_suppliers (organization_id, item_type, product_id, supplier_id, supplier_sku, purchase_price, currency, lead_time_days, moq,
      is_preferred, is_active, created_by, catalog_item_id, preco_data)
    VALUES (p_org, 'product', p_product_id, p_supplier_id, a.supplier_ref,
      round(a.base_price / nullif(coalesce(a.units_per_pack, 1), 0), 2), coalesce(a.currency, 'EUR'), a.lead_time_days, a.moq,
      true, true, v_user, a.id, a.updated_at::date)
    RETURNING id INTO v_id;
  ELSE
    UPDATE item_suppliers SET supplier_sku = a.supplier_ref, purchase_price = round(a.base_price / nullif(coalesce(a.units_per_pack, 1), 0), 2),
      lead_time_days = a.lead_time_days, moq = a.moq, is_preferred = true, is_active = true, catalog_item_id = a.id,
      preco_data = a.updated_at::date, updated_at = now()
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;

-- Permissões das funções: só quem tem sessão; cada uma verifica a permissão na organização (fn_cat_exigir).
DO $do$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.cat_guardar_parametros(uuid,numeric,numeric,numeric,numeric,numeric,integer,numeric,numeric,numeric,numeric,numeric)',
    'public.cat_guardar_estrutura(uuid,uuid,text,text,numeric,boolean,boolean)',
    'public.cat_guardar_equipamento(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,boolean)',
    'public.cat_guardar_perfil(uuid,uuid,text,numeric)',
    'public.cat_guardar_categoria(uuid,uuid,text,uuid)',
    'public.cat_guardar_servico(uuid,uuid,text,text,text,uuid,uuid,text[],text,text,numeric,numeric,text,smallint[],jsonb,jsonb,jsonb,text)',
    'public.cat_guardar_produto(uuid,uuid,text,text,text,text,uuid,numeric,date,numeric,uuid,numeric,numeric,numeric,text)',
    'public.cat_ligar_produto_artigo(uuid,uuid,uuid,uuid)'] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION ' || f || ' FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || f || ' TO authenticated, service_role';
  END LOOP;
END $do$;

RESET lock_timeout;
