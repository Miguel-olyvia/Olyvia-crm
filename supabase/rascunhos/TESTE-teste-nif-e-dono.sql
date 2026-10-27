-- =============================================================================
-- teste-nif-e-dono.sql — prova da migration 20261231600000_nif_e_dono_da_pessoa
-- (partes A e B; era o rascunho 20261231300000). A parte C, a revogacao do
-- UPDATE por coluna, esta em TESTE-teste-revogar-update-nif.sql.
--
-- NAO CORRER sem autorizacao explicita para escritas REVERTIDAS na org nike.
-- So base RH (uetjghdkwbywbftedtth). Nunca a principal, nunca a Mudelar.
--
-- Como correr (so com essa autorizacao, ANTES do db push, numa so ligacao):
--   BEGIN;
--   <conteudo inteiro da migration 20261231600000>
--   <este ficheiro>
--   ROLLBACK;
-- O bloco acaba SEMPRE com RAISE EXCEPTION (TESTE_OK ou FALHOU), por isso
-- nada fica gravado mesmo que o ROLLBACK falte.
--
-- O hash e a cifra aqui sao FALSOS (forma certa, sem segredo): o SQL nao tem
-- NIF_HMAC_KEY nem NIF_ENC_KEY. A correspondencia hash<->NIF so se prova com a
-- chamada real pelo nif-write-proxy, depois de publicado.
--
-- NIFs de teste (validos pelo digito de controlo, conferido em 0):
-- 123456789 e 987654322. Invalido: 123456780.
--
-- Utilizadores da nike (os mesmos de teste-negocio-inicio.sql, so ids):
--   admin     ba0b0ebf-1bdb-43f9-b82b-a2ade29848e2 (Super Admin) auth 08bb24a2-e11f-4f79-b4f7-c5125332da4a
--   comercial acf9f6c3-c3c7-1982-c424-da7ac2add2cb auth 37069e32-c4ce-47f1-f42f-9e2a89eb92a3
--   outro     42c020c5-cb47-b7de-8246-1a8f2ed0adf4 auth 007a341a-4bce-9626-1efa-4593c7804ea7
--
-- Casos da revisao de 26/10:
--   A10 NIF repetido numa pessoa fora do ambito 'view' de quem chama -> NG031
--       com a mensagem generica fixa; a mesma pessoa dentro do ambito -> NG030.
--   B8  comercial (pessoas.create, leads.edit OWNED, sem leads.assign) cria,
--       autenticado, um negocio sobre uma pessoa sem dono fora do seu ambito,
--       com assigned_to = ele: o negocio nasce, a pessoa continua sem dono.
--   B9  o mesmo comercial (ambito edit so sobre o negocio, por ser o criador)
--       muda assigned_to (NULL -> ele -> outro): a pessoa continua sem dono.
--   B10 controlo: o admin (leads.assign, ambito ORG) muda o responsavel do
--       mesmo negocio para o comercial -> a pessoa fica com ele (prova que B8 e
--       B9 nao passam por o gatilho nunca atribuir com sessao).
--
-- Fica por provar aqui (nao se escreve fora da nike nem se abrem duas ligacoes):
--   * entidade partilhada com outra organizacao (A recusa NG003, B ignora);
--   * SKIP LOCKED do gatilho com a pessoa bloqueada noutra transaccao (risco
--     aceite: a atribuicao perde-se, sem retentativa);
--   * a corrida no indice unico do NIF (NG031 pelo unique_violation);
--   * o proxy a chamar a RPC (p_nif_tokens aceite, hash real, erro traduzido).
-- =============================================================================
DO $teste$
DECLARE
  k_org        constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  k_admin_id   constant uuid := 'ba0b0ebf-1bdb-43f9-b82b-a2ade29848e2';
  k_admin_auth constant uuid := '08bb24a2-e11f-4f79-b4f7-c5125332da4a';
  k_com_id     constant uuid := 'acf9f6c3-c3c7-1982-c424-da7ac2add2cb';
  k_com_auth   constant uuid := '37069e32-c4ce-47f1-f42f-9e2a89eb92a3';
  k_out_id     constant uuid := '42c020c5-cb47-b7de-8246-1a8f2ed0adf4';
  k_nif1       constant text := '123456789';
  k_nif2       constant text := '987654322';
  v_tag   text := replace(gen_random_uuid()::text, '-', '');
  v_h1    text;
  v_h2    text;
  v_enc9  text := encode(convert_to(repeat('x', 37), 'UTF8'), 'base64');  -- 12 + 9 + 16
  v_enc8  text := encode(convert_to(repeat('x', 36), 'UTF8'), 'base64');  -- tamanho errado
  v_enc11 text := encode(convert_to(repeat('x', 39), 'UTF8'), 'base64');  -- NIF aparado com 11 bytes
  v_role  uuid;
  r       record;
  v_e1    uuid;
  v_e2    uuid;
  v_e3    uuid;
  v_e4    uuid;
  v_n1    uuid;
  v_n2    uuid;
  v_n3    uuid;
  v_n4    uuid;
  v_n5    uuid;
  v_n6    uuid;
  v_res   jsonb;
  v_n     bigint;
  v_erro  text;
  v_caso  record;
  v_ts    timestamptz := now();  -- entity_audit_log.created_at e now() da transaccao
