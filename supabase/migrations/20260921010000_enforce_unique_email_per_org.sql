-- ============================================================
-- Enforce: two DIFFERENT entities can never share the same email within
-- the same organization (matches HubSpot's dedup policy, per explicit
-- product decision). Existing violations (11 pairs found, real pre-
-- existing data) are left untouched -- merging entities is a business
-- decision (which one is canonical, what happens to its leads/deals)
-- that must be made explicitly, not automated here. This only blocks
-- NEW violations going forward.
--
-- anew_entity_emails has no organization_id column directly -- org
-- scoping is via anew_entity_org_links (entity_id, organization_id),
-- a many-to-many relation, so a plain UNIQUE index can't express this
-- constraint. Enforced instead via a trigger on both tables:
--   1. anew_entity_emails AFTER INSERT/UPDATE -- checks the new/changed
--      email against every other entity already linked to any of this
--      entity's orgs.
--   2. anew_entity_org_links AFTER INSERT -- checks this entity's
--      existing emails against every other entity already in the
--      newly-linked org (covers the case where an email existed first
--      and an org link is added afterward).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_check_email_unique_within_org(p_entity_id uuid, p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conflict_entity uuid;
  v_conflict_org uuid;
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RETURN;
  END IF;

  SELECT other_email.entity_id, link.organization_id
  INTO   v_conflict_entity, v_conflict_org
  FROM   public.anew_entity_emails other_email
  JOIN   public.anew_entity_org_links link ON link.entity_id = other_email.entity_id
  WHERE  lower(btrim(other_email.email)) = lower(btrim(p_email))
    AND  other_email.entity_id <> p_entity_id
    AND  link.organization_id IN (
           SELECT organization_id FROM public.anew_entity_org_links WHERE entity_id = p_entity_id
         )
  LIMIT 1;

  IF v_conflict_entity IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe outra entidade (%) com este email na mesma organização (%)',
      v_conflict_entity, v_conflict_org
      USING ERRCODE = 'unique_violation',
            HINT = 'Reutilize a entidade existente em vez de criar uma nova com o mesmo email.';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_trg_check_email_unique_on_email_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only check when the email itself is being set/changed. On UPDATE, an
  -- unrelated column change (e.g. is_verified, email_type) on an existing
  -- row that happens to already be part of one of the pre-existing
  -- violation pairs must not suddenly start failing.
  IF TG_OP = 'UPDATE' AND NEW.email IS NOT DISTINCT FROM OLD.email THEN
    RETURN NEW;
  END IF;
  PERFORM public.fn_check_email_unique_within_org(NEW.entity_id, NEW.email);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_trg_check_email_unique_on_org_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
BEGIN
  FOR v_email IN
    SELECT email FROM public.anew_entity_emails WHERE entity_id = NEW.entity_id
  LOOP
    PERFORM public.fn_check_email_unique_within_org(NEW.entity_id, v_email);
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_check_email_unique_on_email_write ON public.anew_entity_emails;
CREATE TRIGGER trg_check_email_unique_on_email_write
  AFTER INSERT OR UPDATE ON public.anew_entity_emails
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_check_email_unique_on_email_write();

DROP TRIGGER IF EXISTS trg_check_email_unique_on_org_link ON public.anew_entity_org_links;
CREATE TRIGGER trg_check_email_unique_on_org_link
  AFTER INSERT ON public.anew_entity_org_links
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_check_email_unique_on_org_link();
