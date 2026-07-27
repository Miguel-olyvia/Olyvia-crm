-- NIF Encryption — Phase 3, Piece 1: find_entity_matches over nif_hash
-- Forward-only migration. Do not fold into the baseline.
--
-- Adds a NEW, ADDITIVE overload of public.find_entity_matches with a 6th
-- parameter, p_nif_hash, so cross-org duplicate detection can match on the
-- HMAC-SHA256 hash (public.fiscal_entities.nif_hash) instead of the plaintext
-- NIF. The database has no HMAC key: callers (Edge Functions, via
-- supabase/functions/_shared/nifCrypto.ts) compute p_nif_hash themselves and
-- pass it in.
--
-- Backward compatibility — deliberately additive, no DROP:
--   The existing 5-arg signature
--     find_entity_matches(uuid, text, text, text, text)
--   is a DIFFERENT function signature from the new 6-arg one
--     find_entity_matches(uuid, text, text, text, text, text)
--   Postgres treats these as distinct overloads. CREATE OR REPLACE on the
--   6-arg signature only ever creates/replaces that overload; it cannot
--   touch, and does not require dropping, the 5-arg one.
--
--   This matters because at least one live caller has NOT been migrated yet:
--   src/utils/orgEntity.ts -> findEntityMatches() still calls the RPC with
--   exactly p_org_id/p_email/p_phone/p_nif/p_country_code (5 named args, no
--   p_nif_hash). Dropping the 5-arg overload here would break that caller
--   immediately (function-not-found at the PostgREST/RPC layer).
--
--   Overload resolution for the still-unmigrated 5-arg call is unambiguous:
--   Postgres's "fewest defaulted parameters wins" tie-break means a call
--   naming exactly the 5 original parameters always resolves to the 5-arg
--   function (0 defaults needed) rather than the 6-arg one (which would need
--   1 default filled for p_nif_hash). So both overloads can coexist safely
--   without ambiguity errors, and each caller (migrated or not) resolves to
--   the right one automatically.
--
--   The 5-arg overload (and its `fe.nif = v_nif` plaintext match) stays alive
--   on purpose until every caller has migrated to pass p_nif_hash. Removing
--   it is an explicit later-phase cleanup, not part of this migration.
--
-- Body: bit-for-bit identical to the baseline 5-arg function
-- (supabase/migrations/20260615130000_baseline_new_database.sql, ~line 2310)
-- except for the nif branch of the `candidates` CTE, which now prefers
-- fe.nif_hash = p_nif_hash (+ country_code, since hashNif() normalizes only
-- the digits and does not incorporate country) and falls back to the legacy
-- plaintext compare only when the caller did not supply p_nif_hash. No other
-- logic (visibility, scope ranking, RLS) is touched.

