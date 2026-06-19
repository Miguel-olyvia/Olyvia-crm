import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const HEARTBEAT_INTERVAL_MS = 90_000; // 90s (was 30s — reduces DB writes 3x)
const OFFLINE_THRESHOLD_MS = 300_000; // 5min without heartbeat = offline

export function usePresence(anewUserId: string | null) {
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<any>(null);
  const dbChangesChannelNameRef = useRef("presence-db-changes-" + crypto.randomUUID());

  // Send heartbeat (upsert own presence)
  const sendHeartbeat = useCallback(async () => {
    if (!anewUserId) return;
    await (supabase as any)
      .from("user_presence")
      .upsert(
        { user_id: anewUserId, is_online: true, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
  }, [anewUserId]);

  // Mark self offline
  const goOffline = useCallback(async () => {
    if (!anewUserId) return;
    await (supabase as any)
      .from("user_presence")
      .upsert(
        { user_id: anewUserId, is_online: false, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
  }, [anewUserId]);

  // Load current presence state from DB
  const loadPresence = useCallback(async () => {
    const threshold = new Date(Date.now() - OFFLINE_THRESHOLD_MS).toISOString();
    const { data } = await (supabase as any)
      .from("user_presence")
      .select("user_id, is_online, last_seen_at")
      .eq("is_online", true)
      .gte("last_seen_at", threshold);

    setOnlineUserIds(new Set((data || []).map((p: any) => p.user_id)));
  }, []);

  // Load presence immediately so other users can appear online even before
  // the current user's own heartbeat session is resolved.
  useEffect(() => {
    loadPresence();
  }, [loadPresence]);
  // Start heartbeat + Presence channel
  useEffect(() => {
    if (!anewUserId) return;

    // Initial heartbeat + load
    sendHeartbeat();
    loadPresence();

    // Periodic heartbeat
    heartbeatRef.current = setInterval(() => {
      sendHeartbeat();
      loadPresence(); // Also refresh others' state
    }, HEARTBEAT_INTERVAL_MS);

    // Evict any stale channel from Supabase's internal registry before (re-)creating.
    // supabase.channel() returns the existing channel if the topic matches, so if
    // the previous channel is still registered (removeChannel is async), calling
    // .on() on it after .subscribe() throws. Filtering synchronously prevents this.
    const rt = (supabase as any).realtime;
    if (rt?.channels) {
      rt.channels = rt.channels.filter((ch: any) => ch.topic !== 'realtime:global-presence');
    }

    // Supabase Presence channel for instant updates
    const channel = supabase
      .channel("global-presence", { config: { presence: { key: anewUserId } } })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const ids = new Set<string>(Object.keys(state));
        // Merge with heartbeat data
        setOnlineUserIds(prev => {
          const merged = new Set(prev);
          ids.forEach(id => merged.add(id));
          return merged;
        });
      })
      .on("presence", { event: "leave" }, ({ key }: { key: string }) => {
        setOnlineUserIds(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      })
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: anewUserId, online_at: new Date().toISOString() });
        }
      });

    channelRef.current = channel;

    // Go offline on tab close
    const handleBeforeUnload = () => {
      goOffline();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Visibility change - pause/resume heartbeat
    const handleVisibility = () => {
      if (document.hidden) {
        // Don't immediately go offline, let the threshold handle it
      } else {
        sendHeartbeat();
        loadPresence();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      goOffline();
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [anewUserId, sendHeartbeat, goOffline, loadPresence]);

  // Realtime subscription for DB presence changes
  useEffect(() => {
    const channel = supabase
      .channel(dbChangesChannelNameRef.current)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "user_presence",
      }, (payload) => {
        const record = (payload.new || payload.old) as any;
        if (!record) return;
        setOnlineUserIds(prev => {
          const next = new Set(prev);
          if (record.is_online) {
            next.add(record.user_id);
          } else {
            next.delete(record.user_id);
          }
          return next;
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const isOnline = useCallback((userId: string) => onlineUserIds.has(userId), [onlineUserIds]);

  return { onlineUserIds, isOnline };
}
