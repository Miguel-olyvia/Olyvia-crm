import { supabase } from '@/integrations/supabase/client';

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
