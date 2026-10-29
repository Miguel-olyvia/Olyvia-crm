-- Negócio (29/10/2026): as linhas do modelo saem do código e os materiais do modelo entram na encomenda de cliente.
--
-- O problema:
--   1. A ligação necessidade, serviço e medida de cada linha de negócio (Casa de banho, Cozinha, Remodelação geral) estava fixa no
--      código (LINHAS em src/emylia/motor.ts): os serviços do pacote e a medida de cada um, as medidas a pedir na visita, as
--      necessidades, a estimativa de materiais e os materiais do modelo.
--   2. Os materiais do modelo (calcMats) iam ao orçamento como uma só linha "materiais_modelo", sem produto. A encomenda de cliente
--      (reserva FIFO, baixa e "pedir o que falta" ao fornecedor) só vê linhas com product_id, por isso nunca os pedia.
--
-- O que muda (a base só cresce; nada se apaga):
--   1. neg_linhas_modelo              a linha de negócio da organização (chave wc, coz, geral), o modelo, as necessidades e a estimativa.
--      neg_linha_modelo_medidas       as medidas a pedir na visita (pav, par, pts, pcs) e o rótulo.
--      neg_linha_modelo_servicos      os serviços do pacote (services) e a medida que dá a quantidade de cada um.
--      neg_linha_modelo_partes        as partes da estimativa de materiais (peso, ramo do Catálogo, serviços que a tiram).
--      neg_linha_modelo_materiais     os materiais do modelo: a regra da quantidade (arredonda para cima: fixo + fator × soma das
--                                     medidas), a parte da estimativa a que pertencem e o produto do Catálogo (products).
--   2. Os 7 materiais do modelo passam a produtos do Catálogo (decisão do Rúben, 29/10), nas categorias que a organização já tem.
--      Sem custo: o modelo só tem a estimativa do conjunto. O custo e o fornecedor põem-se na ficha do produto.
--   3. quote_lines.tipo_emylia aceita 'material_modelo': uma linha por material, com o produto e a quantidade, a preço 0 (o preço
--      continua na linha "materiais_modelo"). É por elas que a encomenda de cliente reserva e pede ao fornecedor.
--   4. neg_ler_linhas_modelo(org)     a leitura (services.view, como o cat_ler_catalogo).
--      neg_ligar_material_modelo      troca o produto de um material (products.edit).
--   5. As linhas da organização que já tem o Catálogo da Emylia (os serviços com chave 'demol') semeiam-se com o que estava no código.
--
-- Erros: CT001 sem permissão; CT002 dados inválidos; CT003 não encontrado nesta organização.
SET lock_timeout = '5s';

-- ------------------------------------------------------------------ 1. as tabelas
CREATE TABLE IF NOT EXISTS public.neg_linhas_modelo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE RESTRICT,
  chave text NOT NULL CHECK (chave IN ('wc', 'coz', 'geral')),
  nome text NOT NULL,
  modelo text NOT NULL,
  necessidades text[] NOT NULL DEFAULT '{}',
  mat_descricao text NOT NULL DEFAULT 'materiais',
  mat_custo numeric NOT NULL DEFAULT 0 CHECK (mat_custo >= 0),
  mat_preco numeric NOT NULL DEFAULT 0 CHECK (mat_preco >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neg_linhas_modelo_unica UNIQUE (organization_id, chave),
  CONSTRAINT neg_linhas_modelo_id_org UNIQUE (id, organization_id)
);
COMMENT ON TABLE public.neg_linhas_modelo IS 'As linhas de negócio da Emylia (wc, coz, geral): modelo, necessidades e estimativa de materiais. Antes: LINHAS no motor.';

CREATE TABLE IF NOT EXISTS public.neg_linha_modelo_medidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  linha_id uuid NOT NULL,
  ordem smallint NOT NULL,
  medida text NOT NULL CHECK (medida IN ('pav', 'par', 'pts', 'pcs')),
  rotulo text NOT NULL,
  CONSTRAINT neg_linha_modelo_medidas_linha_fkey FOREIGN KEY (linha_id, organization_id) REFERENCES public.neg_linhas_modelo(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT neg_linha_modelo_medidas_unica UNIQUE (linha_id, medida)
);
COMMENT ON TABLE public.neg_linha_modelo_medidas IS 'As medidas que a visita pede para a linha de negócio, com o rótulo.';

