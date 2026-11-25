-- 23/11 (20270125700000 + 20270125800000): o técnico de obra volta a gravar a execução e o imprevisto «impede» da sua tarefa.
-- SÓ na base do ramo RH (uetjghdkwbywbftedtth). Nunca na de produção.
-- Obra OB-1009 (negócio 0d6314e6-…), técnicos Gustavo Silva (e9baeebd-…) e Lucas Andrade (623cd1a4-…); supervisor de obra e
-- Org Admin com negocios.obra.planear. Tudo em BEGIN … ROLLBACK; cada caso corre num sub-bloco que acaba sempre em RAISE
-- (o que a gravação escreveu é desfeito mesmo quando passa). Resultado: o último SELECT (uma linha por caso, esperado/obtido,
-- e TOTAL com o número de FALHAS e os md5 da obra antes/depois, que têm de ser iguais).
--   · F2: o «lido» dos avisos (a->'plano'->'avisos'->j - 'lido' lia-se ->(j - 'lido') → 22P02) recusava qualquer gravação do técnico
--     com avisos dele no plano.
--   · O imprevisto do técnico (motor.registarImprevisto sem negocios.obra.planear): só o imprevisto, a paragem da tarefa dele e a
--     ocorrência no diário; sem alterações/aviso ao cliente (essas continuam recusadas, como as datas, a validação, o «atrasa» e as
--     tarefas de outros). As datas da tabela (ops_obra_tarefa) não se recusam ao técnico: ficam as da base (caso 14).
--   · 23/11 (20270125800000, pedido de atraso): o «Atrasa» do técnico é um pedido (grav 'atrasa', pedido 'pendente', atraso = dias):
--     passa nas tarefas dele sem mudar o plano (06); recusado em tarefas de outros, com aviso ao cliente, com as datas mudadas, com
--     custo, sem dias ou sem gravidade (18-23); aceitar/recusar o pedido gravado é de quem planeia (24-26: o técnico não; o gestor sim,
--     e ao aceitar o plano anda). Os casos 01-17 ficam iguais (regressão).
BEGIN;
CREATE TEMP TABLE _rel (n serial, caso text, conta text, esperado text, obtido text) ON COMMIT DROP;
CREATE TEMP TABLE _contas (ordem int, conta text, email text, tec text, tecnico boolean, auth uuid) ON COMMIT DROP;
INSERT INTO _contas VALUES
  (1, 'Gustavo (técnico)',  'gustavoprsilva99@gmail.com', 'e9baeebd-8984-4d6d-bbfc-001bfc4140f4', true, NULL),
  (2, 'Lucas (técnico)',    'juary1987@live.com.pt',      '623cd1a4-a3e1-495f-86d8-3d6f4f7151f1', true, NULL),
  (3, 'Supervisor de obra', 'mickael.dinis@outlook.fr',   NULL, false, NULL),
  (4, 'Org Admin',          'marco.rodrigues@bmlar.pt',   NULL, false, NULL);
UPDATE _contas c SET auth = u.auth_user_id FROM anew_users u WHERE lower(u.email) = lower(c.email);

