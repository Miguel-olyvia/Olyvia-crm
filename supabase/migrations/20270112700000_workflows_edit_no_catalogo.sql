-- ============================================================
-- 20270112700000 — workflows.edit no catálogo de permissões
-- ============================================================
-- O que faz: a permissão workflows.edit já é exigida pela política «Users can manage workflow automation rules»
--   (workflow_automation_rules, FOR ALL), por rpc_save_lead_workflow_automation e rpc_delete_lead_workflow_automation
--   e pelas ferramentas do assistente (stage_actions.ts, workflows.ts) — mas não existia em anew_permissions, por isso
--   não aparecia no editor de perfis e ninguém a podia receber (só o administrador de sistema, por is_system_admin).
--   Acrescenta-a ao catálogo, na categoria 'proposals'.
--
-- Só dados. A permissão NÃO é dada a nenhum papel aqui (nem a super_admin/system_admin). Nenhuma função nem política muda.
-- O que pode bloquear a atribuição depois: nada específico desta permissão. anew_role_permissions não tem FK para o
--   catálogo; fn_role_permissions_reservadas só reserva system.manage; fn_role_permissions_sem_escalada exige que quem
--   atribui (authenticated) tenha a permissão; protect_system_role_permissions protege os papéis de sistema. Igual às outras.
-- supports_scope = false: as verificações usam has_anew_permission (sem âmbito) mais get_user_visible_org_ids.
-- Idempotente: ON CONFLICT (code) DO NOTHING (anew_permissions_code_unique). Se já existir com outro texto, fica como está.
-- Reversão: DELETE FROM public.anew_permissions WHERE code = 'workflows.edit'
--   (só se nenhum papel a tiver: SELECT 1 FROM anew_role_permissions WHERE permission_code = 'workflows.edit').
-- ============================================================
SET lock_timeout = '5s';

INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('workflows.edit', 'Gerir automações do workflow',
   'Criar, editar e apagar regras de automação do workflow das propostas.',
   'proposals', NULL, 10, false, 'organization', false)
ON CONFLICT (code) DO NOTHING;

DO $verificar$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'workflows.edit') THEN
    RAISE EXCEPTION 'Verificação: workflows.edit não ficou no catálogo.';
  END IF;
END $verificar$;
