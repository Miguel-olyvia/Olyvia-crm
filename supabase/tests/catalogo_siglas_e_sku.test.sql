-- ============================================================
-- Testes: 20270118000000_catalogo_siglas_e_sku.sql (base RH)
-- ============================================================
-- ORDEM: correr ANTES do db push da 118000000 (falha no passo 0, «função cat_gerar_sku_produto não existe»);
-- depois do push termina com «OK: …» e a lista do que foi saltado. Qualquer falha rebenta com 'FALHOU: …'.
-- Desde 20270118200000 (subcategoria obrigatória no SKU) espera também essa migration: antes dela falha em P3.
-- Desde 20270118300000 (o NNNN é o número do MODELO) espera também essa: os produtos que geram SKU ligam-se a modelos
-- de teste com o número que cada prova espera (0001…0005 em S1, 0001 em S3, 0010 para a colisão), as faltas sem
-- modelo levam "modelo", a colisão passa a "duplicado" e a pré-visualização usa cat_prever_sku_modelo.
-- Antes dela falha na criação dos modelos (cat_guardar_modelo não existe).
--
-- Tudo dentro de BEGIN … ROLLBACK. Escritas só na nike (b6ffce4f-f630-4933-833a-008649757a33): categorias e
-- subcategorias de teste, 5 atributos de teste (nomes com um sufixo aleatório, para não colidirem com os que a nike
-- tenha) com opções, um grupo de opções GLOBAL e um atributo GLOBAL (organization_id nulo, para as recusas), 11
-- produtos de teste (pelas funções do Catálogo). Nenhuma outra organização é escrita nem lida. A BM24
-- (872abff2-043f-41e1-99dd-0a8e305ddecb) só aparece como p_org para provar a recusa CT001.
-- As siglas das categorias de teste são aleatórias (Q + 4 letras), conferidas como livres na nike; os SKU esperados
-- montam-se a partir delas. As posições no SKU comparam-se entre os atributos de teste (os da nike não contam).
-- Só falha na fixture o indispensável: os três membros com as permissões certas.
-- Sessões emprestadas (role authenticated, auth.uid() pelas claims), membros activos da nike, não system admin:
--   editor   products.edit e services.view, fora da BM24
--   sem      sem products.edit
--   reduzido sem services.view nem products.edit
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_siglas_e_sku.test.sql
-- Chamadas recusadas de propósito: cerca de 30 (ficam como erro no registo do Postgres).
--
-- O que PROVA:
--   1. fn_cat_sugerir_sigla (Azul → AZ, colisões AZL/AZU/AZ2, NULL nas usadas, várias palavras, artigos, vazio) e
--      fn_cat_sku_medida (60X30, 7P5X30X2MM, 60X30P5, 100000 aceite; 100001, 4 casas, 0, 3D sem espessura → NULL)
--   2. Preenchimento: nenhuma categoria/subcategoria/opção da nike sem sigla; únicas por âmbito
--   3. Gatilhos: a sigla ao criar categoria (colisão TSAB → TSABR) e opção (AZ, AZL, VR; e inserida diretamente);
--      sku_ordem do atributo novo = o seguinte; ordem inicial (cor < textura < brilho < medida < outro)
--   4. Siglas: guardar (minúsculas normalizadas), CT004 com o id no DETAIL (topo, sub, opção), a mesma sigla noutro pai
--      passa, CT002 (vazia, sinais, 7 letras, só algarismos na categoria, opção de grupo global), CT003, CT001
--   5. Leituras: "sigla" (3 leituras), "sku_ordem" e "sku_entra"
--   6. Gerar: formato completo na ordem inicial; 3D mm decimal; o NNNN é o do modelo (0001, 0002…); atributo em falta
--      omitido; sem subcategoria, categoria sem sigla e sem categoria → não gera (faltas "subcategoria" e "modelo";
--      o provisório fica); manual sem/com p_forcar (sku_gerado false → true);
--      provisório CAT- substituído; opção sem sigla → omitida com falta; colisão com um SKU escrito à mão →
--      "duplicado" (o SKU fica, outro_produto); app.audit_source reposto;
--      CT003 (inexistente, apagado), CT002 (consumível), CT001 (sem permissão, BM24)
--   7. Ordem: cat_guardar_sku_config (medida antes da cor, brilho desligado) → SKU na ordem nova; SKU já gerados não
--      mudam; recusas (vazia, incompleta, repetida, sem "entra", global, inexistente, sem permissão)
--   8. Regenerar: SKU gerado volta a ser gerado ao gravar (mantém o NNNN do mesmo modelo; sem sub → o modelo sai, não
--      regenera e o SKU anterior fica; outra categoria+sub com um modelo dela → o número desse modelo)
--   9. Pré-visualizar (cat_prever_sku_modelo): não grava; medida incompleta e 1e100000 omitidas com falta (resposta
--      curta); cat_prever_sku sem modelo → sku null e "modelo"; sem sigla / sem categoria / sem subcategoria → sku
--      null; sub de outro pai → CT002; perfil reduzido → CT001
--  10. GRANTs (anon e PUBLIC sem EXECUTE; internas sem authenticated) e search_path com pg_temp (fn_cat_exigir_uma incluída)
--
-- O que NÃO cobre: corridas entre duas sessões (advisory locks); um produto REAL de outra organização → CT003 (só ids
-- inventados); os tetos de 9999 e 20 tentativas; o preenchimento das outras organizações (a migration confere-o).
-- ============================================================

BEGIN;

-- ─── 0. A migration está aplicada? ───────────────────────────────────────────
DO $t$
BEGIN
  IF to_regprocedure('public.cat_gerar_sku_produto(uuid,uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION 'FALHOU: função cat_gerar_sku_produto não existe (aplicar 20270118000000_catalogo_siglas_e_sku.sql).';
  END IF;
  IF to_regprocedure('public.cat_guardar_modelo(uuid,uuid,uuid,text,integer)') IS NULL THEN
    RAISE EXCEPTION 'FALHOU: não há modelos (cat_guardar_modelo): aplicar 20270118300000_catalogo_modelos_e_sku_por_modelo.sql.';
  END IF;
END $t$;

-- ─── Fixtures (como postgres) ────────────────────────────────────────────────
DO $fx$
DECLARE
  c_org constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_bm24 constant uuid := '872abff2-043f-41e1-99dd-0a8e305ddecb';
  v_auth uuid; v_act uuid; v_sem uuid; v_red uuid; v_cons uuid; v_apag uuid; r record;
  v_suf text; v_sa text; v_sb text; v_sc text; v_i integer := 0; v_salt text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM anew_organizations WHERE id = c_org) THEN RAISE EXCEPTION 'FALHOU (fixture): a nike não existe nesta base'; END IF;
  PERFORM set_config('app.audit_source', 'teste:catalogo_siglas_e_sku', true);

  SELECT u.auth_user_id, u.id INTO v_auth, v_act
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'services.view', c_org)
    AND NOT public.is_system_admin_user(u.auth_user_id)
    AND NOT EXISTS (SELECT 1 FROM anew_memberships mb WHERE mb.user_id = u.id AND mb.organization_id = c_bm24 AND mb.status = 'active')
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU (fixture): sem membro activo da nike (não system admin, fora da BM24) com products.edit e services.view'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  IF public.fn_cat_pode(c_bm24, 'products.edit') THEN
    v_salt := v_salt || 'recusa BM24 (o editor tem products.edit lá); ';
    PERFORM set_config('teste.saltar_bm24', 'sim', true);
  END IF;

  FOR r IN SELECT u.auth_user_id
           FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
           WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
             AND NOT public.is_system_admin_user(u.auth_user_id)
           ORDER BY m.created_at, u.id LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r.auth_user_id, 'role', 'authenticated')::text, true);
    IF v_sem IS NULL AND NOT public.fn_cat_pode(c_org, 'products.edit') THEN v_sem := r.auth_user_id; END IF;
    IF v_red IS NULL AND NOT public.fn_cat_pode(c_org, 'services.view') AND NOT public.fn_cat_pode(c_org, 'products.edit') THEN
      v_red := r.auth_user_id;
    END IF;
    EXIT WHEN v_sem IS NOT NULL AND v_red IS NOT NULL;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_sem IS NULL THEN RAISE EXCEPTION 'FALHOU (fixture): sem membro activo da nike sem products.edit'; END IF;
  IF v_red IS NULL THEN RAISE EXCEPTION 'FALHOU (fixture): sem membro activo da nike sem services.view nem products.edit'; END IF;

  -- opcionais: sem eles, a recusa correspondente é saltada
  SELECT p.id INTO v_cons FROM products p
  WHERE p.organization_id = c_org AND p.tipo_catalogo = 'consumivel' AND NOT p.is_deleted ORDER BY p.created_at, p.id LIMIT 1;
  IF v_cons IS NULL THEN v_salt := v_salt || 'recusa do consumível (a nike não tem); '; END IF;
  SELECT p.id INTO v_apag FROM products p
  WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND p.is_deleted ORDER BY p.created_at, p.id LIMIT 1;
  IF v_apag IS NULL THEN v_salt := v_salt || 'recusa do produto apagado (a nike não tem); '; END IF;

  -- siglas de teste aleatórias (só letras), livres na nike, e prefixos sem SKU
  LOOP
    v_i := v_i + 1;
    v_suf := translate(upper(md5(random()::text || clock_timestamp()::text)), '0123456789', 'GHIJKLMNOP');
    v_sa := 'Q' || substr(v_suf, 1, 4); v_sb := 'Q' || substr(v_suf, 5, 4); v_sc := 'Q' || substr(v_suf, 9, 4);
    EXIT WHEN v_sa <> v_sc AND v_sa <> v_sb AND v_sb <> v_sc
      AND NOT EXISTS (SELECT 1 FROM product_categories c WHERE c.organization_id = c_org AND c.parent_id IS NULL
                      AND c.deleted_at IS NULL AND c.sigla IN (v_sa, v_sc))
      AND NOT EXISTS (SELECT 1 FROM products p WHERE p.organization_id = c_org AND (p.sku LIKE v_sa || '-%' OR p.sku LIKE v_sc || '-%'));
    IF v_i >= 20 THEN RAISE EXCEPTION 'FALHOU (fixture): sem siglas de teste livres ao fim de 20 tentativas'; END IF;
  END LOOP;
  -- o teste do gatilho TSAB/TSABR só se as duas estiverem livres no topo da nike
  IF EXISTS (SELECT 1 FROM product_categories c WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL
             AND (c.sigla IN ('TSAB', 'TSABR') OR c.name IN ('Teste Sigla Alfa Beta', 'Teste Sigla Alfa Bravo'))) THEN
    v_salt := v_salt || 'gatilho TSAB/TSABR (siglas ou nomes já usados na nike); ';
    PERFORM set_config('teste.saltar_tsab', 'sim', true);
  END IF;

  -- um atributo GLOBAL (para a recusa em cat_guardar_sku_config)
  INSERT INTO product_attributes (id, code, label, type, value_type, created_by, organization_id)
  VALUES ('2027a118-0000-4000-8000-000000000001', 'teste_global_sku_' || lower(substr(v_suf, 13, 6)), 'Teste Global SKU 2027',
          'select', 'list', v_act, NULL);

  PERFORM set_config('teste.org', c_org::text, true);
  PERFORM set_config('teste.bm24', c_bm24::text, true);
  PERFORM set_config('teste.cons', coalesce(v_cons::text, ''), true);
  PERFORM set_config('teste.apag', coalesce(v_apag::text, ''), true);
  PERFORM set_config('teste.act', v_act::text, true);
  PERFORM set_config('teste.suf', substr(v_suf, 13, 6), true);
  PERFORM set_config('teste.sa', v_sa, true);
  PERFORM set_config('teste.sb', v_sb, true);
  PERFORM set_config('teste.sc', v_sc, true);
  PERFORM set_config('teste.pre', v_sa || '-' || v_sb, true);
  PERFORM set_config('teste.ord0', coalesce((SELECT max(a.sku_ordem) FROM product_attributes a
                                             WHERE a.organization_id = c_org AND a.deleted_at IS NULL), 0)::text, true);
  PERFORM set_config('teste.saltados', v_salt, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.claims_sem', json_build_object('sub', v_sem, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.claims_red', json_build_object('sub', v_red, 'role', 'authenticated')::text, true);
