-- ============================================================
-- Testes: 20270126200000 (C2 purge só do Lixo + âmbito), 20270126210000 (C3 custos dos produtos do negócio) e
--         20270126220000 (C4 criar a obra só com o plano por aprovar) — auditoria de permissões 23/11 (base RH)
-- ============================================================
-- SÓ para a base RH (project-ref uetjghdkwbywbftedtth). NUNCA na produção (tzbfgwpckrfbqcolqxtm).
-- Tudo em BEGIN … ROLLBACK; cada ação corre num sub-bloco que acaba SEMPRE em RAISE (o que escreveu é desfeito mesmo quando passa).
-- Preparação só dentro da transação: o negócio 1003 passa a ser da Rita (como fase3_obra_ec.sql); a obra do 1003 é apagada e a EC
-- dele posta por emitir (parte C4); na parte C2e o perfil comercial ganha deals.delete com âmbito OWNED na associação da Rita.
-- Empresa Mudelar 3242e925-…; contas de rh-pessoas-utilizadores-grupo-bmlar.csv.
-- Correr: powershell -NoProfile -ExecutionPolicy Bypass -File C:\Olyvia\vault\auditoria-permissoes\rhq.ps1 -SqlFile <este ficheiro>
--   (resultado = último SELECT: uma linha por verificação + TOTAL com o n.º de FALHAS e as contagens/md5 antes e depois na transação)
-- ============================================================
BEGIN;

CREATE TEMP TABLE _r (n serial, caso text, conta text, esperado text, obtido text, resultado text, detalhe text) ON COMMIT DROP;
CREATE TEMP TABLE _c (momento text, v text) ON COMMIT DROP;
CREATE TEMP TABLE _contas (ordem int, conta text, email text, auth uuid, uid uuid) ON COMMIT DROP;

CREATE FUNCTION pg_temp.contagens() RETURNS text LANGUAGE sql AS $f$
  SELECT concat_ws(' ', 'quotes=' || (SELECT count(*) FROM quotes), 'cc=' || (SELECT count(*) FROM client_contracts),
    'np=' || (SELECT count(*) FROM negocio_produtos), 'obras=' || (SELECT count(*) FROM ops_obra),
    'md5_obra=' || (SELECT md5(string_agg(id::text || estado || coalesce(estado_emylia::text, ''), ',' ORDER BY id)) FROM ops_obra),
    'md5_memb=' || (SELECT md5(string_agg(id::text || role_id::text || status, ',' ORDER BY id)) FROM anew_memberships),
    'md5_rp=' || (SELECT md5(string_agg(role_id::text || permission_code, ',' ORDER BY role_id, permission_code)) FROM anew_role_permissions))
$f$;
INSERT INTO _c VALUES ('antes', pg_temp.contagens());

-- corre p_sql como a conta (role authenticated + claims); devolve 'passa: …' ou 'SQLSTATE: mensagem'
CREATE FUNCTION pg_temp.tentar(p_auth uuid, p_sql text, p_inteiro boolean DEFAULT false) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v_ret text; v_msg text; v_st text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', p_auth::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE p_sql INTO v_ret;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__desfazer__', DETAIL = coalesce(v_ret, '');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_st = RETURNED_SQLSTATE, v_ret = PG_EXCEPTION_DETAIL;
  END;
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF v_msg = '__desfazer__' THEN RETURN 'passa: ' || CASE WHEN p_inteiro THEN coalesce(v_ret, '') ELSE left(coalesce(v_ret, ''), 300) END; END IF;
  RETURN v_st || ': ' || left(v_msg, 300);
END $f$;

