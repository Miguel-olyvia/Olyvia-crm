-- =============================================================================
-- Teste da migration 20270117900000_catalogo_marcas_mudelar.sql
-- Base de RH (uetjghdkwbywbftedtth), organização Mudelar
-- (3242e925-da26-459a-8258-be04d904e355). Sem pgtap.
-- Corre numa transacção desfeita (BEGIN … ROLLBACK). Só LÊ: nada é escrito em
-- nenhuma organização (a migration é que escreve; a reexecução do passo 3 pára
-- na guarda).
--
-- Como correr (a partir do worktree rh-pessoas, com project-ref confirmado):
--   supabase db query --linked -f supabase/tests/catalogo_marcas_mudelar.test.sql
--
-- ANTES da migration: falha no passo 0 com
--   «passo 0 — FALHOU: a Mudelar ainda não tem as marcas» (vermelho).
-- DEPOIS da migration: passa os passos 0 a 5 e termina com «OK: …» (verde). A linha
-- final diz se o passo 5 (ecrã de gestão) correu ou foi SALTADO.
--
-- As funções da migration (pg_temp.marm_*) vêm copiadas aqui, geradas da mesma
-- fonte: o passo 2 corre a verificação da própria migration sobre o estado real.
--
-- Passo 5 (cat_ler_marcas_gestao): sessão emprestada (role authenticated,
-- auth.uid() pelas claims) de um membro activo da Mudelar, não system admin, com
-- products.edit ou services.view lá (o mesmo critério de
-- catalogo_categorias_marcas_gestao.test.sql e catalogo_categorias_mudelar.test.sql).
-- Se não houver nenhum, salta com NOTICE e a linha final di-lo.
-- Não há chamadas recusadas de propósito.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Passo 0. A Mudelar já tem as marcas? (é aqui que falha ANTES da migration)
-- ---------------------------------------------------------------------------
DO $t0$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar') THEN
    RAISE EXCEPTION 'passo 0 — FALHOU: a Mudelar (%) não existe nesta base', c_org;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.brands b WHERE b.organization_id = c_org AND b.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'passo 0 — FALHOU: a Mudelar ainda não tem as marcas (aplicar 20270117900000_catalogo_marcas_mudelar.sql).';
  END IF;
  RAISE NOTICE 'passo 0: a Mudelar tem marcas.';
END;
$t0$;

-- ---------------------------------------------------------------------------
-- Cópia exacta do bloco de funções da migration.
-- ---------------------------------------------------------------------------
-- Utilizador que fica em created_by (brands.created_by é NOT NULL com chave para
-- anew_users): o membro mais antigo da organização com a relação activa (status
-- 'active', sem end_date), que não é cliente e cujo utilizador não está apagado.
-- Igual a catm_criador (20270117800000).
CREATE OR REPLACE FUNCTION pg_temp.marm_criador(p_org uuid)
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