END $fx$;

-- ─── 1. Sugestão e medida (funções puras, como postgres) ─────────────────────
DO $t$
DECLARE v text;
BEGIN
  v := public.fn_cat_sugerir_sigla('Azul', '{}');                                IF v IS DISTINCT FROM 'AZ' THEN RAISE EXCEPTION 'FALHOU: Azul → %', v; END IF;
  v := public.fn_cat_sugerir_sigla('Azul', ARRAY['AZ']);                         IF v IS DISTINCT FROM 'AZL' THEN RAISE EXCEPTION 'FALHOU: Azul com AZ → %', v; END IF;
  v := public.fn_cat_sugerir_sigla('azul', ARRAY['az', 'AZL']);                  IF v IS DISTINCT FROM 'AZU' THEN RAISE EXCEPTION 'FALHOU: Azul com az/AZL → %', v; END IF;
  v := public.fn_cat_sugerir_sigla('Azul', ARRAY['AZ', 'AZL', 'AZU', 'AZUL']);   IF v IS DISTINCT FROM 'AZ2' THEN RAISE EXCEPTION 'FALHOU: Azul tudo ocupado → %', v; END IF;
  v := public.fn_cat_sugerir_sigla('Azul', ARRAY[NULL, 'AZ']);                   IF v IS DISTINCT FROM 'AZL' THEN RAISE EXCEPTION 'FALHOU: NULL nas usadas → %', v; END IF;
  v := public.fn_cat_sugerir_sigla('Vermelho', NULL);                            IF v IS DISTINCT FROM 'VR' THEN RAISE EXCEPTION 'FALHOU: Vermelho → %', v; END IF;
  v := public.fn_cat_sugerir_sigla('Louças e torneiras', '{}');                  IF v IS DISTINCT FROM 'LT' THEN RAISE EXCEPTION 'FALHOU: Louças e torneiras → %', v; END IF;
  v := public.fn_cat_sugerir_sigla('Pedra & Mármore de Estremoz', '{}');         IF v IS DISTINCT FROM 'PME' THEN RAISE EXCEPTION 'FALHOU: Pedra & Mármore de Estremoz → %', v; END IF;
  v := public.fn_cat_sugerir_sigla('Lava-loiças e torneiras de cozinha e sala', '{}'); IF v IS DISTINCT FROM 'LLTC' THEN RAISE EXCEPTION 'FALHOU: 5 palavras → %', v; END IF;
  v := public.fn_cat_sugerir_sigla('Tipo de grelha', '{}');                      IF v IS DISTINCT FROM 'TG' THEN RAISE EXCEPTION 'FALHOU: Tipo de grelha → %', v; END IF;
  v := public.fn_cat_sugerir_sigla('Ação', '{}');                                IF v IS DISTINCT FROM 'AC' THEN RAISE EXCEPTION 'FALHOU: Ação → %', v; END IF;
  v := public.fn_cat_sugerir_sigla('de', '{}');                                  IF v IS DISTINCT FROM 'DE' THEN RAISE EXCEPTION 'FALHOU: só artigo → %', v; END IF;
  v := public.fn_cat_sugerir_sigla('', '{}');                                    IF v IS DISTINCT FROM 'X' THEN RAISE EXCEPTION 'FALHOU: vazio → %', v; END IF;
  v := public.fn_cat_sugerir_sigla(' —### ', '{}');                              IF v IS DISTINCT FROM 'X' THEN RAISE EXCEPTION 'FALHOU: só sinais → %', v; END IF;
  v := public.fn_cat_sugerir_sigla('60x60', '{}');                               IF v !~ '^[A-Z0-9]{1,6}$' THEN RAISE EXCEPTION 'FALHOU: 60x60 → %', v; END IF;
  v := public.fn_cat_sigla_categoria_livre('b6ffce4f-f630-4933-833a-008649757a33', gen_random_uuid(), '2024', NULL);
  IF v !~ '[A-Z]' OR v !~ '^[A-Z0-9]{1,6}$' THEN RAISE EXCEPTION 'FALHOU: categoria só de algarismos → %', v; END IF;

  v := public.fn_cat_sku_medida('{"tipo":"2D","largura":60,"comprimento":30,"unidade":"cm"}');
  IF v IS DISTINCT FROM '60X30' THEN RAISE EXCEPTION 'FALHOU: medida 2D cm → %', v; END IF;
  v := public.fn_cat_sku_medida('{"tipo":"3D","largura":7.5,"comprimento":30,"espessura":2,"unidade":"mm"}');
  IF v IS DISTINCT FROM '7P5X30X2MM' THEN RAISE EXCEPTION 'FALHOU: medida 3D mm → %', v; END IF;
  v := public.fn_cat_sku_medida('{"tipo":"2D","largura":60.0,"comprimento":30.50}');
  IF v IS DISTINCT FROM '60X30P5' THEN RAISE EXCEPTION 'FALHOU: medida sem zeros → %', v; END IF;
  v := public.fn_cat_sku_medida('{"tipo":"2D","largura":100000,"comprimento":0.125}');
  IF v IS DISTINCT FROM '100000X0P125' THEN RAISE EXCEPTION 'FALHOU: medida nos limites → %', v; END IF;
  IF public.fn_cat_sku_medida('{"tipo":"2D","largura":60}') IS NOT NULL
     OR public.fn_cat_sku_medida('{"tipo":"2D","largura":100001,"comprimento":30}') IS NOT NULL
     OR public.fn_cat_sku_medida('{"tipo":"2D","largura":7.1234,"comprimento":30}') IS NOT NULL
     OR public.fn_cat_sku_medida('{"tipo":"2D","largura":0,"comprimento":30}') IS NOT NULL
     OR public.fn_cat_sku_medida('{"tipo":"2D","largura":-5,"comprimento":30}') IS NOT NULL
     OR public.fn_cat_sku_medida('{"tipo":"3D","largura":60,"comprimento":30}') IS NOT NULL
     OR public.fn_cat_sku_medida('{"tipo":"4D","largura":60,"comprimento":30}') IS NOT NULL
     OR public.fn_cat_sku_medida('{"tipo":"2D","largura":"60","comprimento":30}') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: uma medida inválida deu segmento';
  END IF;
