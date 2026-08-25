-- ============================================================================
-- get_permission_scope_context(): devolve numa unica chamada tudo o que
-- usePermissionScope precisa, em vez das 11 queries que o hook fazia.
--
-- PROBLEMA MEDIDO. src/hooks/usePermissionScope.ts resolvia, por instancia:
--   anew_users, anew_memberships (x2), anew_roles (x2), anew_hierarchy,
--   anew_role_permissions, anew_membership_permission_scopes, anew_permissions,
--   organization_teams, organization_team_members
-- em grande parte em cadeia (cada passo espera pelo anterior). Com 29
-- componentes a consumir o hook, isso produzia na pagina de Propostas
-- anew_hierarchy x11 (1746 ms), anew_users x11 (1707 ms),
-- anew_memberships x8 (1014 ms) e anew_roles x7 (888 ms) -- cerca de 2,2 s
-- antes de a pagina pedir os seus proprios dados.
--
-- ESTA FUNCAO E UM COLETOR DE DADOS, NAO UM MOTOR DE DECISAO. Devolve os
-- factos em bruto e NAO decide scopes. Toda a logica de autorizacao continua
-- em TypeScript, onde esta revista e coberta por testes -- em particular o
-- invariante critico:
--
--   os scope overrides sao aplicados APENAS a partir de memberships na
--   organizacao ATIVA. Le-los ao longo da cadeia de ancestrais deixava um
--   scope ORG concedido numa organizacao-mae elevar o acesso em todas as
--   filhas -- a escalada de privilegios entre organizacoes corrigida na base
--   de dados por 20261112120000_scope_resolution_per_org_only.sql e, para
--   propostas, por 20261006010000.
--
-- Por isso `scope_rows` vem com o `organization_id` do membership anexado, e e
-- o cliente que filtra. Assim o invariante permanece onde ha teste que o
-- prove (src/hooks/__tests__/usePermissionScope.orgScope.test.ts) em vez de
-- desaparecer para dentro de SQL onde esse teste nao chega. As linhas
-- devolvidas sao sempre dos proprios memberships do chamador, nunca de
-- terceiros.
--
-- SECURITY INVOKER (o valor por omissao) DE PROPOSITO, e nao SECURITY
-- DEFINER: todas estas tabelas eram lidas pelo cliente com a chave anonima,
-- logo sujeitas ao RLS respetivo. Com SECURITY DEFINER a funcao poderia
-- devolver memberships, papeis ou scopes que o utilizador nao ve hoje, e o
-- resultado alimenta as decisoes de permissao de toda a aplicacao. Mantendo
-- invoker rights, o conjunto devolvido e identico ao que as 11 queries
-- obtinham.
--
-- SEMANTICA REPLICADA do hook, passo por passo:
--   1. anew_user_id: anew_users.id do auth.uid() do chamador.
--   2. is_global_system_admin: existe membership ativo com papel
--      'system_admin' em QUALQUER organizacao. O hook curto-circuita aqui e
--      concede acesso total; mantem-se igual.
--   3. org_chain: organizacao ativa + ancestrais, no maximo 10 saltos (o hook
--      usava um ciclo `for i < 10`). O hook subia com .maybeSingle(), que
--      pressupoe um unico pai por organizacao; confirmado contra a base de
--      dados que nenhuma organizacao tem mais do que um pai, pelo que a CTE
--      recursiva produz exatamente a mesma cadeia. Se vierem a existir
--      hierarquias com multiplos pais, a CTE passa a incluir todos os ramos --
--      registado aqui de proposito, porque nesse cenario o comportamento
--      antigo (parar no erro do .maybeSingle()) nao era desejavel de qualquer
--      forma e a regra a seguir teria de ser decidida.
--   4. memberships: ativos do utilizador nas organizacoes da cadeia, com o
--      role_code ja resolvido (poupa a query a anew_roles).
--   5. role_permissions: permissoes dos papeis desses memberships, ao longo
--      da cadeia. A heranca de permissoes pela cadeia e intencional e
--      mantem-se.
--   6. scope_rows: overrides desses memberships, COM organization_id (ver
--      acima).
--   7. binary_permission_codes: das role_permissions, as que tem
--      supports_scope = false.
--   8. team_member_ids: membros das equipas que o utilizador lidera NA
--      organizacao ativa, excluindo o proprio. O hook so as resolvia quando
--      havia scope TEAM; aqui vem sempre, porque poupar um round-trip vale
--      mais do que evitar este agregado, e sao as proprias equipas do
--      chamador.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_permission_scope_context(_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_uid   uuid := auth.uid();
  v_user_id    uuid;
  v_chain      uuid[];
  v_role_ids   uuid[];
  v_perms      text[];
  v_empty      jsonb := jsonb_build_object(
                  'anew_user_id', NULL,
                  'is_global_system_admin', false,
                  'org_chain', '[]'::jsonb,
                  'memberships', '[]'::jsonb,
                  'role_permissions', '[]'::jsonb,
                  'scope_rows', '[]'::jsonb,
                  'binary_permission_codes', '[]'::jsonb,
                  'team_member_ids', '[]'::jsonb
                );
BEGIN
  IF v_auth_uid IS NULL OR _organization_id IS NULL THEN
    RETURN v_empty;
  END IF;

  SELECT au.id INTO v_user_id
  FROM public.anew_users au
  WHERE au.auth_user_id = v_auth_uid
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN v_empty;
  END IF;

  -- 2. Papel global system_admin -> acesso total, como no hook.
  IF EXISTS (
    SELECT 1
    FROM public.anew_memberships m
    JOIN public.anew_roles r ON r.id = m.role_id
    WHERE m.user_id = v_user_id
      AND m.status = 'active'
      AND r.code = 'system_admin'
  ) THEN
    RETURN jsonb_set(
             jsonb_set(v_empty, '{anew_user_id}', to_jsonb(v_user_id)),
             '{is_global_system_admin}', 'true'::jsonb
           );
  END IF;

  -- 3. Cadeia de ancestrais: organizacao ativa + ate 10 saltos acima.
  WITH RECURSIVE chain AS (
    SELECT _organization_id AS org_id, 0 AS depth
    UNION
    SELECT h.parent_org_id, c.depth + 1
    FROM public.anew_hierarchy h
    JOIN chain c ON c.org_id = h.child_org_id
    WHERE c.depth < 10
      AND h.parent_org_id IS NOT NULL
  )
  SELECT array_agg(DISTINCT org_id) INTO v_chain
  FROM chain
  WHERE org_id IS NOT NULL;

  IF v_chain IS NULL OR array_length(v_chain, 1) IS NULL THEN
    v_chain := ARRAY[_organization_id];
  END IF;

  -- 4. Papeis dos memberships ativos na cadeia.
  SELECT array_agg(DISTINCT m.role_id)
  INTO v_role_ids
  FROM public.anew_memberships m
  WHERE m.user_id = v_user_id
    AND m.status = 'active'
    AND m.organization_id = ANY(v_chain)
    AND m.role_id IS NOT NULL;

  -- 5. Permissoes desses papeis, ao longo da cadeia.
  SELECT array_agg(DISTINCT rp.permission_code)
  INTO v_perms
  FROM public.anew_role_permissions rp
  WHERE rp.role_id = ANY(COALESCE(v_role_ids, ARRAY[]::uuid[]));

  RETURN jsonb_build_object(
    'anew_user_id', to_jsonb(v_user_id),
    'is_global_system_admin', false,
    'org_chain', to_jsonb(v_chain),

    'memberships', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', m.id,
               'role_id', m.role_id,
               'organization_id', m.organization_id,
               'role_code', r.code
             ))
      FROM public.anew_memberships m
      LEFT JOIN public.anew_roles r ON r.id = m.role_id
      WHERE m.user_id = v_user_id
        AND m.status = 'active'
        AND m.organization_id = ANY(v_chain)
    ), '[]'::jsonb),

    'role_permissions', COALESCE(to_jsonb(v_perms), '[]'::jsonb),

    -- 6. Overrides COM a organizacao do membership: o cliente filtra pela
    --    organizacao ativa (ver nota no cabecalho).
    'scope_rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'membership_id', s.membership_id,
               'organization_id', m.organization_id,
               'permission_code', s.permission_code,
               'scope_level', s.scope_level
             ))
      FROM public.anew_membership_permission_scopes s
      JOIN public.anew_memberships m ON m.id = s.membership_id
      WHERE m.user_id = v_user_id
        AND m.status = 'active'
        AND m.organization_id = ANY(v_chain)
    ), '[]'::jsonb),

    -- 7. Permissoes binarias (sem suporte de scope) entre as do papel.
    'binary_permission_codes', COALESCE((
      SELECT jsonb_agg(p.code)
      FROM public.anew_permissions p
      WHERE p.code = ANY(COALESCE(v_perms, ARRAY[]::text[]))
        AND p.supports_scope = false
    ), '[]'::jsonb),

    -- 8. Membros das equipas lideradas pelo utilizador na organizacao ativa.
    'team_member_ids', COALESCE((
      SELECT jsonb_agg(DISTINCT tm.user_id)
      FROM public.organization_teams t
      JOIN public.organization_team_members tm ON tm.team_id = t.id
      WHERE t.organization_id = _organization_id
        AND t.leader_id = v_user_id
        AND tm.user_id <> v_user_id
    ), '[]'::jsonb)
  );
END;
$function$;

COMMENT ON FUNCTION public.get_permission_scope_context(uuid) IS
  'Coletor de dados para usePermissionScope: substitui 11 queries por uma. '
  'NAO decide scopes -- devolve factos em bruto, e scope_rows traz o '
  'organization_id para o cliente filtrar pela organizacao ativa, mantendo '
  'esse invariante coberto por teste. SECURITY INVOKER de proposito.';

GRANT EXECUTE ON FUNCTION public.get_permission_scope_context(uuid) TO authenticated;
