-- ==============================================================================
-- Da ao papel global system_admin TODAS as permissoes hr.* que o papel global
-- super_admin tem, e confere que os dois ficam iguais nos codigos hr.%.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A regra do main (20261112060000_grant_all_permissions_system_admin_role,
-- 20261130110000_sync_admin_roles_missing_permissions e as que a mantiveram:
-- 20261201080000, 20261204900000, 20261205000000, 20261205010000,
-- 20261205060000) e que os dois papeis globais -- System Admin
-- (03a43423-9b3c-4640-9dbe-31687f829869) e Super Admin
-- (e91ef94e-a5e6-415c-9985-0c2b7594720b) -- tem as permissoes gravadas
-- EXPLICITAMENTE em anew_role_permissions. O backend (has_anew_permission) da
-- bypass a estes papeis, mas o frontend (src/contexts/PermissionsContext.tsx,
-- hasPermission) NAO: so ve o que estiver gravado.
--
-- As migracoes do RH (000900, 001700, 004800, 010200, 012200, 012400, 012800,
-- 014100, 015200, 015400, 020300, 020400, 020500, 020600) concedem os codigos
-- hr.* apenas ao super_admin. Por cima do main, um System Admin deixaria de
-- ver quase todo o modulo de RH no ecra, apesar de o backend o deixar passar.
--
--
-- -- O QUE FAZ -----------------------------------------------------------------
--
-- Copia para o system_admin, linha a linha, os codigos hr.% que o super_admin
-- GLOBAL (pelo id, nao pelo code -- pode haver papeis super_admin presos a uma
-- organizacao) tem neste momento, desde que o codigo exista no catalogo
-- anew_permissions. Nao usa uma lista fixa nem o catalogo inteiro: a fonte e
-- o que o super_admin efectivamente tem.
--
-- Consequencia deliberada: as permissoes perigosas (is_dangerous), a de saude
-- (hr.pessoas.saude.*) e a de sindicalizacao (hr.pessoas.sindicalizacao.*) so
-- passam para o system_admin SE o super_admin as tiver. Se a decisao de
-- produto em aberto (tirar ao super_admin os dados de saude, sindicalizacao e
-- conta bancaria) for tomada antes desta migracao, ela segue essa decisao sem
-- ser editada -- desde que essa retirada aconteca numa migracao ANTERIOR a
-- esta.
--
-- So insere, nunca apaga. Idempotente: ON CONFLICT DO NOTHING; correr de novo
-- nao duplica nem falha.
--
-- Os triggers de anew_role_permissions (trg_protect_system_role_perms, que
-- recusa escritas em papeis is_system, e trg_audit_anew_role_permissions) sao
-- desligados com DISABLE TRIGGER USER so em volta do INSERT, e o CONFERIR
-- exige que voltem a 'O' -- o mesmo padrao de 20261130110000.
--
--
-- -- O CONFERIR ----------------------------------------------------------------
--
-- Falha (RAISE EXCEPTION, o push aborta) se, nos codigos hr.% do catalogo, os
-- dois papeis ficarem diferentes em QUALQUER sentido -- incluindo codigos que
-- o system_admin tenha e o super_admin nao. Esta migracao nao os apaga: se o
-- push falhar por isso, a diferenca e para decidir a mao, nao para esconder.
--
--
-- -- CODIGO QUE TEM DE ENTRAR JUNTO --------------------------------------------
--
-- Nenhum codigo novo. Mexe so em dados (anew_role_permissions). Faz sentido no
-- mesmo envio que o frontend do modulo de RH, que e quem pede os codigos hr.*;
-- sem esse frontend nao parte nada, so fica sem efeito visivel.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Reversivel, a mao. Sem ficheiro de reversao nesta pasta, de proposito -- se
-- la estivesse, seria aplicado por engano no push seguinte:
--   ALTER TABLE public.anew_role_permissions DISABLE TRIGGER USER;
--   DELETE FROM public.anew_role_permissions
--    WHERE role_id = '03a43423-9b3c-4640-9dbe-31687f829869'
--      AND permission_code LIKE 'hr.%';
--   ALTER TABLE public.anew_role_permissions ENABLE TRIGGER USER;
-- Reverter volta a deixar o System Admin sem o modulo de RH no ecra.
--
--
-- Prerequisitos:
--   todas as concessoes hr.* ao super_admin acima (a ultima e 20261207020600)
--   20261130110000_sync_admin_roles_missing_permissions (main)
-- ==============================================================================

BEGIN;
-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_super_hr integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.anew_roles
     WHERE id = 'e91ef94e-a5e6-415c-9985-0c2b7594720b'
       AND code = 'super_admin'
       AND organization_id IS NULL
       AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'Nao existe o papel global super_admin (e91ef94e-...). Investigar antes de aplicar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.anew_roles
     WHERE id = '03a43423-9b3c-4640-9dbe-31687f829869'
       AND code = 'system_admin'
       AND organization_id IS NULL
       AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'Nao existe o papel global system_admin (03a43423-...). Investigar antes de aplicar.';
  END IF;

  SELECT count(*) INTO v_super_hr
    FROM public.anew_role_permissions rp
    JOIN public.anew_permissions p ON p.code = rp.permission_code
   WHERE rp.role_id = 'e91ef94e-a5e6-415c-9985-0c2b7594720b'
     AND rp.permission_code LIKE 'hr.%';

  IF v_super_hr = 0 THEN
    RAISE EXCEPTION
      'O super_admin global nao tem nenhuma permissao hr.*. As concessoes do RH nao correram antes desta migracao -- nao ha nada para copiar.';
  END IF;

  RAISE NOTICE 'Guardas passadas: super_admin global tem % permissoes hr.*.', v_super_hr;