-- As 29 marcas a criar: (nome, website, descricao, logo_url). Nomes já sem espaços
-- nas pontas; os 5 duplicados da principal (Bellacasa, Chic&Bath, Coverlam,
-- Grespania, Moovlux: uma da Mudelar e uma global ligada) já juntos numa linha.
CREATE OR REPLACE FUNCTION pg_temp.marm_alvo()
RETURNS TABLE (nome text, website text, descricao text, logo_url text)
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT v.nome, v.website, v.descricao, v.logo_url
    FROM (VALUES
      ('Alvisun'::text, 'https://alviterm.com/janelas-eficientes'::text, NULL::text, NULL::text),
      ('Bellacasa', NULL, NULL, NULL),
      ('Beto & Vidros', NULL, NULL, NULL),
      ('Chic&Bath', NULL, NULL, NULL),
      ('Coverlam', NULL, NULL, NULL),
      ('Cupa Stone', NULL, NULL, NULL),
      ('Dentroilmobile', NULL, NULL, NULL),
      ('Duplach', NULL, NULL, NULL),
      ('Eletricol', NULL, NULL, NULL),
      ('FPM', NULL, NULL, NULL),
      ('FRASA', NULL, NULL, NULL),
      ('GME', NULL, NULL, NULL),
      ('Grespania', NULL, NULL, NULL),
      ('INDESIT', NULL, NULL, NULL),
      ('Kerlux', 'https://www.kerlux.eu/en/', NULL, NULL),
      ('LG', NULL, NULL, NULL),
      ('Manillons Torrent', NULL, NULL, NULL),
      ('Marti 1921', NULL, NULL, NULL),
      ('Materiaspc', NULL, NULL, NULL),
      ('Moovlux', NULL, NULL, NULL),
      ('Roca', NULL, NULL, NULL),
      ('Rodi', NULL, NULL, NULL),
      ('Rubicer', NULL, NULL, NULL),
      ('Sanindusa', NULL, NULL, NULL),
      ('Shower Bath', NULL, NULL, NULL),
      ('TECNISIS', NULL, NULL, NULL),
      ('TEKA', NULL, NULL, NULL),
      ('VULCANO', NULL, NULL, NULL),
      ('WHIRPOOL', NULL, NULL, NULL)
    ) AS v(nome, website, descricao, logo_url);
END;
$fn$;

-- Slug de cada uma: public.fn_cat_slug(nome), SEM o sufixo aleatório que fn_cat_marca e
-- cat_guardar_marca acrescentam (para a migração ser determinística). Se dois
-- coincidirem (hoje nenhum), o primeiro por nome sem acentos (C) fica com o simples e os
-- seguintes levam «-2», «-3»…
CREATE OR REPLACE FUNCTION pg_temp.marm_linhas()
RETURNS TABLE (nome text, website text, descricao text, logo_url text, slug text)
LANGUAGE plpgsql
STABLE
AS $fn$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH alvo AS (
    SELECT a.nome, a.website, a.descricao, a.logo_url,
           public.fn_cat_slug(a.nome) AS base,
           public.fn_cat_chave_opcao(a.nome) AS chave
      FROM pg_temp.marm_alvo() a
  ),
  numerado AS (
    SELECT a.*,
           row_number() OVER (PARTITION BY a.base ORDER BY a.chave COLLATE "C", a.nome COLLATE "C") AS rep
      FROM alvo a
  )
  SELECT n.nome, n.website, n.descricao, n.logo_url,
         (CASE WHEN n.rep = 1 THEN n.base ELSE n.base || '-' || n.rep::text END)
    FROM numerado n;
END;
$fn$;

