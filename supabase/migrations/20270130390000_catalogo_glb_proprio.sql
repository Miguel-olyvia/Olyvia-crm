-- =============================================================================
-- Catálogo — MODELO 3D PRÓPRIO (GLB) por categoria, subcategoria e Modelo (Emylia): por cima do seletor de modelo 3D
-- que já existe (modelo_3d, 20270126320000 e 20270130360000), cada categoria, subcategoria (a mesma tabela,
-- product_categories, com parent_id) e cada Modelo do Catálogo (product_models) pode levar um ficheiro .glb próprio,
-- carregado à mão por quem tem products.edit. O GLB dá só a FORMA: medidas, cor e textura vêm sempre do produto.
--
-- !!! SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth) — NUNCA NA PRINCIPAL; confirmar o project-ref antes do push
-- !!! (supabase/.temp/project-ref tem de dizer uetjghdkwbywbftedtth). A base principal (tzbfgw…) é a de produção
-- !!! real da Mudelar e não foi lida nem medida para esta migration.
--
-- !!! PRECISA DE CÓDIGO NOVO NO BROWSER, que entra JUNTO (mesmo envio). Sem ele a migration não parte nada (as leituras
-- !!! só ganham duas chaves, sempre null; nada escreve nas colunas novas), mas o carregamento não existe no ecrã:
-- !!!   * envio do ficheiro para o bucket `catalogo-modelos3d`, caminho `{organização}/{uuid novo}.glb`, sempre com
-- !!!     contentType 'model/gltf-binary' e sem upsert (substituir = ficheiro novo); validação do GLB no cliente antes
-- !!!     de enviar e antes de montar (cabeçalho glTF 2, sem URIs externos, Draco recusado com mensagem própria,
-- !!!     aviso acima de 50 000 triângulos, recusa acima de 200 000; meshopt permitido);
-- !!!   * a seguir, cat_definir_glb(p_org, p_alvo 'categoria'|'modelo', p_id, p_caminho); com anterior_orfao = true o
-- !!!     browser apaga `anterior` do bucket (remove()). Se cat_definir_glb falhar, o browser apaga o ficheiro que acabou
-- !!!     de enviar. p_caminho NULL remove a ligação (e devolve o anterior para apagar);
-- !!!   * src/emylia/modelosDados.ts e a página de Modelos (GestaoModelos.tsx) leem 'glb_caminho' e 'glb_bytes' de
-- !!!     cat_ler_modelos_gestao; a página de Categorias lê as mesmas chaves de cat_ler_categorias_gestao (em cada
-- !!!     categoria e em cada subcategoria). Chave em falta = null;
-- !!!   * o 3D (Visualizador3D / previaProduto3d / Modelo3DProduto / Previa3DProduto / vista de família) resolve, por esta
-- !!!     ordem: escolha manual do produto (products.modelo_3d) > Modelo (GLB próprio > modelo_3d) > subcategoria (GLB
-- !!!     próprio > modelo_3d) > categoria (GLB próprio > modelo_3d) > automático. O GLB escala sempre pelas medidas do
-- !!!     produto (não uniforme; sem medidas, tamanho nativo com aviso fora de 1 cm a 5 m); cor e textura do produto em
-- !!!     todos os materiais menos os de nome a começar por metal, vidro, espelho, luz ou agua. Se o GLB falhar, mostra
-- !!!     o genérico com nota. PREVIA_SO_GENERICOS fica como está. A planta e o estúdio de obra não mudam.
-- =============================================================================
--
-- CONTRATO (combinado com o código do browser; os nomes não mudam)
--  1. product_categories e product_models ganham glb_caminho text NULL e glb_bytes integer NULL, sem default, com:
--       <tabela>_glb_par_check     : (glb_caminho IS NULL) = (glb_bytes IS NULL)   — as duas ou nenhuma
--       <tabela>_glb_caminho_check : glb_caminho IS NULL OR (glb_caminho ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.glb$'
--                                    AND organization_id IS NOT NULL AND split_part(glb_caminho, '/', 1) = organization_id::text)
--                                    — uma categoria partilhada (organization_id NULL) nunca tem GLB
--       <tabela>_glb_bytes_check   : glb_bytes IS NULL OR glb_bytes BETWEEN 12 AND 5242880
--  2. Bucket `catalogo-modelos3d`: público (leitura pelo URL público; o caminho uuid não se adivinha), 5 242 880 bytes,
--     só model/gltf-binary. Políticas em storage.objects para authenticated, copiadas de cat_opcoes_* (lidas no remoto
--     a 27/11): cat_modelos3d_criar (INSERT, caminho `{uuid}/{uuid}.glb`), cat_modelos3d_apagar (DELETE) e
--     cat_modelos3d_ler (SELECT, só para o DELETE … RETURNING do remove()), todas com fn_cat_pode(org, 'products.edit'),
--     org = 1.º segmento (o ::uuid só se avalia depois do regex, dentro do CASE). SEM UPDATE (trocar = ficheiro novo).
--  3. cat_definir_glb(p_org uuid, p_alvo text, p_id uuid, p_caminho text) → jsonb
--       {alvo text, id uuid, caminho text|null, anterior text|null, anterior_orfao boolean}
--     SECURITY DEFINER, search_path vazio (tudo qualificado). EXECUTE só a authenticated e service_role.
--     Molde de cat_definir_modelo_3d (lido no remoto: md5 ff8d2678302915606cf73ddf983f7b30): products.edit
--     (fn_cat_exigir, CT001 sem ela); p_alvo 'categoria' (categorias e subcategorias) ou 'modelo', senão CT002;
--     categoria: a chave 'cat_categorias_produto:' || org, partilhada recusada (CT002 «Categoria partilhada…»),
--     apagada ou de outra organização CT003; modelo: a chave 'cat_modelos:' || org || ':' || subcategoria, apagado ou
--     de outra organização CT003 «Modelo não encontrado.» (desativado aceita-se). p_caminho NULL ou '' remove a
--     ligação. Com caminho: formato e prefixo da organização (CT002); o objeto tem de existir no bucket (CT006, código
--     novo: «envie-o de novo»); o tamanho vem de storage.objects.metadata->>'size' e o tipo de ->>'mimetype', nunca do
--     cliente (CT007, código novo: fora de 12 bytes a 5 MB ou tipo que não é model/gltf-binary).
--     anterior_orfao = o anterior deixou de ser usado por qualquer categoria ou Modelo (o browser apaga-o).
--     Códigos em uso na base a 27/11: CT001…CT005; CT006 e CT007 estavam livres.
--  4. cat_ler_categorias_gestao(p_org uuid) e cat_ler_modelos_gestao(p_org uuid) → jsonb (mesma assinatura e mesmo tipo:
--     CREATE OR REPLACE, sem DROP). Cada categoria, cada subcategoria e cada Modelo ganham 'glb_caminho' (text|null) e
--     'glb_bytes' (integer|null) no fim do objeto; os outros campos, a ordem e os filtros ficam iguais.
--
-- CORPOS DE PARTIDA (lidos no remoto RH a 27/11 com pg_get_functiondef):
--   cat_ler_categorias_gestao  1c5fe83d63f28f6ebab7f3ddac8fe9f0  (20270126320000)
--   cat_ler_modelos_gestao     8274f515115545f548725ab589b695cb  (20270130360000)
-- A guarda do início falha se algum md5 for outro (alguém mudou a função entretanto: rever antes de sobrepor).
--
-- EFEITOS LATERAIS lidos no remoto (27/11): product_categories 145 linhas, 0 partilhadas (organization_id NULL);
-- product_models 1058 linhas, uma só organização, organization_id NOT NULL. ADD COLUMN NULL sem default não reescreve;
-- os CHECK validam numa passagem com tudo NULL. Triggers: trg_audit_product_categories e trg_audit_product_models
-- (linha inteira em jsonb: as colunas entram sozinhas na auditoria), trg_cat_sigla_categoria (só INSERT),
-- trg_cat_modelo_valida (não reage às colunas novas), *_updated_at. Nenhuma vista depende das duas tabelas.
-- O dono das funções (postgres) lê storage.objects.
--
-- O QUE NÃO MUDA: nenhum dado (todas as linhas ficam com glb_caminho/glb_bytes NULL), modelo_3d, products, preços,
-- SKUs, cat_definir_modelo_3d. Sem DROP FUNCTION e sem sobrecargas novas.
--
-- O QUE FICA POR FAZER (fora deste contrato):
--  * Apagar uma categoria ou um Modelo não apaga o ficheiro do bucket (fica órfão; limpeza à parte).
--  * Quem tem UPDATE direto nas tabelas pode pôr em glb_caminho um caminho da própria organização que não exista;
--    o 3D falha para o genérico (os CHECK prendem formato, organização e tamanho).
--  * Corrida rara: duas gravações seguidas no mesmo alvo podem deixar um ficheiro órfão no bucket.
--
-- REVERSÃO: fora da pasta das migrations, em C:/Users/carva/.claude/jobs/bbc4f3a6/tmp/reverter-glb-proprio.sql
-- (repõe os dois corpos de partida, larga a função, as políticas, as colunas e o bucket vazio). Não se aplica por omissão.
--
-- ORDEM: depende só do que já está aplicado na RH (última aplicada lida a 27/11: 20270130370000). `supabase db push`
-- aplica TUDO o que estiver pendente: listar com `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '2min';

-- ---- Guarda: os corpos de partida são os que estão na base, e nada do que se cria já existe ------------------------
DO $guarda$
DECLARE
  r record;
  v_md5 text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.cat_ler_categorias_gestao(uuid)', '1c5fe83d63f28f6ebab7f3ddac8fe9f0'),
      ('public.cat_ler_modelos_gestao(uuid)', '8274f515115545f548725ab589b695cb')
    ) AS t(assinatura, md5)
  LOOP
    IF to_regprocedure(r.assinatura) IS NULL THEN
      RAISE EXCEPTION '%', format('Guarda: a função %s não existe nesta base (é a base de RH?).', r.assinatura);
    END IF;
    SELECT md5(pg_get_functiondef(to_regprocedure(r.assinatura))) INTO v_md5;
    IF v_md5 IS DISTINCT FROM r.md5 THEN
      RAISE EXCEPTION '%', format('Guarda: %s mudou desde a leitura (md5 %s, esperado %s). Rever antes de sobrepor.',
                                  r.assinatura, v_md5, r.md5);
    END IF;
  END LOOP;

  IF to_regprocedure('public.fn_cat_pode(uuid,text)') IS NULL
     OR to_regprocedure('public.fn_cat_exigir(uuid,text)') IS NULL
     OR to_regprocedure('public.fn_cat_exigir_uma(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION '%', 'Guarda: faltam fn_cat_pode, fn_cat_exigir ou fn_cat_exigir_uma com os argumentos esperados.';
  END IF;

  IF to_regclass('public.product_categories') IS NULL OR to_regclass('public.product_models') IS NULL THEN
    RAISE EXCEPTION '%', 'Guarda: faltam as tabelas product_categories ou product_models.';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns c
             WHERE c.table_schema = 'public' AND c.table_name IN ('product_categories', 'product_models')
               AND c.column_name IN ('glb_caminho', 'glb_bytes')) THEN
    RAISE EXCEPTION '%', 'Guarda: glb_caminho ou glb_bytes já existem (ver o que está na base).';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint co WHERE co.conname LIKE 'product\_categories\_glb\_%' OR co.conname LIKE 'product\_models\_glb\_%') THEN
    RAISE EXCEPTION '%', 'Guarda: já existem CHECK *_glb_* em product_categories ou product_models.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'cat_definir_glb') THEN
    RAISE EXCEPTION '%', 'Guarda: cat_definir_glb já existe (ver o que está na base).';
  END IF;

  IF EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = 'catalogo-modelos3d'
             AND NOT (b.public AND b.file_size_limit = 5242880 AND b.allowed_mime_types = ARRAY['model/gltf-binary'])) THEN
    RAISE EXCEPTION '%', 'Guarda: o bucket catalogo-modelos3d já existe com outra configuração.';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects so WHERE so.bucket_id = 'catalogo-modelos3d') THEN
    RAISE EXCEPTION '%', 'Guarda: o bucket catalogo-modelos3d já tem ficheiros (ver o que está na base).';
  END IF;
END
$guarda$;

-- ---- 1. Colunas e CHECK -----------------------------------------------------------------------------------------
-- um só ALTER por tabela: um só pedido de lock; sem default, não reescreve
ALTER TABLE public.product_categories
  ADD COLUMN glb_caminho text NULL,
  ADD COLUMN glb_bytes integer NULL,
  ADD CONSTRAINT product_categories_glb_par_check CHECK ((glb_caminho IS NULL) = (glb_bytes IS NULL)),
  ADD CONSTRAINT product_categories_glb_caminho_check CHECK (glb_caminho IS NULL OR (glb_caminho ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.glb$' AND organization_id IS NOT NULL AND split_part(glb_caminho, '/', 1) = organization_id::text)),
  ADD CONSTRAINT product_categories_glb_bytes_check CHECK (glb_bytes IS NULL OR glb_bytes BETWEEN 12 AND 5242880);

ALTER TABLE public.product_models
  ADD COLUMN glb_caminho text NULL,
  ADD COLUMN glb_bytes integer NULL,
  ADD CONSTRAINT product_models_glb_par_check CHECK ((glb_caminho IS NULL) = (glb_bytes IS NULL)),
  ADD CONSTRAINT product_models_glb_caminho_check CHECK (glb_caminho IS NULL OR (glb_caminho ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.glb$' AND organization_id IS NOT NULL AND split_part(glb_caminho, '/', 1) = organization_id::text)),
  ADD CONSTRAINT product_models_glb_bytes_check CHECK (glb_bytes IS NULL OR glb_bytes BETWEEN 12 AND 5242880);

COMMENT ON COLUMN public.product_categories.glb_caminho IS
  'Modelo 3D próprio (GLB) da categoria/subcategoria no bucket catalogo-modelos3d: {organização}/{uuid}.glb. NULL = sem GLB (vale modelo_3d). Escreve-se por cat_definir_glb.';
COMMENT ON COLUMN public.product_categories.glb_bytes IS
  'Tamanho do GLB em bytes, lido de storage.objects por cat_definir_glb (nunca do cliente). NULL com glb_caminho NULL.';
COMMENT ON COLUMN public.product_models.glb_caminho IS
  'Modelo 3D próprio (GLB) do Modelo do Catálogo no bucket catalogo-modelos3d: {organização}/{uuid}.glb. NULL = sem GLB (vale modelo_3d). Escreve-se por cat_definir_glb.';
COMMENT ON COLUMN public.product_models.glb_bytes IS
  'Tamanho do GLB em bytes, lido de storage.objects por cat_definir_glb (nunca do cliente). NULL com glb_caminho NULL.';

-- ---- 2. Bucket e políticas (copiadas de cat_opcoes_*, lidas no remoto) --------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('catalogo-modelos3d', 'catalogo-modelos3d', true, 5242880, ARRAY['model/gltf-binary'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS cat_modelos3d_criar ON storage.objects;
CREATE POLICY cat_modelos3d_criar ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'catalogo-modelos3d'
    AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.glb$'
    AND CASE WHEN split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             THEN public.fn_cat_pode(split_part(name, '/', 1)::uuid, 'products.edit')
             ELSE false END
  );

DROP POLICY IF EXISTS cat_modelos3d_apagar ON storage.objects;
CREATE POLICY cat_modelos3d_apagar ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'catalogo-modelos3d'
    AND CASE WHEN split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             THEN public.fn_cat_pode(split_part(name, '/', 1)::uuid, 'products.edit')
             ELSE false END
  );

-- só para o DELETE … RETURNING do remove() (sem ela o apagar não apaga nada); a leitura do GLB é pelo URL público
DROP POLICY IF EXISTS cat_modelos3d_ler ON storage.objects;
CREATE POLICY cat_modelos3d_ler ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'catalogo-modelos3d'
    AND CASE WHEN split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             THEN public.fn_cat_pode(split_part(name, '/', 1)::uuid, 'products.edit')
             ELSE false END
  );

-- ---- 3. cat_definir_glb (molde de cat_definir_modelo_3d) --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cat_definir_glb(p_org uuid, p_alvo text, p_id uuid, p_caminho text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  c_limite constant integer := 5242880;
  c_max_caminho constant integer := 200;
  v_alvo text := lower(btrim(coalesce(p_alvo, '')));
  v_caminho text;
  v_tamanho text;
  v_tipo text;
  v_bytes integer;
  v_anterior text;
  v_sub uuid;
  v_orfao boolean := false;
BEGIN
  -- a mesma permissão de cat_definir_modelo_3d (CT001 sem ela)
  PERFORM public.fn_cat_exigir(p_org, 'products.edit');

  IF v_alvo NOT IN ('categoria', 'modelo') THEN
    RAISE EXCEPTION 'Indique se o modelo 3D é de uma categoria ou de um modelo.' USING ERRCODE = 'CT002';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Falta indicar a categoria ou o modelo.' USING ERRCODE = 'CT002';
  END IF;
  -- texto absurdo: recusado antes de qualquer trabalho
  IF length(p_caminho) > c_max_caminho THEN
    RAISE EXCEPTION 'O caminho do modelo 3D não é válido.' USING ERRCODE = 'CT002';
  END IF;

  -- NULL ou '' remove a ligação; senão {organização}/{uuid}.glb, da própria organização
  v_caminho := nullif(btrim(coalesce(p_caminho, '')), '');
  IF v_caminho IS NOT NULL THEN
    IF v_caminho !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.glb$' THEN
      RAISE EXCEPTION 'O caminho do modelo 3D não é válido.' USING ERRCODE = 'CT002';
    END IF;
    IF split_part(v_caminho, '/', 1) <> p_org::text THEN
      RAISE EXCEPTION 'O modelo 3D não pertence a esta organização.' USING ERRCODE = 'CT002';
    END IF;
  END IF;

  IF v_alvo = 'categoria' THEN
    -- a mesma chave e a mesma ordem de cat_guardar_categoria_produto e cat_definir_modelo_3d
    PERFORM pg_advisory_xact_lock(hashtextextended('cat_categorias_produto:' || p_org::text, 0));
    -- a partilhada (organization_id NULL) recusa-se sem lhe trancar a linha
    IF EXISTS (SELECT 1 FROM public.product_categories pc
               WHERE pc.id = p_id AND pc.deleted_at IS NULL AND pc.organization_id IS NULL) THEN
      RAISE EXCEPTION 'Categoria partilhada: não se pode alterar aqui.' USING ERRCODE = 'CT002';
    END IF;
    -- só se tranca a linha da própria organização; apagada ou de outra organização = não encontrada
    SELECT pc.glb_caminho INTO v_anterior FROM public.product_categories pc
    WHERE pc.id = p_id AND pc.deleted_at IS NULL AND pc.organization_id = p_org
    FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = 'CT003'; END IF;
  ELSE
    -- o Modelo desta organização, vivo (desativado aceita-se); apagado ou de outra organização = não encontrado
    SELECT pm.subcategory_id INTO v_sub FROM public.product_models pm
    WHERE pm.id = p_id AND pm.organization_id = p_org AND pm.deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Modelo não encontrado.' USING ERRCODE = 'CT003'; END IF;
    -- a chave de cat_estado_modelo, cat_guardar_modelo e cat_definir_modelo_3d, antes da linha (mesma ordem)
    PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || p_org::text || ':' || v_sub::text, 0));
    -- de novo com a linha presa: pode ter sido apagado entre as duas leituras
    SELECT pm.glb_caminho INTO v_anterior FROM public.product_models pm
    WHERE pm.id = p_id AND pm.organization_id = p_org AND pm.deleted_at IS NULL
    FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Modelo não encontrado.' USING ERRCODE = 'CT003'; END IF;
  END IF;

  -- o ficheiro tem de estar no bucket; o tamanho e o tipo leem-se do armazenamento, nunca do cliente
  IF v_caminho IS NOT NULL THEN
    SELECT so.metadata->>'size', so.metadata->>'mimetype' INTO v_tamanho, v_tipo
    FROM storage.objects so WHERE so.bucket_id = 'catalogo-modelos3d' AND so.name = v_caminho;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'O ficheiro do modelo 3D não foi encontrado: envie-o de novo.' USING ERRCODE = 'CT006';
    END IF;
    IF v_tipo IS DISTINCT FROM 'model/gltf-binary' THEN
      RAISE EXCEPTION 'O ficheiro do modelo 3D tem de ser um .glb (glTF binário).' USING ERRCODE = 'CT007';
    END IF;
    IF v_tamanho IS NULL OR v_tamanho !~ '^[0-9]{1,8}$' THEN
      RAISE EXCEPTION 'O ficheiro do modelo 3D tem de ter entre 12 bytes e 5 MB.' USING ERRCODE = 'CT007';
    END IF;
    v_bytes := v_tamanho::integer;
    IF v_bytes < 12 OR v_bytes > c_limite THEN
      RAISE EXCEPTION 'O ficheiro do modelo 3D tem de ter entre 12 bytes e 5 MB.' USING ERRCODE = 'CT007';
    END IF;
  END IF;

  IF v_alvo = 'categoria' THEN
    UPDATE public.product_categories pc SET glb_caminho = v_caminho, glb_bytes = v_bytes
    WHERE pc.id = p_id AND (pc.glb_caminho IS DISTINCT FROM v_caminho OR pc.glb_bytes IS DISTINCT FROM v_bytes);
  ELSE
    UPDATE public.product_models pm SET glb_caminho = v_caminho, glb_bytes = v_bytes
    WHERE pm.id = p_id AND (pm.glb_caminho IS DISTINCT FROM v_caminho OR pm.glb_bytes IS DISTINCT FROM v_bytes);
  END IF;

  -- o anterior fica órfão só se nenhuma categoria nem nenhum Modelo o usa (o CHECK garante que é da organização)
  IF v_anterior IS NOT NULL AND v_anterior IS DISTINCT FROM v_caminho THEN
    v_orfao := NOT EXISTS (SELECT 1 FROM public.product_categories x WHERE x.glb_caminho = v_anterior)
           AND NOT EXISTS (SELECT 1 FROM public.product_models y WHERE y.glb_caminho = v_anterior);
  END IF;

  RETURN jsonb_build_object('alvo', v_alvo, 'id', p_id, 'caminho', v_caminho, 'anterior', v_anterior, 'anterior_orfao', v_orfao);
END $function$;

REVOKE ALL ON FUNCTION public.cat_definir_glb(uuid,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_definir_glb(uuid,text,uuid,text) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_definir_glb(uuid,text,uuid,text) IS
  'Liga (ou, com NULL/'''', desliga) o modelo 3D próprio (GLB no bucket catalogo-modelos3d) de uma categoria/subcategoria ou de um Modelo do Catálogo da organização. p_alvo: categoria | modelo. Lê o tamanho e o tipo do armazenamento. Devolve {alvo, id, caminho, anterior, anterior_orfao}: o browser apaga o anterior do bucket só se anterior_orfao. Exige products.edit.';

-- ---- 4. cat_ler_categorias_gestao (de 20270126320000; + 'glb_caminho', 'glb_bytes') -------------------------------
-- o tipo devolvido continua jsonb: CREATE OR REPLACE chega (sem DROP)
CREATE OR REPLACE FUNCTION public.cat_ler_categorias_gestao(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- quem edita produtos ou quem vê o catálogo; o perfil reduzido de Negócios não entra
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  RETURN (
    WITH prod AS (
      -- produtos e consumíveis vivos do Catálogo, como cat_ler_produtos_tabelas
      SELECT p.category_id, p.subcategory_id FROM products p
      WHERE p.organization_id = p_org AND NOT p.is_deleted AND p.tipo_catalogo IS NOT NULL
    ),
    uso_cat AS (SELECT x.category_id AS id, count(*)::integer AS n FROM prod x WHERE x.category_id IS NOT NULL GROUP BY x.category_id),
    uso_sub AS (SELECT x.subcategory_id AS id, count(*)::integer AS n FROM prod x WHERE x.subcategory_id IS NOT NULL GROUP BY x.subcategory_id),
    topo AS (
      -- 20270118000000: "sigla"; 20270126320000: "modelo3d"; 20270130390000: "glb_caminho", "glb_bytes"
      SELECT c.id, c.name, coalesce(c.sort_order, 0) AS ordem, coalesce(c.is_active, true) AS ativo, (c.organization_id IS NULL) AS global, c.sigla,
             c.modelo_3d AS modelo3d, c.glb_caminho, c.glb_bytes
      FROM product_categories c
      WHERE c.parent_id IS NULL AND c.deleted_at IS NULL
        AND (c.organization_id = p_org
             OR (c.organization_id IS NULL
                 AND (c.id IN (SELECT j.category_id FROM product_category_organizations j WHERE j.organization_id = p_org)
                      OR c.id IN (SELECT u.id FROM uso_cat u))))
    ),
    sub AS (
      SELECT s.id, s.parent_id, s.name, coalesce(s.sort_order, 0) AS ordem, coalesce(s.is_active, true) AS ativo, (s.organization_id IS NULL) AS global, s.sigla,
             s.modelo_3d AS modelo3d, s.glb_caminho, s.glb_bytes
      FROM product_categories s
      WHERE s.parent_id IN (SELECT t.id FROM topo t) AND s.deleted_at IS NULL
        AND (s.organization_id = p_org OR s.organization_id IS NULL)
    )
    SELECT jsonb_build_object('categorias', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', t.id, 'nome', t.name, 'ordem', t.ordem, 'ativo', t.ativo, 'global', t.global,
               'usados', coalesce(uc.n, 0), 'sigla', t.sigla, 'modelo3d', t.modelo3d,
               'subcategorias', coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                          'id', s.id, 'nome', s.name, 'ordem', s.ordem, 'ativo', s.ativo, 'global', s.global,
                          'usados', coalesce(us.n, 0), 'sigla', s.sigla, 'modelo3d', s.modelo3d,
                          'glb_caminho', s.glb_caminho, 'glb_bytes', s.glb_bytes)
                        ORDER BY s.ordem, s.name, s.id)
                 FROM sub s LEFT JOIN uso_sub us ON us.id = s.id
                 WHERE s.parent_id = t.id), '[]'::jsonb),
               'glb_caminho', t.glb_caminho, 'glb_bytes', t.glb_bytes)
             ORDER BY t.ordem, t.name, t.id)
      FROM topo t LEFT JOIN uso_cat uc ON uc.id = t.id), '[]'::jsonb))
  );
END $function$;

REVOKE ALL ON FUNCTION public.cat_ler_categorias_gestao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_categorias_gestao(uuid) TO authenticated, service_role;

-- ---- 5. cat_ler_modelos_gestao (de 20270130360000; + 'glb_caminho', 'glb_bytes') ---------------------------------
CREATE OR REPLACE FUNCTION public.cat_ler_modelos_gestao(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  RETURN (
    WITH uso AS (
      SELECT p.model_id AS id, count(*)::integer AS n FROM products p
      WHERE p.organization_id = p_org AND NOT p.is_deleted AND p.model_id IS NOT NULL
      GROUP BY p.model_id
    )
    SELECT jsonb_build_object('modelos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', pm.id, 'nome', pm.name, 'numero', pm.numero, 'ativo', pm.is_active, 'usados', coalesce(u.n, 0),
               'subcategoria', jsonb_build_object('id', s.id, 'nome', s.name, 'sigla', s.sigla, 'ativo', coalesce(s.is_active, true)),
               'categoria', jsonb_build_object('id', c.id, 'nome', c.name, 'sigla', c.sigla),
               -- 20270130360000: o modelo 3D escolhido no Modelo (NULL = herda)
               'modelo3d', pm.modelo_3d,
               -- 20270130390000: o GLB próprio do Modelo (NULL = sem GLB)
               'glb_caminho', pm.glb_caminho, 'glb_bytes', pm.glb_bytes)
             ORDER BY coalesce(c.sort_order, 0), c.name, coalesce(s.sort_order, 0), s.name, pm.numero, pm.id)
      FROM product_models pm
      JOIN product_categories s ON s.id = pm.subcategory_id
      LEFT JOIN product_categories c ON c.id = s.parent_id
      LEFT JOIN uso u ON u.id = pm.id
      WHERE pm.organization_id = p_org AND pm.deleted_at IS NULL), '[]'::jsonb))
  );
END $function$;

REVOKE ALL ON FUNCTION public.cat_ler_modelos_gestao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_modelos_gestao(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_ler_modelos_gestao(uuid) IS
  'Catálogo (20270118300000; modelo3d em 20270130360000; glb_caminho/glb_bytes em 20270130390000): ecrã de gestão dos modelos. Modelos da organização (não apagados, ativos e desativados) com o número do SKU, a subcategoria e a categoria, quantos produtos vivos os usam, o modelo 3D escolhido (modelo3d, NULL = herda) e o GLB próprio (glb_caminho, glb_bytes). Permissão products.edit ou services.view.';

-- ---- 6. Conferir: falha a migration se alguma coisa não ficou como descrito -----------------------------------
DO $conferir$
DECLARE
  r record;
  v_oid oid;
  v_n integer;
  v_def text;
BEGIN
  -- colunas: as quatro, com o tipo certo, NULL e sem default
  SELECT count(*)::integer INTO v_n FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name IN ('product_categories', 'product_models')
    AND ((c.column_name = 'glb_caminho' AND c.data_type = 'text') OR (c.column_name = 'glb_bytes' AND c.data_type = 'integer'))
    AND c.is_nullable = 'YES' AND c.column_default IS NULL;
  IF v_n <> 4 THEN
    RAISE EXCEPTION '%', format('Conferir: %s de 4 colunas glb_caminho text / glb_bytes integer NULL sem default.', v_n);
  END IF;

  -- os seis CHECK, validados e com o conteúdo esperado (::text em contype: é do tipo "char")
  FOR r IN SELECT * FROM (VALUES
      ('product_categories', 'product_categories_glb_par_check', 'glb_bytes IS NULL'),
      ('product_categories', 'product_categories_glb_caminho_check', 'organization_id IS NOT NULL'),
      ('product_categories', 'product_categories_glb_bytes_check', '5242880'),
      ('product_models', 'product_models_glb_par_check', 'glb_bytes IS NULL'),
      ('product_models', 'product_models_glb_caminho_check', 'organization_id IS NOT NULL'),
      ('product_models', 'product_models_glb_bytes_check', '5242880')
    ) AS t(tabela, nome, contem)
  LOOP
    v_def := NULL;
    SELECT pg_get_constraintdef(co.oid) INTO v_def FROM pg_constraint co
    WHERE co.conname = r.nome AND co.contype::text = 'c' AND co.convalidated
      AND co.conrelid = to_regclass('public.' || r.tabela);
    IF v_def IS NULL OR position(r.contem IN v_def) = 0 THEN
      RAISE EXCEPTION '%', format('Conferir: CHECK %s em falta ou diferente (%s).', r.nome, coalesce(v_def, 'nenhum'));
    END IF;
  END LOOP;

  -- nenhum dado mudou
  SELECT (SELECT count(*) FROM public.product_categories x WHERE x.glb_caminho IS NOT NULL OR x.glb_bytes IS NOT NULL)
       + (SELECT count(*) FROM public.product_models y WHERE y.glb_caminho IS NOT NULL OR y.glb_bytes IS NOT NULL)
  INTO v_n;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '%', format('Conferir: %s linha(s) com GLB preenchido (esperado 0).', v_n);
  END IF;

  -- bucket
  SELECT count(*)::integer INTO v_n FROM storage.buckets b
  WHERE b.id = 'catalogo-modelos3d' AND b.name = 'catalogo-modelos3d' AND b.public
    AND b.file_size_limit = 5242880 AND b.allowed_mime_types = ARRAY['model/gltf-binary'];
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%', 'Conferir: o bucket catalogo-modelos3d não ficou público, 5242880 bytes, só model/gltf-binary.';
  END IF;

  -- políticas: exactamente INSERT, DELETE e SELECT para authenticated; nenhuma de UPDATE/ALL a falar do bucket
  FOR r IN SELECT * FROM (VALUES ('cat_modelos3d_criar', 'INSERT'), ('cat_modelos3d_apagar', 'DELETE'), ('cat_modelos3d_ler', 'SELECT')) AS t(nome, cmd)
  LOOP
    SELECT count(*)::integer INTO v_n FROM pg_policies p
    WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.policyname = r.nome AND p.cmd = r.cmd
      AND p.permissive = 'PERMISSIVE' AND p.roles = ARRAY['authenticated']::name[]
      AND position('catalogo-modelos3d' IN coalesce(p.qual, '') || coalesce(p.with_check, '')) > 0
      AND position('fn_cat_pode' IN coalesce(p.qual, '') || coalesce(p.with_check, '')) > 0
      AND position('products.edit' IN coalesce(p.qual, '') || coalesce(p.with_check, '')) > 0;
    IF v_n <> 1 THEN
      RAISE EXCEPTION '%', format('Conferir: a política %s (%s) não ficou como descrito.', r.nome, r.cmd);
    END IF;
  END LOOP;
  SELECT count(*)::integer INTO v_n FROM pg_policies p
  WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd IN ('UPDATE', 'ALL')
    AND position('catalogo-modelos3d' IN coalesce(p.qual, '') || coalesce(p.with_check, '')) > 0;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '%', format('Conferir: há %s política(s) de UPDATE/ALL no bucket catalogo-modelos3d (esperado 0).', v_n);
  END IF;

  -- funções: uma só versão por nome, assinatura, resultado, SECURITY DEFINER, search_path e privilégios
  FOR r IN SELECT * FROM (VALUES
      ('cat_definir_glb',           'p_org uuid, p_alvo text, p_id uuid, p_caminho text', 'search_path=""'),
      ('cat_ler_categorias_gestao', 'p_org uuid',                                         'search_path=public, pg_temp'),
      ('cat_ler_modelos_gestao',    'p_org uuid',                                         'search_path=public, pg_temp')
    ) AS t(nome, args, cfg)
  LOOP
    SELECT count(*)::integer INTO v_n FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r.nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION '%', format('Conferir: %s tem %s versões (esperado 1).', r.nome, v_n);
    END IF;
    v_oid := NULL;
    SELECT p.oid INTO v_oid FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r.nome
      AND pg_get_function_identity_arguments(p.oid) = r.args
      AND pg_get_function_result(p.oid) = 'jsonb'
      AND p.prosecdef
      AND p.proconfig = ARRAY[r.cfg];
    IF v_oid IS NULL THEN
      RAISE EXCEPTION '%', format('Conferir: %s não tem a assinatura (%s) → jsonb, SECURITY DEFINER e %s.', r.nome, r.args, r.cfg);
    END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_oid, 'EXECUTE')
       OR has_function_privilege('anon', v_oid, 'EXECUTE')
       OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) x WHERE p.oid = v_oid AND x.grantee = 0) THEN
      RAISE EXCEPTION '%', format('Conferir: os privilégios de %s divergem (esperado EXECUTE só a authenticated e service_role, nada a anon/PUBLIC).', r.nome);
    END IF;
  END LOOP;

  -- as leituras levam mesmo as chaves novas (categoria, subcategoria e Modelo)
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.cat_ler_categorias_gestao(uuid)')
                 AND position('''glb_caminho'', t.glb_caminho, ''glb_bytes'', t.glb_bytes' IN p.prosrc) > 0
                 AND position('''glb_caminho'', s.glb_caminho, ''glb_bytes'', s.glb_bytes' IN p.prosrc) > 0) THEN
    RAISE EXCEPTION '%', 'Conferir: cat_ler_categorias_gestao não devolve glb_caminho/glb_bytes nas categorias e subcategorias.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.cat_ler_modelos_gestao(uuid)')
                 AND position('''glb_caminho'', pm.glb_caminho, ''glb_bytes'', pm.glb_bytes' IN p.prosrc) > 0) THEN
    RAISE EXCEPTION '%', 'Conferir: cat_ler_modelos_gestao não devolve glb_caminho/glb_bytes.';
  END IF;

  -- o dono de cat_definir_glb (SECURITY DEFINER) consegue ler storage.objects (confirma o ficheiro e o tamanho)
  SELECT p.proowner INTO v_oid FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'cat_definir_glb';
  IF NOT has_table_privilege(v_oid, 'storage.objects', 'SELECT') THEN
    RAISE EXCEPTION '%', 'Conferir: o dono de cat_definir_glb não pode ler storage.objects.';
  END IF;
END
$conferir$;

RESET lock_timeout;
RESET statement_timeout;
