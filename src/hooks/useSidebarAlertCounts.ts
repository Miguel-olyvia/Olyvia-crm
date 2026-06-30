import { useState, useEffect, useCallback, useRef } from 'react';
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
}

const emptyCounts: AlertCounts = {
  proposal: 0,
  client: 0,
  contract: 0,
  contact: 0,
  lead: 0,
  quote: 0,
  email_tracking: 0,
};

export function useSidebarAlertCounts(activeOrgId?: string) {
  const [counts, setCounts] = useState<AlertCounts>(emptyCounts);
  const [totalUnread, setTotalUnread] = useState(0);

  const fetchCounts = useCallback(async () => {
    const { data: user } = await getCachedAuthUser();
    if (!user.user) {
      setCounts(emptyCounts);
      setTotalUnread(0);
      return;
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

    // Bell count
    if (!bellResult.error && bellResult.count !== null) {
      setTotalUnread(bellResult.count);
    }

    // Alert badges by entity_type
    if (!alertResult.error && alertResult.data) {
      const result: AlertCounts = { ...emptyCounts };
      for (const n of alertResult.data) {
        const et = n.entity_type as string;
        if (et && et in result) {
          result[et as keyof AlertCounts]++;
        }
      }
      setCounts(result);
    }
  }, [activeOrgId]);

  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchCounts();

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
            fetchCounts();
          }
        )
        .subscribe();

      channelRef.current = channel;
    };

    setupRealtimeSubscription();

    const interval = setInterval(fetchCounts, 180000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetchCounts]);

  const sectionCounts = {
    crm: counts.contact + counts.client + counts.lead,
    acquisition: counts.proposal + counts.contract + counts.quote,
  };

  return { counts, sectionCounts, totalUnread };
}
