-- Catálogo e custos: nove ajustes à 20261231910000 (só acrescenta; as funções mudadas nasceram na 910000 e ninguém as usa ainda).
--
-- 1. A vida útil de um equipamento é em HORAS (a Emylia: amortização por hora = (compra − residual) ÷ vida).
--    Entra cat_equipamentos.vida_horas, que passa a ser a que conta. A vida_anos fica preenchida com o equivalente
--    (vida_horas ÷ uso_ano_horas) para quem a ler. A cat_guardar_equipamento ganha uma versão com as horas.
-- 2. Uma subempreitada não tem passos de mão de obra (o custo é o do subempreiteiro): a cat_guardar_servico deixa de exigir
--    pelo menos um passo. Mesma assinatura; muda só essa verificação.
-- 3. product_prices só aceita um preço por produto, moeda e valid_from, seja qual for o tipo (product_prices_product_id_currency_valid_from_key):
--    o custo e o PVP gravados no mesmo dia chocavam. Cada preço novo leva agora a hora do momento (a data do custo, se vier, à hora de agora).
-- 4. A chave de cada serviço e de cada perfil (services.chave, ops_skill.chave), única na organização: o código por que o motor da Emylia
--    os chama (demol, canal, c12, s-<sku>; canalizador, ladrilhador…). Os modelos de casa de banho e cozinha usam estes códigos. Sem chave
--    escrita, fica o próprio id.
-- 5. A marca e o nome do fornecedor em texto (products.marca_livre, products.fornecedor_livre), como a Emylia os mostra, enquanto o
--    produto não está ligado a um fornecedor da base (por ligar). Ligado, vale o fornecedor de item_suppliers.
-- 6. cat_ler_catalogo(org): o Catálogo inteiro da organização numa só leitura (as linhas de cada tabela), para o ecrã montar o
--    Catálogo da Emylia. Uma função e não várias leituras porque são milhares de linhas (o PostgREST corta às 1000) e porque as
--    tabelas têm regras de leitura diferentes. Pede services.view na organização. O jsonb é só o transporte; nada fica guardado em JSON.
-- 7. product_prices.preco_exato (6 casas): os consumíveis têm preços por unidade com mais de 2 casas (ex.: 0,0135 €/un) e o price da
--    tabela só guarda 2. O custo usa o exato quando existe; o price fica arredondado, como sempre.
-- 8. service_materials.quantidade_exata (6 casas): as quantidades dos consumíveis por unidade de serviço têm 3 casas (ex.: 0,738)
--    e a quantity só guarda 2. A receita usa a exata quando existe.
-- 9. Três escritas que faltavam ao ecrã do Catálogo: cat_guardar_servico_detalhes (ícone, produto exigido e quantidade, pergunta,
--    entulho, chave e unidade), cat_guardar_produto_texto (marca e fornecedor em texto) e cat_apagar_categoria (marca o ramo apagado).

SET lock_timeout = '5s';

ALTER TABLE public.cat_equipamentos ADD COLUMN IF NOT EXISTS vida_horas numeric(12,1) CHECK (vida_horas IS NULL OR vida_horas > 0);
COMMENT ON COLUMN public.cat_equipamentos.vida_horas IS 'Vida útil em horas de uso. €/h = (compra − residual) ÷ vida_horas + manutenção/ano ÷ uso/ano. Sem ela, vida_anos × uso_ano_horas.';
COMMENT ON TABLE public.cat_equipamentos IS 'Catálogo e custos: os equipamentos. €/h = (compra − residual) ÷ vida_horas + manutenção/ano ÷ uso/ano (vida_horas em falta = vida_anos × uso_ano_horas).';

