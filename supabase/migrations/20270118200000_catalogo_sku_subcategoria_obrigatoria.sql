-- =============================================================================
-- Catálogo — no SKU, a CATEGORIA e a SUBCATEGORIA são AMBAS OBRIGATÓRIAS.
-- Base de RH (uetjghdkwbywbftedtth).
-- =============================================================================
--
-- Decisão do utilizador (16/11): «categoria e subcategoria são ambas obrigatórias, e o número de 4 dígitos é por
-- (categoria, subcategoria)». Em 20270118000000 a subcategoria era opcional: sem ela, o SKU saía «CAT-0001-…» com o
-- número contado só pela categoria.
--
-- O que muda (só isto):
--   fn_cat_sku_partes(p_org, p_cat, p_sub, p_vals) — recriada com a MESMA assinatura; o corpo é o aplicado (md5
--   7267c8b55d1876437aed69d45be046ae, lido na RH a 16/11) com uma só diferença: p_sub NULL passa a dar a falta
--   'subcategoria' e a BLOQUEAR (prefixo NULL). O prefixo passa a ser sempre CAT-SUB, por isso o NNNN de
--   fn_cat_sku_proximo conta sempre por (organização, categoria, subcategoria).
--   Consequências, sem tocar nos corpos delas (nenhuma tem lógica própria para «sem subcategoria»: ambas só leem o
--   prefixo de fn_cat_sku_partes):
--     cat_gerar_sku_produto sem subcategoria → {sku: o atual, gerado: false, faltas: [..., "subcategoria"],
--       motivo: "faltas"}; o SKU do produto não é escrito (fica o provisório, o manual ou o gerado antes).
--     cat_prever_sku sem subcategoria → {sku: null, faltas: [..., "subcategoria"]}.
--   As faltas vêm pela ordem categoria/sigla_categoria, depois subcategoria; sem categoria nem subcategoria:
--   ["categoria", "subcategoria"].
--   Os comentários de cat_gerar_sku_produto e cat_prever_sku passam a dizê-lo (só COMMENT ON).
--   search_path, volatilidade (STABLE), SECURITY INVOKER e os acessos (sem EXECUTE para PUBLIC, anon e
--   authenticated) ficam como estavam: CREATE OR REPLACE mantém-nos, e o bloco de conferir confirma-os.
--   Os SKU dos produtos que já existem NÃO mudam (nenhuma linha de products é escrita aqui). Um produto já gerado
--   como «CAT-NNNN-…» (sem subcategoria) fica como está: ao ser gravado de novo não regenera (falta a
--   subcategoria), e o SKU antigo mantém-se até lhe darem uma subcategoria.
--
-- O ecrã: a falta 'subcategoria' já existia (subcategoria que não pertence à categoria); o texto que o ecrã lhe
-- dá (src/emylia/skuDados.ts) tem de passar a cobrir também «sem subcategoria» — fica fora desta migration.
--
-- ORDEM: depois de 20270118000000 (a guarda recusa se fn_cat_sku_partes não for a aplicada, ou já esta).
-- Testes: supabase/tests/catalogo_sku_subcategoria_obrigatoria.test.sql (passo 0 falha ANTES desta migration) e
-- supabase/tests/catalogo_siglas_e_sku.test.sql (atualizado: P3, P4, P5, pré-visualização e regenerar).
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente (a 16/11 também
-- 20270118100000_catalogo_fornecedor_produto, por aplicar na RH); listar com `supabase migration list --linked`
-- imediatamente antes.
-- =============================================================================

