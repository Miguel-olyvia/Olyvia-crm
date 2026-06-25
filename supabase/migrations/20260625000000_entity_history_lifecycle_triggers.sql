-- Entity History: Lifecycle Triggers — Phase 1
--
-- Adds automatic history entries for entity creation (lead, contact, client)
-- and entity role status transitions. Also tightens anew_entity_history to
-- append-only by layering RESTRICTIVE UPDATE/DELETE policies over the
-- permissive baseline policies.
--
-- Forward-only migration. Do not edit after applying to the remote database.
--
-- Sections:
--   1. fn_write_entity_history()      — shared helper (SECURITY DEFINER)
--   2. trg_lead_created               — AFTER INSERT ON anew_leads
--   3. trg_contact_created            — AFTER INSERT ON anew_contacts
--   4. trg_client_created             — AFTER INSERT ON anew_clients
--   5. trg_entity_role_status_changed — AFTER UPDATE ON anew_entity_roles
--   6. Append-only RLS on anew_entity_history
--   7. Performance indexes

-- ============================================================
-- 1. fn_write_entity_history
-- ============================================================
-- Fire-and-forget helper called from all lifecycle triggers.
-- Resolves the actor using the same pattern used throughout the codebase
-- (current_business_user_id() falling back to the anew_users lookup).
-- Any INSERT failure is swallowed so it never aborts the parent operation.

CREATE OR REPLACE FUNCTION public.fn_write_entity_history(
  p_entity_id  uuid,
  p_change_type text,
  p_field_name  text,
  p_metadata    jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := COALESCE(
    public.current_business_user_id(),
    (
      SELECT au.id
      FROM public.anew_users au
      WHERE au.auth_user_id = auth.uid()
      LIMIT 1
    )
  );

  BEGIN
    INSERT INTO public.anew_entity_history (
      entity_id,
      change_type,
      field_name,
      old_value,
      new_value,
      changed_by,
      metadata
    )
    VALUES (
      p_entity_id,
      p_change_type,
      p_field_name,
      NULL,
      NULL,
      v_actor,
      p_metadata
    );
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_write_entity_history(uuid, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_write_entity_history(uuid, text, text, jsonb)
  TO authenticated, service_role;

-- ============================================================
-- 2. trg_lead_created
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_trg_lead_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_write_entity_history(
    NEW.entity_id,
    'created',
    NULL,
    jsonb_build_object(
      'kind',            'lead',
      'id',              NEW.id,
      'organization_id', NEW.organization_id
    )
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_created ON public.anew_leads;
CREATE TRIGGER trg_lead_created
  AFTER INSERT ON public.anew_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_trg_lead_created();

-- ============================================================
-- 3. trg_contact_created
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_trg_contact_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_write_entity_history(
    NEW.entity_id,
    'created',
    NULL,
    jsonb_build_object(
      'kind',            'contact',
      'id',              NEW.id,
      'organization_id', NEW.organization_id
    )
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_contact_created ON public.anew_contacts;
CREATE TRIGGER trg_contact_created
  AFTER INSERT ON public.anew_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_trg_contact_created();

-- ============================================================
-- 4. trg_client_created
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_trg_client_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_write_entity_history(
    NEW.entity_id,
    'created',
    NULL,
    jsonb_build_object(
      'kind',            'client',
      'id',              NEW.id,
      'organization_id', NEW.organization_id
    )
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_created ON public.anew_clients;
CREATE TRIGGER trg_client_created
  AFTER INSERT ON public.anew_clients
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_trg_client_created();

-- ============================================================
-- 5. trg_entity_role_status_changed
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_trg_entity_role_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_write_entity_history(
    NEW.entity_id,
    'role_status_changed',
    NULL,
    jsonb_build_object(
      'old_status',      OLD.status,
      'new_status',      NEW.status,
      'role',            NEW.role,
      'organization_id', NEW.organization_id
    )
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_entity_role_status_changed ON public.anew_entity_roles;
CREATE TRIGGER trg_entity_role_status_changed
  AFTER UPDATE ON public.anew_entity_roles
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.fn_trg_entity_role_status_changed();

-- ============================================================
-- 6. Append-only RLS on anew_entity_history
-- ============================================================
-- The baseline grants permissive UPDATE and DELETE policies via
-- authenticated_update_anew_entity_history and
-- authenticated_delete_anew_entity_history (both use is_entity_in_user_scope).
-- We layer RESTRICTIVE policies that unconditionally block those operations
-- for authenticated users, matching the append-only pattern established for
-- support_access_log. service_role is unaffected (bypasses RLS).

-- Block UPDATE for authenticated users — history rows are immutable.
DROP POLICY IF EXISTS entity_history_no_update ON public.anew_entity_history;
CREATE POLICY entity_history_no_update
  ON public.anew_entity_history
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Block DELETE for authenticated users — history rows are immutable.
DROP POLICY IF EXISTS entity_history_no_delete ON public.anew_entity_history;
CREATE POLICY entity_history_no_delete
  ON public.anew_entity_history
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================
-- 7. Performance indexes
-- ============================================================
-- Primary read path: fetch ordered history for a given entity.
CREATE INDEX IF NOT EXISTS idx_entity_history_entity_date
  ON public.anew_entity_history (entity_id, created_at DESC);

-- Secondary filter: find all events of a given change type across entities.
CREATE INDEX IF NOT EXISTS idx_entity_history_change_type
  ON public.anew_entity_history (change_type);
