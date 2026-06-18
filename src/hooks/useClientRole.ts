import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ClientAccessKind = "loading" | "anonymous" | "client_only" | "crm_user" | "hybrid" | "no_profile";

// Portal vs CRM is decided by presence/absence of the `client` role.
// Any other role grants CRM access; per-page granularity is enforced by
// usePermissions/ProtectedRoute. Do NOT reintroduce a hard-coded CRM role
// whitelist — it silently locks out every functional role created later.

/**
 * Checks if the currently authenticated user has the "client" role.
 * Uses anew_users → anew_memberships → anew_roles chain.
 *
 * Hardened against tab refocus: Supabase re-emits SIGNED_IN and TOKEN_REFRESHED
 * when the browser tab regains focus. Reacting to those events with
 * setLoading(true) would collapse the route guard into a spinner, remount the
 * current page, and discard in-memory state (e.g. unsaved QuoteBuilder edits).
 * We therefore (a) ignore TOKEN_REFRESHED with a valid session, (b) ignore
 * SIGNED_IN when the user id has not changed, and (c) revalidate silently
 * without toggling `loading` outside the first load and real user changes.
 */
export function useClientRole() {
  const [accessKind, setAccessKind] = useState<ClientAccessKind>("loading");
  const [loading, setLoading] = useState(true);

  // Refs (not state) so the onAuthStateChange callback never reads stale values.
  const lastCheckedUserIdRef = useRef<string | null>(null);
  const lastResolvedAccessKindRef = useRef<ClientAccessKind | null>(null);
  const initialLoadDoneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    function applyKind(next: ClientAccessKind) {
      if (cancelled) return;
      if (lastResolvedAccessKindRef.current !== next) {
        lastResolvedAccessKindRef.current = next;
        setAccessKind(next);
      }
    }

    async function check(uid: string | null) {
      const isFirstLoad = !initialLoadDoneRef.current;
      const isUserChange = uid !== lastCheckedUserIdRef.current;
      const shouldShowLoading = isFirstLoad || isUserChange;

      try {
        if (!uid) {
          lastCheckedUserIdRef.current = null;
          applyKind("anonymous");
          if (!cancelled) {
            initialLoadDoneRef.current = true;
            setLoading(false);
          }
          return;
        }

        if (shouldShowLoading && !cancelled) setLoading(true);

        // Get anew_user id
        const { data: anewUser } = await (supabase as any)
          .from("anew_users")
          .select("id")
          .eq("auth_user_id", uid)
          .maybeSingle();

        if (!anewUser?.id) {
          lastCheckedUserIdRef.current = uid;
          applyKind("no_profile");
          if (!cancelled) {
            initialLoadDoneRef.current = true;
            if (shouldShowLoading) setLoading(false);
          }
          return;
        }

        // Get all active memberships
        const { data: memberships } = await supabase
          .from("anew_memberships")
          .select("role_id")
          .eq("user_id", anewUser.id)
          .eq("status", "active");

        if (!memberships || memberships.length === 0) {
          // User exists in anew_users but has no memberships yet — this is the
          // self-registration onboarding state (user needs to create their first org).
          // Treat as crm_user so they can access the CRM and complete onboarding.
          lastCheckedUserIdRef.current = uid;
          applyKind("crm_user");
          if (!cancelled) {
            initialLoadDoneRef.current = true;
            if (shouldShowLoading) setLoading(false);
          }
          return;
        }

        const roleIds = memberships.map(m => m.role_id);
        const { data: roles } = await supabase
          .from("anew_roles")
          .select("code")
          .in("id", roleIds);

        const roleCodes = (roles || []).map(r => r.code).filter(Boolean) as string[];
        const hasClientRole = roleCodes.includes("client");
        const hasNonClientRole = roleCodes.some(code => code !== "client");
        const nextKind: ClientAccessKind = hasClientRole && !hasNonClientRole
          ? "client_only"
          : hasClientRole && hasNonClientRole
            ? "hybrid"
            : hasNonClientRole
              ? "crm_user"
              : "no_profile";

        lastCheckedUserIdRef.current = uid;
        applyKind(nextKind);
        if (!cancelled) {
          initialLoadDoneRef.current = true;
          if (shouldShowLoading) setLoading(false);
        }
      } catch {
        // Don't flip an already-resolved access kind to "no_profile" because of
        // a transient revalidation error on tab refocus.
        if (shouldShowLoading) {
          lastCheckedUserIdRef.current = uid;
          applyKind("no_profile");
          if (!cancelled) {
            initialLoadDoneRef.current = true;
            setLoading(false);
          }
        }
      }
    }

    supabase.auth.getUser().then(({ data: { user } }) => check(user?.id ?? null));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUid = session?.user?.id ?? null;

      if (event === "SIGNED_OUT") {
        lastCheckedUserIdRef.current = null;
        lastResolvedAccessKindRef.current = "anonymous";
        if (!cancelled) {
          setAccessKind("anonymous");
          setLoading(false);
        }
        return;
      }

      if (event === "TOKEN_REFRESHED" && session) {
        // Identity unchanged — ignore. Avoids spinner cascade on tab refocus.
        return;
      }

      if (event === "SIGNED_IN") {
        // Same-user re-emit on tab refocus → no-op.
        if (nextUid && nextUid === lastCheckedUserIdRef.current && initialLoadDoneRef.current) {
          return;
        }
        check(nextUid);
        return;
      }

      if (event === "USER_UPDATED") {
        // Revalidate silently (no spinner) for the same user; treat as user
        // change only if id differs.
        check(nextUid);
        return;
      }

      // INITIAL_SESSION and other events: revalidate without forcing spinner
      // beyond the first-load gate inside check().
      check(nextUid);
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  const isClientOnly = accessKind === "client_only";
  const isCrmAllowed = accessKind === "crm_user" || accessKind === "hybrid";
  const isAuthenticated = accessKind !== "anonymous" && accessKind !== "loading";

  return { accessKind, isClient: isClientOnly, isClientOnly, isCrmAllowed, isAuthenticated, loading };
}

/**
 * Lightweight static check — call once after login to decide redirect.
 */
export async function checkIsClientRole(authUserId: string): Promise<boolean> {
  try {
    const { data: anewUser } = await (supabase as any)
      .from("anew_users")
      .select("id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (!anewUser?.id) return false;

    const { data: memberships } = await supabase
      .from("anew_memberships")
      .select("role_id")
      .eq("user_id", anewUser.id)
      .eq("status", "active");

    if (!memberships || memberships.length === 0) return false;

    const roleIds = memberships.map(m => m.role_id);
    const { data: roles } = await supabase
      .from("anew_roles")
      .select("code")
      .in("id", roleIds);

    // Keep login redirects aligned with ClientRouteGuard: hybrid CRM+client users stay in CRM.
    if (!roles || roles.length === 0) return false;
    return roles.every(r => r.code === "client");
  } catch {
    return false;
  }
}
