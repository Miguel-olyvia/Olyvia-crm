-- ============================================================
-- Testes: 20270125030000_negocio_historico_so_acrescenta.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar a migration. Tudo dentro de BEGIN … ROLLBACK: cria um negócio próprio («Teste 125030») na organização do
-- primeiro negócio com número. A parte A grava-o por neg_guardar_negocio como um utilizador com pessoas.edit, pessoas.view e
-- negocios.contacto.registar (role authenticated, auth.uid() pelas claims); as partes B a F chamam fn_neg_historico_acrescentar
-- diretamente (como postgres), noutro negócio de teste. Os erros juntam-se em teste.falhas e o resultado sai no SELECT final.
--
-- Correr:
--   supabase db query --linked -o csv -f supabase/tests/negocio_historico_so_acrescenta.test.sql
--
-- Cobre:
--   A. neg_guardar_negocio: 1.ª gravação com 2 entradas → 2 linhas; a mesma gravação outra vez → as mesmas 2 linhas (os mesmos ids);
--      um JSON sem uma delas e com o texto da outra mudado → as 2 de antes ficam iguais e a mudada entra como nova (3); a nova fica à
--      frente (ordem menor)
--   B. o separador antigo: a base tem uma entrada que o JSON não tem → fica; a nova do JSON entra
--   C. repetidas: duas «Chamada sem resposta» (10:00 e 10:30) no JSON e uma (10:00) na base → entra só a das 10:30
--   D. a linha que o servidor escreveu (10:05 UTC) e a mesma no ecrã uma hora depois (hora de verão) → não se repete
--   E. sem data: entra uma vez e não se repete na gravação seguinte
--   F. o autor de uma entrada que já estava na base não muda
-- ============================================================

BEGIN;

SELECT set_config('teste.falhas', '', true), set_config('teste.ok', 'nao', true);

