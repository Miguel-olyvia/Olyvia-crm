-- ============================================================
-- 20270108130000_ambitos_membros_quem_pode_gerir
-- ============================================================
-- Auditoria de permissões 05/11/2026, grupo D, R2 (P1.2).
-- As políticas de escrita de anew_membership_permission_scopes pediam users.edit em QUALQUER organização + associação numa
--   organização visível: dava para pôr/tirar âmbitos na associação do super_admin e nos membros da mãe ou de outra organização (o
--   gatilho tg_anew_scopes_no_self_grant só bloqueia os próprios).
-- Agora (INSERT/UPDATE/DELETE): users.edit na organização da associação ou acima E fn_pode_gerir_utilizador(dono, 'users.edit') -
--   a mesma regra de rpc_update_user / anew_users (Lote D): nunca o próprio, nunca um administrador de sistema, e quem age tem de
--   poder gerir cada associação ativa da pessoa (permissão nessa organização ou acima e poder atribuir esse papel, ou seja, a
--   pessoa não tem mais poder do que quem age). A leitura não muda.
-- Reversão (só como migration nova): repor as três políticas com o texto anterior (comentário abaixo).
-- ============================================================
SET lock_timeout = '5s';

-- Antes (I: WITH CHECK; U/D: USING): EXISTS associação m (m.id = membership_id AND m.organization_id IN visíveis)
--   AND has_anew_permission(auth.uid(), 'users.edit').
DROP POLICY IF EXISTS anew_membership_permission_scopes_insert ON public.anew_membership_permission_scopes;
CREATE POLICY anew_membership_permission_scopes_insert ON public.anew_membership_permission_scopes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.anew_memberships m
                      WHERE m.id = anew_membership_permission_scopes.membership_id
                        AND m.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
                        AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'users.edit', m.organization_id)
                        AND public.fn_pode_gerir_utilizador(m.user_id, 'users.edit')));
DROP POLICY IF EXISTS anew_membership_permission_scopes_update ON public.anew_membership_permission_scopes;
CREATE POLICY anew_membership_permission_scopes_update ON public.anew_membership_permission_scopes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.anew_memberships m
                 WHERE m.id = anew_membership_permission_scopes.membership_id
                   AND m.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
                   AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'users.edit', m.organization_id)
                   AND public.fn_pode_gerir_utilizador(m.user_id, 'users.edit')));
DROP POLICY IF EXISTS anew_membership_permission_scopes_delete ON public.anew_membership_permission_scopes;
CREATE POLICY anew_membership_permission_scopes_delete ON public.anew_membership_permission_scopes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.anew_memberships m
                 WHERE m.id = anew_membership_permission_scopes.membership_id
                   AND m.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
                   AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'users.edit', m.organization_id)
                   AND public.fn_pode_gerir_utilizador(m.user_id, 'users.edit')));
