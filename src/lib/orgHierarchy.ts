/**
 * Resolve the root organization ID by traversing the hierarchy upward.
 * Detects cycles via a visited Set and caps at 10 hops as defense in depth.
 *
 * @param startOrgId The organization to resolve from.
 * @param fetchParent Async function that returns the parent_org_id (or null) for a given child_org_id.
 * @returns The root organization id (the last valid org reached before a missing/cyclic parent).
 */
export async function resolveRootOrgIdLogic(
  startOrgId: string,
  fetchParent: (childOrgId: string) => Promise<string | null>,
): Promise<string> {
  const visited = new Set<string>();
  let current = startOrgId;
  visited.add(current);

  // Cap of 10 hops as a safety net even when no cycle is present.
  for (let i = 0; i < 10; i++) {
    const parent = await fetchParent(current);
    if (!parent) return current;
    if (visited.has(parent)) {
      // Cycle detected — stop and return the last valid org.
      // eslint-disable-next-line no-console
      console.warn(
        `[resolveRootOrgId] Cycle detected in org hierarchy. Visited: ${[
          ...visited,
        ].join(" -> ")} -> ${parent}. Returning last valid: ${current}.`,
      );
      return current;
    }
    visited.add(parent);
    current = parent;
  }
  return current;
}
