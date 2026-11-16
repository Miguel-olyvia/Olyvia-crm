-- =============================================================================
-- Catálogo — MODELOS debaixo da subcategoria, e o NNNN do SKU passa a ser o NÚMERO DO MODELO.
-- Base de RH (uetjghdkwbywbftedtth).
-- =============================================================================
--
-- Decisão do utilizador (16/11): «debaixo da subcategoria tenho de ter os modelos, porque é o modelo que define o
-- 0001 ou 0002 e isso tudo; a marca não importa, fica só para identificar ou filtrar». Exemplo (Excel do utilizador):
-- DBBD0001BL70X70PZ = Bases de Duche, modelo SORTY (0001), Blanco, 70x70, Pizarra; todas as cores/medidas/texturas do
-- SORTY partilham 0001; STONE PLUS 0002 … ZEUS 0007.
--   Hierarquia: Categoria › Subcategoria › Modelo.   SKU = CAT-SUB-NNNN-<atributos pela ordem configurada>,
--   NNNN = product_models.numero do modelo do produto (lpad 4).
--
-- O que muda:
--   1. Tabela public.product_models (organização, subcategoria, nome, número 1..9999, ativo, apagado, criado por).
--      Número único por (organização, subcategoria) CONTANDO OS APAGADOS (índice único sem WHERE: um número nunca se
--      reutiliza); nome único (sem acentos nem maiúsculas, fn_cat_chave_opcao) por (organização, subcategoria) entre
--      os vivos. A subcategoria tem de ser da mesma organização e ter pai (gatilho); organização, subcategoria e
--      número não mudam depois de criado (gatilho).
--      RLS: só SELECT, para quem vê a organização E tem services.view ou products.edit nela (como a leitura de
--      gestão). GRANT SELECT por coluna, sem created_by. Escritas só pelas funções abaixo (anon nada).
--      Auditoria fn_generic_entity_audit, updated_at.
--   2. products.model_id (já existia, sem FK e sem uso: 0 produtos lidos a 16/11) → FK para product_models ON DELETE
--      SET NULL (NOT VALID + VALIDATE). O índice idx_products_model já existe. Gatilhos em products
--      (trg_products_modelo_ins / _upd, BEFORE, correm DEPOIS de trg_cat_produto_tabelas, que pode mudar a
--      subcategoria): o modelo tem de existir, não estar apagado e ser da organização E da subcategoria do produto
--      (CT002); se o produto mudar de subcategoria sem trazer outro modelo, model_id passa a NULL.
--      cat_guardar_produto_tabelas (20270117700000) não escreve model_id: ao mudar a subcategoria, o modelo sai.
--   3. Funções (products.edit nas escritas; products.edit ou services.view na leitura):
--        cat_ler_modelos_gestao(p_org) → {modelos:[{id,nome,numero,ativo,usados,subcategoria{…},categoria{…}}]}
--        cat_guardar_modelo(p_org, p_id, p_subcategoria, p_nome, p_numero DEFAULT NULL) — cria ou renomeia.
--          Criar com p_numero: livre (ocupado, mesmo por um apagado = CT004 com o id no DETAIL) e no máximo o maior
--          número da subcategoria + 100 (acima = CT002: não se esgota a numeração por engano). Sem p_numero: o maior
--          + 1; se passar de 9999, o MENOR número livre (contando os apagados); nenhum livre = CT002.
--          Renomear: só o nome; outra subcategoria ou outro número = CT002.
--        cat_estado_modelo(p_org, p_id, p_ativo)
--        cat_guardar_produto_modelo(p_org, p_produto, p_modelo|NULL) — o modelo tem de ser da subcategoria do produto
--          (CT002); um desativado só fica se já era o do produto; NULL desliga. NÃO gera o SKU: chamar
--          cat_gerar_sku_produto a seguir, como último passo ao gravar.
--        Tetos por organização: 2000 modelos ATIVOS e 10000 modelos VIVOS (não apagados). Locks:
--        'cat_modelos:'||org (criar/reativar, por causa dos tetos), depois 'cat_modelos:'||org||':'||sub — por esta ordem.
--   4. SKU POR MODELO:
--        cat_gerar_sku_produto (mesma assinatura): NNNN = número do modelo. Sem modelo, ou modelo de outra
--          subcategoria/organização → falta 'modelo' e não gera (o SKU fica), como sem subcategoria. Deixa de usar
--          fn_cat_sku_proximo (que fica, sem uso). Se o SKU calculado já é de OUTRO produto da organização (vivo ou
--          apagado: a unicidade products_sku_organization_id_key cobre os dois) → não gera:
--          {gerado:false, motivo:'duplicado', faltas:[…,'duplicado'], outro_apagado:bool[, outro_produto:id]}
--          — outro_produto só vem se o outro estiver vivo (o id de um apagado nunca sai).
--          Dois produtos do mesmo modelo com os mesmos atributos são o mesmo produto.
--          Sem advisory lock: o UPDATE contra o índice único já serializa (o segundo espera pelo primeiro e recebe o
--          unique_violation, que vira 'duplicado'; só o de products_sku_organization_id_key — outro sobe).
--          Prende o produto FOR NO KEY UPDATE. O resto como antes: provisório/vazio/já gerado → (re)gera; manual só
--          com p_forcar.
--        IMPORTAÇÃO (14 328 produtos): chamar em BLOCOS de no máximo 25 produtos por transação (≈ 574 blocos), nunca
--          numa só transação. Cada SKU escrito abre uma subtransação (o BEGIN … EXCEPTION do UPDATE) e os passos de
--          gravação do produto podem abrir outras; acima de 64 subtransações com escrita numa transação o PostgreSQL
--          deixa de as ter em cache (PGPROC_MAX_CACHED_SUBXIDS) e as leituras de TODA a base passam a ir a
--          pg_subtrans. Se a transação só gerar SKU (produtos já gravados), até 50. Os 25 são uma estimativa: as
--          subtransações dos outros passos (cat_guardar_produto_*) não foram contadas.
--        cat_prever_sku_modelo(p_org, p_categoria, p_subcategoria, p_modelo, p_atributos, p_produto DEFAULT NULL) nova:
--          {sku, faltas[, outro_apagado, outro_produto]}; p_produto = o produto em edição (não conta como duplicado
--          de si próprio); outro_produto só para quem tem products.edit e só se o outro estiver vivo.
--        cat_prever_sku (mesma assinatura, compatível): delega com modelo NULL → sku null, falta 'modelo'.
--        Faltas, por ordem: as que bloqueiam do prefixo (categoria, sigla_categoria, subcategoria,
--          sigla_subcategoria), depois 'modelo', depois as informativas (sigla:<cód>, medida:<cód>), depois 'duplicado'.
--        fn_cat_sku_partes NÃO muda (o corpo aplicado em 20270118200000 é conferido na guarda).
--   Os SKU dos produtos que já existem NÃO mudam (nenhuma linha de products é escrita aqui). Um produto já gerado e
--   sem modelo, ao ser gravado de novo, não regenera (falta 'modelo') e mantém o SKU. Lido a 16/11: 0 produtos com
--   sku_gerado em toda a base, 0 com model_id.
--
-- O ECRÃ (src/emylia: PreviaSku, CriarNoCatalogo, GestaoSku…) tem de entrar com esta migration: depois dela,
-- cat_prever_sku devolve sempre sku null + 'modelo' e cat_gerar_sku_produto não gera sem modelo. Sem o ecrã dos
-- modelos e cat_guardar_produto_modelo no fluxo de gravar, NENHUM produto novo recebe SKU gerado.
-- Os testes supabase/tests/catalogo_siglas_e_sku.test.sql e catalogo_sku_subcategoria_obrigatoria.test.sql esperam
-- o NNNN sequencial: deixam de passar depois desta migration e têm de ser atualizados.
--
-- ORDEM: depois de 20270118000000 e 20270118200000 (a guarda confere os corpos aplicados por md5, lidos na RH a
-- 16/11). Não depende de 20270118100000_catalogo_fornecedor_produto.
-- Erros: CT001 sem permissão; CT002 dados inválidos; CT003 não encontrado; CT004 repetido (DETAIL = id).
-- Teste: supabase/tests/catalogo_modelos.test.sql (passo 0 falha ANTES desta migration).
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente (a 16/11 também
-- 20270118100000_catalogo_fornecedor_produto, por rever); listar com `supabase migration list --linked` antes.
-- =============================================================================

SET lock_timeout = '5s';

