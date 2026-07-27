-- Organization-level subscription/trial tracking, in preparation for Stripe
-- integration. No Stripe API calls yet: this only introduces the data model
-- and a 14-day, no-card-required trial created at signup time.

CREATE TABLE organization_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES anew_organizations(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text NOT NULL DEFAULT 'trial',
  status text NOT NULL DEFAULT 'trialing',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_by uuid REFERENCES anew_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_subscriptions_status_check
    CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  CONSTRAINT organization_subscriptions_plan_check
    CHECK (plan IN ('trial', 'starter', 'pro', 'enterprise'))
);

CREATE INDEX idx_organization_subscriptions_org ON organization_subscriptions(organization_id);

ALTER TABLE organization_subscriptions ENABLE ROW LEVEL SECURITY;

-- Read-only for active members of the org; no direct writes from the client —
-- all writes happen through SECURITY DEFINER paths (register-company now, a
-- Stripe webhook handler later).
CREATE POLICY organization_subscriptions_select ON organization_subscriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM anew_memberships m
      WHERE m.organization_id = organization_subscriptions.organization_id
        AND m.user_id = (SELECT id FROM anew_users WHERE auth_user_id = auth.uid())
        AND m.status = 'active'
    )
  );

CREATE FUNCTION org_has_active_access(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_subscriptions
    WHERE organization_id = _org_id
      AND status IN ('trialing', 'active')
      AND (trial_ends_at IS NULL OR trial_ends_at > now())
  );
$$;
