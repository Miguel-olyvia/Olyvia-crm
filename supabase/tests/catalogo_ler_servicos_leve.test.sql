-- ============================================================
-- Testes: 20270121000001_catalogo_ler_servicos_leve.sql (antes 20270121000000) (base RH)
-- ============================================================
-- Tudo dentro de BEGIN … ROLLBACK, só na nike, sem escrever nada em tabelas (só pg_temp e set_config locais).
-- Compara cat_ler_catalogo_servicos com cat_ler_catalogo para as MESMAS identidades:
--   1. passo 0: a função existe (antes da migration este passo falha: é o vermelho)
--   2. SECURITY DEFINER, search_path public, pg_temp; anon e PUBLIC sem EXECUTE; authenticated com EXECUTE
--   3. por identidade (admin de sistema; membros da nike com services.view; técnicos com e sem negocios.obra.materiais):
--      as chaves iguais; todas as chaves menos produtos, precosProduto e fornecedores iguais (servicos, passos, equipamentos…);
--      produtos, precosProduto e fornecedores = os de cat_ler_catalogo filtrados pelos produtos dos consumos (usosCons)
--   4. com services.view: todos os produtos dos consumos presentes e um produto não referido ausente
--   5. recusas (3, todas CT001): utilizador sem nada nas duas funções; sem sessão na nova
-- Correr sozinho (vermelho antes da migration):
--   supabase db query --linked -f supabase/tests/catalogo_ler_servicos_leve.test.sql
-- Ensaio (verde): BEGIN; <migration>; <este ficheiro>; ROLLBACK;
-- ============================================================

BEGIN;

