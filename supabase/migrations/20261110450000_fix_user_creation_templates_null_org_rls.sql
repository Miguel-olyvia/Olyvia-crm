-- Fix RLS on user_creation_templates (+ its 3 satellite tables) rejecting
-- every INSERT, and hiding/blocking every subsequent SELECT/UPDATE/DELETE,
-- for the templates the app actually creates.
--
-- 2026-07-21 | Module: Utilizadores | Feature: Templates (UserTemplateManager.tsx)
--
-- Confirmed live: creating a template via "Utilizadores" -> Templates ->
-- "Create your first template" -> fill Name/Description -> Save fails with
-- "new row violates row-level security policy for table
-- 'user_creation_templates'" (403 / 42501) on the INSERT, for a user who
-- already holds the relevant users.create permission. The feature is
-- entirely dead because template creation itself never succeeds.
--
-- Root cause (read from src/components/users/UserTemplateManager.tsx,
-- consistent with the exact error observed live): the INSERT built by the
-- component only sends { name, description, created_by } -- it never sets
-- organization_id on the template row. Per-org scoping for a template is
-- handled entirely by the separate user_template_organizations join table
-- (populated by a second insert right after, from the multi-select "orgs"
-- field in the form), not by the organization_id column on
-- user_creation_templates itself, which is nullable and has no default
-- (see CREATE TABLE in 20260615130000_baseline_new_database.sql).
--
-- Every RLS policy on this table and its 3 satellites (user_template_fields,
-- user_template_attributes, user_template_organizations) was written as if
-- organization_id were always populated:
--   "organization_id" IN ( SELECT get_user_visible_org_ids(auth.uid()) )
-- With organization_id = NULL (the only value the app ever writes), that
-- expression evaluates to NULL, not TRUE, in both the INSERT WITH CHECK and
-- the SELECT/UPDATE/DELETE USING clauses -- so:
--   1. INSERT into user_creation_templates itself is rejected (the reported
--      bug).
--   2. Even if that were bypassed, the immediate SELECT the component runs
--      right after (loadTemplates()) would return zero rows for the new
--      template, since NULL IN (...) is not TRUE either -- the template
--      would silently vanish from the list.
--   3. The very next INSERT the component issues, into
--      user_template_organizations (to actually record which orgs the
--      template applies to), is gated by
--      auth_manage_user_template_organizations, which re-checks the same
--      parent organization_id IN (visible orgs) via a subquery -- also
--      blocked for the same reason.
--   4. Editing or (soft-)deleting an existing template hits the same wall
--      via UPDATE, as does managing its fields/custom attributes.
-- This is not a permission-catalog gap (has_anew_permission is not even
-- consulted by any of these policies) -- it is these organization_id
-- membership checks unconditionally rejecting the NULL that the app always
-- writes.
--
-- This matches an established pattern already used elsewhere in this schema
-- for legitimately nullable organization_id columns, e.g.
-- service_fee_types_select in the same baseline:
--   ("organization_id" IS NULL) OR ("organization_id" IN (SELECT ...))
--
-- Fix: add that same "organization_id IS NULL" escape hatch to all 12
-- affected policies (4 on user_creation_templates, 4 on
-- user_template_fields, and their EXISTS/IN subqueries on
-- user_template_attributes and user_template_organizations), so a template
-- with no organization_id of its own -- i.e. every template this UI can ever
-- produce -- is insertable, visible, editable and deletable by any
-- authenticated user, with actual per-org scoping continuing to be enforced
-- via user_template_organizations as the app's data model already intends.
-- Rows that do have organization_id set (if any ever existed from an older
-- code path) keep exactly the same org-membership check as before -- no
-- scope widening for those.

-- ============================================================
-- user_creation_templates
-- ============================================================

DROP POLICY IF EXISTS "auth_select_user_creation_templates" ON "public"."user_creation_templates";
CREATE POLICY "auth_select_user_creation_templates" ON "public"."user_creation_templates" FOR SELECT TO "authenticated" USING ((("organization_id" IS NULL) OR ("organization_id" IN ( SELECT "public"."get_user_visible_org_ids"("auth"."uid"()) AS "get_user_visible_org_ids"))));

DROP POLICY IF EXISTS "auth_insert_user_creation_templates" ON "public"."user_creation_templates";
CREATE POLICY "auth_insert_user_creation_templates" ON "public"."user_creation_templates" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" IS NULL) OR ("organization_id" IN ( SELECT "public"."get_user_visible_org_ids"("auth"."uid"()) AS "get_user_visible_org_ids"))));

