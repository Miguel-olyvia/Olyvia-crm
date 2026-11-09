-- ============================================================
-- Teste: quem passa e quem é bloqueado nas ações de permissões, por papel (base RH)
-- ============================================================
-- SÓ para a base RH (project-ref uetjghdkwbywbftedtth). NUNCA na de produção (tzbfgwpckrfbqcolqxtm).
-- Tudo dentro de BEGIN … ROLLBACK; cada ação corre num sub-bloco que acaba SEMPRE em RAISE (desfaz-se o que
-- a ação escreveu, mesmo quando passa). As trocas de papel da conta-sonda também são desfeitas no ROLLBACK final.
-- Nada de DDL persistente: só tabelas temporárias ON COMMIT DROP, que o ROLLBACK leva.
--
-- Correr (o resultado é o último SELECT, uma linha por verificação + a linha TOTAL):
--   supabase db query --linked --workdir <workdir RH> -f supabase/tests/permissoes_papeis.sql
--
-- O ESPERADO é derivado das tabelas, não das funções testadas:
--   perfil  = anew_role_permissions do papel da associação ativa (não-cliente) nesta organização
--   papel   = neg_papeis_permissoes dos Papéis no Negócio da ficha ligada (pessoas_contas ativa, não revogada,
--             pessoa ativa) em pessoas_papeis_negocio, + 'tecnico' se fn_rh_pessoa_tecnica
--   admin   = associação ativa ao papel global system_admin
-- O OBTIDO é o que as funções vivas devolvem com a sessão da conta (request.jwt.claims + role authenticated).
--
-- Cobre (por conta ativa da organização + conta-sonda sem ficha RH com o papel trocado para system_admin, viewer e
-- teste_rh_so_ponto — esta última é o caso "tem hr.assiduidade.picar mas não tem ficha ligada"):
--   1. fn_cat_pode: negocios.proposta.enviar, portal.manage, client_contracts.cancel, quotes.view_costs,
--      deals.delete, trash.view, hr.assiduidade.picar, hr.pessoas.view
--   2. trg_documents_portal_exige_permissao: insert em documents visible_to_client=true (portal.manage OU
--      negocios.proposta.enviar) e =false (só a RLS)
--   3. Custos: rpc_quote_lines_custos (quotes.view + quotes.view_costs|quotes.manage) e neg_ler_negocios
--      (pessoas.view + quotes.view_costs|quotes.manage — a mesma regra desde 20270110200000)
--   4. rpc_hr_picar: com ficha → hr.assiduidade.picar; sem ficha → deve recusar com mensagem de "sem ficha"
--      (conta_sem_ficha_rh, 20270110200000)
--   5. purge_business_entity('quote', …): bloqueia sem deals.delete nesta organização ou acima (quando passa, o
--      apagar é desfeito)
--   5b. purge_business_entity simulado: a sonda fica viewer aqui e ganha, só dentro do sub-bloco, uma associação
--      super_admin (com deals.delete) noutra organização fora da cadeia desta → tem de ser bloqueada
--   6. custos iguais nas duas vias: onde 3a e 3b leem linhas, ambas dão "com custos" ou ambas "custos a null"
--   3b desde 20270110900000: neg_ler_negocios só devolve os negócios no âmbito de pessoas.view (dono, equipa com TEAM, tarefas na
--      obra; tudo para admin, quem entra pelo papel ou tem um Papel no Negócio explícito, ou com linha ORG). Sem nenhum orçamento
--      Emylia nesse âmbito, o esperado é "sem linhas". Esperado calculado das tabelas (v_neg_tudo / v_neg_vis).
-- ============================================================

BEGIN;

CREATE TEMP TABLE _perm_rel (
  n           serial,
  conta       text,
  verificacao text,
  esperado    text,
  obtido      text,
  resultado   text,
  detalhe     text
) ON COMMIT DROP;

CREATE TEMP TABLE _perm_contas (
  ordem        int,
  user_id      uuid,
  auth_id      uuid,
  troca_papel  uuid,   -- não nulo: a associação da conta-sonda passa a este papel durante as verificações
  rotulo       text
) ON COMMIT DROP;

CREATE TEMP TABLE _perm_exp (
  code   text PRIMARY KEY,
  perfil boolean,
  papel  boolean
) ON COMMIT DROP;