-- Guarda. Devolve NULL se pode actuar; senão, o motivo. Só a Mudelar (id fixo E nome
-- 'Mudelar'), existente, não apagada, SEM NENHUMA marca viva (basta uma para não
-- actuar), com as funções fn_cat_* da RH, um membro para created_by, nenhuma marca
-- GLOBAL viva com o mesmo nome (cat_guardar_marca recusá-la-ia como repetida) e nenhuma
-- marca apagada da organização com um dos slugs (o índice único
-- brands_organization_slug_key cobre também as apagadas).
CREATE OR REPLACE FUNCTION pg_temp.marm_guarda(p_org uuid, p_nome text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  c_mudelar      constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_mudelar_nome constant text := 'Mudelar';
  v_n   bigint;
  v_txt text;
BEGIN
  IF p_org IS DISTINCT FROM c_mudelar OR p_nome IS DISTINCT FROM c_mudelar_nome THEN
    RETURN format('só actua na Mudelar (%s, «%s»); pedido: %s, «%s»', c_mudelar, c_mudelar_nome, p_org, p_nome);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = p_org AND o.name = p_nome) THEN
    RETURN format('a organização %s com o nome «%s» não existe nesta base', p_org, p_nome);
  END IF;

  SELECT count(*) INTO v_n
    FROM public.brands b
   WHERE b.organization_id = p_org AND b.deleted_at IS NULL;
  IF v_n > 0 THEN
    RETURN format('a organização já tem %s marcas vivas', v_n);
  END IF;

  IF EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = p_org AND o.deleted_at IS NOT NULL) THEN
    RETURN 'a organização está apagada';
  END IF;

  IF to_regprocedure('public.fn_cat_slug(text)') IS NULL
     OR to_regprocedure('public.fn_cat_chave_opcao(text)') IS NULL
     OR to_regprocedure('public.fn_cat_limpar_nome(text)') IS NULL
     OR to_regprocedure('public.fn_cat_marca(uuid,text,uuid)') IS NULL THEN
    RETURN 'faltam fn_cat_slug, fn_cat_chave_opcao, fn_cat_limpar_nome ou fn_cat_marca (não é a base de RH no estado esperado)';
  END IF;

  IF pg_temp.marm_criador(p_org) IS NULL THEN
    RETURN 'nenhum membro activo da organização para created_by';
  END IF;

  SELECT string_agg(b.name, ', ' ORDER BY b.name) INTO v_txt
    FROM public.brands b
   WHERE b.organization_id IS NULL AND b.deleted_at IS NULL
     AND public.fn_cat_chave_opcao(b.name) IN (SELECT public.fn_cat_chave_opcao(a.nome) FROM pg_temp.marm_alvo() a);
  IF v_txt IS NOT NULL THEN
    RETURN format('há marcas globais vivas com o mesmo nome: %s', v_txt);
  END IF;

  SELECT string_agg(b.slug, ', ' ORDER BY b.slug) INTO v_txt
    FROM public.brands b
   WHERE b.organization_id = p_org
     AND b.slug IN (SELECT l.slug FROM pg_temp.marm_linhas() l);
  IF v_txt IS NOT NULL THEN
    RETURN format('a organização já tem marcas (apagadas) com estes slugs: %s', v_txt);
  END IF;

  RETURN NULL;
END;
$fn$;

-- Corpo: as 29 marcas na organização. Só INSERT. Devolve o número de linhas inseridas.
-- Sem junção brand_organizations (fn_cat_marca e cat_guardar_marca também não a criam).
CREATE OR REPLACE FUNCTION pg_temp.marm_corpo(p_org uuid, p_user uuid)
RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_n integer;
BEGIN
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'marm_corpo: created_by em falta';
  END IF;

  INSERT INTO public.brands
         (name, slug, website, description, logo_url, is_active, created_by, organization_id)
  SELECT l.nome, l.slug, l.website, l.descricao, l.logo_url, true, p_user, p_org
    FROM pg_temp.marm_linhas() l
   ORDER BY l.nome;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN v_n;
END;
$fn$;