CREATE FUNCTION pg_temp.ordenado(j jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE WHEN jsonb_typeof(j) = 'array'
    THEN (SELECT coalesce(jsonb_agg(e ORDER BY e::text), '[]'::jsonb) FROM jsonb_array_elements(j) e) ELSE j END
$f$;

-- os elementos de uma lista cujo campo `k` está em `ids`
CREATE FUNCTION pg_temp.filtrar(j jsonb, k text, ids uuid[]) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $f$
  SELECT coalesce(jsonb_agg(e ORDER BY e::text), '[]'::jsonb) FROM jsonb_array_elements(j) e WHERE (e->>k)::uuid = ANY (ids)
$f$;

CREATE TEMP TABLE _res (passo text, detalhe text) ON COMMIT DROP;

DO $t$
DECLARE
  c_org   constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_fn    constant text := 'public.cat_ler_catalogo_servicos(uuid)';
  v_cfg   text[];
  v_secdef boolean;
  v_admin uuid;
  v_ids   uuid[] := '{}';
  v_tipo  text[] := '{}';
  v_sub   uuid;
  v_u     uuid;
  v_i     int;
  v_sv    boolean; v_tec boolean; v_mat boolean;
  v_tem_sv boolean := false; v_tem_tec boolean := false;
  v_old   jsonb; v_new jsonb;
  v_k     text;
  v_ref   uuid[]; v_keep uuid[];
  v_aus   uuid;
  v_state text;
  v_recusas int := 0;
BEGIN
  -- 1. passo 0
  IF to_regprocedure(c_fn) IS NULL THEN
    RAISE EXCEPTION 'FALHOU: passo 0 - a função public.cat_ler_catalogo_servicos(uuid) não existe';
  END IF;
  INSERT INTO _res VALUES ('0 existe', 'ok');

  -- 2. segurança
  SELECT p.prosecdef, p.proconfig INTO v_secdef, v_cfg FROM pg_proc p WHERE p.oid = to_regprocedure(c_fn);
  IF NOT v_secdef THEN RAISE EXCEPTION 'FALHOU: 2 - não é SECURITY DEFINER'; END IF;
  IF v_cfg IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(v_cfg) c WHERE replace(c, ' ', '') IN ('search_path=public,pg_temp', 'search_path="public","pg_temp"', 'search_path=public,"pg_temp"')) THEN
    RAISE EXCEPTION 'FALHOU: 2 - search_path (%)', v_cfg;
  END IF;
  IF has_function_privilege('anon', c_fn, 'EXECUTE') THEN RAISE EXCEPTION 'FALHOU: 2 - anon com EXECUTE'; END IF;
  IF NOT has_function_privilege('authenticated', c_fn, 'EXECUTE') THEN RAISE EXCEPTION 'FALHOU: 2 - authenticated sem EXECUTE'; END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = to_regprocedure(c_fn) AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: 2 - PUBLIC com EXECUTE';
  END IF;
  INSERT INTO _res VALUES ('2 seguranca', array_to_string(v_cfg, ' '));

  -- 3. as identidades: o admin de sistema e, entre os membros ativos da nike, um com services.view (não admin),
  --    um técnico com negocios.obra.materiais e um técnico sem
  SELECT au.auth_user_id INTO v_admin FROM anew_users au JOIN anew_memberships am ON am.user_id = au.id AND am.status = 'active'
    JOIN anew_roles ar ON ar.id = am.role_id
    WHERE ar.code = 'system_admin' AND ar.is_system AND ar.organization_id IS NULL AND ar.deleted_at IS NULL AND au.auth_user_id IS NOT NULL
    ORDER BY au.created_at LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'FALHOU: 3 - sem admin de sistema para testar'; END IF;
  v_ids := v_ids || v_admin; v_tipo := v_tipo || 'admin'::text;

  FOR v_u IN SELECT DISTINCT au.auth_user_id FROM anew_memberships am JOIN anew_users au ON au.id = am.user_id
             WHERE am.organization_id = c_org AND am.status = 'active' AND au.auth_user_id IS NOT NULL AND au.auth_user_id <> v_admin
             ORDER BY 1 LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
    CONTINUE WHEN public.is_system_admin_user(v_u);
    v_sv := public.fn_cat_pode(c_org, 'services.view');
    v_tec := public.fn_neg_so_execucao(c_org, 'services.view');
    IF NOT v_tec AND NOT v_sv THEN
      v_tec := public.fn_cat_pode(c_org, 'pessoas.view')
        OR EXISTS (SELECT 1 FROM anew_permissions ap WHERE ap.code LIKE 'negocios.%' AND public.fn_cat_pode(c_org, ap.code));
    END IF;
    v_mat := NOT v_tec OR public.fn_cat_pode(c_org, 'negocios.obra.materiais');
    IF NOT v_tec AND v_sv AND NOT ('services.view' = ANY (v_tipo)) THEN
      v_ids := v_ids || v_u; v_tipo := v_tipo || 'services.view'::text;
    ELSIF v_tec AND v_mat AND NOT ('tecnico+materiais' = ANY (v_tipo)) THEN
      v_ids := v_ids || v_u; v_tipo := v_tipo || 'tecnico+materiais'::text;
    ELSIF v_tec AND NOT v_mat AND NOT ('tecnico' = ANY (v_tipo)) THEN
      v_ids := v_ids || v_u; v_tipo := v_tipo || 'tecnico'::text;
    END IF;
    EXIT WHEN cardinality(v_ids) = 4;
  END LOOP;

  FOR v_i IN 1 .. cardinality(v_ids) LOOP
    v_sub := v_ids[v_i];
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sub, 'role', 'authenticated')::text, true);
    v_old := public.cat_ler_catalogo(c_org);
    v_new := public.cat_ler_catalogo_servicos(c_org);

    IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_old) k) IS DISTINCT FROM (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_new) k) THEN
      RAISE EXCEPTION 'FALHOU: 3 (%) - as chaves diferem de cat_ler_catalogo', v_tipo[v_i];
    END IF;
    FOR v_k IN SELECT jsonb_object_keys(v_old) LOOP
      CONTINUE WHEN v_k IN ('produtos', 'precosProduto', 'fornecedores');
      IF pg_temp.ordenado(v_old->v_k) IS DISTINCT FROM pg_temp.ordenado(v_new->v_k) THEN
        RAISE EXCEPTION 'FALHOU: 3 (%) - a chave % difere de cat_ler_catalogo', v_tipo[v_i], v_k;
      END IF;
    END LOOP;

    -- os produtos dos consumos que cat_ler_catalogo devolve
    v_ref := ARRAY(SELECT DISTINCT (e->>'product_id')::uuid FROM jsonb_array_elements(v_old->'usosCons') e);
    v_keep := ARRAY(SELECT (e->>'id')::uuid FROM jsonb_array_elements(v_old->'produtos') e WHERE (e->>'id')::uuid = ANY (v_ref));
    IF pg_temp.ordenado(v_new->'produtos') IS DISTINCT FROM pg_temp.filtrar(v_old->'produtos', 'id', v_keep) THEN
      RAISE EXCEPTION 'FALHOU: 3 (%) - produtos não são os dos consumos (%, esperados %)', v_tipo[v_i], jsonb_array_length(v_new->'produtos'), cardinality(v_keep);
    END IF;
    IF pg_temp.ordenado(v_new->'precosProduto') IS DISTINCT FROM pg_temp.filtrar(v_old->'precosProduto', 'product_id', v_keep) THEN
      RAISE EXCEPTION 'FALHOU: 3 (%) - precosProduto não são os dos produtos dos consumos', v_tipo[v_i];
    END IF;
    IF pg_temp.ordenado(v_new->'fornecedores') IS DISTINCT FROM pg_temp.filtrar(v_old->'fornecedores', 'product_id', v_keep) THEN
      RAISE EXCEPTION 'FALHOU: 3 (%) - fornecedores não são os dos produtos dos consumos', v_tipo[v_i];
    END IF;

    -- 4. com services.view: há consumos, estão todos presentes, e um produto não referido fica de fora
    IF v_tipo[v_i] IN ('admin', 'services.view') THEN
      IF cardinality(v_ref) = 0 THEN RAISE EXCEPTION 'FALHOU: 4 (%) - sem consumos na nike: o teste não prova nada', v_tipo[v_i]; END IF;
      IF EXISTS (SELECT 1 FROM unnest(v_keep) id WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_new->'produtos') e WHERE (e->>'id')::uuid = id)) THEN
        RAISE EXCEPTION 'FALHOU: 4 (%) - falta um produto dos consumos', v_tipo[v_i];
      END IF;
      SELECT (e->>'id')::uuid INTO v_aus FROM jsonb_array_elements(v_old->'produtos') e WHERE NOT ((e->>'id')::uuid = ANY (v_ref)) LIMIT 1;
      IF v_aus IS NULL THEN RAISE EXCEPTION 'FALHOU: 4 (%) - sem produto não referido para provar a ausência', v_tipo[v_i]; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_new->'produtos') e WHERE (e->>'id')::uuid = v_aus) THEN
        RAISE EXCEPTION 'FALHOU: 4 (%) - o produto não referido % veio', v_tipo[v_i], v_aus;
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_new->'precosProduto') e WHERE (e->>'product_id')::uuid = v_aus)
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_new->'fornecedores') e WHERE (e->>'product_id')::uuid = v_aus) THEN
        RAISE EXCEPTION 'FALHOU: 4 (%) - preços ou fornecedores do produto não referido vieram', v_tipo[v_i];
      END IF;
      IF v_tipo[v_i] = 'admin' AND jsonb_array_length(v_new->'precosProduto') = 0 THEN
        RAISE EXCEPTION 'FALHOU: 4 (admin) - precosProduto vazio: o filtro dos preços não foi provado';
      END IF;
    END IF;
    IF v_tipo[v_i] LIKE 'tecnico%' THEN v_tem_tec := true; END IF;
    IF v_tipo[v_i] IN ('admin', 'services.view') THEN v_tem_sv := true; END IF;

    INSERT INTO _res VALUES ('3/4 ' || v_tipo[v_i], format('produtos %s de %s, precosProduto %s de %s, fornecedores %s de %s, servicos %s, passos %s, equipamentos %s, parametros %s',
      jsonb_array_length(v_new->'produtos'), jsonb_array_length(v_old->'produtos'),
      jsonb_array_length(v_new->'precosProduto'), jsonb_array_length(v_old->'precosProduto'),
      jsonb_array_length(v_new->'fornecedores'), jsonb_array_length(v_old->'fornecedores'),
      jsonb_array_length(v_new->'servicos'), jsonb_array_length(v_new->'passos'), jsonb_array_length(v_new->'equipamentos'),
      CASE WHEN v_new->'parametros' = 'null'::jsonb OR v_new->'parametros' IS NULL THEN 'null' ELSE 'sim' END));
  END LOOP;
  IF NOT v_tem_sv THEN RAISE EXCEPTION 'FALHOU: 3 - nenhuma identidade com services.view'; END IF;
  IF NOT v_tem_tec THEN INSERT INTO _res VALUES ('3 aviso', 'sem membro técnico na nike: o corte v_tec só fica provado pela recusa e pelo código'); END IF;

  -- 5. recusas (3): utilizador sem nada (nas duas) e sem sessão (na nova)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000c0121', 'role', 'authenticated')::text, true);
  BEGIN PERFORM public.cat_ler_catalogo(c_org); v_state := 'sem erro';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_recusas := v_recusas + 1; END;
  IF v_state <> 'CT001' THEN RAISE EXCEPTION 'FALHOU: 5 - cat_ler_catalogo sem permissão deu %', v_state; END IF;
  BEGIN PERFORM public.cat_ler_catalogo_servicos(c_org); v_state := 'sem erro';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_recusas := v_recusas + 1; END;
  IF v_state <> 'CT001' THEN RAISE EXCEPTION 'FALHOU: 5 - cat_ler_catalogo_servicos sem permissão deu % (cat_ler_catalogo deu CT001)', v_state; END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN PERFORM public.cat_ler_catalogo_servicos(c_org); v_state := 'sem erro';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_recusas := v_recusas + 1; END;
  IF v_state <> 'CT001' THEN RAISE EXCEPTION 'FALHOU: 5 - cat_ler_catalogo_servicos sem sessão deu %', v_state; END IF;
  INSERT INTO _res VALUES ('5 recusas', v_recusas || ' recusas CT001');
END $t$;

SELECT passo, detalhe FROM _res ORDER BY passo;

ROLLBACK;
