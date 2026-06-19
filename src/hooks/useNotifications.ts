import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getCachedAuthUser } from '@/lib/cachedAuth';
import { toast } from 'sonner';
import { resolveOrgSubtree } from '@/lib/orgSubtree';
import type { RealtimeChannel } from '@supabase/supabase-js';

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  } catch (e) {
    // Audio not available
  }
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  kind: string;
  title: string;
  message: string;
  link: string | null;
  data: unknown;
  is_read: boolean | null;
  read_at: string | null;
  created_at: string;
  organization_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  priority: string | null;
  action_type: string | null;
  action_config: Record<string, any> | null;
  is_dismissed: boolean;
  is_resolved: boolean;
  resolved_at: string | null;
  resolved_reason: string | null;
}

export function useNotifications(activeOrgId?: string | null) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const subtreeRef = useRef<string[]>([]);

  const computeUnreadCount = useCallback((notifs: Notification[]) => {
    return notifs.filter(n => !n.is_read && !n.is_dismissed && !n.is_resolved).length;
  }, []);

  // Resolve subtree whenever activeOrgId changes
  useEffect(() => {
    if (!activeOrgId) {
      subtreeRef.current = [];
      return;
    }
    resolveOrgSubtree(activeOrgId).then(ids => {
      subtreeRef.current = ids;
    });
  }, [activeOrgId]);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data: user } = await getCachedAuthUser();
      if (!user.user) return;

      // Resolve subtree if needed (might not be ready from effect yet)
      let orgIds = subtreeRef.current;
      if (activeOrgId && orgIds.length === 0) {
        orgIds = await resolveOrgSubtree(activeOrgId);
        subtreeRef.current = orgIds;
      }

      // Build org filter for reuse
      const applyOrgFilter = (query: any) => {
        if (orgIds.length > 0) {
          return query.in('organization_id', orgIds);
        }
        return query;
      };

      // Build queries
      let countQuery = supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.user.id)
        .eq('is_read', false)
        .eq('is_dismissed', false)
        .eq('is_resolved', false)
        .eq('kind', 'notification');
      countQuery = applyOrgFilter(countQuery);

      let dataQuery = supabase
        .from('notifications')
        .select('id, user_id, type, title, message, link, data, is_read, read_at, created_at, organization_id, entity_type, entity_id, priority, action_type, action_config, is_dismissed, is_resolved, resolved_at, resolved_reason, kind')
        .eq('user_id', user.user.id)
        .eq('is_dismissed', false)
        .eq('is_resolved', false)
        .eq('kind', 'notification')
        .order('created_at', { ascending: false })
        .limit(100);
      dataQuery = applyOrgFilter(dataQuery);

      // Execute in parallel
      const [countResult, dataResult] = await Promise.all([countQuery, dataQuery]);

      if (!countResult.error && countResult.count !== null) {
        setUnreadCount(countResult.count);
      }

      if (dataResult.error) throw dataResult.error;

      const notifs = (dataResult.data as any) || [];
      setNotifications(notifs);
    } catch (error: any) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev => {
        const updated = prev.map(n =>
          n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
        );
        setUnreadCount(computeUnreadCount(updated));
        return updated;
      });
    } catch (error: any) {
      console.error('Error marking notification as read:', error);
    }
  }, [computeUnreadCount]);

  const markAllAsRead = useCallback(async () => {
    try {
      const { data: user } = await getCachedAuthUser();
      if (!user.user) return;

      const timestamp = new Date().toISOString();

      let query = supabase
        .from('notifications')
        .update({
          is_read: true,
          read_at: timestamp,
        })
        .eq('user_id', user.user.id)
        .eq('is_read', false)
        .eq('is_dismissed', false)
        .eq('is_resolved', false)
        .eq('kind', 'notification');

      // Only mark as read within active org scope
      const orgIds = subtreeRef.current;
      if (orgIds.length > 0) {
        query = query.in('organization_id', orgIds);
      }

      const { error } = await query;

      if (error) throw error;

      setNotifications(prev => prev.map(n => ({
        ...n,
        is_read: true,
        read_at: timestamp,
      })));
      setUnreadCount(0);
    } catch (error: any) {
      console.error('Error marking all notifications as read:', error);
    }
  }, []);

  const dismissNotification = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_dismissed: true })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev => {
        const updated = prev.filter(n => n.id !== notificationId);
        setUnreadCount(computeUnreadCount(updated));
        return updated;
      });
    } catch (error: any) {
      console.error('Error dismissing notification:', error);
    }
  }, [computeUnreadCount]);

  const channelRef = useRef<RealtimeChannel | null>(null);

  // Effect #1: fetch notifications (re-runs when activeOrgId changes via fetchNotifications)
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Effect #2: setup Realtime channel ONCE (independent of activeOrgId)
  // Org filtering happens inside callbacks via subtreeRef.current, which is kept fresh by the
  // earlier effect that resolves the subtree whenever activeOrgId changes.
  useEffect(() => {
    let cancelled = false;

    const setupRealtimeSubscription = async () => {
      const { data: user } = await getCachedAuthUser();
      if (!user.user || cancelled) return;

      // Cleanup any previous channel before creating a new one (StrictMode safety)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      const channel = supabase
        .channel(`notifications:${user.user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.user.id}`,
          },
          (payload) => {
            const newNotification = payload.new as Notification;
            if (newNotification.kind !== 'notification') return;
            if (newNotification.is_dismissed || newNotification.is_resolved) return;

            const orgIds = subtreeRef.current;
            if (orgIds.length > 0 && newNotification.organization_id && !orgIds.includes(newNotification.organization_id)) {
              return;
            }

            let added = false;
            setNotifications(prev => {
              if (prev.some(n => n.id === newNotification.id)) return prev;
              added = true;
              const updated = [newNotification, ...prev];
              setUnreadCount(computeUnreadCount(updated));
              return updated;
            });

            if (added) {
              playNotificationSound();
              toast(newNotification.title, {
                description: newNotification.message,
              });
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.user.id}`,
          },
          (payload) => {
            const updated = payload.new as Notification;
            if (updated.kind !== 'notification') return;
            if (updated.is_dismissed || updated.is_resolved) {
              setNotifications(prev => {
                const next = prev.filter(n => n.id !== updated.id);
                setUnreadCount(computeUnreadCount(next));
                return next;
              });
            } else {
              setNotifications(prev => {
                const next = prev.map(n => n.id === updated.id ? updated : n);
                setUnreadCount(computeUnreadCount(next));
                return next;
              });
            }
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
  }, [computeUnreadCount]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    dismissNotification,
    refetch: fetchNotifications,
  };
}
