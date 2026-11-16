-- =============================================================================
-- Teste da migration 20270117800000_catalogo_categorias_mudelar.sql
-- Base de RH (uetjghdkwbywbftedtth), organização Mudelar
-- (3242e925-da26-459a-8258-be04d904e355). Sem pgtap.
-- Corre numa transacção desfeita (BEGIN … ROLLBACK). Só LÊ: nada é escrito em
-- nenhuma organização (a migration é que escreve; a reexecução do passo 3 pára
-- na guarda).
--
-- Como correr (a partir do worktree rh-pessoas, com project-ref confirmado):
--   supabase db query --linked -f supabase/tests/catalogo_categorias_mudelar.test.sql
--
-- ANTES da migration: falha no passo 0 com
--   «passo 0 — FALHOU: a Mudelar ainda não tem as categorias de produtos» (vermelho).
-- DEPOIS da migration: passa os passos 0 a 6 e termina com «OK: …» (verde).
--
-- As funções da migration (pg_temp.catm_*) vêm copiadas aqui, geradas da mesma
-- fonte: o passo 2 corre a verificação da própria migration sobre o estado real.
--
-- Passo 5 (cat_ler_categorias_gestao): sessão emprestada (role authenticated,
-- auth.uid() pelas claims) de um membro activo da Mudelar, não system admin, com
-- products.edit ou services.view lá. Se não houver nenhum, salta com NOTICE.
-- Não há chamadas recusadas de propósito.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Passo 0. A Mudelar já tem as categorias? (é aqui que falha ANTES da migration)
-- ---------------------------------------------------------------------------
DO $t0$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar') THEN
    RAISE EXCEPTION 'passo 0 — FALHOU: a Mudelar (%) não existe nesta base', c_org;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.product_categories c WHERE c.organization_id = c_org AND c.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'passo 0 — FALHOU: a Mudelar ainda não tem as categorias de produtos (aplicar 20270117800000_catalogo_categorias_mudelar.sql).';
  END IF;
  RAISE NOTICE 'passo 0: a Mudelar tem categorias de produtos.';
END;
$t0$;