CREATE OR REPLACE FUNCTION "public"."find_entity_matches"(
  "p_org_id" "uuid",
  "p_email" "text" DEFAULT NULL::"text",
  "p_phone" "text" DEFAULT NULL::"text",
  "p_nif" "text" DEFAULT NULL::"text",
  "p_country_code" "text" DEFAULT 'PT'::"text",
  "p_nif_hash" "text" DEFAULT NULL::"text"
) RETURNS TABLE("entity_id" "uuid", "scope" "text", "primary_org_id" "uuid", "primary_org_name" "text", "owner_org_accessible" boolean, "match_field" "text", "display_name" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text := nullif(btrim(lower(p_email)), '');
  v_nif text := nullif(btrim(p_nif), '');
  v_nif_hash text := nullif(btrim(p_nif_hash), '');
  v_phone_digits text := nullif(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g'), '');
  v_country text := coalesce(nullif(btrim(p_country_code), ''), 'PT');
  v_visible uuid[];
  v_group uuid[];
begin
  if p_org_id is null then return; end if;
  if v_email is null and v_nif is null and v_nif_hash is null and (v_phone_digits is null or length(v_phone_digits) < 7) then
    return;
  end if;

  select array(select public.get_user_visible_org_ids(auth.uid())) into v_visible;
  select array(select public.get_org_group_ids(p_org_id)) into v_group;

  return query
  with candidates as (
    -- email match
    select ee.entity_id, 'email'::text as match_field
    from public.anew_entity_emails ee
    where v_email is not null and lower(ee.email) = v_email
    union
    -- nif match: prefer nif_hash (already computed by the caller); fall back
    -- to legacy plaintext compare only while nif_hash is not supplied.
    select aef.entity_id, 'nif'::text
    from public.anew_entity_fiscal_entities aef
    join public.fiscal_entities fe on fe.id = aef.fiscal_entity_id
    where (
      (v_nif_hash is not null and fe.nif_hash = v_nif_hash and fe.country_code = v_country)
      or
      (v_nif_hash is null and v_nif is not null and fe.nif = v_nif and fe.country_code = v_country)
    )
    union
    -- phone match (suffix, min 7 digits)
    select ep.entity_id, 'phone'::text
    from public.anew_entity_phones ep
    where v_phone_digits is not null
      and length(regexp_replace(coalesce(ep.phone_number,''), '[^0-9]', '', 'g')) >= 7
      and (
        regexp_replace(coalesce(ep.phone_number,''), '[^0-9]', '', 'g') like '%' || v_phone_digits
        or v_phone_digits like '%' || regexp_replace(coalesce(ep.phone_number,''), '[^0-9]', '', 'g')
      )
  ),
  primaries as (
    select l.entity_id, l.organization_id as primary_org_id
    from public.anew_entity_org_links l
    where l.is_primary = true
  ),
  enriched as (
    select
      c.entity_id,
      c.match_field,
      p.primary_org_id,
      case
        when exists (select 1 from public.anew_entity_org_links l2
                     where l2.entity_id = c.entity_id and l2.organization_id = p_org_id)
          then 'same_org'
        when p.primary_org_id = ANY(v_group) and p.primary_org_id = ANY(v_visible)
          then 'group'
        else null
      end as scope
    from candidates c
    left join primaries p on p.entity_id = c.entity_id
  ),
  ranked as (
    select
      e.entity_id,
      e.scope,
      e.primary_org_id,
      e.match_field,
      row_number() over (
        partition by e.entity_id
        order by case e.scope when 'same_org' then 1 when 'group' then 2 else 3 end
      ) as rn
    from enriched e
    where e.scope is not null
  )
  select
    r.entity_id,
    r.scope,
    r.primary_org_id,
    org.name as primary_org_name,
    (r.primary_org_id = ANY(v_visible)) as owner_org_accessible,
    r.match_field,
    ent.display_name
  from ranked r
  left join public.anew_organizations org on org.id = r.primary_org_id
  left join public.anew_entities ent on ent.id = r.entity_id
  where r.rn = 1
  limit 50;
end;
$$;

COMMENT ON FUNCTION "public"."find_entity_matches"("uuid", "text", "text", "text", "text", "text") IS
  'Phase 3 (NIF encryption) overload: adds p_nif_hash so callers can match public.fiscal_entities.nif_hash instead of the plaintext nif column. Falls back to legacy plaintext nif compare when p_nif_hash is not supplied. Coexists with the original 5-arg find_entity_matches(uuid, text, text, text, text) for callers not yet migrated; do not drop the 5-arg overload until all callers pass p_nif_hash.';

-- Grants — mirror the existing 5-arg overload's ACLs exactly
-- (source: supabase/migrations/20260615130000_baseline_new_database.sql, ~line 28426-28428:
--   GRANT ALL ON FUNCTION public.find_entity_matches(...) TO anon;
--   GRANT ALL ON FUNCTION public.find_entity_matches(...) TO authenticated;
--   GRANT ALL ON FUNCTION public.find_entity_matches(...) TO service_role;
-- Every Postgres function overload has its own independent ACL entry, so the
-- new 6-arg overload needs its own GRANTs — it does not inherit the 5-arg
-- overload's grants.)

GRANT ALL ON FUNCTION "public"."find_entity_matches"("uuid", "text", "text", "text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."find_entity_matches"("uuid", "text", "text", "text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_entity_matches"("uuid", "text", "text", "text", "text", "text") TO "service_role";
