-- =============================================================================
-- teste-negocio-inicio.sql — prova da migration 20261231200000_negocio_desde_o_inicio
--
-- NÃO CORRER sem autorização explícita para escritas REVERTIDAS na org nike.
-- Só base RH (uetjghdkwbywbftedtth). Nunca a principal, nunca a Mudelar.
--
-- Como correr (só com essa autorização, ANTES do db push, numa só ligação):
--   BEGIN;
--   <conteúdo inteiro da migration 20261231200000>
--   <este ficheiro>
--   ROLLBACK;
-- O bloco acaba SEMPRE com RAISE EXCEPTION (TESTE_OK ou FALHOU), por isso
-- nada fica gravado mesmo que o ROLLBACK falte.
--
-- Semeia, dentro da transacção: um papel temporário «comercial» (leads.view,
-- clients.view, pessoas.view, pessoas.create, pessoas.edit; âmbito OWNED por não
-- ter linhas em anew_membership_permission_scopes) dado a dois utilizadores de
-- teste da nike; pessoas, negócios, um quadro e uma visita.
--
-- Casos das revisões (secções 5a e 9 a 17):
--   5a  (H1) o dono SÓ do negócio não escreve directamente em anew_entities nem
--       nas satélites (UPDATE/DELETE de anew_entities, INSERT de email, UPDATE,
--       SELECT e INSERT de anew_entity_history) e fn_neg_pessoa_no_ambito('view'),
--       is_entity_in_user_scope e can_see_entity continuam falsas para ele;
--   9   (M1) ligar com correcções: só pessoas.view -> recusado; sem correcções
--       -> ligada; entidade partilhada -> NG003 (por provar se a nike não tiver
--       nenhuma: o teste não escreve linhas de outras organizações);
--   10  (M2) original = ficha de utilizador -> NG003, mesmo trocando de pessoa;
--   11  candidata só se igual a conflicting_entity_id e no âmbito; o retorno
--       'confirmar' não troca nem corrige;
--   12  NG002 (abordagem encerrada);  13  ACLs sem anon/authenticated;
--   14  fn_form_completar_entidade só acompanha o título automático;
--   15  utilizador de outra organização (só leitura: lido dentro do teste, sem
--       nenhuma escrita fora da nike) não vê toques nem resolve;
--   16  índices únicos por email e telefone por organização;
--   17  (último) o sub-bloco engole a falha do negócio automático: troca, SÓ
--       dentro desta transacção, fn_neg_titulo_de_nome (criada pela própria
--       migration, invisível fora dela) por uma que devolve um título inválido.
--
-- Utilizadores da nike (lidos a 26/10, só ids):
--   admin    ba0b0ebf-1bdb-43f9-b82b-a2ade29848e2 (Super Admin) auth 08bb24a2-e11f-4f79-b4f7-c5125332da4a
--   comercial acf9f6c3-c3c7-1982-c424-da7ac2add2cb (Teste RH - Colaborador) auth 37069e32-c4ce-47f1-f42f-9e2a89eb92a3
--   outro    42c020c5-cb47-b7de-8246-1a8f2ed0adf4 (Teste RH - Colaborador) auth 007a341a-4bce-9626-1efa-4593c7804ea7
-- =============================================================================
DO $teste$
DECLARE
  k_org        constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  k_admin_id   constant uuid := 'ba0b0ebf-1bdb-43f9-b82b-a2ade29848e2';
  k_admin_auth constant uuid := '08bb24a2-e11f-4f79-b4f7-c5125332da4a';
  k_com_id     constant uuid := 'acf9f6c3-c3c7-1982-c424-da7ac2add2cb';
  k_com_auth   constant uuid := '37069e32-c4ce-47f1-f42f-9e2a89eb92a3';
  k_out_id     constant uuid := '42c020c5-cb47-b7de-8246-1a8f2ed0adf4';
  k_out_auth   constant uuid := '007a341a-4bce-9626-1efa-4593c7804ea7';
  v_tag    text := replace(gen_random_uuid()::text, '-', '');
  v_email  text;
  v_email2 text;
  v_role   uuid;
  r        record;
  v_ent    uuid;
  v_neg    uuid;
  v_sub1   uuid;
  v_sub2   uuid;
  v_sub3   uuid;
  v_sub4   uuid;
  v_sub5   uuid;
  v_ent2   uuid;
  v_neg2   uuid;
  v_neg3   uuid;
  v_board  uuid;
  v_res    jsonb;
  v_n      bigint;
  v_txt    text;
  v_ts     timestamptz;
  v_erro   boolean;
  v_rows   bigint;
  v_role_ver   uuid;
  v_root       uuid;
  v_sub6       uuid;
  v_sub7       uuid;
  v_sub8       uuid;
  v_sub9       uuid;
  v_subx       uuid;
  v_subu       uuid;
  v_ent3       uuid;
  v_neg_c      uuid;
  v_ent_user   uuid;
  v_shared     uuid;
  v_other_auth uuid;
  v_ent_d      uuid;
  v_sub_d      uuid;
  v_neg_d      uuid;
  v_ent_e      uuid;
  v_sub_e      uuid;
  v_neg_e      uuid;
  v_sem_autor  text;
