-- ==============================================================================
-- Repor os tres papeis GLOBAIS: super_admin, system_admin e client.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Medido no ramo de desenvolvimento a 9 de setembro de 2026: 22 papeis, ZERO
-- globais (organization_id IS NULL), ZERO de sistema (is_system), todos de uma
-- so organizacao. Em producao, na mesma data: 258 papeis, 3 globais, 3 de
-- sistema, 77 organizacoes.
--
-- Faltam exactamente tres, e sao os que fazem o sistema de acessos funcionar:
--
--   super_admin   e91ef94e-a5e6-415c-9985-0c2b7594720b  "Dono da org"
--   system_admin  03a43423-9b3c-4640-9dbe-31687f829869  "Equipa tecnica"
--   client        a675c3b3-2d9e-4020-8dcc-b05693942072  "Portal de cliente"
--
-- O QUE ISSO PARTE, e foi diagnosticado ao vivo:
--
-- 1. 19 das 149 memberships apontam para papeis inexistentes -- 19 utilizadores
--    distintos. A causa nao e a membership estar errada: ela referencia o id
--    correcto do papel global. E o papel que desapareceu. Como
--    anew_memberships.role_id NAO tem chave estrangeira, nada impediu que a
--    linha ficasse pendurada.
--
-- 2. Consequencia para cada um desses 19: has_anew_permission junta por
--    role_id, nao encontra linha, e a pessoa fica com ZERO permissoes. O
--    frontend (useClientRole) nao resolve codigo de papel nenhum e cai em
--    "Perfil nao encontrado" -- um ecra de erro, sem pista do que se passa.
--
-- 3. is_system_admin() devolve sempre false: nao ha papeis de sistema na base
--    para ela encontrar.
--
-- 4. Sem o papel client, o login nao consegue distinguir portal de CRM. Essa
--    decisao e tomada exactamente pela presenca desse codigo
--    (src/hooks/useClientRole.ts linhas 105-113), por isso qualquer conta de
--    portal neste ramo resolve tambem para "Perfil nao encontrado".
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Os tres papeis passam a existir, com os MESMOS ids de producao. Os ids sao
-- fixos de proposito: sao eles que as 19 memberships orfas ja referenciam, por
-- isso repor o papel repara as memberships sem lhes tocar. Gerar ids novos
-- obrigaria a reescrever 19 linhas e a adivinhar qual papel cada uma queria.
--
-- Permissoes: em vez de listar as ~300 de cada papel, listam-se as que ele NAO
-- tem em producao, que sao poucas, e concede-se o resto. Assim o ramo fica
-- alinhado com producao sem copiar centenas de linhas, e as permissoes novas
-- (hr.*) entram no super_admin e no system_admin pelo mesmo caminho.
--
-- O papel client fica com ZERO permissoes, como em producao. E identidade
-- externa: nao ha nada no CRM a que deva chegar.
--
--
-- -- O QUE ESTA MIGRACAO NAO FAZ ------------------------------------------------
--
-- - Nao toca em nenhuma membership. Nao e preciso: elas ja apontam para estes
--   ids. Reparam-se por o papel voltar a existir.
-- - Nao apaga o super_admin preso a uma organizacao que existe neste ramo. Nao
--   foi criado por mim e apagar papeis e o que produziu este problema.
-- - Nao mexe nas 6 linhas de anew_role_permissions que apontam para codigos de
--   permissao inexistentes (observadas em producao). E outro defeito, da mesma
--   familia, e nao se resolve as escondidas dentro desta migracao.
-- - Nao cria papeis por organizacao. Esses nascem com a organizacao.
--
--
-- -- SEGURANCA ----------------------------------------------------------------
--
-- Em producao isto e um no-op: os tres papeis ja existem e o ON CONFLICT nao
-- deixa duplicar nem alterar. O unico efeito possivel la e acrescentar ao
-- super_admin e ao system_admin as permissoes hr.*, que e o mesmo que
-- 20261120100000 ja faz e e uma decisao ja tomada.
--
-- O trigger trg_protect_system_role_perms protege as permissoes dos papeis de
-- sistema, por isso desactiva-se em volta do INSERT e reactiva-se logo -- o
-- padrao de 20260630120000_portal_permission_codes.sql linhas 89-100.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. Nao se deve reverter:
-- reverter volta a deixar 19 utilizadores sem acesso.
--
--
-- Prerequisitos:
--   20261120020000  catalogo hr.*
-- ==============================================================================

-- ---- Os papeis -------------------------------------------------------------
INSERT INTO public.anew_roles
  (id, code, name, description, organization_id, is_system, is_default, can_sign_contracts)
