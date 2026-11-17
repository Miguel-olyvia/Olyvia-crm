-- =============================================================================
-- Catálogo — MOBILIÁRIO & COMPONENTES COZINHA da MUDELAR: a MEDIDA que ficou só no nome passa a atributo. Base de RH
-- (uetjghdkwbywbftedtth). Não cria nem apaga produtos; os nomes dos produtos não mudam.
-- =============================================================================
--
-- Antes (20270119800000): 328 produtos; 40 sem valor de Medida nem de Largura (Acessórios de Cozinha 22, Armários de
-- Coluna 3, Armários Inferiores 7, Armários superiores 5, Cozinha Completa - Projetos 1, Puxadores 2), cada um com o seu
-- modelo (o nome todo, com a medida), sem atributos, SKU MCC-SUB-NNNN.
--
-- Decisões (17/11), produto a produto (as 15 linhas de dados abaixo; os outros 25 ficam como estão):
--   1. Medida (atributo «medida» da Mudelar, o mesmo das outras medidas; a unidade vai no valor):
--        três números «AxBxC» sem unidade (centenas/milhares) → 3D em mm, pela ordem do nome (largura × comprimento ×
--        espessura): BLOCO 450X400X600 e 450X400X750; Prateleira Nogueira 250x650x40 e 250x1100x250; Armário de Coluna
--        C/Espaço Interior 2400x1000x600; COLUNA CRISTALEIRA 2500X400X400; ARMÁRIO DE COLUNA COM CANTO 1200X2400X600.
--        dois números → 2D em mm: TAMPO 750X600 («XPÉ INOX» não é medida); PRATELEIRA VIDRO 600X400 (o «6MM» é a
--        espessura do vidro e fica no modelo); RIPADOS 2400X700; LAUNDRY CARRIER 528MM × ALT 545MM (largura × altura, como
--        as outras medidas da Mudelar «<L>x<A> Altura»; o «500» e o «2X33L» são da designação e ficam no modelo).
--   2. Largura (atributo de LISTA «largura»; a opção com sigla = o número, reutilizada se existir, criada se faltar):
--        Pimenteiro «de 200mm» → 20; PRATELEIRA SUSPENSA «C/ 1400» (mm) → 140; ARO … «DE 600 DE LARGURA» (mm) → 60;
--        Porta talheres «até 80cm» → 80. Lidas a 17/11: existem 60, 80 e 140; a 20 cria-se (sigla 20).
--   3. Ficam no nome (25): as 2 Garrafeiras «15cm / 30cm» (duas medidas num só produto); «Vista superior até 20cm de
--      altura» e os 2 «Canto em L 70cm / 90cm Alt» (altura, não largura); «Conforme Layout MD1394 Acréscimo 5 cm de
--      Altura»; e os que não têm medida (acessórios, LACADO/MELAMINA/TERMOLAMINADO, Canto em L inferior, projeto,
--      puxadores).
--   4. Modelo = o nome sem a parte da medida. Dois ficam com o mesmo nome e juntam-se no de número mais baixo; o outro
--      fica apagado (deleted_at; o número fica retirado — o índice único conta os apagados):
--        AC 0013 → AC 0012 «BLOCO EM TERMOLAMINADO BRANCO BRILHO - 1 GAVETÃO + TAMPO»;
--        AC 0017 → AC 0016 «Prateleira em Melamina Nogueira C/Fixação Oculta».
--      Ordem: mudar o modelo dos produtos → apagar os outros → renomear (o nome é único entre os vivos).
--   5. SKU de novo para os 15 (a regra de cat_gerar_sku_produto, set-based: fn_cat_sku_partes sobre o que ficou gravado
--      + o número do modelo), ex. MCC-AC-0012-450X400X750MM, MCC-AC-0015-140. Nenhum repetido nem provisório.
--   6. supplier_sku: nas ligações a fornecedor cujo supplier_sku é o SKU atual do próprio produto (14) passa a ser o SKU
--      novo; a do LAUNDRY CARRIER (código «940TUL0000004 3270821» do fornecedor) não muda.
--   * Auditoria normal, linha a linha, com app.audit_source = 'migration:mobiliario_medidas'.
--
-- GUARDA (inerte: RAISE NOTICE e sai sem escrever) se: a organização 3242e925-… não existir com o nome 'Mudelar';
-- faltar a categoria ou uma das 2 subcategorias; ou já estiver aplicada (os 15 produtos com o SKU novo).
-- Falha (RAISE EXCEPTION, nada fica) se o estado não for o de 20270119800000 (cada um dos 15 vivo, com o nome, o modelo
-- do número antigo, só ele nesse modelo, o SKU antigo e nenhum atributo); se faltar uma função do Catálogo ou o atributo
-- medida / largura; se uma opção da Largura for ambígua, estiver desativada ou a sigla estiver ocupada; se o SKU calculado
-- não for o esperado, tiver faltas ou repetir outro produto da Mudelar.
--
-- Conferir no fim (conta o que está ERRADO e faz RAISE se não for 0): 13 modelos vivos com nome e número, 2 apagados
-- nesta transação; os 15 produtos com o nome de sempre, o modelo, a medida ou a largura certa e nada mais; SKUs únicos,
-- iguais ao esperado, ao recalculado e a cat_prever_sku_modelo; 14 ligações a fornecedor com o SKU novo e as outras
-- intactas; preços intactos; os outros 25 sem medida intactos; nada escrito fora da Mudelar nem noutros produtos,
-- modelos, atributos ou opções dela (xmin); amostra de SKUs de outras categorias intacta.
--
-- ORDEM: depois de 20270119800000. Teste: supabase/tests/catalogo_mobiliario_medidas.test.sql (BEGIN … ROLLBACK, só
-- leitura; o passo 0 falha antes). Depois deste push o teste de 20270119800000 (46 modelos, SKUs sem medida nestes 15)
-- deixa de passar — é esperado. ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente; listar
-- com `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '5min';

DO $mig$
DECLARE
  c_org         constant uuid    := '3242e925-da26-459a-8258-be04d904e355';
  c_fonte       constant text    := 'migration:mobiliario_medidas';
  c_total       constant integer := 15;
  c_n_modelos   constant integer := 13;
  c_n_apagados  constant integer := 2;
  c_n_medidas   constant integer := 11;
  c_n_larguras  constant integer := 4;
  c_n_forn_sku  constant integer := 14;
  c_n_resto     constant integer := 25;
  c_cat_nome    constant text    := 'Mobiliário & Componentes Cozinha';
  c_cat_sigla   constant text    := 'MCC';
  v_agora   timestamptz := clock_timestamp();
  v_n bigint; v_m bigint; v_k bigint; v_xid text; v_txt text; v_criadas text := ''; v_ativa boolean;
  v_cat uuid; v_sub uuid; v_criador uuid; v_a_med uuid; v_a_larg uuid; v_g_larg uuid; v_opc uuid;
  v_auth uuid; v_claims text; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  -- ─── 0. Guarda ────────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'mobiliario_medidas: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;
  SELECT string_agg(s, ', ') INTO v_txt
  FROM unnest(ARRAY['public.fn_cat_chave_opcao(text)', 'public.fn_cat_grupo_do_atributo(uuid,uuid)',
                    'public.fn_cat_medida_ler(jsonb,text)', 'public.fn_cat_sku_medida(jsonb)',
                    'public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)', 'public.fn_cat_dimensao_medida(jsonb,text)',
                    'public.fn_cat_dimensao_texto(jsonb)', 'public.fn_cat_modelo_numero(uuid,uuid,uuid)',
                    'public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid)',
                    'public.has_anew_permission_in_org(uuid,text,uuid)']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'mobiliario_medidas: faltam funções do Catálogo (%).', v_txt; END IF;
  IF public.fn_cat_sku_medida('{"tipo":"3D","largura":450,"comprimento":400,"espessura":750,"unidade":"mm"}'::jsonb)
     IS DISTINCT FROM '450X400X750MM' THEN
    RAISE EXCEPTION 'mobiliario_medidas: a medida 3D em mm não dá o segmento de SKU esperado (450X400X750MM).';
  END IF;

  SELECT count(*), (array_agg(c.id ORDER BY c.created_at, c.id))[1] INTO v_n, v_cat
  FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(c_cat_nome);
  IF v_n = 0 THEN
    RAISE NOTICE 'mobiliario_medidas: a Mudelar não tem a categoria «%» — nada a fazer.', c_cat_nome;
    RETURN;
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'mobiliario_medidas: há % categorias «%» na Mudelar.', v_n, c_cat_nome;
  END IF;

  -- ─── Os dados ─────────────────────────────────────────────────────────────────
  DROP TABLE IF EXISTS pg_temp._mmed_subs, pg_temp._mmed_modelos, pg_temp._mmed_linhas, pg_temp._mmed_larguras,
                       pg_temp._mmed_resto, pg_temp._mmed_antes, pg_temp._mmed_amostra, pg_temp._mmed_sku, pg_temp._mmed_forn;

  CREATE TEMP TABLE _mmed_subs (codigo text PRIMARY KEY, nome text NOT NULL, ordem integer NOT NULL, sub_id uuid) ON COMMIT DROP;
  INSERT INTO _mmed_subs (codigo, nome, ordem) VALUES
    ('AC', 'Acessórios de Cozinha', 1),
    ('ACL', 'Armários de Coluna', 2);

  -- os 13 modelos que ficam (o número de sempre, o nome sem a medida)
  CREATE TEMP TABLE _mmed_modelos (sub text NOT NULL, numero smallint NOT NULL, nome text NOT NULL, modelo_id uuid,
                                   PRIMARY KEY (sub, numero)) ON COMMIT DROP;
  INSERT INTO _mmed_modelos (sub, numero, nome) VALUES
    ('AC', 1, 'Estrutura de Pimenteiro para Interior do móvel'),
    ('AC', 5, 'Porta talheres'),
    ('AC', 12, 'BLOCO EM TERMOLAMINADO BRANCO BRILHO - 1 GAVETÃO + TAMPO'),
    ('AC', 14, 'TAMPO EM TERMOLAMINADO BRANCO BRILHO C/ PÉ INOX'),
    ('AC', 15, 'PRATELEIRA SUSPENSA TERMOLAMINADO BRANCO BRILHO'),
    ('AC', 16, 'Prateleira em Melamina Nogueira C/Fixação Oculta'),
    ('AC', 18, 'ESTRUTURA LAUNDRY CARRIER 500 2X33L ANTRACITE'),
    ('AC', 19, 'PRATELEIRA VIDRO INCOLOR 6MM C/ ARESTAS P/Móvel de Cozinha'),
    ('AC', 20, 'ARO + ESTRUTURA + FRENTE P/ PRATELEIRA EXTRAIVEL ( P/ COLOCAR POR BAIXO DA ZONHA DE MAQ)'),
    ('AC', 21, 'RIPADOS MELAMINA ORC2691/2118'),
    ('ACL', 1, 'Armário de Coluna C/Espaço Interior'),
    ('ACL', 2, 'COLUNA CRISTALEIRA C/ 4 PRATELEIRS E 2 FRENTES EM VIDRO INCOLOR'),
    ('ACL', 3, 'ARMÁRIO DE COLUNA COM CANTO DE ARRUMAÇÃO');

  -- os 15 produtos: SKU antigo (= MCC-SUB-<número do modelo atual>), subcategoria, número do modelo atual, nome (não
  -- muda), número do modelo que fica, medida (tipo e dimensões, em mm) ou largura (cm, opção da lista), SKU esperado
  CREATE TEMP TABLE _mmed_linhas (sku_antigo text PRIMARY KEY, sub text NOT NULL, numero_antigo smallint NOT NULL, nome text NOT NULL,
                                  numero_novo smallint NOT NULL, med_tipo text, med_l numeric, med_c numeric, med_e numeric,
                                  largura text, sku_novo text NOT NULL,
                                  produto_id uuid, modelo_antigo_id uuid, modelo_novo_id uuid, sku_atual text,
                                  med_json jsonb, med_txt text) ON COMMIT DROP;
  INSERT INTO _mmed_linhas (sku_antigo, sub, numero_antigo, nome, numero_novo, med_tipo, med_l, med_c, med_e, largura, sku_novo) VALUES
    ('MCC-AC-0001', 'AC', 1, 'Estrutura de Pimenteiro para Interior do móvel de 200mm', 1, NULL, NULL, NULL, NULL, '20', 'MCC-AC-0001-20'),
    ('MCC-AC-0005', 'AC', 5, 'Porta talheres até 80cm', 5, NULL, NULL, NULL, NULL, '80', 'MCC-AC-0005-80'),
    ('MCC-AC-0012', 'AC', 12, 'BLOCO EM TERMOLAMINADO BRANCO BRILHO C/ 450X400X600 - 1 GAVETÃO + TAMPO', 12, '3D', 450, 400, 600, NULL, 'MCC-AC-0012-450X400X600MM'),
    ('MCC-AC-0013', 'AC', 13, 'BLOCO EM TERMOLAMINADO BRANCO BRILHO C/ 450X400X750 - 1 GAVETÃO + TAMPO', 12, '3D', 450, 400, 750, NULL, 'MCC-AC-0012-450X400X750MM'),
    ('MCC-AC-0014', 'AC', 14, 'TAMPO EM TERMOLAMINADO BRANCO BRILHO C/ 750X600XPÉ INOX', 14, '2D', 750, 600, NULL, NULL, 'MCC-AC-0014-750X600MM'),
    ('MCC-AC-0015', 'AC', 15, 'PRATELEIRA SUSPENSA TERMOLAMINADO BRANCO BRILHO C/ 1400', 15, NULL, NULL, NULL, NULL, '140', 'MCC-AC-0015-140'),
    ('MCC-AC-0016', 'AC', 16, 'Prateleira em Melamina Nogueira C/Fixação Oculta 250x650x40', 16, '3D', 250, 650, 40, NULL, 'MCC-AC-0016-250X650X40MM'),
    ('MCC-AC-0017', 'AC', 17, 'Prateleira em Melamina Nogueira C/Fixação Oculta 250x1100x250', 16, '3D', 250, 1100, 250, NULL, 'MCC-AC-0016-250X1100X250MM'),
    ('MCC-AC-0018', 'AC', 18, 'ESTRUTURA LAUNDRY CARRIER 500 2X33L 528MM ALT 545MM ANTRACITE', 18, '2D', 528, 545, NULL, NULL, 'MCC-AC-0018-528X545MM'),
    ('MCC-AC-0019', 'AC', 19, 'PRATELEIRA VIDRO INCOLOR 6MM C/ ARESTAS C/ 600X400 P/Móvel de Cozinha', 19, '2D', 600, 400, NULL, NULL, 'MCC-AC-0019-600X400MM'),
    ('MCC-AC-0020', 'AC', 20, 'ARO + ESTRUTURA + FRENTE P/ PRATELEIRA EXTRAIVEL DE 600 DE LARGURA ( P/ COLOCAR POR BAIXO DA ZONHA DE MAQ)', 20, NULL, NULL, NULL, NULL, '60', 'MCC-AC-0020-60'),
    ('MCC-AC-0021', 'AC', 21, 'RIPADOS MELAMINA 2400X700 ORC2691/2118', 21, '2D', 2400, 700, NULL, NULL, 'MCC-AC-0021-2400X700MM'),
    ('MCC-ACL-0001', 'ACL', 1, 'Armário de Coluna C/Espaço Interior 2400x1000x600', 1, '3D', 2400, 1000, 600, NULL, 'MCC-ACL-0001-2400X1000X600MM'),
    ('MCC-ACL-0002', 'ACL', 2, 'COLUNA CRISTALEIRA C/ 2500X400X400 C/ 4 PRATELEIRS E 2 FRENTES EM VIDRO INCOLOR', 2, '3D', 2500, 400, 400, NULL, 'MCC-ACL-0002-2500X400X400MM'),
    ('MCC-ACL-0003', 'ACL', 3, 'ARMÁRIO DE COLUNA COM CANTO DE ARRUMAÇÃO 1200X2400X600', 3, '3D', 1200, 2400, 600, NULL, 'MCC-ACL-0003-1200X2400X600MM');

  -- as opções da Largura usadas (sigla = o número)
  CREATE TEMP TABLE _mmed_larguras (valor text PRIMARY KEY, opcao_id uuid, valor_real text, sigla_real text,
                                    criada boolean NOT NULL DEFAULT false) ON COMMIT DROP;
  INSERT INTO _mmed_larguras (valor) VALUES ('20'), ('60'), ('80'), ('140');

  -- os dados estão inteiros
  SELECT count(*), count(*) FILTER (WHERE l.med_tipo IS NOT NULL), count(*) FILTER (WHERE l.largura IS NOT NULL)
    INTO v_n, v_m, v_k
  FROM _mmed_linhas l;
  IF v_n <> c_total OR v_m <> c_n_medidas OR v_k <> c_n_larguras
     OR (SELECT count(DISTINCT l.sku_novo) FROM _mmed_linhas l) <> c_total
     OR (SELECT count(*) FROM _mmed_modelos) <> c_n_modelos
     OR EXISTS (SELECT 1 FROM _mmed_linhas l WHERE (l.med_tipo IS NULL) = (l.largura IS NULL))
     OR EXISTS (SELECT 1 FROM _mmed_linhas l WHERE l.med_tipo IS NOT NULL
                AND (l.med_tipo NOT IN ('2D', '3D') OR l.med_l IS NULL OR l.med_c IS NULL OR (l.med_tipo = '3D') <> (l.med_e IS NOT NULL)))
     OR EXISTS (SELECT 1 FROM _mmed_linhas l WHERE NOT EXISTS (SELECT 1 FROM _mmed_modelos m WHERE m.sub = l.sub AND m.numero = l.numero_novo))
     OR EXISTS (SELECT 1 FROM _mmed_linhas l WHERE l.largura IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _mmed_larguras x WHERE x.valor = l.largura))
     OR EXISTS (SELECT 1 FROM _mmed_linhas l WHERE l.sku_antigo <> ('MCC-' || l.sub || '-' || lpad(l.numero_antigo::text, 4, '0')))
     OR (SELECT count(*) FROM _mmed_linhas l WHERE l.numero_antigo <> l.numero_novo) <> c_n_apagados THEN
    RAISE EXCEPTION 'mobiliario_medidas: os dados têm linhas, medidas, larguras, modelos ou SKUs fora do esperado.';
  END IF;

  -- as subcategorias (filhas de «Mobiliário & Componentes Cozinha», com as siglas AC e ACL)
  FOR r IN SELECT s.codigo, s.nome FROM _mmed_subs s ORDER BY s.ordem LOOP
    SELECT count(*), (array_agg(c.id ORDER BY c.created_at, c.id))[1] INTO v_n, v_sub
    FROM product_categories c
    WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
      AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_n = 0 THEN
      RAISE NOTICE 'mobiliario_medidas: a Mudelar não tem a subcategoria «%» — nada a fazer.', r.nome;
      RETURN;
    ELSIF v_n > 1 THEN
      RAISE EXCEPTION 'mobiliario_medidas: há % subcategorias «%».', v_n, r.nome;
    END IF;
    UPDATE _mmed_subs s SET sub_id = v_sub WHERE s.codigo = r.codigo;
  END LOOP;
  IF (SELECT c.sigla FROM product_categories c WHERE c.id = v_cat) IS DISTINCT FROM c_cat_sigla
     OR EXISTS (SELECT 1 FROM _mmed_subs s JOIN product_categories c ON c.id = s.sub_id WHERE c.sigla IS DISTINCT FROM s.codigo) THEN
    RAISE EXCEPTION 'mobiliario_medidas: as siglas de «%» e das subcategorias não são MCC, AC e ACL.', c_cat_nome;
  END IF;

  -- já aplicada? (os 15 produtos, pelo nome, com o SKU novo) → inerte
  SELECT count(*) INTO v_n FROM _mmed_linhas l JOIN _mmed_subs s ON s.codigo = l.sub
  JOIN products p ON p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id = s.sub_id AND p.name = l.nome AND p.sku = l.sku_novo;
  IF v_n = c_total THEN
    RAISE NOTICE 'mobiliario_medidas: já aplicada (os 15 produtos com o SKU novo) — nada a fazer.';
    RETURN;
  END IF;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'mobiliario_medidas: % dos 15 produtos já têm o SKU novo e os outros não. Rever antes de aplicar.', v_n;
  END IF;

  -- ─── O estado tem de ser o de 20270119800000 (senão: erro) ───────────────────
  -- cada linha: o produto vivo com o nome, na subcategoria, com o SKU antigo e o modelo vivo do número antigo
  UPDATE _mmed_linhas l SET produto_id = x.pid, modelo_antigo_id = x.mid, sku_atual = x.sku
  FROM (SELECT l2.sku_antigo, (array_agg(p.id))[1] AS pid, (array_agg(pm.id))[1] AS mid, (array_agg(p.sku))[1] AS sku, count(*) AS n
        FROM _mmed_linhas l2
        JOIN _mmed_subs s ON s.codigo = l2.sub
        JOIN products p ON p.organization_id = c_org AND NOT p.is_deleted AND p.category_id = v_cat AND p.subcategory_id = s.sub_id
                       AND p.name = l2.nome AND p.sku = l2.sku_antigo
        JOIN product_models pm ON pm.id = p.model_id AND pm.organization_id = c_org AND pm.subcategory_id = s.sub_id
                              AND pm.deleted_at IS NULL AND pm.numero = l2.numero_antigo
        GROUP BY l2.sku_antigo) x
  WHERE x.sku_antigo = l.sku_antigo AND x.n = 1;
  SELECT string_agg(l.sku_antigo || ' ' || l.nome, '; ') INTO v_txt FROM _mmed_linhas l WHERE l.produto_id IS NULL;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'mobiliario_medidas: produtos não encontrados com o nome, o SKU e o modelo de 20270119800000: %', v_txt;
  END IF;
  IF (SELECT count(DISTINCT l.produto_id) FROM _mmed_linhas l) <> c_total
     OR (SELECT count(DISTINCT l.modelo_antigo_id) FROM _mmed_linhas l) <> c_total THEN
    RAISE EXCEPTION 'mobiliario_medidas: os 15 produtos não têm 15 modelos distintos.';
  END IF;
  -- cada modelo antigo só tem este produto (vivo ou apagado)
  SELECT count(*) INTO v_n FROM products p JOIN _mmed_linhas l ON l.modelo_antigo_id = p.model_id WHERE p.id <> l.produto_id;
  IF v_n > 0 THEN RAISE EXCEPTION 'mobiliario_medidas: % outros produtos nos modelos a mudar.', v_n; END IF;
  -- nenhum atributo ainda nos 15
  SELECT count(*) INTO v_n FROM product_attribute_values v JOIN _mmed_linhas l ON l.produto_id = v.product_id;
  IF v_n > 0 THEN RAISE EXCEPTION 'mobiliario_medidas: os produtos já têm % valores de atributos.', v_n; END IF;
  -- os modelos que ficam: o do número de cima, e o menor entre os dos seus produtos
  UPDATE _mmed_modelos m SET modelo_id = x.mid
  FROM (SELECT l.sub, l.numero_novo, (array_agg(pm.id ORDER BY pm.numero))[1] AS mid, min(pm.numero) AS menor
        FROM _mmed_linhas l JOIN product_models pm ON pm.id = l.modelo_antigo_id GROUP BY l.sub, l.numero_novo) x
  WHERE x.sub = m.sub AND x.numero_novo = m.numero AND x.menor = m.numero;
  IF EXISTS (SELECT 1 FROM _mmed_modelos m WHERE m.modelo_id IS NULL) THEN
    RAISE EXCEPTION 'mobiliario_medidas: o modelo que fica não é o de menor número (%).',
      (SELECT string_agg(m.sub || ' ' || lpad(m.numero::text, 4, '0'), ', ') FROM _mmed_modelos m WHERE m.modelo_id IS NULL);
  END IF;
  UPDATE _mmed_linhas l SET modelo_novo_id = m.modelo_id FROM _mmed_modelos m WHERE m.sub = l.sub AND m.numero = l.numero_novo;
  -- um nome novo não pode ser de outro modelo vivo da subcategoria (fora dos 15)
  SELECT string_agg(m.sub || ' ' || m.nome, '; ') INTO v_txt
  FROM _mmed_modelos m JOIN _mmed_subs s ON s.codigo = m.sub
  JOIN product_models pm ON pm.organization_id = c_org AND pm.subcategory_id = s.sub_id AND pm.deleted_at IS NULL
                         AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(m.nome)
  WHERE NOT EXISTS (SELECT 1 FROM _mmed_linhas l WHERE l.modelo_antigo_id = pm.id);
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'mobiliario_medidas: nomes de modelo já usados na subcategoria: %', v_txt; END IF;

  SELECT m.user_id INTO v_criador
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND coalesce(m.role_is_client, false) = false
  ORDER BY m.created_at, m.user_id LIMIT 1;
  IF v_criador IS NULL THEN RAISE EXCEPTION 'mobiliario_medidas: a Mudelar não tem um membro ativo para created_by.'; END IF;

  -- os atributos (pelo código): medida e largura de lista, os dois a entrar no SKU
  SELECT count(*) FILTER (WHERE a.code::text = 'medida' AND a.is_measurement),
         count(*) FILTER (WHERE a.code::text = 'largura' AND NOT a.is_measurement),
         (array_agg(a.id) FILTER (WHERE a.code::text = 'medida' AND a.is_measurement))[1],
         (array_agg(a.id) FILTER (WHERE a.code::text = 'largura' AND NOT a.is_measurement))[1]
    INTO v_n, v_m, v_a_med, v_a_larg
  FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL;
  IF v_n <> 1 OR v_m <> 1 THEN
    RAISE EXCEPTION 'mobiliario_medidas: a Mudelar tem de ter um atributo medida (medida) e um largura (lista); tem %, %.', v_n, v_m;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM product_attributes a WHERE a.id = v_a_med AND a.sku_entra)
     OR NOT EXISTS (SELECT 1 FROM product_attributes a WHERE a.id = v_a_larg AND a.sku_entra) THEN
    RAISE EXCEPTION 'mobiliario_medidas: a Medida ou a Largura da Mudelar não entram no SKU.';
  END IF;
  v_g_larg := public.fn_cat_grupo_do_atributo(v_a_larg, c_org);
  IF NOT EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.id = v_g_larg AND g.organization_id = c_org) THEN
    RAISE EXCEPTION 'mobiliario_medidas: as opções da Largura em uso na Mudelar não são de um grupo da Mudelar.';
  END IF;

  -- a medida a gravar: value_json e value_text como cat_guardar_produto_atributos (fn_cat_dimensao_medida / _texto), em mm
  UPDATE _mmed_linhas l SET
    med_json = jsonb_build_object('tipo', l.med_tipo,
                                  'largura', public.fn_cat_dimensao_medida(to_jsonb(l.med_l), 'A largura'),
                                  'comprimento', public.fn_cat_dimensao_medida(to_jsonb(l.med_c), 'O comprimento'),
                                  'espessura', (CASE WHEN l.med_tipo = '3D' THEN public.fn_cat_dimensao_medida(to_jsonb(l.med_e), 'A espessura') END),
                                  'unidade', 'mm'),
    med_txt = public.fn_cat_dimensao_texto(public.fn_cat_dimensao_medida(to_jsonb(l.med_l), 'A largura')) || ' × '
              || public.fn_cat_dimensao_texto(public.fn_cat_dimensao_medida(to_jsonb(l.med_c), 'O comprimento'))
              || (CASE WHEN l.med_tipo = '3D'
                       THEN ' × ' || public.fn_cat_dimensao_texto(public.fn_cat_dimensao_medida(to_jsonb(l.med_e), 'A espessura'))
                       ELSE '' END)
              || ' mm'
  WHERE l.med_tipo IS NOT NULL;
  SELECT count(*) INTO v_n FROM _mmed_linhas l
  WHERE l.med_tipo IS NOT NULL
    AND (l.med_txt IS NULL OR public.fn_cat_medida_ler(l.med_json, 'mm') IS NULL OR public.fn_cat_sku_medida(l.med_json) IS NULL
         OR l.med_json <> jsonb_build_object('tipo', l.med_tipo, 'largura', l.med_l, 'comprimento', l.med_c,
                                             'espessura', l.med_e, 'unidade', 'mm'));
  IF v_n > 0 THEN RAISE EXCEPTION 'mobiliario_medidas: % medidas não ficaram como os dados.', v_n; END IF;

  -- amostra de SKUs de outras categorias; os outros 25 sem medida (com SKU, modelo e nome); preços e fornecedores dos 15
  CREATE TEMP TABLE _mmed_amostra ON COMMIT DROP AS
  SELECT x.id, x.sku FROM (
    SELECT p.id, p.sku, row_number() OVER (PARTITION BY c.id ORDER BY p.sku, p.id) AS n
    FROM products p JOIN product_categories c ON c.id = p.category_id
    WHERE p.organization_id = c_org AND NOT p.is_deleted AND c.organization_id = c_org AND c.parent_id IS NULL
      AND c.id <> v_cat) x
  WHERE x.n <= 3;
  CREATE TEMP TABLE _mmed_resto ON COMMIT DROP AS
  SELECT p.id, p.sku, p.name, p.model_id FROM products p
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.category_id = v_cat
    AND NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id AND v.attribute_id IN (v_a_med, v_a_larg))
    AND NOT EXISTS (SELECT 1 FROM _mmed_linhas l WHERE l.produto_id = p.id);
  SELECT count(*) INTO v_n FROM _mmed_resto;
  IF v_n <> c_n_resto THEN
    RAISE EXCEPTION 'mobiliario_medidas: % outros produtos de «%» sem medida nem largura (esperados %).', v_n, c_cat_nome, c_n_resto;
  END IF;
  CREATE TEMP TABLE _mmed_antes ON COMMIT DROP AS
  SELECT l.produto_id,
         (SELECT string_agg(x.id::text || ':' || coalesce(x.price::text, ''), ',' ORDER BY x.id)
          FROM product_prices x WHERE x.product_id = l.produto_id) AS precos
  FROM _mmed_linhas l;
  -- as ligações a fornecedor dos 15: as que têm como supplier_sku o SKU atual do próprio produto passam ao SKU novo
  CREATE TEMP TABLE _mmed_forn ON COMMIT DROP AS
  SELECT i.id, i.product_id, i.supplier_id, i.supplier_sku, i.purchase_price, i.is_preferred, i.is_active, i.deleted_at,
         (i.deleted_at IS NULL AND i.supplier_sku = l.sku_atual) AS muda, l.sku_novo
  FROM item_suppliers i JOIN _mmed_linhas l ON l.produto_id = i.product_id;
  SELECT count(*) INTO v_n FROM _mmed_forn f WHERE f.muda;
  IF v_n <> c_n_forn_sku THEN
    RAISE EXCEPTION 'mobiliario_medidas: % ligações a fornecedor com o SKU atual como supplier_sku (esperadas %).', v_n, c_n_forn_sku;
  END IF;

  -- ─── Locks (as chaves das funções de gestão do Catálogo, na ordem delas) ─────
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sku_config:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text, 0));
  FOR r IN SELECT s.sub_id FROM _mmed_subs s ORDER BY s.sub_id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text || ':' || r.sub_id::text, 0));
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_opc:' || v_g_larg::text, 0));

  PERFORM set_config('app.audit_source', c_fonte, true);
  PERFORM set_config('app.audit_user_id', v_criador::text, true);

  -- ─── 1. As opções da Largura (as que existem; as outras criadas, sigla = o número) ─────
  FOR r IN SELECT x.valor FROM _mmed_larguras x ORDER BY x.valor::numeric LOOP
    SELECT count(*), (array_agg(v.id ORDER BY v.id))[1], (array_agg(v.is_active ORDER BY v.id))[1] INTO v_n, v_opc, v_ativa
    FROM attribute_option_group_values v
    WHERE v.group_id = v_g_larg AND public.fn_cat_chave_opcao(v.value_text::text) = public.fn_cat_chave_opcao(r.valor);
    IF v_n > 1 THEN RAISE EXCEPTION 'mobiliario_medidas: há % opções «%» na Largura da Mudelar.', v_n, r.valor; END IF;
    IF v_n = 1 AND NOT v_ativa THEN RAISE EXCEPTION 'mobiliario_medidas: a opção «%» da Largura está desativada.', r.valor; END IF;
    IF v_n = 0 THEN
      SELECT string_agg(v.value_text::text, ', ') INTO v_txt FROM attribute_option_group_values v WHERE v.group_id = v_g_larg AND v.sigla = r.valor;
      IF v_txt IS NOT NULL THEN
        RAISE EXCEPTION 'mobiliario_medidas: a sigla % da Largura já é da opção «%».', r.valor, v_txt;
      END IF;
      INSERT INTO attribute_option_group_values (group_id, value_text, display_name, hex_color, sort_order, is_active, sigla)
      VALUES (v_g_larg, r.valor, r.valor, NULL,
              coalesce((SELECT max(v.sort_order) FROM attribute_option_group_values v WHERE v.group_id = v_g_larg), 0) + 1, true, r.valor)
      RETURNING id INTO v_opc;
      UPDATE _mmed_larguras x SET criada = true WHERE x.valor = r.valor;
      v_criadas := v_criadas || r.valor || '; ';
    END IF;
    UPDATE _mmed_larguras x SET opcao_id = v_opc WHERE x.valor = r.valor;
  END LOOP;
  UPDATE _mmed_larguras x SET valor_real = v.value_text::text, sigla_real = v.sigla FROM attribute_option_group_values v WHERE v.id = x.opcao_id;
  IF EXISTS (SELECT 1 FROM _mmed_larguras x WHERE x.sigla_real IS DISTINCT FROM x.valor) THEN
    RAISE EXCEPTION 'mobiliario_medidas: opções da Largura com sigla diferente do número: %',
      (SELECT string_agg(x.valor || '=' || coalesce(x.sigla_real, 'null'), ', ') FROM _mmed_larguras x WHERE x.sigla_real IS DISTINCT FROM x.valor);
  END IF;

  -- ─── 2. Modelos: produtos para o modelo que fica → apagar os outros → renomear ─────
  UPDATE products p SET model_id = l.modelo_novo_id
  FROM _mmed_linhas l
  WHERE p.id = l.produto_id AND p.organization_id = c_org AND p.model_id IS DISTINCT FROM l.modelo_novo_id;
  UPDATE product_models pm SET deleted_at = v_agora
  FROM _mmed_linhas l
  WHERE pm.id = l.modelo_antigo_id AND pm.organization_id = c_org AND pm.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM _mmed_modelos m WHERE m.modelo_id = pm.id);
  UPDATE product_models pm SET name = m.nome
  FROM _mmed_modelos m
  WHERE pm.id = m.modelo_id AND pm.organization_id = c_org AND pm.name IS DISTINCT FROM m.nome;

  -- ─── 3. Os valores: Medida (11, value_json em mm) e Largura (4, value_text = o da opção) ─────
  INSERT INTO product_attribute_values (product_id, attribute_id, value_text, value_json, unit)
  SELECT l.produto_id, v_a_med, l.med_txt, l.med_json, 'mm' FROM _mmed_linhas l WHERE l.med_tipo IS NOT NULL
  UNION ALL
  SELECT l.produto_id, v_a_larg, x.valor_real, NULL::jsonb, NULL::text
  FROM _mmed_linhas l JOIN _mmed_larguras x ON x.valor = l.largura WHERE l.largura IS NOT NULL;

  -- ─── 4. O SKU de novo (a regra de cat_gerar_sku_produto, set-based, sobre o que ficou gravado) ─────
  CREATE TEMP TABLE _mmed_sku ON COMMIT DROP AS
  SELECT l.produto_id, l.sku_novo, (z.pt ->> 'prefixo') AS prefixo, (z.pt -> 'faltas') AS faltas,
         public.fn_cat_modelo_numero(c_org, p.subcategory_id, p.model_id) AS numero,
         concat_ws('-', z.pt ->> 'prefixo', lpad(public.fn_cat_modelo_numero(c_org, p.subcategory_id, p.model_id)::text, 4, '0'),
                   z.pt ->> 'resto') AS calc
  FROM _mmed_linhas l
  JOIN products p ON p.id = l.produto_id
  CROSS JOIN LATERAL (SELECT public.fn_cat_sku_partes(c_org, p.category_id, p.subcategory_id, (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'atributo', v.attribute_id, 'sigla', o.sigla,
               'medida', (CASE WHEN a.is_measurement THEN public.fn_cat_medida_ler(v.value_json, v.unit) END))), '[]'::jsonb)
      FROM product_attribute_values v
      JOIN product_attributes a ON a.id = v.attribute_id AND a.organization_id = c_org AND a.deleted_at IS NULL
      LEFT JOIN attribute_option_group_values o
        ON NOT a.is_measurement AND o.group_id = public.fn_cat_grupo_do_atributo(a.id, c_org) AND o.value_text = v.value_text
      WHERE v.product_id = p.id)) AS pt) z;
  SELECT count(*), string_agg(s.sku_novo || ' ≠ ' || coalesce(s.calc, 'null') || ' ' || coalesce(s.faltas::text, ''), '; ')
    INTO v_n, v_txt
  FROM _mmed_sku s
  WHERE s.prefixo IS NULL OR s.numero IS NULL OR s.faltas IS DISTINCT FROM '[]'::jsonb OR s.calc IS DISTINCT FROM s.sku_novo;
  IF v_n > 0 THEN RAISE EXCEPTION 'mobiliario_medidas: % SKUs calculados diferentes do esperado: %', v_n, left(v_txt, 1500); END IF;
  SELECT string_agg(s.calc || ' (' || p.name || ')', '; ') INTO v_txt
  FROM _mmed_sku s JOIN products p ON p.organization_id = c_org AND p.sku = s.calc AND p.id <> s.produto_id;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'mobiliario_medidas: SKUs já usados noutros produtos da Mudelar: %', left(v_txt, 1500); END IF;
  UPDATE products p SET sku = s.calc, sku_gerado = true
  FROM _mmed_sku s
  WHERE p.id = s.produto_id AND p.organization_id = c_org AND (p.sku IS DISTINCT FROM s.calc OR NOT p.sku_gerado);

  -- ─── 4b. supplier_sku: o SKU antigo do próprio produto passa ao SKU novo (quem tem código de fornecedor não muda) ─────
  UPDATE item_suppliers i SET supplier_sku = f.sku_novo
  FROM _mmed_forn f
  WHERE i.id = f.id AND f.muda AND i.organization_id = c_org AND i.supplier_sku IS DISTINCT FROM f.sku_novo;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_forn_sku THEN
    RAISE EXCEPTION 'mobiliario_medidas: % supplier_sku mudados em vez de %.', v_n, c_n_forn_sku;
  END IF;

  -- ─── 5. Conferir (cada contagem é do que está ERRADO; tem de dar 0) ───────────
  -- modelos: 13 vivos com nome e número; 2 apagados agora; os 15 continuam a existir (nenhum removido)
  SELECT count(*) INTO v_n FROM _mmed_modelos m
  JOIN _mmed_subs s ON s.codigo = m.sub
  LEFT JOIN product_models pm ON pm.id = m.modelo_id
  WHERE NOT coalesce(pm.organization_id = c_org AND pm.subcategory_id = s.sub_id AND pm.deleted_at IS NULL AND pm.is_active
                     AND pm.name = m.nome AND pm.numero = m.numero, false);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % dos % modelos não ficaram com o nome, o número ou vivos.', v_n, c_n_modelos; END IF;
  SELECT count(*) FILTER (WHERE pm.deleted_at IS NULL), count(*) FILTER (WHERE pm.deleted_at = v_agora), count(*)
    INTO v_n, v_m, v_k
  FROM product_models pm WHERE pm.id IN (SELECT l.modelo_antigo_id FROM _mmed_linhas l);
  IF v_n <> c_n_modelos OR v_m <> c_n_apagados OR v_k <> c_total THEN
    RAISE EXCEPTION 'Conferir: modelos dos 15: % vivos (esperados %), % apagados agora (esperados %), % no total (esperados %).',
      v_n, c_n_modelos, v_m, c_n_apagados, v_k, c_total;
  END IF;

  -- produtos: o nome de sempre, o modelo novo, o SKU esperado e gerado, vivos (LEFT JOIN: um produto em falta conta)
  SELECT count(*), string_agg(l.sku_antigo, ', ') INTO v_n, v_txt
  FROM _mmed_linhas l
  JOIN _mmed_subs s ON s.codigo = l.sub
  LEFT JOIN products p ON p.id = l.produto_id
  WHERE NOT coalesce(p.organization_id = c_org AND p.name = l.nome AND p.model_id = l.modelo_novo_id AND p.sku = l.sku_novo
                     AND p.sku_gerado AND NOT p.is_deleted AND p.category_id = v_cat AND p.subcategory_id = s.sub_id, false);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % produtos sem o nome, o modelo ou o SKU esperados: %', v_n, v_txt; END IF;

  -- valores: a medida certa nos 11, a largura certa nos 4, nada mais (conta os que FALTAM e os A MAIS)
  SELECT count(*) INTO v_n FROM _mmed_linhas l
  WHERE l.med_tipo IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = l.produto_id AND v.attribute_id = v_a_med
                    AND v.value_json = l.med_json AND v.value_text = l.med_txt AND v.unit = 'mm');
  SELECT count(*) INTO v_m FROM _mmed_linhas l JOIN _mmed_larguras x ON x.valor = l.largura
  WHERE NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = l.produto_id AND v.attribute_id = v_a_larg
                    AND v.value_text = x.valor_real AND v.value_json IS NULL);
  SELECT count(*) INTO v_k FROM product_attribute_values v JOIN _mmed_linhas l ON l.produto_id = v.product_id
  WHERE NOT coalesce((v.attribute_id = v_a_med AND l.med_tipo IS NOT NULL) OR (v.attribute_id = v_a_larg AND l.largura IS NOT NULL), false);
  IF v_n > 0 OR v_m > 0 OR v_k > 0 THEN
    RAISE EXCEPTION 'Conferir: % medidas em falta, % larguras em falta, % valores a mais nos 15 produtos.', v_n, v_m, v_k;
  END IF;
  SELECT count(*) FILTER (WHERE v.attribute_id = v_a_med), count(*) FILTER (WHERE v.attribute_id = v_a_larg) INTO v_n, v_m
  FROM product_attribute_values v JOIN _mmed_linhas l ON l.produto_id = v.product_id;
  IF v_n <> c_n_medidas OR v_m <> c_n_larguras THEN
    RAISE EXCEPTION 'Conferir: % produtos com medida (esperados %) e % com largura (esperados %).', v_n, c_n_medidas, v_m, c_n_larguras;
  END IF;

  -- SKUs: únicos na categoria, no formato, sem provisórios, nenhum outro produto da Mudelar com um SKU novo
  SELECT count(*) INTO v_n FROM (SELECT p.sku FROM products p WHERE p.organization_id = c_org AND p.category_id = v_cat AND NOT p.is_deleted
                                 GROUP BY p.sku HAVING count(*) > 1) x;
  SELECT count(*) INTO v_m FROM products p JOIN _mmed_linhas l ON l.produto_id = p.id
  WHERE p.sku !~ '^MCC-(AC|ACL)-[0-9]{4}-[0-9X]+(MM)?$' OR p.sku ~ '^CAT-' OR NOT p.sku_gerado;
  SELECT count(*) INTO v_k FROM products p
  WHERE p.organization_id = c_org AND p.sku IN (SELECT l.sku_novo FROM _mmed_linhas l)
    AND NOT EXISTS (SELECT 1 FROM _mmed_linhas l WHERE l.produto_id = p.id);
  IF v_n > 0 OR v_m > 0 OR v_k > 0 THEN
    RAISE EXCEPTION 'Conferir: % SKUs repetidos na categoria, % fora do formato ou não gerados, % outros produtos com um SKU novo.', v_n, v_m, v_k;
  END IF;
  SELECT count(*), string_agg(y.sku || ' ≠ ' || coalesce(y.calc, 'null'), '; ') INTO v_n, v_txt
  FROM (SELECT p.sku, z.pt ->> 'faltas' AS faltas, (z.pt ->> 'prefixo') AS prefixo,
               concat_ws('-', z.pt ->> 'prefixo', lpad(public.fn_cat_modelo_numero(c_org, p.subcategory_id, p.model_id)::text, 4, '0'),
                         z.pt ->> 'resto') AS calc
        FROM products p
        CROSS JOIN LATERAL (SELECT public.fn_cat_sku_partes(c_org, p.category_id, p.subcategory_id, (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'atributo', v.attribute_id, 'sigla', o.sigla,
                     'medida', (CASE WHEN a.is_measurement THEN public.fn_cat_medida_ler(v.value_json, v.unit) END))), '[]'::jsonb)
            FROM product_attribute_values v
            JOIN product_attributes a ON a.id = v.attribute_id AND a.organization_id = c_org AND a.deleted_at IS NULL
            LEFT JOIN attribute_option_group_values o
              ON NOT a.is_measurement AND o.group_id = public.fn_cat_grupo_do_atributo(a.id, c_org) AND o.value_text = v.value_text
            WHERE v.product_id = p.id)) AS pt) z
        WHERE p.id IN (SELECT l.produto_id FROM _mmed_linhas l)) y
  WHERE y.calc IS DISTINCT FROM y.sku OR y.prefixo IS NULL OR y.faltas IS DISTINCT FROM '[]';
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % SKUs diferentes do recalculado (ex.: %).', v_n, left(v_txt, 1500); END IF;

  -- os 15 com cat_prever_sku_modelo e os atributos gravados, como um membro da Mudelar com products.edit (só leitura)
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN
    RAISE NOTICE 'mobiliario_medidas: sem membro da Mudelar com products.edit — a comparação com cat_prever_sku_modelo ficou por fazer (o recálculo foi feito).';
  ELSE
    v_claims := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    v_n := 0;
    FOR r IN SELECT l.produto_id, l.sku_novo, p.category_id, p.subcategory_id, p.model_id
             FROM _mmed_linhas l JOIN products p ON p.id = l.produto_id ORDER BY l.sku_antigo LOOP
      SELECT coalesce(jsonb_agg(CASE WHEN a.is_measurement THEN jsonb_build_object('atributo', v.attribute_id, 'medida', v.value_json)
                                     ELSE jsonb_build_object('atributo', v.attribute_id, 'opcao', o.id) END), '[]'::jsonb)
        INTO v_attrs
      FROM product_attribute_values v
      JOIN product_attributes a ON a.id = v.attribute_id
      LEFT JOIN attribute_option_group_values o
        ON NOT a.is_measurement AND o.group_id = public.fn_cat_grupo_do_atributo(v.attribute_id, c_org) AND o.value_text = v.value_text
      WHERE v.product_id = r.produto_id;
      v_prev := public.cat_prever_sku_modelo(c_org, r.category_id, r.subcategory_id, r.model_id, v_attrs, r.produto_id);
      IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku_novo OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
        RAISE EXCEPTION 'Conferir: cat_prever_sku_modelo dá % para o produto com o SKU %.', v_prev, r.sku_novo;
      END IF;
      v_n := v_n + 1;
    END LOOP;
    PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    IF v_n <> c_total THEN RAISE EXCEPTION 'Conferir: só % de % comparados com cat_prever_sku_modelo.', v_n, c_total; END IF;
  END IF;

  -- preços dos 15 iguais a antes
  SELECT count(*) INTO v_n FROM _mmed_antes a
  WHERE a.precos IS DISTINCT FROM (SELECT string_agg(x.id::text || ':' || coalesce(x.price::text, ''), ',' ORDER BY x.id)
                                   FROM product_prices x WHERE x.product_id = a.produto_id);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % produtos com preços mudados.', v_n; END IF;
  -- ligações a fornecedor: as 14 sem código de fornecedor com o SKU novo, as outras iguais a antes; nenhuma a mais ou a menos
  SELECT count(*) FILTER (WHERE f.muda), count(*) FILTER (WHERE NOT f.muda) INTO v_n, v_m
  FROM _mmed_forn f LEFT JOIN item_suppliers i ON i.id = f.id
  WHERE NOT coalesce(i.product_id = f.product_id AND i.supplier_id = f.supplier_id
                     AND i.purchase_price IS NOT DISTINCT FROM f.purchase_price AND i.is_preferred IS NOT DISTINCT FROM f.is_preferred
                     AND i.is_active IS NOT DISTINCT FROM f.is_active AND i.deleted_at IS NOT DISTINCT FROM f.deleted_at
                     AND i.supplier_sku IS NOT DISTINCT FROM (CASE WHEN f.muda THEN f.sku_novo ELSE f.supplier_sku END), false);
  SELECT count(*) INTO v_k FROM item_suppliers i JOIN _mmed_linhas l ON l.produto_id = i.product_id
  WHERE NOT EXISTS (SELECT 1 FROM _mmed_forn f WHERE f.id = i.id);
  IF v_n > 0 OR v_m > 0 OR v_k > 0 THEN
    RAISE EXCEPTION 'Conferir: % ligações sem o SKU novo, % ligações com código de fornecedor mudadas, % ligações novas.', v_n, v_m, v_k;
  END IF;

  -- os outros 25 sem medida: iguais (nome, SKU, modelo) e ainda sem medida nem largura
  SELECT count(*) INTO v_n FROM _mmed_resto x LEFT JOIN products p ON p.id = x.id
  WHERE NOT coalesce(p.sku = x.sku AND p.name = x.name AND p.model_id = x.model_id AND NOT p.is_deleted, false)
     OR EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = x.id AND v.attribute_id IN (v_a_med, v_a_larg));
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % dos % produtos que ficam com a medida no nome mudaram.', v_n, c_n_resto; END IF;

  -- nada escrito fora da Mudelar nem fora do âmbito (xmin desta transação)
  v_xid := (txid_current() % 4294967296)::text;
  SELECT string_agg(x.t || ' ' || x.n, ', ') INTO v_txt FROM (
    SELECT 'products (fora dos 15)' AS t, count(*) AS n FROM products p
    WHERE p.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _mmed_linhas l WHERE l.produto_id = p.id)
    UNION ALL SELECT 'product_attribute_values (fora dos 15)', count(*) FROM product_attribute_values x
              WHERE x.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _mmed_linhas l WHERE l.produto_id = x.product_id)
    UNION ALL SELECT 'product_models (fora dos 15)', count(*) FROM product_models x
              WHERE x.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _mmed_linhas l WHERE l.modelo_antigo_id = x.id)
    UNION ALL SELECT 'product_attributes', count(*) FROM product_attributes x WHERE x.xmin::text = v_xid
    UNION ALL SELECT 'attribute_option_groups', count(*) FROM attribute_option_groups x WHERE x.xmin::text = v_xid
    UNION ALL SELECT 'attribute_option_group_values (além das criadas)', count(*) FROM attribute_option_group_values x
              WHERE x.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _mmed_larguras l WHERE l.opcao_id = x.id AND l.criada)
    UNION ALL SELECT 'product_prices', count(*) FROM product_prices x WHERE x.xmin::text = v_xid
    UNION ALL SELECT 'item_suppliers (além das 14)', count(*) FROM item_suppliers x
              WHERE x.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _mmed_forn f WHERE f.id = x.id AND f.muda)
    UNION ALL SELECT 'product_categories', count(*) FROM product_categories x WHERE x.xmin::text = v_xid) x
  WHERE x.n > 0;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: foram escritas linhas fora do âmbito: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM products p JOIN _mmed_linhas l ON l.produto_id = p.id WHERE p.xmin::text = v_xid;
  SELECT count(*) INTO v_m FROM item_suppliers x WHERE x.xmin::text = v_xid;
  SELECT count(*) INTO v_k FROM attribute_option_group_values x WHERE x.xmin::text = v_xid;
  IF v_n <> c_total OR v_m <> c_n_forn_sku OR v_k <> (SELECT count(*) FROM _mmed_larguras WHERE criada) THEN
    RAISE EXCEPTION 'Conferir: % produtos (esperados %), % ligações (esperadas %) e % opções (esperadas as criadas) com o xmin desta transação.',
      v_n, c_total, v_m, c_n_forn_sku, v_k;
  END IF;
  -- a amostra de SKUs de outras categorias ficou igual
  SELECT count(*), string_agg(a.sku, ', ') INTO v_n, v_txt
  FROM _mmed_amostra a LEFT JOIN products p ON p.id = a.id
  WHERE NOT coalesce(p.sku = a.sku AND NOT p.is_deleted AND p.organization_id = c_org, false);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % SKUs da amostra de outras categorias mudaram: %', v_n, v_txt; END IF;

  RAISE NOTICE 'mobiliario_medidas: % produtos com a medida em atributo (% Medida em mm, % Largura), % modelos que ficam, % apagados (AC 0013 → 0012, AC 0017 → 0016), % SKUs gerados de novo, % supplier_sku mudados. Opções da Largura criadas: %. % produtos ficam com a medida no nome. Amostra de outras categorias: % SKUs iguais. Conferido.',
    c_total, c_n_medidas, c_n_larguras, c_n_modelos, c_n_apagados, c_total, c_n_forn_sku,
    coalesce(nullif(v_criadas, ''), 'nenhuma'), c_n_resto, (SELECT count(*) FROM _mmed_amostra);
END $mig$;

RESET statement_timeout;
RESET lock_timeout;