-- ---------------------------------------------------------------------------
-- Cópia exacta do bloco de funções da migration.
-- ---------------------------------------------------------------------------
-- Utilizador que fica em created_by (product_categories.created_by é NOT NULL com
-- chave para anew_users): o membro mais antigo da organização com a relação activa
-- (status 'active', sem end_date), que não é cliente e cujo utilizador não está apagado.
CREATE OR REPLACE FUNCTION pg_temp.catm_criador(p_org uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $fn$
BEGIN
  RETURN (
    SELECT m.user_id
      FROM public.anew_memberships m
      JOIN public.anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL
     WHERE m.organization_id = p_org
       AND m.status = 'active'
       AND m.end_date IS NULL
       AND COALESCE(m.role_is_client, false) = false
     ORDER BY m.created_at, m.user_id
     LIMIT 1
  );
END;
$fn$;

-- As 93 categorias a criar: (pai, nome, descricao). pai NULL = categoria de topo.
-- Nomes já sem espaços nas pontas. Fica de fora a subcategoria órfã «Tampos»
-- (pai «Marmorista», apagado na principal).
CREATE OR REPLACE FUNCTION pg_temp.catm_alvo()
RETURNS TABLE (pai text, nome text, descricao text)
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT v.pai, v.nome, v.descricao
    FROM (VALUES
      (NULL::text, 'Acessórios de Casa de Banho'::text, NULL::text),
      (NULL, 'Bancadas de Cozinha', NULL),
      (NULL, 'Duche & Banho', NULL),
      (NULL, 'Eletrodomésticos', NULL),
      (NULL, 'Janelas', NULL),
      (NULL, 'Lava-louças & Cubas', NULL),
      (NULL, 'Loiças Sanitárias', NULL),
      (NULL, 'Materiais', NULL),
      (NULL, 'Mobiliário & Componentes Cozinha', NULL),
      (NULL, 'Mobiliário de Roupeiros', NULL),
      (NULL, 'Móveis & Arrumação Casa de Banho', NULL),
      (NULL, 'Portas', NULL),
      (NULL, 'Revestimentos', NULL),
      (NULL, 'Torneiras & Misturadoras', NULL),
      ('Acessórios de Casa de Banho', 'Bancos', NULL),
      ('Acessórios de Casa de Banho', 'Cabides', NULL),
      ('Acessórios de Casa de Banho', 'Cadeiras', NULL),
      ('Acessórios de Casa de Banho', 'Cestos', NULL),
      ('Acessórios de Casa de Banho', 'Nichos', NULL),
      ('Acessórios de Casa de Banho', 'Pega De Segurança', NULL),
      ('Acessórios de Casa de Banho', 'Piaçaba', NULL),
      ('Acessórios de Casa de Banho', 'Porta-rolos', NULL),
      ('Acessórios de Casa de Banho', 'Prateleiras', NULL),
      ('Acessórios de Casa de Banho', 'Toalheiros', NULL),
      ('Bancadas de Cozinha', 'laminados', NULL),
      ('Bancadas de Cozinha', 'pedra', NULL),
      ('Duche & Banho', 'Banheiras', NULL),
      ('Duche & Banho', 'Bases Duche', NULL),
      ('Duche & Banho', 'Chuveiro Higiénico', NULL),
      ('Duche & Banho', 'Colunas Duche', NULL),
      ('Duche & Banho', 'Resguardos Banheira', NULL),
      ('Duche & Banho', 'Resguardos de Duche', NULL),
      ('Eletrodomésticos', 'Esquentador', NULL),
      ('Eletrodomésticos', 'Exaustores', NULL),
      ('Eletrodomésticos', 'Fornos', NULL),
      ('Eletrodomésticos', 'Frigoríficos', NULL),
      ('Eletrodomésticos', 'Garrafeira', NULL),
      ('Eletrodomésticos', 'Micro-ondas', NULL),
      ('Eletrodomésticos', 'Máquinas lavar & secar roupa', NULL),
      ('Eletrodomésticos', 'Máquinas lavar loiça', NULL),
      ('Eletrodomésticos', 'Máquinas lavar roupa', NULL),
      ('Eletrodomésticos', 'Máquinas secar roupa', NULL),
      ('Eletrodomésticos', 'Placas', NULL),
      ('Eletrodomésticos', 'Termoacumulador', NULL),
      ('Eletrodomésticos', 'Ventax', NULL),
      ('Janelas', 'Janelas Alumínio', NULL),
      ('Janelas', 'Janelas PVC', NULL),
      ('Lava-louças & Cubas', 'Cubas compósito', NULL),
      ('Lava-louças & Cubas', 'Cubas encastrar / pousar / embutir', NULL),
      ('Lava-louças & Cubas', 'Cubas inox', NULL),
      ('Loiças Sanitárias', 'Bidés', NULL),
      ('Loiças Sanitárias', 'Kit´s para Sanitários', NULL),
      ('Loiças Sanitárias', 'Lavatórios', NULL),
      ('Loiças Sanitárias', 'Sanitas', NULL),
      ('Mobiliário & Componentes Cozinha', 'Acessórios de Cozinha', NULL),
      ('Mobiliário & Componentes Cozinha', 'Armários Inferiores', NULL),
      ('Mobiliário & Componentes Cozinha', 'Armários de Coluna', NULL),
      ('Mobiliário & Componentes Cozinha', 'Armários superiores', NULL),
      ('Mobiliário & Componentes Cozinha', 'Cozinha Completa - Projetos', NULL),
      ('Mobiliário & Componentes Cozinha', 'Frentes / portas', NULL),
      ('Mobiliário & Componentes Cozinha', 'Puxadores', NULL),
      ('Móveis & Arrumação Casa de Banho', 'Apliques LED', NULL),
      ('Móveis & Arrumação Casa de Banho', 'Colunas', NULL),
      ('Móveis & Arrumação Casa de Banho', 'Espelhos', NULL),
      ('Móveis & Arrumação Casa de Banho', 'Móveis de lavatório', NULL),
      ('Móveis & Arrumação Casa de Banho', 'Tampos & Bancadas WC', NULL),
      ('Portas', 'Aros, Guarnições e Acabamentos', NULL),
      ('Portas', 'Ferragens e Acessórios', NULL),
      ('Portas', 'Portas Exteriores', NULL),
      ('Portas', 'Portas Interiores', NULL),
      ('Portas', 'Portas de Segurança / Blindadas', NULL),
      ('Portas', 'Portas de Serviço / Técnicas', NULL),
      ('Revestimentos', 'Cerâmico', NULL),
      ('Revestimentos', 'Cerâmico Laminado', NULL),
      ('Revestimentos', 'Microcimento', NULL),
      ('Revestimentos', 'Painel de Resina', NULL),
      ('Revestimentos', 'Painéis Acústicos', NULL),
      ('Revestimentos', 'Pedra Natural', NULL),
      ('Revestimentos', 'Porcelânico', NULL),
      ('Revestimentos', 'SPC', NULL),
      ('Torneiras & Misturadoras', 'Misturadoras Monocomando', NULL),
      ('Torneiras & Misturadoras', 'Misturadoras Monocomando Abatível', NULL),
      ('Torneiras & Misturadoras', 'Misturadoras Monocomando Extraível', NULL),
      ('Torneiras & Misturadoras', 'Misturadoras Monocomando Flexivel', NULL),
      ('Torneiras & Misturadoras', 'Misturadoras Monocomando Giratória', NULL),
      ('Torneiras & Misturadoras', 'Sifões Lavatório', NULL),
      ('Torneiras & Misturadoras', 'Torneira Banheira', NULL),
      ('Torneiras & Misturadoras', 'Torneira Bidé', NULL),
      ('Torneiras & Misturadoras', 'Torneira Duche', NULL),
      ('Torneiras & Misturadoras', 'Torneira Encastre', NULL),
      ('Torneiras & Misturadoras', 'Torneira Lavatório', NULL),
      ('Torneiras & Misturadoras', 'Torneira Pé Alto', NULL),
      ('Torneiras & Misturadoras', 'Válvulas Click-Clack', NULL)
    ) AS v(pai, nome, descricao);
END;
$fn$;

-- Slug e ordem de cada uma. Slug = public.fn_cat_slug(nome), como
-- fn_cat_categoria_produto. Se dois slugs coincidirem (hoje nenhum), o primeiro
-- (topo antes de sub; depois por pai e nome sem acentos) fica com o slug simples e
-- os seguintes levam o slug do pai à frente («bancadas-de-cozinha-laminados»), ou
-- «-2», «-3»… numa categoria de topo. Ordem: 0..n-1 por nome sem acentos (C) dentro
-- de cada pai.
CREATE OR REPLACE FUNCTION pg_temp.catm_linhas()
RETURNS TABLE (pai text, nome text, descricao text, slug text, ordem integer)
LANGUAGE plpgsql
STABLE
AS $fn$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH alvo AS (
    SELECT a.pai, a.nome, a.descricao,
           public.fn_cat_slug(a.nome) AS base,
           public.fn_cat_chave_opcao(a.nome) AS chave,
           public.fn_cat_chave_opcao(COALESCE(a.pai, '')) AS chave_pai
      FROM pg_temp.catm_alvo() a
  ),
  numerado AS (
    SELECT a.*,
           row_number() OVER (PARTITION BY a.base
                              ORDER BY (a.pai IS NOT NULL), a.chave_pai COLLATE "C", a.chave COLLATE "C") AS rep,
           (row_number() OVER (PARTITION BY a.pai
                               ORDER BY a.chave COLLATE "C", a.nome COLLATE "C") - 1)::integer AS posicao
      FROM alvo a
  )
  SELECT n.pai, n.nome, n.descricao,
         (CASE WHEN n.rep = 1 THEN n.base
               WHEN n.pai IS NULL THEN n.base || '-' || n.rep::text
               ELSE public.fn_cat_slug(n.pai) || '-' || n.base END),
         n.posicao
    FROM numerado n;
END;
$fn$;

-- Guarda. Devolve NULL se pode actuar; senão, o motivo. Só a Mudelar (id fixo E
-- nome 'Mudelar'), existente, não apagada, SEM NENHUMA categoria de produto viva
-- (basta uma para não actuar), com as funções de slug da RH e um membro para created_by.
CREATE OR REPLACE FUNCTION pg_temp.catm_guarda(p_org uuid, p_nome text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  c_mudelar      constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_mudelar_nome constant text := 'Mudelar';
  v_n bigint;
BEGIN
  IF p_org IS DISTINCT FROM c_mudelar OR p_nome IS DISTINCT FROM c_mudelar_nome THEN
    RETURN format('só actua na Mudelar (%s, «%s»); pedido: %s, «%s»', c_mudelar, c_mudelar_nome, p_org, p_nome);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = p_org AND o.name = p_nome) THEN
    RETURN format('a organização %s com o nome «%s» não existe nesta base', p_org, p_nome);
  END IF;

  SELECT count(*) INTO v_n
    FROM public.product_categories c
   WHERE c.organization_id = p_org AND c.deleted_at IS NULL;
  IF v_n > 0 THEN
    RETURN format('a organização já tem %s categorias de produto vivas', v_n);
  END IF;

  IF EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = p_org AND o.deleted_at IS NOT NULL) THEN
    RETURN 'a organização está apagada';
  END IF;

  IF to_regprocedure('public.fn_cat_slug(text)') IS NULL
     OR to_regprocedure('public.fn_cat_chave_opcao(text)') IS NULL
     OR to_regprocedure('public.fn_cat_limpar_nome(text)') IS NULL THEN
    RETURN 'faltam fn_cat_slug, fn_cat_chave_opcao ou fn_cat_limpar_nome (não é a base de RH no estado esperado)';
  END IF;

  IF pg_temp.catm_criador(p_org) IS NULL THEN
    RETURN 'nenhum membro activo da organização para created_by';
  END IF;

  RETURN NULL;
