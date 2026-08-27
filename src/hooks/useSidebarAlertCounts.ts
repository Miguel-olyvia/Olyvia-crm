import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCachedAuthUser } from '@/lib/cachedAuth';
import { resolveOrgSubtree } from '@/lib/orgSubtree';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface AlertCounts {
  proposal: number;
  client: number;
  contract: number;
  contact: number;
  lead: number;
  quote: number;
  email_tracking: number;
  stock: number;
  purchase_order: number;
  item_supplier: number;
}

const emptyCounts: AlertCounts = {
  proposal: 0,
  client: 0,
  contract: 0,
  contact: 0,
  lead: 0,
  quote: 0,
  email_tracking: 0,
  stock: 0,
  purchase_order: 0,
  item_supplier: 0,
};

interface SidebarAlertData {
  counts: AlertCounts;
  totalUnread: number;
}

const emptySidebarAlertData: SidebarAlertData = { counts: emptyCounts, totalUnread: 0 };

const POLL_INTERVAL_MS = 180000;

/**
 * Fetches the raw notifications-derived counts for the sidebar. Kept as the
 * shared, cacheable input for this hook — separate from useModuleAlerts'
 * per-module alert list, since the two hooks need different derived shapes
 * from the same underlying notifications table.
 */
async function fetchSidebarAlertData(activeOrgId?: string): Promise<SidebarAlertData> {
  const { data: user } = await getCachedAuthUser();
  if (!user.user) {
    return emptySidebarAlertData;
  }

  // Resolve org subtree for filtering
  let subtreeIds: string[] | null = null;
  if (activeOrgId) {
    subtreeIds = await resolveOrgSubtree(activeOrgId);
  }

  const applyOrgFilter = (query: any) => {
    if (subtreeIds && subtreeIds.length > 0) {
      return query.in('organization_id', subtreeIds);
    }
    return query;
  };

  // Query 1: Bell unread count (kind = 'notification', is_read = false)
  let bellQuery = supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.user.id)
    .eq('kind', 'notification')
    .eq('is_read', false)
    .eq('is_dismissed', false)
    .eq('is_resolved', false);
  bellQuery = applyOrgFilter(bellQuery);

  // Query 2: Alert badges (kind = 'alert', group by entity_type)
  let alertQuery = supabase
    .from('notifications')
    .select('entity_type')
    .eq('user_id', user.user.id)
    .eq('kind', 'alert')
    .eq('is_dismissed', false)
    .eq('is_resolved', false);
  alertQuery = applyOrgFilter(alertQuery);

  const [bellResult, alertResult] = await Promise.all([bellQuery, alertQuery]);

  let totalUnread = 0;
  if (!bellResult.error && bellResult.count !== null) {
    totalUnread = bellResult.count;
  }

  let counts = emptyCounts;
  if (!alertResult.error && alertResult.data) {
    const result: AlertCounts = { ...emptyCounts };
    for (const n of alertResult.data) {
      const et = n.entity_type as string;
      if (et && et in result) {
        result[et as keyof AlertCounts]++;
      }
    }
    counts = result;
  }

  return { counts, totalUnread };
}

export function useSidebarAlertCounts(activeOrgId?: string) {
  const queryClient = useQueryClient();
  const queryKey = ['notifications', 'sidebar-counts', activeOrgId ?? null];

  const { data } = useQuery({
    queryKey,
    queryFn: () => fetchSidebarAlertData(activeOrgId),
    refetchInterval: POLL_INTERVAL_MS,
    initialData: emptySidebarAlertData,
  });

  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    let cancelled = false;

    const setupRealtimeSubscription = async () => {
      const { data: user } = await getCachedAuthUser();
      if (!user.user || cancelled) return;

      // Cleanup any stale channel before subscribing (StrictMode safety)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      const channel = supabase
        .channel('sidebar-alert-counts')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.user.id}`,
          },
          () => {
            // The realtime callback only ever triggered a re-fetch/re-count in
            // the previous implementation (no direct/optimistic local state
            // patching), so invalidating the shared cached query is safe here.
            queryClient.invalidateQueries({ queryKey });
          }
        )
        .subscribe();

      channelRef.current = channel;
    };

    setupRealtimeSubscription();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId, queryClient]);

  const counts = data?.counts ?? emptyCounts;
  const totalUnread = data?.totalUnread ?? 0;

  const sectionCounts = {
    crm: counts.contact + counts.client + counts.lead,
    acquisition: counts.proposal + counts.contract + counts.quote,
    inventory: counts.stock + counts.purchase_order + counts.item_supplier,
  };

  return { counts, sectionCounts, totalUnread };
}
