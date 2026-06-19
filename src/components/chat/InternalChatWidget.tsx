import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, ArrowLeft, Send, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCompany } from "@/contexts/CompanyContext";
import { useInternalChat, type ChatColleague } from "@/hooks/useInternalChat";
import { usePresence } from "@/hooks/usePresence";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import AIAssistant from "@/components/AIAssistant";
import olyviaIcon from "@/assets/olyvia-icon.png";

type View = "list" | "conversation";

export function InternalChatWidget() {
  const {
    anewUserId, colleagues, conversations, activeConversation,
    messages, totalUnread, loadingColleagues, loadingMessages,
    setActiveConversation, startConversation, sendMessage,
  } = useInternalChat();

  const { activeCompany } = useCompany();
  const { isOnline } = usePresence(anewUserId);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [olyviaOpen, setOlyviaOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Listen for external "open chat with user" events
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { userId: string } | undefined;
      if (!detail?.userId) return;
      setOpen(true);
      await startConversation(detail.userId);
      setView("conversation");
    };
    window.addEventListener("internal-chat:open", handler);
    return () => window.removeEventListener("internal-chat:open", handler);
  }, [startConversation]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleOpenConversation = (conversationId: string) => {
    setActiveConversation(conversationId);
    setView("conversation");
  };

  const handleStartChat = async (colleague: ChatColleague) => {
    await startConversation(colleague.id);
    setView("conversation");
  };

  const handleSend = async () => {
    if (!messageText.trim()) return;
    await sendMessage(messageText);
    setMessageText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleBack = () => {
    setView("list");
    setActiveConversation(null);
  };

  const activeColleague = conversations.find(c => c.id === activeConversation)?.colleague;

  // Filter colleagues for new chat
  const filteredColleagues = colleagues.filter(c =>
    c.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Colleagues not yet in conversations
  const convoColleagueIds = new Set(conversations.map(c => c.colleague.id));
  const newColleagues = filteredColleagues.filter(c => !convoColleagueIds.has(c.id));

  if (!anewUserId) return null;

  return (
    <>
      {/* Floating Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-[500] h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all duration-200 hover:scale-105 flex items-center justify-center"
        >
          <MessageCircle className="h-6 w-6" />
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </button>
      )}

      {/* Chat Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-[500] w-[360px] h-[500px] rounded-2xl bg-background border border-border shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
          {/* Header */}
          <div className="flex items-center gap-2 p-3 border-b bg-primary text-primary-foreground rounded-t-2xl">
            {view === "conversation" && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm truncate">
                {view === "conversation" && activeColleague
                  ? activeColleague.display_name
                  : `Chat ${activeCompany?.name || "Interno"}`}
              </h3>
              {view === "list" && (
                <p className="text-xs text-primary-foreground/70">Colegas de equipa</p>
              )}
              {view === "conversation" && activeColleague && (
                <p className="text-xs text-primary-foreground/70">
                  {isOnline(activeColleague.id) ? "🟢 Online" : "Offline"}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setOlyviaOpen(true)}
                title="Olyvia - Assistente IA"
                className="relative h-9 w-9 rounded-full bg-white/20 hover:bg-white/30 border border-white/30 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              >
                <img src={olyviaIcon} alt="Olyvia" className="h-6 w-6" />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-400 border-2 border-primary" />
              </button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {view === "list" ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Search */}
              <div className="p-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Procurar colega..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
              </div>

              <ScrollArea className="flex-1">
                {/* Existing conversations */}
                {conversations.length > 0 && (
                  <div>
                    <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Conversas</p>
                    {conversations
                      .filter(c => c.colleague.display_name.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map(convo => (
                        <button
                          key={convo.id}
                          onClick={() => handleOpenConversation(convo.id)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-left"
                        >
                          <div className="relative">
                            <Avatar className="h-9 w-9 shrink-0">
                              <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-medium">
                                {convo.colleague.display_name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className={cn(
                              "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background",
                              isOnline(convo.colleague.id) ? "bg-green-500" : "bg-muted-foreground/40"
                            )} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{convo.colleague.display_name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {formatDistanceToNow(new Date(convo.last_message_at), { addSuffix: true, locale: pt })}
                            </p>
                          </div>
                          {convo.unread_count > 0 && (
                            <Badge className="h-5 min-w-[20px] px-1.5 text-[10px] bg-destructive text-destructive-foreground">
                              {convo.unread_count}
                            </Badge>
                          )}
                        </button>
                      ))
                    }
                  </div>
                )}

                {/* New colleagues */}
                {newColleagues.length > 0 && (
                  <div>
                    <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-2">Iniciar conversa</p>
                    {newColleagues.map(colleague => (
                      <button
                        key={colleague.id}
                        onClick={() => handleStartChat(colleague)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-left"
                      >
                        <div className="relative">
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarFallback className="bg-muted text-muted-foreground text-xs font-medium">
                              {colleague.display_name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className={cn(
                            "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background",
                            isOnline(colleague.id) ? "bg-green-500" : "bg-muted-foreground/40"
                          )} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{colleague.display_name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{colleague.email}</p>
                        </div>
                      </button>
                    ))
                    }
                  </div>
                )}

                {colleagues.length === 0 && !loadingColleagues && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Sem colegas encontrados nesta organização.
                  </div>
                )}
              </ScrollArea>
            </div>
          ) : (
            /* Conversation View */
            <div className="flex-1 flex flex-col min-h-0">
              <ScrollArea className="flex-1 p-3">
                <div className="space-y-2">
                  {loadingMessages && (
                    <p className="text-xs text-muted-foreground text-center py-4">A carregar...</p>
                  )}
                  {messages.map(msg => {
                    const isMine = msg.sender_id === anewUserId;
                    return (
                      <div key={msg.id} className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                        <div className={cn(
                          "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                          isMine
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-muted text-foreground rounded-bl-sm"
                        )}>
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          <p className={cn(
                            "text-[10px] mt-0.5",
                            isMine ? "text-primary-foreground/60" : "text-muted-foreground"
                          )}>
                            {new Date(msg.created_at).toLocaleTimeString("pt", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Message Input */}
              <div className="p-2 border-t flex items-center gap-2">
                <Input
                  placeholder="Escrever mensagem..."
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 h-9 text-sm"
                />
                <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSend} disabled={!messageText.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Olyvia AI Assistant */}
      <AIAssistant open={olyviaOpen} onOpenChange={setOlyviaOpen} />
    </>
  );
}