-- Verificação do estado final da organização: RAISE EXCEPTION «FALHOU: …» se alguma
-- regra falhar. Só lê.
CREATE OR REPLACE FUNCTION pg_temp.marm_verificar(p_org uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  c_total     constant integer := 29;
  c_sites     constant integer := 2;
  c_max_ativas constant integer := 500;
  v_n     bigint;
  v_ativas bigint;
  v_sites bigint;
  v_txt   text;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE COALESCE(b.is_active, true)), count(*) FILTER (WHERE b.website IS NOT NULL)
    INTO v_n, v_ativas, v_sites
    FROM public.brands b
   WHERE b.organization_id = p_org AND b.deleted_at IS NULL;
  IF v_n <> c_total OR v_ativas <> c_total OR v_sites <> c_sites THEN
    RAISE EXCEPTION 'FALHOU: a organização tem % marcas vivas, % ativas, % com site (esperado %, % e %).', v_n, v_ativas, v_sites, c_total, c_total, c_sites;
  END IF;
  IF v_ativas > c_max_ativas THEN
    RAISE EXCEPTION 'FALHOU: % marcas ativas, acima do teto de % de cat_guardar_marca.', v_ativas, c_max_ativas;
  END IF;

  -- exactamente as da lista (nome exacto), nem mais nem menos
  WITH existe AS (
    SELECT b.name AS nome FROM public.brands b WHERE b.organization_id = p_org AND b.deleted_at IS NULL
  ),
  dif AS (
    (SELECT 'a mais: ' || r.nome AS x FROM existe r EXCEPT SELECT 'a mais: ' || a.nome FROM pg_temp.marm_alvo() a)
    UNION ALL
    (SELECT 'em falta: ' || a.nome FROM pg_temp.marm_alvo() a EXCEPT SELECT 'em falta: ' || r.nome FROM existe r)
  )
  SELECT string_agg(dif.x, '; ' ORDER BY dif.x) INTO v_txt FROM dif;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: marcas diferentes da lista: %', v_txt;
  END IF;

  -- nomes limpos (sem espaços nas pontas nem repetidos)
  SELECT string_agg('«' || b.name || '»', ', ' ORDER BY b.name) INTO v_txt
    FROM public.brands b
   WHERE b.organization_id = p_org AND b.deleted_at IS NULL
     AND (b.name <> public.fn_cat_limpar_nome(b.name) OR b.name ~ '\s\s');
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: nomes com espaços a mais: %', v_txt;
  END IF;

  -- nenhum nome repetido (sem acentos nem maiúsculas) na organização nem contra as globais vivas;
  -- nenhum slug repetido na organização (apagadas incluídas, como o índice único)
  SELECT string_agg(s.k, ', ' ORDER BY s.k) INTO v_txt
    FROM (SELECT public.fn_cat_chave_opcao(b.name) AS k
            FROM public.brands b
           WHERE b.deleted_at IS NULL AND (b.organization_id = p_org OR b.organization_id IS NULL)
           GROUP BY 1 HAVING count(*) > 1) s;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: nomes repetidos na organização (ou contra uma global): %', v_txt;
  END IF;
  SELECT string_agg(s.k, ', ' ORDER BY s.k) INTO v_txt
    FROM (SELECT b.slug AS k
            FROM public.brands b
           WHERE b.organization_id = p_org
           GROUP BY 1 HAVING count(*) > 1) s;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: slugs repetidos na organização: %', v_txt;
  END IF;

  -- cada linha como calculada: slug, site, descrição e logo; ativa; slug em minúsculas ASCII;
  -- site (quando há) na regra de cat_guardar_marca (a barra invertida vê-se por chr(92))
  SELECT string_agg(b.name || ' (' || b.slug || ')', '; ' ORDER BY b.name) INTO v_txt
    FROM public.brands b
    LEFT JOIN pg_temp.marm_linhas() l ON l.nome = b.name
   WHERE b.organization_id = p_org AND b.deleted_at IS NULL
     AND (l.slug IS NULL
          OR b.slug IS DISTINCT FROM l.slug
          OR b.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
          OR b.website IS DISTINCT FROM l.website
          OR b.description IS DISTINCT FROM l.descricao
          OR b.logo_url IS DISTINCT FROM l.logo_url
          OR b.is_active IS NOT TRUE
          OR (b.website IS NOT NULL
              AND (length(b.website) > 300
                   OR b.website !~* '^https?://[^/?#@]+\.[^/?#@]+([/?#].*)?$'
                   OR b.website ~ '[[:space:][:cntrl:]<>"]'
                   OR strpos(b.website, chr(92)) > 0)));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: slug, site, descrição, logo ou estado diferentes do calculado: %', v_txt;
  END IF;

  -- nenhuma junção brand_organizations para estas marcas
  IF EXISTS (SELECT 1 FROM public.brand_organizations j
               JOIN public.brands b ON b.id = j.brand_id
              WHERE b.organization_id = p_org) THEN
    RAISE EXCEPTION 'FALHOU: há junções brand_organizations para marcas da organização.';
  END IF;

  RETURN format('OK: %s marcas ativas (%s com site), nomes e slugs únicos, como calculadas.', v_n, v_sites);
END;
$fn$;

-- Guarda + corpo + verificação. Devolve o que fez (ou porque não fez). Confere também
-- que nenhuma linha fora da organização mudou de número.
CREATE OR REPLACE FUNCTION pg_temp.marm_executar(p_org uuid, p_nome text)
RETURNS text
LANGUAGE plpgsql
AS $fn$
DECLARE
  c_total constant integer := 29;
  v_motivo text;
  v_n      integer;
  v_fora   bigint;
  v_fora2  bigint;
  v_junc   bigint;
  v_junc2  bigint;
