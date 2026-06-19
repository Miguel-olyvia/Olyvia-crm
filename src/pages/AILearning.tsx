import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import {
  Brain,
  MessageSquare,
  Star,
  TrendingUp,
  Search,
  RefreshCw,
  BarChart3,
  FileText,
  ThumbsUp,
  ThumbsDown,
  Package,
  Wrench,
  Sparkles,
  Calendar,
  Building2,
} from "lucide-react";

interface AIConversation {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  conversation_type: string;
  query: string;
  response_message: string | null;
  suggestions: any[];
  tips: any[];
  model_used: string | null;
  created_at: string;
  organization?: { name: string };
}

interface AIRating {
  id: string;
  organization_id: string | null;
  suggestion_name: string;
  suggestion_category: string | null;
  suggestion_type: string | null;
  rating: number;
  query_context: string | null;
  created_at: string;
  organization?: { name: string };
}

interface LearningStats {
  totalConversations: number;
  totalRatings: number;
  avgRating: number;
  topSuggestions: { name: string; avgRating: number; count: number }[];
  lowSuggestions: { name: string; avgRating: number; count: number }[];
}

export default function AILearning() {
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [ratings, setRatings] = useState<AIRating[]>([]);
  const [stats, setStats] = useState<LearningStats>({
    totalConversations: 0,
    totalRatings: 0,
    avgRating: 0,
    topSuggestions: [],
    lowSuggestions: [],
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrganization, setSelectedOrganization] = useState<string>("all");
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [activeTab, setActiveTab] = useState("overview");
  const { toast } = useToast();

  useEffect(() => {
    loadOrganizations();
    loadData();
  }, [selectedOrganization]);

  const loadOrganizations = async () => {
    const { data } = await supabase
      .from("anew_organizations")
      .select("id, name")
      .order("name");
    setOrganizations(data || []);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadConversations(),
        loadRatings(),
        loadStats(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const loadConversations = async () => {
    let query = supabase
      .from("ai_conversations" as any)
      .select("*, organization:anew_organizations(name)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (selectedOrganization !== "all") {
      query = query.eq("organization_id", selectedOrganization);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Error loading conversations:", error);
      return;
    }
    setConversations((data as any[]) || []);
  };

  const loadRatings = async () => {
    let query = supabase
      .from("ai_suggestion_ratings")
      .select("*, organization:anew_organizations(name)")
      .order("created_at", { ascending: false })
      .limit(200);

    if (selectedOrganization !== "all") {
      query = query.eq("organization_id", selectedOrganization);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Error loading ratings:", error);
      return;
    }
    setRatings((data as AIRating[]) || []);
  };

  const loadStats = async () => {
    try {
      // Get conversation count
      let convQuery = supabase
        .from("ai_conversations" as any)
        .select("id", { count: "exact", head: true });
      if (selectedOrganization !== "all") {
        convQuery = convQuery.eq("organization_id", selectedOrganization);
      }
      const { count: convCount } = await convQuery;

      // Get ratings data
      let ratingsQuery = supabase
        .from("ai_suggestion_ratings")
        .select("suggestion_name, rating, suggestion_type");
      if (selectedOrganization !== "all") {
        ratingsQuery = ratingsQuery.eq("organization_id", selectedOrganization);
      }
      const { data: ratingsData } = await ratingsQuery;

      if (!ratingsData || ratingsData.length === 0) {
        setStats({
          totalConversations: convCount || 0,
          totalRatings: 0,
          avgRating: 0,
          topSuggestions: [],
          lowSuggestions: [],
        });
        return;
      }

      // Calculate stats
      const totalRatings = ratingsData.length;
      const avgRating = ratingsData.reduce((sum, r) => sum + r.rating, 0) / totalRatings;

      // Group by suggestion name
      const suggestionMap = new Map<string, { total: number; count: number }>();
      ratingsData.forEach(r => {
        const existing = suggestionMap.get(r.suggestion_name) || { total: 0, count: 0 };
        suggestionMap.set(r.suggestion_name, {
          total: existing.total + r.rating,
          count: existing.count + 1,
        });
      });

      // Convert to array and sort
      const suggestions = Array.from(suggestionMap.entries()).map(([name, data]) => ({
        name,
        avgRating: data.total / data.count,
        count: data.count,
      }));

      const topSuggestions = suggestions
        .filter(s => s.count >= 2)
        .sort((a, b) => b.avgRating - a.avgRating)
        .slice(0, 10);

      const lowSuggestions = suggestions
        .filter(s => s.count >= 2 && s.avgRating < 3)
        .sort((a, b) => a.avgRating - b.avgRating)
        .slice(0, 10);

      setStats({
        totalConversations: convCount || 0,
        totalRatings,
        avgRating: Math.round(avgRating * 100) / 100,
        topSuggestions,
        lowSuggestions,
      });
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const filteredConversations = conversations.filter(c =>
    c.query?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.response_message?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredRatings = ratings.filter(r =>
    r.suggestion_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.query_context?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-3.5 w-3.5 ${
              star <= rating
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/30"
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Brain className="h-8 w-8 text-primary" />
              AI Learning Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Análise de conversas, ratings e aprendizagem do assistente de IA
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedOrganization} onValueChange={setSelectedOrganization}>
              <SelectTrigger className="w-[220px]">
                <Building2 className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filtrar por organização" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Organizações</SelectItem>
                {organizations.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Conversas</p>
                  <p className="text-2xl font-bold">{stats.totalConversations}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Star className="h-6 w-6 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Ratings</p>
                  <p className="text-2xl font-bold">{stats.totalRatings}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Rating Médio</p>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold">{stats.avgRating}</p>
                    {renderStars(Math.round(stats.avgRating))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-violet-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Top Sugestões</p>
                  <p className="text-2xl font-bold">{stats.topSuggestions.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="conversations" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Conversas ({conversations.length})
            </TabsTrigger>
            <TabsTrigger value="ratings" className="gap-2">
              <Star className="h-4 w-4" />
              Ratings ({ratings.length})
            </TabsTrigger>
          </TabsList>

          <div className="mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 max-w-md"
              />
            </div>
          </div>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Top Performing Suggestions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ThumbsUp className="h-5 w-5 text-green-500" />
                    Melhores Sugestões (Rating ≥ 4)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stats.topSuggestions.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-4">
                      Ainda não há dados suficientes
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {stats.topSuggestions.map((s, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center text-sm font-bold text-green-600">
                              {i + 1}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{s.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {s.count} avaliações
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {renderStars(Math.round(s.avgRating))}
                            <span className="text-sm font-semibold">
                              {s.avgRating.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Low Performing Suggestions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ThumbsDown className="h-5 w-5 text-red-500" />
                    Sugestões a Melhorar (Rating &lt; 3)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stats.lowSuggestions.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-4">
                      Todas as sugestões têm bom rating! 🎉
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {stats.lowSuggestions.map((s, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-red-500/10 flex items-center justify-center text-sm font-bold text-red-600">
                              {i + 1}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{s.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {s.count} avaliações
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {renderStars(Math.round(s.avgRating))}
                            <span className="text-sm font-semibold text-red-600">
                              {s.avgRating.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="conversations">
            <Card>
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[150px]">Data</TableHead>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Pergunta</TableHead>
                        <TableHead>Resposta</TableHead>
                        <TableHead className="w-[100px]">Sugestões</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredConversations.map((conv) => (
                        <TableRow key={conv.id}>
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(conv.created_at), "dd/MM/yy HH:mm", { locale: pt })}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {(conv as any).organization?.name || "N/A"}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[300px]">
                            <p className="truncate text-sm">{conv.query}</p>
                          </TableCell>
                          <TableCell className="max-w-[300px]">
                            <p className="truncate text-sm text-muted-foreground">
                              {conv.response_message || "-"}
                            </p>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">
                                <Package className="h-3 w-3 mr-1" />
                                {Array.isArray(conv.suggestions) ? conv.suggestions.length : 0}
                              </Badge>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredConversations.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            Nenhuma conversa encontrada
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ratings">
            <Card>
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[150px]">Data</TableHead>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Sugestão</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Rating</TableHead>
                        <TableHead>Contexto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRatings.map((rating) => (
                        <TableRow key={rating.id}>
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(rating.created_at), "dd/MM/yy HH:mm", { locale: pt })}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {rating.organization?.name || "N/A"}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium text-sm">
                            {rating.suggestion_name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {rating.suggestion_category || "-"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {rating.suggestion_type === "service" ? (
                              <Badge variant="outline" className="text-xs gap-1">
                                <Wrench className="h-3 w-3" />
                                Serviço
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs gap-1">
                                <Package className="h-3 w-3" />
                                Produto
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{renderStars(rating.rating)}</TableCell>
                          <TableCell className="max-w-[200px]">
                            <p className="truncate text-xs text-muted-foreground">
                              {rating.query_context || "-"}
                            </p>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredRatings.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            Nenhum rating encontrado
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}