END;
$fn$;

-- Corpo: as 14 de topo e depois as 79 subcategorias, ligadas ao pai pelo nome
-- dentro da organização. Só INSERT. Devolve o número de linhas inseridas.
-- level e parent_category_id ficam como fn_cat_categoria_produto os deixa
-- (level = 0 por omissão, parent_category_id NULL); sem image_url; sem junção
-- product_category_organizations.
CREATE OR REPLACE FUNCTION pg_temp.catm_corpo(p_org uuid, p_user uuid)
RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_total integer := 0;
  v_n     integer;
BEGIN
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'catm_corpo: created_by em falta';
  END IF;

  INSERT INTO public.product_categories
         (name, slug, path, parent_id, description, sort_order, is_active, created_by, organization_id)
  SELECT l.nome, l.slug, l.slug, NULL, l.descricao, l.ordem, true, p_user, p_org
    FROM pg_temp.catm_linhas() l
   WHERE l.pai IS NULL
   ORDER BY l.ordem;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  -- path como fn_cat_categoria_produto: nome do pai em minúsculas / slug
  INSERT INTO public.product_categories
         (name, slug, path, parent_id, description, sort_order, is_active, created_by, organization_id)
  SELECT l.nome, l.slug, lower(p.name) || '/' || l.slug, p.id, l.descricao, l.ordem, true, p_user, p_org
    FROM pg_temp.catm_linhas() l
    JOIN public.product_categories p
      ON p.organization_id = p_org AND p.parent_id IS NULL AND p.deleted_at IS NULL AND p.name = l.pai
   WHERE l.pai IS NOT NULL
   ORDER BY l.pai, l.ordem;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  RETURN v_total;
