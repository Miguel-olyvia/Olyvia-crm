import { supabase } from '@/integrations/supabase/client';

/**
 * Resolve all descendant organization IDs for a given root org via BFS on anew_hierarchy.
 * Returns [rootOrgId, ...allDescendantIds].
 */
export async function resolveOrgSubtree(rootOrgId: string): Promise<string[]> {
  const ids = [rootOrgId];
  const { data: hierarchy } = await supabase
    .from('anew_hierarchy')
    .select('parent_org_id, child_org_id');

  if (!hierarchy?.length) return ids;

  const childrenMap = new Map<string, string[]>();
  for (const h of hierarchy) {
    if (!childrenMap.has(h.parent_org_id)) childrenMap.set(h.parent_org_id, []);
    childrenMap.get(h.parent_org_id)!.push(h.child_org_id);
  }

  const queue = [rootOrgId];
  const visited = new Set([rootOrgId]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = childrenMap.get(current) || [];
    for (const child of children) {
      if (!visited.has(child)) {
        visited.add(child);
        ids.push(child);
        queue.push(child);
      }
    }
  }

  return ids;
}
