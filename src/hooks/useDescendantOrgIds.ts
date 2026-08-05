import { useEffect, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { resolveOrgSubtree } from "@/lib/orgSubtree";

/**
 * Resolves the ACTIVE company plus every organization below it in the
 * `anew_hierarchy` tree, via the shared `resolveOrgSubtree` traversal.
 *
 * This is the org boundary every multi-tenant query must filter on. Screens
 * used to inline their own copy of this `useEffect` + BFS; keeping one hook
 * means the traversal and the fail-closed behaviour below stay consistent.
 *
 * `orgIds` is empty until the active company is known — callers must treat an
 * empty array as "no access yet", never as "no filter".
 */
export function useDescendantOrgIds(): { orgIds: string[]; loading: boolean } {
  const { activeCompany } = useCompany();
  const [orgIds, setOrgIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const activeCompanyId = activeCompany?.id;
    if (!activeCompanyId) {
      setOrgIds([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      let resolved: string[];
      try {
        resolved = await resolveOrgSubtree(activeCompanyId);
      } catch (error) {
        // A failed traversal falls back to the active company alone. It must
        // never fall back to an empty list, which a caller could misread as
        // "unfiltered" and use to query across organizations.
        console.error("[useDescendantOrgIds] subtree resolution failed:", error);
        resolved = [activeCompanyId];
      }

      if (cancelled) return;
      setOrgIds(resolved);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCompany?.id]);

  return { orgIds, loading };
}
