/**
 * Shared "least busy" resource-assignment strategy, extracted from
 * auto-schedule/index.ts so the public booking flow (book-slot) can reuse the
 * exact same rule instead of a second, parallel implementation.
 */

interface LeastBusyCandidate {
  id: string;
}

/**
 * Orders resources ascending by total schedule_item_assignees count
 * (fewest assignments first).
 */
export async function orderByLeastBusy<T extends LeastBusyCandidate>(
  supabase: any,
  resources: T[]
): Promise<T[]> {
  const workloads = await Promise.all(
    resources.map(async (resource) => {
      const { count } = await supabase
        .from('schedule_item_assignees')
        .select('*', { count: 'exact', head: true })
        .eq('resource_id', resource.id);
      return { resource, count: count || 0 };
    })
  );

  return workloads
    .sort((a, b) => a.count - b.count)
    .map(w => w.resource);
}

/**
 * True when the resource still has room under its max_daily_capacity for the
 * given date (no limit configured counts as unlimited capacity).
 */
export async function hasDailyCapacity(
  supabase: any,
  resourceId: string,
  maxDailyCapacity: number | null | undefined,
  dateStr: string
): Promise<boolean> {
  if (!maxDailyCapacity) return true;

  const { count } = await supabase
    .from('schedule_item_assignees')
    .select('item_id!inner(start_datetime)', { count: 'exact', head: true })
    .eq('resource_id', resourceId)
    .gte('item_id.start_datetime', `${dateStr}T00:00:00`)
    .lt('item_id.start_datetime', `${dateStr}T23:59:59`);

  return (count || 0) < maxDailyCapacity;
}