END $t$;

-- ─── 2. Preenchimento (nike) ─────────────────────────────────────────────────
DO $t$
DECLARE v_org uuid := current_setting('teste.org')::uuid; v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM product_categories WHERE organization_id = v_org AND sigla IS NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: % categorias da nike sem sigla', v_n; END IF;
  SELECT count(*) INTO v_n FROM attribute_option_group_values o JOIN attribute_option_groups g ON g.id = o.group_id
  WHERE g.organization_id = v_org AND o.sigla IS NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: % opções da nike sem sigla', v_n; END IF;
  SELECT count(*) INTO v_n FROM (SELECT 1 FROM product_categories WHERE organization_id = v_org AND deleted_at IS NULL
                                 GROUP BY parent_id, sigla HAVING count(*) > 1) d;
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: % siglas repetidas no mesmo âmbito na nike', v_n; END IF;
  SELECT count(*) INTO v_n FROM product_attributes WHERE organization_id = v_org AND deleted_at IS NULL AND sku_ordem IS NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: % atributos da nike sem posição no SKU', v_n; END IF;
END $t$;

-- ─── 3 e 4. Categorias: gatilho e siglas ─────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; v_det text; v_msg text; v_org uuid := current_setting('teste.org')::uuid;
  v_sa text := current_setting('teste.sa'); v_sb text := current_setting('teste.sb'); v_sc text := current_setting('teste.sc');
  v_a uuid; v_b uuid; v_t1 uuid; v_s1 uuid; v_t2 uuid; v_t3 uuid; v_s2 uuid; v_s3 uuid; v_suf text := current_setting('teste.suf');