CREATE FUNCTION pg_temp.tentar(p_auth uuid, p_sql text, p_ver text DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v_ret text; v_msg text; v_st text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', p_auth::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE p_sql INTO v_ret;
    -- o que ficou gravado (lido como postgres, antes de desfazer)
    IF p_ver IS NOT NULL THEN EXECUTE 'RESET ROLE'; EXECUTE p_ver INTO v_ret; END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__desfazer__', DETAIL = coalesce(v_ret, '');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_st = RETURNED_SQLSTATE, v_ret = PG_EXCEPTION_DETAIL;
  END;
  IF v_msg = '__desfazer__' THEN RETURN rtrim('PASSA ' || coalesce(v_ret, '')); END IF;
  RETURN v_st || ': ' || left(v_msg, 200);
END $f$;

-- a obra como o ecrã a manda (obra_guardar_negocio)
CREATE FUNCTION pg_temp.obra(p_neg uuid) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_build_object(
    'estado', o.estado, 'titulo', o.titulo, 'morada', o.morada, 'inicio', o.data_inicio_prevista, 'emylia', o.estado_emylia,
    'fases', coalesce((SELECT jsonb_agg(jsonb_build_object('ordem', f.ordem, 'nome', f.nome) ORDER BY f.ordem) FROM ops_obra_fase f WHERE f.obra_id = o.id), '[]'),
    'tarefas', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'chave', t.chave, 'nome', t.nome, 'fase', f.ordem, 'ordem', t.ordem, 'minutos', t.minutos_previstos, 'inicio', t.inicio_planeado,
        'fim', t.fim_planeado, 'estado', t.estado, 'perfil', k.chave, 'pessoas', t.pessoas_previstas,
        'pessoa', (SELECT rh.pessoa_id FROM ops_obra_tarefa_rh rh WHERE rh.tarefa_id = t.id LIMIT 1)) ORDER BY t.ordem, t.chave)
      FROM ops_obra_tarefa t LEFT JOIN ops_obra_fase f ON f.id = t.fase_id LEFT JOIN ops_skill k ON k.id = t.skill_id
      WHERE t.obra_id = o.id), '[]'))
  FROM ops_obra o WHERE o.negocio_id = p_neg
