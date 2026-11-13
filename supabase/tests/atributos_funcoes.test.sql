-- ============================================================
-- Testes: 20270117500000_atributos_funcoes_catalogo.sql (base RH)
-- ============================================================
-- Tudo dentro de BEGIN … ROLLBACK, e SÓ escreve na organização nike (b6ffce4f-f630-4933-833a-008649757a33): os
-- atributos reais são da Mudelar e na Mudelar não se escreve. Dentro da transacção cria para a nike atributos temporários
-- (uma Cor com hex, uma Medida, uma lista sem opções, uma lista cheia com 500 opções, uma apagada com um valor no produto) e
-- um atributo GLOBAL (organization_id nulo) para a prova de isolamento; usa um produto vivo da nike e um consumível.
-- Sessões emprestadas (role authenticated, auth.uid() pelas claims), todas de membros activos da nike, não system admin:
--   editor   products.edit e services.view (e sem permissões na BM24, confirmado por fn_cat_pode)
--   sem      sem products.edit (confirmado por fn_cat_pode)
--   reduzido perfil reduzido de Negócios sem negocios.obra.materiais (confirmado por fn_cat_pode)
--   estranho um uuid qualquer, sem organização
-- A BM24 (872abff2-043f-41e1-99dd-0a8e305ddecb) só é usada como p_org para provar a recusa CT001: nada lá se escreve.
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/atributos_funcoes.test.sql
-- Antes da migration falha logo no passo 0 («função cat_ler_atributos não existe»). Depois termina com «OK: …».
-- Qualquer falha rebenta com 'FALHOU: …'.
--
-- Cobre (uma prova por suspeita):
--   1. Ler: atributos, opções activas por ordem, hex só na Cor, Medida sem opções; global e apagado de fora; produto sem valores de fora
--   2. Gravar uma opção e uma medida 3D  ·  2b. Perfil reduzido sem materiais: atributos sim, produtos = []
--   3. Idempotência (ctid igual)  ·  4. Trocar a opção
--   5. Medida 2D em mm; remover; lista vazia tira todos MAS não apaga o valor do atributo apagado
--   6. Recusas na gravação: duas opções do mesmo atributo, opção de outro atributo, 2D sem comprimento, consumível,
--      número gigante (1e100), 4 casas decimais, 51 elementos
--   7. Sem permissão: gravar e criar opção sem products.edit, ler sem organização → CT001
--   8. cat_guardar_opcao: cria com hex; hex em falta; hex inválido; repetida (maiúsculas/acentos/espaços); repetida com
--      invisíveis e espaço de não-quebra; 256 caracteres; 1001 caracteres; a 501.ª opção; atributo sem hex cria o grupo
--   9. Isolamento: atributo global com p_org = nike → CT003 (gravar e criar opção); p_org = BM24 com ids da nike → CT001
--  10. Opção desativada: reenviar a actual passa (ler diz "ativa": false); escolher uma desativada nova → CT002
-- ============================================================

BEGIN;