END;
$fn$;

-- Verificação do estado final da organização: RAISE EXCEPTION «FALHOU: …» se
-- alguma regra falhar. Só lê.
CREATE OR REPLACE FUNCTION pg_temp.catm_verificar(p_org uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  c_topo constant integer := 14;
  c_sub  constant integer := 79;
  v_topo bigint;
  v_sub  bigint;
  v_txt  text;
BEGIN
  SELECT count(*) FILTER (WHERE c.parent_id IS NULL), count(*) FILTER (WHERE c.parent_id IS NOT NULL)
    INTO v_topo, v_sub
    FROM public.product_categories c
   WHERE c.organization_id = p_org AND c.deleted_at IS NULL;
  IF v_topo <> c_topo OR v_sub <> c_sub THEN
    RAISE EXCEPTION 'FALHOU: a organização tem % categorias de topo e % subcategorias vivas (esperado % e %).', v_topo, v_sub, c_topo, c_sub;
  END IF;

  -- exactamente as da lista (pai, nome), nem mais nem menos
  WITH existe AS (
    SELECT COALESCE(p.name, '') AS pai, c.name AS nome
      FROM public.product_categories c
      LEFT JOIN public.product_categories p ON p.id = c.parent_id
     WHERE c.organization_id = p_org AND c.deleted_at IS NULL
  ),
  alvo AS (SELECT COALESCE(a.pai, '') AS pai, a.nome FROM pg_temp.catm_alvo() a),
  dif AS (
    (SELECT 'a mais: ' || r.pai || ' / ' || r.nome AS x FROM existe r EXCEPT SELECT 'a mais: ' || a.pai || ' / ' || a.nome FROM alvo a)
    UNION ALL
    (SELECT 'em falta: ' || a.pai || ' / ' || a.nome FROM alvo a EXCEPT SELECT 'em falta: ' || r.pai || ' / ' || r.nome FROM existe r)
  )
  SELECT string_agg(dif.x, '; ' ORDER BY dif.x) INTO v_txt FROM dif;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: categorias diferentes da lista: %', v_txt;
  END IF;

  -- nomes limpos (sem espaços nas pontas nem repetidos)
  SELECT string_agg('«' || c.name || '»', ', ' ORDER BY c.name) INTO v_txt
    FROM public.product_categories c
   WHERE c.organization_id = p_org AND c.deleted_at IS NULL
     AND (c.name <> public.fn_cat_limpar_nome(c.name) OR c.name ~ '\s\s');
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: nomes com espaços a mais: %', v_txt;
  END IF;

  -- nenhum nome repetido na organização (sem acentos nem maiúsculas), nenhum slug repetido
  SELECT string_agg(s.k, ', ' ORDER BY s.k) INTO v_txt
    FROM (SELECT public.fn_cat_chave_opcao(c.name) AS k
            FROM public.product_categories c
           WHERE c.organization_id = p_org AND c.deleted_at IS NULL
           GROUP BY 1 HAVING count(*) > 1) s;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: nomes repetidos na organização: %', v_txt;
  END IF;
  SELECT string_agg(s.k, ', ' ORDER BY s.k) INTO v_txt
    FROM (SELECT c.slug AS k
            FROM public.product_categories c
           WHERE c.organization_id = p_org AND c.deleted_at IS NULL
           GROUP BY 1 HAVING count(*) > 1) s;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: slugs repetidos na organização: %', v_txt;
  END IF;

  -- slug em minúsculas ASCII; path: topo = slug, sub = nome do pai em minúsculas / slug;
  -- o pai é de topo, vivo e da mesma organização (2 níveis)
  SELECT string_agg(c.name || ' (' || c.slug || ' | ' || c.path || ')', '; ' ORDER BY c.name) INTO v_txt
    FROM public.product_categories c
    LEFT JOIN public.product_categories p ON p.id = c.parent_id
   WHERE c.organization_id = p_org AND c.deleted_at IS NULL
     AND (c.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
          OR (c.parent_id IS NULL AND c.path IS DISTINCT FROM c.slug)
          OR (c.parent_id IS NOT NULL AND (p.id IS NULL
                                           OR p.organization_id IS DISTINCT FROM p_org
                                           OR p.parent_id IS NOT NULL
                                           OR p.deleted_at IS NOT NULL
                                           OR c.path IS DISTINCT FROM lower(p.name) || '/' || c.slug)));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: slug, path ou pai errados: %', v_txt;
  END IF;

  -- todas ativas, sem imagem, com o slug calculado; ordem 0..n-1 dentro de cada pai
  SELECT string_agg(c.name, ', ' ORDER BY c.name) INTO v_txt
    FROM public.product_categories c
    LEFT JOIN pg_temp.catm_linhas() l ON l.nome = c.name AND l.pai IS NOT DISTINCT FROM (SELECT p.name FROM public.product_categories p WHERE p.id = c.parent_id)
   WHERE c.organization_id = p_org AND c.deleted_at IS NULL
     AND (c.is_active IS NOT TRUE OR c.image_url IS NOT NULL OR l.slug IS NULL
          OR c.slug IS DISTINCT FROM l.slug OR c.sort_order IS DISTINCT FROM l.ordem
          OR c.description IS DISTINCT FROM l.descricao);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: estado, slug, ordem ou descrição diferentes do calculado: %', v_txt;
  END IF;
  SELECT string_agg(COALESCE(s.pai::text, 'topo'), ', ') INTO v_txt
    FROM (SELECT c.parent_id AS pai
            FROM public.product_categories c
           WHERE c.organization_id = p_org AND c.deleted_at IS NULL
           GROUP BY c.parent_id
          HAVING count(DISTINCT c.sort_order) <> count(*) OR min(c.sort_order) <> 0 OR max(c.sort_order) <> count(*) - 1) s;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: ordem fora de 0..n-1 em: %', v_txt;
  END IF;

  -- nenhuma junção product_category_organizations para estas categorias
  IF EXISTS (SELECT 1 FROM public.product_category_organizations j
               JOIN public.product_categories c ON c.id = j.category_id
              WHERE c.organization_id = p_org) THEN
    RAISE EXCEPTION 'FALHOU: há junções product_category_organizations para categorias da organização.';
  END IF;

  RETURN format('OK: %s categorias de topo e %s subcategorias, nomes e slugs únicos, paths e ordem certos.', v_topo, v_sub);
END;
$fn$;

-- Guarda + corpo + verificação. Devolve o que fez (ou porque não fez). Confere
-- também que nenhuma linha fora da organização mudou de número.
CREATE OR REPLACE FUNCTION pg_temp.catm_executar(p_org uuid, p_nome text)
RETURNS text
LANGUAGE plpgsql
AS $fn$
DECLARE
  c_total constant integer := 93;
  v_motivo text;
  v_n      integer;
  v_fora   bigint;
  v_fora2  bigint;
  v_junc   bigint;
  v_junc2  bigint;
BEGIN
  -- o mesmo lock das funções de gestão das categorias da organização
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_categorias_produto:' || p_org::text, 0));

  v_motivo := pg_temp.catm_guarda(p_org, p_nome);
  IF v_motivo IS NOT NULL THEN
    RETURN 'nada feito: ' || v_motivo;
  END IF;

  PERFORM set_config('app.audit_source', 'migration:catalogo_categorias_mudelar', true);
  SELECT count(*) INTO v_fora FROM public.product_categories c WHERE c.organization_id IS DISTINCT FROM p_org;
  SELECT count(*) INTO v_junc FROM public.product_category_organizations;

  v_n := pg_temp.catm_corpo(p_org, pg_temp.catm_criador(p_org));
  IF v_n <> c_total THEN
    RAISE EXCEPTION 'FALHOU: inseridas % categorias (esperado %).', v_n, c_total;
  END IF;

  SELECT count(*) INTO v_fora2 FROM public.product_categories c WHERE c.organization_id IS DISTINCT FROM p_org;
  SELECT count(*) INTO v_junc2 FROM public.product_category_organizations;
  IF v_fora2 <> v_fora OR v_junc2 <> v_junc THEN
    RAISE EXCEPTION 'FALHOU: mudaram linhas fora da organização (categorias % para %, junções % para %).', v_fora, v_fora2, v_junc, v_junc2;
  END IF;

  RETURN format('%s categorias inseridas. ', v_n) || pg_temp.catm_verificar(p_org);
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Passo 1. Contagens e hierarquia: 14 de topo, 79 subs, e as subs de cada topo
-- (tabela escrita à mão a partir da principal).
-- ---------------------------------------------------------------------------
DO $t1$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  v_topo bigint;
  v_sub  bigint;
  v_txt  text;
BEGIN
  SELECT count(*) FILTER (WHERE c.parent_id IS NULL), count(*) FILTER (WHERE c.parent_id IS NOT NULL)
    INTO v_topo, v_sub
    FROM public.product_categories c
   WHERE c.organization_id = c_org AND c.deleted_at IS NULL;
  IF v_topo <> 14 OR v_sub <> 79 THEN
    RAISE EXCEPTION 'FALHOU: passo 1 — % de topo e % subs (esperado 14 e 79).', v_topo, v_sub;
  END IF;

  WITH esperado (topo, n) AS (
    VALUES
        ('Acessórios de Casa de Banho', 10),
        ('Bancadas de Cozinha', 2),
        ('Duche & Banho', 6),
        ('Eletrodomésticos', 13),
        ('Janelas', 2),
        ('Lava-louças & Cubas', 3),
        ('Loiças Sanitárias', 4),
        ('Materiais', 0),
        ('Mobiliário & Componentes Cozinha', 7),
        ('Mobiliário de Roupeiros', 0),
        ('Móveis & Arrumação Casa de Banho', 5),
        ('Portas', 6),
        ('Revestimentos', 8),
        ('Torneiras & Misturadoras', 13)
  ),
  obtido AS (
    SELECT t.name AS topo, (SELECT count(*) FROM public.product_categories s
                             WHERE s.parent_id = t.id AND s.deleted_at IS NULL) AS n
      FROM public.product_categories t
     WHERE t.organization_id = c_org AND t.parent_id IS NULL AND t.deleted_at IS NULL
  )
  SELECT string_agg(format('%s: %s (esperado %s)', COALESCE(e.topo, r.topo), COALESCE(r.n::text, 'em falta'), COALESCE(e.n::text, 'a mais')),
                    '; ' ORDER BY COALESCE(e.topo, r.topo))
    INTO v_txt
    FROM esperado e FULL JOIN obtido r ON r.topo = e.topo
   WHERE r.n IS DISTINCT FROM e.n::bigint;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: passo 1 — subcategorias por categoria de topo: %', v_txt;
  END IF;

  IF EXISTS (SELECT 1 FROM public.product_categories c
              WHERE c.organization_id = c_org AND c.deleted_at IS NULL AND c.name IN ('Tampos', 'Marmorista')) THEN
    RAISE EXCEPTION 'FALHOU: passo 1 — a órfã «Tampos» (ou o pai «Marmorista») entrou.';
  END IF;
  RAISE NOTICE 'passo 1: 14 de topo, 79 subs, subs por topo certas, órfã de fora.';
END;
$t1$;

-- ---------------------------------------------------------------------------
-- Passo 2. Regras de cada linha (nomes sem espaços nas pontas, nomes e slugs
-- únicos, paths, pai na mesma organização, ordem): a verificação da migration.
-- ---------------------------------------------------------------------------
DO $t2$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  v_n bigint;
BEGIN
  SELECT count(*) INTO v_n
    FROM public.product_categories c
   WHERE c.organization_id = c_org AND c.deleted_at IS NULL AND c.name <> btrim(c.name);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 2 — % nomes com espaços nas pontas.', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.product_categories s JOIN public.product_categories p ON p.id = s.parent_id
                  WHERE s.organization_id = c_org AND s.deleted_at IS NULL AND s.name = 'Cerâmico'
                    AND p.name = 'Revestimentos' AND s.path = 'revestimentos/ceramico') THEN
    RAISE EXCEPTION 'FALHOU: passo 2 — «Cerâmico» não está debaixo de «Revestimentos» com o path revestimentos/ceramico.';
  END IF;
  RAISE NOTICE 'passo 2: %', pg_temp.catm_verificar(c_org);