CREATE TABLE IF NOT EXISTS public.neg_linha_modelo_servicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  linha_id uuid NOT NULL,
  ordem smallint NOT NULL,
  servico_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  medida text NOT NULL CHECK (medida IN ('pav', 'par', 'pts', 'pcs')),
  CONSTRAINT neg_linha_modelo_servicos_linha_fkey FOREIGN KEY (linha_id, organization_id) REFERENCES public.neg_linhas_modelo(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT neg_linha_modelo_servicos_unica UNIQUE (linha_id, servico_id)
);
COMMENT ON TABLE public.neg_linha_modelo_servicos IS 'Os serviços do pacote da linha de negócio e a medida da visita que dá a quantidade de cada um.';

CREATE TABLE IF NOT EXISTS public.neg_linha_modelo_partes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  linha_id uuid NOT NULL,
  ordem smallint NOT NULL,
  descricao text NOT NULL,
  peso numeric NOT NULL CHECK (peso >= 0 AND peso <= 1),
  ramo_oficio text,
  ramo_sub text,
  -- as chaves dos serviços (services.chave) cuja resposta "o cliente mantém" tira a parte
  manter text[] NOT NULL DEFAULT '{}',
  CONSTRAINT neg_linha_modelo_partes_linha_fkey FOREIGN KEY (linha_id, organization_id) REFERENCES public.neg_linhas_modelo(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT neg_linha_modelo_partes_unica UNIQUE (linha_id, descricao)
);
COMMENT ON TABLE public.neg_linha_modelo_partes IS 'As partes da estimativa de materiais da linha de negócio: peso, ramo do Catálogo que a cobre e serviços que a tiram.';

CREATE TABLE IF NOT EXISTS public.neg_linha_modelo_materiais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  linha_id uuid NOT NULL,
  ordem smallint NOT NULL,
  nome text NOT NULL,
  unidade text NOT NULL,
  -- a quantidade: ceil(fixo + fator × soma das medidas)
  medidas text[] NOT NULL DEFAULT '{}' CHECK (medidas <@ ARRAY['pav', 'par', 'pts', 'pcs']),
  fator numeric NOT NULL DEFAULT 0 CHECK (fator >= 0),
  fixo numeric NOT NULL DEFAULT 0 CHECK (fixo >= 0),
  stock_chave text NOT NULL,
  -- a parte da estimativa (neg_linha_modelo_partes.descricao): coberta por produtos escolhidos, mantida ou tirada, o material não se encomenda
  parte text,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  CONSTRAINT neg_linha_modelo_materiais_linha_fkey FOREIGN KEY (linha_id, organization_id) REFERENCES public.neg_linhas_modelo(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT neg_linha_modelo_materiais_unica UNIQUE (linha_id, stock_chave)
);
COMMENT ON TABLE public.neg_linha_modelo_materiais IS 'Os materiais do modelo da linha de negócio: regra da quantidade pelas medidas da visita e produto do Catálogo (vai à encomenda de cliente).';

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['neg_linhas_modelo', 'neg_linha_modelo_medidas', 'neg_linha_modelo_servicos', 'neg_linha_modelo_partes', 'neg_linha_modelo_materiais'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_ler', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), %L, organization_id)))',
      t || '_ler', t, 'services.view');
    -- sem políticas de escrita: grava-se pelas funções
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $do$;
CREATE INDEX IF NOT EXISTS neg_linha_modelo_materiais_produto_idx ON public.neg_linha_modelo_materiais (product_id);

-- ------------------------------------------------------------------ 2. quote_lines: uma linha por material do modelo
ALTER TABLE public.quote_lines DROP CONSTRAINT IF EXISTS quote_lines_tipo_emylia_check;
ALTER TABLE public.quote_lines ADD CONSTRAINT quote_lines_tipo_emylia_check
  CHECK (tipo_emylia IS NULL OR tipo_emylia IN ('servico', 'materiais_modelo', 'material_modelo', 'produto', 'livre'));