-- ─── 0. A migration está aplicada? ───────────────────────────────────────────
DO $t$
BEGIN
  IF to_regprocedure('public.cat_ler_atributos(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FALHOU: função cat_ler_atributos não existe (aplicar 20270117500000_atributos_funcoes_catalogo.sql).';
  END IF;
END $t$;

-- ─── Fixtures (como postgres; escritas só na nike, e um atributo global) ─────
DO $fx$
DECLARE
  c_org constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_bm24 constant uuid := '872abff2-043f-41e1-99dd-0a8e305ddecb';
  v_auth uuid; v_act uuid; v_sem uuid; v_red uuid; v_prod uuid; v_cons uuid; r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM anew_organizations WHERE id = c_org) THEN RAISE EXCEPTION 'FALHOU: a nike não existe nesta base'; END IF;
  PERFORM set_config('app.audit_source', 'teste:atributos_funcoes', true);

  SELECT u.auth_user_id, u.id INTO v_auth, v_act
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'services.view', c_org)
    AND NOT public.is_system_admin_user(u.auth_user_id) AND NOT EXISTS (SELECT 1 FROM anew_memberships mb WHERE mb.user_id = u.id AND mb.organization_id = c_bm24 AND mb.status = 'active')
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: sem membro activo da nike (não system admin, fora da BM24) com products.edit e services.view'; END IF;
  -- o editor não pode ter nada na BM24, senão a prova CT001 não prova nada
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  IF public.fn_cat_pode(c_bm24, 'products.edit') OR public.fn_cat_pode(c_bm24, 'services.view') OR public.fn_cat_pode(c_bm24, 'pessoas.view') THEN
    RAISE EXCEPTION 'FALHOU: o editor emprestado tem permissões na BM24; escolher outra organização para a prova de isolamento';
  END IF;

  -- o membro sem products.edit e o do perfil reduzido sem materiais: confirmados por fn_cat_pode com as claims de cada um
  FOR r IN SELECT u.auth_user_id
           FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
           WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
             AND NOT public.is_system_admin_user(u.auth_user_id)
           ORDER BY m.created_at, u.id LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r.auth_user_id, 'role', 'authenticated')::text, true);
    IF v_sem IS NULL AND NOT public.fn_cat_pode(c_org, 'products.edit') THEN v_sem := r.auth_user_id; END IF;
    IF v_red IS NULL AND NOT public.fn_cat_pode(c_org, 'services.view')
       AND (public.fn_cat_pode(c_org, 'pessoas.view')
            OR EXISTS (SELECT 1 FROM anew_permissions ap WHERE ap.code LIKE 'negocios.%' AND public.fn_cat_pode(c_org, ap.code)))
       AND NOT public.fn_cat_pode(c_org, 'negocios.obra.materiais') THEN
      v_red := r.auth_user_id;
    END IF;
    EXIT WHEN v_sem IS NOT NULL AND v_red IS NOT NULL;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_sem IS NULL THEN RAISE EXCEPTION 'FALHOU: sem membro activo da nike sem products.edit'; END IF;
  IF v_red IS NULL THEN RAISE EXCEPTION 'FALHOU: sem membro activo da nike no perfil reduzido sem negocios.obra.materiais'; END IF;

  SELECT p.id INTO v_prod FROM products p
  WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
    AND NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id)
  ORDER BY p.created_at, p.id LIMIT 1;
  SELECT p.id INTO v_cons FROM products p
  WHERE p.organization_id = c_org AND p.tipo_catalogo = 'consumivel' AND NOT p.is_deleted
  ORDER BY p.created_at, p.id LIMIT 1;
  IF v_prod IS NULL OR v_cons IS NULL THEN RAISE EXCEPTION 'FALHOU: a nike não tem um produto sem atributos ou um consumível'; END IF;

  INSERT INTO product_attributes (id, organization_id, code, label, type, value_type, has_hex_color, is_measurement, measurement_type, unit,
                                  pricing_type, valorization_type, is_variant_option, is_variant_attribute, sort_order, created_by, deleted_at)
  VALUES ('2027b500-0000-4000-8000-000000000001', c_org, 'teste_2027_cor',     'Teste Cor',     'select', 'list', true,  false, NULL,        NULL, 'none', 'none', false, false, 901, v_act, NULL),
         ('2027b500-0000-4000-8000-000000000002', c_org, 'teste_2027_medida',  'Teste Medida',  'text',   'json', false, true,  'dimensoes', 'cm', 'none', 'none', false, false, 902, v_act, NULL),
         ('2027b500-0000-4000-8000-000000000003', c_org, 'teste_2027_textura', 'Teste Textura', 'select', 'list', false, false, NULL,        NULL, 'none', 'none', false, false, 903, v_act, NULL),
         ('2027b500-0000-4000-8000-000000000004', NULL,  'teste_2027_global',  'Teste Global',  'select', 'list', false, false, NULL,        NULL, 'none', 'none', false, false, 904, v_act, NULL),
         ('2027b500-0000-4000-8000-000000000005', c_org, 'teste_2027_cheio',   'Teste Cheio',   'select', 'list', false, false, NULL,        NULL, 'none', 'none', false, false, 905, v_act, NULL),
         ('2027b500-0000-4000-8000-000000000006', c_org, 'teste_2027_apagado', 'Teste Apagado', 'select', 'list', false, false, NULL,        NULL, 'none', 'none', false, false, 906, v_act, now());
  INSERT INTO attribute_option_groups (id, attribute_id, organization_id, name, sort_order, is_active, created_by)
  VALUES ('2027b500-0000-4000-8000-000000000011', '2027b500-0000-4000-8000-000000000001', c_org, 'Teste Cor',     0, true, v_act),
         ('2027b500-0000-4000-8000-000000000015', '2027b500-0000-4000-8000-000000000005', c_org, 'Teste Cheio',   0, true, v_act),
         ('2027b500-0000-4000-8000-000000000016', '2027b500-0000-4000-8000-000000000006', c_org, 'Teste Apagado', 0, true, v_act);
  INSERT INTO attribute_option_group_values (id, group_id, value_text, display_name, hex_color, sort_order, is_active)
  VALUES ('2027b500-0000-4000-8000-000000000021', '2027b500-0000-4000-8000-000000000011', 'Branco Teste',  'Branco Teste',  '#FFFFFF', 1, true),
         ('2027b500-0000-4000-8000-000000000022', '2027b500-0000-4000-8000-000000000011', 'Cinza Teste',   'Cinza Teste',   '#808080', 2, true),
         ('2027b500-0000-4000-8000-000000000023', '2027b500-0000-4000-8000-000000000011', 'Preto Teste',   'Preto Teste',   '#000000', 3, false),
         ('2027b500-0000-4000-8000-000000000026', '2027b500-0000-4000-8000-000000000016', 'Apagada Teste', 'Apagada Teste', NULL,      1, true);
  INSERT INTO attribute_option_group_values (group_id, value_text, display_name, sort_order, is_active)
  SELECT '2027b500-0000-4000-8000-000000000015', 'Cheia ' || n, 'Cheia ' || n, n, true FROM generate_series(1, 500) AS n;
  -- o produto tem um valor num atributo apagado: não aparece, e gravar não o apaga
  INSERT INTO product_attribute_values (product_id, attribute_id, value_text)
  VALUES (v_prod, '2027b500-0000-4000-8000-000000000006', 'Apagada Teste');

  PERFORM set_config('teste.org', c_org::text, true);
  PERFORM set_config('teste.bm24', c_bm24::text, true);
  PERFORM set_config('teste.prod', v_prod::text, true);
  PERFORM set_config('teste.cons', v_cons::text, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.claims_sem', json_build_object('sub', v_sem, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.claims_red', json_build_object('sub', v_red, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.claims_estranho', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
END $fx$;

-- ─── 1. Ler ──────────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; a jsonb;
BEGIN
  r := public.cat_ler_atributos(current_setting('teste.org')::uuid);
  SELECT x INTO a FROM jsonb_array_elements(r -> 'atributos') x WHERE x ->> 'id' = '2027b500-0000-4000-8000-000000000001';
  IF a IS NULL OR a ->> 'tipo' IS DISTINCT FROM 'lista' OR (a -> 'tem_hex')::boolean IS NOT TRUE
     OR a ->> 'codigo' IS DISTINCT FROM 'teste_2027_cor' OR a ->> 'nome' IS DISTINCT FROM 'Teste Cor'
     OR jsonb_array_length(a -> 'opcoes') IS DISTINCT FROM 2 OR a -> 'opcoes' -> 0 ->> 'valor' IS DISTINCT FROM 'Branco Teste'
     OR a -> 'opcoes' -> 0 ->> 'hex' IS DISTINCT FROM '#FFFFFF' OR a -> 'opcoes' -> 1 ->> 'id' IS DISTINCT FROM '2027b500-0000-4000-8000-000000000022' THEN
    RAISE EXCEPTION 'FALHOU: ler — atributo Cor (a desativada não pode aparecer): %', a;
  END IF;
  SELECT x INTO a FROM jsonb_array_elements(r -> 'atributos') x WHERE x ->> 'id' = '2027b500-0000-4000-8000-000000000002';
  IF a IS NULL OR a ->> 'tipo' IS DISTINCT FROM 'medida' OR a -> 'opcoes' IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'FALHOU: ler — atributo Medida: %', a; END IF;
  SELECT x INTO a FROM jsonb_array_elements(r -> 'atributos') x WHERE x ->> 'id' = '2027b500-0000-4000-8000-000000000003';
  IF a IS NULL OR a ->> 'tipo' IS DISTINCT FROM 'lista' OR (a -> 'tem_hex')::boolean IS NOT FALSE OR a -> 'opcoes' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: ler — atributo Textura: %', a;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'atributos') x
             WHERE x ->> 'id' IN ('2027b500-0000-4000-8000-000000000004', '2027b500-0000-4000-8000-000000000006')) THEN
    RAISE EXCEPTION 'FALHOU: ler — apareceu o atributo global ou o apagado';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'produtos') x WHERE x ->> 'id' = current_setting('teste.prod')) THEN
    RAISE EXCEPTION 'FALHOU: ler — produto só com o valor de um atributo apagado apareceu em produtos';
  END IF;
