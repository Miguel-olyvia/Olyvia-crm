-- ============================================================
-- 20270108160000_users_change_password_aos_papeis
-- ============================================================
-- Auditoria de permissões 05/11/2026, grupo D, P2 «palavra-passe».
-- O campo palavra-passe da ficha do utilizador aparecia com users.edit, mas a edge update-user-password pede
--   users.change_password, que estava escondida no editor de papéis: com um papel criado no editor a palavra-passe nunca mudava.
--   O ecrã passa a pedir users.change_password (e o editor mostra-a). Para ninguém perder o que tinha, os papéis de organização
--   que hoje têm users.edit recebem users.change_password (os papéis de sistema já têm as duas; a 5/11/2026, no ramo RH, nenhum
--   papel de organização tinha users.edit, por isso aqui não insere linhas - fica para as outras bases).
-- Só dados de anew_role_permissions; sem DDL.
-- Reversão (só como migration nova): apagar as linhas inseridas (created_at desta migração, permission_code users.change_password).
-- ============================================================
INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT DISTINCT rp.role_id, 'users.change_password', NULL::uuid
FROM public.anew_role_permissions rp
JOIN public.anew_roles r ON r.id = rp.role_id
WHERE rp.permission_code = 'users.edit'
  AND r.is_system IS NOT TRUE
  AND EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = 'users.change_password')
ON CONFLICT (role_id, permission_code) DO NOTHING;
