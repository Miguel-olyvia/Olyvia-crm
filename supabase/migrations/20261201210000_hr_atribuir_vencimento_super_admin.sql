-- ==============================================================================
-- Atribui as 4 permissoes novas de vencimento (codigos de processamento +
-- regras do subsidio de alimentacao) ao papel super_admin.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- 20261201180000 criou 4 codigos novos e, de proposito, nao os atribuiu a
-- papel nenhum. Sem esta migracao o ecra /rh/vencimento/configuracao existe
-- na base e e inalcancavel -- nem o super_admin o abre. Mesmo padrao ja
-- seguido em 20261201120000 (campos obrigatorios de admissao) e outras.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- O super_admin recebe os 4 codigos (view+gerir de codigos, view+gerir de
-- subsidio), incluindo os dois marcados perigosos. Nenhum outro papel recebe
-- nada -- RH continua a precisar de atribuicao explicita no ecra de Papeis.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;
--   DELETE FROM public.anew_role_permissions
--    WHERE permission_code LIKE 'hr.vencimento.%'
--      AND role_id IN (SELECT id FROM public.anew_roles WHERE code = 'super_admin');
--   ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;
--
--
-- Prerequisitos:
--   20261201180000  catalogo hr.vencimento.*
-- ==============================================================================

DO $guardas$
DECLARE
  v_catalogo integer;
  v_papel    integer;
BEGIN
  SELECT count(*) INTO v_catalogo
    FROM public.anew_permissions
   WHERE code LIKE 'hr.vencimento.%';

  IF v_catalogo <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 codigos hr.vencimento.* no catalogo, encontraram-se %. Aplicar 20261201180000 primeiro.', v_catalogo;
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

  RAISE NOTICE 'Guardas passadas: % codigos no catalogo, % papel(eis) super_admin.', v_catalogo, v_papel;
END;
$guardas$;

ALTER TABLE public.anew_role_permissions
  DISABLE TRIGGER trg_protect_system_role_perms;

INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
  FROM public.anew_roles r
 CROSS JOIN public.anew_permissions p
 WHERE r.code = 'super_admin'
   AND p.code LIKE 'hr.vencimento.%'
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions
  ENABLE TRIGGER trg_protect_system_role_perms;

DO $conferir$
DECLARE
  v_catalogo  integer;
  v_atribuido integer;
  v_falta     text;
  v_activo    boolean;
BEGIN
  SELECT count(*) INTO v_catalogo
    FROM public.anew_permissions
   WHERE code LIKE 'hr.vencimento.%';

  SELECT count(DISTINCT rp.permission_code) INTO v_atribuido
    FROM public.anew_role_permissions rp
    JOIN public.anew_roles r ON r.id = rp.role_id
   WHERE r.code = 'super_admin'
     AND rp.permission_code LIKE 'hr.vencimento.%';

  IF v_atribuido <> v_catalogo THEN
    SELECT string_agg(p.code, ', ' ORDER BY p.code) INTO v_falta
      FROM public.anew_permissions p
     WHERE p.code LIKE 'hr.vencimento.%'
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

  RAISE NOTICE 'super_admin ficou com os % codigos de vencimento em cada papel super_admin existente. Nenhum outro papel recebeu nada.', v_atribuido;
END;
$conferir$;
