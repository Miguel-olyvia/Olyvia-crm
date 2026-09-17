-- ==============================================================================
-- Atribui a permissao "hr.admissao.obrigatorios.gerir" ao papel super_admin.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- 20261201050000 criou o codigo hr.admissao.obrigatorios.gerir e, de
-- proposito, nao o atribuiu a papel nenhum. Sem esta migracao o ecra
-- /rh/admissao/configuracao existe na base e e inalcancavel -- nem o
-- super_admin o abre. E o mesmo padrao ja seguido em 20261120100000
-- (pessoas.*), 20261121270000 (ausencias/assiduidade), 20261123060000
-- (documentos) e outras -- pedido explicito do utilizador ("vai la atribuir
-- a permissao ao meu papel"), depois de confirmar que o ecra nao aparecia
-- por a permissao nao estar atribuida a papel nenhum.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- O super_admin recebe o codigo. Nenhum outro papel recebe nada -- RH e
-- chefias continuam a precisar de atribuicao explicita no ecra de Papeis.
--
-- has_anew_permission_in_org continua a exigir associacao activa NA
-- organizacao: ter o papel nao basta.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;
--   DELETE FROM public.anew_role_permissions
--    WHERE permission_code = 'hr.admissao.obrigatorios.gerir'
--      AND role_id IN (SELECT id FROM public.anew_roles WHERE code = 'super_admin');
--   ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;
--
--
-- Prerequisitos:
--   20261201050000  catalogo hr.admissao.obrigatorios.gerir
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_catalogo integer;
  v_papel    integer;
BEGIN
  SELECT count(*) INTO v_catalogo
    FROM public.anew_permissions
   WHERE code = 'hr.admissao.obrigatorios.gerir';

  IF v_catalogo <> 1 THEN
    RAISE EXCEPTION 'Esperava-se 1 codigo hr.admissao.obrigatorios.gerir no catalogo, encontraram-se %. Aplicar 20261201050000 primeiro.', v_catalogo;
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

  RAISE NOTICE 'Guardas passadas: % codigo no catalogo, % papel(eis) super_admin.', v_catalogo, v_papel;
END;
$guardas$;

-- ---- A atribuicao ------------------------------------------------------------
ALTER TABLE public.anew_role_permissions
  DISABLE TRIGGER trg_protect_system_role_perms;

INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, 'hr.admissao.obrigatorios.gerir'
  FROM public.anew_roles r
 WHERE r.code = 'super_admin'
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions
  ENABLE TRIGGER trg_protect_system_role_perms;

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_papeis    integer;
  v_atribuido integer;
  v_activo    boolean;
BEGIN
  SELECT count(*) INTO v_papeis
    FROM public.anew_roles
   WHERE code = 'super_admin';

  SELECT count(DISTINCT rp.role_id) INTO v_atribuido
    FROM public.anew_role_permissions rp
    JOIN public.anew_roles r ON r.id = rp.role_id
   WHERE r.code = 'super_admin'
     AND rp.permission_code = 'hr.admissao.obrigatorios.gerir';

  IF v_atribuido <> v_papeis THEN
    RAISE EXCEPTION
      'super_admin ficou atribuido em % de % papeis (um por organizacao). Investigar antes de considerar concluido.',
      v_atribuido, v_papeis;
  END IF;

  SELECT tgenabled <> 'D' INTO v_activo
    FROM pg_trigger
   WHERE tgname = 'trg_protect_system_role_perms'
     AND tgrelid = to_regclass('public.anew_role_permissions');

  IF NOT coalesce(v_activo, false) THEN
    RAISE EXCEPTION
      'trg_protect_system_role_perms ficou DESACTIVADO. Reactivar imediatamente: ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;';
  END IF;

  RAISE NOTICE 'super_admin ficou com hr.admissao.obrigatorios.gerir em % papel(eis). Nenhum outro papel recebeu nada.', v_atribuido;
END;
$conferir$;