-- ─── 0. Guardas ─────────────────────────────────────────────────────────────────
DO $g$
DECLARE v_falta text; v_src text; v_txt text; v_n bigint;
BEGIN
  SELECT string_agg(s, ', ') INTO v_falta
  FROM unnest(ARRAY['public.fn_cat_exigir(uuid,text)', 'public.fn_cat_exigir_uma(uuid,text[])',
                    'public.fn_cat_limpar_nome(text)', 'public.fn_cat_chave_opcao(text)',
                    'public.fn_cat_grupo_do_atributo(uuid,uuid)', 'public.fn_cat_medida_ler(jsonb,text)',
                    'public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)', 'public.cat_gerar_sku_produto(uuid,uuid,boolean)',
                    'public.cat_prever_sku(uuid,uuid,uuid,jsonb)', 'public.fn_generic_entity_audit()',
                    'public.update_updated_at_column()', 'public.get_user_visible_org_ids(uuid)',
                    'public.is_system_admin_user(uuid)']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltam funções (%): aplicar antes 20270118000000 e 20270118200000.', v_falta;
  END IF;

  -- products.model_id tem de existir e ser uuid; sem FK de outra migration
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns ic
                 WHERE ic.table_schema = 'public' AND ic.table_name = 'products' AND ic.column_name = 'model_id'
                   AND ic.data_type::text = 'uuid') THEN
    RAISE EXCEPTION 'products.model_id não existe ou não é uuid: rever esta migration.';
  END IF;
  SELECT string_agg(c.conname::text, ', ') INTO v_txt FROM pg_constraint c
  WHERE c.conrelid = 'public.products'::regclass AND c.contype::text = 'f' AND c.conname::text <> 'products_model_id_fkey'
    AND EXISTS (SELECT 1 FROM unnest(c.conkey) k JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
                WHERE a.attname::text = 'model_id');
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'products.model_id já tem outra FK (%): rever esta migration.', v_txt; END IF;

  -- a tabela, se já existir (reaplicação), tem de ser esta
  IF to_regclass('public.product_models') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM information_schema.columns ic
    WHERE ic.table_schema = 'public' AND ic.table_name = 'product_models'
      AND ic.column_name::text IN ('id', 'organization_id', 'subcategory_id', 'name', 'numero', 'is_active', 'deleted_at', 'created_by');
    IF v_n <> 8 THEN RAISE EXCEPTION 'Já existe uma tabela product_models diferente: rever esta migration.'; END IF;
  ELSE
    SELECT count(*) INTO v_n FROM products WHERE model_id IS NOT NULL;
    IF v_n > 0 THEN
      RAISE EXCEPTION '% produtos já têm model_id sem haver tabela de modelos: rever esta migration.', v_n;
    END IF;
  END IF;

  -- os corpos aplicados (md5 lido na RH a 16/11), ou já os desta migration
  v_src := (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)')::oid);
  IF md5(v_src) <> '35f20ab07322d3cace1c94a97c1289b9' THEN
    RAISE EXCEPTION 'fn_cat_sku_partes não é a de 20270118200000 (md5 %): rever esta migration.', md5(v_src);
  END IF;
  v_src := (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_gerar_sku_produto(uuid,uuid,boolean)')::oid);
  IF md5(v_src) <> 'efba2b3deb07e0ffea551df1e0f7b966' AND position('20270118300000' IN v_src) = 0 THEN
    RAISE EXCEPTION 'cat_gerar_sku_produto não é a de 20270118000000 (md5 %): rever esta migration.', md5(v_src);
  END IF;
  v_src := (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_prever_sku(uuid,uuid,uuid,jsonb)')::oid);
  IF md5(v_src) <> '54a9725d799f447c843b494fc5d38dd9' AND position('20270118300000' IN v_src) = 0 THEN
    RAISE EXCEPTION 'cat_prever_sku não é a de 20270118000000 (md5 %): rever esta migration.', md5(v_src);
  END IF;

  -- nenhuma outra versão (outra assinatura) das funções novas
  SELECT string_agg(p.proname::text || '(' || pg_get_function_identity_arguments(p.oid)::text || ')', ', ') INTO v_txt
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND ((p.proname = 'fn_cat_modelo_numero' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_sub uuid, p_modelo uuid')
      OR (p.proname = 'fn_cat_sku_juntar_faltas' AND pg_get_function_identity_arguments(p.oid) <> 'p_faltas jsonb, p_sem_modelo boolean')
      OR (p.proname = 'cat_ler_modelos_gestao' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid')
      OR (p.proname = 'cat_guardar_modelo' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_id uuid, p_subcategoria uuid, p_nome text, p_numero integer')
      OR (p.proname = 'cat_estado_modelo' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_id uuid, p_ativo boolean')
      OR (p.proname = 'cat_guardar_produto_modelo' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_produto uuid, p_modelo uuid')
      OR (p.proname = 'cat_prever_sku_modelo' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_categoria uuid, p_subcategoria uuid, p_modelo uuid, p_atributos jsonb, p_produto uuid')
      OR (p.proname = 'cat_prever_sku' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_categoria uuid, p_subcategoria uuid, p_atributos jsonb')
      OR (p.proname = 'cat_gerar_sku_produto' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_produto uuid, p_forcar boolean'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe outra versão destas funções: %. Rever esta migration.', v_txt;
  END IF;
END $g$;

-- ─── 1. A tabela dos modelos ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id),
  subcategory_id uuid NOT NULL REFERENCES public.product_categories(id),
  name text NOT NULL,
  numero smallint NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.anew_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_models_name_check CHECK (name <> '' AND char_length(name) <= 200),
  CONSTRAINT product_models_numero_check CHECK (numero BETWEEN 1 AND 9999)
);

-- número único por (organização, subcategoria) contando os apagados (nunca se reutiliza); nome único entre os vivos
CREATE UNIQUE INDEX IF NOT EXISTS product_models_numero_key
  ON public.product_models (organization_id, subcategory_id, numero);
CREATE UNIQUE INDEX IF NOT EXISTS product_models_nome_key
  ON public.product_models (organization_id, subcategory_id, public.fn_cat_chave_opcao(name)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS product_models_subcategory_idx ON public.product_models (subcategory_id);

COMMENT ON TABLE public.product_models IS
  'Catálogo (20270118300000): modelos de produto, debaixo de uma subcategoria. O número (1..9999) é o NNNN do SKU de todos os produtos do modelo. Escritas só por cat_guardar_modelo / cat_estado_modelo.';
COMMENT ON COLUMN public.product_models.numero IS
  'O NNNN do SKU (20270118300000): único por (organização, subcategoria) entre os vivos; não muda depois de criado; não se reutiliza.';

-- RLS: só leitura para quem vê a organização e tem services.view ou products.edit nela (como cat_ler_modelos_gestao).
-- A lista de organizações calcula-se uma vez por consulta (subconsulta sem correlação), não linha a linha.
ALTER TABLE public.product_models ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_models_select ON public.product_models;
CREATE POLICY product_models_select ON public.product_models FOR SELECT TO authenticated
  USING (public.is_system_admin_user((SELECT auth.uid()))
         OR organization_id IN (SELECT v.o FROM public.get_user_visible_org_ids((SELECT auth.uid())) AS v(o)
                                WHERE public.fn_cat_pode(v.o, 'services.view') OR public.fn_cat_pode(v.o, 'products.edit')));
-- os privilégios por omissão do schema dão tudo a anon e authenticated: tira-se tudo e dá-se SELECT por coluna,
-- sem created_by. Uma coluna nova NÃO fica legível sozinha: o bloco de conferir falha se as concedidas divergirem.
REVOKE ALL ON public.product_models FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, organization_id, subcategory_id, name, numero, is_active, deleted_at, created_at, updated_at)
  ON public.product_models TO authenticated;
GRANT ALL ON public.product_models TO service_role;

-- a subcategoria é da mesma organização e tem pai; organização, subcategoria e número não mudam
CREATE OR REPLACE FUNCTION public.fn_cat_modelo_valida_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.organization_id, NEW.subcategory_id, NEW.numero) IS DISTINCT FROM (OLD.organization_id, OLD.subcategory_id, OLD.numero) THEN
      RAISE EXCEPTION 'A organização, a subcategoria e o número de um modelo não mudam depois de criado.' USING ERRCODE = 'CT002';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM product_categories pc
                 WHERE pc.id = NEW.subcategory_id AND pc.parent_id IS NOT NULL AND pc.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'O modelo tem de ficar numa subcategoria da mesma organização.' USING ERRCODE = 'CT002';
  END IF;
  RETURN NEW;
END $$;

-- O modelo de um produto existe, não está apagado e é da organização E da subcategoria do produto. Se o produto mudar de
-- subcategoria sem trazer outro modelo, o modelo antigo sai (model_id NULL). Só corre quando model_id, a organização ou
-- a subcategoria mudam (WHEN dos gatilhos): uma edição que reescreve o mesmo model_id não é travada por um modelo
-- apagado entretanto.
CREATE OR REPLACE FUNCTION public.fn_cat_produto_modelo_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.subcategory_id IS DISTINCT FROM OLD.subcategory_id
     AND NEW.model_id IS NOT DISTINCT FROM OLD.model_id THEN
    NEW.model_id := NULL;
    RETURN NEW;
  END IF;
  IF NEW.model_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM product_models pm
                     WHERE pm.id = NEW.model_id AND pm.organization_id = NEW.organization_id
                       AND pm.subcategory_id = NEW.subcategory_id AND pm.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'O modelo não existe, foi apagado, ou não é da organização e da subcategoria do produto.' USING ERRCODE = 'CT002';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_cat_modelo_valida_trg(), public.fn_cat_produto_modelo_trg() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cat_modelo_valida ON public.product_models;
CREATE TRIGGER trg_cat_modelo_valida BEFORE INSERT OR UPDATE ON public.product_models
  FOR EACH ROW EXECUTE FUNCTION public.fn_cat_modelo_valida_trg();
DROP TRIGGER IF EXISTS trg_audit_product_models ON public.product_models;
CREATE TRIGGER trg_audit_product_models AFTER INSERT OR UPDATE OR DELETE ON public.product_models
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();
DROP TRIGGER IF EXISTS update_product_models_updated_at ON public.product_models;
CREATE TRIGGER update_product_models_updated_at BEFORE UPDATE ON public.product_models
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 2. products.model_id → product_models ──────────────────────────────────────
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_model_id_fkey;
ALTER TABLE public.products ADD CONSTRAINT products_model_id_fkey
  FOREIGN KEY (model_id) REFERENCES public.product_models(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.products VALIDATE CONSTRAINT products_model_id_fkey;
CREATE INDEX IF NOT EXISTS idx_products_model ON public.products (model_id);
COMMENT ON COLUMN public.products.model_id IS
  'Modelo do produto (20270118300000): o NNNN do SKU é o número do modelo. Liga-se em cat_guardar_produto_modelo (o modelo tem de ser da subcategoria do produto).';

-- Nomes trg_products_*: os BEFORE correm por ordem alfabética, e estes têm de correr DEPOIS de trg_cat_produto_tabelas
-- (que pode mudar subcategory_id a partir de catalogo_categoria_id). Sem lista de colunas no UPDATE, pela mesma razão:
-- a subcategoria pode mudar por outro gatilho sem estar no SET; o WHEN é que filtra.
DROP TRIGGER IF EXISTS trg_cat_produto_modelo ON public.products;
DROP TRIGGER IF EXISTS trg_products_modelo_ins ON public.products;
CREATE TRIGGER trg_products_modelo_ins BEFORE INSERT ON public.products
  FOR EACH ROW WHEN (NEW.model_id IS NOT NULL) EXECUTE FUNCTION public.fn_cat_produto_modelo_trg();
DROP TRIGGER IF EXISTS trg_products_modelo_upd ON public.products;
CREATE TRIGGER trg_products_modelo_upd BEFORE UPDATE ON public.products
  FOR EACH ROW WHEN (NEW.model_id IS NOT NULL
                     AND (NEW.model_id IS DISTINCT FROM OLD.model_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
                          OR NEW.subcategory_id IS DISTINCT FROM OLD.subcategory_id))
  EXECUTE FUNCTION public.fn_cat_produto_modelo_trg();

-- ─── 3. Funções internas (sem EXECUTE para authenticated, anon nem PUBLIC) ──────
-- O número do modelo, se o modelo for desta organização e desta subcategoria e não estiver apagado; senão NULL.
CREATE OR REPLACE FUNCTION public.fn_cat_modelo_numero(p_org uuid, p_sub uuid, p_modelo uuid) RETURNS integer
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT pm.numero::integer FROM product_models pm
  WHERE pm.id = p_modelo AND pm.organization_id = p_org AND pm.subcategory_id = p_sub AND pm.deleted_at IS NULL
$$;

-- As faltas por ordem: as que bloqueiam o prefixo, depois 'modelo' (se faltar), depois as informativas.
CREATE OR REPLACE FUNCTION public.fn_cat_sku_juntar_faltas(p_faltas jsonb, p_sem_modelo boolean) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT ARRAY(SELECT t.f FROM jsonb_array_elements_text(coalesce(p_faltas, '[]'::jsonb)) WITH ORDINALITY AS t(f, o)
               WHERE t.f IN ('categoria', 'sigla_categoria', 'subcategoria', 'sigla_subcategoria') ORDER BY t.o)
      || (CASE WHEN p_sem_modelo THEN ARRAY['modelo']::text[] ELSE '{}'::text[] END)
      || ARRAY(SELECT t.f FROM jsonb_array_elements_text(coalesce(p_faltas, '[]'::jsonb)) WITH ORDINALITY AS t(f, o)
               WHERE t.f NOT IN ('categoria', 'sigla_categoria', 'subcategoria', 'sigla_subcategoria') ORDER BY t.o)
$$;
REVOKE ALL ON FUNCTION public.fn_cat_modelo_numero(uuid,uuid,uuid), public.fn_cat_sku_juntar_faltas(jsonb,boolean)
  FROM PUBLIC, anon, authenticated;

-- ─── 4. Ler os modelos para gestão ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_ler_modelos_gestao(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
               'categoria', jsonb_build_object('id', c.id, 'nome', c.name, 'sigla', c.sigla))
             ORDER BY coalesce(c.sort_order, 0), c.name, coalesce(s.sort_order, 0), s.name, pm.numero, pm.id)
      FROM product_models pm
      JOIN product_categories s ON s.id = pm.subcategory_id
      LEFT JOIN product_categories c ON c.id = s.parent_id
      LEFT JOIN uso u ON u.id = pm.id
      WHERE pm.organization_id = p_org AND pm.deleted_at IS NULL), '[]'::jsonb))
  );
END $$;
REVOKE ALL ON FUNCTION public.cat_ler_modelos_gestao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_modelos_gestao(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_ler_modelos_gestao(uuid) IS
  'Catálogo (20270118300000): ecrã de gestão dos modelos. Modelos da organização (não apagados, ativos e desativados) com o número do SKU, a subcategoria e a categoria, e quantos produtos vivos os usam. Permissão products.edit ou services.view.';

-- ─── 5. Criar ou renomear um modelo ─────────────────────────────────────────────
-- p_id NULL: cria na subcategoria p_subcategoria, com o número p_numero (se livre) ou o seguinte. Senão renomeia
-- (p_subcategoria e p_numero NULL ou iguais aos atuais; diferentes = CT002).
CREATE OR REPLACE FUNCTION public.cat_guardar_modelo(p_org uuid, p_id uuid, p_subcategoria uuid, p_nome text, p_numero integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_texto constant integer := 1000;
  c_max_nome constant integer := 200;
  c_max_numero constant integer := 9999;
  c_max_modelos constant integer := 2000;
  c_max_modelos_vivos constant integer := 10000;
  c_max_salto constant integer := 100;
  v_nome text; v_sub uuid; v_atual_sub uuid; v_atual_num integer; v_ok boolean;
  v_sub_org uuid; v_sub_pai uuid; v_sub_ativo boolean; v_sub_nome text;
  v_ex uuid; v_n integer; v_num integer; v_max integer; v_id uuid; v_criador uuid; v_con text;
BEGIN
  IF length(p_nome) > c_max_texto THEN RAISE EXCEPTION 'O nome do modelo é demasiado longo.' USING ERRCODE = 'CT002'; END IF;
  v_nome := public.fn_cat_limpar_nome(p_nome);
  IF v_nome = '' THEN RAISE EXCEPTION 'Escreva o nome do modelo.' USING ERRCODE = 'CT002'; END IF;
  IF length(v_nome) > c_max_nome THEN RAISE EXCEPTION 'O nome do modelo tem no máximo 200 caracteres.' USING ERRCODE = 'CT002'; END IF;
  IF p_numero IS NOT NULL AND (p_numero < 1 OR p_numero > c_max_numero) THEN
    RAISE EXCEPTION 'O número do modelo vai de 1 a 9999.' USING ERRCODE = 'CT002';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT true, pm.subcategory_id, pm.numero::integer INTO v_ok, v_atual_sub, v_atual_num FROM product_models pm
    WHERE pm.id = p_id AND pm.organization_id = p_org AND pm.deleted_at IS NULL;
    IF NOT coalesce(v_ok, false) THEN RAISE EXCEPTION 'Modelo não encontrado.' USING ERRCODE = 'CT003'; END IF;
    IF p_subcategoria IS NOT NULL AND p_subcategoria IS DISTINCT FROM v_atual_sub THEN
      RAISE EXCEPTION 'Um modelo não muda de subcategoria: crie-o na subcategoria certa.' USING ERRCODE = 'CT002';
    END IF;
    IF p_numero IS NOT NULL AND p_numero IS DISTINCT FROM v_atual_num THEN
      RAISE EXCEPTION 'O número de um modelo não muda depois de criado.' USING ERRCODE = 'CT002';
    END IF;
    v_sub := v_atual_sub;
    PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || p_org::text || ':' || v_sub::text, 0));
    PERFORM 1 FROM product_models pm WHERE pm.id = p_id AND pm.organization_id = p_org AND pm.deleted_at IS NULL FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Modelo não encontrado.' USING ERRCODE = 'CT003'; END IF;
  ELSE
    IF p_subcategoria IS NULL THEN RAISE EXCEPTION 'Escolha a subcategoria do modelo.' USING ERRCODE = 'CT002'; END IF;
    SELECT true, pc.organization_id, pc.parent_id, coalesce(pc.is_active, true), pc.name
      INTO v_ok, v_sub_org, v_sub_pai, v_sub_ativo, v_sub_nome
    FROM product_categories pc
    WHERE pc.id = p_subcategoria AND pc.deleted_at IS NULL AND (pc.organization_id = p_org OR pc.organization_id IS NULL);
    IF NOT coalesce(v_ok, false) THEN RAISE EXCEPTION 'Subcategoria não encontrada.' USING ERRCODE = 'CT003'; END IF;
    IF v_sub_pai IS NULL THEN
      RAISE EXCEPTION 'Os modelos ficam debaixo de uma subcategoria, não de uma categoria de topo.' USING ERRCODE = 'CT002';
    END IF;
    IF v_sub_org IS NULL THEN RAISE EXCEPTION 'Subcategoria partilhada: não se pode alterar aqui.' USING ERRCODE = 'CT002'; END IF;
    IF NOT v_sub_ativo THEN
      RAISE EXCEPTION 'A subcategoria «%» está desativada: ative-a antes de lhe criar modelos.', v_sub_nome USING ERRCODE = 'CT002';
    END IF;
    v_sub := p_subcategoria;
    -- primeiro a chave da organização (o teto), depois a da subcategoria (número e nome)
    PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || p_org::text, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || p_org::text || ':' || v_sub::text, 0));
  END IF;

  -- nome repetido na subcategoria (sem acentos nem maiúsculas)
  SELECT pm.id INTO v_ex FROM product_models pm
  WHERE pm.organization_id = p_org AND pm.subcategory_id = v_sub AND pm.deleted_at IS NULL AND pm.id IS DISTINCT FROM p_id
    AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(v_nome)
  ORDER BY pm.id LIMIT 1;
  IF v_ex IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe um modelo com este nome nesta subcategoria.' USING ERRCODE = 'CT004', DETAIL = v_ex::text;
  END IF;

  IF p_id IS NULL THEN
    SELECT count(*)::integer INTO v_n FROM product_models pm
    WHERE pm.organization_id = p_org AND pm.deleted_at IS NULL AND pm.is_active;
    IF v_n >= c_max_modelos THEN
      RAISE EXCEPTION 'Esta organização já tem o máximo de modelos ativos (2000).' USING ERRCODE = 'CT002';
    END IF;
    SELECT count(*)::integer INTO v_n FROM product_models pm WHERE pm.organization_id = p_org AND pm.deleted_at IS NULL;
    IF v_n >= c_max_modelos_vivos THEN
      RAISE EXCEPTION 'Esta organização já tem o máximo de modelos (10000, ativos e desativados).' USING ERRCODE = 'CT002';
    END IF;
    SELECT u.id INTO v_criador FROM anew_users u WHERE u.id = v_user;
    IF v_criador IS NULL THEN RAISE EXCEPTION 'Sem utilizador identificado para criar o modelo.' USING ERRCODE = 'CT001'; END IF;

    -- o maior número da subcategoria, apagados incluídos (um número nunca se reutiliza)
    v_max := coalesce((SELECT max(pm.numero)::integer FROM product_models pm
                       WHERE pm.organization_id = p_org AND pm.subcategory_id = v_sub), 0);
    IF p_numero IS NOT NULL THEN
      IF p_numero > v_max + c_max_salto THEN
        RAISE EXCEPTION 'O número % passa em mais de 100 o maior desta subcategoria (%): indique no máximo %.',
          lpad(p_numero::text, 4, '0'), lpad(v_max::text, 4, '0'), lpad(least(v_max + c_max_salto, c_max_numero)::text, 4, '0')
          USING ERRCODE = 'CT002';
      END IF;
      SELECT pm.id INTO v_ex FROM product_models pm
      WHERE pm.organization_id = p_org AND pm.subcategory_id = v_sub AND pm.numero = p_numero
      ORDER BY (pm.deleted_at IS NOT NULL), pm.id LIMIT 1;
      IF v_ex IS NOT NULL THEN
        RAISE EXCEPTION 'Já existe um modelo com o número % nesta subcategoria.', lpad(p_numero::text, 4, '0')
          USING ERRCODE = 'CT004', DETAIL = v_ex::text;
      END IF;
      v_num := p_numero;
    ELSE
      v_num := v_max + 1;
      IF v_num > c_max_numero THEN
        -- o fim da numeração foi ocupado: o menor número livre (os apagados contam como ocupados)
        SELECT min(g.n)::integer INTO v_num FROM generate_series(1, c_max_numero) AS g(n)
        WHERE NOT EXISTS (SELECT 1 FROM product_models pm
                          WHERE pm.organization_id = p_org AND pm.subcategory_id = v_sub AND pm.numero = g.n);
        IF v_num IS NULL THEN
          RAISE EXCEPTION 'Esta subcategoria já não tem números de modelo livres (9999).' USING ERRCODE = 'CT002';
        END IF;
      END IF;
    END IF;

    BEGIN
      INSERT INTO product_models (organization_id, subcategory_id, name, numero, is_active, created_by)
      VALUES (p_org, v_sub, v_nome, v_num, true, v_criador)
      RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      -- só os dois índices únicos da tabela viram CT004; outro sobe como está
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      IF v_con IS DISTINCT FROM 'product_models_numero_key' AND v_con IS DISTINCT FROM 'product_models_nome_key' THEN RAISE; END IF;
      RAISE EXCEPTION '%', (CASE WHEN v_con = 'product_models_numero_key' THEN 'Já existe um modelo com este número nesta subcategoria.'
                                 ELSE 'Já existe um modelo com este nome nesta subcategoria.' END)
        USING ERRCODE = 'CT004',
        DETAIL = coalesce((SELECT pm.id::text FROM product_models pm
                           WHERE pm.organization_id = p_org AND pm.subcategory_id = v_sub
                             AND (CASE WHEN v_con = 'product_models_numero_key' THEN pm.numero = v_num
                                       ELSE pm.deleted_at IS NULL AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(v_nome) END)
                           ORDER BY pm.id LIMIT 1), '');
    END;
  ELSE
    BEGIN
      UPDATE product_models pm SET name = v_nome WHERE pm.id = p_id AND pm.name IS DISTINCT FROM v_nome;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      IF v_con IS DISTINCT FROM 'product_models_nome_key' THEN RAISE; END IF;
      RAISE EXCEPTION 'Já existe um modelo com este nome nesta subcategoria.' USING ERRCODE = 'CT004',
        DETAIL = coalesce((SELECT pm.id::text FROM product_models pm
                           WHERE pm.organization_id = p_org AND pm.subcategory_id = v_sub AND pm.deleted_at IS NULL AND pm.id <> p_id
                             AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(v_nome)
                           ORDER BY pm.id LIMIT 1), '');
    END;
    v_id := p_id;
  END IF;

  RETURN (
    SELECT jsonb_build_object('modelo', jsonb_build_object(
             'id', pm.id, 'nome', pm.name, 'numero', pm.numero, 'subcategoria', pm.subcategory_id, 'ativo', pm.is_active,
             'usados', (SELECT count(*)::integer FROM products p
                        WHERE p.organization_id = p_org AND NOT p.is_deleted AND p.model_id = pm.id)))
    FROM product_models pm WHERE pm.id = v_id);
END $$;
REVOKE ALL ON FUNCTION public.cat_guardar_modelo(uuid,uuid,uuid,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_guardar_modelo(uuid,uuid,uuid,text,integer) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_guardar_modelo(uuid,uuid,uuid,text,integer) IS
  'Catálogo (20270118300000): cria (p_id NULL) um modelo numa subcategoria ativa da organização, com o número p_numero (1..9999, no máximo o maior da subcategoria + 100; ocupado, mesmo por um apagado = CT004 com o id no DETAIL) ou o seguinte (maior + 1; passado 9999, o menor livre); ou renomeia (subcategoria e número não mudam: CT002). Nome repetido na subcategoria: CT004. No máximo 2000 modelos ativos e 10000 vivos por organização. Permissão products.edit.';

-- ─── 6. Ativar / desativar um modelo ────────────────────────────────────────────
-- Os produtos mantêm a ligação e o SKU continua a gerar-se; um modelo desativado não se liga a produtos novos.
CREATE OR REPLACE FUNCTION public.cat_estado_modelo(p_org uuid, p_id uuid, p_ativo boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_modelos constant integer := 2000;
  v_ok boolean; v_sub uuid; v_ativo boolean; v_nome text; v_numero integer; v_sub_nome text; v_sub_ativo boolean; v_n integer;
BEGIN
  IF p_ativo IS NULL THEN RAISE EXCEPTION 'Diga se o modelo fica ativo ou desativado.' USING ERRCODE = 'CT002'; END IF;
  SELECT true, pm.subcategory_id INTO v_ok, v_sub FROM product_models pm
  WHERE pm.id = p_id AND pm.organization_id = p_org AND pm.deleted_at IS NULL;
  IF NOT coalesce(v_ok, false) THEN RAISE EXCEPTION 'Modelo não encontrado.' USING ERRCODE = 'CT003'; END IF;

  -- ativar conta para o teto: a chave da organização primeiro (a mesma ordem de cat_guardar_modelo)
  IF p_ativo THEN PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || p_org::text, 0)); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || p_org::text || ':' || v_sub::text, 0));
  SELECT pm.is_active, pm.name, pm.numero::integer INTO v_ativo, v_nome, v_numero FROM product_models pm
  WHERE pm.id = p_id AND pm.organization_id = p_org AND pm.deleted_at IS NULL FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Modelo não encontrado.' USING ERRCODE = 'CT003'; END IF;

  IF p_ativo AND NOT v_ativo THEN
    SELECT pc.name, (coalesce(pc.is_active, true) AND pc.deleted_at IS NULL) INTO v_sub_nome, v_sub_ativo
    FROM product_categories pc WHERE pc.id = v_sub;
    IF NOT coalesce(v_sub_ativo, false) THEN
      RAISE EXCEPTION 'A subcategoria «%» está desativada: ative-a primeiro.', coalesce(v_sub_nome, '?') USING ERRCODE = 'CT002';
    END IF;
    SELECT count(*)::integer INTO v_n FROM product_models pm
    WHERE pm.organization_id = p_org AND pm.deleted_at IS NULL AND pm.is_active;
    IF v_n >= c_max_modelos THEN
      RAISE EXCEPTION 'Esta organização já tem o máximo de modelos ativos (2000).' USING ERRCODE = 'CT002';
    END IF;
  END IF;

  UPDATE product_models pm SET is_active = p_ativo WHERE pm.id = p_id AND pm.is_active IS DISTINCT FROM p_ativo;
  RETURN jsonb_build_object('modelo', jsonb_build_object('id', p_id, 'nome', v_nome, 'numero', v_numero,
                                                         'subcategoria', v_sub, 'ativo', p_ativo));
