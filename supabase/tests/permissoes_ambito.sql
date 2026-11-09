-- ============================================================
-- Teste: o âmbito (NONE/OWNED/TEAM/ORG) aplicado no servidor — migration 20270110900000 (base RH)
-- ============================================================
-- SÓ para a base RH (project-ref uetjghdkwbywbftedtth). NUNCA na de produção (tzbfgwpckrfbqcolqxtm).
-- Tudo dentro de BEGIN … ROLLBACK. Os dados de teste (o Rafael como comercial, um negócio/orçamento/proposta/contrato dele, uma
-- tarefa na obra de outro negócio, a equipa, as linhas de âmbito) são criados dentro da transação e desfeitos no fim. Cada ação
-- corre num sub-bloco que acaba SEMPRE em RAISE (desfaz o que a ação escreveu, mesmo quando passa). Sem DDL persistente: só
-- tabelas temporárias ON COMMIT DROP e funções em pg_temp.
--
-- Correr (o resultado é o último SELECT, uma linha por verificação + a linha TOTAL):
--   supabase db query --linked --workdir <workdir RH> -f supabase/tests/permissoes_ambito.sql
--
-- O ESPERADO é derivado das tabelas (SQL independente das funções testadas):
--   negócios "meus" = assigned_to/created_by (anew_users.id ou auth.uid) + as obras onde a ficha tem tarefas;
--   documentos "meus" = a cadeia do negócio comercial: o próprio (created_by/assigned_to), o pedido de proposta e a lead dele,
--     o negócio "meu", a proposta/orçamento/contrato ligados que sejam "meus" por um destes.
-- Cobre:
--   A. Rafael comercial (OWNED): neg_ler_negocios / obra_ler_negocios só os dele (+ tarefas); neg_guardar_negocio e
--      obra_guardar_negocio recusam o alheio e deixam o dele e o da tarefa; linha ORG vê tudo; TEAM vê os da equipa; NONE nada.
--   B. Só Papel no Negócio (Inês financeiro, Marta armazém, Paulo operações) e técnicos (Sérgio, Diogo): veem os mesmos que o
--      super_admin e passam a guarda de âmbito ao gravar.
--   C. super_admin (Miguel tester): vê tudo e passa as guardas.
--   D. rpc_save_quote: sem quotes.edit/quotes.create falha; com permissão grava o dele; orçamento alheio (OWNED) falha.
--   E. SELECT de quotes / proposals / client_contracts: OWNED = o conjunto esperado (e contém o "meu" de cada ecrã); ORG = tudo.
--   F. Editar com as chaves da ação: com quotes.view=ORG e quotes.edit sem linha (OWNED), o UPDATE direto do alheio não toca.
--   G. NONE no servidor: crm_scope_keys vazio, get_schedule_item_scope_context = NONE sem donos, get_proposal_edit_scope = NULL;
--      get_proposal_edit_scope do super_admin = ORG.
--   H. soft_delete_business_entity (quote) e cancel_and_replace_contract com âmbito.
-- ============================================================

BEGIN;

CREATE TEMP TABLE _amb_rel (
  n           serial,
  conta       text,
  verificacao text,
  esperado    text,
  obtido      text,
  resultado   text,
  detalhe     text
) ON COMMIT DROP;

