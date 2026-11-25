-- =============================================================================
-- Nome unico da ficha, PARTE 1 de 2 (base PRINCIPAL): coluna, funcoes e RPC.
--
-- Regra do dono: ao editar uma lead ou um cliente escolhe-se se a ficha e
-- PESSOA ou EMPRESA. Empresa -> o nome da ficha e o nome da empresa; Pessoa ->
-- nome + apelido. O nome e um so (display_name) e editar troca-o em todo o lado.
--
-- Esta parte NAO cria nem altera gatilhos: so acrescenta coisas que nada chama
-- sozinho, e e inofensiva aplicada sem a parte 2. O ecra (src/lib/entityKind.ts)
-- funciona so com ela: chama rpc_set_entity_kind, que escreve tipo e nome
-- EXPLICITAMENTE; o display_name muda e os gatilhos do search_text que ja
-- existem (escutam display_name) acompanham. Os gatilhos ficam na parte 2
-- (20261229920000_nome_unico_da_ficha_gatilhos).
--
-- O que faz:
--   1. coluna anew_entities.company_name (opcional, sem default, SEM
--      preenchimento: as fichas existentes ficam com NULL e nenhum nome muda);
--   2. funcoes (revogadas a anon e authenticated):
--        fn_entity_compose_name(tipo, nome, apelido, empresa): a composicao
--          ESTRITA (NULL se nao ha com que compor);
--        fn_entity_display_name(tipo, nome, apelido, empresa, nome_actual):
--          a composicao ou, sem ela, o nome actual;
--        fn_entity_shared_outside_root(ficha): as fichas que a RPC recusa;
--   3. RPC NOVA rpc_set_entity_kind: escolher Pessoa/Empresa no ecra.
--      Nenhuma RPC existente e alterada.
--      DIFERENCA para neg_guardar_identidade_pessoa (base de RH, fluxo do
--      negocio): essa, ao passar a ficha a organizacao, deixa first_name e
--      last_name a NULL. Esta MANTEM-NOS como estao (sao a pessoa de contacto,
--      que ecras de leads/clientes leem, e permitem voltar a Pessoa sem os
--      reescrever); so os substitui se o pedido trouxer valores.
--      Limites como neg_guardar_identidade_pessoa: empresa ate 200 caracteres,
--      nome e apelido ate 100, sem caracteres de controlo.
--
-- SUPOSICAO (so migrations lidas, nao o catalogo do remoto): a coluna, as
-- funcoes e a RPC nao existem la; o db push corre o ficheiro numa transaccao
-- (o SET LOCAL depende disso).
-- Reversao: fora da pasta das migrations (reverter a parte 2 primeiro).
-- =============================================================================

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- 1. Coluna ---------------------------------------------------------------------------
ALTER TABLE public.anew_entities ADD COLUMN company_name text;

COMMENT ON COLUMN public.anew_entities.company_name IS
  'Nome da empresa, quando a ficha e uma Empresa (type = organization): e o display_name. Escreve-se por rpc_set_entity_kind.';

-- 2. Funcoes puras ------------------------------------------------------------------------
-- Espelho em TS: composeEntityName / entityDisplayNameRule (src/lib/entityNameSync.ts).
CREATE FUNCTION public.fn_entity_compose_name(
  p_type text,
  p_first text,
  p_last text,
  p_company text
) RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_type = 'organization' THEN nullif(n.c, '')
    WHEN p_type IS DISTINCT FROM 'person' THEN NULL
    WHEN n.f = '' AND n.l = '' THEN NULL
    WHEN n.f = '' THEN n.l
    WHEN n.l = '' THEN n.f
    WHEN lower(n.f) = lower(n.l) THEN n.f
    WHEN starts_with(lower(n.l), lower(n.f) || ' ') THEN n.l
    WHEN right(lower(n.f), char_length(lower(n.l)) + 1) = ' ' || lower(n.l) THEN n.f
    ELSE n.f || ' ' || n.l
  END
  FROM (
    SELECT
      btrim(regexp_replace(coalesce(p_first, ''),   '[\s\u00a0]+', ' ', 'g'), ' ') AS f,
      btrim(regexp_replace(coalesce(p_last, ''),    '[\s\u00a0]+', ' ', 'g'), ' ') AS l,
      btrim(regexp_replace(coalesce(p_company, ''), '[\s\u00a0]+', ' ', 'g'), ' ') AS c
  ) AS n;
$$;

COMMENT ON FUNCTION public.fn_entity_compose_name(text, text, text, text) IS
  'Composicao estrita do nome: organization = empresa; person = nome + apelido (composeDisplayName); NULL se nao ha com que compor.';

