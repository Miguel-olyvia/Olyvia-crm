-- ============================================================
-- Persist marketing origin (source / source_id / campaign_id) from
-- anew_leads onto anew_clients so it survives the lead -> client
-- conversion, across every conversion path in the codebase.
--
-- anew_clients already has source_type/source_id, but those columns record
-- the CONVERSION origin (which record type/row produced this client —
-- 'lead'/'contact'/'contract'/'workflow_automation' + that record's id),
-- not the original marketing origin (which lead_source/campaign generated
-- the lead in the first place). This migration adds a separate,
-- unambiguous set of columns for that: origin_source, origin_source_id
-- (-> lead_sources), origin_campaign_id (-> campaigns).
--
-- fn_resolve_client_marketing_origin() is a shared, best-effort resolver
-- used both by this migration's backfill and by the conversion RPCs/
-- triggers added in the following migrations, so every conversion path
-- resolves the origin the exact same way: prefer the lead that directly
-- gave rise to a contact tied to this entity (via anew_contacts.
-- source_lead_id), else any lead directly on this entity, first scoped to
-- the given organization_id, then unscoped as a last resort.
-- ============================================================

ALTER TABLE public.anew_clients
  ADD COLUMN IF NOT EXISTS origin_source varchar,
  ADD COLUMN IF NOT EXISTS origin_source_id uuid,
  ADD COLUMN IF NOT EXISTS origin_campaign_id uuid;

ALTER TABLE public.anew_clients
  ADD CONSTRAINT anew_clients_origin_source_id_fkey
    FOREIGN KEY (origin_source_id) REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  ADD CONSTRAINT anew_clients_origin_campaign_id_fkey
    FOREIGN KEY (origin_campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_anew_clients_origin_source_id ON public.anew_clients USING btree (origin_source_id);
CREATE INDEX IF NOT EXISTS idx_anew_clients_origin_campaign_id ON public.anew_clients USING btree (origin_campaign_id);

CREATE OR REPLACE FUNCTION public.fn_resolve_client_marketing_origin(
  p_entity_id uuid,
  p_organization_id uuid DEFAULT NULL
) RETURNS TABLE(origin_source text, origin_source_id uuid, origin_campaign_id uuid)
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT source, source_id, campaign_id FROM (
    SELECT l.source, l.source_id, l.campaign_id, l.created_at, 1 AS via_priority
    FROM public.anew_contacts c
    JOIN public.anew_leads l ON l.id = c.source_lead_id
    WHERE c.entity_id = p_entity_id AND c.source_lead_id IS NOT NULL
      AND (p_organization_id IS NULL OR c.organization_id = p_organization_id)
    UNION ALL
    SELECT l.source, l.source_id, l.campaign_id, l.created_at, 2 AS via_priority
    FROM public.anew_leads l
    WHERE l.entity_id = p_entity_id
      AND (p_organization_id IS NULL OR l.organization_id = p_organization_id)
    UNION ALL
    SELECT l.source, l.source_id, l.campaign_id, l.created_at, 3 AS via_priority
    FROM public.anew_contacts c
    JOIN public.anew_leads l ON l.id = c.source_lead_id
    WHERE c.entity_id = p_entity_id AND c.source_lead_id IS NOT NULL
    UNION ALL
    SELECT l.source, l.source_id, l.campaign_id, l.created_at, 4 AS via_priority
    FROM public.anew_leads l
    WHERE l.entity_id = p_entity_id
  ) x
  ORDER BY via_priority ASC, created_at ASC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.fn_resolve_client_marketing_origin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_resolve_client_marketing_origin(uuid, uuid) TO authenticated, service_role;

-- Backfill (idempotente)
UPDATE public.anew_clients c
SET origin_source = l.source, origin_source_id = l.source_id, origin_campaign_id = l.campaign_id
FROM public.anew_leads l
WHERE c.source_type = 'lead' AND c.source_id = l.id
  AND c.origin_source IS NULL AND c.origin_source_id IS NULL AND c.origin_campaign_id IS NULL;

UPDATE public.anew_clients c
SET origin_source = l.source, origin_source_id = l.source_id, origin_campaign_id = l.campaign_id
FROM public.anew_contacts ct
JOIN public.anew_leads l ON l.id = ct.source_lead_id
WHERE c.source_type = 'contact' AND c.source_id = ct.id AND ct.source_lead_id IS NOT NULL
  AND c.origin_source IS NULL AND c.origin_source_id IS NULL AND c.origin_campaign_id IS NULL;

-- Note: the UPDATE target's alias cannot be referenced as an argument to a
-- set-returning function placed directly in its own FROM clause (not even
-- with LATERAL — LATERAL only correlates against OTHER items in the same
-- FROM list, not the UPDATE target). So resolve via a subquery that runs the
-- LATERAL join against its own copy of anew_clients, then join that back to
-- the UPDATE target by id.
UPDATE public.anew_clients c
SET origin_source = sub.origin_source, origin_source_id = sub.origin_source_id, origin_campaign_id = sub.origin_campaign_id
FROM (
  SELECT ac.id, r.origin_source, r.origin_source_id, r.origin_campaign_id
  FROM public.anew_clients ac
  CROSS JOIN LATERAL public.fn_resolve_client_marketing_origin(ac.entity_id, ac.organization_id) r
  WHERE ac.source_type IN ('contract', 'workflow_automation', 'contact')
    AND ac.origin_source IS NULL AND ac.origin_source_id IS NULL AND ac.origin_campaign_id IS NULL
    AND r.origin_source IS NOT NULL
) sub
WHERE c.id = sub.id;
