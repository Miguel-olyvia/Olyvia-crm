import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

export interface ChatColleague {
  id: string;
  display_name: string;
  email: string;
}

export interface ChatConversation {
  id: string;
  colleague: ChatColleague;
  last_message_at: string;
  unread_count: number;
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_read: boolean;
}

async function getAnewUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await (supabase as any)
    .from("anew_users")
    .select("id")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();
  return data?.id || null;
}

export function useInternalChat() {
  const { activeCompany } = useCompany();
  const [anewUserId, setAnewUserId] = useState<string | null>(null);
  const [colleagues, setColleagues] = useState<ChatColleague[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loadingColleagues, setLoadingColleagues] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const channelRef = useRef<any>(null);
  const loadConversationsRef = useRef<() => void>(() => {});

  // Resolve anew user id
  useEffect(() => {
    getAnewUserId().then(setAnewUserId).catch(err => console.error('useInternalChat: getAnewUserId failed', err));
  }, []);

  // Load colleagues from org hierarchy (active org + all descendants)
  const loadColleagues = useCallback(async () => {
    if (!anewUserId || !activeCompany?.id) return;
    setLoadingColleagues(true);
    try {
      // Get full hierarchy to resolve ancestors + descendants
      const { data: hierarchyData } = await (supabase as any)
        .from("anew_hierarchy")
        .select("parent_org_id, child_org_id");

      const childrenMap: Record<string, string[]> = {};
      const parentMap: Record<string, string[]> = {};
      (hierarchyData || []).forEach((h: any) => {
        if (!childrenMap[h.parent_org_id]) childrenMap[h.parent_org_id] = [];
        childrenMap[h.parent_org_id].push(h.child_org_id);
        if (!parentMap[h.child_org_id]) parentMap[h.child_org_id] = [];
        parentMap[h.child_org_id].push(h.parent_org_id);
      });

      const visibleOrgIds = new Set<string>();

      // Collect descendants (empresa + filiais, departamentos, etc.)
      const collectDescendants = (orgId: string) => {
        visibleOrgIds.add(orgId);
        (childrenMap[orgId] || []).forEach(childId => {
          if (!visibleOrgIds.has(childId)) collectDescendants(childId);
        });
      };
      collectDescendants(activeCompany.id);

      // Collect ancestors (holdings, grupos, etc.)
      const collectAncestors = (orgId: string) => {
        (parentMap[orgId] || []).forEach(parentId => {
          if (!visibleOrgIds.has(parentId)) {
            visibleOrgIds.add(parentId);
            collectAncestors(parentId);
          }
        });
      };
      collectAncestors(activeCompany.id);

      // C16: Defensive warning for large hierarchy sets
      if (visibleOrgIds.size > 200) {
        console.warn(`[useInternalChat] visibleOrgIds has ${visibleOrgIds.size} entries — .in() may hit practical limits`);
      }

      // Get all users in visible orgs via memberships
      const { data: memberships } = await (supabase as any)
        .from("anew_memberships")
        .select("user_id")
        .in("organization_id", [...visibleOrgIds])
        .eq("status", "active")
        .neq("user_id", anewUserId);

      if (!memberships?.length) { setColleagues([]); return; }
      const userIds = [...new Set(memberships.map((m: any) => m.user_id))];

      const { data: users } = await (supabase as any)
        .from("anew_users")
        .select("id, name, email, auth_user_id, status")
        .in("id", userIds)
        .eq("status", "active");

      const authIds = (users || []).map((u: any) => u.auth_user_id).filter(Boolean);
      let portalAuthIds = new Set<string>();
      if (authIds.length) {
        const { data: portals } = await (supabase as any)
          .from("client_portal_users")
          .select("auth_user_id")
          .in("auth_user_id", authIds);
        portalAuthIds = new Set((portals || []).map((p: any) => p.auth_user_id));
      }

      setColleagues((users || [])
        .filter((u: any) => !u.auth_user_id || !portalAuthIds.has(u.auth_user_id))
        .map((u: any) => ({
          id: u.id,
          display_name: u.name || u.email,
          email: u.email,
        })));
    } finally {
      setLoadingColleagues(false);
    }
  }, [anewUserId, activeCompany?.id]);

  useEffect(() => { loadColleagues(); }, [loadColleagues]);

  // Load conversations
  const loadConversations = useCallback(async () => {
    if (!anewUserId) return;

    const { data: convos } = await (supabase as any)
      .from("internal_chat_conversations")
      .select("*")
      .or(`participant_one.eq.${anewUserId},participant_two.eq.${anewUserId}`)
      .order("last_message_at", { ascending: false });

    if (!convos?.length) { setConversations([]); setTotalUnread(0); return; }

    // Get all partner ids
    const partnerIds = convos.map((c: any) =>
      c.participant_one === anewUserId ? c.participant_two : c.participant_one
    );

    const [{ data: partners }, { data: unreadCounts }] = await Promise.all([
      (supabase as any)
        .from("anew_users")
        .select("id, name, email")
        .in("id", partnerIds),
      (supabase as any)
        .from("internal_chat_messages")
        .select("conversation_id")
        .in("conversation_id", convos.map((c: any) => c.id))
        .eq("is_read", false)
        .neq("sender_id", anewUserId),
    ]);

    const partnerMap = new Map<string, any>((partners || []).map((p: any) => [p.id, p]));

    const unreadMap = new Map<string, number>();
    (unreadCounts || []).forEach((m: any) => {
      unreadMap.set(m.conversation_id, (unreadMap.get(m.conversation_id) || 0) + 1);
    });

    let total = 0;
    const mapped: ChatConversation[] = convos.map((c: any) => {
      const partnerId = c.participant_one === anewUserId ? c.participant_two : c.participant_one;
      const partner = partnerMap.get(partnerId);
      const unread = unreadMap.get(c.id) || 0;
      total += unread;
      return {
        id: c.id,
        colleague: {
          id: partnerId,
          display_name: partner?.name || partner?.email || "Utilizador",
          email: partner?.email || "",
        },
        last_message_at: c.last_message_at,
        unread_count: unread,
      };
    });

    setConversations(mapped);
    setTotalUnread(total);
  }, [anewUserId]);

  useEffect(() => { loadConversationsRef.current = loadConversations; }, [loadConversations]);
  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Load messages for active conversation
  const loadMessages = useCallback(async () => {
    if (!activeConversation) { setMessages([]); return; }
    setLoadingMessages(true);
    try {
      const { data } = await (supabase as any)
        .from("internal_chat_messages")
        .select("*")
        .eq("conversation_id", activeConversation)
        .order("created_at", { ascending: true });

      setMessages((data || []).map((m: any) => ({
        id: m.id,
        sender_id: m.sender_id,
        content: m.content,
        created_at: m.created_at,
        is_read: m.is_read,
      })));

      // Mark unread as read
      if (anewUserId) {
        await (supabase as any)
          .from("internal_chat_messages")
          .update({ is_read: true })
          .eq("conversation_id", activeConversation)
          .eq("is_read", false)
          .neq("sender_id", anewUserId);
        loadConversations();
      }
    } finally {
      setLoadingMessages(false);
    }
  }, [activeConversation, anewUserId, loadConversations]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!activeConversation) return;

    const channel = supabase
      .channel(`chat-${activeConversation}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "internal_chat_messages",
        filter: `conversation_id=eq.${activeConversation}`,
      }, (payload) => {
        const m = payload.new as any;
        setMessages(prev => [...prev, {
          id: m.id, sender_id: m.sender_id, content: m.content,
          created_at: m.created_at, is_read: m.is_read,
        }]);
        // Auto-mark as read if it's from the other person
        if (m.sender_id !== anewUserId) {
          (supabase as any).from("internal_chat_messages")
            .update({ is_read: true }).eq("id", m.id).then(() => loadConversations()).catch((err: any) => console.error('useInternalChat: mark-read failed', err));
        }
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [activeConversation, anewUserId, loadConversations]);

  // Global realtime for unread badge.
  // Date.now() suffix ensures a fresh channel name on every mount, preventing
  // Supabase from returning an already-subscribed channel in React StrictMode
  // where effects run twice (mount → cleanup → mount) and removeChannel is async.
  useEffect(() => {
    if (!anewUserId) return;
    const channel = supabase
      .channel(`chat-global-unread-${anewUserId}-${Date.now()}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "internal_chat_messages",
      }, () => {
        loadConversationsRef.current();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [anewUserId]);

  // Start or get conversation with a colleague
  const startConversation = useCallback(async (colleagueId: string) => {
    if (!anewUserId) return;

    // Check existing
    const { data: existing } = await (supabase as any)
      .from("internal_chat_conversations")
      .select("id")
      .or(
        `and(participant_one.eq.${anewUserId},participant_two.eq.${colleagueId}),and(participant_one.eq.${colleagueId},participant_two.eq.${anewUserId})`
      )
      .maybeSingle();

    if (existing) {
      setActiveConversation(existing.id);
      return;
    }

    // Create new
    const newId = crypto.randomUUID();
    // Ensure participant_one < participant_two for uniqueness
    const [p1, p2] = anewUserId < colleagueId
      ? [anewUserId, colleagueId]
      : [colleagueId, anewUserId];

    await (supabase as any).from("internal_chat_conversations").insert({
      id: newId, participant_one: p1, participant_two: p2,
    });

    setActiveConversation(newId);
    loadConversations();
  }, [anewUserId, loadConversations]);

  // Send message
  const sendMessage = useCallback(async (content: string) => {
    if (!anewUserId || !activeConversation || !content.trim()) return;

    await (supabase as any).from("internal_chat_messages").insert({
      conversation_id: activeConversation,
      sender_id: anewUserId,
      content: content.trim(),
    });

    // Update last_message_at
    await (supabase as any)
      .from("internal_chat_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", activeConversation);
  }, [anewUserId, activeConversation]);

  return {
    anewUserId,
    colleagues,
    conversations,
    activeConversation,
    messages,
    totalUnread,
    loadingColleagues,
    loadingMessages,
    setActiveConversation,
    startConversation,
    sendMessage,
    loadConversations,
  };
}
