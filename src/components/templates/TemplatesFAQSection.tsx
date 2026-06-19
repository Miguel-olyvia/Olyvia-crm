import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, Search, HelpCircle, Sparkles, BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

interface FAQ { id: string; question: string; answer: string; tags: string[]; is_featured: boolean; category_id: string; }
interface FAQCategory { id: string; name: string; slug: string; description: string | null; icon: string; }

const iconMap: Record<string, string> = { building: "🏢", users: "👥", network: "🔗", "map-pin": "📍", "layout-template": "📋", "help-circle": "❓" };

export function TemplatesFAQSection() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFaqs, setExpandedFaqs] = useState<Set<string>>(new Set());

  const { data: categories = [] } = useQuery({
    queryKey: ["faq-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("faq_categories" as any).select("*").eq("is_active", true).order("sort_order");
      if (error) throw error;
      return (data || []) as unknown as FAQCategory[];
    },
  });

  const { data: faqs = [], isLoading } = useQuery({
    queryKey: ["faqs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("faqs" as any).select("*").eq("is_active", true).order("sort_order");
      if (error) throw error;
      return (data || []) as unknown as FAQ[];
    },
  });

  const toggleFaq = (faqId: string) => {
    setExpandedFaqs(prev => { const next = new Set(prev); next.has(faqId) ? next.delete(faqId) : next.add(faqId); return next; });
  };

  const filteredFaqs = faqs.filter(faq => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return faq.question.toLowerCase().includes(query) || faq.answer.toLowerCase().includes(query);
  });

  const featuredFaqs = filteredFaqs.filter(f => f.is_featured).slice(0, 5);
  const otherFaqs = filteredFaqs.filter(f => !f.is_featured);
  const getCategoryIcon = (categoryId: string) => { const c = categories.find(c => c.id === categoryId); return iconMap[c?.icon || "help-circle"] || "❓"; };

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-lg"><BookOpen className="h-5 w-5 text-primary" />{t("faq.title")}</CardTitle>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("faq.searchPlaceholder")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : filteredFaqs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground"><HelpCircle className="h-10 w-10 mx-auto mb-2 opacity-50" /><p>{t("faq.noResults")}</p></div>
        ) : (
          <div className="space-y-2">
            {(searchQuery ? filteredFaqs : [...featuredFaqs, ...otherFaqs]).map(faq => (
              <Collapsible key={faq.id} open={expandedFaqs.has(faq.id)} onOpenChange={() => toggleFaq(faq.id)}>
                <CollapsibleTrigger className="w-full">
                  <div className={cn("flex items-start gap-3 p-3 rounded-lg text-left transition-colors hover:bg-muted/50", expandedFaqs.has(faq.id) && "bg-muted/50")}>
                    <span className="text-lg shrink-0 mt-0.5">{getCategoryIcon(faq.category_id)}</span>
                    <div className="flex-1 min-w-0"><p className="font-medium text-sm">{faq.question}</p></div>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform mt-1", expandedFaqs.has(faq.id) && "rotate-180")} />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-3 pb-3 pt-1 ml-9">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{faq.answer}</p>
                    {faq.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">{faq.tags.map(tag => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)}</div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