BEGIN
  v_h1 := md5('h1' || v_tag) || md5('x' || v_tag);
  v_h2 := md5('h2' || v_tag) || md5('y' || v_tag);

  -- ---------------------------------------------------------------------------
  -- 0. Pre-condicoes e semente (como postgres, sem sessao)
  -- ---------------------------------------------------------------------------
  IF public.fn_nif_key(k_nif1) IS DISTINCT FROM 'PT' || k_nif1
     OR public.fn_nif_key(k_nif2) IS DISTINCT FROM 'PT' || k_nif2
     OR public.fn_nif_key('123456780') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 0: os NIFs de teste nao sao os esperados por fn_nif_key.';
  END IF;
  IF length(v_h1) <> 64 OR length(v_h2) <> 64 THEN
    RAISE EXCEPTION 'FALHOU 0: hash de teste com tamanho errado.';
  END IF;
  SELECT count(*) INTO v_n FROM public.anew_memberships m
  WHERE m.organization_id = k_org AND m.status = 'active'
    AND m.user_id IN (k_admin_id, k_com_id, k_out_id)
    AND m.role_is_client IS NOT TRUE;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'FALHOU 0: esperava 3 membros activos nao clientes na nike, ha %.', v_n;
  END IF;

  -- papel temporario com ambito OWNED para o comercial e o outro (sem
  -- membership_permission_scopes, resolve_lead_access_context da OWNED).
  -- leads.edit entra para B8/B9 recusarem pelo AMBITO e nao pela falta da
  -- permissao; leads.assign fica de fora de proposito.
  INSERT INTO public.anew_roles (code, name, organization_id, description)
  VALUES ('teste_comercial_' || v_tag, 'TESTE comercial (revertido)', k_org, 'teste revertido')
  RETURNING id INTO v_role;
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
  SELECT v_role, x.c
  FROM unnest(ARRAY['leads.view', 'leads.edit', 'clients.view', 'pessoas.view',
                    'pessoas.create', 'pessoas.edit']) AS x(c);
  UPDATE public.anew_memberships m SET role_id = v_role
  WHERE m.organization_id = k_org AND m.user_id IN (k_com_id, k_out_id);
  DELETE FROM public.anew_membership_permission_scopes s
  WHERE s.membership_id IN (SELECT m.id FROM public.anew_memberships m
                            WHERE m.organization_id = k_org AND m.user_id IN (k_com_id, k_out_id));

  -- quatro pessoas novas, cada uma com o negocio automatico sem dono
  SELECT * INTO r FROM public.fn_form_criar_entidade(
    p_organization_id => k_org, p_first_name => 'Teste', p_last_name => 'NifUm',
    p_email => 'teste.nif1.' || v_tag || '@exemplo.invalid');
  v_e1 := r.entity_id; v_n1 := r.negocio_id;
  SELECT * INTO r FROM public.fn_form_criar_entidade(
    p_organization_id => k_org, p_first_name => 'Teste', p_last_name => 'NifDois',
    p_email => 'teste.nif2.' || v_tag || '@exemplo.invalid');
  v_e2 := r.entity_id; v_n2 := r.negocio_id;
  SELECT * INTO r FROM public.fn_form_criar_entidade(
    p_organization_id => k_org, p_first_name => 'Teste', p_last_name => 'DonoTres',
    p_email => 'teste.dono3.' || v_tag || '@exemplo.invalid');
  v_e3 := r.entity_id; v_n3 := r.negocio_id;
  SELECT * INTO r FROM public.fn_form_criar_entidade(
    p_organization_id => k_org, p_first_name => 'Teste', p_last_name => 'DonoQuatro',
    p_email => 'teste.dono4.' || v_tag || '@exemplo.invalid');
  v_e4 := r.entity_id; v_n4 := r.negocio_id;
  IF v_e1 IS NULL OR v_e2 IS NULL OR v_e3 IS NULL OR v_e4 IS NULL
     OR v_n1 IS NULL OR v_n2 IS NULL OR v_n3 IS NULL OR v_n4 IS NULL THEN
    RAISE EXCEPTION 'FALHOU 0: as pessoas de teste nao nasceram com negocio.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.anew_entities e
             WHERE e.id IN (v_e1, v_e2, v_e3, v_e4)
               AND (e.assigned_to IS NOT NULL OR e.nif_hash IS NOT NULL)) THEN
    RAISE EXCEPTION 'FALHOU 0: uma pessoa de teste ja nasceu com dono ou NIF.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- A1. ACL: anon nao executa a RPC; authenticated executa; o gatilho nao e
  --     executavel por authenticated
  -- ---------------------------------------------------------------------------
  IF has_function_privilege('anon', 'public.neg_guardar_nif_pessoa(uuid, uuid, text, text, text, text[])', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.neg_guardar_nif_pessoa(uuid, uuid, text, text, text, text[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_negocios_dono_para_pessoa()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_negocios_dono_para_pessoa()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU A1: ACL das funcoes novas.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- A2. Sem sessao -> insufficient_privilege
  -- ---------------------------------------------------------------------------
  v_erro := NULL;
  BEGIN
    PERFORM public.neg_guardar_nif_pessoa(k_org, v_e1, k_nif1, v_h1, v_enc9);
  EXCEPTION WHEN insufficient_privilege THEN v_erro := 'ok';
  END;
  IF v_erro IS NULL THEN
    RAISE EXCEPTION 'FALHOU A2: gravou o NIF sem sessao.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- A3. Comercial (OWNED) sem ligacao a pessoa -> recusado (NG003 ou 42501)
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_com_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_erro := NULL;
  BEGIN
    PERFORM public.neg_guardar_nif_pessoa(k_org, v_e1, k_nif1, v_h1, v_enc9);
  EXCEPTION
    WHEN SQLSTATE 'NG003' THEN v_erro := 'ok';
    WHEN insufficient_privilege THEN v_erro := 'ok';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_erro IS NULL THEN
    RAISE EXCEPTION 'FALHOU A3: o comercial gravou o NIF de uma pessoa fora do ambito.';
  END IF;

  -- a partir daqui, o admin (Super Admin) da nike
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_admin_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- ---------------------------------------------------------------------------
  -- A4. Valores invalidos -> NG009, e a mensagem nunca traz o NIF
  -- ---------------------------------------------------------------------------
  FOR v_caso IN
    SELECT * FROM (VALUES
      ('8 digitos',         '12345678',    v_h1,          v_enc9),
      ('controlo errado',   '123456780',   v_h1,          v_enc9),
      ('com prefixo PT',    'PT123456789', v_h1,          v_enc9),
      ('sem hash',          k_nif1,        NULL::text,    v_enc9),
      ('hash maiusculas',   k_nif1,        upper(v_h1),   v_enc9),
      ('sem cifra',         k_nif1,        v_h1,          NULL::text),
      ('cifra tamanho',     k_nif1,        v_h1,          v_enc8),
      ('cifra nao base64',  k_nif1,        v_h1,          '***'),
      ('limpar com hash',   '',            v_h1,          NULL::text)
    ) AS x(nome, nif, h, enc)
  LOOP
    v_erro := NULL;
    BEGIN
      PERFORM public.neg_guardar_nif_pessoa(k_org, v_e1, v_caso.nif, v_caso.h, v_caso.enc);
    EXCEPTION WHEN SQLSTATE 'NG009' THEN v_erro := SQLERRM;
    END;
    IF v_erro IS NULL THEN
      RAISE EXCEPTION 'FALHOU A4 (%): aceitou um valor invalido.', v_caso.nome;
    END IF;
    IF regexp_replace(v_caso.nif, '[^0-9]', '', 'g') <> ''
       AND position(regexp_replace(v_caso.nif, '[^0-9]', '', 'g') IN v_erro) > 0 THEN
      RAISE EXCEPTION 'FALHOU A4 (%): a mensagem de erro traz o NIF.', v_caso.nome;
    END IF;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- A5. Gravar com espacos e hifen (o proxy cifra o NIF aparado: 11 bytes)
  -- ---------------------------------------------------------------------------
  v_res := public.neg_guardar_nif_pessoa(k_org, v_e1, ' 123 456-789 ', v_h1, v_enc11);
  IF v_res IS DISTINCT FROM jsonb_build_object('nif_ultimos3', '789', 'mudou', true) THEN
    RAISE EXCEPTION 'FALHOU A5: retorno inesperado: %.', v_res::text;
  END IF;
  IF position(k_nif1 IN v_res::text) > 0 THEN
    RAISE EXCEPTION 'FALHOU A5: o retorno traz o NIF.';
  END IF;

  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_n FROM public.anew_entities e
  WHERE e.id = v_e1 AND e.nif_hash = v_h1 AND e.nif_encrypted = v_enc11 AND e.nif_last3 = '789';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU A5: as colunas do NIF nao ficaram gravadas.';
  END IF;
  -- auditoria: sem hash, sem cifra, sem o NIF em claro
  SELECT count(*) INTO v_n FROM public.entity_audit_log a
  WHERE a.entity_id = v_e1 AND a.table_name = 'anew_entities' AND a.created_at >= v_ts
    AND (a.changed_fields ? 'nif_hash' OR a.changed_fields ? 'nif_encrypted'
         OR position(k_nif1 IN COALESCE(a.changed_fields::text, '') || COALESCE(a.full_record::text, '')) > 0);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FALHOU A5: a auditoria guardou o hash, a cifra ou o NIF (% linhas).', v_n;
  END IF;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_admin_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- ---------------------------------------------------------------------------
  -- A6. O mesmo NIF outra vez -> mudou false (a cifra nova nao conta)
  -- ---------------------------------------------------------------------------
  v_res := public.neg_guardar_nif_pessoa(k_org, v_e1, k_nif1, v_h1, v_enc9, ARRAY['t1', 't2']);
  IF v_res IS DISTINCT FROM jsonb_build_object('nif_ultimos3', '789', 'mudou', false) THEN
    RAISE EXCEPTION 'FALHOU A6: retorno inesperado: %.', v_res::text;
  END IF;

  -- ---------------------------------------------------------------------------
  -- A7. O mesmo NIF noutra pessoa da organizacao -> {erro: NG030} devolvido
  --     (nao lancado, para o contador ficar), sem o hash nem o NIF, e a pessoa
  --     continua sem NIF
  -- ---------------------------------------------------------------------------
  v_res := public.neg_guardar_nif_pessoa(k_org, v_e2, k_nif1, v_h1, v_enc9);
  IF v_res ->> 'erro' IS DISTINCT FROM 'NG030' THEN
    RAISE EXCEPTION 'FALHOU A7: aceitou o NIF repetido: %.', v_res::text;
  END IF;
  IF position(v_h1 IN v_res::text) > 0 OR position(k_nif1 IN v_res::text) > 0 THEN
    RAISE EXCEPTION 'FALHOU A7: a resposta do repetido traz o hash ou o NIF.';
  END IF;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_n FROM public.anew_entities e WHERE e.id = v_e2 AND e.nif_hash IS NOT NULL;
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FALHOU A7: o NIF repetido ficou gravado.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- A8. Pessoa apagada (soft delete) nao bloqueia o NIF
  -- ---------------------------------------------------------------------------
  v_res := public.neg_guardar_nif_pessoa(k_org, v_e2, k_nif2, v_h2, v_enc9);
  IF v_res ->> 'nif_ultimos3' IS DISTINCT FROM '322' THEN
    RAISE EXCEPTION 'FALHOU A8: nao gravou o segundo NIF: %.', v_res::text;
  END IF;
  EXECUTE 'RESET ROLE';
  UPDATE public.anew_entities e SET deleted_at = now() WHERE e.id = v_e2;
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.neg_guardar_nif_pessoa(k_org, v_e1, k_nif2, v_h2, v_enc9);
  IF v_res IS DISTINCT FROM jsonb_build_object('nif_ultimos3', '322', 'mudou', true) THEN
    RAISE EXCEPTION 'FALHOU A8: o NIF de uma pessoa apagada bloqueou: %.', v_res::text;
  END IF;
  -- e a pessoa apagada ja nao aceita escrita
  v_erro := NULL;
  BEGIN
    PERFORM public.neg_guardar_nif_pessoa(k_org, v_e2, '', NULL, NULL);
  EXCEPTION
    WHEN SQLSTATE 'NG003' THEN v_erro := 'ok';
    WHEN insufficient_privilege THEN v_erro := 'ok';
  END;
  IF v_erro IS NULL THEN
    RAISE EXCEPTION 'FALHOU A8: escreveu numa pessoa apagada.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- A9. Limpar ('' e NULL) -> colunas a NULL; outra vez -> mudou false
  -- ---------------------------------------------------------------------------
  v_res := public.neg_guardar_nif_pessoa(k_org, v_e1, '   ', NULL, NULL);
  IF v_res IS DISTINCT FROM jsonb_build_object('nif_ultimos3', NULL, 'mudou', true) THEN
    RAISE EXCEPTION 'FALHOU A9: limpar devolveu %.', v_res::text;
  END IF;
  v_res := public.neg_guardar_nif_pessoa(k_org, v_e1, NULL, NULL, NULL);
  IF v_res IS DISTINCT FROM jsonb_build_object('nif_ultimos3', NULL, 'mudou', false) THEN
    RAISE EXCEPTION 'FALHOU A9: limpar outra vez devolveu %.', v_res::text;
  END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT count(*) INTO v_n FROM public.anew_entities e
  WHERE e.id = v_e1 AND e.nif_hash IS NULL AND e.nif_encrypted IS NULL AND e.nif_last3 IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU A9: o NIF nao ficou limpo.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- A10. Repetido numa pessoa que quem chama NAO ve -> NG031 generico; a mesma
  --      pessoa dentro do ambito -> NG030. Quem chama: o comercial (OWNED), a
  --      gravar na v_e4 (que passa a ser dele); o NIF esta na v_e3 (do admin).
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_admin_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.neg_guardar_nif_pessoa(k_org, v_e3, k_nif1, v_h1, v_enc9);
  EXECUTE 'RESET ROLE';
  IF v_res IS DISTINCT FROM jsonb_build_object('nif_ultimos3', '789', 'mudou', true) THEN
    RAISE EXCEPTION 'FALHOU A10 (pre): nao gravou o NIF na v_e3: %.', v_res::text;
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.anew_entities e SET assigned_to = k_com_id WHERE e.id = v_e4;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_com_auth::text, 'role', 'authenticated')::text, true);
  IF public.fn_neg_pessoa_no_ambito(k_org, v_e3, 'view')
     OR NOT public.fn_neg_pessoa_no_ambito(k_org, v_e4, 'edit') THEN
    RAISE EXCEPTION 'FALHOU A10 (pre): o ambito do comercial nao e o esperado (v_e3 fora, v_e4 dentro).';
  END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.neg_guardar_nif_pessoa(k_org, v_e4, k_nif1, v_h1, v_enc9);
  EXECUTE 'RESET ROLE';
  IF v_res IS DISTINCT FROM jsonb_build_object('erro', 'NG031', 'mensagem', 'Nao foi possivel gravar este NIF.') THEN
    RAISE EXCEPTION 'FALHOU A10: o repetido fora do ambito nao deu a recusa generica NG031: %.', v_res::text;
  END IF;

  -- a mesma pessoa passa a estar no ambito do comercial -> NG030
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.anew_entities e SET assigned_to = k_com_id WHERE e.id = v_e3;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_com_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.neg_guardar_nif_pessoa(k_org, v_e4, k_nif1, v_h1, v_enc9);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_res ->> 'erro' IS DISTINCT FROM 'NG030' THEN
    RAISE EXCEPTION 'FALHOU A10: o repetido dentro do ambito nao deu NG030: %.', v_res::text;
  END IF;
  IF position(v_h1 IN v_res::text) > 0 OR position(k_nif1 IN v_res::text) > 0 THEN
    RAISE EXCEPTION 'FALHOU A10: a resposta do repetido traz o hash ou o NIF.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- A11. Limite na base (D): as duas recusas do comercial em A10 CONTARAM (2
  --      no minuto); levado o contador a 10, a tentativa seguinte da NG032, e
  --      authenticated nao le nem escreve a tabela do contador.
  -- ---------------------------------------------------------------------------
  SELECT t.n INTO v_n FROM public.neg_nif_tentativas t
  WHERE t.user_id = k_com_auth AND t.janela = date_trunc('minute', now());
  IF v_n IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU A11: as recusas por repetido nao contaram (contador %).', v_n;
  END IF;
  UPDATE public.neg_nif_tentativas t SET n = 10
  WHERE t.user_id = k_com_auth AND t.janela = date_trunc('minute', now());
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_com_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_erro := NULL;
  BEGIN
    PERFORM public.neg_guardar_nif_pessoa(k_org, v_e4, k_nif2, v_h2, v_enc9);
  EXCEPTION WHEN SQLSTATE 'NG032' THEN v_erro := SQLERRM;
  END;
  IF v_erro IS NULL THEN
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'FALHOU A11: a 11.a tentativa no minuto nao deu NG032.';
  END IF;
  v_erro := NULL;
  BEGIN
    PERFORM 1 FROM public.neg_nif_tentativas;
  EXCEPTION WHEN insufficient_privilege THEN v_erro := 'ok';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_erro IS NULL THEN
    RAISE EXCEPTION 'FALHOU A11: authenticated le a tabela do contador.';
  END IF;
  SELECT count(*) INTO v_n FROM public.anew_entities e WHERE e.id = v_e4 AND e.nif_hash IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FALHOU A11: gravou o NIF depois do limite.';
  END IF;

  -- repor: v_e3 e v_e4 sem dono e sem NIF (B1 e B4 partem daqui)
  UPDATE public.anew_entities e
  SET assigned_to = NULL, nif_hash = NULL, nif_encrypted = NULL, nif_last3 = NULL
  WHERE e.id IN (v_e3, v_e4);

  -- ---------------------------------------------------------------------------
  -- B1. Negocio ganha responsavel e a pessoa nao tem dono -> pessoa fica com ele
  -- ---------------------------------------------------------------------------
  UPDATE public.negocios n SET assigned_to = k_com_id WHERE n.id = v_n3;
  SELECT count(*) INTO v_n FROM public.anew_entities e WHERE e.id = v_e3 AND e.assigned_to = k_com_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU B1: a pessoa nao ficou com o responsavel do negocio.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- B2. Trocar o responsavel do negocio NAO troca o dono da pessoa
  -- ---------------------------------------------------------------------------
  UPDATE public.negocios n SET assigned_to = k_out_id WHERE n.id = v_n3;
  SELECT count(*) INTO v_n FROM public.anew_entities e WHERE e.id = v_e3 AND e.assigned_to = k_com_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU B2: o dono da pessoa mudou com o negocio.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- B3. Tirar o responsavel do negocio NAO apaga o dono da pessoa
  -- ---------------------------------------------------------------------------
  UPDATE public.negocios n SET assigned_to = NULL WHERE n.id = v_n3;
  SELECT count(*) INTO v_n FROM public.anew_entities e WHERE e.id = v_e3 AND e.assigned_to = k_com_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU B3: o dono da pessoa foi apagado.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- B4. Pessoa que ja tem dono (admin) -> fica com o admin
  -- ---------------------------------------------------------------------------
  UPDATE public.anew_entities e SET assigned_to = k_admin_id WHERE e.id = v_e4;
  UPDATE public.negocios n SET assigned_to = k_com_id WHERE n.id = v_n4;
  SELECT count(*) INTO v_n FROM public.anew_entities e WHERE e.id = v_e4 AND e.assigned_to = k_admin_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU B4: o gatilho trocou um dono existente.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- B5. INSERT de um negocio ja com responsavel (pessoa sem dono) -> atribui
  -- ---------------------------------------------------------------------------
  UPDATE public.anew_entities e SET assigned_to = NULL WHERE e.id = v_e1;
  INSERT INTO public.negocios (organization_id, entity_id, titulo, assigned_to)
  VALUES (k_org, v_e1, 'Teste dono no insert', k_out_id)
  RETURNING id INTO v_n5;
  SELECT count(*) INTO v_n FROM public.anew_entities e WHERE e.id = v_e1 AND e.assigned_to = k_out_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU B5: o INSERT com responsavel nao atribuiu a pessoa.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- B6. Negocio de uma pessoa apagada (v_e2) -> nao mexe na pessoa
  -- ---------------------------------------------------------------------------
  UPDATE public.negocios n SET assigned_to = k_com_id WHERE n.id = v_n2;
  SELECT count(*) INTO v_n FROM public.anew_entities e WHERE e.id = v_e2 AND e.assigned_to IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU B6: atribuiu dono a uma pessoa apagada.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- B7. Atribuir pela RPC da ficha (mesma transaccao, pessoa ja bloqueada) nao
  --     da erro nem espera: neg_atribuir_pessoa como admin numa pessoa sem dono
  -- ---------------------------------------------------------------------------
  UPDATE public.anew_entities e SET assigned_to = NULL WHERE e.id = v_e3;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_admin_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.neg_atribuir_pessoa(k_org, v_e3, k_admin_id);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT count(*) INTO v_n FROM public.anew_entities e WHERE e.id = v_e3 AND e.assigned_to = k_admin_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU B7: neg_atribuir_pessoa nao ficou com o dono pedido: %.', v_res::text;
  END IF;

  -- ---------------------------------------------------------------------------
  -- B8. Comercial com pessoas.create cria, autenticado, um negocio sobre uma
  --     pessoa sem dono FORA do seu ambito, com assigned_to = ele. O negocio
  --     nasce (o gatilho nao o faz falhar) e a pessoa continua sem dono.
  -- ---------------------------------------------------------------------------
  UPDATE public.anew_entities e SET assigned_to = NULL WHERE e.id = v_e4;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_com_auth::text, 'role', 'authenticated')::text, true);
  IF public.fn_neg_pessoa_no_ambito(k_org, v_e4, 'edit')
     OR public.fn_neg_tem_permissao_org(k_org, 'leads.assign')
     OR NOT public.fn_neg_tem_permissao_org(k_org, 'pessoas.create')
     OR NOT public.fn_neg_tem_permissao_org(k_org, 'leads.edit') THEN
    RAISE EXCEPTION 'FALHOU B8 (pre): o comercial nao esta como esperado (v_e4 fora do ambito, sem leads.assign, com pessoas.create e leads.edit).';
  END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.negocios (organization_id, entity_id, titulo, assigned_to)
  VALUES (k_org, v_e4, 'Teste B8 ' || v_tag, k_com_id);
  EXECUTE 'RESET ROLE';
  SELECT n.id INTO v_n6 FROM public.negocios n
  WHERE n.organization_id = k_org AND n.entity_id = v_e4
    AND n.titulo = 'Teste B8 ' || v_tag
    AND n.assigned_to = k_com_id AND n.created_by = k_com_id
    AND n.deleted_at IS NULL;
  IF v_n6 IS NULL THEN
    RAISE EXCEPTION 'FALHOU B8: o negocio do comercial nao nasceu como esperado.';
  END IF;
  SELECT count(*) INTO v_n FROM public.anew_entities e WHERE e.id = v_e4 AND e.assigned_to IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU B8: a pessoa fora do ambito ficou com dono pelo negocio.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- B9. O mesmo comercial (ambito edit so sobre o negocio, por o ter criado)
  --     muda assigned_to: NULL -> ele (so conta o ambito) -> outro (tambem
  --     falta leads.assign). Cada UPDATE passa (1 linha) e a pessoa continua
  --     sem dono.
  -- ---------------------------------------------------------------------------
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.negocios n SET assigned_to = NULL WHERE n.id = v_n6;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'FALHOU B9: o comercial nao conseguiu tirar o responsavel (% linhas).', v_n;
  END IF;
  UPDATE public.negocios n SET assigned_to = k_com_id WHERE n.id = v_n6;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'FALHOU B9: o comercial nao conseguiu ficar responsavel (% linhas).', v_n;
  END IF;
  UPDATE public.negocios n SET assigned_to = k_out_id WHERE n.id = v_n6;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU B9: o comercial nao conseguiu passar o negocio ao outro (% linhas).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.negocios n WHERE n.id = v_n6 AND n.assigned_to = k_out_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU B9: o responsavel do negocio nao ficou o pedido.';
  END IF;
  SELECT count(*) INTO v_n FROM public.anew_entities e WHERE e.id = v_e4 AND e.assigned_to IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU B9: a pessoa fora do ambito ficou com dono por UPDATE do negocio.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- B10. Controlo: o admin (leads.assign, ambito ORG) passa o mesmo negocio ao
  --      comercial -> a pessoa fica com o comercial.
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', k_admin_auth::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.negocios n SET assigned_to = k_com_id WHERE n.id = v_n6;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT count(*) INTO v_n FROM public.anew_entities e WHERE e.id = v_e4 AND e.assigned_to = k_com_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU B10: com leads.assign e ambito, a pessoa nao ficou com o responsavel.';
  END IF;

  RAISE EXCEPTION 'TESTE_OK: todas as verificacoes passaram (tudo revertido).';
END
$teste$;