-- ------------------------------------------------------------------ 3. a semente (o que estava no código) e os produtos dos materiais
DO $do$
DECLARE
  o record; v_user uuid; v_l uuid; v_p uuid; m record;
  v_svc jsonb := '{"wc": [["demol","pav"],["canal","pts"],["revest","par"],["pav","pav"],["loucas","pcs"]],
                   "coz": [["demol","pav"],["canal","pts"],["revest","par"],["pav","pav"],["moveis","pcs"]]}';
  v_med jsonb := '{"wc": [["pav","Pavimento (m²)"],["par","Paredes (m²)"],["pts","Pontos de água"],["pcs","Vasos sanitários"]],
                   "coz": [["pav","Pavimento (m²)"],["par","Paredes (m²)"],["pts","Pontos de água"],["pcs","Módulos"]]}';
  x jsonb; i int;
BEGIN
  FOR o IN SELECT DISTINCT s.organization_id AS org FROM services s WHERE s.chave = 'demol' AND NOT s.is_deleted LOOP
    -- quem fica como autor dos produtos novos: quem criou o serviço da demolição
    SELECT s.created_by INTO v_user FROM services s WHERE s.organization_id = o.org AND s.chave = 'demol' AND NOT s.is_deleted ORDER BY s.created_at LIMIT 1;

    INSERT INTO neg_linhas_modelo (organization_id, chave, nome, modelo, necessidades, mat_descricao, mat_custo, mat_preco) VALUES
      (o.org, 'wc', 'Casa de banho', 'WC com base de duche', ARRAY['Base de duche', 'Sanita suspensa', 'Banheira', 'Móvel 80 cm'],
       'cerâmico, louças, base, torneiras', 1400, 2168),
      (o.org, 'coz', 'Cozinha', 'Cozinha linear', ARRAY['Bancada em pedra', 'Ilha', 'Eletrodomésticos', 'Mudar canalização'],
       'móveis, bancada, torneira', 3800, 5890),
      (o.org, 'geral', 'Remodelação geral', 'Sem modelo · serviços e produtos do Catálogo', '{}', 'materiais', 0, 0)
    ON CONFLICT (organization_id, chave) DO NOTHING;

    FOR v_l, x IN SELECT l.id, v_med->l.chave FROM neg_linhas_modelo l WHERE l.organization_id = o.org AND l.chave IN ('wc', 'coz') LOOP
      FOR i IN 0 .. jsonb_array_length(x) - 1 LOOP
        INSERT INTO neg_linha_modelo_medidas (organization_id, linha_id, ordem, medida, rotulo)
        VALUES (o.org, v_l, i + 1, x->i->>0, x->i->>1) ON CONFLICT (linha_id, medida) DO NOTHING;
      END LOOP;
    END LOOP;
    FOR v_l, x IN SELECT l.id, v_svc->l.chave FROM neg_linhas_modelo l WHERE l.organization_id = o.org AND l.chave IN ('wc', 'coz') LOOP
      FOR i IN 0 .. jsonb_array_length(x) - 1 LOOP
        INSERT INTO neg_linha_modelo_servicos (organization_id, linha_id, ordem, servico_id, medida)
        SELECT o.org, v_l, i + 1, s.id, x->i->>1 FROM services s
        WHERE s.organization_id = o.org AND s.chave = x->i->>0 AND NOT s.is_deleted
        ORDER BY s.created_at LIMIT 1
        ON CONFLICT (linha_id, servico_id) DO NOTHING;
      END LOOP;
    END LOOP;

    -- as partes da estimativa (o exemplo do protótipo, a confirmar com a Mudelar)
    INSERT INTO neg_linha_modelo_partes (organization_id, linha_id, ordem, descricao, peso, ramo_oficio, ramo_sub, manter)
    SELECT o.org, l.id, p.ordem, p.descricao, p.peso, p.oficio, p.sub, p.manter
    FROM neg_linhas_modelo l JOIN (VALUES
      ('wc', 1, 'cerâmico de parede', 0.25, 'Revestimentos', 'Parede', '{}'::text[]),
      ('wc', 2, 'pavimento', 0.15, 'Revestimentos', 'Pavimento', ARRAY['pav', 'c6']),
      ('wc', 3, 'louças, base e torneiras', 0.5, 'Canalização', 'Louças e torneiras', ARRAY['loucas', 'c13', 'c17']),
      ('wc', 4, 'colas e pequeno material', 0.1, NULL, NULL, '{}'),
      ('coz', 1, 'móveis e bancada', 0.7, 'Carpintaria', 'Mobiliário', ARRAY['moveis']),
      ('coz', 2, 'cerâmico de parede', 0.1, 'Revestimentos', 'Parede', '{}'),
      ('coz', 3, 'pavimento', 0.1, 'Revestimentos', 'Pavimento', ARRAY['pav', 'c6']),
      ('coz', 4, 'torneira e pequeno material', 0.1, NULL, NULL, '{}')
    ) AS p(linha, ordem, descricao, peso, oficio, sub, manter) ON p.linha = l.chave
    WHERE l.organization_id = o.org
    ON CONFLICT (linha_id, descricao) DO NOTHING;

    -- os materiais, cada um com o seu produto do Catálogo (criado se ainda não houver um com o mesmo SKU)
    FOR m IN SELECT l.id AS linha_id, l.chave, v.* FROM neg_linhas_modelo l JOIN (VALUES
      ('wc', 1, 'Cerâmico de parede 30×60', 'm²', ARRAY['par'], 1.1, 0, 'cp', 'cerâmico de parede', 'EMY-MAT-CP', 'Revestimentos', 'Parede'),
      ('wc', 2, 'Pavimento cerâmico 60×60', 'm²', ARRAY['pav'], 1.1, 0, 'pv', 'pavimento', 'EMY-MAT-PV', 'Revestimentos', 'Pavimento'),
      ('wc', 3, 'Sanita suspensa com estrutura', 'un', '{}', 0, 1, 'san', 'louças, base e torneiras', 'EMY-MAT-SAN', 'Canalização', 'Louças e torneiras'),
      ('wc', 4, 'Base de duche 80×120', 'un', '{}', 0, 1, 'base', 'louças, base e torneiras', 'EMY-MAT-BASE', 'Canalização', 'Louças e torneiras'),
      ('wc', 5, 'Cimento-cola · saco 25 kg', 'sacos', ARRAY['par', 'pav'], 0.25, 0, 'cim', 'colas e pequeno material', 'EMY-MAT-CIM', 'Revestimentos', 'Colas e argamassas'),
      ('coz', 1, 'Cerâmico de parede 30×60', 'm²', ARRAY['par'], 1.1, 0, 'cp', 'cerâmico de parede', 'EMY-MAT-CP', 'Revestimentos', 'Parede'),
      ('coz', 2, 'Pavimento cerâmico 60×60', 'm²', ARRAY['pav'], 1.1, 0, 'pv', 'pavimento', 'EMY-MAT-PV', 'Revestimentos', 'Pavimento'),
      ('coz', 3, 'Conjunto de móveis de cozinha', 'un', '{}', 0, 1, 'mov', 'móveis e bancada', 'EMY-MAT-MOV', 'Carpintaria', 'Mobiliário'),
      ('coz', 4, 'Bancada em pedra', 'un', '{}', 0, 1, 'banc', 'móveis e bancada', 'EMY-MAT-BANC', 'Carpintaria', 'Mobiliário'),
      ('coz', 5, 'Cimento-cola · saco 25 kg', 'sacos', ARRAY['par', 'pav'], 0.25, 0, 'cim', 'torneira e pequeno material', 'EMY-MAT-CIM', 'Revestimentos', 'Colas e argamassas')
    ) AS v(linha, ordem, nome, unidade, medidas, fator, fixo, stock_chave, parte, sku, oficio, sub) ON v.linha = l.chave
    WHERE l.organization_id = o.org
    LOOP
      SELECT p.id INTO v_p FROM products p WHERE p.organization_id = o.org AND p.sku = m.sku AND NOT p.is_deleted LIMIT 1;
      IF v_p IS NULL AND v_user IS NOT NULL THEN
        -- como o cat_guardar_produto: produto do Catálogo, gere stock, pertence à organização
        INSERT INTO products (organization_id, sku, name, status, is_active, is_sellable, is_purchasable, has_variants, is_deleted, manages_stock,
          created_by, tipo_catalogo, unidade, catalogo_categoria_id, fator_servico, short_description)
        VALUES (o.org, m.sku, m.nome, 'active', true, true, true, false, false, true, v_user, 'produto', m.unidade,
          (SELECT c.id FROM service_categories c JOIN service_categories pai ON pai.id = c.parent_id
           WHERE c.organization_id = o.org AND pai.name = m.oficio AND c.name = m.sub LIMIT 1),
          1, 'Material do modelo (' || m.chave || '). Criado pela migration 20270101300000: falta o custo e o fornecedor.')
        RETURNING id INTO v_p;
        INSERT INTO product_organizations (product_id, organization_id, created_by) VALUES (v_p, o.org, v_user)
        ON CONFLICT (product_id, organization_id) DO NOTHING;
      END IF;
      INSERT INTO neg_linha_modelo_materiais (organization_id, linha_id, ordem, nome, unidade, medidas, fator, fixo, stock_chave, parte, product_id)
      VALUES (o.org, m.linha_id, m.ordem, m.nome, m.unidade, m.medidas, m.fator, m.fixo, m.stock_chave, m.parte, v_p)
      ON CONFLICT (linha_id, stock_chave) DO NOTHING;
      v_p := NULL;
    END LOOP;
  END LOOP;