VALUES
  ('e91ef94e-a5e6-415c-9985-0c2b7594720b', 'super_admin',  'Super Admin',
   'Dono da org - acesso total nas suas orgs',    NULL, true, false, true),
  ('03a43423-9b3c-4640-9dbe-31687f829869', 'system_admin', 'System Admin',
   'Equipa tecnica - acesso cross-tenant a tudo', NULL, true, false, true),
  ('a675c3b3-2d9e-4020-8dcc-b05693942072', 'client',       'Client',
   'Role para utilizadores do portal de cliente', NULL, true, false, false)
ON CONFLICT (id) DO NOTHING;

-- ---- As permissoes ---------------------------------------------------------
ALTER TABLE public.anew_role_permissions
  DISABLE TRIGGER trg_protect_system_role_perms;

-- super_admin: tudo excepto as 24 que nao tem em producao.
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT 'e91ef94e-a5e6-415c-9985-0c2b7594720b', p.code
  FROM public.anew_permissions p
 WHERE p.code NOT IN (
   'client_contracts.cancel',
   'operations.checklists.manage', 'operations.costs.view',
   'operations.locations.manage', 'operations.locations.view',
   'operations.orders.approve', 'operations.orders.cancel',
   'operations.orders.confirm', 'operations.orders.create',
   'operations.orders.edit', 'operations.orders.execute',
   'operations.orders.view', 'operations.orders.view_all',
   'operations.plans.manage', 'operations.settings.manage', 'operations.view',
   'platform.dashboard.view', 'platform.organizations.manage',
   'platform.organizations.view', 'platform.security.audit',
   'platform.settings.manage', 'platform.users.manage', 'platform.users.view',
   'quotes.view_costs'
 )
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- system_admin: tudo excepto as 15 de operacoes. Ao contrario do super_admin,
-- TEM as platform.* -- e a equipa tecnica da plataforma.
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT '03a43423-9b3c-4640-9dbe-31687f829869', p.code
  FROM public.anew_permissions p
 WHERE p.code NOT IN (
   'operations.checklists.manage', 'operations.costs.view',
   'operations.locations.manage', 'operations.locations.view',
   'operations.orders.approve', 'operations.orders.cancel',
   'operations.orders.confirm', 'operations.orders.create',
   'operations.orders.edit', 'operations.orders.execute',
   'operations.orders.view', 'operations.orders.view_all',
   'operations.plans.manage', 'operations.settings.manage', 'operations.view'
 )
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- client: nenhuma permissao, como em producao. Nao ha INSERT nenhum aqui, e e
-- deliberado -- este comentario existe para que a ausencia seja legivel.

ALTER TABLE public.anew_role_permissions
  ENABLE TRIGGER trg_protect_system_role_perms;

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_globais integer;
  v_orfaos  integer;
  v_sa      integer;
  v_ta      integer;
BEGIN
  SELECT count(*) INTO v_globais
    FROM public.anew_roles
   WHERE organization_id IS NULL
     AND is_system
     AND code IN ('super_admin', 'system_admin', 'client');

  IF v_globais <> 3 THEN
    RAISE EXCEPTION
      'Esperava 3 papeis globais de sistema, encontrei %.', v_globais;
  END IF;

  SELECT count(*) INTO v_sa
    FROM public.anew_role_permissions
   WHERE role_id = 'e91ef94e-a5e6-415c-9985-0c2b7594720b';

  SELECT count(*) INTO v_ta
    FROM public.anew_role_permissions
   WHERE role_id = '03a43423-9b3c-4640-9dbe-31687f829869';

  IF v_sa = 0 OR v_ta = 0 THEN
    RAISE EXCEPTION
      'super_admin ficou com % permissoes e system_admin com %. Nenhum deles pode ficar a zero.',
      v_sa, v_ta;
  END IF;

  SELECT count(*) INTO v_orfaos
    FROM public.anew_memberships m
   WHERE m.role_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.anew_roles r WHERE r.id = m.role_id
     );

  IF v_orfaos > 0 THEN
    RAISE WARNING
      'Ainda ha % memberships a apontar para papeis inexistentes. Repor estes tres nao as cobriu todas -- ha mais papeis apagados.',
      v_orfaos;
  ELSE
    RAISE NOTICE
      'Nenhuma membership ficou a apontar para papel inexistente.';
  END IF;

  RAISE NOTICE
    'Papeis globais repostos. super_admin: % permissoes. system_admin: %. client: 0, por desenho.',
    v_sa, v_ta;
END;
$conferir$;