BEGIN
  IF current_setting('teste.saltar_tsab', true) IS DISTINCT FROM 'sim' THEN
    v_a := (public.cat_guardar_categoria_produto(v_org, NULL, NULL, 'Teste Sigla Alfa Beta') -> 'categoria' ->> 'id')::uuid;
    v_b := (public.cat_guardar_categoria_produto(v_org, NULL, NULL, 'Teste Sigla Alfa Bravo') -> 'categoria' ->> 'id')::uuid;
  END IF;
  v_t1 := (public.cat_guardar_categoria_produto(v_org, NULL, NULL, 'Topo SKU T' || v_suf) -> 'categoria' ->> 'id')::uuid;
  v_s1 := (public.cat_guardar_categoria_produto(v_org, NULL, v_t1, 'Sub SKU T' || v_suf) -> 'categoria' ->> 'id')::uuid;
  v_s2 := (public.cat_guardar_categoria_produto(v_org, NULL, v_t1, 'Sub Dois T' || v_suf) -> 'categoria' ->> 'id')::uuid;
  v_t2 := (public.cat_guardar_categoria_produto(v_org, NULL, NULL, 'Topo Sem Sub T' || v_suf) -> 'categoria' ->> 'id')::uuid;
  v_s3 := (public.cat_guardar_categoria_produto(v_org, NULL, v_t2, 'Sub Tres T' || v_suf) -> 'categoria' ->> 'id')::uuid;
  v_t3 := (public.cat_guardar_categoria_produto(v_org, NULL, NULL, 'Topo Sem Sigla T' || v_suf) -> 'categoria' ->> 'id')::uuid;

  -- guardar: minúsculas e espaços normalizados
  r := public.cat_guardar_sigla_categoria(v_org, v_t1, ' ' || lower(v_sa) || ' ') -> 'categoria';
  IF r ->> 'sigla' IS DISTINCT FROM v_sa OR (r ->> 'id')::uuid IS DISTINCT FROM v_t1 THEN RAISE EXCEPTION 'FALHOU: guardar sigla → %', r; END IF;
  PERFORM public.cat_guardar_sigla_categoria(v_org, v_s1, v_sb);
  PERFORM public.cat_guardar_sigla_categoria(v_org, v_t2, v_sc);
  -- a mesma sigla noutro pai passa
  PERFORM public.cat_guardar_sigla_categoria(v_org, v_s3, v_sb);

  BEGIN
    PERFORM public.cat_guardar_sigla_categoria(v_org, v_t1, v_sc);
    RAISE EXCEPTION 'FALHOU: sigla de topo repetida aceite';
  EXCEPTION WHEN SQLSTATE 'CT004' THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL, v_msg = MESSAGE_TEXT;
    IF v_det IS DISTINCT FROM v_t2::text OR v_msg IS DISTINCT FROM 'Já existe uma categoria com esta sigla.' THEN
      RAISE EXCEPTION 'FALHOU: CT004 topo — % / %', v_msg, v_det;
    END IF;
  END;
  BEGIN
    PERFORM public.cat_guardar_sigla_categoria(v_org, v_s2, lower(v_sb));
    RAISE EXCEPTION 'FALHOU: sigla de sub repetida aceite';
  EXCEPTION WHEN SQLSTATE 'CT004' THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
    IF v_det IS DISTINCT FROM v_s1::text THEN RAISE EXCEPTION 'FALHOU: CT004 sub — DETAIL %', v_det; END IF;
  END;
  BEGIN PERFORM public.cat_guardar_sigla_categoria(v_org, v_s2, '   '); RAISE EXCEPTION 'FALHOU: sigla vazia aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'Escreva a sigla.' THEN RAISE EXCEPTION 'FALHOU: vazia — %', v_msg; END IF; END;
  BEGIN PERFORM public.cat_guardar_sigla_categoria(v_org, v_s2, 'AB-1'); RAISE EXCEPTION 'FALHOU: sigla com sinal aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_guardar_sigla_categoria(v_org, v_s2, 'ABCDEFG'); RAISE EXCEPTION 'FALHOU: sigla de 7 aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_guardar_sigla_categoria(v_org, v_s2, '1234'); RAISE EXCEPTION 'FALHOU: sigla só de algarismos aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'A sigla de uma categoria tem de ter pelo menos uma letra.' THEN RAISE EXCEPTION 'FALHOU: algarismos — %', v_msg; END IF; END;
  BEGIN PERFORM public.cat_guardar_sigla_categoria(v_org, gen_random_uuid(), 'ZZ'); RAISE EXCEPTION 'FALHOU: categoria inexistente aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL; END;

  -- 20270118300000: os modelos de teste, com o número que cada prova espera
  PERFORM set_config('teste.m1', public.cat_guardar_modelo(v_org, NULL, v_s1, 'Mod Um T' || v_suf, 1) #>> '{modelo,id}', true);
  PERFORM set_config('teste.m2', public.cat_guardar_modelo(v_org, NULL, v_s1, 'Mod Dois T' || v_suf, 2) #>> '{modelo,id}', true);
  PERFORM set_config('teste.m3', public.cat_guardar_modelo(v_org, NULL, v_s1, 'Mod Tres T' || v_suf, 3) #>> '{modelo,id}', true);
  PERFORM set_config('teste.m4', public.cat_guardar_modelo(v_org, NULL, v_s1, 'Mod Quatro T' || v_suf, 4) #>> '{modelo,id}', true);
  PERFORM set_config('teste.m5', public.cat_guardar_modelo(v_org, NULL, v_s1, 'Mod Cinco T' || v_suf, 5) #>> '{modelo,id}', true);
  PERFORM set_config('teste.m10', public.cat_guardar_modelo(v_org, NULL, v_s1, 'Mod Dez T' || v_suf, 10) #>> '{modelo,id}', true);
  PERFORM set_config('teste.m31', public.cat_guardar_modelo(v_org, NULL, v_s3, 'Mod S3 T' || v_suf, 1) #>> '{modelo,id}', true);

  PERFORM set_config('teste.a', coalesce(v_a::text, ''), true); PERFORM set_config('teste.b', coalesce(v_b::text, ''), true);
  PERFORM set_config('teste.t1', v_t1::text, true); PERFORM set_config('teste.s1', v_s1::text, true);
  PERFORM set_config('teste.t2', v_t2::text, true); PERFORM set_config('teste.s3', v_s3::text, true);
  PERFORM set_config('teste.t3', v_t3::text, true);
  PERFORM set_config('teste.n_t1', 'Topo SKU T' || v_suf, true); PERFORM set_config('teste.n_s1', 'Sub SKU T' || v_suf, true);
  PERFORM set_config('teste.n_t2', 'Topo Sem Sub T' || v_suf, true); PERFORM set_config('teste.n_t3', 'Topo Sem Sigla T' || v_suf, true);
  PERFORM set_config('teste.n_s3', 'Sub Tres T' || v_suf, true);
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims_sem'), true);
DO $t$
BEGIN
  BEGIN PERFORM public.cat_guardar_sigla_categoria(current_setting('teste.org')::uuid, current_setting('teste.t1')::uuid, 'ZZ');
    RAISE EXCEPTION 'FALHOU: sigla de categoria sem products.edit aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL; END;
END $t$;
RESET ROLE;

-- o gatilho deu as siglas esperadas; a categoria sem sigla fica sem ela (para a geração)
DO $t$
DECLARE v text; v2 text;
BEGIN
  IF current_setting('teste.a') <> '' THEN
    SELECT sigla INTO v FROM product_categories WHERE id = current_setting('teste.a')::uuid;
    SELECT sigla INTO v2 FROM product_categories WHERE id = current_setting('teste.b')::uuid;
    IF v IS DISTINCT FROM 'TSAB' OR v2 IS DISTINCT FROM 'TSABR' THEN RAISE EXCEPTION 'FALHOU: gatilho das categorias → % / %', v, v2; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM product_categories WHERE id = current_setting('teste.t3')::uuid AND (sigla IS NULL OR sigla !~ '^[A-Z0-9]{1,6}$')) THEN
    RAISE EXCEPTION 'FALHOU: o gatilho não deu sigla à categoria criada';
  END IF;
  UPDATE product_categories SET sigla = NULL WHERE id = current_setting('teste.t3')::uuid;
END $t$;

-- ─── 3 e 4. Atributos de teste, opções e siglas ──────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE v_org uuid := current_setting('teste.org')::uuid; v_suf text := current_setting('teste.suf');
  v_acab uuid; v_text uuid; v_cor uuid; v_med uuid; v_bri uuid;
BEGIN
  -- ordem de criação diferente da ordem inicial, para a prova da ordem ter sentido
  v_acab := (public.cat_guardar_atributo(v_org, NULL, 'Acabamento T' || v_suf, 'lista', false) -> 'atributo' ->> 'id')::uuid;
  v_text := (public.cat_guardar_atributo(v_org, NULL, 'Textura T' || v_suf, 'lista', false) -> 'atributo' ->> 'id')::uuid;
  v_cor := (public.cat_guardar_atributo(v_org, NULL, 'Cor T' || v_suf, 'lista', true) -> 'atributo' ->> 'id')::uuid;
  v_med := (public.cat_guardar_atributo(v_org, NULL, 'Medida T' || v_suf, 'medida', false) -> 'atributo' ->> 'id')::uuid;
  v_bri := (public.cat_guardar_atributo(v_org, NULL, 'Brilho T' || v_suf, 'lista', false) -> 'atributo' ->> 'id')::uuid;

  PERFORM set_config('teste.o_azul', (public.cat_guardar_opcao(v_org, v_cor, 'Azul', '#0000FF') -> 'opcao' ->> 'id'), true);
  PERFORM set_config('teste.o_azulado', (public.cat_guardar_opcao(v_org, v_cor, 'Azulado', '#0000AA') -> 'opcao' ->> 'id'), true);
  PERFORM set_config('teste.o_verm', (public.cat_guardar_opcao(v_org, v_cor, 'Vermelho', '#FF0000') -> 'opcao' ->> 'id'), true);
  PERFORM set_config('teste.o_rug', (public.cat_guardar_opcao(v_org, v_text, 'Rugosa', NULL) -> 'opcao' ->> 'id'), true);
  PERFORM set_config('teste.o_mate', (public.cat_guardar_opcao(v_org, v_acab, 'Mate', NULL) -> 'opcao' ->> 'id'), true);
  PERFORM set_config('teste.o_alto', (public.cat_guardar_opcao(v_org, v_bri, 'Alto', NULL) -> 'opcao' ->> 'id'), true);

  PERFORM set_config('teste.acab', v_acab::text, true); PERFORM set_config('teste.text', v_text::text, true);
  PERFORM set_config('teste.cor', v_cor::text, true);   PERFORM set_config('teste.med', v_med::text, true);
  PERFORM set_config('teste.bri', v_bri::text, true);
END $t$;
RESET ROLE;

-- gatilhos (siglas das opções, sku_ordem seguinte); a ordem inicial; um grupo GLOBAL com uma opção
DO $t$
DECLARE
  v_org uuid := current_setting('teste.org')::uuid; v_ord0 integer := current_setting('teste.ord0')::integer;
  v_cor uuid := current_setting('teste.cor')::uuid; v_text uuid := current_setting('teste.text')::uuid;
  v_med uuid := current_setting('teste.med')::uuid; v_bri uuid := current_setting('teste.bri')::uuid;
  v_acab uuid := current_setting('teste.acab')::uuid;
  v text; v_n integer; v_grupo uuid; o_cor integer; o_text integer; o_bri integer; o_med integer; o_acab integer;
BEGIN
  SELECT string_agg(o.sigla, ',' ORDER BY o.sort_order) INTO v FROM attribute_option_group_values o
  WHERE o.id IN (current_setting('teste.o_azul')::uuid, current_setting('teste.o_azulado')::uuid, current_setting('teste.o_verm')::uuid);
  IF v IS DISTINCT FROM 'AZ,AZL,VR' THEN RAISE EXCEPTION 'FALHOU: gatilho das opções → %', v; END IF;

  -- atributos novos: o seguinte, pela ordem de criação
  SELECT sku_ordem INTO o_acab FROM product_attributes WHERE id = v_acab;
  SELECT sku_ordem INTO o_text FROM product_attributes WHERE id = v_text;
  SELECT sku_ordem INTO o_cor FROM product_attributes WHERE id = v_cor;
  SELECT sku_ordem INTO o_med FROM product_attributes WHERE id = v_med;
  SELECT sku_ordem INTO o_bri FROM product_attributes WHERE id = v_bri;
  IF (o_acab, o_text, o_cor, o_med, o_bri) IS DISTINCT FROM (v_ord0 + 1, v_ord0 + 2, v_ord0 + 3, v_ord0 + 4, v_ord0 + 5) THEN
    RAISE EXCEPTION 'FALHOU: sku_ordem dos atributos novos (esperado o seguinte a %) → %,%,%,%,%', v_ord0, o_acab, o_text, o_cor, o_med, o_bri;
  END IF;
  IF EXISTS (SELECT 1 FROM product_attributes WHERE id IN (v_acab, v_text, v_cor, v_med, v_bri) AND NOT sku_entra) THEN
    RAISE EXCEPTION 'FALHOU: sku_entra não é true por omissão';
  END IF;

  -- a ordem inicial: só se os códigos cor, textura, brilho e medida estiverem livres na nike (dão-se aos atributos de teste)
  IF NOT EXISTS (SELECT 1 FROM product_attributes a WHERE a.organization_id = v_org AND a.code IN ('cor', 'textura', 'brilho', 'medida')) THEN
    UPDATE product_attributes SET code = 'cor' WHERE id = v_cor;
    UPDATE product_attributes SET code = 'textura' WHERE id = v_text;
    UPDATE product_attributes SET code = 'brilho' WHERE id = v_bri;
    UPDATE product_attributes SET code = 'medida' WHERE id = v_med;
    UPDATE product_attributes SET sku_ordem = NULL WHERE id IN (v_acab, v_text, v_cor, v_med, v_bri);
    v_n := public.fn_cat_sku_ordem_inicial(v_org);
    IF v_n <> 5 THEN RAISE EXCEPTION 'FALHOU: ordem inicial preencheu % (esperado 5)', v_n; END IF;
  ELSE
    PERFORM set_config('teste.saltados', current_setting('teste.saltados') || 'ordem inicial (a nike já usa os códigos cor/textura/brilho/medida; posta à mão); ', true);
    UPDATE product_attributes SET sku_ordem = v_ord0 + 1 WHERE id = v_cor;
    UPDATE product_attributes SET sku_ordem = v_ord0 + 2 WHERE id = v_text;
    UPDATE product_attributes SET sku_ordem = v_ord0 + 3 WHERE id = v_bri;
    UPDATE product_attributes SET sku_ordem = v_ord0 + 4 WHERE id = v_med;
    UPDATE product_attributes SET sku_ordem = v_ord0 + 5 WHERE id = v_acab;
  END IF;
  SELECT sku_ordem INTO o_acab FROM product_attributes WHERE id = v_acab;
  SELECT sku_ordem INTO o_text FROM product_attributes WHERE id = v_text;
  SELECT sku_ordem INTO o_cor FROM product_attributes WHERE id = v_cor;
  SELECT sku_ordem INTO o_med FROM product_attributes WHERE id = v_med;
  SELECT sku_ordem INTO o_bri FROM product_attributes WHERE id = v_bri;
  IF NOT (o_cor < o_text AND o_text < o_bri AND o_bri < o_med AND o_med < o_acab) THEN
    RAISE EXCEPTION 'FALHOU: ordem inicial (cor < textura < brilho < medida < outro) → %,%,%,%,%', o_cor, o_text, o_bri, o_med, o_acab;
  END IF;
  PERFORM set_config('teste.cod_acab', (SELECT code::text FROM product_attributes WHERE id = v_acab), true);
  PERFORM set_config('teste.cod_med', (SELECT code::text FROM product_attributes WHERE id = v_med), true);

  INSERT INTO attribute_option_groups (attribute_id, organization_id, name, sort_order, is_active, created_by)
  VALUES (v_bri, NULL, 'Teste Global Brilho 2027', 99, true, current_setting('teste.act')::uuid)
  RETURNING id INTO v_grupo;
  INSERT INTO attribute_option_group_values (group_id, value_text, display_name, sort_order, is_active)
  VALUES (v_grupo, 'Global Teste 2027', 'Global Teste 2027', 1, true);
  PERFORM set_config('teste.o_global', (SELECT o.id::text FROM attribute_option_group_values o WHERE o.group_id = v_grupo), true);
  IF (SELECT o.sigla FROM attribute_option_group_values o WHERE o.group_id = v_grupo) IS NULL THEN
    RAISE EXCEPTION 'FALHOU: o gatilho não deu sigla à opção inserida diretamente';
  END IF;
END $t$;

SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; v_det text; v_msg text; v_org uuid := current_setting('teste.org')::uuid; v_x jsonb;
BEGIN
  r := public.cat_guardar_sigla_opcao(v_org, current_setting('teste.o_verm')::uuid, 'vm') -> 'opcao';
  IF r ->> 'sigla' IS DISTINCT FROM 'VM' OR r ->> 'valor' IS DISTINCT FROM 'Vermelho' THEN RAISE EXCEPTION 'FALHOU: sigla VM → %', r; END IF;
  PERFORM public.cat_guardar_sigla_opcao(v_org, current_setting('teste.o_rug')::uuid, 'RUG');
  BEGIN
    PERFORM public.cat_guardar_sigla_opcao(v_org, current_setting('teste.o_azulado')::uuid, 'AZ');
    RAISE EXCEPTION 'FALHOU: sigla de opção repetida aceite';
  EXCEPTION WHEN SQLSTATE 'CT004' THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
    IF v_det IS DISTINCT FROM current_setting('teste.o_azul') THEN RAISE EXCEPTION 'FALHOU: CT004 opção — DETAIL %', v_det; END IF;
  END;
  BEGIN PERFORM public.cat_guardar_sigla_opcao(v_org, current_setting('teste.o_rug')::uuid, ''); RAISE EXCEPTION 'FALHOU: sigla de opção vazia aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_guardar_sigla_opcao(v_org, current_setting('teste.o_global')::uuid, 'GL'); RAISE EXCEPTION 'FALHOU: opção global aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'Opção partilhada: não se pode alterar aqui.' THEN RAISE EXCEPTION 'FALHOU: opção global — %', v_msg; END IF; END;
  BEGIN PERFORM public.cat_guardar_sigla_opcao(v_org, gen_random_uuid(), 'ZZ'); RAISE EXCEPTION 'FALHOU: opção inexistente aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL; END;

  -- ─── 5. Leituras ───
  r := public.cat_ler_categorias_gestao(v_org);
  SELECT c INTO v_x FROM jsonb_array_elements(r -> 'categorias') c WHERE c ->> 'id' = current_setting('teste.t1');
  IF v_x ->> 'sigla' IS DISTINCT FROM current_setting('teste.sa')
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_x -> 'subcategorias') s
                    WHERE s ->> 'id' = current_setting('teste.s1') AND s ->> 'sigla' = current_setting('teste.sb')) THEN
    RAISE EXCEPTION 'FALHOU: cat_ler_categorias_gestao sem "sigla" → %', v_x;
  END IF;
  r := public.cat_ler_atributos_gestao(v_org);
  SELECT a INTO v_x FROM jsonb_array_elements(r -> 'atributos') a WHERE a ->> 'id' = current_setting('teste.cor');
  IF jsonb_typeof(v_x -> 'sku_ordem') IS DISTINCT FROM 'number' OR (v_x -> 'sku_entra') IS DISTINCT FROM 'true'::jsonb
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_x -> 'opcoes') o WHERE o ->> 'id' = current_setting('teste.o_verm') AND o ->> 'sigla' = 'VM') THEN
    RAISE EXCEPTION 'FALHOU: cat_ler_atributos_gestao sem sku_ordem/sku_entra/sigla → %', v_x;
  END IF;
  r := public.cat_ler_atributos(v_org);
  SELECT a INTO v_x FROM jsonb_array_elements(r -> 'atributos') a WHERE a ->> 'id' = current_setting('teste.cor');
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_x -> 'opcoes') o WHERE o ->> 'id' = current_setting('teste.o_azul') AND o ->> 'sigla' = 'AZ') THEN
    RAISE EXCEPTION 'FALHOU: cat_ler_atributos sem "sigla" → %', v_x;
  END IF;
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims_sem'), true);
DO $t$
BEGIN
  BEGIN PERFORM public.cat_guardar_sigla_opcao(current_setting('teste.org')::uuid, current_setting('teste.o_azul')::uuid, 'ZZ');
    RAISE EXCEPTION 'FALHOU: sigla de opção sem products.edit aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL; END;
