-- =============================================================================
-- Catálogo — as MARCAS da MUDELAR, trazidas da base principal. SÓ SERVE NA BASE
-- DE RH (uetjghdkwbywbftedtth), enquanto a Mudelar lá não tiver nenhuma marca viva.
-- Mesmo padrão de 20270117800000_catalogo_categorias_mudelar.sql.
-- =============================================================================
--
-- Organização: Mudelar, id fixo 3242e925-da26-459a-8258-be04d904e355, com o nome
-- confirmado ('Mudelar') pela própria migration. Lido na RH (16/11, só leitura):
-- existe, não apagada, 0 produtos; a tabela brands só tem as 46 da nike (todas
-- vivas), nenhuma global e nenhuma da Mudelar (nem apagadas); brand_organizations
-- está vazia. brands: UNIQUE (organization_id, slug) (apagadas incluídas) e único
-- entre as globais; created_by NOT NULL (anew_users); gatilho de auditoria
-- trg_audit_brands.
--
-- Origem: as marcas da Mudelar na base principal (lidas antes, só leitura; aqui
-- escritas numa tabela VALUES gerada desses dados): 34 linhas — as próprias da
-- Mudelar e as globais ligadas a ela — todas ativas, sem descrição nem logótipo.
--
-- Conversão (decidida antes):
--   * Nomes sem espaços nas pontas («Beto & Vidros », «Moovlux »).
--   * Duplicados juntos pelo nome normalizado (fn_cat_chave_opcao: limpo, sem
--     acentos, minúsculas): Bellacasa, Chic&Bath, Coverlam, Grespania e Moovlux
--     aparecem duas vezes (uma da Mudelar, uma global ligada) e ficam uma só,
--     com os dados da linha da Mudelar (iguais nas duas). Ficam 29 marcas.
--   * As globais da principal passam a marcas PRÓPRIAS da Mudelar na RH: não se
--     criam globais nem linhas em brand_organizations (fn_cat_marca e
--     cat_guardar_marca também não as criam).
--   * website só em 2 (Alvisun, Kerlux), ambos na regra de cat_guardar_marca
--     (http/https, anfitrião com ponto, sem espaços, < > " \ nem @ antes da
--     primeira barra, até 300 caracteres); description e logo_url NULL.
--   * slug = public.fn_cat_slug(nome), SEM o sufixo aleatório de 6 caracteres que
--     fn_cat_marca e cat_guardar_marca põem (para a migração ser determinística).
--     Os 29 são distintos; se não fossem, os seguintes levavam «-2», «-3»…
--     (marm_linhas). Os slugs da principal (alguns em maiúsculas) não se copiam.
--   * is_active true, deleted_at NULL, organization_id = Mudelar.
--
-- created_by: o membro activo mais antigo da Mudelar (anew_memberships, status
-- 'active', sem end_date, não cliente, utilizador não apagado), como em
-- 20270117800000.
-- Auditoria: app.audit_source = 'migration:catalogo_marcas_mudelar' (local à
-- transacção). Lock: o mesmo advisory lock de cat_guardar_marca ('cat_marcas:' || org).
--
-- GUARDA: quando o ramo for juntado ao main, esta migration corre também na base
-- principal, onde a Mudelar (o mesmo id) já tem marcas vivas: aí fica inerte. Só
-- actua se a organização 3242e925-… existir com o nome 'Mudelar', não apagada, SEM
-- NENHUMA marca viva, se existirem as funções fn_cat_* da RH, um membro para
-- created_by, nenhuma global viva com um dos nomes e nenhuma marca apagada da
-- Mudelar com um dos slugs. Senão: RAISE NOTICE com o motivo e termina SEM alterar
-- nada (não falha). Uma segunda execução também não passa a guarda (idempotência
-- pela guarda, sem ON CONFLICT).
-- Todas as funções auxiliares são plpgsql em pg_temp (prefixo marm_, diferente do
-- catm_ das categorias, para não colidirem se o push correr as duas na mesma sessão).
-- Verificação no fim: 29 marcas, exactamente a lista, todas ativas, 2 com site, nomes
-- limpos e únicos (também contra as globais), slugs únicos e bem formados, como
-- calculados, teto de 500 ativas, nenhuma junção, nenhuma linha fora da Mudelar
-- mudou. Se falhar, RAISE EXCEPTION «FALHOU: …» e a migration é desfeita.
--
-- Teste: supabase/tests/catalogo_marcas_mudelar.test.sql (BEGIN … ROLLBACK).
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente;
-- listar com `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Funções auxiliares TEMPORÁRIAS (pg_temp). O teste
-- supabase/tests/catalogo_marcas_mudelar.test.sql leva uma cópia exacta deste
-- bloco (gerada da mesma fonte).
-- ---------------------------------------------------------------------------

-- >>> bloco marm (copiado para o teste)
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
-- <<< bloco marm

-- ---------------------------------------------------------------------------
-- Execução: guarda, corpo e verificação. Organização Mudelar (id fixo e nome confirmado).
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
  c_org  constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_nome constant text := 'Mudelar';
BEGIN
  RAISE NOTICE 'catalogo_marcas_mudelar (Mudelar): %', pg_temp.marm_executar(c_org, c_nome);
END;
$mig$;
