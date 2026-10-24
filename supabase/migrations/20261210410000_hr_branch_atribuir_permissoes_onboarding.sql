-- ==============================================================================
-- 20261210410000_hr_branch_atribuir_permissoes_onboarding.sql
--
-- SO NO BRANCH DE RH: atribui as quatro permissoes hr.onboarding.* (approve,
-- sign_employer, sensitive, restrito) ao papel super_admin.
--
-- FICHEIRO FORA DO REPOSITORIO. Vive em vault/ficheiros/recursos-humanos/
-- so-na-base-de-dev; nunca se copia para supabase/migrations do repositorio nem
-- se aplica a base partilhada ou a producao. A migration 20261210400000 (no
-- repositorio) so cria as permissoes, perigosas e sem papel; este ficheiro e a
-- atribuicao para o branch, para se poder testar a admissao com o super_admin
-- da nike.
--
-- POR APLICAR, DEPOIS de 20261210400000 e ANTES de 20261210420000.
--
--
-- -- PORQUE NAO VAI NO REPOSITORIO ---------------------------------------------
--
-- O papel super_admin e GLOBAL (organization_id nulo, is_system). Uma
-- atribuicao numa migration do repositorio daria as quatro permissoes a todos
-- os super_admin de TODAS as organizacoes numa publicacao futura, Mudelar
-- incluida. Aqui so corre numa base com uma organizacao, a nike.
--
--
-- -- CODIGO QUE ENTRA JUNTO -------------------------------------------------------
--
-- Nenhum. O que o utilizador ve: o super_admin da nike passa a ter as quatro
-- permissoes ligadas no ecra de papeis.
--
--
-- -- ANTES DE APLICAR ----------------------------------------------------------
--
-- 1. Confirmar que o link do supabase aponta ao BRANCH de RH (ref
--    uetjghdkwbywbftedtth). A guarda recusa qualquer base com mais de uma
--    organizacao, ou cuja unica organizacao nao seja a nike, ou sem a semente de
--    teste do branch (papeis teste_rh_*).
-- 2. "supabase migration list --linked" imediatamente antes.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;
--   DELETE FROM public.anew_role_permissions WHERE permission_code IN
--     ('hr.onboarding.approve','hr.onboarding.sign_employer','hr.onboarding.sensitive','hr.onboarding.restrito');
--   ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;
--
--
-- Prerequisitos:
--   20261210400000  hr.onboarding.* no catalogo
--   20261210090000  semente de teste do branch (papeis teste_rh_*)
-- Molde: 20261210380000.
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  c_org_nike constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_orgs     integer;
  v_unica    uuid;
  v_n        integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.anew_permissions
   WHERE code IN ('hr.onboarding.approve', 'hr.onboarding.sign_employer',
                  'hr.onboarding.sensitive', 'hr.onboarding.restrito');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'Faltam permissoes hr.onboarding.* no catalogo (% de 4). Aplicar 20261210400000 primeiro.', v_n;
  END IF;

  SELECT count(*), min(id::text)::uuid INTO v_orgs, v_unica FROM public.anew_organizations;
  IF v_orgs <> 1 THEN
    RAISE EXCEPTION 'ABORTAR: esta base tem % organizacoes. Este ficheiro so se aplica ao branch de RH (uma so organizacao, a nike).', v_orgs;
  END IF;
  IF v_unica IS DISTINCT FROM c_org_nike THEN
    RAISE EXCEPTION 'ABORTAR: a unica organizacao desta base (%) nao e a nike.', v_unica;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_roles WHERE code LIKE 'teste\_rh\_%') THEN
    RAISE EXCEPTION 'ABORTAR: a semente de teste do branch (papeis teste_rh_*) nao esta presente.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_roles WHERE code = 'super_admin') THEN
    RAISE EXCEPTION 'Nao existe o papel super_admin. Investigar antes de aplicar.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_protect_system_role_perms'
       AND tgrelid = to_regclass('public.anew_role_permissions')
  ) THEN
    RAISE EXCEPTION 'O trigger trg_protect_system_role_perms nao existe; o estado nao e o esperado.';
  END IF;
END;
$guardas$;
ALTER TABLE public.anew_role_permissions
  DISABLE TRIGGER trg_protect_system_role_perms;
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
  FROM public.anew_roles r
 CROSS JOIN (VALUES ('hr.onboarding.approve'), ('hr.onboarding.sign_employer'),
                    ('hr.onboarding.sensitive'), ('hr.onboarding.restrito')) AS p(code)
 WHERE r.code = 'super_admin'
ON CONFLICT (role_id, permission_code) DO NOTHING;
ALTER TABLE public.anew_role_permissions
  ENABLE TRIGGER trg_protect_system_role_perms;
-- ---- Conferir ----------------------------------------------------------------
DO $conferir$
DECLARE
  v_codigos  text[] := ARRAY['hr.onboarding.approve', 'hr.onboarding.sign_employer',
                             'hr.onboarding.sensitive', 'hr.onboarding.restrito'];
  v_atribuidos integer;
  v_fora       integer;
  v_activo     boolean;
BEGIN
  SELECT count(DISTINCT rp.permission_code) INTO v_atribuidos
    FROM public.anew_role_permissions rp
    JOIN public.anew_roles r ON r.id = rp.role_id
   WHERE rp.permission_code = ANY (v_codigos) AND r.code = 'super_admin';
  IF v_atribuidos <> 4 THEN
    RAISE EXCEPTION 'O super_admin ficou com % de 4 permissoes hr.onboarding.*.', v_atribuidos;
  END IF;

  SELECT count(*) INTO v_fora
    FROM public.anew_role_permissions rp
    JOIN public.anew_roles r ON r.id = rp.role_id
   WHERE rp.permission_code = ANY (v_codigos) AND r.code IS DISTINCT FROM 'super_admin';
  IF v_fora > 0 THEN
    RAISE EXCEPTION 'hr.onboarding.* esta atribuida a % papel(eis) que nao sao super_admin.', v_fora;
  END IF;

  SELECT tgenabled::text <> 'D' INTO v_activo
    FROM pg_trigger
   WHERE tgname = 'trg_protect_system_role_perms'
     AND tgrelid = to_regclass('public.anew_role_permissions');
  IF NOT coalesce(v_activo, false) THEN
    RAISE EXCEPTION 'trg_protect_system_role_perms ficou DESACTIVADO. Reactivar: ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;';
  END IF;

  RAISE NOTICE 'OK: o super_admin tem as 4 permissoes hr.onboarding.* e mais nenhum papel as tem; o trigger de protecao esta activo. Na nike tem-nas quem tem membership activo com esse papel.';
END;
$conferir$;
