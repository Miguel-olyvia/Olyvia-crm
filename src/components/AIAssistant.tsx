import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  MessageCircle, Send, Loader2, Star, X, 
  ExternalLink, Sparkles, Trash2, ChevronDown,
  History, Plus, MessageSquare, AlertTriangle
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import olyviaIcon from "@/assets/olyvia-icon.png";
import { ToolCallList, type ToolCallView } from "@/components/ai-assistant/ToolCallList";

interface PendingConfirmation {
  tool: string;
  args: any;
  candidate_entity_id?: string | null;
  candidate_name?: string | null;
  match_field?: string | null;
  proposed_payload?: any;
  message?: string;
}

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  rating?: number;
  deepLinks?: { label: string; path: string }[];
  created_at?: string;
  confirmation?: PendingConfirmation;
  confirmationResolved?: boolean;
  toolCalls?: ToolCallView[];
}

interface ConversationSummary {
  id: string;
  session_id: string;
  created_at: string;
  updated_at: string;
  preview: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`;

interface AIAssistantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AIAssistant({ open, onOpenChange }: AIAssistantProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { activeCompany } = useCompany();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showRating, setShowRating] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const orgIdRef = useRef<string | null>(activeCompany?.id ?? null);

  // Isolate conversations by organization: when the active org changes, drop the
  // in-memory conversation so messages from different orgs never mix.
  useEffect(() => {
    const currentOrg = activeCompany?.id ?? null;
    if (orgIdRef.current !== currentOrg) {
      orgIdRef.current = currentOrg;
      setMessages([]);
      setConversationId(null);
      setShowRating(null);
      setConversations([]);
    }
  }, [activeCompany?.id]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Load conversation history list (scoped to active organization)
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      let convQuery = supabase
        .from("ai_assistant_conversations")
        .select("id, session_id, created_at, updated_at")
        .eq("user_id", userData.user.id)
        .order("updated_at", { ascending: false })
        .limit(50);

      if (activeCompany?.id) {
        convQuery = convQuery.eq("organization_id", activeCompany.id);
      } else {
        convQuery = convQuery.is("organization_id", null);
      }

      const { data: convs, error } = await convQuery;

      if (error) throw error;
      if (!convs?.length) { setConversations([]); return; }

      // Fetch first user message for each conversation as preview
      const convIds = convs.map(c => c.id);
      const { data: previews } = await supabase
        .from("ai_assistant_messages")
        .select("conversation_id, content, created_at, role")
        .in("conversation_id", convIds)
        .eq("role", "user")
        .order("created_at", { ascending: true });

      const previewMap = new Map<string, string>();
      (previews || []).forEach((m: any) => {
        if (!previewMap.has(m.conversation_id)) {
          previewMap.set(m.conversation_id, m.content);
        }
      });

      const summaries: ConversationSummary[] = convs
        .map(c => ({
          id: c.id,
          session_id: c.session_id,
          created_at: c.created_at,
          updated_at: c.updated_at,
          preview: previewMap.get(c.id) || "Conversa vazia",
        }))
        .filter(s => s.preview !== "Conversa vazia"); // hide empty ones

      setConversations(summaries);
    } catch (e) {
      console.error("Error loading history:", e);
      toast({ title: "Erro ao carregar histórico", variant: "destructive" });
    } finally {
      setLoadingHistory(false);
    }
  }, [toast, activeCompany?.id]);

  // Load specific conversation
  const loadConversation = async (convId: string) => {
    setLoadingConversation(true);
    try {
      const { data, error } = await supabase
        .from("ai_assistant_messages")
        .select("id, role, content, rating, deep_links, created_at")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const loaded: Message[] = (data || []).map((m: any) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        rating: m.rating || undefined,
        deepLinks: Array.isArray(m.deep_links) ? m.deep_links : [],
        created_at: m.created_at,
      }));

      setMessages(loaded);
      setConversationId(convId);
      setShowHistory(false);
    } catch (e) {
      console.error("Error loading conversation:", e);
      toast({ title: "Erro ao carregar conversa", variant: "destructive" });
    } finally {
      setLoadingConversation(false);
    }
  };

  // Open history panel
  const openHistory = () => {
    setShowHistory(true);
    loadHistory();
  };

  // Start new conversation
  const startNewConversation = () => {
    setMessages([]);
    setConversationId(null);
    setShowHistory(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Delete conversation
  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Delete messages first (FK)
      await supabase.from("ai_assistant_messages").delete().eq("conversation_id", convId);
      await supabase.from("ai_assistant_conversations").delete().eq("id", convId);
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (conversationId === convId) {
        setMessages([]);
        setConversationId(null);
      }
      toast({ title: "Conversa eliminada" });
    } catch (err) {
      console.error("Error deleting conversation:", err);
      toast({ title: "Erro ao eliminar", variant: "destructive" });
    }
  };

  // Create or get conversation
  const ensureConversation = async () => {
    if (conversationId) return conversationId;

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return null;

    const sessionId = `session_${Date.now()}`;
    const { data, error } = await supabase
      .from("ai_assistant_conversations")
      .insert({
        user_id: userData.user.id,
        organization_id: activeCompany?.id || null,
        session_id: sessionId,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating conversation:", error);
      return null;
    }

    setConversationId(data.id);
    return data.id;
  };

  // Save message to DB
  const saveMessage = async (convId: string, message: Message) => {
    const { data, error } = await supabase
      .from("ai_assistant_messages")
      .insert({
        conversation_id: convId,
        role: message.role,
        content: message.content,
        deep_links: message.deepLinks || [],
      })
      .select()
      .single();

    if (error) {
      console.error("Error saving message:", error);
      return null;
    }

    // Touch conversation updated_at so history is sorted by recency
    await supabase
      .from("ai_assistant_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", convId);

    return data.id;
  };

  // Extract deep links from response
  const extractDeepLinks = (content: string): { cleanContent: string; deepLinks: { label: string; path: string }[] } => {
    const jsonMatch = content.match(/```json\s*(\{[\s\S]*?"deepLinks"[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        const cleanContent = content.replace(/```json[\s\S]*?```/, "").trim();
        return { cleanContent, deepLinks: parsed.deepLinks || [] };
      } catch {
        return { cleanContent: content, deepLinks: [] };
      }
    }
    
    // Also extract markdown links
    const markdownLinks: { label: string; path: string }[] = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      if (match[2].startsWith("/")) {
        markdownLinks.push({ label: match[1], path: match[2] });
      }
    }
    
