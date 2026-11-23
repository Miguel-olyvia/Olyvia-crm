-- ============================================================
-- Testes: 20270126250000_visita_auto_e_preencher.sql (base RH, Mudelar)
-- ============================================================
-- O motor da Emylia (src/emylia/motor.ts, sincronizarVisita) marca sozinho a visita como feita quando as necessidades ficam completas
-- (v<n>_estado Marcada -> Feita e v<n>_auto = '1') e desfaz isso quando deixam de estar (Feita -> Marcada, sem v<n>_auto). Isso é
-- preencher a visita (negocios.visita.preencher): o comercial (só preencher) tem de conseguir gravá-lo. Tudo o resto da agenda (dia,
-- hora, quem, cancelar, dar como feita à mão) continua a pedir negocios.visita.gerir.
--
-- Contas reais da Mudelar (3242e925): Rui Jesus (comercial: preencher, sem gerir) e a assistente comercial de teste (gerir, sem preencher).
-- Tudo dentro de BEGIN … ROLLBACK; cada caso acaba em RAISE (desfaz-se) e parte do mesmo negócio de teste (visita 1 marcada).
--
-- Correr (o resultado útil é o último SELECT):
--   rhq.ps1 -SqlFile supabase/tests/visita_auto_e_preencher.test.sql
-- ============================================================

BEGIN;
CREATE TEMP TABLE _rel (n serial, caso text, esperado text, obtido text) ON COMMIT DROP;