CREATE OR REPLACE FUNCTION public.cat_guardar_equipamento_horas(p_org uuid, p_id uuid, p_nome text, p_compra numeric, p_vida_horas numeric,
  p_residual numeric, p_manutencao_ano numeric, p_uso_ano_horas numeric, p_apagar boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_anos numeric;
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'services.edit');
  IF coalesce(p_vida_horas, 0) <= 0 OR coalesce(p_uso_ano_horas, 0) <= 0 THEN
    RAISE EXCEPTION 'A vida útil e o uso por ano têm de ser maiores que zero.' USING ERRCODE = 'CT002';
  END IF;
  v_anos := greatest(0.01, round(p_vida_horas / p_uso_ano_horas, 2));
  IF p_id IS NULL THEN
    INSERT INTO cat_equipamentos (organization_id, nome, compra, vida_anos, vida_horas, residual, manutencao_ano, uso_ano_horas)
    VALUES (p_org, btrim(p_nome), p_compra, v_anos, p_vida_horas, coalesce(p_residual, 0), coalesce(p_manutencao_ano, 0), p_uso_ano_horas)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  UPDATE cat_equipamentos SET nome = btrim(p_nome), compra = p_compra, vida_anos = v_anos, vida_horas = p_vida_horas,
    residual = coalesce(p_residual, 0), manutencao_ano = coalesce(p_manutencao_ano, 0), uso_ano_horas = p_uso_ano_horas,
    apagado_em = CASE WHEN p_apagar THEN now() ELSE NULL END, ativo = NOT coalesce(p_apagar, false)
  WHERE id = p_id AND organization_id = p_org RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Equipamento não encontrado.' USING ERRCODE = 'CT003'; END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.cat_guardar_equipamento_horas(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_guardar_equipamento_horas(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,boolean) TO authenticated, service_role;

-- 2. cat_guardar_servico: a mesma assinatura; sem a obrigação de um passo de mão de obra e com a quantidade exata dos consumíveis (ajuste 8)
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
  -- uma subempreitada não tem passos de mão de obra (20261231920000)

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
    INSERT INTO service_materials (organization_id, service_id, product_id, quantity, quantidade_exata, opcional, sort_order, created_by)
    VALUES (p_org, v_id, (e->>'product_id')::uuid, round((e->>'quantidade')::numeric, 2), round((e->>'quantidade')::numeric, 6),
      coalesce((e->>'opcional')::boolean, false), i, v_user);
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

