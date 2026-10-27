-- =============================================================================
-- TESTE-portal-fase1.sql -- prova da migration
--   20261231810000_hr_portal_fase1_rascunho_submeter_com_sessao
--
-- NAO CORRER sem autorizacao explicita para escritas REVERTIDAS na org nike.
-- So base RH (uetjghdkwbywbftedtth), a partir do worktree rh-pessoas
-- (confirmar supabase/.temp/project-ref). Nunca a principal, nunca a Mudelar.
--
-- Como correr (so com essa autorizacao, ANTES do db push, numa so ligacao):
--   BEGIN;
--   <conteudo da migration 20261231810000 SEM as linhas BEGIN; e COMMIT;>
--   <este ficheiro>
--   ROLLBACK;
-- O bloco acaba SEMPRE com RAISE EXCEPTION (TESTE_OK ou FALHOU), por isso nada
-- fica gravado mesmo que o ROLLBACK falte. A pessoa, o processo de admissao e
-- os segredos do Vault criados aqui so existem dentro da transaccao.
--
-- Corre como o dono das funcoes (postgres), que e como a Edge as executa por
-- service_role (SECURITY DEFINER). Nao usa a chave service_role em lado nenhum.
-- Bloqueios: so linhas novas (uma pessoa e um processo da nike, criados aqui).
--
-- Casos:
--   0   pre-condicoes: assinaturas novas existem, antigas nao; uma por nome.
--   1   ACL: anon e authenticated nao executam nenhuma das duas (42501).
--   2   rascunho sem sessao HRA51, sessao de outro HRA53, token desconhecido
--       HRA31; sessao expirada (actividade ha 31 min) HRA52.
--   3   rascunho valido: grava, devolve ok e guardado_em, renova a actividade.
--   4   rascunho recusado ANTES do CHECK: niss / iban / conta_numero / chave
--       desconhecida / objecto aninhado -> HRA10 rascunho_chave_invalida;
--       acima de 20000 bytes -> HRA10 rascunho_demasiado_grande; lista ->
--       HRA10 pedido_invalido. Nada muda no rascunho guardado.
--   5   estado: convidada e submetida -> HRA38 (rascunho e submeter).
--   6   devolvida: chave devolvida grava e o resto do rascunho fica (merge);
--       o nome do portal (morada_linha1) vale pelo da ficha (linha1); chave
--       nao devolvida alterada -> HRA47 com DETAIL so de nomes; a mesma chave
--       com o mesmo valor passa; submeter com chave nao devolvida -> HRA47.
--   7   submeter recusado no prefixo: sem sessao HRA51; niss / iban /
--       conta_numero em p_dados HRA10; assinatura vazia ou > 200 HRA10. O
--       processo continua aberto, sem used_at nem submetido_em.
--   8   atomicidade: NIF invalido (HRA11) depois do UPDATE de used_at ->
--       nada fica (used_at, submetido_em, estado, rascunho como estavam).
--   9   sucesso: NISS e IBAN so no Vault (sensiveis_gravar); submeter grava
--       NISS e conta na ficha a partir do Vault; processo concluida, portal
--       fechado, submetido_em, assinatura sem espacos, rascunho NULL, evento
--       submetido; o rascunho nunca teve niss/iban.
--   10  depois de submeter: rascunho e submeter -> HRA02.
--
-- Fica por provar aqui:
--   * concorrencia (dois pedidos ao mesmo tempo; FOR UPDATE) -- duas ligacoes;
--   * o caminho pela Edge (sessao no cabecalho, p_ip por detectClientIp) --
--     testes vitest da Edge e verificacao ao vivo na nike depois do push.
-- =============================================================================
DO $teste$
DECLARE
  k_org        constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  k_iban       constant text := 'PT50000201231234567890154';
  k_bic        constant text := 'CGDIPTPL';
  v_tag        text := replace(gen_random_uuid()::text, '-', '');
  v_token      text;
  v_sessao     text;
  v_outra      text;
  v_pessoa     uuid;
  v_convite    uuid;
  v_base       text;
  v_niss       text;
  v_nif        text;
  v_nif_mau    text;
  v_dados      jsonb;
  v_res        jsonb;
  v_uuid       uuid;
  v_estado     text;
  v_msg        text;
  v_det        text;
  v_n          bigint;
  v_ts         timestamptz;
  v_txt        text;
  r            record;
  d            integer;