END $t$;
RESET ROLE;

-- ─── 6. Gerar o SKU ──────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  v_org uuid := current_setting('teste.org')::uuid; v_pre text := current_setting('teste.pre'); v_sc text := current_setting('teste.sc');
  v_cor text := current_setting('teste.cor'); v_text text := current_setting('teste.text'); v_acab text := current_setting('teste.acab');
  v_med text := current_setting('teste.med');
  v_azul text := current_setting('teste.o_azul'); v_verm text := current_setting('teste.o_verm');
  v_rug text := current_setting('teste.o_rug'); v_mate text := current_setting('teste.o_mate');
  v_t1 text := current_setting('teste.n_t1'); v_s1 text := current_setting('teste.n_s1');
  v_p uuid; r jsonb;
BEGIN
  -- P1: provisório CAT-; categoria + sub, cor, textura, medida e outro atributo, na ordem inicial
  v_p := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste SKU P1 2027', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p, NULL, NULL, v_t1, v_s1);
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p, jsonb_build_array(
    jsonb_build_object('atributo', v_acab, 'opcao', v_mate), jsonb_build_object('atributo', v_cor, 'opcao', v_azul),
    jsonb_build_object('atributo', v_med, 'medida', jsonb_build_object('tipo', '2D', 'largura', 60, 'comprimento', 30, 'unidade', 'cm')),
    jsonb_build_object('atributo', v_text, 'opcao', v_rug)));
  PERFORM public.cat_guardar_produto_modelo(v_org, v_p, current_setting('teste.m1')::uuid);
  r := public.cat_gerar_sku_produto(v_org, v_p);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-AZ-RUG-60X30-MT' OR (r -> 'gerado') IS DISTINCT FROM 'true'::jsonb
     OR r -> 'faltas' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: P1 → %', r;
  END IF;
  IF current_setting('app.audit_source', true) IS DISTINCT FROM 'teste:catalogo_siglas_e_sku' THEN
    RAISE EXCEPTION 'FALHOU: app.audit_source não foi reposto (ficou %)', current_setting('app.audit_source', true);
  END IF;
  PERFORM set_config('teste.p1', v_p::text, true);

  -- P2: modelo 0002; 3D em mm com decimal; sem textura nem acabamento (omitidos)
  v_p := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste SKU P2 2027', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p, NULL, NULL, v_t1, v_s1);
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p, jsonb_build_array(
    jsonb_build_object('atributo', v_cor, 'opcao', v_verm),
    jsonb_build_object('atributo', v_med, 'medida', jsonb_build_object('tipo', '3D', 'largura', 7.5, 'comprimento', 30, 'espessura', 2, 'unidade', 'mm'))));
  PERFORM public.cat_guardar_produto_modelo(v_org, v_p, current_setting('teste.m2')::uuid);
  r := public.cat_gerar_sku_produto(v_org, v_p);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0002-VM-7P5X30X2MM' THEN RAISE EXCEPTION 'FALHOU: P2 → %', r; END IF;
  PERFORM set_config('teste.p2', v_p::text, true);

  -- P3: sem subcategoria (20270118200000: obrigatória; logo sem modelo) → não gera, faltas "subcategoria" e "modelo",
  -- e o SKU provisório fica
  v_p := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste SKU P3 2027', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p, NULL, NULL, current_setting('teste.n_t2'), NULL);
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p, jsonb_build_array(jsonb_build_object('atributo', v_cor, 'opcao', v_azul)));
  r := public.cat_gerar_sku_produto(v_org, v_p);
  IF (r -> 'gerado') IS DISTINCT FROM 'false'::jsonb OR r -> 'faltas' IS DISTINCT FROM '["subcategoria", "modelo"]'::jsonb
     OR r ->> 'motivo' IS DISTINCT FROM 'faltas' OR r ->> 'sku' !~ '^CAT-[0-9A-F]{10}$'
     OR r ->> 'sku' IS DISTINCT FROM (SELECT p.sku FROM products p WHERE p.id = v_p) THEN
    RAISE EXCEPTION 'FALHOU: P3 (sem sub: não devia gerar) → %', r;
  END IF;

  -- P4: categoria sem sigla (e sem sub) → não gera e o SKU fica
  v_p := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste SKU P4 2027', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p, NULL, NULL, current_setting('teste.n_t3'), NULL);
  r := public.cat_gerar_sku_produto(v_org, v_p);
  IF (r -> 'gerado') IS DISTINCT FROM 'false'::jsonb OR r -> 'faltas' IS DISTINCT FROM '["sigla_categoria", "subcategoria", "modelo"]'::jsonb
     OR r ->> 'motivo' IS DISTINCT FROM 'faltas' OR r ->> 'sku' !~ '^CAT-[0-9A-F]{10}$' THEN
    RAISE EXCEPTION 'FALHOU: P4 (categoria sem sigla) → %', r;
  END IF;

  -- P5: sem categoria nem sub → não gera
  v_p := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste SKU P5 2027', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  r := public.cat_gerar_sku_produto(v_org, v_p);
  IF (r -> 'gerado') IS DISTINCT FROM 'false'::jsonb OR r -> 'faltas' IS DISTINCT FROM '["categoria", "subcategoria", "modelo"]'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: P5 (sem categoria) → %', r;
  END IF;

  -- P6: SKU manual: sem p_forcar fica; com p_forcar é substituído (0003) e passa a gerado
  v_p := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste SKU P6 2027', 'MANUAL-' || v_pre, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p, NULL, NULL, v_t1, v_s1);
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p, jsonb_build_array(jsonb_build_object('atributo', v_cor, 'opcao', v_azul)));
  PERFORM public.cat_guardar_produto_modelo(v_org, v_p, current_setting('teste.m3')::uuid);
  r := public.cat_gerar_sku_produto(v_org, v_p);
  IF r ->> 'sku' IS DISTINCT FROM 'MANUAL-' || v_pre OR (r -> 'gerado') IS DISTINCT FROM 'false'::jsonb OR r ->> 'motivo' IS DISTINCT FROM 'sku_manual' THEN
    RAISE EXCEPTION 'FALHOU: P6 manual sem forçar → %', r;
  END IF;
  PERFORM set_config('teste.p6', v_p::text, true);
  r := public.cat_gerar_sku_produto(v_org, v_p, true);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0003-AZ' THEN RAISE EXCEPTION 'FALHOU: P6 manual com forçar → %', r; END IF;
  -- já gerado: sem forçar volta a gerar (o mesmo)
  r := public.cat_gerar_sku_produto(v_org, v_p);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0003-AZ' OR (r -> 'gerado') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: P6 regenerar sem mudanças → %', r;
  END IF;

  PERFORM set_config('teste.p7_attrs', jsonb_build_array(jsonb_build_object('atributo', v_cor, 'opcao', v_azul),
                                                         jsonb_build_object('atributo', v_acab, 'opcao', v_mate))::text, true);