-- corre os passos (cada um {auth, json}) por ordem e desfaz tudo; devolve PASSA ou «código: mensagem» do primeiro que falhar
CREATE FUNCTION pg_temp.tentar(p_passos jsonb) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v_msg text; v_st text; p jsonb;
BEGIN
  BEGIN
    FOR p IN SELECT * FROM jsonb_array_elements(p_passos) LOOP
      EXECUTE 'RESET ROLE';
      PERFORM set_config('request.jwt.claims', json_build_object('sub', p->>'auth', 'role', 'authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', p->>'auth', true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM public.neg_guardar_negocio('3242e925-da26-459a-8258-be04d904e355', 'e2e0e2e0-0000-4000-8000-0000000a0701', p->'json');
    END LOOP;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__desfazer__';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_st = RETURNED_SQLSTATE;
  END;
  EXECUTE 'RESET ROLE';
  IF v_msg = '__desfazer__' THEN RETURN 'PASSA'; END IF;
  RETURN v_st || ': ' || left(v_msg, 200);
END $f$;

-- o JSON do negócio com a visita 1 nos estados pedidos (p_v: as respostas v1_ a mudar; null tira a chave)
CREATE FUNCTION pg_temp.j(p_v jsonb) RETURNS jsonb LANGUAGE sql AS $f$
  WITH base(k, v) AS (VALUES ('resultado', 'Atendeu · interessado'), ('tentativas', '1'), ('contacto_concluido', '2026-11-23'),
                             ('v1_data', '2026-11-25'), ('v1_hora', '10:00'), ('v1_tipo', 'Levantamento'), ('v1_estado', 'Marcada'),
                             ('v1_quem', 'Rui Jesus'), ('v1_duracao', '1 h')),
       todas AS (SELECT b.k, CASE WHEN p_v ? b.k THEN p_v->>b.k ELSE b.v END AS v FROM base b
                 UNION ALL SELECT x.key, x.value #>> '{}' FROM jsonb_each(p_v) x WHERE x.key NOT IN (SELECT k FROM base))
  SELECT jsonb_build_object(
    'negocio', jsonb_build_object('fase', 2, 'linha', 'wc', 'linha_por_definir', false, 'servico_pedido', 'Casa de banho', 'origem', 'à mão',
                                  'dono_papel', 'comercial', 'titulo', 'Teste 126250 visita auto', 'morada_obra', 'Rua de Teste, 1'),
    'respostas', (SELECT jsonb_agg(jsonb_build_object('campo_chave', k, 'valor', v, 'sugerido', false)) FROM todas WHERE v IS NOT NULL),
    'medidas', jsonb_build_object('slot', 'qua 25/11 · 10:00', 'fechada', false, 'necessidades', '[]'::jsonb),
    'visitas', '[1]'::jsonb, 'servicos', '[]'::jsonb, 'produtos', '[]'::jsonb, 'historico', '[]'::jsonb,
    'orcamentos', '[]'::jsonb, 'contratos', '[]'::jsonb, 'faturas', '[]'::jsonb, 'adendas', '[]'::jsonb)
$f$;

-- ─── preparação: a assistente cria a pessoa e o negócio (dono: Rui Jesus) e marca a visita 1 ───────────────────────────
DO $fx$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"e2d4acad-8911-40c8-8eb5-26282d57f577","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'e2d4acad-8911-40c8-8eb5-26282d57f577', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO anew_entities (id, organization_id, type, display_name, first_name, last_name, created_by)
  VALUES ('e2e0e2e0-0000-4000-8000-0000000a07e1', '3242e925-da26-459a-8258-be04d904e355', 'person', 'Cliente Teste 126250', 'Cliente', 'Teste',
          public.current_business_user_id());
  PERFORM public.neg_criar_negocio('e2e0e2e0-0000-4000-8000-0000000a0701', '3242e925-da26-459a-8258-be04d904e355',
    'e2e0e2e0-0000-4000-8000-0000000a07e1', 'Teste 126250 visita auto', null, '830efc80-4a52-4a7e-ab66-6ea233a14f9e'::uuid, '[]'::jsonb,
    null, null, false, 'contrato');
  PERFORM public.neg_guardar_negocio('3242e925-da26-459a-8258-be04d904e355', 'e2e0e2e0-0000-4000-8000-0000000a0701', pg_temp.j('{}'));
  EXECUTE 'RESET ROLE';
END $fx$;

DO $t$
DECLARE
  com text := '6de385dc-b039-46dc-b793-c5cdefc095c3';  -- Rui Jesus, comercial
  ass text := 'e2d4acad-8911-40c8-8eb5-26282d57f577';  -- assistente comercial
  auto_feita jsonb := '{"v1_estado": "Feita", "v1_auto": "1"}';
  pc boolean; pg boolean; pa boolean; ga boolean;
BEGIN
  -- 0. as permissões das duas contas (o pressuposto do teste)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', com, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', com, true);
  pc := public.fn_cat_pode('3242e925-da26-459a-8258-be04d904e355', 'negocios.visita.preencher');
  pg := public.fn_cat_pode('3242e925-da26-459a-8258-be04d904e355', 'negocios.visita.gerir');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ass, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', ass, true);
  pa := public.fn_cat_pode('3242e925-da26-459a-8258-be04d904e355', 'negocios.visita.preencher');
  ga := public.fn_cat_pode('3242e925-da26-459a-8258-be04d904e355', 'negocios.visita.gerir');
  INSERT INTO _rel (caso, esperado, obtido) VALUES
    ('00 comercial: preencher sim, gerir não', 'true/false', pc || '/' || pg),
    ('00 assistente: preencher não, gerir sim', 'false/true', pa || '/' || ga);

  -- 1. o comercial grava a visita feita pelo motor (Marcada -> Feita com v1_auto)
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('01 comercial: motor marca feita (v1_auto)', 'PASSA',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j(auto_feita)))));
  -- 2. e o inverso do motor (Feita com v1_auto -> Marcada, sem v1_auto); a feita automática gravada pela assistente (gerir, como antes)
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('02 comercial: motor volta a marcada (tira v1_auto)', 'PASSA',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', ass, 'json', pg_temp.j(auto_feita)),
                                     jsonb_build_object('auth', com, 'json', pg_temp.j('{}')))));
  -- 3. a assistente (só gerir) continua a gravar a feita automática, como antes
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('03 assistente: motor marca feita (como antes)', 'PASSA',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', ass, 'json', pg_temp.j(auto_feita)))));
  -- 4 a 9. o resto da agenda continua a pedir negocios.visita.gerir ao comercial
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('04 comercial: dar como feita à mão (sem v1_auto)', 'CT001 gerir',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j('{"v1_estado": "Feita"}')))));
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('05 comercial: cancelar a visita', 'CT001 gerir',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j('{"v1_estado": "Cancelada"}')))));
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('06 comercial: remarcar o dia', 'CT001 gerir',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j('{"v1_data": "2026-11-26"}')))));
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('07 comercial: feita pelo motor e mudar quem vai', 'CT001 gerir',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j(auto_feita || '{"v1_quem": "Outra pessoa"}')))));
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('08 comercial: feita pelo motor e mudar a hora', 'CT001 gerir',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j(auto_feita || '{"v1_hora": "15:00"}')))));
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('09 comercial: feita automática -> Cancelada (tira v1_auto)', 'CT001 gerir',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', ass, 'json', pg_temp.j(auto_feita)),
                                     jsonb_build_object('auth', com, 'json', pg_temp.j('{"v1_estado": "Cancelada"}')))));
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('10 comercial: só v1_auto, sem mudar o estado', 'CT001 gerir',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j('{"v1_auto": "1"}')))));
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('11 comercial: marcar uma 2.ª visita feita pelo motor', 'CT001 gerir',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json',
      jsonb_set(pg_temp.j('{"v2_data": "2026-11-27", "v2_hora": "10:00", "v2_estado": "Feita", "v2_auto": "1"}'), '{visitas}', '[1, 2]')))));
  -- 12. a assistente continua sem poder preencher (o motor não lhe abre a porta a outras respostas)
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('12 assistente: feita pelo motor e uma resposta do diagnóstico', 'CT001 preencher',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', ass, 'json', pg_temp.j(auto_feita || '{"diag_humidade": "Sim"}')))));
  -- 13. gravar sem mudar nada passa a todos
  INSERT INTO _rel (caso, esperado, obtido) VALUES ('13 comercial: gravar sem mudar', 'PASSA',
    pg_temp.tentar(jsonb_build_array(jsonb_build_object('auth', com, 'json', pg_temp.j('{}')))));
END $t$;

SELECT json_agg(x ORDER BY x.n) FROM (
  SELECT n, caso, esperado, obtido,
         CASE WHEN esperado = obtido OR (esperado = 'PASSA' AND obtido = 'PASSA')
                   OR (esperado = 'CT001 gerir' AND obtido LIKE 'CT001: Sem permissão (negocios.visita.gerir)%')
                   OR (esperado = 'CT001 preencher' AND obtido LIKE 'CT001: Sem permissão (negocios.visita.preencher)%')
              THEN 'OK' ELSE 'FALHA' END AS resultado
  FROM _rel
  UNION ALL
  SELECT 9999, 'TOTAL', count(*)::text || ' verificações', null,
         count(*) FILTER (WHERE NOT (esperado = obtido
                   OR (esperado = 'CT001 gerir' AND obtido LIKE 'CT001: Sem permissão (negocios.visita.gerir)%')
                   OR (esperado = 'CT001 preencher' AND obtido LIKE 'CT001: Sem permissão (negocios.visita.preencher)%')))::text || ' FALHA(S)'
  FROM _rel) x;

ROLLBACK;