BEGIN
  -- o mesmo lock das funções de gestão das marcas da organização (cat_guardar_marca)
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_marcas:' || p_org::text, 0));

  v_motivo := pg_temp.marm_guarda(p_org, p_nome);
  IF v_motivo IS NOT NULL THEN
    RETURN 'nada feito: ' || v_motivo;
  END IF;

  PERFORM set_config('app.audit_source', 'migration:catalogo_marcas_mudelar', true);
  SELECT count(*) INTO v_fora FROM public.brands b WHERE b.organization_id IS DISTINCT FROM p_org;
  SELECT count(*) INTO v_junc FROM public.brand_organizations;

  v_n := pg_temp.marm_corpo(p_org, pg_temp.marm_criador(p_org));
  IF v_n <> c_total THEN
    RAISE EXCEPTION 'FALHOU: inseridas % marcas (esperado %).', v_n, c_total;
  END IF;

  SELECT count(*) INTO v_fora2 FROM public.brands b WHERE b.organization_id IS DISTINCT FROM p_org;
  SELECT count(*) INTO v_junc2 FROM public.brand_organizations;
  IF v_fora2 <> v_fora OR v_junc2 <> v_junc THEN
    RAISE EXCEPTION 'FALHOU: mudaram linhas fora da organização (marcas % para %, junções % para %).', v_fora, v_fora2, v_junc, v_junc2;
  END IF;

  RETURN format('%s marcas inseridas. ', v_n) || pg_temp.marm_verificar(p_org);
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Passo 1. Contagem e a lista exacta das 29 (nome, slug, site), escrita a partir
-- da principal: nomes limpos, duplicados juntos.
-- ---------------------------------------------------------------------------
DO $t1$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  v_n   bigint;
  v_txt text;
BEGIN
  SELECT count(*) INTO v_n FROM public.brands b WHERE b.organization_id = c_org AND b.deleted_at IS NULL;
  IF v_n <> 29 THEN
    RAISE EXCEPTION 'FALHOU: passo 1 — % marcas vivas (esperado 29).', v_n;
  END IF;

  WITH esperado (nome, slug, website) AS (
    VALUES
        ('Alvisun', 'alvisun', 'https://alviterm.com/janelas-eficientes'),
        ('Bellacasa', 'bellacasa', NULL),
        ('Beto & Vidros', 'beto-vidros', NULL),
        ('Chic&Bath', 'chic-bath', NULL),
        ('Coverlam', 'coverlam', NULL),
        ('Cupa Stone', 'cupa-stone', NULL),
        ('Dentroilmobile', 'dentroilmobile', NULL),
        ('Duplach', 'duplach', NULL),
        ('Eletricol', 'eletricol', NULL),
        ('FPM', 'fpm', NULL),
        ('FRASA', 'frasa', NULL),
        ('GME', 'gme', NULL),
        ('Grespania', 'grespania', NULL),
        ('INDESIT', 'indesit', NULL),
        ('Kerlux', 'kerlux', 'https://www.kerlux.eu/en/'),
        ('LG', 'lg', NULL),
        ('Manillons Torrent', 'manillons-torrent', NULL),
        ('Marti 1921', 'marti-1921', NULL),
        ('Materiaspc', 'materiaspc', NULL),
        ('Moovlux', 'moovlux', NULL),
        ('Roca', 'roca', NULL),
        ('Rodi', 'rodi', NULL),
        ('Rubicer', 'rubicer', NULL),
        ('Sanindusa', 'sanindusa', NULL),
        ('Shower Bath', 'shower-bath', NULL),
        ('TECNISIS', 'tecnisis', NULL),
        ('TEKA', 'teka', NULL),
        ('VULCANO', 'vulcano', NULL),
        ('WHIRPOOL', 'whirpool', NULL)
  ),
  obtido AS (
    SELECT b.name AS nome, b.slug, b.website
      FROM public.brands b
     WHERE b.organization_id = c_org AND b.deleted_at IS NULL
  )
  SELECT string_agg(format('%s: obtido (%s, %s), esperado (%s, %s)',
                           COALESCE(e.nome, r.nome), COALESCE(r.slug, 'em falta'), COALESCE(r.website, '-'),
                           COALESCE(e.slug, 'a mais'), COALESCE(e.website, '-')),
                    '; ' ORDER BY COALESCE(e.nome, r.nome))
    INTO v_txt
    FROM esperado e FULL JOIN obtido r ON r.nome = e.nome
   WHERE r.nome IS NULL OR e.nome IS NULL
      OR r.slug IS DISTINCT FROM e.slug OR r.website IS DISTINCT FROM e.website;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: passo 1 — marcas diferentes da lista: %', v_txt;
  END IF;
  RAISE NOTICE 'passo 1: 29 marcas, exactamente a lista (nome, slug, site).';
