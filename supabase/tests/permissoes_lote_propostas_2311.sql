-- ============================================================
-- PERMISSÕES — lote propostas/visitas (23/11/2026): C5 (recusar proposta) e A5 (o dono do negócio dá a visita como feita)
-- Migrações: 20270126100000_recusar_proposta_so_portal, 20270126110000_visita_resultado_dono_negocio.
-- ============================================================
-- SÓ para a base RH (project-ref uetjghdkwbywbftedtth). NUNCA na produção (tzbfgwpckrfbqcolqxtm).
-- Tudo em BEGIN … ROLLBACK; fixtures criadas na transação; cada ação corre num sub-bloco que acaba SEMPRE em RAISE (o que escreveu é
-- desfeito). As contagens/md5 («antes», o estado real antes das fixtures) têm de dar o mesmo em corridas seguidas: nada ficou gravado.
-- O resultado sai numa exceção no fim (@@RES <base64 do JSON> RES@@), por isso nada fica gravado mesmo sem chegar ao ROLLBACK.
-- Correr:
--   powershell -NoProfile -ExecutionPolicy Bypass -File C:\Olyvia\vault\auditoria-permissoes\rhq.ps1 -SqlFile <este ficheiro>
-- «esperado» = a regra (à mão); «obtido» = o que o servidor fez (passa / bloqueado / erro = falhou por outra razão).
-- C5: só o portal recusa (reject_proposal_atomic só para service_role, chamada pelas edge functions com o token da proposta).
-- A5: o comercial dono do negócio (negocios.visita.preencher + o negócio no âmbito) dá resultado à visita marcada pela assistente,
--     mesmo atribuída a outro recurso; quem não é dono, quem não tem preencher e o técnico continuam recusados; gerir não muda.
-- ============================================================
BEGIN;
SET LOCAL statement_timeout = 0;

