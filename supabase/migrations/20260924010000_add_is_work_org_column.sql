-- Fase 1 of the work_org contract (vault/ficheiros/organizacoes-entidades/
-- contrato-sdd-work-orgs-vs-estruturas-internas.md + plano-implementacao-work-orgs.md).
--
-- Adds is_work_org to distinguish organizations that have their own CRM scope
-- ("work orgs", selectable in the org switcher) from internal structures
-- (departments/branches, which can have members/permissions but must never be
-- the organization_id of a CRM record).
--
-- Backfill mirrors the classification CompanyContext.tsx already uses today
-- (type IN ('holding', 'empresa')) — verified against live data: the 9
-- 'filial' orgs and 26 'departamento' orgs all have zero anew_leads/
-- anew_contacts/anew_clients/deals rows, confirming they are internal
-- structures, not independent CRM scopes.
--
-- No enforcement is added here (no trigger, no RLS, no NOT VALID constraint)
-- — this phase only introduces and populates the column, per the contract's
-- "don't activate blocking validation while writers still write directly to
-- internal structures" precondition.

ALTER TABLE public.anew_organizations
  ADD COLUMN is_work_org boolean NOT NULL DEFAULT false;

UPDATE public.anew_organizations
SET is_work_org = true
WHERE type IN ('holding', 'empresa');

COMMENT ON COLUMN public.anew_organizations.is_work_org IS
  'True for organizations with their own independent CRM scope (selectable as the active org). False for internal structures (departments, branches) that can have members/permissions but must never be the organization_id of a CRM record. See contrato-sdd-work-orgs-vs-estruturas-internas.md.';