-- Corre p_sql com a sessão da conta (role authenticated + request.jwt.claims) num sub-bloco que acaba sempre em RAISE.
-- Devolve o primeiro valor da consulta, ou 'ERRO <sqlstate>: <mensagem>'.
CREATE FUNCTION pg_temp.amb_exec(p_auth uuid, p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v text; m text; d text; s text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', p_auth::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE p_sql INTO v;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__desfazer__', DETAIL = coalesce(v, '<null>');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS m = MESSAGE_TEXT, d = PG_EXCEPTION_DETAIL, s = RETURNED_SQLSTATE;
    IF m = '__desfazer__' THEN v := nullif(d, '<null>'); ELSE v := 'ERRO ' || s || ': ' || m; END IF;
  END;
  RETURN v;
END $f$;

CREATE FUNCTION pg_temp.amb_reg(p_conta text, p_verif text, p_esp text, p_obt text, p_det text DEFAULT NULL) RETURNS void LANGUAGE sql AS $f$
  INSERT INTO _amb_rel (conta, verificacao, esperado, obtido, resultado, detalhe)
  VALUES (p_conta, p_verif, p_esp, coalesce(p_obt, '<null>'), CASE WHEN p_esp IS NOT DISTINCT FROM p_obt THEN 'OK' ELSE 'FALHA' END, p_det);
$f$;

-- 'bloqueado' quando o erro casa com o padrão da guarda de âmbito/permissão; senão 'passou a guarda' (passou, ou falhou depois)
CREATE FUNCTION pg_temp.amb_guarda(p_res text, p_padrao text) RETURNS text LANGUAGE sql AS $f$
  SELECT CASE WHEN p_res IS NOT NULL AND p_res ~ '^ERRO ' AND p_res ~* p_padrao THEN 'bloqueado' ELSE 'passou a guarda' END
$f$;

DO $t$
DECLARE
  c_org     CONSTANT uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_rafael  CONSTANT uuid := '62ae9f3a-6ad6-45fb-bad4-df8647c8198b';
  c_miguel  CONSTANT uuid := 'ba0b0ebf-1bdb-43f9-b82b-a2ade29848e2';  -- super_admin (tester)
  c_outro   CONSTANT uuid := '231e2bef-141e-6d0d-f63d-8edbb403d309';  -- Helena: dona dos negócios da equipa (TEAM)
  c_papel   CONSTANT text[] := ARRAY['ines.lourenco@teste-rh.olyvia.invalid', 'marta.sequeira@teste-rh.olyvia.invalid',
                                     'paulo.nogueira@teste-rh.olyvia.invalid', 'sergio.matos@teste-rh.olyvia.invalid',
                                     'diogo.pereira@teste-rh.olyvia.invalid'];
  c_guarda_neg CONSTANT text := 'fora do seu âmbito';
  v_ra       uuid;   -- auth do Rafael
  v_ma       uuid;   -- auth do Miguel
  v_rp       uuid;   -- ficha (pessoa) do Rafael
  v_memb     uuid;   -- associação do Rafael na organização
  v_role_com uuid;   -- papel comercial
  v_role_sem uuid;   -- papel sem quotes.* (tecnico_de_obra ou viewer)
  v_role_ori uuid;
  v_total    int;    -- negócios que o super_admin vê
  v_n_meu    uuid;   -- negócio do Rafael (assigned_to)
  v_n_tar    uuid;   -- negócio alheio com uma tarefa do Rafael na obra
  v_n_alh    uuid;   -- negócio alheio, sem tarefas do Rafael
  v_n_team   uuid;   -- negócio da Helena (equipa)
  v_obra     uuid; v_tarefa uuid;
  v_q_meu    uuid;   -- orçamento criado pelo Rafael
  v_q_alh    uuid;   -- orçamento fora da cadeia do Rafael
  v_p_meu    uuid;   -- proposta criada pelo Rafael
  v_c_meu    uuid;   -- contrato criado pelo Rafael
  v_c_alh    uuid;
  v_team     uuid;
  v_esp      text; v_obt text; v_res text; v_det text;
  v_e_q int; v_e_p int; v_e_c int; v_e_n int; v_e_o int;
  v_tq int; v_tp int; v_tc int; v_to int;
  a record;
  v_ids      text;
  v_pl_meu   jsonb;  -- payloads do rpc_save_quote, lidos como postgres (a sessão do teste pode não ver o orçamento)
  v_pl_alh   jsonb;
BEGIN
  IF to_regprocedure('public.fn_doc_no_ambito(text,uuid,uuid,text[],text[],uuid[],uuid[])') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: esta base não tem a migration 20270110900000 (fn_doc_no_ambito)';
  END IF;

  -- ── preparação (postgres, sem sessão) ─────────────────────────────────────
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT auth_user_id INTO v_ra FROM anew_users WHERE id = c_rafael;
  SELECT auth_user_id INTO v_ma FROM anew_users WHERE id = c_miguel;
  SELECT pc.pessoa_id INTO v_rp FROM pessoas_contas pc WHERE pc.anew_user_id = c_rafael AND pc.organization_id = c_org
    AND pc.estado = 'activa' AND pc.revogada_em IS NULL ORDER BY pc.ligada_em DESC NULLS LAST LIMIT 1;
  SELECT id, role_id INTO v_memb, v_role_ori FROM anew_memberships WHERE user_id = c_rafael AND organization_id = c_org AND status = 'active' LIMIT 1;
  SELECT id INTO v_role_com FROM anew_roles WHERE code = 'comercial' AND organization_id = c_org AND deleted_at IS NULL LIMIT 1;
  SELECT r.id INTO v_role_sem FROM anew_roles r WHERE r.organization_id = c_org AND r.deleted_at IS NULL AND r.code IN ('tecnico_de_obra', 'viewer')
    AND NOT EXISTS (SELECT 1 FROM anew_role_permissions p WHERE p.role_id = r.id AND p.permission_code LIKE 'quotes.%')
    ORDER BY r.code LIMIT 1;
  IF v_ra IS NULL OR v_ma IS NULL OR v_memb IS NULL OR v_role_com IS NULL OR v_role_sem IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: faltam contas/papéis (rafael %, miguel %, associação %, comercial %, papel sem quotes %)',
      v_ra, v_ma, v_memb, v_role_com, v_role_sem;
  END IF;

  -- o Rafael fica comercial (OWNED: sem linhas de âmbito) e sem linhas de âmbito
  UPDATE anew_memberships SET role_id = v_role_com WHERE id = v_memb;
  DELETE FROM anew_membership_permission_scopes WHERE membership_id = v_memb;

  -- negócios: um dele, um com tarefa dele, um alheio, um da Helena
  SELECT n.id INTO v_n_meu FROM negocios n WHERE n.organization_id = c_org AND n.deleted_at IS NULL AND n.numero IS NOT NULL
    AND EXISTS (SELECT 1 FROM quotes q WHERE q.negocio_id = n.id AND q.deleted_at IS NULL)
    ORDER BY n.numero LIMIT 1;
  UPDATE negocios SET assigned_to = c_rafael WHERE id = v_n_meu;

  SELECT o.negocio_id, o.id, t.id INTO v_n_tar, v_obra, v_tarefa FROM ops_obra o JOIN negocios n ON n.id = o.negocio_id
    JOIN ops_obra_tarefa t ON t.obra_id = o.id
    WHERE o.organization_id = c_org AND n.deleted_at IS NULL AND n.numero IS NOT NULL AND o.negocio_id <> v_n_meu
    ORDER BY n.numero, t.ordem LIMIT 1;
  IF v_rp IS NOT NULL AND v_tarefa IS NOT NULL THEN
    INSERT INTO ops_obra_tarefa_rh (organization_id, obra_id, tarefa_id, pessoa_id, atribuida_por)
    VALUES (c_org, v_obra, v_tarefa, v_rp, c_rafael) ON CONFLICT DO NOTHING;
  END IF;

  SELECT n.id INTO v_n_alh FROM negocios n WHERE n.organization_id = c_org AND n.deleted_at IS NULL AND n.numero IS NOT NULL
    AND n.id NOT IN (v_n_meu, coalesce(v_n_tar, v_n_meu))
    AND coalesce(n.assigned_to::text, '') NOT IN (c_rafael::text, v_ra::text) AND coalesce(n.created_by::text, '') NOT IN (c_rafael::text, v_ra::text)
    AND NOT public.fn_neg_tem_tarefa(n.id, v_rp)
    ORDER BY n.numero DESC LIMIT 1;
  SELECT n.id INTO v_n_team FROM negocios n WHERE n.organization_id = c_org AND n.deleted_at IS NULL AND n.numero IS NOT NULL
    AND n.id NOT IN (v_n_meu, coalesce(v_n_tar, v_n_meu), v_n_alh) ORDER BY n.numero DESC LIMIT 1;

  -- documentos do Rafael: um orçamento, uma proposta, um contrato fora do negócio dele
  SELECT q.id INTO v_q_meu FROM quotes q WHERE q.organization_id = c_org AND q.deleted_at IS NULL
    AND q.negocio_id IS DISTINCT FROM v_n_meu ORDER BY q.created_at LIMIT 1;
  UPDATE quotes SET created_by = c_rafael WHERE id = v_q_meu;
  SELECT p.id INTO v_p_meu FROM proposals p WHERE p.organization_id = c_org AND p.deleted_at IS NULL
    AND p.negocio_id IS DISTINCT FROM v_n_meu ORDER BY p.created_at LIMIT 1;
  UPDATE proposals SET created_by = c_rafael WHERE id = v_p_meu;
  SELECT c.id INTO v_c_meu FROM client_contracts c WHERE c.organization_id = c_org AND c.deleted_at IS NULL
    AND c.negocio_id IS DISTINCT FROM v_n_meu ORDER BY c.created_at LIMIT 1;
  UPDATE client_contracts SET created_by = c_rafael WHERE id = v_c_meu;

  -- ── o esperado, das tabelas ────────────────────────────────────────────────
  CREATE TEMP TABLE _me ON COMMIT DROP AS SELECT unnest(ARRAY[c_rafael, v_ra]) AS id;
  CREATE TEMP TABLE _neg_meus ON COMMIT DROP AS
    SELECT n.id FROM negocios n WHERE n.organization_id = c_org AND n.deleted_at IS NULL
      AND (n.assigned_to IN (SELECT id FROM _me) OR n.created_by IN (SELECT id FROM _me)
           OR EXISTS (SELECT 1 FROM ops_obra o WHERE o.negocio_id = n.id AND v_rp IS NOT NULL
                        AND (EXISTS (SELECT 1 FROM ops_obra_tarefa_rh r WHERE r.obra_id = o.id AND r.pessoa_id = v_rp)
                             OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.estado_emylia->'plano'->'tasks') = 'array'
                                                     THEN o.estado_emylia->'plano'->'tasks' ELSE '[]'::jsonb END) t WHERE t->>'tec' = v_rp::text))));
  CREATE TEMP TABLE _deals_meus ON COMMIT DROP AS
    SELECT d.id FROM deals d LEFT JOIN anew_leads l ON l.id = d.lead_id WHERE d.organization_id = c_org
      AND (d.created_by IN (SELECT id FROM _me) OR d.assigned_to IN (SELECT id FROM _me)
           OR l.created_by IN (SELECT id FROM _me) OR l.assigned_to IN (SELECT id FROM _me));
  -- ancorados diretamente (dono, pedido/lead, negócio)
  CREATE TEMP TABLE _q_dir ON COMMIT DROP AS SELECT q.id, q.proposal_id FROM quotes q WHERE q.organization_id = c_org
      AND (q.created_by IN (SELECT id FROM _me) OR q.assigned_to IN (SELECT id FROM _me) OR q.deal_id IN (SELECT id FROM _deals_meus)
           OR q.negocio_id IN (SELECT id FROM _neg_meus));
  CREATE TEMP TABLE _p_dir ON COMMIT DROP AS SELECT p.id, p.client_contract_id FROM proposals p WHERE p.organization_id = c_org
      AND (p.created_by IN (SELECT id FROM _me) OR p.assigned_to IN (SELECT id FROM _me) OR p.deal_id IN (SELECT id FROM _deals_meus)
           OR p.negocio_id IN (SELECT id FROM _neg_meus));
  CREATE TEMP TABLE _c_dir ON COMMIT DROP AS SELECT c.id, c.quote_id, c.proposal_id FROM client_contracts c WHERE c.organization_id = c_org
      AND (c.created_by IN (SELECT id FROM _me) OR c.assigned_to IN (SELECT id FROM _me) OR c.negocio_id IN (SELECT id FROM _neg_meus));
  SELECT count(*) INTO v_e_q FROM quotes q LEFT JOIN proposals p ON p.id = q.proposal_id WHERE q.organization_id = c_org
    AND (q.id IN (SELECT id FROM _q_dir) OR q.proposal_id IN (SELECT id FROM _p_dir)
         OR q.id IN (SELECT quote_id FROM _c_dir) OR q.proposal_id IN (SELECT proposal_id FROM _c_dir) OR p.client_contract_id IN (SELECT id FROM _c_dir));
  SELECT count(*) INTO v_e_p FROM proposals p WHERE p.organization_id = c_org
    AND (p.id IN (SELECT id FROM _p_dir) OR p.id IN (SELECT proposal_id FROM _q_dir)
         OR p.id IN (SELECT proposal_id FROM _c_dir) OR p.client_contract_id IN (SELECT id FROM _c_dir));
  SELECT count(*) INTO v_e_c FROM client_contracts c WHERE c.organization_id = c_org
    AND (c.id IN (SELECT id FROM _c_dir) OR c.proposal_id IN (SELECT id FROM _p_dir) OR c.id IN (SELECT client_contract_id FROM _p_dir)
         OR c.quote_id IN (SELECT id FROM _q_dir));
  SELECT count(*) INTO v_e_n FROM negocios n WHERE n.id IN (SELECT id FROM _neg_meus) AND n.numero IS NOT NULL;
  SELECT count(*) INTO v_e_o FROM ops_obra o WHERE o.organization_id = c_org AND o.negocio_id IN (SELECT id FROM _neg_meus);
  SELECT count(*) INTO v_total FROM negocios n WHERE n.organization_id = c_org AND n.deleted_at IS NULL AND n.numero IS NOT NULL;
  SELECT count(*) INTO v_to FROM ops_obra o JOIN negocios n ON n.id = o.negocio_id AND n.deleted_at IS NULL WHERE o.organization_id = c_org;
  SELECT count(*) INTO v_tq FROM quotes WHERE organization_id = c_org;
  SELECT count(*) INTO v_tp FROM proposals WHERE organization_id = c_org;
  SELECT count(*) INTO v_tc FROM client_contracts WHERE organization_id = c_org;
  -- um orçamento e um contrato fora da cadeia
  SELECT q.id INTO v_q_alh FROM quotes q LEFT JOIN proposals p ON p.id = q.proposal_id WHERE q.organization_id = c_org AND q.deleted_at IS NULL
    AND NOT (q.id IN (SELECT id FROM _q_dir) OR coalesce(q.proposal_id IN (SELECT id FROM _p_dir), false)
         OR q.id IN (SELECT quote_id FROM _c_dir WHERE quote_id IS NOT NULL) OR coalesce(q.proposal_id IN (SELECT proposal_id FROM _c_dir WHERE proposal_id IS NOT NULL), false)
         OR coalesce(p.client_contract_id IN (SELECT id FROM _c_dir), false))
    ORDER BY q.created_at DESC LIMIT 1;
  SELECT c.id INTO v_c_alh FROM client_contracts c WHERE c.organization_id = c_org AND c.deleted_at IS NULL AND c.status IN ('draft', 'signed', 'active')
    AND c.id <> v_c_meu AND NOT (c.id IN (SELECT id FROM _c_dir) OR coalesce(c.proposal_id IN (SELECT id FROM _p_dir), false)
         OR c.id IN (SELECT client_contract_id FROM _p_dir WHERE client_contract_id IS NOT NULL) OR coalesce(c.quote_id IN (SELECT id FROM _q_dir), false))
    LIMIT 1;

  v_det := format('meu %s, tarefa %s, alheio %s, equipa %s | q_meu %s q_alh %s p_meu %s c_meu %s c_alh %s',
                  v_n_meu, v_n_tar, v_n_alh, v_n_team, v_q_meu, v_q_alh, v_p_meu, v_c_meu, v_c_alh);
  PERFORM pg_temp.amb_reg('preparação', '0 dados de teste', 'prontos',
    CASE WHEN v_n_meu IS NOT NULL AND v_n_alh IS NOT NULL AND v_q_meu IS NOT NULL THEN 'prontos' ELSE 'em falta' END, v_det);

  SELECT to_jsonb(q) INTO v_pl_meu FROM quotes q WHERE q.id = v_q_meu;
  SELECT to_jsonb(q) INTO v_pl_alh FROM quotes q WHERE q.id = v_q_alh;

  -- ── A. Rafael comercial, OWNED ─────────────────────────────────────────────
  v_obt := pg_temp.amb_exec(v_ra, format($q$SELECT string_agg(e->'negocio'->>'id', ',' ORDER BY e->'negocio'->>'id') FROM jsonb_array_elements(public.neg_ler_negocios(%L)) e$q$, c_org));
  SELECT string_agg(id::text, ',' ORDER BY id::text) INTO v_esp FROM negocios WHERE id IN (SELECT id FROM _neg_meus) AND numero IS NOT NULL;
  PERFORM pg_temp.amb_reg('Rafael comercial OWNED', 'A1 neg_ler_negocios = os dele + tarefa', v_esp, v_obt, format('%s esperados de %s', v_e_n, v_total));
  PERFORM pg_temp.amb_reg('Rafael comercial OWNED', 'A1b inclui o negócio da tarefa (técnico)',
    CASE WHEN v_n_tar IS NULL OR v_rp IS NULL THEN 'sem dados' ELSE 'sim' END,
    CASE WHEN v_n_tar IS NULL OR v_rp IS NULL THEN 'sem dados' WHEN v_obt LIKE '%' || v_n_tar || '%' THEN 'sim' ELSE 'não' END);
  v_obt := pg_temp.amb_exec(v_ra, format('SELECT jsonb_array_length(public.obra_ler_negocios(%L))::text', c_org));
  PERFORM pg_temp.amb_reg('Rafael comercial OWNED', 'A2 obra_ler_negocios = obras dos dele', v_e_o::text, v_obt);

  v_res := pg_temp.amb_exec(v_ra, format($q$SELECT 'passou' FROM public.neg_guardar_negocio(%L, %L, '{}'::jsonb)$q$, c_org, v_n_alh));
  PERFORM pg_temp.amb_reg('Rafael comercial OWNED', 'A3 neg_guardar_negocio alheio', 'bloqueado', pg_temp.amb_guarda(v_res, c_guarda_neg), left(v_res, 160));
  v_res := pg_temp.amb_exec(v_ra, format($q$SELECT 'passou' FROM public.neg_guardar_negocio(%L, %L, '{}'::jsonb)$q$, c_org, v_n_meu));
  PERFORM pg_temp.amb_reg('Rafael comercial OWNED', 'A4 neg_guardar_negocio dele', 'passou a guarda', pg_temp.amb_guarda(v_res, c_guarda_neg), left(v_res, 160));
  v_res := pg_temp.amb_exec(v_ra, format($q$SELECT 'passou' FROM public.obra_guardar_negocio(%L, %L, '{}'::jsonb)$q$, c_org, v_n_alh));
  PERFORM pg_temp.amb_reg('Rafael comercial OWNED', 'A5 obra_guardar_negocio alheio', 'bloqueado', pg_temp.amb_guarda(v_res, c_guarda_neg), left(v_res, 160));
  IF v_n_tar IS NOT NULL AND v_rp IS NOT NULL THEN
    v_res := pg_temp.amb_exec(v_ra, format($q$SELECT 'passou' FROM public.obra_guardar_negocio(%L, %L, '{}'::jsonb)$q$, c_org, v_n_tar));
    PERFORM pg_temp.amb_reg('Rafael comercial OWNED', 'A6 obra_guardar_negocio com tarefa dele', 'passou a guarda', pg_temp.amb_guarda(v_res, c_guarda_neg), left(v_res, 160));
  END IF;

  -- A7. linha ORG em pessoas.view: vê todos
  INSERT INTO anew_membership_permission_scopes (membership_id, permission_code, scope_level) VALUES (v_memb, 'pessoas.view', 'ORG');
  v_obt := pg_temp.amb_exec(v_ra, format('SELECT jsonb_array_length(public.neg_ler_negocios(%L))::text', c_org));
  PERFORM pg_temp.amb_reg('Rafael pessoas.view=ORG', 'A7 neg_ler_negocios = todos', v_total::text, v_obt);
  DELETE FROM anew_membership_permission_scopes WHERE membership_id = v_memb;

  -- A8. TEAM: equipa liderada pelo Rafael com a Helena; o negócio v_n_team passa a ser da Helena
  UPDATE negocios SET assigned_to = c_outro WHERE id = v_n_team;
  INSERT INTO organization_teams (organization_id, name, leader_id) VALUES (c_org, 'teste-ambito (desfeita)', c_rafael) RETURNING id INTO v_team;
  INSERT INTO organization_team_members (team_id, user_id) VALUES (v_team, c_outro);
  INSERT INTO anew_membership_permission_scopes (membership_id, permission_code, scope_level) VALUES (v_memb, 'pessoas.view', 'TEAM');
  SELECT count(*) INTO v_e_n FROM negocios n WHERE n.organization_id = c_org AND n.deleted_at IS NULL AND n.numero IS NOT NULL
    AND (n.id IN (SELECT id FROM _neg_meus) OR n.assigned_to = c_outro OR n.created_by = c_outro);
  v_obt := pg_temp.amb_exec(v_ra, format('SELECT jsonb_array_length(public.neg_ler_negocios(%L))::text', c_org));
  PERFORM pg_temp.amb_reg('Rafael pessoas.view=TEAM', 'A8 neg_ler_negocios = dele + equipa', v_e_n::text, v_obt);
  DELETE FROM anew_membership_permission_scopes WHERE membership_id = v_memb;

  -- A9. NONE: nada (nem os dele, nem a tarefa)
  INSERT INTO anew_membership_permission_scopes (membership_id, permission_code, scope_level) VALUES (v_memb, 'pessoas.view', 'NONE');
  v_obt := pg_temp.amb_exec(v_ra, format('SELECT jsonb_array_length(public.neg_ler_negocios(%L))::text', c_org));
  PERFORM pg_temp.amb_reg('Rafael pessoas.view=NONE', 'A9 neg_ler_negocios = nada', CASE WHEN v_rp IS NOT NULL AND v_n_tar IS NOT NULL THEN '1' ELSE '0' END, v_obt,
    'NONE nega o âmbito do perfil; a tarefa na obra continua a dar o negócio dela (o técnico não perde a obra)');
  v_obt := pg_temp.amb_exec(v_ra, $q$SELECT coalesce(cardinality(public.crm_scope_keys('pessoas.view')), 0)::text$q$);
  PERFORM pg_temp.amb_reg('Rafael pessoas.view=NONE', 'G1 crm_scope_keys(pessoas.view) vazio', '0', v_obt);
  DELETE FROM anew_membership_permission_scopes WHERE membership_id = v_memb;

  -- ── B. só Papel no Negócio / técnicos: o mesmo que o super_admin ──────────
  FOR a IN SELECT u.email, u.auth_user_id FROM anew_users u WHERE u.email = ANY (c_papel) ORDER BY u.email LOOP
    v_obt := pg_temp.amb_exec(a.auth_user_id, format('SELECT jsonb_array_length(public.neg_ler_negocios(%L))::text', c_org));
    PERFORM pg_temp.amb_reg(a.email, 'B1 neg_ler_negocios = todos', v_total::text, v_obt);
    v_obt := pg_temp.amb_exec(a.auth_user_id, format('SELECT jsonb_array_length(public.obra_ler_negocios(%L))::text', c_org));
    PERFORM pg_temp.amb_reg(a.email, 'B2 obra_ler_negocios = todas', v_to::text, v_obt);
    v_res := pg_temp.amb_exec(a.auth_user_id, format($q$SELECT 'passou' FROM public.neg_guardar_negocio(%L, %L, '{}'::jsonb)$q$, c_org, v_n_alh));
    PERFORM pg_temp.amb_reg(a.email, 'B3 neg_guardar_negocio: guarda de âmbito', 'não aplica', CASE WHEN v_res ~* c_guarda_neg THEN 'bloqueado pelo âmbito' ELSE 'não aplica' END, left(v_res, 160));
    v_res := pg_temp.amb_exec(a.auth_user_id, format($q$SELECT 'passou' FROM public.obra_guardar_negocio(%L, %L, '{}'::jsonb)$q$, c_org, coalesce(v_n_tar, v_n_alh)));
    PERFORM pg_temp.amb_reg(a.email, 'B4 obra_guardar_negocio: guarda de âmbito', 'não aplica', CASE WHEN v_res ~* c_guarda_neg THEN 'bloqueado pelo âmbito' ELSE 'não aplica' END, left(v_res, 160));
  END LOOP;

  -- ── C. super_admin ──────────────────────────────────────────────────────────
  v_obt := pg_temp.amb_exec(v_ma, format('SELECT jsonb_array_length(public.neg_ler_negocios(%L))::text', c_org));
  PERFORM pg_temp.amb_reg('Miguel super_admin', 'C1 neg_ler_negocios = todos', v_total::text, v_obt);
  v_obt := pg_temp.amb_exec(v_ma, format($q$SELECT (SELECT count(*) FROM quotes WHERE organization_id = %1$L) || '/' || (SELECT count(*) FROM proposals WHERE organization_id = %1$L) || '/' || (SELECT count(*) FROM client_contracts WHERE organization_id = %1$L)$q$, c_org));
  PERFORM pg_temp.amb_reg('Miguel super_admin', 'C2 quotes/proposals/client_contracts = todos', v_tq || '/' || v_tp || '/' || v_tc, v_obt);
  v_res := pg_temp.amb_exec(v_ma, format($q$SELECT 'passou' FROM public.neg_guardar_negocio(%L, %L, '{}'::jsonb)$q$, c_org, v_n_alh));
  PERFORM pg_temp.amb_reg('Miguel super_admin', 'C3 neg_guardar_negocio alheio', 'passou a guarda', pg_temp.amb_guarda(v_res, c_guarda_neg), left(v_res, 160));
  v_obt := pg_temp.amb_exec(v_ma, format($q$SELECT public.get_proposal_edit_scope(auth.uid(), %L)$q$, c_org));
  PERFORM pg_temp.amb_reg('Miguel super_admin', 'G2 get_proposal_edit_scope = ORG', 'ORG', v_obt);
  v_res := pg_temp.amb_exec(v_ma, format($q$SELECT 'passou' FROM public.rpc_save_quote(%L, %L::jsonb, NULL, NULL, '{}'::jsonb)$q$, v_q_alh, v_pl_alh));
  PERFORM pg_temp.amb_reg('Miguel super_admin', 'D0 rpc_save_quote alheio', 'passou a guarda', pg_temp.amb_guarda(v_res, 'fora do âmbito do utilizador|Sem permissão para'), left(v_res, 160));

  -- ── D. rpc_save_quote ───────────────────────────────────────────────────────
  v_res := pg_temp.amb_exec(v_ra, format($q$SELECT 'passou' FROM public.rpc_save_quote(%L, %L::jsonb, NULL, NULL, '{}'::jsonb)$q$, v_q_meu, v_pl_meu));
  PERFORM pg_temp.amb_reg('Rafael comercial OWNED', 'D1 rpc_save_quote dele', 'passou a guarda', pg_temp.amb_guarda(v_res, 'fora do âmbito do utilizador|Sem permissão para'), left(v_res, 160));
  IF v_q_alh IS NOT NULL THEN
    v_res := pg_temp.amb_exec(v_ra, format($q$SELECT 'passou' FROM public.rpc_save_quote(%L, %L::jsonb, NULL, NULL, '{}'::jsonb)$q$, v_q_alh, v_pl_alh));
    PERFORM pg_temp.amb_reg('Rafael comercial OWNED', 'D2 rpc_save_quote alheio', 'bloqueado', pg_temp.amb_guarda(v_res, 'Orçamento fora do âmbito do utilizador'), left(v_res, 160));
  END IF;
  v_res := pg_temp.amb_exec(v_ra, format($q$SELECT 'passou' FROM public.rpc_save_quote(NULL, %L::jsonb, NULL, NULL, '{}'::jsonb)$q$, v_pl_meu - 'id'));
  PERFORM pg_temp.amb_reg('Rafael comercial OWNED', 'D3 rpc_save_quote novo', 'passou a guarda', pg_temp.amb_guarda(v_res, 'fora do âmbito do utilizador|Sem permissão para'), left(v_res, 160));
  UPDATE anew_memberships SET role_id = v_role_sem WHERE id = v_memb;
  v_res := pg_temp.amb_exec(v_ra, format($q$SELECT 'passou' FROM public.rpc_save_quote(%L, %L::jsonb, NULL, NULL, '{}'::jsonb)$q$, v_q_meu, v_pl_meu));
  PERFORM pg_temp.amb_reg('Rafael sem quotes.*', 'D4 rpc_save_quote dele sem quotes.edit', 'bloqueado', pg_temp.amb_guarda(v_res, 'Sem permissão para editar'), left(v_res, 160));
  v_res := pg_temp.amb_exec(v_ra, format($q$SELECT 'passou' FROM public.rpc_save_quote(NULL, %L::jsonb, NULL, NULL, '{}'::jsonb)$q$, v_pl_meu - 'id'));
  PERFORM pg_temp.amb_reg('Rafael sem quotes.*', 'D5 rpc_save_quote novo sem quotes.create', 'bloqueado', pg_temp.amb_guarda(v_res, 'Sem permissão para criar'), left(v_res, 160));
  UPDATE anew_memberships SET role_id = v_role_com WHERE id = v_memb;

  -- ── E. SELECT com âmbito ────────────────────────────────────────────────────
  v_obt := pg_temp.amb_exec(v_ra, format($q$SELECT (SELECT count(*) FROM quotes WHERE organization_id = %1$L) || '/' || (SELECT count(*) FROM proposals WHERE organization_id = %1$L) || '/' || (SELECT count(*) FROM client_contracts WHERE organization_id = %1$L)$q$, c_org));
  PERFORM pg_temp.amb_reg('Rafael comercial OWNED', 'E1 quotes/proposals/client_contracts = a cadeia dele', v_e_q || '/' || v_e_p || '/' || v_e_c, v_obt,
    format('de %s/%s/%s', v_tq, v_tp, v_tc));
  -- o "meu" de cada ecrã está todo lá (Orçamentos: criador + pedido/lead; Propostas: criador + pedido/lead; Contratos: criador/responsável)
  v_esp := (SELECT count(*) FROM quotes q WHERE q.organization_id = c_org AND q.is_internal = false
            AND (q.created_by IN (SELECT id FROM _me) OR q.deal_id IN (SELECT id FROM _deals_meus)))::text
        || '/' || (SELECT count(*) FROM proposals p WHERE p.organization_id = c_org AND (p.created_by IN (SELECT id FROM _me) OR p.deal_id IN (SELECT id FROM _deals_meus)))::text
        || '/' || (SELECT count(*) FROM client_contracts c WHERE c.organization_id = c_org AND (c.created_by IN (SELECT id FROM _me) OR c.assigned_to IN (SELECT id FROM _me)))::text;
  v_obt := pg_temp.amb_exec(v_ra, format($q$SELECT
      (SELECT count(*) FROM quotes q WHERE q.organization_id = %1$L AND q.is_internal = false AND (q.created_by = %2$L OR q.deal_id IN (SELECT d.id FROM deals d LEFT JOIN anew_leads l ON l.id = d.lead_id WHERE %2$L IN (d.created_by, d.assigned_to, l.created_by, l.assigned_to))))
      || '/' || (SELECT count(*) FROM proposals p WHERE p.organization_id = %1$L AND (p.created_by = %2$L OR p.deal_id IN (SELECT d.id FROM deals d LEFT JOIN anew_leads l ON l.id = d.lead_id WHERE %2$L IN (d.created_by, d.assigned_to, l.created_by, l.assigned_to))))
      || '/' || (SELECT count(*) FROM client_contracts c WHERE c.organization_id = %1$L AND %2$L IN (c.created_by, c.assigned_to))$q$, c_org, c_rafael));
  PERFORM pg_temp.amb_reg('Rafael comercial OWNED', 'E2 o "meu" de cada ecrã continua visível', v_esp, v_obt);
  v_obt := pg_temp.amb_exec(v_ra, format($q$SELECT count(*)::text FROM quotes WHERE negocio_id = %L$q$, v_n_meu));
  PERFORM pg_temp.amb_reg('Rafael comercial OWNED', 'E3 orçamentos do negócio dele (Negócios)', (SELECT count(*)::text FROM quotes WHERE negocio_id = v_n_meu), v_obt);
  IF v_q_alh IS NOT NULL THEN
    v_obt := pg_temp.amb_exec(v_ra, format($q$SELECT count(*)::text FROM quotes WHERE id = %L$q$, v_q_alh));
    PERFORM pg_temp.amb_reg('Rafael comercial OWNED', 'E4 orçamento fora da cadeia', '0', v_obt);
  END IF;
  INSERT INTO anew_membership_permission_scopes (membership_id, permission_code, scope_level)
  VALUES (v_memb, 'quotes.view', 'ORG'), (v_memb, 'proposals.view', 'ORG'), (v_memb, 'client_contracts.view', 'ORG');
  v_obt := pg_temp.amb_exec(v_ra, format($q$SELECT (SELECT count(*) FROM quotes WHERE organization_id = %1$L) || '/' || (SELECT count(*) FROM proposals WHERE organization_id = %1$L) || '/' || (SELECT count(*) FROM client_contracts WHERE organization_id = %1$L)$q$, c_org));
  PERFORM pg_temp.amb_reg('Rafael *.view=ORG', 'E5 quotes/proposals/client_contracts = todos', v_tq || '/' || v_tp || '/' || v_tc, v_obt);

  -- ── F. editar com as chaves da ação: quotes.view=ORG, quotes.edit sem linha (OWNED) ──
  IF v_q_alh IS NOT NULL THEN
    v_obt := pg_temp.amb_exec(v_ra, format($q$WITH u AS (UPDATE quotes SET title = title WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u$q$, v_q_alh));
    PERFORM pg_temp.amb_reg('Rafael quotes.view=ORG, edit OWNED', 'F1 UPDATE direto do orçamento alheio', '0', v_obt, 'antes de 20270110900000 a policy usava as chaves de view: 1');
  END IF;
  v_obt := pg_temp.amb_exec(v_ra, format($q$WITH u AS (UPDATE quotes SET title = title WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u$q$, v_q_meu));
  PERFORM pg_temp.amb_reg('Rafael quotes.view=ORG, edit OWNED', 'F2 UPDATE direto do orçamento dele', '1', v_obt);
  DELETE FROM anew_membership_permission_scopes WHERE membership_id = v_memb;

  -- ── G. NONE noutros helpers ─────────────────────────────────────────────────
  v_obt := pg_temp.amb_exec(v_ra, format($q$SELECT coalesce(get_proposal_edit_scope(auth.uid(), %L), 'NULO')$q$, c_org));
  PERFORM pg_temp.amb_reg('Rafael comercial OWNED', 'G3 get_proposal_edit_scope = OWNED', 'OWNED', v_obt);
  INSERT INTO anew_membership_permission_scopes (membership_id, permission_code, scope_level)
  VALUES (v_memb, 'proposals.edit', 'NONE'), (v_memb, 'scheduling.items.view', 'NONE');
  v_obt := pg_temp.amb_exec(v_ra, format($q$SELECT coalesce(get_proposal_edit_scope(auth.uid(), %L), 'NULO')$q$, c_org));
  PERFORM pg_temp.amb_reg('Rafael proposals.edit=NONE', 'G4 get_proposal_edit_scope = NULL', 'NULO', v_obt);
  v_obt := pg_temp.amb_exec(v_ra, format($q$SELECT applied_scope || ':' || cardinality(owner_ids) FROM get_schedule_item_scope_context(%L, 'scheduling.items.view')$q$, c_org));
  PERFORM pg_temp.amb_reg('Rafael scheduling.items.view=NONE', 'G5 get_schedule_item_scope_context', 'NONE:0', v_obt);
  DELETE FROM anew_membership_permission_scopes WHERE membership_id = v_memb;
  v_obt := pg_temp.amb_exec(v_ra, format($q$SELECT applied_scope || ':' || cardinality(owner_ids) FROM get_schedule_item_scope_context(%L, 'scheduling.items.view')$q$, c_org));
  PERFORM pg_temp.amb_reg('Rafael comercial OWNED', 'G6 get_schedule_item_scope_context sem linha', 'OWNED:1', v_obt);

  -- ── H. apagar / anular com âmbito ───────────────────────────────────────────
  IF v_q_alh IS NOT NULL THEN
    v_res := pg_temp.amb_exec(v_ra, format($q$SELECT public.soft_delete_business_entity('quote', %L)::text$q$, v_q_alh));
    PERFORM pg_temp.amb_reg('Rafael comercial OWNED', 'H1 soft_delete quote alheio', 'bloqueado', pg_temp.amb_guarda(v_res, 'fora do seu ambito'), left(v_res, 160));
  END IF;
  v_res := pg_temp.amb_exec(v_ra, format($q$SELECT public.soft_delete_business_entity('quote', %L)::text$q$, v_q_meu));
  PERFORM pg_temp.amb_reg('Rafael comercial OWNED', 'H2 soft_delete quote dele', 'passou a guarda', pg_temp.amb_guarda(v_res, 'fora do seu ambito|Sem permissao'), left(v_res, 160));
  IF v_c_alh IS NOT NULL THEN
    v_res := pg_temp.amb_exec(v_ra, format($q$SELECT public.cancel_and_replace_contract(%L, 'teste', false)::text$q$, v_c_alh));
    PERFORM pg_temp.amb_reg('Rafael comercial OWNED', 'H3 cancel_and_replace_contract alheio', 'bloqueado', pg_temp.amb_guarda(v_res, 'insufficient_permission'), left(v_res, 160));
  END IF;
  IF v_c_meu IS NOT NULL THEN
    v_res := pg_temp.amb_exec(v_ra, format($q$SELECT public.cancel_and_replace_contract(%L, 'teste', false)::text$q$, v_c_meu));
    PERFORM pg_temp.amb_reg('Rafael comercial OWNED', 'H4 cancel_and_replace_contract dele', 'passou a guarda', pg_temp.amb_guarda(v_res, 'insufficient_permission'), left(v_res, 160));
  END IF;
  v_res := pg_temp.amb_exec(v_ma, format($q$SELECT public.cancel_and_replace_contract(%L, 'teste', false)::text$q$, coalesce(v_c_alh, v_c_meu)));
  PERFORM pg_temp.amb_reg('Miguel super_admin', 'H5 cancel_and_replace_contract alheio', 'passou a guarda', pg_temp.amb_guarda(v_res, 'insufficient_permission'), left(v_res, 160));

  -- repor (o ROLLBACK final também desfaz)
  UPDATE anew_memberships SET role_id = v_role_ori WHERE id = v_memb;
END $t$;

SELECT conta, verificacao, esperado, obtido, resultado, detalhe
FROM (
  SELECT n, conta, verificacao, esperado, obtido, resultado, detalhe FROM _amb_rel
  UNION ALL
  SELECT 1000000, 'TOTAL', count(*)::text || ' verificações', NULL, NULL,
         count(*) FILTER (WHERE resultado = 'FALHA')::text || ' FALHA(S)',
         string_agg(DISTINCT verificacao, ', ') FILTER (WHERE resultado = 'FALHA')
  FROM _amb_rel
) s
ORDER BY n;

ROLLBACK;
