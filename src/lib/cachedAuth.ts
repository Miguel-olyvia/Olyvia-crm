import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

/**
 * Cached getUser() — deduplicates concurrent calls and caches the result
 * for a short TTL. This avoids hundreds of redundant HTTP requests to the
 * auth server that happen when multiple hooks/components each independently
 * call supabase.auth.getUser().
 *
 * Usage: replace `supabase.auth.getUser()` with `getCachedUser()`
 */

let cachedUser: User | null = null;
let cacheTimestamp = 0;
let inflightPromise: Promise<User | null> | null = null;

const CACHE_TTL_MS = 30_000; // 30 seconds

export async function getCachedUser(): Promise<User | null> {
  const now = Date.now();

  // Return cached if still fresh
  if (cachedUser && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedUser;
  }

  // Deduplicate concurrent calls
  if (inflightPromise) {
    return inflightPromise;
  }

  inflightPromise = (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      cachedUser = user;
      cacheTimestamp = Date.now();
      return user;
    } finally {
      inflightPromise = null;
    }
  })();

  return inflightPromise;
}

// Invalidate cache on auth state changes.
// IMPORTANT: do NOT reset the cache on every event — Supabase re-emits SIGNED_IN
// and TOKEN_REFRESHED on browser tab refocus / session revalidation. Treating
// those as identity changes cascades into a global "loading" state across the
// app and remounts pages, losing in-memory form state.
supabase.auth.onAuthStateChange((event, session) => {
  const nextUser = session?.user ?? null;
  const sameUser = !!nextUser && nextUser.id === cachedUser?.id;

  switch (event) {
    case "SIGNED_OUT":
      cachedUser = null;
      cacheTimestamp = 0;
      inflightPromise = null;
      return;

    case "USER_UPDATED":
      // Identity/metadata may have changed — invalidate.
      cachedUser = nextUser;
      cacheTimestamp = 0;
      return;

    case "SIGNED_IN":
      if (!sameUser) {
        cachedUser = nextUser;
        cacheTimestamp = Date.now();
      }
      // Same user on refocus revalidation: no-op.
      return;

    case "TOKEN_REFRESHED":
      // Token refresh is not an identity change. Refresh the cached user
      // reference if a session is present (metadata may have changed), but do
      // NOT bump the timestamp or invalidate downstream caches.
      if (nextUser && sameUser) {
        cachedUser = nextUser;
      }
      return;

    default:
      // INITIAL_SESSION, PASSWORD_RECOVERY, etc. — no-op here.
      return;
  }
});

/**
 * Wrapper matching the shape of supabase.auth.getUser() return value
 * for easy find-and-replace in existing code.
 */
export async function getCachedAuthUser() {
  const user = await getCachedUser();
  return { data: { user } };
}
