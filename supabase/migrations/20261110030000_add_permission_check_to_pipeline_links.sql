-- Migration: add permission checks to pipeline_links RLS policies
--
-- Why: the 4 pipeline_links policies (anew_select/insert/update/delete_
-- pipeline_links, baseline 20260615130000) only checked
-- `organization_id IN get_user_visible_org_ids(auth.uid())`, with no
-- `has_anew_permission` gate at all — unlike quotes/proposals/client_
-- contracts, which were already fixed to require both org visibility and a
-- permission code (see 20261102010000_close_rls_permission_gaps_quotes_
-- inventory.sql, added specifically because portal clients (role 'client',
-- zero anew permissions) receive an 'active' membership in the org and are
-- therefore included in get_user_visible_org_ids).
--
-- Found while auditing client-portal-action's service_role usage for the
-- blast-radius reduction plan (slide 60, Phase 2): a portal client, using
-- their normal Supabase JWT, could call the REST API directly and read/
-- write pipeline_links for the whole organization, not just their own
-- documents.
--
-- pipeline_links spans lead/deal/proposal/quote/contract/client — there is
-- no dedicated "pipeline.*" permission code. Deals is the central pivot
-- entity for pipeline tracking (populated on nearly every row via
-- create_deal_from_lead), so this reuses the existing, confirmed-real
-- deals.view/deals.edit/deals.delete permission codes, mirroring the exact
-- pattern already used for quotes/proposals/client_contracts.

DROP POLICY IF EXISTS "anew_select_pipeline_links" ON "public"."pipeline_links";
CREATE POLICY "anew_select_pipeline_links" ON "public"."pipeline_links"
FOR SELECT TO "authenticated"
USING (
  ("organization_id" IN (SELECT "public"."get_user_visible_org_ids"("auth"."uid"())))
  AND "public"."has_anew_permission"("auth"."uid"(), 'deals.view'::"text")
);

DROP POLICY IF EXISTS "anew_insert_pipeline_links" ON "public"."pipeline_links";
CREATE POLICY "anew_insert_pipeline_links" ON "public"."pipeline_links"
FOR INSERT TO "authenticated"
WITH CHECK (
  ("organization_id" IN (SELECT "public"."get_user_visible_org_ids"("auth"."uid"())))
  AND "public"."has_anew_permission"("auth"."uid"(), 'deals.edit'::"text")
);

DROP POLICY IF EXISTS "anew_update_pipeline_links" ON "public"."pipeline_links";
CREATE POLICY "anew_update_pipeline_links" ON "public"."pipeline_links"
FOR UPDATE TO "authenticated"
USING (
  ("organization_id" IN (SELECT "public"."get_user_visible_org_ids"("auth"."uid"())))
  AND "public"."has_anew_permission"("auth"."uid"(), 'deals.edit'::"text")
)
WITH CHECK (
  ("organization_id" IN (SELECT "public"."get_user_visible_org_ids"("auth"."uid"())))
  AND "public"."has_anew_permission"("auth"."uid"(), 'deals.edit'::"text")
);

DROP POLICY IF EXISTS "anew_delete_pipeline_links" ON "public"."pipeline_links";
CREATE POLICY "anew_delete_pipeline_links" ON "public"."pipeline_links"
FOR DELETE TO "authenticated"
USING (
  ("organization_id" IN (SELECT "public"."get_user_visible_org_ids"("auth"."uid"())))
  AND "public"."has_anew_permission"("auth"."uid"(), 'deals.delete'::"text")
);