-- ─── 0. Guarda ──────────────────────────────────────────────────────────────────
DO $g$
DECLARE v_src text; v_txt text;
BEGIN
  IF to_regprocedure('public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)') IS NULL
     OR to_regprocedure('public.cat_gerar_sku_produto(uuid,uuid,boolean)') IS NULL
     OR to_regprocedure('public.cat_prever_sku(uuid,uuid,uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Faltam as funções do SKU: aplicar antes 20270118000000_catalogo_siglas_e_sku.sql.';
  END IF;
  -- nenhuma outra versão (outra assinatura)
  SELECT string_agg(p.proname::text || '(' || pg_get_function_identity_arguments(p.oid)::text || ')', ', ') INTO v_txt
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'fn_cat_sku_partes'
    AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_cat uuid, p_sub uuid, p_vals jsonb';
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe outra versão de fn_cat_sku_partes: %. Rever esta migration.', v_txt;
  END IF;
  -- o corpo tem de ser o aplicado em 20270118000000 (md5 lido na RH a 16/11), ou já este
  v_src := (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)')::oid);
  IF md5(v_src) <> '7267c8b55d1876437aed69d45be046ae' AND position('20270118200000' IN v_src) = 0 THEN
    RAISE EXCEPTION 'fn_cat_sku_partes não é a de 20270118000000 (md5 %): rever esta migration.', md5(v_src);
  END IF;
END $g$;

-- ─── 1. As partes do SKU: a subcategoria passa a obrigatória ────────────────────
-- prefixo CAT-SUB (NULL se faltar o que o bloqueia), resto (um segmento por atributo que entra, por sku_ordem) e faltas.
-- Faltas que bloqueiam: categoria, sigla_categoria, subcategoria (em falta ou de outro pai), sigla_subcategoria.
-- Informativas (o segmento fica de fora): sigla:<código do atributo>, medida:<código>.
CREATE OR REPLACE FUNCTION public.fn_cat_sku_partes(p_org uuid, p_cat uuid, p_sub uuid, p_vals jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_cat uuid := p_cat; v_ok boolean; v_pai uuid; v_cat_sigla text; v_sub_sigla text;
  v_faltas text[] := '{}'; v_bloqueia boolean := false; v_resto text; v_sem text[];
BEGIN
  IF v_cat IS NULL AND p_sub IS NOT NULL THEN
    SELECT pc.parent_id INTO v_cat FROM product_categories pc WHERE pc.id = p_sub;
  END IF;
  IF v_cat IS NULL THEN
    v_faltas := array_append(v_faltas, 'categoria'); v_bloqueia := true;
  ELSE
    SELECT true, pc.parent_id, pc.sigla INTO v_ok, v_pai, v_cat_sigla FROM product_categories pc
    WHERE pc.id = v_cat AND pc.deleted_at IS NULL AND (pc.organization_id = p_org OR pc.organization_id IS NULL);
    IF NOT coalesce(v_ok, false) OR v_pai IS NOT NULL THEN
      v_faltas := array_append(v_faltas, 'categoria'); v_bloqueia := true;
    ELSIF v_cat_sigla IS NULL THEN
      v_faltas := array_append(v_faltas, 'sigla_categoria'); v_bloqueia := true;
    END IF;
  END IF;

  -- a subcategoria é obrigatória (20270118200000): sem ela não há prefixo, e o NNNN conta por (categoria, subcategoria)
  IF p_sub IS NULL THEN
    v_faltas := array_append(v_faltas, 'subcategoria'); v_bloqueia := true;
  ELSE
    v_ok := NULL; v_pai := NULL;
    SELECT true, pc.parent_id, pc.sigla INTO v_ok, v_pai, v_sub_sigla FROM product_categories pc
    WHERE pc.id = p_sub AND pc.deleted_at IS NULL AND (pc.organization_id = p_org OR pc.organization_id IS NULL);
    IF NOT coalesce(v_ok, false) OR v_pai IS DISTINCT FROM v_cat THEN
      v_faltas := array_append(v_faltas, 'subcategoria'); v_bloqueia := true;
    ELSIF v_sub_sigla IS NULL THEN
      v_faltas := array_append(v_faltas, 'sigla_subcategoria'); v_bloqueia := true;
    END IF;
  END IF;

  -- um segmento por atributo que entra no SKU, pela ordem configurada
  WITH x AS (
    SELECT e.atributo, a.code::text AS codigo, a.is_measurement AS e_medida, a.sku_ordem,
           coalesce(a.sort_order, 0) AS ordem, a.label::text AS nome,
           (CASE WHEN a.is_measurement THEN public.fn_cat_sku_medida(e.medida) ELSE e.sigla END) AS seg
    FROM jsonb_to_recordset(coalesce(p_vals, '[]'::jsonb)) AS e(atributo uuid, sigla text, medida jsonb)
    JOIN product_attributes a ON a.id = e.atributo AND a.organization_id = p_org AND a.deleted_at IS NULL AND a.sku_entra
  )
  SELECT string_agg(x.seg, '-' ORDER BY x.sku_ordem NULLS LAST, x.ordem, x.nome, x.atributo) FILTER (WHERE x.seg IS NOT NULL),
         array_agg((CASE WHEN x.e_medida THEN 'medida:' ELSE 'sigla:' END) || x.codigo
                   ORDER BY x.sku_ordem NULLS LAST, x.ordem, x.nome, x.atributo) FILTER (WHERE x.seg IS NULL)
    INTO v_resto, v_sem
  FROM x;
  v_faltas := v_faltas || coalesce(v_sem, '{}'::text[]);

  RETURN jsonb_build_object(
    'prefixo', (CASE WHEN v_bloqueia THEN NULL ELSE concat_ws('-', v_cat_sigla, v_sub_sigla) END),
    'resto', nullif(v_resto, ''),
    'faltas', to_jsonb(v_faltas));
END $$;

-- ─── 2. Comentários das funções públicas (os corpos não mudam) ─────────────────
COMMENT ON FUNCTION public.cat_gerar_sku_produto(uuid,uuid,boolean) IS
  'Catálogo (20270118000000; subcategoria obrigatória em 20270118200000): gera o SKU de um produto a partir do que está gravado: CAT-SUB-NNNN-<um segmento por atributo que entra e que o produto tem, pela ordem de cat_guardar_sku_config: sigla da opção, medida 60X30 / 7P5X30X2MM>. NNNN = o seguinte por organização e (categoria, subcategoria). Substitui o provisório CAT-…, vazio, ou um SKU já gerado (sku_gerado; regenera mantendo o número se o prefixo for o mesmo); um SKU escrito à mão só com p_forcar, e passa a gerado. Sem categoria, sem subcategoria ou sem sigla: não gera e o SKU fica (gerado=false, faltas). Chamar como último passo ao gravar. Permissão products.edit.';
COMMENT ON FUNCTION public.cat_prever_sku(uuid,uuid,uuid,jsonb) IS
  'Catálogo (20270118000000; subcategoria obrigatória em 20270118200000): mostra o SKU que um produto teria com esta categoria, subcategoria e atributos (formato de cat_guardar_produto_atributos), pela ordem configurada, com o número seguinte de agora para o par (categoria, subcategoria), sem o reservar (confirma-se ao guardar). Sem categoria, sem subcategoria ou sem sigla: sku null e faltas. Permissão products.edit ou services.view.';

-- ─── 3. Conferir ────────────────────────────────────────────────────────────────
DO $c$
DECLARE
  c_sp constant text := 'search_path=public, pg_temp';
  v_oid oid := to_regprocedure('public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)')::oid;
  p record; r jsonb;
BEGIN
  IF v_oid IS NULL THEN RAISE EXCEPTION 'Conferir: falta fn_cat_sku_partes.'; END IF;
  SELECT pr.prosrc, pr.prosecdef, pr.provolatile::text AS vol, pr.proconfig, pr.proacl INTO p FROM pg_proc pr WHERE pr.oid = v_oid;
  IF md5(p.prosrc) <> '35f20ab07322d3cace1c94a97c1289b9' THEN
    RAISE EXCEPTION 'Conferir: o corpo de fn_cat_sku_partes não é o desta migration (md5 %).', md5(p.prosrc);
  END IF;
  IF p.prosecdef THEN RAISE EXCEPTION 'Conferir: fn_cat_sku_partes passou a SECURITY DEFINER.'; END IF;
  IF p.vol <> 's' THEN RAISE EXCEPTION 'Conferir: fn_cat_sku_partes deixou de ser STABLE.'; END IF;
  IF p.proconfig IS NULL OR NOT (c_sp = ANY (p.proconfig)) THEN
    RAISE EXCEPTION 'Conferir: fn_cat_sku_partes sem search_path = public, pg_temp.';
  END IF;
  IF p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE')
     OR has_function_privilege('anon', v_oid, 'EXECUTE') OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: fn_cat_sku_partes pode ser executada de fora.';
  END IF;
  -- comportamento: sem categoria nem subcategoria → não há prefixo e faltam as duas (organização inventada: não lê dados)
  r := public.fn_cat_sku_partes(gen_random_uuid(), NULL, NULL, '[]'::jsonb);
  IF r -> 'prefixo' IS DISTINCT FROM 'null'::jsonb OR r -> 'faltas' IS DISTINCT FROM '["categoria", "subcategoria"]'::jsonb THEN
    RAISE EXCEPTION 'Conferir: sem subcategoria ainda há prefixo, ou falta a falta «subcategoria» (%).', r;
  END IF;
  -- as duas funções públicas continuam com os mesmos acessos
  IF has_function_privilege('anon', to_regprocedure('public.cat_gerar_sku_produto(uuid,uuid,boolean)')::oid, 'EXECUTE')
     OR has_function_privilege('anon', to_regprocedure('public.cat_prever_sku(uuid,uuid,uuid,jsonb)')::oid, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', to_regprocedure('public.cat_gerar_sku_produto(uuid,uuid,boolean)')::oid, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', to_regprocedure('public.cat_prever_sku(uuid,uuid,uuid,jsonb)')::oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: mudaram os acessos de cat_gerar_sku_produto / cat_prever_sku.';
  END IF;
  RAISE NOTICE 'catalogo_sku_subcategoria_obrigatoria: fn_cat_sku_partes exige a subcategoria — conferida.';
END $c$;
