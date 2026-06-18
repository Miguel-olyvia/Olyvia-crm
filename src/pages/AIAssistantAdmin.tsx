import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { 
  Search, MessageCircle, Star, User, Calendar,
  TrendingUp, TrendingDown, BarChart3, RefreshCw
} from "lucide-react";

interface Conversation {
  id: string;
  session_id: string;
  user_id: string;
  organization_id: string | null;
  created_at: string;
  updated_at: string;
  anew_user?: { name: string } | null;
  organization?: { name: string } | null;
  message_count?: number;
  avg_rating?: number;
}

interface Message {
  id: string;
  role: string;
  content: string;
  rating: number | null;
  rating_feedback: string | null;
  deep_links: { label: string; path: string }[];
  created_at: string;
}

export default function AIAssistantAdmin() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const [stats, setStats] = useState({
    totalConversations: 0,
    totalMessages: 0,
    avgRating: 0,
    ratedMessages: 0,
  });

  useEffect(() => {
    loadConversations();
    loadStats();
  }, []);

  const loadConversations = async () => {
    setLoading(true);
    try {
      // Get conversations
      const { data: convs, error } = await supabase
        .from("ai_assistant_conversations")
        .select("id, session_id, user_id, organization_id, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const convsList = convs || [];
      if (convsList.length === 0) {
        setConversations([]);
        return;
      }

      // Batch fetch all related data
      const userIds = [...new Set(convsList.map(c => c.user_id).filter(Boolean))] as string[];
      const orgIds = [...new Set(convsList.map(c => c.organization_id).filter(Boolean))] as string[];
      const convIds = convsList.map(c => c.id);

      const [{ data: users }, { data: orgs }, { data: msgs }] = await Promise.all([
        userIds.length > 0
          ? supabase.from("anew_users").select("auth_user_id, name").in("auth_user_id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        orgIds.length > 0
          ? supabase.from("anew_organizations").select("id, name").in("id", orgIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("ai_assistant_messages").select("conversation_id, rating").in("conversation_id", convIds),
      ]);

      const userMap = new Map((users || []).map((u: any) => [u.auth_user_id, u]));
      const orgMap = new Map((orgs || []).map((o: any) => [o.id, o]));

      // Group messages by conversation
      const msgMap = new Map<string, any[]>();
      (msgs || []).forEach((m: any) => {
        const arr = msgMap.get(m.conversation_id) || [];
        arr.push(m);
        msgMap.set(m.conversation_id, arr);
      });

      const conversationsWithStats = convsList.map((conv) => {
        const convMsgs = msgMap.get(conv.id) || [];
        const ratings = convMsgs.filter(m => m.rating !== null).map(m => m.rating!);
        const avgRating = ratings.length > 0
          ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length
          : 0;

        return {
          ...conv,
          anew_user: userMap.get(conv.user_id) || null,
          organization: orgMap.get(conv.organization_id!) || null,
          message_count: convMsgs.length,
          avg_rating: avgRating,
        } as Conversation;
      });

      setConversations(conversationsWithStats);
    } catch (error) {
      console.error("Error loading conversations:", error);
      toast({ title: "Erro ao carregar conversas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const { count: convCount } = await supabase
        .from("ai_assistant_conversations")
        .select("*", { count: "exact", head: true });

      const { data: msgData } = await supabase
        .from("ai_assistant_messages")
        .select("rating");

      const totalMessages = msgData?.length || 0;
      const ratedMessages = msgData?.filter(m => m.rating !== null) || [];
      const avgRating = ratedMessages.length > 0
        ? ratedMessages.reduce((a, b) => a + (b.rating || 0), 0) / ratedMessages.length
        : 0;

      setStats({
        totalConversations: convCount || 0,
        totalMessages,
        avgRating: Math.round(avgRating * 10) / 10,
        ratedMessages: ratedMessages.length,
      });
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from("ai_assistant_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages((data || []).map(m => ({
        ...m,
        deep_links: (m.deep_links as { label: string; path: string }[]) || [],
      })));
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  };

  const handleConversationClick = async (conv: Conversation) => {
    setSelectedConversation(conv);
    await loadMessages(conv.id);
  };

  const filteredConversations = conversations.filter(conv => {
    const matchesSearch = 
      conv.anew_user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conv.organization?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRating = ratingFilter === "all" || 
      (ratingFilter === "rated" && conv.avg_rating > 0) ||
      (ratingFilter === "unrated" && conv.avg_rating === 0) ||
      (ratingFilter === "positive" && conv.avg_rating >= 4) ||
      (ratingFilter === "negative" && conv.avg_rating > 0 && conv.avg_rating < 3);

    return matchesSearch && matchesRating;
  });

  const renderStars = (rating: number) => (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Perguntas ao Assistente IA</h1>
            <p className="text-muted-foreground">
              Visualiza e analisa todas as conversas com a Olyvia
            </p>
          </div>
          <Button onClick={() => { loadConversations(); loadStats(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <MessageCircle className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalConversations}</p>
                  <p className="text-xs text-muted-foreground">Conversas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <BarChart3 className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalMessages}</p>
                  <p className="text-xs text-muted-foreground">Mensagens</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/10">
                  <Star className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.avgRating}</p>
                  <p className="text-xs text-muted-foreground">Avaliação Média</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.ratedMessages}</p>
                  <p className="text-xs text-muted-foreground">Avaliações</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar por utilizador ou empresa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={ratingFilter} onValueChange={setRatingFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar por avaliação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="rated">Avaliadas</SelectItem>
              <SelectItem value="unrated">Não avaliadas</SelectItem>
              <SelectItem value="positive">Positivas (≥4⭐)</SelectItem>
              <SelectItem value="negative">Negativas (&lt;3⭐)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Conversations Table */}
        <Card>
          <CardHeader>
            <CardTitle>Conversas</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma conversa encontrada
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Utilizador</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Mensagens</TableHead>
                    <TableHead>Avaliação</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredConversations.map(conv => (
                    <TableRow
                      key={conv.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleConversationClick(conv)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <p className="font-medium">{conv.anew_user?.name || "Anónimo"}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{conv.organization?.name || "—"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{conv.message_count}</Badge>
                      </TableCell>
                      <TableCell>
                        {conv.avg_rating > 0 ? (
                          renderStars(Math.round(conv.avg_rating))
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(conv.created_at), "dd/MM/yyyy HH:mm", { locale: pt })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Conversation Detail Dialog */}
        <Dialog open={!!selectedConversation} onOpenChange={() => setSelectedConversation(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Conversa com {selectedConversation?.anew_user?.name || "Utilizador"}
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-4">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] space-y-1 ${msg.role === "user" ? "text-right" : ""}`}>
                      <div
                        className={`rounded-lg px-4 py-2 ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{format(new Date(msg.created_at), "HH:mm", { locale: pt })}</span>
                        {msg.role === "assistant" && msg.rating && (
                          <div className="flex items-center gap-1">
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            <span>{msg.rating}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
