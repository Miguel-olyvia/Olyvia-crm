-- =============================================================================
-- PROPOSALS — RLS: adicionar assigned_to à visibilidade e edição
-- Sónia (OWNED scope, assigned_to = ela) passa a ver e editar propostas atribuídas
-- =============================================================================

-- SELECT: adicionar OR assigned_to = current_business_user_id()
DROP POLICY IF EXISTS "Users can view proposals in their scope" ON public.proposals;
CREATE POLICY "Users can view proposals in their scope" ON public.proposals
FOR SELECT
USING (
  has_anew_permission(auth.uid(), 'proposals.view'::text)
  AND (
    organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    OR (
      organization_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.deals d
        WHERE d.id = proposals.deal_id
          AND d.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = proposals.deal_id
        AND (d.created_by = current_business_user_id() OR d.assigned_to = current_business_user_id())
    )
    OR created_by = current_business_user_id()
    OR assigned_to = current_business_user_id()
  )
);

-- UPDATE: adicionar OR assigned_to = current_business_user_id()
DROP POLICY IF EXISTS "Users with permission can update proposals" ON public.proposals;
CREATE POLICY "Users with permission can update proposals" ON public.proposals
FOR UPDATE
USING (
  created_by = current_business_user_id()
  OR assigned_to = current_business_user_id()
  OR (
    has_anew_permission(auth.uid(), 'proposals.edit'::text)
    AND organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
  )
);