END $t$;
RESET ROLE;

-- ─── 2. Gravar uma opção e uma medida 3D ─────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; p jsonb; c jsonb; m jsonb;
BEGIN
  r := public.cat_guardar_produto_atributos(current_setting('teste.org')::uuid, current_setting('teste.prod')::uuid, jsonb_build_array(
         jsonb_build_object('atributo', '2027b500-0000-4000-8000-000000000001', 'opcao', '2027b500-0000-4000-8000-000000000021'),
         jsonb_build_object('atributo', '2027b500-0000-4000-8000-000000000002',
                            'medida', jsonb_build_object('tipo', '3D', 'largura', 60, 'comprimento', 60, 'espessura', 0.9, 'unidade', 'cm'))));
  IF r IS DISTINCT FROM '{"ok": true, "n": 2}'::jsonb THEN RAISE EXCEPTION 'FALHOU: gravar — retorno %', r; END IF;
  r := public.cat_ler_atributos(current_setting('teste.org')::uuid);
  SELECT x INTO p FROM jsonb_array_elements(r -> 'produtos') x WHERE x ->> 'id' = current_setting('teste.prod');
  IF p IS NULL OR jsonb_array_length(p -> 'valores') IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'FALHOU: gravar — produto lido: %', p; END IF;
  c := p -> 'valores' -> 0;
  m := p -> 'valores' -> 1;
  IF c ->> 'atributo' IS DISTINCT FROM '2027b500-0000-4000-8000-000000000001' OR c ->> 'opcao' IS DISTINCT FROM '2027b500-0000-4000-8000-000000000021'
     OR c ->> 'valor' IS DISTINCT FROM 'Branco Teste' OR c -> 'medida' IS DISTINCT FROM 'null'::jsonb OR c -> 'ativa' IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: gravar — valor da Cor: %', c;
  END IF;
  IF m ->> 'atributo' IS DISTINCT FROM '2027b500-0000-4000-8000-000000000002' OR m -> 'opcao' IS DISTINCT FROM 'null'::jsonb
     OR m ->> 'valor' IS DISTINCT FROM '60 × 60 × 0,9 cm' OR m -> 'medida' ->> 'tipo' IS DISTINCT FROM '3D'
     OR (m -> 'medida' ->> 'largura')::numeric IS DISTINCT FROM 60 OR (m -> 'medida' ->> 'comprimento')::numeric IS DISTINCT FROM 60
     OR (m -> 'medida' ->> 'espessura')::numeric IS DISTINCT FROM 0.9 OR m -> 'medida' ->> 'unidade' IS DISTINCT FROM 'cm' THEN
    RAISE EXCEPTION 'FALHOU: gravar — valor da Medida: %', m;
  END IF;
