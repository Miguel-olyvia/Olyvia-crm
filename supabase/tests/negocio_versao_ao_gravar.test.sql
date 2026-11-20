-- ============================================================
-- Testes: 20270125020000_negocio_versao_ao_gravar.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar a migration. Tudo dentro de BEGIN … ROLLBACK: cria um negócio próprio («Teste 125020») na organização do
-- primeiro negócio com número e grava-o por neg_guardar_negocio como um utilizador com pessoas.edit, pessoas.view e
-- negocios.contacto.registar (role authenticated, auth.uid() pelas claims). Os erros juntam-se em teste.falhas e o resultado sai no
-- SELECT final.
--
-- Correr:
--   supabase db query --linked -o csv -f supabase/tests/negocio_versao_ao_gravar.test.sql
--
-- Cobre:
--   A. gravar sem versao_lida (os chamadores antigos): grava, e a versão passa de 0 a 1
--   B. gravar com a versão certa (1): grava, e a versão passa a 2
--   C. gravar com a versão antiga (1, outro separador): NE015, nada se grava (a resposta nova não entra) e a versão fica 2
--   D. neg_versoes(org) traz o negócio com a versão 2; sem sessão, nada
--   E. privilégios: neg_versoes só authenticated; fn_neg_versao_conferir e a tabela fechadas a authenticated; neg_guardar_negocio igual
-- ============================================================

BEGIN;

SELECT set_config('teste.falhas', '', true), set_config('teste.ok', 'nao', true);

DO $fx$
DECLARE
  v_base negocios; v_auth uuid; f text := '';
  n uuid := '12502000-0000-4000-8000-000000000001';
