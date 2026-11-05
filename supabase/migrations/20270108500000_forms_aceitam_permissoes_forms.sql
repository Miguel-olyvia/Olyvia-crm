-- ============================================================
-- 20270108500000_forms_aceitam_permissoes_forms
-- ============================================================
-- Só permissões (P2 da auditoria de 05/11/2026, ponto P11 do grupo A).
-- O ecrã de Formulários pede forms.create/edit/delete, mas a tabela forms só aceitava campaigns.create/edit/delete.
-- Passa a aceitar as duas: forms.* (o que o ecrã pede) OU campaigns.* (quem já tinha não perde nada).
-- form_fields e form_steps já aceitam forms.*: não mudam.
-- Parte das policies VIVAS (pg_policies); se alguém as mudou entretanto, a migração pára sem mexer.
-- ============================================================

DO $guarda$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) INTO v_md5
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'forms' AND policyname = 'forms_insert';
  IF v_md5 IS DISTINCT FROM 'fd4e5891ebd3323b0155fe7b14a1a7c3' THEN
    RAISE EXCEPTION 'forms_insert mudou desde a leitura (md5 %): rever antes de aplicar', v_md5;
  END IF;
  SELECT md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) INTO v_md5
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'forms' AND policyname = 'forms_update';
  IF v_md5 IS DISTINCT FROM '2884ac5418611d12c482e2631de66193' THEN
    RAISE EXCEPTION 'forms_update mudou desde a leitura (md5 %): rever antes de aplicar', v_md5;
  END IF;
  SELECT md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) INTO v_md5
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'forms' AND policyname = 'forms_delete';
  IF v_md5 IS DISTINCT FROM '87e558ab28d90de2737e55d3ab01b86d' THEN
    RAISE EXCEPTION 'forms_delete mudou desde a leitura (md5 %): rever antes de aplicar', v_md5;
  END IF;
END
$guarda$;

ALTER POLICY forms_insert ON public.forms
  WITH CHECK (
    (organization_id IN (SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (has_anew_permission(auth.uid(), 'campaigns.create'::text)
         OR has_anew_permission(auth.uid(), 'forms.create'::text))
  );

ALTER POLICY forms_update ON public.forms
  USING (
    (organization_id IN (SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (has_anew_permission(auth.uid(), 'campaigns.edit'::text)
         OR has_anew_permission(auth.uid(), 'forms.edit'::text))
  );

ALTER POLICY forms_delete ON public.forms
  USING (
    (organization_id IN (SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (has_anew_permission(auth.uid(), 'campaigns.delete'::text)
         OR has_anew_permission(auth.uid(), 'forms.delete'::text))
  );