END $t$;
RESET ROLE;

-- ─── 2b. Perfil reduzido de Negócios sem negocios.obra.materiais ─────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims_red'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb;
BEGIN
  r := public.cat_ler_atributos(current_setting('teste.org')::uuid);
  IF r -> 'produtos' IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'FALHOU: perfil reduzido — produtos não vem vazio: %', r -> 'produtos'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'atributos') x WHERE x ->> 'id' = '2027b500-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'FALHOU: perfil reduzido — os atributos não vieram';
  END IF;
END $t$;
RESET ROLE;

-- ─── 3. Idempotência: o mesmo outra vez não reescreve as linhas ──────────────
SELECT set_config('teste.ctid', (SELECT string_agg(ctid::text, ',' ORDER BY attribute_id) FROM product_attribute_values
                                 WHERE product_id = current_setting('teste.prod')::uuid), true);
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb;
BEGIN
  r := public.cat_guardar_produto_atributos(current_setting('teste.org')::uuid, current_setting('teste.prod')::uuid, jsonb_build_array(
         jsonb_build_object('atributo', '2027b500-0000-4000-8000-000000000001', 'opcao', '2027b500-0000-4000-8000-000000000021'),
         jsonb_build_object('atributo', '2027b500-0000-4000-8000-000000000002',
                            'medida', jsonb_build_object('tipo', '3D', 'largura', 60, 'comprimento', 60, 'espessura', 0.9, 'unidade', 'cm'))));
  IF r IS DISTINCT FROM '{"ok": true, "n": 2}'::jsonb THEN RAISE EXCEPTION 'FALHOU: idempotência — retorno %', r; END IF;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF (SELECT string_agg(ctid::text, ',' ORDER BY attribute_id) FROM product_attribute_values
      WHERE product_id = current_setting('teste.prod')::uuid) IS DISTINCT FROM current_setting('teste.ctid') THEN
    RAISE EXCEPTION 'FALHOU: idempotência — gravar o mesmo reescreveu as linhas';
  END IF;
END $t$;

-- ─── 4. Trocar a opção ───────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; c jsonb;
BEGIN
  PERFORM public.cat_guardar_produto_atributos(current_setting('teste.org')::uuid, current_setting('teste.prod')::uuid, jsonb_build_array(
         jsonb_build_object('atributo', '2027b500-0000-4000-8000-000000000001', 'opcao', '2027b500-0000-4000-8000-000000000022'),
         jsonb_build_object('atributo', '2027b500-0000-4000-8000-000000000002',
                            'medida', jsonb_build_object('tipo', '3D', 'largura', 60, 'comprimento', 60, 'espessura', 0.9, 'unidade', 'cm'))));
  r := public.cat_ler_atributos(current_setting('teste.org')::uuid);
  SELECT v INTO c FROM jsonb_array_elements(r -> 'produtos') x, jsonb_array_elements(x -> 'valores') v
  WHERE x ->> 'id' = current_setting('teste.prod') AND v ->> 'atributo' = '2027b500-0000-4000-8000-000000000001';
  IF c ->> 'opcao' IS DISTINCT FROM '2027b500-0000-4000-8000-000000000022' OR c ->> 'valor' IS DISTINCT FROM 'Cinza Teste' THEN
    RAISE EXCEPTION 'FALHOU: trocar — %', c;
  END IF;