BEGIN
  BEGIN
    SELECT * INTO v_base FROM negocios WHERE numero IS NOT NULL AND deleted_at IS NULL ORDER BY numero LIMIT 1;
    IF v_base.id IS NULL THEN RAISE EXCEPTION 'base sem negócio com número'; END IF;
    SELECT u.auth_user_id INTO v_auth FROM anew_users u
    WHERE u.auth_user_id IS NOT NULL
      AND public.has_anew_permission_in_org(u.auth_user_id, 'pessoas.edit', v_base.organization_id)
      AND public.has_anew_permission_in_org(u.auth_user_id, 'pessoas.view', v_base.organization_id)
      AND public.has_anew_permission_in_org(u.auth_user_id, 'negocios.contacto.registar', v_base.organization_id)
    ORDER BY u.created_at NULLS LAST, u.id LIMIT 1;
    IF v_auth IS NULL THEN RAISE EXCEPTION 'sem utilizador com pessoas.edit, pessoas.view e negocios.contacto.registar na organização %', v_base.organization_id; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    INSERT INTO negocios (id, organization_id, root_organization_id, entity_id, titulo, fluxo_emylia)
    VALUES (n, v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 125020 versão', true);
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM set_config('teste.org', v_base.organization_id::text, true);
    PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    PERFORM set_config('teste.json', jsonb_build_object(
      'negocio', jsonb_build_object('fase', 0, 'linha', 'wc', 'servico_pedido', 'Casa de banho', 'origem', 'à mão', 'dono_papel', 'comercial'),
      'respostas', '[]'::jsonb, 'visitas', '[]'::jsonb, 'medidas', '{}'::jsonb, 'servicos', '[]'::jsonb,
      'historico', jsonb_build_array(jsonb_build_object('ordem', 0, 'texto', 'Teste 125020', 'tipo', 'a', 'ocorrido_em', '2026-11-20T10:00:00')),
      'orcamentos', '[]'::jsonb, 'contratos', '[]'::jsonb)::text, true);
    PERFORM set_config('teste.ok', 'sim', true);
  EXCEPTION WHEN OTHERS THEN
    f := f || format('FIXTURE falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $fx$;

-- ─── A, B e C (como o utilizador) ─────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims', true), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  f text := ''; v_org uuid; n uuid := '12502000-0000-4000-8000-000000000001'; j jsonb;
BEGIN
  IF current_setting('teste.ok') <> 'sim' THEN RETURN; END IF;
  v_org := current_setting('teste.org')::uuid;
  j := current_setting('teste.json')::jsonb;
  -- A
  BEGIN
    PERFORM public.neg_guardar_negocio(v_org, n, j);
  EXCEPTION WHEN OTHERS THEN f := f || format('A gravar sem versão falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  -- B
  BEGIN
    PERFORM public.neg_guardar_negocio(v_org, n, j || jsonb_build_object('versao_lida', 1));
  EXCEPTION WHEN OTHERS THEN f := f || format('B gravar com a versão certa falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  -- C: o separador antigo (leu a versão 1) manda uma resposta nova
  BEGIN
    PERFORM public.neg_guardar_negocio(v_org, n, j || jsonb_build_object('versao_lida', 1,
      'respostas', jsonb_build_array(jsonb_build_object('campo_chave', 'teste_125020', 'valor', 'do separador antigo'))));
    f := f || 'C a versão antiga gravou (devia dar NE015); ';
  EXCEPTION
    WHEN SQLSTATE 'NE015' THEN
      IF position('alterado noutro lado' IN SQLERRM) = 0 THEN f := f || 'C NE015 com outra mensagem: ' || SQLERRM || '; '; END IF;
    WHEN OTHERS THEN f := f || format('C deu outro erro: %s %s; ', SQLSTATE, SQLERRM);
  END;
  -- D (como o utilizador)
  IF (public.neg_versoes(v_org) ->> n::text)::bigint IS DISTINCT FROM 2 THEN
    f := f || 'D neg_versoes devia trazer a versão 2: ' || coalesce(public.neg_versoes(v_org) ->> n::text, 'NULL') || '; ';
  END IF;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;
RESET ROLE;

-- ─── as verificações na base (como postgres) ───────────────────────────────────
DO $t$
DECLARE f text := ''; n uuid := '12502000-0000-4000-8000-000000000001';
BEGIN
  IF current_setting('teste.ok') <> 'sim' THEN RETURN; END IF;
  IF (SELECT versao FROM negocio_versoes WHERE negocio_id = n) IS DISTINCT FROM 2 THEN
    f := f || 'A/B/C a versão na base devia ser 2: ' || coalesce((SELECT versao FROM negocio_versoes WHERE negocio_id = n)::text, 'NULL') || '; ';
  END IF;
  IF EXISTS (SELECT 1 FROM negocio_respostas WHERE negocio_id = n AND campo_chave = 'teste_125020') THEN
    f := f || 'C a resposta do separador antigo ficou gravada; ';
  END IF;
  -- D sem sessão: nada
  PERFORM set_config('request.jwt.claims', '', true);
  IF public.neg_versoes(current_setting('teste.org')::uuid) ? n::text THEN f := f || 'D sem sessão, neg_versoes devolveu o negócio; '; END IF;
  -- E
  IF has_function_privilege('anon', 'public.neg_versoes(uuid)', 'EXECUTE') OR NOT has_function_privilege('authenticated', 'public.neg_versoes(uuid)', 'EXECUTE') THEN
    f := f || 'E neg_versoes com privilégios errados; ';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_neg_versao_conferir(uuid,jsonb)', 'EXECUTE') THEN f := f || 'E fn_neg_versao_conferir aberta a authenticated; '; END IF;
  IF has_table_privilege('authenticated', 'public.negocio_versoes', 'SELECT,INSERT,UPDATE,DELETE') THEN f := f || 'E negocio_versoes aberta a authenticated; '; END IF;
  IF has_function_privilege('anon', 'public.neg_guardar_negocio(uuid,uuid,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.neg_guardar_negocio(uuid,uuid,jsonb)', 'EXECUTE') THEN
    f := f || 'E os privilégios de neg_guardar_negocio mudaram; ';
  END IF;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;

SELECT CASE WHEN current_setting('teste.falhas') = '' AND current_setting('teste.ok') = 'sim'
            THEN 'OK: a versão ao gravar o negócio — A, B, C (NE015 sem gravar), D e E'
            ELSE 'FALHOU: ' || current_setting('teste.falhas')
       END AS resultado;

ROLLBACK;
