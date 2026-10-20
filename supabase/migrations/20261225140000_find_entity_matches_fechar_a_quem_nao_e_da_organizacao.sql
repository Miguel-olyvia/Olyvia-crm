-- =============================================================================
-- find_entity_matches: só devolve resultados a quem vê a organização pedida
-- =============================================================================
--
-- O defeito (confirmado ao vivo na nike, 20/10/2026):
--   public.find_entity_matches é SECURITY DEFINER, tinha EXECUTE para PUBLIC,
--   anon, authenticated e service_role, e o ramo scope = 'same_org' compara
--   directamente com o p_org_id recebido, sem confirmar que quem chama vê essa
--   organização. Com a chave pública, sem sessão, p_org_id da nike e um email,
--   devolvia a pessoa (entity_id, primary_org_id/name, display_name).
--   Qualquer utilizador autenticado de outra organização obtinha o mesmo.
--
-- A correcção (mínima, mesmas assinaturas, mesmo corpo):
--   1. Porta no início de cada versão: se quem chama não é service_role e a
--      organização pedida não está em get_user_visible_org_ids(auth.uid()),
--      devolve vazio (não erro: um "não pertence" é indistinguível de "não há
--      duplicado", logo não serve de oráculo de existência).
--      O conjunto usado é o MESMO que a RLS de anew_entity_org_links usa para
--      SELECT — a função nunca devolve mais do que quem chama já podia ler.
--      v_visible já era calculado hoje; a porta só reordena e acrescenta um
--      "= ANY" (medido: custo marginal desprezável, ver registo).
--   2. REVOKE EXECUTE de PUBLIC e anon. O único chamador legítimo
--      (Edge Function find-entity-matches-proxy) chama com o JWT do utilizador
--      (authenticated) ou, no limite, com service_role. Nenhum chamador anónimo.
--   3. search_path = public, pg_temp.
--   O ramo scope = 'group' fica igual: já exigia primary_org_id visível a quem
--   chama (v_visible) e dentro do grupo de p_org_id.
--
-- Chamadores (todos via find-entity-matches-proxy, papel authenticated, com a
-- organização activa do utilizador): AnewLeads, AnewClients, AnewLeadEditDialog,
-- duplicateBlockingRule, groupDuplicateMatches. Nenhuma função da base a chama.
--
-- A versão de 5 argumentos é hoje inalcançável (qualquer chamada com até 5
-- argumentos é ambígua com a de 6, que tem p_nif_hash por omissão: erro 42725),
-- mas é corrigida igualmente para não ficar uma porta aberta adormecida.
--
-- Não precisa de código novo: o proxy já envia o JWT do utilizador.
-- Reversão (repõe o defeito; só em emergência): fora da pasta de migrations.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- -----------------------------------------------------------------------------
-- CONFERIR (antes): o que se substitui e aquilo de que depende está como foi
-- lido no remoto a 20/10/2026. Se alguém mudou alguma destas funções, parar.
-- -----------------------------------------------------------------------------
DO $conferir_antes$
DECLARE
  v_esperado CONSTANT jsonb := jsonb_build_object(
    'public.find_entity_matches(uuid,text,text,text,text,text)', 'da022fd9e06a8d4cbcc6744ecf4305d5',
    'public.find_entity_matches(uuid,text,text,text,text)',      'c5a0f5de080092bc5b1130cb0a1ac199',
    'public.get_user_visible_org_ids(uuid)',                     '08e2e9a384846ff81f65a8a0a1a3b32a',
    'public.get_org_group_ids(uuid)',                            '7dddef305d2a616e27dbee4f2e0631f4',
    'auth.uid()',                                                'cdef18c69c4f4cbbced2eaf81e628b49',
    'auth.role()',                                               'f31486fed08a7402e89d4aa71b0ad273'
  );
  v_assinatura text;
  v_md5_esperado text;
  v_md5_real text;
  v_n_versoes integer;
BEGIN
  FOR v_assinatura, v_md5_esperado IN SELECT key, value #>> '{}' FROM jsonb_each(v_esperado) LOOP
    SELECT md5(p.prosrc) INTO v_md5_real
    FROM pg_catalog.pg_proc p
    WHERE p.oid = pg_catalog.to_regprocedure(v_assinatura);

    IF v_md5_real IS NULL THEN
      RAISE EXCEPTION 'CONFERIR: a função % não existe no remoto', v_assinatura;
    END IF;
    IF v_md5_real <> v_md5_esperado THEN
      RAISE EXCEPTION 'CONFERIR: a função % mudou desde a leitura (md5 % em vez de %)',
        v_assinatura, v_md5_real, v_md5_esperado;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_n_versoes
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'find_entity_matches';

  IF v_n_versoes <> 2 THEN
    RAISE EXCEPTION 'CONFERIR: esperavam-se 2 versões de find_entity_matches, há %', v_n_versoes;
  END IF;
END
$conferir_antes$;

-- -----------------------------------------------------------------------------
-- Versão de 6 argumentos (a que o proxy chama, com p_nif_hash)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_entity_matches(
  p_org_id uuid,
  p_email text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_nif text DEFAULT NULL::text,
  p_country_code text DEFAULT 'PT'::text,
  p_nif_hash text DEFAULT NULL::text
)
RETURNS TABLE(entity_id uuid, scope text, primary_org_id uuid, primary_org_name text, owner_org_accessible boolean, match_field text, display_name text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
declare
  v_email text := nullif(btrim(lower(p_email)), '');
  v_nif text := nullif(btrim(p_nif), '');
  v_nif_hash text := nullif(btrim(p_nif_hash), '');
  v_phone_digits text := nullif(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g'), '');
  v_country text := coalesce(nullif(btrim(p_country_code), ''), 'PT');
  v_visible uuid[];
  v_group uuid[];
  v_is_service boolean;
begin
  if p_org_id is null then return; end if;
  if v_email is null and v_nif is null and v_nif_hash is null and (v_phone_digits is null or length(v_phone_digits) < 7) then
    return;
  end if;

  select array(select public.get_user_visible_org_ids(auth.uid())) into v_visible;

  -- Porta: só quem vê a organização pedida (o mesmo conjunto da RLS de
  -- anew_entity_org_links) ou o service_role. Vazio, não erro: sem oráculo.
  v_is_service := coalesce(auth.role(), '') = 'service_role';
  if not v_is_service and not (p_org_id = ANY(v_visible)) then
    return;
  end if;

  select array(select public.get_org_group_ids(p_org_id)) into v_group;

  return query
  with candidates as (
    -- email match
    select ee.entity_id, 'email'::text as match_field
    from public.anew_entity_emails ee
    where v_email is not null and lower(ee.email) = v_email
    union
    -- nif match: prefer nif_hash (already computed by the caller); fall back
    -- to legacy plaintext compare only while nif_hash is not supplied.
    select aef.entity_id, 'nif'::text
    from public.anew_entity_fiscal_entities aef
    join public.fiscal_entities fe on fe.id = aef.fiscal_entity_id
    where (
      (v_nif_hash is not null and fe.nif_hash = v_nif_hash and fe.country_code = v_country)
      or
      (v_nif_hash is null and v_nif is not null and fe.nif = v_nif and fe.country_code = v_country)
    )
    union
    -- phone match (suffix, min 7 digits)
    select ep.entity_id, 'phone'::text
    from public.anew_entity_phones ep
    where v_phone_digits is not null
      and length(regexp_replace(coalesce(ep.phone_number,''), '[^0-9]', '', 'g')) >= 7
      and (
        regexp_replace(coalesce(ep.phone_number,''), '[^0-9]', '', 'g') like '%' || v_phone_digits
        or v_phone_digits like '%' || regexp_replace(coalesce(ep.phone_number,''), '[^0-9]', '', 'g')
      )
  ),
  primaries as (
    select l.entity_id, l.organization_id as primary_org_id
    from public.anew_entity_org_links l
    where l.is_primary = true
  ),
  enriched as (
    select
      c.entity_id,
      c.match_field,
      p.primary_org_id,
      case
        when exists (select 1 from public.anew_entity_org_links l2
                     where l2.entity_id = c.entity_id and l2.organization_id = p_org_id)
          then 'same_org'
        when p.primary_org_id = ANY(v_group) and p.primary_org_id = ANY(v_visible)
          then 'group'
        else null
      end as scope
    from candidates c
    left join primaries p on p.entity_id = c.entity_id
  ),
  ranked as (
    select
      e.entity_id,
      e.scope,
      e.primary_org_id,
      e.match_field,
      row_number() over (
        partition by e.entity_id
        order by case e.scope when 'same_org' then 1 when 'group' then 2 else 3 end
      ) as rn
    from enriched e
    where e.scope is not null
  )
  select
    r.entity_id,
    r.scope,
    r.primary_org_id,
    org.name as primary_org_name,
    (r.primary_org_id = ANY(v_visible)) as owner_org_accessible,
    r.match_field,
    ent.display_name
  from ranked r
  left join public.anew_organizations org on org.id = r.primary_org_id
  left join public.anew_entities ent on ent.id = r.entity_id
  where r.rn = 1
  limit 50;
end;
$function$;

-- -----------------------------------------------------------------------------
-- Versão de 5 argumentos (legada, hoje inalcançável por ambiguidade)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_entity_matches(
  p_org_id uuid,
  p_email text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_nif text DEFAULT NULL::text,
  p_country_code text DEFAULT 'PT'::text
)
RETURNS TABLE(entity_id uuid, scope text, primary_org_id uuid, primary_org_name text, owner_org_accessible boolean, match_field text, display_name text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
declare
  v_email text := nullif(btrim(lower(p_email)), '');
  v_nif text := nullif(btrim(p_nif), '');
  v_phone_digits text := nullif(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g'), '');
  v_country text := coalesce(nullif(btrim(p_country_code), ''), 'PT');
  v_visible uuid[];
  v_group uuid[];
  v_is_service boolean;
begin
  if p_org_id is null then return; end if;
  if v_email is null and v_nif is null and (v_phone_digits is null or length(v_phone_digits) < 7) then
    return;
  end if;

  select array(select public.get_user_visible_org_ids(auth.uid())) into v_visible;

  -- Porta: só quem vê a organização pedida (o mesmo conjunto da RLS de
  -- anew_entity_org_links) ou o service_role. Vazio, não erro: sem oráculo.
  v_is_service := coalesce(auth.role(), '') = 'service_role';
  if not v_is_service and not (p_org_id = ANY(v_visible)) then
    return;
  end if;

  select array(select public.get_org_group_ids(p_org_id)) into v_group;

  return query
  with candidates as (
    -- email match
    select ee.entity_id, 'email'::text as match_field
    from public.anew_entity_emails ee
    where v_email is not null and lower(ee.email) = v_email
    union
    -- nif match
    select aef.entity_id, 'nif'::text
    from public.anew_entity_fiscal_entities aef
    join public.fiscal_entities fe on fe.id = aef.fiscal_entity_id
    where v_nif is not null and fe.nif = v_nif and fe.country_code = v_country
    union
    -- phone match (suffix, min 7 digits)
    select ep.entity_id, 'phone'::text
    from public.anew_entity_phones ep
    where v_phone_digits is not null
      and length(regexp_replace(coalesce(ep.phone_number,''), '[^0-9]', '', 'g')) >= 7
      and (
        regexp_replace(coalesce(ep.phone_number,''), '[^0-9]', '', 'g') like '%' || v_phone_digits
        or v_phone_digits like '%' || regexp_replace(coalesce(ep.phone_number,''), '[^0-9]', '', 'g')
      )
  ),
  primaries as (
    select l.entity_id, l.organization_id as primary_org_id
    from public.anew_entity_org_links l
    where l.is_primary = true
  ),
  enriched as (
    select
      c.entity_id,
      c.match_field,
      p.primary_org_id,
      case
        when exists (select 1 from public.anew_entity_org_links l2
                     where l2.entity_id = c.entity_id and l2.organization_id = p_org_id)
          then 'same_org'
        when p.primary_org_id = ANY(v_group) and p.primary_org_id = ANY(v_visible)
          then 'group'
        else null
      end as scope
    from candidates c
    left join primaries p on p.entity_id = c.entity_id
  ),
  ranked as (
    select
      e.entity_id,
      e.scope,
      e.primary_org_id,
      e.match_field,
      row_number() over (
        partition by e.entity_id
        order by case e.scope when 'same_org' then 1 when 'group' then 2 else 3 end
      ) as rn
    from enriched e
    where e.scope is not null
  )
  select
    r.entity_id,
    r.scope,
    r.primary_org_id,
    org.name as primary_org_name,
    (r.primary_org_id = ANY(v_visible)) as owner_org_accessible,
    r.match_field,
    ent.display_name
  from ranked r
  left join public.anew_organizations org on org.id = r.primary_org_id
  left join public.anew_entities ent on ent.id = r.entity_id
  where r.rn = 1
  limit 50;
end;
$function$;

-- -----------------------------------------------------------------------------
-- Permissões: fora PUBLIC e anon; ficam authenticated e service_role.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.find_entity_matches(uuid, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.find_entity_matches(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_entity_matches(uuid, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_entity_matches(uuid, text, text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.find_entity_matches(uuid, text, text, text, text, text) IS
  'Detecção de duplicados (email, telefone, nif_hash). Só devolve linhas a quem vê p_org_id (get_user_visible_org_ids, o mesmo conjunto da RLS de anew_entity_org_links) ou ao service_role; aos restantes devolve vazio. Sem EXECUTE para anon/PUBLIC. Chamada pela Edge Function find-entity-matches-proxy com o JWT do utilizador.';
COMMENT ON FUNCTION public.find_entity_matches(uuid, text, text, text, text) IS
  'Versão legada (nif em claro). Inalcançável por ambiguidade com a versão de 6 argumentos; mantém a mesma porta de organização e as mesmas permissões que ela.';

-- -----------------------------------------------------------------------------
-- CONFERIR (depois): porta presente, search_path, SECURITY DEFINER, e
-- permissões exactamente authenticated + service_role (+ dono).
-- -----------------------------------------------------------------------------
DO $conferir_depois$
DECLARE
  v_assinatura text;
  v_oid oid;
BEGIN
  FOREACH v_assinatura IN ARRAY ARRAY[
    'public.find_entity_matches(uuid,text,text,text,text,text)',
    'public.find_entity_matches(uuid,text,text,text,text)'
  ] LOOP
    v_oid := pg_catalog.to_regprocedure(v_assinatura);

    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'CONFERIR: % desapareceu', v_assinatura;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
      WHERE p.oid = v_oid
        AND p.prosecdef
        AND position('v_is_service' in p.prosrc) > 0
        AND position('p_org_id = ANY(v_visible)' in p.prosrc) > 0
        AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[]
    ) THEN
      RAISE EXCEPTION 'CONFERIR: % não ficou com a porta, o search_path ou o SECURITY DEFINER', v_assinatura;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p, LATERAL pg_catalog.aclexplode(p.proacl) a
      WHERE p.oid = v_oid AND a.grantee = 0
    ) THEN
      RAISE EXCEPTION 'CONFERIR: % ainda tem EXECUTE para PUBLIC', v_assinatura;
    END IF;

    IF pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'CONFERIR: % ainda é executável por anon', v_assinatura;
    END IF;

    IF NOT pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE')
       OR NOT pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'CONFERIR: % perdeu EXECUTE para authenticated ou service_role', v_assinatura;
    END IF;
  END LOOP;
END
$conferir_depois$;

COMMIT;
