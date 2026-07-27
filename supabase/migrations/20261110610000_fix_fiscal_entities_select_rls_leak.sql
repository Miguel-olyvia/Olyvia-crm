-- Fix: authenticated_select_fiscal_entities was `USING (true)`, letting any
-- authenticated user read every row in fiscal_entities (id, nif_encrypted,
-- nif_hash, legal_name, etc.) regardless of org/entity scope.
--
-- Investigation confirmed every legitimate cross-org NIF-dedup caller
-- (find_entity_matches, resolve_fiscal_entity, the nif_enc_* RPC series, and
-- every Edge Function touching fiscal_entities) is either SECURITY DEFINER or
-- connects with the service_role key, so none of them rely on the caller's
-- own RLS grant on this table and are unaffected by tightening this policy.
--
-- The only real `authenticated`-role readers are frontend paths that already
-- resolve a `fiscal_entity_id` via `anew_entity_fiscal_entities`, scoped to an
-- entity_id the caller has scope over. That sibling table already enforces
-- this via `is_entity_in_user_scope(entity_id, auth.uid())`; fiscal_entities
-- itself has no entity_id/organization_id column, so this policy must join
-- through anew_entity_fiscal_entities to reach the same scope check.

DROP POLICY IF EXISTS "authenticated_select_fiscal_entities" ON "public"."fiscal_entities";

CREATE POLICY "authenticated_select_fiscal_entities" ON "public"."fiscal_entities"
  FOR SELECT TO "authenticated"
  USING (
    EXISTS (
      SELECT 1
      FROM public.anew_entity_fiscal_entities aef
      WHERE aef.fiscal_entity_id = fiscal_entities.id
        AND public.is_entity_in_user_scope(aef.entity_id, auth.uid())
    )
  );
