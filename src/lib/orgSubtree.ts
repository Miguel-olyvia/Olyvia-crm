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
 * Resolve all descendant organization IDs for a given root org via iterative BFS
 * on anew_hierarchy. Each round fetches only rows whose parent_org_id is in the
 * current frontier — no full-table scan, no cross-tenant rows are returned to the
 * client.
 *
 * Returns [rootOrgId, ...allDescendantIds].
 */
export async function resolveOrgSubtree(rootOrgId: string): Promise<string[]> {
  const ids: string[] = [rootOrgId];
  const visited = new Set<string>([rootOrgId]);
  let frontier: string[] = [rootOrgId];

  while (frontier.length > 0) {
    const { data: batch } = await supabase
      .from('anew_hierarchy')
      .select('parent_org_id, child_org_id')
      .in('parent_org_id', frontier);

    if (!batch || batch.length === 0) break;

    const next: string[] = [];
    for (const h of batch) {
      if (!visited.has(h.child_org_id)) {
        visited.add(h.child_org_id);
        ids.push(h.child_org_id);
        next.push(h.child_org_id);
      }
    }
    frontier = next;
  }

  return ids;
}