END;
$t1$;

-- ---------------------------------------------------------------------------
-- Passo 2. Nomes limpos, os 5 duplicados numa só linha cada, os 2 sites, e a
-- verificação da própria migration.
-- ---------------------------------------------------------------------------
DO $t2$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  v_n   bigint;
  v_txt text;
BEGIN
  SELECT count(*) INTO v_n
    FROM public.brands b
   WHERE b.organization_id = c_org AND b.deleted_at IS NULL AND b.name <> btrim(b.name);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 2 — % nomes com espaços nas pontas.', v_n;
  END IF;

  SELECT string_agg(format('%s ×%s', d.nome, COALESCE(r.n, 0)), ', ' ORDER BY d.nome) INTO v_txt
    FROM (VALUES ('Bellacasa'), ('Chic&Bath'), ('Coverlam'), ('Grespania'), ('Moovlux')) AS d(nome)
    LEFT JOIN (SELECT public.fn_cat_chave_opcao(b.name) AS k, count(*) AS n
                 FROM public.brands b
                WHERE b.organization_id = c_org AND b.deleted_at IS NULL
                GROUP BY 1) r ON r.k = public.fn_cat_chave_opcao(d.nome)
   WHERE r.n IS DISTINCT FROM 1::bigint;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: passo 2 — duplicados que não ficaram numa só linha: %', v_txt;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.brands b WHERE b.organization_id = c_org AND b.deleted_at IS NULL
                   AND b.name = 'Alvisun' AND b.website = 'https://alviterm.com/janelas-eficientes')
     OR NOT EXISTS (SELECT 1 FROM public.brands b WHERE b.organization_id = c_org AND b.deleted_at IS NULL
                      AND b.name = 'Kerlux' AND b.website = 'https://www.kerlux.eu/en/')
     OR (SELECT count(*) FROM public.brands b WHERE b.organization_id = c_org AND b.deleted_at IS NULL
           AND b.website IS NOT NULL) <> 2 THEN
    RAISE EXCEPTION 'FALHOU: passo 2 — os sites não são exactamente os de Alvisun e Kerlux.';
  END IF;
  RAISE NOTICE 'passo 2: %', pg_temp.marm_verificar(c_org);
END;
$t2$;

-- ---------------------------------------------------------------------------
-- Passo 3. Guarda: reexecutar na Mudelar não faz nada (já tem marcas); id
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
  SELECT count(*) INTO v_antes FROM public.brands;
  v_res := pg_temp.marm_executar(c_org, c_nome);
  IF v_res NOT LIKE 'nada feito: a organização já tem % marcas vivas' THEN
    RAISE EXCEPTION 'FALHOU: passo 3 — a reexecução na Mudelar não parou na guarda: %', v_res;
  END IF;
  IF pg_temp.marm_guarda(c_nenhuma, c_nome) IS NULL
     OR pg_temp.marm_guarda(c_org, 'Outro nome') IS NULL
     OR pg_temp.marm_guarda(c_nike, c_nome) NOT LIKE 'só actua na Mudelar%' THEN
    RAISE EXCEPTION 'FALHOU: passo 3 — a guarda deixou passar uma organização que não devia.';
  END IF;
  IF (SELECT count(*) FROM public.brands) <> v_antes THEN
    RAISE EXCEPTION 'FALHOU: passo 3 — a reexecução escreveu linhas.';
  END IF;
  RAISE NOTICE 'passo 3: guarda ok (%).', v_res;