END $t$;
RESET ROLE;
-- sku_gerado: P1 true; P6 true depois de forçado; os produtos manuais/provisórios não gerados ficam false
DO $t$
BEGIN
  IF (SELECT sku_gerado FROM products WHERE id = current_setting('teste.p1')::uuid) IS NOT TRUE
     OR (SELECT sku_gerado FROM products WHERE id = current_setting('teste.p6')::uuid) IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: sku_gerado não ficou true depois de gerar';
  END IF;
  IF EXISTS (SELECT 1 FROM products WHERE organization_id = current_setting('teste.org')::uuid
             AND name IN ('Teste SKU P3 2027', 'Teste SKU P4 2027', 'Teste SKU P5 2027') AND sku_gerado) THEN
    RAISE EXCEPTION 'FALHOU: sku_gerado true num produto que não gerou';
  END IF;
END $t$;
-- a opção Mate fica sem sigla (para a falta informativa)
UPDATE attribute_option_group_values SET sigla = NULL WHERE id = current_setting('teste.o_mate')::uuid;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE v_org uuid := current_setting('teste.org')::uuid; v_p uuid; r jsonb;
BEGIN
  -- P7: opção sem sigla → segmento omitido, "faltas" com o atributo, mas gera
  v_p := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste SKU P7 2027', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p, NULL, NULL, current_setting('teste.n_t1'), current_setting('teste.n_s1'));
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p, current_setting('teste.p7_attrs')::jsonb);
  PERFORM public.cat_guardar_produto_modelo(v_org, v_p, current_setting('teste.m4')::uuid);
  r := public.cat_gerar_sku_produto(v_org, v_p);
  IF r ->> 'sku' IS DISTINCT FROM current_setting('teste.pre') || '-0004-AZ' OR (r -> 'gerado') IS DISTINCT FROM 'true'::jsonb
     OR r -> 'faltas' IS DISTINCT FROM jsonb_build_array('sigla:' || current_setting('teste.cod_acab')) THEN
    RAISE EXCEPTION 'FALHOU: P7 (opção sem sigla) → %', r;
  END IF;
  -- recusas
  BEGIN PERFORM public.cat_gerar_sku_produto(v_org, gen_random_uuid()); RAISE EXCEPTION 'FALHOU: produto inexistente aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL; END;
  IF current_setting('teste.apag') <> '' THEN
    BEGIN PERFORM public.cat_gerar_sku_produto(v_org, current_setting('teste.apag')::uuid); RAISE EXCEPTION 'FALHOU: produto apagado aceite';
    EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL; END;
  END IF;
  IF current_setting('teste.cons') <> '' THEN
    BEGIN PERFORM public.cat_gerar_sku_produto(v_org, current_setting('teste.cons')::uuid); RAISE EXCEPTION 'FALHOU: consumível aceite';
    EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  END IF;
  IF current_setting('teste.saltar_bm24', true) IS DISTINCT FROM 'sim' THEN
    BEGIN PERFORM public.cat_gerar_sku_produto(current_setting('teste.bm24')::uuid, current_setting('teste.p1')::uuid); RAISE EXCEPTION 'FALHOU: BM24 aceite';
    EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL; END;
  END IF;
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims_sem'), true);
DO $t$
BEGIN
  BEGIN PERFORM public.cat_gerar_sku_produto(current_setting('teste.org')::uuid, current_setting('teste.p1')::uuid, true);
    RAISE EXCEPTION 'FALHOU: gerar SKU sem products.edit aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL; END;
END $t$;
RESET ROLE;
UPDATE attribute_option_group_values SET sigla = 'MT' WHERE id = current_setting('teste.o_mate')::uuid;

-- ─── 7. Ordem configurável ───────────────────────────────────────────────────
-- a lista completa (todos os atributos vivos da nike): os de teste primeiro, na ordem nova; os outros como estão
DO $t$
DECLARE v_org uuid := current_setting('teste.org')::uuid;
BEGIN
  PERFORM set_config('teste.cfg', (
    SELECT jsonb_agg(x.item ORDER BY x.k, x.o)
    FROM (
      SELECT jsonb_build_object('atributo', a.id, 'entra', (a.id <> current_setting('teste.bri')::uuid AND a.sku_entra)) AS item,
             0 AS k,
             (CASE a.id WHEN current_setting('teste.med')::uuid THEN 1 WHEN current_setting('teste.cor')::uuid THEN 2
                        WHEN current_setting('teste.text')::uuid THEN 3 WHEN current_setting('teste.acab')::uuid THEN 4 ELSE 5 END) AS o
      FROM product_attributes a
      WHERE a.id IN (current_setting('teste.med')::uuid, current_setting('teste.cor')::uuid, current_setting('teste.text')::uuid,
                     current_setting('teste.acab')::uuid, current_setting('teste.bri')::uuid)
      UNION ALL
      SELECT jsonb_build_object('atributo', a.id, 'entra', a.sku_entra), 1, coalesce(a.sku_ordem, 0)
      FROM product_attributes a
      WHERE a.organization_id = v_org AND a.deleted_at IS NULL
        AND a.id NOT IN (current_setting('teste.med')::uuid, current_setting('teste.cor')::uuid, current_setting('teste.text')::uuid,
                         current_setting('teste.acab')::uuid, current_setting('teste.bri')::uuid)
    ) x)::text, true);
  PERFORM set_config('teste.n_atr', (SELECT count(*) FROM product_attributes WHERE organization_id = v_org AND deleted_at IS NULL)::text, true);
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  v_org uuid := current_setting('teste.org')::uuid; v_pre text := current_setting('teste.pre');
  v_cor text := current_setting('teste.cor'); v_text text := current_setting('teste.text'); v_acab text := current_setting('teste.acab');
  v_med text := current_setting('teste.med'); v_bri text := current_setting('teste.bri');
  v_cfg jsonb := current_setting('teste.cfg')::jsonb; v_p uuid; v_p10 uuid; r jsonb; v_msg text;
