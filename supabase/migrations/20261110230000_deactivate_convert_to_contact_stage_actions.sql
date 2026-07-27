-- Deactivate 'convert_to_contact' lead stage automation actions
-- ============================================================
-- Found live while removing the manual "Converter para Contacto"
-- button/menu item (contacts-to-leads merge follow-up): 3 REAL, ACTIVE
-- automations still configured (lead_stage_actions.action_type =
-- 'convert_to_contact', is_active = true) on orgs Mudelar (x2) and
-- BMGest (x1), attached to the 'qualified' and 'proposal' stages.
--
-- Left as-is, these would keep firing automatically whenever a lead
-- reaches those stages, creating brand new anew_contacts rows -- directly
-- undoing the merge every single time a lead progresses through the
-- pipeline. Deactivated (not deleted) so the historical configuration
-- record is preserved, matching the same soft-touch approach used
-- throughout this round of fixes.

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.lead_stage_actions
  WHERE action_type = 'convert_to_contact' AND is_active = true;

  RAISE NOTICE 'Automacoes convert_to_contact ativas a desativar: %', v_count;

  UPDATE public.lead_stage_actions
  SET    is_active = false, updated_at = now()
  WHERE  action_type = 'convert_to_contact'
    AND  is_active = true;

  RAISE NOTICE 'Desativadas.';
END $$;
