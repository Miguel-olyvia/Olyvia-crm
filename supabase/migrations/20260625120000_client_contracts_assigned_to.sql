-- =============================================================================
-- CLIENT CONTRACTS — Add assigned_to (comercial responsável)
-- Regra: assigned_to = proposal.assigned_to ?? quote.assigned_to ?? created_by
-- =============================================================================

-- A. Coluna + índice
ALTER TABLE public.client_contracts
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.anew_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_contracts_assigned_to ON public.client_contracts(assigned_to);

-- B. Backfill — contratos existentes
WITH source AS (
  SELECT
    cc.id,
    COALESCE(p.assigned_to, q.assigned_to, cc.created_by) AS new_assigned_to
  FROM public.client_contracts cc
  LEFT JOIN public.proposals p ON p.id = cc.proposal_id
  LEFT JOIN public.quotes q ON q.id = cc.quote_id
)
UPDATE public.client_contracts cc
SET assigned_to = source.new_assigned_to
FROM source
WHERE cc.id = source.id;

-- C. RLS — visibilidade: mantém o gate de permissao/organizacao actual (get_user_crm_org_ids +
-- has_anew_permission, tal como a policy client_contracts_select ja em vigor) e alarga o
-- alcance de linhas visiveis dentro desse gate ao criador e ao comercial atribuido.
DROP POLICY IF EXISTS "client_contracts_select" ON public.client_contracts;
CREATE POLICY "client_contracts_select" ON public.client_contracts FOR SELECT
  USING (
    has_anew_permission(auth.uid(), 'client_contracts.view'::text)
    AND (
      organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
      OR created_by = public.current_business_user_id()
      OR assigned_to = public.current_business_user_id()
    )
  );

-- C. RLS — edição: idem
DROP POLICY IF EXISTS "client_contracts_update" ON public.client_contracts;
CREATE POLICY "client_contracts_update" ON public.client_contracts FOR UPDATE
  USING (
    has_anew_permission(auth.uid(), 'client_contracts.edit'::text)
    AND (
      organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
      OR created_by = public.current_business_user_id()
      OR assigned_to = public.current_business_user_id()
    )
  );