END;
$t3$;

-- ---------------------------------------------------------------------------
-- Passo 4. As outras organizações ficaram intactas: a nike com as suas 46, nenhuma
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
  SELECT count(*) FILTER (WHERE b.organization_id = c_nike),
         count(*) FILTER (WHERE b.organization_id IS NULL OR b.organization_id NOT IN (c_nike, c_org))
    INTO v_nike, v_outras
    FROM public.brands b;
  SELECT count(*) INTO v_junc FROM public.brand_organizations;
  IF v_nike <> 46 OR v_outras <> 0 OR v_junc <> 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 4 — nike % (esperado 46), globais e de outras organizações % (esperado 0), junções % (esperado 0).', v_nike, v_outras, v_junc;
  END IF;
  RAISE NOTICE 'passo 4: nike com 46 marcas, nenhuma outra organização tocada.';
END;
$t4$;

-- ---------------------------------------------------------------------------
-- Passo 5. O ecrã de gestão (cat_ler_marcas_gestao) mostra-as, como membro da
-- Mudelar. Salta (NOTICE, e a linha final di-lo) se não houver membro com permissão.
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
  -- a lista esperada, pela ordem do ecrã (lower(nome)), calculada aqui como postgres: com o
  -- role authenticated as funções pg_temp podem não estar acessíveis
  PERFORM set_config('teste.nomes', (SELECT string_agg(a.nome, '|' ORDER BY lower(a.nome)) FROM pg_temp.marm_alvo() a), true);
  PERFORM set_config('teste.passo5', 'SALTADO (nenhum membro activo da Mudelar, não system admin, com products.edit ou services.view)', true);
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
  v_j      jsonb;
  v_n      integer;
  v_sites  integer;
  v_ok     boolean;
  v_nomes  text;
BEGIN
  IF current_setting('teste.tem_membro') <> 'true' THEN
    RETURN;
  END IF;
  v_j := public.cat_ler_marcas_gestao(c_org);
  SELECT count(*)::integer, (count(*) FILTER (WHERE t.v ->> 'website' IS NOT NULL))::integer,
         bool_and((t.v ->> 'global')::boolean IS FALSE AND (t.v ->> 'ativo')::boolean IS TRUE
                  AND (t.v ->> 'usados')::integer = 0),
         string_agg(t.v ->> 'nome', '|' ORDER BY t.i)
    INTO v_n, v_sites, v_ok, v_nomes
    FROM jsonb_array_elements(v_j -> 'marcas') WITH ORDINALITY AS t(v, i);
  IF v_n <> 29 OR v_sites <> 2 OR v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: passo 5 — o ecrã de gestão mostra % marcas, % com site, todas próprias/ativas/sem usados: % (esperado 29, 2, true).', v_n, v_sites, v_ok;
  END IF;
  IF v_nomes IS DISTINCT FROM current_setting('teste.nomes') THEN
    RAISE EXCEPTION 'FALHOU: passo 5 — o ecrã de gestão não mostra a lista pela ordem do nome: %', v_nomes;
  END IF;
  PERFORM set_config('teste.passo5', 'corrido: o ecrã de gestão mostra as 29, 2 com site', true);
  RAISE NOTICE 'passo 5: o ecrã de gestão mostra as 29 marcas, 2 com site, próprias e ativas.';
END;
$t5b$;
RESET ROLE;

SELECT 'OK: marcas da Mudelar (29) conferidas nos passos 0 a 4; passo 5 (ecrã de gestão): '
       || current_setting('teste.passo5') || '.' AS resultado;

ROLLBACK;