    return { cleanContent: content, deepLinks: markdownLinks };
  };

  // Stream chat
  const streamChat = async (
    userMessage: string,
    options?: { pendingTool?: { name: string; args: any }; resolvingMessageIdx?: number },
  ) => {
    const convId = await ensureConversation();
    if (!convId) {
      toast({ title: "Erro", description: "Sessão não iniciada", variant: "destructive" });
      return;
    }

    // Get current user for tool execution
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    const isPending = !!options?.pendingTool;
    const userMsg: Message = { role: "user", content: userMessage };

    // Only append/save a user bubble for real user input. Confirmation re-invocations
    // (pendingTool) keep the original assistant confirmation bubble in place.
    if (!isPending) {
      setMessages(prev => [...prev, userMsg]);
      await saveMessage(convId, userMsg);
    }

    setIsLoading(true);
    let assistantContent = "";

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        toast({ title: "Sessão expirada", description: "Por favor faça login novamente.", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      const currentContext = {
        path: location.pathname + (location.search || ""),
      };

      // Build the message thread we send to the backend. For pendingTool we send
      // existing history (no new user turn).
      const outboundMessages = (isPending ? messages : messages.concat(userMsg))
        .filter(m => !m.confirmation || m.content) // confirmation bubbles without text are skipped
        .map(m => ({ role: m.role, content: m.content }));

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messages: outboundMessages,
          conversationId: convId,
          userId,
          organizationId: activeCompany?.id || null,
          language: "pt",
          currentContext,
          pendingTool: options?.pendingTool ?? null,
        }),
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.error || "Erro na resposta");
      }

      // Confirmation short-circuit: backend returned JSON instead of an SSE stream.
      const contentType = resp.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await resp.json();
        if (json?.type === "confirmation" && Array.isArray(json.confirmations) && json.confirmations.length > 0) {
          const conf: PendingConfirmation = json.confirmations[0];
          const incomingToolCalls: ToolCallView[] | undefined = Array.isArray(json.toolCalls) ? json.toolCalls : undefined;
          const confMessage: Message = {
            role: "assistant",
            content: conf.message || "Encontrei um registo semelhante. Confirma como queres avançar:",
            confirmation: conf,
            toolCalls: incomingToolCalls,
          };
          setMessages(prev => [...prev, confMessage]);
          const msgId = await saveMessage(convId, confMessage);
          if (msgId) {
            setMessages(prev => {
              const updated = [...prev];
              const lastIdx = updated.length - 1;
              if (updated[lastIdx]?.role === "assistant") {
                updated[lastIdx] = { ...updated[lastIdx], id: msgId };
              }
              return updated;
            });
          }
          return;
        }
        // Unknown JSON payload → treat as plain text
        const fallback = json?.error || JSON.stringify(json);
        setMessages(prev => [...prev, { role: "assistant", content: fallback }]);
        return;
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      setIsWorking(true);
      // If resolving a previous confirmation, mark it resolved so buttons hide.
      if (options?.resolvingMessageIdx != null) {
        setMessages(prev => prev.map((m, i) =>
          i === options.resolvingMessageIdx ? { ...m, confirmationResolved: true } : m,
        ));
      }
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      const applyToolCalls = (toolCalls: ToolCallView[]) => {
        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (updated[lastIdx]?.role === "assistant") {
            updated[lastIdx] = { ...updated[lastIdx], toolCalls };
          }
          return updated;
        });
      };

      const handleBlock = (block: string) => {
        const lines = block.split("\n").filter(l => l.length && !l.startsWith(":"));
        let event = "message";
        const dataLines: string[] = [];
        for (const line of lines) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        }
        if (dataLines.length === 0) return;
        const dataStr = dataLines.join("\n");
        if (dataStr === "[DONE]") return;

        if (event === "tool_calls") {
          try {
            const parsed = JSON.parse(dataStr);
            if (Array.isArray(parsed.toolCalls)) applyToolCalls(parsed.toolCalls as ToolCallView[]);
          } catch (e) {
            console.error("Bad tool_calls frame:", e);
          }
          return;
        }

        try {
          const parsed = JSON.parse(dataStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) {
            if (isWorking) setIsWorking(false);
            assistantContent += content;
            setMessages(prev => {
              const updated = [...prev];
              const lastIdx = updated.length - 1;
              if (updated[lastIdx]?.role === "assistant") {
                updated[lastIdx] = { ...updated[lastIdx], content: assistantContent };
              }
              return updated;
            });
          }
        } catch {
          // ignore malformed JSON
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        textBuffer = textBuffer.replace(/\r\n/g, "\n");
        let idx: number;
        while ((idx = textBuffer.indexOf("\n\n")) !== -1) {
          const block = textBuffer.slice(0, idx);
          textBuffer = textBuffer.slice(idx + 2);
          if (block.trim().length > 0) handleBlock(block);
        }
      }
      // Flush any trailing block
      if (textBuffer.trim().length > 0) handleBlock(textBuffer);

      // Process final content — preserve toolCalls already attached.
      const { cleanContent, deepLinks } = extractDeepLinks(assistantContent);

      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.role === "assistant") {
          const prevToolCalls = updated[lastIdx].toolCalls;
          updated[lastIdx] = { role: "assistant", content: cleanContent, deepLinks, toolCalls: prevToolCalls };
        }
        return updated;
      });
      const finalMessage: Message = { role: "assistant", content: cleanContent, deepLinks };

      const msgId = await saveMessage(convId, { ...finalMessage, deepLinks });
      if (msgId) {
        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (updated[lastIdx]?.role === "assistant") {
            updated[lastIdx] = { ...updated[lastIdx], id: msgId };
          }
          return updated;
        });
        setShowRating(msgId);
      }
    } catch (e) {
      console.error("Chat error:", e);
      toast({ 
        title: "Erro", 
        description: e instanceof Error ? e.message : "Erro ao comunicar com a assistente", 
        variant: "destructive" 
      });
      setMessages(prev => prev.filter(m => m.content !== ""));
    } finally {
      setIsLoading(false);
      setIsWorking(false);
    }
  };

  const resolveConfirmation = (msgIdx: number, choice: "reuse" | "create") => {
    const target = messages[msgIdx];
    if (!target?.confirmation || target.confirmationResolved) return;
    const conf = target.confirmation;
    const args = { ...(conf.args || {}) };
    if (choice === "reuse") {
      if (!conf.candidate_entity_id) {
        toast({ title: "Sem candidato para reutilizar", variant: "destructive" });
        return;
      }
      args.confirmed_entity_id = conf.candidate_entity_id;
      args.force_create = false;
    } else {
      args.force_create = true;
      delete args.confirmed_entity_id;
    }
    streamChat("", { pendingTool: { name: conf.tool, args }, resolvingMessageIdx: msgIdx });
  };

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    const msg = input.trim();
    setInput("");
    streamChat(msg);
  };

  const handleRate = async (messageId: string, rating: number) => {
    const { error } = await supabase
      .from("ai_assistant_messages")
      .update({ rating })
      .eq("id", messageId);

    if (error) {
      toast({ title: "Erro ao guardar avaliação", variant: "destructive" });
    } else {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, rating } : m));
      setShowRating(null);
      toast({ title: "Obrigado pela avaliação! 🙏" });
    }
  };

  const handleLinkClick = (path: string) => {
    navigate(path);
    onOpenChange(false);
  };

  // Render message content with links
  const renderContent = (content: string) => {
    const parts = content.split(/(\[[^\]]+\]\([^)]+\))/g);
    return parts.map((part, i) => {
      const linkMatch = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch && linkMatch[2].startsWith("/")) {
        return (
          <button
            key={i}
            onClick={() => handleLinkClick(linkMatch[2])}
            className="text-primary underline hover:text-primary/80 inline-flex items-center gap-1"
          >
            {linkMatch[1]}
            <ExternalLink className="h-3 w-3" />
          </button>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        
        <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
          <SheetHeader className="p-4 border-b bg-gradient-to-r from-primary/10 to-purple-500/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
                  <img src={olyviaIcon} alt="Olyvia" className="h-6 w-6" />
                </div>
                <div>
                  <SheetTitle className="text-left">Olyvia</SheetTitle>
                  <p className="text-xs text-muted-foreground">Assistente Virtual</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={openHistory}>
                        <History className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Histórico</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={startNewConversation}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Nova conversa</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </SheetHeader>

          {/* History Panel */}
          {showHistory ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between p-3 border-b">
                <h3 className="text-sm font-semibold">Conversas anteriores</h3>
                <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {loadingHistory ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : conversations.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      Ainda não tens conversas guardadas.
                    </div>
                  ) : (
                    conversations.map(conv => (
                      <button
                        key={conv.id}
                        onClick={() => loadConversation(conv.id)}
                        className={`w-full text-left p-3 rounded-lg hover:bg-muted transition-colors group flex items-start gap-2 ${
                          conversationId === conv.id ? "bg-muted" : ""
                        }`}
                      >
                        <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{conv.preview}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true, locale: pt })}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => deleteConversation(conv.id, e)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <>
              {/* Messages */}
              <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="space-y-4">
                  {loadingConversation && (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  {!loadingConversation && messages.length === 0 && (
                    <div className="text-center py-8 space-y-4">
                      <div className="mx-auto h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                        <Sparkles className="h-8 w-8 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Olá! Sou a Olyvia 👋</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Posso ajudar-te a criar leads, propostas, agendamentos e muito mais.
                        </p>
                      </div>
                      <div className="grid gap-2">
                        {[
                          { label: "✨ Criar lead", action: "Quero criar um novo lead" },
                          { label: "📅 Ver a agenda de hoje", action: "Mostra-me a minha agenda de hoje" },
                          { label: "📊 Stats do mês", action: "Mostra-me as estatísticas do mês" },
                          { label: "📄 Propostas pendentes", action: "Quais as propostas em rascunho?" },
                          { label: "💰 Criar orçamento", action: "Quero criar um orçamento" },
                          { label: "🔎 Pesquisar contacto", action: "Pesquisa contactos com o nome " },
                        ].map((item) => (
                          <Button
                            key={item.label}
                            variant="outline"
                            className="text-sm justify-start"
                            onClick={() => {
                              setInput(item.action);
                              streamChat(item.action);
                            }}
                          >
                            {item.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map((msg, idx) => (
                    <div key={msg.id || idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] space-y-2 ${msg.role === "user" ? "order-1" : ""}`}>
                        {msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0 && (
                          <ToolCallList items={msg.toolCalls} />
                        )}
                        {(msg.role === "user" || msg.content) && (
                          <div
                            className={`rounded-2xl px-4 py-2 ${
                              msg.role === "user"
                                ? "bg-primary text-primary-foreground rounded-br-sm"
                                : "bg-muted rounded-bl-sm"
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap">{renderContent(msg.content)}</p>
                          </div>
                        )}

                        {/* Confirmation card (anti-duplication) */}
                        {msg.role === "assistant" && msg.confirmation && (
                          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 space-y-2">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                              <div className="text-xs space-y-0.5">
                                {msg.confirmation.candidate_name && (
                                  <p><span className="font-semibold">Candidato:</span> {msg.confirmation.candidate_name}</p>
                                )}
                                {msg.confirmation.match_field && (
                                  <p><span className="font-semibold">Coincidência:</span> {msg.confirmation.match_field}</p>
                                )}
                                <p className="text-muted-foreground">Ferramenta: {msg.confirmation.tool}</p>
                              </div>
                            </div>
                            {msg.confirmationResolved ? (
                              <p className="text-xs text-muted-foreground italic">Resposta enviada.</p>
                            ) : (
                              <div className="flex gap-2 pt-1">
                                <Button
                                  size="sm"
                                  variant="default"
                                  disabled={isLoading || !msg.confirmation.candidate_entity_id}
                                  onClick={() => resolveConfirmation(idx, "reuse")}
                                >
                                  Usar existente
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isLoading}
                                  onClick={() => resolveConfirmation(idx, "create")}
                                >
                                  Criar novo
                                </Button>
                              </div>
                            )}
                          </div>
                        )}


                        {/* Deep Links */}
                        {msg.role === "assistant" && msg.deepLinks && msg.deepLinks.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {msg.deepLinks.slice(0, 3).map((link, i) => (
                              <Badge
                                key={i}
                                variant="secondary"
                                className="cursor-pointer hover:bg-secondary/80"
                                onClick={() => handleLinkClick(link.path)}
                              >
                                <ExternalLink className="h-3 w-3 mr-1" />
                                {link.label}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Rating */}
                        {msg.role === "assistant" && msg.id && (showRating === msg.id || msg.rating) && (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground mr-1">
                              {msg.rating ? "Avaliação:" : "Avaliar:"}
                            </span>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                onClick={() => !msg.rating && handleRate(msg.id!, star)}
                                disabled={!!msg.rating}
                                className={`p-0.5 ${msg.rating ? "cursor-default" : "cursor-pointer hover:scale-110"}`}
                              >
                                <Star
                                  className={`h-4 w-4 ${
                                    star <= (msg.rating || 0)
                                      ? "fill-yellow-400 text-yellow-400"
                                      : "text-muted-foreground/40"
                                  }`}
                                />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {isLoading && messages[messages.length - 1]?.content === "" && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm text-muted-foreground">
                            {isWorking ? "Olyvia está a trabalhar..." : "A escrever..."}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="p-4 border-t bg-background">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex gap-2"
                >
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Escreve a tua pergunta..."
                    disabled={isLoading}
                    className="flex-1"
                  />
                  <Button type="submit" size="icon" disabled={!input.trim() || isLoading}>
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
