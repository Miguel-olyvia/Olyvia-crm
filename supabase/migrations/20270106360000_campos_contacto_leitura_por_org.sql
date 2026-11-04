-- ============================================================
-- 20270106360000_campos_contacto_leitura_por_org
-- ============================================================
-- contact_custom_fields "Users can view custom fields" (SELECT) aceitava has_anew_permission(auth.uid(), 'settings.view'), que é
--   GLOBAL (a permissão em qualquer organização): quem tinha settings.view numa organização lia os campos personalizados de
--   contacto de TODAS as organizações. A escrita já foi restringida em 20270106330000 (settings.update na organização do campo
--   ou acima; campos sem organização só para o administrador de sistema).
-- Regra (igual à da escrita): settings.view na organização do campo ou numa ACIMA dela (has_anew_permission_in_org_or_ancestor;
--   o administrador de sistema verdadeiro passa), ou campo sem organização e administrador de sistema. O segundo ramo (membro
--   ativo da organização do campo) mantém-se tal como estava.
-- Quem lê: só src/pages/Settings.tsx (lista dos campos com o nome da organização). Nenhuma função na BD. 0 linhas hoje.
-- Reversão (só como migration nova): repor o USING anterior (comentário abaixo).
-- ============================================================
SET lock_timeout = '5s';

DO $g$
BEGIN
  IF (SELECT md5(qual) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'contact_custom_fields' AND policyname = 'Users can view custom fields')
     IS DISTINCT FROM md5($q$(has_anew_permission(auth.uid(), 'settings.view'::text) OR (organization_id IN ( SELECT m.organization_id
   FROM (anew_memberships m
     JOIN anew_users u ON ((u.id = m.user_id)))
  WHERE ((u.auth_user_id = auth.uid()) AND (m.status = 'active'::text)))))$q$) THEN
    RAISE EXCEPTION 'GUARDA: a política "Users can view custom fields" mudou desde a leitura (4/11/2026)';
  END IF;
END $g$;

-- Antes: has_anew_permission(auth.uid(), 'settings.view') OR organization_id IN (organizações onde é membro ativo).
DROP POLICY IF EXISTS "Users can view custom fields" ON public.contact_custom_fields;
CREATE POLICY "Users can view custom fields" ON public.contact_custom_fields
  FOR SELECT TO authenticated
  USING (
    public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'settings.view', organization_id)
    OR (organization_id IS NULL AND public.is_system_admin_user(auth.uid()))
    OR organization_id IN (
      SELECT m.organization_id
      FROM public.anew_memberships m
      JOIN public.anew_users u ON u.id = m.user_id
      WHERE u.auth_user_id = auth.uid() AND m.status = 'active'
    )
  );