BEGIN
  BEGIN PERFORM public.cat_guardar_sku_config(v_org, '[]'::jsonb); RAISE EXCEPTION 'FALHOU: ordem vazia aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN
    PERFORM public.cat_guardar_sku_config(v_org, jsonb_build_array(
      jsonb_build_object('atributo', v_med, 'entra', true), jsonb_build_object('atributo', v_cor, 'entra', true),
      jsonb_build_object('atributo', v_text, 'entra', true), jsonb_build_object('atributo', v_acab, 'entra', true)));
    RAISE EXCEPTION 'FALHOU: ordem incompleta aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'A ordem do SKU tem de trazer todos os atributos, cada um uma vez.' THEN RAISE EXCEPTION 'FALHOU: incompleta — %', v_msg; END IF;
  END;
  BEGIN
    PERFORM public.cat_guardar_sku_config(v_org, v_cfg || jsonb_build_array(jsonb_build_object('atributo', v_cor, 'entra', true)));
    RAISE EXCEPTION 'FALHOU: ordem com repetido aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE '%repete um atributo.' THEN RAISE EXCEPTION 'FALHOU: repetido — %', v_msg; END IF;
  END;
  BEGIN
    PERFORM public.cat_guardar_sku_config(v_org, jsonb_build_array(jsonb_build_object('atributo', v_med)));
    RAISE EXCEPTION 'FALHOU: item sem "entra" aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN
    PERFORM public.cat_guardar_sku_config(v_org, jsonb_build_array(jsonb_build_object('atributo', '2027a118-0000-4000-8000-000000000001', 'entra', true)));
    RAISE EXCEPTION 'FALHOU: atributo global aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL; END;
  BEGIN
    PERFORM public.cat_guardar_sku_config(v_org, jsonb_build_array(jsonb_build_object('atributo', gen_random_uuid(), 'entra', true)));
    RAISE EXCEPTION 'FALHOU: atributo inexistente aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL; END;

  -- medida antes da cor; brilho desligado
  r := public.cat_guardar_sku_config(v_org, v_cfg);
  IF (r ->> 'n')::int IS DISTINCT FROM current_setting('teste.n_atr')::int THEN RAISE EXCEPTION 'FALHOU: guardar a ordem → %', r; END IF;

  -- P8: brilho tem valor mas não entra; medida primeiro
  v_p := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste SKU P8 2027', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p, NULL, NULL, current_setting('teste.n_t1'), current_setting('teste.n_s1'));
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p, jsonb_build_array(
    jsonb_build_object('atributo', v_cor, 'opcao', current_setting('teste.o_azul')),
    jsonb_build_object('atributo', v_bri, 'opcao', current_setting('teste.o_alto')),
    jsonb_build_object('atributo', v_text, 'opcao', current_setting('teste.o_rug')),
    jsonb_build_object('atributo', v_med, 'medida', jsonb_build_object('tipo', '2D', 'largura', 60, 'comprimento', 30))));
  PERFORM public.cat_guardar_produto_modelo(v_org, v_p, current_setting('teste.m5')::uuid);
  r := public.cat_gerar_sku_produto(v_org, v_p);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0005-60X30-AZ-RUG' OR r -> 'faltas' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: P8 (ordem nova, brilho desligado) → %', r;
  END IF;

  -- colisão (20270118300000): P10 tem PRE-0010-AZ escrito à mão; P9 (modelo 0010, azul) pediria o mesmo SKU → não
  -- salta para outro número: "duplicado", o SKU de P9 fica e diz qual é o outro
  v_p10 := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste SKU P10 2027', v_pre || '-0010-AZ', NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  v_p := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste SKU P9 2027', v_pre || '-0010', NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p, NULL, NULL, current_setting('teste.n_t1'), current_setting('teste.n_s1'));
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p, jsonb_build_array(jsonb_build_object('atributo', v_cor, 'opcao', current_setting('teste.o_azul'))));
  PERFORM public.cat_guardar_produto_modelo(v_org, v_p, current_setting('teste.m10')::uuid);
  r := public.cat_gerar_sku_produto(v_org, v_p, true);
  IF r ->> 'motivo' IS DISTINCT FROM 'duplicado' OR (r -> 'gerado') IS DISTINCT FROM 'false'::jsonb
     OR r ->> 'sku' IS DISTINCT FROM v_pre || '-0010' OR (r ->> 'outro_produto')::uuid IS DISTINCT FROM v_p10
     OR (SELECT p.sku FROM products p WHERE p.id = v_p) IS DISTINCT FROM v_pre || '-0010' THEN
    RAISE EXCEPTION 'FALHOU: colisão → %', r;
  END IF;
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims_sem'), true);
DO $t$
BEGIN
  BEGIN PERFORM public.cat_guardar_sku_config(current_setting('teste.org')::uuid, current_setting('teste.cfg')::jsonb);
    RAISE EXCEPTION 'FALHOU: ordem do SKU sem products.edit aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL; END;
END $t$;
RESET ROLE;
-- os SKU já gerados não mudaram com a ordem nova; a ordem gravada é a pedida
DO $t$
DECLARE o_med integer; o_cor integer; o_text integer; o_acab integer; v_entra boolean;
BEGIN
  IF (SELECT sku FROM products WHERE id = current_setting('teste.p1')::uuid) IS DISTINCT FROM current_setting('teste.pre') || '-0001-AZ-RUG-60X30-MT' THEN
    RAISE EXCEPTION 'FALHOU: o SKU de P1 mudou ao mudar a ordem';
  END IF;
  SELECT sku_ordem INTO o_med FROM product_attributes WHERE id = current_setting('teste.med')::uuid;
  SELECT sku_ordem INTO o_cor FROM product_attributes WHERE id = current_setting('teste.cor')::uuid;
  SELECT sku_ordem INTO o_text FROM product_attributes WHERE id = current_setting('teste.text')::uuid;
  SELECT sku_ordem INTO o_acab FROM product_attributes WHERE id = current_setting('teste.acab')::uuid;
  SELECT sku_entra INTO v_entra FROM product_attributes WHERE id = current_setting('teste.bri')::uuid;
  IF NOT (o_med < o_cor AND o_cor < o_text AND o_text < o_acab) OR v_entra THEN
    RAISE EXCEPTION 'FALHOU: a ordem gravada não é a pedida (%,%,%,%; brilho entra %)', o_med, o_cor, o_text, o_acab, v_entra;
  END IF;
END $t$;

-- ─── 8. Pré-visualizar ───────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  v_org uuid := current_setting('teste.org')::uuid; v_t1 uuid := current_setting('teste.t1')::uuid; v_s1 uuid := current_setting('teste.s1')::uuid;
  v_pre text := current_setting('teste.pre'); v_attrs jsonb; v_grande jsonb; r jsonb; r2 jsonb;
  v_m1 uuid := current_setting('teste.m1')::uuid;
BEGIN
  v_attrs := jsonb_build_array(
    jsonb_build_object('atributo', current_setting('teste.cor'), 'opcao', current_setting('teste.o_azul')),
    jsonb_build_object('atributo', current_setting('teste.med'), 'medida', jsonb_build_object('tipo', '2D', 'largura', 60, 'comprimento', 30)));
  -- 20270118300000: com o modelo 0001 (o número é o do modelo; duas chamadas dão o mesmo e nada se grava)
  r := public.cat_prever_sku_modelo(v_org, v_t1, v_s1, v_m1, v_attrs);
  r2 := public.cat_prever_sku_modelo(v_org, v_t1, v_s1, v_m1, v_attrs);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-60X30-AZ' OR r IS DISTINCT FROM r2 OR r -> 'faltas' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: pré-visualização → % / %', r, r2;
  END IF;
  -- a pré-visualização sem modelo (cat_prever_sku) já não mostra SKU: falta o modelo
  r := public.cat_prever_sku(v_org, v_t1, v_s1, v_attrs);
  IF r -> 'sku' IS DISTINCT FROM 'null'::jsonb OR r -> 'faltas' IS DISTINCT FROM '["modelo"]'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: cat_prever_sku sem modelo → %', r;
  END IF;
  -- medida incompleta: fica de fora, com a falta
  r := public.cat_prever_sku_modelo(v_org, v_t1, v_s1, v_m1, jsonb_build_array(
    jsonb_build_object('atributo', current_setting('teste.cor'), 'opcao', current_setting('teste.o_azul')),
    jsonb_build_object('atributo', current_setting('teste.med'), 'medida', jsonb_build_object('tipo', '2D', 'largura', 60))));
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-AZ' OR r -> 'faltas' IS DISTINCT FROM jsonb_build_array('medida:' || current_setting('teste.cod_med')) THEN
    RAISE EXCEPTION 'FALHOU: pré-visualização com medida incompleta → %', r;
  END IF;
  -- 1e100000: omitida, com a falta, e a resposta é curta
  BEGIN
    v_grande := ('{"tipo":"2D","largura":1e100000,"comprimento":30}')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_grande := NULL;
    PERFORM set_config('teste.saltados', current_setting('teste.saltados') || '1e100000 (o próprio jsonb recusou o número); ', true);
  END;
  IF v_grande IS NOT NULL THEN
    r := public.cat_prever_sku_modelo(v_org, v_t1, v_s1, v_m1, jsonb_build_array(
      jsonb_build_object('atributo', current_setting('teste.cor'), 'opcao', current_setting('teste.o_azul')),
      jsonb_build_object('atributo', current_setting('teste.med'), 'medida', v_grande)));
    IF length(r::text) > 300 OR r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-AZ'
       OR r -> 'faltas' IS DISTINCT FROM jsonb_build_array('medida:' || current_setting('teste.cod_med')) THEN
      RAISE EXCEPTION 'FALHOU: pré-visualização com 1e100000 (% caracteres) → %', length(r::text), left(r::text, 200);
    END IF;
  END IF;
  r := public.cat_prever_sku(v_org, current_setting('teste.t3')::uuid, NULL, '[]'::jsonb);
  IF r -> 'sku' IS DISTINCT FROM 'null'::jsonb OR r -> 'faltas' IS DISTINCT FROM '["sigla_categoria", "subcategoria", "modelo"]'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: pré-visualização sem sigla → %', r;
  END IF;
  r := public.cat_prever_sku(v_org, NULL, NULL, NULL);
  IF r -> 'sku' IS DISTINCT FROM 'null'::jsonb OR r -> 'faltas' IS DISTINCT FROM '["categoria", "subcategoria", "modelo"]'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: pré-visualização sem categoria → %', r;
  END IF;
  -- categoria com sigla, sem subcategoria (20270118200000: obrigatória) → sku null e a falta
  r := public.cat_prever_sku(v_org, current_setting('teste.t2')::uuid, NULL, jsonb_build_array(
    jsonb_build_object('atributo', current_setting('teste.cor'), 'opcao', current_setting('teste.o_azul'))));
  IF r -> 'sku' IS DISTINCT FROM 'null'::jsonb OR r -> 'faltas' IS DISTINCT FROM '["subcategoria", "modelo"]'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: pré-visualização sem subcategoria → %', r;
  END IF;
  BEGIN PERFORM public.cat_prever_sku(v_org, v_t1, current_setting('teste.s3')::uuid, '[]'::jsonb);
    RAISE EXCEPTION 'FALHOU: subcategoria de outro pai aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims_red'), true);