END $do$;

-- ------------------------------------------------------------------ 4. a leitura e a troca do produto
CREATE OR REPLACE FUNCTION public.neg_ler_linhas_modelo(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'services.view');
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'chave', l.chave, 'nome', l.nome, 'modelo', l.modelo, 'necessidades', to_jsonb(l.necessidades),
    'mat_descricao', l.mat_descricao, 'mat_custo', l.mat_custo, 'mat_preco', l.mat_preco,
    'medidas', coalesce((SELECT jsonb_agg(jsonb_build_object('medida', m.medida, 'rotulo', m.rotulo) ORDER BY m.ordem)
                         FROM neg_linha_modelo_medidas m WHERE m.linha_id = l.id), '[]'),
    -- o motor chama os serviços pela chave da Emylia (ou pelo id, sem chave)
    'servicos', coalesce((SELECT jsonb_agg(jsonb_build_object('servico', coalesce(s.chave, s.id::text), 'medida', x.medida) ORDER BY x.ordem)
                          FROM neg_linha_modelo_servicos x JOIN services s ON s.id = x.servico_id AND NOT s.is_deleted
                          WHERE x.linha_id = l.id), '[]'),
    'partes', coalesce((SELECT jsonb_agg(jsonb_build_object('descricao', p.descricao, 'peso', p.peso, 'ramo_oficio', p.ramo_oficio,
                          'ramo_sub', p.ramo_sub, 'manter', to_jsonb(p.manter)) ORDER BY p.ordem)
                        FROM neg_linha_modelo_partes p WHERE p.linha_id = l.id), '[]'),
    'materiais', coalesce((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome, 'unidade', m.unidade, 'medidas', to_jsonb(m.medidas),
                          'fator', m.fator, 'fixo', m.fixo, 'stock_chave', m.stock_chave, 'parte', m.parte,
                          'produto', CASE WHEN pr.id IS NOT NULL THEN m.product_id END, 'produto_nome', pr.name) ORDER BY m.ordem)
                           FROM neg_linha_modelo_materiais m LEFT JOIN products pr ON pr.id = m.product_id AND NOT pr.is_deleted
                           WHERE m.linha_id = l.id), '[]')
  ) ORDER BY l.chave) FROM neg_linhas_modelo l WHERE l.organization_id = p_org), '[]');
END $function$;
REVOKE ALL ON FUNCTION public.neg_ler_linhas_modelo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_ler_linhas_modelo(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.neg_ligar_material_modelo(p_org uuid, p_material uuid, p_produto uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'products.edit');
  IF p_produto IS NOT NULL AND NOT EXISTS (SELECT 1 FROM products WHERE id = p_produto AND organization_id = p_org AND NOT is_deleted) THEN
    RAISE EXCEPTION 'Produto desconhecido nesta organização.' USING ERRCODE = 'CT002';
  END IF;
  UPDATE neg_linha_modelo_materiais SET product_id = p_produto WHERE id = p_material AND organization_id = p_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material do modelo não encontrado.' USING ERRCODE = 'CT003'; END IF;
  UPDATE neg_linhas_modelo SET updated_at = now()
  WHERE id = (SELECT linha_id FROM neg_linha_modelo_materiais WHERE id = p_material);
END $function$;
REVOKE ALL ON FUNCTION public.neg_ligar_material_modelo(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_ligar_material_modelo(uuid, uuid, uuid) TO authenticated, service_role;
