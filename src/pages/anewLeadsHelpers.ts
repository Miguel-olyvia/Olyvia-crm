export type LeadScope = "ALL" | "ORG" | "TEAM" | "OWNED" | "NONE";

export function normalizeLeadScope(scope: LeadScope, onlyMine: boolean): "ORG" | "TEAM" | "OWNED" {
  if (onlyMine || scope === "OWNED") return "OWNED";
  if (scope === "TEAM") return "TEAM";
  return "ORG";
}

export function getLeadScopeUserIds(
  anewUserId: string | null,
  authUserId: string | null,
  teamMemberIds: readonly string[] = [],
): string[] {
  return [...new Set([anewUserId, authUserId, ...teamMemberIds].filter(Boolean) as string[])];
}

export function reconcileRefreshedLead<T extends { id: string }>(
  leads: T[],
  selectedLead: T | null,
  leadId: string,
  refreshedLead: T | null,
) {
  if (!refreshedLead) {
    return {
      leads: leads.filter((lead) => lead.id !== leadId),
      selectedLead: selectedLead?.id === leadId ? null : selectedLead,
      closeDetails: selectedLead?.id === leadId,
    };
  }

  return {
    leads: leads.map((lead) => lead.id === leadId ? refreshedLead : lead),
    selectedLead: selectedLead?.id === leadId ? refreshedLead : selectedLead,
    closeDetails: false,
  };
}

export function identityContactIsPrimary(entityCreatedHere: boolean): boolean {
  return entityCreatedHere;
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = { status: "fulfilled", value: await mapper(items[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );

  return results;
}