-- 3. cat_guardar_produto: a mesma assinatura e as mesmas regras; só muda o valid_from dos preços.
-- Cada preço novo fica sempre depois do último preço do produto (de qualquer tipo): nunca choca com a chave única.
CREATE OR REPLACE FUNCTION public.fn_cat_depois_do_ultimo_preco(p_product uuid) RETURNS timestamptz
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(max(valid_from) + interval '1 microsecond', '-infinity'::timestamptz) FROM product_prices WHERE product_id = p_product
$$;
REVOKE ALL ON FUNCTION public.fn_cat_depois_do_ultimo_preco(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cat_guardar_produto(
  p_org uuid, p_id uuid, p_tipo text, p_nome text, p_sku text, p_unidade text, p_categoria_id uuid,
  p_custo numeric, p_custo_data date, p_pvp numeric, p_servico_id uuid, p_fator_servico numeric,
  p_entulho_m3 numeric DEFAULT NULL, p_entulho_kg numeric DEFAULT NULL, p_descricao text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

-- 4. Chaves
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS chave text CHECK (chave IS NULL OR length(btrim(chave)) BETWEEN 1 AND 80);
ALTER TABLE public.ops_skill ADD COLUMN IF NOT EXISTS chave text CHECK (chave IS NULL OR length(btrim(chave)) BETWEEN 1 AND 80);
COMMENT ON COLUMN public.services.chave IS 'O código do serviço no motor da Emylia (demol, canal, c12, s-<sku>…), único na organização. Sem ele, o id.';
COMMENT ON COLUMN public.ops_skill.chave IS 'O código do perfil no motor da Emylia (canalizador, ladrilhador…), único na organização. Sem ele, o id.';
CREATE UNIQUE INDEX IF NOT EXISTS services_org_chave_key ON public.services (organization_id, chave) WHERE chave IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ops_skill_org_chave_key ON public.ops_skill (organization_id, chave) WHERE chave IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_cat_chave_por_omissao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.chave IS NULL OR btrim(NEW.chave) = '' THEN NEW.chave := NEW.id::text; END IF;
  RETURN NEW;
END $$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'services_cat_chave' AND tgrelid = 'public.services'::regclass) THEN
    CREATE TRIGGER services_cat_chave BEFORE INSERT ON public.services FOR EACH ROW WHEN (NEW.no_catalogo) EXECUTE FUNCTION public.fn_cat_chave_por_omissao();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ops_skill_cat_chave' AND tgrelid = 'public.ops_skill'::regclass) THEN
    CREATE TRIGGER ops_skill_cat_chave BEFORE INSERT ON public.ops_skill FOR EACH ROW EXECUTE FUNCTION public.fn_cat_chave_por_omissao();
  END IF;
END $do$;

-- 5. Marca e fornecedor em texto
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS marca_livre text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS fornecedor_livre text;
COMMENT ON COLUMN public.products.fornecedor_livre IS 'O nome do fornecedor em texto, enquanto o produto está por ligar. Ligado, vale o fornecedor de item_suppliers.';

-- 8. Quantidade exata
ALTER TABLE public.service_materials ADD COLUMN IF NOT EXISTS quantidade_exata numeric(14,6) CHECK (quantidade_exata IS NULL OR quantidade_exata >= 0);
COMMENT ON COLUMN public.service_materials.quantidade_exata IS 'A quantidade sem arredondar (até 6 casas). quantity fica com 2; a receita do Catálogo usa esta quando existe.';

-- 7. Preço exato
ALTER TABLE public.product_prices ADD COLUMN IF NOT EXISTS preco_exato numeric(14,6) CHECK (preco_exato IS NULL OR preco_exato >= 0);
COMMENT ON COLUMN public.product_prices.preco_exato IS 'O preço sem arredondar (até 6 casas). price fica com 2 casas; o custo do Catálogo usa este quando existe.';

-- 6. Ler o Catálogo da organização
CREATE OR REPLACE FUNCTION public.cat_ler_catalogo(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'services.view');
  WITH svc AS (SELECT * FROM services WHERE organization_id = p_org AND no_catalogo AND NOT is_deleted),
       prod AS (SELECT * FROM products WHERE organization_id = p_org AND tipo_catalogo IS NOT NULL AND NOT is_deleted)
  SELECT jsonb_build_object(
    'parametros', (SELECT to_jsonb(x) FROM (SELECT meses, tsu, seguros_ano, horas_ano, horas_mes, meses_desatualizado, margem_minima, margem_alvo
                    FROM cat_parametros WHERE organization_id = p_org) x),
    'margemLinha', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT linha, margem_minima FROM cat_margem_linha WHERE organization_id = p_org) x), '[]'),
    'categorias', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, name, parent_id, sort_order FROM service_categories
                    WHERE organization_id = p_org AND NOT is_deleted) x), '[]'),
    'perfis', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, chave, nome, salario_referencia, ativo FROM ops_skill WHERE organization_id = p_org) x), '[]'),
    'equipamentos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, nome, compra, vida_anos, vida_horas, residual, manutencao_ano, uso_ano_horas, ativo
                    FROM cat_equipamentos WHERE organization_id = p_org AND apagado_em IS NULL) x), '[]'),
    'estrutura', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, nome, categoria, mensal, ativo, ordem FROM cat_estrutura
                    WHERE organization_id = p_org AND apagado_em IS NULL) x), '[]'),
    'servicos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, chave, name, sku, unidade, service_category_id, service_subcategory_id, linhas, medida,
                    modo_preco, margem, justificacao_preco, fases, receita_origem, icone, exige_produto_categoria_id, exige_produto_medida,
                    exige_produto_fator, exige_produto_arredondar, pergunta_manter, entulho_modo, entulho_m3, entulho_kg FROM svc) x), '[]'),
    'precosServico', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT sp.service_id, sp.price, sp.valid_from, sp.nota, sp.vat_rate, sp.created_at
                    FROM service_prices sp JOIN svc ON svc.id = sp.service_id WHERE sp.price_type = 'retail') x), '[]'),
    'passos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT t.servico_id, t.ordem, t.nome, t.minutos_por_unidade, t.minutos_fixos, t.skill_id, t.fase
                    FROM ops_obra_servico_tarefa t JOIN svc ON svc.id = t.servico_id WHERE t.organization_id = p_org) x), '[]'),
    'usosEquip', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT service_id, equipamento_id, horas, ordem FROM cat_servico_equipamentos
                    WHERE organization_id = p_org) x), '[]'),
    'usosCons', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT m.service_id, m.product_id, coalesce(m.quantidade_exata, m.quantity) AS quantity, m.opcional, m.sort_order
                    FROM service_materials m JOIN svc ON svc.id = m.service_id WHERE m.deleted_at IS NULL) x), '[]'),
    'produtos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, name, sku, tipo_catalogo, unidade, catalogo_categoria_id, servico_id, fator_servico,
                    entulho_m3, entulho_kg, short_description, marca_livre, fornecedor_livre FROM prod) x), '[]'),
    'precosProduto', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT pp.product_id, pp.price_type::text AS price_type, coalesce(pp.preco_exato, pp.price) AS price, pp.valid_from
                    FROM product_prices pp JOIN prod ON prod.id = pp.product_id) x), '[]'),
    'fornecedores', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT v.product_id, v.purchase_price, v.preco_data, v.ligacao, su.name AS fornecedor
                    FROM cat_v_produto_fornecedor v LEFT JOIN suppliers su ON su.id = v.supplier_id WHERE v.organization_id = p_org) x), '[]'),
    'tecnicos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT up.utilizador_id AS id, coalesce(u.name, u.email, '') AS nome, up.custo_hora,
                    coalesce((SELECT array_agg(us.skill_id) FROM ops_utilizador_skill us JOIN ops_skill sk ON sk.id = us.skill_id
                              WHERE us.utilizador_id = up.utilizador_id AND sk.organization_id = p_org), '{}') AS perfis
                    FROM ops_utilizador_perfil up LEFT JOIN anew_users u ON u.id = up.utilizador_id
                    WHERE up.organization_id = p_org AND up.ativo AND up.funcao = 'tecnico') x), '[]')
  ) INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.cat_ler_catalogo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_catalogo(uuid) TO authenticated, service_role;

