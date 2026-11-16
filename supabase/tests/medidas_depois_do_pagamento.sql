-- ============================================================
-- Teste: 20270117830000 medidas_plano_contrato_depois_do_pagamento (base RH)
-- ============================================================
-- SÓ para a base RH (project-ref uetjghdkwbywbftedtth). NUNCA na de produção (tzbfgwpckrfbqcolqxtm).
-- Tudo dentro de BEGIN … ROLLBACK; cada gravação corre num sub-bloco que acaba SEMPRE em RAISE (desfaz-se o que gravou, mesmo
-- quando passa). A venda direta simulada (c) é um UPDATE na transação, que o ROLLBACK final leva. Nada de DDL persistente: só
-- tabelas temporárias ON COMMIT DROP.
--
-- Correr (o resultado é o último SELECT, uma linha por caso + a linha TOTAL):
--   supabase db query --linked --workdir <workdir RH> -f supabase/tests/medidas_depois_do_pagamento.sql
--
-- Dados reais da organização com negócios da Emylia na base RH (b6ffce4f…; o Grupo BMLar não tem nenhum), gravados como uma conta
-- super_admin (tem negocios.obra.planear, negocios.contrato.editar e pessoas.edit: o que falha é do pagamento, não das permissões).
-- O JSON gravado é o que neg_ler_negocios devolve (a mesma forma que o ecrã grava), com só a mudança de cada caso; a obra é a gravada
-- (estado_emylia, tarefas, fases).
--   (a)  1013 «sadasd asdas»: proposta aceite, sem pagamento (Financeiro, 4); contrato v1 em rascunho; plano por aprovar.
--   (a') 1049 «teste 157888»: o mesmo, com as medidas já retificadas e aceites antes de 12/11 (o caso antigo).
--   (a'') 1007 «dassd dsaasd»: aceite, sem pagamento e sem obra (a obra nasce aqui).
--   (b)  1052 «Teste A-Z 15/11»: 1.ª prestação paga (Obra, 5), sem encomenda; contrato v1 em rascunho; plano por aprovar.
--   (c)  1049 com a versão aceite passada a venda direta (só nesta transação).
-- Cobre:
--   0. a conta tem as três permissões; fn_neg_medidas_e_plano_abertos (a)=não (b)=sim (c)=sim; authenticated/anon sem EXECUTE nela
--   1. (a) gravar sem mudar passa; mudar as medidas retificadas, o estado do contrato ou as cláusulas dá NE013; pôr venda_direta no
--      JSON ao mesmo tempo não abre a porta; plano por aprovar passa; aprovado / em curso dá NE013
--   2. (a') gravar sem mudar passa (retif_ e contrato já na base); mudar as notas da retificação dá NE013
--   3. (a'') a obra nova com o plano por aprovar passa; já aprovado dá NE013
--   4. (b) e (c): mudar as medidas, o contrato e aprovar o plano passam
-- ============================================================

BEGIN;

CREATE TEMP TABLE _med_rel (
  n         serial,
  caso      text,
  esperado  text,
  obtido    text,
  resultado text,
  detalhe   text
) ON COMMIT DROP;

CREATE TEMP TABLE _med_casos (ordem int, caso text, tipo text, esperado text, negocio uuid, p jsonb) ON COMMIT DROP;

-- corre os casos de _med_casos como a conta (role authenticated + claims); cada um acaba em RAISE, que desfaz a gravação e a troca de role
CREATE FUNCTION pg_temp.med_correr() RETURNS void LANGUAGE plpgsql AS $f$
DECLARE
  c_org  CONSTANT uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_auth CONSTANT uuid := '08bb24a2-e11f-4f79-b4f7-c5125332da4a';
  c record; v_msg text; v_state text; v_got text; v_ret jsonb;
BEGIN
  FOR c IN SELECT * FROM _med_casos ORDER BY ordem LOOP
    v_msg := NULL; v_state := NULL; v_ret := NULL;
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', c_auth, 'role', 'authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', c_auth::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      IF c.tipo = 'n' THEN
        PERFORM public.neg_guardar_negocio(c_org, c.negocio, c.p);
      ELSE
        v_ret := public.obra_guardar_negocio(c_org, c.negocio, c.p);
      END IF;
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__desfazer__';
    EXCEPTION WHEN OTHERS THEN
      v_msg := SQLERRM; v_state := SQLSTATE;
    END;
    -- a obra só conta como gravada se a função devolveu o id dela (um JSON torto sai cedo, sem gravar nada)
    v_got := CASE WHEN v_msg = '__desfazer__' AND c.tipo = 'o' AND v_ret->>'obra_id' IS NULL THEN 'passa sem gravar a obra'
                  WHEN v_msg = '__desfazer__' THEN 'passa'
                  WHEN v_state = 'NE013' AND v_msg LIKE 'As medidas só se retificam%' THEN 'NE013 medidas'
                  WHEN v_state = 'NE013' AND v_msg LIKE 'O contrato só se prepara%' THEN 'NE013 contrato'
                  WHEN v_state = 'NE013' AND v_msg LIKE 'O plano da obra só se aprova%' THEN 'NE013 plano'
                  ELSE 'erro' END;
    INSERT INTO _med_rel (caso, esperado, obtido, resultado, detalhe)
    VALUES (c.caso, c.esperado, v_got, CASE WHEN v_got = c.esperado THEN 'OK' ELSE 'FALHA' END,
            CASE WHEN v_msg = '__desfazer__' THEN 'gravou (desfeito)' ELSE v_state || ': ' || left(v_msg, 200) END);
  END LOOP;
END $f$;

DO $t$
DECLARE
  c_org   CONSTANT uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_auth  CONSTANT uuid := '08bb24a2-e11f-4f79-b4f7-c5125332da4a';  -- auth.users.id da conta super_admin
  n_a     CONSTANT uuid := 'ace6d96c-999e-48b7-a3a0-ac863e4ca411';  -- 1013 sem pagamento
  n_leg   CONSTANT uuid := 'd5181b7a-1ffb-465f-934a-f4ff7799a4ff';  -- 1049 sem pagamento, retif aceite (depois: venda direta)
  n_nova  CONSTANT uuid := '61c5392e-9e12-4f3c-ba48-30005f7aaa5d';  -- 1007 sem pagamento, sem obra
  n_b     CONSTANT uuid := 'fdf27123-9ec2-4c65-a455-33c12d2c7b85';  -- 1052 pago
  v_claims text := json_build_object('sub', c_auth, 'role', 'authenticated')::text;
  j_a jsonb; j_leg jsonb; j_b jsonb; j_c jsonb;
  o_a jsonb; o_b jsonb; o_c jsonb; o_nova jsonb;
  v_retif jsonb := jsonb_build_object('campo_chave', 'retif_notas', 'valor', 'teste 20270117830000', 'sugerido', false);
  v_cl jsonb := '[{"titulo": "Teste 20270117830000", "texto": "Cláusula de teste."}]';
  r record;
  v_ok boolean; v_det text;
BEGIN
  -- ── preparação (postgres): as obras como estão gravadas ─────────────────────────────────────────────────────────────────────
  -- a obra gravada no formato de obra_guardar_negocio (o estado da Emylia, as tarefas e as fases)
  CREATE TEMP TABLE _med_obras ON COMMIT DROP AS
  SELECT o.negocio_id, jsonb_build_object(
    'estado', o.estado, 'titulo', o.titulo, 'morada', o.morada, 'inicio', o.data_inicio_prevista, 'emylia', o.estado_emylia,
    'fases', coalesce((SELECT jsonb_agg(jsonb_build_object('ordem', f.ordem, 'nome', f.nome) ORDER BY f.ordem) FROM ops_obra_fase f WHERE f.obra_id = o.id), '[]'),
    'tarefas', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'chave', t.chave, 'nome', t.nome, 'fase', f.ordem, 'ordem', t.ordem, 'minutos', t.minutos_previstos, 'inicio', t.inicio_planeado,
        'fim', t.fim_planeado, 'estado', t.estado, 'perfil', k.chave, 'pessoas', t.pessoas_previstas,
        'pessoa', (SELECT rh.pessoa_id FROM ops_obra_tarefa_rh rh WHERE rh.tarefa_id = t.id LIMIT 1)) ORDER BY t.ordem, t.chave)
      FROM ops_obra_tarefa t LEFT JOIN ops_obra_fase f ON f.id = t.fase_id LEFT JOIN ops_skill k ON k.id = t.skill_id
      WHERE t.obra_id = o.id), '[]')) AS p
  FROM ops_obra o WHERE o.organization_id = c_org AND o.negocio_id IN (n_a, n_leg, n_b);
  SELECT p INTO o_a FROM _med_obras WHERE negocio_id = n_a;
  SELECT p INTO o_b FROM _med_obras WHERE negocio_id = n_b;
  SELECT p INTO o_c FROM _med_obras WHERE negocio_id = n_leg;
  o_nova := jsonb_build_object('estado', 'planeada', 'titulo', 'Obra de teste 20270117830000', 'fases', '[{"ordem": 1, "nome": "Fase 1"}]'::jsonb,
    'tarefas', '[{"chave": "t-teste", "nome": "Tarefa de teste", "fase": 1, "ordem": 1, "minutos": 60, "estado": "por_fazer"}]'::jsonb,
    'emylia', '{"plano": {"estado": "por aprovar"}}'::jsonb);

  -- ── 0. pré-condições ───────────────────────────────────────────────────────────────────────────────────────────────────────
  FOR r IN SELECT x.k FROM unnest(ARRAY['negocios.obra.planear', 'negocios.contrato.editar', 'pessoas.edit']) AS x(k) LOOP
    v_ok := NULL;
    BEGIN
      PERFORM set_config('request.jwt.claims', v_claims, true);
      PERFORM set_config('request.jwt.claim.sub', c_auth::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      v_ok := public.fn_cat_pode(c_org, r.k);
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__desfazer__';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> '__desfazer__' THEN v_det := SQLSTATE || ': ' || SQLERRM; END IF;
    END;
    INSERT INTO _med_rel (caso, esperado, obtido, resultado, detalhe)
    VALUES ('0 conta pode ' || r.k, 'sim', CASE WHEN v_ok THEN 'sim' WHEN NOT v_ok THEN 'não' ELSE 'erro' END,
            CASE WHEN v_ok THEN 'OK' ELSE 'FALHA' END, coalesce(v_det, '—'));
  END LOOP;
  INSERT INTO _med_rel (caso, esperado, obtido, resultado, detalhe)
  SELECT x.caso, x.esp, CASE WHEN x.got THEN 'sim' ELSE 'não' END, CASE WHEN x.got = (x.esp = 'sim') THEN 'OK' ELSE 'FALHA' END, '—'
  FROM (VALUES
    ('0 abertos (a) 1013 sem pagamento', 'não', public.fn_neg_medidas_e_plano_abertos(n_a)),
    ('0 abertos (a'') 1049 sem pagamento', 'não', public.fn_neg_medidas_e_plano_abertos(n_leg)),
    ('0 abertos (a'''') 1007 sem pagamento', 'não', public.fn_neg_medidas_e_plano_abertos(n_nova)),
    ('0 abertos (b) 1052 pago', 'sim', public.fn_neg_medidas_e_plano_abertos(n_b)),
    ('0 authenticated executa fn_neg_medidas_e_plano_abertos', 'não', has_function_privilege('authenticated', 'public.fn_neg_medidas_e_plano_abertos(uuid)', 'EXECUTE')),
    ('0 anon executa fn_neg_medidas_e_plano_abertos', 'não', has_function_privilege('anon', 'public.fn_neg_medidas_e_plano_abertos(uuid)', 'EXECUTE')),
    ('0 authenticated executa neg_guardar_negocio', 'sim', has_function_privilege('authenticated', 'public.neg_guardar_negocio(uuid,uuid,jsonb)', 'EXECUTE')),
    ('0 authenticated executa obra_guardar_negocio', 'sim', has_function_privilege('authenticated', 'public.obra_guardar_negocio(uuid,uuid,jsonb)', 'EXECUTE'))
  ) AS x(caso, esp, got);

  -- ── os negócios como o ecrã os lê (como a conta) ───────────────────────────────────────────────────────────────────────────
  BEGIN
    PERFORM set_config('request.jwt.claims', v_claims, true);
    PERFORM set_config('request.jwt.claim.sub', c_auth::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT x INTO j_a FROM jsonb_array_elements(public.neg_ler_negocios(c_org)) x WHERE x->'negocio'->>'id' = n_a::text;
    SELECT x INTO j_leg FROM jsonb_array_elements(public.neg_ler_negocios(c_org)) x WHERE x->'negocio'->>'id' = n_leg::text;
    SELECT x INTO j_b FROM jsonb_array_elements(public.neg_ler_negocios(c_org)) x WHERE x->'negocio'->>'id' = n_b::text;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__desfazer__';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> '__desfazer__' THEN RAISE EXCEPTION 'FALHOU a ler os negócios: % %', SQLSTATE, SQLERRM; END IF;
  END;
  IF j_a IS NULL OR j_leg IS NULL OR j_b IS NULL OR o_a IS NULL OR o_b IS NULL OR o_c IS NULL THEN
    RAISE EXCEPTION 'FALHOU: faltam dados (a %, leg %, b %, obra a %, obra b %, obra c %)', j_a IS NOT NULL, j_leg IS NOT NULL,
      j_b IS NOT NULL, o_a IS NOT NULL, o_b IS NOT NULL, o_c IS NOT NULL;
  END IF;

  -- ── os casos (tipo n = neg_guardar_negocio, o = obra_guardar_negocio) ──────────────────────────────────────────────────────
  INSERT INTO _med_casos VALUES
  -- (a) sem pagamento
  (11, '1 (a) negócio gravado sem mudar', 'n', 'passa', n_a, j_a),
  (12, '1 (a) medidas retificadas (retif_notas)', 'n', 'NE013 medidas', n_a,
       jsonb_set(j_a, '{respostas}', coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(j_a->'respostas') x WHERE x->>'campo_chave' <> 'retif_notas'), '[]') || jsonb_build_array(v_retif))),
  (13, '1 (a) contrato enviado', 'n', 'NE013 contrato', n_a, jsonb_set(j_a, '{contratos,0,estado}', '"enviado"')),
  (14, '1 (a) contrato com cláusula', 'n', 'NE013 contrato', n_a, jsonb_set(j_a, '{contratos,0,clausulas}', v_cl)),
  (15, '1 (a) medidas + venda_direta no JSON', 'n', 'NE013 medidas', n_a,
       jsonb_set(jsonb_set(j_a, '{respostas}', (j_a->'respostas') || jsonb_build_array(v_retif)), '{orcamentos}',
                 (SELECT jsonb_agg(CASE WHEN x->>'estado' = 'aceite' THEN jsonb_set(x, '{venda_direta}', 'true') ELSE x END) FROM jsonb_array_elements(j_a->'orcamentos') x))),
  (16, '1 (a) obra gravada sem mudar (plano por aprovar)', 'o', 'passa', n_a, o_a),
  (17, '1 (a) plano aprovado', 'o', 'NE013 plano', n_a, jsonb_set(o_a, '{emylia,plano,estado}', '"aprovado"')),
  (18, '1 (a) plano em curso', 'o', 'NE013 plano', n_a, jsonb_set(o_a, '{emylia,plano,estado}', '"em curso"')),
  -- (a') o caso antigo: medidas aceites antes de 12/11, sem pagamento
  (21, '2 (a'') negócio gravado sem mudar (retif_ e contrato já na base)', 'n', 'passa', n_leg, j_leg),
  (22, '2 (a'') mudar as notas da retificação', 'n', 'NE013 medidas', n_leg,
       jsonb_set(j_leg, '{respostas}', coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(j_leg->'respostas') x WHERE x->>'campo_chave' <> 'retif_notas'), '[]') || jsonb_build_array(v_retif))),
  (23, '2 (a'') obra gravada sem mudar (plano por aprovar)', 'o', 'passa', n_leg, o_c),
  -- (a'') a obra nasce
  (31, '3 (a'''') obra nova com o plano por aprovar', 'o', 'passa', n_nova, o_nova),
  (32, '3 (a'''') obra nova com o plano aprovado', 'o', 'NE013 plano', n_nova, jsonb_set(o_nova, '{emylia,plano,estado}', '"aprovado"')),
  -- (b) pago
  (41, '4 (b) negócio gravado sem mudar', 'n', 'passa', n_b, j_b),
  (42, '4 (b) medidas retificadas', 'n', 'passa', n_b, jsonb_set(j_b, '{respostas}', (j_b->'respostas') || jsonb_build_array(v_retif))),
  (43, '4 (b) contrato enviado', 'n', 'passa', n_b, jsonb_set(j_b, '{contratos,0,estado}', '"enviado"')),
  (44, '4 (b) contrato com cláusula', 'n', 'passa', n_b, jsonb_set(j_b, '{contratos,0,clausulas}', v_cl)),
  (45, '4 (b) plano aprovado', 'o', 'passa', n_b, jsonb_set(o_b, '{emylia,plano,estado}', '"aprovado"'));

  -- ── correr: cada caso num sub-bloco que acaba em RAISE ─────────────────────────────────────────────────────────────────────
  PERFORM pg_temp.med_correr();

  -- (c) venda direta aceite (só nesta transação): a versão aceite de 1049 passa a venda direta; lê-se de novo e corre-se
  UPDATE quotes SET venda_direta = true
  WHERE negocio_id = n_leg AND fluxo_emylia AND adenda_id IS NULL AND deleted_at IS NULL AND estado = 'aceite';
  INSERT INTO _med_rel (caso, esperado, obtido, resultado, detalhe)
  VALUES ('0 abertos (c) 1049 venda direta aceite', 'sim', CASE WHEN public.fn_neg_medidas_e_plano_abertos(n_leg) THEN 'sim' ELSE 'não' END,
          CASE WHEN public.fn_neg_medidas_e_plano_abertos(n_leg) THEN 'OK' ELSE 'FALHA' END, '—');
  BEGIN
    PERFORM set_config('request.jwt.claims', v_claims, true);
    PERFORM set_config('request.jwt.claim.sub', c_auth::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT x INTO j_c FROM jsonb_array_elements(public.neg_ler_negocios(c_org)) x WHERE x->'negocio'->>'id' = n_leg::text;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__desfazer__';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> '__desfazer__' THEN RAISE EXCEPTION 'FALHOU a ler o negócio (c): % %', SQLSTATE, SQLERRM; END IF;
  END;
  DELETE FROM _med_casos;
  INSERT INTO _med_casos VALUES
  (51, '5 (c) venda direta: mudar as notas da retificação', 'n', 'passa', n_leg,
       jsonb_set(j_c, '{respostas}', coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(j_c->'respostas') x WHERE x->>'campo_chave' <> 'retif_notas'), '[]') || jsonb_build_array(v_retif))),
  (52, '5 (c) venda direta: contrato com cláusula', 'n', 'passa', n_leg, jsonb_set(j_c, '{contratos,0,clausulas}', v_cl)),
  (53, '5 (c) venda direta: plano aprovado', 'o', 'passa', n_leg, jsonb_set(o_c, '{emylia,plano,estado}', '"aprovado"'));
  PERFORM pg_temp.med_correr();
END $t$;

SELECT caso, esperado, obtido, resultado, detalhe
FROM (
  SELECT n, caso, esperado, obtido, resultado, detalhe FROM _med_rel
  UNION ALL
  SELECT 1000000, 'TOTAL', count(*)::text || ' verificações', NULL, count(*) FILTER (WHERE resultado = 'FALHA')::text || ' FALHA(S)',
         string_agg(caso, ', ') FILTER (WHERE resultado = 'FALHA')
  FROM _med_rel
) s
ORDER BY n;

ROLLBACK;