END;
$t2$;

-- ---------------------------------------------------------------------------
-- Passo 3. Guarda: reexecutar na Mudelar não faz nada (já tem categorias); id
-- inexistente, nome errado e outra organização com o nome Mudelar são recusados.
-- ---------------------------------------------------------------------------
DO $t3$
DECLARE
  c_org     constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_nome    constant text := 'Mudelar';
  c_nenhuma constant uuid := '00000000-0000-0000-0000-0000000000aa';
  c_nike    constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_antes bigint;
  v_res   text;
BEGIN
  SELECT count(*) INTO v_antes FROM public.product_categories;
  v_res := pg_temp.catm_executar(c_org, c_nome);
  IF v_res NOT LIKE 'nada feito: a organização já tem % categorias de produto vivas' THEN
    RAISE EXCEPTION 'FALHOU: passo 3 — a reexecução na Mudelar não parou na guarda: %', v_res;
  END IF;
  IF pg_temp.catm_guarda(c_nenhuma, c_nome) IS NULL
     OR pg_temp.catm_guarda(c_org, 'Outro nome') IS NULL
     OR pg_temp.catm_guarda(c_nike, c_nome) NOT LIKE 'só actua na Mudelar%' THEN
    RAISE EXCEPTION 'FALHOU: passo 3 — a guarda deixou passar uma organização que não devia.';
  END IF;
  IF (SELECT count(*) FROM public.product_categories) <> v_antes THEN
    RAISE EXCEPTION 'FALHOU: passo 3 — a reexecução escreveu linhas.';
  END IF;
  RAISE NOTICE 'passo 3: guarda ok (%).', v_res;
