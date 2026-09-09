-- ==============================================================================
-- Atribui as permissoes de ausencias e de assiduidade ao papel super_admin.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- As migrations 20261121010000 e 20261121140000 criaram 27 codigos novos -- 13
-- de ausencias e 14 de assiduidade -- e, de proposito, nao os atribuiram a papel
-- nenhum. A porta ficou fechada ate alguem a abrir conscientemente.
--
-- Medido no ramo a 9 de setembro de 2026: 13 + 14 no catalogo, ZERO atribuidas
-- ao super_admin. Consequencia pratica: os ecras de ausencias e de assiduidade
-- existem, tem rota e entrada de menu, e sao inalcancaveis -- nem o super_admin
-- os abre. O modulo esta na base e invisivel na aplicacao, tal como aconteceu
-- com hr.pessoas.* antes de 20261120100000.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- O super_admin recebe os 27 codigos, incluindo os marcados perigosos. E a
-- mesma decisao ja tomada em 20261120100000 para as permissoes de pessoas,
-- estendida as que nasceram depois -- e nao uma decisao nova.
--
-- Vale a pena que fique escrito o que ela significa: todo o super_admin, em
-- todas as organizacoes onde tenha associacao activa, passa a poder ver os
-- pedidos de ausencia, os motivos, as justificacoes e o registo de ponto dos
-- trabalhadores dessa organizacao. O motivo de uma ausencia pode ser doenca.
--
-- O que continua a valer, e nao e alterado aqui: has_anew_permission_in_org
-- exige associacao activa NA organizacao. Ter o papel nao basta, e nao ha
-- bypass por codigo de papel dentro da funcao.
--
-- Nenhum outro papel recebe nada. O pessoal de RH e as chefias continuam a
-- precisar de atribuicao explicita no ecra de Papeis.
--
--
-- -- CONTAR CODIGOS, NAO LINHAS ------------------------------------------------
--
-- A verificacao usa count(DISTINCT permission_code). Existe MAIS DE UM papel com
-- o codigo super_admin -- o global (organization_id NULL, is_system) e pelo
-- menos um preso a uma organizacao; producao tinha dois a 9/9/2026, e o ramo
-- tambem. Uma verificacao que contasse linhas devolvia o dobro e abortava um
-- push correcto. Ja aconteceu em 20261120180000.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;
--   DELETE FROM public.anew_role_permissions
--    WHERE (permission_code LIKE 'hr.ausencias%' OR permission_code LIKE 'hr.assiduidade%')
--      AND role_id IN (SELECT id FROM public.anew_roles WHERE code = 'super_admin');
--   ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;
--
--
-- Prerequisitos:
--   20261121010000  catalogo de ausencias
--   20261121140000  catalogo de assiduidade
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_catalogo integer;
  v_papel    integer;
BEGIN
  SELECT count(*) INTO v_catalogo
    FROM public.anew_permissions
   WHERE code LIKE 'hr.ausencias%' OR code LIKE 'hr.assiduidade%';

  IF v_catalogo = 0 THEN
    RAISE EXCEPTION
      'Nao ha permissoes de ausencias nem de assiduidade no catalogo. Aplicar 20261121010000 e 20261121140000 primeiro.';
  END IF;

  SELECT count(*) INTO v_papel
    FROM public.anew_roles
   WHERE code = 'super_admin';

  IF v_papel = 0 THEN
    RAISE EXCEPTION 'Nao existe o papel super_admin. Investigar antes de aplicar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_protect_system_role_perms'
       AND tgrelid = to_regclass('public.anew_role_permissions')
  ) THEN
    RAISE EXCEPTION
      'O trigger trg_protect_system_role_perms nao existe. Esta migracao desactiva-o e reactiva-o; sem ele o estado nao e o esperado.';
  END IF;

  RAISE NOTICE
    'Guardas passadas: % codigos no catalogo, % papel(eis) super_admin.',
    v_catalogo, v_papel;
END;
$guardas$;

-- ---- A atribuicao ----------------------------------------------------------
ALTER TABLE public.anew_role_permissions
  DISABLE TRIGGER trg_protect_system_role_perms;

INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
  FROM public.anew_roles r
 CROSS JOIN public.anew_permissions p
 WHERE r.code = 'super_admin'
   AND (p.code LIKE 'hr.ausencias%' OR p.code LIKE 'hr.assiduidade%')
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions
  ENABLE TRIGGER trg_protect_system_role_perms;

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_catalogo  integer;
  v_atribuido integer;
  v_falta     text;
  v_activo    boolean;
BEGIN
  SELECT count(*) INTO v_catalogo
    FROM public.anew_permissions
   WHERE code LIKE 'hr.ausencias%' OR code LIKE 'hr.assiduidade%';

  SELECT count(DISTINCT rp.permission_code) INTO v_atribuido
    FROM public.anew_role_permissions rp
    JOIN public.anew_roles r ON r.id = rp.role_id
   WHERE r.code = 'super_admin'
     AND (rp.permission_code LIKE 'hr.ausencias%' OR rp.permission_code LIKE 'hr.assiduidade%');

  IF v_atribuido <> v_catalogo THEN
    SELECT string_agg(p.code, ', ' ORDER BY p.code) INTO v_falta
      FROM public.anew_permissions p
     WHERE (p.code LIKE 'hr.ausencias%' OR p.code LIKE 'hr.assiduidade%')
       AND NOT EXISTS (
         SELECT 1
           FROM public.anew_role_permissions rp
           JOIN public.anew_roles r ON r.id = rp.role_id
          WHERE r.code = 'super_admin'
            AND rp.permission_code = p.code
       );

    RAISE EXCEPTION
      'super_admin ficou com % de % codigos. Em falta: %',
      v_atribuido, v_catalogo, coalesce(v_falta, '(nenhum identificado)');
  END IF;

  SELECT tgenabled <> 'D' INTO v_activo
    FROM pg_trigger
   WHERE tgname = 'trg_protect_system_role_perms'
     AND tgrelid = to_regclass('public.anew_role_permissions');

  IF NOT coalesce(v_activo, false) THEN
    RAISE EXCEPTION
      'trg_protect_system_role_perms ficou DESACTIVADO. Reactivar imediatamente: ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;';
  END IF;

  RAISE NOTICE
    'super_admin ficou com os % codigos de ausencias e assiduidade. Nenhum outro papel recebeu nada.',
    v_atribuido;
END;
$conferir$;
