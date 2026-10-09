-- ==============================================================================
-- Fim de contrato (4/6): as funcoes auxiliares e as RPCs do RESPONSAVEL DIRECTO.
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO (o ecra do responsavel: lista de quem lhe reporta com
-- contrato a terminar e as tres respostas). Depende de 20261210340000 e entra no
-- mesmo commit que os ecras.
--
--
-- -- O PRINCIPIO ---------------------------------------------------------------
--
-- O responsavel directo (pessoas.reporta_a_pessoa_id) NAO renova nada e NAO ganha
-- leitura da ficha. So INDICA, por ciclo de contrato, uma de tres respostas:
-- pretendo_continuar, nao_pretendo_continuar ou ainda_por_decidir. A indicacao vai
-- para o RH (tabela hr_contrato_indicacoes e uma notificacao). Quem decide e
-- executa e o RH, pelas RPCs da migration 360000.
--
-- As duas RPCs abaixo sao SECURITY DEFINER e leem e devolvem so o MINIMO: nome da
-- pessoa, tipo de contrato, data de fim e estado da indicacao. O responsavel e
-- verificado pela cadeia: a pessoa ligada a conta de quem chama (pessoas_contas,
-- via hr_pessoa_do_utilizador) tem de ser o reporta_a_pessoa_id da pessoa do
-- contrato, na organizacao da linha. Qualquer outra coisa: HRV05.
--
--
-- -- O QUE FAZ -----------------------------------------------------------------
--
-- Funcoes INTERNAS (so service_role):
--   hr_contratos_utilizadores_rh(org)       logins com hr.pessoas.vinculos.edit
--                                           (membership activo) = "o RH"
--   hr_contratos_responsavel_user(pessoa, org)  login do responsavel directo (activo,
--                                           com conta activa e membership activo)
--   hr_contratos_notificar(...)             grava uma notificacao da app e resolve a
--                                           anterior do mesmo tipo/contrato/utilizador
--                                           (notifications_dedup)
--   hr_contratos_resolver_avisos(vinculo, motivo, utilizador)  fecha as notificacoes
--   hr_contrato_o_que_acontece(vinculo)     o que acontece no fim do ciclo, por
--                                           omissao (ver abaixo)
-- RPCs para authenticated:
--   rpc_hr_contratos_do_responsavel(p_organization_id)
--   rpc_hr_contrato_indicar(p_vinculo_id, p_resposta)
--
-- hr_contrato_o_que_acontece devolve: desligado (a organizacao nao ligou a
-- funcionalidade), termina (o RH decidiu), decisao_rh (nada acontece sozinho),
-- renova_automaticamente, converte_sem_termo.
--
--
-- -- A LER COM ATENCAO ANTES DO PUSH -------------------------------------------
--
-- a) Notificacoes: type hr_contrato_fim (avisos) e hr_contrato_indicacao (a
--    indicacao do responsavel, para o RH), entity_type hr_vinculo, entity_id = o
--    contrato, kind alert. O indice notifications_dedup (type, entity_id, user_id)
--    onde is_resolved = false so deixa UMA por contrato e utilizador: o auxiliar
--    resolve a anterior (resolved_reason substituido) antes de inserir.
-- b) Esta migration so se aplica ao branch de RH.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta. A mao: largar as sete funcoes.
--
-- Prerequisitos:
--   20261120090000  pessoas_contas, hr_pessoa_do_utilizador
--   20261210330000  hr_contrato_regra_efectiva
--   20261210340000  hr_contrato_indicacoes
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.hr_contrato_indicacoes') IS NULL OR to_regclass('public.hr_contrato_avisos') IS NULL THEN
    RAISE EXCEPTION 'As tabelas do ciclo nao existem. Aplicar 20261210340000 primeiro.';
  END IF;
  IF to_regprocedure('public.hr_contrato_regra_efectiva(uuid)') IS NULL THEN
    RAISE EXCEPTION 'hr_contrato_regra_efectiva(uuid) nao existe. Aplicar 20261210330000 primeiro.';
  END IF;
  IF to_regprocedure('public.hr_pessoa_do_utilizador(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'hr_pessoa_do_utilizador(uuid, uuid) nao existe.';
  END IF;
  IF to_regclass('public.notifications') IS NULL OR to_regclass('public.anew_memberships') IS NULL THEN
    RAISE EXCEPTION 'notifications e anew_memberships tem de existir.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. Auxiliares internos
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_contratos_utilizadores_rh(p_organization_id uuid)
RETURNS TABLE (auth_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT DISTINCT au.auth_user_id
    FROM public.anew_memberships am
    JOIN public.anew_users au ON au.id = am.user_id
    JOIN public.anew_role_permissions arp
      ON arp.role_id = am.role_id AND arp.permission_code = 'hr.pessoas.vinculos.edit'
   WHERE am.organization_id = p_organization_id
     AND am.status = 'active'
     AND au.auth_user_id IS NOT NULL
$$;

COMMENT ON FUNCTION public.hr_contratos_utilizadores_rh(uuid) IS
'INTERNA. Os logins (auth uid) a quem os avisos de fim de contrato chegam como "o RH": membership activo na organizacao com um papel que tenha hr.pessoas.vinculos.edit (a mesma regra de has_anew_permission_in_org). Desde 20261210350000.';

CREATE OR REPLACE FUNCTION public.hr_contratos_responsavel_user(p_pessoa_id uuid, p_organization_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT au.auth_user_id
    FROM public.pessoas p
    JOIN public.pessoas r
      ON r.id = p.reporta_a_pessoa_id AND r.organization_id = p.organization_id
     AND r.estado_registo = 'activo' AND r.deleted_at IS NULL
    JOIN public.pessoas_contas pc
      ON pc.pessoa_id = r.id AND pc.organization_id = r.organization_id AND pc.estado = 'activa'
    JOIN public.anew_users au ON au.id = pc.anew_user_id
    JOIN public.anew_memberships am
      ON am.user_id = au.id AND am.organization_id = p.organization_id AND am.status = 'active'
   WHERE p.id = p_pessoa_id
     AND p.organization_id = p_organization_id
     AND au.auth_user_id IS NOT NULL
   LIMIT 1
$$;

COMMENT ON FUNCTION public.hr_contratos_responsavel_user(uuid, uuid) IS
'INTERNA. O login (auth uid) do responsavel directo de uma pessoa (pessoas.reporta_a_pessoa_id): ficha activa e nao apagada, conta activa em pessoas_contas e membership activo na organizacao. NULL se nao houver responsavel ou ele nao tiver conta: nesse caso so o RH e avisado. Desde 20261210350000.';

CREATE OR REPLACE FUNCTION public.hr_contratos_notificar(
  p_organization_id uuid,
  p_user_id         uuid,
  p_type            text,
  p_vinculo_id      uuid,
  p_titulo          text,
  p_mensagem        text,
  p_link            text,
  p_data            jsonb,
  p_prioridade      text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- notifications_dedup (type, entity_id, user_id) onde is_resolved = false: resolve
  -- a anterior antes de inserir.
  UPDATE public.notifications n
     SET is_resolved = true, resolved_at = now(), resolved_reason = 'substituido'
   WHERE n.type = p_type AND n.entity_id = p_vinculo_id AND n.user_id = p_user_id AND n.is_resolved = false;

  INSERT INTO public.notifications
    (user_id, type, title, message, link, data, organization_id, entity_type, entity_id, priority, kind)
  VALUES
    (p_user_id, p_type, p_titulo, p_mensagem, p_link, p_data, p_organization_id, 'hr_vinculo', p_vinculo_id,
     coalesce(p_prioridade, 'medium'), 'alert')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.hr_contratos_notificar(uuid, uuid, text, uuid, text, text, text, jsonb, text) IS
'INTERNA. Grava uma notificacao da app (notifications, kind alert, entity_type hr_vinculo, entity_id = o contrato) para um login, depois de resolver (resolved_reason substituido) a anterior nao resolvida do mesmo type, contrato e utilizador, por causa do indice notifications_dedup. Devolve o id da notificacao. Desde 20261210350000.';

CREATE OR REPLACE FUNCTION public.hr_contratos_resolver_avisos(p_vinculo_id uuid, p_motivo text, p_user_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.notifications n
     SET is_resolved = true, resolved_at = now(), resolved_reason = p_motivo
   WHERE n.type IN ('hr_contrato_fim', 'hr_contrato_indicacao')
     AND n.entity_id = p_vinculo_id
     AND n.is_resolved = false
     AND (p_user_id IS NULL OR n.user_id = p_user_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.hr_contratos_resolver_avisos(uuid, text, uuid) IS
'INTERNA. Fecha (is_resolved, com p_motivo em resolved_reason) as notificacoes de fim de contrato e de indicacao ainda abertas de um contrato; com p_user_id so as desse login. Devolve quantas fechou. Usada quando o contrato e renovado, convertido, terminado ou quando o responsavel responde. Desde 20261210350000.';

CREATE OR REPLACE FUNCTION public.hr_contrato_o_que_acontece(p_vinculo_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v     record;
  e     record;
  v_ind text;
BEGIN
  SELECT pv.id, pv.data_fim, pv.fim_decisao, pv.renovavel, pv.renovacoes_realizadas INTO v
    FROM public.pessoas_vinculos pv
   WHERE pv.id = p_vinculo_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO e FROM public.hr_contrato_regra_efectiva(p_vinculo_id);
  IF NOT e.ativo THEN
    RETURN 'desligado';
  END IF;

  IF v.fim_decisao = 'terminar' THEN
    RETURN 'termina';
  END IF;

  SELECT i.resposta INTO v_ind
    FROM public.hr_contrato_indicacoes i
   WHERE i.vinculo_id = v.id AND i.ciclo_fim = v.data_fim
   ORDER BY i.indicada_em DESC, i.id
   LIMIT 1;

  IF v_ind = 'nao_pretendo_continuar' THEN
    RETURN 'decisao_rh';
  END IF;

  IF NOT e.renovacao_automatica OR v.renovavel IS NOT DISTINCT FROM false THEN
    RETURN 'decisao_rh';
  END IF;

  IF v.renovacoes_realizadas < e.max_renovacoes THEN
    RETURN 'renova_automaticamente';
  END IF;

  IF e.ao_atingir_limite = 'converter_sem_termo' THEN
    RETURN 'converte_sem_termo';
  END IF;

  RETURN 'decisao_rh';
END;
$$;

COMMENT ON FUNCTION public.hr_contrato_o_que_acontece(uuid) IS
'INTERNA. O que acontece no fim do ciclo do contrato se ninguem fizer nada: desligado (a organizacao nao ligou a funcionalidade), termina (o RH decidiu deixar terminar), decisao_rh (fica em vigor e o RH decide: sem renovacao automatica, contrato nao renovavel, responsavel indicou nao_pretendo_continuar, ou limite atingido com decisao_manual_rh), renova_automaticamente (ainda ha renovacoes por fazer) ou converte_sem_termo (limite atingido e a regra e converter). A mesma logica da rotina diaria. Desde 20261210350000.';

REVOKE ALL ON FUNCTION public.hr_contratos_utilizadores_rh(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_contratos_utilizadores_rh(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hr_contratos_utilizadores_rh(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_contratos_utilizadores_rh(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.hr_contratos_responsavel_user(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_contratos_responsavel_user(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hr_contratos_responsavel_user(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_contratos_responsavel_user(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.hr_contratos_notificar(uuid, uuid, text, uuid, text, text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_contratos_notificar(uuid, uuid, text, uuid, text, text, text, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.hr_contratos_notificar(uuid, uuid, text, uuid, text, text, text, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_contratos_notificar(uuid, uuid, text, uuid, text, text, text, jsonb, text) TO service_role;
REVOKE ALL ON FUNCTION public.hr_contratos_resolver_avisos(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_contratos_resolver_avisos(uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hr_contratos_resolver_avisos(uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_contratos_resolver_avisos(uuid, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.hr_contrato_o_que_acontece(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_contrato_o_que_acontece(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hr_contrato_o_que_acontece(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_contrato_o_que_acontece(uuid) TO service_role;

-- ==============================================================================
-- 2. RPC: a lista do responsavel directo (o minimo)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_contratos_do_responsavel(p_organization_id uuid)
RETURNS TABLE (
  vinculo_id    uuid,
  pessoa_nome   text,
  tipo_contrato text,
  data_fim      date,
  resposta      text,
  indicada_em   timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_resp  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sem sessao.' USING ERRCODE = 'HRV05';
  END IF;

  -- Quem nao tem ficha ligada a conta nao e responsavel de ninguem: lista vazia.
  v_resp := public.hr_pessoa_do_utilizador(v_uid, p_organization_id);
  IF v_resp IS NULL THEN
    RETURN;
  END IF;

  -- Funcionalidade desligada na organizacao: nada a mostrar.
  IF NOT EXISTS (
    SELECT 1 FROM public.hr_regras_fim_contrato r
     WHERE r.organization_id = p_organization_id AND r.ativo
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT pv.id,
         p.nome_completo,
         pv.tipo_contrato,
         pv.data_fim,
         ind.resposta,
         ind.indicada_em
    FROM public.pessoas p
    JOIN public.pessoas_vinculos pv
      ON pv.pessoa_id = p.id AND pv.organization_id = p.organization_id
    LEFT JOIN LATERAL (
      SELECT i.resposta, i.indicada_em
        FROM public.hr_contrato_indicacoes i
       WHERE i.vinculo_id = pv.id AND i.ciclo_fim = pv.data_fim
       ORDER BY i.indicada_em DESC, i.id
       LIMIT 1
    ) ind ON true
   WHERE p.organization_id = p_organization_id
     AND p.reporta_a_pessoa_id = v_resp
     AND p.estado_registo = 'activo'
     AND p.deleted_at IS NULL
     AND pv.deleted_at IS NULL
     AND pv.estado IN ('activo', 'suspenso')
     AND pv.data_fim IS NOT NULL
     AND pv.tipo_contrato IN ('termo_certo', 'termo_incerto', 'duracao_muito_curta', 'temporario')
   ORDER BY pv.data_fim, p.nome_completo;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_contratos_do_responsavel(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_contratos_do_responsavel(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_contratos_do_responsavel(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_hr_contratos_do_responsavel(uuid) IS
'Os contratos com prazo, em vigor, das pessoas que reportam DIRECTAMENTE a quem chama (a ficha ligada a conta de quem chama, nesta organizacao), com o minimo: vinculo_id, pessoa_nome, tipo_contrato, data_fim e a resposta ja dada neste ciclo (resposta e indicada_em, NULL se ainda nao indicou), do mais proximo do fim para o mais longe. Sem sessao: HRV05. Sem ficha ligada, sem subordinados ou funcionalidade desligada na organizacao: lista vazia. Nao exige permissao de RH nem da acesso a ficha. Desde 20261210350000.';

-- ==============================================================================
-- 3. RPC: o responsavel indica (so indica; nao renova nada)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_contrato_indicar(p_vinculo_id uuid, p_resposta text)
RETURNS TABLE (
  vinculo_id    uuid,
  pessoa_nome   text,
  tipo_contrato text,
  data_fim      date,
  resposta      text,
  indicada_em   timestamptz
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v            record;
  v_resp       uuid;
  v_user       uuid;
  v_ativo      boolean;
  v_nome       text;
  v_nome_resp  text;
  v_agora      timestamptz := now();
  v_texto      text;
  rh           record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sem sessao.' USING ERRCODE = 'HRV05';
  END IF;

  IF p_resposta IS NULL OR p_resposta NOT IN ('pretendo_continuar', 'nao_pretendo_continuar', 'ainda_por_decidir') THEN
    RAISE EXCEPTION 'A resposta tem de ser pretendo_continuar, nao_pretendo_continuar ou ainda_por_decidir.'
      USING ERRCODE = 'HRV08';
  END IF;

  SELECT pv.id, pv.pessoa_id, pv.organization_id, pv.tipo_contrato, pv.estado, pv.data_fim INTO v
    FROM public.pessoas_vinculos pv
   WHERE pv.id = p_vinculo_id AND pv.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sem permissao para indicar sobre este contrato.' USING ERRCODE = 'HRV05';
  END IF;

  -- A cadeia: a ficha de quem chama tem de ser o reporta_a_pessoa_id da pessoa do
  -- contrato, na organizacao da linha, e ambas as fichas activas.
  v_resp := public.hr_pessoa_do_utilizador(v_uid, v.organization_id);
  IF v_resp IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM public.pessoas p
         JOIN public.pessoas r ON r.id = p.reporta_a_pessoa_id AND r.organization_id = p.organization_id
        WHERE p.id = v.pessoa_id AND p.organization_id = v.organization_id
          AND p.reporta_a_pessoa_id = v_resp
          AND p.estado_registo = 'activo' AND p.deleted_at IS NULL
          AND r.estado_registo = 'activo' AND r.deleted_at IS NULL
     ) THEN
    RAISE EXCEPTION 'Sem permissao para indicar sobre este contrato.' USING ERRCODE = 'HRV05';
  END IF;

  SELECT r.ativo INTO v_ativo FROM public.hr_regras_fim_contrato r WHERE r.organization_id = v.organization_id;
  IF NOT FOUND OR NOT v_ativo THEN
    RAISE EXCEPTION 'A funcionalidade de fim de contrato esta desligada nesta organizacao.' USING ERRCODE = 'HRV10';
  END IF;

  IF v.estado NOT IN ('activo', 'suspenso') OR v.data_fim IS NULL
     OR v.tipo_contrato NOT IN ('termo_certo', 'termo_incerto', 'duracao_muito_curta', 'temporario') THEN
    RAISE EXCEPTION 'Este contrato nao tem um fim por indicar (nao esta em vigor, nao tem data de fim ou e de um tipo sem ciclo).'
      USING ERRCODE = 'HRV06';
  END IF;

  SELECT au.id INTO v_user FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;
  SELECT p.nome_completo INTO v_nome FROM public.pessoas p WHERE p.id = v.pessoa_id;
  SELECT p.nome_completo INTO v_nome_resp FROM public.pessoas p WHERE p.id = v_resp;

  INSERT INTO public.hr_contrato_indicacoes
    (organization_id, pessoa_id, vinculo_id, ciclo_fim, resposta, indicada_por_pessoa_id, indicada_por_user_id, indicada_em)
  VALUES
    (v.organization_id, v.pessoa_id, v.id, v.data_fim, p_resposta, v_resp, v_user, v_agora);

  -- Uma resposta definitiva fecha os avisos deste responsavel; "ainda por decidir"
  -- deixa-os abertos.
  IF p_resposta <> 'ainda_por_decidir' THEN
    PERFORM public.hr_contratos_resolver_avisos(v.id, 'respondido', v_uid);
  END IF;

  v_texto := CASE p_resposta
    WHEN 'pretendo_continuar'    THEN 'pretende que continue'
    WHEN 'nao_pretendo_continuar' THEN 'nao pretende que continue'
    ELSE 'ainda nao decidiu'
  END;

  -- A indicacao vai para o RH (notificacao; a indicacao em si fica na tabela).
  FOR rh IN SELECT u.auth_user_id AS uid FROM public.hr_contratos_utilizadores_rh(v.organization_id) u LOOP
    IF rh.uid IS DISTINCT FROM v_uid THEN
      PERFORM public.hr_contratos_notificar(
        v.organization_id, rh.uid, 'hr_contrato_indicacao', v.id,
        'Indicação sobre o fim de contrato',
        coalesce(v_nome_resp, 'O responsável directo') || ' indicou que ' || v_texto || ' em relação a '
          || coalesce(v_nome, 'um colaborador') || ' (o contrato termina a ' || to_char(v.data_fim, 'DD/MM/YYYY') || ').',
        '/rh/pessoas/' || v.pessoa_id::text || '?tab=contratos',
        jsonb_build_object('pessoa_id', v.pessoa_id, 'vinculo_id', v.id, 'ciclo_fim', v.data_fim, 'resposta', p_resposta),
        CASE WHEN p_resposta = 'nao_pretendo_continuar' THEN 'high' ELSE 'medium' END
      );
    END IF;
  END LOOP;

  RETURN QUERY SELECT v.id, v_nome, v.tipo_contrato, v.data_fim, p_resposta, v_agora;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_contrato_indicar(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_contrato_indicar(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_contrato_indicar(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_hr_contrato_indicar(uuid, text) IS
'O RESPONSAVEL DIRECTO indica o que pretende para o fim do ciclo de um contrato: p_resposta = pretendo_continuar | nao_pretendo_continuar | ainda_por_decidir. So indica: nao renova nem termina nada (isso e do RH). Verifica a cadeia (a ficha ligada a conta de quem chama e o reporta_a_pessoa_id da pessoa do contrato, na organizacao da linha). Grava em hr_contrato_indicacoes (com quem e quando), notifica o RH e fecha os avisos deste responsavel quando a resposta e definitiva. Devolve UMA linha com o minimo: vinculo_id, pessoa_nome, tipo_contrato, data_fim, resposta, indicada_em. Erros: HRV05 sem sessao, contrato inexistente ou quem chama nao e responsavel directo; HRV08 resposta invalida; HRV10 funcionalidade desligada; HRV06 contrato sem fim por indicar. Desde 20261210350000.';

-- ==============================================================================
-- Conferir (estrutura): falha o push se algo estiver diferente do esperado.
-- ==============================================================================
DO $conferir$
DECLARE
  v_f text;
BEGIN
  -- As funcoes internas so com service_role.
  FOREACH v_f IN ARRAY ARRAY[
    'public.hr_contratos_utilizadores_rh(uuid)',
    'public.hr_contratos_responsavel_user(uuid, uuid)',
    'public.hr_contratos_notificar(uuid, uuid, text, uuid, text, text, text, jsonb, text)',
    'public.hr_contratos_resolver_avisos(uuid, text, uuid)',
    'public.hr_contrato_o_que_acontece(uuid)'
  ] LOOP
    IF to_regprocedure(v_f) IS NULL THEN
      RAISE EXCEPTION '% nao foi criada.', v_f;
    END IF;
    IF has_function_privilege('anon', v_f, 'EXECUTE') OR has_function_privilege('public', v_f, 'EXECUTE')
       OR has_function_privilege('authenticated', v_f, 'EXECUTE') THEN
      RAISE EXCEPTION '% devia ser so de service_role.', v_f;
    END IF;
    IF NOT has_function_privilege('service_role', v_f, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role devia poder executar %.', v_f;
    END IF;
  END LOOP;

  -- As RPCs: SECURITY DEFINER com search_path fixo, sem anon, com authenticated.
  FOREACH v_f IN ARRAY ARRAY[
    'public.rpc_hr_contratos_do_responsavel(uuid)',
    'public.rpc_hr_contrato_indicar(uuid, text)'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
       WHERE p.oid = to_regprocedure(v_f) AND p.prosecdef
         AND array_to_string(p.proconfig, ',') LIKE '%search_path=%'
    ) THEN
      RAISE EXCEPTION '% devia ser SECURITY DEFINER com search_path fixo.', v_f;
    END IF;
    IF has_function_privilege('anon', v_f, 'EXECUTE') OR has_function_privilege('public', v_f, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon ou PUBLIC conseguem executar %.', v_f;
    END IF;
    IF NOT has_function_privilege('authenticated', v_f, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated devia poder executar %.', v_f;
    END IF;
  END LOOP;

  RAISE NOTICE 'OK: cinco auxiliares internos (so service_role) e duas RPCs do responsavel directo (authenticated, sem anon).';
END;
$conferir$;

-- ==============================================================================
-- Conferir (ao vivo, so na organizacao nike): cria dados de teste e DESFAZ-OS
-- tudo com a sentinela HR900 (a subtransaccao reverte as linhas).
-- ==============================================================================
DO $conferir_vivo$
DECLARE
  v_org_nike  uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  v_cargo     uuid;
  v_chefe     uuid;
  v_pessoa    uuid;
  v_vinculo   uuid;
  v_user_id   uuid;
  v_auth_uid  uuid;
  v_notif1    uuid;
  v_notif2    uuid;
  v_n         integer;
  v_texto     text;
  v_sqlstate  text;
  v_resultado text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = v_org_nike) THEN
    RAISE NOTICE 'Org nike nao encontrada neste ambiente -- o conferir ao vivo do responsavel foi saltado.';
    RETURN;
  END IF;

  BEGIN
    -- Escritas SO na nike (organization_id confirmado acima).
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org_nike, 'TESTE MIGRACAO cargo 20261210350000 ' || gen_random_uuid()::text, 0, 'mensal')
    RETURNING id INTO v_cargo;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org_nike, 'TESTE MIGRACAO', '20261210350000 chefe -- apagar', v_cargo, current_date)
    RETURNING id INTO v_chefe;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao, reporta_a_pessoa_id)
    VALUES (v_org_nike, 'TESTE MIGRACAO', '20261210350000 -- apagar', v_cargo, current_date, v_chefe)
    RETURNING id INTO v_pessoa;

    INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, data_fim, estado)
    VALUES (v_pessoa, v_org_nike, 'termo_certo', current_date, current_date + 20, 'activo')
    RETURNING id INTO v_vinculo;

    -- A funcionalidade ligada na nike (so dentro do teste).
    INSERT INTO public.hr_regras_fim_contrato (organization_id, ativo, renovacao_automatica, max_renovacoes)
    VALUES (v_org_nike, true, true, 1)
    ON CONFLICT (organization_id) DO UPDATE
      SET ativo = true, renovacao_automatica = true, max_renovacoes = 1,
          ao_atingir_limite = 'converter_sem_termo';

    -- 1. O que acontece: ainda ha uma renovacao automatica; sem renovacoes por fazer, converte.
    v_resultado := public.hr_contrato_o_que_acontece(v_vinculo);
    IF v_resultado IS DISTINCT FROM 'renova_automaticamente' THEN
      RAISE EXCEPTION 'Esperava-se renova_automaticamente; foi %.', coalesce(v_resultado, '(nada)') USING ERRCODE = 'HR967';
    END IF;

    PERFORM set_config('hr.vinculo_via_rpc', 'on', true);
    UPDATE public.pessoas_vinculos SET renovacoes_realizadas = 1 WHERE id = v_vinculo;
    PERFORM set_config('hr.vinculo_via_rpc', 'off', true);
    UPDATE public.hr_regras_fim_contrato SET ao_atingir_limite = 'converter_sem_termo' WHERE organization_id = v_org_nike;
    v_resultado := public.hr_contrato_o_que_acontece(v_vinculo);
    IF v_resultado IS DISTINCT FROM 'converte_sem_termo' THEN
      RAISE EXCEPTION 'Esperava-se converte_sem_termo; foi %.', coalesce(v_resultado, '(nada)') USING ERRCODE = 'HR967';
    END IF;

    UPDATE public.hr_regras_fim_contrato SET ao_atingir_limite = 'decisao_manual_rh' WHERE organization_id = v_org_nike;
    v_resultado := public.hr_contrato_o_que_acontece(v_vinculo);
    IF v_resultado IS DISTINCT FROM 'decisao_rh' THEN
      RAISE EXCEPTION 'Esperava-se decisao_rh; foi %.', coalesce(v_resultado, '(nada)') USING ERRCODE = 'HR967';
    END IF;

    -- 2. Notificar resolve a anterior (notifications_dedup) e resolver fecha as abertas.
    v_auth_uid := gen_random_uuid();
    v_notif1 := public.hr_contratos_notificar(v_org_nike, v_auth_uid, 'hr_contrato_fim', v_vinculo, 'Teste 1', 'm1', NULL, '{}'::jsonb, 'medium');
    v_notif2 := public.hr_contratos_notificar(v_org_nike, v_auth_uid, 'hr_contrato_fim', v_vinculo, 'Teste 2', 'm2', NULL, '{}'::jsonb, 'high');
    SELECT count(*) INTO v_n FROM public.notifications
     WHERE type = 'hr_contrato_fim' AND entity_id = v_vinculo AND user_id = v_auth_uid AND is_resolved = false;
    IF v_n <> 1 OR v_notif1 IS NOT DISTINCT FROM v_notif2 THEN
      RAISE EXCEPTION 'Notificar duas vezes devia deixar UMA aberta (a segunda); ha %.', v_n USING ERRCODE = 'HR967';
    END IF;
    SELECT count(*) INTO v_n FROM public.notifications WHERE id = v_notif1 AND is_resolved AND resolved_reason = 'substituido';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'A primeira notificacao devia ficar resolvida com o motivo substituido.' USING ERRCODE = 'HR967';
    END IF;
    v_n := public.hr_contratos_resolver_avisos(v_vinculo, 'teste', NULL);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'hr_contratos_resolver_avisos devia fechar 1 notificacao; fechou %.', v_n USING ERRCODE = 'HR967';
    END IF;

    -- 3. Sem conta ligada ao responsavel, o login do responsavel e NULL.
    IF public.hr_contratos_responsavel_user(v_pessoa, v_org_nike) IS NOT NULL THEN
      RAISE EXCEPTION 'Sem conta ligada ao responsavel o login devia ser NULL.' USING ERRCODE = 'HR967';
    END IF;

    -- 4. As RPCs recusam quem nao e responsavel (utilizador fabricado).
    v_auth_uid := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', v_auth_uid::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth_uid)::text, true);
    v_sqlstate := NULL;
    BEGIN
      PERFORM 1 FROM public.rpc_hr_contrato_indicar(v_vinculo, 'pretendo_continuar');
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
    END;
    IF v_sqlstate IS DISTINCT FROM 'HRV05' THEN
      RAISE EXCEPTION 'rpc_hr_contrato_indicar devia recusar com HRV05 quem nao e responsavel; foi %.', coalesce(v_sqlstate, '(nada)')
        USING ERRCODE = 'HR967';
    END IF;
    IF auth.uid() IS NOT DISTINCT FROM v_auth_uid THEN
      SELECT count(*) INTO v_n FROM public.rpc_hr_contratos_do_responsavel(v_org_nike);
      IF v_n <> 0 THEN
        RAISE EXCEPTION 'Quem nao tem ficha ligada devia receber a lista vazia; recebeu % linha(s).', v_n USING ERRCODE = 'HR967';
      END IF;
    END IF;

    -- 5. Caminho completo, se houver na nike um login activo ainda sem ficha ligada:
    --    liga-se ao chefe fabricado (so dentro do teste) e o chefe indica.
    SELECT au.id, au.auth_user_id INTO v_user_id, v_auth_uid
      FROM public.anew_users au
      JOIN public.anew_memberships am
        ON am.user_id = au.id AND am.organization_id = v_org_nike AND am.status = 'active'
     WHERE au.auth_user_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.pessoas_contas pc
          WHERE pc.anew_user_id = au.id AND pc.organization_id = v_org_nike AND pc.estado = 'activa'
       )
     LIMIT 1;

    IF v_user_id IS NULL THEN
      RAISE NOTICE 'Sem login activo na nike livre para ligar ao chefe fabricado: o passo de indicar foi saltado.';
    ELSE
      INSERT INTO public.pessoas_contas (pessoa_id, organization_id, anew_user_id)
      VALUES (v_chefe, v_org_nike, v_user_id);

      IF public.hr_contratos_responsavel_user(v_pessoa, v_org_nike) IS DISTINCT FROM v_auth_uid THEN
        RAISE EXCEPTION 'hr_contratos_responsavel_user devia devolver o login ligado ao chefe.' USING ERRCODE = 'HR967';
      END IF;

      PERFORM set_config('request.jwt.claim.sub', v_auth_uid::text, true);
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth_uid)::text, true);
      IF auth.uid() IS NOT DISTINCT FROM v_auth_uid THEN
        SELECT count(*) INTO v_n FROM public.rpc_hr_contratos_do_responsavel(v_org_nike) l WHERE l.vinculo_id = v_vinculo;
        IF v_n <> 1 THEN
          RAISE EXCEPTION 'O chefe devia ver o contrato do subordinado na lista; viu % linha(s).', v_n USING ERRCODE = 'HR967';
        END IF;

        SELECT i.resposta INTO v_texto FROM public.rpc_hr_contrato_indicar(v_vinculo, 'nao_pretendo_continuar') i;
        IF v_texto IS DISTINCT FROM 'nao_pretendo_continuar' THEN
          RAISE EXCEPTION 'A indicacao devia devolver a resposta nao_pretendo_continuar; devolveu %.', coalesce(v_texto, '(nada)')
            USING ERRCODE = 'HR967';
        END IF;
        SELECT count(*) INTO v_n FROM public.hr_contrato_indicacoes
         WHERE vinculo_id = v_vinculo AND ciclo_fim = (SELECT pv.data_fim FROM public.pessoas_vinculos pv WHERE pv.id = v_vinculo)
           AND resposta = 'nao_pretendo_continuar' AND indicada_por_pessoa_id = v_chefe;
        IF v_n <> 1 THEN
          RAISE EXCEPTION 'A indicacao devia ficar gravada uma vez; ha %.', v_n USING ERRCODE = 'HR967';
        END IF;

        -- Uma resposta invalida e recusada.
        v_sqlstate := NULL;
        BEGIN
          PERFORM 1 FROM public.rpc_hr_contrato_indicar(v_vinculo, 'renovar');
        EXCEPTION WHEN OTHERS THEN
          v_sqlstate := SQLSTATE;
        END;
        IF v_sqlstate IS DISTINCT FROM 'HRV08' THEN
          RAISE EXCEPTION 'Uma resposta invalida devia dar HRV08; foi %.', coalesce(v_sqlstate, '(nada)') USING ERRCODE = 'HR967';
        END IF;
      ELSE
        RAISE NOTICE 'auth.uid() nao le a variavel de teste neste ambiente: o passo de indicar foi saltado.';
      END IF;
    END IF;

    RAISE EXCEPTION 'teste_hr_contratos_responsavel_20261210350000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: tudo desfeito pela subtransaccao.
    WHEN OTHERS THEN
      RAISE EXCEPTION 'O conferir ao vivo do responsavel falhou -- SQLSTATE %: %', SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'CONFERIR AO VIVO (nike): o que acontece nos tres casos, notificar sem duplicar, resolver, responsavel sem conta, RPCs recusam quem nao e responsavel e (se houver login livre) o caminho completo de indicar. Tudo desfeito.';
END;
$conferir_vivo$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. PRECISA DE CODIGO NOVO: ver o cabecalho; entra no mesmo commit que os ecras.
-- 2. Listar o que esta pendente IMEDIATAMENTE antes do push
--    (supabase migration list --linked). Nunca migration repair.
-- 3. Correr os testes ANTES do push. Depois de aplicada, NAO se volta atras para
--    demonstrar o vermelho.
-- ==============================================================================
