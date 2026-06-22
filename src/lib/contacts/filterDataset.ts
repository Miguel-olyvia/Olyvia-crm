interface ContactDatasetFilterState {
  dealsFilter: string;
  noContact7dFilter: boolean;
  noContact14dFilter: boolean;
  smartFilter: boolean;
}

export function needsCompleteContactDataset({
  dealsFilter,
  noContact7dFilter,
  noContact14dFilter,
  smartFilter,
}: ContactDatasetFilterState): boolean {
  return dealsFilter !== "all" || noContact7dFilter || noContact14dFilter || smartFilter;
}

interface ContactAttentionFilterInput {
  healthScore: number;
  daysSinceLastContact: number | null;
  noContact7dFilter: boolean;
  noContact14dFilter: boolean;
  smartFilter: boolean;
}

export function matchesContactAttentionFilters({
  healthScore,
  daysSinceLastContact,
  noContact7dFilter,
  noContact14dFilter,
  smartFilter,
}: ContactAttentionFilterInput): boolean {
  const daysWithoutContact = daysSinceLastContact ?? Number.POSITIVE_INFINITY;

  if (noContact14dFilter && daysWithoutContact <= 14) return false;
  if (noContact7dFilter && daysWithoutContact <= 7) return false;
  if (smartFilter && (healthScore >= 40 || daysWithoutContact <= 7)) return false;

  return true;
}