CREATE FUNCTION public.fn_entity_display_name(
  p_type text,
  p_first text,
  p_last text,
  p_company text,
  p_display_name text
) RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT coalesce(public.fn_entity_compose_name(p_type, p_first, p_last, p_company), p_display_name);
$$;

COMMENT ON FUNCTION public.fn_entity_display_name(text, text, text, text, text) IS
  'Nome da ficha: a composicao pelo tipo (fn_entity_compose_name) ou, sem ela, o nome actual.';

REVOKE ALL ON FUNCTION public.fn_entity_compose_name(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_entity_compose_name(text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.fn_entity_display_name(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_entity_display_name(text, text, text, text, text) TO service_role;

-- Fichas que esta RPC NAO pode mudar de tipo/nome:
--   (1) ficha de um UTILIZADOR INTERNO: ha um anew_users com entity_id = ficha
--       e essa conta NAO e a conta de portal desta mesma ficha. Desde
--       20261117010000 dar acesso ao portal liga anew_users.entity_id a ficha
--       do CLIENTE (e client_portal_users guarda a mesma conta, auth_user_id,
--       e a mesma ficha, entity_id). Uma conta com linha em client_portal_users
--       para ESTA ficha e um cliente de portal, nao um utilizador interno, e
--       a ficha continua editavel (como era pelo rpc_update_client);
--   (2) ficha de uma organizacao da plataforma (anew_organizations.entity_id);
--   (3) ficha presente em mais do que uma organizacao-raiz (leads, clientes,
--       contactos, ligacoes, papeis).
CREATE FUNCTION public.fn_entity_shared_outside_root(p_entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.anew_users u
                  WHERE u.entity_id = p_entity_id
                    AND NOT EXISTS (SELECT 1 FROM public.client_portal_users cpu
                                     WHERE cpu.auth_user_id = u.auth_user_id
                                       AND cpu.entity_id = p_entity_id))
      OR EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.entity_id = p_entity_id)
      OR (SELECT count(DISTINCT r.root_id)
            FROM (
              SELECT l.root_organization_id AS root_id FROM public.anew_leads l WHERE l.entity_id = p_entity_id
              UNION ALL
              SELECT c.root_organization_id FROM public.anew_clients c WHERE c.entity_id = p_entity_id
              UNION ALL
              SELECT ct.root_organization_id FROM public.anew_contacts ct WHERE ct.entity_id = p_entity_id
              UNION ALL
              SELECT public.resolve_root_organization_id(ol.organization_id)
                FROM public.anew_entity_org_links ol WHERE ol.entity_id = p_entity_id
              UNION ALL
              SELECT public.resolve_root_organization_id(er.organization_id)
                FROM public.anew_entity_roles er WHERE er.entity_id = p_entity_id
            ) AS r) > 1;
$$;

COMMENT ON FUNCTION public.fn_entity_shared_outside_root(uuid) IS
  'true se a ficha e de um utilizador INTERNO (anew_users sem ser a conta de portal desta ficha em client_portal_users), de uma organizacao da plataforma, ou aparece em mais do que uma organizacao-raiz. Clientes com acesso ao portal NAO contam.';

REVOKE ALL ON FUNCTION public.fn_entity_shared_outside_root(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_entity_shared_outside_root(uuid) TO service_role;

-- 3. RPC: escolher Pessoa ou Empresa ----------------------------------------------------------
-- Permissoes e isolamento: os de rpc_set_entity_primary_email (20261229500000),
-- via fn_assert_can_edit_entity_contacts -- quem pode editar a lead/cliente
-- desta ficha (leads.edit / clients.edit, no ambito) e a ficha no ambito do
-- utilizador; mais a recusa de fichas de utilizadores INTERNOS, de organizacoes
-- da plataforma ou partilhadas com outra organizacao-raiz (ver
-- fn_entity_shared_outside_root; clientes com acesso ao portal continuam
-- editaveis).
-- Empresa: o nome e a empresa; nome/apelido ficam como estao (sao a pessoa de
-- contacto e ha ecras que os leem), ou passam aos do pedido se vierem
-- preenchidos. Pessoa: nome/apelido do pedido (obrigatorio pelo menos um);
-- company_name fica (permite voltar a Empresa), ou passa a do pedido.
-- display_name e escrito EXPLICITAMENTE (o gatilho da parte 2 respeita-o, e
-- sem a parte 2 nada mais o toca).
-- A recusa de permissao de fn_assert_can_edit_entity_contacts fala de
-- «contactos»; aqui troca-se por um texto proprio do tipo.
CREATE FUNCTION public.rpc_set_entity_kind(
  p_entity_id uuid,
  p_type text,
  p_first_name text,
  p_last_name text,
  p_company_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_actor   uuid;
  v_before  public.anew_entities%ROWTYPE;
  v_after   public.anew_entities%ROWTYPE;
  v_first   text := nullif(btrim(regexp_replace(coalesce(p_first_name, ''),   '[\s\u00a0]+', ' ', 'g'), ' '), '');
  v_last    text := nullif(btrim(regexp_replace(coalesce(p_last_name, ''),    '[\s\u00a0]+', ' ', 'g'), ' '), '');
  v_company text := nullif(btrim(regexp_replace(coalesce(p_company_name, ''), '[\s\u00a0]+', ' ', 'g'), ' '), '');
  v_name    text;
  v_org     uuid;
  v_diff    jsonb := '{}'::jsonb;
BEGIN
  IF p_type IS NULL OR p_type NOT IN ('person', 'organization') THEN
    RAISE EXCEPTION 'Tipo de ficha inválido (person ou organization)' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- Como neg_guardar_identidade_pessoa: depois de juntar o espaco, ate 200
  -- (empresa) / 100 (nome, apelido) caracteres e sem caracteres de controlo.
  IF char_length(v_company) > 200 OR v_company ~ '[[:cntrl:]]'
     OR char_length(v_first) > 100 OR v_first ~ '[[:cntrl:]]'
     OR char_length(v_last) > 100 OR v_last ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Valor inválido: nome da empresa (até 200 caracteres) ou nome e apelido (até 100), sem caracteres de controlo'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_type = 'organization' AND v_company IS NULL THEN
    RAISE EXCEPTION 'Nome da empresa obrigatório' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_type = 'person' AND v_first IS NULL AND v_last IS NULL THEN
    RAISE EXCEPTION 'Nome obrigatório' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  BEGIN
    PERFORM public.fn_assert_can_edit_entity_contacts(p_entity_id);
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM LIKE '%contactos%' THEN
      RAISE EXCEPTION 'Sem permissão para mudar o tipo ou o nome desta ficha'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RAISE;
  END;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.anew_entities WHERE id = p_entity_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entidade não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF public.fn_entity_shared_outside_root(p_entity_id) THEN
    RAISE EXCEPTION 'Esta ficha é partilhada com outra organização ou é de um utilizador interno; não pode mudar de tipo aqui'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_type = 'organization' THEN
    v_first := coalesce(v_first, v_before.first_name);
    v_last  := coalesce(v_last, v_before.last_name);
  ELSE
    v_company := coalesce(v_company, v_before.company_name);
  END IF;

  v_name := public.fn_entity_compose_name(p_type, v_first, v_last, v_company);
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Nome obrigatório' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Uma so linha de auditoria (como rpc_update_client).
  PERFORM set_config('app.audit_bypass', 'on', true);

  UPDATE public.anew_entities
     SET type         = p_type,
         first_name   = v_first,
         last_name    = v_last,
         company_name = v_company,
         display_name = v_name,
         updated_at   = now()
   WHERE id = p_entity_id
  RETURNING * INTO v_after;

  IF v_before.type IS DISTINCT FROM v_after.type THEN
    v_diff := v_diff || jsonb_build_object('type', jsonb_build_object('old', to_jsonb(v_before.type), 'new', to_jsonb(v_after.type)));
  END IF;
  IF v_before.display_name IS DISTINCT FROM v_after.display_name THEN
    v_diff := v_diff || jsonb_build_object('display_name', jsonb_build_object('old', to_jsonb(v_before.display_name), 'new', to_jsonb(v_after.display_name)));
  END IF;
  IF v_before.first_name IS DISTINCT FROM v_after.first_name THEN
    v_diff := v_diff || jsonb_build_object('first_name', jsonb_build_object('old', to_jsonb(v_before.first_name), 'new', to_jsonb(v_after.first_name)));
  END IF;
  IF v_before.last_name IS DISTINCT FROM v_after.last_name THEN
    v_diff := v_diff || jsonb_build_object('last_name', jsonb_build_object('old', to_jsonb(v_before.last_name), 'new', to_jsonb(v_after.last_name)));
  END IF;
  IF v_before.company_name IS DISTINCT FROM v_after.company_name THEN
    v_diff := v_diff || jsonb_build_object('company_name', jsonb_build_object('old', to_jsonb(v_before.company_name), 'new', to_jsonb(v_after.company_name)));
  END IF;

  IF v_diff <> '{}'::jsonb THEN
    SELECT x.org_id INTO v_org
      FROM (
        SELECT c.organization_id AS org_id, 1 AS rank FROM public.anew_clients c
         WHERE c.entity_id = p_entity_id
           AND c.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))
        UNION ALL
        SELECT l.organization_id, 2 FROM public.anew_leads l
         WHERE l.entity_id = p_entity_id
           AND l.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))
      ) AS x
     ORDER BY x.rank
     LIMIT 1;

    IF v_org IS NOT NULL THEN
      PERFORM public.fn_manual_audit_log('anew_entities', p_entity_id, v_org, 'UPDATE', v_diff, 'web_app', p_entity_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'entity_id',    v_after.id,
    'type',         v_after.type,
    'display_name', v_after.display_name,
    'first_name',   v_after.first_name,
    'last_name',    v_after.last_name,
    'company_name', v_after.company_name
  );
