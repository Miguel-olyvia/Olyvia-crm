-- =============================================================================
-- 20261225190000_fechar_get_org_group_ids
-- =============================================================================
-- O que estava aberto (lido no remoto a 20/10/2026): get_org_group_ids(uuid),
--   SECURITY DEFINER, com EXECUTE para PUBLIC e anon. Com a chave pública, sem
--   sessão, devolvia os uuid de todas as organizações do grupo de qualquer
--   organização.
-- Quem a chama (remoto e código, 20/10): só funções SECURITY DEFINER do
--   postgres (find_entity_matches nas duas versões, link_entity_to_org), que
--   correm como postgres e não são afectadas. Nenhuma política, vista, Edge
--   Function, ecrã ou página pública (só o tipo gerado em types.ts).
-- A correcção: REVOKE de PUBLIC e anon; EXECUTE fica para authenticated,
--   service_role e o dono; search_path = public, pg_temp. Corpo e assinatura
--   iguais.
-- Não fecha: qualquer authenticated continua a poder perguntar pelo grupo de
--   qualquer organização (só uuid).
-- Não precisa de código novo. Reversão: fora da pasta das migrations.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- CONFERIR (antes): o corpo é o lido no remoto a 20/10.
DO $conferir_antes$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(p.prosrc) INTO v_md5
  FROM pg_catalog.pg_proc p
  WHERE p.oid = pg_catalog.to_regprocedure('public.get_org_group_ids(uuid)');

  IF v_md5 IS NULL THEN
    RAISE EXCEPTION 'CONFERIR: get_org_group_ids não existe no remoto; nada feito.';
  END IF;
  IF v_md5 <> '7dddef305d2a616e27dbee4f2e0631f4' THEN
    RAISE EXCEPTION 'CONFERIR: get_org_group_ids mudou desde 20/10 (md5 %); nada feito.', v_md5;
  END IF;
END
$conferir_antes$;

ALTER FUNCTION public.get_org_group_ids(uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_org_group_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_group_ids(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_org_group_ids(uuid) IS
  'Organizações do grupo de p_org_id (antepassados até à raiz e todos os descendentes). Sem EXECUTE para anon/PUBLIC desde 20261225190000; chamada por funções DEFINER (find_entity_matches, link_entity_to_org).';

-- CONFERIR (depois): permissões, search_path, corpo intacto.
DO $conferir_depois$
DECLARE
  v_oid oid := pg_catalog.to_regprocedure('public.get_org_group_ids(uuid)');
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'CONFERIR: get_org_group_ids desapareceu';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, LATERAL pg_catalog.aclexplode(p.proacl) a
             WHERE p.oid = v_oid AND a.grantee = 0) THEN
    RAISE EXCEPTION 'CONFERIR: get_org_group_ids ainda tem EXECUTE para PUBLIC';
  END IF;
  IF pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: get_org_group_ids ainda é executável por anon';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: get_org_group_ids perdeu EXECUTE para authenticated ou service_role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                 WHERE p.oid = v_oid AND p.prosecdef
                   AND pg_catalog.pg_get_userbyid(p.proowner)::text = 'postgres'
                   AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[]
                   AND md5(p.prosrc) = '7dddef305d2a616e27dbee4f2e0631f4') THEN
    RAISE EXCEPTION 'CONFERIR: get_org_group_ids sem DEFINER do postgres, sem search_path fixo ou com o corpo mudado';
  END IF;
END
$conferir_depois$;

COMMIT;
