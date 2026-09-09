import { supabase } from '@/integrations/supabase/client';

/**
 * Walk up anew_hierarchy from orgId to find the top-most ancestor
 * (the root of its tenant tree). Returns orgId itself if it has no parent.
 */
export async function resolveOrgRoot(orgId: string): Promise<string> {
  let current = orgId;
  const visited = new Set<string>([orgId]);

  for (let depth = 0; depth < 50; depth++) {
    const { data } = await supabase
      .from('anew_hierarchy')
      .select('parent_org_id')
      .eq('child_org_id', current)
      .maybeSingle();

    if (!data?.parent_org_id || visited.has(data.parent_org_id)) break;
    current = data.parent_org_id;
    visited.add(current);
  }

  return current;
}

/**
 * Resolve every organization ID that belongs to the same tenant tree as
 * orgId: walk up to the tenant root, then collect the full descendant
 * subtree from that root. Use this to scope any cross-org candidate list
 * (e.g. "add existing user") to the tenant instead of the whole platform.
 */
export async function resolveOrgTenantIds(orgId: string): Promise<string[]> {
  const rootId = await resolveOrgRoot(orgId);
  return resolveOrgSubtree(rootId);
}

/**
 * In-flight calls, keyed by root org. Several hooks that resolve the same
 * subtree mount together in the app layout (useDescendantOrgIds,
 * useNotifications, useSidebarAlertCounts, useModuleAlerts), so the same
 * traversal used to be requested four or five times concurrently. Sharing the
 * pending promise collapses that burst into one request.
 *
 * Entries are removed as soon as the call settles, so nothing is ever served
 * from a stale cache — this dedupes concurrency, it does not memoize results.
 */
const inFlightSubtrees = new Map<string, Promise<string[]>>();

/**
 * Resolve all descendant organization IDs for a given root org.
 *
 * The traversal runs in Postgres via the `get_org_subtree_ids` recursive CTE —
 * one round trip instead of one per depth level, which is what the previous
 * client-side BFS cost. The RPC is SECURITY INVOKER, so anew_hierarchy RLS
 * still applies and the resulting set matches what the BFS returned.
 *
 * Returns [rootOrgId, ...allDescendantIds]. A failed traversal degrades to
 * [rootOrgId] rather than an empty array, which a caller could misread as
 * "no filter" — same fail-closed behaviour as before.
 */
export async function resolveOrgSubtree(rootOrgId: string): Promise<string[]> {
  const pending = inFlightSubtrees.get(rootOrgId);
  if (pending) return pending;

  const request = (async (): Promise<string[]> => {
    const { data, error } = await supabase.rpc('get_org_subtree_ids', {
      _root_org_id: rootOrgId,
    });

    if (error) {
      console.error('[resolveOrgSubtree] subtree RPC failed:', error);
      return [rootOrgId];
    }

    const returned = (data ?? []) as string[];
    // Keep the root first, as the previous BFS did; callers treat the rest as
    // an unordered set.
    return [rootOrgId, ...returned.filter(id => id && id !== rootOrgId)];
  })();

  inFlightSubtrees.set(rootOrgId, request);
  try {
    return await request;
  } finally {
    inFlightSubtrees.delete(rootOrgId);
  }
}
