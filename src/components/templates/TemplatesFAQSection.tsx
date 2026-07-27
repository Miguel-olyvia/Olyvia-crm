import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, Search, HelpCircle, BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

interface FAQ { id: string; question: string; answer: string; category: string; icon: string; }

const iconMap: Record<string, string> = { building: "🏢", users: "👥", network: "🔗", "map-pin": "📍", "layout-template": "📋", "help-circle": "❓" };

export function TemplatesFAQSection() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFaqs, setExpandedFaqs] = useState<Set<string>>(new Set());

  const { data: faqs = [], isLoading } = useQuery({
    queryKey: ["faqs-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("help_faqs")
        .select("id, question, answer, category, icon, sort_order")
        .eq("is_active", true)
        .eq("page_key", "templates")
        .order("sort_order");
      if (error) throw error;
      return (data || []) as FAQ[];
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

  const getCategoryIcon = (faq: FAQ) => iconMap[faq.icon] || iconMap[faq.category] || "❓";

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
            {filteredFaqs.map(faq => (
              <Collapsible key={faq.id} open={expandedFaqs.has(faq.id)} onOpenChange={() => toggleFaq(faq.id)}>
                <CollapsibleTrigger className="w-full">
                  <div className={cn("flex items-start gap-3 p-3 rounded-lg text-left transition-colors hover:bg-muted/50", expandedFaqs.has(faq.id) && "bg-muted/50")}>
                    <span className="text-lg shrink-0 mt-0.5">{getCategoryIcon(faq)}</span>
                    <div className="flex-1 min-w-0"><p className="font-medium text-sm">{faq.question}</p></div>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform mt-1", expandedFaqs.has(faq.id) && "rotate-180")} />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-3 pb-3 pt-1 ml-9">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{faq.answer}</p>
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