CREATE TEMP TABLE _r (n serial, conta text, passo text, esperado text, obtido text, resultado text, detalhe text) ON COMMIT DROP;
CREATE TEMP TABLE _ids (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE _cont (momento text, t text, n text) ON COMMIT DROP;

INSERT INTO _cont SELECT 'antes', t, n FROM (VALUES
  ('proposals', (SELECT count(*)::text FROM proposals)), ('proposals_rejected', (SELECT count(*)::text FROM proposals WHERE status = 'rejected')),
  ('schedule_items', (SELECT count(*)::text FROM schedule_items)),
  ('schedule_items_md5', (SELECT md5(string_agg(id::text || coalesce(status::text, '') || coalesce(visit_outcome, ''), ',' ORDER BY id)) FROM schedule_items)),
  ('negocios', (SELECT count(*)::text FROM negocios))) v(t, n);

-- Corre p_sql com a sessão (authenticated com p_auth; 'anon'; 'service_role') num sub-bloco que acaba sempre em RAISE.
CREATE FUNCTION pg_temp.ex(p_role text, p_auth uuid, p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v text; m text; d text; s text;
BEGIN
  BEGIN
    IF p_role = 'authenticated' THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', p_auth::text, true);
    ELSE
      PERFORM set_config('request.jwt.claims', json_build_object('role', p_role)::text, true);
      PERFORM set_config('request.jwt.claim.sub', '', true);
    END IF;
    EXECUTE format('SET LOCAL ROLE %I', p_role);
    EXECUTE p_sql INTO v;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__desfazer__', DETAIL = coalesce(v, '<null>');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS m = MESSAGE_TEXT, d = PG_EXCEPTION_DETAIL, s = RETURNED_SQLSTATE;
    IF m = '__desfazer__' THEN v := nullif(d, '<null>'); ELSE v := 'ERRO ' || s || ': ' || m; END IF;
  END;
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN v;
END $f$;

-- Para usar dentro de ex(): corre a ação com a sessão e, NOUTRA instrução (outro snapshot) e já como postgres, a verificação.
CREATE FUNCTION pg_temp.acao_e_ver(p_acao text, p_ver text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE a text; v text;
BEGIN
  EXECUTE p_acao INTO a;
  EXECUTE 'RESET ROLE';
  EXECUTE p_ver INTO v;
  RETURN coalesce(a, '<null>') || ' | ' || coalesce(v, '<null>');
END $f$;
GRANT EXECUTE ON FUNCTION pg_temp.acao_e_ver(text, text) TO PUBLIC;

CREATE FUNCTION pg_temp.cl(p text) RETURNS text LANGUAGE sql AS $f$
  SELECT CASE WHEN p IS NULL OR p !~ '^ERRO ' THEN 'passa'
              WHEN p ~* '(42501|CT001|NG001|NG004|sem permiss|indispon|permission denied|autenticacao necessaria|token invalido)' THEN 'bloqueado'
              ELSE 'erro' END
$f$;

CREATE FUNCTION pg_temp.reg(p_conta text, p_passo text, p_esp text, p_res text) RETURNS void LANGUAGE sql AS $f$
  INSERT INTO _r (conta, passo, esperado, obtido, resultado, detalhe)
  VALUES (p_conta, p_passo, p_esp, pg_temp.cl(p_res),
          CASE WHEN p_esp IS NULL OR p_esp = '?' THEN 'INFO' WHEN p_esp = pg_temp.cl(p_res) THEN 'OK' ELSE 'FALHA' END, left(p_res, 220));
$f$;

CREATE TEMP TABLE _contas (conta text PRIMARY KEY, uid uuid, auth uuid) ON COMMIT DROP;
INSERT INTO _contas VALUES
  ('Rita (comercial, dona)',  'a3c609e5-259c-40eb-b439-ceed79f74343', NULL),
  ('Rui (comercial B)',       '830efc80-4a52-4a7e-ab66-6ea233a14f9e', NULL),
  ('Catarina (assistente)',   '229cbb75-f2de-4bb5-9c3f-a711ccd0a058', NULL),
  ('Susana (compras)',        '52d11b64-c48b-4089-ae8b-d037464a4ea3', NULL),
  ('Elvis (tecnico_obra)',    '37b2378d-18b1-4c9d-b192-43985d5edf39', NULL),
  ('Dario (supervisor_obra)', '2c50c942-2fcc-4d01-9772-e84c2874b17b', NULL),
  ('Ricardo B (super_admin)', 'e384d020-ede9-4dd7-b52d-ad196176fba8', NULL);
UPDATE _contas c SET auth = u.auth_user_id FROM anew_users u WHERE u.id = c.uid;

-- ── Fixtures (postgres) ──────────────────────────────────────────────────────
DO $fx$
DECLARE
  c_org   CONSTANT uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_board CONSTANT uuid := '558300c3-1968-4d8b-b30a-25e66a346e73';
  c_rita  CONSTANT uuid := 'a3c609e5-259c-40eb-b439-ceed79f74343';
  c_rui   CONSTANT uuid := '830efc80-4a52-4a7e-ab66-6ea233a14f9e';
  c_cat   CONSTANT uuid := '229cbb75-f2de-4bb5-9c3f-a711ccd0a058';
  c_rb    CONSTANT uuid := 'e384d020-ede9-4dd7-b52d-ad196176fba8';
  r_rita  CONSTANT uuid := '8cd99343-f26d-40af-88c4-9eb9534d5012';
  r_outro CONSTANT uuid := 'ebb61029-a6ac-469e-a7f6-15f3d9d4419e';   -- outro recurso (nem a Rita nem a assistente)
  r_rui   CONSTANT uuid := 'ac7148d2-d881-4d57-b1bf-5c8816bb5174';
  e uuid[] := ARRAY['825945b7-57e8-4206-9c40-fb653172f58d', '75b91620-c6d0-4a2a-b0e3-c0357af8de20', '7b93e466-3ca6-428c-a677-9953bce8b4a0']::uuid[];
  v uuid; v_vis uuid; v_json jsonb; v_auth_rb uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  -- nv: negócio da Rita na visita (fase 2), criado pela assistente; três visitas no passado criadas pela assistente (user_id nulo)
  INSERT INTO negocios (organization_id, entity_id, titulo, linha, servico_pedido, origem, dono_papel, fluxo_emylia, created_by, assigned_to)
  VALUES (c_org, e[1], 'LP2311 nv', 'wc', 'Casa de banho', 'teste', 'comercial', true, c_cat, c_rita) RETURNING id INTO v;
  UPDATE negocios SET fase = 2 WHERE id = v;
  INSERT INTO _ids VALUES ('nv', v);
  -- vis_outro: atribuída a OUTRO recurso (a RLS de UPDATE de schedule_items não deixava a Rita)
  INSERT INTO schedule_items (board_id, title, status, origin, start_datetime, end_datetime, all_day, entity_id, priority, metadata, created_by, organization_id, negocio_id, visit_kind)
  VALUES (c_board, 'LP2311 visita outro', 'scheduled', 'manual', now() - interval '5 hours', now() - interval '4 hours', false, e[1], 0, '{}'::jsonb, c_cat, c_org, v, 'levantamento')
  RETURNING id INTO v_vis;
  INSERT INTO schedule_item_assignees (item_id, resource_id) VALUES (v_vis, r_outro);
  INSERT INTO _ids VALUES ('vis_outro', v_vis);
  -- vis_rita: atribuída à Rita
  INSERT INTO schedule_items (board_id, title, status, origin, start_datetime, end_datetime, all_day, entity_id, priority, metadata, created_by, organization_id, negocio_id, visit_kind)
  VALUES (c_board, 'LP2311 visita rita', 'scheduled', 'manual', now() - interval '3 hours', now() - interval '2 hours', false, e[1], 0, '{}'::jsonb, c_cat, c_org, v, 'levantamento')
  RETURNING id INTO v_vis;
  INSERT INTO schedule_item_assignees (item_id, resource_id) VALUES (v_vis, r_rita);
  INSERT INTO _ids VALUES ('vis_rita', v_vis);
  -- vis_futura: no futuro (a regra «uma visita no futuro não se dá como feita» mantém-se)
  INSERT INTO schedule_items (board_id, title, status, origin, start_datetime, end_datetime, all_day, entity_id, priority, metadata, created_by, organization_id, negocio_id, visit_kind)
  VALUES (c_board, 'LP2311 visita futura', 'scheduled', 'manual', date_trunc('day', now()) + interval '9 days 10 hours', date_trunc('day', now()) + interval '9 days 11 hours', false, e[1], 0, '{}'::jsonb, c_cat, c_org, v, 'levantamento')
  RETURNING id INTO v_vis;
  INSERT INTO schedule_item_assignees (item_id, resource_id) VALUES (v_vis, r_rita);
  INSERT INTO _ids VALUES ('vis_futura', v_vis);

  -- nr: negócio do Rui (fase 3) com uma visita marcada pela assistente e a proposta enviada
  INSERT INTO negocios (organization_id, entity_id, titulo, linha, servico_pedido, origem, dono_papel, fluxo_emylia, created_by, assigned_to)
  VALUES (c_org, e[3], 'LP2311 nr', 'wc', 'Casa de banho', 'teste', 'comercial', true, c_rui, c_rui) RETURNING id INTO v;
  UPDATE negocios SET fase = 3 WHERE id = v;
  INSERT INTO _ids VALUES ('nr', v);
  INSERT INTO schedule_items (board_id, title, status, origin, start_datetime, end_datetime, all_day, entity_id, priority, metadata, created_by, organization_id, negocio_id, visit_kind)
  VALUES (c_board, 'LP2311 visita rui', 'scheduled', 'manual', now() - interval '5 hours', now() - interval '4 hours', false, e[3], 0, '{}'::jsonb, c_cat, c_org, v, 'levantamento')
  RETURNING id INTO v_vis;
  INSERT INTO schedule_item_assignees (item_id, resource_id) VALUES (v_vis, r_rui);
  INSERT INTO _ids VALUES ('vis_rui', v_vis);

  v_json := jsonb_build_object(
    'negocio', jsonb_build_object('fase', 3, 'linha', 'wc', 'servico_pedido', 'Casa de banho', 'origem', 'teste', 'dono_papel', 'comercial'),
    'respostas', '[]'::jsonb, 'visitas', '[]'::jsonb, 'medidas', '{}'::jsonb, 'servicos', '[]'::jsonb, 'historico', '[]'::jsonb,
    'orcamentos', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'rascunho', 'modelo', 'wc', 'desconto', 0,
      'preco_final', 100, 'total_com_iva', 106, 'zonas', jsonb_build_array('Geral'),
      'prestacoes', jsonb_build_array(jsonb_build_object('ordem', 1, 'rotulo', 'Única', 'pct', 1, 'marco', 'adjudicacao')),
      'linhas', jsonb_build_array(jsonb_build_object('ordem', 0, 'tipo', 'livre', 'descricao', 'Linha LP', 'unidade', 'un', 'quantidade', 1,
        'preco_un', 100, 'parte_iva', 'mao_obra', 'custo', jsonb_build_object('custo_un', 50),
        'zonas', jsonb_build_array(jsonb_build_object('zona', 'Geral', 'quantidade', 1)))))),
    'contratos', '[]'::jsonb);
  SELECT auth_user_id INTO v_auth_rb FROM anew_users WHERE id = c_rb;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth_rb, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_auth_rb::text, true);
  PERFORM public.neg_guardar_negocio(c_org, v, v_json);
  v_json := jsonb_set(jsonb_set(v_json, '{orcamentos,0,estado}', '"enviado"'), '{orcamentos,0,enviado_em}', '"2026-11-20T10:00:00Z"');
  PERFORM public.neg_guardar_negocio(c_org, v, v_json);
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $fx$;