END;
$t3$;

-- ---------------------------------------------------------------------------
-- Passo 4. As outras organizações ficaram intactas: a nike com as suas 33, nenhuma
-- global, nenhuma de outra organização, nenhuma junção (lido na RH a 16/11).
-- ---------------------------------------------------------------------------
DO $t4$
DECLARE
  c_org  constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_nike constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_nike bigint;
  v_outras bigint;
  v_junc bigint;
BEGIN
  SELECT count(*) FILTER (WHERE c.organization_id = c_nike),
         count(*) FILTER (WHERE c.organization_id IS NULL OR c.organization_id NOT IN (c_nike, c_org))
    INTO v_nike, v_outras
    FROM public.product_categories c;
  SELECT count(*) INTO v_junc FROM public.product_category_organizations;
  IF v_nike <> 33 OR v_outras <> 0 OR v_junc <> 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 4 — nike % (esperado 33), globais e de outras organizações % (esperado 0), junções % (esperado 0).', v_nike, v_outras, v_junc;
  END IF;
  RAISE NOTICE 'passo 4: nike com 33 categorias, nenhuma outra organização tocada.';
END;
$t4$;

-- ---------------------------------------------------------------------------
-- Passo 5. O ecrã de gestão (cat_ler_categorias_gestao) mostra-as, como membro
-- da Mudelar. Salta (NOTICE) se não houver membro com permissão.
-- ---------------------------------------------------------------------------
DO $t5$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  v_auth uuid;
BEGIN
  SELECT u.auth_user_id INTO v_auth
    FROM public.anew_memberships m
    JOIN public.anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
   WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT COALESCE(m.role_is_client, false)
     AND (public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
          OR public.has_anew_permission_in_org(u.auth_user_id, 'services.view', c_org))
     AND NOT public.is_system_admin_user(u.auth_user_id)
   ORDER BY m.created_at, u.id
   LIMIT 1;
  PERFORM set_config('teste.claims', COALESCE(json_build_object('sub', v_auth, 'role', 'authenticated')::text, ''), true);
  PERFORM set_config('teste.tem_membro', (v_auth IS NOT NULL)::text, true);
  IF v_auth IS NULL THEN
    RAISE NOTICE 'passo 5: SALTADO — nenhum membro activo da Mudelar (não system admin) com products.edit ou services.view.';
  END IF;
