-- Slide 8 follow-up: system_admin_pii_default_deny blocked ANY user flagged as
-- system_admin from every PII table, even when that user holds a genuine
-- active membership in the organization that owns the row (e.g. a
-- system_admin who is also super_admin of a real org). Replace the blanket
-- deny with an org-scoped check reusing get_user_visible_org_ids(), which
-- already resolves a user's real active-membership org set.
-- Forward-only migration. Do not fold into the baseline.

-- 1) Direct organization_id / root_organization_id tables.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'anew_leads', 'anew_contacts', 'anew_clients', 'deals', 'quotes',
    'proposals', 'client_contracts', 'entity_interactions'
  ]
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS system_admin_pii_default_deny ON public.%I', t
    );
    EXECUTE format(
      'CREATE POLICY system_admin_pii_default_deny ON public.%I
         AS RESTRICTIVE FOR ALL TO authenticated
         USING (
           NOT public.is_system_admin(auth.uid())
           OR organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
           OR root_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
         )', t
    );
  END LOOP;
END $$;

-- 2) Tables with only organization_id (no root_organization_id column).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contract_documents', 'lead_contact_history', 'anew_entity_roles']
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS system_admin_pii_default_deny ON public.%I', t
    );
    EXECUTE format(
      'CREATE POLICY system_admin_pii_default_deny ON public.%I
         AS RESTRICTIVE FOR ALL TO authenticated
         USING (
           NOT public.is_system_admin(auth.uid())
           OR organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
         )', t
    );
  END LOOP;
END $$;

-- 3) anew_entity_relationships: only root_organization_id.
DROP POLICY IF EXISTS system_admin_pii_default_deny ON public.anew_entity_relationships;
CREATE POLICY system_admin_pii_default_deny ON public.anew_entity_relationships
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    NOT public.is_system_admin(auth.uid())
    OR root_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  );

-- 4) Entity-detail tables: only entity_id, org resolved via anew_entity_roles.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'anew_entity_addresses', 'anew_entity_emails', 'anew_entity_history', 'anew_entity_phones'
  ]
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS system_admin_pii_default_deny ON public.%I', t
    );
    EXECUTE format(
      'CREATE POLICY system_admin_pii_default_deny ON public.%I
         AS RESTRICTIVE FOR ALL TO authenticated
         USING (
           NOT public.is_system_admin(auth.uid())
           OR EXISTS (
             SELECT 1 FROM public.anew_entity_roles er
             WHERE er.entity_id = %I.entity_id
               AND er.deleted_at IS NULL
               AND er.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
           )
         )', t, t
    );
  END LOOP;
END $$;

-- 5) anew_entities: id is the entity, org resolved via anew_entity_roles.
DROP POLICY IF EXISTS system_admin_pii_default_deny ON public.anew_entities;
CREATE POLICY system_admin_pii_default_deny ON public.anew_entities
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    NOT public.is_system_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.anew_entity_roles er
      WHERE er.entity_id = anew_entities.id
        AND er.deleted_at IS NULL
        AND er.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    )
  );

-- 6) anew_addresses: shared address rows, org resolved via
--    anew_entity_addresses -> anew_entity_roles.
DROP POLICY IF EXISTS system_admin_pii_default_deny ON public.anew_addresses;
CREATE POLICY system_admin_pii_default_deny ON public.anew_addresses
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    NOT public.is_system_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.anew_entity_addresses ea
      JOIN public.anew_entity_roles er ON er.entity_id = ea.entity_id
      WHERE ea.address_id = anew_addresses.id
        AND er.deleted_at IS NULL
        AND er.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    )
  );

-- 7) client_contract_parties: org resolved via client_contracts.
DROP POLICY IF EXISTS system_admin_pii_default_deny ON public.client_contract_parties;
CREATE POLICY system_admin_pii_default_deny ON public.client_contract_parties
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    NOT public.is_system_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.client_contracts cc
      WHERE cc.id = client_contract_parties.contract_id
        AND (
          cc.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
          OR cc.root_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
        )
    )
  );

-- 8) proposal_items: org resolved via proposals.
DROP POLICY IF EXISTS system_admin_pii_default_deny ON public.proposal_items;
CREATE POLICY system_admin_pii_default_deny ON public.proposal_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    NOT public.is_system_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id = proposal_items.proposal_id
        AND (
          p.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
          OR p.root_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
        )
    )
  );

-- 9) quote_lines / quote_fees: org resolved via quotes.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quote_lines', 'quote_fees']
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS system_admin_pii_default_deny ON public.%I', t
    );
    EXECUTE format(
      'CREATE POLICY system_admin_pii_default_deny ON public.%I
         AS RESTRICTIVE FOR ALL TO authenticated
         USING (
           NOT public.is_system_admin(auth.uid())
           OR EXISTS (
             SELECT 1 FROM public.quotes q
             WHERE q.id = %I.quote_id
               AND (
                 q.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
                 OR q.root_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
               )
           )
         )', t, t
    );
  END LOOP;
END $$;