INSERT INTO _ids SELECT 'p_nr', id FROM proposals WHERE negocio_id = (SELECT v FROM _ids WHERE k = 'nr') AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1;
-- o portal precisa do token; se a proposta de teste nasceu sem ele, dá-se-lhe um (só na transação)
UPDATE proposals SET public_token = 'lp2311-' || md5(random()::text) WHERE id = (SELECT v FROM _ids WHERE k = 'p_nr') AND public_token IS NULL;
UPDATE proposals SET status = 'sent' WHERE id = (SELECT v FROM _ids WHERE k = 'p_nr') AND status NOT IN ('sent', 'viewed');

-- ── C5: recusar a proposta ───────────────────────────────────────────────────
DO $c5$
DECLARE
  p uuid := (SELECT v FROM _ids WHERE k = 'p_nr');
  tok text := (SELECT public_token FROM proposals WHERE id = (SELECT v FROM _ids WHERE k = 'p_nr'));
  a record; r text; q text;
BEGIN
  PERFORM pg_temp.reg('fixture', 'C0 proposta de teste enviada com token', 'passa',
    CASE WHEN p IS NOT NULL AND tok IS NOT NULL THEN 'proposta ' || (SELECT status FROM proposals WHERE id = p) ELSE 'ERRO X: sem proposta de teste' END);
  q := format($q$SELECT public.reject_proposal_atomic(%L, NULL, 'preco', 'LP', 'LP')::text$q$, p);
  FOR a IN SELECT * FROM _contas ORDER BY conta LOOP
    r := pg_temp.ex('authenticated', a.auth, q);
    PERFORM pg_temp.reg(a.conta, 'C1 recusar sem token (funcionario)', 'bloqueado', r);
  END LOOP;
  -- direto, mesmo com o token certo: o caminho do cliente é a edge function (service_role), não a RPC
  r := pg_temp.ex('authenticated', (SELECT auth FROM _contas WHERE conta = 'Rui (comercial B)'), format($q$SELECT public.reject_proposal_atomic(%L, %L, 'preco', 'LP', 'LP')::text$q$, p, tok));
  PERFORM pg_temp.reg('Rui (comercial B)', 'C2 recusar direto com o token (authenticated)', 'bloqueado', r);
  r := pg_temp.ex('anon', NULL, format($q$SELECT public.reject_proposal_atomic(%L, %L, 'preco', 'LP', 'LP')::text$q$, p, tok));
  PERFORM pg_temp.reg('anon', 'C3 recusar direto com o token (anon)', 'bloqueado', r);
  r := pg_temp.ex('anon', NULL, q);
  PERFORM pg_temp.reg('anon', 'C3b recusar sem token (anon)', 'bloqueado', r);
  -- o portal (service_role, como a edge reject-proposal e, agora, o send-verification-code/verify)
  r := pg_temp.ex('service_role', NULL, format($q$SELECT public.reject_proposal_atomic(%L, 'token-errado', 'preco', 'LP', 'LP')::text$q$, p));
  PERFORM pg_temp.reg('portal (service_role)', 'C4 token errado', 'bloqueado', r);
  r := pg_temp.ex('service_role', NULL, q);
  PERFORM pg_temp.reg('portal (service_role)', 'C5 sem token (o que o send-verification-code fazia)', 'bloqueado', r);
  r := pg_temp.ex('service_role', NULL, format($q$SELECT pg_temp.acao_e_ver(%L, %L)$q$,
       format($a$SELECT public.reject_proposal_atomic(%L, %L, 'preco', 'Preço', 'notas LP')::text$a$, p, tok),
       format($v$SELECT 'status=' || status || ' code=' || coalesce(rejection_reason_code, '-') || ' rejected_at=' || (rejected_at IS NOT NULL) FROM proposals WHERE id = %L$v$, p)));
  PERFORM pg_temp.reg('portal (service_role)', 'C6 recusa pelo cliente com o token', 'passa', r);
  PERFORM pg_temp.reg('portal (service_role)', 'C6b a recusa ficou registada (rejected, motivo, data)', 'passa',
    CASE WHEN r ~ 'status=rejected code=preco rejected_at=true' THEN r ELSE 'ERRO X: ' || coalesce(r, '<null>') END);
  -- quem pode executar (pg_proc.proacl)
  PERFORM pg_temp.reg('acl', 'C7 EXECUTE: authenticated nao, anon nao, service_role sim', 'passa',
    CASE WHEN NOT has_function_privilege('authenticated', 'public.reject_proposal_atomic(uuid,text,text,text,text)', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public.reject_proposal_atomic(uuid,text,text,text,text)', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.reject_proposal_atomic(uuid,text,text,text,text)', 'EXECUTE')
         THEN 'ok' ELSE 'ERRO X: ' || (SELECT proacl::text FROM pg_proc WHERE oid = 'public.reject_proposal_atomic(uuid,text,text,text,text)'::regprocedure) END);
