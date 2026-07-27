// Single source of truth for which client statuses are considered "inactive"
// (i.e. not a real ongoing relationship). Used both by the Clients list/table
// filters (AnewClients.tsx) and by health-score calculation
// (useClientEnrichedData.ts) so the two can never drift apart.
export const INACTIVE_CLIENT_STATUSES = ["inactive", "churned", "lost"];

export function isInactiveClientStatus(status?: string | null): boolean {
  return INACTIVE_CLIENT_STATUSES.includes(status || "");
}
