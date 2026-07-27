-- ============================================================
-- Fix: soft_delete_business_entity had two ambiguous overloads --
-- (p_kind text, p_id uuid) and (p_kind text, p_id uuid, p_actor_id
-- uuid DEFAULT NULL). Because the 3rd param has a DEFAULT, every call
-- site using just (p_kind, p_id) -- Deals.tsx, ClientContracts.tsx,
-- Quotes.tsx, Proposals.tsx -- was ambiguous. Confirmed live via HTTP:
-- PostgREST returned HTTP 300 PGRST203 "Could not choose the best
-- candidate function". supabase-js swallowed this without surfacing
-- an error toast, so the individual-delete action on Deals (and,
-- transitively, likely Contracts/Quotes/Proposals) silently did
-- nothing when clicked -- no DB write, no audit row, no user-visible
-- error. Fix: dropped the 2-arg overload, kept the 3-arg one (richer
-- actor-resolution logic, including service_role support); its
-- DEFAULT NULL for p_actor_id preserves exact behavior for every
-- existing 2-named-arg frontend call site.
-- ============================================================

CREATE OR REPLACE FUNCTION public.soft_delete_business_entity(p_kind text, p_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_request_role text := current_setting('request.jwt.claim.role', true);
  v_effective_auth uuid;
  v_actor uuid;
BEGIN
  -- Actor resolution:
  --  1) An authenticated caller ALWAYS uses its own auth.uid(); it can never
  --     override its identity via p_actor_id.
  --  2) A service_role caller (Edge Function that already validated the human
  --     user in TypeScript, e.g. buildExecCtx) may supply p_actor_id.
  --  3) Otherwise authentication is required.
  IF v_auth IS NOT NULL THEN
    v_effective_auth := v_auth;
  ELSIF v_request_role = 'service_role' AND p_actor_id IS NOT NULL THEN
    v_effective_auth := p_actor_id;
  ELSE
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_actor := public.resolve_business_user_id(v_effective_auth);
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN public._soft_delete_business_entity_impl(p_kind, p_id, v_actor, v_effective_auth);
END;
$function$
;
