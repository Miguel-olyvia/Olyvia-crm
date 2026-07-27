-- Migration: restrict the 4 broad "Users access organization ..." scheduling
-- policies to SELECT only
--
-- Why: found while auditing auto-schedule's service_role usage for the
-- blast-radius reduction plan (slide 60, Phase 2). Each of
-- schedule_items / schedule_resources / schedule_boards /
-- schedule_item_assignees has TWO permissive policy layers, OR'd together:
--
--   1. Granular policies (correct): e.g. "Users can create schedule items"
--      requires has_scheduling_permission(uid, 'scheduling.items.create')
--      AND org visibility.
--   2. "Users access organization ..." (this migration's target): no `FOR`
--      clause (= FOR ALL) and no `TO` clause, checking ONLY org visibility
--      with zero permission gate.
--
-- Because Postgres OR's all applicable permissive policies together, and a
-- FOR ALL policy's USING clause is also used as the WITH CHECK for
-- INSERT/UPDATE, layer 2 lets ANY authenticated user who can see the
-- organization create/edit/delete schedule items, resources, boards and
-- assignees — with zero scheduling-specific permission — completely
-- defeating the granular has_scheduling_permission checks in layer 1.
--
-- Fix: narrow layer 2 to FOR SELECT only (and add the TO authenticated
-- clause the granular policies already use). This does not remove any read
-- access anyone has today — it only removes the accidental INSERT/UPDATE/
-- DELETE bypass, leaving write authorization to the granular
-- has_scheduling_permission policies as originally intended.

DROP POLICY IF EXISTS "Users access organization items" ON "public"."schedule_items";
CREATE POLICY "Users access organization items" ON "public"."schedule_items"
FOR SELECT TO "authenticated"
USING (("organization_id" IN (SELECT "public"."get_user_visible_org_ids"("auth"."uid"()))));

DROP POLICY IF EXISTS "Users access organization resources" ON "public"."schedule_resources";
CREATE POLICY "Users access organization resources" ON "public"."schedule_resources"
FOR SELECT TO "authenticated"
USING (("organization_id" IN (SELECT "public"."get_user_visible_org_ids"("auth"."uid"()))));

DROP POLICY IF EXISTS "Users access organization boards" ON "public"."schedule_boards";
CREATE POLICY "Users access organization boards" ON "public"."schedule_boards"
FOR SELECT TO "authenticated"
USING (("organization_id" IN (SELECT "public"."get_user_visible_org_ids"("auth"."uid"()))));

DROP POLICY IF EXISTS "Users access organization item assignees" ON "public"."schedule_item_assignees";
CREATE POLICY "Users access organization item assignees" ON "public"."schedule_item_assignees"
FOR SELECT TO "authenticated"
USING (
  ("item_id" IN (
    SELECT "si"."id"
    FROM "public"."schedule_items" "si"
    WHERE ("si"."organization_id" IN (SELECT "public"."get_user_visible_org_ids"("auth"."uid"())))
  ))
);
