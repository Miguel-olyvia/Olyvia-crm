-- =============================================================================
-- Catálogo — tirar as CATEGORIAS e SUBCATEGORIAS SEM PRODUTOS (soft delete, como o ecrã). MIGRATION DE DADOS.
-- Base de RH (uetjghdkwbywbftedtth).
-- =============================================================================
--
-- !!! SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth). SÓ A MUDELAR DA RH (3242e925-da26-459a-8258-be04d904e355): todas as
-- !!! escritas levam o id E a organização da Mudelar. A NIKE (b6ffce4f-f630-4933-833a-008649757a33) NÃO É TOCADA (ordem
-- !!! do dono: «era só na mudelar»; a rafaelcategoria fica). Os ids foram lidos na RH a
-- !!! 27/11/2026 (SELECT como administrador, sem RLS), depois de 20270130370000. Noutra base (a principal) sai por
-- !!! RAISE NOTICE sem escrever nada: sem _mudelar_excel.onda3_produtos (a onda 3 só correu na RH) ou sem estas
-- !!! categorias. Antes do `db push`, confirmar supabase/.temp/project-ref = uetjghdkwbywbftedtth.
--
-- Pedido do dono (27/11/2026): «pq que tenho modelos 3d de coisas que eles nao teem produtos , os modelos 3d genericos
-- que nao teem ligacao a nenhum produto ou algo tira, e tira categorias e subcategorias que nao teem produtos». Esta
-- migration trata SÓ das categorias; os modelos 3D genéricos são código (outro commit).
--
-- O QUE FAZ: apaga (soft delete) 14 categorias da Mudelar, todas sem nenhum produto (nem vivo nem apagado), sem filhas e
-- sem nenhuma referência noutra tabela:
--   Mudelar (14): 1 de topo — Mobiliário de Roupeiros (MR); 13 subcategorias — Aros, Guarnições e Acabamentos,
--   Ferragens e Acessórios, Portas de Segurança / Blindadas, Portas de Serviço / Técnicas, Portas Exteriores (de Portas);
--   Cubas encastrar / pousar / embutir (de Lava-louças & Cubas); Frentes / portas (de Mobiliário & Componentes
--   Cozinha); Janelas Alumínio (de Janelas); Nichos, Prateleiras (de Acessórios de Casa de Banho); pedra (de Bancadas
--   de Cozinha); Resguardos Banheira (de Duche & Banho); Sifões Lavatório (de Torneiras & Misturadoras).
--   nike: nenhuma (a rafaelcategoria fica; G1 e C3/C4 confirmam que a nike fica igual).
-- A escrita é a mesma de rpc_delete_product_category / rpc_delete_product_subcategory (lidas na base a 27/11):
-- is_active = false, deleted_at = now(), deleted_by = utilizador. A sigla fica livre: o índice único
-- product_categories_sigla_ambito_key só conta linhas com deleted_at IS NULL (G7 confirma).
--
-- O QUE NÃO FAZ: não apaga fisicamente nada; não toca em produtos, modelos, negócios, orçamentos, atributos, preços,
-- fornecedores nem noutra organização; não apaga as categorias sem produtos que ainda têm uso (ficam, por decisão do
-- dono): Materiais, laminados, Portas Interiores, Janelas PVC e Janelas (referidas por 55 linhas de negocio_produtos),
-- Bancadas de Cozinha e Portas (pais das que ficam), e Painéis Acústicos (usada no Excel da Mudelar, RPA0001).
--
-- GATILHOS de product_categories (lidos a 27/11): trg_audit_product_categories (AFTER, fn_audit_product_categories_
-- with_sentinel: escreve a auditoria com app.audit_user_id e app.audit_source, salvo app.audit_bypass = 'on'),
-- trg_cat_sigla_categoria (só BEFORE INSERT: não dispara num UPDATE) e update_product_categories_updated_at (BEFORE
-- UPDATE: updated_at). Nenhum calcula caminho, nível ou contagens. Aqui a auditoria fica a cargo do gatilho (uma linha
-- de UPDATE por categoria, com is_active, deleted_at e deleted_by), e não por fn_manual_audit_log como a RPC.
--
-- GUARDAS: G0 a base é a RH e as organizações existem (senão NOTICE e sai); L1 a lista tem 14, todas da Mudelar (1 de
-- topo e 13 subcategorias), nenhuma da nike; G1 categorias vivas: Mudelar 94, nike 34, nenhuma noutra organização;
-- G2 cada categoria existe na Mudelar, viva, com o nome, a sigla e o pai lidos, sem modelo_3d; G3 nenhum produto (vivo ou
-- apagado) por category_id, subcategory_id ou catalogo_categoria_id; G4 nenhuma filha viva (parent_id ou
-- parent_category_id); G5 nenhuma referência em cat_config_3d, category_attribute_palettes, category_attributes,
-- inventory_counts, product_attribute_price_ranges, product_attribute_value_prices, product_category_organizations,
-- product_models, services, supplier_catalog_items, bundles, deal_needs, negocio_produtos, quote_versao_produtos,
-- ops_ativo, ops_medicao_def nem no texto de negocio_vista_cliente (as 15 chaves estrangeiras para product_categories
-- estão todas cobertas: estas, products e parent_id/parent_category_id); G6 o utilizador da auditoria é membro ativo da
-- Mudelar e a auditoria está ligada; G7 o índice da sigla é parcial em deleted_at IS NULL. Lock: as 14 linhas FOR
-- UPDATE (bloqueia produtos novos a apontar para elas até ao fim).
-- CONFERÊNCIAS: C1 as 14 ficam apagadas por esta migration e o resto da linha igual à cópia; C2 uma linha de auditoria
-- por categoria; C3 as outras categorias iguais (a nike incluída); C4 vivas: Mudelar 80, nike 34 (igual); C5 nada
-- escrito fora das 14 (xmin); C6 continua sem produtos nem filhas vivas; C7 a cópia fechada (::text nas ACL e no relkind).
--
-- CÓPIA E REVERSÃO: a linha inteira de cada categoria antes de apagar fica em
-- _limpeza_catalogo.categorias_sem_produtos (só postgres). REVERSÃO fora da pasta das migrations (estar aqui é ser
-- aplicada): reverter-limpar-categorias.sql, guardado com o trabalho; repõe só as que ainda estão como esta migration
-- as deixou.
--
-- ORDEM: depois de 20270130370000 (última no remoto RH a 27/11) e antes de 20270130400000 (Ativos, retida). `supabase db
-- push` aplica TUDO o que estiver pendente: listar com `supabase migration list --linked` imediatamente antes e empurrar
-- só esta.
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- ─── 1. A lista fechada (tabela temporária: desaparece no COMMIT) ──────────────────────────────────
-- id, organização, nome, sigla e pai (NULL = categoria de topo), lidos a 27/11
CREATE TEMP TABLE _lc_cat (id uuid PRIMARY KEY, org uuid NOT NULL, nome text NOT NULL, sigla text NOT NULL, pai uuid) ON COMMIT DROP;
INSERT INTO _lc_cat (id, org, nome, sigla, pai) VALUES
  ('ab6ce84c-5414-444b-82a4-68981b3885a6', '3242e925-da26-459a-8258-be04d904e355', 'Mobiliário de Roupeiros', 'MR', NULL),
  ('df6dcca9-e857-4f12-85c4-4255b1457d15', '3242e925-da26-459a-8258-be04d904e355', 'Aros, Guarnições e Acabamentos', 'AGA', '5214c966-2c55-48b2-9b61-10358494d9c8'),
  ('66051bce-d99f-44d1-ad69-6efae99950ba', '3242e925-da26-459a-8258-be04d904e355', 'Cubas encastrar / pousar / embutir', 'CEPE', '0ba5bf5b-cd28-4f4f-bdaa-46f7072abad9'),
  ('025949cb-60bb-4edb-b79f-ffad81aabf1e', '3242e925-da26-459a-8258-be04d904e355', 'Ferragens e Acessórios', 'FA', '5214c966-2c55-48b2-9b61-10358494d9c8'),
  ('940322c7-874c-450e-964e-0bd5152d867e', '3242e925-da26-459a-8258-be04d904e355', 'Frentes / portas', 'FP', '75ebff02-f5b1-4c9a-a80e-1ab21b381173'),
  ('2106e169-3cd9-48ef-b8fa-db5ef1b7e8ae', '3242e925-da26-459a-8258-be04d904e355', 'Janelas Alumínio', 'JA', '1ca86cdf-a0c3-4f8c-ab3c-d680cc2266c8'),
  ('c7fd403f-a6bc-442c-83ee-df4874913e9b', '3242e925-da26-459a-8258-be04d904e355', 'Nichos', 'NC', 'd4e8b4bc-85af-4752-be4a-07130b3a7304'),
  ('ba837c8e-a28b-466c-a6ac-38bf935b7552', '3242e925-da26-459a-8258-be04d904e355', 'pedra', 'PD', 'dfd635df-e9a1-4bf3-b242-57926137287b'),
  ('96cdf80c-df3d-40bf-a190-f9b88f0a39c2', '3242e925-da26-459a-8258-be04d904e355', 'Portas de Segurança / Blindadas', 'PSB', '5214c966-2c55-48b2-9b61-10358494d9c8'),
  ('77c5a922-e557-4a9e-b8fd-de6cdda31f02', '3242e925-da26-459a-8258-be04d904e355', 'Portas de Serviço / Técnicas', 'PST', '5214c966-2c55-48b2-9b61-10358494d9c8'),
  ('a749455e-abc7-41e3-95d8-fed91dd848bb', '3242e925-da26-459a-8258-be04d904e355', 'Portas Exteriores', 'PE', '5214c966-2c55-48b2-9b61-10358494d9c8'),
  ('c8d587a7-0f47-4dc9-9262-5aa2b242d4d9', '3242e925-da26-459a-8258-be04d904e355', 'Prateleiras', 'PRT', 'd4e8b4bc-85af-4752-be4a-07130b3a7304'),
  ('b28862b9-c76f-4bd8-bb10-0d01bc23c1eb', '3242e925-da26-459a-8258-be04d904e355', 'Resguardos Banheira', 'RB', 'b808fe48-e4e6-4096-abf0-34fc7a703257'),
  ('a99b9a8a-3e47-46e4-bdb7-aedc1fa0ed6d', '3242e925-da26-459a-8258-be04d904e355', 'Sifões Lavatório', 'SL', 'b50f7163-b41d-4a49-986d-a43e2be74d5e');

