-- Backfill resource_districts from resource_service_areas.postal_code_prefix,
-- resolving each prefix to its most-frequent real district among matching
-- postal_codes rows. Deduped by (resource_id, district_id) — several prefixes
-- for the same resource commonly resolve to the same district, keeping the
-- highest priority and OR-ing is_active across the source rows.
--
-- Dry-run confirmed live: all 10 existing resource_service_areas rows across
-- 2 resources resolve to a district (no NULLs), collapsing to 3 distinct
-- (resource_id, district_id) pairs.

INSERT INTO public.resource_districts (resource_id, district_id, priority, is_active)
SELECT
  resolved.resource_id,
  resolved.resolved_district_id,
  max(resolved.priority) AS priority,
  bool_or(resolved.is_active) AS is_active
FROM (
  SELECT
    rsa.resource_id,
    rsa.priority,
    rsa.is_active,
    (
      SELECT pc.district_id
      FROM public.postal_codes pc
      WHERE pc.postal_code = rsa.postal_code_prefix
        AND pc.district_id IS NOT NULL
      GROUP BY pc.district_id
      ORDER BY count(*) DESC
      LIMIT 1
    ) AS resolved_district_id
  FROM public.resource_service_areas rsa
) resolved
WHERE resolved.resolved_district_id IS NOT NULL
GROUP BY resolved.resource_id, resolved.resolved_district_id
ON CONFLICT (resource_id, district_id) DO NOTHING;