END;
$t5$;

SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t5b$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  v_j jsonb;
  v_topo integer;
  v_sub integer;
  v_ordem_ok boolean;
BEGIN
  IF current_setting('teste.tem_membro') <> 'true' THEN
    RETURN;
  END IF;
  v_j := public.cat_ler_categorias_gestao(c_org);
  SELECT count(*)::integer, COALESCE(sum(jsonb_array_length(t.v -> 'subcategorias')), 0)::integer
    INTO v_topo, v_sub
    FROM jsonb_array_elements(v_j -> 'categorias') AS t(v);
  IF v_topo <> 14 OR v_sub <> 79 THEN
    RAISE EXCEPTION 'FALHOU: passo 5 — o ecrã de gestão mostra % de topo e % subs (esperado 14 e 79).', v_topo, v_sub;
  END IF;
  SELECT bool_and((t.v ->> 'ordem')::integer = (t.i - 1)::integer AND (t.v ->> 'global')::boolean IS FALSE
                  AND (t.v ->> 'ativo')::boolean IS TRUE AND (t.v ->> 'usados')::integer = 0)
    INTO v_ordem_ok
    FROM jsonb_array_elements(v_j -> 'categorias') WITH ORDINALITY AS t(v, i);
  IF v_ordem_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: passo 5 — categorias de topo fora da ordem 0..13, globais, inativas ou com usados.';
  END IF;
  RAISE NOTICE 'passo 5: o ecrã de gestão mostra 14 de topo e 79 subs, pela ordem.';
END;
$t5b$;
RESET ROLE;

SELECT 'OK: categorias de produtos da Mudelar (14 de topo, 79 subcategorias) conferidas (passos 0 a 5).' AS resultado;

ROLLBACK;