DROP POLICY IF EXISTS "auth_update_user_creation_templates" ON "public"."user_creation_templates";
CREATE POLICY "auth_update_user_creation_templates" ON "public"."user_creation_templates" FOR UPDATE TO "authenticated" USING ((("organization_id" IS NULL) OR ("organization_id" IN ( SELECT "public"."get_user_visible_org_ids"("auth"."uid"()) AS "get_user_visible_org_ids"))));

DROP POLICY IF EXISTS "auth_delete_user_creation_templates" ON "public"."user_creation_templates";
CREATE POLICY "auth_delete_user_creation_templates" ON "public"."user_creation_templates" FOR DELETE TO "authenticated" USING ((("organization_id" IS NULL) OR ("organization_id" IN ( SELECT "public"."get_user_visible_org_ids"("auth"."uid"()) AS "get_user_visible_org_ids"))));

-- ============================================================
-- user_template_fields (satellite, gated via parent's organization_id)
-- ============================================================

DROP POLICY IF EXISTS "auth_select_user_template_fields" ON "public"."user_template_fields";
CREATE POLICY "auth_select_user_template_fields" ON "public"."user_template_fields" FOR SELECT TO "authenticated" USING (("template_id" IN ( SELECT "user_creation_templates"."id"
   FROM "public"."user_creation_templates"
  WHERE (("user_creation_templates"."organization_id" IS NULL) OR ("user_creation_templates"."organization_id" IN ( SELECT "public"."get_user_visible_org_ids"("auth"."uid"()) AS "get_user_visible_org_ids"))))));

DROP POLICY IF EXISTS "auth_insert_user_template_fields" ON "public"."user_template_fields";
CREATE POLICY "auth_insert_user_template_fields" ON "public"."user_template_fields" FOR INSERT TO "authenticated" WITH CHECK (("template_id" IN ( SELECT "user_creation_templates"."id"
   FROM "public"."user_creation_templates"
  WHERE (("user_creation_templates"."organization_id" IS NULL) OR ("user_creation_templates"."organization_id" IN ( SELECT "public"."get_user_visible_org_ids"("auth"."uid"()) AS "get_user_visible_org_ids"))))));

DROP POLICY IF EXISTS "auth_update_user_template_fields" ON "public"."user_template_fields";
CREATE POLICY "auth_update_user_template_fields" ON "public"."user_template_fields" FOR UPDATE TO "authenticated" USING (("template_id" IN ( SELECT "user_creation_templates"."id"
   FROM "public"."user_creation_templates"
  WHERE (("user_creation_templates"."organization_id" IS NULL) OR ("user_creation_templates"."organization_id" IN ( SELECT "public"."get_user_visible_org_ids"("auth"."uid"()) AS "get_user_visible_org_ids"))))));

DROP POLICY IF EXISTS "auth_delete_user_template_fields" ON "public"."user_template_fields";
CREATE POLICY "auth_delete_user_template_fields" ON "public"."user_template_fields" FOR DELETE TO "authenticated" USING (("template_id" IN ( SELECT "user_creation_templates"."id"
   FROM "public"."user_creation_templates"
  WHERE (("user_creation_templates"."organization_id" IS NULL) OR ("user_creation_templates"."organization_id" IN ( SELECT "public"."get_user_visible_org_ids"("auth"."uid"()) AS "get_user_visible_org_ids"))))));

-- ============================================================
-- user_template_attributes (satellite, gated via parent's organization_id)
-- ============================================================

DROP POLICY IF EXISTS "auth_select_user_template_attributes" ON "public"."user_template_attributes";
CREATE POLICY "auth_select_user_template_attributes" ON "public"."user_template_attributes" FOR SELECT TO "authenticated" USING (("template_id" IN ( SELECT "user_creation_templates"."id"
   FROM "public"."user_creation_templates"
  WHERE (("user_creation_templates"."organization_id" IS NULL) OR ("user_creation_templates"."organization_id" IN ( SELECT "public"."get_user_visible_org_ids"("auth"."uid"()) AS "get_user_visible_org_ids"))))));

DROP POLICY IF EXISTS "auth_insert_user_template_attributes" ON "public"."user_template_attributes";
CREATE POLICY "auth_insert_user_template_attributes" ON "public"."user_template_attributes" FOR INSERT TO "authenticated" WITH CHECK (("template_id" IN ( SELECT "user_creation_templates"."id"
   FROM "public"."user_creation_templates"
  WHERE (("user_creation_templates"."organization_id" IS NULL) OR ("user_creation_templates"."organization_id" IN ( SELECT "public"."get_user_visible_org_ids"("auth"."uid"()) AS "get_user_visible_org_ids"))))));

DROP POLICY IF EXISTS "auth_update_user_template_attributes" ON "public"."user_template_attributes";
CREATE POLICY "auth_update_user_template_attributes" ON "public"."user_template_attributes" FOR UPDATE TO "authenticated" USING (("template_id" IN ( SELECT "user_creation_templates"."id"
   FROM "public"."user_creation_templates"
  WHERE (("user_creation_templates"."organization_id" IS NULL) OR ("user_creation_templates"."organization_id" IN ( SELECT "public"."get_user_visible_org_ids"("auth"."uid"()) AS "get_user_visible_org_ids"))))));

DROP POLICY IF EXISTS "auth_delete_user_template_attributes" ON "public"."user_template_attributes";
CREATE POLICY "auth_delete_user_template_attributes" ON "public"."user_template_attributes" FOR DELETE TO "authenticated" USING (("template_id" IN ( SELECT "user_creation_templates"."id"
   FROM "public"."user_creation_templates"
  WHERE (("user_creation_templates"."organization_id" IS NULL) OR ("user_creation_templates"."organization_id" IN ( SELECT "public"."get_user_visible_org_ids"("auth"."uid"()) AS "get_user_visible_org_ids"))))));

-- ============================================================
-- user_template_organizations (satellite, gated via parent's organization_id)
-- ============================================================

DROP POLICY IF EXISTS "auth_select_user_template_organizations" ON "public"."user_template_organizations";
CREATE POLICY "auth_select_user_template_organizations" ON "public"."user_template_organizations" FOR SELECT TO "authenticated" USING (("template_id" IN ( SELECT "user_creation_templates"."id"
   FROM "public"."user_creation_templates"
  WHERE (("user_creation_templates"."organization_id" IS NULL) OR ("user_creation_templates"."organization_id" IN ( SELECT "public"."get_user_visible_org_ids"("auth"."uid"()) AS "get_user_visible_org_ids"))))));

DROP POLICY IF EXISTS "auth_manage_user_template_organizations" ON "public"."user_template_organizations";
CREATE POLICY "auth_manage_user_template_organizations" ON "public"."user_template_organizations" TO "authenticated" USING (("template_id" IN ( SELECT "user_creation_templates"."id"
   FROM "public"."user_creation_templates"
  WHERE (("user_creation_templates"."organization_id" IS NULL) OR ("user_creation_templates"."organization_id" IN ( SELECT "public"."get_user_visible_org_ids"("auth"."uid"()) AS "get_user_visible_org_ids")))))) WITH CHECK (("template_id" IN ( SELECT "user_creation_templates"."id"
   FROM "public"."user_creation_templates"
  WHERE (("user_creation_templates"."organization_id" IS NULL) OR ("user_creation_templates"."organization_id" IN ( SELECT "public"."get_user_visible_org_ids"("auth"."uid"()) AS "get_user_visible_org_ids"))))));

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. As an authenticated user with a valid business-user mapping, run the
--    exact INSERT the component issues:
--      INSERT INTO user_creation_templates (name, description, created_by)
--      VALUES ('Test template', 'desc', <business_user_id>)
--      RETURNING *;
--    Expected: succeeds (organization_id is NULL on the new row, which now
--    satisfies auth_insert_user_creation_templates's WITH CHECK).
-- 2. Immediately after,
--      SELECT * FROM user_creation_templates WHERE id = '<new id>';
--    Expected: returns the row (previously would return 0 rows for the
--    session that just inserted it, since organization_id IS NULL failed
--    the old auth_select_user_creation_templates USING clause too).
-- 3. INSERT INTO user_template_organizations (template_id, organization_id,
--    sort_order) VALUES ('<new id>', '<some visible org>', 0);
--    Expected: succeeds (previously blocked by
--    auth_manage_user_template_organizations re-checking the parent's
--    organization_id).
-- 4. Live end-to-end: Utilizadores -> Templates -> Create your first
--    template -> fill Name/Description -> Save. Expected: template is
--    created, appears in the list immediately, and can be reopened/edited
--    without a new RLS error.
-- 5. No scope widening check: a template row that DOES have organization_id
--    set to an org the current user cannot see must still be invisible/
--    unmodifiable -- the added clause is only an OR, the original
--    org-membership check is untouched for non-NULL values.