BEGIN
  -- Sem cabecalhos de pedido: hr_convite_sessao_exigir nao tem onde ir buscar
  -- a sessao alem de p_sessao_hash.
  PERFORM set_config('request.headers', '', true);

  -- ---- 0. Pre-condicoes -------------------------------------------------------
  IF to_regprocedure('public.rpc_hr_convite_admissao_rascunho(text, text, jsonb)') IS NULL
     OR to_regprocedure('public.rpc_hr_convite_admissao_submeter(text, text, jsonb, text, inet, text)') IS NULL THEN
    RAISE EXCEPTION 'FALHOU 0: a migration 20261231810000 nao esta aplicada nesta transaccao.';
  END IF;
  IF to_regprocedure('public.rpc_hr_convite_admissao_rascunho(text, jsonb)') IS NOT NULL
     OR to_regprocedure('public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 0: uma assinatura antiga continua a existir.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('rpc_hr_convite_admissao_rascunho', 'rpc_hr_convite_admissao_submeter');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'FALHOU 0: esperava 2 funcoes (uma por nome), ha %.', v_n;
  END IF;

  -- Um NISS e um NIF validos e que nao existem na nike.
  LOOP
    v_niss := NULL;
    v_base := '1' || lpad(floor(random() * 1000000000)::bigint::text, 9, '0');
    FOR d IN 0..9 LOOP
      IF public.hr_niss_valido(v_base || d::text) THEN
        v_niss := v_base || d::text;
        EXIT;
      END IF;
    END LOOP;
    EXIT WHEN v_niss IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.pessoas_identificacao i
                           WHERE i.organization_id = k_org AND i.niss = v_niss);
  END LOOP;
  LOOP
    v_nif := NULL;
    v_base := '2' || lpad(floor(random() * 10000000)::bigint::text, 7, '0');
    FOR d IN 0..9 LOOP
      IF public.hr_nif_valido(v_base || d::text) THEN
        v_nif := v_base || d::text;
        v_nif_mau := v_base || ((d + 1) % 10)::text;
        EXIT;
      END IF;
    END LOOP;
    EXIT WHEN v_nif IS NOT NULL
          AND NOT public.hr_nif_valido(v_nif_mau)
          AND NOT EXISTS (SELECT 1 FROM public.pessoas_identificacao i
                           WHERE i.organization_id = k_org AND i.nif = v_nif);
  END LOOP;

  -- Pessoa e processo de admissao com sessao OTP activa.
  INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
  VALUES (k_org, 'TestePF1', 'Portal ' || left(v_tag, 8))
  RETURNING id INTO v_pessoa;

  v_token  := encode(sha256(convert_to('token-pf1-' || v_tag, 'UTF8')), 'hex');
  v_sessao := encode(sha256(convert_to('sessao-pf1-' || v_tag, 'UTF8')), 'hex');
  v_outra  := encode(sha256(convert_to('outra-pf1-' || v_tag, 'UTF8')), 'hex');

  INSERT INTO public.pessoas_convites_admissao (
    pessoa_id, organization_id, token_hash, email_destino, valid_until, estado,
    sessao_hash, sessao_iniciada_em, sessao_ultima_atividade_em
  ) VALUES (
    v_pessoa, k_org, v_token, 'teste.pf1.' || left(v_tag, 8) || '@exemplo.pt', now() + interval '7 days',
    'em_preenchimento', v_sessao, now(), now()
  )
  RETURNING id INTO v_convite;

  -- ---- 1. ACL -----------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      ('anon', format('SELECT public.rpc_hr_convite_admissao_rascunho(%L, %L, %L::jsonb)', v_token, v_sessao, '{}')),
      ('authenticated', format('SELECT public.rpc_hr_convite_admissao_rascunho(%L, %L, %L::jsonb)', v_token, v_sessao, '{}')),
      ('anon', format('SELECT public.rpc_hr_convite_admissao_submeter(%L, %L, %L::jsonb, %L, NULL, NULL)', v_token, v_sessao, '{}', 'X')),
      ('authenticated', format('SELECT public.rpc_hr_convite_admissao_submeter(%L, %L, %L::jsonb, %L, NULL, NULL)', v_token, v_sessao, '{}', 'X'))
    ) AS x(papel, sql)
  LOOP
    v_estado := NULL; v_msg := NULL;
    EXECUTE format('SET LOCAL ROLE %I', r.papel);
    BEGIN
      EXECUTE r.sql;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    END;
    EXECUTE 'RESET ROLE';
    IF v_estado IS DISTINCT FROM '42501' THEN
      RAISE EXCEPTION 'FALHOU 1: % devia levar 42501 e veio % "%".', r.papel, coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
    END IF;
  END LOOP;

  -- ---- 2-5 e 7: recusas, todas sem escrever ---------------------------------
  -- Primeiro um rascunho valido (caso 3), para os seguintes provarem que nada
  -- mudou.
  v_res := public.rpc_hr_convite_admissao_rascunho(v_token, v_sessao,
             jsonb_build_object('nif', v_nif, 'linha1', 'Rua do Teste 1', 'genero', 'feminino'));
  IF (v_res ->> 'ok') IS DISTINCT FROM 'true' OR (v_res ->> 'guardado_em') IS NULL THEN
    RAISE EXCEPTION 'FALHOU 3: o rascunho valido devolveu %.', v_res;
  END IF;
  IF (SELECT c.rascunho FROM public.pessoas_convites_admissao c WHERE c.id = v_convite)
       IS DISTINCT FROM jsonb_build_object('nif', v_nif, 'linha1', 'Rua do Teste 1', 'genero', 'feminino') THEN
    RAISE EXCEPTION 'FALHOU 3: o rascunho guardado nao e o enviado.';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('2 sem sessao',
       format('SELECT public.rpc_hr_convite_admissao_rascunho(%L, NULL, %L::jsonb)', v_token, '{"linha1":"X"}'),
       'HRA51', 'sessao_ausente'),
      ('2 sessao em formato invalido',
       format('SELECT public.rpc_hr_convite_admissao_rascunho(%L, %L, %L::jsonb)', v_token, 'nao-e-hex', '{"linha1":"X"}'),
       'HRA51', 'sessao_ausente'),
      ('2 sessao de outro',
       format('SELECT public.rpc_hr_convite_admissao_rascunho(%L, %L, %L::jsonb)', v_token, v_outra, '{"linha1":"X"}'),
       'HRA53', 'sessao_substituida'),
      ('2 token desconhecido',
       format('SELECT public.rpc_hr_convite_admissao_rascunho(%L, %L, %L::jsonb)', v_outra, v_sessao, '{"linha1":"X"}'),
       'HRA31', 'nao_encontrado'),
      ('4 niss no rascunho',
       format('SELECT public.rpc_hr_convite_admissao_rascunho(%L, %L, %L::jsonb)', v_token, v_sessao, jsonb_build_object('niss', v_niss)::text),
       'HRA10', 'rascunho_chave_invalida'),
      ('4 iban no rascunho',
       format('SELECT public.rpc_hr_convite_admissao_rascunho(%L, %L, %L::jsonb)', v_token, v_sessao, jsonb_build_object('iban', k_iban)::text),
       'HRA10', 'rascunho_chave_invalida'),
      ('4 conta_numero no rascunho',
       format('SELECT public.rpc_hr_convite_admissao_rascunho(%L, %L, %L::jsonb)', v_token, v_sessao, jsonb_build_object('conta_numero', k_iban)::text),
       'HRA10', 'rascunho_chave_invalida'),
      ('4 chave desconhecida',
       format('SELECT public.rpc_hr_convite_admissao_rascunho(%L, %L, %L::jsonb)', v_token, v_sessao, '{"inventada":"x"}'),
       'HRA10', 'rascunho_chave_invalida'),
      ('4 objecto aninhado',
       format('SELECT public.rpc_hr_convite_admissao_rascunho(%L, %L, %L::jsonb)', v_token, v_sessao, '{"linha1":{"a":1}}'),
       'HRA10', 'rascunho_chave_invalida'),
      ('4 demasiado grande',
       format('SELECT public.rpc_hr_convite_admissao_rascunho(%L, %L, %L::jsonb)', v_token, v_sessao, jsonb_build_object('linha1', repeat('a', 25000))::text),
       'HRA10', 'rascunho_demasiado_grande'),
      ('4 lista em vez de objecto',
       format('SELECT public.rpc_hr_convite_admissao_rascunho(%L, %L, %L::jsonb)', v_token, v_sessao, '[1,2]'),
       'HRA10', 'pedido_invalido'),
      ('7 submeter sem sessao',
       format('SELECT public.rpc_hr_convite_admissao_submeter(%L, NULL, %L::jsonb, %L, NULL, NULL)', v_token, '{}', 'Nome'),
       'HRA51', 'sessao_ausente'),
      ('7 submeter com niss em texto',
       format('SELECT public.rpc_hr_convite_admissao_submeter(%L, %L, %L::jsonb, %L, NULL, NULL)', v_token, v_sessao, jsonb_build_object('niss', v_niss)::text, 'Nome'),
       'HRA10', 'pedido_invalido'),
      ('7 submeter com iban em texto',
       format('SELECT public.rpc_hr_convite_admissao_submeter(%L, %L, %L::jsonb, %L, NULL, NULL)', v_token, v_sessao, jsonb_build_object('iban', k_iban)::text, 'Nome'),
       'HRA10', 'pedido_invalido'),
      ('7 submeter com conta_numero',
       format('SELECT public.rpc_hr_convite_admissao_submeter(%L, %L, %L::jsonb, %L, NULL, NULL)', v_token, v_sessao, jsonb_build_object('conta_numero', k_iban)::text, 'Nome'),
       'HRA10', 'pedido_invalido'),
      ('7 submeter sem assinatura',
       format('SELECT public.rpc_hr_convite_admissao_submeter(%L, %L, %L::jsonb, %L, NULL, NULL)', v_token, v_sessao, '{}', '   '),
       'HRA10', 'pedido_invalido'),
      ('7 submeter com assinatura nula',
       format('SELECT public.rpc_hr_convite_admissao_submeter(%L, %L, %L::jsonb, NULL, NULL, NULL)', v_token, v_sessao, '{}'),
       'HRA10', 'pedido_invalido'),
      ('7 submeter com assinatura de 201',
       format('SELECT public.rpc_hr_convite_admissao_submeter(%L, %L, %L::jsonb, %L, NULL, NULL)', v_token, v_sessao, '{}', repeat('n', 201)),
       'HRA10', 'pedido_invalido'),
      ('7 submeter com lista',
       format('SELECT public.rpc_hr_convite_admissao_submeter(%L, %L, %L::jsonb, %L, NULL, NULL)', v_token, v_sessao, '[]', 'Nome'),
       'HRA10', 'pedido_invalido')
    ) AS x(nome, sql, sqlstate, mensagem)
  LOOP
    v_estado := NULL; v_msg := NULL;
    BEGIN
      EXECUTE r.sql;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    END;
    IF v_estado IS DISTINCT FROM r.sqlstate OR v_msg IS DISTINCT FROM r.mensagem THEN
      RAISE EXCEPTION 'FALHOU %: esperava % "%", veio % "%".',
        r.nome, r.sqlstate, r.mensagem, coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.pessoas_convites_admissao c
              WHERE c.id = v_convite
                AND (c.rascunho IS DISTINCT FROM jsonb_build_object('nif', v_nif, 'linha1', 'Rua do Teste 1', 'genero', 'feminino')
                     OR c.used_at IS NOT NULL OR c.submetido_em IS NOT NULL
                     OR c.estado <> 'em_preenchimento' OR c.assinatura_nome IS NOT NULL)) THEN
    RAISE EXCEPTION 'FALHOU 2/4/7: uma recusa deixou o processo alterado.';
  END IF;

  -- 2. Sessao expirada por inactividade (31 minutos).
  UPDATE public.pessoas_convites_admissao
     SET sessao_ultima_atividade_em = now() - interval '31 minutes',
         sessao_iniciada_em = now() - interval '1 hour'
   WHERE id = v_convite;
  v_estado := NULL; v_msg := NULL;
  BEGIN
    PERFORM public.rpc_hr_convite_admissao_rascunho(v_token, v_sessao, '{"linha1":"X"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  IF v_estado IS DISTINCT FROM 'HRA52' THEN
    RAISE EXCEPTION 'FALHOU 2 sessao expirada: esperava HRA52, veio % "%".', coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
  END IF;

  -- 3. Um rascunho aceite renova a actividade da sessao.
  UPDATE public.pessoas_convites_admissao
     SET sessao_ultima_atividade_em = now() - interval '10 minutes',
         sessao_iniciada_em = now() - interval '20 minutes'
   WHERE id = v_convite;
  PERFORM public.rpc_hr_convite_admissao_rascunho(v_token, v_sessao,
            jsonb_build_object('nif', v_nif, 'linha1', 'Rua do Teste 1', 'genero', 'feminino'));
  SELECT c.sessao_ultima_atividade_em INTO v_ts FROM public.pessoas_convites_admissao c WHERE c.id = v_convite;
  IF v_ts IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'FALHOU 3: o rascunho nao renovou a actividade da sessao.';
  END IF;

  -- ---- 5. Estados fora de preenchimento -------------------------------------
  FOR r IN SELECT * FROM (VALUES ('convidada'), ('submetida')) AS x(estado) LOOP
    UPDATE public.pessoas_convites_admissao SET estado = r.estado WHERE id = v_convite;

    v_estado := NULL; v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_convite_admissao_rascunho(v_token, v_sessao, '{"linha1":"X"}'::jsonb);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    END;
    IF v_estado IS DISTINCT FROM 'HRA38' THEN
      RAISE EXCEPTION 'FALHOU 5 rascunho em %: esperava HRA38, veio % "%".', r.estado, coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
    END IF;

    v_estado := NULL; v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_convite_admissao_submeter(v_token, v_sessao, '{}'::jsonb, 'Nome', NULL, NULL);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    END;
    IF v_estado IS DISTINCT FROM 'HRA38' THEN
      RAISE EXCEPTION 'FALHOU 5 submeter em %: esperava HRA38, veio % "%".', r.estado, coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
    END IF;
  END LOOP;

  -- ---- 6. Devolvida -----------------------------------------------------------
  UPDATE public.pessoas_convites_admissao
     SET estado = 'devolvida',
         devolucao = jsonb_build_object('campos', jsonb_build_object('linha1', 'Morada incompleta'),
                                        'documentos', '[]'::jsonb, 'observacao', 'teste')
   WHERE id = v_convite;

  -- A chave devolvida grava; as outras ficam (merge).
  v_res := public.rpc_hr_convite_admissao_rascunho(v_token, v_sessao, '{"linha1":"Rua Corrigida 2"}'::jsonb);
  IF (SELECT c.rascunho FROM public.pessoas_convites_admissao c WHERE c.id = v_convite)
       IS DISTINCT FROM jsonb_build_object('nif', v_nif, 'linha1', 'Rua Corrigida 2', 'genero', 'feminino') THEN
    RAISE EXCEPTION 'FALHOU 6: em devolvida o rascunho devia ser anterior || enviado.';
  END IF;

  -- O nome do portal vale pelo da ficha.
  PERFORM public.rpc_hr_convite_admissao_rascunho(v_token, v_sessao, '{"morada_linha1":"Rua Corrigida 2"}'::jsonb);

  -- A mesma chave nao devolvida com o mesmo valor passa.
  PERFORM public.rpc_hr_convite_admissao_rascunho(v_token, v_sessao, jsonb_build_object('nif', v_nif));

  -- Chave nao devolvida alterada: HRA47, DETAIL so com nomes.
  v_estado := NULL; v_msg := NULL; v_det := NULL;
  BEGIN
    PERFORM public.rpc_hr_convite_admissao_rascunho(v_token, v_sessao,
              jsonb_build_object('nif', v_nif_mau, 'genero', 'masculino', 'linha1', 'Rua Corrigida 3'));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_det = PG_EXCEPTION_DETAIL;
  END;
  IF v_estado IS DISTINCT FROM 'HRA47' OR v_det IS DISTINCT FROM 'genero,nif' THEN
    RAISE EXCEPTION 'FALHOU 6: esperava HRA47 com DETAIL genero,nif, veio % "%" (%).', coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-'), coalesce(v_det, '-');
  END IF;
  IF (SELECT c.rascunho ->> 'linha1' FROM public.pessoas_convites_admissao c WHERE c.id = v_convite) <> 'Rua Corrigida 2' THEN
    RAISE EXCEPTION 'FALHOU 6: a recusa HRA47 deixou o rascunho alterado.';
  END IF;

  -- Submeter em devolvida com chave nao devolvida: HRA47 antes de escrever.
  v_estado := NULL; v_msg := NULL; v_det := NULL;
  BEGIN
    PERFORM public.rpc_hr_convite_admissao_submeter(v_token, v_sessao,
              jsonb_build_object('morada_linha1', 'Rua Corrigida 2', 'nif', v_nif), 'Nome', NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_det = PG_EXCEPTION_DETAIL;
  END;
  IF v_estado IS DISTINCT FROM 'HRA47' OR v_det IS DISTINCT FROM 'nif' THEN
    RAISE EXCEPTION 'FALHOU 6 submeter: esperava HRA47 com DETAIL nif, veio % "%" (%).', coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-'), coalesce(v_det, '-');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pessoas_convites_admissao c
              WHERE c.id = v_convite AND (c.used_at IS NOT NULL OR c.submetido_em IS NOT NULL OR c.estado <> 'devolvida')) THEN
    RAISE EXCEPTION 'FALHOU 6: o submeter recusado em devolvida deixou o processo alterado.';
  END IF;

  -- De volta ao preenchimento.
  UPDATE public.pessoas_convites_admissao
     SET estado = 'em_preenchimento', devolucao = NULL
   WHERE id = v_convite;

  -- ---- 9 (parte 1). NISS e IBAN no Vault, nunca no rascunho -----------------
  v_res := public.rpc_hr_convite_admissao_sensiveis_gravar(v_token, v_sessao, v_niss, k_iban);
  IF (v_res ->> 'niss_ultimos4') IS DISTINCT FROM right(v_niss, 4)
     OR (v_res ->> 'iban_ultimos4') IS DISTINCT FROM right(k_iban, 4) THEN
    RAISE EXCEPTION 'FALHOU 9: sensiveis_gravar devolveu mascaras inesperadas.';
  END IF;

  v_dados := jsonb_build_object(
    'email_pessoal',                 'teste.pf1.' || left(v_tag, 8) || '@exemplo.pt',
    'data_nascimento',               '1990-05-17',
    'genero',                        'feminino',
    'nacionalidade',                 'pt',
    'telefone_pessoal',              '+351912345678',
    'estado_civil',                  'solteiro',
    'dependentes',                   0,
    'dependentes_deficientes',       0,
    'conjuge_situacao_profissional', NULL,
    'naturalidade_freguesia',        'Santa Maria Maior',
    'naturalidade_concelho',         'Lisboa',
    'naturalidade_pais',             'PT',
    'habilitacao_academica',         'licenciatura',
    'habilitacao_data_conclusao',    '2012-07-15',
    'tipo_documento',                'cartao_cidadao',
    'numero_documento',              '12345678 9ZZ' || (floor(random() * 10))::int::text,
    'validade_documento',            '2031-01-01',
    'nif',                           v_nif_mau,
    'carta_conducao_numero',         NULL,
    'carta_conducao_categorias',     NULL,
    'carta_conducao_validade',       NULL,
    'morada_linha1',                 'Rua do Teste 1',
    'morada_linha2',                 '2 Esq',
    'morada_codigo_postal',          '1100-001',
    'morada_localidade',             'Lisboa',
    'morada_distrito',               'Lisboa',
    'morada_pais',                   'PT',
    'tamanho_cima',                  'm',
    'tamanho_cima_detalhe',          NULL,
    'tamanho_baixo',                 '40',
    'tamanho_baixo_detalhe',         NULL,
    'tamanho_calcado',               '39',
    'tamanho_calcado_detalhe',       NULL,
    'conta_titular',                 'TestePF1 Portal',
    'conta_banco',                   'Banco de Teste',
    'conta_swift',                   k_bic);

  -- ---- 8. Atomicidade: NIF invalido DEPOIS do UPDATE de used_at -------------
  v_estado := NULL; v_msg := NULL;
  BEGIN
    PERFORM public.rpc_hr_convite_admissao_submeter(v_token, v_sessao, v_dados, 'Nome Teste', NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  IF v_estado IS DISTINCT FROM 'HRA11' THEN
    RAISE EXCEPTION 'FALHOU 8: esperava HRA11 nif_invalido, veio % "%".', coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pessoas_convites_admissao c
              WHERE c.id = v_convite
                AND (c.used_at IS NOT NULL OR c.submetido_em IS NOT NULL OR c.portal_encerrado_em IS NOT NULL
                     OR c.estado <> 'em_preenchimento' OR c.rascunho IS NULL OR c.assinatura_nome IS NOT NULL))
     OR EXISTS (SELECT 1 FROM public.pessoas_identificacao i WHERE i.pessoa_id = v_pessoa)
     OR EXISTS (SELECT 1 FROM public.pessoas_convites_admissao_eventos e
                 WHERE e.convite_id = v_convite AND e.acao = 'submetido') THEN
    RAISE EXCEPTION 'FALHOU 8: a recusa depois do UPDATE de used_at deixou alguma coisa escrita.';
  END IF;

  -- ---- 9 (parte 2). Sucesso -------------------------------------------------
  v_dados := v_dados || jsonb_build_object('nif', v_nif);
  v_estado := NULL; v_msg := NULL; v_det := NULL;
  BEGIN
    v_uuid := public.rpc_hr_convite_admissao_submeter(v_token, v_sessao, v_dados,
                '  Nome Teste Portal  ', '203.0.113.7'::inet, 'teste-sql-pf1');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_det = PG_EXCEPTION_DETAIL;
  END;
  IF v_estado IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 9: o submeter completo recusou com % "%" (DETAIL %).', v_estado, v_msg, coalesce(v_det, '-');
  END IF;
  IF v_uuid IS DISTINCT FROM v_pessoa THEN
    RAISE EXCEPTION 'FALHOU 9: o submeter devolveu % em vez do id da pessoa.', v_uuid;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.pessoas_convites_admissao c
                  WHERE c.id = v_convite
                    AND c.estado = 'concluida'
                    AND c.used_at IS NOT NULL
                    AND c.submetido_em IS NOT NULL
                    AND c.portal_encerrado_em IS NOT NULL
                    AND c.rascunho IS NULL
                    AND c.assinatura_nome = 'Nome Teste Portal'
                    AND c.assinatura_ip = '203.0.113.7'::inet
                    AND c.ultima_recusa_codigo IS NULL) THEN
    RAISE EXCEPTION 'FALHOU 9: o processo nao ficou concluido como esperado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pessoas_convites_admissao_eventos e
                  WHERE e.convite_id = v_convite AND e.acao = 'submetido') THEN
    RAISE EXCEPTION 'FALHOU 9: falta o evento submetido.';
  END IF;

  -- NISS na ficha veio do Vault; NIF de p_dados.
  IF NOT EXISTS (SELECT 1 FROM public.pessoas_identificacao i
                  WHERE i.pessoa_id = v_pessoa AND i.niss = v_niss AND i.nif = v_nif) THEN
    RAISE EXCEPTION 'FALHOU 9: o NISS (do Vault) ou o NIF nao ficaram na ficha.';
  END IF;

  -- Conta na ficha: segredo proprio da ficha com o IBAN do staging.
  SELECT s.decrypted_secret INTO v_txt
    FROM public.pessoas_dados_bancarios b
    JOIN vault.decrypted_secrets s ON s.id = b.conta_secret_id
   WHERE b.pessoa_id = v_pessoa
     AND b.conta_ultimos4 = right(k_iban, 4)
     AND b.conta_pais = 'PT'
     AND b.swift = k_bic
     AND b.titular = 'TestePF1 Portal';
  IF v_txt IS DISTINCT FROM k_iban THEN
    RAISE EXCEPTION 'FALHOU 9: a conta da ficha nao tem o IBAN do Vault (ou falta titular/BIC/mascara).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pessoas_dados_bancarios b
               JOIN public.pessoas_convites_admissao c ON c.id = v_convite
              WHERE b.pessoa_id = v_pessoa AND b.conta_secret_id = c.iban_segredo_id) THEN
    RAISE EXCEPTION 'FALHOU 9: a ficha ficou a apontar para o segredo de staging do processo.';
  END IF;

  -- Morada e dados pessoais (amostra).
  IF NOT EXISTS (SELECT 1 FROM public.pessoas_moradas m
                  WHERE m.pessoa_id = v_pessoa AND m.tipo = 'residencia' AND m.linha1 = 'Rua do Teste 1'
                    AND m.codigo_postal = '1100-001' AND m.pais = 'PT')
     OR NOT EXISTS (SELECT 1 FROM public.pessoas_dados_pessoais dp
                     WHERE dp.pessoa_id = v_pessoa AND dp.nacionalidade = 'PT' AND dp.estado_civil = 'solteiro') THEN
    RAISE EXCEPTION 'FALHOU 9: morada ou dados pessoais nao ficaram na ficha.';
  END IF;

  -- ---- 10. Depois de submeter, o portal esta fechado ------------------------
  v_estado := NULL; v_msg := NULL;
  BEGIN
    PERFORM public.rpc_hr_convite_admissao_rascunho(v_token, v_sessao, '{"linha1":"Tarde"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  IF v_estado IS DISTINCT FROM 'HRA02' THEN
    RAISE EXCEPTION 'FALHOU 10 rascunho: esperava HRA02, veio % "%".', coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
  END IF;
  v_estado := NULL; v_msg := NULL;
  BEGIN
    PERFORM public.rpc_hr_convite_admissao_submeter(v_token, v_sessao, v_dados, 'Nome', NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  IF v_estado IS DISTINCT FROM 'HRA02' THEN
    RAISE EXCEPTION 'FALHOU 10 submeter: esperava HRA02, veio % "%".', coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
  END IF;
  IF (SELECT c.rascunho FROM public.pessoas_convites_admissao c WHERE c.id = v_convite) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 10: um rascunho depois de submeter ressuscitou o rascunho.';
  END IF;

  RAISE EXCEPTION 'TESTE_OK: portal fase 1 -- ACL so service_role, sessao exigida (ausente, de outro, expirada), lista branca e tecto antes do CHECK, estados, devolvida com merge e chaves bloqueadas, NISS/IBAN recusados em texto e lidos do Vault, atomicidade depois do used_at, submissao completa com processo concluido e portal fechado. Tudo revertido.';
END;
$teste$;
