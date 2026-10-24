-- ==============================================================================
-- SO NO BRANCH DE RH: atribui hr.cargos.salario.alterar ao papel super_admin.
--
-- FICHEIRO FORA DO REPOSITORIO. Vive so na pasta rh-push; nunca se copia para
-- supabase/migrations do repositorio nem se aplica a base partilhada. A
-- migration 20261210100000 (no repositorio) so cria a permissao perigosa, sem
-- papel nenhum; este ficheiro e a decisao D1 do Miguel, para o branch: poder
-- testar o ecra "Alterar salario" do cargo.
--
-- POR APLICAR, DEPOIS das cinco 20261210100000 a 20261210140000.
--
--
-- -- ANTES DE APLICAR ----------------------------------------------------------
--
-- 1. Confirmar que o link do supabase aponta ao BRANCH de RH (ref
--    uetjghdkwbywbftedtth) e NAO a base partilhada (tzbfgwpckrfbqcolqxtm).
--    O SQL nao sabe qual e o ref; a guarda abaixo recusa qualquer base que tenha
--    mais do que uma organizacao, ou cuja unica organizacao nao seja a nike, ou
--    sem a semente de teste do branch (papeis teste_rh_*). A base partilhada tem
--    varias organizacoes: aborta.
-- 2. "supabase migration list --linked" imediatamente antes: so podem estar
--    pendentes as cinco do fluxo 2 e este ficheiro.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- hr.cargos.salario.alterar nasce SEM papel (e perigosa: muda o salario de todas
-- as pessoas com um cargo de uma vez). No branch, ninguem a tem, logo o botao
-- "Alterar salario" nunca aparece e nao se pode testar.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- O papel super_admin recebe hr.cargos.salario.alterar. Nenhum outro papel recebe
-- nada. Molde: 20261207020300 (hr_atribuir_vencimento_super_admin): o trigger de
-- protecao dos papeis de sistema e desligado so em volta do INSERT (so esse
-- trigger, com nome) e o conferir exige que fique ligado. Como o ficheiro so
-- corre numa base com UMA organizacao (a nike), a atribuicao ao papel super_admin
-- (que pode ser o papel global) nao chega a nenhuma organizacao de clientes.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;
--   DELETE FROM public.anew_role_permissions WHERE permission_code = 'hr.cargos.salario.alterar';
--   ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;
--
--
-- Prerequisitos:
--   20261210100000  hr.cargos.salario.alterar no catalogo
--   20261210090000  semente de teste do branch (papeis teste_rh_*)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  c_org_nike constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_orgs     integer;
  v_unica    uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.cargos.salario.alterar') THEN
    RAISE EXCEPTION 'hr.cargos.salario.alterar nao esta no catalogo. Aplicar 20261210100000 primeiro.';
  END IF;

  -- So o branch: UMA organizacao, e e a nike. A base partilhada tem varias.
  SELECT count(*), min(id::text)::uuid INTO v_orgs, v_unica FROM public.anew_organizations;
  IF v_orgs <> 1 THEN
    RAISE EXCEPTION 'ABORTAR: esta base tem % organizacoes. Este ficheiro so se aplica ao branch de RH (uma so organizacao, a nike). Confirmar o ref do link antes de continuar.', v_orgs;
  END IF;
  IF v_unica IS DISTINCT FROM c_org_nike THEN
    RAISE EXCEPTION 'ABORTAR: a unica organizacao desta base (%) nao e a nike. Este ficheiro so se aplica ao branch de RH.', v_unica;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_roles WHERE code LIKE 'teste_rh_%') THEN
    RAISE EXCEPTION 'ABORTAR: a semente de teste do branch (papeis teste_rh_*) nao esta presente. Este ficheiro so se aplica ao branch de RH.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_roles WHERE code = 'super_admin') THEN
    RAISE EXCEPTION 'Nao existe o papel super_admin. Investigar antes de aplicar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_protect_system_role_perms'
       AND tgrelid = to_regclass('public.anew_role_permissions')
  ) THEN
    RAISE EXCEPTION
      'O trigger trg_protect_system_role_perms nao existe. Este ficheiro desactiva-o e reactiva-o; sem ele o estado nao e o esperado.';
  END IF;

  RAISE NOTICE 'Guardas passadas: uma so organizacao (a nike), semente do branch presente, papel super_admin presente.';
END;
$guardas$;
ALTER TABLE public.anew_role_permissions
  DISABLE TRIGGER trg_protect_system_role_perms;
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, 'hr.cargos.salario.alterar'
  FROM public.anew_roles r
 WHERE r.code = 'super_admin'
ON CONFLICT (role_id, permission_code) DO NOTHING;
ALTER TABLE public.anew_role_permissions
  ENABLE TRIGGER trg_protect_system_role_perms;
-- ---- Conferir ----------------------------------------------------------------
DO $conferir$
DECLARE
  v_atribuidos integer;
  v_fora       integer;
  v_orgs       integer;
  v_activo     boolean;
BEGIN
  SELECT count(*) INTO v_atribuidos
    FROM public.anew_role_permissions rp
    JOIN public.anew_roles r ON r.id = rp.role_id
   WHERE rp.permission_code = 'hr.cargos.salario.alterar' AND r.code = 'super_admin';
  IF v_atribuidos = 0 THEN
    RAISE EXCEPTION 'Nenhum papel super_admin ficou com hr.cargos.salario.alterar.';
  END IF;

  -- Nenhum outro papel a tem.
  SELECT count(*) INTO v_fora
    FROM public.anew_role_permissions rp
    JOIN public.anew_roles r ON r.id = rp.role_id
   WHERE rp.permission_code = 'hr.cargos.salario.alterar' AND r.code IS DISTINCT FROM 'super_admin';
  IF v_fora > 0 THEN
    RAISE EXCEPTION 'hr.cargos.salario.alterar esta atribuida a % papel(eis) que nao sao super_admin.', v_fora;
  END IF;

  SELECT count(*) INTO v_orgs FROM public.anew_organizations;
  IF v_orgs <> 1 THEN
    RAISE EXCEPTION 'A base tem % organizacoes: o ficheiro so se aplica a uma base de uma so organizacao.', v_orgs;
  END IF;

  SELECT tgenabled <> 'D' INTO v_activo
    FROM pg_trigger
   WHERE tgname = 'trg_protect_system_role_perms'
     AND tgrelid = to_regclass('public.anew_role_permissions');
  IF NOT coalesce(v_activo, false) THEN
    RAISE EXCEPTION
      'trg_protect_system_role_perms ficou DESACTIVADO. Reactivar imediatamente: ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;';
  END IF;

  RAISE NOTICE 'OK: hr.cargos.salario.alterar atribuida a % papel(eis) super_admin e a mais nenhum; o trigger de protecao dos papeis de sistema esta activo.', v_atribuidos;
END;
$conferir$;
