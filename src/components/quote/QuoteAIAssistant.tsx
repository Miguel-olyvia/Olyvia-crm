import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import { 
  Bot, Send, Loader2, Lightbulb, Plus, X, Sparkles,
  Package, Wrench, ChevronDown, ChevronUp, Star, Check
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface AISuggestion {
  product_id: string;
  name: string;
  category: string;
  quantity: number;
  price: number;
  reason: string;
  type?: "product" | "service";
}

interface AIResponse {
  message: string;
  suggestions: AISuggestion[];
  tips: string[];
}

interface SuggestionRating {
  suggestionId: string;
  rating: number;
}

interface Props {
  onAddSuggestion: (suggestion: AISuggestion) => boolean;
}

export function QuoteAIAssistant({ onAddSuggestion }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AIResponse | null>(null);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());
  const [addedSuggestions, setAddedSuggestions] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const { toast } = useToast();
  const { activeCompany } = useCompany();

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, response]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!query.trim() || loading) return;

    const userQuery = query.trim();
    setQuery("");
    setMessages(prev => [...prev, { role: 'user', content: userQuery }]);
    setLoading(true);
    setResponse(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase.functions.invoke('quote-ai-assistant', {
        body: { 
          query: userQuery,
          organization_id: activeCompany?.id,
        }
      });

      if (error) throw error;

      if (data.error) {
        if (data.error.includes('Rate limit')) {
          toast({
            title: "Limite de pedidos atingido",
            description: "Por favor, aguarde um momento e tente novamente.",
            variant: "destructive",
          });
        } else {
          throw new Error(data.error);
        }
        return;
      }

      // Save conversation to database for learning
      try {
        await (supabase.from("ai_conversations" as any) as any).insert({
          organization_id: activeCompany?.id,
          user_id: user?.id,
          conversation_type: 'quote_assistant',
          query: userQuery,
          response_message: data.message,
          suggestions: data.suggestions || [],
          tips: data.tips || [],
          model_used: 'gemini-flash',
        });
      } catch (saveError) {
        console.error("Error saving conversation:", saveError);
      }

      setResponse(data);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.message || "Aqui estão as minhas sugestões:" 
      }]);

    } catch (error: any) {
      console.error("AI Assistant error:", error);
      toast({
        title: "Erro ao consultar assistente",
        description: error.message,
        variant: "destructive",
      });
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "Desculpa, ocorreu um erro. Por favor, tenta novamente." 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSuggestion = (suggestion: AISuggestion) => {
    const didAdd = onAddSuggestion(suggestion);
    if (!didAdd) return;

    const suggestionId = suggestion.product_id || suggestion.name;
    setAddedSuggestions(prev => new Set(prev).add(suggestionId));
    toast({
      title: suggestion.type === "service" ? "Serviço adicionado" : "Produto adicionado",
      description: `${suggestion.name} adicionado ao modelo`,
    });
  };

  const handleRating = async (suggestion: AISuggestion, rating: number) => {
    const suggestionId = suggestion.product_id || suggestion.name;
    setRatings(prev => new Map(prev).set(suggestionId, rating));
    
    // Save rating to database for AI learning
    try {
      await (supabase.from("ai_suggestion_ratings" as any) as any).insert({
        organization_id: activeCompany?.id,
        suggestion_name: suggestion.name,
        suggestion_category: suggestion.category,
        suggestion_type: suggestion.type || "product",
        rating,
        query_context: messages.find(m => m.role === 'user')?.content || "",
      });
      
      toast({
        title: "Avaliação guardada",
        description: `Obrigado pelo feedback! Ajuda-me a melhorar.`,
      });
    } catch (error) {
      console.error("Error saving rating:", error);
    }
  };

  const renderStarRating = (suggestion: AISuggestion) => {
    const suggestionId = suggestion.product_id || suggestion.name;
    const currentRating = ratings.get(suggestionId) || 0;
    
    return (
      <div className="flex items-center gap-0.5 mt-2">
        <span className="text-xs text-muted-foreground mr-1">Avaliar:</span>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRating(suggestion, star);
            }}
            className="p-0.5 hover:scale-110 transition-transform"
          >
            <Star
              className={cn(
                "h-3.5 w-3.5 transition-colors",
                star <= currentRating
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground/40 hover:text-amber-400"
              )}
            />
          </button>
        ))}
      </div>
    );
  };

  const exampleQueries = [
    "Preciso de um aplique LED de 40cm para casa de banho",
    "Material para remodelação de WC com 6m²",
    "Torneiras e acessórios para cozinha moderna",
    "Iluminação LED para sala de estar",
  ];

  if (!isExpanded) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-6 py-3 border-b bg-gradient-to-r from-violet-500/5 to-purple-500/5"
      >
        <Button
          variant="ghost"
          className="w-full justify-between group hover:bg-violet-500/10"
          onClick={() => setIsExpanded(true)}
        >
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="text-left">
              <span className="font-medium">Assistente de IA</span>
              <p className="text-xs text-muted-foreground">
                Diz-me o que precisas e eu sugiro os produtos certos
              </p>
            </div>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="border-b bg-gradient-to-r from-violet-500/5 to-purple-500/5"
    >
      <div className="px-6 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div>
              <span className="font-medium">Assistente de IA</span>
              <p className="text-xs text-muted-foreground">
                Sugestões inteligentes baseadas no histórico
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsExpanded(false)}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages area */}
        {messages.length > 0 && (
          <div className="h-32 mb-3 rounded-lg border bg-background/50 p-3 overflow-y-auto" ref={scrollRef}>
            <div className="space-y-2">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "text-sm p-2 rounded-lg max-w-[85%]",
                    msg.role === 'user' 
                      ? "ml-auto bg-primary text-primary-foreground" 
                      : "bg-muted"
                  )}
                >
                  {msg.content}
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  A analisar...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Suggestions with scroll */}
        <AnimatePresence>
          {response?.suggestions && response.suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  Produtos Sugeridos
                </div>
                <span className="text-xs text-muted-foreground">
                  Avalia cada sugestão para eu aprender!
                </span>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pr-2">
                  {response.suggestions.map((suggestion, idx) => {
                    const suggestionId = suggestion.product_id || suggestion.name;
                    const isAdded = addedSuggestions.has(suggestionId);
                    
                    return (
                      <Card
                        key={idx}
                        className={cn(
                          "border-dashed transition-all cursor-pointer group",
                          isAdded 
                            ? "border-green-500/50 bg-green-500/5" 
                            : "hover:border-primary/50"
                        )}
                        onClick={() => !isAdded && handleAddSuggestion(suggestion)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{suggestion.name}</p>
                              <Badge variant="outline" className="text-xs mt-1">
                                {suggestion.category}
                              </Badge>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-xs text-muted-foreground">
                                  Qt: {suggestion.quantity}
                                </span>
                                <span className="text-sm font-semibold text-primary">
                                  €{suggestion.price?.toFixed(2) || "0.00"}
                                </span>
                              </div>
                            </div>
                            {isAdded ? (
                              <div className="h-6 w-6 shrink-0 rounded-full bg-green-500 flex items-center justify-center">
                                <Check className="h-3 w-3 text-white" />
                              </div>
                            ) : (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                          {suggestion.reason && (
                            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                              {suggestion.reason}
                            </p>
                          )}
                          {/* Star rating */}
                          {renderStarRating(suggestion)}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tips */}
        {response?.tips && response.tips.length > 0 && (
          <div className="mb-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center gap-2 text-sm">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <span className="font-medium text-amber-700">Dicas:</span>
            </div>
            <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
              {response.tips.slice(0, 3).map((tip, idx) => (
                <li key={idx} className="flex items-start gap-1">
                  <span>•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Example queries */}
        {messages.length === 0 && (
          <div className="mb-3">
            <p className="text-xs text-muted-foreground mb-2">Exemplos:</p>
            <div className="flex flex-wrap gap-2">
              {exampleQueries.map((example, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => {
                    setQuery(example);
                    setTimeout(() => handleSubmit(), 100);
                  }}
                >
                  {example}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Descreve o que precisas... (ex: aplique LED 40cm para WC)"
            className="flex-1"
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !query.trim()}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </motion.div>
  );
}
