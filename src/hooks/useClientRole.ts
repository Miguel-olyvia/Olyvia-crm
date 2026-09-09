import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getSessionContext,
  setSessionContext,
  clearSessionContext,
  type SessionContext,
} from "@/lib/auth/sessionContext";

export type ClientAccessKind = "loading" | "anonymous" | "client_only" | "crm_user" | "hybrid" | "no_profile";
export type { SessionContext };

// Portal vs CRM is decided by presence/absence of the `client` role.
// Any other role grants CRM access; per-page granularity is enforced by
// usePermissions/ProtectedRoute. Do NOT reintroduce a hard-coded CRM role
// whitelist — it silently locks out every functional role created later.

/**
 * Resolves a user's access kind from the anew_users → anew_memberships →
 * anew_roles chain. Single source of truth shared by the hook and the static
 * login helper. Supabase surfaces failures as `error` (not throws); missing
 * data is treated conservatively, matching the previous inline behaviour.
 *
 * - no auth id            → "anonymous"
 * - no anew_users profile → "no_profile"
 * - profile, no memberships → "crm_user" (self-registration onboarding)
 * - only `client` role    → "client_only"
 * - `client` + other role → "hybrid"
 * - only other roles      → "crm_user"
 */
export async function fetchAccessKind(authUserId: string | null | undefined): Promise<ClientAccessKind> {
  if (!authUserId) return "anonymous";

  const { data: anewUser } = await (supabase as any)
    .from("anew_users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (!anewUser?.id) return "no_profile";

  const { data: memberships } = await supabase
    .from("anew_memberships")
    .select("role_id")
    .eq("user_id", anewUser.id)
    .eq("status", "active");

  if (!memberships || memberships.length === 0) return "crm_user";

  const roleIds = memberships.map((m) => m.role_id);
  const { data: roles } = await supabase
    .from("anew_roles")
    .select("code")
    .in("id", roleIds);

  const roleCodes = (roles || []).map((r) => r.code).filter(Boolean) as string[];
  const hasClientRole = roleCodes.includes("client");
  const hasNonClientRole = roleCodes.some((code) => code !== "client");

  if (hasClientRole && !hasNonClientRole) return "client_only";
  if (hasClientRole && hasNonClientRole) return "hybrid";
  if (hasNonClientRole) return "crm_user";
  return "no_profile";
}

/**
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
  const [userId, setUserId] = useState<string | null>(null);
  // Bumped by chooseContext/switchContext so a hybrid's stored choice is
  // re-read on the next render (getSessionContext runs fresh each render).
  const [contextVersion, setContextVersion] = useState(0);

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
          if (!cancelled) setUserId(null);
          applyKind("anonymous");
          if (!cancelled) {
            initialLoadDoneRef.current = true;
            setLoading(false);
          }
          return;
        }

        if (shouldShowLoading && !cancelled) setLoading(true);

        const kind = await fetchAccessKind(uid);

        lastCheckedUserIdRef.current = uid;
        if (!cancelled) setUserId(uid);
        applyKind(kind);
        if (!cancelled) {
          initialLoadDoneRef.current = true;
          if (shouldShowLoading) setLoading(false);
        }
      } catch {
        // Don't flip an already-resolved access kind to "no_profile" because of
        // a transient revalidation error on tab refocus.
        if (shouldShowLoading) {
          lastCheckedUserIdRef.current = uid;
          if (!cancelled) setUserId(uid);
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
        // Drop any surface choice so the next login asks again ("sair e voltar").
        clearSessionContext();
        if (!cancelled) {
          setUserId(null);
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

  // Context picker (Option 2). Only a `hybrid` user has a choice to make; every
  // other kind has a single, fixed surface. `contextVersion` is referenced so
  // the choice is re-read after chooseContext/switchContext.
  void contextVersion;
  const chosenContext = accessKind === "hybrid" ? getSessionContext(userId) : null;
  const activeContext: SessionContext | null =
    accessKind === "client_only"
      ? "portal"
      : accessKind === "crm_user"
        ? "crm"
        : accessKind === "hybrid"
          ? chosenContext
          : null;
  const needsContextChoice = accessKind === "hybrid" && chosenContext === null;
  const portalAllowed = accessKind === "client_only" || (accessKind === "hybrid" && chosenContext === "portal");
  const crmAllowed = accessKind === "crm_user" || (accessKind === "hybrid" && chosenContext === "crm");

  const chooseContext = (ctx: SessionContext) => {
    if (userId) setSessionContext(userId, ctx);
    setContextVersion((v) => v + 1);
  };
  const switchContext = () => {
    clearSessionContext();
    setContextVersion((v) => v + 1);
  };

  return {
    accessKind,
    isClient: isClientOnly,
    isClientOnly,
    isCrmAllowed,
    isAuthenticated,
    loading,
    // Option 2 — surface picker for hybrid (CRM + client) accounts.
    activeContext,
    needsContextChoice,
    portalAllowed,
    crmAllowed,
    chooseContext,
    switchContext,
  };
}

/**
 * Lightweight static check — call once after login to decide redirect.
 * Kept for callers that only need the client/not-client bit; hybrid users are
 * NOT client-only, so they resolve to `false` here and are routed by the
 * context picker instead (see fetchAccessKind + getSessionContext).
 */
export async function checkIsClientRole(authUserId: string): Promise<boolean> {
  try {
    return (await fetchAccessKind(authUserId)) === "client_only";
  } catch {
    return false;
  }
}