DO $t$
BEGIN
  BEGIN PERFORM public.cat_prever_sku(current_setting('teste.org')::uuid, NULL, NULL, NULL);
    RAISE EXCEPTION 'FALHOU: pré-visualização sem permissão aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL; END;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF EXISTS (SELECT 1 FROM products WHERE organization_id = current_setting('teste.org')::uuid
             AND sku IN (current_setting('teste.pre') || '-0001-60X30-AZ', current_setting('teste.pre') || '-0001-AZ')) THEN
    RAISE EXCEPTION 'FALHOU: a pré-visualização gravou um SKU';
  END IF;
END $t$;

-- ─── 9. Regenerar um SKU já gerado ───────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE v_org uuid := current_setting('teste.org')::uuid; v_p uuid := current_setting('teste.p2')::uuid; r jsonb;
  v_med3d jsonb := jsonb_build_object('tipo', '3D', 'largura', 7.5, 'comprimento', 30, 'espessura', 2, 'unidade', 'mm');
BEGIN
  -- P2 muda de cor: o mesmo modelo → mantém 0002; a ordem atual (medida primeiro) aplica-se
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p, jsonb_build_array(
    jsonb_build_object('atributo', current_setting('teste.cor'), 'opcao', current_setting('teste.o_azul')),
    jsonb_build_object('atributo', current_setting('teste.med'), 'medida', v_med3d)));
  r := public.cat_gerar_sku_produto(v_org, v_p);
  IF r ->> 'sku' IS DISTINCT FROM current_setting('teste.pre') || '-0002-7P5X30X2MM-AZ' OR (r -> 'gerado') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: regenerar com o mesmo prefixo → %', r;
  END IF;
  -- P2 muda de categoria sem sub: o modelo sai (20270118300000), não regenera e o SKU gerado antes fica
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p, NULL, NULL, current_setting('teste.n_t2'), NULL);
  IF (SELECT p.model_id FROM products p WHERE p.id = v_p) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: ao perder a subcategoria, P2 ficou com o modelo';
  END IF;
  r := public.cat_gerar_sku_produto(v_org, v_p);
  IF (r -> 'gerado') IS DISTINCT FROM 'false'::jsonb OR r -> 'faltas' IS DISTINCT FROM '["subcategoria", "modelo"]'::jsonb
     OR r ->> 'sku' IS DISTINCT FROM current_setting('teste.pre') || '-0002-7P5X30X2MM-AZ'
     OR (SELECT p.sku FROM products p WHERE p.id = v_p) IS DISTINCT FROM current_setting('teste.pre') || '-0002-7P5X30X2MM-AZ' THEN
    RAISE EXCEPTION 'FALHOU: regenerar sem subcategoria (devia ficar o SKU anterior) → %', r;
  END IF;
  -- com a sub (s3, sigla = a de s1, noutro pai) e o modelo 0001 dela: prefixo novo (categoria, subcategoria) e 0001
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p, NULL, NULL, current_setting('teste.n_t2'), current_setting('teste.n_s3'));
  PERFORM public.cat_guardar_produto_modelo(v_org, v_p, current_setting('teste.m31')::uuid);
  r := public.cat_gerar_sku_produto(v_org, v_p);
  IF r ->> 'sku' IS DISTINCT FROM current_setting('teste.sc') || '-' || current_setting('teste.sb') || '-0001-7P5X30X2MM-AZ' THEN
    RAISE EXCEPTION 'FALHOU: regenerar com outro prefixo → %', r;
  END IF;
END $t$;
RESET ROLE;

-- ─── 10. Acessos e search_path ───────────────────────────────────────────────
DO $t$
DECLARE v_sig text; v_oid oid;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY['public.cat_guardar_sigla_categoria(uuid,uuid,text)', 'public.cat_guardar_sigla_opcao(uuid,uuid,text)',
                                'public.cat_guardar_sku_config(uuid,jsonb)', 'public.cat_gerar_sku_produto(uuid,uuid,boolean)',
                                'public.cat_prever_sku(uuid,uuid,uuid,jsonb)', 'public.cat_ler_categorias_gestao(uuid)',
                                'public.cat_ler_atributos_gestao(uuid)', 'public.cat_ler_atributos(uuid)'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'FALHOU: falta a função %', v_sig; END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'FALHOU: anon pode executar %', v_sig; END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'FALHOU: authenticated não pode executar %', v_sig; END IF;
    IF EXISTS (SELECT 1 FROM pg_proc pr, aclexplode(pr.proacl) x WHERE pr.oid = v_oid AND x.grantee = 0 AND x.privilege_type = 'EXECUTE')
       OR (SELECT pr.proacl FROM pg_proc pr WHERE pr.oid = v_oid) IS NULL THEN
      RAISE EXCEPTION 'FALHOU: PUBLIC pode executar %', v_sig;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc pr, unnest(pr.proconfig) cfg WHERE pr.oid = v_oid AND cfg = 'search_path=public, pg_temp') THEN
      RAISE EXCEPTION 'FALHOU: % sem search_path = public, pg_temp', v_sig;
    END IF;
  END LOOP;
  FOREACH v_sig IN ARRAY ARRAY['public.fn_cat_sugerir_sigla(text,text[])', 'public.fn_cat_sigla_categoria_livre(uuid,uuid,text,uuid)',
                                'public.fn_cat_sigla_opcao_livre(uuid,text,uuid)', 'public.fn_cat_sku_medida(jsonb)',
                                'public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)', 'public.fn_cat_sku_proximo(uuid,text,uuid)',
                                'public.fn_cat_sku_ordem_inicial(uuid)', 'public.fn_cat_sigla_categoria_trg()',
                                'public.fn_cat_sigla_opcao_trg()', 'public.fn_cat_sku_ordem_trg()'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'FALHOU: falta a função %', v_sig; END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'FALHOU: % pode ser executada de fora', v_sig;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc pr, unnest(pr.proconfig) cfg WHERE pr.oid = v_oid AND cfg = 'search_path=public, pg_temp') THEN
      RAISE EXCEPTION 'FALHOU: % sem search_path = public, pg_temp', v_sig;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_proc pr, unnest(pr.proconfig) cfg
                 WHERE pr.oid = to_regprocedure('public.fn_cat_exigir_uma(uuid,text[])')::oid AND cfg = 'search_path=public, pg_temp') THEN
    RAISE EXCEPTION 'FALHOU: fn_cat_exigir_uma sem search_path = public, pg_temp';
  END IF;
END $t$;

SELECT 'OK: sugestão e medida (limites 100000 e 3 casas), preenchimento da nike, gatilhos (categorias, opções, sku_ordem seguinte), ordem inicial, siglas (normalizar, CT004 x3 com DETAIL, outro pai, CT002 x5, CT003 x2, CT001 x2), leituras (sigla, sku_ordem, sku_entra), gerar (formato, 3D mm, NNNN do modelo 0001/0002, atributo em falta, sem subcategoria, sem sigla, sem categoria, manual com/sem forçar e sku_gerado, provisório, opção sem sigla, colisão → duplicado, audit_source reposto, recusas), ordem configurável (medida primeiro, brilho fora, SKU antigos intactos, 6 recusas + CT001), pré-visualização (com modelo, sem gravar, cat_prever_sku sem modelo → modelo, medida incompleta, 1e100000, sem sigla, sem categoria, sem subcategoria, sub de outro pai, CT001), regenerar (o mesmo modelo mantém o número; sem sub o modelo sai e fica o SKU anterior; outro par com o modelo 0001 dele), acessos e search_path. Saltado: '
       || coalesce(nullif(current_setting('teste.saltados', true), ''), 'nada') AS resultado;

ROLLBACK;
