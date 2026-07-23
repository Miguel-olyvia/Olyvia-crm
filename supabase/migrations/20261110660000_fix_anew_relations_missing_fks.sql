-- OrganizationDetail.tsx's "Relations" tab queries anew_relations with
-- explicit embedded joins naming anew_relations_target_org_id_fkey and
-- anew_relations_source_org_id_fkey, but neither constraint actually exists
-- on this table (confirmed live via pg_constraint — zero FK rows for
-- anew_relations). This makes PostgREST return PGRST200 ("Could not find a
-- relationship...") every time the tab loads — a real, reproducible bug,
-- independently confirmed by 2 of 4 live scope-audit test personas this
-- session.
--
-- The table is currently empty (confirmed live), so adding the FKs is safe.

ALTER TABLE public.anew_relations
  ADD CONSTRAINT anew_relations_source_org_id_fkey
    FOREIGN KEY (source_org_id) REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT anew_relations_target_org_id_fkey
    FOREIGN KEY (target_org_id) REFERENCES public.anew_organizations(id) ON DELETE CASCADE;