-- como tentar, mas antes (como postgres, no mesmo sub-bloco, desfeito) corre p_pre
CREATE FUNCTION pg_temp.tentar_pre(p_auth uuid, p_pre text, p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v_ret text; v_msg text; v_st text;
BEGIN
  BEGIN
    EXECUTE p_pre;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', p_auth::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE p_sql INTO v_ret;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__desfazer__', DETAIL = coalesce(v_ret, '');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_st = RETURNED_SQLSTATE, v_ret = PG_EXCEPTION_DETAIL;
  END;
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF v_msg = '__desfazer__' THEN RETURN 'passa: ' || left(coalesce(v_ret, ''), 300); END IF;
  RETURN v_st || ': ' || left(v_msg, 300);
END $f$;

CREATE FUNCTION pg_temp.cl(r text) RETURNS text LANGUAGE sql AS $f$
  SELECT CASE WHEN r LIKE 'passa%' THEN 'passa' WHEN r ~ '^(CT001|42501):' THEN 'bloqueado' ELSE 'erro' END
$f$;

CREATE FUNCTION pg_temp.reg(p_caso text, p_conta text, p_esp text, p_obt text, p_det text) RETURNS void LANGUAGE sql AS $f$
  INSERT INTO _r (caso, conta, esperado, obtido, resultado, detalhe)
  VALUES (p_caso, p_conta, p_esp, coalesce(p_obt, '<null>'), CASE WHEN p_esp = coalesce(p_obt, '<null>') THEN 'OK' ELSE 'FALHA' END, left(p_det, 220));
$f$;

-- a obra no formato de obra_guardar_negocio (o que está gravado) — o mesmo de fase3_obra_ec.sql
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

INSERT INTO _contas (ordem, conta, email) VALUES
  (1, 'Rita (comercial)', 'rita.costa@mudelar.pt'), (2, 'Artur (comercial)', 'artur.oliveira@mudelar.pt'),
  (3, 'Catarina (assistente_comercial)', 'catarina.ferreira@bmlar.pt'), (4, 'Ana (financeiro)', 'financeiro@bmlar.pt'),
  (5, 'Marco (org_admin)', 'marco.rodrigues@bmlar.pt'), (6, 'Ricardo B. (super_admin)', 'ricardo.belchior@bmlar.pt'),
  (7, 'Miguel (system_admin)', 'miguel.carvalho@bmlar.pt'), (8, 'Dario (supervisor_de_obra)', 'dariosolanods70@gmail.com'),
  (9, 'Gustavo (tecnico)', 'gustavoprsilva99@gmail.com');
UPDATE _contas c SET auth = u.auth_user_id, uid = u.id FROM anew_users u WHERE lower(u.email) = lower(c.email);

DO $t$
DECLARE
  o     CONSTANT uuid := '3242e925-da26-459a-8258-be04d904e355';
  n1003 CONSTANT uuid := 'fa327880-85d4-433b-a47c-9baeb15d6247';
  q1005 CONSTANT uuid := '7aa353c1-14fb-49d4-ba0d-7c94814d5c73';  -- orçamento vivo do 1005 (Marco Vaz)
  c1003 CONSTANT uuid := '53fb2911-8e1e-48f3-aaa1-fb4ff34431fc';  -- contrato ASSINADO vivo do 1003
  q_rita CONSTANT uuid := '7a51cb4e-d6a6-4277-bbc8-1132c9788525'; -- orçamento do 1009 (da Rita)
  a record; r text; v_esp text; v_tem_dd boolean; v_negs uuid[]; v_n int; ob jsonb; v_memb uuid;
BEGIN
  IF (SELECT count(*) FROM _contas WHERE auth IS NULL) > 0 THEN RAISE EXCEPTION 'ABORTADO: contas em falta'; END IF;

  -- ── C2. «Eliminar definitivamente» (purge_business_entity) ──────────────────────────────────────────────────────────────────
  FOR a IN SELECT * FROM _contas WHERE ordem IN (1, 4, 5, 6, 7) ORDER BY ordem LOOP
    v_tem_dd := a.ordem IN (5, 6, 7);  -- deals.delete (perfil): org_admin, super_admin, system_admin
    r := pg_temp.tentar(a.auth, format('SELECT public.purge_business_entity(''quote'', %L)::text', q1005));
    PERFORM pg_temp.reg('C2a purge orçamento VIVO', a.conta, 'bloqueado', pg_temp.cl(r), r);
    r := pg_temp.tentar(a.auth, format('SELECT public.purge_business_entity(''contract'', %L)::text', c1003));
    PERFORM pg_temp.reg('C2b purge contrato assinado VIVO', a.conta, 'bloqueado', pg_temp.cl(r), r);
    r := pg_temp.tentar_pre(a.auth, format('UPDATE quotes SET deleted_at = now() WHERE id = %L', q1005),
                            format('SELECT public.purge_business_entity(''quote'', %L)::text', q1005));
    PERFORM pg_temp.reg('C2c purge orçamento no Lixo (Lixo legítimo)', a.conta, CASE WHEN v_tem_dd THEN 'passa' ELSE 'bloqueado' END, pg_temp.cl(r), r);
    -- o que acontece hoje (regra de negócio, não mudada): um contrato assinado que esteja no Lixo apaga-se
    r := pg_temp.tentar_pre(a.auth, format('UPDATE client_contracts SET deleted_at = now() WHERE id = %L', c1003),
                            format('SELECT public.purge_business_entity(''contract'', %L)::text', c1003));
    PERFORM pg_temp.reg('C2d purge contrato assinado no Lixo (hoje)', a.conta, CASE WHEN v_tem_dd THEN 'passa' ELSE 'bloqueado' END, pg_temp.cl(r), r);
  END LOOP;

  -- C2e. o âmbito: a Rita (comercial) ganha deals.delete com âmbito OWNED (só nesta transação)
  SELECT a2.* INTO a FROM _contas a2 WHERE ordem = 1;
  SELECT m.id INTO v_memb FROM anew_memberships m WHERE m.user_id = a.uid AND m.organization_id = o AND m.status = 'active' AND m.role_is_client IS NOT TRUE LIMIT 1;
  INSERT INTO anew_role_permissions (role_id, permission_code)
  SELECT m.role_id, 'deals.delete' FROM anew_memberships m WHERE m.id = v_memb
  ON CONFLICT DO NOTHING;
  INSERT INTO anew_membership_permission_scopes (id, membership_id, permission_code, scope_level, created_at, updated_at)
  VALUES (gen_random_uuid(), v_memb, 'deals.delete', 'OWNED', now(), now());
  r := pg_temp.tentar_pre(a.auth, format('UPDATE quotes SET deleted_at = now() WHERE id = %L', q1005),
                          format('SELECT public.purge_business_entity(''quote'', %L)::text', q1005));
  PERFORM pg_temp.reg('C2e OWNED: purge orçamento ALHEIO no Lixo', a.conta || ' +deals.delete OWNED', 'bloqueado', pg_temp.cl(r), r);
  r := pg_temp.tentar_pre(a.auth, format('UPDATE quotes SET deleted_at = now() WHERE id = %L', q_rita),
                          format('SELECT public.purge_business_entity(''quote'', %L)::text', q_rita));
  -- (o orçamento dele tem faturas: o apagar falha depois da guarda, por uma FK — conta como «passou a guarda»)
  PERFORM pg_temp.reg('C2e OWNED: purge orçamento DELE no Lixo', a.conta || ' +deals.delete OWNED', 'passou a guarda',
                      CASE WHEN pg_temp.cl(r) IN ('passa', 'erro') THEN 'passou a guarda' ELSE pg_temp.cl(r) END, r);
  r := pg_temp.tentar_pre(a.auth, format('UPDATE client_contracts SET deleted_at = now() WHERE id = %L', c1003),
                          format('SELECT public.purge_business_entity(''contract'', %L)::text', c1003));
  PERFORM pg_temp.reg('C2e OWNED: purge contrato ALHEIO no Lixo', a.conta || ' +deals.delete OWNED', 'bloqueado', pg_temp.cl(r), r);
  DELETE FROM anew_membership_permission_scopes WHERE membership_id = v_memb AND permission_code = 'deals.delete';
  DELETE FROM anew_role_permissions WHERE permission_code = 'deals.delete'
    AND role_id = (SELECT role_id FROM anew_memberships WHERE id = v_memb);

  -- ── C3. leitura direta de negocio_produtos / quote_versao_produtos / adenda_linhas ─────────────────────────────────────────
  FOR a IN SELECT * FROM _contas ORDER BY ordem LOOP
    -- os negócios que a conta lê pela RPC (neg_ler_negocios); sem leitura (técnico sem pessoas.view, erro) = nenhum.
    -- O esperado conta-se como postgres sobre esses negócios (o técnico sem pessoas.view lê as obras pela RPC, mas a tabela continua
    -- a pedir pessoas.view: 0, como antes).
    r := pg_temp.tentar(a.auth, format($q$SELECT 'ids:' || coalesce(string_agg(e->'negocio'->>'id', ','), '') FROM jsonb_array_elements(public.neg_ler_negocios(%L)) e$q$, o), true);
    v_negs := CASE WHEN r LIKE 'passa: ids:_%' THEN string_to_array(substr(r, 12), ',')::uuid[] ELSE '{}'::uuid[] END;
    SELECT count(*) INTO v_n FROM negocio_produtos p WHERE p.organization_id = o AND p.negocio_id = ANY (v_negs)
      AND (public.is_system_admin_user(a.auth) OR public.has_anew_permission_in_org(a.auth, 'pessoas.view', o));  -- a política pede pessoas.view (como antes)
    v_esp := v_n::text;
    r := pg_temp.tentar(a.auth, format('SELECT count(*)::text FROM negocio_produtos WHERE organization_id = %L', o));
    PERFORM pg_temp.reg('C3a negocio_produtos: linhas legíveis = as dos negócios de neg_ler_negocios', a.conta, v_esp,
                        CASE WHEN r LIKE 'passa: %' THEN substr(r, 8) ELSE r END, r);
    r := pg_temp.tentar(a.auth, format('SELECT count(*)::text FROM negocio_produtos WHERE organization_id = %L AND custo_un IS NOT NULL', o));
    PERFORM pg_temp.reg('C3b negocio_produtos.custo_un direto', a.conta, 'bloqueado', pg_temp.cl(r), r);
    r := pg_temp.tentar(a.auth, format('SELECT count(*)::text FROM (SELECT id, negocio_id, nome, quantidade, pvp_un, fator FROM negocio_produtos WHERE organization_id = %L) x', o));
    PERFORM pg_temp.reg('C3c negocio_produtos sem o custo (as outras colunas)', a.conta, 'passa', pg_temp.cl(r), r);
    r := pg_temp.tentar(a.auth, 'SELECT count(*)::text FROM quote_versao_produtos WHERE custo_un IS NOT NULL');
    PERFORM pg_temp.reg('C3d quote_versao_produtos.custo_un direto', a.conta, 'bloqueado', pg_temp.cl(r), r);
    r := pg_temp.tentar(a.auth, 'SELECT count(*)::text FROM adenda_linhas WHERE custo_un IS NOT NULL');
    PERFORM pg_temp.reg('C3e adenda_linhas.custo_un direto', a.conta, 'bloqueado', pg_temp.cl(r), r);
    r := pg_temp.tentar(a.auth, format($q$SELECT count(*)::text FROM quote_versao_produtos v WHERE v.organization_id = %L
        AND v.quote_id NOT IN (SELECT q.id FROM quotes q WHERE q.negocio_id IN (SELECT (e->'negocio'->>'id')::uuid FROM jsonb_array_elements(public.neg_ler_negocios(%L)) e))$q$, o, o));
    PERFORM pg_temp.reg('C3f quote_versao_produtos fora dos negócios legíveis', a.conta, CASE WHEN r LIKE 'passa%' THEN '0' ELSE 'erro' END,
                        CASE WHEN r LIKE 'passa: %' THEN substr(r, 8) ELSE r END, r);
    -- a RPC continua a dar os custos a quem fn_quote_custos_pode deixa (e só a esses)
    r := pg_temp.tentar(a.auth, format($q$SELECT (public.fn_quote_custos_pode(%L))::text || '/' || count(*)::text FROM jsonb_array_elements(public.neg_ler_negocios(%L)) e,
        jsonb_array_elements(coalesce(nullif(e->'produtos', 'null'::jsonb), '[]'::jsonb)) p WHERE p->>'custo_un' IS NOT NULL$q$, o, o));
    PERFORM pg_temp.reg('C3g neg_ler_negocios: custos só com fn_quote_custos_pode', a.conta,
      CASE WHEN r ~ '^passa: false/' THEN 'false/0' WHEN r ~ '^passa: true/' THEN 'true/' || split_part(substr(r, 8), '/', 2) ELSE 'erro' END,
      CASE WHEN r LIKE 'passa: %' THEN substr(r, 8) ELSE r END, r);
  END LOOP;

  -- ── C4. criar a obra (obra_guardar_negocio, a obra ainda não existe) ─────────────────────────────────────────────────────────
  PERFORM set_config('app.neg_via_funcao', 'on', true);
  UPDATE negocios SET assigned_to = (SELECT id FROM anew_users WHERE email = 'rita.costa@mudelar.pt') WHERE id = n1003;
  PERFORM set_config('app.neg_via_funcao', '', true);
  ob := pg_temp.obra(n1003);
  IF ob IS NULL THEN RAISE EXCEPTION 'ABORTADO: o 1003 não tem obra para servir de modelo'; END IF;
  DELETE FROM ops_obra WHERE negocio_id = n1003;
  UPDATE client_contracts SET ec_emitida_em = NULL, ec_emitida_por = NULL WHERE id = public.fn_neg_contrato_ec(n1003);
  FOR a IN SELECT * FROM _contas WHERE ordem IN (1, 4, 8, 5) ORDER BY ordem LOOP
    v_tem_dd := a.ordem IN (8, 5);  -- negocios.obra.planear: supervisor de obra, org_admin
    r := pg_temp.tentar(a.auth, format('SELECT public.obra_guardar_negocio(%L, %L, %L)::text', o, n1003,
           jsonb_set(jsonb_set(ob, '{emylia,plano,estado}', '"por aprovar"'), '{estado}', '"planeada"')));
    PERFORM pg_temp.reg('C4a criar obra com o plano «por aprovar» (como o ecrã)', a.conta, 'passa', pg_temp.cl(r), r);
    r := pg_temp.tentar(a.auth, format('SELECT public.obra_guardar_negocio(%L, %L, %L)::text', o, n1003,
           jsonb_set(jsonb_set(ob, '{emylia,plano,estado}', '"aprovado"'), '{estado}', '"planeada"')));
    PERFORM pg_temp.reg('C4b criar obra com o plano «aprovado»', a.conta, CASE WHEN v_tem_dd THEN 'passa' ELSE 'bloqueado' END, pg_temp.cl(r), r);
    IF NOT v_tem_dd THEN
      PERFORM pg_temp.reg('C4b … e a EC não é emitida', a.conta, 'sem ec', CASE WHEN r ~ '"emitida": true' THEN 'ec emitida' ELSE 'sem ec' END, r);
    END IF;
    r := pg_temp.tentar(a.auth, format('SELECT public.obra_guardar_negocio(%L, %L, %L)::text', o, n1003,
           jsonb_set(jsonb_set(ob, '{emylia,plano,estado}', '"em curso"'), '{estado}', '"planeada"')));
    PERFORM pg_temp.reg('C4c criar obra com o plano «em curso» (obra planeada)', a.conta,
      CASE WHEN v_tem_dd THEN 'passa ou regra' ELSE 'bloqueado' END,
      CASE WHEN v_tem_dd AND pg_temp.cl(r) IN ('passa', 'erro') THEN 'passa ou regra' ELSE pg_temp.cl(r) END, r);
    r := pg_temp.tentar(a.auth, format('SELECT public.obra_guardar_negocio(%L, %L, %L)::text', o, n1003,
           jsonb_set(jsonb_set(ob, '{emylia,plano}', (ob->'emylia'->'plano') - 'estado'), '{estado}', '"planeada"')));
    PERFORM pg_temp.reg('C4d criar obra com o plano sem estado', a.conta, 'passa', pg_temp.cl(r), r);
  END LOOP;
END $t$;

INSERT INTO _c VALUES ('depois_na_tx', pg_temp.contagens());

SELECT caso, conta, esperado, obtido, resultado, detalhe
FROM (
  SELECT n, caso, conta, esperado, obtido, resultado, detalhe FROM _r
  UNION ALL
  SELECT 1000000, 'TOTAL', NULL, count(*)::text || ' verificações', NULL, count(*) FILTER (WHERE resultado = 'FALHA')::text || ' FALHA(S)',
         (SELECT string_agg(momento || ': ' || v, ' | ') FROM _c)
  FROM _r
) s ORDER BY n;

ROLLBACK;