END $t$;
RESET ROLE;

-- ─── 5. Medida 2D em mm; remover; lista vazia ────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; p jsonb; m jsonb;
BEGIN
  -- 2D em mm (a espessura que venha não conta); a Cor sai
  r := public.cat_guardar_produto_atributos(current_setting('teste.org')::uuid, current_setting('teste.prod')::uuid, jsonb_build_array(
         jsonb_build_object('atributo', '2027b500-0000-4000-8000-000000000002',
                            'medida', jsonb_build_object('tipo', '2D', 'largura', 300, 'comprimento', 600.5, 'espessura', 5, 'unidade', 'mm'))));
  IF r IS DISTINCT FROM '{"ok": true, "n": 1}'::jsonb THEN RAISE EXCEPTION 'FALHOU: 2D/remover um — retorno %', r; END IF;
  SELECT x INTO p FROM jsonb_array_elements(public.cat_ler_atributos(current_setting('teste.org')::uuid) -> 'produtos') x
  WHERE x ->> 'id' = current_setting('teste.prod');
  m := p -> 'valores' -> 0;
  IF p IS NULL OR jsonb_array_length(p -> 'valores') IS DISTINCT FROM 1 OR m ->> 'atributo' IS DISTINCT FROM '2027b500-0000-4000-8000-000000000002'
     OR m ->> 'valor' IS DISTINCT FROM '300 × 600,5 mm' OR m -> 'medida' ->> 'tipo' IS DISTINCT FROM '2D'
     OR m -> 'medida' -> 'espessura' IS DISTINCT FROM 'null'::jsonb OR m -> 'medida' ->> 'unidade' IS DISTINCT FROM 'mm' THEN
    RAISE EXCEPTION 'FALHOU: 2D em mm / remover um — %', p;
  END IF;
  r := public.cat_guardar_produto_atributos(current_setting('teste.org')::uuid, current_setting('teste.prod')::uuid, '[]'::jsonb);
  IF r IS DISTINCT FROM '{"ok": true, "n": 0}'::jsonb THEN RAISE EXCEPTION 'FALHOU: remover todos — retorno %', r; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(public.cat_ler_atributos(current_setting('teste.org')::uuid) -> 'produtos') x
             WHERE x ->> 'id' = current_setting('teste.prod')) THEN
    RAISE EXCEPTION 'FALHOU: remover todos — o produto continua com valores';
  END IF;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM product_attribute_values WHERE product_id = current_setting('teste.prod')::uuid
                 AND attribute_id = '2027b500-0000-4000-8000-000000000006' AND value_text = 'Apagada Teste') THEN
    RAISE EXCEPTION 'FALHOU: a lista vazia apagou o valor de um atributo apagado';
  END IF;
  IF (SELECT count(*) FROM product_attribute_values WHERE product_id = current_setting('teste.prod')::uuid) IS DISTINCT FROM 1::bigint THEN
    RAISE EXCEPTION 'FALHOU: a lista vazia deixou outros valores';
  END IF;
END $t$;