END $$;
REVOKE ALL ON FUNCTION public.cat_estado_modelo(uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_estado_modelo(uuid,uuid,boolean) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_estado_modelo(uuid,uuid,boolean) IS
  'Catálogo (20270118300000): ativa ou desativa um modelo da organização. Ativar com a subcategoria desativada, ou acima de 2000 ativos, é recusado (CT002). Os produtos mantêm a ligação. Permissão products.edit.';

-- ─── 7. Ligar um produto a um modelo ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_guardar_produto_modelo(p_org uuid, p_produto uuid, p_modelo uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  v_ok boolean; v_tipo text; v_sub uuid; v_atual uuid;
  v_m_sub uuid; v_m_ativo boolean; v_m_nome text; v_m_numero integer; v_fonte text;
BEGIN
  SELECT true, p.tipo_catalogo, p.subcategory_id, p.model_id INTO v_ok, v_tipo, v_sub, v_atual
  FROM products p WHERE p.id = p_produto AND p.organization_id = p_org AND NOT p.is_deleted FOR NO KEY UPDATE;
  IF NOT coalesce(v_ok, false) THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  IF v_tipo IS DISTINCT FROM 'produto' THEN
    RAISE EXCEPTION 'Só os produtos do Catálogo têm modelo.' USING ERRCODE = 'CT002';
  END IF;

  IF p_modelo IS NOT NULL THEN
    SELECT pm.subcategory_id, pm.is_active, pm.name, pm.numero::integer INTO v_m_sub, v_m_ativo, v_m_nome, v_m_numero
    FROM product_models pm WHERE pm.id = p_modelo AND pm.organization_id = p_org AND pm.deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Modelo não encontrado.' USING ERRCODE = 'CT003'; END IF;
    IF v_sub IS NULL THEN
      RAISE EXCEPTION 'Escolha primeiro a subcategoria do produto.' USING ERRCODE = 'CT002';
    END IF;
    IF v_m_sub IS DISTINCT FROM v_sub THEN
      RAISE EXCEPTION 'O modelo «%» não é da subcategoria deste produto.', v_m_nome USING ERRCODE = 'CT002';
    END IF;
    IF NOT v_m_ativo AND v_atual IS DISTINCT FROM p_modelo THEN
      RAISE EXCEPTION 'O modelo «%» está desativado.', v_m_nome USING ERRCODE = 'CT002';
    END IF;
  END IF;

  IF v_atual IS DISTINCT FROM p_modelo THEN
    v_fonte := current_setting('app.audit_source', true);
    PERFORM set_config('app.audit_source', 'fn:cat_guardar_produto_modelo', true);
    UPDATE products p SET model_id = p_modelo WHERE p.id = p_produto AND p.organization_id = p_org;
    PERFORM set_config('app.audit_source', coalesce(v_fonte, ''), true);
  END IF;

  RETURN jsonb_build_object('produto', jsonb_build_object('id', p_produto,
           'modelo', (CASE WHEN p_modelo IS NULL THEN NULL
                           ELSE jsonb_build_object('id', p_modelo, 'nome', v_m_nome, 'numero', v_m_numero) END)));
END $$;
REVOKE ALL ON FUNCTION public.cat_guardar_produto_modelo(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_guardar_produto_modelo(uuid,uuid,uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_guardar_produto_modelo(uuid,uuid,uuid) IS
  'Catálogo (20270118300000): liga (ou, com p_modelo NULL, desliga) um produto a um modelo da subcategoria do produto (outra subcategoria ou produto sem subcategoria = CT002; desativado só se já era o do produto). Não gera o SKU: chamar cat_gerar_sku_produto a seguir. Permissão products.edit.';

-- ─── 8. Gerar o SKU de um produto: NNNN = número do modelo ──────────────────────
CREATE OR REPLACE FUNCTION public.cat_gerar_sku_produto(p_org uuid, p_produto uuid, p_forcar boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  -- 20270118300000: o NNNN é o número do modelo do produto; o mesmo SKU noutro produto = duplicado
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  v_ok boolean; v_sku text; v_gerado boolean; v_tipo text; v_cat uuid; v_sub uuid; v_modelo uuid; v_numero integer;
  v_vals jsonb; v_partes jsonb; v_faltas text[]; v_prefixo text; v_resto text;
  v_cand text; v_outro uuid; v_outro_apagado boolean; v_fonte text; v_dup boolean := false; v_con text;
BEGIN
  SELECT true, p.sku, p.sku_gerado, p.tipo_catalogo, p.category_id, p.subcategory_id, p.model_id
    INTO v_ok, v_sku, v_gerado, v_tipo, v_cat, v_sub, v_modelo
  FROM products p WHERE p.id = p_produto AND p.organization_id = p_org AND NOT p.is_deleted FOR NO KEY UPDATE;
  IF NOT coalesce(v_ok, false) THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  IF v_tipo IS DISTINCT FROM 'produto' THEN
    RAISE EXCEPTION '%', (CASE WHEN v_tipo = 'consumivel' THEN 'Os consumíveis não têm SKU gerado: só os produtos.'
                               ELSE 'Este artigo não é um produto do Catálogo.' END)
      USING ERRCODE = 'CT002';
  END IF;

  -- o que está gravado: as opções (com a sigla da opção do grupo em uso) e as medidas
  v_vals := (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'atributo', v.attribute_id,
             'sigla', o.sigla,
             'medida', (CASE WHEN a.is_measurement THEN public.fn_cat_medida_ler(v.value_json, v.unit) END))), '[]'::jsonb)
    FROM product_attribute_values v
    JOIN product_attributes a ON a.id = v.attribute_id AND a.organization_id = p_org AND a.deleted_at IS NULL
    LEFT JOIN attribute_option_group_values o
      ON NOT a.is_measurement AND o.group_id = public.fn_cat_grupo_do_atributo(a.id, p_org) AND o.value_text = v.value_text
    WHERE v.product_id = p_produto);
  v_partes := public.fn_cat_sku_partes(p_org, v_cat, v_sub, v_vals);
  v_prefixo := v_partes ->> 'prefixo';
  v_resto := v_partes ->> 'resto';
  -- o modelo tem de ser desta organização e da subcategoria do produto
  v_numero := public.fn_cat_modelo_numero(p_org, v_sub, v_modelo);
  v_faltas := public.fn_cat_sku_juntar_faltas(v_partes -> 'faltas', v_numero IS NULL);

  IF v_prefixo IS NULL OR v_numero IS NULL THEN
    RETURN jsonb_build_object('sku', v_sku, 'gerado', false, 'faltas', to_jsonb(v_faltas), 'motivo', 'faltas');
  END IF;
  -- substitui: o provisório de cat_guardar_produto (CAT- e 10 hexadecimais), vazio, ou um SKU já gerado (regenera);
  -- um SKU escrito à mão só com p_forcar
  IF NOT (v_sku IS NULL OR btrim(v_sku) = '' OR v_sku ~ '^CAT-[0-9A-F]{10}$' OR v_gerado) AND NOT coalesce(p_forcar, false) THEN
    RETURN jsonb_build_object('sku', v_sku, 'gerado', false, 'faltas', to_jsonb(v_faltas), 'motivo', 'sku_manual');
  END IF;

  v_cand := concat_ws('-', v_prefixo, lpad(v_numero::text, 4, '0'), v_resto);
  IF v_cand = v_sku THEN
    -- já é este (um SKU escrito à mão igual ao gerado passa a gerado)
    UPDATE products p SET sku_gerado = true WHERE p.id = p_produto AND p.organization_id = p_org AND NOT p.sku_gerado;
    RETURN jsonb_build_object('sku', v_cand, 'gerado', true, 'faltas', to_jsonb(v_faltas), 'motivo', NULL);
  END IF;

  -- o SKU já é de outro produto? (sem advisory lock: se dois escreverem ao mesmo tempo, o índice único serializa e o
  -- segundo recebe o unique_violation abaixo)
  SELECT p.id, p.is_deleted INTO v_outro, v_outro_apagado FROM products p
  WHERE p.organization_id = p_org AND p.sku = v_cand AND p.id <> p_produto
  ORDER BY p.is_deleted, p.id LIMIT 1;

  IF v_outro IS NULL THEN
    v_fonte := current_setting('app.audit_source', true);
    PERFORM set_config('app.audit_source', 'fn:cat_gerar_sku_produto', true);
    BEGIN
      UPDATE products p SET sku = v_cand, sku_gerado = true WHERE p.id = p_produto AND p.organization_id = p_org;
    EXCEPTION WHEN unique_violation THEN
      -- só a unicidade (sku, organização) é «duplicado»; outra violação sobe como está
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      IF v_con IS DISTINCT FROM 'products_sku_organization_id_key' THEN RAISE; END IF;
      v_dup := true;  -- escrito ao mesmo tempo por outra sessão
    END;
    PERFORM set_config('app.audit_source', coalesce(v_fonte, ''), true);
    IF NOT v_dup THEN
      RETURN jsonb_build_object('sku', v_cand, 'gerado', true, 'faltas', to_jsonb(v_faltas), 'motivo', NULL);
    END IF;
    SELECT p.id, p.is_deleted INTO v_outro, v_outro_apagado FROM products p
    WHERE p.organization_id = p_org AND p.sku = v_cand AND p.id <> p_produto
    ORDER BY p.is_deleted, p.id LIMIT 1;
  END IF;

  -- dois produtos do mesmo modelo com os mesmos atributos são o mesmo produto: não gera, e diz qual é o outro
  -- (o id só se o outro estiver vivo: o de um apagado nunca sai)
  RETURN jsonb_build_object('sku', v_sku, 'gerado', false, 'faltas', to_jsonb(v_faltas || 'duplicado'::text),
                            'motivo', 'duplicado', 'outro_apagado', coalesce(v_outro_apagado, false))
         || (CASE WHEN v_outro IS NOT NULL AND NOT coalesce(v_outro_apagado, false)
                  THEN jsonb_build_object('outro_produto', v_outro) ELSE '{}'::jsonb END);
END $$;
REVOKE ALL ON FUNCTION public.cat_gerar_sku_produto(uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_gerar_sku_produto(uuid,uuid,boolean) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_gerar_sku_produto(uuid,uuid,boolean) IS
  'Catálogo (20270118000000; subcategoria obrigatória em 20270118200000; NNNN = número do modelo em 20270118300000): gera o SKU de um produto a partir do que está gravado: CAT-SUB-NNNN-<um segmento por atributo que entra e que o produto tem, pela ordem de cat_guardar_sku_config>. NNNN = número do modelo do produto. Sem categoria, subcategoria, sigla ou modelo (da subcategoria do produto): não gera e o SKU fica (gerado=false, motivo faltas). O mesmo SKU noutro produto da organização (vivo ou apagado): não gera (motivo duplicado, outro_apagado; outro_produto só se o outro estiver vivo). Substitui o provisório, vazio ou já gerado; manual só com p_forcar. Chamar como último passo ao gravar. Permissão products.edit.';

-- ─── 9. Pré-visualizar o SKU com o modelo (só leitura) ──────────────────────────
-- p_atributos no formato de cat_guardar_produto_atributos. p_produto: o produto em edição (o seu próprio SKU não
-- conta como duplicado). Devolve {sku, faltas} e, se o SKU já for de outro produto, faltas com 'duplicado' e outro_produto.
CREATE OR REPLACE FUNCTION public.cat_prever_sku_modelo(p_org uuid, p_categoria uuid, p_subcategoria uuid, p_modelo uuid,
                                                        p_atributos jsonb, p_produto uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  -- 20270118300000
  c_max_valores constant integer := 50;
  c_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_el jsonb; v_i bigint; v_attr uuid; v_attrs uuid[] := '{}'; v_label text; v_medida boolean; v_unit text;
  v_opc jsonb; v_med jsonb; v_sigla text; v_vals jsonb := '[]'::jsonb; v_partes jsonb; v_faltas text[]; v_prefixo text;
  v_numero integer; v_cand text; v_outro uuid; v_outro_apagado boolean;
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  IF p_atributos IS NOT NULL AND jsonb_typeof(p_atributos) <> 'array' THEN
    RAISE EXCEPTION 'Os atributos têm de vir numa lista.' USING ERRCODE = 'CT002';
  END IF;
  IF jsonb_array_length(coalesce(p_atributos, '[]'::jsonb)) > c_max_valores THEN
    RAISE EXCEPTION 'No máximo 50 atributos por produto.' USING ERRCODE = 'CT002';
  END IF;
  IF p_categoria IS NOT NULL AND NOT EXISTS (SELECT 1 FROM product_categories pc WHERE pc.id = p_categoria AND pc.deleted_at IS NULL
                                             AND (pc.organization_id = p_org OR pc.organization_id IS NULL)) THEN
    RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = 'CT003';
  END IF;
  IF p_subcategoria IS NOT NULL AND NOT EXISTS (SELECT 1 FROM product_categories pc WHERE pc.id = p_subcategoria AND pc.deleted_at IS NULL
                                                AND (pc.organization_id = p_org OR pc.organization_id IS NULL)
                                                AND pc.parent_id IS NOT DISTINCT FROM p_categoria) THEN
    RAISE EXCEPTION 'A subcategoria não pertence a esta categoria.' USING ERRCODE = 'CT002';
  END IF;
  IF p_modelo IS NOT NULL AND NOT EXISTS (SELECT 1 FROM product_models pm WHERE pm.id = p_modelo AND pm.organization_id = p_org
                                          AND pm.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Modelo não encontrado.' USING ERRCODE = 'CT003';
  END IF;
  IF p_produto IS NOT NULL AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = p_produto AND p.organization_id = p_org) THEN
    RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003';
  END IF;

  FOR v_el, v_i IN SELECT t.e, t.i FROM jsonb_array_elements(coalesce(p_atributos, '[]'::jsonb)) WITH ORDINALITY AS t(e, i) LOOP
    IF jsonb_typeof(v_el) <> 'object' OR coalesce(v_el ->> 'atributo', '') !~ c_uuid THEN
      RAISE EXCEPTION 'O valor n.º % não diz qual é o atributo.', v_i USING ERRCODE = 'CT002';
    END IF;
    v_attr := (v_el ->> 'atributo')::uuid;
    v_label := NULL;
    SELECT pa.label::text, pa.is_measurement, pa.unit::text INTO v_label, v_medida, v_unit FROM product_attributes pa
    WHERE pa.id = v_attr AND pa.organization_id = p_org AND pa.deleted_at IS NULL;
    IF v_label IS NULL THEN RAISE EXCEPTION 'Atributo não encontrado.' USING ERRCODE = 'CT003'; END IF;
    IF v_attr = ANY (v_attrs) THEN
      RAISE EXCEPTION 'O atributo «%» vem mais de uma vez.', v_label USING ERRCODE = 'CT002';
    END IF;
    v_attrs := array_append(v_attrs, v_attr);
    v_opc := nullif(v_el -> 'opcao', 'null'::jsonb);
    v_med := nullif(v_el -> 'medida', 'null'::jsonb);

    IF v_medida THEN
      CONTINUE WHEN v_med IS NULL OR jsonb_typeof(v_med) <> 'object';
      v_vals := v_vals || jsonb_build_array(jsonb_build_object(
        'atributo', v_attr, 'sigla', NULL,
        'medida', jsonb_build_object('tipo', upper(btrim(coalesce(v_med ->> 'tipo', ''))),
                                     'largura', v_med -> 'largura', 'comprimento', v_med -> 'comprimento',
                                     'espessura', v_med -> 'espessura',
                                     'unidade', lower(btrim(coalesce(nullif(v_med ->> 'unidade', ''), v_unit, 'cm'))))));
    ELSE
      CONTINUE WHEN v_opc IS NULL;
      IF jsonb_typeof(v_opc) <> 'string' OR (v_opc #>> '{}') !~ c_uuid THEN
        RAISE EXCEPTION 'A opção de «%» não é válida.', v_label USING ERRCODE = 'CT002';
      END IF;
      v_sigla := NULL;
      SELECT o.sigla INTO v_sigla FROM attribute_option_group_values o
      WHERE o.id = (v_opc #>> '{}')::uuid AND o.group_id = public.fn_cat_grupo_do_atributo(v_attr, p_org);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'A opção escolhida não pertence ao atributo «%».', v_label USING ERRCODE = 'CT002';
      END IF;
      v_vals := v_vals || jsonb_build_array(jsonb_build_object('atributo', v_attr, 'sigla', v_sigla, 'medida', NULL));
    END IF;
  END LOOP;

  v_partes := public.fn_cat_sku_partes(p_org, p_categoria, p_subcategoria, v_vals);
  v_prefixo := v_partes ->> 'prefixo';
  v_numero := public.fn_cat_modelo_numero(p_org, p_subcategoria, p_modelo);
  v_faltas := public.fn_cat_sku_juntar_faltas(v_partes -> 'faltas', v_numero IS NULL);
  IF v_prefixo IS NULL OR v_numero IS NULL THEN
    RETURN jsonb_build_object('sku', NULL, 'faltas', to_jsonb(v_faltas));
  END IF;

  v_cand := concat_ws('-', v_prefixo, lpad(v_numero::text, 4, '0'), v_partes ->> 'resto');
  SELECT p.id, p.is_deleted INTO v_outro, v_outro_apagado FROM products p
  WHERE p.organization_id = p_org AND p.sku = v_cand AND p.id IS DISTINCT FROM p_produto
  ORDER BY p.is_deleted, p.id LIMIT 1;
  IF v_outro IS NOT NULL THEN
    -- o id do outro só para quem edita produtos, e nunca o de um apagado
    RETURN jsonb_build_object('sku', v_cand, 'faltas', to_jsonb(v_faltas || 'duplicado'::text), 'outro_apagado', v_outro_apagado)
           || (CASE WHEN NOT v_outro_apagado AND public.fn_cat_pode(p_org, 'products.edit')
                    THEN jsonb_build_object('outro_produto', v_outro) ELSE '{}'::jsonb END);
  END IF;
  RETURN jsonb_build_object('sku', v_cand, 'faltas', to_jsonb(v_faltas));
END $$;
REVOKE ALL ON FUNCTION public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid) IS
  'Catálogo (20270118300000): mostra o SKU que um produto teria com esta categoria, subcategoria, modelo e atributos (formato de cat_guardar_produto_atributos): CAT-SUB-NNNN-…, NNNN = número do modelo. Sem categoria, subcategoria, sigla ou modelo (da subcategoria): sku null e faltas. Se o SKU já for de outro produto da organização (p_produto = o produto em edição, que não conta): faltas com "duplicado" e outro_apagado; outro_produto só para quem tem products.edit e só se o outro estiver vivo. Permissão products.edit ou services.view.';

-- A pré-visualização antiga (mesma assinatura, compatível): sem modelo o número não se sabe → sku null, falta 'modelo'.
CREATE OR REPLACE FUNCTION public.cat_prever_sku(p_org uuid, p_categoria uuid, p_subcategoria uuid, p_atributos jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- 20270118300000: delega em cat_prever_sku_modelo sem modelo (as mesmas validações e permissões)
  RETURN public.cat_prever_sku_modelo(p_org, p_categoria, p_subcategoria, NULL, p_atributos, NULL);
END $$;
REVOKE ALL ON FUNCTION public.cat_prever_sku(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_prever_sku(uuid,uuid,uuid,jsonb) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_prever_sku(uuid,uuid,uuid,jsonb) IS
  'Catálogo (20270118000000; desde 20270118300000 o NNNN é o número do modelo): versão sem modelo, mantida por compatibilidade — devolve sempre sku null com a falta "modelo" (e as outras faltas). Usar cat_prever_sku_modelo. Permissão products.edit ou services.view.';

-- ─── 10. Conferir ───────────────────────────────────────────────────────────────
DO $c$
DECLARE
  c_sp constant text := 'search_path=public, pg_temp';
  v_sig text; v_oid oid; p record; v_n bigint; v_a text[]; v_txt text;
BEGIN
  -- funções públicas: SECURITY DEFINER, search_path com pg_temp, authenticated sim, anon e PUBLIC não
  FOREACH v_sig IN ARRAY ARRAY['public.cat_ler_modelos_gestao(uuid)', 'public.cat_guardar_modelo(uuid,uuid,uuid,text,integer)',
                                'public.cat_estado_modelo(uuid,uuid,boolean)', 'public.cat_guardar_produto_modelo(uuid,uuid,uuid)',
                                'public.cat_gerar_sku_produto(uuid,uuid,boolean)',
                                'public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid)', 'public.cat_prever_sku(uuid,uuid,uuid,jsonb)'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'Conferir: falta a função %.', v_sig; END IF;
    SELECT pr.prosecdef, pr.proconfig, pr.proacl INTO p FROM pg_proc pr WHERE pr.oid = v_oid;
    IF NOT p.prosecdef THEN RAISE EXCEPTION 'Conferir: % não é SECURITY DEFINER.', v_sig; END IF;
    IF p.proconfig IS NULL OR NOT (c_sp = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'Conferir: % sem search_path = public, pg_temp.', v_sig;
    END IF;
    IF p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: % ainda dá EXECUTE a PUBLIC.', v_sig;
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'Conferir: anon pode executar %.', v_sig; END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'Conferir: authenticated não pode executar %.', v_sig; END IF;
  END LOOP;

  -- as duas recriadas são as desta migration; fn_cat_sku_partes ficou como estava
  IF position('20270118300000' IN (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_gerar_sku_produto(uuid,uuid,boolean)')::oid)) = 0
     OR position('20270118300000' IN (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_prever_sku(uuid,uuid,uuid,jsonb)')::oid)) = 0
     OR position('fn_cat_modelo_numero' IN (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_gerar_sku_produto(uuid,uuid,boolean)')::oid)) = 0
     OR position('fn_cat_sku_proximo' IN (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_gerar_sku_produto(uuid,uuid,boolean)')::oid)) > 0 THEN
    RAISE EXCEPTION 'Conferir: cat_gerar_sku_produto / cat_prever_sku não são os desta migration.';
  END IF;
  IF md5((SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)')::oid)) <> '35f20ab07322d3cace1c94a97c1289b9' THEN
    RAISE EXCEPTION 'Conferir: fn_cat_sku_partes mudou.';
  END IF;
  IF (SELECT pr.provolatile::text FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_prever_sku(uuid,uuid,uuid,jsonb)')::oid) <> 's'
     OR (SELECT pr.provolatile::text FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid)')::oid) <> 's'
     OR (SELECT pr.provolatile::text FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_ler_modelos_gestao(uuid)')::oid) <> 's' THEN
    RAISE EXCEPTION 'Conferir: as leituras não são STABLE.';
  END IF;

  -- internas e gatilhos: search_path com pg_temp; ninguém de fora as executa
  FOREACH v_sig IN ARRAY ARRAY['public.fn_cat_modelo_numero(uuid,uuid,uuid)', 'public.fn_cat_sku_juntar_faltas(jsonb,boolean)',
                                'public.fn_cat_modelo_valida_trg()', 'public.fn_cat_produto_modelo_trg()'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'Conferir: falta a função %.', v_sig; END IF;
    SELECT pr.proconfig, pr.proacl INTO p FROM pg_proc pr WHERE pr.oid = v_oid;
    IF p.proconfig IS NULL OR NOT (c_sp = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'Conferir: % sem search_path = public, pg_temp.', v_sig;
    END IF;
    IF p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE')
       OR has_function_privilege('anon', v_oid, 'EXECUTE') OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: % pode ser executada de fora.', v_sig;
    END IF;
  END LOOP;

  -- comportamento puro: a ordem das faltas
  v_a := public.fn_cat_sku_juntar_faltas('["sigla:cor", "subcategoria", "medida:m"]'::jsonb, true);
  IF v_a IS DISTINCT FROM ARRAY['subcategoria', 'modelo', 'sigla:cor', 'medida:m']::text[] THEN
    RAISE EXCEPTION 'Conferir: ordem das faltas errada (%).', v_a;
  END IF;

  -- tabela: RLS ligada, só a política de SELECT; authenticated só lê; anon nada
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.product_models'::regclass) THEN
    RAISE EXCEPTION 'Conferir: product_models sem RLS.';
  END IF;
  IF (SELECT count(*) FROM pg_policy pl WHERE pl.polrelid = 'public.product_models'::regclass) <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policy pl WHERE pl.polrelid = 'public.product_models'::regclass
                    AND pl.polname::text = 'product_models_select' AND pl.polcmd::text = 'r') THEN
    RAISE EXCEPTION 'Conferir: as políticas de product_models não são só a de SELECT.';
  END IF;
  -- nenhum privilégio de TABELA para authenticated/anon (o SELECT é por coluna)
  IF has_table_privilege('authenticated', 'public.product_models', 'SELECT')
     OR has_table_privilege('authenticated', 'public.product_models', 'INSERT')
     OR has_table_privilege('authenticated', 'public.product_models', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.product_models', 'DELETE')
     OR has_table_privilege('authenticated', 'public.product_models', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.product_models', 'SELECT')
     OR has_table_privilege('anon', 'public.product_models', 'INSERT') THEN
    RAISE EXCEPTION 'Conferir: product_models tem privilégios de tabela para authenticated ou anon.';
  END IF;
  -- SELECT por coluna: todas as colunas menos created_by, nem mais nem menos (uma coluna nova obriga a decidir aqui)
  SELECT string_agg(a.attname::text, ', ' ORDER BY a.attnum) INTO v_txt FROM pg_attribute a
  WHERE a.attrelid = 'public.product_models'::regclass AND a.attnum > 0 AND NOT a.attisdropped
    AND has_column_privilege('authenticated', 'public.product_models', a.attname::text, 'SELECT')
        IS DISTINCT FROM (a.attname::text <> 'created_by');
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: o SELECT por coluna de product_models diverge do esperado (todas menos created_by) em: %.', v_txt;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute a
             WHERE a.attrelid = 'public.product_models'::regclass AND a.attnum > 0 AND NOT a.attisdropped
               AND (has_column_privilege('anon', 'public.product_models', a.attname::text, 'SELECT')
                    OR has_column_privilege('authenticated', 'public.product_models', a.attname::text, 'UPDATE')
                    OR has_column_privilege('authenticated', 'public.product_models', a.attname::text, 'INSERT'))) THEN
    RAISE EXCEPTION 'Conferir: product_models tem privilégios por coluna além do SELECT de authenticated.';
  END IF;
  -- a política exige services.view ou products.edit
  IF position('fn_cat_pode' IN (SELECT pg_get_expr(pl.polqual, pl.polrelid) FROM pg_policy pl
                                WHERE pl.polrelid = 'public.product_models'::regclass AND pl.polname::text = 'product_models_select')) = 0 THEN
    RAISE EXCEPTION 'Conferir: a política de product_models não exige services.view / products.edit.';
  END IF;

  -- índices, FK e gatilhos (o do número é SEM predicado: conta os apagados)
  IF (SELECT count(*) FROM pg_index i WHERE i.indisunique AND i.indisvalid
        AND ((i.indexrelid = to_regclass('public.product_models_numero_key') AND i.indpred IS NULL)
          OR (i.indexrelid = to_regclass('public.product_models_nome_key') AND i.indpred IS NOT NULL))) <> 2 THEN
    RAISE EXCEPTION 'Conferir: faltam os índices únicos de product_models (o do número sem WHERE, o do nome só entre os vivos).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                 WHERE c.conrelid = 'public.products'::regclass AND c.conname::text = 'products_model_id_fkey'
                   AND c.contype::text = 'f' AND c.convalidated AND c.confdeltype::text = 'n'
                   AND c.confrelid = 'public.product_models'::regclass) THEN
    RAISE EXCEPTION 'Conferir: products_model_id_fkey não está validada com ON DELETE SET NULL.';
  END IF;
  IF to_regclass('public.idx_products_model') IS NULL THEN RAISE EXCEPTION 'Conferir: falta o índice em products(model_id).'; END IF;
  IF (SELECT count(*) FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgenabled::text = 'O'
        AND ((t.tgrelid = 'public.product_models'::regclass
              AND t.tgname::text IN ('trg_cat_modelo_valida', 'trg_audit_product_models', 'update_product_models_updated_at'))
          OR (t.tgrelid = 'public.products'::regclass AND t.tgname::text IN ('trg_products_modelo_ins', 'trg_products_modelo_upd')))) <> 5 THEN
    RAISE EXCEPTION 'Conferir: faltam gatilhos.';
  END IF;
  -- os de products correm depois de trg_cat_produto_tabelas (ordem alfabética dos BEFORE)
  IF NOT ('trg_cat_produto_tabelas' < 'trg_products_modelo_ins' COLLATE "C" AND 'trg_cat_produto_tabelas' < 'trg_products_modelo_upd' COLLATE "C") THEN
    RAISE EXCEPTION 'Conferir: os gatilhos do modelo não correm depois de trg_cat_produto_tabelas.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.products'::regclass AND t.tgname::text = 'trg_cat_produto_modelo') THEN
    RAISE EXCEPTION 'Conferir: ficou o gatilho antigo trg_cat_produto_modelo.';
  END IF;

  -- os tetos estão no corpo (âncoras)
  IF (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_guardar_modelo(uuid,uuid,uuid,text,integer)')::oid)
       NOT LIKE '%c_max_nome constant integer := 200;%c_max_numero constant integer := 9999;%c_max_modelos constant integer := 2000;%c_max_modelos_vivos constant integer := 10000;%c_max_salto constant integer := 100;%'
     OR (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_estado_modelo(uuid,uuid,boolean)')::oid)
       NOT LIKE '%c_max_modelos constant integer := 2000;%' THEN
    RAISE EXCEPTION 'Conferir: falta um dos tetos (200 caracteres, 9999, 2000 ativos, 10000 vivos, salto de 100).';
  END IF;
  -- sem advisory lock na geração; apanha só a unicidade do SKU
  IF position('pg_advisory_xact_lock' IN (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_gerar_sku_produto(uuid,uuid,boolean)')::oid)) > 0
     OR position('products_sku_organization_id_key' IN (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_gerar_sku_produto(uuid,uuid,boolean)')::oid)) = 0 THEN
    RAISE EXCEPTION 'Conferir: cat_gerar_sku_produto ainda tem o advisory lock, ou não restringe o unique_violation.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = 'public.products'::regclass
                 AND c.conname::text = 'products_sku_organization_id_key' AND c.contype::text = 'u') THEN
    RAISE EXCEPTION 'Conferir: products_sku_organization_id_key já não existe: o «duplicado» deixava de ser apanhado.';
  END IF;

  -- nenhum produto foi ligado por esta migration
  SELECT count(*) INTO v_n FROM products pr2 WHERE pr2.model_id IS NOT NULL;
  IF v_n > 0 AND NOT EXISTS (SELECT 1 FROM product_models) THEN
    RAISE EXCEPTION 'Conferir: % produtos com model_id sem modelos.', v_n;
  END IF;
  RAISE NOTICE 'catalogo_modelos_e_sku_por_modelo: tabela product_models (RLS só leitura, FK em products), 4 funções novas, cat_gerar_sku_produto e cat_prever_sku recriadas — conferidas.';
END $c$;

RESET lock_timeout;
