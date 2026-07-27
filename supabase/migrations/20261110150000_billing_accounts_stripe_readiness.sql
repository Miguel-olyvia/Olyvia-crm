-- Billing accounts — schema readiness for future Stripe integration
-- ============================================================
-- Product decision (this session): "who pays" cannot be anchored to a
-- single anew_organizations row, a user, or even root_organization_id.
-- Confirmed live: a single user can hold active memberships in multiple
-- is_work_org=true organizations that belong to entirely unrelated
-- hierarchy roots (e.g. "nike" and "Grupo BMLar" for the same test user),
-- AND a single root hierarchy can itself contain more than one
-- independently-switchable is_work_org=true unit (Grupo BMLar's own
-- children "BMGest" and "Mudelar" are both is_work_org=true too, not just
-- the holding itself). So per-organization or per-root billing would
-- either split one paying customer's plan across accidental duplicate
-- accounts, or wrongly merge two unrelated work_orgs under one bill.
--
-- Correct model: one paying user (owner_user_id) holds one billing
-- account, and that single account/subscription can cover N work_orgs up
-- to the plan's capacity (max_work_orgs) -- mirrors the "N orgs per
-- Supabase Pro" tiering already modeled in the standalone cost sheet
-- (Starter/Profissional/Empresarial). No Stripe wiring yet -- this is
-- schema-only readiness so the integration is fast when it happens.
--
-- Deliberately NOT touched here: no RPC to create/attach a billing
-- account, no UI, no actual Stripe webhook handling. Those are a
-- separate, later piece of work.

CREATE TABLE IF NOT EXISTS public.billing_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id       uuid NOT NULL REFERENCES public.anew_users(id),
  stripe_customer_id  text,
  subscription_status text,
  plan_tier           text,
  max_work_orgs       integer,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.billing_accounts IS
  'One row per paying customer. owner_user_id is the anew_users.id who owns the subscription. Covers 1..max_work_orgs organizations via billing_account_work_orgs. Stripe fields are placeholders until billing integration lands.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_accounts_stripe_customer_id
  ON public.billing_accounts (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_accounts_owner_user_id
  ON public.billing_accounts (owner_user_id);

CREATE TABLE IF NOT EXISTS public.billing_account_work_orgs (
  billing_account_id uuid NOT NULL REFERENCES public.billing_accounts(id) ON DELETE CASCADE,
  organization_id    uuid NOT NULL REFERENCES public.anew_organizations(id),
  added_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (billing_account_id, organization_id)
);

COMMENT ON TABLE public.billing_account_work_orgs IS
  'Join table: which is_work_org=true organizations a billing account currently covers. An organization should appear in at most one active billing account at a time (not enforced by a DB constraint yet -- revisit once the attach/detach RPC exists).';

CREATE INDEX IF NOT EXISTS idx_billing_account_work_orgs_org_id
  ON public.billing_account_work_orgs (organization_id);

ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_account_work_orgs ENABLE ROW LEVEL SECURITY;

-- Owner can see/manage their own billing account; system_admin (platform
-- support) can see everything. No other role has any access yet -- this
-- is intentionally locked down since there is no UI or RPC using it.
CREATE POLICY "Owner or system_admin can view billing account"
  ON public.billing_accounts FOR SELECT
  USING (
    owner_user_id = public.current_business_user_id()
    OR public.is_system_admin(auth.uid())
  );

CREATE POLICY "Owner or system_admin can manage billing account"
  ON public.billing_accounts FOR ALL
  USING (
    owner_user_id = public.current_business_user_id()
    OR public.is_system_admin(auth.uid())
  )
  WITH CHECK (
    owner_user_id = public.current_business_user_id()
    OR public.is_system_admin(auth.uid())
  );

CREATE POLICY "Owner or system_admin can view billing work orgs"
  ON public.billing_account_work_orgs FOR SELECT
  USING (
    public.is_system_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.billing_accounts ba
      WHERE ba.id = billing_account_work_orgs.billing_account_id
        AND ba.owner_user_id = public.current_business_user_id()
    )
  );

CREATE POLICY "Owner or system_admin can manage billing work orgs"
  ON public.billing_account_work_orgs FOR ALL
  USING (
    public.is_system_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.billing_accounts ba
      WHERE ba.id = billing_account_work_orgs.billing_account_id
        AND ba.owner_user_id = public.current_business_user_id()
    )
  )
  WITH CHECK (
    public.is_system_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.billing_accounts ba
      WHERE ba.id = billing_account_work_orgs.billing_account_id
        AND ba.owner_user_id = public.current_business_user_id()
    )
  );

REVOKE ALL ON public.billing_accounts FROM PUBLIC, anon;
REVOKE ALL ON public.billing_account_work_orgs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_account_work_orgs TO authenticated;
GRANT ALL ON public.billing_accounts TO service_role;
GRANT ALL ON public.billing_account_work_orgs TO service_role;