-- ─── 6. Recusas na gravação ──────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE v_msg text; v_org uuid := current_setting('teste.org')::uuid; v_prod uuid := current_setting('teste.prod')::uuid;
BEGIN
  -- duas opções do mesmo atributo
  BEGIN
    PERFORM public.cat_guardar_produto_atributos(v_org, v_prod, jsonb_build_array(
      jsonb_build_object('atributo', '2027b500-0000-4000-8000-000000000001', 'opcao', '2027b500-0000-4000-8000-000000000021'),
      jsonb_build_object('atributo', '2027b500-0000-4000-8000-000000000001', 'opcao', '2027b500-0000-4000-8000-000000000022')));
    RAISE EXCEPTION 'FALHOU: duas opções do mesmo atributo foram aceites';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE '%mais de uma vez%' THEN RAISE EXCEPTION 'FALHOU: duas opções — mensagem: %', v_msg; END IF;
  END;
  -- opção de outro atributo
  BEGIN
    PERFORM public.cat_guardar_produto_atributos(v_org, v_prod, jsonb_build_array(
      jsonb_build_object('atributo', '2027b500-0000-4000-8000-000000000003', 'opcao', '2027b500-0000-4000-8000-000000000021')));
    RAISE EXCEPTION 'FALHOU: opção de outro atributo foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE '%não pertence%' THEN RAISE EXCEPTION 'FALHOU: outro atributo — mensagem: %', v_msg; END IF;
  END;
  -- medida 2D sem comprimento
  BEGIN
    PERFORM public.cat_guardar_produto_atributos(v_org, v_prod, jsonb_build_array(
      jsonb_build_object('atributo', '2027b500-0000-4000-8000-000000000002',
                         'medida', jsonb_build_object('tipo', '2D', 'largura', 60, 'unidade', 'cm'))));
    RAISE EXCEPTION 'FALHOU: medida 2D sem comprimento foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE '%comprimento%' THEN RAISE EXCEPTION 'FALHOU: 2D sem comprimento — mensagem: %', v_msg; END IF;
  END;
  -- consumível
  BEGIN
    PERFORM public.cat_guardar_produto_atributos(v_org, current_setting('teste.cons')::uuid, '[]'::jsonb);
    RAISE EXCEPTION 'FALHOU: consumível foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE '%consumíveis%' THEN RAISE EXCEPTION 'FALHOU: consumível — mensagem: %', v_msg; END IF;
  END;
  -- número gigante
  BEGIN
    PERFORM public.cat_guardar_produto_atributos(v_org, v_prod, jsonb_build_array(
      jsonb_build_object('atributo', '2027b500-0000-4000-8000-000000000002',
                         'medida', jsonb_build_object('tipo', '2D', 'largura', 1e100, 'comprimento', 60, 'unidade', 'cm'))));
    RAISE EXCEPTION 'FALHOU: largura 1e100 foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE '%100000%' THEN RAISE EXCEPTION 'FALHOU: largura gigante — mensagem: %', v_msg; END IF;
  END;
  -- 4 casas decimais
  BEGIN
    PERFORM public.cat_guardar_produto_atributos(v_org, v_prod, jsonb_build_array(
      jsonb_build_object('atributo', '2027b500-0000-4000-8000-000000000002',
                         'medida', jsonb_build_object('tipo', '2D', 'largura', 60.1234, 'comprimento', 60, 'unidade', 'cm'))));
    RAISE EXCEPTION 'FALHOU: 4 casas decimais foram aceites';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE '%3 casas decimais%' THEN RAISE EXCEPTION 'FALHOU: 4 casas — mensagem: %', v_msg; END IF;
  END;
  -- 51 elementos
  BEGIN
    PERFORM public.cat_guardar_produto_atributos(v_org, v_prod,
      (SELECT jsonb_agg(jsonb_build_object('atributo', '2027b500-0000-4000-8000-000000000001', 'opcao', '2027b500-0000-4000-8000-000000000021'))
       FROM generate_series(1, 51)));
    RAISE EXCEPTION 'FALHOU: 51 elementos foram aceites';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE '%50%' THEN RAISE EXCEPTION 'FALHOU: 51 elementos — mensagem: %', v_msg; END IF;
  END;
  -- nada ficou escrito pelas recusas
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(public.cat_ler_atributos(v_org) -> 'produtos') x WHERE x ->> 'id' = v_prod::text) THEN
    RAISE EXCEPTION 'FALHOU: uma recusa deixou valores escritos';
  END IF;
END $t$;
RESET ROLE;

-- ─── 7. Sem permissão ────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims_sem'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE v_msg text;
BEGIN
  BEGIN
    PERFORM public.cat_guardar_produto_atributos(current_setting('teste.org')::uuid, current_setting('teste.prod')::uuid, '[]'::jsonb);
    RAISE EXCEPTION 'FALHOU: gravar sem products.edit foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'Sem permissão (products.edit).' THEN RAISE EXCEPTION 'FALHOU: gravar sem permissão — mensagem: %', v_msg; END IF;
  END;
  BEGIN
    PERFORM public.cat_guardar_opcao(current_setting('teste.org')::uuid, '2027b500-0000-4000-8000-000000000001', 'Azul Teste', '#0000FF');
    RAISE EXCEPTION 'FALHOU: criar opção sem products.edit foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'Sem permissão (products.edit).' THEN RAISE EXCEPTION 'FALHOU: opção sem permissão — mensagem: %', v_msg; END IF;
  END;
