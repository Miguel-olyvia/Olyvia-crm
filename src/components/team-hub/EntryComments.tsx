import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Send, User, Loader2, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Comment {
  id: string;
  entry_id: string;
  author_id: string | null;
  author_name: string;
  content: string;
  created_at: string;
}

interface MentionUser {
  id: string;
  name: string;
  auth_user_id: string | null;
}

interface EntryCommentsProps {
  entryId: string;
  entryAuthorId: string | null;
  entryAuthorName?: string;
  currentUserId: string | null;
  currentUserName: string;
  isAdmin: boolean;
}

export function EntryComments({ entryId, entryAuthorId, entryAuthorName, currentUserId, currentUserName, isAdmin }: EntryCommentsProps) {
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Mention state
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);

  const fetchComments = async () => {
    const { data, error } = await (supabase as any)
      .from("team_hub_comments")
      .select("*")
      .eq("entry_id", entryId)
      .order("created_at", { ascending: true });

    if (!error) setComments(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchComments();

    const channel = supabase
      .channel(`comments-${entryId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "team_hub_comments", filter: `entry_id=eq.${entryId}` },
        () => fetchComments()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [entryId]);

  // Build mention user list from entry participants (author + commenters)
  const getParticipants = useCallback((): MentionUser[] => {
    const seen = new Set<string>();
    const users: MentionUser[] = [];

    // Add entry author
    if (entryAuthorId && entryAuthorName) {
      seen.add(entryAuthorId);
      users.push({ id: entryAuthorId, name: entryAuthorName, auth_user_id: null });
    }

    // Add all commenters
    comments.forEach(c => {
      if (c.author_id && !seen.has(c.author_id)) {
        seen.add(c.author_id);
        users.push({ id: c.author_id, name: c.author_name, auth_user_id: null });
      }
    });

    // Remove current user from suggestions
    return users.filter(u => u.id !== currentUserId);
  }, [comments, entryAuthorId, entryAuthorName, currentUserId]);

  // Filter mentions based on query
  useEffect(() => {
    if (!showMentions) return;
    const participants = getParticipants();
    const q = mentionQuery.toLowerCase();
    const filtered = q
      ? participants.filter(u => u.name.toLowerCase().includes(q))
      : participants;
    setMentionUsers(filtered);
    setMentionIndex(0);
  }, [mentionQuery, showMentions, getParticipants]);

  const insertMention = (user: MentionUser) => {
    const before = newComment.slice(0, mentionStartPos);
    const after = newComment.slice(textareaRef.current?.selectionStart || mentionStartPos + mentionQuery.length + 1);
    const mention = `@${user.name} `;
    setNewComment(before + mention + after);
    setShowMentions(false);
    setMentionQuery("");
    setMentionStartPos(-1);
    textareaRef.current?.focus();
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart;
    setNewComment(val);

    // Detect @ trigger
    const textBeforeCursor = val.slice(0, pos);
    const atIndex = textBeforeCursor.lastIndexOf("@");

    if (atIndex >= 0) {
      const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : " ";
      if (charBefore === " " || charBefore === "\n" || atIndex === 0) {
        const query = textBeforeCursor.slice(atIndex + 1);
        if (!query.includes(" ") || query.length <= 30) {
          setMentionStartPos(atIndex);
          setMentionQuery(query);
          setShowMentions(true);
          return;
        }
      }
    }
    setShowMentions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions && mentionUsers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex(i => Math.min(i + 1, mentionUsers.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionUsers[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentions(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey && !showMentions) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);

    const content = newComment.trim();

    const { error } = await (supabase as any)
      .from("team_hub_comments")
      .insert({
        entry_id: entryId,
        author_id: currentUserId,
        author_name: currentUserName,
        content,
      });

    if (error) {
      toast({ title: "Erro", description: "Não foi possível adicionar o comentário", variant: "destructive" });
    } else {
      setNewComment("");

      // Extract mentioned user IDs and notify them
      const mentionedNames = [...content.matchAll(/@([^\s@]+(?:\s[^\s@]+)*)/g)].map(m => m[1].trim());
      const participants = getParticipants();

      // Collect unique user IDs to notify (mentioned + entry author)
      const notifyIds = new Set<string>();

      // Notify entry author
      if (entryAuthorId && entryAuthorId !== currentUserId) {
        notifyIds.add(entryAuthorId);
      }

      // Notify mentioned users
      mentionedNames.forEach(name => {
        const user = participants.find(u => name.startsWith(u.name));
        if (user && user.id !== currentUserId) {
          notifyIds.add(user.id);
        }
      });

      // Send notifications
      if (notifyIds.size > 0) {
        const { data: usersToNotify } = await (supabase as any)
          .from("anew_users")
          .select("id, auth_user_id")
          .in("id", [...notifyIds]);

        if (usersToNotify) {
          const notifications = usersToNotify
            .filter((u: any) => u.auth_user_id)
            .map((u: any) => ({
              user_id: u.auth_user_id,
              type: "team_hub_comment",
              title: notifyIds.has(u.id) && mentionedNames.length > 0
                ? "Mencionaram-te num comentário"
                : "Novo comentário no Team Hub",
              message: `${currentUserName} comentou numa entrada do Team Hub.`,
              link: "/team-hub",
              entity_type: "team_hub_entry",
              entity_id: entryId,
              priority: "low",
            }));

          if (notifications.length > 0) {
            await (supabase as any).from("notifications").insert(notifications);
          }
        }
      }
    }
    setSubmitting(false);
  };

  const handleDelete = async (commentId: string) => {
    await (supabase as any).from("team_hub_comments").delete().eq("id", commentId);
  };

  // Render comment content with highlighted @mentions
  const renderContent = (text: string) => {
    const parts = text.split(/(@[^\s@]+(?:\s[^\s@]+)*)/g);
    return parts.map((part, i) =>
      part.startsWith("@") ? (
        <span key={i} className="font-semibold text-primary">{part}</span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  return (
    <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> A carregar comentários...
        </div>
      ) : (
        <>
          {comments.length > 0 && (
            <div className="space-y-2">
              {comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2 group">
                  <div className="p-1 rounded-full bg-muted shrink-0 mt-0.5">
                    <User className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{c.author_name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: pt })}
                      </span>
                      {(isAdmin || c.author_id === currentUserId) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleDelete(c.id)}
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-foreground/80">{renderContent(c.content)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* New comment input with @mention dropdown */}
      <div className="relative">
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              placeholder="Escreve um comentário... (@para mencionar)"
              className="flex min-h-[36px] h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              value={newComment}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
            />

            {/* Mention dropdown */}
            {showMentions && mentionUsers.length > 0 && (
              <div
                ref={mentionListRef}
                className="absolute bottom-full left-0 mb-1 w-full max-h-40 overflow-y-auto rounded-md border border-border bg-popover shadow-md z-50"
              >
                {mentionUsers.map((user, idx) => (
                  <button
                    key={user.id}
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-accent transition-colors",
                      idx === mentionIndex && "bg-accent"
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertMention(user);
                    }}
                  >
                    <User className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{user.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
            disabled={!newComment.trim() || submitting}
            onClick={handleSubmit}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
