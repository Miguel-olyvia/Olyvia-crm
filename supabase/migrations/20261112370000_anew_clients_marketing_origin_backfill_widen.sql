-- ============================================================
-- Widen the marketing-origin backfill from 20261112360000.
--
-- That migration's heuristic-resolver UPDATE (the 3rd of its 3 backfill
-- statements) only ran for anew_clients.source_type IN ('contract',
-- 'workflow_automation', 'contact'). In production this left out:
--   - source_type = 'manual' and 'migration' (and NULL) clients entirely —
--     never attempted, even though fn_resolve_client_marketing_origin()
--     doesn't actually depend on source_type at all, only entity_id/
--     organization_id.
--   - source_type = 'lead' / 'contact' clients whose direct-join backfill
--     (statements 1 and 2 of 20261112360000) found no match because the
--     referenced anew_leads/anew_contacts row had since been hard-deleted
--     (a dangling source_id / source_lead_id) — the direct join silently
--     matches zero rows in that case, but a *different* still-live lead
--     sharing the same entity_id may well carry the real origin (e.g. many
--     clients originated from a 'public_form'/'website' lead that went
--     through an intermediate contact whose source_lead_id link later broke).
--
-- Also fixes an incompleteness in the original condition, which only
-- required r.origin_source IS NOT NULL to accept a resolver match — missing
-- rows where the resolver found a lead with only origin_source_id and/or
-- origin_campaign_id set (source text NULL but a structured lead_sources FK
-- or campaign present).
--
-- Purely a backfill widening: RPCs/trigger already resolve origin correctly
-- at conversion time going forward and are not touched here. Idempotent
-- (guarded by the same "still all-null" condition), safe to re-run.
-- ============================================================

UPDATE public.anew_clients c
SET origin_source = sub.origin_source, origin_source_id = sub.origin_source_id, origin_campaign_id = sub.origin_campaign_id
FROM (
  SELECT ac.id, r.origin_source, r.origin_source_id, r.origin_campaign_id
  FROM public.anew_clients ac
  CROSS JOIN LATERAL public.fn_resolve_client_marketing_origin(ac.entity_id, ac.organization_id) r
  WHERE ac.origin_source IS NULL AND ac.origin_source_id IS NULL AND ac.origin_campaign_id IS NULL
    AND (r.origin_source IS NOT NULL OR r.origin_source_id IS NOT NULL OR r.origin_campaign_id IS NOT NULL)
) sub
WHERE c.id = sub.id;