-- ─── 2. Guardas, cópia, escrita e conferências (um só bloco: tudo ou nada) ─────────────────────────
DO $mig$
DECLARE
  c_mudelar         constant uuid    := '3242e925-da26-459a-8258-be04d904e355';
  c_nike            constant uuid    := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_criador         constant uuid    := 'ba0b0ebf-1bdb-43f9-b82b-a2ade29848e2';
  c_fonte           constant text    := 'migration:limpar_categorias_sem_produtos';
  c_n_cat           constant integer := 14;
  c_n_mudelar       constant integer := 14;
  c_n_nike          constant integer := 0;
  c_n_topo          constant integer := 1;
  c_n_sub           constant integer := 13;
  c_vivas_mudelar   constant integer := 94;
  c_vivas_nike      constant integer := 34;
  v_n bigint; v_m bigint; v_feito bigint; v_upd bigint;
  v_agora timestamptz := now();
  v_acl text; v_xid text; v_t text; v_txt text;
  v_h_outras_antes text; v_h_outras_depois text;
BEGIN
  -- G0: só na base de RH (a cópia _mudelar_excel.onda3_produtos só existe lá) e com as duas organizações
  IF to_regclass('_mudelar_excel.onda3_produtos') IS NULL THEN
    RAISE NOTICE 'limpar_categorias: não é a base de RH (sem _mudelar_excel.onda3_produtos) — nada a fazer.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_mudelar AND o.name = 'Mudelar' AND o.deleted_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_nike AND o.name = 'nike' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'limpar_categorias: a Mudelar (%) ou a nike (%) não existe nesta base — nada a fazer.', c_mudelar, c_nike;
    RETURN;
  END IF;
  SELECT count(*) INTO v_n FROM _lc_cat s JOIN product_categories c ON c.id = s.id;
  IF v_n = 0 THEN
    RAISE NOTICE 'limpar_categorias: as categorias da lista não existem aqui — nada a fazer.';
    RETURN;
  END IF;

  -- L1: a lista embutida tem os números do cabeçalho
  SELECT count(*), count(DISTINCT s.id) INTO v_n, v_m FROM _lc_cat s;
  IF v_n <> c_n_cat OR v_m <> c_n_cat THEN RAISE EXCEPTION 'L1: a lista tem % linhas (% ids distintos); esperavam-se %.', v_n, v_m, c_n_cat; END IF;
  IF (SELECT count(*) FROM _lc_cat s WHERE s.org = c_mudelar) <> c_n_mudelar
     OR (SELECT count(*) FROM _lc_cat s WHERE s.org = c_nike) <> c_n_nike
     OR (SELECT count(*) FROM _lc_cat s WHERE s.pai IS NULL) <> c_n_topo
     OR (SELECT count(*) FROM _lc_cat s WHERE s.pai IS NOT NULL) <> c_n_sub
     OR c_n_mudelar + c_n_nike <> c_n_cat OR c_n_topo + c_n_sub <> c_n_cat THEN
    RAISE EXCEPTION 'L1: a lista não tem % da Mudelar, % da nike, % de topo e % subcategorias.', c_n_mudelar, c_n_nike, c_n_topo, c_n_sub;
  END IF;
  IF EXISTS (SELECT 1 FROM _lc_cat s WHERE s.org <> c_mudelar) THEN
    RAISE EXCEPTION 'L1: a lista tem categorias fora da Mudelar (%): esta migration só escreve na Mudelar.', c_mudelar;
  END IF;

  PERFORM set_config('app.audit_source', c_fonte, true);
  PERFORM set_config('app.audit_user_id', c_criador::text, true);
  -- as 14 linhas presas até ao fim, por ordem fixa (um produto novo que aponte para elas espera pelo COMMIT)
  PERFORM 1 FROM product_categories c WHERE c.id IN (SELECT s.id FROM _lc_cat s) ORDER BY c.id FOR UPDATE;

  -- já aplicada? (as 14 apagadas por esta migration e a cópia existe) — sai por NOTICE; estado a meio — pára
  SELECT count(*) INTO v_feito FROM _lc_cat s JOIN product_categories c ON c.id = s.id
  WHERE c.deleted_at IS NOT NULL AND c.deleted_by = c_criador AND c.is_active = false;
  IF v_feito = c_n_cat AND to_regclass('_limpeza_catalogo.categorias_sem_produtos') IS NOT NULL THEN
    RAISE NOTICE 'limpar_categorias: já aplicada (as % categorias já estão apagadas) — nada a fazer.', c_n_cat;
    RETURN;
  END IF;
  IF v_feito > 0 THEN
    RAISE EXCEPTION 'limpar_categorias: estado a meio ou a base mudou: % de % categorias já apagadas.', v_feito, c_n_cat;
  END IF;

  -- G1: categorias vivas por organização (as únicas duas com categorias nesta base; a nike só se conta, não se toca)
  SELECT count(*) FILTER (WHERE c.organization_id = c_mudelar), count(*) FILTER (WHERE c.organization_id = c_nike)
  INTO v_n, v_m FROM product_categories c WHERE c.deleted_at IS NULL;
  IF v_n <> c_vivas_mudelar OR v_m <> c_vivas_nike THEN
    RAISE EXCEPTION 'G1: categorias vivas: Mudelar %, nike %; esperavam-se % e %.', v_n, v_m, c_vivas_mudelar, c_vivas_nike;
  END IF;
  SELECT count(*) INTO v_n FROM product_categories c
  WHERE c.deleted_at IS NULL AND c.organization_id IS DISTINCT FROM c_mudelar AND c.organization_id IS DISTINCT FROM c_nike;
  IF v_n <> 0 THEN RAISE EXCEPTION 'G1: % categorias vivas noutras organizações (ou sem organização).', v_n; END IF;

  -- G2: cada categoria existe na organização certa, viva, com o nome, a sigla e o pai lidos, e sem modelo_3d
  SELECT count(*) INTO v_n FROM _lc_cat s JOIN product_categories c ON c.id = s.id
  WHERE c.organization_id = s.org AND c.deleted_at IS NULL AND c.name = s.nome AND c.sigla = s.sigla
    AND coalesce(c.parent_id, c.parent_category_id) IS NOT DISTINCT FROM s.pai AND c.modelo_3d IS NULL;
  IF v_n <> c_n_cat THEN
    SELECT string_agg(s.nome, '; ' ORDER BY s.nome) INTO v_txt FROM _lc_cat s
    WHERE NOT EXISTS (SELECT 1 FROM product_categories c WHERE c.id = s.id AND c.organization_id = s.org AND c.deleted_at IS NULL
      AND c.name = s.nome AND c.sigla = s.sigla AND coalesce(c.parent_id, c.parent_category_id) IS NOT DISTINCT FROM s.pai AND c.modelo_3d IS NULL);
    RAISE EXCEPTION 'G2: só % de % categorias estão como lidas (organização, viva, nome, sigla, pai, sem modelo_3d). Diferentes: %', v_n, c_n_cat, v_txt;
  END IF;

  -- G3: nenhum produto (vivo ou apagado) aponta para elas
  SELECT count(*) INTO v_n FROM products p
  WHERE p.category_id IN (SELECT s.id FROM _lc_cat s) OR p.subcategory_id IN (SELECT s.id FROM _lc_cat s)
     OR p.catalogo_categoria_id IN (SELECT s.id FROM _lc_cat s);
  IF v_n <> 0 THEN RAISE EXCEPTION 'G3: % produtos apontam para categorias da lista.', v_n; END IF;

  -- G4: nenhuma filha viva
  SELECT count(*) INTO v_n FROM product_categories f
  WHERE f.deleted_at IS NULL AND (f.parent_id IN (SELECT s.id FROM _lc_cat s) OR f.parent_category_id IN (SELECT s.id FROM _lc_cat s));
  IF v_n <> 0 THEN RAISE EXCEPTION 'G4: % subcategorias vivas penduram de categorias da lista.', v_n; END IF;

  -- G5: nenhuma referência noutra tabela (chaves estrangeiras e colunas sem chave)
  SELECT (SELECT count(*) FROM cat_config_3d x WHERE x.categoria_id IN (SELECT s.id FROM _lc_cat s))
       + (SELECT count(*) FROM category_attribute_palettes x WHERE x.category_id IN (SELECT s.id FROM _lc_cat s))
       + (SELECT count(*) FROM category_attributes x WHERE x.category_id IN (SELECT s.id FROM _lc_cat s))
       + (SELECT count(*) FROM inventory_counts x WHERE x.category_id IN (SELECT s.id FROM _lc_cat s))
       + (SELECT count(*) FROM product_attribute_price_ranges x WHERE x.category_id IN (SELECT s.id FROM _lc_cat s))
       + (SELECT count(*) FROM product_attribute_value_prices x WHERE x.category_id IN (SELECT s.id FROM _lc_cat s))
       + (SELECT count(*) FROM product_category_organizations x WHERE x.category_id IN (SELECT s.id FROM _lc_cat s))
       + (SELECT count(*) FROM product_models x WHERE x.subcategory_id IN (SELECT s.id FROM _lc_cat s))
       + (SELECT count(*) FROM services x WHERE x.exige_categoria_produto_id IN (SELECT s.id FROM _lc_cat s)
            OR x.exige_produto_categoria_id IN (SELECT s.id FROM _lc_cat s) OR x.service_category_id IN (SELECT s.id FROM _lc_cat s)
            OR x.service_subcategory_id IN (SELECT s.id FROM _lc_cat s))
       + (SELECT count(*) FROM supplier_catalog_items x WHERE x.categoria_id IN (SELECT s.id FROM _lc_cat s) OR x.subcategoria_id IN (SELECT s.id FROM _lc_cat s))
       + (SELECT count(*) FROM bundles x WHERE x.catalogo_categoria_id IN (SELECT s.id FROM _lc_cat s))
       + (SELECT count(*) FROM deal_needs x WHERE x.category_id IN (SELECT s.id FROM _lc_cat s))
       + (SELECT count(*) FROM negocio_produtos x WHERE x.categoria_id IN (SELECT s.id FROM _lc_cat s))
       + (SELECT count(*) FROM quote_versao_produtos x WHERE x.categoria_id IN (SELECT s.id FROM _lc_cat s))
       + (SELECT count(*) FROM ops_ativo x WHERE x.categoria_id IN (SELECT s.id FROM _lc_cat s))
       + (SELECT count(*) FROM ops_medicao_def x WHERE x.categoria_ativo_id IN (SELECT s.id FROM _lc_cat s))
       + (SELECT count(*) FROM negocio_vista_cliente x WHERE EXISTS (SELECT 1 FROM _lc_cat s WHERE position(s.id::text IN x::text) > 0))
  INTO v_n;
  IF v_n <> 0 THEN RAISE EXCEPTION 'G5: % referências noutras tabelas a categorias da lista.', v_n; END IF;

  -- G6: o utilizador da auditoria existe e é membro ativo da Mudelar; a auditoria dos gatilhos está ligada
  IF NOT EXISTS (SELECT 1 FROM anew_users u WHERE u.id = c_criador AND u.deleted_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM anew_memberships ms
         WHERE ms.user_id = c_criador AND ms.organization_id = c_mudelar AND ms.status = 'active') THEN
    RAISE EXCEPTION 'G6: o utilizador % não existe em anew_users, está apagado ou não é membro ativo da Mudelar.', c_criador;
  END IF;
  IF coalesce(current_setting('app.audit_bypass', true), '') = 'on' THEN
    RAISE EXCEPTION 'G6: app.audit_bypass está ligado: as categorias seriam apagadas sem auditoria.';
  END IF;

  -- G7: o índice único da sigla é parcial em deleted_at IS NULL (o soft delete liberta a sigla, como no ecrã)
  SELECT pg_get_indexdef(i.indexrelid) INTO v_txt FROM pg_index i
  WHERE i.indexrelid = to_regclass('public.product_categories_sigla_ambito_key');
  IF v_txt IS NULL OR position('deleted_at IS NULL' IN v_txt) = 0 THEN
    RAISE EXCEPTION 'G7: o índice product_categories_sigla_ambito_key não existe ou não é parcial em deleted_at (%).', coalesce(v_txt, 'sem índice');
  END IF;

  -- impressão digital das outras categorias (C3)
  SELECT md5(coalesce(string_agg(to_jsonb(c)::text, '|' ORDER BY c.id), '')) INTO v_h_outras_antes
  FROM product_categories c WHERE c.id NOT IN (SELECT s.id FROM _lc_cat s);

  -- cópia do estado antigo, num schema fechado
  CREATE SCHEMA IF NOT EXISTS _limpeza_catalogo;
  REVOKE ALL ON SCHEMA _limpeza_catalogo FROM PUBLIC, anon, authenticated, service_role;
  IF to_regclass('_limpeza_catalogo.categorias_sem_produtos') IS NOT NULL THEN
    RAISE EXCEPTION 'B1: a cópia _limpeza_catalogo.categorias_sem_produtos já existe mas as categorias estão vivas: rever à mão.';
  END IF;
  CREATE TABLE _limpeza_catalogo.categorias_sem_produtos (id uuid PRIMARY KEY, organization_id uuid NOT NULL, linha jsonb NOT NULL,
    apagada_em timestamptz NOT NULL, apagada_por uuid NOT NULL);
  REVOKE ALL ON ALL TABLES IN SCHEMA _limpeza_catalogo FROM PUBLIC, anon, authenticated, service_role;
  INSERT INTO _limpeza_catalogo.categorias_sem_produtos (id, organization_id, linha, apagada_em, apagada_por)
  SELECT c.id, c.organization_id, to_jsonb(c), v_agora, c_criador FROM product_categories c JOIN _lc_cat s ON s.id = c.id;

  -- ESCRITA: a mesma das RPC de apagar do ecrã (soft delete); o gatilho de auditoria escreve uma linha por categoria
  UPDATE product_categories c
  SET is_active = false, deleted_at = v_agora, deleted_by = c_criador
  FROM _lc_cat s
  WHERE c.id = s.id AND c.organization_id = c_mudelar AND s.org = c_mudelar AND c.deleted_at IS NULL;
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd <> c_n_cat THEN RAISE EXCEPTION 'W1: % categorias apagadas; esperavam-se %.', v_upd, c_n_cat; END IF;

  -- C1: as 14 ficam apagadas por esta migration e o resto da linha igual à cópia
  SELECT count(*) INTO v_n FROM _limpeza_catalogo.categorias_sem_produtos b JOIN product_categories c ON c.id = b.id
  WHERE c.is_active = false AND c.deleted_at = v_agora AND c.deleted_by = c_criador
    AND to_jsonb(c) - ARRAY['is_active', 'deleted_at', 'deleted_by', 'updated_at'] = b.linha - ARRAY['is_active', 'deleted_at', 'deleted_by', 'updated_at'];
  IF v_n <> c_n_cat THEN RAISE EXCEPTION 'C1: só % de % categorias ficaram apagadas com o resto da linha igual.', v_n, c_n_cat; END IF;

  -- C2: uma linha de auditoria de UPDATE por categoria, com esta fonte e este utilizador (o gatilho engole erros: conta-se)
  SELECT count(*), count(DISTINCT l.entity_id) INTO v_n, v_m FROM entity_audit_log l
  WHERE l.table_name = 'product_categories' AND l.operation = 'UPDATE' AND l.source = c_fonte AND l.changed_by = c_criador
    AND l.entity_id IN (SELECT s.id FROM _lc_cat s) AND l.changed_fields ? 'deleted_at';
  IF v_n <> c_n_cat OR v_m <> c_n_cat THEN RAISE EXCEPTION 'C2: % linhas de auditoria (% categorias distintas), esperadas %.', v_n, v_m, c_n_cat; END IF;

  -- C3: as outras categorias ficam iguais (todas as da nike incluídas)
  SELECT md5(coalesce(string_agg(to_jsonb(c)::text, '|' ORDER BY c.id), '')) INTO v_h_outras_depois
  FROM product_categories c WHERE c.id NOT IN (SELECT s.id FROM _lc_cat s);
  IF v_h_outras_depois IS DISTINCT FROM v_h_outras_antes THEN RAISE EXCEPTION 'C3: outras categorias mudaram.'; END IF;

  -- C4: categorias vivas por organização depois
  SELECT count(*) FILTER (WHERE c.organization_id = c_mudelar), count(*) FILTER (WHERE c.organization_id = c_nike)
  INTO v_n, v_m FROM product_categories c WHERE c.deleted_at IS NULL;
  IF v_n <> c_vivas_mudelar - c_n_mudelar OR v_m <> c_vivas_nike - c_n_nike THEN
    RAISE EXCEPTION 'C4: categorias vivas depois: Mudelar %, nike %; esperavam-se % e %.', v_n, v_m, c_vivas_mudelar - c_n_mudelar, c_vivas_nike - c_n_nike;
  END IF;

  -- C5: nada escrito fora das 14 categorias (nenhuma outra linha destas tabelas tem o xmin desta transação)
  v_xid := (txid_current() % 4294967296)::text;
  SELECT (SELECT count(*) FROM product_categories c WHERE c.xmin::text = v_xid AND c.id NOT IN (SELECT s.id FROM _lc_cat s))
       + (SELECT count(*) FROM products p WHERE p.xmin::text = v_xid)
       + (SELECT count(*) FROM product_models x WHERE x.xmin::text = v_xid)
       + (SELECT count(*) FROM product_category_organizations x WHERE x.xmin::text = v_xid)
       + (SELECT count(*) FROM negocio_produtos x WHERE x.xmin::text = v_xid)
  INTO v_n;
  IF v_n > 0 THEN RAISE EXCEPTION 'C5: % linhas escritas fora das categorias da lista.', v_n; END IF;

  -- C6: continua sem produtos nem filhas vivas a apontar para elas
  SELECT (SELECT count(*) FROM products p WHERE p.category_id IN (SELECT s.id FROM _lc_cat s)
            OR p.subcategory_id IN (SELECT s.id FROM _lc_cat s) OR p.catalogo_categoria_id IN (SELECT s.id FROM _lc_cat s))
       + (SELECT count(*) FROM product_categories f WHERE f.deleted_at IS NULL
            AND (f.parent_id IN (SELECT s.id FROM _lc_cat s) OR f.parent_category_id IN (SELECT s.id FROM _lc_cat s)))
  INTO v_n;
  IF v_n <> 0 THEN RAISE EXCEPTION 'C6: % produtos ou filhas vivas apontam para categorias apagadas.', v_n; END IF;

  -- C7: a cópia fica fechada (schema e tabelas sem privilégios para PUBLIC, anon, authenticated nem service_role)
  SELECT coalesce(n.nspacl::text, '') INTO v_acl FROM pg_namespace n WHERE n.nspname = '_limpeza_catalogo';
  IF v_acl LIKE '%anon=%' OR v_acl LIKE '%authenticated=%' OR v_acl LIKE '%service_role=%' OR v_acl LIKE '{=%' OR v_acl LIKE '%,=%' THEN
    RAISE EXCEPTION 'C7: o schema _limpeza_catalogo ficou aberto (%).', v_acl;
  END IF;
  FOR v_t IN SELECT c.oid::regclass::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = '_limpeza_catalogo' AND c.relkind::text = 'r' LOOP
    SELECT coalesce(c.relacl::text, '') INTO v_acl FROM pg_class c WHERE c.oid = to_regclass(v_t);
    IF v_acl LIKE '%anon=%' OR v_acl LIKE '%authenticated=%' OR v_acl LIKE '%service_role=%' OR v_acl LIKE '{=%' OR v_acl LIKE '%,=%' THEN
      RAISE EXCEPTION 'C7: % ficou aberta (%).', v_t, v_acl;
    END IF;
  END LOOP;

  RAISE NOTICE 'limpar_categorias: % categorias da Mudelar apagadas (% de topo e % subcategorias); nike intocada.', c_n_cat, c_n_topo, c_n_sub;
END $mig$;

COMMIT;
