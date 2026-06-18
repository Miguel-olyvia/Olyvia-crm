/**
 * Identity boundary helper.
 *
 * Two identifiers exist in this system, and they are intentionally separate:
 *  - auth.users.id (a.k.a. auth_user_id): authentication identity. Used by JWT,
 *    auth.uid() in RLS, and the Supabase auth subsystem.
 *  - anew_users.id: business identity. Canonical for business columns like
 *    created_by, assigned_to, user_id, ownership relations.
 *
 * This helper resolves a business user id from the current auth context (or an
 * explicit auth uid). It MUST be called at every write boundary that persists
 * a business identifier, so that we never store an auth_user_id where a
 * business id is expected.
 *
 * Cache invalidation:
 *  The in-memory cache is cleared on auth state changes that may invalidate
 *  the (auth_user_id -> business_user_id) mapping for the current session:
 *    - SIGNED_OUT: user logged out
 *    - USER_UPDATED: user metadata or identity changed
 *  TOKEN_REFRESHED is intentionally NOT in this list: a token refresh does not
 *  change the auth_user_id, therefore the business mapping is still valid.
 *  Supabase re-emits TOKEN_REFRESHED on tab refocus / session revalidation, so
 *  clearing the cache here would force a round-trip on every refocus and
 *  amplify the cascade that remounts the current page.
 */
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, string | null>();

// Subscribe once at module load. Idempotent: HMR will re-run this file but the
// previous subscription will be garbage-collected with the old module.
let _authListenerInstalled = false;
function installAuthListener() {
  if (_authListenerInstalled) return;
  _authListenerInstalled = true;
  try {
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "USER_UPDATED") {
        cache.clear();
      }
    });
  } catch {
    // No-op: in non-browser/test environments without supabase auth, skip.
  }
}
installAuthListener();

export async function resolveBusinessUserId(authUid: string | null | undefined): Promise<string | null> {
  if (!authUid) return null;
  if (cache.has(authUid)) return cache.get(authUid) ?? null;

  const { data, error } = await supabase
    .from("anew_users")
    .select("id")
    .eq("auth_user_id", authUid)
    .maybeSingle();

  if (error || !data) {
    cache.set(authUid, null);
    return null;
  }
  cache.set(authUid, data.id);
  return data.id;
}

/** Convenience: resolve from current session. */
export async function resolveCurrentBusinessUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return resolveBusinessUserId(user?.id);
}

/** Test-only. */
export function __clearResolveBusinessUserIdCache() {
  cache.clear();
}