-- 9. Escritas que faltavam
CREATE OR REPLACE FUNCTION public.cat_guardar_servico_detalhes(p_org uuid, p_id uuid, p_chave text, p_unidade text, p_icone text,
  p_exige_categoria_id uuid, p_exige_medida text, p_exige_fator numeric, p_exige_arredondar boolean, p_pergunta_manter text,
  p_entulho_modo text, p_entulho_m3 numeric, p_entulho_kg numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'services.edit');
  IF p_exige_categoria_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM service_categories WHERE id = p_exige_categoria_id AND organization_id = p_org AND NOT is_deleted) THEN
    RAISE EXCEPTION 'Ramo desconhecido nesta organização.' USING ERRCODE = 'CT002';
  END IF;
  UPDATE services SET chave = coalesce(nullif(btrim(p_chave), ''), chave), unidade = coalesce(p_unidade, unidade), icone = p_icone,
    exige_produto_categoria_id = p_exige_categoria_id, exige_produto_medida = p_exige_medida, exige_produto_fator = p_exige_fator,
    exige_produto_arredondar = coalesce(p_exige_arredondar, false), pergunta_manter = nullif(btrim(coalesce(p_pergunta_manter, '')), ''),
    entulho_modo = p_entulho_modo, entulho_m3 = p_entulho_m3, entulho_kg = p_entulho_kg, updated_at = now()
  WHERE id = p_id AND organization_id = p_org AND NOT is_deleted RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Serviço não encontrado.' USING ERRCODE = 'CT003'; END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.cat_guardar_produto_texto(p_org uuid, p_id uuid, p_marca text, p_fornecedor text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'products.edit');
  UPDATE products SET marca_livre = nullif(btrim(coalesce(p_marca, '')), ''), fornecedor_livre = nullif(btrim(coalesce(p_fornecedor, '')), ''), updated_at = now()
  WHERE id = p_id AND organization_id = p_org AND NOT is_deleted RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  RETURN v_id;
END $$;

-- Tira um ramo da árvore (e os subs dele): fica marcado como apagado; o que o usava fica sem ramo.
CREATE OR REPLACE FUNCTION public.cat_apagar_categoria(p_org uuid, p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := public.fn_cat_exigir(p_org, 'services.edit'); v_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_ids FROM service_categories WHERE organization_id = p_org AND NOT is_deleted AND (id = p_id OR parent_id = p_id);
  IF v_ids IS NULL THEN RAISE EXCEPTION 'Ramo não encontrado.' USING ERRCODE = 'CT003'; END IF;
  UPDATE service_categories SET is_deleted = true, deleted_at = now(), deleted_by = v_user WHERE id = ANY (v_ids);
  UPDATE services SET service_subcategory_id = NULL WHERE organization_id = p_org AND service_subcategory_id = ANY (v_ids);
  UPDATE services SET service_category_id = NULL WHERE organization_id = p_org AND service_category_id = ANY (v_ids);
  UPDATE services SET exige_produto_categoria_id = NULL WHERE organization_id = p_org AND exige_produto_categoria_id = ANY (v_ids);
  UPDATE products SET catalogo_categoria_id = NULL WHERE organization_id = p_org AND catalogo_categoria_id = ANY (v_ids);
END $$;

DO $do$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.cat_guardar_servico_detalhes(uuid,uuid,text,text,text,uuid,text,numeric,boolean,text,text,numeric,numeric)',
    'public.cat_guardar_produto_texto(uuid,uuid,text,text)',
    'public.cat_apagar_categoria(uuid,uuid)'] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION ' || f || ' FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || f || ' TO authenticated, service_role';
  END LOOP;
END $do$;

RESET lock_timeout;
