-- ============================================================
-- Testes: 20270121300000_catalogo_ler_parametros.sql (base RH)
-- ============================================================
-- Tudo dentro de BEGIN … ROLLBACK, só na nike, sem escrever nada em tabelas (só pg_temp e set_config locais).
-- Compara cat_ler_parametros_catalogo com cat_ler_catalogo(p_org) -> 'parametros' para as MESMAS identidades:
--   1. passo 0: a função existe (antes da migration este passo falha: é o vermelho)
--   2. SECURITY DEFINER, search_path public, pg_temp; anon e PUBLIC sem EXECUTE; authenticated com EXECUTE
--   3. admin de sistema: igual, objeto com as 8 chaves e com margem_minima e margem_alvo
--   4. um membro da nike sem services.view e com corte de técnico (sem permissão de valores): igual, e é JSON null
--   5. recusa (1, CT001): utilizador sem nada, na nova (e na antiga, só para comparar)
-- Correr sozinho (vermelho antes da migration):
--   supabase db query --linked -f supabase/tests/catalogo_ler_parametros.test.sql
-- Ensaio (verde): BEGIN; <migration>; <este ficheiro>; ROLLBACK;
-- ============================================================

BEGIN;

CREATE TEMP TABLE _res (passo text, detalhe text) ON COMMIT DROP;

DO $t$
DECLARE
  c_org   constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_fn    constant text := 'public.cat_ler_parametros_catalogo(uuid)';
  v_cfg   text[];
  v_secdef boolean;
  v_admin uuid;
  v_tecn  uuid;
  v_u     uuid;
  v_sv    boolean; v_tec boolean;
  v_old   jsonb; v_new jsonb;
  v_state text;
  v_recusas int := 0;
BEGIN
  -- 1. passo 0
  IF to_regprocedure(c_fn) IS NULL THEN
    RAISE EXCEPTION 'FALHOU: passo 0 - a função public.cat_ler_parametros_catalogo(uuid) não existe';
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

  -- 3. admin de sistema
  SELECT au.auth_user_id INTO v_admin FROM anew_users au JOIN anew_memberships am ON am.user_id = au.id AND am.status = 'active'
    JOIN anew_roles ar ON ar.id = am.role_id
    WHERE ar.code = 'system_admin' AND ar.is_system AND ar.organization_id IS NULL AND ar.deleted_at IS NULL AND au.auth_user_id IS NOT NULL
    ORDER BY au.created_at LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'FALHOU: 3 - sem admin de sistema para testar'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_old := public.cat_ler_catalogo(c_org) -> 'parametros';
  v_new := public.cat_ler_parametros_catalogo(c_org);
  IF v_new IS DISTINCT FROM v_old THEN
    RAISE EXCEPTION 'FALHOU: 3 (admin) - difere de cat_ler_catalogo -> parametros (% contra %)', v_new, v_old;
  END IF;
  IF jsonb_typeof(v_new) <> 'object' THEN RAISE EXCEPTION 'FALHOU: 3 (admin) - não é um objeto (%)', v_new; END IF;
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_new) k)
     IS DISTINCT FROM ARRAY['horas_ano','horas_mes','margem_alvo','margem_minima','meses','meses_desatualizado','seguros_ano','tsu'] THEN
    RAISE EXCEPTION 'FALHOU: 3 (admin) - chaves inesperadas (%)', v_new;
  END IF;
  IF jsonb_typeof(v_new->'margem_minima') <> 'number' OR jsonb_typeof(v_new->'margem_alvo') <> 'number' THEN
    RAISE EXCEPTION 'FALHOU: 3 (admin) - sem margens numéricas (%)', v_new;
  END IF;
  INSERT INTO _res VALUES ('3 admin', v_new::text);

  -- 4. um membro ativo da nike (não admin) sem services.view e com o corte de técnico (sem permissão de valores)
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
    IF v_tec AND NOT v_sv THEN v_tecn := v_u; EXIT; END IF;
  END LOOP;
  IF v_tecn IS NULL THEN
    RAISE EXCEPTION 'FALHOU: 4 - sem membro técnico (sem services.view) na nike: o corte v_tec não fica provado';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tecn, 'role', 'authenticated')::text, true);
  v_old := public.cat_ler_catalogo(c_org) -> 'parametros';
  v_new := public.cat_ler_parametros_catalogo(c_org);
  IF v_new IS DISTINCT FROM v_old THEN
    RAISE EXCEPTION 'FALHOU: 4 (técnico) - difere de cat_ler_catalogo -> parametros (% contra %)', v_new, v_old;
  END IF;
  IF v_new <> 'null'::jsonb THEN RAISE EXCEPTION 'FALHOU: 4 (técnico) - devolveu parâmetros a quem não vê valores (%)', v_new; END IF;
  INSERT INTO _res VALUES ('4 tecnico', 'null, igual a cat_ler_catalogo');

  -- 5. recusa: utilizador sem nada; as duas funções dão CT001
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000c0121', 'role', 'authenticated')::text, true);
  BEGIN PERFORM public.cat_ler_catalogo(c_org); v_state := 'sem erro';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_recusas := v_recusas + 1; END;
  IF v_state <> 'CT001' THEN RAISE EXCEPTION 'FALHOU: 5 - cat_ler_catalogo sem permissão deu %', v_state; END IF;
  BEGIN PERFORM public.cat_ler_parametros_catalogo(c_org); v_state := 'sem erro';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_recusas := v_recusas + 1; END;
  IF v_state <> 'CT001' THEN RAISE EXCEPTION 'FALHOU: 5 - cat_ler_parametros_catalogo sem permissão deu % (cat_ler_catalogo deu CT001)', v_state; END IF;
  INSERT INTO _res VALUES ('5 recusas', v_recusas || ' recusas CT001 (antiga e nova)');
END $t$;

SELECT passo, detalhe FROM _res ORDER BY passo;

ROLLBACK;