DO $fx$
DECLARE
  v_base negocios; v_auth uuid; f text := '';
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
    VALUES ('12503000-0000-4000-8000-000000000001', v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 125030 gravar', true),
           ('12503000-0000-4000-8000-000000000002', v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 125030 função', true);
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM set_config('teste.org', v_base.organization_id::text, true);
    PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    PERFORM set_config('teste.json', jsonb_build_object(
      'negocio', jsonb_build_object('fase', 0, 'linha', 'wc', 'servico_pedido', 'Casa de banho', 'origem', 'à mão', 'dono_papel', 'comercial'),
      'respostas', '[]'::jsonb, 'visitas', '[]'::jsonb, 'medidas', '{}'::jsonb, 'servicos', '[]'::jsonb, 'orcamentos', '[]'::jsonb, 'contratos', '[]'::jsonb,
      'historico', jsonb_build_array(
        jsonb_build_object('ordem', 0, 'texto', 'Teste 125030 · segunda', 'tipo', 'a', 'ocorrido_em', '2026-11-20T11:00:00'),
        jsonb_build_object('ordem', 1, 'texto', 'Teste 125030 · primeira', 'tipo', 'a', 'ocorrido_em', '2026-11-20T10:00:00')))::text, true);
    PERFORM set_config('teste.ok', 'sim', true);
  EXCEPTION WHEN OTHERS THEN
    f := f || format('FIXTURE falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $fx$;

-- ─── A: por neg_guardar_negocio (como o utilizador) ──────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims', true), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE f text := ''; v_org uuid; n uuid := '12503000-0000-4000-8000-000000000001'; j jsonb;
BEGIN
  IF current_setting('teste.ok') <> 'sim' THEN RETURN; END IF;
  v_org := current_setting('teste.org')::uuid;
  j := current_setting('teste.json')::jsonb;
  BEGIN
    PERFORM public.neg_guardar_negocio(v_org, n, j);
    PERFORM set_config('teste.ids1', (SELECT string_agg(id::text, ',' ORDER BY id) FROM negocio_historico WHERE negocio_id = n), true);
  EXCEPTION WHEN OTHERS THEN f := f || format('A1 a 1.ª gravação falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  BEGIN
    PERFORM public.neg_guardar_negocio(v_org, n, j);
    PERFORM set_config('teste.ids2', (SELECT string_agg(id::text, ',' ORDER BY id) FROM negocio_historico WHERE negocio_id = n), true);
  EXCEPTION WHEN OTHERS THEN f := f || format('A2 a 2.ª gravação falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  BEGIN
    -- sem a «primeira» e com a «segunda» mudada de texto
    PERFORM public.neg_guardar_negocio(v_org, n, jsonb_set(j, '{historico}', jsonb_build_array(
      jsonb_build_object('ordem', 0, 'texto', 'Teste 125030 · segunda (mudada)', 'tipo', 'a', 'ocorrido_em', '2026-11-20T11:00:00'))));
  EXCEPTION WHEN OTHERS THEN f := f || format('A3 a 3.ª gravação falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;
RESET ROLE;

DO $t$
DECLARE f text := ''; n uuid := '12503000-0000-4000-8000-000000000001'; v_min int;
BEGIN
  IF current_setting('teste.ok') <> 'sim' THEN RETURN; END IF;
  IF current_setting('teste.ids1', true) IS NULL OR current_setting('teste.ids1', true) IS DISTINCT FROM current_setting('teste.ids2', true) THEN
    f := f || 'A2 a mesma gravação mudou as linhas do histórico (' || coalesce(current_setting('teste.ids1', true), 'NULL') || ' → ' || coalesce(current_setting('teste.ids2', true), 'NULL') || '); ';
  END IF;
  IF (SELECT count(*) FROM negocio_historico WHERE negocio_id = n) <> 3 THEN
    f := f || 'A3 deviam ficar 3 entradas: ' || (SELECT count(*) FROM negocio_historico WHERE negocio_id = n) || '; ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM negocio_historico WHERE negocio_id = n AND texto = 'Teste 125030 · primeira')
     OR NOT EXISTS (SELECT 1 FROM negocio_historico WHERE negocio_id = n AND texto = 'Teste 125030 · segunda') THEN
    f := f || 'A3 uma entrada que já estava na base saiu ou mudou; ';
  END IF;
  SELECT min(ordem) INTO v_min FROM negocio_historico WHERE negocio_id = n;
  IF (SELECT ordem FROM negocio_historico WHERE negocio_id = n AND texto = 'Teste 125030 · segunda (mudada)') IS DISTINCT FROM v_min THEN
    f := f || 'A3 a entrada nova devia ficar à frente (a menor ordem); ';
  END IF;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;

-- ─── B a F: fn_neg_historico_acrescentar (como postgres) ─────────────────────────
DO $t$
DECLARE
  f text := ''; v_org uuid; n uuid := '12503000-0000-4000-8000-000000000002'; k int; v_autor uuid;
  h jsonb;
BEGIN
  IF current_setting('teste.ok') <> 'sim' THEN RETURN; END IF;
  v_org := current_setting('teste.org')::uuid;
  BEGIN
    -- a base: «Antiga» (09:00, com um autor), «Do outro separador» (09:30), «Chamada sem resposta» (10:00) e a linha do servidor (10:05 UTC)
    SELECT id INTO v_autor FROM anew_users ORDER BY created_at NULLS LAST, id LIMIT 1;
    INSERT INTO negocio_historico (organization_id, negocio_id, ordem, ocorrido_em, texto, tipo)
    VALUES (v_org, n, 3, '2026-07-20T09:00:00+00', 'Antiga', 'a'), (v_org, n, 2, '2026-07-20T09:30:00+00', 'Do outro separador', 'a'),
           (v_org, n, 1, '2026-07-20T10:00:00+00', 'Chamada sem resposta', 'a'), (v_org, n, 0, '2026-07-20T10:05:00+00', 'Visita marcada para ter 21/07 · 10:00', 'a');
    UPDATE negocio_historico SET autor = v_autor WHERE negocio_id = n AND texto = 'Antiga';
    -- o ecrã (aberto antes do «Do outro separador»): uma nova, a segunda chamada (10:30), a linha do servidor com a hora local (11:05),
    -- uma sem data, e as que já tinha
    h := jsonb_build_array(
      jsonb_build_object('ordem', 0, 'texto', 'Nova do ecrã', 'tipo', 'a', 'ocorrido_em', '2026-07-20T11:10:00+00'),
      jsonb_build_object('ordem', 1, 'texto', 'Visita marcada para ter 21/07 · 10:00', 'tipo', 'a', 'ocorrido_em', '2026-07-20T11:05:00+00'),
      jsonb_build_object('ordem', 2, 'texto', 'Chamada sem resposta', 'tipo', 'a', 'ocorrido_em', '2026-07-20T10:30:00+00'),
      jsonb_build_object('ordem', 3, 'texto', 'Chamada sem resposta', 'tipo', 'a', 'ocorrido_em', '2026-07-20T10:00:00+00'),
      jsonb_build_object('ordem', 4, 'texto', 'Sem data', 'tipo', 'a'),
      jsonb_build_object('ordem', 5, 'texto', 'Antiga', 'tipo', 'a', 'ocorrido_em', '2026-07-20T09:00:00+00'));
    k := public.fn_neg_historico_acrescentar(v_org, n, h);
    IF k <> 3 THEN f := f || 'B-E deviam entrar 3 (a nova, a 2.ª chamada e a sem data): entraram ' || k || '; '; END IF;
    -- B
    IF NOT EXISTS (SELECT 1 FROM negocio_historico WHERE negocio_id = n AND texto = 'Do outro separador') THEN f := f || 'B a entrada do outro separador saiu; '; END IF;
    IF NOT EXISTS (SELECT 1 FROM negocio_historico WHERE negocio_id = n AND texto = 'Nova do ecrã') THEN f := f || 'B a nova do ecrã não entrou; '; END IF;
    IF (SELECT ordem FROM negocio_historico WHERE negocio_id = n AND texto = 'Nova do ecrã') <> (SELECT min(ordem) FROM negocio_historico WHERE negocio_id = n) THEN
      f := f || 'B a nova do ecrã devia ficar à frente; ';
    END IF;
    -- C
    IF (SELECT count(*) FROM negocio_historico WHERE negocio_id = n AND texto = 'Chamada sem resposta') <> 2 THEN
      f := f || 'C deviam ficar 2 «Chamada sem resposta»: ' || (SELECT count(*) FROM negocio_historico WHERE negocio_id = n AND texto = 'Chamada sem resposta') || '; ';
    END IF;
    -- D
    IF (SELECT count(*) FROM negocio_historico WHERE negocio_id = n AND texto LIKE 'Visita marcada%') <> 1 THEN f := f || 'D a linha do servidor repetiu-se; '; END IF;
    -- E: outra vez o mesmo JSON: nada entra
    k := public.fn_neg_historico_acrescentar(v_org, n, h);
    IF k <> 0 THEN f := f || 'E a mesma gravação outra vez juntou ' || k || ' entradas; '; END IF;
    IF (SELECT count(*) FROM negocio_historico WHERE negocio_id = n AND texto = 'Sem data') <> 1 THEN f := f || 'E a sem data repetiu-se; '; END IF;
    -- F
    IF (SELECT autor FROM negocio_historico WHERE negocio_id = n AND texto = 'Antiga') IS DISTINCT FROM v_autor THEN f := f || 'F o autor da entrada antiga mudou; '; END IF;
    IF (SELECT count(*) FROM negocio_historico WHERE negocio_id = n) <> 7 THEN
      f := f || 'B-F deviam ficar 7 entradas: ' || (SELECT count(*) FROM negocio_historico WHERE negocio_id = n) || '; ';
    END IF;
  EXCEPTION WHEN OTHERS THEN f := f || format('B-F bloco falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  IF has_function_privilege('authenticated', 'public.fn_neg_historico_acrescentar(uuid,uuid,jsonb)', 'EXECUTE') THEN
    f := f || 'privilégios: fn_neg_historico_acrescentar aberta a authenticated; ';
  END IF;
  IF position('DELETE FROM negocio_historico' IN pg_get_functiondef('public.neg_guardar_negocio(uuid,uuid,jsonb)'::regprocedure)) > 0 THEN
    f := f || 'neg_guardar_negocio ainda apaga o histórico; ';
  END IF;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;

SELECT CASE WHEN current_setting('teste.falhas') = '' AND current_setting('teste.ok') = 'sim'
            THEN 'OK: o histórico só acrescenta — A (3), B (3), C, D, E (2) e F'
            ELSE 'FALHOU: ' || current_setting('teste.falhas')
       END AS resultado;

ROLLBACK;
