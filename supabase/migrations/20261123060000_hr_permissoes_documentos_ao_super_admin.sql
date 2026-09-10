-- ==============================================================================
-- Atribui as 8 permissoes de Documentos e Contratos (RH) ao papel super_admin.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- 20261123010000 criou 8 codigos novos e, de proposito, nao os atribuiu a
-- papel nenhum. Sem esta migracao os ecras de documentos existem na base e
-- sao inalcancaveis -- nem o super_admin os abre. E o mesmo padrao ja seguido
-- em 20261120100000 (pessoas.*) e 20261121270000 (ausencias/assiduidade).
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- O super_admin recebe os 8 codigos, incluindo os marcados perigosos
-- (emitir, anular, conteudo.view). Nenhum outro papel recebe nada -- RH e
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
--    WHERE permission_code LIKE 'hr.pessoas.documentos%'
--      AND role_id IN (SELECT id FROM public.anew_roles WHERE code = 'super_admin');
--   ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;
--
--
-- Prerequisitos:
--   20261123010000  catalogo hr.pessoas.documentos.*
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_catalogo integer;
  v_papel    integer;
BEGIN
  SELECT count(*) INTO v_catalogo
    FROM public.anew_permissions
   WHERE code LIKE 'hr.pessoas.documentos%';

  IF v_catalogo <> 8 THEN
    RAISE EXCEPTION 'Esperavam-se 8 codigos hr.pessoas.documentos.* no catalogo, encontraram-se %. Aplicar 20261123010000 primeiro.', v_catalogo;
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

-- ---- A atribuicao ------------------------------------------------------------
ALTER TABLE public.anew_role_permissions
  DISABLE TRIGGER trg_protect_system_role_perms;

INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
  FROM public.anew_roles r
 CROSS JOIN public.anew_permissions p
 WHERE r.code = 'super_admin'
   AND p.code LIKE 'hr.pessoas.documentos%'
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
   WHERE code LIKE 'hr.pessoas.documentos%';

  SELECT count(DISTINCT rp.permission_code) INTO v_atribuido
    FROM public.anew_role_permissions rp
    JOIN public.anew_roles r ON r.id = rp.role_id
   WHERE r.code = 'super_admin'
     AND rp.permission_code LIKE 'hr.pessoas.documentos%';

  IF v_atribuido <> v_catalogo THEN
    SELECT string_agg(p.code, ', ' ORDER BY p.code) INTO v_falta
      FROM public.anew_permissions p
     WHERE p.code LIKE 'hr.pessoas.documentos%'
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

  RAISE NOTICE 'super_admin ficou com os % codigos de documentos de RH. Nenhum outro papel recebeu nada.', v_atribuido;
END;
$conferir$;