DO $t$
DECLARE
  c_org    CONSTANT uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_sonda  CONSTANT uuid := 'b0e36009-0b71-4e80-9851-cc2c01d12d46';  -- anew_users.id: super_admin sem ficha RH
  c_codes  CONSTANT text[] := ARRAY['negocios.proposta.enviar', 'portal.manage', 'client_contracts.cancel', 'quotes.view_costs',
                                    'deals.delete', 'trash.view', 'hr.assiduidade.picar', 'hr.pessoas.view'];
  c_extra  CONSTANT text[] := ARRAY['quotes.view', 'quotes.manage', 'pessoas.view', 'hr.assiduidade.picar.outros'];
  a            record;
  v_code       text;
  v_role_orig  uuid;
  v_rolecode   text;
  v_sa         boolean;
  v_membro     boolean;   -- associação ativa não-cliente nesta organização (RLS de documents)
  v_ficha      uuid;      -- pessoas_contas ativa (o critério de hr_pessoa_do_utilizador)
  v_pessoa_neg uuid;      -- ficha para os Papéis no Negócio (o critério de fn_neg_pessoa_da_conta)
  v_papeis     text[];
  v_claims     text;
  v_quote      uuid;
  v_quotes     uuid[];
  v_base_cost  int;
  v_base_neg   int;
  v_exp_b      boolean;
  v_got_b      boolean;
  v_exp        text;
  v_got        text;
  v_det        text;
  v_msg        text;
  v_state      text;
  v_n          int;
  v_nc         int;
  v_j          jsonb;
  v_ok_role    text;
  v_got3a      text;      -- 6: o obtido em 3a e em 3b, para comparar as duas vias de custos
  v_got3b      text;
  v_org2       uuid;      -- 5b: outra organização fora da cadeia desta
  v_role_dd    uuid;      -- 5b: papel global super_admin (tem deals.delete)
  v_role_vw    uuid;      -- 5b: papel viewer desta organização
  v_sonda_auth uuid;
  v_fase       text;
  v_neg_tudo   boolean;   -- 3b (20270110900000): vê todos os negócios (admin, sem pessoas.view no perfil, ou Papel no Negócio explícito)
  v_neg_vis    int;       -- 3b: orçamentos Emylia dos negócios que a conta vê com o âmbito de pessoas.view