END $t$;
RESET ROLE;
SELECT set_config('request.jwt.claims', current_setting('teste.claims_estranho'), true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  PERFORM public.cat_ler_atributos(current_setting('teste.org')::uuid);
  RAISE EXCEPTION 'FALHOU: ler sem permissão foi aceite';
EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
END $t$;
RESET ROLE;

-- ─── 8. cat_guardar_opcao ────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; a jsonb; v_msg text; v_det text; v_org uuid := current_setting('teste.org')::uuid;
BEGIN
  -- cria com hex: espaços colapsados, hex em maiúsculas, ordem a seguir à última (a desativada tem 3 → 4)
  r := public.cat_guardar_opcao(v_org, '2027b500-0000-4000-8000-000000000001', '  Verde   Teste ', '#00ff00');
  IF r -> 'opcao' ->> 'valor' IS DISTINCT FROM 'Verde Teste' OR r -> 'opcao' ->> 'hex' IS DISTINCT FROM '#00FF00'
     OR (r -> 'opcao' ->> 'ordem')::int IS DISTINCT FROM 4 OR (r -> 'opcao' ->> 'id') IS NULL THEN
    RAISE EXCEPTION 'FALHOU: criar opção — %', r;
  END IF;
  -- hex em falta numa cor
  BEGIN
    PERFORM public.cat_guardar_opcao(v_org, '2027b500-0000-4000-8000-000000000001', 'Azul Teste', NULL);
    RAISE EXCEPTION 'FALHOU: cor sem hex foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE 'Falta o código da cor%' THEN RAISE EXCEPTION 'FALHOU: cor sem hex — mensagem: %', v_msg; END IF;
  END;
  -- hex inválido
  BEGIN
    PERFORM public.cat_guardar_opcao(v_org, '2027b500-0000-4000-8000-000000000001', 'Azul Teste', '#12345G');
    RAISE EXCEPTION 'FALHOU: hex inválido foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE 'O código da cor tem de ser%' THEN RAISE EXCEPTION 'FALHOU: hex inválido — mensagem: %', v_msg; END IF;
  END;
  -- nome repetido com maiúsculas, acento e espaços diferentes
  BEGIN
    PERFORM public.cat_guardar_opcao(v_org, '2027b500-0000-4000-8000-000000000001', '  CÍNZA   teste ', '#808080');
    RAISE EXCEPTION 'FALHOU: nome repetido foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT004' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_det = PG_EXCEPTION_DETAIL;
    IF v_msg IS DISTINCT FROM 'Esta opção já existe.' OR v_det IS DISTINCT FROM '2027b500-0000-4000-8000-000000000022' THEN
      RAISE EXCEPTION 'FALHOU: nome repetido — mensagem «%», detalhe «%»', v_msg, v_det;
    END IF;
  END;
  -- nome repetido com caracteres invisíveis e espaço de não-quebra
  BEGIN
    PERFORM public.cat_guardar_opcao(v_org, '2027b500-0000-4000-8000-000000000001', E' Cin​za  Teste﻿', '#808080');
    RAISE EXCEPTION 'FALHOU: nome repetido com invisíveis foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT004' THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
    IF v_det IS DISTINCT FROM '2027b500-0000-4000-8000-000000000022' THEN RAISE EXCEPTION 'FALHOU: invisíveis — detalhe «%»', v_det; END IF;
  END;
  -- 256 caracteres
  BEGIN
    PERFORM public.cat_guardar_opcao(v_org, '2027b500-0000-4000-8000-000000000001', repeat('a', 256), '#123456');
    RAISE EXCEPTION 'FALHOU: nome de 256 caracteres foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE '%255%' THEN RAISE EXCEPTION 'FALHOU: 256 caracteres — mensagem: %', v_msg; END IF;
  END;
  -- 1001 caracteres
  BEGIN
    PERFORM public.cat_guardar_opcao(v_org, '2027b500-0000-4000-8000-000000000001', repeat('a', 1001), '#123456');
    RAISE EXCEPTION 'FALHOU: texto de 1001 caracteres foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE '%demasiado longo%' THEN RAISE EXCEPTION 'FALHOU: 1001 caracteres — mensagem: %', v_msg; END IF;
  END;
  -- a 501.ª opção
  BEGIN
    PERFORM public.cat_guardar_opcao(v_org, '2027b500-0000-4000-8000-000000000005', 'Mais Uma', NULL);
    RAISE EXCEPTION 'FALHOU: a 501.ª opção foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'Este atributo já tem o máximo de opções.' THEN RAISE EXCEPTION 'FALHOU: 501.ª — mensagem: %', v_msg; END IF;
  END;
  -- atributo sem hex e sem grupo: cria o grupo, ignora o hex
  r := public.cat_guardar_opcao(v_org, '2027b500-0000-4000-8000-000000000003', 'Liso', '#FFFFFF');
  IF r -> 'opcao' ->> 'valor' IS DISTINCT FROM 'Liso' OR r -> 'opcao' -> 'hex' IS DISTINCT FROM 'null'::jsonb
     OR (r -> 'opcao' ->> 'ordem')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: opção sem hex — %', r;
  END IF;
  -- a leitura vê as novas opções
  r := public.cat_ler_atributos(v_org);
  SELECT x INTO a FROM jsonb_array_elements(r -> 'atributos') x WHERE x ->> 'id' = '2027b500-0000-4000-8000-000000000001';
  IF a IS NULL OR jsonb_array_length(a -> 'opcoes') IS DISTINCT FROM 3 OR a -> 'opcoes' -> 2 ->> 'valor' IS DISTINCT FROM 'Verde Teste' THEN
    RAISE EXCEPTION 'FALHOU: ler depois de criar — %', a;
  END IF;
  SELECT x INTO a FROM jsonb_array_elements(r -> 'atributos') x WHERE x ->> 'id' = '2027b500-0000-4000-8000-000000000003';
  IF a IS NULL OR jsonb_array_length(a -> 'opcoes') IS DISTINCT FROM 1 OR a -> 'opcoes' -> 0 -> 'hex' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: ler Textura depois de criar — %', a;
  END IF;
END $t$;
RESET ROLE;

-- ─── 9. Isolamento ───────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE v_org uuid := current_setting('teste.org')::uuid; v_bm24 uuid := current_setting('teste.bm24')::uuid;
BEGIN
  -- um atributo global (sem organização) não é da nike
  BEGIN
    PERFORM public.cat_guardar_produto_atributos(v_org, current_setting('teste.prod')::uuid, jsonb_build_array(
      jsonb_build_object('atributo', '2027b500-0000-4000-8000-000000000004', 'opcao', '2027b500-0000-4000-8000-000000000021')));
    RAISE EXCEPTION 'FALHOU: gravar com um atributo global foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_guardar_opcao(v_org, '2027b500-0000-4000-8000-000000000004', 'Global Teste', NULL);
    RAISE EXCEPTION 'FALHOU: criar opção num atributo global foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL;
  END;
  -- outra organização, onde o editor não é membro, com ids da nike
  BEGIN
    PERFORM public.cat_guardar_produto_atributos(v_bm24, current_setting('teste.prod')::uuid, '[]'::jsonb);
    RAISE EXCEPTION 'FALHOU: gravar com p_org = BM24 foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_guardar_opcao(v_bm24, '2027b500-0000-4000-8000-000000000001', 'Azul Teste', '#0000FF');
    RAISE EXCEPTION 'FALHOU: criar opção com p_org = BM24 foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_ler_atributos(v_bm24);
    RAISE EXCEPTION 'FALHOU: ler a BM24 foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
END $t$;
RESET ROLE;

-- ─── 10. Opção desativada ────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  PERFORM public.cat_guardar_produto_atributos(current_setting('teste.org')::uuid, current_setting('teste.prod')::uuid, jsonb_build_array(
    jsonb_build_object('atributo', '2027b500-0000-4000-8000-000000000001', 'opcao', '2027b500-0000-4000-8000-000000000021')));
END $t$;
RESET ROLE;
UPDATE attribute_option_group_values SET is_active = false WHERE id = '2027b500-0000-4000-8000-000000000021';
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; c jsonb; v_msg text;
BEGIN
  -- reenviar o conjunto com a opção actual, agora desativada, passa
  r := public.cat_guardar_produto_atributos(current_setting('teste.org')::uuid, current_setting('teste.prod')::uuid, jsonb_build_array(
         jsonb_build_object('atributo', '2027b500-0000-4000-8000-000000000001', 'opcao', '2027b500-0000-4000-8000-000000000021')));
  IF r IS DISTINCT FROM '{"ok": true, "n": 1}'::jsonb THEN RAISE EXCEPTION 'FALHOU: reenviar a desativada actual — retorno %', r; END IF;
  SELECT v INTO c FROM jsonb_array_elements(public.cat_ler_atributos(current_setting('teste.org')::uuid) -> 'produtos') x,
                       jsonb_array_elements(x -> 'valores') v
  WHERE x ->> 'id' = current_setting('teste.prod') AND v ->> 'atributo' = '2027b500-0000-4000-8000-000000000001';
  IF c ->> 'opcao' IS DISTINCT FROM '2027b500-0000-4000-8000-000000000021' OR c -> 'ativa' IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: ler a desativada actual — %', c;
  END IF;
  -- escolher uma desativada nova é recusado
  BEGIN
    PERFORM public.cat_guardar_produto_atributos(current_setting('teste.org')::uuid, current_setting('teste.prod')::uuid, jsonb_build_array(
      jsonb_build_object('atributo', '2027b500-0000-4000-8000-000000000001', 'opcao', '2027b500-0000-4000-8000-000000000023')));
    RAISE EXCEPTION 'FALHOU: uma opção desativada nova foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE '%desativada%' THEN RAISE EXCEPTION 'FALHOU: desativada nova — mensagem: %', v_msg; END IF;
  END;
END $t$;
RESET ROLE;

SELECT 'OK: ler, gravar (opção, 3D, 2D em mm), perfil reduzido, idempotência, trocar, remover sem tocar no atributo apagado, 7 recusas na gravação, sem permissão (gravar, criar opção, ler), criar opções (hex, hex em falta, hex inválido, repetida, invisíveis, 256, 1001, 501.ª, sem hex), isolamento (global e BM24) e opção desativada.' AS resultado;

ROLLBACK;