END $c5$;

-- ── A5: dar a visita como feita ──────────────────────────────────────────────
DO $a5$
DECLARE
  a_rita uuid := (SELECT auth FROM _contas WHERE conta = 'Rita (comercial, dona)');
  vo uuid := (SELECT v FROM _ids WHERE k = 'vis_outro');  vr uuid := (SELECT v FROM _ids WHERE k = 'vis_rita');
  vf uuid := (SELECT v FROM _ids WHERE k = 'vis_futura'); vrui uuid := (SELECT v FROM _ids WHERE k = 'vis_rui');
  a record; r text;
BEGIN
  r := pg_temp.ex('authenticated', a_rita, format($q$SELECT pg_temp.acao_e_ver(%L, %L)$q$,
       format($a$SELECT public.neg_resultado_visita(%L, 'interessado', true)::text$a$, vo),
       format($v$SELECT 'status=' || status || ' outcome=' || coalesce(visit_outcome, '-') FROM schedule_items WHERE id = %L$v$, vo)));
  PERFORM pg_temp.reg('Rita (comercial, dona)', 'A1 dar como feita (marcada pela assistente, atribuida a outro recurso)', 'passa', r);
  PERFORM pg_temp.reg('Rita (comercial, dona)', 'A1b ficou feita com o resultado', 'passa',
    CASE WHEN r ~ 'status=completed outcome=interessado' THEN r ELSE 'ERRO X: ' || coalesce(r, '<null>') END);
  r := pg_temp.ex('authenticated', a_rita, format($q$SELECT pg_temp.acao_e_ver(%L, %L)$q$,
       format($a$SELECT public.neg_resultado_visita(%L, NULL, true)::text$a$, vr),
       format($v$SELECT 'status=' || status || ' outcome=' || coalesce(visit_outcome, '-') FROM schedule_items WHERE id = %L$v$, vr)));
  PERFORM pg_temp.reg('Rita (comercial, dona)', 'A2b ficou feita, sem resultado', 'passa',
    CASE WHEN r ~ 'status=completed outcome=-' THEN r ELSE 'ERRO X: ' || coalesce(r, '<null>') END);
  PERFORM pg_temp.reg('Rita (comercial, dona)', 'A2 so feita (atribuida a ela)', 'passa', r);
  r := pg_temp.ex('authenticated', a_rita, format($q$SELECT public.neg_resultado_visita(%L, 'interessado', true)::text$q$, vf));
  PERFORM pg_temp.reg('Rita (comercial, dona)', 'A3 visita no futuro continua recusada (NG009)', 'erro', r);
  r := pg_temp.ex('authenticated', a_rita, format($q$SELECT public.neg_cancelar_visita(%L)::text$q$, vr));
  PERFORM pg_temp.reg('Rita (comercial, dona)', 'A4 cancelar continua so de quem gere (gerir)', 'bloqueado', r);
  -- a Rita no negócio do Rui: nem pela RPC, nem pelo invólucro, nem a pôr a bandeira à mão
  r := pg_temp.ex('authenticated', a_rita, format($q$SELECT public.neg_resultado_visita(%L, 'interessado', true)::text$q$, vrui));
  PERFORM pg_temp.reg('Rita (comercial, dona)', 'A5 visita do negocio do Rui', 'bloqueado', r);
  r := pg_temp.ex('authenticated', a_rita, format($q$SELECT public.fn_neg_negocio_resultado_visita(%L, 'interessado', true)::text$q$, vrui));
  PERFORM pg_temp.reg('Rita (comercial, dona)', 'A6 invólucro direto na visita do Rui', 'bloqueado', r);
  r := pg_temp.ex('authenticated', a_rita, format($q$SELECT set_config('app.neg_via_negocio', 'on', true) || public.neg_resultado_visita(%L, 'interessado', true)::text$q$, vrui));
  PERFORM pg_temp.reg('Rita (comercial, dona)', 'A7 bandeira app.neg_via_negocio posta a mao', 'bloqueado', r);
  -- os outros na visita da Rita
  FOR a IN SELECT * FROM _contas WHERE conta IN ('Rui (comercial B)', 'Catarina (assistente)', 'Susana (compras)', 'Elvis (tecnico_obra)', 'Dario (supervisor_obra)') ORDER BY conta LOOP
    r := pg_temp.ex('authenticated', a.auth, format($q$SELECT public.neg_resultado_visita(%L, 'interessado', true)::text$q$, vo));
    PERFORM pg_temp.reg(a.conta, 'A8 dar como feita a visita do negocio da Rita', 'bloqueado', r);
    r := pg_temp.ex('authenticated', a.auth, format($q$SELECT public.fn_neg_negocio_resultado_visita(%L, 'interessado', true)::text$q$, vo));
    PERFORM pg_temp.reg(a.conta, 'A9 invólucro direto na visita da Rita', 'bloqueado', r);
  END LOOP;
  -- o super_admin continua a passar (âmbito ORG, pela regra da visita)
  r := pg_temp.ex('authenticated', (SELECT auth FROM _contas WHERE conta = 'Ricardo B (super_admin)'), format($q$SELECT public.neg_resultado_visita(%L, 'interessado', true)::text$q$, vo));
  PERFORM pg_temp.reg('Ricardo B (super_admin)', 'A10 dar como feita', 'passa', r);
  r := pg_temp.ex('anon', NULL, format($q$SELECT public.fn_neg_visita_via_negocio(%L)::text$q$, vo));
  PERFORM pg_temp.reg('anon', 'A11 fn_neg_visita_via_negocio', 'bloqueado', r);
END $a5$;

DO $fim$
DECLARE v_res text;
BEGIN
  SELECT json_build_object(
    'falhas', (SELECT count(*) FROM _r WHERE resultado = 'FALHA'),
    'linhas', (SELECT json_agg(json_build_object('c', conta, 'p', passo, 'e', esperado, 'o', obtido, 'r', resultado, 'd', detalhe) ORDER BY n) FROM _r),
    'contagens', (SELECT json_agg(json_build_object('m', momento, 't', t, 'n', n)) FROM _cont))::text INTO v_res;
  RAISE EXCEPTION '@@RES % RES@@', regexp_replace(translate(encode(convert_to(v_res, 'UTF8'), 'base64'), E'\n\r', ''), '(.{100})', '\1 ', 'g');
END $fim$;
ROLLBACK;