BEGIN
  v_email  := 'teste.negocio.' || v_tag || '@exemplo.invalid';
  v_email2 := 'teste.quadro.' || v_tag || '@exemplo.invalid';

  -- ---------------------------------------------------------------------------
  -- 0. Pré-condições e semente (como postgres, sem sessão)
  -- ---------------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c WHERE c.organization_id = k_org) THEN
    RAISE EXCEPTION 'FALHOU 0: a nike não tem negocio_workflow_config.';
  END IF;
  SELECT count(*) INTO v_n FROM public.anew_memberships m
  WHERE m.organization_id = k_org AND m.status = 'active'
    AND m.user_id IN (k_admin_id, k_com_id, k_out_id);
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'FALHOU 0: esperava 3 membros activos na nike, há %.', v_n;
  END IF;

  INSERT INTO public.anew_roles (code, name, organization_id, description)
  VALUES ('teste_comercial_' || v_tag, 'TESTE comercial (revertido)', k_org, 'teste revertido')
  RETURNING id INTO v_role;
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
  SELECT v_role, x.c
  FROM unnest(ARRAY['leads.view', 'clients.view', 'pessoas.view', 'pessoas.create', 'pessoas.edit']) AS x(c);
  UPDATE public.anew_memberships m SET role_id = v_role
  WHERE m.organization_id = k_org AND m.user_id IN (k_com_id, k_out_id);
  DELETE FROM public.anew_membership_permission_scopes s
  WHERE s.membership_id IN (SELECT m.id FROM public.anew_memberships m
                            WHERE m.organization_id = k_org AND m.user_id IN (k_com_id, k_out_id));

  -- ---------------------------------------------------------------------------
  -- 1. fn_neg_titulo_de_nome
  -- ---------------------------------------------------------------------------
  IF public.fn_neg_titulo_de_nome(E'  Ana\t\n  Maria   Silva  ') IS DISTINCT FROM 'Ana Maria Silva'
     OR public.fn_neg_titulo_de_nome(NULL) IS DISTINCT FROM 'Sem nome'
     OR public.fn_neg_titulo_de_nome(E' \t\r\n ') IS DISTINCT FROM 'Sem nome'
     OR char_length(public.fn_neg_titulo_de_nome(repeat('x', 300))) <> 200
     OR public.fn_neg_titulo_de_nome(repeat('x', 199) || ' y') IS DISTINCT FROM repeat('x', 199) THEN
    RAISE EXCEPTION 'FALHOU 1: fn_neg_titulo_de_nome.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 2. Entidade nova (sem sessão = service_role) -> negócio e toque resolvido
  -- ---------------------------------------------------------------------------
  SELECT * INTO r FROM public.fn_form_criar_entidade(
    p_organization_id => k_org, p_first_name => 'Teste', p_last_name => 'Negocio',
    p_email => v_email);
  v_ent := r.entity_id; v_sub1 := r.submission_id; v_neg := r.negocio_id;
  IF NOT r.created OR v_neg IS NULL THEN
    RAISE EXCEPTION 'FALHOU 2: pessoa nova sem negócio (created %, negocio %).', r.created::text, v_neg::text;
  END IF;
  SELECT count(*) INTO v_n FROM public.negocios n
  WHERE n.id = v_neg AND n.organization_id = k_org AND n.entity_id = v_ent
    AND n.estado = 'aberto' AND n.deleted_at IS NULL AND n.fecho = 'contrato'
    AND n.titulo = 'Teste Negocio' AND n.assigned_to IS NULL AND n.created_by IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU 2: o negócio automático não está como esperado.';
  END IF;
  SELECT count(*) INTO v_n FROM public.form_submissions s
  WHERE s.id = v_sub1 AND s.negocio_id = v_neg AND s.resolution = 'negocio_automatico'
    AND s.resolved_at IS NOT NULL AND s.resolved_by IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU 2: o toque da pessoa nova não ficou resolvido.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 3. Pessoa existente (mesmo email -> caminho da corrida) -> não gera negócio
  --    Quatro toques pendentes: sub2..sub5.
  -- ---------------------------------------------------------------------------
  FOR i IN 2..5 LOOP
    SELECT * INTO r FROM public.fn_form_criar_entidade(
      p_organization_id => k_org, p_first_name => 'Outro', p_last_name => 'Nome',
      p_email => v_email);
    IF r.created OR r.negocio_id IS NOT NULL OR r.entity_id <> v_ent THEN
      RAISE EXCEPTION 'FALHOU 3: pessoa existente gerou negócio ou outra entidade.';
    END IF;
    CASE i WHEN 2 THEN v_sub2 := r.submission_id; WHEN 3 THEN v_sub3 := r.submission_id;
             WHEN 4 THEN v_sub4 := r.submission_id; ELSE v_sub5 := r.submission_id; END CASE;
  END LOOP;
  SELECT count(*) INTO v_n FROM public.negocios n WHERE n.entity_id = v_ent;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU 3: a pessoa existente ficou com % negócios.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.form_submissions s
  WHERE s.id IN (v_sub2, v_sub3, v_sub4, v_sub5) AND s.resolved_at IS NULL AND s.negocio_id IS NULL;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'FALHOU 3: esperava 4 toques pendentes, há %.', v_n;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 4. Âmbito: comercial (OWNED) ANTES de lhe atribuir o negócio
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_com_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  IF EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('leads.view')) AS k(x)
             WHERE k.x = k_org::text || ':*') THEN
    RAISE EXCEPTION 'FALHOU 4: o comercial tem âmbito ORG (o teste precisa de OWNED).';
  END IF;
  SELECT count(*) INTO v_n FROM public.neg_resumo_quadro(k_org, NULL, NULL, NULL, 'recentes', NULL, NULL, 100) q
  WHERE q.negocio_id = v_neg;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FALHOU 4: o comercial vê o negócio sem dono no quadro.';
  END IF;
  SELECT count(*) INTO v_n FROM public.form_submissions s WHERE s.entity_id = v_ent;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FALHOU 4: o comercial vê % toques da pessoa sem dono.', v_n;
  END IF;
  v_erro := false;
  BEGIN
    PERFORM public.rpc_resolve_form_submission(v_sub5, 'ignorar');
  EXCEPTION WHEN SQLSTATE 'NG029' THEN v_erro := true;
  END;
  IF NOT v_erro THEN
    RAISE EXCEPTION 'FALHOU 4: o comercial resolveu um toque fora do âmbito.';
  END IF;
  v_erro := false;
  BEGIN
    PERFORM public.fn_neg_exigir_pessoa(k_org, v_ent);
  EXCEPTION WHEN SQLSTATE 'NG003' THEN v_erro := true;
  END;
  IF NOT v_erro THEN
    RAISE EXCEPTION 'FALHOU 4: o comercial abriu a ficha de uma pessoa fora do âmbito.';
  END IF;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);

  -- atribuir o negócio ao comercial (só o negócio; a entidade continua sem dono)
  UPDATE public.negocios n SET assigned_to = k_com_id WHERE n.id = v_neg;
  -- uma linha de histórico da pessoa, para o caso 5a (como postgres)
  INSERT INTO public.anew_entity_history (entity_id, change_type, metadata)
  VALUES (v_ent, 'teste_revertido', '{}'::jsonb);
  -- a pessoa não tem lead/contacto/cliente nem criador: só o negócio a liga ao comercial
  IF EXISTS (SELECT 1 FROM public.anew_leads l WHERE l.entity_id = v_ent)
     OR EXISTS (SELECT 1 FROM public.anew_contacts c WHERE c.entity_id = v_ent)
     OR EXISTS (SELECT 1 FROM public.anew_clients c WHERE c.entity_id = v_ent)
     OR EXISTS (SELECT 1 FROM public.anew_entities e WHERE e.id = v_ent AND (e.created_by IS NOT NULL OR e.assigned_to IS NOT NULL)) THEN
    RAISE EXCEPTION 'FALHOU 4: a pessoa de teste tem outra ligação ao comercial além do negócio (o caso 5a deixava de provar o H1).';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 5. Âmbito: comercial DEPOIS de ser dono do negócio
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_com_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT q.coluna INTO v_txt
  FROM public.neg_resumo_quadro(k_org, NULL, NULL, NULL, 'recentes', NULL, NULL, 100) q
  WHERE q.negocio_id = v_neg;
  IF v_txt IS DISTINCT FROM 'porContactar' THEN
    RAISE EXCEPTION 'FALHOU 5: o dono do negócio não vê o cartão em porContactar (coluna %).', COALESCE(v_txt, '(nenhuma)');
  END IF;
  PERFORM public.fn_neg_exigir_pessoa(k_org, v_ent);              -- não pode dar NG003
  -- a ficha completa (assinatura viva lida a 26/10: uuid, uuid, integer, jsonb, text[])
  PERFORM public.neg_ficha_pessoa(k_org, v_ent, 10, NULL::jsonb, NULL::text[]);
  SELECT count(*) INTO v_n FROM public.form_submissions s WHERE s.entity_id = v_ent;
  IF v_n < 5 THEN
    RAISE EXCEPTION 'FALHOU 5: o dono do negócio só vê % toques da pessoa (esperava 5).', v_n;
  END IF;
  v_res := public.rpc_resolve_form_submission(v_sub5, 'ignorar');
  IF v_res ->> 'resolution' IS DISTINCT FROM 'duplicada' OR (v_res ->> 'mudou')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU 5: o dono do negócio não conseguiu ignorar o toque: %.', v_res::text;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 5a. (H1) o dono SÓ do negócio não ganha a RLS de escrita da pessoa
  -- ---------------------------------------------------------------------------
  IF COALESCE(public.fn_neg_pessoa_no_ambito(k_org, v_ent, 'view'), false)
     OR COALESCE(public.is_entity_in_user_scope(v_ent, k_com_auth), false)
     OR COALESCE(public.can_see_entity(v_ent, k_com_auth), false) THEN
    RAISE EXCEPTION 'FALHOU 5a: o âmbito da RLS (view) alargou-se ao dono do negócio.';
  END IF;

  UPDATE public.anew_entities e SET notes = 'teste H1' WHERE e.id = v_ent;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FALHOU 5a: o dono do negócio actualizou anew_entities directamente (% linhas).', v_rows;
  END IF;

  v_rows := 0;
  BEGIN
    DELETE FROM public.anew_entities e WHERE e.id = v_ent;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    -- uma falha aqui (a FK RESTRICT de negocios) quer dizer que a RLS deixou passar
    RAISE EXCEPTION 'FALHOU 5a: o DELETE de anew_entities chegou à tabela (SQLSTATE %).', SQLSTATE;
  END;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FALHOU 5a: o dono do negócio apagou anew_entities directamente (% linhas).', v_rows;
  END IF;

  v_erro := false;
  BEGIN
    INSERT INTO public.anew_entity_emails (entity_id, email, email_type, is_primary)
    VALUES (v_ent, 'teste.h1.' || v_tag || '@exemplo.invalid', 'personal', false);
  EXCEPTION WHEN insufficient_privilege THEN v_erro := true;
  END;
  IF NOT v_erro THEN
    RAISE EXCEPTION 'FALHOU 5a: o dono do negócio inseriu um email na pessoa directamente.';
  END IF;

  UPDATE public.anew_entity_history h SET new_value = 'teste H1' WHERE h.entity_id = v_ent;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FALHOU 5a: o dono do negócio actualizou anew_entity_history (% linhas).', v_rows;
  END IF;
  SELECT count(*) INTO v_n FROM public.anew_entity_history h WHERE h.entity_id = v_ent;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FALHOU 5a: o dono do negócio lê % linhas de anew_entity_history.', v_n;
  END IF;
  v_erro := false;
  BEGIN
    INSERT INTO public.anew_entity_history (entity_id, change_type, metadata)
    VALUES (v_ent, 'teste_revertido', '{}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN v_erro := true;
  END;
  IF NOT v_erro THEN
    RAISE EXCEPTION 'FALHOU 5a: o dono do negócio inseriu histórico na pessoa directamente.';
  END IF;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  -- confirmação como postgres: a pessoa e o histórico ficaram como estavam
  IF NOT EXISTS (SELECT 1 FROM public.anew_entities e
                 WHERE e.id = v_ent AND e.deleted_at IS NULL AND e.notes IS DISTINCT FROM 'teste H1')
     OR EXISTS (SELECT 1 FROM public.anew_entity_history h
                WHERE h.entity_id = v_ent AND h.new_value = 'teste H1') THEN
    RAISE EXCEPTION 'FALHOU 5a: a pessoa ou o histórico mudaram pela mão do dono do negócio.';
  END IF;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_com_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);

  -- ---------------------------------------------------------------------------
  -- 6. Âmbito: outro utilizador da nike, sem relação
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_out_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO v_n FROM public.neg_resumo_quadro(k_org, NULL, NULL, NULL, 'recentes', NULL, NULL, 100) q
  WHERE q.entity_id = v_ent;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FALHOU 6: o outro utilizador vê o cartão.';
  END IF;
  SELECT count(*) INTO v_n FROM public.form_submissions s WHERE s.entity_id = v_ent;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FALHOU 6: o outro utilizador vê % toques.', v_n;
  END IF;
  v_erro := false;
  BEGIN
    PERFORM public.rpc_resolve_form_submission(v_sub4, 'ignorar');
  EXCEPTION WHEN SQLSTATE 'NG029' THEN v_erro := true;
  END;
  IF NOT v_erro THEN
    RAISE EXCEPTION 'FALHOU 6: o outro utilizador resolveu um toque fora do âmbito.';
  END IF;
  -- um id inexistente dá o MESMO NG029
  v_erro := false;
  BEGIN
    PERFORM public.rpc_resolve_form_submission(gen_random_uuid(), 'ignorar');
  EXCEPTION WHEN SQLSTATE 'NG029' THEN v_erro := true;
  END;
  IF NOT v_erro THEN
    RAISE EXCEPTION 'FALHOU 6: um id inexistente não deu NG029.';
  END IF;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);

  -- ---------------------------------------------------------------------------
  -- 7. rpc_resolve_form_submission nas três acções, como admin, e idempotente
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_admin_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 7a. acção inválida e correcções inválidas -> NG009
  v_erro := false;
  BEGIN
    PERFORM public.rpc_resolve_form_submission(v_sub2, 'merge');
  EXCEPTION WHEN SQLSTATE 'NG009' THEN v_erro := true;
  END;
  IF NOT v_erro THEN RAISE EXCEPTION 'FALHOU 7a: acção antiga aceite.'; END IF;
  v_erro := false;
  BEGIN
    PERFORM public.rpc_resolve_form_submission(v_sub2, 'ligar', '{"email":"x@y.z"}'::jsonb);
  EXCEPTION WHEN SQLSTATE 'NG009' THEN v_erro := true;
  END;
  IF NOT v_erro THEN RAISE EXCEPTION 'FALHOU 7a: correcção de email aceite.'; END IF;

  -- 7b. ligar
  SELECT count(*) INTO v_n FROM public.entity_interactions i
  WHERE i.entity_id = v_ent AND i.interaction_type = 'note';
  v_res := public.rpc_resolve_form_submission(v_sub2, 'ligar');
  IF v_res ->> 'resolution' IS DISTINCT FROM 'ligada' OR (v_res ->> 'mudou')::boolean IS NOT TRUE
     OR v_res ->> 'interaction_id' IS NULL THEN
    RAISE EXCEPTION 'FALHOU 7b: ligar devolveu %.', v_res::text;
  END IF;
  IF (SELECT count(*) FROM public.entity_interactions i
      WHERE i.entity_id = v_ent AND i.interaction_type = 'note') <> v_n + 1 THEN
    RAISE EXCEPTION 'FALHOU 7b: ligar não criou exactamente uma nota.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.entity_interactions i
             WHERE i.id = (v_res ->> 'interaction_id')::uuid AND position('_meta' IN i.notes) > 0) THEN
    RAISE EXCEPTION 'FALHOU 7b: a nota leva o _meta.';
  END IF;
  v_res := public.rpc_resolve_form_submission(v_sub2, 'ligar');
  IF (v_res ->> 'mudou')::boolean IS NOT FALSE OR v_res ->> 'resolution' IS DISTINCT FROM 'ligada' THEN
    RAISE EXCEPTION 'FALHOU 7b: ligar repetido não é idempotente: %.', v_res::text;
  END IF;

  -- 7c. criar_negocio: primeiro pede confirmação (já há negócio aberto) sem escrever
  v_res := public.rpc_resolve_form_submission(v_sub3, 'criar_negocio');
  IF v_res ->> 'acao' IS DISTINCT FROM 'confirmar' OR v_res ->> 'motivo' IS DISTINCT FROM 'negocio_aberto'
     OR (v_res ->> 'negocio_aberto_id')::uuid IS DISTINCT FROM v_neg
     OR (v_res ->> 'mudou')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FALHOU 7c: criar_negocio sem confirmação devolveu %.', v_res::text;
  END IF;
  IF EXISTS (SELECT 1 FROM public.form_submissions s WHERE s.id = v_sub3 AND s.resolved_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FALHOU 7c: o pedido de confirmação escreveu na submissão.';
  END IF;
  v_res := public.rpc_resolve_form_submission(v_sub3, 'criar_negocio', NULL, NULL, true);
  v_neg3 := (v_res ->> 'negocio_id')::uuid;
  IF v_res ->> 'resolution' IS DISTINCT FROM 'negocio_criado' OR v_neg3 IS NULL OR v_neg3 = v_neg THEN
    RAISE EXCEPTION 'FALHOU 7c: criar_negocio confirmado devolveu %.', v_res::text;
  END IF;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_n FROM public.negocios n
  WHERE n.id = v_neg3 AND n.entity_id = v_ent AND n.organization_id = k_org
    AND n.created_by IS NULL AND n.assigned_to IS NULL AND n.estado = 'aberto';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU 7c: o negócio da fila tem criador ou dono (app.neg_sem_autor não funcionou).';
  END IF;
  SELECT count(*) INTO v_n FROM public.form_submissions s
  WHERE s.id = v_sub3 AND s.negocio_id = v_neg3 AND s.resolved_by = k_admin_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU 7c: a submissão não guardou o negócio nem quem resolveu.';
  END IF;
  IF COALESCE(current_setting('app.neg_sem_autor', true), '') = 'on' THEN
    RAISE EXCEPTION 'FALHOU 7c: app.neg_sem_autor ficou ligado depois da RPC.';
  END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.rpc_resolve_form_submission(v_sub3, 'criar_negocio', NULL, NULL, true);
  IF (v_res ->> 'mudou')::boolean IS NOT FALSE OR (v_res ->> 'negocio_id')::uuid IS DISTINCT FROM v_neg3 THEN
    RAISE EXCEPTION 'FALHOU 7c: criar_negocio repetido não é idempotente: %.', v_res::text;
  END IF;

  -- 7d. ignorar
  v_res := public.rpc_resolve_form_submission(v_sub4, 'ignorar');
  IF v_res ->> 'resolution' IS DISTINCT FROM 'duplicada' OR (v_res ->> 'mudou')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU 7d: ignorar devolveu %.', v_res::text;
  END IF;
  v_res := public.rpc_resolve_form_submission(v_sub4, 'ignorar');
  IF (v_res ->> 'mudou')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FALHOU 7d: ignorar repetido não é idempotente: %.', v_res::text;
  END IF;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);

  -- ---------------------------------------------------------------------------
  -- 8. Quadro (admin): vazio -> porContactar; com chamada -> contactado;
  --    com visita -> visita (e proximo_prazo_em = início da visita)
  -- ---------------------------------------------------------------------------
  SELECT * INTO r FROM public.fn_form_criar_entidade(
    p_organization_id => k_org, p_first_name => 'Teste', p_last_name => 'Quadro',
    p_email => v_email2);
  v_ent2 := r.entity_id; v_neg2 := r.negocio_id;
  IF v_neg2 IS NULL THEN
    RAISE EXCEPTION 'FALHOU 8: a segunda pessoa não teve negócio.';
  END IF;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_admin_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT q.coluna INTO v_txt FROM public.neg_resumo_quadro(k_org, NULL, NULL, NULL, 'recentes', NULL, NULL, 100) q
  WHERE q.negocio_id = v_neg2;
  IF v_txt IS DISTINCT FROM 'porContactar' THEN
    RAISE EXCEPTION 'FALHOU 8a: negócio vazio na coluna %.', COALESCE(v_txt, '(nenhuma)');
  END IF;
  SELECT count(*) INTO v_n FROM public.neg_resumo_quadro(k_org, NULL, NULL, NULL, 'recentes', NULL, NULL, 100) q
  WHERE q.tipo <> 'negocio' OR q.por_ligar_contactos <> 0 OR q.lead_id IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FALHOU 8a: o quadro ainda devolve cartões de pessoa ou contadores por ligar.';
  END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);

  INSERT INTO public.entity_interactions (entity_id, organization_id, root_organization_id,
    interaction_type, subject, interaction_at, created_by, negocio_id)
  VALUES (v_ent2, k_org, public.resolve_root_organization_id(k_org), 'call', 'Contacto (teste)',
          now(), k_admin_id::text, v_neg2);

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_admin_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT q.coluna INTO v_txt FROM public.neg_resumo_quadro(k_org, NULL, NULL, NULL, 'recentes', NULL, NULL, 100) q
  WHERE q.negocio_id = v_neg2;
  IF v_txt IS DISTINCT FROM 'contactado' THEN
    RAISE EXCEPTION 'FALHOU 8b: negócio com chamada na coluna %.', COALESCE(v_txt, '(nenhuma)');
  END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);

  INSERT INTO public.schedule_boards (name, created_by, organization_id)
  VALUES ('TESTE quadro (revertido)', k_admin_id, k_org)
  RETURNING id INTO v_board;
  v_ts := date_trunc('day', now()) + interval '30 days' + interval '10 hours';
  INSERT INTO public.schedule_items (board_id, title, start_datetime, end_datetime, created_by,
                                     organization_id, entity_id, negocio_id)
  VALUES (v_board, 'Visita (teste)', v_ts, v_ts + interval '1 hour', k_admin_id,
          k_org, v_ent2, v_neg2);

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_admin_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT q.coluna, q.proximo_prazo_em INTO v_txt, v_ts
  FROM public.neg_resumo_quadro(k_org, NULL, NULL, NULL, 'recentes', NULL, NULL, 100) q
  WHERE q.negocio_id = v_neg2;
  IF v_txt IS DISTINCT FROM 'visita' THEN
    RAISE EXCEPTION 'FALHOU 8c: negócio com visita na coluna %.', COALESCE(v_txt, '(nenhuma)');
  END IF;
  IF v_ts IS DISTINCT FROM date_trunc('day', now()) + interval '30 days' + interval '10 hours' THEN
    RAISE EXCEPTION 'FALHOU 8c: proximo_prazo_em = % (esperava o início da visita).', v_ts::text;
  END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);

  v_root := public.resolve_root_organization_id(k_org);

  -- ---------------------------------------------------------------------------
  -- 9. (M1) ligar com correcções
  --    Semente (postgres): o «outro» passa a um papel só de ver e a dono do
  --    negócio v_neg3 (de v_ent); um toque novo pendente em v_ent.
  -- ---------------------------------------------------------------------------
  INSERT INTO public.anew_roles (code, name, organization_id, description)
  VALUES ('teste_ver_' || v_tag, 'TESTE só ver (revertido)', k_org, 'teste revertido')
  RETURNING id INTO v_role_ver;
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
  SELECT v_role_ver, x.c FROM unnest(ARRAY['leads.view', 'clients.view', 'pessoas.view']) AS x(c);
  UPDATE public.anew_memberships m SET role_id = v_role_ver
  WHERE m.organization_id = k_org AND m.user_id = k_out_id;
  UPDATE public.negocios n SET assigned_to = k_out_id WHERE n.id = v_neg3 AND n.organization_id = k_org;
  SELECT * INTO r FROM public.fn_form_criar_entidade(
    p_organization_id => k_org, p_first_name => 'Outro', p_last_name => 'Nome', p_email => v_email);
  v_sub6 := r.submission_id;
  IF r.created OR r.entity_id <> v_ent THEN
    RAISE EXCEPTION 'FALHOU 9: o toque novo não ficou na pessoa existente.';
  END IF;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_out_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  -- 9a. só pessoas.view + correcções -> recusado, sem escrever
  v_erro := false;
  BEGIN
    PERFORM public.rpc_resolve_form_submission(v_sub6, 'ligar', '{"first_name":"Corrigido"}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN v_erro := true;
  END;
  IF NOT v_erro THEN
    RAISE EXCEPTION 'FALHOU 9a: ligar com correcções aceite só com pessoas.view.';
  END IF;
  -- 9b. sem correcções, pessoas.view chega
  v_res := public.rpc_resolve_form_submission(v_sub6, 'ligar');
  IF v_res ->> 'resolution' IS DISTINCT FROM 'ligada' OR (v_res ->> 'mudou')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU 9b: ligar sem correcções com pessoas.view devolveu %.', v_res::text;
  END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  IF EXISTS (SELECT 1 FROM public.anew_entities e WHERE e.id = v_ent AND e.first_name = 'Corrigido') THEN
    RAISE EXCEPTION 'FALHOU 9a: a correcção recusada chegou a escrever o nome.';
  END IF;

  -- 9c. entidade partilhada (guarda 5b): só com uma que já exista na nike;
  --     o teste não escreve linhas de outras organizações para a fabricar.
  SELECT e.id INTO v_shared
  FROM public.anew_entities e
  WHERE e.organization_id = k_org AND e.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.anew_users u WHERE u.entity_id = e.id)
    AND NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.entity_id = e.id)
    AND public.fn_neg_entidade_partilhada(k_org, e.id)
  LIMIT 1;
  IF v_shared IS NULL THEN
    RAISE NOTICE 'POR PROVAR 9c: a nike não tem nenhuma pessoa partilhada com outra organização.';
  ELSE
    v_subx := public.upsert_form_submission(
      p_organization_id => k_org, p_root_organization_id => v_root, p_entity_id => v_shared,
      p_form_id => NULL, p_campaign_id => NULL, p_target_type => 'lead', p_target_id => v_shared,
      p_field_values => '{}'::jsonb, p_status => 'complete', p_is_complete => true,
      p_current_step => 1, p_total_steps => NULL, p_origin_id => NULL, p_origin_recognized => NULL,
      p_channel_id => NULL, p_negocio_id => NULL, p_campaign_via => NULL,
      p_needs_manual_scheduling => NULL);
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', k_admin_auth::text, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_erro := false;
    BEGIN
      PERFORM public.rpc_resolve_form_submission(v_subx, 'ligar', '{"city":"Teste"}'::jsonb);
    EXCEPTION WHEN SQLSTATE 'NG003' THEN v_erro := true;
    END;
    IF NOT v_erro THEN
      RAISE EXCEPTION 'FALHOU 9c: correcções aceites numa pessoa partilhada.';
    END IF;
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '', true);
  END IF;

  -- ---------------------------------------------------------------------------
  -- 10. (M2) a ORIGINAL da submissão é a ficha de um utilizador (o «outro»,
  --     cuja ficha é da nike): NG003 em ligar e criar_negocio, com e sem troca;
  --     ignorar continua a poder arrumá-la.
  -- ---------------------------------------------------------------------------
  SELECT u.entity_id INTO v_ent_user FROM public.anew_users u WHERE u.id = k_out_id;
  IF NOT EXISTS (SELECT 1 FROM public.anew_entities e
                 WHERE e.id = v_ent_user AND e.organization_id = k_org AND e.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'FALHOU 10: a ficha do utilizador «outro» não é uma entidade viva da nike.';
  END IF;
  v_subu := public.upsert_form_submission(
    p_organization_id => k_org, p_root_organization_id => v_root, p_entity_id => v_ent_user,
    p_form_id => NULL, p_campaign_id => NULL, p_target_type => 'lead', p_target_id => v_ent_user,
    p_field_values => '{}'::jsonb, p_status => 'complete', p_is_complete => true,
    p_current_step => 1, p_total_steps => NULL, p_origin_id => NULL, p_origin_recognized => NULL,
    p_channel_id => NULL, p_negocio_id => NULL, p_campaign_via => NULL,
    p_needs_manual_scheduling => NULL);
  UPDATE public.form_submissions s SET conflicting_entity_id = v_ent2
  WHERE s.id = v_subu AND s.organization_id = k_org;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_admin_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_erro := false;
  BEGIN
    PERFORM public.rpc_resolve_form_submission(v_subu, 'ligar', NULL, v_ent2);
  EXCEPTION WHEN SQLSTATE 'NG003' THEN v_erro := true;
  END;
  IF NOT v_erro THEN RAISE EXCEPTION 'FALHOU 10: ligar trocando de pessoa tirou da fila um toque de ficha de utilizador.'; END IF;
  v_erro := false;
  BEGIN
    PERFORM public.rpc_resolve_form_submission(v_subu, 'criar_negocio', NULL, v_ent2, true);
  EXCEPTION WHEN SQLSTATE 'NG003' THEN v_erro := true;
  END;
  IF NOT v_erro THEN RAISE EXCEPTION 'FALHOU 10: criar_negocio trocando de pessoa aceite numa ficha de utilizador.'; END IF;
  v_erro := false;
  BEGIN
    PERFORM public.rpc_resolve_form_submission(v_subu, 'ligar');
  EXCEPTION WHEN SQLSTATE 'NG003' THEN v_erro := true;
  END;
  IF NOT v_erro THEN RAISE EXCEPTION 'FALHOU 10: ligar aceite numa ficha de utilizador.'; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  IF NOT EXISTS (SELECT 1 FROM public.form_submissions s
                 WHERE s.id = v_subu AND s.entity_id = v_ent_user AND s.conflicting_entity_id = v_ent2
                   AND s.resolved_at IS NULL) THEN
    RAISE EXCEPTION 'FALHOU 10: a submissão da ficha de utilizador mudou depois das recusas.';
  END IF;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_admin_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.rpc_resolve_form_submission(v_subu, 'ignorar');
  IF v_res ->> 'resolution' IS DISTINCT FROM 'duplicada' THEN
    RAISE EXCEPTION 'FALHOU 10: ignorar não arrumou o toque da ficha de utilizador: %.', v_res::text;
  END IF;
  -- (M3) ignorar não aceita p_entity_id
  v_erro := false;
  BEGIN
    PERFORM public.rpc_resolve_form_submission(v_subu, 'ignorar', NULL, v_ent2);
  EXCEPTION WHEN SQLSTATE 'NG009' THEN v_erro := true;
  END;
  IF NOT v_erro THEN RAISE EXCEPTION 'FALHOU 10: ignorar aceitou p_entity_id.'; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);

  -- ---------------------------------------------------------------------------
  -- 11. Candidata: só a conflicting_entity_id e no âmbito; o 'confirmar' não
  --     troca nem corrige.
  -- ---------------------------------------------------------------------------
  SELECT * INTO r FROM public.fn_form_criar_entidade(
    p_organization_id => k_org, p_first_name => 'Teste', p_last_name => 'Candidata',
    p_email => 'teste.candidata.' || v_tag || '@exemplo.invalid');
  v_ent3 := r.entity_id; v_neg_c := r.negocio_id;
  IF NOT r.created OR v_neg_c IS NULL THEN
    RAISE EXCEPTION 'FALHOU 11: a candidata não nasceu com negócio.';
  END IF;
  SELECT * INTO r FROM public.fn_form_criar_entidade(
    p_organization_id => k_org, p_first_name => 'Outro', p_last_name => 'Nome', p_email => v_email);
  v_sub7 := r.submission_id;
  UPDATE public.form_submissions s SET conflicting_entity_id = v_ent3
  WHERE s.id = v_sub7 AND s.organization_id = k_org;

  -- 11a. comercial: vê o toque (dono do negócio de v_ent) mas a candidata está fora do âmbito
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_com_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_erro := false;
  BEGIN
    PERFORM public.rpc_resolve_form_submission(v_sub7, 'ligar', NULL, v_ent3);
  EXCEPTION WHEN SQLSTATE 'NG029' THEN v_erro := true;
  END;
  IF NOT v_erro THEN RAISE EXCEPTION 'FALHOU 11a: candidata fora do âmbito aceite.'; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_admin_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  -- 11b. uma pessoa que não é a conflicting_entity_id -> NG029
  v_erro := false;
  BEGIN
    PERFORM public.rpc_resolve_form_submission(v_sub7, 'ligar', NULL, v_ent2);
  EXCEPTION WHEN SQLSTATE 'NG029' THEN v_erro := true;
  END;
  IF NOT v_erro THEN RAISE EXCEPTION 'FALHOU 11b: candidata diferente da conflicting_entity_id aceite.'; END IF;
  -- 11c. criar_negocio na candidata (que já tem negócio aberto) com correcções -> confirmar
  v_res := public.rpc_resolve_form_submission(v_sub7, 'criar_negocio',
             jsonb_build_object('street', 'Rua Teste ' || v_tag, 'postal_code', '1000-001'), v_ent3);
  IF v_res ->> 'acao' IS DISTINCT FROM 'confirmar'
     OR (v_res ->> 'negocio_aberto_id')::uuid IS DISTINCT FROM v_neg_c THEN
    RAISE EXCEPTION 'FALHOU 11c: criar_negocio na candidata devolveu %.', v_res::text;
  END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  IF NOT EXISTS (SELECT 1 FROM public.form_submissions s
                 WHERE s.id = v_sub7 AND s.entity_id = v_ent AND s.conflicting_entity_id = v_ent3
                   AND s.resolved_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.anew_entity_addresses ea WHERE ea.entity_id = v_ent3) THEN
    RAISE EXCEPTION 'FALHOU 11c: o retorno confirmar trocou a pessoa ou escreveu as correcções.';
  END IF;
  -- 11d. confirmado: troca e escreve a morada (a candidata não tinha nenhuma)
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_admin_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.rpc_resolve_form_submission(v_sub7, 'criar_negocio',
             jsonb_build_object('street', 'Rua Teste ' || v_tag, 'postal_code', '1000-001'), v_ent3, true);
  IF v_res ->> 'resolution' IS DISTINCT FROM 'negocio_criado' OR (v_res ->> 'trocou')::boolean IS NOT TRUE
     OR (v_res ->> 'entity_id')::uuid IS DISTINCT FROM v_ent3 THEN
    RAISE EXCEPTION 'FALHOU 11d: criar_negocio confirmado na candidata devolveu %.', v_res::text;
  END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  IF NOT EXISTS (SELECT 1 FROM public.form_submissions s
                 WHERE s.id = v_sub7 AND s.entity_id = v_ent3 AND s.conflicting_entity_id IS NULL)
     OR (SELECT count(*) FROM public.anew_entity_addresses ea WHERE ea.entity_id = v_ent3) <> 1 THEN
    RAISE EXCEPTION 'FALHOU 11d: a troca ou a morada não ficaram gravadas.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 12. NG002: abordagem encerrada -> criar_negocio recusado
  -- ---------------------------------------------------------------------------
  UPDATE public.anew_entities e SET closure_result = 'semInteresse'
  WHERE e.id = v_ent3 AND e.organization_id = k_org;
  SELECT * INTO r FROM public.fn_form_criar_entidade(
    p_organization_id => k_org, p_first_name => 'Teste', p_last_name => 'Candidata',
    p_email => 'teste.candidata.' || v_tag || '@exemplo.invalid');
  v_sub8 := r.submission_id;
  IF r.created OR r.entity_id <> v_ent3 THEN
    RAISE EXCEPTION 'FALHOU 12: o toque não ficou na pessoa encerrada.';
  END IF;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_admin_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_erro := false;
  BEGIN
    PERFORM public.rpc_resolve_form_submission(v_sub8, 'criar_negocio', NULL, NULL, true);
  EXCEPTION WHEN SQLSTATE 'NG002' THEN v_erro := true;
  END;
  IF NOT v_erro THEN RAISE EXCEPTION 'FALHOU 12: criar_negocio aceite numa abordagem encerrada.'; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);

  -- ---------------------------------------------------------------------------
  -- 13. ACLs: nem anon nem authenticated (nem PUBLIC, que has_function_privilege
  --     inclui) executam fn_form_criar_entidade e fn_neg_titulo_de_nome
  -- ---------------------------------------------------------------------------
  v_n := 0;
  FOR v_txt IN
    SELECT p.oid::regprocedure::text FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname::text IN ('fn_form_criar_entidade', 'fn_neg_titulo_de_nome')
  LOOP
    v_n := v_n + 1;
    IF has_function_privilege('anon', v_txt, 'EXECUTE')
       OR has_function_privilege('authenticated', v_txt, 'EXECUTE') THEN
      RAISE EXCEPTION 'FALHOU 13: % executável por anon ou authenticated.', v_txt;
    END IF;
  END LOOP;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'FALHOU 13: esperava 2 funções, há %.', v_n;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 14. fn_form_completar_entidade só acompanha o título automático
  -- ---------------------------------------------------------------------------
  SELECT * INTO r FROM public.fn_form_criar_entidade(
    p_organization_id => k_org, p_email => 'teste.titulo.d.' || v_tag || '@exemplo.invalid');
  v_ent_d := r.entity_id; v_sub_d := r.submission_id; v_neg_d := r.negocio_id;
  SELECT * INTO r FROM public.fn_form_criar_entidade(
    p_organization_id => k_org, p_email => 'teste.titulo.e.' || v_tag || '@exemplo.invalid');
  v_ent_e := r.entity_id; v_sub_e := r.submission_id; v_neg_e := r.negocio_id;
  IF v_neg_d IS NULL OR v_neg_e IS NULL THEN
    RAISE EXCEPTION 'FALHOU 14: as pessoas só com email não tiveram negócio.';
  END IF;
  -- e: alguém mudou o título à mão
  PERFORM set_config('app.neg_via_funcao', 'on', true);
  UPDATE public.negocios n SET titulo = 'Obra cozinha (manual)' WHERE n.id = v_neg_e AND n.organization_id = k_org;
  PERFORM set_config('app.neg_via_funcao', '', true);

  PERFORM public.fn_form_completar_entidade(v_sub_d, 'Ana', 'Lopes');
  PERFORM public.fn_form_completar_entidade(v_sub_e, 'Rui', 'Costa');
  IF (SELECT n.titulo FROM public.negocios n WHERE n.id = v_neg_d) IS DISTINCT FROM 'Ana Lopes' THEN
    RAISE EXCEPTION 'FALHOU 14: o título automático não acompanhou o nome.';
  END IF;
  IF (SELECT n.titulo FROM public.negocios n WHERE n.id = v_neg_e) IS DISTINCT FROM 'Obra cozinha (manual)'
     OR (SELECT e.display_name FROM public.anew_entities e WHERE e.id = v_ent_e) IS DISTINCT FROM 'Rui Costa' THEN
    RAISE EXCEPTION 'FALHOU 14: um título mudado à mão foi reescrito (ou o nome não foi completado).';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 15. Utilizador de outra organização (escolhido aqui, só leitura): não vê os
  --     toques nem resolve. Sem nenhuma escrita fora da nike: o NG029 sai
  --     antes de qualquer escrita.
  -- ---------------------------------------------------------------------------
  SELECT * INTO r FROM public.fn_form_criar_entidade(
    p_organization_id => k_org, p_first_name => 'Teste', p_last_name => 'Quadro', p_email => v_email2);
  v_sub9 := r.submission_id;
  SELECT au.auth_user_id INTO v_other_auth
  FROM public.anew_users au
  WHERE au.auth_user_id IS NOT NULL AND au.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM public.anew_memberships m
                WHERE m.user_id = au.id AND m.status = 'active' AND m.organization_id <> k_org)
    AND NOT EXISTS (SELECT 1 FROM public.anew_memberships m
                    WHERE m.user_id = au.id AND m.organization_id = k_org)
    AND NOT public.is_system_admin(au.auth_user_id)
    AND NOT (k_org IN (SELECT public.get_user_crm_org_ids(au.auth_user_id)))
  LIMIT 1;
  IF v_other_auth IS NULL THEN
    RAISE NOTICE 'POR PROVAR 15: não há utilizador activo de outra organização sem acesso à nike.';
  ELSE
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_other_auth::text, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_n FROM public.form_submissions s
    WHERE s.entity_id IN (v_ent, v_ent2, v_ent3) OR s.id = v_sub9;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FALHOU 15: um utilizador de outra organização vê % toques da nike.', v_n;
    END IF;
    v_erro := false;
    BEGIN
      PERFORM public.rpc_resolve_form_submission(v_sub9, 'ignorar');
    EXCEPTION WHEN SQLSTATE 'NG029' THEN v_erro := true;
    END;
    IF NOT v_erro THEN RAISE EXCEPTION 'FALHOU 15: um utilizador de outra organização resolveu um toque da nike.'; END IF;
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '', true);
  END IF;

  -- ---------------------------------------------------------------------------
  -- 16. Índices únicos por email e por telefone (9 dígitos) por organização,
  --     de que depende o caminho da corrida de fn_form_criar_entidade
  -- ---------------------------------------------------------------------------
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_index i
  WHERE i.indrelid = 'public.anew_entities'::regclass AND i.indisunique AND i.indisvalid
    AND (position('(organization_id, lower(email))' IN pg_get_indexdef(i.indexrelid)::text) > 0
         OR position('(organization_id, "right"(regexp_replace(phone' IN pg_get_indexdef(i.indexrelid)::text) > 0);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'FALHOU 16: esperava 2 índices únicos (email e telefone por organização), há %.', v_n;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 17. (último) o sub-bloco engole a falha do negócio automático: a pessoa e
  --     o toque ficam, o toque fica na fila e app.neg_sem_autor fica reposto.
  --     fn_neg_titulo_de_nome foi criada pela migration nesta mesma transacção
  --     (invisível fora dela); troca-se por uma que devolve um título que
  --     negocios_titulo_check recusa.
  -- ---------------------------------------------------------------------------
  v_sem_autor := COALESCE(current_setting('app.neg_sem_autor', true), '');
  EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.fn_neg_titulo_de_nome(p_nome text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp
AS $f$ SELECT ' '::text $f$$ddl$;
  SELECT * INTO r FROM public.fn_form_criar_entidade(
    p_organization_id => k_org, p_first_name => 'Teste', p_last_name => 'Falha',
    p_email => 'teste.falha.' || v_tag || '@exemplo.invalid');
  IF NOT r.created OR r.negocio_id IS NOT NULL OR r.entity_id IS NULL OR r.submission_id IS NULL THEN
    RAISE EXCEPTION 'FALHOU 17: a falha do negócio não foi engolida como esperado (created %, negocio %).',
      r.created::text, r.negocio_id::text;
  END IF;
  IF EXISTS (SELECT 1 FROM public.negocios n WHERE n.entity_id = r.entity_id)
     OR NOT EXISTS (SELECT 1 FROM public.anew_entities e WHERE e.id = r.entity_id AND e.deleted_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.form_submissions s
                    WHERE s.id = r.submission_id AND s.resolved_at IS NULL AND s.resolution IS NULL
                      AND s.negocio_id IS NULL) THEN
    RAISE EXCEPTION 'FALHOU 17: depois da falha do negócio a pessoa ou o toque não ficaram como deviam.';
  END IF;
  IF COALESCE(current_setting('app.neg_sem_autor', true), '') IS DISTINCT FROM v_sem_autor THEN
    RAISE EXCEPTION 'FALHOU 17: app.neg_sem_autor não foi reposto depois da falha.';
  END IF;

  RAISE EXCEPTION 'TESTE_OK: todas as verificações passaram (tudo revertido).';
END
$teste$;