$f$;
CREATE FUNCTION pg_temp.md5_obra(p_neg uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT md5(o.estado_emylia::text || coalesce((SELECT string_agg(t.chave || ':' || t.estado || ':' || coalesce(t.inicio_planeado::text, ''), ',' ORDER BY t.chave)
                                              FROM ops_obra_tarefa t WHERE t.obra_id = o.id), ''))
  FROM ops_obra o WHERE o.negocio_id = p_neg
$f$;

DO $t$
DECLARE
  o CONSTANT uuid := '3242e925-da26-459a-8258-be04d904e355';
  n CONSTANT uuid := '0d6314e6-9ad2-4b65-b9b9-76a7431a9da3';
  ob jsonb := pg_temp.obra('0d6314e6-9ad2-4b65-b9b9-76a7431a9da3');
  e jsonb; c record; k int; v jsonb; ver text; mi int; oi int; vi int; im jsonb; alt jsonb; esp text; caso text; i int; ch text;
  pe jsonb; dias jsonb; -- 23/11: o pedido de atraso e as datas do plano (dia, dur) antes
  CASOS CONSTANT text[] := ARRAY['01 gravar sem mudar', '02 execução: a sua tarefa em curso (estado Emylia + tabela)', '03 marcar como lido o seu aviso',
    '04 imprevisto «impede» na sua tarefa (o que o motor manda sem planear)', '05 o mesmo + aviso novo para si',
    '10 imprevisto com alteração/aviso ao cliente', '11 imprevisto «impede» na tarefa de outro', '12 imprevisto «atrasa» na sua tarefa',
    '13 replanear: o dia da sua tarefa', '14 datas da tarefa na tabela (passa, mas não se gravam)', '15 validar a sua tarefa', '16 só a alteração com aviso ao cliente',
    '17 marcar como lido o aviso de outro',
    '06 pedido de atraso na sua tarefa (o plano não muda)', '18 pedido de atraso na tarefa de outro', '19 pedido de atraso com aviso ao cliente',
    '20 pedido de atraso com as datas mudadas', '21 pedido de atraso com custo', '22 pedido de atraso sem dias', '23 imprevisto sem gravidade',
    '24 aceitar o pedido gravado (o plano anda)', '25 recusar o pedido gravado', '26 aceitar o pedido sem aviso ao cliente'];
BEGIN
  e := ob->'emylia';
  dias := (SELECT jsonb_agg(jsonb_build_array(t->'dia', t->'dur') ORDER BY w) FROM jsonb_array_elements(e->'plano'->'tasks') WITH ORDINALITY x(t, w));
  FOR c IN SELECT * FROM _contas ORDER BY ordem LOOP
    -- a tarefa dele (por começar), a de outro e um aviso dele / de outro no plano
    mi := CASE WHEN c.tec = 'e9baeebd-8984-4d6d-bbfc-001bfc4140f4' OR NOT c.tecnico THEN 4 ELSE 3 END;
    oi := CASE WHEN mi = 4 THEN 3 ELSE 4 END;
    FOR k IN 1 .. array_length(CASOS, 1) LOOP
      caso := CASOS[k]; v := NULL; ver := NULL;
      im := jsonb_build_object('id', 'imp-teste', 'q', 'hoje 10:00', 'dia', e->'plano'->'dia', 'quem', 'Teste', 'texto', 'teste', 'onde', '', 'grav', 'impede',
                               'tarefas', jsonb_build_array(e->'plano'->'tasks'->mi->>'nome'), 'estado', 'aberto');
      alt := jsonb_build_object('q', 'hoje 10:00', 'dia', e->'plano'->'dia', 'quem', 'Teste', 't', 'Imprevisto: teste', 'motivo', 'Imprevisto', 'fimAntes', 'x', 'fimDepois', 'x',
                                'cliente', true, 'avisoCliente', 'teste');
      CASE left(caso, 2)
        WHEN '01' THEN v := ob;
        WHEN '02' THEN
          v := jsonb_set(ob, ARRAY['emylia', 'plano', 'tasks', mi::text, 'exec'], '{"estado":"em curso","envios":[{"k":"registo","q":"hoje 10:00"}]}');
          ch := (SELECT x->>'chave' FROM jsonb_array_elements(ob->'tarefas') x WHERE x->>'pessoa' = coalesce(c.tec, 'e9baeebd-8984-4d6d-bbfc-001bfc4140f4') AND x->>'estado' = 'por_fazer' LIMIT 1);
          v := jsonb_set(v, '{tarefas}', (SELECT jsonb_agg(CASE WHEN x->>'chave' = ch THEN jsonb_set(x, '{estado}', '"em_curso"') ELSE x END) FROM jsonb_array_elements(ob->'tarefas') x));
        WHEN '03', '17' THEN
          vi := (SELECT (w.i - 1)::int FROM jsonb_array_elements(e->'plano'->'avisos') WITH ORDINALITY w(a, i)
                 WHERE (left(caso, 2) = '03') = (w.a->>'tec' = coalesce(c.tec, 'e9baeebd-8984-4d6d-bbfc-001bfc4140f4')) ORDER BY (w.a ? 'lido'), w.i LIMIT 1);
          v := jsonb_set(ob, ARRAY['emylia', 'plano', 'avisos', vi::text, 'lido'], '"hoje 10:00"');
        WHEN '04', '05', '10', '11', '12' THEN
          IF left(caso, 2) = '11' THEN im := jsonb_set(im, '{tarefas}', jsonb_build_array(e->'plano'->'tasks'->oi->>'nome')); END IF;
          IF left(caso, 2) = '12' THEN im := im || '{"grav":"atrasa","atraso":1}'; END IF;
          i := CASE WHEN left(caso, 2) = '11' THEN oi ELSE mi END;
          v := jsonb_set(ob, '{emylia,imprevistos}', coalesce(e->'imprevistos', '[]') || jsonb_build_array(im));
          IF left(caso, 2) <> '12' THEN v := jsonb_set(v, ARRAY['emylia', 'plano', 'tasks', i::text, 'bloqueio'], '"imp-teste"');
          ELSE v := jsonb_set(v, ARRAY['emylia', 'plano', 'tasks', i::text, 'dia'], to_jsonb((e->'plano'->'tasks'->i->>'dia')::numeric + 1)); END IF;
          v := jsonb_set(v, '{emylia,diario}', coalesce(e->'diario', '[]') || '[{"q":"hoje 10:00","quem":"Teste","t":"Imprevisto: teste","k":"ocorrencia"}]');
          IF left(caso, 2) = '05' THEN
            v := jsonb_set(v, '{emylia,plano,avisos}', coalesce(e->'plano'->'avisos', '[]')
                 || jsonb_build_array(jsonb_build_object('tec', coalesce(c.tec, e->'plano'->'tasks'->mi->>'tec'), 'ti', mi, 't', 'parada por um imprevisto', 'q', 'hoje 10:00')));
          END IF;
          IF left(caso, 2) = '10' THEN v := jsonb_set(v, '{emylia,alteracoes}', jsonb_build_array(alt) || coalesce(e->'alteracoes', '[]')); END IF;
        WHEN '13' THEN v := jsonb_set(ob, ARRAY['emylia', 'plano', 'tasks', mi::text, 'dia'], to_jsonb((e->'plano'->'tasks'->mi->>'dia')::numeric + 1));
        WHEN '14' THEN
          ch := (SELECT x->>'chave' FROM jsonb_array_elements(ob->'tarefas') x WHERE x->>'pessoa' = coalesce(c.tec, 'e9baeebd-8984-4d6d-bbfc-001bfc4140f4') AND x->>'estado' = 'por_fazer' LIMIT 1);
          v := jsonb_set(ob, '{tarefas}', (SELECT jsonb_agg(CASE WHEN x->>'chave' = ch THEN jsonb_set(jsonb_set(x, '{inicio}', to_jsonb(coalesce((x->>'inicio')::date, current_date) + 1)), '{fim}', to_jsonb(greatest(coalesce((x->>'fim')::date, current_date), coalesce((x->>'inicio')::date, current_date) + 1))) ELSE x END) FROM jsonb_array_elements(ob->'tarefas') x));
          -- sem planear a gravação passa mas as datas da tabela ficam as da base (só a execução se grava)
          ver := format($v$SELECT CASE WHEN t.inicio_planeado IS NOT DISTINCT FROM %L::date THEN 'data ignorada' ELSE 'data gravada' END
                           FROM ops_obra_tarefa t JOIN ops_obra ob ON ob.id = t.obra_id WHERE ob.negocio_id = %L AND t.chave = %L$v$,
                        (SELECT x->>'inicio' FROM jsonb_array_elements(ob->'tarefas') x WHERE x->>'chave' = ch), n, ch);
        WHEN '15' THEN
          v := jsonb_set(ob, ARRAY['emylia', 'plano', 'tasks', mi::text, 'exec'], '{"estado":"validada","validada":"hoje 10:00","envios":[{"k":"validada","q":"hoje 10:00"}]}');
        WHEN '16' THEN v := jsonb_set(ob, '{emylia,alteracoes}', jsonb_build_array(alt) || coalesce(e->'alteracoes', '[]'));
        -- 23/11: o pedido de atraso (o que motor.registarImprevisto manda sem planear: o imprevisto e a ocorrência no diário)
        WHEN '06', '18', '19', '20', '21', '22', '23' THEN
          pe := im || '{"grav":"atrasa","atraso":2,"pedido":"pendente"}';
          IF left(caso, 2) = '18' THEN pe := jsonb_set(pe, '{tarefas}', jsonb_build_array(e->'plano'->'tasks'->oi->>'nome')); END IF;
          IF left(caso, 2) = '21' THEN pe := pe || '{"custo":150}'; END IF;
          IF left(caso, 2) = '22' THEN pe := pe - 'atraso'; END IF;
          IF left(caso, 2) = '23' THEN pe := pe - 'grav'; END IF;
          v := jsonb_set(ob, '{emylia,imprevistos}', coalesce(e->'imprevistos', '[]') || jsonb_build_array(pe));
          v := jsonb_set(v, '{emylia,diario}', coalesce(e->'diario', '[]') || '[{"q":"hoje 10:00","quem":"Teste","t":"Imprevisto: teste · pede para atrasar 2 dias","k":"ocorrencia"}]');
          IF left(caso, 2) = '19' THEN v := jsonb_set(v, '{emylia,alteracoes}', jsonb_build_array(alt) || coalesce(e->'alteracoes', '[]')); END IF;
          IF left(caso, 2) = '20' THEN v := jsonb_set(v, ARRAY['emylia', 'plano', 'tasks', mi::text, 'dur'], to_jsonb((e->'plano'->'tasks'->mi->>'dur')::numeric + 2)); END IF;
          IF left(caso, 2) = '06' THEN
            ver := format($v$SELECT CASE WHEN (SELECT jsonb_agg(jsonb_build_array(t->'dia', t->'dur') ORDER BY w) FROM jsonb_array_elements(o.estado_emylia->'plano'->'tasks') WITH ORDINALITY x(t, w)) = %L::jsonb
                                         THEN 'plano igual' ELSE 'plano mudou' END FROM ops_obra o WHERE o.negocio_id = %L$v$, dias, n);
          END IF;
        -- 23/11: aceitar/recusar o pedido já gravado (a base com o pedido; repõe-se depois do caso)
        WHEN '24', '25', '26' THEN
          pe := im || '{"grav":"atrasa","atraso":2,"pedido":"pendente"}';
          UPDATE ops_obra SET estado_emylia = jsonb_set(e, '{imprevistos}', coalesce(e->'imprevistos', '[]') || jsonb_build_array(pe)) WHERE negocio_id = n;
          v := jsonb_set(ob, '{emylia,imprevistos}', coalesce(e->'imprevistos', '[]') || jsonb_build_array(pe || CASE WHEN left(caso, 2) = '25'
                 THEN '{"pedido":"recusado","estado":"fechado","decisao":"Atraso recusado pelo gestor da obra"}'::jsonb ELSE '{"pedido":"aceite"}'::jsonb END));
          IF left(caso, 2) IN ('24', '26') THEN
            v := jsonb_set(v, ARRAY['emylia', 'plano', 'tasks', mi::text, 'dur'], to_jsonb((e->'plano'->'tasks'->mi->>'dur')::numeric + 2));
            v := jsonb_set(v, '{emylia,diario}', coalesce(e->'diario', '[]') || '[{"q":"hoje 10:00","quem":"Teste","t":"Atraso de 2 dias aceite","k":"nota"}]');
          END IF;
          IF left(caso, 2) = '24' THEN v := jsonb_set(v, '{emylia,alteracoes}', jsonb_build_array(alt) || coalesce(e->'alteracoes', '[]')); END IF;
          ver := format($v$SELECT CASE WHEN (SELECT jsonb_agg(jsonb_build_array(t->'dia', t->'dur') ORDER BY w) FROM jsonb_array_elements(o.estado_emylia->'plano'->'tasks') WITH ORDINALITY x(t, w)) = %L::jsonb
                                       THEN 'plano igual' ELSE 'plano andou' END FROM ops_obra o WHERE o.negocio_id = %L$v$, dias, n);
      END CASE;
      -- o técnico só passa nos casos 01-05; quem planeia passa em todos
      esp := CASE WHEN left(caso, 2) = '14' THEN CASE WHEN c.tecnico THEN 'PASSA data ignorada' ELSE 'PASSA data gravada' END
                  WHEN left(caso, 2) = '06' THEN 'PASSA plano igual'
                  WHEN left(caso, 2) IN ('24', '26') AND NOT c.tecnico THEN 'PASSA plano andou'
                  WHEN left(caso, 2) = '25' AND NOT c.tecnico THEN 'PASSA plano igual'
                  WHEN NOT c.tecnico OR left(caso, 1) = '0' THEN 'PASSA' ELSE 'CT001' END;
      INSERT INTO _rel (caso, conta, esperado, obtido)
      VALUES (caso, c.conta, esp, pg_temp.tentar(c.auth, format('SELECT public.obra_guardar_negocio(%L,%L,%L)::text', o, n, v), ver));
      IF left(caso, 2) IN ('24', '25', '26') THEN UPDATE ops_obra SET estado_emylia = e WHERE negocio_id = n; END IF;
    END LOOP;
  END LOOP;
END $t$;

SELECT json_agg(r ORDER BY r.n) FROM (
  SELECT n, caso, conta, esperado, obtido, CASE WHEN left(obtido, length(esperado)) = esperado THEN 'ok' ELSE 'FALHA' END AS resultado FROM _rel
  UNION ALL
  SELECT 9999, 'TOTAL', NULL, '0', (SELECT count(*)::text FROM _rel WHERE left(obtido, length(esperado)) <> esperado),
         'md5 obra ' || pg_temp.md5_obra('0d6314e6-9ad2-4b65-b9b9-76a7431a9da3')
) r;
ROLLBACK;