BEGIN
  -- Guardas: objetos que o teste usa têm de existir (base RH com a migration 20270110100000).
  IF to_regclass('public.neg_papeis_permissoes') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_documents_portal_exige_permissao') THEN
    RAISE EXCEPTION 'ABORTADO: esta base não tem neg_papeis_permissoes / trg_documents_portal_exige_permissao (é a base RH?)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM anew_organizations WHERE id = c_org) THEN
    RAISE EXCEPTION 'ABORTADO: organização % não existe', c_org;
  END IF;

  -- Dados de referência (como postgres).
  SELECT array_agg(q.id ORDER BY q.created_at) INTO v_quotes
  FROM quotes q WHERE q.organization_id = c_org AND q.deleted_at IS NULL;
  v_quote := v_quotes[1];
  SELECT count(*) INTO v_base_cost FROM quote_lines l
  WHERE l.quote_id = ANY (v_quotes)
    AND (l.cost_price IS NOT NULL OR l.custo_material_unit IS NOT NULL OR l.custo_mao_obra_unit IS NOT NULL);
  SELECT count(*) INTO v_base_neg FROM quotes q JOIN negocios n ON n.id = q.negocio_id
  WHERE n.organization_id = c_org AND n.deleted_at IS NULL AND n.numero IS NOT NULL AND q.fluxo_emylia AND q.deleted_at IS NULL;

  -- Contas: todas as associações ativas da organização (só a primeira de cliente) + a sonda com papel trocado.
  INSERT INTO _perm_contas (ordem, user_id, auth_id, troca_papel, rotulo)
  SELECT row_number() OVER (ORDER BY r.code, u.email), u.id, u.auth_user_id, NULL,
         r.code || ' <' || u.email || '>'
  FROM anew_memberships am
  JOIN anew_users u ON u.id = am.user_id
  JOIN anew_roles r ON r.id = am.role_id
  WHERE am.organization_id = c_org AND am.status = 'active' AND u.auth_user_id IS NOT NULL
    AND (r.code <> 'client' OR u.id = (SELECT min(m2.user_id::text)::uuid FROM anew_memberships m2 JOIN anew_roles r2 ON r2.id = m2.role_id
                                        WHERE m2.organization_id = c_org AND m2.status = 'active' AND r2.code = 'client'));
  INSERT INTO _perm_contas (ordem, user_id, auth_id, troca_papel, rotulo)
  SELECT 900 + row_number() OVER (ORDER BY r.code), u.id, u.auth_user_id, r.id, r.code || ' (sonda <' || u.email || '>)'
  FROM anew_users u
  JOIN anew_roles r ON (r.code = 'system_admin' AND r.organization_id IS NULL AND r.is_system)
                    OR (r.code IN ('viewer', 'teste_rh_so_ponto') AND r.organization_id = c_org AND r.deleted_at IS NULL)
  WHERE u.id = c_sonda;

  FOR a IN SELECT * FROM _perm_contas ORDER BY ordem LOOP
    -- ── preparar a conta (postgres) ────────────────────────────────────────
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    IF a.troca_papel IS NOT NULL THEN
      SELECT role_id INTO v_role_orig FROM anew_memberships WHERE user_id = a.user_id AND organization_id = c_org;
      UPDATE anew_memberships SET role_id = a.troca_papel WHERE user_id = a.user_id AND organization_id = c_org;
    END IF;

    SELECT r.code INTO v_rolecode FROM anew_memberships am JOIN anew_roles r ON r.id = am.role_id
    WHERE am.user_id = a.user_id AND am.organization_id = c_org AND am.status = 'active' LIMIT 1;

    v_sa := EXISTS (SELECT 1 FROM anew_memberships am JOIN anew_roles r ON r.id = am.role_id
                    WHERE am.user_id = a.user_id AND am.status = 'active' AND r.code = 'system_admin'
                      AND r.is_system AND r.organization_id IS NULL AND r.deleted_at IS NULL);
    v_membro := EXISTS (SELECT 1 FROM anew_memberships am WHERE am.user_id = a.user_id AND am.organization_id = c_org
                          AND am.status = 'active' AND am.role_is_client IS NOT TRUE);
    SELECT pc.pessoa_id INTO v_ficha FROM pessoas_contas pc JOIN pessoas p ON p.id = pc.pessoa_id AND p.deleted_at IS NULL
    WHERE pc.anew_user_id = a.user_id AND pc.organization_id = c_org AND pc.estado = 'activa' AND pc.revogada_em IS NULL LIMIT 1;
    SELECT pc.pessoa_id INTO v_pessoa_neg FROM pessoas_contas pc JOIN pessoas p ON p.id = pc.pessoa_id
    WHERE pc.anew_user_id = a.user_id AND pc.organization_id = c_org AND pc.estado = 'activa' AND pc.revogada_em IS NULL
      AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)
    ORDER BY pc.ligada_em DESC NULLS LAST LIMIT 1;
    SELECT coalesce(array_agg(DISTINCT x), '{}') INTO v_papeis FROM (
      SELECT pp.papel AS x FROM pessoas_papeis_negocio pp WHERE pp.pessoa_id = v_pessoa_neg AND pp.organization_id = c_org
      UNION SELECT 'tecnico' WHERE v_pessoa_neg IS NOT NULL AND public.fn_rh_pessoa_tecnica(c_org, v_pessoa_neg)) s;

    TRUNCATE _perm_exp;
    INSERT INTO _perm_exp (code, perfil, papel)
    SELECT c,
      EXISTS (SELECT 1 FROM anew_memberships am JOIN anew_role_permissions p ON p.role_id = am.role_id AND p.permission_code = c
              WHERE am.user_id = a.user_id AND am.organization_id = c_org AND am.status = 'active' AND am.role_is_client IS NOT TRUE),
      EXISTS (SELECT 1 FROM neg_papeis_permissoes m WHERE m.permission_code = c AND m.papel = ANY (v_papeis))
    FROM unnest(c_codes || c_extra) c;

    -- 3b (20270110900000): o âmbito de pessoas.view nos Negócios, a partir das tabelas. Vê tudo: admin (system_admin, super_admin
    -- aqui ou acima), quem não tem pessoas.view no perfil (entra pelo papel), quem tem um Papel no Negócio explícito
    -- (pessoas_papeis_negocio) que dá pessoas.view, ou uma linha ORG. Senão: os negócios de que é dono (assigned_to/created_by), os da
    -- equipa que lidera com uma linha TEAM, e aqueles em cuja obra tem tarefas.
    v_neg_tudo := v_sa
      OR EXISTS (WITH RECURSIVE cad(org) AS (SELECT c_org UNION SELECT h.parent_org_id FROM anew_hierarchy h JOIN cad ON h.child_org_id = cad.org)
                 SELECT 1 FROM anew_memberships am JOIN anew_roles r ON r.id = am.role_id
                 WHERE am.user_id = a.user_id AND am.status = 'active'
                   AND (r.code = 'system_admin' OR (r.code = 'super_admin' AND am.organization_id IN (SELECT org FROM cad))))
      OR NOT EXISTS (SELECT 1 FROM _perm_exp e WHERE e.code = 'pessoas.view' AND e.perfil)
      OR EXISTS (SELECT 1 FROM pessoas_papeis_negocio pp JOIN neg_papeis_permissoes m ON m.papel = pp.papel AND m.permission_code = 'pessoas.view'
                 WHERE pp.pessoa_id = v_pessoa_neg AND pp.organization_id = c_org)
      OR EXISTS (SELECT 1 FROM anew_memberships am JOIN anew_membership_permission_scopes s ON s.membership_id = am.id
                 WHERE am.user_id = a.user_id AND am.organization_id = c_org AND am.status = 'active'
                   AND s.permission_code = 'pessoas.view' AND s.scope_level = 'ORG');
    SELECT count(*) INTO v_neg_vis FROM quotes q JOIN negocios n ON n.id = q.negocio_id
    WHERE n.organization_id = c_org AND n.deleted_at IS NULL AND n.numero IS NOT NULL AND q.fluxo_emylia AND q.deleted_at IS NULL
      AND (v_neg_tudo
           OR n.assigned_to IN (a.user_id, a.auth_id) OR n.created_by IN (a.user_id, a.auth_id)
           OR (EXISTS (SELECT 1 FROM anew_memberships am JOIN anew_membership_permission_scopes s ON s.membership_id = am.id
                       WHERE am.user_id = a.user_id AND am.organization_id = c_org AND am.status = 'active'
                         AND s.permission_code = 'pessoas.view' AND s.scope_level = 'TEAM')
               AND EXISTS (SELECT 1 FROM organization_teams t JOIN organization_team_members tm ON tm.team_id = t.id
                           WHERE t.organization_id = c_org AND t.leader_id = a.user_id AND tm.user_id IN (n.assigned_to, n.created_by)))
           OR EXISTS (SELECT 1 FROM ops_obra o WHERE o.negocio_id = n.id AND v_pessoa_neg IS NOT NULL
                        AND (EXISTS (SELECT 1 FROM ops_obra_tarefa_rh r WHERE r.obra_id = o.id AND r.pessoa_id = v_pessoa_neg)
                             OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.estado_emylia->'plano'->'tasks') = 'array'
                                                                               THEN o.estado_emylia->'plano'->'tasks' ELSE '[]'::jsonb END) t
                                        WHERE t->>'tec' = v_pessoa_neg::text))));

    a.rotulo := a.rotulo || CASE WHEN cardinality(v_papeis) > 0 THEN ' [neg: ' || array_to_string(v_papeis, ',') || ']' ELSE '' END
                         || CASE WHEN v_ficha IS NULL THEN ' [sem ficha]' ELSE '' END;
    v_claims := json_build_object('sub', a.auth_id, 'role', 'authenticated')::text;

    -- ── 1. fn_cat_pode ─────────────────────────────────────────────────────
    FOREACH v_code IN ARRAY c_codes LOOP
      SELECT v_sa OR e.perfil OR e.papel,
             concat_ws('+', CASE WHEN v_sa THEN 'admin' END, CASE WHEN e.perfil THEN 'perfil' END, CASE WHEN e.papel THEN 'papel' END)
        INTO v_exp_b, v_det FROM _perm_exp e WHERE e.code = v_code;
      v_got_b := NULL; v_msg := NULL;
      BEGIN
        PERFORM set_config('request.jwt.claims', v_claims, true);
        PERFORM set_config('request.jwt.claim.sub', a.auth_id::text, true);
        EXECUTE 'SET LOCAL ROLE authenticated';
        v_got_b := public.fn_cat_pode(c_org, v_code);
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__desfazer__';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> '__desfazer__' THEN v_msg := SQLSTATE || ': ' || SQLERRM; END IF;
      END;
      v_exp := CASE WHEN v_exp_b THEN 'sim' ELSE 'não' END;
      v_got := coalesce(CASE WHEN v_got_b THEN 'sim' WHEN NOT v_got_b THEN 'não' END, 'erro');
      INSERT INTO _perm_rel (conta, verificacao, esperado, obtido, resultado, detalhe)
      VALUES (a.rotulo, '1 fn_cat_pode ' || v_code, v_exp, v_got, CASE WHEN v_exp = v_got THEN 'OK' ELSE 'FALHA' END,
              coalesce(v_msg, nullif(v_det, ''), '—'));
    END LOOP;

    -- ── 2. documents: visible_to_client true / false ───────────────────────
    FOR v_n IN 0..1 LOOP
      IF v_quote IS NULL THEN
        INSERT INTO _perm_rel (conta, verificacao, esperado, obtido, resultado, detalhe)
        VALUES (a.rotulo, '2 documents insert visible_to_client=' || (v_n = 0)::text, 'sem dados', 'sem dados', 'OK', 'sem orçamentos na organização');
        CONTINUE;
      END IF;
      IF v_n = 0 THEN
        SELECT v_sa OR bool_or(e.perfil OR e.papel) INTO v_exp_b FROM _perm_exp e WHERE e.code IN ('portal.manage', 'negocios.proposta.enviar');
        v_det := CASE WHEN NOT v_exp_b THEN 'sem portal.manage/proposta.enviar' WHEN NOT v_membro THEN 'fora da RLS (não membro)' ELSE 'membro com permissão' END;
        v_exp_b := v_exp_b AND v_membro;
      ELSE
        v_exp_b := v_membro;
        v_det := CASE WHEN v_membro THEN 'interno: só RLS' ELSE 'interno: fora da RLS (não membro)' END;
      END IF;
      v_msg := NULL; v_state := NULL;
      BEGIN
        PERFORM set_config('request.jwt.claims', v_claims, true);
        PERFORM set_config('request.jwt.claim.sub', a.auth_id::text, true);
        EXECUTE 'SET LOCAL ROLE authenticated';
        INSERT INTO public.documents (organization_id, entity_type, entity_id, file_name, file_url, document_type, visible_to_client)
        VALUES (c_org, 'quote', v_quote, 'teste-permissoes.pdf', 'teste/permissoes/nao-existe.pdf', 'other', v_n = 0);
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__desfazer__';
      EXCEPTION WHEN OTHERS THEN
        v_msg := SQLERRM; v_state := SQLSTATE;
      END;
      v_got := CASE WHEN v_msg = '__desfazer__' THEN 'passou' ELSE 'bloqueado' END;
      v_exp := CASE WHEN v_exp_b THEN 'passou' ELSE 'bloqueado' END;
      INSERT INTO _perm_rel (conta, verificacao, esperado, obtido, resultado, detalhe)
      VALUES (a.rotulo, '2 documents insert visible_to_client=' || (v_n = 0)::text, v_exp, v_got,
              CASE WHEN v_exp = v_got THEN 'OK' ELSE 'FALHA' END,
              v_det || CASE WHEN v_msg <> '__desfazer__' THEN ' | ' || v_state || ': ' || left(v_msg, 140) ELSE '' END);
    END LOOP;

    -- ── 3a. rpc_quote_lines_custos ─────────────────────────────────────────
    v_got3a := NULL; v_got3b := NULL;
    IF v_base_cost = 0 THEN
      INSERT INTO _perm_rel (conta, verificacao, esperado, obtido, resultado, detalhe)
      VALUES (a.rotulo, '3a rpc_quote_lines_custos', 'sem dados', 'sem dados', 'OK', 'nenhuma linha com custos na organização');
    ELSE
      v_exp := CASE
        WHEN NOT (v_membro AND EXISTS (SELECT 1 FROM anew_users u JOIN anew_memberships am ON am.user_id = u.id AND am.status = 'active'
                                       JOIN anew_role_permissions p ON p.role_id = am.role_id AND p.permission_code = 'quotes.view'
                                       WHERE u.id = a.user_id)) THEN 'sem linhas'
        WHEN v_sa OR EXISTS (SELECT 1 FROM _perm_exp e WHERE e.code IN ('quotes.view_costs', 'quotes.manage') AND (e.perfil OR e.papel)) THEN 'com custos'
        ELSE 'custos a null' END;
      v_n := NULL; v_nc := NULL; v_msg := NULL;
      BEGIN
        PERFORM set_config('request.jwt.claims', v_claims, true);
        PERFORM set_config('request.jwt.claim.sub', a.auth_id::text, true);
        EXECUTE 'SET LOCAL ROLE authenticated';
        SELECT count(*), count(*) FILTER (WHERE x.cost_price IS NOT NULL OR x.custo_material_unit IS NOT NULL OR x.custo_mao_obra_unit IS NOT NULL)
          INTO v_n, v_nc FROM public.rpc_quote_lines_custos(v_quotes) x;
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__desfazer__';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> '__desfazer__' THEN v_msg := SQLSTATE || ': ' || SQLERRM; END IF;
      END;
      v_got := CASE WHEN v_msg IS NOT NULL THEN 'erro' WHEN v_n = 0 THEN 'sem linhas' WHEN v_nc > 0 THEN 'com custos' ELSE 'custos a null' END;
      v_got3a := v_got;
      INSERT INTO _perm_rel (conta, verificacao, esperado, obtido, resultado, detalhe)
      VALUES (a.rotulo, '3a rpc_quote_lines_custos', v_exp, v_got, CASE WHEN v_exp = v_got THEN 'OK' ELSE 'FALHA' END,
              coalesce(v_msg, format('%s linhas, %s com custo (base: %s com custo)', v_n, v_nc, v_base_cost)));
    END IF;

    -- ── 3b. neg_ler_negocios (fn_neg_ler_orcamento por dentro) ─────────────
    IF v_base_neg = 0 THEN
      INSERT INTO _perm_rel (conta, verificacao, esperado, obtido, resultado, detalhe)
      VALUES (a.rotulo, '3b neg_ler_negocios custos', 'sem dados', 'sem dados', 'OK', 'nenhum orçamento Emylia na organização');
    ELSE
      v_exp := CASE
        WHEN NOT EXISTS (SELECT 1 FROM _perm_exp e WHERE e.code = 'pessoas.view' AND (v_sa OR e.perfil OR e.papel)) THEN 'bloqueado'
        WHEN v_neg_vis = 0 THEN 'sem linhas'   -- 20270110900000: nenhum negócio com orçamento Emylia no âmbito dela
        WHEN EXISTS (SELECT 1 FROM _perm_exp e WHERE e.code IN ('quotes.view_costs', 'quotes.manage') AND (v_sa OR e.perfil OR e.papel)) THEN 'com custos'
        ELSE 'custos a null' END;
      v_n := NULL; v_nc := NULL; v_msg := NULL; v_j := NULL;
      BEGIN
        PERFORM set_config('request.jwt.claims', v_claims, true);
        PERFORM set_config('request.jwt.claim.sub', a.auth_id::text, true);
        EXECUTE 'SET LOCAL ROLE authenticated';
        v_j := public.neg_ler_negocios(c_org);
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__desfazer__';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> '__desfazer__' THEN v_msg := SQLSTATE || ': ' || SQLERRM; END IF;
      END;
      IF v_j IS NOT NULL THEN
        v_n  := jsonb_array_length(jsonb_path_query_array(v_j, '$[*].orcamentos[*].linhas[*]'));
        v_nc := jsonb_array_length(jsonb_path_query_array(v_j, '$[*].orcamentos[*].linhas[*].custo.custo_un ? (@ != null)'));
      END IF;
      v_got := CASE WHEN v_msg IS NOT NULL THEN 'bloqueado' WHEN v_n = 0 THEN 'sem linhas' WHEN v_nc > 0 THEN 'com custos' ELSE 'custos a null' END;
      v_got3b := v_got;
      INSERT INTO _perm_rel (conta, verificacao, esperado, obtido, resultado, detalhe)
      VALUES (a.rotulo, '3b neg_ler_negocios custos', v_exp, v_got, CASE WHEN v_exp = v_got THEN 'OK' ELSE 'FALHA' END,
              coalesce(left(v_msg, 160), format('%s linhas, %s com custo_un', v_n, v_nc)));
    END IF;

    -- ── 6. custos iguais nas duas vias ─────────────────────────────────────
    INSERT INTO _perm_rel (conta, verificacao, esperado, obtido, resultado, detalhe)
    SELECT a.rotulo, '6 custos iguais (3a = 3b)', x.e, x.g, CASE WHEN x.e = x.g THEN 'OK' ELSE 'FALHA' END,
           format('3a: %s | 3b: %s', coalesce(v_got3a, 'sem dados'), coalesce(v_got3b, 'sem dados'))
    FROM (SELECT CASE WHEN v_got3a IN ('com custos', 'custos a null') AND v_got3b IN ('com custos', 'custos a null') THEN 'iguais' ELSE 'n/a' END AS e,
                 CASE WHEN v_got3a IN ('com custos', 'custos a null') AND v_got3b IN ('com custos', 'custos a null')
                      THEN CASE WHEN v_got3a = v_got3b THEN 'iguais' ELSE 'diferentes' END ELSE 'n/a' END AS g) x;

    -- ── 4. rpc_hr_picar ────────────────────────────────────────────────────
    SELECT e.perfil INTO v_exp_b FROM _perm_exp e WHERE e.code = 'hr.assiduidade.picar';
    IF v_ficha IS NOT NULL THEN
      v_exp := CASE WHEN v_exp_b THEN 'passou' ELSE 'bloqueado: sem permissão' END;
      v_det := 'própria ficha';
    ELSE
      v_exp := CASE WHEN v_exp_b THEN 'bloqueado: sem ficha' ELSE 'bloqueado: sem permissão' END;
      v_det := 'sem ficha (pessoa NULL)';
    END IF;
    v_msg := NULL; v_state := NULL;
    BEGIN
      PERFORM set_config('request.jwt.claims', v_claims, true);
      PERFORM set_config('request.jwt.claim.sub', a.auth_id::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM public.rpc_hr_picar(c_org, v_ficha, 'entrada');
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__desfazer__';
    EXCEPTION WHEN OTHERS THEN
      v_msg := SQLERRM; v_state := SQLSTATE;
    END;
    v_got := CASE
      WHEN v_msg = '__desfazer__' THEN 'passou'
      WHEN v_msg ~* 'sem[ _]ficha|nao tem ficha|não tem ficha|sem pessoa ligada|sem_ficha' THEN 'bloqueado: sem ficha'
      WHEN v_msg ~* 'picagem_sem_permissao' THEN 'bloqueado: sem permissão'
      ELSE 'bloqueado: outro' END;
    INSERT INTO _perm_rel (conta, verificacao, esperado, obtido, resultado, detalhe)
    VALUES (a.rotulo, '4 rpc_hr_picar', v_exp, v_got, CASE WHEN v_exp = v_got THEN 'OK' ELSE 'FALHA' END,
            v_det || CASE WHEN v_msg <> '__desfazer__' THEN ' | ' || v_state || ': ' || left(v_msg, 140) ELSE '' END);

    -- ── 5. purge_business_entity (Lixo) ────────────────────────────────────
    IF v_quote IS NULL THEN
      INSERT INTO _perm_rel (conta, verificacao, esperado, obtido, resultado, detalhe)
      VALUES (a.rotulo, '5 purge_business_entity quote', 'sem dados', 'sem dados', 'OK', 'sem orçamentos');
    ELSE
      -- 20270110200000: e deals.delete numa associação ativa não-cliente nesta organização ou numa acima (anew_hierarchy)
      v_exp_b := v_membro AND EXISTS (SELECT 1 FROM anew_memberships am JOIN anew_role_permissions p ON p.role_id = am.role_id
                                       AND p.permission_code = 'deals.delete' WHERE am.user_id = a.user_id AND am.status = 'active')
                 AND (v_sa OR EXISTS (
                   WITH RECURSIVE cad(org) AS (SELECT c_org UNION SELECT h.parent_org_id FROM anew_hierarchy h JOIN cad ON h.child_org_id = cad.org)
                   SELECT 1 FROM anew_memberships am JOIN anew_role_permissions p ON p.role_id = am.role_id AND p.permission_code = 'deals.delete'
                   WHERE am.user_id = a.user_id AND am.status = 'active' AND am.role_is_client IS NOT TRUE
                     AND am.organization_id IN (SELECT org FROM cad)));
      v_exp := CASE WHEN v_exp_b THEN 'passou a guarda' ELSE 'bloqueado' END;
      v_msg := NULL; v_state := NULL; v_got_b := NULL;
      BEGIN
        PERFORM set_config('request.jwt.claims', v_claims, true);
        PERFORM set_config('request.jwt.claim.sub', a.auth_id::text, true);
        EXECUTE 'SET LOCAL ROLE authenticated';
        v_got_b := public.purge_business_entity('quote', v_quote);
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__desfazer__';
      EXCEPTION WHEN OTHERS THEN
        v_msg := SQLERRM; v_state := SQLSTATE;
      END;
      v_got := CASE
        WHEN v_msg = '__desfazer__' THEN 'passou a guarda'
        WHEN v_state = '42501' THEN 'bloqueado'
        ELSE 'passou a guarda' END;   -- outro erro = falhou depois da verificação de permissão
      INSERT INTO _perm_rel (conta, verificacao, esperado, obtido, resultado, detalhe)
      VALUES (a.rotulo, '5 purge_business_entity quote', v_exp, v_got, CASE WHEN v_exp = v_got THEN 'OK' ELSE 'FALHA' END,
              CASE WHEN v_msg = '__desfazer__' THEN 'devolveu ' || coalesce(v_got_b::text, 'null') || ' (apagar desfeito)'
                   ELSE v_state || ': ' || left(v_msg, 140) END);
    END IF;

    -- ── repor a sonda (o ROLLBACK final também desfaz) ─────────────────────
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    IF a.troca_papel IS NOT NULL THEN
      UPDATE anew_memberships SET role_id = v_role_orig WHERE user_id = a.user_id AND organization_id = c_org;
    END IF;
  END LOOP;

  -- ── 5b. purge_business_entity noutra organização (simulado) ─────────────
  -- A sonda passa a viewer aqui (sem deals.delete) e ganha uma associação super_admin (com deals.delete) noutra organização
  -- fora da cadeia desta. Antes de 20270110200000 bastava deals.delete em qualquer organização e esta ser visível.
  -- A troca e a associação nova ficam dentro do sub-bloco, que acaba sempre em RAISE (desfeitas).
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  WITH RECURSIVE cad(org) AS (SELECT c_org UNION SELECT h.parent_org_id FROM anew_hierarchy h JOIN cad ON h.child_org_id = cad.org)
  SELECT o.id INTO v_org2 FROM anew_organizations o WHERE o.id NOT IN (SELECT org FROM cad) ORDER BY o.created_at LIMIT 1;
  SELECT r.id INTO v_role_dd FROM anew_roles r JOIN anew_role_permissions p ON p.role_id = r.id AND p.permission_code = 'deals.delete'
  WHERE r.code = 'super_admin' AND r.organization_id IS NULL AND r.deleted_at IS NULL LIMIT 1;
  SELECT r.id INTO v_role_vw FROM anew_roles r WHERE r.code = 'viewer' AND r.organization_id = c_org AND r.deleted_at IS NULL LIMIT 1;
  SELECT u.auth_user_id INTO v_sonda_auth FROM anew_users u WHERE u.id = c_sonda;
  IF v_quote IS NULL OR v_role_dd IS NULL OR v_role_vw IS NULL OR v_sonda_auth IS NULL THEN
    INSERT INTO _perm_rel (conta, verificacao, esperado, obtido, resultado, detalhe)
    VALUES ('viewer (sonda) + super_admin noutra org', '5b purge_business_entity noutra organização', 'sem dados', 'sem dados', 'OK',
            'falta orçamento / papel super_admin ou viewer / sonda');
  ELSE
    v_msg := NULL; v_state := NULL; v_fase := 'preparar'; v_det := 'existente';
    BEGIN
      IF v_org2 IS NULL THEN  -- só há esta organização: cria-se outra, também desfeita no fim do sub-bloco
        INSERT INTO anew_organizations (name) VALUES ('teste-permissoes 5b (desfeita)') RETURNING id INTO v_org2;
        v_det := 'criada e desfeita';
      END IF;
      UPDATE anew_memberships SET role_id = v_role_vw WHERE user_id = c_sonda AND organization_id = c_org;
      INSERT INTO anew_memberships (user_id, organization_id, role_id, status) VALUES (c_sonda, v_org2, v_role_dd, 'active');
      v_fase := 'purge';
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sonda_auth, 'role', 'authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', v_sonda_auth::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM public.purge_business_entity('quote', v_quote);
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__desfazer__';
    EXCEPTION WHEN OTHERS THEN
      v_msg := SQLERRM; v_state := SQLSTATE;
    END;
    v_got := CASE WHEN v_fase = 'preparar' THEN 'erro a preparar'
                  WHEN v_msg = '__desfazer__' THEN 'passou a guarda'
                  WHEN v_state = '42501' THEN 'bloqueado'
                  ELSE 'passou a guarda' END;
    INSERT INTO _perm_rel (conta, verificacao, esperado, obtido, resultado, detalhe)
    VALUES ('viewer (sonda) + super_admin noutra org', '5b purge_business_entity noutra organização', 'bloqueado', v_got,
            CASE WHEN v_got = 'bloqueado' THEN 'OK' ELSE 'FALHA' END,
            format('outra org %s (%s) | %s', v_org2, v_det, CASE WHEN v_msg = '__desfazer__' THEN 'apagar desfeito' ELSE v_state || ': ' || left(v_msg, 140) END));
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
  END IF;
END $t$;

SELECT conta AS papel_conta, verificacao, esperado, obtido, resultado, detalhe
FROM (
  SELECT n, conta, verificacao, esperado, obtido, resultado, detalhe FROM _perm_rel
  UNION ALL
  SELECT 1000000, 'TOTAL', count(*)::text || ' verificações', NULL, NULL,
         count(*) FILTER (WHERE resultado = 'FALHA')::text || ' FALHA(S)',
         string_agg(DISTINCT verificacao, ', ') FILTER (WHERE resultado = 'FALHA')
  FROM _perm_rel
) s
ORDER BY n;

ROLLBACK;