END;
$guardas$;
-- ---- A copia ---------------------------------------------------------------
ALTER TABLE public.anew_role_permissions DISABLE TRIGGER USER;
INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT '03a43423-9b3c-4640-9dbe-31687f829869'::uuid, rp.permission_code, NULL::uuid
  FROM public.anew_role_permissions rp
  JOIN public.anew_permissions p ON p.code = rp.permission_code
 WHERE rp.role_id = 'e91ef94e-a5e6-415c-9985-0c2b7594720b'
   AND rp.permission_code LIKE 'hr.%'
ON CONFLICT (role_id, permission_code) DO NOTHING;
ALTER TABLE public.anew_role_permissions ENABLE TRIGGER USER;
-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_so_super       text;
  v_so_system      text;
  v_total          integer;
  v_perigosas      integer;
  v_orfas          integer;
  v_trigger_status text;
BEGIN
  -- Codigos hr.% do catalogo que o super_admin tem e o system_admin nao.
  SELECT string_agg(rp.permission_code, ', ' ORDER BY rp.permission_code)
    INTO v_so_super
    FROM public.anew_role_permissions rp
    JOIN public.anew_permissions p ON p.code = rp.permission_code
   WHERE rp.role_id = 'e91ef94e-a5e6-415c-9985-0c2b7594720b'
     AND rp.permission_code LIKE 'hr.%'
     AND NOT EXISTS (
       SELECT 1 FROM public.anew_role_permissions s
        WHERE s.role_id = '03a43423-9b3c-4640-9dbe-31687f829869'
          AND s.permission_code = rp.permission_code
     );

  -- E o contrario: o que o system_admin tem e o super_admin nao.
  SELECT string_agg(rp.permission_code, ', ' ORDER BY rp.permission_code)
    INTO v_so_system
    FROM public.anew_role_permissions rp
    JOIN public.anew_permissions p ON p.code = rp.permission_code
   WHERE rp.role_id = '03a43423-9b3c-4640-9dbe-31687f829869'
     AND rp.permission_code LIKE 'hr.%'
     AND NOT EXISTS (
       SELECT 1 FROM public.anew_role_permissions s
        WHERE s.role_id = 'e91ef94e-a5e6-415c-9985-0c2b7594720b'
          AND s.permission_code = rp.permission_code
     );

  IF v_so_super IS NOT NULL OR v_so_system IS NOT NULL THEN
    RAISE EXCEPTION
      'system_admin e super_admin ficaram diferentes nos codigos hr.*. So no super_admin: %. So no system_admin: %.',
      coalesce(v_so_super, '(nenhum)'), coalesce(v_so_system, '(nenhum)');
  END IF;

  SELECT count(*), count(*) FILTER (WHERE p.is_dangerous)
    INTO v_total, v_perigosas
    FROM public.anew_role_permissions rp
    JOIN public.anew_permissions p ON p.code = rp.permission_code
   WHERE rp.role_id = '03a43423-9b3c-4640-9dbe-31687f829869'
     AND rp.permission_code LIKE 'hr.%';

  -- Linhas hr.% que apontam para codigos fora do catalogo: nao se criam aqui
  -- (a copia junta com anew_permissions), mas avisa-se se existirem.
  SELECT count(*) INTO v_orfas
    FROM public.anew_role_permissions rp
   WHERE rp.role_id IN ('03a43423-9b3c-4640-9dbe-31687f829869',
                        'e91ef94e-a5e6-415c-9985-0c2b7594720b')
     AND rp.permission_code LIKE 'hr.%'
     AND NOT EXISTS (
       SELECT 1 FROM public.anew_permissions p WHERE p.code = rp.permission_code
     );

  IF v_orfas > 0 THEN
    RAISE WARNING
      'Ha % linha(s) hr.* nos dois papeis globais com codigos que ja nao existem no catalogo. Nao foi esta migracao a cria-las.',
      v_orfas;
  END IF;

  SELECT tgenabled INTO v_trigger_status FROM pg_trigger
   WHERE tgrelid = 'public.anew_role_permissions'::regclass
     AND tgname = 'trg_protect_system_role_perms';
  IF v_trigger_status IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION 'trg_protect_system_role_perms nao ficou ativo (tgenabled=%)', v_trigger_status;
  END IF;

  SELECT tgenabled INTO v_trigger_status FROM pg_trigger
   WHERE tgrelid = 'public.anew_role_permissions'::regclass
     AND tgname = 'trg_audit_anew_role_permissions';
  IF v_trigger_status IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION 'trg_audit_anew_role_permissions nao ficou ativo (tgenabled=%)', v_trigger_status;
  END IF;

  RAISE NOTICE
    'system_admin e super_admin iguais nos codigos hr.*: % cada, dos quais % marcados is_dangerous.',
    v_total, v_perigosas;
END;
$conferir$;
COMMIT;