END;
$function$;

COMMENT ON FUNCTION public.rpc_set_entity_kind(uuid, text, text, text, text) IS
  'Escolhe se a ficha e Pessoa (nome = nome + apelido) ou Empresa (nome = empresa). Devolve a ficha final.';

REVOKE ALL ON FUNCTION public.rpc_set_entity_kind(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_set_entity_kind(uuid, text, text, text, text) TO authenticated;

-- 4. Conferir ---------------------------------------------------------------------------------
DO $$
DECLARE
  v_txt text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'anew_entities'
       AND column_name = 'company_name' AND is_nullable = 'YES' AND column_default IS NULL
  ) THEN
    RAISE EXCEPTION 'CONFERIR: anew_entities.company_name em falta, obrigatoria ou com default';
  END IF;

  -- Esta parte nao cria gatilhos
  IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
              WHERE c.relname::text = 'anew_entities'
                AND t.tgname::text = 'trg_anew_entities_0_display_name') THEN
    RAISE EXCEPTION 'CONFERIR: o gatilho do nome e da parte 2 e ja existe';
  END IF;

  -- Uma so versao de cada funcao nova, com search_path fixo
  SELECT string_agg(p.proname::text || '/' || p.pronargs::text || '/' || p.prosecdef::text, ','
                    ORDER BY p.proname::text COLLATE "C") INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND p.proname::text IN ('fn_entity_compose_name', 'fn_entity_display_name', 'fn_entity_shared_outside_root',
                             'rpc_set_entity_kind')
     AND p.proconfig IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search\_path=%');
  IF v_txt IS DISTINCT FROM 'fn_entity_compose_name/4/false,fn_entity_display_name/5/false,fn_entity_shared_outside_root/1/false,rpc_set_entity_kind/5/true' THEN
    RAISE EXCEPTION 'CONFERIR: funcoes em falta, duplicadas ou sem search_path: %', coalesce(v_txt, '(nenhuma)');
  END IF;

  IF has_function_privilege('anon', 'public.rpc_set_entity_kind(uuid, text, text, text, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.rpc_set_entity_kind(uuid, text, text, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_entity_compose_name(text, text, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_entity_display_name(text, text, text, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_entity_shared_outside_root(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: permissoes das funcoes novas erradas';
  END IF;

  -- Os mesmos casos do teste em TS (entityNameSync.test.ts)
  IF public.fn_entity_compose_name('person', 'Rui', 'Silva', 'EVOLAR LDA') IS DISTINCT FROM 'Rui Silva'
     OR public.fn_entity_compose_name('organization', 'Rui', 'Silva', '  EVOLAR   LDA ') IS DISTINCT FROM 'EVOLAR LDA'
     OR public.fn_entity_compose_name('person', 'Rui' || chr(160) || chr(160) || 'Pedro', 'Silva', NULL) IS DISTINCT FROM 'Rui Pedro Silva'
     OR public.fn_entity_compose_name('person', 'Rui Silva', 'Rui Silva', NULL) IS DISTINCT FROM 'Rui Silva'
     OR public.fn_entity_compose_name('person', 'Rui', 'Rui Silva', NULL) IS DISTINCT FROM 'Rui Silva'
     OR public.fn_entity_compose_name('person', 'Rui Silva', 'silva', NULL) IS DISTINCT FROM 'Rui Silva'
     OR public.fn_entity_compose_name('person', '', NULL, 'X') IS NOT NULL
     OR public.fn_entity_compose_name('organization', 'Ana', NULL, '  ') IS NOT NULL
     OR public.fn_entity_display_name('person', NULL, NULL, NULL, 'EVOLAR LDA') IS DISTINCT FROM 'EVOLAR LDA'
     OR public.fn_entity_display_name('organization', NULL, NULL, NULL, 'Mudar Lda') IS DISTINCT FROM 'Mudar Lda' THEN
    RAISE EXCEPTION 'CONFERIR: regra do nome nao cumpre os casos do desenho';
  END IF;
END $$;
