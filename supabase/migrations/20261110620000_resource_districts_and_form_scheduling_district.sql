-- Fase: Agendamento por distrito + capacidade diária no fluxo público
-- Ref: vault/ficheiros/agendamento/2026-07-20-plano-recursos-distritos-capacidade-lovable.md
--
-- resource_service_areas (postal_code_prefix, texto livre) mantém-se intocada
-- nesta fase, como fallback. resource_districts é a nova fonte de verdade para
-- filtragem por distrito, seguindo o mesmo padrão já usado por form_districts
-- (administrative_divisions + tabela de ligação + priority).

CREATE TABLE public.resource_districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES public.schedule_resources(id) ON DELETE CASCADE,
  district_id uuid NOT NULL REFERENCES public.administrative_divisions(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resource_id, district_id)
);

CREATE INDEX idx_resource_districts_resource_id ON public.resource_districts(resource_id);
CREATE INDEX idx_resource_districts_district_id ON public.resource_districts(district_id);

CREATE TRIGGER trg_resource_districts_updated_at
  BEFORE UPDATE ON public.resource_districts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.resource_districts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_districts TO authenticated;
GRANT ALL ON public.resource_districts TO service_role;

-- RLS: join-only via schedule_resources.organization_id (no direct organization_id
-- column on this table — deliberate, mirrors resource_service_areas' existing
-- policy set exactly (same helpers, same permission keys).
CREATE POLICY "System admins org access resource districts" ON public.resource_districts
  FOR ALL
  USING (
    is_system_admin(auth.uid())
    AND resource_id IN (
      SELECT sr.id FROM public.schedule_resources sr
      WHERE sr.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    )
  );

CREATE POLICY "System admins support access resource districts" ON public.resource_districts
  FOR SELECT
  USING (
    is_system_admin(auth.uid())
    AND resource_id IN (
      SELECT sr.id FROM public.schedule_resources sr
      WHERE has_active_support_access(sr.organization_id)
    )
  );

CREATE POLICY auth_select_resource_districts ON public.resource_districts
  FOR SELECT
  USING (
    has_scheduling_permission(auth.uid(), 'scheduling.resources.view'::text)
    AND resource_id IN (
      SELECT sr.id FROM public.schedule_resources sr
      WHERE sr.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    )
  );

CREATE POLICY auth_insert_resource_districts ON public.resource_districts
  FOR INSERT
  WITH CHECK (
    has_scheduling_permission(auth.uid(), 'scheduling.resources.edit'::text)
    AND resource_id IN (
      SELECT sr.id FROM public.schedule_resources sr
      WHERE sr.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    )
  );

CREATE POLICY auth_update_resource_districts ON public.resource_districts
  FOR UPDATE
  USING (
    has_scheduling_permission(auth.uid(), 'scheduling.resources.edit'::text)
    AND resource_id IN (
      SELECT sr.id FROM public.schedule_resources sr
      WHERE sr.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    )
  );

CREATE POLICY auth_delete_resource_districts ON public.resource_districts
  FOR DELETE
  USING (
    has_scheduling_permission(auth.uid(), 'scheduling.resources.edit'::text)
    AND resource_id IN (
      SELECT sr.id FROM public.schedule_resources sr
      WHERE sr.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    )
  );

-- Which form field feeds the district filter for a scheduling step. NULL means
-- "no district filter configured" — public-availability/book-slot then fall
-- back to today's behaviour (all active org resources), exactly like
-- scheduling_postal_code_field_key already does when unset.
ALTER TABLE public.form_steps
  ADD COLUMN scheduling_district_field_key text;

-- Which district a public booking resolved to, for reporting/filtering leads
-- by district. Populated by book-slot when a district was resolved.
ALTER TABLE public.anew_leads
  ADD COLUMN lead_district_id uuid REFERENCES public.administrative_divisions(id);

CREATE INDEX idx_anew_leads_lead_district_id ON public.anew_leads(lead_district_id) WHERE lead_district_id IS NOT NULL;
