-- HOTFIX: System Admin e Super Admin ficaram sem várias permissões, incluindo
-- as 2 criadas em 20261130080000 (suppliers.view_sla_report,
-- client_orders.confirm_stock_exit) — sintoma reportado pelo utilizador: o
-- botão "Relatório SLA" desapareceu de Fornecedores para uma conta System
-- Admin.
--
-- Causa raiz: ao contrário do backend (has_anew_permission() dá bypass total
-- a quem tem role code IN ('system_admin','super_admin')), o FRONTEND
-- (src/contexts/PermissionsContext.tsx, hasPermission()) NÃO faz esse bypass
-- por desenho — depende de os 2 papéis terem, em anew_role_permissions,
-- TODAS as permissões existentes gravadas explicitamente (ver
-- 20261112060000_grant_all_permissions_system_admin_role.sql, que só cobriu
-- System Admin, na altura). Sempre que uma permissão nova é criada depois
-- dessa migration, os dois papéis ficam automaticamente em falta — não há
-- nenhum trigger a manter isto sincronizado.
--
-- Confirmado ao vivo antes desta migration: total 324 permissões em
-- anew_permissions; System Admin (03a43423-9b3c-4640-9dbe-31687f829869) só
-- tinha 313 (faltavam 11, incluindo as 2 novas); Super Admin
-- (e91ef94e-a5e6-415c-9985-0c2b7594720b) só tinha 304 (faltavam 20) — ou
-- seja, este gap já existia antes desta sessão, não é só das 2 permissões
-- que criámos hoje.
--
-- CORREÇÃO: sincroniza os 2 papéis com TODAS as permissões existentes agora
-- (não só as 2 novas), mesmo padrão de 20261112060000 — desativa os
-- triggers de proteção/auditoria de papéis de sistema
-- (trg_protect_system_role_perms, trg_audit_anew_role_permissions) só
-- durante este INSERT pontual, insere o que falta com ON CONFLICT DO
-- NOTHING (idempotente), reativa os triggers, e verifica no fim que ambos
-- os papéis ficaram com 100% das permissões e que os 2 triggers voltaram a
-- 'O' (enabled).

BEGIN;

ALTER TABLE public.anew_role_permissions DISABLE TRIGGER USER;

INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT r.role_id, p.code, NULL::uuid
FROM (VALUES
  ('03a43423-9b3c-4640-9dbe-31687f829869'::uuid), -- System Admin
  ('e91ef94e-a5e6-415c-9985-0c2b7594720b'::uuid)  -- Super Admin
) AS r(role_id)
CROSS JOIN public.anew_permissions p
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER USER;

DO $$
DECLARE
  v_missing_system int;
  v_missing_super  int;
  v_trigger_status text;
BEGIN
  SELECT COUNT(*) INTO v_missing_system
  FROM public.anew_permissions p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.anew_role_permissions rp
    WHERE rp.role_id = '03a43423-9b3c-4640-9dbe-31687f829869' AND rp.permission_code = p.code
  );
  IF v_missing_system > 0 THEN
    RAISE EXCEPTION 'System Admin continua sem % permissoes apos a insercao', v_missing_system;
  END IF;

  SELECT COUNT(*) INTO v_missing_super
  FROM public.anew_permissions p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.anew_role_permissions rp
    WHERE rp.role_id = 'e91ef94e-a5e6-415c-9985-0c2b7594720b' AND rp.permission_code = p.code
  );
  IF v_missing_super > 0 THEN
    RAISE EXCEPTION 'Super Admin continua sem % permissoes apos a insercao', v_missing_super;
  END IF;

  SELECT tgenabled INTO v_trigger_status FROM pg_trigger
  WHERE tgrelid = 'public.anew_role_permissions'::regclass AND tgname = 'trg_protect_system_role_perms';
  IF v_trigger_status IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION 'trg_protect_system_role_perms nao ficou ativo (tgenabled=%)', v_trigger_status;
  END IF;

  SELECT tgenabled INTO v_trigger_status FROM pg_trigger
  WHERE tgrelid = 'public.anew_role_permissions'::regclass AND tgname = 'trg_audit_anew_role_permissions';
  IF v_trigger_status IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION 'trg_audit_anew_role_permissions nao ficou ativo (tgenabled=%)', v_trigger_status;
  END IF;
END $$;

COMMIT;

-- ============================================================
-- Notas de verificação (não executadas)
-- ============================================================
-- 1. SELECT COUNT(*) FROM anew_role_permissions WHERE role_id IN
--    ('03a43423-9b3c-4640-9dbe-31687f829869','e91ef94e-a5e6-415c-9985-0c2b7594720b')
--    GROUP BY role_id; -- ambos devem bater com o total de anew_permissions.
-- 2. Recomendação para o futuro (fora do âmbito desta migration): sempre que
--    se criar uma permissão nova em anew_permissions, replicar também para
--    System Admin e Super Admin no mesmo ficheiro de migration, para não
--    repetir este gap.
